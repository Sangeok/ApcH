# FEAT-17: 행위자 상세 페이지의 역할 정의를 제목 주도 점진 공개로

agent: admin-dev

## 현재 동작

`/pipeline/agents/<id>`의 「역할 정의」는 정의 파일 본문 전체를 **한 덩어리 HTML**로 렌더한다.

- `src/fsd/pages/agent-profile/model/build-profile-view.ts:15-44` `parseAgentDefinition`가 `.claude/agents/<id>.md`의 frontmatter를 떼고 `{ description, body }`를 돌려준다. `body`는 닫는 `---` 뒤 전부이며 선행 빈 줄만 제거된다(`:39-42`).
- 같은 파일 `:46-65` `buildAgentProfileView`가 `bodyHtml: parsed.body === "" ? "" : renderMarkdown(parsed.body)`(`:58`)로 본문 전체를 **단일 문자열 하나**로 렌더한다. 뷰 타입은 `bodyHtml: string`(`:5-11`).
- `src/fsd/pages/agent-profile/ui/index.tsx:44-54`가 그 문자열을 `view.bodyHtml !== ""`(`:44`) 가드 뒤 단일 `<article className="doc-prose rounded-2xl border border-stamp/40 bg-briefing px-5 py-6 sm:px-8" dangerouslySetInnerHTML={{ __html: view.bodyHtml }} />`(`:49-52`)로 한 번에 뿌린다. 접힘·절 구분 없음.
- 라우트 `src/app/(protected)/pipeline/agents/[agent]/page.tsx:32`가 `buildAgentProfileView(agent, definition, reports)`를 불러 뷰를 `AgentProfile`에 넘긴다. `bodyHtml`을 직접 참조하지 않는다.
- 마크다운 렌더러 `src/fsd/entities/repo-doc/model/markdown.ts:35-125`는 줄 단위 블록 스캐너다. 코드 펜스는 `line.startsWith("```")` 토글로 처리하고(`:66-73`), 제목은 `/^(#{1,6})\s+(.*)$/`로 잡는다(`:75-81`). 인라인 렌더 `renderInline`(`:17-32`)은 코드·링크·볼드·이탤릭만 처리하고 HTML을 escape한다.
- `src/fsd/entities/repo-doc/index.ts:13`이 `renderMarkdown, escapeHtml, renderInline`을 public root에서 재수출한다.
- 펜스 함정 실재: `.claude/agents/pm.md:57`의 `## YYYY-MM-DD`는 `pm.md:56`에서 열려 `pm.md:63`에서 닫히는 코드 펜스 **안**의 예시다.
- 정의 파일 7개의 `##` 절 제목이 제각각이다 — 예: `admin-dev.md:18` `## 담당 범위`, `feature-scout.md:17` `## 왜 이 역할이 필요한가`, `doc-auditor.md:55` `## 판정 기준 — 여기가 이 역할의 전부다`. 첫 제목(H1)도 파일마다 다르다(`admin-dev.md:7` `# 역할`, `pm.md:8` `# 역할 (좁은 버전 — 반드시 이 범위만 수행)`).

## 문제

역할 정의가 정의 파일 본문 전체를 한 HTML 덩어리로 렌더해(`build-profile-view.ts:58` + `ui/index.tsx:49-52`), 상세 페이지가 역할 **소개**가 아니라 지시문 **전문 열람**이 된다(백로그 FEAT-17 관측, 2026-08-23).

백로그가 요구하는 것은 **제목 주도 점진 공개**다: 렌더 전에 마크다운을 **펜스 밖 `##` 경계**로 나누어(순수 함수), 첫 덩어리(`# 역할`~첫 `##` 전)는 펼치고 나머지 절은 각각 native `<details>`로 접어 절 제목을 summary로 둔다. 분할은 (1) 펜스 인식이어야 하고(`pm.md:57`의 펜스 안 `## YYYY-MM-DD`를 절로 찢으면 안 된다 — 핵심 테스트), (2) 이름 비결합이어야 하며(제목 문자열로 특별 취급 금지 — 정의 파일 7개의 절 이름이 제각각이라 개명 시 조용히 깨진다), (3) 정의 파일 frontmatter에 화면용 필드를 추가하지 않아야 한다(출처 단일 유지).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/pages/agent-profile/model/build-profile-view.ts` | `outlineDefinitionBody` 순수 함수 신설(펜스 밖 `##` 분할 → intro + 절 배열); `AgentProfileView`의 `bodyHtml: string`을 `introHtml: string` + `sections: DefinitionSectionView[]`로 교체; `buildAgentProfileView`가 split → intro·절별 렌더 |
| `src/fsd/pages/agent-profile/ui/index.tsx` | 「역할 정의」를 단일 `<article>`에서 intro 카드 + `<details>` 스택으로 교체 |
| `src/fsd/pages/agent-profile/model/build-profile-view.test.mjs` | `outlineDefinitionBody` 케이스 추가 + `buildAgentProfileView`의 `bodyHtml` 단언을 `introHtml`/`sections`로 갱신 |

