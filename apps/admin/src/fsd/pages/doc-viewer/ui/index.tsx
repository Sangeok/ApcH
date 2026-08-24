import Link from "next/link";

import {
  GateCardLock,
  GateTransitionButton,
  RejectActions,
} from "~/fsd/features/transition-pipeline-gate";
import { cn } from "~/fsd/shared/lib/utils";
import type { DocView } from "../model/build-doc-view";

// 서류철에서 꺼낸 한 장의 공문서. 서류철 헤더 띠(오커 도장 배지 + 항목 ID + 게이트) 위로
// 형제 문서 탭이 붙고, 그 아래 양피지 문서 시트가 이어진다. 팔레트·서체는 브리핑 정체성
// 그대로다(새 토큰 없음). 렌더된 GFM 요소 스타일은 globals.css `.doc-prose`가 소유한다.
export function DocViewer({ view }: { view: DocView }) {
  const runGate = view.gateLabel !== null && view.itemId !== null;
  const runReject = view.rejectActions.length > 0 && view.itemId !== null;
  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-8">
      <header className="rounded-t-2xl border border-stamp/40 bg-stamp-soft p-4 pb-0">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/pipeline"
            className="font-briefing-display text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            ← 브리핑
          </Link>
          <a
            href={view.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            GitHub 원문 ↗
          </a>
        </div>

        <GateCardLock>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* 종류 배지: 고무도장 은유. 계획서=오커 실선(현재 계약 하나), 보고서=러스트(누적). */}
            <span
              className={cn(
                "rounded-sm border px-2 py-0.5 font-briefing-display text-xs tracking-wide",
                view.kind === "plan"
                  ? "border-stamp text-stamp"
                  : "border-hold text-hold",
              )}
            >
              {view.kindLabel}
            </span>
            <h1 className="font-briefing-display text-2xl text-foreground">
              {view.title}
            </h1>
            {view.status !== null && (
              <span className="text-xs text-muted-foreground">{view.status}</span>
            )}
            {runGate && (
              <GateTransitionButton
                id={view.itemId ?? ""}
                status={view.status ?? ""}
                label={view.gateLabel ?? ""}
              />
            )}
          </div>

          {runReject && (
            <RejectActions
              id={view.itemId ?? ""}
              status={view.status ?? ""}
              actions={view.rejectActions}
            />
          )}
        </GateCardLock>

        {/* 서류철 탭: 형제 문서(계획→검증→구현→감사→정찰)를 물리 탭으로 인코딩.
            활성 탭은 시트와 같은 양피지 바탕이라 아래 시트에 이어붙는다. */}
        {view.tabs.length > 0 && (
          <nav className="mt-3 flex flex-wrap gap-1">
            {view.tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                className={cn(
                  "-mb-px rounded-t-md border border-b-0 px-3 py-1 text-xs",
                  tab.active
                    ? "border-stamp/40 bg-briefing text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:underline",
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <article
        className="doc-prose rounded-b-2xl border border-t-0 border-stamp/40 bg-briefing px-5 py-6 sm:px-8"
        dangerouslySetInnerHTML={{ __html: view.html }}
      />
    </div>
  );
}
