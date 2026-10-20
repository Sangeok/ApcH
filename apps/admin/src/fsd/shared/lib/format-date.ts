// 서버(Vercel, UTC)가 로케일·타임존을 코드로 고정하지 않으면, 표시 시각이 코드가
// 아니라 배포 환경에 의존한다 — 런타임 TZ가 바뀌거나 이 화면이 클라이언트로
// 내려가는 순간(web BUG-10 경로) 조용히 달라진다. 로케일은 "en", 타임존은
// "UTC"로 고정한다 — UTC는 서버 런타임과 같아 최소 변경이고, 사용자 위치를
// 가정하지 않는 중립값이다. (apps/web/src/fsd/shared/lib/format-date.ts와 같은 결정.)
// 상수를 수출하는 이유는 테스트다 — 고정 옵션에서 "en"과 "en-US"의 출력이 같아
// 함수 출력만으로는 로케일 인자를 지운 회귀를 en 계열 CI에서 못 잡는다.
export const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

// 날짜+시각(최근 실패 이벤트의 "Last seen" 등).
export function formatDateTime(value: Date | string | number): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}
