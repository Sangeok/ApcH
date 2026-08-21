# FEAT-15 — 파이프라인 대시보드에 행위자별 상세 페이지 추가

## 구현 (2026-08-21, 게이트②)

승인된 계획서 `docs/plans/FEAT-15.md`의 「고칠 파일」 표 11개와 「구현 스케치」 §1~§8을 그대로 이식했다. 책상 클릭 → `/pipeline/agents/<id>` 상세(역할 요약 = `.claude/agents/<id>.md` frontmatter description + 본문 렌더, 기록 = 기존 agent-report 목록을 내부 뷰어로 링크, 없으면 빈 상태)를 추가하고, roster 멤버십을 shared 단일 출처로 내렸다. 새 외부 쓰기 경로 없음 — 정의는 기존 fetch owner `getDocContent`(GET), 기록은 기존 `getAgentReports`(contents GET)로 읽는 읽기 전용이다.

### 고친 파일 (신규 7 / 수정 4)

신규
- `src/fsd/shared/agents/roster.ts` — roster 닫힌 ID 목록(`ROSTER_AGENT_IDS` 5인) 단일 출처 + `isRosterAgentId`·`agentDefinitionPath`·`isAgentDefinitionPath`(정확 경로 닫힌 집합)·`agentProfileHref`. 순수(임포트 없음).
- `src/fsd/shared/agents/roster.test.mjs` — 위 순수 함수 계약(수용 5 / 거부: backend-dev·main-loop·""·PM·admin·../pm, 접두사 아님을 고정).
- `src/fsd/pages/agent-profile/model/build-profile-view.ts` — `parseAgentDefinition`(frontmatter 분리, fail-open to body) + `buildAgentProfileView`(뷰 조립).
- `src/fsd/pages/agent-profile/model/build-profile-view.test.mjs` — 파싱·조립 계약(mock 불필요: shared·repo-doc index·agent-report index 모두 순수, server-only 미전이).
- `src/fsd/pages/agent-profile/ui/index.tsx` — `AgentProfile` 렌더(인사 헤더·기록 목록·빈 상태·정의 본문 `.doc-prose`).
- `src/fsd/pages/agent-profile/index.ts` — 공개 API(`AgentProfile`·`buildAgentProfileView`·`parseAgentDefinition`·타입 둘).
- `src/app/(protected)/pipeline/agents/[agent]/page.tsx` — 라우트: `requireAdmin`(3층) → roster 검증(밖 `notFound`) → 정의·기록 `Promise.all` → 뷰 렌더.

수정
- `src/fsd/entities/repo-doc/api/queries.ts` — `getDocContent`가 `isAgentDefinitionPath` 경로도 통과(신규 fetch owner 없음, 기존 owner 재사용). `~/fsd/shared/agents/roster` 임포트 1줄 추가.
- `src/fsd/entities/repo-doc/api/queries.test.mjs` — `.claude/agents/admin-dev.md` 통과·fetch 1회, `backend-dev.md`·`../secret.md`는 fetch 없이 null(calls.length===0) 케이스 추가. 기존 docs/plans 케이스 회귀 가드 유지.
- `src/fsd/pages/pipeline/model/known-agents.ts` — `ROSTER_ORDER`를 shared `ROSTER_AGENT_IDS`에서 파생(단일 출처). `ROSTER` 맵·`identityFor`·`initialOf`는 무변경.
- `src/fsd/pages/pipeline/ui/_component/pixel-office.tsx` — 책상 아바타 SVG를 `agentProfileHref` `Link`로 감쌈(svg는 `aria-hidden` 장식으로 내리고 링크가 접근명 소유, `hover:-translate-y-0.5`). 명령 버튼·명패·heldId 칩·`DeskReports` 개수 라벨은 그대로.

### 스케치 대비 차이

프로덕션 코드: 분기·조건·리터럴·사용자 노출 문구 전부 스케치대로 바이트 이식. 유일한 형식 차이는 `pixel-office.tsx`의 `<PixelDesk … />`가 Link 래핑으로 들여쓰기가 2칸 깊어져 printWidth 80을 넘겨 3줄로 줄바꿈된 것(prettier 산출과 동일, 의미 불변).

