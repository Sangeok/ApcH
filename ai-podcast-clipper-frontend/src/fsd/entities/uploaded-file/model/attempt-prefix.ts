export function getUploadedFilePrefix(s3Key: string): string {
  return s3Key.split("/")[0] ?? s3Key;
}

export function getAttemptOutputPrefix(s3Key: string, attempt: number): string {
  return `${getUploadedFilePrefix(s3Key)}/attempt-${attempt}`;
}

export function getProcessingMatchKey(uploadedFileId: string, attempt: number): string {
  return `${uploadedFileId}:${attempt}`;
}
