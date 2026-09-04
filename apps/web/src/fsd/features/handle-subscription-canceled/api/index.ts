import {
  findSubscriptionByPolarId,
  updateSubscriptionByPolarId,
} from "~/fsd/entities/subscription/server";
import { failure, success } from "~/fsd/shared/api/result";
import type { ActionResult } from "~/fsd/shared/api/result";

interface HandleSubscriptionCanceledInput {
  subscriptionId: string;
  canceledAt: Date | null;
}

export async function handleSubscriptionCanceled(
  input: HandleSubscriptionCanceledInput,
): Promise<ActionResult<void>> {
  const subscription = await findSubscriptionByPolarId(input.subscriptionId);

  if (!subscription) {
    return failure("missing-subscription");
  }

  await updateSubscriptionByPolarId(input.subscriptionId, {
    status: "canceled",
    canceledAt: input.canceledAt ?? new Date(),
    cancelAtPeriodEnd: true,
  });

  return success();
}
