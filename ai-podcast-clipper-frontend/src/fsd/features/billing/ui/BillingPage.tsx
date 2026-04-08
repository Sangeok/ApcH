"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlanCard } from "./PlanCard";
import { SubscriptionStatus } from "./SubscriptionStatus";
import { OrderHistory } from "./OrderHistory";
import type { BillingPageData } from "~/fsd/features/billing/model/types";
import type { ProductIds } from "~/fsd/features/billing/constants";

interface BillingPageProps {
  data: BillingPageData;
  productIds: ProductIds;
  showSuccessBanner: boolean;
  subscriptionEnabled: boolean;
}

export function BillingPage({ data, productIds, showSuccessBanner, subscriptionEnabled }: BillingPageProps) {
  const router = useRouter();
  const [polling, setPolling] = useState(false);

  const POLLING_INTERVAL_MS = 2_000;
  const POLLING_TIMEOUT_MS = 30_000;

  // Poll for subscription data when redirected from checkout but data not yet available
  useEffect(() => {
    if (!showSuccessBanner || data.subscription) return;

    setPolling(true);
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += POLLING_INTERVAL_MS;
      if (elapsed > POLLING_TIMEOUT_MS) {
        clearInterval(interval);
        setPolling(false);
        toast.error("Subscription update is taking longer than expected. Please refresh the page.");
        return;
      }
      router.refresh();
    }, POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [showSuccessBanner, data.subscription, router]);

  // Show success toast once subscription data arrives
  useEffect(() => {
    if (showSuccessBanner && data.subscription) {
      setPolling(false);
      toast.success("Subscription activated! Credits have been added.");
    }
  }, [showSuccessBanner, data.subscription]);

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

      {polling && (
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

      {subscriptionEnabled && (
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
