# 구현 가이드 - Quick Start

P0 우선순위 기능들의 빠른 구현 가이드입니다.

---

## 1. 결제 시스템 (Stripe) 구현

### Step 1: Stripe 설정

```bash
# .env에 추가
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
```

### Step 2: 환경 변수 스키마 업데이트

```javascript
// src/env.js
server: {
  // ... 기존 설정
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
},
client: {
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string(),
},
```

### Step 3: Prisma 스키마 추가

```prisma
// prisma/schema.prisma

model Subscription {
  id                   String   @id @default(cuid())
  userId               String   @unique
  stripeSubscriptionId String   @unique
  stripePriceId        String
  status               String   // active, canceled, past_due
  currentPeriodEnd     DateTime
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  user                 User     @relation(fields: [userId], references: [id])
}

model Payment {
  id              String   @id @default(cuid())
  userId          String
  stripePaymentId String   @unique
  amount          Int
  credits         Int
  status          String   // succeeded, failed
  createdAt       DateTime @default(now())
  user            User     @relation(fields: [userId], references: [id])
}
```

### Step 4: Server Actions 생성

```typescript
// src/actions/stripe.ts
"use server";

import Stripe from "stripe";
import { env } from "~/env";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const CREDIT_PACKS = {
  pack_10: { credits: 10, priceId: "price_xxx" },
  pack_50: { credits: 50, priceId: "price_xxx" },
  pack_100: { credits: 100, priceId: "price_xxx" },
};

export async function createCheckoutSession(packId: keyof typeof CREDIT_PACKS) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const pack = CREDIT_PACKS[packId];
  if (!pack) throw new Error("Invalid pack");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, email: true },
  });

  let customerId = user?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user?.email ?? undefined,
      metadata: { userId: session.user.id },
    });
    customerId = customer.id;
    await db.user.update({
      where: { id: session.user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [{ price: pack.priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    metadata: {
      userId: session.user.id,
      credits: pack.credits.toString(),
    },
  });

  return { url: checkoutSession.url };
}
```

### Step 5: Webhook 엔드포인트

```typescript
// src/app/api/webhooks/stripe/route.ts
import { headers } from "next/headers";
import Stripe from "stripe";
import { env } from "~/env";
import { db } from "~/server/db";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    return new Response("Webhook signature verification failed", {
      status: 400,
    });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const credits = parseInt(session.metadata?.credits ?? "0");

    if (userId && credits > 0) {
      await db.user.update({
        where: { id: userId },
        data: { credits: { increment: credits } },
      });

      await db.payment.create({
        data: {
          userId,
          stripePaymentId: session.payment_intent as string,
          amount: session.amount_total ?? 0,
          credits,
          status: "succeeded",
        },
      });
    }
  }

  return new Response("OK", { status: 200 });
}
```

### Step 6: Billing 페이지 UI

```typescript
// src/app/dashboard/billing/page.tsx
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import BillingClient from "./billing-client";

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { credits: true },
  });

  return <BillingClient credits={user?.credits ?? 0} />;
}
```

---

## 2. 이메일 알림 구현 (Resend)

### Step 1: 설치 및 설정

```bash
npm install resend
```

```bash
# .env에 추가
RESEND_API_KEY="re_..."
```

### Step 2: 이메일 전송 유틸리티

```typescript
// src/lib/email.ts
import { Resend } from "resend";
import { env } from "~/env";

const resend = new Resend(env.RESEND_API_KEY);

export async function sendProcessingCompleteEmail(
  email: string,
  fileName: string,
  clipsCount: number,
) {
  await resend.emails.send({
    from: "AI Podcast Clipper <noreply@yourdomain.com>",
    to: email,
    subject: `Your clips are ready! - ${fileName}`,
    html: `
      <h1>Processing Complete!</h1>
      <p>Your video "${fileName}" has been processed successfully.</p>
      <p><strong>${clipsCount}</strong> clips have been generated.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">
        View your clips
      </a>
    `,
  });
}
```

### Step 3: Inngest 함수에서 호출

```typescript
// src/inngest/functions.ts 수정
// processVideo 함수 내 "set-status-processed" 스텝 후:

await step.run("send-notification-email", async () => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (user?.email) {
    await sendProcessingCompleteEmail(
      user.email,
      displayName ?? "Untitled",
      clipsFound,
    );
  }
});
```

---

## 3. 실시간 상태 업데이트 (SSE)

현재 폴링 방식 대신 Server-Sent Events 사용

### Step 1: SSE 엔드포인트

```typescript
// src/app/api/uploads/[id]/status/route.ts
import { db } from "~/server/db";
import { auth } from "~/server/auth";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Initial status
      const file = await db.uploadedFile.findUnique({
        where: { id: params.id, userId: session.user.id },
        select: { status: true },
      });

      if (file) {
        sendEvent({ status: file.status });
      }

      // Poll for updates (could be replaced with DB triggers)
      const interval = setInterval(async () => {
        const updated = await db.uploadedFile.findUnique({
          where: { id: params.id },
          select: { status: true },
        });

        if (updated) {
          sendEvent({ status: updated.status });

          if (["processed", "failed", "no credits"].includes(updated.status)) {
            clearInterval(interval);
            controller.close();
          }
        }
      }, 2000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

### Step 2: 클라이언트 훅

```typescript
// src/hooks/useUploadStatus.ts
import { useEffect, useState } from "react";

export function useUploadStatus(uploadId: string) {
  const [status, setStatus] = useState<string>("queued");

  useEffect(() => {
    const eventSource = new EventSource(`/api/uploads/${uploadId}/status`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStatus(data.status);
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [uploadId]);

  return status;
}
```

---

## 4. 클립 검색 기능

### Step 1: 검색 API

```typescript
// src/actions/search.ts
"use server";

import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function searchClips(query: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const clips = await db.clip.findMany({
    where: {
      userId: session.user.id,
      scriptText: {
        contains: query,
      },
    },
    include: {
      uploadedFile: {
        select: { displayName: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return clips;
}
```

### Step 2: 검색 UI 컴포넌트

```typescript
// src/fsd/features/search/ui/index.tsx
"use client";

import { useState, useTransition } from "react";
import { Input } from "~/fsd/shared/ui/atoms/input";
import { searchClips } from "~/actions/search";
import { Search } from "lucide-react";

export function ClipSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (value: string) => {
    setQuery(value);
    if (value.length < 2) {
      setResults([]);
      return;
    }

    startTransition(async () => {
      const clips = await searchClips(value);
      setResults(clips);
    });
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search clips by script..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        className="pl-10"
      />
      {results.length > 0 && (
        <div className="absolute top-full mt-2 w-full rounded-md border bg-background shadow-lg">
          {/* 검색 결과 렌더링 */}
        </div>
      )}
    </div>
  );
}
```

---
