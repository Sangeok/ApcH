// 순수. board.ts/commands.ts와 같은 이유로 임포트 없음(transitions.test.mjs로 덮인다).
// 여기가 보안 경계다: 여기 없는 (from) status는 대시보드에서 커밋되지 않는다.
export const GATE_TRANSITIONS = {
  승인대기: { to: "계획지시", label: "계획지시" },
  검토대기: { to: "구현승인", label: "구현승인" },
} as const;

export type GateTransitionSource = keyof typeof GATE_TRANSITIONS;
export type GateFromStatus = GateTransitionSource;
export type GateTransitionDescriptor =
  (typeof GATE_TRANSITIONS)[GateTransitionSource];
export type GateToStatus = GateTransitionDescriptor["to"];

export function isGateTransitionSource(
  value: string,
): value is GateTransitionSource {
  return Object.hasOwn(GATE_TRANSITIONS, value);
}

export function resolveGateTransition(fromStatus: string): GateToStatus | null {
  // Object.hasOwn: 프로토타입 오염 키("__proto__" 등)까지 막는 멤버십 검사(commands.ts와 동일).
  return isGateTransitionSource(fromStatus)
    ? GATE_TRANSITIONS[fromStatus].to
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

// 항목 최신(첫) 행 = 가장 위 행(briefing.flatten의 "첫 등장만 유효"와 같은 규칙).
type ItemBlock = {
  headerStart: number; // 헤더 '-'의 위치
  afterHeader: number; // 헤더 줄 다음 '\n' 위치
  blockEnd: number; // 다음 항목/헤딩/안내 블록 직전
  block: string; // [afterHeader, blockEnd)
  statusPrefix: string; // "  status: "
  statusValue: string; // trim된 현재 status
};

// 승인·반려가 공유하는 항목 탐색(정규식 중복 드리프트 방지).
function locateItem(
  markdown: string,
  id: string,
): { ok: true; loc: ItemBlock } | { ok: false; reason: "not-found" | "format" } {
  const headerRe = new RegExp(`^- \\[[ xX]\\] ${escapeRegExp(id)}: .+$`, "m");
  const header = headerRe.exec(markdown);
  if (header === null) return { ok: false, reason: "not-found" };
  const headerLine = header[0];
  if (headerLine === undefined) return { ok: false, reason: "not-found" };

  const headerStart = header.index;
  const afterHeader = headerStart + headerLine.length;
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
  return {
    ok: true,
    loc: {
      headerStart,
      afterHeader,
      blockEnd,
      block,
      statusPrefix: prefix,
      statusValue: value.trim(),
    },
  };
}

export function applyGateTransition(
  markdown: string,
  id: string,
  expectedStatus: string,
): GateTransitionResult {
  const to = resolveGateTransition(expectedStatus);
  if (to === null) return { ok: false, reason: "not-whitelisted" };
  const found = locateItem(markdown, id);
  if (!found.ok) return { ok: false, reason: found.reason };
  const { loc } = found;
  // 스테일 가드: 화면이 읽은 status와 원격 현재 status가 다르면 거부(잃어버린 갱신 방지).
  if (loc.statusValue !== expectedStatus) return { ok: false, reason: "stale" };
  // status 줄의 값만 교체. prefix·to 모두 `$` 미포함이라 문자열 치환이 안전하다.
  const newBlock = loc.block.replace(STATUS_LINE_RE, `${loc.statusPrefix}${to}`);
  const newMarkdown =
    markdown.slice(0, loc.afterHeader) + newBlock + markdown.slice(loc.blockEnd);
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

// 반려(거절) 전이 — 승인(GATE_TRANSITIONS)과 별개 화이트리스트.
// 여기 없는 (action, from) 쌍은 대시보드에서 커밋되지 않는다.
export const REJECT_TRANSITIONS = {
  bounce: { from: ["검토대기"], to: "계획지시" }, // 되돌리기: 계획 재작성
  hold: { from: ["승인대기", "검토대기"], to: "보류" }, // 보류: 대기
  discard: { from: ["승인대기", "검토대기"], to: null }, // 폐기: 행 제거
} as const;

export type RejectAction = keyof typeof REJECT_TRANSITIONS;
export type RejectReason = "not-whitelisted" | "not-found" | "format" | "stale";

type StatusRejectResult =
  | { ok: true; markdown: string; to: string }
  | { ok: false; reason: RejectReason };
type DiscardResult =
  | { ok: true; markdown: string }
  | { ok: false; reason: RejectReason };

// UI용: 이 status에서 가능한 반려 액션(승인대기는 되돌리기 없음).
export function rejectActionsFor(fromStatus: string): RejectAction[] {
  return (Object.keys(REJECT_TRANSITIONS) as RejectAction[]).filter((a) =>
    (REJECT_TRANSITIONS[a].from as readonly string[]).includes(fromStatus),
  );
}

// 되돌리기(bounce) — status 줄만 교체. applyGateTransition과 같은 기계, 화이트리스트만 다르다.
export function applyBounceTransition(
  markdown: string,
  id: string,
  expectedStatus: string,
): StatusRejectResult {
  const { from, to } = REJECT_TRANSITIONS.bounce; // to: "계획지시"
  if (!(from as readonly string[]).includes(expectedStatus)) {
    return { ok: false, reason: "not-whitelisted" };
  }
  const found = locateItem(markdown, id);
  if (!found.ok) return { ok: false, reason: found.reason };
  const { loc } = found;
  if (loc.statusValue !== expectedStatus) return { ok: false, reason: "stale" };
  const newBlock = loc.block.replace(STATUS_LINE_RE, `${loc.statusPrefix}${to}`);
  return {
    ok: true,
    to,
    markdown:
      markdown.slice(0, loc.afterHeader) +
      newBlock +
      markdown.slice(loc.blockEnd),
  };
}

const REASON_LINE_RE = /^([ \t]+)근거:[ \t]*.*$/m;
const RESULT_LINE_RE = /^([ \t]+)결과:[ \t]*.*$/m;

// 보류(hold) — status 줄 교체 + `결과:` 줄 기록(있으면 교체·없으면 삽입).
// 사유 텍스트는 호출자가 만들어 넘긴다(고정 문구는 holdResultLine). `결과:` 기록은
// 리터럴 슬라이스로 한다 — 사유에 `$` 등이 있어도 정규식 치환 특수문자로 해석되지 않게.
export function applyHoldTransition(
  markdown: string,
  id: string,
  expectedStatus: string,
  resultText: string,
): StatusRejectResult {
  const { from, to } = REJECT_TRANSITIONS.hold; // to: "보류"
  if (!(from as readonly string[]).includes(expectedStatus)) {
    return { ok: false, reason: "not-whitelisted" };
  }
  const found = locateItem(markdown, id);
  if (!found.ok) return { ok: false, reason: found.reason };
  const { loc } = found;
  if (loc.statusValue !== expectedStatus) return { ok: false, reason: "stale" };

  // 1) status 줄 값 → 보류.
  let newBlock = loc.block.replace(STATUS_LINE_RE, `${loc.statusPrefix}${to}`);

  // 2) 결과 줄 기록. **이미 있으면 교체, 없으면 근거 줄 뒤에 삽입**(둘 다 리터럴 슬라이스).
  //    교체 분기가 필요한 이유: 보류 항목을 재개하면(보드 안내 `PROJECT_BOARD.md:16`) 옛 `결과:` 줄이
  //    남은 채 승인대기·검토대기가 된다. 그때 또 삽입하면 결과 줄이 둘이 되고, board.ts 파서는
  //    순차 대입(`:86-88`)이라 **뒤에 오는 옛 줄이 이긴다** — 새 보류 사유가 화면에서 사라진다.
  //    (검증 라운드 실측: 삽입만 하면 결과 줄 2개, 파서가 옛 사유를 읽음.)
  const existing = RESULT_LINE_RE.exec(newBlock);
  if (existing !== null) {
    const existingLine = existing[0];
    const existingIndent = existing[1];
    if (existingLine === undefined || existingIndent === undefined) {
      return { ok: false, reason: "format" };
    }
    newBlock =
      newBlock.slice(0, existing.index) +
      `${existingIndent}결과: ${resultText}` +
      newBlock.slice(existing.index + existingLine.length);
  } else {
    // 삽입은 `\n`을 쓴다 — 보드 **블롭**이 LF이기 때문(실측 `git ls-files --eol PROJECT_BOARD.md`
    // → `i/lf w/crlf`; contents API는 워킹트리가 아니라 블롭을 서빙하므로 서버가 받는 입력은 LF다).
    // 참고(검증 라운드 실측): CRLF 입력에서도 교체 분기·bounce·discard는 개행이 보존되지만
    // (정규식 `$`가 `\r` 앞에서 매치, 슬라이스가 `\r`을 그대로 둔다) **이 삽입 줄만 LF가 된다.**
    const reason = REASON_LINE_RE.exec(newBlock);
    if (reason === null) return { ok: false, reason: "format" };
    const reasonLine = reason[0];
    const indent = reason[1];
    if (reasonLine === undefined || indent === undefined) {
      return { ok: false, reason: "format" };
    }
    const insertAt = reason.index + reasonLine.length;
    newBlock =
      newBlock.slice(0, insertAt) +
      `\n${indent}결과: ${resultText}` +
      newBlock.slice(insertAt);
  }

  return {
    ok: true,
    to,
    markdown:
      markdown.slice(0, loc.afterHeader) +
      newBlock +
      markdown.slice(loc.blockEnd),
  };
}

// 고정 날짜 보류 문구(FEAT-01 보류 기록 형태). 결정론적: 호출자가 Date를 넘긴다.
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
export function holdResultLine(today: Date): string {
  const date = `${today.getUTCFullYear()}-${pad2(today.getUTCMonth() + 1)}-${pad2(today.getUTCDate())}`;
  return `사용자 결정(${date}) — 대시보드에서 보류. 폐기가 아니라 대기이며 TASK_BACKLOG.md에 남는다. 재개하려면 이 행을 계획지시 또는 구현승인으로 되돌린다.`;
}

// 폐기(discard) — 항목 블록 통째 제거. 헤더 직전 개행 하나까지 함께 지워 빈 줄이 남지 않게(최소 diff).
export function applyDiscard(
  markdown: string,
  id: string,
  expectedStatus: string,
): DiscardResult {
  const { from } = REJECT_TRANSITIONS.discard;
  if (!(from as readonly string[]).includes(expectedStatus)) {
    return { ok: false, reason: "not-whitelisted" };
  }
  const found = locateItem(markdown, id);
  if (!found.ok) return { ok: false, reason: found.reason };
  const { loc } = found;
  if (loc.statusValue !== expectedStatus) return { ok: false, reason: "stale" };

  // 헤더 '-' 앞 문자가 '\n'이면 그 개행도 함께 제거 → 이웃 줄이 자연스레 붙는다.
  const cutStart =
    loc.headerStart > 0 && markdown[loc.headerStart - 1] === "\n"
      ? loc.headerStart - 1
      : loc.headerStart;
  return {
    ok: true,
    markdown: markdown.slice(0, cutStart) + markdown.slice(loc.blockEnd),
  };
}

// 반려 커밋 메시지 — gateCommitMessage와 같은 어미.
const REJECT_PHRASE: Record<RejectAction, string> = {
  bounce: "bounce {id} back to planning",
  hold: "hold {id}",
  discard: "discard {id}",
};
export function rejectCommitMessage(action: RejectAction, id: string): string {
  return `docs(board): ${REJECT_PHRASE[action].replace("{id}", id)} via dashboard gate`;
}
