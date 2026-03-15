import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";

/**
 * S3 configuration constants
 */
export const S3_CONFIG = {
  PRESIGNED_GET_URL_EXPIRY: 3600, // 1 hour for viewing clips
  PRESIGNED_PUT_URL_EXPIRY: 600, // 10 minutes for uploads
} as const;

/**
 * Singleton S3 client instance
 */
let s3ClientInstance: S3Client | null = null;

/**
 * Get or create S3 client instance (singleton pattern)
 */
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

/**
 * Generate presigned URL for reading objects from S3
 */
export async function generatePresignedGetUrl(
  key: string,
  expiresIn: number = S3_CONFIG.PRESIGNED_GET_URL_EXPIRY,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn });
}

/**
 * Generate presigned URL for uploading objects to S3
 */
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

/**
 * Delete a single object from S3
 */
export async function deleteS3Object(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    }),
  );
}

/**
 * List objects in S3 by prefix
 */
export async function listS3Objects(prefix: string): Promise<string[]> {
  const { Contents = [] } = await getS3Client().send(
    new ListObjectsV2Command({
      Bucket: env.S3_BUCKET_NAME,
      Prefix: prefix,
    }),
  );
  return Contents.map((obj) => obj.Key).filter((key): key is string =>
    Boolean(key),
  );
}

/**
 * Delete multiple objects from S3
 */
export async function deleteS3Objects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await getS3Client().send(
    new DeleteObjectsCommand({
      Bucket: env.S3_BUCKET_NAME,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }),
  );
}
