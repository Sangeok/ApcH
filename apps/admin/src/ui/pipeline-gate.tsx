"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { commitGateTransition } from "~/pipeline/commit-transition";
import { Button } from "~/ui/atoms/button";

// 도장 임프린트: 양피지 위 오커 잉크 글자 + 2px 도장 테두리 + hard 오프셋 그림자.
// active에서 그림자를 지우고 눌러 찍는다. 라벨 잉크는 --stamp(3.71:1, 12px AA 미달)보다
// 어두운 oklch(0.50 0.12 62) = 5.20:1. 테두리·그림자는 비텍스트(3:1 기준)라 --stamp 유지.
const STAMP_BUTTON_CLASS =
  "h-auto rounded-sm border-2 border-stamp bg-stamp-soft px-2.5 py-1 " +
  "font-briefing-display text-xs font-medium tracking-wide text-[oklch(0.50_0.12_62)] " +
  "shadow-[1px_1px_0_0_var(--stamp)] transition-transform " +
  "hover:-translate-y-px active:translate-y-0 active:shadow-none disabled:opacity-60";

export function GateTransitionButton({
  id,
  status,
  label,
}: {
  id: string;
  status: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await commitGateTransition(id, status);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${label}로 넘겼습니다`);
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className={STAMP_BUTTON_CLASS}
    >
      {isPending ? "찍는 중..." : label}
    </Button>
  );
}