`index.ts`는 고치지 않는다 — 유일한 slice 밖 소비자(라우트 page)는 `buildAgentProfileView`·`AgentProfile`만 쓰고 `bodyHtml`을 참조하지 않으며, 새 순수 함수·타입은 같은 slice 안 상대 임포트(테스트·ui)로만 쓰이므로 root 재수출이 필요 없다. 새 import·public export·DB/network/Sentry owner 변경이 없어 `verify:fsd` 경계도 그대로다(`renderInline`은 이미 `repo-doc` root가 재수출).

## 디자인 방향

브리핑/스탬프 정체성(FEAT-04/07/08)을 그대로 잇는다. native `<details>`는 FEAT-04의 두 곳 — 항목 카드 「근거 보기」(`pages/pipeline/ui/index.tsx:207-214`)와 「보고」 피드(`:229-247`) — 이 선례이고, 백로그가 그 선례와 "출처 단일"을 못박으므로 새 색·서체를 만들지 않는 것이 브리프 준수다. 이 항목만의 결정 하나: 역할 정의를 **서류철(dossier)** 은유로 — 표지(도입부)는 펼쳐 두고, 조항(절)은 라벨 달린 서랍에 접어 둔다.

- **팔레트(기존 토큰만)**: `--briefing`(도입 카드·절 본문 종이면, `globals.css:90`), `--stamp`(테두리 `border-stamp/40`·공개 마커·summary hover 잉크, `:85`), `--stamp-soft`(인라인 코드 칩 `.doc-prose code`, `:86`), `--muted-foreground`(「역할 정의」 라벨, `:73`), `--foreground`(summary 제목·본문, `:63`). 신규 토큰 없음.
- **타이포 역할**: 디스플레이 = `font-briefing-display`(Gowun Batang 명조, `globals.css:11-12`) — 페이지 H1·「역할 정의」 라벨, 그리고 이제 `<summary>` 절 제목까지. 절 제목을 명조로 세워 접힌 목록을 **목차/서류 색인**처럼 읽히게 한다. 본문 = `.doc-prose`의 `--font-sans`, 데이터 = `.doc-prose code`/`pre`의 모노(파일:줄·코드).
- **레이아웃 개념**: 「역할 정의」 섹션이 세로 스택이 된다 — (1) 도입 덩어리를 상시 펼친 종이 카드(표지: 이 행위자가 누구인가)로, 이어 (2) 각 `##` 절을 독립 `<details>` "서랍"으로. 서랍의 `<summary>`는 명조 제목 + 오른쪽 공개 마커, 본문은 상단 hairline(`border-stamp/20`) 아래 `.doc-prose`로 렌더. 기본 접힘이라 페이지가 텍스트 벽이 아니라 **훑을 수 있는 절 제목 색인**으로 열린다.
- **시그니처 요소**: 공개 마커 — 스탬프 잉크색 `+` 한 글자가 열리면 45° 회전해 `×`가 된다(순수 CSS `group-open:rotate-45`, `motion-reduce:transition-none`). "철하기/빼기"를 뜻하는 조용하고 일관된 어포던스 하나로, 파이프라인 게이트 버튼의 도장/임프린트 모티프와 이어진다. 나머지는 기존 카드 처치(`rounded-2xl border border-stamp/40 bg-briefing`)를 그대로 재사용해 절제한다.

셀프 비평(생성형 기본값 대조): 크림+세리프+테라코타 / 다크+애시드 / 브로드시트 hairline 셋 어디에도 해당 없음 — 저장소에 이미 확립된 정체성을 쓴다. 절 번호(01/02/03)를 붙이지 않는다: 절은 독자용 순서가 아니고(파일마다 순서가 다르며 의미를 나르지 않음) 번호는 거짓 구조가 된다. 자유 축에서 택한 유일한 특색은 서류철 은유와 `+`→`×` 잉크 마커로, admin 앱 전체의 운영실 은유에 맞춘다.

## 구현 스케치

### 1. `model/build-profile-view.ts` — 분할 순수 함수 신설

임포트에 `renderInline` 추가(2행, `renderMarkdown`·`reportDocHref` 옆). before:

```ts
import { renderMarkdown, reportDocHref } from "~/fsd/entities/repo-doc";
```

after:

```ts
import { renderInline, renderMarkdown, reportDocHref } from "~/fsd/entities/repo-doc";
```

`parseAgentDefinition` 아래(또는 위)에 새 순수 함수를 둔다. 본문 전체:

