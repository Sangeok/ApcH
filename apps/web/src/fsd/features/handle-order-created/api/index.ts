import { createOrder, findOrderByPolarId } from "~/fsd/entities/order";
import { resolvePolarCustomerUserId } from "~/fsd/entities/user";
import { failure, success } from "~/fsd/shared/api/result";
import type { ActionResult } from "~/fsd/shared/api/result";

interface HandleOrderCreatedInput {
  orderId: string;
  productName: string;
  amount: number;
  currency: string;
  status: string;
  customerEmail?: string;
  metadataUserId?: string;
}

export async function handleOrderCreated(
  input: HandleOrderCreatedInput,
): Promise<ActionResult<{ userId: string; skipped: boolean }>> {
  const userId = await resolvePolarCustomerUserId(input);

  if (!userId) {
    return failure("missing-user");
  }

  const existingOrder = await findOrderByPolarId(input.orderId);
  if (existingOrder) {
    return success({ userId, skipped: true });
  }

  await createOrder({
    polarOrderId: input.orderId,
    userId,
    productName: input.productName,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
  });

  return success({ userId, skipped: false });
}
