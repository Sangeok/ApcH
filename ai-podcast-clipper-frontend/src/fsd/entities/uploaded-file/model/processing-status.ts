export const PROCESSING_STATUSES = [
  "upload_pending",
  "pending_enqueue",
  "queued",
  "processing",
  "processed",
  "failed",
  "no credits",
] as const;

export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const ACTIVE_PROCESSING_STATUSES = [
  "pending_enqueue",
  "queued",
  "processing",
] as const satisfies ProcessingStatus[];

export function isActiveProcessingStatus(status: ProcessingStatus): boolean {
  return ACTIVE_PROCESSING_STATUSES.includes(
    status as (typeof ACTIVE_PROCESSING_STATUSES)[number],
  );
}
