// 정리 재시도 간격: 60초에서 시작해 실패마다 2배, 24시간에서 상한.
// 60초 고정이면 막힌 정리 행 하나가 정비 함수를 끝없이 깨워 cron 비용이 돌아온다(BUG-19 관측 6).
// attemptCount는 claim마다 1씩 증가한다(entities/card-news/api/index.ts:385) — 첫 실패 시 1 → 60초(기존 동작 보존).
export const CLEANUP_RETRY_BASE_MS = 60_000;
export const CLEANUP_RETRY_CEILING_MS = 86_400_000; // 24h

export function cleanupRetryDelayMs(attemptCount: number): number {
  const attempts = Number.isFinite(attemptCount) ? Math.floor(attemptCount) : 1;
  const exponent = Math.min(Math.max(attempts - 1, 0), 30);
  return Math.min(CLEANUP_RETRY_BASE_MS * 2 ** exponent, CLEANUP_RETRY_CEILING_MS);
}
