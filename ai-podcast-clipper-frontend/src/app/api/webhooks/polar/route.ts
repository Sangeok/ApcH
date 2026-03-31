import { Webhooks } from "@polar-sh/nextjs";
import type { NextRequest } from "next/server";
import { env } from "~/env";
import { db } from "~/server/db";

export const maxDuration = 10; // Hobby 플랜 최대값. Pro 전환 시 30으로 상향 권장

async function resolveUserId(
  metadataUserId: string | undefined,
  customerEmail: string | undefined,
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  if (!customerEmail) return null;
  const user = await db.user.findUnique({
    where: { email: customerEmail },
    select: { id: true },
  });
  return user?.id ?? null;
}

const webhooksHandler = Webhooks({
  webhookSecret:
    env.NODE_ENV === "production"
      ? env.POLAR_WEBHOOK_SECRET_PROD
      : env.POLAR_WEBHOOK_SECRET_DEV,

  onSubscriptionCreated: async () => {
    // Subscription created but may not be active yet — no action needed
  },

  onSubscriptionActive: async (payload) => {
    try {
      const { data } = payload;
      console.log("[polar:subscription.active] id:", data.id, "metadata:", JSON.stringify(data.metadata), "customer:", data.customer?.email);

      const userId = await resolveUserId(
        data.metadata?.userId as string | undefined,
        data.customer?.email,
      );
      if (!userId) {
        console.error("[polar:subscription.active] userId resolution failed — metadata:", JSON.stringify(data.metadata), "email:", data.customer?.email);
        return;
      }

      const tier = data.product?.metadata?.tier as string | undefined;
      const monthlyCredits =
        Number(data.product?.metadata?.monthlyCredits) || 0;

      // 1. Check existing subscriptions (idempotency + userId @unique conflict prevention)
      const existingByPolarId = await db.subscription.findUnique({
        where: { polarSubscriptionId: data.id },
      });
      const existingByUser = await db.subscription.findUnique({
        where: { userId },
      });

      const isNewSubscription = !existingByPolarId;

      // 2. Remove old subscription if user has one with different polarSubscriptionId (plan switch)
      if (existingByUser && existingByUser.polarSubscriptionId !== data.id) {
        await db.subscription.delete({
          where: { userId },
        });
      }

      // 3. Upsert subscription
      await db.subscription.upsert({
        where: { polarSubscriptionId: data.id },
        create: {
          polarSubscriptionId: data.id,
          userId,
          polarProductId: data.productId,
          planTier: tier ?? "pro",
          status: "active",
          recurringInterval: data.recurringInterval ?? "month",
          monthlyCredits,
          currentPeriodStart: new Date(data.currentPeriodStart),
          currentPeriodEnd: new Date(data.currentPeriodEnd),
        },
        update: {
          status: "active",
          planTier: tier ?? "pro",
          monthlyCredits,
          currentPeriodStart: new Date(data.currentPeriodStart),
          currentPeriodEnd: new Date(data.currentPeriodEnd),
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      });

      // 4. Credit recharge (only for new subscriptions — skip on duplicate events)
      if (isNewSubscription) {
        await db.user.update({
          where: { id: userId },
          data: {
            credits: { increment: monthlyCredits },
            polarCustomerId: data.customerId,
          },
        });
      } else {
        await db.user.update({
          where: { id: userId },
          data: { polarCustomerId: data.customerId },
        });
      }

      console.log("[polar:subscription.active] success — userId:", userId, "tier:", tier, "credits:", monthlyCredits);
    } catch (error) {
      console.error("[polar:subscription.active] error:", error);
      throw error;
    }
  },

  onSubscriptionUpdated: async (payload) => {
    try {
      const { data } = payload;
      console.log("[polar:subscription.updated] id:", data.id, "status:", data.status);

      const subscription = await db.subscription.findUnique({
        where: { polarSubscriptionId: data.id },
      });
      if (!subscription) {
        console.error("[polar:subscription.updated] subscription not found:", data.id);
        return;
      }

      const tier = data.product?.metadata?.tier as string | undefined;
      const monthlyCredits =
        Number(data.product?.metadata?.monthlyCredits) || 0;

      // Detect period renewal for credit recharge
      const periodChanged =
        subscription.currentPeriodEnd.getTime() !==
        new Date(data.currentPeriodEnd).getTime();

      if (periodChanged && data.status === "active") {
        await db.user.update({
          where: { id: subscription.userId },
          data: {
            credits: { increment: monthlyCredits },
          },
        });
      }

      await db.subscription.update({
        where: { polarSubscriptionId: data.id },
        data: {
          status: data.status,
          planTier: tier ?? subscription.planTier,
          polarProductId: data.productId,
          monthlyCredits,
          recurringInterval:
            data.recurringInterval ?? subscription.recurringInterval,
          currentPeriodStart: new Date(data.currentPeriodStart),
          currentPeriodEnd: new Date(data.currentPeriodEnd),
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          canceledAt: data.canceledAt ? new Date(data.canceledAt) : null,
        },
      });

      console.log("[polar:subscription.updated] success — id:", data.id);
    } catch (error) {
      console.error("[polar:subscription.updated] error:", error);
      throw error;
    }
  },

  onSubscriptionCanceled: async (payload) => {
    try {
      const { data } = payload;
      console.log("[polar:subscription.canceled] id:", data.id);

      const subscription = await db.subscription.findUnique({
        where: { polarSubscriptionId: data.id },
      });
      if (!subscription) {
        console.error("[polar:subscription.canceled] subscription not found:", data.id);
        return;
      }

      await db.subscription.update({
        where: { polarSubscriptionId: data.id },
        data: {
          status: "canceled",
          canceledAt: data.canceledAt ? new Date(data.canceledAt) : new Date(),
          cancelAtPeriodEnd: true,
        },
      });

      console.log("[polar:subscription.canceled] success — id:", data.id);
    } catch (error) {
      console.error("[polar:subscription.canceled] error:", error);
      throw error;
    }
  },

  onOrderCreated: async (payload) => {
    try {
      const { data } = payload;
      console.log("[polar:order.created] id:", data.id, "metadata:", JSON.stringify(data.metadata), "customer:", data.customer?.email);

      const userId = await resolveUserId(
        data.metadata?.userId as string | undefined,
        data.customer?.email,
      );
      if (!userId) {
        console.error("[polar:order.created] userId resolution failed — metadata:", JSON.stringify(data.metadata), "email:", data.customer?.email);
        return;
      }

      const existingOrder = await db.order.findUnique({
        where: { polarOrderId: data.id },
      });
      if (existingOrder) return;

      await db.order.create({
        data: {
          polarOrderId: data.id,
          userId,
          productName: data.product?.name ?? "Unknown",
          amount: data.totalAmount ?? 0,
          currency: data.currency ?? "usd",
          status: "completed",
        },
      });

      console.log("[polar:order.created] success — userId:", userId, "orderId:", data.id);
    } catch (error) {
      console.error("[polar:order.created] error:", error);
      throw error;
    }
  },
});

export async function POST(request: NextRequest) {
  console.log("[polar:webhook] incoming request —", request.method, request.url);
  console.log("[polar:webhook] headers — webhook-id:", request.headers.get("webhook-id"), "webhook-signature:", request.headers.get("webhook-signature")?.slice(0, 20) + "...");

  const response = await webhooksHandler(request);

  console.log("[polar:webhook] response status:", response.status);
  if (response.status !== 200) {
    const body = await response.clone().text();
    console.error("[polar:webhook] failed — status:", response.status, "body:", body);
  }

  return response;
}
