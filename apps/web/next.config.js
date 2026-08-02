// 루트 .env 유일본을 읽는다. Next.js는 process.cwd() 기준으로만 .env를
// 자동 로드하는데 cwd가 apps/web이므로 루트 파일이 자동으로는 안 읽힌다.
// ESM 정적 import는 모두 본문보다 먼저 평가되므로, 아래 ./src/env.js 검증이
// 이 dotenv 로드보다 먼저 실행되지 않도록 src/env.js는 동적 import로 불러온다.
import { config as loadEnv } from "dotenv";
import { withSentryConfig } from "@sentry/nextjs";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: "../../.env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
  // Prisma 엔진이 packages/db/generated/prisma/ 에 있어 앱 Root Directory
  // 바깥이다. 트레이싱 루트를 저장소 루트로 올리지 않으면 @vercel/nft가
  // 엔진을 함수 번들에 넣지 않고, 빌드는 성공한 뒤 첫 DB 접근에서
  // "Query Engine not found"로 500이 난다.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@repo/db"],
  serverExternalPackages: ["@prisma/adapter-neon"],
  // outputFileTracingRoot만으로는 부족했다. 2026-08-01 dev 프리뷰 배포에서
  // 확인한 실패:
  //
  //   Prisma Client could not locate the Query Engine for runtime
  //   "rhel-openssl-3.0.x"
  //   The following locations have been searched:
  //     /var/task/apps/web/generated/prisma        <- 이동해서 없음
  //     /vercel/path0/packages/db/generated/prisma <- 빌드 머신 경로
  //
  // 생성 클라이언트가 빌드 시점 절대경로(/vercel/path0/...)를 박는데 런타임
  // 함수 루트는 /var/task/ 다. 트레이싱이 엔진을 번들에 넣더라도 Prisma가
  // 찾는 목록에 그 위치가 없다. 이 플러그인이 엔진을 번들 옆으로 복사해
  // 탐색 경로와 실제 위치를 맞춘다.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    return config;
  },
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
