import type { PipelineCommandKey } from "./commands";

export type DeskCommand = { key: PipelineCommandKey; label: string };

// 안전한 명령이 있는 책상만 등재. dev(admin-dev·web-dev)는 없음 — 「대안」 참고.
const DESK_COMMANDS: Record<string, DeskCommand> = {
  pm: { key: "pm-select", label: "선정 실행" },
  "doc-auditor": { key: "audit-run", label: "감사 실행" },
  "feature-scout": { key: "scout-run", label: "조사 실행" },
};

export function deskCommandFor(agentId: string): DeskCommand | null {
  return DESK_COMMANDS[agentId] ?? null; // Record<string,…>는 undefined 가능 → ?? null
}
