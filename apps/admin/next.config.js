// 루트 .env 유일본을 읽는다. Next.js는 process.cwd() 기준으로만 .env를
// 자동 로드하는데 cwd가 apps/admin이므로 루트 파일이 자동으로는 안 읽힌다.
// ESM 정적 import는 모두 본문보다 먼저 평가되므로, ./src/env.js 검증이
// 이 dotenv 로드보다 먼저 실행되지 않도록 동적 import로 불러온다.
import { config as loadEnv } from "dotenv";
import { withSentryConfig } from "@sentry/nextjs";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: "../../.env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
  // Prisma 엔진이 packages/db/generated/prisma/ 에 있어 앱 Root Directory
  // 바깥이다. 트레이싱 루트를 저장소 루트로 올리지 않으면 엔진이 함수 번들에
  // 들어가지 않고, 빌드는 성공한 뒤 첫 DB 접근에서 500이 난다.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@repo/db"],
  serverExternalPackages: ["@prisma/adapter-neon"],
  // outputFileTracingRoot 만으로는 부족하다. 2026-08-01 web 배포에서 실측했다.
  // 생성 클라이언트가 빌드 시점 절대경로(/vercel/path0/...)를 파일에 박는데
  // 런타임 함수 루트는 /var/task/ 다. 트레이싱이 엔진을 번들에 넣더라도
  // Prisma 가 찾는 목록에 그 위치가 없다. 이 플러그인이 엔진을 번들 옆으로
  // 복사해 두 규칙을 맞춘다. admin 도 DB 를 읽으므로 똑같이 필요하다.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    return config;
  },
  async headers() {
    if (process.env.NODE_ENV === "development") return [];
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              // Neon만 남긴다. S3·Polar·Inngest는 admin이 쓰지 않는다.
              "connect-src 'self' https://*.neon.tech",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://accounts.google.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(config, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  silent: true,
  // web과 같은 Sentry 프로젝트를 쓰므로 릴리스가 겹친다(둘 다 커밋 SHA로
  // 릴리스를 키잉한다). @sentry/nextjs v10에서 dist는 최상위가 아니라
  // release.dist에 있다 — 릴리스를 더 잘게 나누는 식별자다. admin으로 갈라
  // 같은 커밋을 양쪽에 배포해도 소스맵 매핑이 엉키지 않게 한다.
  release: { dist: "admin" },
});
