# Proposal: Subscription 차단 (Feature Flag)

> **작성일**: 2026-03-27
> **상태**: Accepted
> **방식**: Feature Flag (`NEXT_PUBLIC_SUBSCRIPTION_ENABLED`)
> **범위**: 신규 구독 차단 (기존 구독자 관리는 유지)

---

## 1. 현재 Subscription 흐름

```
[사용자] → "Buy more" / "Buy Credits" 클릭
       → /dashboard/billing 페이지 이동
       → PlanCard에서 "Subscribe Monthly/Yearly" 클릭
       → getCheckoutUrl() 서버 액션 호출
       → /api/checkout → Polar 결제 페이지 리다이렉트
       → 결제 완료 → Polar Webhook → /api/webhooks/polar
       → DB에 Subscription 생성 + Credits 충전
```

---

## 2. 구현 개요

**환경 변수 1개 추가** → **6개 파일 수정** → 완료.

```
NEXT_PUBLIC_SUBSCRIPTION_ENABLED=false
```

`NEXT_PUBLIC_` 접두사를 사용하여 클라이언트 컴포넌트에서도 직접 참조 가능하게 한다.

---

## 3. 수정 대상 파일 및 변경 내용

### (1) `src/env.js` - 환경 변수 추가

`client` 스키마와 `runtimeEnv` 매핑 **두 곳 모두** 추가해야 한다. `runtimeEnv`에 누락하면 `@t3-oss/env-nextjs` validation 실패로 빌드 에러가 발생한다.

```ts
// client 스키마에 추가
client: {
  // 기존 변수들...
  NEXT_PUBLIC_SUBSCRIPTION_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
},
```

```ts
// runtimeEnv 객체에도 반드시 추가
runtimeEnv: {
  // 기존 매핑들...
  NEXT_PUBLIC_SUBSCRIPTION_ENABLED: process.env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED,
},
```

### (2) `src/app/api/checkout/route.ts` - API 가드

```ts
export async function GET(req: NextRequest) {
  // Feature flag 체크 추가
  if (env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED === false) {
    return NextResponse.json(
      { error: "Subscriptions are currently disabled" },
      { status: 403 }
    );
  }

  const session = await auth();
  // ... 기존 로직
}
```

### (3) `src/fsd/features/billing/ui/BillingPage.tsx` - 플랜 선택 섹션 숨김

`BillingPage`에 prop으로 전달:

```tsx
// billing/page.tsx (서버 컴포넌트)
<BillingPage
  data={result.data}
  productIds={getProductIds()}
  showSuccessBanner={params.success === "true"}
  subscriptionEnabled={env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED}
/>
```

```tsx
// BillingPage.tsx
{subscriptionEnabled && (
  <div>
    <h2>Choose a Plan</h2>
    {/* PlanCards */}
  </div>
)}
```

### (4) `src/fsd/widgets/dashboard-header/ui/index.tsx` - "Buy more" 버튼 숨김

```tsx
<Badge variant="secondary" ...>
  {credits} Credits
</Badge>
{process.env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED === "true" && (
  <Button variant="outline" size="sm" asChild ...>
    <Link href="/dashboard/billing">Buy more</Link>
  </Button>
)}
```

### (5) `src/fsd/pages/dashboard/ui/index.tsx` - "Buy Credits" 버튼 숨김

```tsx
{process.env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED === "true" && (
  <div className="flex justify-end">
    <Link href="/dashboard/billing">
      <Button>Buy Credits</Button>
    </Link>
  </div>
)}
```

### (6) `src/fsd/features/billing/api/index.ts` - 서버 액션 가드

```ts
export async function getCheckoutUrl(productId: string) {
  if (!process.env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED ||
      process.env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED !== "true") {
    return failure("Subscriptions are currently disabled");
  }

  const authResult = await requireAuth();
  // ... 기존 로직
}
```

---

## 4. 유지할 기능 (수정하지 않음)

| 기능 | 파일 | 이유 |
|------|------|------|
| Webhook 핸들러 | `api/webhooks/polar/route.ts` | 기존 구독의 갱신/취소 이벤트 처리 필요 |
| Customer Portal | `api/portal/route.ts` | 기존 구독자가 구독 관리할 수 있어야 함 |
| `cancelSubscription()` | `billing/api/index.ts` | 기존 구독자가 취소할 수 있어야 함 |
| SubscriptionStatus | `billing/ui/SubscriptionStatus.tsx` | 기존 구독 정보 표시 및 관리 |
| DB 스키마 | `prisma/schema.prisma` | 기존 데이터 유지, 마이그레이션 불필요 |
| 크레딧 시스템 | `inngest/functions.ts` | 기존 크레딧으로 영상 처리는 계속 가능 |
| Billing 페이지 | `dashboard/billing/page.tsx` | 기존 구독 상태 확인 용도로 유지 |

---

## 5. 구현 순서

```
1. .env에 NEXT_PUBLIC_SUBSCRIPTION_ENABLED=false 추가
2. src/env.js에 환경 변수 스키마 + runtimeEnv 매핑 추가
3. /api/checkout route.ts에 API 가드 추가
4. billing/api/index.ts의 getCheckoutUrl()에 서버 액션 가드 추가
5. BillingPage.tsx에서 플랜 선택 섹션 조건부 렌더링
6. dashboard-header의 "Buy more" 버튼 조건부 렌더링
7. dashboard/ui의 "Buy Credits" 버튼 조건부 렌더링
8. 빌드 확인: npm run check && npm run build
```

**영향 범위**: UI 변경 + API 가드 (DB 변경 없음, 마이그레이션 불필요)
**롤백 방법**: `NEXT_PUBLIC_SUBSCRIPTION_ENABLED=true`로 변경 후 재배포

---

## 6. 체크리스트

- [ ] `.env` / `.env.example`에 `NEXT_PUBLIC_SUBSCRIPTION_ENABLED=false` 추가
- [ ] `src/env.js` client 스키마 + runtimeEnv 매핑 모두 등록
- [ ] `/api/checkout` API 가드 추가
- [ ] `getCheckoutUrl()` 서버 액션 가드 추가
- [ ] `BillingPage.tsx` 플랜 선택 섹션 조건부 렌더링
- [ ] `dashboard-header` "Buy more" 버튼 조건부 렌더링
- [ ] `dashboard/ui` "Buy Credits" 버튼 조건부 렌더링
- [ ] `npm run check` 통과 확인
- [ ] `npm run build` 통과 확인
- [ ] Vercel 환경 변수에 `NEXT_PUBLIC_SUBSCRIPTION_ENABLED=false` 설정
