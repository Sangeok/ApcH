import NextAuth from "next-auth";
import { authConfigEdge } from "~/server/auth/config.edge";

export default NextAuth(authConfigEdge).auth;

// ⚠️ Next는 이 `config`를 소스에서 정적으로 추출한다
// (get-page-static-info의 extractExportedConstValue). 리터럴이 아니면
// UnsupportedValueError로 빌드가 죽으므로, PROTECTED_ROUTES/AUTH_ROUTES에서
// 계산해 만들 수 없다. 둘을 바꾸면 아래 배열도 손으로 함께 고칠 것 —
// src/middleware.test.mjs가 두 목록이 이 패턴들에 포섭되는지 검사한다.
export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
