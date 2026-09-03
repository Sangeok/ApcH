export const PROCESSING_STATUSES = [
  "upload_pending",
  "pending_enqueue",
  "queued",
  "processing",
  "review_pending",
  "processed",
  "failed",
  "no credits",
] as const;

export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

const PROCESSING_STATUS_SET = new Set<string>(PROCESSING_STATUSES);

export const ACTIVE_PROCESSING_STATUSES = [
  "pending_enqueue",
  "queued",
  "processing",
] as const satisfies ProcessingStatus[];

export type ActiveProcessingStatus =
  (typeof ACTIVE_PROCESSING_STATUSES)[number];

const ACTIVE_PROCESSING_STATUS_SET = new Set<string>(ACTIVE_PROCESSING_STATUSES);

export function isProcessingStatus(status: string): status is ProcessingStatus {
  return PROCESSING_STATUS_SET.has(status);
}

/** DB의 자유 문자열 status를 도메인 union으로 좁힌다. 미지의 값은 던진다. */
export function toProcessingStatus(status: string): ProcessingStatus {
  if (!isProcessingStatus(status)) {
    throw new Error(`Invalid uploaded file status: ${status}`);
  }

  return status;
}

export function isActiveProcessingStatus(
  status: string,
): status is ActiveProcessingStatus {
  return ACTIVE_PROCESSING_STATUS_SET.has(status);
}
