import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma/index.js";

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Required env: ${name}`);
  }

  return value;
}

function parsePositiveIntegerEnv(name) {
  const rawValue = requireEnv(name).trim();

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

const uploadedFileId = requireEnv("BACKFILL_UPLOADED_FILE_ID");
const attempt = parsePositiveIntegerEnv("BACKFILL_ATTEMPT");
const rawPrefix = requireEnv("BACKFILL_OUTPUT_PREFIX");
const prefix = rawPrefix.endsWith("/") ? rawPrefix : `${rawPrefix}/`;
const dryRun = process.env.DRY_RUN !== "false";
const databaseUrl = requireEnv("DATABASE_URL");
const awsRegion = requireEnv("AWS_REGION");
const awsAccessKeyId = requireEnv("AWS_ACCESS_KEY_ID");
const awsSecretAccessKey = requireEnv("AWS_SECRET_ACCESS_KEY");
const s3BucketName = requireEnv("S3_BUCKET_NAME");

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: databaseUrl }),
});

const s3 = new S3Client({
  region: awsRegion,
  credentials: {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  },
});

try {
  const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
    where: { id: uploadedFileId },
    select: {
      id: true,
      s3Key: true,
      userId: true,
      targetClipCount: true,
      lastSuccessfulAttempt: true,
    },
  });

  const uploadPrefix = uploadedFile.s3Key.split("/")[0] ?? uploadedFile.s3Key;
  const expectedPrefix = `${uploadPrefix}/attempt-${attempt}/`;

  if (prefix !== expectedPrefix) {
    throw new Error(
      `BACKFILL_OUTPUT_PREFIX mismatch. Expected ${expectedPrefix}, received ${prefix}`,
    );
  }

  const response = await s3.send(
    new ListObjectsV2Command({
      Bucket: s3BucketName,
      Prefix: prefix,
    }),
  );

  const clipKeys = (response.Contents ?? [])
    .map((object) => object.Key)
    .filter(
      (key) =>
        typeof key === "string" &&
        key.startsWith(`${prefix}clip_`) &&
        key.endsWith(".mp4"),
    )
    .sort();

  const cappedClipKeys = clipKeys.slice(0, uploadedFile.targetClipCount);

  const existing = await db.clip.findMany({
    where: {
      uploadedFileId,
      processingAttempt: attempt,
    },
    select: {
      s3Key: true,
    },
  });

  const existingKeys = new Set(existing.map((clip) => clip.s3Key));
  const cappedKeySet = new Set(cappedClipKeys);
  const missingKeys = cappedClipKeys.filter((key) => !existingKeys.has(key));
  const surplusExistingKeys = existing
    .map((clip) => clip.s3Key)
    .filter((key) => !cappedKeySet.has(key));
  const deleteSurplus = process.env.DELETE_SURPLUS === "true";
  const expectedDeleteConfirmation = `${uploadedFileId}:${attempt}`;
  const deleteConfirmation = process.env.CONFIRM_DELETE_SURPLUS;
  const canDeleteSurplus =
    !dryRun &&
    deleteSurplus &&
    deleteConfirmation === expectedDeleteConfirmation &&
    clipKeys.length > 0 &&
    cappedClipKeys.length === uploadedFile.targetClipCount;

  console.log(
    JSON.stringify(
      {
        dryRun,
        uploadedFile,
        expectedPrefix,
        clipKeys,
        cappedClipKeys,
        existingCount: existing.length,
        missingKeys,
        surplusExistingKeys,
        deleteSurplus,
        expectedDeleteConfirmation,
        deleteConfirmation,
        canDeleteSurplus,
      },
      null,
      2,
    ),
  );

  if (!dryRun && missingKeys.length > 0) {
    const result = await db.clip.createMany({
      data: missingKeys.map((s3Key) => ({
        s3Key,
        uploadedFileId,
        userId: uploadedFile.userId,
        processingAttempt: attempt,
      })),
      skipDuplicates: true,
    });

    console.log({ inserted: result.count });
  }

  if (deleteSurplus && !canDeleteSurplus) {
    console.warn(
      "DELETE_SURPLUS requested but blocked. Require dryRun=false, matching CONFIRM_DELETE_SURPLUS, non-empty S3 listing, and full targetClipCount listing.",
    );
  }

  if (canDeleteSurplus && surplusExistingKeys.length > 0) {
    const result = await db.clip.deleteMany({
      where: {
        uploadedFileId,
        processingAttempt: attempt,
        s3Key: {
          in: surplusExistingKeys,
        },
      },
    });

    console.log({ deletedSurplus: result.count });
  }
} finally {
  await db.$disconnect();
}
