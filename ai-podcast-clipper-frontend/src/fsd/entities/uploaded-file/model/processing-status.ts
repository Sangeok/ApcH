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

const ACTIVE_PROCESSING_STATUS_SET = new Set<string>(ACTIVE_PROCESSING_STATUSES);

export function isProcessingStatus(status: string): status is ProcessingStatus {
  return PROCESSING_STATUS_SET.has(status);
}

export function isActiveProcessingStatus(status: string): boolean {
  return ACTIVE_PROCESSING_STATUS_SET.has(status);
}
