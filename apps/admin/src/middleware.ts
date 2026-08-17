import NextAuth from "next-auth";

import { authConfigEdge } from "~/server/auth/config.edge";

export default NextAuth(authConfigEdge).auth;

// /login도 matcher에 포함된다. 제외하지 않는 이유는 이미 로그인한 사용자를
// /analytics로 되돌려보내기 위해서다. 미인증 사용자가 /login에서 다시
// /login으로 튕기지 않도록 authorized 콜백이 AUTH_ROUTES를 명시 처리한다.
export const config = {
  // robots.txt 를 제외해야 app/robots.ts 가 실제로 서빙된다. 빼먹으면
  // 크롤러 요청이 미인증으로 잡혀 /login 으로 307 되고, Disallow: / 는
  // 아무에게도 전달되지 않는다. web 의 matcher 는 특정 경로만 겨냥해서
  // 이 문제가 없었다 — admin 의 "전부 보호" 방식이 만든 차이다.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
