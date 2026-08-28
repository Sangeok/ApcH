import "server-only";

import { timingSafeEqual } from "node:crypto";
import Credentials from "next-auth/providers/credentials";

export const VERIFIER_PROVIDER_ID = "verifier";
export const VERIFIER_ROLE = "verifier";
// verifier 세션의 앱 내부 수명. 전역 쿠키 maxAge(8h)와 별개로 requireAdmin이 강제한다.
export const VERIFIER_MAX_AGE_MS = 60 * 60 * 1000;

// 길이 검사 후 timing-safe 비교. 길이가 다르면 timingSafeEqual이 throw하므로 먼저 거른다.
export function verifyVerifierSecret(
  expected: string | undefined,
  provided: unknown,
): boolean {
  if (typeof expected !== "string" || expected.length === 0) return false;
  if (typeof provided !== "string") return false;
  const expectedBuf = Buffer.from(expected, "utf-8");
  const providedBuf = Buffer.from(provided, "utf-8");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// 성공 시 고정 신원(이메일 아님). 실패 시 null(예외 아님 → NextAuth가 CredentialsSignin으로 처리).
export function authorizeVerifier(
  expected: string | undefined,
  provided: unknown,
): { id: string; role: string } | null {
  if (!verifyVerifierSecret(expected, provided)) return null;
  return { id: VERIFIER_PROVIDER_ID, role: VERIFIER_ROLE };
}

// 비밀값이 없으면 provider를 등록하지 않는다(기능 자체가 꺼진다).
export function buildVerifierProvider(secret: string | undefined) {
  if (typeof secret !== "string" || secret.length === 0) return null;
  return Credentials({
    id: VERIFIER_PROVIDER_ID,
    name: "verifier",
    credentials: { secret: { type: "password" } },
    authorize: (credentials) => authorizeVerifier(secret, credentials?.secret),
  });
}
