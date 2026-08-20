# FEAT-15: 파이프라인 대시보드에 행위자별 상세 페이지 추가

agent: admin-dev

## 현재 동작

- 사무실 책상은 개수 라벨만 있고 클릭 진입점이 없다. `PixelOffice`가 `team`을 `PixelDeskUnit`으로 매핑하고 그 아래에 `DeskReports`를 붙인다(`pixel-office.tsx:254-262`). `DeskReports`는 폴더가 있을 때 `기록 {reports.length}건` 한 줄만 렌더한다(`pixel-office.tsx:233-236`). 책상 SVG는 `role="img"` + 상태 `aria-label`만 갖고 링크가 없다(`pixel-office.tsx:128-134`). 명령 버튼(`PipelineCommandButton`)은 유닛 하단의 별도 인터랙티브 컨트롤이다(`pixel-office.tsx:150-156`).
- roster는 pages/pipeline 안에만 있다. `ROSTER`(5인 맵, `known-agents.ts:9-30`), `ROSTER_ORDER`(닫힌 ID 배열 리터럴, `known-agents.ts:32-38`), `identityFor`(`known-agents.ts:40-47`), `initialOf`(`known-agents.ts:49-52`). 소비자는 pages/pipeline 내부뿐이다(`briefing.ts:6-10,260`, `agent-avatar.tsx:2`). `known-agents.ts:1`은 "DB·fetch를 들이지 않는다"고만 명시한다(임포트 자체를 금하는 계약은 reporting.ts뿐이다).
- `.claude/agents/<id>.md`는 저장소에 6개 존재하고(pm·admin-dev·web-dev·doc-auditor·feature-scout·backend-dev, 전부 git 추적) frontmatter가 `---` 구분자 + 단일 줄 `name:`·`description:`(+선택 `tools:`/`model:`) + `---` 뒤 본문 구조다(6파일 실측). admin은 지금 이 경로를 못 읽는다 — 화이트리스트가 `docs/plans/`·`docs/agents/`만 통과시킨다(`doc-location.ts:47-56`).
- 행위자 기록은 `getAgentReports(agent)`가 contents API로 `docs/agents/<agent>`를 읽어 `AgentReport[]`(name·label·size)를 준다(`agent-report/api/queries.ts:14-30`). 폴더가 없으면 404→빈 배열이며 그것이 "아직 기록 없음"이다(`:24`). 현재 이 목록은 책상 개수 라벨과 브리핑 카드의 항목별 `DocLinks`로만 노출된다(`briefing.ts:227-242`, `pipeline/ui/index.tsx:84-102`). 실측: `docs/agents/`에 admin-dev·feature-scout·main-loop 폴더만 있다(pm·web-dev·doc-auditor는 폴더 없음 → 빈 상태 대상).
- 내부 뷰어는 `/pipeline/docs/[...slug]`다(`docs/[...slug]/page.tsx`). `reportDocHref(agent, name)`가 `/pipeline/docs/agents/<agent>/<name>`을 만들고(`doc-location.ts:61-63`), 그 라우트가 `locationFromSlug`로 화이트리스트 통과 후 렌더한다(`doc-location.ts:18-44`).
- 문서 raw 본문의 owner는 `getDocContent(path)` 하나뿐이고, fetch 직전에 `isWhitelistedDocPath(path)`로 경로를 다시 검사한다(`repo-doc/api/queries.ts:8-14`). 이 파일은 이미 등록된 fetch owner다(`verify-fsd-boundaries.mjs:37-38`).
- 마크다운 렌더러 `renderMarkdown`은 `---` 줄을 `<hr />`로 렌더한다(`markdown.ts:82`). 따라서 정의 파일을 통째로 넘기면 frontmatter가 `<hr>`로 새므로, **본문 렌더 전에 frontmatter를 떼어내야 한다.**
- `/pipeline/` 아래 라우트는 `page.tsx`(사무실)와 `docs/`(뷰어)뿐이다(실측 `ls`). `agents/` 세그먼트는 비어 있어 신규 라우트와 충돌하지 않는다.

## 문제

