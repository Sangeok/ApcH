ALTER TABLE "User"
ADD COLUMN "defaultVideoPaddingPercent" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "User_defaultVideoPaddingPercent_check"
CHECK ("defaultVideoPaddingPercent" BETWEEN 0 AND 25);

ALTER TABLE "UploadedFile"
ADD COLUMN "videoPaddingPercent" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "UploadedFile_videoPaddingPercent_check"
CHECK ("videoPaddingPercent" BETWEEN 0 AND 25);
