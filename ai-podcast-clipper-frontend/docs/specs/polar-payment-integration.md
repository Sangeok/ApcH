# Polar 구독 결제 시스템 구현 스펙

> 작성일: 2026-03-24
> 프로젝트: AI Podcast Clipper Frontend (Next.js 15 / T3 Stack)
> 과금 모델: 구독 전용 (월간/연간)

---

## 1. 개요

### 1.1 목적

현재 프로젝트는 결제 시스템이 없으며, 사용자 가입 시 기본 3 크레딧만 제공된다. Polar(polar.sh)를 결제 플랫폼으로 도입하여 구독 기반 과금 시스템을 구현한다.

### 1.2 현재 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| `stripe` 패키지 | 설치됨 (미사용) | `package.json`에만 존재, 코드 내 import 0건 |
| `stripeCustomerId` DB 필드 | 존재 (미사용) | `prisma/schema.prisma` User 모델 |
| 크레딧 시스템 | 기본 구현 | 가입 시 3 크레딧, Inngest에서 차감 |
| `/dashboard/billing` | 링크만 존재 | 실제 페이지 미구현 |
| 결제/구독 로직 | 없음 | - |

### 1.3 구현 목표

- Polar 구독 결제 시스템 통합
- 구독 티어별 매월 크레딧 자동 충전
- Billing 페이지 구현 (플랜 선택, 구독 관리, 결제 이력)
- Webhook 기반 결제 이벤트 처리

### 1.4 예상 공수

3-5일 (1인 기준)

---

## 2. 패키지 변경

### 2.1 제거

```bash
npm uninstall stripe
```

### 2.2 설치

```bash
npm install @polar-sh/sdk @polar-sh/nextjs
```

| 패키지 | 용도 |
|--------|------|
| `@polar-sh/sdk` | Polar API 클라이언트 (체크아웃 생성, 구독 조회 등) |
| `@polar-sh/nextjs` | Next.js App Router 전용 어댑터 (Checkout, Webhooks, CustomerPortal 라우트 핸들러) |

---

## 3. 환경 변수

### 3.1 추가할 환경 변수

| 변수명 | 용도 | 필수 | Sandbox / Production 구분 |
|--------|------|------|---------------------------|
| `POLAR_ACCESS_TOKEN` | Polar API 인증 토큰 (Organization Access Token) | Y | 환경별 별도 토큰 발급 필요 |
| `POLAR_WEBHOOK_SECRET` | 웹훅 서명 검증 시크릿 | Y | 환경별 별도 시크릿 발급 필요 |
| `POLAR_SERVER` | Polar 환경 지정 (`sandbox` / `production`) | N | 기본값: `NODE_ENV` 기반 자동 결정 |

> **Sandbox와 Production은 완전히 분리된 환경이다.** Access Token, Webhook Secret, Organization, Product 등 모든 데이터가 별도로 존재한다. Production 토큰은 Sandbox에서 사용할 수 없으며, 그 반대도 마찬가지다.

### 3.2 `src/env.js` 수정

`server` 섹션에 추가:

```javascript
server: {
  // ... 기존 변수들 ...
  POLAR_ACCESS_TOKEN: z.string(),
  POLAR_WEBHOOK_SECRET: z.string(),
  POLAR_SERVER: z.enum(["sandbox", "production"]).optional(),
},
```

`runtimeEnv` 섹션에 추가:

```javascript
runtimeEnv: {
  // ... 기존 매핑들 ...
  POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
  POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
  POLAR_SERVER: process.env.POLAR_SERVER,
},
```

### 3.3 `.env.example` 신규 생성

```dotenv
# Polar Payment
# Sandbox: sandbox.polar.sh에서 발급 | Production: polar.sh에서 발급
POLAR_ACCESS_TOKEN="polar_pat_..."
POLAR_WEBHOOK_SECRET="whsec_..."
# "sandbox" 또는 "production" (미설정 시 NODE_ENV 기반 자동 결정)
POLAR_SERVER="sandbox"
```

### 3.4 환경별 `.env.local` 예시

**개발 환경 (Sandbox)**:
```dotenv
# sandbox.polar.sh 대시보드에서 발급한 값
POLAR_ACCESS_TOKEN="polar_pat_sandbox_XXXXXXXXXX"
POLAR_WEBHOOK_SECRET="whsec_sandbox_XXXXXXXXXX"
POLAR_SERVER="sandbox"
```

**프로덕션 환경**:
```dotenv
# polar.sh 대시보드에서 발급한 값
POLAR_ACCESS_TOKEN="polar_pat_XXXXXXXXXX"
POLAR_WEBHOOK_SECRET="whsec_XXXXXXXXXX"
POLAR_SERVER="production"
```

---

## 4. 데이터베이스 스키마 변경

### 4.1 파일: `prisma/schema.prisma`

#### 4.1.1 User 모델 변경

```prisma
model User {
    id               String    @id @default(cuid())
    name             String?
    email            String    @unique
    emailVerified    DateTime?
    password         String?
    credits          Int       @default(3)
    polarCustomerId  String?   @unique          // stripeCustomerId에서 변경
    image            String?
    accounts         Account[]
    sessions         Session[]
    uploadedFiles    UploadedFile[]
    clips            Clip[]
    subscription     Subscription?              // 1:1 관계 추가
    orders           Order[]                    // 1:N 관계 추가
}
```

변경사항:
- `stripeCustomerId` → `polarCustomerId` 리네임
- `subscription` 관계 추가 (1:1)
- `orders` 관계 추가 (1:N)

#### 4.1.2 Subscription 모델 추가

```prisma
model Subscription {
    id                    String    @id @default(cuid())
    polarSubscriptionId   String    @unique
    userId                String    @unique
    polarProductId        String
    planTier              String                  // "free" | "pro"
    status                String    @default("active")  // "active" | "canceled" | "past_due" | "trialing"
    recurringInterval     String    @default("month")   // "month" | "year"
    monthlyCredits        Int                     // 해당 플랜의 월 크레딧 수량
    currentPeriodStart    DateTime
    currentPeriodEnd      DateTime
    cancelAtPeriodEnd     Boolean   @default(false)
    canceledAt            DateTime?
    createdAt             DateTime  @default(now())
    updatedAt             DateTime  @updatedAt

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

#### 4.1.3 Order 모델 추가

```prisma
model Order {
    id              String   @id @default(cuid())
    polarOrderId    String   @unique
    userId          String
    productName     String
    amount          Int                          // 결제 금액 (센트 단위)
    currency        String   @default("usd")
    status          String   @default("completed")
    createdAt       DateTime @default(now())

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([userId])
}
```

### 4.2 마이그레이션

```bash
npx prisma migrate dev --name rename-stripe-to-polar-add-subscription-order
```

> `stripeCustomerId`는 현재 코드에서 사용되지 않으며 실제 데이터도 없으므로, 리네임 시 데이터 손실 위험 없음.

---

## 5. Polar 클라이언트 싱글톤

### 5.1 파일: `src/fsd/shared/api/polar.ts` (신규 생성)

기존 S3 클라이언트(`src/fsd/shared/api/s3.ts`)의 싱글톤 패턴을 따른다.

```typescript
import { Polar } from "@polar-sh/sdk";
import { env } from "~/env";

