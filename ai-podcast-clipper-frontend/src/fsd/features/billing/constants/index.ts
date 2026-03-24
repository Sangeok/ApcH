import { env } from "~/env";

export const PLAN_TIERS = {
  free: {
    name: "Free",
    monthlyCredits: 3,
    description: "Basic plan",
  },
  pro: {
    name: "Pro",
    monthlyCredits: 30,
    description: "For individual creators",
  },
} as const;

export type PlanTier = keyof typeof PLAN_TIERS;
export type ProductIds = (typeof POLAR_PRODUCT_IDS)[keyof typeof POLAR_PRODUCT_IDS];

// Polar Dashboard에서 Product 생성 후 실제 ID로 교체
// Sandbox와 Production의 Product ID는 서로 다름
export const POLAR_PRODUCT_IDS = {
  sandbox: {
    pro_monthly: "3ffacc5c-7899-49c1-b3ec-a3f557403e32",
    pro_yearly: "1055fdd5-3edc-4001-956f-d16852b23fa0",
  },
  production: {
    pro_monthly: "prod_XXXXXXXXXX",
    pro_yearly: "prod_XXXXXXXXXX",
  },
} as const;

export function getProductIds() {
  const server =
    env.POLAR_SERVER ??
    (env.NODE_ENV === "production" ? "production" : "sandbox");
  return POLAR_PRODUCT_IDS[server];
}
