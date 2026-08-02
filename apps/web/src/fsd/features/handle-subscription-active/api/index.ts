import {
  deleteSubscriptionByUserId,
  findSubscriptionByPolarId,
  findSubscriptionByUserId,
  upsertSubscription,
} from "~/fsd/entities/subscription";
import {
  findUserIdByEmail,
  incrementUserCreditsAndSetPolarCustomerId,
  updateUserPolarCustomerId,
} from "~/fsd/entities/user";

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

async function resolveUserId(input: HandleSubscriptionActiveInput) {
  if (input.metadataUserId) {
    return input.metadataUserId;
  }

  if (!input.customerEmail) {
    return null;
  }

  return findUserIdByEmail(input.customerEmail);
}

export async function handleSubscriptionActive(
  input: HandleSubscriptionActiveInput,
) {
  const userId = await resolveUserId(input);
  if (!userId) {
    return { ok: false as const, reason: "missing-user" };
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

  return { ok: true as const, userId, isNewSubscription };
}
