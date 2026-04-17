import "server-only";

import type { Prisma } from "generated/prisma";
import { db } from "~/server/db";

type DbClient = Prisma.TransactionClient | typeof db;

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

export async function findOrderByPolarId(polarOrderId: string) {
  return db.order.findUnique({
    where: { polarOrderId },
  });
}

export async function createOrder(
  data: {
    polarOrderId: string;
    userId: string;
    productName: string;
    amount: number;
    currency: string;
    status: string;
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).order.create({
    data,
  });
}
