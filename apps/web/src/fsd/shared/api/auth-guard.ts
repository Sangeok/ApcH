import "server-only";

import { auth } from "~/server/auth";
import { failure } from "~/fsd/shared/api/result";
import type { ActionResult } from "~/fsd/shared/api/result";
import type { Session } from "next-auth";

export type AuthenticatedUser = {
  userId: string;
  session: Session;
};

/**
 * Server Action에서 인증을 요구하는 헬퍼 함수.
 * 인증 실패 시 ActionResult failure를 반환하고,
 * 성공 시 userId와 세션 정보를 반환한다.
 */
export async function requireAuth(): Promise<ActionResult<AuthenticatedUser>> {
  const session = await auth();

  if (!session?.user?.id) {
    return failure("Unauthorized");
  }

  return {
    success: true,
    data: {
      userId: session.user.id,
      session,
    },
  };
}
