// 순수. board.ts/commands.ts와 같은 이유로 임포트 없음(transitions.test.mjs로 덮인다).
// 여기가 보안 경계다: 여기 없는 (from) status는 대시보드에서 커밋되지 않는다.
export const GATE_TRANSITIONS = {
  승인대기: "계획지시",
  검토대기: "구현승인",
} as const;

export type GateFromStatus = keyof typeof GATE_TRANSITIONS;
export type GateToStatus = (typeof GATE_TRANSITIONS)[GateFromStatus];

export function resolveGateTransition(fromStatus: string): GateToStatus | null {
  // Object.hasOwn: 프로토타입 오염 키("__proto__" 등)까지 막는 멤버십 검사(commands.ts와 동일).
  return Object.hasOwn(GATE_TRANSITIONS, fromStatus)
    ? GATE_TRANSITIONS[fromStatus as GateFromStatus]
    : null;
}

export type GateTransitionResult =
  | { ok: true; markdown: string; to: GateToStatus }
  | { ok: false; reason: "not-whitelisted" | "not-found" | "format" | "stale" };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// board.ts와 같은 형식으로 이 항목 블록 안의 첫 status 줄을 잡는다(FIELD_RE 호환).
const STATUS_LINE_RE = /^([ \t]+status:[ \t]*)(.+?)[ \t]*$/m;
// 이 항목 블록의 끝: 다음 항목/헤딩/안내 블록 직전.
const BLOCK_END_RE = /\n(?=- \[|#|>)/;

export function applyGateTransition(
  markdown: string,
  id: string,
  expectedStatus: string,
): GateTransitionResult {
  const to = resolveGateTransition(expectedStatus);
  if (to === null) return { ok: false, reason: "not-whitelisted" };

  // 항목 헤더의 첫 등장 = 가장 위(최신) 행. 아래 이력 행은 건드리지 않는다
  // (briefing.flatten의 "첫 등장만 유효"와 같은 규칙).
  const headerRe = new RegExp(`^- \\[[ xX]\\] ${escapeRegExp(id)}: .+$`, "m");
  const header = headerRe.exec(markdown);
  if (header === null) return { ok: false, reason: "not-found" };
  const headerLine = header[0];
  if (headerLine === undefined) return { ok: false, reason: "not-found" };

  const afterHeader = header.index + headerLine.length;
  const rest = markdown.slice(afterHeader);
  const endMatch = BLOCK_END_RE.exec(rest);
  const blockEnd =
    endMatch === null ? markdown.length : afterHeader + endMatch.index;

  const block = markdown.slice(afterHeader, blockEnd);
  const status = STATUS_LINE_RE.exec(block);
  if (status === null) return { ok: false, reason: "format" };
  const prefix = status[1];
  const value = status[2];
  if (prefix === undefined || value === undefined) {
    return { ok: false, reason: "format" };
  }
  // 스테일 가드: 화면이 읽은 status와 원격 현재 status가 다르면 거부(잃어버린 갱신 방지).
  if (value.trim() !== expectedStatus) return { ok: false, reason: "stale" };

  // status 줄의 값만 교체. prefix·to 모두 `$` 미포함이라 문자열 치환이 안전하다.
  const newBlock = block.replace(STATUS_LINE_RE, `${prefix}${to}`);
  const newMarkdown =
    markdown.slice(0, afterHeader) + newBlock + markdown.slice(blockEnd);
  return { ok: true, markdown: newMarkdown, to };
}

// 커밋 메시지 — 대시보드 경유임을 남긴다(백로그 요구). to별 어구.
const COMMIT_PHRASE: Record<GateToStatus, string> = {
  계획지시: "open {id} for planning",
  구현승인: "approve {id} for implementation",
};
export function gateCommitMessage(id: string, to: GateToStatus): string {
  return `docs(board): ${COMMIT_PHRASE[to].replace("{id}", id)} via dashboard gate`;
}
