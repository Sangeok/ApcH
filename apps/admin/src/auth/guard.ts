import "server-only";

import { notFound, redirect } from "next/navigation";

import { auth, getAdminEmailSet } from "./index";

export async function requireAdmin() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const email = session.user.email?.toLowerCase();

  // signIn 콜백이 이미 걸렀지만 재검사를 남긴다.
  // ADMIN_EMAILS에서 제거된 계정의 기존 JWT가 maxAge(8h) 만료 전까지
  // 유효하므로, 이 검사가 다음 요청부터 차단한다.
  if (!email || !getAdminEmailSet().has(email)) {
    notFound();
  }

  return {
    userId: session.user.id,
    email,
  };
}
