"use server";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { revalidatePath } from "next/cache";
import { env } from "~/env";
import { inngest } from "~/inngest/client";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function getUploadedFileDetails(uploadedFileId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
    where: { id: uploadedFileId, userId: session.user.id },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      language: true,
      clips: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return uploadedFile;
}

export async function getOriginalPlayUrl(uploadedFileId: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Unauthorized" };

  try {
    const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
      where: { id: uploadedFileId, userId: session.user.id },
      select: { s3Key: true },
    });

    const s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: uploadedFile.s3Key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent("original.mp4")}"`,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    return { success: true, url: signedUrl };
  } catch (error) {
    console.error("Failed to get original play url", error);
    return { success: false, error: "Failed to get original play url" };
  }
}

export async function deleteUploadedFile(uploadedFileId: string) {
  await db.uploadedFile.delete({ where: { id: uploadedFileId } });
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteUploadedFileWithClips(uploadedFileId: string) {
  try {
    const uploadedFile = await db.uploadedFile.findUnique({
      where: { id: uploadedFileId },
      select: { s3Key: true },
    });

    if (!uploadedFile) {
      return { success: false, error: "Uploaded file not found" };
    }

    await removeGeneratedClipsFromS3(uploadedFile.s3Key, {
      includeOriginal: true,
    });

    await db.$transaction([
      db.clip.deleteMany({ where: { uploadedFileId } }),
      db.uploadedFile.delete({ where: { id: uploadedFileId } }),
    ]);
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/uploads/${uploadedFileId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete uploaded file with clips", error);
    return {
      success: false,
      error: "Failed to delete uploaded file with clips",
    };
  }
}

export async function reprocessUploadedFile(
  uploadedFileId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const uploadedFile = await db.uploadedFile.findFirstOrThrow({
      where: { id: uploadedFileId, userId: session.user.id },
      select: {
        id: true,
        userId: true,
        status: true,
        uploaded: true,
        s3Key: true,
        language: true,
      },
    });

    if (["queued", "processing"].includes(uploadedFile.status)) {
      return { success: false, error: "Already processing" };
    }

    await db.$transaction([
      db.clip.deleteMany({ where: { uploadedFileId } }),
      db.uploadedFile.update({
        where: { id: uploadedFileId },
        data: { status: "queued", uploaded: false },
      }),
    ]);

    await removeGeneratedClipsFromS3(uploadedFile.s3Key);

    await inngest.send({
      name: "process-video-events",
      data: {
        uploadedFileId: uploadedFile.id,
        userId: uploadedFile.userId,
        language: uploadedFile.language ?? "English",
      },
    });

    await db.uploadedFile.update({
      where: { id: uploadedFileId },
      data: { uploaded: true },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Failed to reprocess file", error);
    return { success: false, error: "Failed to reprocess file" };
  }
}

async function removeGeneratedClipsFromS3(
  originalKey: string,
  options?: { includeOriginal?: boolean },
) {
  const includeOriginal = options?.includeOriginal ?? false;
  const prefix = originalKey.split("/")[0] + "/";
  const s3Client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
  const { Contents = [] } = await s3Client.send(
    new ListObjectsV2Command({ Bucket: env.S3_BUCKET_NAME, Prefix: prefix }),
  );
  const targets = Contents.map((obj) => obj.Key).filter((key): key is string =>
    Boolean(key),
  );
  const filteredTargets = includeOriginal
    ? targets
    : targets.filter((key) => !key.endsWith("original.mp4"));
  if (filteredTargets.length === 0) return;
  await s3Client.send(
    new DeleteObjectsCommand({
      Bucket: env.S3_BUCKET_NAME,
      Delete: { Objects: filteredTargets.map((Key) => ({ Key })) },
    }),
  );
}
