"use server";

import {
  DeleteObjectCommand,
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

export async function processVideo(uploadedFileId: string, language: string) {
  console.log(
    "processVideo function called with uploadedFileId and language:",
    uploadedFileId,
    language,
  );

  // Overwrite with the latest value each time so language stays consistent across reprocessing or repeated calls.
  await db.uploadedFile.update({
    where: { id: uploadedFileId },
    data: { language },
  });

  const uploadedVideo = await db.uploadedFile.findUniqueOrThrow({
    where: {
      id: uploadedFileId,
    },
    select: {
      uploaded: true,
      id: true,
      userId: true,
    },
  });

  if (uploadedVideo.uploaded) return;

  await inngest.send({
    name: "process-video-events",
    data: {
      uploadedFileId: uploadedVideo.id,
      userId: uploadedVideo.userId,
      language,
    },
  });

  await db.uploadedFile.update({
    where: {
      id: uploadedVideo.id,
    },
    data: {
      uploaded: true,
    },
  });

  revalidatePath("/dashboard");
}

export async function getClipPlayUrl(
  clipId: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const session = await auth();

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const clip = await db.clip.findUniqueOrThrow({
      where: {
        id: clipId,
        userId: session.user.id,
      },
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
      Key: clip.s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    return {
      success: true,
      url: signedUrl,
    };
  } catch (error) {
    console.error("Failed to generate play URL", error);
    return { success: false, error: "Failed to generate play URL." };
  }
}

export async function deleteClip(
  clipId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const clip = await db.clip.findUniqueOrThrow({
      where: { id: clipId, userId: session.user.id },
      select: { id: true, s3Key: true },
    });

    const s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: clip.s3Key,
      }),
    );

    // Delete the folder if it is empty or only original.mp4 remains
    const prefixIndex = clip.s3Key.lastIndexOf("/");
    if (prefixIndex >= 0) {
      const prefix = clip.s3Key.slice(0, prefixIndex + 1);
      const originalKey = `${prefix}original.mp4`;
      const { Contents = [] } = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: env.S3_BUCKET_NAME,
          Prefix: prefix,
        }),
      );

      const remainingKeys = Contents.map((object) => object.Key).filter(
        (key): key is string => Boolean(key && key !== prefix),
      );

      const onlyOriginalRemains =
        remainingKeys.length === 1 && remainingKeys[0] === originalKey;

      if (onlyOriginalRemains) {
        // Delete the original.mp4 file and the folder
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: env.S3_BUCKET_NAME,
            Key: originalKey,
          }),
        );
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: env.S3_BUCKET_NAME,
            Key: prefix,
          }),
        );
      } else if (remainingKeys.length === 0) {
        // Delete the folder if it is empty
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: env.S3_BUCKET_NAME,
            Key: prefix,
          }),
        );
      }
    }

    await db.clip.delete({ where: { id: clip.id } });
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Failed to delete clip", error);
    return { success: false, error: "Failed to delete clip." };
  }
}
