export const PROCESSING_STALE_POLICY = {
  pendingEnqueueTimeoutMs: 5 * 60 * 1000,
  queuedWorkerStartTimeoutMs: 15 * 60 * 1000,
  processingTimeoutMs: 2 * 60 * 60 * 1000,
  rawUploadDraftTtlMs: 24 * 60 * 60 * 1000,
  recoverableUploadDraftTtlMs: 7 * 24 * 60 * 60 * 1000,
} as const;
