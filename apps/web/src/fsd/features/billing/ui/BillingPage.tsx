"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import { PlanCard } from "./PlanCard";
import { SubscriptionStatus } from "./SubscriptionStatus";
import { OrderHistory } from "./OrderHistory";
import type { ProductIds } from "../config";
import type { BillingPageData } from "../model/types";

// 컴포넌트 본문에 있으면 렌더마다 다시 만들어지고, 아래 effect의 dep 배열에
// 넣지 않아도 린트가 통과해 "의존이 없다"는 거짓 인상을 준다.
const SUBSCRIPTION_POLL_INTERVAL_MS = 2_000;
const SUBSCRIPTION_POLL_TIMEOUT_MS = 30_000;
const MAX_SUBSCRIPTION_POLLS =
  SUBSCRIPTION_POLL_TIMEOUT_MS / SUBSCRIPTION_POLL_INTERVAL_MS;

interface BillingPageProps {
  data: BillingPageData;
  productIds: ProductIds;
  /** 체크아웃에서 돌아온 진입인지. 배너·폴링·계측 셋을 함께 켠다 */
  hasReturnedFromCheckout: boolean;
  isSubscriptionEnabled: boolean;
}

export function BillingPage({
  data,
  productIds,
  hasReturnedFromCheckout,
  isSubscriptionEnabled,
}: BillingPageProps) {
  const router = useRouter();
  // "구독이 아직 안 붙어서 기다리는 중"이라는 뜻이다. 이전 이름 `polling`은
  // 무엇을 폴링하는지도, 왜 배너가 뜨는지도 말하지 않았다.
  const [isActivatingSubscription, setIsActivatingSubscription] =
    useState(false);
  const trackedCheckoutSuccessRef = useRef(false);

  // Poll for subscription data when redirected from checkout but data not yet available
  useEffect(() => {
    if (!hasReturnedFromCheckout || data.subscription) return;

    setIsActivatingSubscription(true);
    let polls = 0;
    const interval = setInterval(() => {
      polls += 1;
      if (polls > MAX_SUBSCRIPTION_POLLS) {
        clearInterval(interval);
        setIsActivatingSubscription(false);
        toast.error(
          "Subscription update is taking longer than expected. Please refresh the page.",
        );
        return;
      }
      router.refresh();
    }, SUBSCRIPTION_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [hasReturnedFromCheckout, data.subscription, router]);

  // Show success toast once subscription data arrives
  useEffect(() => {
    if (hasReturnedFromCheckout && data.subscription) {
      setIsActivatingSubscription(false);
      toast.success("Subscription activated! Credits have been added.");
    }
  }, [hasReturnedFromCheckout, data.subscription]);

  useEffect(() => {
    if (!hasReturnedFromCheckout || trackedCheckoutSuccessRef.current) return;

    trackedCheckoutSuccessRef.current = true;
    void trackAnalyticsEvent("checkout_returned_success", undefined, {
      dedupeKey: "checkout_returned_success",
    });
  }, [hasReturnedFromCheckout]);

  const currentTier = data.subscription?.planTier ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Billing & Credits
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and view payment history.
        </p>
      </div>

      {isActivatingSubscription && (
        <div className="bg-muted/50 flex items-center gap-3 rounded-lg border p-4">
          <div className="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-muted-foreground text-sm">
            Payment confirmed! Activating your subscription...
          </p>
        </div>
      )}

      <SubscriptionStatus
        credits={data.credits}
        subscription={data.subscription}
      />

      {isSubscriptionEnabled && (
        <div>
          <h2 className="mb-4 text-lg font-medium">Choose a Plan</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <PlanCard
              tier="free"
              currentTier={currentTier}
              hasActiveSubscription={!!data.subscription}
              productIds={productIds}
            />
            <PlanCard
              tier="pro"
              currentTier={currentTier}
              hasActiveSubscription={!!data.subscription}
              productIds={productIds}
            />
          </div>
        </div>
      )}

      <OrderHistory orders={data.orders} />
    </div>
  );
}