```ts
/** 정의 본문을 펜스 밖 `##` 경계로 나눈다. intro = 첫 `##` 앞(도입부),
 *  sections = 각 `##` 절(heading 줄 제외 본문). 코드 펜스(```) 안의 `##`는
 *  경계가 아니다 — pm.md의 `## YYYY-MM-DD`(펜스 안 예시)가 절로 찢기면 안 된다. */
export function outlineDefinitionBody(body: string): {
  intro: string;
  sections: { title: string; body: string }[];
} {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const intro: string[] = [];
  const sections: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inFence = !inFence;
    }
    const heading = inFence ? null : /^##\s+(.*)$/.exec(line);
    if (heading) {
      current = { title: (heading[1] ?? "").trim(), lines: [] };
      sections.push(current);
      continue;
    }
    if (current === null) {
      intro.push(line);
    } else {
      current.lines.push(line);
    }
  }
  return {
    intro: intro.join("\n").replace(/\n+$/, ""),
    sections: sections.map((s) => ({
      title: s.title,
      body: s.lines.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""),
    })),
  };
}
```

`/^##\s+(.*)$/`는 정확히 level-2만 잡는다(`### `는 `##` 뒤가 `#`이라 `\s+`에서 실패; `##text`도 실패 — `markdown.ts:75` 제목 정규식·`renderMarkdown`의 heading 규칙과 동일 계약이라 렌더와 어긋나지 않는다). 펜스 토글은 `markdown.ts:66`과 같은 `startsWith("```")`이라 lint(`prefer-string-starts-ends-with`)를 통과한다. 절 body에서 `##` 줄은 제외되므로 summary와 본문 `<h2>`가 중복되지 않는다.

### 2. `model/build-profile-view.ts` — 뷰 타입·조립 교체

뷰 타입 before(`:5-11`):

```ts
export type AgentProfileView = {
  agentId: string;
  roleSummary: string | null; // frontmatter description
  bodyHtml: string; // 본문 렌더(frontmatter 제거 후), 없으면 ""
  hasDefinition: boolean;
  records: ProfileRecord[];
};
```

after:

```ts
export type DefinitionSectionView = { titleHtml: string; bodyHtml: string };
export type AgentProfileView = {
  agentId: string;
  roleSummary: string | null; // frontmatter description
  introHtml: string; // 첫 덩어리(도입부) 렌더, 정의 없으면 ""
  sections: DefinitionSectionView[]; // 나머지 `##` 절, 정의 없으면 []
  hasDefinition: boolean;
  records: ProfileRecord[];
};
```

`buildAgentProfileView` 반환 before(`:55-64`):

```ts
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
```

after:

```ts
  const outline = outlineDefinitionBody(parsed.body);
  return {
    agentId,
    roleSummary: parsed.description,
    introHtml: outline.intro === "" ? "" : renderMarkdown(outline.intro),
    sections: outline.sections.map((s) => ({
      titleHtml: renderInline(s.title),
      bodyHtml: renderMarkdown(s.body),
    })),
    hasDefinition: definitionContent !== null,
    records: reports.map((r) => ({
      label: r.label,
      href: reportDocHref(agentId, r.label),
    })),
  };
```

정의 null일 때 `parsed.body === ""` → `outlineDefinitionBody("")` = `{ intro: "", sections: [] }` → `introHtml: ""`, `sections: []`(현행 빈 뷰와 동치). 절 제목은 `renderInline`으로 렌더해 인라인 코드(`` `area` ``)·볼드를 살린다 — 이름 기반 분기가 아니라 모든 절에 동일 적용이라 요구 3에 부합.

### 3. `ui/index.tsx` — 역할 정의 렌더 교체

`import type { AgentProfileView }`(`:2`)는 그대로. 「역할 정의」 블록 before(`:44-54`):

```tsx
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
```

after:

```tsx
      {(view.introHtml !== "" || view.sections.length > 0) && (
        <section className="flex flex-col gap-2">
          <h2 className="font-briefing-display text-sm tracking-widest text-muted-foreground">
            역할 정의
          </h2>
          {view.introHtml !== "" && (
            <article
              className="doc-prose rounded-2xl border border-stamp/40 bg-briefing px-5 py-6 sm:px-8"
              dangerouslySetInnerHTML={{ __html: view.introHtml }}
            />
          )}
          {view.sections.map((s, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-stamp/40 bg-briefing"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-briefing-display text-foreground hover:text-stamp sm:px-8">
                <span dangerouslySetInnerHTML={{ __html: s.titleHtml }} />
                <span
                  aria-hidden
                  className="shrink-0 text-xl leading-none text-stamp transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </summary>
              <article
                className="doc-prose border-t border-stamp/20 px-5 py-6 sm:px-8"
                dangerouslySetInnerHTML={{ __html: s.bodyHtml }}
              />
            </details>
          ))}
        </section>
      )}
