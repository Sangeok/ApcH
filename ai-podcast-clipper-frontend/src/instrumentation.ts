import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

// 서버 컴포넌트 / route handler의 미처리 예외를 Sentry로 보낸다.
export const onRequestError = Sentry.captureRequestError;
