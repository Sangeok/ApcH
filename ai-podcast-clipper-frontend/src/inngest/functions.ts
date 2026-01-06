import { env } from "~/env";
import { inngest } from "./client";
import { db } from "~/server/db";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

type ProcessVideoEvent = {
  data: {
    uploadedFileId: string;
    userId: string;
    language: string;
  };
};

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

type ProcessVideoBackendResponse = {
  status?: string;
  clips_planned?: number;
  s3_prefix?: string;
  language?: string;
  clips?: ProcessVideoBackendClip[];
};

type StepRunner = {
  run<T>(name: string, handler: () => Promise<T> | T): Promise<T>;
};

export const processVideo = inngest.createFunction(
  { id: "process-video" },
  {
    event: "process-video-events",
    retries: 1,
    concurrency: {
      limit: 1,
      key: "event.data.userId",
    },
  },
  async ({ event, step }: { event: ProcessVideoEvent; step: StepRunner }) => {
    const { uploadedFileId, language } = event.data;

    try {
      const { userId, credits, s3Key } = await step.run(
        "check-credits",
        async () => {
          // 업로드된 파일의 사용자 ID·크레딧 및 S3 키를 조회해 처리 가능한 상태인지 확인한다.
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

        const modalPayload = await step.run<ProcessVideoBackendResponse | null>(
          "call-modal-endpoint",
          async () => {
            const res = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
              method: "POST",
              body: JSON.stringify({ s3_key: s3Key, language }),
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
              },
            });

            if (!res.ok) {
              const text = await res.text().catch(() => "");
              throw new Error(
                `PROCESS_VIDEO_ENDPOINT failed (${res.status}): ${text.slice(0, 500)}`,
              );
            }

            try {
              return (await res.json()) as ProcessVideoBackendResponse;
            } catch {
              return null;
            }
          },
        );

        // CHANGED: clips[]가 있으면 그걸로 DB 저장, 없으면 S3 listing fallback
        const { clipsFound } = await step.run(
          "create-clips-in-db",
          async () => {
            const backendClips = modalPayload?.clips;

            // 1) 백엔드 메타 기반(우선)
            if (Array.isArray(backendClips) && backendClips.length > 0) {
              const createData = backendClips
                .filter(
                  (c) => typeof c?.s3Key === "string" && c.s3Key.length > 0,
                )
                .map((c) => ({
                  s3Key: c.s3Key as string,
                  uploadedFileId,
                  userId,
                  // 아래 3개 필드는 Prisma에 컬럼이 있어야 합니다.
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

            // 2) fallback: S3 listing 기반(필터 버그 수정 포함)
            const folderPrefix = s3Key.split("/")[0]!;
            const allKeys = await listS3ObjectsByPrefix(folderPrefix);

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
          await db.user.update({
            where: {
              id: userId,
            },
            data: {
              credits: {
                decrement: Math.min(credits, clipsFound),
              },
            },
          });
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
    } catch {
      await db.uploadedFile.update({
        where: {
          id: uploadedFileId,
        },
        data: {
          status: "failed",
        },
      });
    }
  },
);

/**
 * AWS S3 버킷에서 특정 접두사(prefix)를 가진 모든 객체의 키(Key) 목록을 조회합니다.
 * @param prefix S3 버킷 내에서 검색할 객체의 접두사 (예: 'uploads/images/')
 * @returns 일치하는 객체 키(Key)의 문자열 배열. 일치하는 객체가 없으면 빈 배열을 반환합니다.
 */
async function listS3ObjectsByPrefix(prefix: string): Promise<string[]> {
  // S3 클라이언트 생성
  const s3Client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // 파일 목록 조회
  const listCommand = new ListObjectsV2Command({
    Bucket: env.S3_BUCKET_NAME,
    Prefix: prefix,
  });

  const response = await s3Client.send(listCommand);
  return (
    response.Contents?.map((item) => item.Key).filter(
      (key): key is string => typeof key === "string",
    ) ?? []
  );
}
