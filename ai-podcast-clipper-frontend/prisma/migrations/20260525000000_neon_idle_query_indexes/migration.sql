CREATE INDEX "UploadedFile_status_processingStartedAt_idx"
ON "UploadedFile"("status", "processingStartedAt");

CREATE INDEX "UploadedFile_status_uploaded_processingStartedAt_queuedAt_idx"
ON "UploadedFile"("status", "uploaded", "processingStartedAt", "queuedAt");

CREATE INDEX "UploadedFile_status_uploaded_createdAt_idx"
ON "UploadedFile"("status", "uploaded", "createdAt");

CREATE INDEX "UploadedFile_status_uploaded_sourceUploadedAt_idx"
ON "UploadedFile"("status", "uploaded", "sourceUploadedAt");

CREATE INDEX "UploadedFile_userId_status_createdAt_idx"
ON "UploadedFile"("userId", "status", "createdAt");

CREATE INDEX "UploadedFile_userId_createdAt_idx"
ON "UploadedFile"("userId", "createdAt");

CREATE INDEX "ProcessingDispatch_status_createdAt_idx"
ON "ProcessingDispatch"("status", "createdAt");

CREATE INDEX "ProcessingDispatch_status_lockedAt_idx"
ON "ProcessingDispatch"("status", "lockedAt");
