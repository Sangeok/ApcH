import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { env } from "~/env";
import { parseAdminEmails } from "~/lib/parse-admin-emails";
import { authConfigEdge } from "./config.edge";

function getAdminEmailSet() {
  return parseAdminEmails(env.ADMIN_EMAILS);
}

export const authConfig = {
  ...authConfigEdge,
  providers: [Google],
  callbacks: {
    ...authConfigEdge.callbacks,
    // 화이트리스트 밖 계정은 로그인 자체를 거부한다.
    // 세션이 만들어지지 않으므로 guard는 2차 방어선이 된다.
    signIn: ({ user }) => {
      const email = user.email?.toLowerCase();
      return !!email && getAdminEmailSet().has(email);
    },
    session: ({ session, token }) => ({
      ...session,
      user: { ...session.user, id: token.sub },
    }),
  },
} satisfies NextAuthConfig;

export { getAdminEmailSet };
