"use server";

import { getUserCreditBalance } from "~/fsd/entities/user/server";
import type { CreditBalance } from "~/fsd/entities/user";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { failure, success, type ActionResult } from "~/fsd/shared/api/result";
import { reportError } from "~/fsd/shared/observability";

export async function getCreditBalance(): Promise<
  ActionResult<{ authUserId: string; creditBalance: CreditBalance }>
> {
  const authenticated = await requireAuth();
  if (!authenticated.success) return authenticated;
  try {
    const creditBalance = await getUserCreditBalance(authenticated.data.userId);
    return success({ authUserId: authenticated.data.userId, creditBalance });
  } catch (error) {
    reportError(error, {
      origin: "credit-balance.getCreditBalance",
      userId: authenticated.data.userId,
    });
    return failure("Unable to refresh your credit balance");
  }
}
