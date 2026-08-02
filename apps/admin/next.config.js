// 루트 .env 유일본을 읽는다. Next.js는 process.cwd() 기준으로만 .env를
// 자동 로드하는데 cwd가 apps/admin이므로 루트 파일이 자동으로는 안 읽힌다.
// ESM 정적 import는 모두 본문보다 먼저 평가되므로, ./src/env.js 검증이
// 이 dotenv 로드보다 먼저 실행되지 않도록 동적 import로 불러온다.
import { config as loadEnv } from "dotenv";

loadEnv({ path: "../../.env" });

await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
  transpilePackages: ["@repo/db"],
  serverExternalPackages: ["@prisma/adapter-neon"],
};

export default config;
