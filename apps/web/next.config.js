// 루트 .env 유일본을 읽는다. Next.js는 process.cwd() 기준으로만 .env를
// 자동 로드하는데 cwd가 apps/web이므로 루트 파일이 자동으로는 안 읽힌다.
// ESM 정적 import는 모두 본문보다 먼저 평가되므로, 아래 ./src/env.js 검증이
// 이 dotenv 로드보다 먼저 실행되지 않도록 src/env.js는 동적 import로 불러온다.
import { config as loadEnv } from "dotenv";
import { withSentryConfig } from "@sentry/nextjs";

loadEnv({ path: "../../.env" });

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
  serverExternalPackages: ["@prisma/adapter-neon"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    // 개발 환경에서는 CSP를 적용하지 않음
    if (process.env.NODE_ENV === "development") return [];
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.amazonaws.com",
              "media-src 'self' https://*.amazonaws.com",
              "connect-src 'self' https://*.amazonaws.com https://*.neon.tech https://*.inngest.com https://*.polar.sh",
              "frame-src 'self' https://checkout.polar.sh https://sandbox.polar.sh",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// org/project는 여기 하드코딩하지 않고 SENTRY_ORG / SENTRY_PROJECT 환경변수로 받는다.
// @sentry/nextjs v10의 SentryBuildOptions가 두 값 모두 해당 환경변수 폴백을 문서화하고 있고,
// 그래야 slug를 모르는 상태에서도 코드가 완결된다. 셋 중 하나라도 없으면 소스맵 업로드만
// 조용히 건너뛰고 빌드는 통과한다(silent: true).
export default withSentryConfig(config, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // 소스맵을 업로드하되 빌드 산출물에서는 제거 (스택 추적은 살리고 노출은 막음)
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // 토큰이 없는 환경(preview/로컬)에서 빌드가 깨지지 않게
  silent: true,
});