백로그 `source`가 지목한 문제: 사무실 라벨이 `기록 2건`처럼 개수만 보여주는데(`pixel-office.tsx:235`), 보드에서 내려간 항목의 기록(예: `docs/agents/admin-dev/FEAT-13.md`)은 화면에 **클릭 진입점이 없어** 직접 URL로만 열 수 있었다. 요구는 넷이다 — (1) 책상 클릭 → 행위자 상세(역할 = `.claude/agents/<id>.md` frontmatter description 요약 + 본문 렌더, 기록 = 기존 agent-report 목록을 내부 뷰어로 링크), (2) `agent` 파라미터는 roster 닫힌 목록으로 검증하고 밖은 notFound·문서 화이트리스트는 접두사 규칙이 아니라 roster에서 조립한 `.claude/agents/<id>.md` 정확 경로만 추가, (3) 기록 없는 행위자는 빈 상태, (4) 읽기 전용 — 새 외부 쓰기 경로 없음.

코드에서 확인한 것과 어긋나는 지점은 없다. 다만 area가 `pages/pipeline + entities/repo-doc + entities/agent-report`만 짚었으나, 실제 구현은 **새 페이지 슬라이스(`pages/agent-profile`)·새 라우트·shared roster 단일 출처**까지 닿는다 — roster를 pages/pipeline 밖(새 페이지와 repo-doc이 함께 읽을 수 있는 하위 계층)으로 내려야 하기 때문이다(아래 「대안」에 근거).

## 디자인 방향

이 화면은 새로 만드는 스크린이지만 **새 미감을 도입하지 않는다.** FEAT-04 이후 브리핑 정체성(양피지 배경·오커 도장·`font-briefing-display`)과 FEAT-14 서류철 뷰어(`.doc-prose` 양피지 시트)가 이미 이 세계의 시각 언어다. 책상을 클릭해 "그 행위자의 인사 기록철을 편다"는 은유라, 일관성이 곧 옳은 선택이다(FEAT-14가 "새 토큰 없음"으로 판단한 것과 같은 이유). 규율은 한 곳에만 쓴다 — 시그니처는 새 색이 아니라 **책상→기록철의 연속성**이다.

