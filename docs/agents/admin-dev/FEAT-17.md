# FEAT-17 — 행위자 상세 페이지의 역할 정의를 제목 주도 점진 공개로

## 2026-08-24 — 구현 (게이트②, status: 완료)

승인된 계획서 `docs/plans/FEAT-17.md`의 「고칠 파일」 표와 「구현 스케치」 §1~§3, 「테스트」 절 명세를 그대로 이식했다.

### 착수 전 확인

- 보드 status `구현승인` 확인. 계획서를 파일에서 다시 읽음(기억 아님).
- 계획서 「현재 동작」 ↔ 현재 코드 대조: `build-profile-view.ts`의 `parseAgentDefinition`(:15-44)·`AgentProfileView.bodyHtml: string`(:5-11)·`bodyHtml: parsed.body === "" ? "" : renderMarkdown(...)`(:58), `ui/index.tsx`의 단일 `<article>` 블록(:44-54), 라우트 page가 `bodyHtml` 미참조(:32) — 전부 계획서 기술과 일치. 어긋남 없음 → 구현 진행.
- 의존 확인: `renderInline`이 `~/fsd/entities/repo-doc` root(`index.ts:13`)에서 재수출되고 `markdown.ts:17-32`에 정의됨. 새 import·public export·fetch/DB/Sentry owner 추가 없음 → 경계 스크립트 무변경.
- UI 항목이므로 `frontend-design` 스킬 로드. 계획서 「디자인 방향」 절(서류철 은유·`+`→`×` 잉크 마커·기존 브리핑/스탬프 토큰만·절 번호 미부여)이 스킬의 2-pass 결과를 이미 담고 있어 그대로 구현.

### 고친 파일 (3개, 「고칠 파일」 표와 정확히 일치)

1. `apps/admin/src/fsd/pages/agent-profile/model/build-profile-view.ts`
   - import에 `renderInline` 추가(§1).
   - `outlineDefinitionBody` 순수 함수 신설 — 펜스 밖 `##` 경계로 body를 intro + 절 배열로 분할. `startsWith("```")` 펜스 토글, `/^##\s+(.*)$/` level-2 전용, 절 body에서 heading 줄 제외(§1).
   - `AgentProfileView`의 `bodyHtml: string`을 `introHtml: string` + `sections: DefinitionSectionView[]`로 교체, `DefinitionSectionView = { titleHtml; bodyHtml }` 신설(§2).
   - `buildAgentProfileView` 반환을 `outlineDefinitionBody(parsed.body)` → `introHtml`(renderMarkdown)·`sections`(title은 renderInline, body는 renderMarkdown)로 조립(§2).
2. `apps/admin/src/fsd/pages/agent-profile/ui/index.tsx`
   - 「역할 정의」를 단일 `<article>`에서 intro 카드 + `<details>` 스택으로 교체(§3). summary는 명조 제목 + `+`→`×`(`group-open:rotate-45`·`motion-reduce:transition-none`) 잉크 마커, 본문은 `border-stamp/20` hairline 아래 `.doc-prose`. 가드는 `view.introHtml !== "" || view.sections.length > 0`.
3. `apps/admin/src/fsd/pages/agent-profile/model/build-profile-view.test.mjs`
   - import에 `outlineDefinitionBody` 추가.
   - `outlineDefinitionBody` describe 신설(9 케이스, 아래 「테스트」).
   - `buildAgentProfileView`의 null 케이스 `bodyHtml` 단언을 `introHtml`/`sections.length`로 갱신, 마지막 테스트를 intro+절 분할 단언으로 확장(titleHtml의 `<code>`, bodyHtml의 `<p>`).

`index.ts`는 미수정(계획대로) — slice 밖 소비자(라우트 page)는 `buildAgentProfileView`·`AgentProfile`만 쓰고 `bodyHtml`을 참조하지 않으며, 새 함수·타입은 같은 slice 안 상대 import로만 쓰인다.

### 스케치 대비 차이

