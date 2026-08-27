// 순수 함수. board.ts/reporting.ts와 같은 이유로 임포트가 없다(journey.test.mjs로 덮인다).
// 보드 status(+검증 판정)로 "파이프라인 여정 7단계 중 지금 어디인지"를 결정적으로 매핑한다.
// 진행 중(승인대기·계획지시·검토대기·구현승인)만 여정 위치가 있다 — 완료(종결)·보류(중단)·null은
// 여정 밖이라 매핑이 없다(null 반환). 보드 데이터만으로는 완료의 "인수됨"(메인 루프 몫)도, 보류의
// "어느 단계에서 멈췄나"도 결정할 수 없어(결과 줄은 산문이라 구조가 아니다) 여정 밖으로 뺀다.
export type StageState = "done" | "current" | "upcoming";
export type JourneyActor = "pm" | "user" | "agent" | "verifier" | "loop";

export type JourneyStage = {
  key: string;
  label: string;
  actor: JourneyActor;
  state: StageState;
};

export type JourneyView = {
  currentIndex: number; // 0..6, 현재(진행 중) 단계의 인덱스
  currentLabel: string; // stages[currentIndex].label
  waitingActor: JourneyActor; // 현재 단계를 미는 주체 = 지금 기다리는 대상
  waitingLabel: string; // "당신 차례" | "검증 중" | "작업 중" …(화면 낱말)
  nextLabel: string | null; // 다음 단계 라벨(마지막이면 null)
  stages: JourneyStage[]; // 7단계 전부, 각 state 부여
};

// 여정 7단계(고정 순서). actor = 그 단계를 미는 주체(누구를 기다리는지의 원천).
const JOURNEY_STAGES: readonly {
  key: string;
  label: string;
  actor: JourneyActor;
}[] = [
  { key: "select", label: "선정", actor: "pm" },
  { key: "gate1", label: "게이트①", actor: "user" },
  { key: "plan", label: "계획서", actor: "agent" },
  { key: "verify", label: "검증", actor: "verifier" },
  { key: "gate2", label: "게이트②", actor: "user" },
  { key: "build", label: "구현", actor: "agent" },
  { key: "accept", label: "인수", actor: "loop" },
];

// 현재 단계 주체 → "지금 누구를 기다리는지" 낱말. user 게이트는 "당신 차례".
const WAITING_LABEL: Record<JourneyActor, string> = {
  pm: "선정 중",
  user: "당신 차례",
  agent: "작업 중",
  verifier: "검증 중",
  loop: "인수 중",
};

// status(+검증 판정) → 현재 단계 인덱스. 진행 중 넷만 매핑되고 나머지는 null.
// 검토대기 이분: 검증 판정(검증: 줄)이 있으면 검증 통과 → 게이트②(당신 대기), 없으면 검증 중.
function currentIndexFor(
  status: string | null,
  validation: string | null,
): number | null {
  switch (status) {
    case "승인대기":
      return 1; // 게이트① — 사용자 대기
    case "계획지시":
      return 2; // 계획서 — 담당 dev 작업
    case "검토대기":
      return validation !== null ? 4 : 3; // 검증 통과→게이트② : 검증 중
    case "구현승인":
      return 5; // 구현 — 담당 dev 작업
    default:
      return null; // 완료·보류·null·기타 → 여정 밖(스테퍼 없음)
  }
}

export function deriveJourney(
  status: string | null,
  validation: string | null,
): JourneyView | null {
  const idx = currentIndexFor(status, validation);
  if (idx === null) return null;

  const stages: JourneyStage[] = JOURNEY_STAGES.map((s, i) => ({
    key: s.key,
    label: s.label,
    actor: s.actor,
    state: i < idx ? "done" : i === idx ? "current" : "upcoming",
  }));

  const current = stages[idx]; // idx는 1..5이라 항상 존재하지만 noUncheckedIndexedAccess 보정
  if (current === undefined) return null;
  const next = stages[idx + 1]; // JourneyStage | undefined(마지막이면 없음)

  return {
    currentIndex: idx,
    currentLabel: current.label,
    waitingActor: current.actor,
    waitingLabel: WAITING_LABEL[current.actor],
    nextLabel: next === undefined ? null : next.label,
    stages,
  };
}