- **팔레트(기존 토큰만, 신규 hex 0)**: 셸 배경 `--briefing`(oklch(0.985 0.006 85) / dark 0.185), 인사 카드 바탕 `--stamp-soft`, 역할·강조 `--stamp`(오커), 본문/보조 `--foreground`/`--muted-foreground`, 경계 `--border`. `globals.css:86-90,129-133`의 기존 정의를 그대로 쓴다.
- **타이포 역할**: 행위자 핸들(대) + 섹션 라벨(`기록`/`역할 정의`, `tracking-widest text-sm text-muted-foreground`)은 `font-briefing-display`로 브리핑 헤더와 맞춘다. 정의 본문은 `.doc-prose`가 GFM 요소 스타일을 이미 소유하므로 그대로 재사용한다(`globals.css:182-273`). 기록 행 라벨은 브리핑 산세리프.
- **레이아웃 개념**: doc-viewer와 같은 `max-w-3xl` 단일 컬럼. 위에서 아래로 — ① 인사 헤더(브리핑으로 돌아가는 링크 + 핸들 + 역할 요약을 `stamp-soft` 카드에 도장처럼), ② 「기록」(실제 액션인 기록철 목록 — 각 행이 내부 뷰어로 링크, 없으면 빈 상태), ③ 「역할 정의」(정의 본문 양피지 시트 `.doc-prose`). 개수만 보이던 기록을 **본문보다 위**에 올려 진입점 문제를 정면으로 해소한다.
- **시그니처**: "인사 기록철". 역할 요약은 오커 도장 배지 은유(doc-viewer 종류 배지 `ui/index.tsx:38-47`와 같은 어휘)로 감싸고, 기록은 뽑아 읽는 서류(각 행 `{label} →`, doc-viewer 탭·`DocLinks`의 오커 화살표 어휘)로 쌓는다. 진입점(책상 클릭)은 `hover:-translate-y-0.5`로 살짝 들려 픽셀 사무실의 장난기와 이어지되, 그 한 번의 움직임 외에는 조용히 둔다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/shared/agents/roster.ts` `(신규)` | roster 닫힌 ID 목록 단일 출처 + `isRosterAgentId`·`agentDefinitionPath`·`isAgentDefinitionPath`(정확 경로 닫힌 집합)·`agentProfileHref`. 순수(임포트 없음) |
| `src/fsd/shared/agents/roster.test.mjs` `(신규)` | 위 순수 함수 계약 |
| `src/fsd/pages/agent-profile/model/build-profile-view.ts` `(신규)` | frontmatter 파싱(`parseAgentDefinition`) + 뷰 조립(`buildAgentProfileView`) |
| `src/fsd/pages/agent-profile/model/build-profile-view.test.mjs` `(신규)` | 파싱·조립 계약 |
| `src/fsd/pages/agent-profile/ui/index.tsx` `(신규)` | `AgentProfile` 렌더(헤더·기록 목록·빈 상태·정의 본문) |
| `src/fsd/pages/agent-profile/index.ts` `(신규)` | 공개 API(`AgentProfile`·`buildAgentProfileView`·타입) |
| `src/app/(protected)/pipeline/agents/[agent]/page.tsx` `(신규)` | 라우트: requireAdmin → roster 검증(밖 notFound) → 정의·기록 병렬 fetch → 뷰 렌더 |
| `src/fsd/entities/repo-doc/api/queries.ts` | `getDocContent`가 `isAgentDefinitionPath` 경로도 통과시킨다(신규 fetch owner 없음 — 기존 owner 재사용) |
| `src/fsd/entities/repo-doc/api/queries.test.mjs` | `.claude/agents/` 통과·거부 케이스 추가 |
| `src/fsd/pages/pipeline/model/known-agents.ts` | `ROSTER_ORDER`를 shared `ROSTER_AGENT_IDS`에서 파생(단일 출처) |
| `src/fsd/pages/pipeline/ui/_component/pixel-office.tsx` | 책상 아바타 SVG를 상세 페이지 `Link`로 감쌈(명령 버튼은 그대로 별도) |

여기 없는 파일은 구현 단계에서 고치지 않는다. 특히 `verify-fsd-boundaries.mjs`는 건드리지 않는다 — 정의 fetch를 기존 owner `getDocContent`로 흘리므로 fetch/db/sentry owner가 불변이고, `REQUIRED_FINAL_FILES`는 "존재하면 통과"라 신규 파일 미등록이 `verify:fsd:final`을 깨지 않는다.

## 구현 스케치

### 1) `shared/agents/roster.ts` (신규, 순수)

```ts
// 앱 전역 roster 멤버십의 단일 출처. 사무실 책상·상세 라우트·repo-doc 문서
// 화이트리스트가 모두 이 닫힌 목록에 합의한다. entities는 peer import 금지(R2)라
// repo-doc이 pages 로스터를 못 읽으므로, 셋 다 닿는 유일한 하위 계층인 shared가 집이다.
// DB·fetch·server-only를 들이지 않는다.
export const ROSTER_AGENT_IDS = [
  "pm",
  "admin-dev",
  "web-dev",
  "doc-auditor",
  "feature-scout",
] as const;

export type RosterAgentId = (typeof ROSTER_AGENT_IDS)[number];

export function isRosterAgentId(id: string): id is RosterAgentId {
  return (ROSTER_AGENT_IDS as readonly string[]).includes(id);
}

/** 이 행위자의 정의 파일 경로. roster id에서만 조립한다. */
export function agentDefinitionPath(id: RosterAgentId): string {
  return `.claude/agents/${id}.md`;
}

// 접두사/정규식이 아니라 roster에서 조립한 정확 경로의 닫힌 집합(요구 2).
// backend-dev.md는 정의 파일이 있어도 책상이 없어 여기 없다 — 진입점 없는 문서는 못 읽는다.
const AGENT_DEFINITION_PATHS: ReadonlySet<string> = new Set(
  ROSTER_AGENT_IDS.map((id) => agentDefinitionPath(id)),
);

/** getDocContent의 방어선: 이 경로가 정의 파일 화이트리스트에 있나. */
export function isAgentDefinitionPath(path: string): boolean {
  return AGENT_DEFINITION_PATHS.has(path);
}

/** 사무실 책상 → 상세 페이지 라우트. */
export function agentProfileHref(id: string): string {
  return `/pipeline/agents/${id}`;
}
```

### 2) `pages/agent-profile/model/build-profile-view.ts` (신규, 순수)

```ts
import type { AgentReport } from "~/fsd/entities/agent-report";
import { renderMarkdown, reportDocHref } from "~/fsd/entities/repo-doc";

