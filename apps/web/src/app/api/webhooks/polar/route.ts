import { Webhooks } from "@polar-sh/nextjs";
import type { NextRequest } from "next/server";
import { env } from "~/env";
import { handleOrderCreated } from "~/fsd/features/handle-order-created";
import { handleSubscriptionActive } from "~/fsd/features/handle-subscription-active";
import { handleSubscriptionCanceled } from "~/fsd/features/handle-subscription-canceled";
import { handleSubscriptionUpdated } from "~/fsd/features/handle-subscription-updated";

export const maxDuration = 10;

// Polar metadata는 판매자가 채우는 자유 필드다. 캐스트로 통과시키면
// 문자열이 아닌 userId가 그대로 Subscription/Order의 외래키가 되고,
// 핸들러가 rethrow하므로 Polar가 무한 재시도한다.
function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function toProductMetadata(product: { metadata?: unknown } | null | undefined) {
  const metadata = (product?.metadata ?? {}) as Record<string, unknown>;
  return {
    tier: asOptionalString(metadata.tier),
    monthlyCredits: asNonNegativeInt(metadata.monthlyCredits),
  };
}

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

      const { tier, monthlyCredits } = toProductMetadata(data.product);

      const result = await handleSubscriptionActive({
        subscriptionId: data.id,
        productId: data.productId,
        customerId: data.customerId,
        customerEmail: data.customer?.email,
        metadataUserId: asOptionalString(data.metadata?.userId),
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

      const { tier, monthlyCredits } = toProductMetadata(data.product);

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
        metadataUserId: asOptionalString(data.metadata?.userId),
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
