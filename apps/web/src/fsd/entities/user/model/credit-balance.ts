export type CreditBalance = Readonly<{
  owned: number;
  reserved: number;
  available: number;
}>;

export function toCreditBalance(
  credits: number,
  reservedCredits: number,
): CreditBalance {
  if (
    !Number.isSafeInteger(credits) ||
    !Number.isSafeInteger(reservedCredits) ||
    credits < 0 ||
    reservedCredits < 0 ||
    reservedCredits > credits
  ) {
    throw new Error("Invalid stored credit balance");
  }
  return {
    owned: credits,
    reserved: reservedCredits,
    available: credits - reservedCredits,
  };
}

export const creditBalanceKeys = {
  all: ["credit-balance"] as const,
  user: (userId: string) => ["credit-balance", userId] as const,
};