없음. 프로덕션 코드(`build-profile-view.ts`·`ui/index.tsx`)는 「구현 스케치」 §1~§3의 분기·조건·리터럴·사용자 노출 문구를 바이트 그대로 이식했다(「역할 정의」 라벨, `+` 마커, 카드 클래스 전부 동일). 테스트는 스케치가 코드를 주지 않으므로(명세만) 「테스트」 절 명세대로 자작했고, 핵심 두 케이스(펜스 안 `## YYYY-MM-DD` 미분할, 언어 태그 펜스 토글)를 포함한다.

### 검증 (직접 실행, 넷 다 EXIT 0)

- `npm run check -w apps/admin` — EXIT 0 (boundary fixture 13/13 · verify:fsd migration · ESLint 0 warnings · production tsc 0).
- `npm test -w apps/admin` — EXIT 0, **273 pass / 0 fail** (58 suites). FEAT-15 기준 264/57에서 +9 test·+1 suite(신규 `outlineDefinitionBody` describe).
- `npm run verify:fsd:final -w apps/admin` — EXIT 0 (final boundary check passed, fetch owner 무변경).
- `SENTRY_DISABLE_AUTO_UPLOAD=true npm run build -w apps/admin` — EXIT 0. `/pipeline/agents/[agent]` 341 B / First Load 107 kB.

`git diff --name-only`로 변경 파일이 위 3개뿐임을 확인(그 외 `apps/web/.claude/settings.local.json`은 세션 시작 시점부터 있던 무관 변경).

### 테스트가 덮는 것 (`build-profile-view.test.mjs`)

`outlineDefinitionBody` 9 케이스:
- 도입부 + `##` 절 N개 분할, 절 body에서 heading 줄 제외.
- 펜스 안 `## 2026-01-01`이 절을 만들지 않고 이전 청크에 남음(pm.md:57 함정 재현, `sections.length===1`·펜스 텍스트 in body).
- 닫힌 펜스 뒤 `## B`가 다시 경계.
- 언어 태그 펜스(```` ```ts ````) 토글: 이후 절 3개가 살아남음(`sections.length===3`). `line === "```"` 돌연변이면 length가 2로 줄어 사멸.
- `##` 없음 → intro = 본문 전체, sections = [].
- `##`로 시작 → intro = "", sections = [해당 절].
- `###`·`##붙은건아님`은 경계 아님.
- CRLF 정규화 후 분할.
- 인라인 코드 제목 보존(`` `area` 규칙 ``).

`buildAgentProfileView`: null → introHtml ""·sections 0·hasDefinition false·roleSummary null·records 유지; 정의 있음 → introHtml에 `<h1>역할</h1>`·roleSummary=frontmatter·sections[0].titleHtml의 `<code>area</code>`·bodyHtml의 `<p>절 본문.</p>`.

### 테스트로 못 덮은 범위 (Node 러너·DOM/외부 I/O 없음 — 배포 후 데스크톱+폰 수동 smoke)

- `<details>` 실제 펼침/접힘, `+`→`×` 마커 회전(`group-open:rotate-45`), `list-none` 마커 숨김, `hover:text-stamp`, `motion-reduce:transition-none`, 반응형 패딩(`sm:px-8`).
- `dangerouslySetInnerHTML`의 실제 렌더 모양.
- 명조 디스플레이(`font-briefing-display`)의 폰 폴백(Gowun Batang → 고딕, FEAT-04와 동일 한계).

### 비고 (읽기 전용 `apps/admin/CLAUDE.md` → 메인 루프 동기화 필요)

- 「테스트 인벤토리」(:35~37): 파일 수는 27개 그대로(신규 테스트 파일 없음, 기존 `build-profile-view.test.mjs`에 케이스만 추가), suite 57→**58**, test 264→**273**.
- `src/fsd/pages/agent-profile/model/build-profile-view.test.mjs` 행(:62)의 핵심 계약 설명에 `outlineDefinitionBody`의 펜스 밖 `##` 분할(펜스 안 제외·언어 태그 토글·`###` 비경계)과 뷰의 intro/sections 조립을 추가하면 실측과 일치.
