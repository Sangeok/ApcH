"use server";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";
import { auth } from "~/server/auth";
import { v4 as uuidv4 } from "uuid";
import { db } from "~/server/db";

export async function generateUploadUrl(fileInfo: {
  fileName: string;
  contentType: string;
  language: string;
}): Promise<{
  success: boolean;
  signedUrl: string;
  uploadedFileId: string;
  key: string;
}> {
  const session = await auth();

  if (!session) throw new Error("Unauthorized");

  const s3Client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const fileExtentsion = fileInfo.fileName.split(".").pop() ?? "";

  const uniqueId = uuidv4();
  const key = `${uniqueId}/original.${fileExtentsion}`;

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
    ContentType: fileInfo.contentType,
  });

  const signedUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 600,
  });

  const uploadedFileDbRecord = await db.uploadedFile.create({
    data: {
      userId: session.user.id,
      s3Key: key,
      displayName: fileInfo.fileName,
      uploaded: false,
      language: fileInfo.language ?? "English",
    },
    select: {
      id: true,
    },
  });

  return {
    success: true,
    key,
    uploadedFileId: uploadedFileDbRecord.id,
    signedUrl,
  };
}
