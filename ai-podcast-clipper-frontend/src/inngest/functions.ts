import { env } from "~/env";
import { inngest } from "./client";
import { db } from "~/server/db";
import { listS3Objects } from "~/fsd/shared/api/s3";

type ProcessVideoBackendClip = {
  index: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
  s3Key?: string | null;
  scriptText?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  youtubeHashtags?: string[] | null;
};

export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    retries: 1,
    cancelOn: [
      {
        event: "process-video-events/cancel",
        match: "data.uploadedFileId",
      },
    ],
  },
  {
    event: "process-video-events",
    concurrency: {
      limit: 1,
      key: "event.data.userId",
    },
  },
  async ({ event, step }) => {
    const { uploadedFileId, language, clipCount } = event.data;

    console.log("clipCount", clipCount);

    try {
      const { userId, credits, s3Key } = await step.run(
        "check-credits",
        async () => {
          const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
            where: {
              id: uploadedFileId,
            },
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
            where: {
              id: uploadedFileId,
            },
            data: {
              status: "processing",
            },
          });
        });

        // NEXT_PUBLIC_SITE_URL 유무로 비동기/동기 모드 결정
        // - Vercel (설정됨): .spawn() + callback + waitForEvent
        // - 로컬 (미설정): 동기 처리, 결과 직접 반환
        const callbackUrl = env.NEXT_PUBLIC_SITE_URL
          ? `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/modal`
          : undefined;

        const modalResponse = await step.run("send-to-modal", async () => {
          const res = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
            method: "POST",
            body: JSON.stringify({
              s3_key: s3Key,
              language,
              clip_count: clipCount,
              callback_url: callbackUrl,
              uploaded_file_id: uploadedFileId,
            }),
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
            },
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(
              `Modal dispatch failed (${res.status}): ${text.slice(0, 500)}`,
            );
          }

          return (await res.json()) as Record<string, unknown>;
        });

        let backendClips: ProcessVideoBackendClip[] | undefined;

        if (modalResponse.status === "accepted") {
          // 비동기 모드 (Vercel): .spawn() 완료 → 콜백 대기
          const modalResult = await step.waitForEvent(
            "wait-for-modal-result",
            {
              event: "modal/video.processed",
              match: "data.uploadedFileId",
              timeout: "1h",
            },
          );

          backendClips =
            modalResult?.data?.status === "ok"
              ? (modalResult.data.clips as ProcessVideoBackendClip[] | undefined)
              : undefined;
        } else {
          // 동기 모드 (로컬): Modal이 처리 결과를 직접 반환
          backendClips = modalResponse.status === "ok"
            ? (modalResponse.clips as ProcessVideoBackendClip[] | undefined)
            : undefined;
        }

        const { clipsFound } = await step.run(
          "create-clips-in-db",
          async () => {
            // 1) Backend metadata-based approach (primary)
            if (Array.isArray(backendClips) && backendClips.length > 0) {
              const createData = backendClips
                .filter(
                  (c) => typeof c?.s3Key === "string" && c.s3Key.length > 0,
                )
                .map((c) => ({
                  s3Key: c.s3Key!,
                  uploadedFileId,
                  userId,
                  startSeconds: c.startSeconds ?? null,
                  endSeconds: c.endSeconds ?? null,
                  scriptText: c.scriptText ?? null,
                  youtubeTitle: c.youtubeTitle ?? null,
                  youtubeDescription: c.youtubeDescription ?? null,
                  youtubeHashtags: c.youtubeHashtags
                    ? JSON.stringify(c.youtubeHashtags)
                    : null,
                }));

              if (createData.length > 0) {
                await db.clip.createMany({ data: createData });
              }

              return { clipsFound: createData.length };
            }

            // 2) Fallback: S3 listing (timeout이거나 clips가 비어있을 때)
            const folderPrefix = s3Key.split("/")[0]!;
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
            where: {
              id: uploadedFileId,
            },
            data: {
              status: "processed",
            },
          });
        });
      } else {
        await step.run("set-status-no-credits", async () => {
          await db.uploadedFile.update({
            where: {
              id: uploadedFileId,
            },
            data: {
              status: "no credits",
            },
          });
        });
      }
    } catch (error) {
      await step.run("set-status-failed", async () => {
        await db.uploadedFile.update({
          where: {
            id: uploadedFileId,
          },
          data: {
            status: "failed",
          },
        });
      });
      throw error;
    }
  },
);
