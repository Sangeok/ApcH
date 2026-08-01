import {
  findSubscriptionByPolarId,
  updateSubscriptionByPolarId,
} from "~/fsd/entities/subscription";

interface HandleSubscriptionCanceledInput {
  subscriptionId: string;
  canceledAt: Date | null;
}

export async function handleSubscriptionCanceled(
  input: HandleSubscriptionCanceledInput,
) {
  const subscription = await findSubscriptionByPolarId(input.subscriptionId);

  if (!subscription) {
    return { ok: false as const, reason: "missing-subscription" };
  }

  await updateSubscriptionByPolarId(input.subscriptionId, {
    status: "canceled",
    canceledAt: input.canceledAt ?? new Date(),
    cancelAtPeriodEnd: true,
  });

  return { ok: true as const };
}
