import type { BoardItem, BoardSection } from "./board";
import { identityFor, ROSTER_ORDER, type AgentIdentity } from "./agents";

export type Tone = "pending" | "active" | "done" | "hold" | "muted";

export type SpeechItem = {
  key: string;
  id: string;
  title: string;
  status: string | null;
  speaker: AgentIdentity;
  line: string;
  detail: string | null;
  tone: Tone;
};
export type TeamMember = {
  identity: AgentIdentity;
  state: string;
  heldId: string | null; // 책상이 들고 있는 항목 ID(칩 표시용). 없으면 null
  tone: Tone;
};
export type Briefing = {
  today: string;
  pendingCount: number;
  inbox: SpeechItem[];
  team: TeamMember[];
  feed: SpeechItem[];
};

const GATE_STATUSES = new Set(["승인대기", "검토대기"]);
type DatedItem = BoardItem & { sectionDate: string };

function flatten(sections: BoardSection[]): DatedItem[] {
  // 보드는 최신 섹션이 위다. 같은 ID가 여러 섹션에 있으면 **가장 위(최신) 행만
  // 유효**하고 아래 행은 이력이다(보드·pm 공유 규칙). 이력 행이 계산에 끼면
  // 끝난 항목의 옛 승인대기 행이 결재함에 유령으로 되살아나므로 첫 등장만 남긴다.
  const seen = new Set<string>();
  const out: DatedItem[] = [];
  for (const s of sections) {
    for (const it of s.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push({ ...it, sectionDate: s.heading });
    }
  }
  return out;
}

export function daysOnBoard(sectionDate: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sectionDate);
  if (!m) return null;
  const y = m[1],
    mo = m[2],
    d = m[3]; // 각각 string | undefined
  if (y === undefined || mo === undefined || d === undefined) return null;
  const start = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const diff = Math.floor((now - start) / 86_400_000);
  return diff < 0 ? 0 : diff;
}

function nthDay(sectionDate: string, today: Date): number | null {
  const days = daysOnBoard(sectionDate, today);
  return days === null ? null : days + 1;
}

export function firstSentence(text: string): string {
  const trimmed = text.trim();
  // 종결부호(. ! ?) 뒤에 공백/문자열끝이 오는 첫 지점까지.
  // "board.ts"처럼 토큰 내부 마침표는 뒤가 공백이 아니라 걸리지 않는다.
  const m = /^([\s\S]*?[.!?])(\s|$)/.exec(trimmed);
  return m?.[1] ?? trimmed; // m[1]은 string | undefined → ?? 로 보정
}

function summarize(item: BoardItem): string | null {
  const src = item.result ?? item.reason;
  return src === null ? null : firstSentence(src);
}

function inboxSpeech(item: DatedItem, today: Date): SpeechItem {
  const n = nthDay(item.sectionDate, today);
  const dayTag = n === null ? "" : `${n}일째 `;
  if (item.status === "승인대기") {
    return {
      key: item.id,
      id: item.id,
      title: item.title,
      status: item.status,
      speaker: identityFor("pm"),
      line: `${item.id}, ${dayTag}계획 지시를 기다립니다.`,
      detail: item.reason,
      tone: "pending",
    };
  }
  return {
    // 검토대기
    key: item.id,
    id: item.id,
    title: item.title,
    status: item.status,
    speaker: identityFor(item.agent),
    line: `${item.id} 계획서를 올렸습니다 — ${dayTag}검토 대기 중입니다.`,
    detail: item.result ?? item.reason,
    tone: "pending",
  };
}

const FEED_TONE: Record<string, Tone> = {
  계획지시: "active",
  구현승인: "active",
  완료: "done",
  보류: "hold",
};

function feedSpeech(item: DatedItem): SpeechItem {
  const speaker = identityFor(item.agent);
  const tone: Tone =
    item.status === null ? "muted" : (FEED_TONE[item.status] ?? "muted");
  let line: string;
  switch (item.status) {
    case "계획지시":
      line = `${item.id} 계획을 작성하고 있습니다.`;
      break;
    case "구현승인":
      line = `${item.id} 구현에 착수했습니다.`;
      break;
    case "완료":
      line = summarize(item) ?? `${item.id} 완료했습니다.`;
      break;
    case "보류":
      line = summarize(item) ?? `${item.id} 보류했습니다.`;
      break;
    default:
      line = summarize(item) ?? item.id;
  }
  const detail =
    item.status === "계획지시" || item.status === "구현승인"
      ? item.reason
      : (item.result ?? item.reason);
  return {
    key: item.id,
    id: item.id,
    title: item.title,
    status: item.status,
    speaker,
    line,
    detail,
    tone,
  };
}

function teamState(
  agentId: string,
  items: DatedItem[],
): { state: string; heldId: string | null; tone: Tone } {
  if (agentId === "pm") {
    const pending = items.filter((it) => it.status === "승인대기").length;
    return pending > 0
      ? { state: `${pending}건 결재 요청 중`, heldId: null, tone: "pending" }
      : { state: "새 선정 없음", heldId: null, tone: "muted" };
  }
  const mine = items.filter((it) => it.agent === agentId);
  const review = mine.find((it) => it.status === "검토대기");
  if (review !== undefined)
    return { state: "검토 요청 중", heldId: review.id, tone: "pending" };
  const working = mine.find(
    (it) => it.status === "계획지시" || it.status === "구현승인",
  );
  if (working !== undefined)
    return { state: "작업 중", heldId: working.id, tone: "active" };
  const held = mine.find((it) => it.status === "보류");
  if (held !== undefined) return { state: "보류", heldId: held.id, tone: "hold" };
  const done = mine.find((it) => it.status === "완료");
  if (done !== undefined)
    return { state: "최근 완료", heldId: done.id, tone: "done" };
  return { state: "대기 중", heldId: null, tone: "muted" };
}

function formatToday(today: Date): string {
  return `${today.getUTCMonth() + 1}월 ${today.getUTCDate()}일`;
}

export function buildBriefing(sections: BoardSection[], today: Date): Briefing {
  const items = flatten(sections);
  const inbox = items
    .filter((it) => it.status !== null && GATE_STATUSES.has(it.status))
    .map((it) => inboxSpeech(it, today));
  const feed = items
    .filter((it) => it.status === null || !GATE_STATUSES.has(it.status))
    .map((it) => feedSpeech(it));
  const team = ROSTER_ORDER.map((id) => {
    const { state, heldId, tone } = teamState(id, items);
    return { identity: identityFor(id), state, heldId, tone };
  });
  return {
    today: formatToday(today),
    pendingCount: inbox.length,
    inbox,
    team,
    feed,
  };
}
