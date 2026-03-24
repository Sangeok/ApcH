"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { Separator } from "~/fsd/shared/ui/atoms/separator";
import { cancelSubscription } from "~/fsd/features/billing/api";
import { PLAN_TIERS } from "~/fsd/features/billing/constants";
import type { SubscriptionInfo } from "~/fsd/features/billing/model/types";

interface SubscriptionStatusProps {
  credits: number;
  subscription: SubscriptionInfo | null;
}

export function SubscriptionStatus({
  credits,
  subscription,
}: SubscriptionStatusProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel() {
    if (!confirm("Are you sure you want to cancel your subscription?")) return;

    startTransition(async () => {
      const result = await cancelSubscription();
      if (result.success) {
        toast.success("Subscription will be canceled at the end of the billing period.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const planName = subscription
    ? PLAN_TIERS[subscription.planTier]?.name ?? subscription.planTier
    : "Free";

  const statusLabel = subscription?.cancelAtPeriodEnd
    ? "Canceling"
    : subscription?.status === "active"
      ? "Active"
      : subscription?.status ?? "None";

  const statusVariant = subscription?.cancelAtPeriodEnd
    ? "destructive"
    : subscription?.status === "active"
      ? "default"
      : "secondary";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing & Credits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Credits</span>
          <span className="text-2xl font-bold">{credits}</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Plan</span>
          <span className="font-medium">{planName}</span>
        </div>
        {subscription && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Status</span>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {subscription.cancelAtPeriodEnd ? "Expires" : "Next renewal"}
              </span>
              <span className="text-sm">
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>
            <Separator />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => (window.location.href = "/api/portal")}
              >
                Manage Subscription
              </Button>
              {!subscription.cancelAtPeriodEnd && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  disabled={isPending}
                  onClick={handleCancel}
                >
                  {isPending ? "Canceling..." : "Cancel Subscription"}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
