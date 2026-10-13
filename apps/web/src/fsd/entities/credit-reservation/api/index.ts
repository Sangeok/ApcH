import "server-only";
import type { CreditReservation, Prisma } from "@repo/db";
import { db } from "~/server/db";
import type { ReservationKind } from "../model/reservation-policy";

export async function createCreditReservation(
  input: {
    id?: string;
    userId: string;
    operationKey: string;
    kind: ReservationKind;
    reservedAmount: number;
  },
  tx: Prisma.TransactionClient,
): Promise<CreditReservation> {
  if (
    !Number.isSafeInteger(input.reservedAmount) ||
    input.reservedAmount <= 0 ||
    (input.kind === "card-news" && input.reservedAmount !== 1)
  ) {
    throw new Error("Invalid reservation amount");
  }
  return tx.creditReservation.create({
    data: { ...input, status: "held", chargedAmount: 0 },
  });
}

export async function findCreditReservation(
  id: string,
  tx?: Prisma.TransactionClient,
): Promise<CreditReservation | null> {
  return (tx ?? db).creditReservation.findUnique({ where: { id } });
}

export async function findCreditReservationByOperationKey(
  operationKey: string,
  tx?: Prisma.TransactionClient,
): Promise<CreditReservation | null> {
  return (tx ?? db).creditReservation.findUnique({ where: { operationKey } });
}

export async function lockCreditReservation(
  id: string,
  tx: Prisma.TransactionClient,
): Promise<CreditReservation | null> {
  await tx.$queryRaw`SELECT "id" FROM "CreditReservation" WHERE "id" = ${id} FOR UPDATE`;
  return findCreditReservation(id, tx);
}

export async function settleCreditReservation(
  id: string,
  chargedAmount: number,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  if (!Number.isSafeInteger(chargedAmount) || chargedAmount < 0)
    throw new Error("Invalid reservation charge");
  const count = await tx.$executeRaw`
    UPDATE "CreditReservation" SET "status" = 'settled', "chargedAmount" = ${chargedAmount},
      "settledAt" = NOW(), "updatedAt" = NOW()
    WHERE "id" = ${id} AND "status" = 'held' AND "reservedAmount" >= ${chargedAmount}
      AND ("kind" = 'video' OR ${chargedAmount} = 1)
  `;
  return count === 1;
}

export async function releaseCreditReservation(
  id: string,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  const result = await tx.creditReservation.updateMany({
    where: { id, status: "held" },
    data: { status: "released", chargedAmount: 0, releasedAt: new Date() },
  });
  return result.count === 1;
}

export async function listHeldCreditReservations(
  limit = 100,
): Promise<CreditReservation[]> {
  return db.creditReservation.findMany({
    where: { status: "held" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function sumHeldCreditReservations(
  userId: string,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const result = await (tx ?? db).creditReservation.aggregate({
    where: { userId, status: "held" },
    _sum: { reservedAmount: true },
  });
  return result._sum.reservedAmount ?? 0;
}
