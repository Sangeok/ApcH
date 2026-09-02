import type { NextAuthConfig } from "next-auth";

/**
 * 로그인해야 들어갈 수 있는 경로 접두사.
 *
 * ⚠️ 아래 `authorized` 콜백은 **middleware matcher가 통과시킨 경로에서만** 돈다.
 * 여기에만 추가하고 `src/middleware.ts`의 matcher를 그대로 두면, 보호된 것처럼
 * 읽히지만 실제로는 무방비인 라우트가 생긴다. `src/middleware.test.mjs`가
 * 그 드리프트를 실패로 바꾼다.
 */
export const PROTECTED_ROUTES = ["/dashboard"] as const;

/** 이미 로그인한 사용자를 대시보드로 돌려보내는 경로. 같은 matcher 제약을 받는다. */
export const AUTH_ROUTES = ["/login"] as const;

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
