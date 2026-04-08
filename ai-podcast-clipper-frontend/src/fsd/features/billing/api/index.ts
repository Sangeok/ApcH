"use server";

import { db } from "~/server/db";
import { env } from "~/env";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { success, failure } from "~/fsd/shared/api/result";
import type { ActionResult } from "~/fsd/shared/api/result";
import type { BillingPageData } from "~/fsd/features/billing/model/types";
import type { PlanTier } from "~/fsd/features/billing/constants";

export async function getBillingData(): Promise<ActionResult<BillingPageData>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const { userId } = authResult.data;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      credits: true,
      subscription: true,
      orders: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

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

  const subscription = await db.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) return failure("Active subscription not found");

  try {
    const polar = (await import("~/fsd/shared/api/polar")).getPolarClient();

    await polar.subscriptions.update({
      id: subscription.polarSubscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
      },
    });
  } catch {
    return failure("Failed to cancel subscription. Please try again.");
  }

  // Optimistic local DB update — don't wait for webhook
  await db.subscription.update({
    where: { userId },
    data: {
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
    },
  });

  return success(undefined);
}
