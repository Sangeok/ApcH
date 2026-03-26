import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    DATABASE_URL: z.string(),
    DATABASE_URL_UNPOOLED: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
    AWS_REGION: z.string(),
    S3_BUCKET_NAME: z.string(),
    PROCESS_VIDEO_ENDPOINT: z.string(),
    PROCESS_VIDEO_ENDPOINT_AUTH: z.string(),
    AUTH_GOOGLE_ID: z.string(),
    AUTH_GOOGLE_SECRET: z.string(),
    POLAR_ACCESS_TOKEN: z.string(),
    POLAR_WEBHOOK_SECRET_DEV: z.string(),
    POLAR_WEBHOOK_SECRET_PROD: z.string(),
    POLAR_SERVER: z.enum(["sandbox", "production"]).optional(),
    // Inngest (Vercel Integration이 자동 주입, 로컬에서는 불필요)
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),
    // CloudFront CDN (선택)
    CLOUDFRONT_DOMAIN: z.string().optional(),
    CLOUDFRONT_KEY_PAIR_ID: z.string().optional(),
    CLOUDFRONT_PRIVATE_KEY: z.string().optional(),
    // NextAuth Production URL
    AUTH_URL: z.string().url().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUBSCRIPTION_ENABLED: z
      .string()
      .transform((v) => v === "true")
      .default("false"),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    NODE_ENV: process.env.NODE_ENV,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: process.env.AWS_REGION,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    PROCESS_VIDEO_ENDPOINT: process.env.PROCESS_VIDEO_ENDPOINT,
    PROCESS_VIDEO_ENDPOINT_AUTH: process.env.PROCESS_VIDEO_ENDPOINT_AUTH,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET_DEV: process.env.POLAR_WEBHOOK_SECRET_DEV,
    POLAR_WEBHOOK_SECRET_PROD: process.env.POLAR_WEBHOOK_SECRET_PROD,
    POLAR_SERVER: process.env.POLAR_SERVER,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    CLOUDFRONT_DOMAIN: process.env.CLOUDFRONT_DOMAIN,
    CLOUDFRONT_KEY_PAIR_ID: process.env.CLOUDFRONT_KEY_PAIR_ID,
    CLOUDFRONT_PRIVATE_KEY: process.env.CLOUDFRONT_PRIVATE_KEY,
    AUTH_URL: process.env.AUTH_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUBSCRIPTION_ENABLED: process.env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
