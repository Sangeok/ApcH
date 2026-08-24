import type { ReactNode } from "react";
import Link from "next/link";

import type { AgentReport } from "~/fsd/entities/agent-report";
import type { DocLink } from "~/fsd/entities/repo-doc";

import { PipelineRunControl } from "~/fsd/features/run-pipeline-command";
import {
  GateCardLock,
  GateTransitionButton,
  RejectActions,
  rejectActionsFor,
  resolveGateTransition,
} from "~/fsd/features/transition-pipeline-gate";
import { cn } from "~/fsd/shared/lib/utils";
import type { Briefing, SpeechItem, Tone } from "../model/briefing";
import { AgentAvatar } from "./_component/agent-avatar";
import { OwnerBanner } from "./_component/owner-banner";
import { PixelOffice } from "./_component/pixel-office";

const TONE_TEXT: Record<Tone, string> = {
  pending: "text-stamp",
  active: "text-active",
  done: "text-silence",
  hold: "text-hold",
  muted: "text-muted-foreground",
};

export function PipelineBriefing({
  briefing,
  reports,
}: {
  briefing: Briefing;
  reports: Map<string, AgentReport[]>;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <BriefingHeader briefing={briefing} />
      <InboxZone items={briefing.inbox} pendingCount={briefing.pendingCount} />
      <PixelOffice team={briefing.team} reports={reports} />
      <FeedZone items={briefing.feed} />
    </div>
  );
}

// 보드 필드가 150자 예산을 넘었을 때의 표식. CI가 없어 화면이 유일한 강제 장치다
// (보드 안내 블록의 기록 규칙 → 상세는 docs/agents/<행위자>/ 로).
function BudgetFlag() {
  return (
    <span
      title="보드 요약이 150자를 넘습니다 — 상세는 docs/agents/ 로 옮기세요"
      className="shrink-0 rounded border border-hold/50 px-1 text-[10px] leading-4 text-hold"
    >
      150자 초과
    </span>
  );
}

// 부서(countersign) 표식. 검증 클린 패스면 실선 active 칩, 아직이면 점선 hold 칩.
// 판정은 메인 루프가 클린 패스일 때만 `검증:` 필드를 써서 전달한다(보드 안내 규약).
// 검토대기 항목에서만 렌더한다(승인대기는 계획이 없어 판정이 없다).
function ValidationMark({ validation }: { validation: string | null }) {
  if (validation !== null) {
    return (
      <span
        title={validation}
        className="shrink-0 rounded border border-active/60 bg-active/10 px-1 text-[10px] leading-4 text-active"
      >
        검증 통과
      </span>
    );
  }
  return (
    <span
      title="아직 검증 클린 패스 기록이 없습니다 — 승인 전 확인하세요"
      className="shrink-0 rounded border border-dashed border-hold/60 px-1 text-[10px] leading-4 text-hold"
    >
      검증 전
    </span>
  );
}

// 항목 카드에서 그 항목의 실재하는 문서(계획서·행위자 기록)로 가는 링크. 없으면 렌더 안 함.
// 계획서=청색(--active), 보고서=회색. 클릭하면 내부 뷰어 라우트로 이동한다(GitHub 이탈 없음).
function DocLinks({ docs }: { docs: DocLink[] }) {
  if (docs.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {docs.map((d) => (
        <Link
          key={d.href}
          href={d.href}
          className={cn(
            "underline-offset-2 hover:underline",
            d.kind === "plan" ? "text-active" : "text-muted-foreground",
          )}
        >
          {d.label} →
        </Link>
      ))}
    </p>
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
    <header className="flex flex-wrap items-start justify-between gap-4">
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
      <PipelineRunControl plan={briefing.plan} />
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
      <GateCardLock>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {item.id} · {item.status}
            {item.status === "검토대기" && (
              <ValidationMark validation={item.validation} />
            )}
            {item.overBudget && <BudgetFlag />}
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
      </GateCardLock>
      <DocLinks docs={item.docs} />
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
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {item.overBudget && <BudgetFlag />}
                  {item.status}
                </span>
              </summary>
              {item.detail && (
                <p className="mt-2 pl-11 text-sm whitespace-pre-wrap text-muted-foreground">
                  {item.detail}
                </p>
              )}
              <div className="pl-11">
                <DocLinks docs={item.docs} />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
