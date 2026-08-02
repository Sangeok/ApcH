import NextAuth from "next-auth";

import { authConfigEdge } from "~/auth/config.edge";

export default NextAuth(authConfigEdge).auth;

// /login도 matcher에 포함된다. 제외하지 않는 이유는 이미 로그인한 사용자를
// /analytics로 되돌려보내기 위해서다. 미인증 사용자가 /login에서 다시
// /login으로 튕기지 않도록 authorized 콜백이 AUTH_ROUTES를 명시 처리한다.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
