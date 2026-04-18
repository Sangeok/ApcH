import { createOrder, findOrderByPolarId } from "~/fsd/entities/order";
import { findUserIdByEmail } from "~/fsd/entities/user";

interface HandleOrderCreatedInput {
  orderId: string;
  productName: string;
  amount: number;
  currency: string;
  status: string;
  customerEmail?: string;
  metadataUserId?: string;
}

async function resolveUserId(input: HandleOrderCreatedInput) {
  if (input.metadataUserId) {
    return input.metadataUserId;
  }

  if (!input.customerEmail) {
    return null;
  }

  return findUserIdByEmail(input.customerEmail);
}

export async function handleOrderCreated(input: HandleOrderCreatedInput) {
  const userId = await resolveUserId(input);

  if (!userId) {
    return { ok: false as const, reason: "missing-user" };
  }

  const existingOrder = await findOrderByPolarId(input.orderId);
  if (existingOrder) {
    return { ok: true as const, userId, skipped: true as const };
  }

  await createOrder({
    polarOrderId: input.orderId,
    userId,
    productName: input.productName,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
  });

  return { ok: true as const, userId, skipped: false as const };
}
