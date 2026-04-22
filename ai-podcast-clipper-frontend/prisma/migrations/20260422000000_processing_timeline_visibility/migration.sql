-- AlterTable
ALTER TABLE "Clip"
ADD COLUMN "processingAttempt" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "UploadedFile"
ALTER COLUMN "status" SET DEFAULT 'upload_pending',
ADD COLUMN "sourceUploadedAt" TIMESTAMP(3),
ADD COLUMN "enqueueRequestedAt" TIMESTAMP(3),
ADD COLUMN "queuedAt" TIMESTAMP(3),
ADD COLUMN "terminalStatusAt" TIMESTAMP(3),
ADD COLUMN "currentAttempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastSuccessfulAttempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "failureCode" TEXT,
ADD COLUMN "targetClipCount" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "ProcessingDispatch" (
    "id" TEXT NOT NULL,
    "uploadedFileId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dispatchCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingDispatch_pkey" PRIMARY KEY ("id")
);

-- Backfill legacy rows conservatively
UPDATE "UploadedFile" uf
SET "status" = 'upload_pending'
WHERE uf."uploaded" = false
  AND uf."processingStartedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Clip" c
    WHERE c."uploadedFileId" = uf."id"
  )
  AND uf."status" NOT IN ('processed', 'failed', 'no credits');

UPDATE "UploadedFile"
SET "currentAttempt" = CASE
  WHEN "status" = 'upload_pending' THEN 0
  ELSE 1
END;

UPDATE "UploadedFile" uf
SET "lastSuccessfulAttempt" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "Clip" c
    WHERE c."uploadedFileId" = uf."id"
  ) THEN 1
  ELSE 0
END;

UPDATE "UploadedFile" uf
SET "targetClipCount" = COALESCE(
  NULLIF((
    SELECT COUNT(*)
    FROM "Clip" c
    WHERE c."uploadedFileId" = uf."id"
  ), 0),
  3
);

UPDATE "UploadedFile"
SET "sourceUploadedAt" = COALESCE("sourceUploadedAt", "createdAt", "updatedAt")
WHERE "uploaded" = true;

UPDATE "UploadedFile"
SET "enqueueRequestedAt" = COALESCE("enqueueRequestedAt", "createdAt")
WHERE "status" IN ('pending_enqueue', 'queued', 'processing', 'processed', 'failed', 'no credits');

UPDATE "UploadedFile"
SET "queuedAt" = CASE
  WHEN "status" IN ('queued', 'processing', 'processed', 'failed', 'no credits')
    THEN COALESCE("queuedAt", "createdAt")
  ELSE "queuedAt"
END;

UPDATE "UploadedFile"
SET "terminalStatusAt" = CASE
  WHEN "status" IN ('processed', 'failed', 'no credits')
    THEN COALESCE("terminalStatusAt", "updatedAt")
  ELSE "terminalStatusAt"
END;

-- Indexes
CREATE INDEX "Clip_uploadedFileId_processingAttempt_idx"
ON "Clip"("uploadedFileId", "processingAttempt");

CREATE UNIQUE INDEX "Clip_uploadedFileId_processingAttempt_s3Key_key"
ON "Clip"("uploadedFileId", "processingAttempt", "s3Key");

CREATE UNIQUE INDEX "ProcessingDispatch_uploadedFileId_attempt_key"
ON "ProcessingDispatch"("uploadedFileId", "attempt");

CREATE INDEX "ProcessingDispatch_status_nextRetryAt_idx"
ON "ProcessingDispatch"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "ProcessingDispatch"
ADD CONSTRAINT "ProcessingDispatch_uploadedFileId_fkey"
FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
