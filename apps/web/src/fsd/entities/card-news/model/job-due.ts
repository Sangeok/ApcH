// 매분 cron이 이 job을 실제로 처리하게 되던 가장 이른 시각:
// 목록 조건(listRecoverableCardNewsJobs — nextDispatchAt null|≤now)과 발송 게이트
// (dispatchCardNewsJob — 발송 리스, claim됐으면 heartbeat 90초)를 함께 넘는 시각, 또는 마감(reconcile이 처리).
// 90초는 job-lifecycle.ts의 dispatchCardNewsJob·claimCardNewsJob 리터럴과 같아야 한다(job-due.test.mjs가 고정).
export const CARD_NEWS_HEARTBEAT_STALE_MS = 90_000;

export type CardNewsJobTiming = {
  deadlineAt: Date;
  claimedAt: Date | null;
  heartbeatAt: Date | null;
  nextDispatchAt: Date | null;
  dispatchLeaseUntil: Date | null;
};

export function cardNewsJobDueAt(job: CardNewsJobTiming, now: Date): Date {
  const dispatchAt = Math.max(
    job.nextDispatchAt?.getTime() ?? now.getTime(),
    job.dispatchLeaseUntil?.getTime() ?? Number.NEGATIVE_INFINITY,
    job.claimedAt && job.heartbeatAt
      ? job.heartbeatAt.getTime() + CARD_NEWS_HEARTBEAT_STALE_MS
      : Number.NEGATIVE_INFINITY,
  );
  return new Date(Math.min(job.deadlineAt.getTime(), dispatchAt));
}
