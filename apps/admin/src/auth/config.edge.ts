import type { NextAuthConfig } from "next-auth";

const AUTH_ROUTES = ["/login"];

export const authConfigEdge = {
  providers: [],
  session: {
    strategy: "jwt",
    // ADMIN_EMAILS에서 제거한 계정의 기존 JWT가 유효한 창을
    // 기본 30일에서 8시간으로 줄인다.
    maxAge: 60 * 60 * 8,
  },
  pages: { signIn: "/login" },
  callbacks: {
    // ⚠️ `authorized: ({ auth }) => !!auth?.user`로 축약하면 안 된다.
    // matcher가 /login을 포함하므로, 미인증 요청이 false를 받으면
    // NextAuth가 pages.signIn(= /login)으로 리다이렉트하고 미들웨어가
    // 다시 돌아 false를 받는다. 무한 리다이렉트가 된다.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthRoute = AUTH_ROUTES.some((route) =>
        nextUrl.pathname.startsWith(route),
      );

      if (isAuthRoute) {
        return isLoggedIn
          ? Response.redirect(new URL("/analytics", nextUrl))
          : true;
      }

      // /login을 뺀 전 경로가 보호 대상이다.
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
