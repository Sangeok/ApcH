import {
  deleteSubscriptionByUserId,
  findSubscriptionByPolarId,
  findSubscriptionByUserId,
  upsertSubscription,
} from "~/fsd/entities/subscription/server";
import {
  incrementUserCreditsAndSetPolarCustomerId,
  resolvePolarCustomerUserId,
  updateUserPolarCustomerId,
} from "~/fsd/entities/user/server";
import { failure, success } from "~/fsd/shared/api/result";
import type { ActionResult } from "~/fsd/shared/api/result";

interface HandleSubscriptionActiveInput {
  subscriptionId: string;
  productId: string;
  customerId: string;
  customerEmail?: string;
  metadataUserId?: string;
  tier?: string;
  monthlyCredits: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  recurringInterval?: string;
}

export async function handleSubscriptionActive(
  input: HandleSubscriptionActiveInput,
): Promise<ActionResult<{ userId: string; isNewSubscription: boolean }>> {
  const userId = await resolvePolarCustomerUserId(input);
  if (!userId) {
    return failure("missing-user");
  }

  const existingByPolarId = await findSubscriptionByPolarId(input.subscriptionId);
  const existingByUser = await findSubscriptionByUserId(userId);
  const isNewSubscription = !existingByPolarId;

  if (existingByUser && existingByUser.polarSubscriptionId !== input.subscriptionId) {
    await deleteSubscriptionByUserId(userId);
  }

  await upsertSubscription({
    polarSubscriptionId: input.subscriptionId,
    userId,
    polarProductId: input.productId,
    planTier: input.tier ?? "pro",
    status: "active",
    recurringInterval: input.recurringInterval ?? "month",
    monthlyCredits: input.monthlyCredits,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  });

  if (isNewSubscription) {
    await incrementUserCreditsAndSetPolarCustomerId(
      userId,
      input.monthlyCredits,
      input.customerId,
    );
  } else {
    await updateUserPolarCustomerId(userId, input.customerId);
  }

  return success({ userId, isNewSubscription });
}
