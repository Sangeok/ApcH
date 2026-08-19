# FEAT-14: `/pipeline` 기록 열람을 대시보드 안에서 — 항목 축 재배치 + 내부 문서 뷰어

agent: admin-dev

## 현재 동작

- `/pipeline` 라우트(`src/app/(protected)/pipeline/page.tsx:16-29`)는 `requireAdmin()` 뒤에서 `getPipelineBoard()`와 `getAgentReportIndex()`를 병렬로 읽어 `buildBriefing(sections, new Date())`로 브리핑을 만들고 `PipelineBriefing`에 넘긴다. `force-dynamic`이다(`:14`).
- `getAgentReportIndex()`(`src/fsd/entities/agent-report/api/queries.ts:37-62`)는 **`docs/agents/`만** 훑는다 — 부모 디렉터리를 contents API로 읽어 `type === "dir"`인 하위 폴더를 알아낸 뒤 각 폴더를 병렬로 읽어 `Map<행위자, AgentReport[]>`를 만든다. `docs/plans/`는 어디서도 읽지 않는다.
- 책상 아래 `DeskReports`(`src/fsd/pages/pipeline/ui/_component/pixel-office.tsx:232-248`)는 그 행위자의 보고서를 `<details>` 안에 **파일명(label) 평문 목록**으로 전부 나열한다. 링크가 없어 클릭해 열 수 없고, 목록은 append-only 규약이라 계속 자란다. `PixelOffice`(`:251-279`)가 `reports.get(member.identity.id)`로 각 책상에 넘긴다.
- roster(`src/fsd/pages/pipeline/model/known-agents.ts:32-38`)는 `pm·admin-dev·web-dev·doc-auditor·feature-scout` 다섯뿐이지만, 보고 행위자 규약은 `main-loop·admin-dev·web-dev·backend-dev·doc-auditor·feature-scout` 여섯이다(`docs/agents/README.md:16-27`). 따라서 `main-loop` 기록은 현재 어느 책상에도 매핑되지 않고 화면에서 버려지며, 첫 `backend-dev` 보고서가 생기면 같은 책상 누락이 생긴다. 이 계획의 항목 링크는 roster가 아니라 report index 전체를 사용해 둘의 `<ID>.md`를 모두 노출한다.
- 결재함 카드 `InboxCard`(`src/fsd/pages/pipeline/ui/index.tsx:140-193`)와 보고 피드 `FeedZone`(`:195-234`)은 항목 ID·status·발화·근거만 보여준다. **그 항목의 계획서/기록으로 가는 링크가 없다** — 계획서·기록을 읽으려면 GitHub로 이탈해야 한다.
- `SpeechItem`(`src/fsd/pages/pipeline/model/briefing.ts:12-24`)에 문서 링크 필드가 없다. `buildBriefing`(`:210-230`)은 보드만 입력으로 받는다.
- 문서를 렌더하는 라우트가 없다. `src/app/(protected)/`에는 `analytics·observability·pipeline` 세 페이지뿐이고 문서 뷰어가 없다.
- 마크다운 렌더러 의존성이 없다(`apps/admin/package.json:21-42`에 `marked`·`react-markdown`·`remark`류 없음).
- production fetch owner는 다섯이다(`scripts/verify-fsd-boundaries.mjs:32-38`): pipeline board GET·command POST·progress GET·gate GET/PUT·agent-report GET. `--final` 모드는 이 집합과 실제 tree의 fetch 호출부가 **정확히 일치**해야 통과한다(`:665-676`). 승인되지 않은 fetch 호출부는 `[R13] network call is outside the approved fetch owners`(`:580-591`).

## 문제

백로그 FEAT-14 발주 계약(관측 1~3)이 지목하는 것: (1) 책상 아래 파일명 나열은 링크가 없어 열 수 없고 무한히 자란다(`pixel-office.tsx:232-248`). (2) `getAgentReportIndex()`가 읽는 `main-loop` 검증 기록이 roster에 없어 화면에 안 나온다(`known-agents.ts:32-38`). (3) 기록의 실제 소비 시점은 게이트 결정인데, 지금은 항목 카드에서 계획서·기록으로 가는 길이 없어 GitHub로 이탈해야만 읽는다(`pipeline/ui/index.tsx:140-234`).

요구(백로그 core 1~5)는 **항목 축 재배치 + 내부 뷰어**다: 항목 카드에 실재하는 문서 링크(계획서·행위자 기록)를 놓고(1), dev 브랜치 raw CDN에서 서버 fetch해 GFM 렌더하는 뷰어 라우트를 만들고(2), 경로에서 유도한 종류 배지와 항목 ID를 헤더로 보이고(3), `docs/plans/`·`docs/agents/` 밖 경로는 렌더하지 않으며(4·URL 파라미터가 fetch 경로가 되므로 화이트리스트가 보안 경계다), GitHub 원문 링크를 두고 책상 아래는 파일명 나열을 없애 "기록 N건"만 남긴다(5).

**백로그와 코드가 어긋나는 지점 하나**: 요구 1은 "실재 판별은 이미 fetch하는 report index 재사용(신규 요청 0)"이라 하지만, 그 index(`getAgentReportIndex`)는 **`docs/agents/`만** 본다(`queries.ts:37-62`). 계획서는 `docs/plans/`에 살아 그 index로는 실재를 알 수 없다. 보드 status로 추론하는 것도 불가하다 — 완료 항목 중 FEAT-11·FEAT-12는 사후 기록이라 계획서가 없다(보드 `:55-60`). 따라서 계획서 실재 판별에는 `docs/plans/` 목록 1회가 **불가피**하다. 이 계획은 "신규 요청 0"을 **카드별 추가 요청 0**으로 해석해 고정한다: page-load당 plans index 요청은 정확히 1회 추가하고, 카드 수에 따라 요청 수가 늘어나지 않는다. 상세는 「대안」·「범위 밖 의존」.

## 디자인 방향

이 뷰어는 브리핑 세계 **안**의 화면이다 — 팔레트를 새로 만들지 않고 FEAT-04 이후 확립된 브리핑 정체성(양피지+도장 잉크+명조 디스플레이)을 문서 열람 문맥으로 확장한다. 새 팔레트를 한 서브라우트에만 들이면 정체성이 갈라진다. 이 결정은 셀프 비평의 결과다: "따뜻한 크림+세리프+테라코타"는 AI 기본값이지만, 여기서는 **기본값이 아니라 이미 승인된 시스템**(`globals.css:85-90`의 stamp/parchment 토큰)의 일관 적용이다. 차별점은 팔레트가 아니라 아래 시그니처 구조에 둔다.

**팔레트**(전부 기존 토큰, `globals.css`) — `--briefing`(양피지 바탕, `:90`) · `--stamp`(오커 잉크·제목/계획 배지, `:85`) · `--stamp-soft`(연양피지·배지 바탕, `:86`) · `--active`(청색·계획서 링크와 검증, `:87`) · `--hold`(러스트·보고서 append 배지, `:89`) · `--silence`/`--muted-foreground`(본문 보조·완료). `--picked`(클립 전용)와 `--destructive`는 재사용 안 함(globals 주석 규약).

