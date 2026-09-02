/**
 * claim 시각(ISO)과 현재 시각으로 정체 경과(분, 반올림)를 낸다.
 * parse 불가·음수(미래 시각)면 0을 돌려준다(방어). Inngest step 경계가 Date를
 * JSON으로 넘나들므로 claimedAt은 문자열이며, 계산은 감시자의 check 스텝 안에서 끝낸다.
 */
export function stuckAlertElapsedMinutes(claimedAtIso: string, now: Date): number {
  const claimedMs = Date.parse(claimedAtIso);
  if (Number.isNaN(claimedMs)) {
    return 0;
  }
  const elapsedMs = now.getTime() - claimedMs;
  if (elapsedMs <= 0) {
    return 0;
  }
  return Math.round(elapsedMs / 60_000);
}
