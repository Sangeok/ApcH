import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { deskCommandFor } from "~/pipeline/desk-commands";
import type {
  Briefing,
  SpeechItem,
  TeamMember,
  Tone,
} from "~/pipeline/briefing";
import { AgentAvatar } from "~/ui/agent-avatar";
import { AgentCharacter } from "~/ui/agent-character";
import { PipelineCommandButton } from "~/ui/pipeline-command";

const TONE_TEXT: Record<Tone, string> = {
  pending: "text-stamp",
  active: "text-active",
  done: "text-silence",
  hold: "text-hold",
  muted: "text-muted-foreground",
};

export function PipelineBriefing({ briefing }: { briefing: Briefing }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <BriefingHeader briefing={briefing} />
      <InboxZone items={briefing.inbox} />
      <OfficeZone team={briefing.team} />
      <FeedZone items={briefing.feed} />
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-briefing-display text-sm tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

function BriefingHeader({ briefing }: { briefing: Briefing }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <p className="font-briefing-display text-sm tracking-widest text-muted-foreground">
          파이프라인 브리핑
        </p>
        <h1 className="font-briefing-display text-3xl text-foreground">
          {briefing.today}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {briefing.pendingCount > 0
            ? `결정 대기 ${briefing.pendingCount}건`
            : "결정 대기 없음"}
        </p>
      </div>
      <PipelineCommandButton command="pipeline-run" label="파이프라인 실행" />
    </header>
  );
}

function DocumentsMark() {
  // 서류 모티프(장식). 당신의 책상 위에 놓인 결재 서류를 뜻한다. aria-hidden.
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5 shrink-0 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <rect x={8} y={4} width={11} height={15} rx={1.5} className="fill-card" />
      <rect x={4} y={7} width={11} height={15} rx={1.5} className="fill-card" />
      <line x1={7} y1={12} x2={12} y2={12} />
      <line x1={7} y1={15} x2={11} y2={15} />
    </svg>
  );
}

function InboxZone({ items }: { items: SpeechItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SectionLabel>당신의 책상</SectionLabel>
        <DocumentsMark />
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="font-briefing-display text-base text-foreground">
            결재함이 비었습니다.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            지금 당신의 결정을 기다리는 항목이 없습니다. 팀 현황과 최근 보고는
            아래에 있습니다.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <InboxCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function InboxCard({ item }: { item: SpeechItem }) {
  return (
    <article className="rounded-2xl border border-stamp/40 bg-stamp-soft p-4">
      <div className="flex items-center gap-3">
        <AgentAvatar agentId={item.speaker.id} size="md" />
        <p className="text-sm text-muted-foreground">
          <span className="font-briefing-display text-foreground">
            {item.speaker.handle}
          </span>{" "}
          · {item.speaker.role}
        </p>
      </div>
      <p className="mt-3 text-lg text-stamp">{item.line}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {item.id} · {item.status}
        </p>
        <span className="rounded border border-stamp px-1.5 text-xs text-stamp">
          결재
        </span>
      </div>
      {item.detail && (
        <details className="mt-3 border-t border-stamp/20 pt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            근거 보기
          </summary>
          <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
            {item.detail}
          </p>
        </details>
      )}
    </article>
  );
}

function OfficeZone({ team }: { team: TeamMember[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>사무실</SectionLabel>
      <div className="flex flex-col gap-3">
        {team.map((member) => (
          <OfficeDesk key={member.identity.id} member={member} />
        ))}
      </div>
    </section>
  );
}

function OfficeDesk({ member }: { member: TeamMember }) {
  const cmd = deskCommandFor(member.identity.id);
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <AgentCharacter
          agentId={member.identity.id}
          tone={member.tone}
          className="size-14 shrink-0"
        />
        <div className="flex-1">
          <p className="text-sm">
            <span className="font-briefing-display text-foreground">
              {member.identity.handle}
            </span>{" "}
            ·{" "}
            <span className="text-muted-foreground">{member.identity.role}</span>
          </p>
          <p className={cn("mt-1 text-sm", TONE_TEXT[member.tone])}>
            {member.state}
          </p>
          {member.heldId && (
            <span className="mt-2 inline-block rounded border border-border px-1.5 text-xs text-muted-foreground">
              {member.heldId}
            </span>
          )}
        </div>
        {cmd && <PipelineCommandButton command={cmd.key} label={cmd.label} />}
      </div>
      {/* 책상 표면선: 도형 아래를 가르는 유일한 구분자 */}
      <div className="mt-3 h-px bg-border" />
    </article>
  );
}

function FeedZone({ items }: { items: SpeechItem[] }) {
  return (
    <section className="flex flex-col gap-1">
      <SectionLabel>보고</SectionLabel>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 보고가 없습니다.</p>
      ) : (
        <div>
          {items.map((item) => (
            <details
              key={item.key}
              className="group border-b border-border/60 py-3"
            >
              <summary className="flex cursor-pointer list-none items-start gap-3">
                <AgentAvatar agentId={item.speaker.id} size="sm" />
                <span
                  className={cn(
                    "flex-1 text-sm line-clamp-1 group-open:line-clamp-none",
                    TONE_TEXT[item.tone],
                  )}
                >
                  {item.line}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.status}
                </span>
              </summary>
              {item.detail && (
                <p className="mt-2 pl-11 text-sm whitespace-pre-wrap text-muted-foreground">
                  {item.detail}
                </p>
              )}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
