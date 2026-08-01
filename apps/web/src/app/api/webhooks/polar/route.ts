import { Webhooks } from "@polar-sh/nextjs";
import type { NextRequest } from "next/server";
import { env } from "~/env";
import { handleOrderCreated } from "~/fsd/features/handle-order-created";
import { handleSubscriptionActive } from "~/fsd/features/handle-subscription-active";
import { handleSubscriptionCanceled } from "~/fsd/features/handle-subscription-canceled";
import { handleSubscriptionUpdated } from "~/fsd/features/handle-subscription-updated";

export const maxDuration = 10;

const webhooksHandler = Webhooks({
  webhookSecret:
    env.NODE_ENV === "production"
      ? env.POLAR_WEBHOOK_SECRET_PROD
      : env.POLAR_WEBHOOK_SECRET_DEV,

  onSubscriptionCreated: async () => {
    // Subscription creation alone is not actionable until it becomes active.
  },

  onSubscriptionActive: async (payload) => {
    try {
      const { data } = payload;
      console.log(
        "[polar:subscription.active] id:",
        data.id,
        "metadata:",
        JSON.stringify(data.metadata),
        "customer:",
        data.customer?.email,
      );

      const tier = data.product?.metadata?.tier as string | undefined;
      const monthlyCredits = Number(data.product?.metadata?.monthlyCredits) || 0;

      const result = await handleSubscriptionActive({
        subscriptionId: data.id,
        productId: data.productId,
        customerId: data.customerId,
        customerEmail: data.customer?.email,
        metadataUserId: data.metadata?.userId as string | undefined,
        tier,
        monthlyCredits,
        currentPeriodStart: new Date(data.currentPeriodStart),
        currentPeriodEnd: new Date(data.currentPeriodEnd),
        recurringInterval: data.recurringInterval ?? "month",
      });

      if (!result.ok) {
        console.error(
          "[polar:subscription.active] userId resolution failed",
          JSON.stringify(data.metadata),
          data.customer?.email,
        );
        return;
      }

      console.log(
        "[polar:subscription.active] success",
        result.userId,
        tier,
        monthlyCredits,
      );
    } catch (error) {
      console.error("[polar:subscription.active] error:", error);
      throw error;
    }
  },

  onSubscriptionUpdated: async (payload) => {
    try {
      const { data } = payload;
      console.log("[polar:subscription.updated] id:", data.id, "status:", data.status);

      const tier = data.product?.metadata?.tier as string | undefined;
      const monthlyCredits = Number(data.product?.metadata?.monthlyCredits) || 0;

      const result = await handleSubscriptionUpdated({
        subscriptionId: data.id,
        productId: data.productId,
        status: data.status,
        tier,
        monthlyCredits,
        currentPeriodStart: new Date(data.currentPeriodStart),
        currentPeriodEnd: new Date(data.currentPeriodEnd),
        recurringInterval: data.recurringInterval ?? undefined,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
        canceledAt: data.canceledAt ? new Date(data.canceledAt) : null,
      });

      if (!result.ok) {
        console.error("[polar:subscription.updated] subscription not found:", data.id);
        return;
      }

      console.log("[polar:subscription.updated] success:", data.id);
    } catch (error) {
      console.error("[polar:subscription.updated] error:", error);
      throw error;
    }
  },

  onSubscriptionCanceled: async (payload) => {
    try {
      const { data } = payload;
      console.log("[polar:subscription.canceled] id:", data.id);

      const result = await handleSubscriptionCanceled({
        subscriptionId: data.id,
        canceledAt: data.canceledAt ? new Date(data.canceledAt) : null,
      });

      if (!result.ok) {
        console.error("[polar:subscription.canceled] subscription not found:", data.id);
        return;
      }

      console.log("[polar:subscription.canceled] success:", data.id);
    } catch (error) {
      console.error("[polar:subscription.canceled] error:", error);
      throw error;
    }
  },

  onOrderCreated: async (payload) => {
    try {
      const { data } = payload;
      console.log(
        "[polar:order.created] id:",
        data.id,
        "metadata:",
        JSON.stringify(data.metadata),
        "customer:",
        data.customer?.email,
      );

      const result = await handleOrderCreated({
        orderId: data.id,
        productName: data.product?.name ?? "Unknown",
        amount: data.totalAmount ?? 0,
        currency: data.currency ?? "usd",
        status: "completed",
        customerEmail: data.customer?.email,
        metadataUserId: data.metadata?.userId as string | undefined,
      });

      if (!result.ok) {
        console.error(
          "[polar:order.created] userId resolution failed",
          JSON.stringify(data.metadata),
          data.customer?.email,
        );
        return;
      }

      console.log("[polar:order.created] success:", result.userId, data.id);
    } catch (error) {
      console.error("[polar:order.created] error:", error);
      throw error;
    }
  },
});

export async function POST(request: NextRequest) {
  console.log("[polar:webhook] incoming request", request.method, request.url);
  console.log(
    "[polar:webhook] headers",
    "webhook-id:",
    request.headers.get("webhook-id"),
    "webhook-signature:",
    request.headers.get("webhook-signature")?.slice(0, 20) + "...",
  );

  const response = await webhooksHandler(request);

  console.log("[polar:webhook] response status:", response.status);
  if (response.status !== 200) {
    const body = await response.clone().text();
    console.error("[polar:webhook] failed:", response.status, body);
  }

  return response;
}
