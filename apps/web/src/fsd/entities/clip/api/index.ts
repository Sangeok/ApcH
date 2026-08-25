import "server-only";

import type { Prisma } from "@repo/db";
import { db } from "~/server/db";

type DbClient = Prisma.TransactionClient | typeof db;

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

// Persists generated clip records for S3 objects created by the video processor.                          
// Duplicate records for the same upload attempt and S3 key are ignored. 
export async function createClipsBulk(
  data: Prisma.ClipCreateManyInput[],
  options?: { tx?: Prisma.TransactionClient },
) {
  if (data.length === 0) {
    return { count: 0 };
  }

  return getClient(options?.tx).clip.createMany({
    data,
    skipDuplicates: true,
  });
}

// Counts Clip records for the given upload attempt and S3 keys.
// Used after bulk insert to verify how many generated S3 clips are persisted.
export async function countClipsForAttemptS3Keys(
  uploadedFileId: string,
  processingAttempt: number,
  s3Keys: string[],
  options?: { tx?: Prisma.TransactionClient },
) {
  if (s3Keys.length === 0) {
    return 0;
  }

  return getClient(options?.tx).clip.count({
    where: {
      uploadedFileId,
      processingAttempt,
      s3Key: {
        in: s3Keys,
      },
    },
  });
}

type ClipMetadataPatch = {
  s3Key?: string | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
  scriptText?: string | null;
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  youtubeHashtags?: string[] | null;
  clipType?: string | null;
  hook?: string | null;
  payoff?: string | null;
  subtitleStatus?: string | null;
};

// Builds a partial Prisma update payload without clearing existing metadata.
function toClipMetadataUpdateData(
  clip: ClipMetadataPatch,
): Prisma.ClipUpdateManyMutationInput {
  return {
    ...(clip.startSeconds != null ? { startSeconds: clip.startSeconds } : {}),
    ...(clip.endSeconds != null ? { endSeconds: clip.endSeconds } : {}),
    ...(clip.scriptText != null ? { scriptText: clip.scriptText } : {}),
    ...(clip.youtubeTitle != null ? { youtubeTitle: clip.youtubeTitle } : {}),
    ...(clip.youtubeDescription != null
      ? { youtubeDescription: clip.youtubeDescription }
      : {}),
    ...(clip.youtubeHashtags != null
      ? { youtubeHashtags: JSON.stringify(clip.youtubeHashtags) }
      : {}),
    ...(clip.clipType != null ? { clipType: clip.clipType } : {}),
    ...(clip.hook != null ? { hook: clip.hook } : {}),
    ...(clip.payoff != null ? { payoff: clip.payoff } : {}),
    ...(clip.subtitleStatus != null
      ? { subtitleStatus: clip.subtitleStatus }
      : {}),
  };
}

// Applies backend-provided clip metadata to existing Clip records.
// Returns the total number of Clip rows updated.
export async function updateClipMetadataFromBackendClips(
  args: {
    uploadedFileId: string;
    processingAttempt: number;
    clips: ClipMetadataPatch[];
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  let updated = 0;

  for (const clip of args.clips) {
    if (typeof clip.s3Key !== "string" || clip.s3Key.length === 0) {
      continue;
    }

    const data = toClipMetadataUpdateData(clip);

    if (Object.keys(data).length === 0) {
      continue;
    }

    const result = await getClient(options?.tx).clip.updateMany({
      where: {
        uploadedFileId: args.uploadedFileId,
        processingAttempt: args.processingAttempt,
        s3Key: clip.s3Key,
      },
      data,
    });

    updated += result.count;
  }

  return { updated };
}

export async function findClipById(clipId: string, userId: string) {
  return db.clip.findFirstOrThrow({
    where: {
      id: clipId,
      userId,
    },
    select: {
      id: true,
      s3Key: true,
      processingAttempt: true,
      uploadedFile: {
        select: {
          id: true,
          lastSuccessfulAttempt: true,
        },
      },
    },
  });
}

export async function deleteClipRecord(
  clipId: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).clip.delete({
    where: { id: clipId },
  });
}
