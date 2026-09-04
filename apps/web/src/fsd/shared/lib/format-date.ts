// 서버(Vercel, UTC)와 브라우저(사용자 로케일·타임존)가 같은 문자열을 내야
// 하이드레이션(React #418)이 깨지지 않는다. 로케일은 "en", 타임존은 "UTC"로
// 고정한다 — UTC는 서버 런타임과 같아 최소 변경이고, 사용자 위치를 가정하지
// 않는 중립값이다. 표시 시각이 사용자 로컬이 아니라 UTC라는 점은 감수한다
// (「대안」의 Asia/Seoul·클라이언트 전용 렌더 참조).
// 두 상수를 수출하는 이유는 테스트다. 함수 출력만으로는 `"en"`과 `"en-US"`를
// 구분할 수 없어(고정 옵션에서 두 로케일의 출력이 같다) 로케일 인자를 지운 회귀를
// en 계열 CI에서 못 잡는다. 테스트가 `resolvedOptions()`를 직접 볼 핸들이 있어야
// 한다 — 「테스트」 절 장치 2.
export const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

// 날짜만(주문일·구독 갱신/만료일). 주의: '시각이 안 보인다'와 '타임존이 무관하다'는
// 다르다 — UTC 15:00 이후 타임스탬프는 KST 기준 다음 날이라 **표시되는 날짜 자체가
// 하루 달라진다**(「표시 문구 변화」 참조).
export function formatDate(value: Date | string | number): string {
  return DATE_FORMATTER.format(new Date(value));
}

// 날짜+시각(업로드 시각·처리 타임라인 등).
export function formatDateTime(value: Date | string | number): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}