let polarInstance: Polar | null = null;

/**
 * Polar 환경을 결정한다.
 * 1. POLAR_SERVER 환경 변수가 명시적으로 설정되어 있으면 사용
 * 2. 그 외에는 NODE_ENV 기반 자동 결정 (production → "production", 나머지 → "sandbox")
 */
function getPolarServer(): "sandbox" | "production" {
  if (env.POLAR_SERVER) return env.POLAR_SERVER;
  return env.NODE_ENV === "production" ? "production" : "sandbox";
}

export function getPolarClient(): Polar {
  polarInstance ??= new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: getPolarServer(),
  });
  return polarInstance;
}
```

---

## 6. 구독 플랜 설계

### 6.1 플랜 티어 (예시 - 추후 변경 가능)

| 티어 | 월간 가격 | 연간 가격 | 월 크레딧 | 비고 |
|------|-----------|-----------|-----------|------|
| Free | $0 | - | 3 | 가입 시 기본 제공 (구독 불필요) |
| Pro | $9.99/월 | $99.99/년 | 30 | 개인 사용자 |

> 가격과 크레딧 수량은 예시이며, Polar 대시보드에서 Product 생성 시 확정한다.

### 6.2 Polar Product 설정

Polar 대시보드에서 각 플랜을 **Recurring Product**로 생성한다.

- **Product Name**: `Pro Monthly`, `Pro Yearly`
- **Price**: 각 티어/기간별 가격 설정
- **Recurring Interval**: `month` 또는 `year`
- **Metadata**:
  ```json
  {
    "tier": "pro",
    "monthlyCredits": "30"
  }
  ```

### 6.3 상수 파일: `src/fsd/features/billing/constants/index.ts`

```typescript
import { env } from "~/env";

export const PLAN_TIERS = {
  free: {
    name: "Free",
    monthlyCredits: 3,
    description: "기본 플랜",
  },
  pro: {
    name: "Pro",
    monthlyCredits: 30,
    description: "개인 사용자를 위한 플랜",
  },
} as const;

export type PlanTier = keyof typeof PLAN_TIERS;

// Polar 대시보드에서 Product 생성 후 실제 ID로 교체
// Sandbox와 Production의 Product ID는 서로 다름에 주의
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

// 현재 환경에 맞는 Product ID를 반환
// env 객체를 통해 접근하여 Zod 검증을 활용한다 (process.env 직접 접근 금지)
export function getProductIds() {
  const server = env.POLAR_SERVER ??
    (env.NODE_ENV === "production" ? "production" : "sandbox");
  return POLAR_PRODUCT_IDS[server];
}
```

---

## 7. Sandbox 환경 설정 가이드

Polar Sandbox는 Production과 완전히 분리된 테스트 환경이다. 실제 결제가 발생하지 않으며, 모든 데이터(계정, 조직, Product, 구독, 웹훅 등)가 독립적으로 관리된다.

### 7.1 Sandbox vs Production 비교

| 항목 | Sandbox | Production |
|------|---------|------------|
| **대시보드 URL** | `https://sandbox.polar.sh` | `https://polar.sh` |
| **API Base URL** | `https://sandbox-api.polar.sh` | `https://api.polar.sh` |
| **SDK `server` 파라미터** | `"sandbox"` | `"production"` |
| **실제 결제** | 없음 (Stripe 테스트 모드) | 실제 결제 |
| **구독 자동 취소** | 생성 후 90일 뒤 자동 취소 | 없음 |
| **계정/토큰** | Sandbox 전용 (Production과 호환 불가) | Production 전용 |

### 7.2 Sandbox 계정 및 조직 생성

