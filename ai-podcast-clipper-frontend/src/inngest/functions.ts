import { env } from "~/env";
import { inngest } from "./client";
import { db } from "~/server/db";
import { listS3Objects } from "~/fsd/shared/api/s3";

type ProcessVideoEvent = {
  data: {
    uploadedFileId: string;
    userId: string;
    language: string;
    clipCount: number;
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
    const { uploadedFileId, language, clipCount } = event.data;

    console.log("clipCount", clipCount);

    try {
      const { userId, credits, s3Key } = await step.run(
        "check-credits",
        async () => {
          // Check if the uploaded file is ready for processing by fetching user ID, credits, and S3 key
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
              body: JSON.stringify({
                s3_key: s3Key,
                language,
                clip_count: clipCount,
              }),
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

        // Use clips[] from backend response if available, otherwise fallback to S3 listing
        const { clipsFound } = await step.run(
          "create-clips-in-db",
          async () => {
            const backendClips = modalPayload?.clips;

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
                  // These fields require corresponding columns in Prisma schema
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

            // 2) Fallback: S3 listing-based approach
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

