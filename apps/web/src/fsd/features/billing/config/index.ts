import { env } from "~/env";

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

/**
 * 서버에서만 호출한다. `POLAR_SERVER`는 server-only 변수라, 클라이언트에서 부르면
 * `~/env`가 시끄럽게 던진다 — 프로덕션에서 sandbox 상품 id로 조용히 폴백하지 않는다.
 * `shared/api/polar.ts`의 `POLAR_SERVER`를 재사용하지 않는 이유: 그 모듈은
 * `@polar-sh/sdk`를 끌고 오는데 이 파일은 `PlanCard`(client)가 임포트한다.
 */
export function getProductIds(): ProductIds {
  return POLAR_PRODUCT_IDS[env.POLAR_SERVER ?? "sandbox"];
}
