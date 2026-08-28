import "server-only";

import { notFound, redirect } from "next/navigation";

import { auth, getAdminEmailSet } from "./index";
import { VERIFIER_MAX_AGE_MS, VERIFIER_ROLE } from "./verifier";

export async function requireAdmin(
  options: { write?: boolean } = {},
): Promise<{ userId: string; email: string | null }> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // verifier: 읽기 전용·1h 수명. 이메일이 없어 아래 화이트리스트 검사에 걸리면
  // 항상 404가 되므로, admin 분기보다 먼저 처리한다.
  if (session.user.role === VERIFIER_ROLE) {
    const issuedAt = session.user.verifierIssuedAt;
    if (
      typeof issuedAt !== "number" ||
      Date.now() - issuedAt > VERIFIER_MAX_AGE_MS
    ) {
      notFound(); // 만료·클레임 부재 → 존재를 드러내지 않는다(3층 관례)
    }
    if (options.write) {
      notFound(); // verifier는 쓰기 액션 불가(비밀값이 새도 열람 이상 불가)
    }
    return { userId: session.user.id, email: null };
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
