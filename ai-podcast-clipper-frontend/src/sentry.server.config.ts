import * as Sentry from "@sentry/nextjs";
import { env } from "~/env";

// presigned URL 서명값과 내부 엔드포인트 호스트를 제3자로 흘리지 않는다.
// 사후 추가로는 이미 늦는 종류의 방어라 처음부터 넣는다.
//
// ↔ 자유 문자열은 shared/observability/report-error.ts의 ReportContext를 통해 들어온다.
//   scrub은 필드 무관 정규식이라 이미 알려진 패턴(위 세 가지, 엔드포인트 호스트)은
//   보고 필드가 늘어도 그대로 잡힌다. 다만 **새로운 종류의 비밀**(새 서명 파라미터명,
//   새 내부 호스트)이 그 채널로 들어오면 여기 규칙을 추가해야 한다.
const SCRUB_RULES: Array<[RegExp, string]> = [
  [/X-Amz-Signature=[^&\s"']+/gi, "X-Amz-Signature=[REDACTED]"],
  [/X-Amz-Credential=[^&\s"']+/gi, "X-Amz-Credential=[REDACTED]"],
  [/X-Amz-Security-Token=[^&\s"']+/gi, "X-Amz-Security-Token=[REDACTED]"],
];

function getEndpointHost(): string | null {
  try {
    return new URL(env.PROCESS_VIDEO_ENDPOINT).host;
  } catch {
    return null;
  }
}

const ENDPOINT_HOST = getEndpointHost();

function scrub(value: string): string {
  let out = value;

  for (const [pattern, replacement] of SCRUB_RULES) {
    out = out.replace(pattern, replacement);
  }

  if (ENDPOINT_HOST) {
    out = out.split(ENDPOINT_HOST).join("[PROCESS_VIDEO_ENDPOINT]");
  }

  return out;
}

// event 전체를 직렬화 → 치환 → 역직렬화.
// 메시지·예외·컨텍스트 어디에 섞여 있어도 잡힌다.
//
// ⚠️ 이 함수는 심층 방어이지 완전한 보장이 아니다. 두 가지 한계를 알고 쓸 것:
//   1) fail-open — JSON.stringify가 던지는 event가 오면 catch가
//      **스크럽되지 않은 원본을 그대로 반환**한다. 이름만 보고
//      "무조건 마스킹된다"고 가정하면 안 된다.
//   2) 왕복 손실 — T => T 시그니처와 달리 undefined/함수/심볼은 사라지고
//      Date는 문자열이 된다.
//
// 1)의 도달 가능성은 @sentry/nextjs v10.68.0 기준으로 확인했다: client._prepareEvent()가
// normalizeEvent()로 user/contexts/extra/breadcrumbs.data/spans.data를 정규화한 **뒤에야**
// processBeforeSend()가 beforeSend를 부른다(@sentry/core/build/cjs/client.js).
// 즉 순환 참조·BigInt는 이 지점에 도달하기 전에 제거되므로 catch는 사실상 죽은 경로다.
// SDK 메이저 업그레이드로 이 순서가 바뀌면 catch를 `return null`(이벤트 폐기)로
// 바꿔 fail-closed로 전환할 것.
function scrubEvent<T>(event: T): T {
  try {
    return JSON.parse(scrub(JSON.stringify(event))) as T;
  } catch {
    return event;
  }
}

Sentry.init({
  // undefined면 SDK가 전송하지 않는다 = preview/로컬에서 조용함
  dsn: env.SENTRY_DSN,
  // VERCEL_ENV는 Vercel 밖에서 undefined이므로 폴백을 코드에 명시한다
  environment: process.env.VERCEL_ENV ?? "development",
  // IP·쿠키 등 SDK 자동 수집을 끈다. 사용자 식별은 setUser({ id })로만.
  sendDefaultPii: false,
  // 1단계는 에러만. 성능 추적은 무료 쿼터만 태운다.
  tracesSampleRate: 0,
  beforeSend: (event) => scrubEvent(event),
});