**타이포 역할** — 세 역할의 의도된 대비: (1) **명조 디스플레이**(`font-briefing-display`, Gowun Batang, `:11-12`) = 문서 제목·컨텍스트 헤더·렌더된 `##` 제목 → "공문서" 질감. (2) **산세리프 본문**(`font-sans`, Pretendard, `:7-10`) = 렌더된 문단·표 셀 → 밀도 높은 한국어 기술 문서의 가독성. (3) **모노**(`ui-monospace`) = 코드 펜스·인라인 코드·`파일:줄` 토큰. 명조가 구조를, 산세리프가 내용을, 모노가 데이터를 나른다.

**레이아웃 개념** — 책상에서 꺼낸 한 장의 공문서. `max-w-3xl` 단일 컬럼 "문서 시트"(양피지 바탕) 위에 "서류철 헤더" 띠를 얹는다. 헤더는 종류 배지 + 항목 ID/제목 + (항목이면) 보드 상태 칩과 게이트②·반려 버튼 + 형제 문서 탭 + GitHub 원문 링크를 담는다.

```
┌──────────────────────────────────────────────┐
│ ← 브리핑                          GitHub 원문 ↗ │
│ ┌계획서┐ ┌검증 기록┐ ┌구현 보고┐   ← 서류철 탭    │  ← 시그니처(활성 탭이 시트에 붙는다)
│ ╱계획서·현재계약╲   FEAT-14        [검토대기] 도장 반려 │  ← 종류 배지(도장풍) + 상태 칩 + 게이트
│════════════════════════════════════════════════│  ← 활성 탭과 시트를 잇는 선
│  # 제목 (명조)                                   │
│  본문 문단 (산세리프)                             │  ← 렌더된 GFM: 제목=명조, 본문=산세리프,
│  | 표 | 셀 |   ``` 코드 ```(모노)                 │     표=하드라인 테두리, 인용=오커 좌측 룰
└──────────────────────────────────────────────┘
```

**시그니처 요소** — "서류철 탭 + 고무도장 종류 배지". 형제 문서(계획서/검증 기록/구현 보고, 항목에 묶인 감사·정찰 보고가 실재하면 그 뒤)를 물리적 파일 탭으로 보이고 활성 탭이 아래 시트에 이어붙는 마닐라 폴더 은유가, 항목의 문서 생애(계획→검증→구현→후속 감사·정찰)를 **구조로 인코딩**한다("structure is information"). 종류 배지는 도장 은유의 연장이다: 계획서=오커 잉크 실선 도장 "현재 계약 하나만 유효", 보고서=러스트 겹층 "append 누적 기록". 대비를 이 한 곳에 쓰고 나머지는 조용히 둔다.

**카피**(사용자 노출, 앱 언어 그대로) — 배지 `계획서 · 현재 계약` / `보고서 · 누적 기록`. 탭·카드 링크 라벨 `계획서`·`검증 기록`·`구현 보고`·`감사 보고`·`정찰 보고`(뒤의 둘은 `docs/agents/<행위자>/<ID>.md`가 실재할 때만). 뒤로가기 `← 브리핑`. 원문 `GitHub 원문 ↗`. 없음 상태: 전용 카피 없음 — 화이트리스트 밖·미존재는 `notFound()`가 Next 기본 404를 띄운다(전용 not-found.tsx를 만들지 않으므로 그 화면의 문구는 이 항목의 카피가 아니다). 카드 링크는 각 라벨 뒤에 ` →`. 책상 `기록 N건`.

**모션** — 없음(사내 문서 리더). 탭 hover 밑줄과 기존 도장 버튼 transition만. reduced-motion은 자명하게 준수(추가 모션 없음).

## 고칠 파일

**파일시스템 preflight** — 현재 tree에는 `src/fsd/entities/repo-doc/`, `src/fsd/pages/doc-viewer/`, `src/app/(protected)/pipeline/docs/`가 모두 없고 아래 신규 파일과 충돌하는 경로도 없다. 구현은 파일을 쓰기 전에 `src/fsd/entities/repo-doc/{config,model,api}/`, `src/fsd/pages/doc-viewer/{model,ui}/`, `src/app/(protected)/pipeline/docs/[...slug]/` 디렉터리를 이 순서로 만든다. 각각의 기존 상위 `src/fsd/entities/`, `src/fsd/pages/`, `src/app/(protected)/pipeline/`은 실재한다. 이동·이름 변경·파일 삭제는 없으며, `DeskReports`의 기존 파일명 목록 마크업만 같은 파일 안에서 교체한다.

| 파일 | 변경 |
| --- | --- |
| `src/fsd/entities/repo-doc/config/github.ts` `(신규)` | raw 내용 URL·plans 디렉터리 URL·GitHub blob 원문 URL 상수(owner/repo/branch는 pipeline과 동일) |
| `src/fsd/entities/repo-doc/model/doc-location.ts` `(신규)` | 순수: slug→경로 화이트리스트(`locationFromSlug`), 경로 화이트리스트 재검사(`isWhitelistedDocPath`), href 빌더, `docLinksForItem` |
| `src/fsd/entities/repo-doc/model/doc-location.test.mjs` `(신규)` | 위 순수 함수 계약 |
| `src/fsd/entities/repo-doc/model/markdown.ts` `(신규)` | 순수: `escapeHtml`·`renderInline`·`renderMarkdown`(GFM 부분집합 → sanitized HTML 문자열) |
| `src/fsd/entities/repo-doc/model/markdown.test.mjs` `(신규)` | 렌더·이스케이프·XSS 방어 계약 |
| `src/fsd/entities/repo-doc/api/queries.ts` `(신규)` | 서버: `getDocContent`(raw fetch·404→null·화이트리스트 가드)·`getPlanDocIds`(contents 목록). **신규 fetch owner** |
| `src/fsd/entities/repo-doc/api/queries.test.mjs` `(신규)` | `server-only`·`~/env` module mock + `globalThis.fetch` stub/restore로 호출 계약 |
| `src/fsd/entities/repo-doc/api/index.ts` `(신규)` | api segment public entry(`getDocContent`·`getPlanDocIds`) |
| `src/fsd/entities/repo-doc/index.ts` `(신규)` | slice root: model·config만 재수출(api는 재수출 안 함, agent-report 패턴) |
| `src/fsd/pages/doc-viewer/model/build-doc-view.ts` `(신규)` | 순수: `dossierTabs`·`buildDocView`(헤더 메타 + `renderMarkdown` 합성) |
| `src/fsd/pages/doc-viewer/model/build-doc-view.test.mjs` `(신규)` | 탭·배지·상태/게이트/반려·고정명 문서 계약 |
| `src/fsd/pages/doc-viewer/ui/index.tsx` `(신규)` | `DocViewer`(서버 컴포넌트): 서류철 헤더 + `dangerouslySetInnerHTML` 시트 |
| `src/fsd/pages/doc-viewer/index.ts` `(신규)` | page root: `DocViewer`·`buildDocView`·타입 |
| `src/app/(protected)/pipeline/docs/[...slug]/page.tsx` `(신규)` | 뷰어 라우트: `requireAdmin`·`force-dynamic`·slug 검증·fetch·렌더 |
| `src/fsd/entities/pipeline/model/board.ts` | 순수 `latestItemById(sections, id)` 추가(첫 등장=최신 규칙) |
| `src/fsd/entities/pipeline/model/board.test.mjs` | `latestItemById` 케이스 |
| `src/fsd/entities/pipeline/index.ts` | `latestItemById` 재수출 |
| `src/fsd/pages/pipeline/model/briefing.ts` | `SpeechItem.docs` 추가, `buildBriefing`에 선택적 `docs` 인자, 링크 계산 |
| `src/fsd/pages/pipeline/model/briefing.test.mjs` | 문서 링크 단언 추가 |
| `src/fsd/pages/pipeline/ui/index.tsx` | `InboxCard`·`FeedZone`에 `DocLinks` 렌더(`next/link`) |
| `src/fsd/pages/pipeline/ui/_component/pixel-office.tsx` | `DeskReports`를 파일명 목록 → "기록 N건" 텍스트로 교체 |
| `src/app/(protected)/pipeline/page.tsx` | `getPlanDocIds()`를 병렬 fetch에 추가, `buildBriefing`에 `{ planDocIds, reports }` 전달 |
| `src/styles/globals.css` | `.doc-prose` 요소 스타일(명조 제목·산세리프 본문·모노 코드·하드라인 표·오커 인용) |
| `scripts/verify-fsd-boundaries.mjs` | `FSD_EFFECT_OWNERS.fetch`에 repo-doc owner 추가, `REQUIRED_FINAL_FILES`에 신규 index·뷰어 라우트 추가 |
| `scripts/verify-fsd-boundaries.test.mjs` | 신규 owner contract test + owner 누락 시 R13 mutation fixture |

