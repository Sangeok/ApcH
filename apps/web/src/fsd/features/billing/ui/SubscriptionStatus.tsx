"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/fsd/shared/ui/atoms/alert-dialog";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { Separator } from "~/fsd/shared/ui/atoms/separator";
import { cancelSubscription } from "../api";
import { formatDate } from "~/fsd/shared/lib/format-date";
import { PLAN_TIERS } from "../config";
import type { SubscriptionInfo } from "../model/types";

function getStatusDisplay(sub: SubscriptionInfo | null) {
  if (!sub) return { label: "None", variant: "secondary" as const };
  if (sub.cancelAtPeriodEnd) return { label: "Canceling", variant: "destructive" as const };
  if (sub.status === "active") return { label: "Active", variant: "default" as const };
  return { label: sub.status, variant: "secondary" as const };
}

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

  // blocking window.confirm 대신 앱의 AlertDialog를 쓴다 — jsdom에서 테스트
  // 불가능한 호출이 사라지고, 확인 문구가 실제 결과(기간 말 해지)를 말한다.
  function handleCancel() {
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

  const { label: statusLabel, variant: statusVariant } = getStatusDisplay(subscription);

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
                {formatDate(subscription.currentPeriodEnd)}
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
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      disabled={isPending}
                    >
                      {isPending ? "Canceling..." : "Cancel Subscription"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Cancel your subscription?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Your plan stays active until{" "}
                        {formatDate(subscription.currentPeriodEnd)}
                        , then it will not renew. Credits you already have are
                        kept.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel asChild>
                        <Button variant="outline">Keep subscription</Button>
                      </AlertDialogCancel>
                      <AlertDialogAction asChild>
                        <Button variant="destructive" onClick={handleCancel}>
                          Cancel subscription
                        </Button>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
