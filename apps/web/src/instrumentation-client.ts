import * as Sentry from "@sentry/nextjs";

import { env } from "~/env";
import { scrubEvent } from "~/fsd/shared/observability/scrub-event";

Sentry.init({
  // undefined면 SDK가 전송하지 않는다 = preview/로컬에서 조용함 (server config와 동일 규약)
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  // environment는 생략한다. SDK가 SENTRY_ENVIRONMENT → NEXT_PUBLIC_VERCEL_ENV → NODE_ENV
  // 순으로 자동 채우므로(client/index.js:54, getVercelEnv.js:4) 클라 전용 폴백을 직접 쓰지 않는다.
  // IP·쿠키 등 SDK 자동 수집을 끈다. 사용자 식별은 setUser({ id })로만.
  sendDefaultPii: false,
  // 1단계는 에러만. 성능 추적은 무료 쿼터만 태운다.
  tracesSampleRate: 0,
  // 클라에는 서버 스코프 env(PROCESS_VIDEO_ENDPOINT)가 없으므로 엔드포인트 치환은 넘기지 않는다.
  beforeSend: (event) => scrubEvent(event),
});

// 앱 라우터 내비게이션 계측 훅 (@sentry/nextjs 10.68.0: captureRouterTransitionStart)
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
