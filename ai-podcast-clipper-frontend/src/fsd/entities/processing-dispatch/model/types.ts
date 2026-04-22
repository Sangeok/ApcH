export const PROCESSING_DISPATCH_STATUSES = [
  "pending",
  "sending",
  "sent",
  "retryable_failed",
  "dead_letter",
] as const;

export type ProcessingDispatchStatus =
  (typeof PROCESSING_DISPATCH_STATUSES)[number];