export type ProfileRecord = { label: string; href: string };
export type AgentProfileView = {
  agentId: string;
  roleSummary: string | null; // frontmatter description
  bodyHtml: string; // 본문 렌더(frontmatter 제거 후), 없으면 ""
  hasDefinition: boolean;
  records: ProfileRecord[];
};

/** `.claude/agents/<id>.md` frontmatter를 떼어 description과 본문으로 나눈다.
 *  frontmatter가 없거나 닫히지 않으면 description=null, body=전체(fail-open to body). */
export function parseAgentDefinition(content: string): {
  description: string | null;
  body: string;
} {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") return { description: null, body: normalized };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) return { description: null, body: normalized };
  let description: string | null = null;
  for (let i = 1; i < close; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("description:")) {
      const value = line.slice("description:".length).trim();
      description = value === "" ? null : value;
      break;
    }
  }
  const body = lines.slice(close + 1).join("\n").replace(/^\n+/, "");
  return { description, body };
}

export function buildAgentProfileView(
  agentId: string,
  definitionContent: string | null,
  reports: AgentReport[],
): AgentProfileView {
  const parsed =
    definitionContent === null
      ? { description: null, body: "" }
      : parseAgentDefinition(definitionContent);
  return {
    agentId,
    roleSummary: parsed.description,
    bodyHtml: parsed.body === "" ? "" : renderMarkdown(parsed.body),
    hasDefinition: definitionContent !== null,
    records: reports.map((r) => ({
      label: r.label,
      href: reportDocHref(agentId, r.label),
    })),
  };
}
```

### 3) `pages/agent-profile/ui/index.tsx` (신규)

구조·리터럴 요점만(마크업은 doc-viewer `ui/index.tsx`와 briefing `ui/index.tsx`의 기존 패턴을 따른다). 사용자 노출 문구는 그대로 쓸 것을 아래 코드로 고정한다.

```tsx
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
```

### 4) `pages/agent-profile/index.ts` (신규)

```ts
export { AgentProfile } from "./ui";
export {
  buildAgentProfileView,
  parseAgentDefinition,
  type AgentProfileView,
  type ProfileRecord,
} from "./model/build-profile-view";
```

### 5) 라우트 `src/app/(protected)/pipeline/agents/[agent]/page.tsx` (신규)

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAgentReports } from "~/fsd/entities/agent-report/api";
import { getDocContent } from "~/fsd/entities/repo-doc/api";
import { AgentProfile, buildAgentProfileView } from "~/fsd/pages/agent-profile";
import {
  agentDefinitionPath,
  isRosterAgentId,
} from "~/fsd/shared/agents/roster";
import { requireAdmin } from "~/server/auth/guard";

export const metadata: Metadata = {
  title: "Admin Agent Profile",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AgentProfileRoute({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  await requireAdmin(); // 목적지 재검사(3중 방어선 3층)
  const { agent } = await params;
  if (!isRosterAgentId(agent)) notFound(); // 요구 2: roster 밖은 notFound

  const [definition, reports] = await Promise.all([
    getDocContent(agentDefinitionPath(agent)),
    getAgentReports(agent),
  ]);
  const view = buildAgentProfileView(agent, definition, reports);
  return (
    <main className="bg-briefing min-h-screen">
      <AgentProfile view={view} />
    </main>
  );
}
```

### 6) `entities/repo-doc/api/queries.ts` — getDocContent 화이트리스트 확장

before(`repo-doc/api/queries.ts:1-9`):

```ts
import "server-only";

import { env } from "~/env";
import { docContentUrl, plansDirUrl } from "../config/github";
import { isWhitelistedDocPath } from "../model/doc-location";

/** 화이트리스트 통과 경로의 raw 내용. 404(없음)면 null. 방어선: 경로 재검사. */
export async function getDocContent(path: string): Promise<string | null> {
  if (!isWhitelistedDocPath(path)) return null; // URL 파라미터가 fetch 경로가 되므로 여기서도 막는다
```

after:

```ts
import "server-only";

import { env } from "~/env";
import { isAgentDefinitionPath } from "~/fsd/shared/agents/roster";
import { docContentUrl, plansDirUrl } from "../config/github";
import { isWhitelistedDocPath } from "../model/doc-location";

/** 화이트리스트 통과 경로의 raw 내용. 404(없음)면 null. 방어선: 경로 재검사.
 *  docs/plans·docs/agents(뷰어)에 더해 roster 정의 파일(.claude/agents/<id>.md)을 통과시킨다. */
export async function getDocContent(path: string): Promise<string | null> {
  if (!isWhitelistedDocPath(path) && !isAgentDefinitionPath(path)) return null;
```

