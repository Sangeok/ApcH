export const PROCESSING_DISPATCH_STATUSES = [
  "pending",
  "sending",
  "sent",
  "dead_letter",
] as const;

export type ProcessingDispatchStatus =
  (typeof PROCESSING_DISPATCH_STATUSES)[number];
