import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // DB (읽기 전용)
    DATABASE_URL: z.string(),
    DATABASE_URL_UNPOOLED: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // 인증
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_URL: z.string().url().optional(),
    AUTH_GOOGLE_ID: z.string(),
    AUTH_GOOGLE_SECRET: z.string(),
    // 이 앱의 유일한 인가 로직이다. 역할 테이블도 권한 시스템도 없고
    // 이 문자열 하나가 누가 들어올지를 정한다.
    //
    // optional 로 두면 안 된다. 주입을 빠뜨려도 빌드가 통과하고,
    // getAdminEmailSet() 이 빈 집합을 돌려주고, signIn 콜백이 모든 계정을
    // 거부한다. 운영자가 보는 증상은 "내 관리자 계정이 AccessDenied 를
    // 받는다"인데 그 무엇도 환경변수 누락을 가리키지 않는다.
    //
    // 프로덕션에서는 최소 1자를 요구해 빌드 단계에서 빠르게 실패시킨다.
    // AUTH_SECRET 과 같은 취급이다.
    ADMIN_EMAILS:
      process.env.NODE_ENV === "production"
        ? z.string().min(1)
        : z.string().optional(),
    // 관측 (web과 동일 값)
    SENTRY_DSN: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
  },

  // admin에는 클라이언트 노출 변수가 없다.
  client: {},

  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  },

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