1. **Sandbox 대시보드 접속**: [https://sandbox.polar.sh/start](https://sandbox.polar.sh/start)
2. **새 계정 생성**: Production 계정과 별개로 Sandbox 전용 계정을 생성한다
3. **조직(Organization) 생성**: Quick Start 흐름을 따라 Sandbox 조직을 생성한다
4. **Access Token 발급**:
   - `https://sandbox.polar.sh/dashboard/<org-slug>/settings` > Developers 탭
   - "New Token" 클릭하여 Organization Access Token 발급
   - 이 토큰을 `.env.local`의 `POLAR_ACCESS_TOKEN`에 설정

> Production의 계정/토큰/조직은 Sandbox에서 사용할 수 없다. 반드시 Sandbox 대시보드에서 별도로 생성해야 한다.

### 7.3 Sandbox 테스트 Product 생성

Sandbox 대시보드에서 구독 상품을 생성한다:

1. `https://sandbox.polar.sh` > Products > Catalogue > "+ New Product"
2. 아래와 같이 2개의 Recurring Product를 생성:

| Product Name | Price | Recurring Interval | Metadata |
|--------------|-------|--------------------|----------|
| Pro Monthly | $9.99 | Month | `{"tier": "pro", "monthlyCredits": "30"}` |
| Pro Yearly | $99.99 | Year | `{"tier": "pro", "monthlyCredits": "30"}` |

3. 각 Product의 ID를 복사하여 `POLAR_PRODUCT_IDS.sandbox`에 설정

### 7.4 Sandbox 웹훅 설정

#### 방법 A: Polar CLI `polar listen` (권장)

Polar CLI가 자동으로 터널을 생성하여 Sandbox 웹훅 이벤트를 로컬 서버로 포워딩한다.

```bash
# Polar CLI 설치
curl -fsSL https://polar.sh/install.sh | bash

# 로컬 웹훅 포워딩 시작
polar listen http://localhost:3000/api/webhooks/polar
```

CLI 실행 시 출력:
```
Organization: your-org-name
Webhook Secret: whsec_XXXXXXXXXX    ← 이 값을 .env.local의 POLAR_WEBHOOK_SECRET에 설정
Forwarding to: http://localhost:3000/api/webhooks/polar
Waiting for events...
```

> `polar listen`이 자동 생성하는 Webhook Secret을 `.env.local`에 설정해야 한다.

#### 방법 B: ngrok + 대시보드 수동 등록

```bash
# ngrok 실행
ngrok http 3000
# 출력 예: https://abc123.ngrok-free.app
```

Sandbox 대시보드에서 웹훅 엔드포인트 수동 등록:
1. `https://sandbox.polar.sh/dashboard/<org>/settings` > Webhooks
2. "Add Endpoint" 클릭
3. URL: `https://abc123.ngrok-free.app/api/webhooks/polar`
4. Events 선택: `order.created`, `subscription.created`, `subscription.active`, `subscription.updated`, `subscription.canceled`
5. Webhook Secret을 복사하여 `.env.local`에 설정

### 7.5 테스트 카드 번호

Polar Sandbox는 내부적으로 Stripe 테스트 모드를 사용한다. 체크아웃 시 아래 테스트 카드를 사용한다.

| 카드 번호 | 시나리오 | 비고 |
|-----------|----------|------|
| `4242 4242 4242 4242` | 결제 성공 (Visa) | 가장 일반적인 테스트 카드 |
| `5555 5555 5555 4444` | 결제 성공 (Mastercard) | - |
| `4000 0000 0000 9995` | 결제 실패 (잔액 부족) | 실패 시나리오 테스트 |
| `4000 0000 0000 0002` | 결제 실패 (일반 거부) | 실패 시나리오 테스트 |
| `4000 0000 0000 3220` | 3D Secure 인증 필요 | 추가 인증 플로우 테스트 |

> 만료일: 미래의 아무 날짜, CVC: 아무 3자리 숫자

### 7.6 Sandbox 제한사항

- **구독 90일 자동 취소**: Sandbox에서 생성된 구독은 90일 후 자동으로 취소된다. Production에서는 해당 없음.
- **공유 환경**: Sandbox는 모든 사용자가 공유하는 환경이지만, 조직 단위로 데이터가 격리된다.
- **결제 수단**: Apple Pay / Google Pay는 Sandbox Embedded Checkout에서 기본 비활성화. 도메인 검증 필요.
- **웹훅 재시도**: Sandbox 웹훅도 Production과 동일하게 10초 타임아웃, 최대 10회 재시도 (지수 백오프). 10회 연속 실패 시 자동 비활성화.

---

## 8. Checkout 플로우

### 8.1 흐름도

```
사용자 → Billing 페이지에서 플랜 선택
       → "구독하기" 버튼 클릭
       → Server Action: createCheckoutSession() 호출
       → Polar Checkout URL로 리다이렉트
       → Polar 결제 페이지에서 결제 완료
       → successUrl로 리다이렉트 (/dashboard/billing?success=true)
       → Webhook으로 subscription.active 이벤트 수신
       → DB에 Subscription 생성 + 크레딧 충전
```

### 8.2 Checkout 라우트 핸들러

#### 파일: `src/app/api/checkout/route.ts` (신규 생성)

`@polar-sh/nextjs`의 `Checkout()` 팩토리를 사용한다. `env` 객체를 통해 환경 변수에 접근하여 `@t3-oss/env-nextjs`의 Zod 검증을 유지한다 (`process.env` 직접 접근 금지).

```typescript
import { Checkout } from "@polar-sh/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env";
import { auth } from "~/server/auth";

// Checkout 팩토리로 base handler 생성
const checkoutHandler = Checkout({
  accessToken: env.POLAR_ACCESS_TOKEN,
  successUrl: `${env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard/billing?success=true&checkout_id={CHECKOUT_ID}`,
  server: env.POLAR_SERVER ?? (env.NODE_ENV === "production" ? "production" : "sandbox"),
});

// 서버 세션 검증 래퍼: metadata[userId] 조작 방지
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // URL의 metadata[userId]를 서버 세션의 userId로 강제 교체
  const url = new URL(req.url);
  url.searchParams.set("metadata[userId]", session.user.id);

  // customerEmail도 세션에서 강제 설정 (조작 방지)
  if (session.user.email) {
    url.searchParams.set("customerEmail", session.user.email);
  }

  const securedReq = new NextRequest(url, req);
  return checkoutHandler(securedReq);
}
```

> **보안**: `metadata[userId]`는 URL 파라미터로 전달되므로 클라이언트에서 조작 가능하다. 위 래퍼가 서버 세션에서 추출한 `userId`로 **강제 교체**하여 조작을 방지한다.

> **Sandbox 테스트 시**: `NEXT_PUBLIC_SITE_URL`이 설정되지 않았으면 `http://localhost:3000`으로 fallback하여 로컬 개발 서버로 리다이렉트된다.

**사용 방법**: Billing 페이지에서 아래 URL로 리다이렉트한다.

```
/api/checkout?products=PRODUCT_ID
```

- `products`: Polar Product ID (구독 상품)
- `customerEmail`, `metadata[userId]`는 라우트 핸들러 내에서 서버 세션으로부터 자동 설정된다 (클라이언트가 전달할 필요 없음)

### 8.3 Server Action을 통한 Checkout (대안 — 참고용)

> 아래는 Checkout 라우트 핸들러 대신 Server Action으로 직접 Polar API를 호출하는 **대안 방식**이다. 기본 구현에서는 Section 10.3의 `getCheckoutUrl()` 방식을 사용하며, 아래 코드는 커스텀 로직이 필요할 때만 참고한다. 기본 구현 시 이 코드는 작성하지 않는다.

#### 참고 코드 (기본 구현에 포함하지 않음)

```typescript
"use server";

import { redirect } from "next/navigation";
import { getPolarClient } from "~/fsd/shared/api/polar";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { env } from "~/env";

export async function createCheckoutSession(
  productId: string,
): Promise<never> {
  const authResult = await requireAuth();
  if (!authResult.success) throw new Error(authResult.error);

  const { userId, session } = authResult.data;
  const polar = getPolarClient();

  const checkout = await polar.checkouts.create({
    products: [productId],
    successUrl: `${env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard/billing?success=true&checkout_id={CHECKOUT_ID}`,
    customerEmail: session.user?.email ?? undefined,
    metadata: {
      userId,
    },
  });

  redirect(checkout.url);
}
```

> **참고**: `redirect()`는 내부적으로 에러를 throw하여 실행을 중단하므로, 반환 타입은 `never`이다.

### 8.4 권장 접근 방식

**`Checkout()` 라우트 핸들러를 기본으로 사용**하되, 추후 커스텀 로직이 필요하면 Server Action 방식으로 전환한다. 라우트 핸들러 방식이 구현이 간단하고 `@polar-sh/nextjs`의 의도된 사용법이다. 단, `metadata[userId]` 조작 방지를 위해 반드시 세션 검증 래퍼를 포함해야 한다.

---

## 9. Webhook 핸들러

### 9.1 파일: `src/app/api/webhooks/polar/route.ts` (신규 생성)

`@polar-sh/nextjs`의 `Webhooks()` 팩토리를 사용한다. 서명 검증은 내부적으로 처리된다.

```typescript
import { Webhooks } from "@polar-sh/nextjs";
import { env } from "~/env";
import { db } from "~/server/db";

export const POST = Webhooks({
  webhookSecret: env.POLAR_WEBHOOK_SECRET,

  onSubscriptionCreated: async (payload) => {
    // 구독 생성 시 처리 (아직 active가 아닐 수 있음)
    // 필요 시 pending 상태로 기록
  },

  onSubscriptionActive: async (payload) => {
    const { data } = payload;
    const userId = data.metadata?.userId as string | undefined;
    if (!userId) return;

    const tier = data.product?.metadata?.tier as string | undefined;
    const monthlyCredits = Number(data.product?.metadata?.monthlyCredits) || 0;

    // 1. 기존 구독 확인 (멱등성 + userId @unique 충돌 방지)
    const existingByPolarId = await db.subscription.findUnique({
      where: { polarSubscriptionId: data.id },
    });
    const existingByUser = await db.subscription.findUnique({
      where: { userId },
    });

    // 이미 동일 polarSubscriptionId로 처리된 이벤트면 크레딧 충전 스킵 (멱등성)
    const isNewSubscription = !existingByPolarId;

    // 2. 기존 구독이 다른 polarSubscriptionId로 존재하면 삭제 (플랜 전환 시)
    if (existingByUser && existingByUser.polarSubscriptionId !== data.id) {
      await db.subscription.delete({
        where: { userId },
      });
    }

    // 3. Subscription 생성 또는 업데이트
    await db.subscription.upsert({
      where: { polarSubscriptionId: data.id },
      create: {
        polarSubscriptionId: data.id,
        userId,
        polarProductId: data.productId,
        planTier: tier ?? "pro",
        status: "active",
        recurringInterval: data.recurringInterval ?? "month",
        monthlyCredits,
        currentPeriodStart: new Date(data.currentPeriodStart),
        currentPeriodEnd: new Date(data.currentPeriodEnd),
      },
      update: {
        status: "active",
        planTier: tier ?? "pro",
        monthlyCredits,
        currentPeriodStart: new Date(data.currentPeriodStart),
        currentPeriodEnd: new Date(data.currentPeriodEnd),
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });

    // 4. 크레딧 충전 (신규 구독일 때만 — 중복 이벤트 시 스킵)
    if (isNewSubscription) {
      await db.user.update({
        where: { id: userId },
        data: {
          credits: { increment: monthlyCredits },
          polarCustomerId: data.customerId,
        },
      });
    } else {
      // 중복 이벤트더라도 polarCustomerId는 항상 갱신
      await db.user.update({
        where: { id: userId },
        data: { polarCustomerId: data.customerId },
      });
    }
  },

  onSubscriptionUpdated: async (payload) => {
    const { data } = payload;

    const subscription = await db.subscription.findUnique({
      where: { polarSubscriptionId: data.id },
    });
    if (!subscription) return;

    const tier = data.product?.metadata?.tier as string | undefined;
    const monthlyCredits = Number(data.product?.metadata?.monthlyCredits) || 0;

    // 플랜 변경 반영
    await db.subscription.update({
      where: { polarSubscriptionId: data.id },
      data: {
        status: data.status,
        planTier: tier ?? subscription.planTier,
        polarProductId: data.productId,
        monthlyCredits,
        recurringInterval: data.recurringInterval ?? subscription.recurringInterval,
        currentPeriodStart: new Date(data.currentPeriodStart),
        currentPeriodEnd: new Date(data.currentPeriodEnd),
        cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
        canceledAt: data.canceledAt ? new Date(data.canceledAt) : null,
      },
    });
  },

  onSubscriptionCanceled: async (payload) => {
    const { data } = payload;

    await db.subscription.update({
      where: { polarSubscriptionId: data.id },
      data: {
        status: "canceled",
        canceledAt: data.canceledAt ? new Date(data.canceledAt) : new Date(),
        cancelAtPeriodEnd: true,
      },
    });

    // 참고: 구독 취소 시 즉시 크레딧을 회수하지 않음.
    // currentPeriodEnd까지 기존 크레딧 사용 가능.
  },

  onOrderCreated: async (payload) => {
    const { data } = payload;
    const userId = data.metadata?.userId as string | undefined;
    if (!userId) return;

    // 멱등성: 이미 처리된 주문인지 확인
    const existingOrder = await db.order.findUnique({
      where: { polarOrderId: data.id },
    });
    if (existingOrder) return;

    // 결제 이력 기록
    await db.order.create({
      data: {
        polarOrderId: data.id,
        userId,
        productName: data.product?.name ?? "Unknown",
        amount: data.amount ?? 0,
        currency: data.currency ?? "usd",
        status: "completed",
      },
    });
  },
});
```

### 9.2 처리할 웹훅 이벤트

| 이벤트 | 처리 내용 |
|--------|-----------|
| `subscription.active` | Subscription 생성/업데이트 + 크레딧 충전 |
| `subscription.updated` | 플랜 변경, 기간 갱신, 취소 예약 반영 |
| `subscription.canceled` | 구독 취소 상태 기록 |
| `order.created` | Order 이력 기록 (멱등성 보장) |

### 9.3 구독 갱신 시 크레딧 충전

Polar는 구독이 갱신될 때 `subscription.active` 또는 `subscription.updated` 이벤트를 발생시키며, `currentPeriodStart`/`currentPeriodEnd`가 갱신된다. 웹훅 핸들러에서 기간 변경을 감지하여 크레딧을 충전한다.

`onSubscriptionUpdated`에서 기간 갱신 감지 로직:

```typescript
// 기간이 갱신된 경우에만 크레딧 충전
const periodChanged =
  subscription.currentPeriodEnd.getTime() !==
  new Date(data.currentPeriodEnd).getTime();

if (periodChanged && data.status === "active") {
  await db.user.update({
    where: { id: subscription.userId },
    data: {
      credits: { increment: monthlyCredits },
    },
  });
}
```

### 9.4 멱등성 전략

- `Order`: `polarOrderId`의 unique 제약으로 중복 생성 방지
- `Subscription`: `polarSubscriptionId`의 unique 제약 + `upsert` 사용
- **`subscription.active` 크레딧 충전**: 기존 Subscription 존재 여부(`findUnique`)로 신규/중복 판단. 신규일 때만 `increment` 실행
- **`subscription.updated` 크레딧 충전**: `currentPeriodEnd` 변경 여부로 중복 충전 방지
- **플랜 전환**: 동일 userId에 다른 `polarSubscriptionId`가 존재하면 기존 구독을 삭제 후 새 구독 생성 (`userId @unique` 제약 충돌 방지)

### 9.5 Polar 대시보드 웹훅 설정

**Production** 배포 시 Polar 대시보드에서 웹훅 엔드포인트를 등록한다:
- **URL**: `https://yourdomain.com/api/webhooks/polar`
- **Events**: `order.created`, `subscription.created`, `subscription.active`, `subscription.updated`, `subscription.canceled`

**Sandbox (로컬 개발)** 환경에서의 웹훅 설정은 [7.4 Sandbox 웹훅 설정](#74-sandbox-웹훅-설정)을 참조한다.

---

## 10. Server Actions (FSD billing 피처 슬라이스)

### 10.1 디렉토리 구조

```
src/fsd/features/billing/
  api/
    index.ts              # Server Actions
  constants/
    index.ts              # 플랜 상수, Product ID
  model/
    types.ts              # TypeScript 타입 정의
  ui/
    PlanCard.tsx           # 개별 플랜 카드 컴포넌트
    SubscriptionStatus.tsx # 현재 구독 상태 표시
    OrderHistory.tsx       # 결제 이력 테이블
    BillingPage.tsx        # 빌링 페이지 클라이언트 컴포넌트
```

### 10.2 타입 정의: `src/fsd/features/billing/model/types.ts`

```typescript
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
```

### 10.3 Server Actions: `src/fsd/features/billing/api/index.ts`

```typescript
"use server";

import { db } from "~/server/db";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { success, failure } from "~/fsd/shared/api/result";
import type { ActionResult } from "~/fsd/shared/api/result";
import type { BillingPageData } from "~/fsd/features/billing/model/types";

/**
 * Billing 페이지에 필요한 데이터를 조회한다.
 */
export async function getBillingData(): Promise<ActionResult<BillingPageData>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const { userId } = authResult.data;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      credits: true,
      subscription: true,
      orders: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!user) return failure("User not found");

  return success({
    credits: user.credits,
    subscription: user.subscription
      ? {
          id: user.subscription.id,
          planTier: user.subscription.planTier as any,
          status: user.subscription.status,
          recurringInterval: user.subscription.recurringInterval,
          monthlyCredits: user.subscription.monthlyCredits,
          currentPeriodEnd: user.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
        }
      : null,
    orders: user.orders.map((order) => ({
      id: order.id,
      productName: order.productName,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      createdAt: order.createdAt,
    })),
  });
}

/**
 * Checkout URL을 생성한다.
 * 사용자를 Polar Checkout 페이지로 리다이렉트하기 위한 URL을 반환한다.
 *
 * 참고: customerEmail과 metadata[userId]는 /api/checkout 라우트 핸들러에서
 * 서버 세션으로부터 자동 설정되므로 여기서는 products만 전달한다.
 */
export async function getCheckoutUrl(
  productId: string,
): Promise<ActionResult<{ url: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  // /api/checkout 라우트 핸들러를 통해 Checkout으로 리다이렉트
  // userId, email은 라우트 핸들러에서 서버 세션으로부터 강제 설정 (조작 방지)
  const params = new URLSearchParams({
    products: productId,
  });

  return success({
    url: `/api/checkout?${params.toString()}`,
  });
}

/**
 * 구독을 취소한다 (기간 종료 시 취소).
 */
export async function cancelSubscription(): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const { userId } = authResult.data;

  const subscription = await db.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) return failure("Active subscription not found");

  // Polar API를 통해 구독 취소 요청 (기간 종료 시 취소)
  // REST API: PUT /v1/subscriptions/{id} — cancelAtPeriodEnd으로 기간 종료 시 자동 취소
  const polar = (await import("~/fsd/shared/api/polar")).getPolarClient();

  await polar.subscriptions.update({
    id: subscription.polarSubscriptionId,
    body: {
      cancelAtPeriodEnd: true,
    },
  });

  // DB 업데이트는 Webhook에서 처리됨
  return success(undefined);
}
```

---

## 11. Customer Portal (구독 관리)

### 11.1 파일: `src/app/api/portal/route.ts` (신규 생성)

Polar의 Customer Portal을 통해 사용자가 직접 구독/결제 수단을 관리할 수 있다.

```typescript
import { CustomerPortal } from "@polar-sh/nextjs";
import { env } from "~/env";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export const GET = CustomerPortal({
  accessToken: env.POLAR_ACCESS_TOKEN,
  getCustomerId: async (req) => {
    const session = await auth();
    if (!session?.user?.id) return "";

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { polarCustomerId: true },
    });

    return user?.polarCustomerId ?? "";
  },
  server: env.POLAR_SERVER ?? (env.NODE_ENV === "production" ? "production" : "sandbox"),
});
```

**사용 방법**: Billing 페이지에서 `/api/portal`로 리다이렉트하면 Polar 고객 포털이 열린다.

---

## 12. Billing 페이지

### 12.1 파일: `src/app/dashboard/billing/page.tsx` (신규 생성)

```typescript
import { getBillingData } from "~/fsd/features/billing/api";
import { BillingPage } from "~/fsd/features/billing/ui/BillingPage";

export default async function BillingRoute({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const params = await searchParams;
  const result = await getBillingData();

  if (!result.success) {
    return <div>데이터를 불러올 수 없습니다.</div>;
  }

  return (
    <BillingPage
      data={result.data}
      showSuccessBanner={params.success === "true"}
    />
  );
}
```

### 12.2 페이지 레이아웃 구성

```
┌──────────────────────────────────────────┐
│  Billing & Credits                       │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  현재 크레딧: 27 Credits           │  │
│  │  현재 플랜: Pro (Monthly)          │  │
│  │  다음 갱신일: 2026-04-24           │  │
│  │  [구독 관리]  [구독 취소]          │  │
│  └────────────────────────────────────┘  │
│                                          │
│  플랜 선택                               │
│  ┌──────────┐ ┌──────────┐              │
│  │   Free   │ │   Pro    │              │
│  │  $0/월   │ │ $9.99/월 │              │
│  │ 3크레딧  │ │30크레딧  │              │
│  │ [현재]   │ │[구독하기]│              │
│  └──────────┘ └──────────┘              │
│                                          │
│  결제 이력                               │
│  ┌────────────────────────────────────┐  │
│  │  날짜  │ 상품명  │ 금액  │ 상태   │  │
│  │  03-01 │ Pro Mo. │ $9.99 │ 완료   │  │
│  │  02-01 │ Pro Mo. │ $9.99 │ 완료   │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 12.3 컴포넌트 상세

#### `PlanCard.tsx`
- 각 플랜의 이름, 가격, 크레딧 수량 표시
- 현재 활성 플랜 강조 표시
- "구독하기" 버튼 → `getCheckoutUrl()` 호출 후 Polar Checkout으로 리다이렉트
- 현재 플랜인 경우 버튼 비활성화

#### `SubscriptionStatus.tsx`
- 현재 구독 상태 (활성/취소 예정/미구독)
- 크레딧 잔량
- 다음 갱신일
- "구독 관리" 버튼 → `/api/portal`로 리다이렉트 (Polar Customer Portal)
- "구독 취소" 버튼 → `cancelSubscription()` 호출

#### `OrderHistory.tsx`
- 결제 이력 테이블 (날짜, 상품명, 금액, 상태)
- 최근 20건 표시

---

## 13. 크레딧 시스템 확장

### 13.1 현재 크레딧 로직 (수정 필요)

`src/inngest/functions.ts`의 크레딧 차감 로직에 **동시성 문제**가 존재한다.

#### 문제

`check-credits` 단계에서 읽은 `credits` 값이 `deduct-credits` 단계에서 사용되기까지 수 분의 갭이 존재한다 (비디오 처리 시간). 이 동안 Webhook이 크레딧을 충전하면 stale 값으로 차감량을 계산하게 된다. 또한 `credits`가 음수가 될 수 있는 보호 장치가 없다.

```
T1: check-credits → credits = 5 (JS 변수에 저장)
T2: call-modal-endpoint → 수 분 소요 ← Webhook이 increment 가능
T3: create-clips-in-db
T4: deduct-credits → Math.min(5, clipsFound) ← stale 값 사용
```

#### 권장 수정: `deduct-credits` 단계 변경

```typescript
// 기존 (문제 있음)
await step.run("deduct-credits", async () => {
  await db.user.update({
    where: { id: userId },
    data: {
      credits: { decrement: Math.min(credits, clipsFound) },
    },
  });
});

// 수정 (원자적 SQL로 음수 방지)
await step.run("deduct-credits", async () => {
  await db.$executeRaw`
    UPDATE "User"
    SET "credits" = GREATEST("credits" - ${clipsFound}, 0)
    WHERE "id" = ${userId}
  `;
});
```

#### 선택적 보강: PostgreSQL CHECK 제약 추가

```sql
ALTER TABLE "User" ADD CONSTRAINT credits_non_negative CHECK (credits >= 0);
```

이 제약을 추가하면 어떤 경로에서든 크레딧이 음수가 되는 것을 DB 레벨에서 방지한다.

### 13.2 크레딧 충전 (신규)

크레딧 충전은 오직 Webhook을 통해서만 이루어진다:

| 시나리오 | 트리거 | 크레딧 변경 |
|----------|--------|-------------|
| 최초 구독 | `subscription.active` | `increment: monthlyCredits` |
| 구독 갱신 (매월/매년) | `subscription.updated` (기간 변경 감지) | `increment: monthlyCredits` |
| 플랜 업그레이드 | `subscription.updated` (플랜 변경 감지) | 차액만큼 추가 충전 (선택) |
| 구독 취소 | `subscription.canceled` | 변경 없음 (기간 종료까지 사용 가능) |

### 13.3 미사용 크레딧 정책

**권장: 이월 허용**

구독 갱신 시 기존 잔여 크레딧에 새로운 월 크레딧을 **추가(increment)**한다. 크레딧을 리셋하지 않아 사용자 경험이 우수하다.

```typescript
// Webhook에서 크레딧 충전 시
await db.user.update({
  where: { id: userId },
  data: {
    credits: { increment: monthlyCredits }, // 기존 잔여 + 신규
  },
});
```

> 만약 이월을 허용하지 않으려면 `increment` 대신 `set: monthlyCredits`를 사용한다.

---

## 14. 보안 고려사항

### 14.1 웹훅 서명 검증

`@polar-sh/nextjs`의 `Webhooks()` 팩토리가 내부적으로 `POLAR_WEBHOOK_SECRET`을 사용하여 서명을 검증한다. 별도 구현 불필요.

### 14.2 Server-Side Only

- Polar 클라이언트(`getPolarClient()`)는 서버에서만 사용
- `POLAR_ACCESS_TOKEN`은 `src/env.js`의 `server` 섹션에 정의 (클라이언트 노출 방지)
- 모든 결제 관련 Server Action은 `requireAuth()` 가드 적용

### 14.3 멱등성

- `polarOrderId` unique 제약 → 동일 주문 중복 처리 방지
- `polarSubscriptionId` unique 제약 + `upsert` → 동일 구독 중복 생성 방지
- `currentPeriodEnd` 비교 → 동일 기간 중복 크레딧 충전 방지

### 14.4 userId 출처 및 조작 방지

- Checkout 라우트 핸들러(`/api/checkout`)에서 서버 세션을 검증한 후, `metadata[userId]`를 **서버 세션의 userId로 강제 교체**한다
- 클라이언트가 URL 파라미터로 다른 userId를 전달하더라도 서버에서 덮어쓰므로 조작이 불가능하다
- `customerEmail`도 동일하게 서버 세션에서 추출하여 강제 설정한다
- Server Action 방식(Section 8.3)에서는 `requireAuth()`를 통해 직접 세션에서 추출하므로 조작 불가

---

## 15. 수정/생성 파일 전체 목록

### Phase 1: 기반 구축 (Day 1)

| # | 파일 경로 | 작업 | 설명 |
|---|-----------|------|------|
| 1 | `package.json` | 수정 | `stripe` 제거, `@polar-sh/sdk` + `@polar-sh/nextjs` 설치 |
| 2 | `src/env.js` | 수정 | `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER` 추가 |
| 3 | `.env.example` | 신규 | 환경변수 템플릿 파일 생성 (현재 미존재) |
| 4 | `prisma/schema.prisma` | 수정 | `polarCustomerId` 리네임, `Subscription`/`Order` 모델 추가, CHECK 제약 고려 |
| 5 | `src/fsd/shared/api/polar.ts` | 신규 | Polar 클라이언트 싱글톤 |
| 6 | `src/inngest/functions.ts` | 수정 | `deduct-credits` 단계를 원자적 SQL(`GREATEST`)로 변경 (크레딧 동시성 해결) |

### Phase 2: 백엔드 (Day 2)

| # | 파일 경로 | 작업 | 설명 |
|---|-----------|------|------|
| 7 | `src/app/api/checkout/route.ts` | 신규 | Checkout 라우트 핸들러 (세션 검증 래퍼 포함) |
| 8 | `src/app/api/webhooks/polar/route.ts` | 신규 | Webhook 핸들러 (멱등성 보장) |
| 9 | `src/app/api/portal/route.ts` | 신규 | Customer Portal 라우트 핸들러 |
| 10 | `src/fsd/features/billing/constants/index.ts` | 신규 | 플랜 상수, Product ID |
| 11 | `src/fsd/features/billing/model/types.ts` | 신규 | 타입 정의 |
| 12 | `src/fsd/features/billing/api/index.ts` | 신규 | Server Actions |

### Phase 3: 프론트엔드 (Day 3)

| # | 파일 경로 | 작업 | 설명 |
|---|-----------|------|------|
| 13 | `src/fsd/features/billing/ui/PlanCard.tsx` | 신규 | 플랜 카드 컴포넌트 |
| 14 | `src/fsd/features/billing/ui/SubscriptionStatus.tsx` | 신규 | 구독 상태 표시 |
| 15 | `src/fsd/features/billing/ui/OrderHistory.tsx` | 신규 | 결제 이력 테이블 |
| 16 | `src/fsd/features/billing/ui/BillingPage.tsx` | 신규 | 빌링 페이지 메인 |
| 17 | `src/app/dashboard/billing/page.tsx` | 신규 | Next.js 페이지 (서버 컴포넌트) |

### Phase 4: 정리 & 검증 (Day 4)

| # | 파일 경로 | 작업 | 설명 |
|---|-----------|------|------|
| 18 | `src/fsd/widgets/dashboard-header/ui/index.tsx` | 확인 | "Buy more" 링크 → `/dashboard/billing` 동작 확인 |
| 19 | `src/fsd/pages/dashboard/ui/index.tsx` | 확인 | "Buy Credits" 버튼 동작 확인 |
| 20 | `src/fsd/pages/home/ui/index.tsx` | 확인 | billing 링크 동작 확인 |

---

## 16. 테스트 & 검증 (Sandbox 기반)

### 16.1 Sandbox 기반 로컬 개발 환경 구성

#### Step 1: 사전 준비

```bash
# 1. Polar 패키지 설치
npm install @polar-sh/sdk @polar-sh/nextjs

# 2. Polar CLI 설치 (웹훅 포워딩용)
curl -fsSL https://polar.sh/install.sh | bash
```

#### Step 2: Sandbox 환경 설정

```bash
# 3. Sandbox 계정 생성: https://sandbox.polar.sh/start
# 4. 조직 생성 후 Access Token 발급
# 5. .env.local 파일 설정
```

`.env.local`:
```dotenv
# Polar Sandbox 환경
POLAR_ACCESS_TOKEN="polar_pat_sandbox_XXXXXXXXXX"
POLAR_WEBHOOK_SECRET="whsec_XXXXXXXXXX"
POLAR_SERVER="sandbox"
```

#### Step 3: Sandbox 테스트 Product 생성

[7.3 Sandbox 테스트 Product 생성](#73-sandbox-테스트-product-생성) 참조. Product ID를 `POLAR_PRODUCT_IDS.sandbox`에 설정한다.

#### Step 4: 개발 서버 + 웹훅 리스너 실행

터미널 3개를 열고 각각 실행:

```bash
# 터미널 1: Next.js 개발 서버
npm run dev

# 터미널 2: Inngest 개발 서버 (크레딧 차감 테스트용)
npm run inngest-dev

# 터미널 3: Polar 웹훅 리스너
polar listen http://localhost:3000/api/webhooks/polar
```

> `polar listen` 실행 시 출력되는 Webhook Secret을 `.env.local`의 `POLAR_WEBHOOK_SECRET`에 반영해야 한다. 값이 변경되면 Next.js 서버를 재시작한다.

### 16.2 Sandbox E2E 테스트 워크플로우

#### 워크플로우 1: 신규 구독 (체크아웃 → 웹훅 → 크레딧 충전)

```
1. http://localhost:3000 접속 → 로그인
2. /dashboard/billing 페이지 이동
3. Pro Monthly 플랜의 "구독하기" 클릭
4. Polar Sandbox 체크아웃 페이지로 리다이렉트
5. 테스트 카드 입력:
   - 카드 번호: 4242 4242 4242 4242
   - 만료일: 12/30 (미래 아무 날짜)
   - CVC: 123 (아무 3자리)
6. 결제 완료 → /dashboard/billing?success=true 리다이렉트
7. 터미널 3 (polar listen)에서 웹훅 이벤트 수신 확인
8. DB 확인: Subscription 생성, User credits 30 증가, Order 이력 생성
```

**DB 검증 (Prisma Studio)**:
```bash
npm run db:studio
# User 테이블: credits 확인
# Subscription 테이블: polarSubscriptionId, planTier, status 확인
# Order 테이블: polarOrderId, amount 확인
```

#### 워크플로우 2: 구독 갱신 시뮬레이션

> Sandbox에서 구독 갱신을 자연스럽게 테스트하려면 Polar 대시보드에서 수동으로 갱신 이벤트를 트리거하거나, 기간이 경과할 때까지 기다려야 한다. 대안으로 웹훅 핸들러의 `onSubscriptionUpdated`를 직접 호출하는 통합 테스트를 작성할 수 있다.

#### 워크플로우 3: 결제 실패 시나리오

```
1. /dashboard/billing → Pro Monthly 구독하기
2. 체크아웃에서 실패 카드 입력:
   - 카드 번호: 4000 0000 0000 9995 (잔액 부족)
3. 결제 거부 메시지 확인
4. DB 확인: Subscription 미생성, 크레딧 변경 없음
```

#### 워크플로우 4: 구독 취소

```
1. /dashboard/billing에서 "구독 취소" 클릭
2. 취소 확인 후 Polar API 호출
3. 웹훅에서 subscription.canceled 이벤트 수신
4. DB 확인: Subscription status = "canceled", cancelAtPeriodEnd = true
5. currentPeriodEnd까지 서비스(크레딧 사용) 정상 동작 확인
```

#### 워크플로우 5: Customer Portal

```
1. /dashboard/billing에서 "구독 관리" 클릭
2. /api/portal → Polar Sandbox Customer Portal로 리다이렉트
3. 결제 수단 변경, 구독 관리 기능 확인
```

#### 워크플로우 6: 멱등성 검증

```
1. polar listen 터미널에서 수신된 웹훅 이벤트 확인
2. Polar Sandbox 대시보드 > Webhooks > 최근 전송 > "Retry" 클릭
3. 동일 이벤트 재전송
4. DB 확인: 크레딧이 중복 충전되지 않았는지 확인
   - Order: polarOrderId unique로 중복 생성 방지
   - Subscription: upsert로 중복 생성 방지
   - 크레딧: currentPeriodEnd 비교로 중복 충전 방지
```

### 16.3 테스트 시나리오 매트릭스

| # | 시나리오 | 테스트 카드 | 검증 항목 | Sandbox 가능 여부 |
|---|----------|-------------|-----------|-------------------|
| 1 | 신규 구독 (Pro Monthly) | `4242...4242` | Checkout → Subscription 생성 → 크레딧 30 충전 | O |
| 2 | 신규 구독 (Pro Yearly) | `4242...4242` | 연간 구독 생성 → 크레딧 30 충전 | O |
| 3 | 결제 실패 (잔액 부족) | `4000...9995` | 결제 거부 → DB 변경 없음 | O |
| 4 | 결제 실패 (일반 거부) | `4000...0002` | 결제 거부 → DB 변경 없음 | O |
| 5 | 3D Secure 인증 | `4000...3220` | 추가 인증 → 결제 완료 | O |
| 6 | 구독 취소 | - | 취소 상태 기록 → currentPeriodEnd까지 유지 | O |
| 7 | 중복 웹훅 | - | 동일 이벤트 재전송 → 크레딧 중복 충전 없음 | O |
| 8 | Customer Portal | - | 구독 관리 페이지 정상 접근 | O |
| 9 | Billing 페이지 | - | 크레딧/구독 상태/결제 이력 정상 표시 | O |
| 10 | 크레딧 0 상태 영상 처리 | - | Inngest "no credits" 상태 설정 | O |
| 11 | 구독 갱신 (기간 경과) | - | 기간 변경 감지 → 크레딧 추가 충전 | 제한적 (수동 트리거 필요) |

### 16.4 검증 체크리스트

#### Sandbox 환경 구성
- [ ] Polar Sandbox 계정 생성 (`sandbox.polar.sh`)
- [ ] Sandbox 조직 생성 및 Access Token 발급
- [ ] `.env.local`에 Sandbox 환경 변수 설정
- [ ] 2개의 테스트 Product 생성 (Pro Monthly/Yearly)
- [ ] Product ID를 `POLAR_PRODUCT_IDS.sandbox`에 반영
- [ ] `polar listen` 또는 ngrok으로 웹훅 포워딩 동작 확인

#### 핵심 플로우 검증
- [ ] Checkout → 결제 → 웹훅 → 크레딧 충전 E2E 동작
- [ ] 결제 실패 카드로 실패 시나리오 동작 확인
- [ ] 구독 취소 후 기간 종료까지 서비스 정상 이용
- [ ] 중복 웹훅에 대한 멱등성 확인 (Sandbox 대시보드에서 Retry)
- [ ] Customer Portal 정상 접근 및 구독 관리

#### UI 및 기능 검증
- [ ] Billing 페이지 UI 정상 렌더링
- [ ] 플랜 카드에서 현재 활성 플랜 강조 표시
- [ ] 결제 이력 테이블 정상 표시
- [ ] "Buy more" 링크 (dashboard-header) → `/dashboard/billing` 정상 이동

#### 기존 기능 호환성
- [ ] 기존 크레딧 차감 로직 (Inngest `processVideo`) 정상 동작
- [ ] 환경 변수 누락 시 빌드 에러 확인 (`src/env.js` 검증)
- [ ] `POLAR_SERVER` 미설정 시 `NODE_ENV` 기반 자동 결정 동작

### 16.5 Production 전환 체크리스트

Sandbox에서 모든 테스트를 완료한 후, Production으로 전환할 때 아래 항목을 확인한다.

#### 환경 전환
- [ ] `polar.sh` (Production) 대시보드에서 계정/조직 생성
- [ ] Production Access Token 발급
- [ ] Production 환경에서 동일한 2개 Product 생성 (동일 metadata)
- [ ] Product ID를 `POLAR_PRODUCT_IDS.production`에 반영
- [ ] Production 대시보드에서 웹훅 엔드포인트 등록 (`https://yourdomain.com/api/webhooks/polar`)
- [ ] Production Webhook Secret 발급

#### 환경 변수 교체
```dotenv
# Production 환경
POLAR_ACCESS_TOKEN="polar_pat_PRODUCTION_TOKEN"
POLAR_WEBHOOK_SECRET="whsec_PRODUCTION_SECRET"
POLAR_SERVER="production"
# 또는 POLAR_SERVER 삭제하여 NODE_ENV 기반 자동 결정
```

#### 최종 확인
- [ ] `POLAR_SERVER=production` 또는 `NODE_ENV=production`에서 SDK가 `https://api.polar.sh` 사용 확인
- [ ] Sandbox 토큰이 Production 환경에 혼입되지 않았는지 확인
- [ ] Webhook URL이 Production 도메인을 가리키는지 확인
- [ ] `NEXT_PUBLIC_SITE_URL`이 Production URL로 설정되었는지 확인
- [ ] 테스트 결제 후 실제 결제가 정상 처리되는지 확인
