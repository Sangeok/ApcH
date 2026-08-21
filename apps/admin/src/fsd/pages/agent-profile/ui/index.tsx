import Link from "next/link";
import type { AgentProfileView } from "../model/build-profile-view";

export function AgentProfile({ view }: { view: AgentProfileView }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="rounded-2xl border border-stamp/40 bg-stamp-soft p-5">
        <Link
          href="/pipeline"
          className="font-briefing-display text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ← 브리핑
        </Link>
        <h1 className="mt-2 font-briefing-display text-3xl text-foreground">
          {view.agentId}
        </h1>
        {view.roleSummary !== null && (
          <p className="mt-2 text-sm text-stamp">{view.roleSummary}</p>
        )}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="font-briefing-display text-sm tracking-widest text-muted-foreground">
          기록
        </h2>
        {view.records.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 기록이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {view.records.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  className="text-sm text-stamp underline-offset-2 hover:underline"
                >
                  {r.label} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.bodyHtml !== "" && (
        <section className="flex flex-col gap-2">
          <h2 className="font-briefing-display text-sm tracking-widest text-muted-foreground">
            역할 정의
          </h2>
          <article
            className="doc-prose rounded-2xl border border-stamp/40 bg-briefing px-5 py-6 sm:px-8"
            dangerouslySetInnerHTML={{ __html: view.bodyHtml }}
          />
        </section>
      )}
    </div>
  );
}