테스트 코드: 스케치가 테스트 본문을 주지 않아 「테스트」 절의 "덮는 것" 명세대로 자작했다. roster.test.mjs는 명세된 수용/거부 집합을 그대로 단언하고, build-profile-view.test.mjs는 실제 frontmatter(내부 `→`·마침표 보존)·frontmatter 없음·미닫힘 fail-open·CRLF·공백 description→null, 그리고 정의 null 시 records 유지·`reportDocHref` 매핑·본문 있을 때 `<h1>` 포함을 단언했다. queries.test.mjs는 명세된 3케이스를 기존 mock(server-only·env·globalThis.fetch) 위에 추가.

### 검증 (직접 실행, 넷 다 EXIT 0)

- `npm run check -w apps/admin` — EXIT 0. boundary rule fixture 13/13, `verify:fsd`(migration) 통과, ESLint 0 warnings/errors, production tsc 0.
- `npm test -w apps/admin` — 264 pass / 0 fail (57 suites). 이전 247/51에서 +17 test·+6 suite(신규 파일 2 + queries.test.mjs +3).
- `npm run verify:fsd:final -w apps/admin` — EXIT 0. `FSD boundary check passed (final)`. fetch owner 불변(신규 owner 없음), REQUIRED_FINAL_FILES 충족, 신규 파일이 final을 깨지 않음.
- `SENTRY_DISABLE_AUTO_UPLOAD=true npm run build -w apps/admin` — EXIT 0. `/pipeline/agents/[agent]` 341 B / First Load 107 kB로 동적 라우팅 확인(`/pipeline/docs/[...slug]`와 나란히).

### 경계·계약 확인

- `verify-fsd-boundaries.mjs`는 건드리지 않았다 — 정의 fetch를 기존 owner `getDocContent`로 흘려 fetch/db/sentry owner가 불변이고, `REQUIRED_FINAL_FILES`는 "존재하면 통과"라 신규 파일 미등록이 final을 깨지 않는다(실측 EXIT 0).
- shared/agents는 layer 0이라 `entities/repo-doc/api → shared`(R1 하향 OK)·`pages → shared`(OK)·shared 내 barrel 불요(R3는 target이 shared면 skip). 검사에서 위반 0.
- `reporting.ts`(import-free)·`@repo/db` analytics 계약은 건드리지 않았다. DB 쓰기 경로 추가 없음.
- 인가: 라우트가 `requireAdmin()`을 최상단에서 호출(목적지 재검사 3층). 로그인 거부·경로 보호 두 층은 미변경.

### 못 덮는 범위 (현재 러너 밖 — 배포 후 데스크톱+폰 수동 스모크)

- 라우트(`requireAdmin` 게이트·`notFound`·`Promise.all` 배선)와 `AgentProfile` React 렌더·`dangerouslySetInnerHTML`·`.doc-prose` 시각·빈 상태·`Link` 이동.
- `pixel-office` 책상 `Link` hover 들림·접근명·중첩 인터랙티브(명령 버튼과 링크 분리) — DOM/시각.
- raw CDN이 `dev` 브랜치의 `.claude/agents/*.md`를 실제로 서빙하는지(네트워크) — 정의 파일 6개는 이미 git 추적. 실측은 배포 후.
- Next.js가 `/pipeline/agents/[agent]`를 `/pipeline/docs/[...slug]`와 나란히 라우팅하는지 — build가 컴파일은 덮음(위 확인), 실제 진입은 수동.

### 후속 (쓰기 범위 밖 → 메인 루프 동기화)

`apps/admin/CLAUDE.md` 「테스트 인벤토리」가 25→27파일이 된다(신규 `src/fsd/shared/agents/roster.test.mjs` — roster 멤버십·정의 경로 닫힌 집합; `src/fsd/pages/agent-profile/model/build-profile-view.test.mjs` — frontmatter 분리·뷰 조립). 파일·suite·test 수는 25/51/247 → 27/57/264. 그 파일은 admin-dev 쓰기 범위 밖이라 고치지 않았다.
