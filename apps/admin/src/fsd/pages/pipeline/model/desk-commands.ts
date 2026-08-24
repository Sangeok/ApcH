import type { PipelineCommandKey } from "~/fsd/features/run-pipeline-command";

export type DeskCommand = { key: PipelineCommandKey; label: string };

// 5책상 전부 등재 — dev 「작업 진행」은 FEAT-07에서 추가(FEAT-06 「대안」1 채택).
const DESK_COMMANDS: Record<string, DeskCommand> = {
  pm: { key: "pm-select", label: "선정 실행" },
  "admin-dev": { key: "admin-work", label: "작업 진행" },
  "web-dev": { key: "web-work", label: "작업 진행" },
  "backend-dev": { key: "backend-work", label: "작업 진행" },
  "doc-auditor": { key: "audit-run", label: "감사 실행" },
  "feature-scout": { key: "scout-run", label: "조사 실행" },
};

export function deskCommandFor(agentId: string): DeskCommand | null {
  return DESK_COMMANDS[agentId] ?? null; // Record<string,…>는 undefined 가능 → ?? null
}