여기 없는 파일은 구현 단계에서 고치지 않는다. 더 필요해지면 `보류`로 기록하고 멈춘다.

## 구현 스케치

### 1) `entities/repo-doc/config/github.ts` (신규)

```ts
// 순수 상수. pipeline/config/github.ts와 owner/repo/branch가 같아야 한다(같은 저장소·브랜치).
const GITHUB_OWNER = "Sangeok";
const GITHUB_REPO = "ApcH";
const DOC_BRANCH = "dev";

/** raw CDN: 파일 내용은 준다. 디렉터리는 404(agent-report와 같은 실측). 토큰 불필요(public). */
export function docContentUrl(path: string): string {
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${DOC_BRANCH}/${path}`;
}
/** 계획서 실재 판별용 목록. contents API(디렉터리는 raw로 불가). */
export function plansDirUrl(): string {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/docs/plans?ref=${DOC_BRANCH}`;
}
/** 렌더 한계의 탈출구(백로그 요구 5). blob 뷰. */
export function docSourceUrl(path: string): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${DOC_BRANCH}/${path}`;
}
```

### 2) `entities/repo-doc/model/doc-location.ts` (신규) — 순수, 임포트 없음

```ts
export type DocKind = "plan" | "report";
export type DocLocation = {
  path: string;          // 저장소 상대 경로 (docs/plans/FEAT-14.md)
  kind: DocKind;
  itemId: string | null; // 항목 문서면 ID, 고정명 문서(감사기록 등)면 null
  agent: string | null;  // 보고서면 행위자, 계획서면 null
};
export type DocLink = { label: string; href: string; kind: DocKind };

const SEGMENT_RE = /^[\w.가-힣-]+$/u; // \w=[A-Za-z0-9_]; FEAT-14·admin-dev·감사기록 통과
const ITEM_ID_RE = /^[A-Z]+-\d+$/;

function safeSegment(seg: string): boolean {
  return SEGMENT_RE.test(seg) && seg !== "." && !seg.includes("..");
}

/** slug(catch-all) → 화이트리스트 통과 경로. 밖이면 null(호출부가 notFound). */
export function locationFromSlug(slug: string[]): DocLocation | null {
  if (slug.length < 2 || !slug.every(safeSegment)) return null;
  const root = slug[0];
  const rest = slug.slice(1);
  if (root === "plans") {
    if (rest.length !== 1) return null;
    const file = rest[0] ?? "";
    return {
      path: `docs/plans/${file}.md`,
      kind: "plan",
      itemId: ITEM_ID_RE.test(file) ? file : null,
      agent: null,
    };
  }
  if (root === "agents") {
    if (rest.length !== 2) return null;
    const agent = rest[0] ?? "";
    const file = rest[1] ?? "";
    return {
      path: `docs/agents/${agent}/${file}.md`,
      kind: "report",
      itemId: ITEM_ID_RE.test(file) ? file : null,
      agent,
    };
  }
  return null;
}

/** api 층의 방어선(defense in depth): fetch 직전에 경로를 다시 검사한다. */
export function isWhitelistedDocPath(path: string): boolean {
  const plan = /^docs\/plans\/([\w.가-힣-]+)\.md$/u.exec(path);
  if (plan !== null) return safeSegment(plan[1] ?? "");
  const report = /^docs\/agents\/([\w.가-힣-]+)\/([\w.가-힣-]+)\.md$/u.exec(path);
  return (
    report !== null &&
    safeSegment(report[1] ?? "") &&
    safeSegment(report[2] ?? "")
  );
}

export function planDocHref(id: string): string {
  return `/pipeline/docs/plans/${id}`;
}
export function reportDocHref(agent: string, name: string): string {
  return `/pipeline/docs/agents/${agent}/${name}`;
}
const REPORT_LABEL: Record<string, string> = {
  "main-loop": "검증 기록",
  "admin-dev": "구현 보고",
  "web-dev": "구현 보고",
  "backend-dev": "구현 보고",
  "doc-auditor": "감사 보고",
  "feature-scout": "정찰 보고",
};
// docs/agents/README.md의 보고 행위자 닫힌 목록(pm은 폴더 없음).
// 결정적 순서: 계획→검증→구현→감사→정찰.
const DOC_LINK_AGENTS: readonly string[] = [
  "main-loop", "admin-dev", "web-dev", "backend-dev", "doc-auditor", "feature-scout",
];

/** 항목 ID의 형제 문서 링크. AgentReport 타입에 의존하지 않도록 원시값만 받는다
 *  — entities peer import(agent-report) 금지를 피하기 위함. */
