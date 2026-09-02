import "server-only";

import type { Prisma } from "@repo/db";
import { db } from "~/server/db";

type DbClient = Prisma.TransactionClient | typeof db;

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

export async function getDashboardHeaderUser(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      credits: true,
      image: true,
    },
  });
}

export async function getHomeUserProfile(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      image: true,
    },
  });
}

export async function getUserPolarCustomerId(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { polarCustomerId: true },
  });

  return user?.polarCustomerId ?? null;
}

export async function findUserIdByEmail(email: string) {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? null;
}

export async function getBillingUserSnapshot(userId: string) {
  return db.user.findUnique({
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
}

export async function updateUserPolarCustomerId(
  userId: string,
  polarCustomerId: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).user.update({
    where: { id: userId },
    data: { polarCustomerId },
  });
}

export async function incrementUserCredits(
  userId: string,
  amount: number,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).user.update({
    where: { id: userId },
    data: {
      credits: { increment: amount },
    },
  });
}

export async function incrementUserCreditsAndSetPolarCustomerId(
  userId: string,
  amount: number,
  polarCustomerId: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).user.update({
    where: { id: userId },
    data: {
      credits: { increment: amount },
      polarCustomerId,
    },
  });
}

export async function decrementUserCreditsFloorZero(
  userId: string,
  amount: number,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).$executeRaw`
    UPDATE "User"
    SET "credits" = GREATEST("credits" - ${amount}, 0)
    WHERE "id" = ${userId}
  `;
}
