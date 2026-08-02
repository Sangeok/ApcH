export const PLAN_TIERS = {
  free: {
    name: "Free",
    monthlyCredits: 3,
    description: "Basic plan",
    price: "$0",
    yearlyPrice: null,
  },
  pro: {
    name: "Pro",
    monthlyCredits: 30,
    description: "For individual creators",
    price: "$9.99",
    yearlyPrice: "$99.99/yr",
  },
} as const;

export type PlanTier = keyof typeof PLAN_TIERS;
