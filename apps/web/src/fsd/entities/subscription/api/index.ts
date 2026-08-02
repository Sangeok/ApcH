import "server-only";

import type { Prisma } from "@repo/db";
import { db } from "~/server/db";

type DbClient = Prisma.TransactionClient | typeof db;

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

export async function findSubscriptionByPolarId(polarSubscriptionId: string) {
  return db.subscription.findUnique({
    where: { polarSubscriptionId },
  });
}

export async function findSubscriptionByUserId(userId: string) {
  return db.subscription.findUnique({
    where: { userId },
  });
}

export async function deleteSubscriptionByUserId(
  userId: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).subscription.delete({
    where: { userId },
  });
}

export async function upsertSubscription(
  data: {
    polarSubscriptionId: string;
    userId: string;
    polarProductId: string;
    planTier: string;
    status: string;
    recurringInterval: string;
    monthlyCredits: number;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: Date | null;
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).subscription.upsert({
    where: { polarSubscriptionId: data.polarSubscriptionId },
    create: {
      polarSubscriptionId: data.polarSubscriptionId,
      userId: data.userId,
      polarProductId: data.polarProductId,
      planTier: data.planTier,
      status: data.status,
      recurringInterval: data.recurringInterval,
      monthlyCredits: data.monthlyCredits,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      canceledAt: data.canceledAt ?? null,
    },
    update: {
      status: data.status,
      planTier: data.planTier,
      polarProductId: data.polarProductId,
      monthlyCredits: data.monthlyCredits,
      recurringInterval: data.recurringInterval,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      canceledAt: data.canceledAt ?? null,
    },
  });
}

export async function updateSubscriptionByPolarId(
  polarSubscriptionId: string,
  data: {
    status?: string;
    planTier?: string;
    polarProductId?: string;
    monthlyCredits?: number;
    recurringInterval?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: Date | null;
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).subscription.update({
    where: { polarSubscriptionId },
    data,
  });
}
