// 자유 문자열 채널(예: presigned URL)에 섞일 수 있는 알려진 비밀을 Sentry 이벤트에서 지운다.
// 서버·클라이언트 beforeSend가 공유한다. 클라이언트 안전: env·server-only 의존이 없다.
// 그래서 shared/observability/index.ts(server-only report-error를 재수출)에는 넣지 않고
// 파일 경로로만 임포트한다 — use-report-boundary-error.ts:11-13과 같은 이유.
//
// 자유 문자열은 서버에서 report-error.ts의 ReportContext를 통해 들어온다. SCRUB_RULES는
// 필드 무관 정규식이라 보고 필드가 늘어도 알려진 패턴(아래 세 서명 + 서버가 넘기는 엔드포인트
// 호스트 리터럴)은 그대로 잡힌다. 다만 **새로운 종류의 비밀**(새 서명 파라미터명, 새 내부 호스트)이
// 그 채널로 들어오면 여기 SCRUB_RULES(또는 서버 sentry.server.config.ts의 엔드포인트 리터럴)에
// 규칙을 추가해야 한다.

// 경계에 백슬래시를 포함한다(원본에는 없다 — 검증 라운드 결함 ①).
// JSON.stringify가 값 안의 따옴표를 \" 로 이스케이프하는데, 원본 경계 [^&\s"']는
// 그 백슬래시에서 멈추지 않아 닫는 따옴표까지 삼킨다 → 치환 결과가 깨진 JSON이 되고
// JSON.parse가 던져 catch가 **스크럽되지 않은 원본을 그대로 반환**한다(fail-open).
const SCRUB_RULES: Array<[RegExp, string]> = [
  [/X-Amz-Signature=[^&\s"'\\]+/gi, "X-Amz-Signature=[REDACTED]"],
  [/X-Amz-Credential=[^&\s"'\\]+/gi, "X-Amz-Credential=[REDACTED]"],
  [/X-Amz-Security-Token=[^&\s"'\\]+/gi, "X-Amz-Security-Token=[REDACTED]"],
];

/** 문자열 리터럴 치환. 서버는 [엔드포인트 호스트, "[PROCESS_VIDEO_ENDPOINT]"]를 넘긴다. */
export type LiteralReplacement = readonly [needle: string, replacement: string];

export function scrubString(
  value: string,
  literals: readonly LiteralReplacement[] = [],
): string {
  let out = value;
  for (const [pattern, replacement] of SCRUB_RULES) {
    out = out.replace(pattern, replacement);
  }
  for (const [needle, replacement] of literals) {
    out = out.split(needle).join(replacement);
  }
  return out;
}

// event 전체를 직렬화 → 치환 → 역직렬화. 메시지·예외·컨텍스트 어디에 섞여도 잡힌다.
// 심층 방어이지 완전한 보장이 아니다. 두 한계를 알고 쓸 것:
//   1) fail-open — JSON.stringify가 던지면 catch가 **스크럽되지 않은 원본을 그대로 반환**한다.
//      이름만 보고 "무조건 마스킹된다"고 가정하면 안 된다. SDK 메이저 업그레이드로 normalize
//      순서가 바뀌면 return null(=이벤트 폐기)로 바꿔 fail-closed로 전환할 것.
//   2) 왕복 손실 — T => T 시그니처와 달리 undefined/함수/심볼은 사라지고 Date는 문자열이 된다.
export function scrubEvent<T>(
  event: T,
  literals: readonly LiteralReplacement[] = [],
): T {
  try {
    return JSON.parse(scrubString(JSON.stringify(event), literals)) as T;
  } catch {
    return event;
  }
}
