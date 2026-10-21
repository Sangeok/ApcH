import type { PlanTier } from "../config";
import type { CreditBalance } from "~/fsd/entities/user";

export type SubscriptionInfo = {
  id: string;
  planTier: PlanTier;
  status: string;
  recurringInterval: string;
  monthlyCredits: number;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
};

export type OrderInfo = {
  id: string;
  productName: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: Date;
};

export type BillingPageData = {
  authUserId: string;
  creditBalance: CreditBalance;
  subscription: SubscriptionInfo | null;
  orders: OrderInfo[];
};
