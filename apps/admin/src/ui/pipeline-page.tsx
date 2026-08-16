import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import type { Briefing, SpeechItem, Tone } from "~/pipeline/briefing";
import { rejectActionsFor, resolveGateTransition } from "~/pipeline/transitions";
import { AgentAvatar } from "~/ui/agent-avatar";
import { GateTransitionButton } from "~/ui/pipeline-gate";
import { PipelineCommandButton } from "~/ui/pipeline-command";
import { RejectActions } from "~/ui/pipeline-reject";
import { OwnerBanner, PixelOffice } from "~/ui/pixel-office";

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
      <InboxZone items={briefing.inbox} pendingCount={briefing.pendingCount} />
      <PixelOffice team={briefing.team} />
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

function InboxZone({
  items,
  pendingCount,
}: {
  items: SpeechItem[];
  pendingCount: number;
}) {
  return (
    <section className="flex flex-col gap-3">
      <OwnerBanner pendingCount={pendingCount} />
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
  // 라벨=찍힐 status. item.status는 string | null → null이면 버튼 없음.
  const gateTo =
    item.status === null ? null : resolveGateTransition(item.status);
  const rejectActions =
    item.status === null ? [] : rejectActionsFor(item.status);
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
        {gateTo !== null && (
          <GateTransitionButton
            id={item.id}
            status={item.status ?? ""}
            label={gateTo}
          />
        )}
      </div>
      {rejectActions.length > 0 && (
        <RejectActions
          id={item.id}
          status={item.status ?? ""}
          actions={rejectActions}
        />
      )}
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
