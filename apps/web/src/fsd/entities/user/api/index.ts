import "server-only";

// Prisma.JsonNull 값을 쓰므로 type-only import가 아니어야 한다.
import { Prisma } from "@repo/db";
import { db } from "~/server/db";
import type { CaptionStyleDefaults } from "~/fsd/shared/config/constants";
import { toCreditBalance, type CreditBalance } from "../model/credit-balance";

type DbClient = Prisma.TransactionClient | typeof db;

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

export async function getDashboardHeaderUser(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      credits: true,
      reservedCredits: true,
      image: true,
    },
  });
  return {
    email: user.email,
    image: user.image,
    creditBalance: toCreditBalance(user.credits, user.reservedCredits),
  };
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

/**
 * Polar 웹훅이 사용자를 찾는 단일 규칙: metadata의 userId가 있으면 그것,
 * 없으면 고객 이메일로 조회. 주문과 구독이 서로 다른 사용자로 귀속되지 않도록
 * 두 피처가 이 함수를 공유한다.
 */
export async function resolvePolarCustomerUserId(input: {
  metadataUserId?: string;
  customerEmail?: string;
}): Promise<string | null> {
  if (input.metadataUserId) {
    return input.metadataUserId;
  }

  if (!input.customerEmail) {
    return null;
  }

  return findUserIdByEmail(input.customerEmail);
}

export async function findUserIdByEmail(email: string) {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? null;
}

export async function getBillingUserSnapshot(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      credits: true,
      reservedCredits: true,
      subscription: true,
      orders: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!user) return null;
  return {
    subscription: user.subscription,
    orders: user.orders,
    creditBalance: toCreditBalance(user.credits, user.reservedCredits),
  };
}

export async function getUserCreditBalance(
  userId: string,
  options?: { tx?: Prisma.TransactionClient },
): Promise<CreditBalance> {
  const user = await getClient(options?.tx).user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true, reservedCredits: true },
  });
  return toCreditBalance(user.credits, user.reservedCredits);
}

export async function lockUserForCredits(
  userId: string,
  tx: Prisma.TransactionClient,
): Promise<{ id: string; credits: number; reservedCredits: number } | null> {
  const rows = await tx.$queryRaw<
    Array<{ id: string; credits: number; reservedCredits: number }>
  >`
    SELECT "id", "credits", "reservedCredits" FROM "User" WHERE "id" = ${userId} FOR UPDATE
  `;
  return rows[0] ?? null;
}

function validateCreditAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error("Invalid credit amount");
}

export async function reserveUserCredits(
  userId: string,
  amount: number,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  validateCreditAmount(amount);
  if (amount === 0)
    throw new Error("A reservation must hold a positive amount");
  const count = await tx.$executeRaw`
    UPDATE "User" SET "reservedCredits" = "reservedCredits" + ${amount}
    WHERE "id" = ${userId} AND "credits" - "reservedCredits" >= ${amount}
  `;
  return count === 1;
}

export async function settleUserCredits(
  userId: string,
  reservedAmount: number,
  chargedAmount: number,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  validateCreditAmount(reservedAmount);
  validateCreditAmount(chargedAmount);
  if (reservedAmount === 0 || chargedAmount > reservedAmount)
    throw new Error("Invalid reservation settlement");
  const count = await tx.$executeRaw`
    UPDATE "User" SET "credits" = "credits" - ${chargedAmount},
      "reservedCredits" = "reservedCredits" - ${reservedAmount}
    WHERE "id" = ${userId} AND "reservedCredits" >= ${reservedAmount}
      AND "credits" >= ${chargedAmount}
  `;
  return count === 1;
}

export async function releaseUserReservedCredits(
  userId: string,
  amount: number,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  validateCreditAmount(amount);
  if (amount === 0)
    throw new Error("A reservation must release a positive amount");
  const count = await tx.$executeRaw`
    UPDATE "User" SET "reservedCredits" = "reservedCredits" - ${amount}
    WHERE "id" = ${userId} AND "reservedCredits" >= ${amount}
  `;
  return count === 1;
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

export async function getUserUploadDefaults(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      defaultLanguage: true,
      defaultClipCount: true,
      defaultReviewBeforeGenerate: true,
    },
  });
}

export async function updateUserUploadDefaults(
  userId: string,
  values: {
    defaultLanguage: string | null;
    defaultClipCount: number | null;
    defaultReviewBeforeGenerate: boolean | null;
  },
) {
  return db.user.update({
    where: { id: userId },
    data: {
      defaultLanguage: values.defaultLanguage,
      defaultClipCount: values.defaultClipCount,
      defaultReviewBeforeGenerate: values.defaultReviewBeforeGenerate,
    },
  });
}

export async function getUserDefaultCaptionStyle(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      defaultCaptionStyleEnglish: true,
      defaultCaptionStyleKorean: true,
    },
  });
}

export async function getUserDefaultVideoPaddingPercent(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { defaultVideoPaddingPercent: true },
  });
}

export async function updateUserVideoStyle(
  userId: string,
  input: { paddingPercent: number } & CaptionStyleDefaults,
) {
  // 세 컬럼을 한 update로 쓴다 — 반쪽 저장이 생기지 않게(BUG-18).
  // null = 비우기(언어 기본값): Prisma는 JSON 컬럼에 명시적 null을 JsonNull로 쓴다.
  return db.user.update({
    where: { id: userId },
    data: {
      defaultVideoPaddingPercent: input.paddingPercent,
      defaultCaptionStyleEnglish: input.english ?? Prisma.JsonNull,
      defaultCaptionStyleKorean: input.korean ?? Prisma.JsonNull,
    },
  });
}
