-- Enforce at most one processing run per user at the database level.
-- Prisma schema cannot express partial indexes, so this lives as raw SQL.
-- Pre-migration check (run first; clean up any duplicates before applying):
--   SELECT "userId", COUNT(*) FROM "UploadedFile"
--   WHERE "status" = 'processing' GROUP BY "userId" HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX "UploadedFile_one_processing_per_user_idx"
ON "UploadedFile"("userId")
WHERE "status" = 'processing';
