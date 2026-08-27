"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "~/fsd/shared/ui/atoms/button";
import { cn } from "~/fsd/shared/lib/utils";
import { postPipelineCommand } from "../api/post-pipeline-command";
import { getPipelineProgress } from "../api/get-pipeline-progress";
import { isRunLocked, type ProgressState } from "../model/progress";
import type { RunPlan } from "../model/run-plan";

const POLL_MS = 15_000; // 15초: 인증 시 240req/h(5000/h의 5% 미만), 반응은 충분

// 진행 pill: 색은 점(비텍스트, 3:1)이 나르고 낱말이 상태를 함께 말한다(색 단독 아님).
// 브리핑 tone 토큰 재사용 — awaiting=active(맥박) · responded=silence(완료=침묵) ·
// silent=hold(주의) · idle/unknown=muted. 신규 토큰·서체·keyframe 없음.
function ProgressPill({ state }: { state: ProgressState }) {
  let dot = "bg-muted-foreground";
  let text = "text-muted-foreground";
  let pulse = false;
  let label: string;
  switch (state.kind) {
    case "awaiting":
      dot = "bg-active";
      text = "text-foreground";
      pulse = true;
      label =
        state.minutes === 0
          ? "요청 보냄 · 응답 대기"
          : `요청 보냄 · ${state.minutes}분째 응답 대기`;
      break;
    case "running":
      dot = "bg-active";
      text = "text-foreground";
      pulse = true;
      label =
        state.minutes === 0 ? "진행 중" : `진행 중 · ${state.minutes}분째`;
      break;
    case "responded":
      dot = "bg-silence";
      label = "응답 옴";
      break;
    case "silent":
      dot = "bg-hold";
      text = "text-foreground";
      label = `무응답 ${state.minutes}분 · 이슈 #87 확인`;
      break;
    case "unknown":
      label = "진행 상태 확인 불가";
      break;
    default: // idle
      label = "최근 요청 없음";
  }
  return (
    <span className={cn("flex items-center gap-1.5 text-xs", text)}>
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-2 rounded-full",
          dot,
          pulse && "animate-pulse motion-reduce:animate-none",
        )}
      />
      {label}
    </span>
  );
}

// 실행 로그(FEAT-24 시그니처): running일 때 pill 아래로 자라는 단계 기록.
// pill과 같은 골격(작은 점 + 낱말)이라 새 장치가 아니라 pill이 여러 줄로 늘어난 모습이다.
// 순서 있는 목록(<ol>)이라 단계 순서가 스크린리더에 전달된다. 마지막(현재) 단계만 foreground.
function ProgressLog({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col items-end gap-0.5">
      {steps.map((step, i) => (
        <li
          key={`${i}-${step}`}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            i === steps.length - 1 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span
            aria-hidden="true"
            className="inline-block size-1 rounded-full bg-muted-foreground"
          />
          {step}
        </li>
      ))}
    </ol>
  );
}

export function PipelineRunControl({ plan }: { plan: RunPlan }) {
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState<ProgressState>({ kind: "unknown" });
  const aliveRef = useRef(true);
  const progressRequestRef = useRef(0);

  const readProgress = useCallback(async () => {
    // interval poll과 클릭 직후 read가 겹쳐도 늦게 끝난 옛 응답이 최신 상태를 덮지 않게
    // request sequence가 가장 큰 호출만 화면에 반영한다.
    const requestId = ++progressRequestRef.current;
    try {
      const next = await getPipelineProgress();
      if (aliveRef.current && requestId === progressRequestRef.current) {
        setProgress(next);
      }
    } catch {
      if (aliveRef.current && requestId === progressRequestRef.current) {
        setProgress({ kind: "unknown" });
      }
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void readProgress();
    const timer = setInterval(() => void readProgress(), POLL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(timer);
    };
  }, [readProgress]);

  const handleClick = () => {
    startTransition(async () => {
      // 고정 key. label(동적)은 표시용일 뿐 서버로 가지 않는다 — 본문은 commands.ts 화이트리스트.
      const result = await postPipelineCommand("pipeline-run");
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        "파이프라인 실행을 요청했습니다 (이슈 #87). 아래에서 진행을 확인하세요.",
      );
      await readProgress(); // 클릭 직후 즉시 갱신; reject는 helper가 unknown으로 강등
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        disabled={isPending || !plan.enabled || isRunLocked(progress)}
        onClick={handleClick}
      >
        {isPending ? "요청 중..." : plan.label}
      </Button>
      <p className="max-w-64 text-right text-xs text-muted-foreground">
        {plan.description}
      </p>
      <ProgressPill state={progress} />
      {progress.kind === "running" && <ProgressLog steps={progress.steps} />}
    </div>
  );
}
