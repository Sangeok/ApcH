"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { sendObservabilityTestEvent } from "~/fsd/features/observability-test";
import { Button } from "~/fsd/shared/ui/atoms/button";

export function ObservabilityTestPanel() {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await sendObservabilityTestEvent();

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Test event sent — check Sentry");
    });
  };

  return (
    <section className="bg-card mx-auto mt-10 max-w-md rounded-xl border p-6">
      <h1 className="text-lg font-semibold">Sentry 도달 테스트</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        DSN · 네트워크 · beforeSend · flush · environment 태그를 한 번에
        검증합니다.
      </p>
      <Button
        type="button"
        className="mt-4"
        disabled={isPending}
        onClick={handleClick}
      >
        {isPending ? "Sending..." : "Send test event"}
      </Button>
    </section>
  );
}