`doc-location.ts`는 임포트-없는 순수 파일 계약(`repo-doc/index.ts:2`)이라 손대지 않는다 — roster 의존은 shared에서 조립해 api 층에서만 합류시킨다.

### 7) `pages/pipeline/model/known-agents.ts` — ROSTER_ORDER 단일 출처화

before(`known-agents.ts:32-38`):

```ts
export const ROSTER_ORDER: readonly string[] = [
  "pm",
  "admin-dev",
  "web-dev",
  "doc-auditor",
  "feature-scout",
];
```

after(파일 상단에 임포트 1줄 추가 + 리터럴을 파생으로 교체):

```ts
import { ROSTER_AGENT_IDS } from "~/fsd/shared/agents/roster";
// ...(기존 ROSTER 맵·타입은 그대로)
export const ROSTER_ORDER: readonly string[] = ROSTER_AGENT_IDS;
```

책상 순서(=클릭 가능한 행위자=화이트리스트)가 shared 닫힌 목록과 한 출처가 된다. `known-agents.ts:1`의 "DB·fetch를 들이지 않는다"는 순수 상수 임포트라 유지된다. `identityFor`·`initialOf`·`ROSTER`·`AgentIdentity`는 그대로라 `briefing.ts`·`agent-avatar.tsx`·`briefing.test.mjs`는 무변경이다.

### 8) `pages/pipeline/ui/_component/pixel-office.tsx` — 책상 진입점

before(`pixel-office.tsx:128-134`, SVG 여는 태그):

```tsx
      <svg
        viewBox="-32 0 160 132"
        role="img"
        aria-label={`${member.identity.handle} — ${member.state}`}
        shapeRendering="crispEdges"
        className="w-full"
      >
```

after(SVG를 Link로 감싼다 — svg는 장식으로 내리고 링크가 접근명을 갖는다):

```tsx
      <Link
        href={agentProfileHref(member.identity.id)}
        aria-label={`${member.identity.handle} 상세 — ${member.state}`}
        className="block w-full transition-transform hover:-translate-y-0.5"
      >
        <svg
          viewBox="-32 0 160 132"
          aria-hidden="true"
          shapeRendering="crispEdges"
          className="w-full"
        >
```

닫는 `</svg>` 뒤에 `</Link>`를 더한다. `Link`(`next/link`)와 `agentProfileHref`(`~/fsd/shared/agents/roster`) 임포트를 파일 상단에 추가한다. 명령 버튼·명패·heldId 칩·`DeskReports` 개수 라벨은 그대로다(오피스 화면은 지금처럼 개수만 유지 — 확정 결정).

## 테스트

- **덮는 것** (`*.test.mjs`, Node 러너·module mock):
  - `shared/agents/roster.test.mjs`: `isRosterAgentId`(5 수용 / `backend-dev`·`main-loop`·`""`·`PM`·`admin`·`../pm` 거부), `agentDefinitionPath`(정확히 `.claude/agents/<id>.md`), `isAgentDefinitionPath`(5 정확 경로 수용 / `.claude/agents/backend-dev.md`·`.claude/agents/main-loop.md`·`.claude/agents/pm`·`.claude/agents/pm.mdx`·`.claude/agents/../secret.md`·`docs/plans/FEAT-15.md` 거부 — 접두사 아님을 고정), `agentProfileHref`.
  - `pages/agent-profile/model/build-profile-view.test.mjs`: `parseAgentDefinition`(실제 frontmatter → description 추출·내부 `→`/마침표 보존·본문이 `---` 뒤부터, frontmatter 없는 입력 → null+전체, 여는 `---`만 있고 안 닫힘 → null+전체(fail-open, 크래시 없음), CRLF 정규화, `description:` 값 공백 → null). `buildAgentProfileView`(정의 null → roleSummary null·bodyHtml ""·hasDefinition false·records는 그대로 조립, reports 매핑 → `reportDocHref(agentId, label)` href·label, 본문 있을 때 bodyHtml에 `<h1>` 포함). mock 불필요(shared·repo-doc index·agent-report index 모두 순수, server-only 미전이).
  - `entities/repo-doc/api/queries.test.mjs`(기존 파일에 케이스 추가): `getDocContent`가 `.claude/agents/admin-dev.md`를 통과시켜 `docContentUrl`로 fetch·본문 반환, `.claude/agents/backend-dev.md`는 fetch 없이 null(`calls.length===0`), `.claude/agents/../secret.md`도 fetch 없이 null. 기존 docs/plans 케이스는 회귀 가드로 유지(기존 mock: server-only·env·globalThis.fetch 그대로).
