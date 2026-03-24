import { Webhooks } from "@polar-sh/nextjs";
import { env } from "~/env";
import { db } from "~/server/db";

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

export const POST = Webhooks({
  webhookSecret: env.POLAR_WEBHOOK_SECRET,

  onSubscriptionCreated: async () => {
    // Subscription created but may not be active yet — no action needed
  },

  onSubscriptionActive: async (payload) => {
    const { data } = payload;
    const userId = await resolveUserId(
      data.metadata?.userId as string | undefined,
      data.customer?.email,
    );
    if (!userId) return;

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
  },

  onSubscriptionUpdated: async (payload) => {
    const { data } = payload;

    const subscription = await db.subscription.findUnique({
      where: { polarSubscriptionId: data.id },
    });
    if (!subscription) return;

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
  },

  onSubscriptionCanceled: async (payload) => {
    const { data } = payload;

    const subscription = await db.subscription.findUnique({
      where: { polarSubscriptionId: data.id },
    });
    if (!subscription) return;

    await db.subscription.update({
      where: { polarSubscriptionId: data.id },
      data: {
        status: "canceled",
        canceledAt: data.canceledAt ? new Date(data.canceledAt) : new Date(),
        cancelAtPeriodEnd: true,
      },
    });
  },

  onOrderCreated: async (payload) => {
    const { data } = payload;
    const userId = await resolveUserId(
      data.metadata?.userId as string | undefined,
      data.customer?.email,
    );
    if (!userId) return;

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
  },
});