export function docLinksForItem(
  id: string,
  hasPlan: boolean,
  agentsWithDoc: ReadonlySet<string>,
): DocLink[] {
  const links: DocLink[] = [];
  if (hasPlan) links.push({ label: "계획서", href: planDocHref(id), kind: "plan" });
  for (const agent of DOC_LINK_AGENTS) {
    if (agentsWithDoc.has(agent)) {
      links.push({ label: REPORT_LABEL[agent] ?? "기록", href: reportDocHref(agent, id), kind: "report" });
    }
  }
  return links;
}
```

### 3) `entities/repo-doc/model/markdown.ts` (신규) — 순수, 임포트 없음

신뢰된 사내 문서(자기 저장소·admin 전용)를 GFM 부분집합으로 렌더한다. **모든 텍스트는 escape하고 화이트리스트 구조 태그만 방출한다 — 원문의 원시 HTML은 통과시키지 않는다.** 미지원 문법(중첩 리스트는 평면화·이미지·참조 링크)은 GitHub 원문 링크가 탈출구다(요구 5). 표 셀의 `\|` 이스케이프는 지원한다(아래 `splitRow`) — 표 **밖**의 백슬래시 이스케이프(`\*`·`\_` 등)는 지원하지 않아 역슬래시가 그대로 보인다. 표 안에서 이스케이프하지 않은 파이프는 인라인 코드 안이라도 셀을 쪼갠다 — 이는 GFM 명세와 GitHub의 동작이 같으므로 결함이 아니다(`FEAT-07.md:91`이 실제로 그렇다). `noUncheckedIndexedAccess` 때문에 배열 접근은 전부 `?? ""`로 보정한다.

```ts
// 인라인 코드 자리를 표시하는 구분자. 원문 NUL은 먼저 U+FFFD로 정규화한 뒤
// 자리표시자를 삽입해 평문과 충돌하지 않게 한다 — 공백-숫자-공백(" 0 ") 자리표시자는
// "결함 0 건" 같은 평문을 코드 복원 단계에서 조용히 삭제한다("결함 0 건"→"결함건",
// 검증 라운드 실행 실측).
const CODE_SLOT = String.fromCharCode(0);
const CODE_SLOT_RE = new RegExp(`${CODE_SLOT}(\\d+)${CODE_SLOT}`, "g");

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 인라인: 코드 → escape → 링크 → 볼드 → 이탤릭 → 코드 복원. */
export function renderInline(text: string): string {
  const codes: string[] = [];
  let s = text.replaceAll(CODE_SLOT, "\uFFFD").replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `${CODE_SLOT}${codes.length - 1}${CODE_SLOT}`;
  });
  s = escapeHtml(s);
  // 링크: http(s)·단일 슬래시 루트상대(/)만 허용. //host·javascript:는 평문으로 둔다.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
    if (!/^https?:\/\//.test(url) && !/^\/(?!\/)/.test(url)) return m;
    return `<a href="${url}" target="_blank" rel="noreferrer noopener">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  return s.replace(CODE_SLOT_RE, (_m, i: string) => codes[Number(i)] ?? "");
}

/** 블록 스캐너: 코드펜스·제목·hr·인용·GFM 표·목록·문단. */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const para: string[] = [];
  const flush = () => {
    if (para.length > 0) {
      out.push(`<p>${renderInline(para.join(" "))}</p>`);
      para.length = 0;
    }
  };
  // GFM은 셀 안의 리터럴 파이프를 `\|`로 이스케이프한다. 비이스케이프 파이프에서만
  // 쪼갠 뒤 셀 안에서 되돌린다. 이 저장소의 계획서가 실제로 이 문법을 쓴다 —
  // 순진하게 split("|")하면 BUG-05·FEAT-06·FEAT-13의 표 5행이 열이 밀려 렌더된다
  // (검증 라운드에서 실측: 표 148행 중 5행 파손, 수정 후 0행·회귀 0).
  // 끝 파이프 제거도 이스케이프를 봐야 한다 — 안 그러면 `...\|`로 끝나는 행에서
  // 파이프만 떨어져 나가고 역슬래시가 남는다.
  const splitRow = (row: string) =>
    row
      .replace(/^\s*\|/, "")
      .replace(/(?<!\\)\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replaceAll("\\|", "|"));

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    // 정규식이 아니라 startsWith/includes를 쓰는 이유는 취향이 아니라 게이트다 —
    // `/^\`\`\`/.test(line)`·`/-/.test(next)`는 stylisticTypeChecked의
    // prefer-string-starts-ends-with·prefer-includes에 걸려 `check`의 lint 0 기준을 깬다
    // (검증 라운드에서 실제 ESLint 실행으로 확인. 동작은 동일 — 문서 18개 421KB 출력 바이트 일치).
    if (line.startsWith("```")) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) { body.push(lines[i] ?? ""); i++; }
      i++; // 닫는 ```
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = (heading[1] ?? "#").length;
      out.push(`<h${level}>${renderInline((heading[2] ?? "").trim())}</h${level}>`);
      i++; continue;
    }
    if (/^(---+|\*\*\*+|___+)\s*$/.test(line)) { flush(); out.push("<hr />"); i++; continue; }
    if (/^>\s?/.test(line)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) { body.push((lines[i] ?? "").replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${renderInline(body.join(" "))}</blockquote>`);
      continue;
    }
    // GFM 표: 헤더 + 구분행(| --- | --- |)
    const next = lines[i + 1] ?? "";
    if (line.includes("|") && next.includes("-") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(next)) {
      flush();
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim() !== "") {
        rows.push(splitRow(lines[i] ?? "")); i++;
      }
      const thead = `<thead><tr>${headers.map((h) => `<th>${renderInline(h)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? "")) { items.push((lines[i] ?? "").replace(/^\s*[-*+]\s+/, "")); i++; }
      out.push(`<ul>${items.map((it) => `<li>${renderInline(it)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) { items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, "")); i++; }
      out.push(`<ol>${items.map((it) => `<li>${renderInline(it)}</li>`).join("")}</ol>`);
      continue;
    }
    if (line.trim() === "") { flush(); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flush();
  return out.join("\n");
}
```

### 4) `entities/repo-doc/api/queries.ts` (신규) — 서버, **신규 fetch owner**

```ts
import "server-only";

import { env } from "~/env";
import { docContentUrl, plansDirUrl } from "../config/github";
import { isWhitelistedDocPath } from "../model/doc-location";

/** 화이트리스트 통과 경로의 raw 내용. 404(없음)면 null. 방어선: 경로 재검사. */
export async function getDocContent(path: string): Promise<string | null> {
  if (!isWhitelistedDocPath(path)) return null; // URL 파라미터가 fetch 경로가 되므로 여기서도 막는다
  const res = await fetch(docContentUrl(path), { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch doc (${path}): ${res.status}`);
  return res.text();
}

/** docs/plans/ 목록 → 항목 ID 집합(계획서 실재 판별). contents API 1회. */
export async function getPlanDocIds(): Promise<Set<string>> {
  const token = env.GITHUB_PIPELINE_TOKEN;
  const res = await fetch(plansDirUrl(), {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
  });
  if (res.status === 404) return new Set();
  if (!res.ok) throw new Error(`Failed to fetch plan index: ${res.status}`);
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return new Set();
  const ids = new Set<string>();
  for (const e of raw as { type?: unknown; name?: unknown }[]) {
    if (e === null || typeof e !== "object") continue;
    if (e.type !== "file" || typeof e.name !== "string") continue;
    const m = /^([A-Z]+-\d+)\.md$/.exec(e.name); // FEAT-14.md → FEAT-14; README.md·template.md 제외
    if (m?.[1] !== undefined) ids.add(m[1]); // 옵셔널 체이닝 — `m && m[1]`은 prefer-optional-chain 위반
  }
  return ids;
}
```

`api/index.ts`: `export { getDocContent, getPlanDocIds } from "./queries";`
`index.ts`(slice root): `export { locationFromSlug, isWhitelistedDocPath, planDocHref, reportDocHref, docLinksForItem, type DocKind, type DocLink, type DocLocation } from "./model/doc-location"; export { renderMarkdown, escapeHtml, renderInline } from "./model/markdown"; export { docContentUrl, plansDirUrl, docSourceUrl } from "./config/github";` — `docSourceUrl`은 **config에서만** 나간다(doc-location에서 겹쳐 재수출하면 TS 중복 export 오류; doc-location은 임포트 없는 순수 파일로 유지). **api는 재수출하지 않는다**(agent-report/index.ts:1-6 패턴, 서버 쿼리는 `~/fsd/entities/repo-doc/api`로 직접 임포트).

### 5) `pages/doc-viewer/model/build-doc-view.ts` (신규) — 순수

```ts
import type { AgentReport } from "~/fsd/entities/agent-report";
import type { BoardItem } from "~/fsd/entities/pipeline";
import {
  docLinksForItem, docSourceUrl, planDocHref, reportDocHref, renderMarkdown,
  type DocKind, type DocLink, type DocLocation,
} from "~/fsd/entities/repo-doc";
import { rejectActionsFor, resolveGateTransition, type RejectAction } from "~/fsd/features/transition-pipeline-gate";

export type DossierTab = DocLink & { active: boolean };
export type DocView = {
  kind: DocKind;
  kindLabel: string;       // "계획서 · 현재 계약" | "보고서 · 누적 기록"
  title: string;
  itemId: string | null;
  status: string | null;
  gateLabel: string | null; // 게이트② 버튼이 찍을 to(검토대기→구현승인 등), 없으면 null
  rejectActions: RejectAction[];
  tabs: DossierTab[];
  html: string;
  sourceUrl: string;
};

function fileLabel(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

/** 이 항목의 실재하는 형제 문서 탭. currentHref로 active 결정. */
export function dossierTabs(
  itemId: string, currentHref: string,
  hasPlan: boolean, reports: ReadonlyMap<string, AgentReport[]>,
): DossierTab[] {
  const agentsWithDoc = new Set(
    [...reports].filter(([, l]) => l.some((r) => r.name === `${itemId}.md`)).map(([a]) => a),
  );
  return docLinksForItem(itemId, hasPlan, agentsWithDoc).map((d) => ({ ...d, active: d.href === currentHref }));
}

export function buildDocView(
  location: DocLocation, content: string,
  boardItem: BoardItem | null,
  planDocIds: ReadonlySet<string>,
  reports: ReadonlyMap<string, AgentReport[]>,
): DocView {
  const status = boardItem?.status ?? null;
  // 뷰어의 실행 제어는 발주 스코프 (a)인 게이트②만: 승인대기 게이트①은 /pipeline 결재함 소유다.
  const canRunGateTwo = location.itemId !== null && status === "검토대기";
  const gateTo = canRunGateTwo ? resolveGateTransition(status) : null;
  const currentHref =
    location.kind === "plan"
      ? planDocHref(location.itemId ?? fileLabel(location.path))
      : reportDocHref(location.agent ?? "", fileLabel(location.path));
  return {
    kind: location.kind,
    kindLabel: location.kind === "plan" ? "계획서 · 현재 계약" : "보고서 · 누적 기록",
    title: location.itemId ?? fileLabel(location.path),
    itemId: location.itemId,
    status,
    gateLabel: gateTo,
    rejectActions: canRunGateTwo ? rejectActionsFor(status) : [],
    tabs: location.itemId !== null
      ? dossierTabs(location.itemId, currentHref, planDocIds.has(location.itemId), reports)
      : [], // 고정명 문서(감사기록 등)는 탭 없이 단독 렌더(백로그 참고)
    html: renderMarkdown(content),
    sourceUrl: docSourceUrl(location.path),
  };
}
```

### 6) `pages/doc-viewer/ui/index.tsx` (신규) — 서버 컴포넌트

구조·리터럴 요점만 적는다(마크업 상세는 기존 브리핑 패턴을 따른다). 헤더는 `bg-stamp-soft`/`font-briefing-display` 서류철 띠. 뒤로가기 `next/link`로 `/pipeline`. 종류 배지는 `kind === "plan"`이면 `border-stamp text-stamp`, 아니면 `border-hold text-hold`. 상태 칩은 `status`가 있으면 렌더(`ValidationMark`가 아니라 단순 status 칩, `pipeline/ui/index.tsx:159-160` 스타일 참고). `gateLabel !== null && itemId !== null`이면 `<GateTransitionButton id={itemId} status={status!} label={gateLabel} />`, `rejectActions.length > 0 && itemId !== null`이면 `<RejectActions id={itemId} status={status!} actions={rejectActions} />`(둘 다 `~/fsd/features/transition-pipeline-gate` public root, `index.ts:1-2`). 탭 스트립은 `tabs`를 `next/link` 목록으로, `active`면 시트에 붙은 스타일(하단 테두리 제거·`bg-briefing`). 본문 시트: `<article className="doc-prose ..." dangerouslySetInnerHTML={{ __html: view.html }} />`. 원문 링크 `<a href={view.sourceUrl} target="_blank" rel="noreferrer noopener">GitHub 원문 ↗</a>`.

`index.ts`(page root): `export { DocViewer } from "./ui"; export { buildDocView, type DocView } from "./model/build-doc-view";`

### 7) 라우트 `src/app/(protected)/pipeline/docs/[...slug]/page.tsx` (신규)

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { AgentReport } from "~/fsd/entities/agent-report";
import { getAgentReportIndex } from "~/fsd/entities/agent-report/api";
import { getPipelineBoard } from "~/fsd/entities/pipeline/api";
import { latestItemById, type BoardItem } from "~/fsd/entities/pipeline";
import { getDocContent, getPlanDocIds } from "~/fsd/entities/repo-doc/api";
import { locationFromSlug } from "~/fsd/entities/repo-doc";
import { buildDocView, DocViewer } from "~/fsd/pages/doc-viewer";
import { requireAdmin } from "~/server/auth/guard";

export const metadata: Metadata = { title: "Admin Pipeline Doc", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic"; // 매 요청 dev 브랜치 문서를 다시 읽는다

export default async function AdminPipelineDocRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  await requireAdmin(); // (protected)/layout.tsx:11이 이미 확인하지만 목적지 재검사(3중 방어선 3층)
  const { slug } = await params;
  const location = locationFromSlug(slug);
  if (location === null) notFound(); // 화이트리스트 밖(요구 4)

  const content = await getDocContent(location.path);
  if (content === null) notFound(); // 미존재(raw 404)

  // 항목 문서일 때만 보드 상태·게이트(스코프 a)·형제 탭(스코프 b) 문맥을 읽는다.
  let boardItem: BoardItem | null = null;
  let planDocIds: ReadonlySet<string> = new Set<string>();
  let reports: ReadonlyMap<string, AgentReport[]> = new Map<string, AgentReport[]>();
  if (location.itemId !== null) {
    const [sections, planIds, reportIndex] = await Promise.all([
      getPipelineBoard(), getPlanDocIds(), getAgentReportIndex(),
    ]);
    boardItem = latestItemById(sections, location.itemId);
    planDocIds = planIds;
    reports = reportIndex;
  }
  const view = buildDocView(location, content, boardItem, planDocIds, reports);
  return (
    <main className="bg-briefing min-h-screen">
      <DocViewer view={view} />
    </main>
  );
}
```

(타입은 스케치 그대로가 구현이다 — `let boardItem = null`처럼 명시 타입을 빼면 `any`로 넓혀져 `@typescript-eslint/no-unsafe-argument`(recommendedTypeChecked, `eslint.config.js:17`)에 걸리고 `check`의 lint 0 기준이 깨진다.)

**스케치의 lint 0 여부는 추정이 아니라 실측이다.** 검증 라운드에서 `apps/admin` 미러에 위 §1~§9를 그대로 적용해 실제 툴체인을 돌렸다: `tsc --noEmit` EXIT 0 · `verify-fsd-boundaries.mjs` EXIT 0 · `--final` EXIT 0 · 경계 fixture 12/12 · 기존 테스트 **187/187 통과**(`SpeechItem.docs` 추가와 `buildBriefing` 선택 인자가 기존 단언을 깨지 않음을 실증) · ESLint EXIT 0. 첫 실행에서 ESLint가 오류 4건을 냈고(위 §3·§4의 `startsWith`/`includes`/옵셔널 체이닝 주석이 그 결과다) 그 4건을 고친 뒤 0이 됐다. 같은 명령의 수정 전 기준선(`apps/admin` 현재 tree)은 EXIT 0이므로, 그 4건은 전부 이 계획이 새로 들이던 것이었다.

### 8) 기존 파일 편집 (before/after)

`entities/pipeline/model/board.ts` — 끝에 추가:
```ts
// 항목 최신(첫) 행 = 가장 위 행(briefing.flatten의 "첫 등장만 유효"와 같은 규칙).
export function latestItemById(sections: BoardSection[], id: string): BoardItem | null {
  for (const s of sections) for (const it of s.items) if (it.id === id) return it;
  return null;
}
```
`entities/pipeline/index.ts` — 재수출에 `latestItemById` 추가(기존 `parseBoard` 옆).

`pages/pipeline/model/briefing.ts`:
- import 추가: `import { docLinksForItem, type DocLink } from "~/fsd/entities/repo-doc";` `import type { AgentReport } from "~/fsd/entities/agent-report";`
- `SpeechItem`(현재 `:12-24`)에 필드 추가: `docs: DocLink[];`
- `buildBriefing`(`:210-230`) 시그니처: `export function buildBriefing(sections: BoardSection[], today: Date, docs?: { planDocIds: ReadonlySet<string>; reports: ReadonlyMap<string, AgentReport[]> }): Briefing`
- 링크 리졸버(순수):
```ts
function docResolver(
  docs?: { planDocIds: ReadonlySet<string>; reports: ReadonlyMap<string, AgentReport[]> },
): (id: string) => DocLink[] {
  if (docs === undefined) return () => [];
  return (id) => {
    const agentsWithDoc = new Set(
      [...docs.reports].filter(([, l]) => l.some((r) => r.name === `${id}.md`)).map(([a]) => a),
    );
    return docLinksForItem(id, docs.planDocIds.has(id), agentsWithDoc);
  };
}
```
- `inboxSpeech`(`:93-123`)·`feedSpeech`(`:140-177`)에 리졸버 인자를 넘겨 각 `SpeechItem`에 `docs: resolveDocs(item.id)`를 채운다(existing 필드 유지). `buildBriefing`에서 `const resolveDocs = docResolver(docs);` 후 `.map((it) => inboxSpeech(it, today, resolveDocs))` / `feedSpeech(it, resolveDocs)`.

`pages/pipeline/ui/index.tsx`:
- import 추가: `import Link from "next/link";` `import type { DocLink } from "~/fsd/entities/repo-doc";`
- `DocLinks` 헬퍼:
```tsx
function DocLinks({ docs }: { docs: DocLink[] }) {
  if (docs.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {docs.map((d) => (
        <Link
          key={d.href}
          href={d.href}
          className={cn("underline-offset-2 hover:underline", d.kind === "plan" ? "text-active" : "text-muted-foreground")}
        >
          {d.label} →
        </Link>
      ))}
    </p>
  );
}
```
- `InboxCard`(`:140-193`): reject 블록과 근거 `<details>` 사이에 `<DocLinks docs={item.docs} />` 추가.
- `FeedZone`(`:195-234`): 각 항목 `<details>` 내부 detail 아래에 `<DocLinks docs={item.docs} />` 추가.

`pages/pipeline/ui/_component/pixel-office.tsx` — `DeskReports`(`:232-248`) 교체:
```tsx
// 파일명 나열은 제거하고 개수만 남긴다(백로그 요구 5). 항목별 링크는 카드로 이동했다.
function DeskReports({ reports }: { reports: AgentReport[] }) {
  if (reports.length === 0) return null;
  return <p className="text-center text-[10px] text-muted-foreground">기록 {reports.length}건</p>;
}
```

`src/app/(protected)/pipeline/page.tsx`(`:18-22`):
```tsx
// before (실제 파일 :18-22 그대로)
  const [sections, reports] = await Promise.all([
    getPipelineBoard(),
    getAgentReportIndex(),
  ]);
  const briefing = buildBriefing(sections, new Date());
// after
  const [sections, reports, planDocIds] = await Promise.all([
    getPipelineBoard(),
    getAgentReportIndex(),
    getPlanDocIds(),
  ]);
  const briefing = buildBriefing(sections, new Date(), { planDocIds, reports });
```
import 추가: `import { getPlanDocIds } from "~/fsd/entities/repo-doc/api";`

`src/styles/globals.css` — `@layer` 아래에 `.doc-prose` 요소 규칙 추가(토큰 사용): `.doc-prose h1/h2/h3`(`font-briefing-display`·`text-foreground`·간격), `.doc-prose p/li`(`text-sm text-foreground`), `.doc-prose code`(모노·`bg-stamp-soft` inline), `.doc-prose pre`(모노·`bg-stamp-soft`·overflow-x-auto·radius), `.doc-prose table`(`w-full`·`border` 하드라인), `.doc-prose th/td`(`border`·padding·`text-sm`), `.doc-prose blockquote`(`border-l-2 border-stamp`·`text-muted-foreground`), `.doc-prose a`(`text-active underline`), `.doc-prose hr`(`border-border`). 값은 기존 `--stamp`/`--stamp-soft`/`--active`/`--border`/`--muted-foreground` 토큰(`globals.css:85-91`)에서만 가져온다.

### 9) 경계 스크립트 (before/after)

`scripts/verify-fsd-boundaries.mjs`:
- `FSD_EFFECT_OWNERS.fetch`(`:32-38`)에 한 줄 추가: `"src/fsd/entities/repo-doc/api/queries.ts"`. 이 파일 하나가 `getDocContent`·`getPlanDocIds` 두 fetch를 소유한다(한 owner). 추가 안 하면 `--final`에서 owner mismatch(`:665-676`) + 실제 tree에서 `[R13]`(`:580-591`).
- `REQUIRED_FINAL_FILES`(`:46-63`)에 신규 public entry 추가: `"src/fsd/entities/repo-doc/index.ts"`, `"src/fsd/entities/repo-doc/api/index.ts"`, `"src/fsd/pages/doc-viewer/index.ts"`, `"src/app/(protected)/pipeline/docs/[...slug]/page.tsx"` — 마지막은 (protected) 페이지 전부가 등재된 존재 요구 목록(`:47-50`)과의 일관.

## 테스트

**덮는 것** (순수 함수 → `*.test.mjs`, 구현 모듈과 같은 segment):

- `entities/repo-doc/model/doc-location.test.mjs`
  - `locationFromSlug`: `["plans","FEAT-14"]`→plan/itemId=FEAT-14 · `["agents","admin-dev","FEAT-14"]`→report/agent/itemId · `["agents","doc-auditor","감사기록"]`→report/itemId=null(고정명) · `["plans","README"]`→itemId=null · 트래버설 `["plans","..","secrets"]`→null · 단일 점 세그먼트(`["plans","."]`·`["agents",".","FEAT-14"]`)→null · 잘못된 root `["config","x"]`→null · 길이 위반(`["plans","a","b"]`)→null · 한글 세그먼트 통과.
  - `isWhitelistedDocPath`: `docs/plans/FEAT-14.md`·`docs/agents/main-loop/FEAT-14.md` 허용 / `docs/../env`·`src/env.js`·`docs/other/x.md`·`docs/plans/..md`·`docs/agents/./FEAT-14.md` 거부.
  - `docLinksForItem`: 계획만 · 계획+검증+구현(admin→web→backend)+감사+정찰 결정 순서 · `backend-dev` 항목 보고서는 `구현 보고`, `doc-auditor`/`feature-scout` 항목 보고서는 각각 `감사 보고`/`정찰 보고` 링크 · 없음 · 폴더가 없는 `pm` 제외 · href 형식.
- `entities/repo-doc/model/markdown.test.mjs`
  - `escapeHtml`: `& < > "` 전부.
  - `renderInline`: `**볼드**`·`` `코드` ``(내부 미파싱)·`[t](https://x)`·`[t](/rel)`·`[t](javascript:alert(1))`와 `[t](//evil.example)`은 링크로 안 만들고 텍스트 유지·코드 안의 `<`는 escape.
  - `renderInline` 자리표시자 충돌 회귀: 평문 `"결함 0 건, 총 2 라운드"`가 그대로 보존(코드 스팬 없음) · `` "`code`와 숫자 3 개" ``에서 무관한 ` 3 `이 보존(코드 스팬 있음) — 공백-숫자-공백 자리표시자로 돌아가는 돌연변이를 사멸시키는 단언.
  - `renderInline` NUL 충돌 회귀: 원문 `"앞\0 0 \0뒤"`는 NUL만 `�`로 정규화되고 숫자와 나머지 본문은 보존 — 원문 NUL이 코드 슬롯으로 오인돼 내용이 삭제되는 돌연변이를 사멸시킨다.
  - `renderMarkdown`: 제목 레벨(`#`~`######`)·문단·`ul`·`ol`·중첩 목록의 문서화된 평면화·GFM 표(헤더+구분행+행)·코드펜스(내부 escape·인라인 미파싱)·인용·hr·빈 입력→`""`·**XSS: `<script>`가 `&lt;script&gt;`로**(원시 HTML 미통과).
  - `renderMarkdown` 표 이스케이프 파이프 회귀: 셀에 `` `validation: string \| null` ``이 든 2열 행이 **2열로** 유지되고 셀 내용이 `validation: string | null`로 복원된다 · 행이 `\|`로 끝나도 역슬래시가 남지 않는다 · 이스케이프하지 않은 파이프는 그대로 쪼개진다(GFM 동작 고정). 순진한 `split("|")`으로 돌아가는 돌연변이를 사멸시키는 단언 — 이 저장소의 BUG-05·FEAT-06·FEAT-13이 실제로 이 문법을 쓴다.
- `entities/repo-doc/api/queries.test.mjs` (`server-only`·`~/env`를 subject dynamic import 전에 `mock.module`, `globalThis.fetch`는 기존값을 저장한 stub으로 바꾸고 `after`에서 복원, live I/O 없음)
  - `getDocContent`: 화이트리스트 밖 경로→fetch 없이 null · raw 200→text · 404→null · 비-OK→throw.
  - `getPlanDocIds`: 배열 응답에서 `FEAT-*.md`만 ID로 · `README.md`/`template.md` 제외 · non-array→빈 Set · 404→빈 Set · 토큰 있으면 Bearer 헤더.
- `pages/doc-viewer/model/build-doc-view.test.mjs`
  - `dossierTabs`: 실재하는 것만 · currentHref로 active 하나 · 결정적 순서(계획→검증→구현→감사→정찰).
  - `buildDocView`: plan→"계획서 · 현재 계약" · report→"보고서 · 누적 기록" · 항목 ID가 있는 검토대기 boardItem→gateLabel="구현승인"·rejectActions 있음 · 승인대기 boardItem→gateLabel=null·rejectActions `[]`(게이트①은 뷰어 범위 밖) · 완료 boardItem→gateLabel=null · boardItem=null→status null·탭 있음 · 고정명(itemId=null)은 검토대기 boardItem이 잘못 주입돼도 gateLabel=null·rejectActions `[]`·탭 `[]` · `html`에 렌더 결과 포함 · `sourceUrl`이 blob URL.
- `pages/pipeline/model/briefing.test.mjs` (확장)
  - `buildBriefing`에 `{ planDocIds, reports }` 넘기면 해당 항목 `SpeechItem.docs`에 링크 · 안 넘기면 `docs: []` · 기존 단언(inbox/feed/team) 유지.
- `entities/pipeline/model/board.test.mjs` (확장): `latestItemById`가 여러 섹션 중 최상단 행 반환·없으면 null.
- `scripts/verify-fsd-boundaries.test.mjs` (확장, **신규 owner 전용 contract test + rule mutation fixture**)
  - repo-doc owner를 등록한 tree fixture: `getDocContent`/`getPlanDocIds`의 fetch가 R13을 내지 않고 `--final` owner 집합이 일치.
  - **음성 시험(mutation)**: 같은 fixture에서 repo-doc owner를 `FSD_EFFECT_OWNERS.fetch`에서 빼면 그 fetch 호출부가 `[R13] network call is outside the approved fetch owners`를 낸다 — 등록이 장식이 아님을 고정.

**못 덮는 범위** (Node 러너·DOM/외부 I/O 없음 — 배포 후 데스크톱+폰 수동 smoke):
- `DocViewer` 서버 렌더·`dangerouslySetInnerHTML` 시각 결과·`.doc-prose` 요소 스타일(명조 제목·표 하드라인·오커 인용·모노 코드)·서류철 탭 활성 시각·반응형(`max-w-3xl`·모바일).
- 헤더의 `GateTransitionButton`/`RejectActions` 클라이언트 상호작용(useTransition·toast·router.refresh) — 기존 컴포넌트라 FEAT-08/09에서 이미 못 덮음으로 기록됨.
- `next/link` 카드 링크 네비게이션·`DocLinks` 렌더.
- 실제 raw CDN fetch·contents API 응답(module-mock로 호출 계약만 확인).
- raw CDN 잔상: raw CDN은 max-age=300(FEAT-10 실측)이라 게이트 전이 커밋 후 최대 5분간 뷰어 상태 칩이 옛 status일 수 있고, **문서 본문도 같은 raw 경로라** 방금 커밋된 문서가 최대 5분간 옛 본문이거나 404(→ Next 404)일 수 있다(FEAT-10 결정 6, 범위 밖·후속).

`npm test`는 Node 내장 러너다. DOM·React 테스트 도구가 없고 DB/외부 I/O는 그 자체를 덮을 수 없다. 위 "못 덮는 범위"는 도구를 새로 깔지 않고 수동 smoke로 남긴다.

**구현 완료 자동 검증** (저장소 루트·PowerShell, 아래 네 명령 전부 EXIT 0):

```powershell
npm.cmd run check -w apps/admin
npm.cmd test -w apps/admin
npm.cmd run verify:fsd:final -w apps/admin
npm.cmd run build -w apps/admin
```

- `check`는 경계 fixture·현재 tree FSD·ESLint·production TypeScript를, `test`는 위 순수/API 계약을, `verify:fsd:final`은 신규 repo-doc fetch owner와 public entry/라우트의 최종 위치를 검사한다.
- `build`는 App Router의 서버/클라이언트 조립, catch-all 라우트, metadata와 `.doc-prose` Tailwind 방출이 실제 production artifact로 만들어지는지 확인한다. 빌드 결과의 route 목록에 `/pipeline/docs/[...slug]`가 있어야 한다.
- `npm.cmd test`의 최종 file/suite/test 수를 구현 보고에 기록한다. 신규 `src/**/*.test.mjs` 4개 때문에 `apps/admin/CLAUDE.md`의 현재 `21개 파일, 40개 suite, 187개 test` 인벤토리는 구현 뒤 낡으며, repo-doc GET owner 추가로 같은 문서의 「데이터와 외부 효과 소유권」도 낡는다. `admin-dev`는 그 파일을 수정할 권한이 없으므로 직접 고치지 않고, **두 갱신 필요 사항과 실측 수치를 구현 보고 `비고`에 handoff**한다.

**배포 후 수동 smoke 목적지와 기대 결과** (인가된 계정, 데스크톱 1회 + 375px 폭 1회):

1. 로그아웃 상태에서 `/pipeline/docs/plans/FEAT-14` 직접 진입 → `/login`으로 보호되고 문서 본문이 노출되지 않는다. 로그인 상태에서는 같은 URL이 열린다.
2. `/pipeline` → FEAT-14 카드에 실재하는 `계획서 →`·`검증 기록 →` 링크만 보이고, 각 책상 아래에는 `기록 N건`만 보인다. 파일명 목록과 펼침 UI는 없어야 한다.
3. `/pipeline/docs/plans/FEAT-14` → `계획서 · 현재 계약`, `FEAT-14`, 현재 status, 형제 탭, `GitHub 원문 ↗`가 보이고 활성 탭은 시트에 붙는다. 본문의 제목·목록·표·코드·인용이 각각 명조/산세리프/모노/하드라인/오커 규칙으로 렌더되며 가로 overflow가 문서 시트 밖으로 새지 않는다.
4. `/pipeline/docs/agents/main-loop/FEAT-14` → `보고서 · 누적 기록`, 동일 항목 ID, 계획서/검증/구현/감사/정찰 중 실재하는 형제 탭만 보인다. 현재 저장소에는 실재하는 고정명 보고서가 없으므로 smoke를 위해 만들지 않는다. 탭·상태·게이트 없는 고정명 단독 렌더 계약은 `locationFromSlug(["agents","doc-auditor","감사기록"])`와 `buildDocView(itemId=null)` 단언으로 닫고, 첫 고정명 보고서가 생긴 뒤 그 실경로를 수동 확인한다.
5. `/pipeline/docs/other/x`(화이트리스트 밖)와 `/pipeline/docs/plans/DOES-NOT-EXIST`(허용 경로지만 raw 404) → 둘 다 Next 404이며 외부 본문을 렌더하지 않는다. raw 5xx가 조용히 빈 문서로 바뀌지 않고 throw되는 계약은 `getDocContent`의 비-OK 단언으로 닫는다.
6. 게이트/반려 버튼은 `검토대기` 항목에서만 보이는지 확인하되 **수동 smoke에서 누르지 않는다**. 클릭은 실제 `PROJECT_BOARD.md`를 변경하는 외부 효과라 별도 사용자 승인 없이는 실행하지 않으며, 전이·스테일·실패 계약은 기존 `transition-pipeline-gate` 테스트와 이번 `buildDocView` 단언이 닫는다.

자동 네 명령이 통과하고 계획서 「고칠 파일」 밖 코드 변경이 없으며 6의 외부 효과를 승인 없이 실행하지 않은 것이 B단계 완료 기준이다. 수동 smoke 1~5는 인가된 브라우저를 쓸 수 있는 배포 후 검증 목적지다. 구현 세션에서 실행할 수 없으면 통과로 꾸미지 말고 구현 보고의 `못 덮는 범위`에 미실행 handoff로 남긴다.

## 범위 밖 의존

없음. 이 계획의 Core는 **의존성 없는 순수 렌더러**(위 §3)로 고정하며 `npm install`이나 `package.json`·lockfile 변경을 요구하지 않는다. 앱 결(순수 함수 + Node 러너 테스트)에 맞고 admin-dev가 구현·검증할 수 있다. npm 라이브러리 경로는 아래 「대안」에서 기각한 선택지일 뿐, 구현 중 전환하는 조건부 분기가 아니다.

`packages/db`·다른 워크스페이스 의존도 없고 DB 쓰기 경로도 없다(뷰어는 순수 읽기 — 비목표에 명시). `apps/admin/CLAUDE.md`의 테스트 인벤토리·fetch owner 문구 갱신은 담당 권한 밖이므로 구현 보고 handoff만 하며, 이 비코드 문서 후속은 FEAT-14 구현을 막는 의존이 아니다.

## 대안

- **npm 마크다운 라이브러리(`marked`+sanitize 또는 `react-markdown`+`remark-gfm`)**: 임의 GFM에 더 견고하다. 채택 안 함 — 안전한 HTML까지 만들려면 렌더러 외 sanitize 조합이 필요하고, `npm install`·manifest/lockfile 변경은 admin-dev 실행 권한 밖이다. 이번 구현은 §3의 명시된 부분집합과 GitHub 원문 탈출구로 고정하며 구현 중 이 대안으로 전환하지 않는다.
- **`<pre>` 원문 표시(렌더 없음)**: 의존성·파서 위험 0이지만 요구 2 "GFM 렌더"를 못 채운다(표·제목이 평문). 기각.
- **React 엘리먼트 렌더(`dangerouslySetInnerHTML` 대신)**: XSS 표면이 더 좁지만 Node 러너로 출력을 단언할 수 없어(DOM 없음) 앱의 테스트 관례를 깬다. 신뢰된 사내·admin 전용 문맥 + 전량 escape로 문자열-HTML 경로가 더 검증 가능해 채택.
- **뷰어를 `docs/plans`·`docs/agents`용 별도 라우트 둘로 분리**: 종류 배지·탭 로직이 갈라져 중복. 단일 catch-all + 경로 유도 종류로 통합.
- **스코프 결정 (c) `##` 절 목차**: 이번 범위에서 채택 안 함. append 누적으로 문서가 실제로 커져 불편이 생기면 후속 — 지금 넣으면 미사용 UI.
- **스코프 결정 (a) 뷰어 헤더 게이트/상태 칩**: 포함(권장). 기록의 실제 소비 시점이 게이트 결정(관측 3)이라, 계획서를 읽는 그 화면에서 바로 승인·반려하는 것이 흐름 이탈을 없앤다. 기존 `GateTransitionButton`/`RejectActions` 재사용(신규 로직 0). 상태 칩은 raw 보드 기준이라 CDN 잔상 caveat 승계(범위 밖).
- **스코프 결정 (b) 서류철 탭**: 포함(권장). 형제 문서를 물리 탭으로 인코딩해 계획↔검증↔구현을 오가며, `docs/agents/README.md`가 허용하는 항목 단위 감사·정찰 보고가 실재하면 그 탭도 뒤에 붙인다. 실재하는 것만 표시(`docLinksForItem` 재사용). 고정명 문서는 탭 없이 단독 렌더. 책상 "기록 N건"은 링크 없이 개수만(요구 5 문자 그대로) — 고정명 문서(감사기록·정찰기록)의 UI 진입점을 카드/탭 밖에 두는 것은 이 항목 범위 밖 후속(뷰어는 직접 URL로 렌더 지원).
- **검증 중 추가된 `backend-dev`의 책상·명령**: 이번 범위에서 채택 안 함. FEAT-14의 항목 축 링크는 report index 전체에서 backend 구현 보고까지 찾으므로 기록 접근 요구는 충족한다. `known-agents.ts` roster·책상 명령·캐릭터까지 backend를 팀 UI에 추가하는 일은 새 행위자 도입 자체의 별도 후속이며, 이 계획의 25파일 범위를 조용히 넓히지 않는다.
