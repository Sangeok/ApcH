import {
  findSubscriptionByPolarId,
  updateSubscriptionByPolarId,
} from "~/fsd/entities/subscription/server";
import { incrementUserCredits } from "~/fsd/entities/user/server";
import { failure, success } from "~/fsd/shared/api/result";
import type { ActionResult } from "~/fsd/shared/api/result";

interface HandleSubscriptionUpdatedInput {
  subscriptionId: string;
  productId: string;
  status: string;
  tier?: string;
  monthlyCredits: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  recurringInterval?: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
}

export async function handleSubscriptionUpdated(
  input: HandleSubscriptionUpdatedInput,
): Promise<ActionResult<void>> {
  const subscription = await findSubscriptionByPolarId(input.subscriptionId);

  if (!subscription) {
    return failure("missing-subscription");
  }

  const periodChanged =
    subscription.currentPeriodEnd.getTime() !== input.currentPeriodEnd.getTime();

  if (periodChanged && input.status === "active") {
    await incrementUserCredits(subscription.userId, input.monthlyCredits);
  }

  await updateSubscriptionByPolarId(input.subscriptionId, {
    status: input.status,
    planTier: input.tier ?? subscription.planTier,
    polarProductId: input.productId,
    monthlyCredits: input.monthlyCredits,
    recurringInterval: input.recurringInterval ?? subscription.recurringInterval,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    canceledAt: input.canceledAt,
  });

  return success();
}