- **못 덮는 범위** (현재 러너 밖 — 배포 후 데스크톱+폰 수동 스모크):
  - 라우트(`requireAdmin` 게이트·`notFound`·`Promise.all` fetch 배선)와 `AgentProfile` React 렌더·`dangerouslySetInnerHTML`·`.doc-prose` 시각·빈 상태 렌더·`Link` 이동.
  - `pixel-office` 책상 `Link` hover 들림·접근명·중첩 인터랙티브(명령 버튼과 링크 분리) — DOM/시각.
  - raw CDN이 `dev` 브랜치의 `.claude/agents/*.md`를 실제로 서빙하는지(네트워크) — 실측은 배포 후. 정의 파일 6개는 이미 git 추적이라 파일 생성은 불필요하다.
  - Next.js가 `/pipeline/agents/[agent]`를 `/pipeline/docs/[...slug]`와 나란히 라우팅하는지 — `verify:fsd:final`·`build`가 컴파일은 덮고, 실제 진입은 수동 스모크.

## 범위 밖 의존

없음. 전부 `apps/admin/src`(+ 신규 라우트·신규 페이지 슬라이스·shared roster) 안에서 끝난다. `packages/db`·다른 워크스페이스를 건드리지 않는다. 새 외부 쓰기 경로 없음 — 정의는 기존 fetch owner `getDocContent`(GET)로, 기록은 기존 `getAgentReports`(contents GET)로 읽으며 둘 다 읽기 전용이다(요구 4). `verify-fsd-boundaries.mjs`의 fetch/db/sentry owner는 불변이라 경계 스크립트를 고치지 않는다.

## 대안

- **정의 fetch를 위한 새 entity `entities/agent` + 전용 fetch owner**: 기각. `verify-fsd-boundaries.mjs`의 owner 목록 변경 + 전용 contract test + rule mutation fixture가 필요해 무겁고, 확정 결정이 "문서 fetch 화이트리스트 확장"(= 기존 doc fetch 재사용)이라 어긋난다.
- **repo-doc에 roster ID를 복제하고 contract test로 동기화**: 기각. "roster에서 조립"(단일 출처)이 아니라 두 목록을 맞추는 것이라 드리프트 위험이 남는다.
- **화이트리스트를 `doc-location.ts`에 넣기**: 기각. 그 파일은 임포트-없는 순수 계약(`repo-doc/index.ts:2`)이라 roster를 들일 수 없다. roster는 shared에 두고 api 층(`queries.ts`)에서만 합류시킨다.
- **roster를 새 `entities/agent`에 두기**: 기각. entities는 peer import 금지(R2)라 `repo-doc`이 그것을 못 읽는다. entity와 pages 둘 다 닿는 유일한 하위 계층은 shared뿐이다 — 그래서 닫힌 ID 목록을 `shared/agents/roster.ts`에 둔다(CLAUDE.md의 shared 서술이 "generic"이라 약간의 확장이지만, 의존 없는 멤버십 상수이고 다른 집은 규칙을 깬다).
- **상세 페이지 헤더에 rich 역할 라벨(사무실 roster의 `role`) 표시**: 기각. pages/pipeline 내부를 공개 API로 노출하거나 rich identity를 shared로 옮겨야 한다. 확정 결정이 역할 출처를 frontmatter description으로 못 박았고, description이 `role`("어드민 개발")보다 풍부하다. 헤더는 `agentId`(핸들) + description으로 간다.
- **doc-viewer 페이지 재사용**: 기각. 상세 페이지는 역할 요약 + 기록 목록 + roster 검증이라 단일 문서 렌더인 doc-viewer와 조합이 다르다. 기록 항목의 링크 대상으로만 doc-viewer를 재사용한다.
