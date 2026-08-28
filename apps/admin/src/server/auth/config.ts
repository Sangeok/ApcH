import "server-only";

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { env } from "~/env";
import { authConfigEdge } from "./config.edge";
import { parseAdminEmails } from "./parse-admin-emails";
import {
  buildVerifierProvider,
  VERIFIER_PROVIDER_ID,
  VERIFIER_ROLE,
} from "./verifier";

function getAdminEmailSet() {
  return parseAdminEmails(env.ADMIN_EMAILS);
}

// VERIFIER_SECRET이 있을 때만 Credentials provider가 등록된다(미설정이면 null → 미등록).
const verifierProvider = buildVerifierProvider(env.VERIFIER_SECRET);

export const authConfig = {
  ...authConfigEdge,
  providers: verifierProvider ? [Google, verifierProvider] : [Google],
  callbacks: {
    ...authConfigEdge.callbacks,
    // 화이트리스트 밖 계정은 로그인 자체를 거부한다.
    // 세션이 만들어지지 않으므로 guard는 2차 방어선이 된다.
    // verifier는 이메일이 아니라 authorize가 이미 비밀값을 검증했으므로 통과시킨다.
    signIn: ({ user, account }) => {
      if (account?.provider === VERIFIER_PROVIDER_ID) return true;
      const email = user.email?.toLowerCase();
      return !!email && getAdminEmailSet().has(email);
    },
    // verifier 로그인 시에만 role·발급시각 클레임을 심는다.
    // account는 최초 로그인에만 있으므로(이후 요청엔 없음) 발급시각은 1회만 고정된다.
    jwt: ({ token, account }) => {
      if (account?.provider === VERIFIER_PROVIDER_ID) {
        token.role = VERIFIER_ROLE;
        token.verifierIssuedAt = Date.now();
      }
      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub,
        role: typeof token.role === "string" ? token.role : undefined,
        verifierIssuedAt:
          typeof token.verifierIssuedAt === "number"
            ? token.verifierIssuedAt
            : undefined,
      },
    }),
  },
} satisfies NextAuthConfig;

export { getAdminEmailSet };
