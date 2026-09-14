-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultLanguage" TEXT,
ADD COLUMN     "defaultClipCount" INTEGER,
ADD COLUMN     "defaultReviewBeforeGenerate" BOOLEAN,
ADD COLUMN     "defaultCaptionStyle" JSONB;

-- AlterTable
ALTER TABLE "UploadedFile" ADD COLUMN     "captionStyle" JSONB;