```

`key={i}`: 정적·고정 순서 서버 렌더 목록이고 `next/core-web-vitals`는 `no-array-index-key`를 켜지 않는다(`eslint.config.js:12`). `list-none`은 FEAT-04 summary(`pages/pipeline/ui/index.tsx:233`)와 같은 마커 제거 방식. `group-open:rotate-45`은 FEAT-04의 `group`/`group-open` 패턴(`:231`,`:237`)과 동형.

## 테스트

- **덮는 것** (`build-profile-view.test.mjs`, 기존 러너·상대 임포트 `./build-profile-view.ts`):
  - `outlineDefinitionBody`:
    - 도입부 + `##` 절 N개 분할: intro가 첫 `##` 앞 전부, 각 절의 `title`이 heading 텍스트, `body`에 heading 줄이 빠짐.
    - **펜스 밖만 분할(핵심)**: ```` ``` ```` 펜스 안의 `## 2026-01-01`은 절을 만들지 않고 앞 덩어리에 남는다(`pm.md:57` 함정 재현) — `sections.length`와 펜스 텍스트가 이전 청크 body에 있음을 단언.
    - 닫힌 펜스 뒤의 `## Y`는 다시 경계가 된다.
    - **언어 태그 펜스도 토글(핵심 2)**: ```` ```ts ````로 연 펜스가 `startsWith` 계약으로 닫힌다 — ```` ```ts ```` 열림 + 내용 + 플레인 ```` ``` ```` 닫힘 뒤의 `## X`가 절이 됨을 단언. `line === "```"` 구현은 언어 태그 열림에서 토글을 놓쳐 펜스 상태가 반전되고 **이후 절 전부를 이전 청크로 삼킨다**(검증 라운드 실측: 언어 태그 펜스가 실재하는 `admin-dev`·`backend-dev`·`web-dev` 정의에서 각 절 3개 소실. 이 단언이 없으면 그 구현이 나머지 케이스 전부를 통과한다 — 돌연변이 검사로 확인).
    - `##` 없음 → `intro` = 본문 전체, `sections` = [].
    - `##`로 시작(도입부 없음) → `intro` = "", `sections` = [해당 절].
    - `### `/더 깊은 제목은 경계 아님 — 부모 절 body에 남는다.
    - CRLF 정규화 후 분할.
    - 인라인 코드 제목 보존: `` ## `area` 규칙 `` → `title === "`area` 규칙"`.
  - `buildAgentProfileView`:
    - 정의 null → `introHtml === ""`, `sections` 길이 0, `hasDefinition === false`, `roleSummary === null`, `records` 유지(기존 `:67-77`·`:79-86` 단언을 `bodyHtml`→`introHtml`/`sections`로 갱신).
    - 도입부 + 절 있는 정의 → `introHtml`에 `<h1>역할</h1>` 포함, `roleSummary` = frontmatter, `sections[k].titleHtml`이 인라인 코드를 `<code>`로 렌더, `sections[k].bodyHtml`이 `renderMarkdown` 결과(기존 `:88-95`를 확장).
- **못 덮는 범위** (Node 러너·DOM/외부 I/O 없음): `<details>` 펼침/접힘, `+`→`×` 마커 회전(`group-open:rotate-45`)·`list-none` 마커 숨김·`hover:text-stamp`·`motion-reduce`·반응형 패딩(`sm:px-8`), `dangerouslySetInnerHTML`의 실제 렌더 모양. 명조 디스플레이의 폰 폴백(Gowun Batang → 고딕, FEAT-04와 동일 한계). 배포 후 데스크톱+폰 수동 smoke.

## 범위 밖 의존

없음. `packages/db`·다른 워크스페이스·DB 쓰기 경로·경계 스크립트(`verify-fsd-boundaries.mjs`) 변경이 모두 불필요하다 — 새 import·public export·fetch/DB/Sentry owner 추가가 없고, `renderInline`은 이미 `repo-doc` root가 재수출한다. 정의 파일 frontmatter도 건드리지 않는다(요구 4).

## 대안

- **렌더된 HTML을 `<h2>`로 후분할**: 기각 — HTML 문자열을 파싱해야 하고, `<pre>` 코드 블록 안의 `<h2>`(펜스 함정이 HTML 층위로 재출현)와 진짜 절 제목을 구분하기 어렵다. 렌더 **전** 마크다운을 나누면 펜스 상태를 그대로 볼 수 있어 요구 1을 직접 충족한다.
- **절 토글을 client component로**: 기각 — native `<details>`는 JS 없이 되고 FEAT-04 선례와 같으며 페이지를 서버 렌더로 유지한다.
- **frontmatter에 "도입/요약 절" 표시 필드 추가**: 요구 4로 기각(출처 단일·화면용 필드 금지). 도입부는 구조로 도출한다(첫 `##` 앞).
