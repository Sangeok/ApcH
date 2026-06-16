import type { NextAuthConfig } from "next-auth";

const PROTECTED_ROUTES = ["/dashboard", "/admin"];
const AUTH_ROUTES = ["/login"];

/**
 * Edge Runtime 호환 인증 설정.
 * middleware.ts에서 사용하며, Prisma/DB 의존성이 없다.
 * 전체 인증 설정(config.ts)은 이 설정을 확장(spread)한다.
 */
export const authConfigEdge = {
  providers: [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;

      // 보호 라우트: 미인증 사용자 → 로그인 페이지로 리다이렉트
      const isProtected = PROTECTED_ROUTES.some((route) =>
        nextUrl.pathname.startsWith(route),
      );
      if (isProtected && !isLoggedIn) {
        return false; // NextAuth가 자동으로 pages.signIn + callbackUrl로 리다이렉트
      }

      // 인증 라우트: 이미 로그인된 사용자 → 대시보드로 리다이렉트
      const isAuthRoute = AUTH_ROUTES.some((route) =>
        nextUrl.pathname.startsWith(route),
      );
      if (isAuthRoute && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
