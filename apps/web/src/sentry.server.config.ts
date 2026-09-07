import * as Sentry from "@sentry/nextjs";
import { env } from "~/env";
import { scrubEvent, type LiteralReplacement } from "~/fsd/shared/observability/scrub-event";

function getEndpointHost(): string | null {
  try {
    return new URL(env.PROCESS_VIDEO_ENDPOINT).host;
  } catch {
    return null;
  }
}

const ENDPOINT_HOST = getEndpointHost();

const ENDPOINT_REPLACEMENTS: LiteralReplacement[] = ENDPOINT_HOST
  ? [[ENDPOINT_HOST, "[PROCESS_VIDEO_ENDPOINT]"]]
  : [];

Sentry.init({
  // undefined면 SDK가 전송하지 않는다 = preview/로컬에서 조용함
  dsn: env.SENTRY_DSN,
  // VERCEL_ENV는 Vercel 밖에서 undefined이므로 폴백을 코드에 명시한다
  environment: process.env.VERCEL_ENV ?? "development",
  // IP·쿠키 등 SDK 자동 수집을 끈다. 사용자 식별은 setUser({ id })로만.
  sendDefaultPii: false,
  // 1단계는 에러만. 성능 추적은 무료 쿼터만 태운다.
  tracesSampleRate: 0,
  beforeSend: (event) => scrubEvent(event, ENDPOINT_REPLACEMENTS),
});
