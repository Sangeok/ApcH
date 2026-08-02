export { PLAN_TIERS, type PlanTier } from "./plan-tiers";

export type ProductIds =
  (typeof POLAR_PRODUCT_IDS)[keyof typeof POLAR_PRODUCT_IDS];

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
  const server = (process.env.POLAR_SERVER ?? "sandbox") as keyof typeof POLAR_PRODUCT_IDS;
  return POLAR_PRODUCT_IDS[server];
}
