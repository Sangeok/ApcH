import { cn } from "~/fsd/shared/lib/utils";
import type { JourneyStage, JourneyView } from "../../model/journey";

// 노드 색/형태 = 상태·대기 주체. done=흑연 채움, current·user=호박 빈 링(당신의 도장 대기),
// current·팀(agent/verifier/…)=남색 채움(진행 중), upcoming=옅은 빈 링. 신규 토큰 없음.
function dotClass(stage: JourneyStage): string {
  if (stage.state === "done") return "size-1.5 rounded-full bg-silence";
  if (stage.state === "current") {
    return stage.actor === "user"
      ? "size-2.5 rounded-full border-2 border-stamp" // 아직 안 찍힌 인장
      : "size-2.5 rounded-full bg-active"; // 팀 진행 중
  }
  return "size-1.5 rounded-full border border-muted-foreground/40"; // upcoming
}

export function JourneyStepper({ journey }: { journey: JourneyView }) {
  // 대기 주체 색: 당신(호박) vs 팀(남색). 캡션·현재 라벨·대기 낱말이 이 색을 공유한다.
  const whoText = journey.waitingActor === "user" ? "text-stamp" : "text-active";
  const whoBorder =
    journey.waitingActor === "user" ? "border-stamp/50" : "border-active/50";
  const lastIndex = journey.stages.length - 1;
  return (
    <div className="mt-3">
      {/* 레일: 노드 + 연결선. 단계 라벨은 노드 아래(sm↑에서만). */}
      <ol className="flex items-start" aria-label="파이프라인 여정">
        {journey.stages.map((stage, i) => (
          <li
            key={stage.key}
            className={cn(
              "flex flex-col gap-1",
              i < lastIndex ? "flex-1" : "shrink-0",
            )}
          >
            <div className="flex items-center gap-1">
              <span
                aria-hidden="true"
                className={cn("inline-block shrink-0", dotClass(stage))}
              />
              {i < lastIndex && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px flex-1",
                    stage.state === "done"
                      ? "bg-silence/50"
                      : "bg-muted-foreground/25",
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "hidden text-[10px] leading-4 sm:block",
                stage.state === "current"
                  ? cn("font-medium", whoText)
                  : stage.state === "done"
                    ? "text-silence"
                    : "text-muted-foreground/60",
              )}
            >
              {stage.label}
            </span>
          </li>
        ))}
      </ol>
      {/* 캡션(항상): 지금 <현재> · [대기 낱말] · 다음 <다음>. 폰에서 라벨을 대신해 낱말을 나른다. */}
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          지금 <span className={cn("font-medium", whoText)}>{journey.currentLabel}</span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 text-[10px] leading-4",
            whoText,
            whoBorder,
          )}
        >
          {journey.waitingLabel}
        </span>
        {journey.nextLabel !== null && (
          <span className="text-muted-foreground/80">· 다음 {journey.nextLabel}</span>
        )}
      </p>
    </div>
  );
}
