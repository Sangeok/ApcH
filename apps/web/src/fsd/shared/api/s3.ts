import "server-only";

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";
import { attachmentDisposition, chunkS3Keys } from "./s3-policy";

export const S3_CONFIG = {
  PRESIGNED_GET_URL_EXPIRY: 3600,
  PRESIGNED_PUT_URL_EXPIRY: 600,
} as const;

let s3ClientInstance: S3Client | null = null;

export function getS3Client(): S3Client {
  s3ClientInstance ??= new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  return s3ClientInstance;
}

export async function generatePresignedGetUrl(
  key: string,
  expiresIn: number = S3_CONFIG.PRESIGNED_GET_URL_EXPIRY,
  options?: { filename?: string },
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
    ...(options?.filename
      ? { ResponseContentDisposition: attachmentDisposition(options.filename) }
      : {}),
  });

  return getSignedUrl(getS3Client(), command, { expiresIn });
}

export async function getS3ObjectText(key: string): Promise<string> {
  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: key }),
  );
  if (!response.Body) {
    throw new Error(`S3 object has no body: ${key}`);
  }
  // AWS SDK v3 Node 스트림. 트랜스크립트는 1회/세션 읽고 캐시되므로 전량 문자열화 허용.
  return response.Body.transformToString();
}

export async function generatePresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn: number = S3_CONFIG.PRESIGNED_PUT_URL_EXPIRY,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(getS3Client(), command, { expiresIn });
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getS3Client().send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
      }),
    );

    return true;
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      ["NotFound", "NoSuchKey", "404"].includes(error.name)
    ) {
      return false;
    }

    throw error;
  }
}

export async function deleteS3Object(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    }),
  );
}

export async function listS3Objects(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const result = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    keys.push(
      ...(result.Contents ?? []).flatMap((object) =>
        object.Key ? [object.Key] : [],
      ),
    );
    if (result.IsTruncated && !result.NextContinuationToken)
      throw new Error("Truncated S3 listing has no continuation token");
    if (result.NextContinuationToken && result.NextContinuationToken === token)
      throw new Error("S3 listing cursor did not advance");
    token = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function deleteS3Objects(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  const batches = chunkS3Keys(keys);
  for (const [index, batch] of batches.entries()) {
    const response = await getS3Client().send(
      new DeleteObjectsCommand({
        Bucket: env.S3_BUCKET_NAME,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
        },
      }),
    );
    if (response.Errors?.length) {
      const failed = response.Errors.flatMap((entry) =>
        entry.Key && batch.includes(entry.Key) ? [entry.Key] : batch,
      );
      throw new S3DeleteError([...failed, ...batches.slice(index + 1).flat()]);
    }
  }
}

export async function headS3Object(
  key: string,
): Promise<{
  contentLength: number;
  contentType: string;
  metadata: Record<string, string>;
}> {
  const result = await getS3Client().send(
    new HeadObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: key }),
  );
  return {
    contentLength: result.ContentLength ?? 0,
    contentType: result.ContentType ?? "",
    metadata: result.Metadata ?? {},
  };
}
export { S3DeleteError } from "./s3-policy";
import { S3DeleteError } from "./s3-policy";
