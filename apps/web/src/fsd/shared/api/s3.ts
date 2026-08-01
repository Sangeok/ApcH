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
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(getS3Client(), command, { expiresIn });
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
  const { Contents = [] } = await getS3Client().send(
    new ListObjectsV2Command({
      Bucket: env.S3_BUCKET_NAME,
      Prefix: prefix,
    }),
  );

  return Contents.map((object) => object.Key).filter(
    (key): key is string => Boolean(key),
  );
}

export async function deleteS3Objects(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  await getS3Client().send(
    new DeleteObjectsCommand({
      Bucket: env.S3_BUCKET_NAME,
      Delete: {
        Objects: keys.map((Key) => ({ Key })),
      },
    }),
  );
}
