"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { commitRejectTransition } from "../api/commit-gate-transition";
import type { RejectAction } from "../model/transitions";

// 여백 펜 메모: 라벨은 근검정(--foreground, 대비 안전), 뜻은 낱말 + 작은 색 마커(비텍스트).
// 색 일관성: bounce=active(피드 계획지시색) · hold=hold(피드 보류색) · discard=destructive(위험).
const ACTION_META: Record<
  RejectAction,
  { label: string; marker: string; toast: string }
> = {
  bounce: { label: "계획 다시 쓰기", marker: "bg-active", toast: "계획지시로 되돌렸습니다" },
  hold: { label: "지금은 보류", marker: "bg-hold", toast: "보류했습니다" },
  discard: { label: "폐기", marker: "bg-destructive", toast: "" }, // 폐기 토스트는 아래서 특수 처리
};

export function RejectActions({
  id,
  status,
  actions,
}: {
  id: string;
  status: string;
  actions: RejectAction[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (actions.length === 0) return null;

  const run = (action: RejectAction) => {
    startTransition(async () => {
      const result = await commitRejectTransition(action, id, status);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        action === "discard"
          ? `${id}를 폐기했습니다. TASK_BACKLOG.md 항목은 직접 정리하세요.`
          : ACTION_META[action].toast,
      );
      router.refresh();
    });
  };

  const close = () => {
    setOpen(false);
    setConfirmingDiscard(false);
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {open ? "반려 닫기" : "반려"}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1 border-l-2 border-stamp/30 pl-3">
          {actions.map((action) => {
            if (action === "discard" && confirmingDiscard) {
              return (
                <div
                  key={action}
                  className="flex items-center justify-between gap-2 py-0.5"
                >
                  <span className="text-xs text-[oklch(0.50_0.20_27)]">
                    되돌릴 수 없습니다. 폐기할까요?
                  </span>
                  <span className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setConfirmingDiscard(false)}
                      className="text-xs text-muted-foreground hover:underline disabled:opacity-60"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run("discard")}
                      className="text-xs font-medium text-[oklch(0.50_0.20_27)] hover:underline disabled:opacity-60"
                    >
                      {isPending ? "폐기 중..." : "폐기 확인"}
                    </button>
                  </span>
                </div>
              );
            }
            return (
              <button
                key={action}
                type="button"
                disabled={isPending}
                onClick={() =>
                  action === "discard" ? setConfirmingDiscard(true) : run(action)
                }
                className="flex items-center gap-2 py-0.5 text-left text-sm text-foreground hover:underline disabled:opacity-60"
              >
                <span
                  aria-hidden="true"
                  className={`inline-block size-2 rounded-[1px] ${ACTION_META[action].marker}`}
                />
                {ACTION_META[action].label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
