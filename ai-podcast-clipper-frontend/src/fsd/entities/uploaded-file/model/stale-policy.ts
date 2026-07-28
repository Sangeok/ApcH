export const PROCESSING_STALE_POLICY = {
  pendingEnqueueTimeoutMs: 5 * 60 * 1000,
  queuedWorkerStartTimeoutMs: 15 * 60 * 1000,
  processingTimeoutMs: 2 * 60 * 60 * 1000,
  rawUploadDraftTtlMs: 24 * 60 * 60 * 1000,
  recoverableUploadDraftTtlMs: 7 * 24 * 60 * 60 * 1000,

  // 정체 "알림" 임계값. 위 processingTimeoutMs(120m = 마킹)보다 먼저 울려서
  // 사용자가 대시보드에 돌아오지 않아도 운영자가 먼저 알게 한다.
  //
  // 90m 근거 — src/inngest/functions.ts의 상한에서 유도:
  //   render : MODAL_RESULT_MAX_POLLS(60) × MODAL_RESULT_POLL_INTERVAL(1m)
  //            + MODAL_METADATA_GRACE_INTERVAL(2m)  ≈ 62m
  //   analyze: ANALYSIS_RESULT_TIMEOUT(60m)
  // 함수가 살아 있으면 늦어도 ~62m에 스스로 종료하고 상태를 쓴다.
  // ⚠️ 위 Modal 상수를 바꾸면 이 값도 함께 재검토할 것.
  stuckAlertMs: 90 * 60 * 1000,
  // 알림 재발송 상한. 24h가 지나면 멈춘다(≈96회).
  // 좁게 잡으면 cron 2회 누락 시 영구 미탐지가 생기므로 넉넉히 둔다.
  // ⚠️ 이 "누락 허용" 논리는 monitorPipelineHealth의 cron 주기(현재 15분,
  //    src/inngest/functions.ts)를 전제로 한다. 주기를 늘리면 함께 재검토할 것.
  stuckAlertMaxAgeMs: 24 * 60 * 60 * 1000,
} as const;
