// 순수. board.ts/reporting.ts와 같은 이유로 DB·fetch 없음(commands.test.mjs로 덮인다).
// 여기가 보안 경계다: 서버가 이슈 #87에 게시할 수 있는 본문의 유일한 출처.
export type PipelineCommandKey =
  | "pipeline-run"
  | "pm-select"
  | "audit-run"
  | "scout-run"
  | "admin-work"
  | "web-work";

// 모든 본문 불변식: (1) "[claude]"로 시작하지 않는다(webhook 계약, post-pipeline-command 주석).
// (2) 게이트 전이(계획지시·구현승인)를 지시하지 않는다 — 아래 문구를 포함한다.
const GATE_GUARD =
  "게이트 전이(계획지시·구현승인)는 사용자 몫이므로 status를 바꾸지 마세요.";

const PIPELINE_COMMANDS: Record<PipelineCommandKey, string> = {
  // 기존 전역 명령. FEAT-04에서 검증한 COMMAND_BODY를 **그대로** 유지한다.
  "pipeline-run":
    "파이프라인을 진행해 주세요. PROJECT_BOARD.md의 각 항목을 현재 status와 런북 규칙대로 처리하되, 게이트 전이(계획지시·구현승인)는 사용자 몫이므로 바꾸지 마세요.",
  "pm-select": `pm으로서 TASK_BACKLOG.md에서 오늘 처리할 1~2건을 선정해 PROJECT_BOARD.md에 승인대기로 기록해 주세요. ${GATE_GUARD}`,
  "audit-run": `doc-auditor로서 문서와 코드의 정합성을 감사하고 결과만 보고해 주세요(코드·보드 수정 없음). ${GATE_GUARD}`,
  "scout-run": `feature-scout로서 개선 기회를 조사해 TASK_BACKLOG.md에 제안만 추가해 주세요(보드·계획서 수정 없음). ${GATE_GUARD}`,
  "admin-work": `admin-dev로서 PROJECT_BOARD.md에서 배정된 항목을 현재 status와 런북 규칙대로 처리해 주세요. ${GATE_GUARD}`,
  "web-work": `web-dev로서 PROJECT_BOARD.md에서 배정된 항목을 현재 status와 런북 규칙대로 처리해 주세요. ${GATE_GUARD}`,
};

export function resolvePipelineCommand(key: string): string | null {
  // Object.hasOwn: 프로토타입 오염 키("__proto__" 등)까지 막는 런타임 멤버십 검사.
  return Object.hasOwn(PIPELINE_COMMANDS, key)
    ? PIPELINE_COMMANDS[key as PipelineCommandKey]
    : null;
}
