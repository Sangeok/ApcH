"use server";

import { env } from "~/env";
import { findSubscriptionByUserId, updateSubscriptionByPolarId } from "~/fsd/entities/subscription";
import { getBillingUserSnapshot } from "~/fsd/entities/user";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { reportError } from "~/fsd/shared/observability";
import { success, failure } from "~/fsd/shared/api/result";
import type { ActionResult } from "~/fsd/shared/api/result";
import type { PlanTier } from "../config";
import type { BillingPageData } from "../model/types";

export async function getBillingData(): Promise<ActionResult<BillingPageData>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const { userId } = authResult.data;

  const user = await getBillingUserSnapshot(userId);

  if (!user) return failure("User not found");

  return success({
    credits: user.credits,
    subscription: user.subscription
      ? {
          id: user.subscription.id,
          planTier: user.subscription.planTier as PlanTier,
          status: user.subscription.status,
          recurringInterval: user.subscription.recurringInterval,
          monthlyCredits: user.subscription.monthlyCredits,
          currentPeriodEnd: user.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
        }
      : null,
    orders: user.orders.map((order) => ({
      id: order.id,
      productName: order.productName,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      createdAt: order.createdAt,
    })),
  });
}

export async function getCheckoutUrl(
  productId: string,
): Promise<ActionResult<{ url: string }>> {
  if (!env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED) {
    return failure("Subscriptions are currently disabled");
  }

  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const params = new URLSearchParams({
    products: productId,
  });

  return success({
    url: `/api/checkout?${params.toString()}`,
  });
}

export async function cancelSubscription(): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const { userId } = authResult.data;

  const subscription = await findSubscriptionByUserId(userId);

  if (!subscription) return failure("Active subscription not found");

  try {
    const polar = (await import("~/fsd/shared/api/polar")).getPolarClient();

    await polar.subscriptions.update({
      id: subscription.polarSubscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
      },
    });
  } catch (error) {
    reportError(error, { origin: "billing.cancelSubscription", userId });
    return failure("Failed to cancel subscription. Please try again.");
  }

  // Optimistic local DB update — don't wait for webhook
  await updateSubscriptionByPolarId(subscription.polarSubscriptionId, {
    cancelAtPeriodEnd: true,
    canceledAt: new Date(),
  });

  return success();
}
