import type { PlanTier } from "~/fsd/features/billing/constants";

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
  credits: number;
  subscription: SubscriptionInfo | null;
  orders: OrderInfo[];
};
