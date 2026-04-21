-- AlterTable
ALTER TABLE "UploadedFile" DROP COLUMN "modalTriggered",
ADD COLUMN     "processingStartedAt" TIMESTAMP(3);

