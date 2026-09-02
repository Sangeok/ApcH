"use client";

import { useTransition } from "react";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { getCheckoutUrl } from "~/fsd/features/billing/api";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import { PLAN_TIERS } from "../config";
import type { PlanTier, ProductIds } from "../config";

interface PlanCardProps {
  tier: PlanTier;
  currentTier: PlanTier | null;
  hasActiveSubscription: boolean;
  productIds: ProductIds;
}

export function PlanCard({
  tier,
  currentTier,
  hasActiveSubscription,
  productIds,
}: PlanCardProps) {
  const [isPending, startTransition] = useTransition();
  const plan = PLAN_TIERS[tier];
  const isCurrentPlan =
    tier === "free"
      ? !hasActiveSubscription
      : hasActiveSubscription && currentTier === tier;

  function handleSubscribe(productId: string, billingInterval: "month" | "year") {
    startTransition(async () => {
      await trackAnalyticsEvent("billing_cta_clicked", {
        tier,
        billingInterval,
      });
      const result = await getCheckoutUrl(productId);
      if (result.success) {
        await trackAnalyticsEvent("checkout_started", {
          tier,
          billingInterval,
        });
        window.location.href = result.data.url;
      }
    });
  }

  return (
    <Card className={isCurrentPlan ? "border-primary border-2" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{plan.name}</CardTitle>
          {isCurrentPlan && <Badge>Current</Badge>}
        </div>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <span className="text-3xl font-bold">{plan.price}</span>
          {tier !== "free" && (
            <span className="text-muted-foreground">/month</span>
          )}
        </div>
        <ul className="text-muted-foreground space-y-2 text-sm">
          <li>{plan.monthlyCredits} credits / month</li>
          {tier === "pro" && <li>Monthly and yearly checkout options</li>}
        </ul>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {tier === "free" ? (
          <Button variant="outline" className="w-full" disabled>
            {isCurrentPlan ? "Current Plan" : "Default"}
          </Button>
        ) : (
          <>
            <Button
              className="w-full"
              disabled={isCurrentPlan || isPending}
              onClick={() => handleSubscribe(productIds.pro_monthly, "month")}
            >
              {isPending
                ? "Redirecting..."
                : isCurrentPlan
                  ? "Current Plan"
                  : "Subscribe Monthly"}
            </Button>
            {!isCurrentPlan && (
              <Button
                variant="outline"
                className="w-full"
                disabled={isPending}
                onClick={() => handleSubscribe(productIds.pro_yearly, "year")}
              >
                {isPending ? "Redirecting..." : `Subscribe Yearly (${plan.yearlyPrice})`}
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}
