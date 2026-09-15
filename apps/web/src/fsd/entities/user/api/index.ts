import "server-only";

// Prisma.JsonNull 값을 쓰므로 type-only import가 아니어야 한다.
import { Prisma } from "@repo/db";
import { db } from "~/server/db";
import type { CaptionStyle } from "~/fsd/shared/config/constants";

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
    select: { defaultCaptionStyle: true },
  });
}

export async function updateUserDefaultCaptionStyle(
  userId: string,
  style: CaptionStyle | null,
) {
  return db.user.update({
    where: { id: userId },
    // null = 비우기(언어 기본값). Prisma는 JSON 컬럼에 명시적 null을 JsonNull로 쓴다
    // (updateClipDraftEdit :85와 같은 관용).
    data: { defaultCaptionStyle: style ?? Prisma.JsonNull },
  });
}
