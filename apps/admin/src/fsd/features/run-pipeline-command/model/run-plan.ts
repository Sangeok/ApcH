// 순수. board.ts/commands.ts와 같은 이유로 런타임 임포트 없음(run-plan.test.mjs로 덮인다).
// 보드 상태 → "지금 실행하면 무슨 일이 일어나는지" 텍스트. pipeline-run(commands.ts:18-19)이
// 실제로 진행시키는 것은 계획지시→계획서 작성, 구현승인→구현뿐이다(그 명령이 "게이트 전이는
// 바꾸지 마세요"라 승인대기·검토대기는 사용자 게이트를 기다리고, 완료·보류는 종료다).
import type { BoardItem } from "~/fsd/entities/pipeline";

const RUN_ACTIONS: Record<string, { verb: string }> = {
  계획지시: { verb: "계획서 작성" },
  구현승인: { verb: "구현" },
};

const GATE_WAITING = new Set(["승인대기", "검토대기"]);

export type RunPlan = {
  enabled: boolean;
  label: string;
  description: string;
};

export function describePipelineRun(items: BoardItem[]): RunPlan {
  const actionable: { id: string; verb: string }[] = [];
  let hasGateWaiting = false;
  for (const it of items) {
    if (it.status === null) continue;
    // Object.hasOwn: commands.ts:29와 같은 원칙. 인덱스 접근 + undefined 가드만으로는
    // 못 막는다 — 객체 리터럴은 Object.prototype을 물려받아 "__proto__"·"toString"이
    // undefined가 아닌 값을 돌려주고, 그러면 verb가 undefined로 라벨에 새어 나온다.
    const action = Object.hasOwn(RUN_ACTIONS, it.status)
      ? RUN_ACTIONS[it.status]
      : undefined; // { verb } | undefined
    if (action !== undefined) {
      actionable.push({ id: it.id, verb: action.verb });
    } else if (GATE_WAITING.has(it.status)) {
      hasGateWaiting = true;
    }
  }

  const first = actionable[0]; // BoardItem이 아니라 {id,verb} | undefined
  if (first === undefined) {
    return {
      enabled: false,
      label: "진행할 작업 없음",
      description: hasGateWaiting
        ? "결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다."
        : "지금 파이프라인이 진행할 항목이 없습니다.",
    };
  }

  const head = `${first.id} ${first.verb}`;
  if (actionable.length === 1) {
    return {
      enabled: true,
      label: head,
      description: `실행하면 ${head} 작업을 진행합니다.`,
    };
  }
  const listing = actionable.map((a) => `${a.id} ${a.verb}`).join(", ");
  return {
    enabled: true,
    label: `${head} 외 ${actionable.length - 1}건`,
    description: `실행하면 ${listing} 작업을 진행합니다.`,
  };
}
