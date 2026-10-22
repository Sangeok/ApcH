/**
 * How long global recovery leaves an ended producer to the normal webhook → Inngest settlement.
 * The GPU function returns right after posting its callback, so `ended` is observed before the
 * webhook's run settles with clip metadata (or marks an analyze review_pending) — FEAT-63.
 */
export const PRODUCER_END_SETTLE_GRACE_MS = 5 * 60_000;

/** Whether global recovery may settle (or fail) a video attempt now. */
export function canRecoverySettleVideoAttempt(input: {
  now: Date;
  deadlineAt: Date | null;
  producerEndedAt: Date | null;
}): boolean {
  if (input.deadlineAt !== null && input.deadlineAt <= input.now) return true;
  return (
    input.producerEndedAt !== null &&
    input.now.getTime() - input.producerEndedAt.getTime() >=
      PRODUCER_END_SETTLE_GRACE_MS
  );
}

/**
 * When the stored end evidence was observed: `observedAt` (modal-status) or `confirmedAt`
 * (legacy-drain, synchronous-response). Unreadable evidence still proves an end, so it counts
 * as long past rather than blocking recovery.
 */
export function producerEndObservedAt(evidence: unknown): Date {
  if (evidence && typeof evidence === "object") {
    const record = evidence as { observedAt?: unknown; confirmedAt?: unknown };
    const value =
      typeof record.observedAt === "string"
        ? record.observedAt
        : typeof record.confirmedAt === "string"
          ? record.confirmedAt
          : null;
    const time = value === null ? Number.NaN : Date.parse(value);
    if (Number.isFinite(time)) return new Date(time);
  }
  return new Date(0);
}
