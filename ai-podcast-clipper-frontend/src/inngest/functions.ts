import { NonRetriableError } from "inngest";
import { env } from "~/env";
import { inngest } from "./client";
import { db } from "~/server/db";
import { listS3Objects } from "~/fsd/shared/api/s3";

export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    retries: 3,
    // R1 수정: concurrency를 trigger config(2번째 인자)에서 function config(1번째 인자)로 이동
    // 기존 위치(trigger config)에서는 Inngest SDK가 조용히 무시(silently ignored)하여 프로덕션에서 미적용 상태였음
    concurrency: [
      { limit: 1, key: "event.data.userId" }, // 사용자별 순차 처리
      { limit: 10 },                           // 글로벌: Modal 백엔드 과부하 방지
    ],
    // 섹션3: 3회 재시도 소진 후 영구 실패 처리 (DLQ 대체)
    // onFailure는 SDK 내부적으로 retries: { attempts: 1 }로 실행 — DB 실패 시 재시도 없음
    // → step.run 내부 try-catch로 감싸 onFailure 자체가 throw되지 않도록 처리 (R10)
    onFailure: async ({ error, event, step }) => {
      await step.run("record-permanent-failure", async () => {
        try {
          // update 대신 updateMany — 레코드 삭제 상태에서 P2025 에러 방지 (High 이슈)
          await db.uploadedFile.updateMany({
            where: { id: event.data.event.data.uploadedFileId },
            data: { status: "failed", modalTriggered: false },
          });
        } catch (dbError) {
          // DB 실패해도 onFailure 자체는 throw하지 않음 — 로그로 감지
          console.error("[DLQ] Failed to update status:", dbError);
        }
        console.error("[DLQ] processVideo permanently failed:", {
          uploadedFileId: event.data.event.data.uploadedFileId,
          error: error.message,
        });
      });
    },
    // R9/R13: match(deprecated + null==null 교차 오염 위험) → if + null guard로 교체
    cancelOn: [
      {
        event: "process-video-events/cancel",
        if: "async.data.uploadedFileId != null && event.data.uploadedFileId == async.data.uploadedFileId",
      },
    ],
  },
  // trigger config에서 concurrency 제거 (R1 수정의 일환)
  { event: "process-video-events" },
  async ({ event, step }) => {
    const { uploadedFileId, language, clipCount } = event.data;

    // Finding A 수정: catch 블록에서 DB status 업데이트 제거
    // 기존 패턴(매 실패마다 status="failed" 설정)은 재시도 중에도 status가 "failed"로 남는 문제를 유발
    // → 영구 실패 처리는 onFailure에서만 수행

    const { userId, credits, s3Key } = await step.run(
      "check-credits",
      async () => {
        // 섹션3 수정: findUniqueOrThrow → findUnique + NonRetriableError
        // findUniqueOrThrow는 Prisma NotFoundError를 던져 NonRetriableError 적용 불가
        const uploadedFile = await db.uploadedFile.findUnique({
          where: { id: uploadedFileId },
          select: {
            user: {
              select: {
                id: true,
                credits: true,
              },
            },
            s3Key: true,
          },
        });

        if (!uploadedFile) {
          throw new NonRetriableError("Uploaded file not found");
        }

        return {
          userId: uploadedFile.user.id,
          credits: uploadedFile.user.credits,
          s3Key: uploadedFile.s3Key,
        };
      },
    );

    if (credits > 0) {
      await step.run("set-status-processing", async () => {
        await db.uploadedFile.update({
          where: { id: uploadedFileId },
          data: { status: "processing" },
        });
      });

      // 중복 spawn 방지 (2-Layer Defense)
      //
      // 문제: Modal L40S GPU 콜드 스타트(30~120초+) > Vercel maxDuration(10초)
      //   → Inngest step delivery 재시도 → trigger_video 중복 호출 → .spawn() 중복
      //
      // Layer 1: AbortController 2초 타임아웃
      //   → step이 ~3-5초 내 완료 → Vercel 타임아웃 여유 확보
      //   → Modal 인프라는 콜드 스타트 중에도 요청을 큐잉하므로 요청 유실 없음
      //
      // Layer 2: DB modalTriggered 플래그
      //   → 모든 경로에서 중복 POST 방지 (delivery retry, function retry 등)
      //
      // Modal 거부(4xx/5xx): NonRetriableError → 함수 즉시 실패 → 재시도 없음
      //   → 함수 run당 최대 1회 POST 보장

      await step.run("trigger-modal", async () => {
        // Layer 2: DB idempotency — 이전 시도에서 이미 트리거된 경우 스킵
        const file = await db.uploadedFile.findUnique({
          where: { id: uploadedFileId },
          select: { modalTriggered: true },
        });
        if (file?.modalTriggered) {
          return;
        }

        // POST 전에 플래그 설정 — 가장 보수적인 전략
        await db.uploadedFile.update({
          where: { id: uploadedFileId },
          data: { modalTriggered: true },
        });

        // Layer 1: 2초 AbortController — Vercel maxDuration(10s) 내 완료 보장
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        try {
          const res = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
            method: "POST",
            body: JSON.stringify({
              s3_key: s3Key,
              language,
              clip_count: clipCount,
              uploaded_file_id: uploadedFileId,
            }),
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!res.ok) {
            // Modal 명시적 거부 (4xx/5xx) → NonRetriableError로 즉시 실패
            // 재시도해도 같은 결과 (401: 인증, 422: 검증, 5xx: 서버 에러)
            // DB 플래그 리셋 없음 → onFailure에서 리셋 → 사용자가 reprocess로 재시도
            const text = await res.text().catch(() => "");
            throw new NonRetriableError(
              `Modal trigger failed (${res.status}): ${text.slice(0, 500)}`,
            );
          }
        } catch (error) {
          clearTimeout(timeoutId);
          // NonRetriableError(Modal 거부)만 re-throw → 함수 즉시 실패 → onFailure
          if (error instanceof NonRetriableError) throw error;
          // timeout(AbortError), 네트워크 에러 등 → 요청은 이미 네트워크에 전송됨
          // Modal 인프라가 큐잉 중 → 성공 처리 → step memoize → 재시도 차단
          // 만약 요청이 미도달한 경우 → waitForEvent 1h timeout → onFailure로 안전하게 실패
          return;
        }
      });

      // R9 수정: match(deprecated) → if + null guard
      //   - match는 null == null → true로 교차 오염 위험
      //   - async = 현재 함수 트리거 이벤트(process-video-events)
      //   - event = 수신 이벤트(modal/processing.done)
      const modalResult = await step.waitForEvent("wait-for-modal", {
        event: "modal/processing.done",
        if: "async.data.uploadedFileId != null && event.data.uploadedFileId == async.data.uploadedFileId",
        timeout: "1h",
      });

      // R3 수정: timeout 시 NonRetriableError 필수
      // 일반 Error 사용 시 재시도 때마다 waitForEvent가 새로 등록되어 최대 retries×1h 대기
      // Modal은 이미 완료하고 webhook을 전송했으므로 재시도로는 해결 불가 (구조적 결함)
      if (!modalResult) {
        throw new NonRetriableError(
          "Modal processing timed out after 1 hour — Modal 인프라 장애 가능성 확인 필요",
        );
      }

      // Modal 처리 실패 (webhook에서 status: "error"로 전송)
      // NonRetriableError 사용 — Modal이 이미 처리하고 error webhook을 보낸 상태
      // 재시도해도 trigger-modal은 memoized이므로 새 POST는 없지만, 동일 에러 반복만 됨
      if (modalResult.data.status === "error") {
        throw new NonRetriableError(
          `Modal processing failed: ${modalResult.data.error}`,
        );
      }

      // V3: create-clips-in-db 완전 리팩터링
      //   - 데이터 소스: modalPayload(직접 API 응답) → modalResult.data(Inngest event)
      //   - R26 방어: camelCase/snake_case 양쪽 지원 (webhook relay 시 직렬화 형식 미보장)
      const { clipsFound } = await step.run(
        "create-clips-in-db",
        async () => {
          const rawClips = modalResult.data.clips;

          if (Array.isArray(rawClips) && rawClips.length > 0) {
            const createData = rawClips
              .filter((c) => {
                // R26: camelCase/snake_case 양쪽에서 s3Key 확인
                const key = (c.s3Key ?? c.s3_key) as string | undefined;
                return typeof key === "string" && key.length > 0;
              })
              .map((c) => ({
                s3Key: (c.s3Key ?? c.s3_key) as string,
                uploadedFileId,
                userId,
                startSeconds: (c.startSeconds ??
                  c.start_seconds ??
                  null) as number | null,
                endSeconds: (c.endSeconds ??
                  c.end_seconds ??
                  null) as number | null,
                scriptText: (c.scriptText ??
                  c.script_text ??
                  null) as string | null,
                youtubeTitle: (c.youtubeTitle ??
                  c.youtube_title ??
                  null) as string | null,
                youtubeDescription: (c.youtubeDescription ??
                  c.youtube_description ??
                  null) as string | null,
                youtubeHashtags: (() => {
                  const tags = (c.youtubeHashtags ??
                    c.youtube_hashtags) as string[] | null | undefined;
                  return tags ? JSON.stringify(tags) : null;
                })(),
              }));

            if (createData.length > 0) {
              await db.clip.createMany({ data: createData });
            }
            return { clipsFound: createData.length };
          }

          // Fallback: S3 listing (webhook에서 clips 누락 시)
          // Finding C/R22 방어적 수정: split("/")[0] → slice(0, -1).join("/")
          // 마지막 세그먼트(파일명)를 제거하여 폴더 경로 추출
          // 현재 형식 "uuid/original.ext" → "uuid" (정상)
          // 구 형식 "userId/uuid/original.mp4" → "userId/uuid" (구 형식 객체에서도 정상)
          const folderPrefix = s3Key.split("/").slice(0, -1).join("/");
          const allKeys = await listS3Objects(folderPrefix);

          const clipKeys = allKeys.filter(
            (key): key is string =>
              typeof key === "string" &&
              key.startsWith(`${folderPrefix}/clip_`) &&
              key.endsWith(".mp4"),
          );

          if (clipKeys.length > 0) {
            await db.clip.createMany({
              data: clipKeys.map((clipKey) => ({
                s3Key: clipKey,
                uploadedFileId,
                userId,
              })),
            });
          }

          return { clipsFound: clipKeys.length };
        },
      );

      await step.run("deduct-credits", async () => {
        await db.$executeRaw`
          UPDATE "User"
          SET "credits" = GREATEST("credits" - ${clipsFound}, 0)
          WHERE "id" = ${userId}
        `;
      });

      await step.run("set-status-processed", async () => {
        await db.uploadedFile.update({
          where: { id: uploadedFileId },
          data: { status: "processed" },
        });
      });
    } else {
      await step.run("set-status-no-credits", async () => {
        await db.uploadedFile.update({
          where: { id: uploadedFileId },
          data: { status: "no credits" },
        });
      });
    }
  },
);
