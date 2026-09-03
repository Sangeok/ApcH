/**
 * 초를 `m:ss` 시계 표기로.
 *
 * 같은 계산이 세 곳에 각자 있었다 — 클립 드래프트 카드(소수 1자리), 스크립트
 * 모달(정수, 컴포넌트 본문 안에 선언), 업로드 소스 길이(정수). 셋 다 같은
 * 반올림·패딩 규칙을 재현하고 있었고, 하나만 고치면 화면마다 다른 시간이 뜬다.
 *
 * null 처리는 여기서 하지 않는다 — 호출부마다 "값이 없다"에 보일 것이 다르다.
 */
export function formatSecondsAsClock(
  seconds: number,
  { decimals = 0 }: { decimals?: number } = {},
): string {
  const safe = Math.max(0, seconds);

  if (decimals === 0) {
    const rounded = Math.round(safe);
    const minutes = Math.floor(rounded / 60);
    return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
  }

  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  // 소수 자리를 포함하므로 패딩 폭이 "ss." + 소수 자릿수다.
  return `${minutes}:${rest.toFixed(decimals).padStart(3 + decimals, "0")}`;
}
