import * as Sentry from "@sentry/nextjs";

import { env } from "~/env";

// web과 같은 Sentry 프로젝트로 보내고 태그로 구분한다.
// web의 스크럽 규칙(presigned URL 서명값·내부 처리 엔드포인트 호스트 마스킹)은
// 두지 않는다. admin은 presigned URL을 만들지 않고 내부 처리 엔드포인트를
// 호출하지 않으므로 스크럽 대상이 없다.
Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  initialScope: { tags: { app: "admin" } },
  sendDefaultPii: false,
  tracesSampleRate: 0,
});
