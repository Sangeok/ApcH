---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-08-16"
approved-by: "user"
approved-at: "2026-08-17"
approval-scope: "Core: right-sized FSD migration"
execution-order: "fsd-first"
completed-at: "2026-08-17"
verification-summary: "Core fsd-first 완료: exact src 84개(missing/unexpected 0), legacy top-level 0, runtime 128/128, boundary fixture 11/11, check/final boundary/build/route smoke 통과. FEAT-10은 최종 FSD tree 기준 full reconciliation clean pass 뒤 별도 구현한다."
closed-at: null
closed-by: null
closed-reason: null
owners: ["admin-dev"]
related:
  - "apps/admin/docs/ADR/0001-adopt-fsd-for-admin.md"
  - "apps/web/docs/conventions/fsd-architecture-guidelines.md"
  - ".claude/agents/admin-dev.md"
  - "docs/plans/FEAT-03.md"
  - "docs/plans/FEAT-07.md"
  - "docs/plans/FEAT-08.md"
  - "docs/plans/FEAT-09.md"
  - "docs/plans/FEAT-10.md"
  - "docs/proposals/active/remote-agent-pipeline-generalization.md"
  - "PROJECT_BOARD.md"
  - "TASK_BACKLOG.md"
  - "docs/proposals/completed/2026-08-02-admin-app-split.md"
  - "docs/proposals/completed/2026-08-02-monorepo-admin-split.md"
  - "apps/admin/docs/proposals/active/admin-src-fsd-contract-hardening.md"
---

# Admin `src`를 right-sized FSD 구조로 리팩터링

## Summary

`apps/admin/src`의 마이그레이션 전 62개 파일을 `apps/web/src`가 지향하는 Feature-Sliced Design(FSD) 의존성 모델에 맞춰 재배치한다. 다만 `web/src`의 실제 레거시 경로, 깊은 import, 혼합된 파일명, 사용되지 않는 레이어까지 복제하지 않고, admin에 실제로 존재하는 화면·행위·엔티티만 만든다. 이 62개 기준선은 HEAD `0c5e42a5b3352faa3c3cdeee56ead6745acf972c`의 **FEAT-10 구현 전** 소스다.

권장 구조는 `app`을 Next.js 프레임워크 진입점으로 유지하고, `fsd/pages`, `fsd/widgets`, `fsd/features`, `fsd/entities`, `fsd/shared`를 단방향으로 구성하며, 인증은 Edge/Node 런타임 경계를 보존하기 위해 `server/auth`에 둔다. 구조 이동 전에 인증과 외부 GitHub 쓰기 경계의 characterization test를 추가하고, 각 수직 슬라이스를 이동할 때마다 테스트·타입 검사·아키텍처 경계 검사를 통과시킨다.

이 문서는 2026-08-17 사용자 승인으로 `Core: right-sized FSD migration`과 `fsd-first` 실행 순서가 확정된 구현 제안서다. ADR 0001의 accepted 기록과 아래 단계·전 파일 매핑을 작업 지시서로 사용한다.

승인 범위는 `Core`로 고정됐다. 이는 동작 보존 구조 이동과 그 안전망만 포함하며, `Full`의 contract/behavior hardening은 후속 제안으로 남긴다. 같은 pipeline 파일을 바꾸는 FEAT-10보다 FSD migration을 먼저 수행한다. FEAT-10 계획을 FSD 경로로 편집하는 순간 기존 flat-tree 기준 무편집 검증은 역사 증거가 되므로, 최종 FSD tree를 기준으로 FEAT-10 계획 자체가 다시 full reconciliation의 no-edit clean pass를 받기 전에는 FEAT-10 구현승인이나 구현을 시작하지 않는다.

> **완료 후 현재 상태(2026-08-17):** Core migration 결과는 exact 84-file FSD source이며 legacy 최상위 폴더는 0개다. 아래 `Current State`, 62-row mapping, `feat10-first` 68-row 산식과 pre-implementation evidence의 62-file/신규 6·수정 5 표기는 승인·실행 당시 기준선을 보존한 역사 기록이다. 최신 `docs/plans/FEAT-10.md`의 별도 구현 계약은 **신규 7개·수정 10개**, 신규 source는 현재 0개이며 구현 후 예상 source는 91개다. 현재 구현 입력은 그 계획서와 아래 post-FSD reconciliation evidence가 소유한다.

## Goal

- admin 코드를 화면, 사용자 행위, 도메인 데이터, 공용 인프라의 실제 소유권에 맞게 배치한다.
- `pages > widgets > features > entities > shared` 단방향 의존성과 슬라이스 public API를 자동 검사한다.
- `server-only`, `"use server"`, `"use client"`, Edge-safe auth 설정 경계를 구조 이동 중에도 보존한다.
- 인증 3중 방어, analytics 읽기 전용성, GitHub 명령/게이트 whitelist와 stale/SHA 보호를 회귀 테스트로 고정한다.
- 현재 flat 경로를 설명하는 `apps/admin/CLAUDE.md`를 새 source of truth로 갱신한다.
- 완료 시 기존 `analytics/`, `auth/`, `lib/`, `observability/`, `pipeline/`, `ui/` 최상위 폴더를 제거한다.

## Proposal Size

`proposal-size`: `standard`

선택 근거:

- 62개 기존 소스 파일 전체의 경로와 import가 영향을 받는다.
- Next.js route group과 layout, 인증 경로, Server Action, barrel/public API가 영향을 받는다.
- GitHub issue comment와 board commit이라는 외부 쓰기 경계가 포함된다.
- 테스트 구성, TypeScript 보조 설정, package script, 아키텍처 문서와 ADR이 함께 바뀐다.
- 단계별 롤백이 필요하며 단일 파일 revert로 복구할 수 있는 범위가 아니다.

## Current State (마이그레이션 전 기준선)

### 조사 기준

2026-08-17, HEAD `0c5e42a5b3352faa3c3cdeee56ead6745acf972c` 기준으로 다음을 직접 대조했다.

| 대상 | 규모/설정 | 확인한 내용 |
| --- | --- | --- |
| `apps/admin/src` | 62 files, 4,934 physical / 4,450 nonblank lines | 모든 소스·테스트 파일의 import/export, 런타임 directive, I/O와 소유권. FEAT-09 완료와 FEAT-10 **구현 전** 최신 reconciled HEAD 기준 |
| `apps/web/src` | 234 files, 22,018 physical / 20,213 nonblank lines | 실제 FSD 배치, route wrapper, server auth, shared UI, public API 사용 방식 |
| web FSD 가이드 | `pages > widgets > features > entities > shared` | 레이어 방향, peer slice 금지, segment와 page-local UI 기준 |
| admin local config | Next 15.5.7, React manifest `^19.0.0` / lock·runtime 19.2.0, TypeScript manifest `^5.8.2` / lock·runtime 5.9.3 | strict, `noUncheckedIndexedAccess`, `checkJs`, App Router, npm workspace. manifest 범위를 설치 exact version으로 오기하지 않음 |
| admin test | 8개 `.test.mjs`, 95 tests | 순수 reporting/board/command와 forward/reject transition을 보호한다. reject 순수 계층 26개는 추가됐지만 action/auth wrapper와 client interaction은 아직 없음 |

`web/src`는 참고 구현이지만 그대로 복제할 source of truth는 아니다. 실제 web 트리에는 PascalCase 파일, camelCase hook, 깊은 slice import 같은 과거 부채가 남아 있다. admin의 새 파일은 kebab-case를 사용하고, 구조 규칙은 `apps/web/docs/conventions/fsd-architecture-guidelines.md`의 의도된 규칙을 따른다.

### 현재 동작과 책임 지도

| 영역 | 현재 진입점과 동작 | I/O | 반드시 보존할 계약 |
| --- | --- | --- | --- |
| 인증 | `auth/config.ts`, `auth/config.edge.ts`, `auth/guard.ts` | NextAuth, 환경 변수 | sign-in allowlist, Edge session route, destination live allowlist 재검사의 3중 방어 |
| analytics | `app/analytics/page.tsx`가 파라미터를 해석하고 4개 query를 병렬 호출 | `@repo/db` read | DB 쓰기 금지, shared analytics contract, reporting 함수의 순수성 |
| pipeline read | dev 브랜치 `PROJECT_BOARD.md`를 읽어 board와 briefing을 구성 | GitHub raw GET | 최신 section이 먼저라는 순서, 동일 ID는 첫 항목이 최신, 렌더링은 read-only |
| pipeline command | client button → Server Action → issue #87 comment | GitHub POST | 클라이언트는 key만 전달, 서버 whitelist만 본문 생성, 문자열 byte-for-byte 유지, status 변경 금지 |
| gate edit | 승인/반려 client controls → Server Action → board contents GET/PUT | GitHub GET/PUT | forward 2개와 reject 3종 whitelist, 최소 status/result/block diff, expected status stale 검사, SHA 409 처리 |
| observability test | 관리자만 합성 Sentry event 전송 | Sentry SDK | 현재 isolation scope와 never-throw는 유지. 현재 `flushReports(): Promise<void>`가 Sentry `false`를 버려 action이 성공으로 표시하는 문제는 Full에서만 수정 |
| UI | `ui/`에 atoms와 analytics/pipeline/login/observability UI가 혼재 | React/Next | 큰 page composition은 Server Component, 상호작용 leaf만 client |

### 구조상 문제

1. `ui/`가 generic atom, 특정 화면, mutation client, 로그인, 공통 header를 모두 담아 경로만으로 소유권을 알 수 없다.
2. `pipeline/`이 entity read model, 두 외부 쓰기 시나리오, page projection, sprite 표시 모델을 한 폴더에 담는다.
3. analytics 수정은 `app/`, `analytics/`, `ui/`를 동시에 찾아야 하며 이벤트 입력 타입과 range/funnel 계약이 중복된다.
4. auth allowlist parser와 테스트가 generic `lib/`에 떨어져 있어 보안 변경 시 함께 찾기 어렵다.
5. `observability/`가 재사용 telemetry 인프라와 특정 관리자 테스트 행위를 섞고, 해당 UI는 다시 `ui/`에 있다.
6. 현재 테스트는 순수 함수는 잘 보호하지만 page/auth/action wrapper의 인가 순서와 “인가 전 fetch 0회”를 보호하지 않는다.
7. `.test.mjs`는 runtime test에는 포함되지만 `tsconfig.json`의 strict program에는 포함되지 않는다.
8. `apps/admin/CLAUDE.md`의 “admin 내부는 FSD를 적용하지 않는다”는 규칙은 “화면 2개”였던 2026-08-02 판단을 전제로 한다. 현재는 login, analytics, observability, pipeline과 여러 외부 쓰기 동작이 존재한다.
9. 최신 reconciled HEAD에서 `apps/admin/CLAUDE.md`의 test 수와 gate edit 설명은 95 tests와 forward/reject 계약으로 갱신됐다. Phase 7A는 이 최신 계약을 보존하면서 과거 “FSD를 적용하지 않는다” 구조 규칙만 accepted ADR과 새 tree에 맞게 대체해야 한다.
10. `.claude/agents/admin-dev.md`도 `apps/admin`은 FSD가 아니며 `src/analytics`, `src/auth`, `src/lib`, `src/observability`, `src/pipeline`, `src/ui`를 사용하라고 강제한다. 이 운영 지침을 함께 바꾸지 않으면 향후 `admin-dev`가 새 구조를 낡은 규칙 위반으로 판단하거나 legacy 경로에 새 코드를 만들 수 있다.
11. 활성 `TASK_BACKLOG.md`의 FEAT-10 `area`는 `apps/admin/src/pipeline + apps/admin/src/ui`다. 이 값은 PM과 `admin-dev`가 그대로 출발점으로 쓰므로, FEAT-10이 migration 완료 시점에도 backlog에 남아 있다면 새 page/feature/entity 경로로 갱신해야 한다.
12. 최신 saved `PROJECT_BOARD.md`의 FEAT-10은 `계획지시`가 아니라 **`검토대기`**다. `docs/plans/FEAT-10.md`가 생성되고 반복 검증된 상태이며, 계획은 신규 6개(`run-plan`, `progress`, `progress-action`, `pipeline-run-control`과 순수 test 2개)와 기존 5개(`briefing`, `briefing.test`, `pipeline-page`, `pipeline-gate`, `env.js` 주석)를 바꾸도록 지시한다. 아직 `apps/admin/src`에는 구현되지 않아 현재 62-file inventory 자체는 불변이다.
13. FEAT-10은 이 proposal과 같은 `pipeline/briefing.ts`, `ui/pipeline-page.tsx`, `ui/pipeline-gate.tsx`를 건드린다. 둘을 동시에 구현하면 flat→FSD 이동과 기능 추가가 같은 diff에서 교차하고, 어느 계획의 경로·test 수·fetch owner가 source of truth인지 결정할 수 없다. 따라서 동시 구현을 금지하고 아래 「FEAT-10 실행 순서 gate」를 선행한다.
14. FEAT-10의 `run-plan.ts`는 `describePipelineRun`과 gate 전용 `gateNextActionHint`를 한 파일에 둔다. 이를 단순히 `features/run-pipeline-command`로 옮기면 `transition-pipeline-gate` UI가 peer feature를 import해 이 proposal의 rule 2를 위반한다. 또한 `progress-action.ts`는 GitHub GET을 추가하므로 현재 rule 13의 production fetch owner exact 3개 계약은 FEAT-10 구현 후 exact 4개로 바뀌어야 한다.
15. HEAD `2eb1c19`가 raw CDN `max-age=300` 실측에 따른 도장 직후 최대 5분 투영 지연과 exact `보드에 반영되면`/`방금 찍었다면 보드 반영까지 최대 5분 걸립니다.` 카피를 커밋한 뒤, `7716b6b`~`0c5e42a`가 FEAT-10 계획의 template 정합성, 신호원 측정 귀속, 0분 표시, 채널 범위 설명과 추가 mutation-test 계약을 보강했다. 현재 plan/board는 clean이고 `apps/admin/src` 62-file 기준선은 불변이다. Phase 0은 이 누적 계약을 FSD 목적지와 test 명세에 보존하고, 이후 새 pre-existing edit가 생기면 덮지 않는 일반 preflight를 유지한다.
16. 두 운영 지침은 현재 test runner가 DB/외부 I/O를 덮을 수 없다고 설명하고, `apps/admin/CLAUDE.md`는 old script 목록과 “8개 파일, 95개 테스트”를 고정한다. 그러나 Core부터 module mock으로 DB/GitHub/Sentry를 검증하고 test/boundary script 수가 늘며, Full은 `tsconfig.test.json`으로 `.mjs`까지 typecheck한다. 또 두 문서의 reporting “import 0” 규칙은 Core에는 맞지만 Full의 type-only `AnalyticsEventName` 계약과 충돌한다. 경로 anchor만 바꾸는 Phase 7A/parser로는 이 semantic drift를 검출하지 못한다.
17. 기존 rule 12는 허용 파일 밖 `db.analyticsEvent.findMany` 같은 추가 read와 namespace/dynamic/re-export alias 또는 generated Prisma deep import를 막지 못한다. 기존 rule 13도 `window.fetch`/`self.fetch`, known-global의 non-literal computed access, browser network primitive, 합법적인 세 source 밖의 `@sentry/nextjs` import를 놓친다. 따라서 test가 실행하지 않는 DB/외부 SDK 효과가 새 owner에서 생겨도 완료 판정이 false-pass할 수 있다.

### 기준선 검증

| 명령 | 결과 | 의미 |
| --- | --- | --- |
| `npm.cmd run test -w apps/admin` | Pass: 95 tests, 26 suites, 0 fail | 현재 runtime behavior 기준선; reject 순수 계층 26개 포함 |
| `npx.cmd tsc --noEmit --incremental false -p apps/admin/tsconfig.json` | Pass | cache를 쓰지 않은 production TypeScript 기준선 |
| `node --import tsx --experimental-test-module-mocks --test "src/**/*.test.mjs"` (`apps/admin`에서 실행) | Pass: 95 tests, 26 suites, 0 fail | Node 22.13.1에서 제안한 module-mock test runner가 실제 전체 suite를 실행함 |
| `node --import tsx --experimental-test-module-mocks` alias mock probe | Pass | `~/auth/guard`, `~/env`를 import 전에 mock하고 현재 command action을 불러왔으며 missing-token에서 외부 호출 0회를 확인함 |
| 기존 8개 `.test.mjs`를 제안한 Full strict 옵션(`allowJs + checkJs + noUncheckedIndexedAccess + allowImportingTsExtensions + Bundler`)으로 임시 typecheck | Fail: 108 errors / 6 files | runner/API 사용 가능성과 별개로 기존 fixture/index/find 값의 undefined narrowing이 부족함. Full Phase 7B에서 설정을 약화하지 않고 테스트 소스를 수정해야 함 |
| `npm.cmd run check -w apps/admin` | Pass: ESLint 0 warnings/errors, TypeScript 0 errors | 현재 lint/type 기준선. Next 15.5.7의 `next lint` deprecation warning은 실패가 아니며 Next 16 전환 시 script 재검토 |
| safe build | Pass after implementation | Sentry upload disabled 상태에서 Next 15.5.7 production build와 route generation 통과 |

현재 `.next`는 source의 `/pipeline` route를 manifest에 포함하지 않는 오래된 산출물이므로 기준 증거로 사용하지 않는다. 최종 route/middleware 검증은 source 변경 뒤 `.next`를 새로 생성한 build에서만 수행한다.

### 프레임워크·런타임 근거

- Next.js 15 [Route Groups](https://nextjs.org/docs/15/app/api-reference/file-conventions/route-groups)는 괄호 폴더가 URL path에 포함되지 않으며 선택된 route들에 layout을 공유하는 용도임을 명시한다.
- Next.js [Authentication guide](https://nextjs.org/docs/app/guides/authentication)는 client navigation에서 layout이 재렌더되지 않을 수 있으므로 권한 검사를 page/data/Server Action 가까이에 두도록 안내한다. 따라서 protected layout guard는 page/action guard를 대체하지 않는다.
- Next.js [`use server` reference](https://nextjs.org/docs/app/api-reference/directives/use-server)는 module-level `"use server"` 파일을 Client Component에서 import하는 패턴을 지원한다. 이 문서의 same-feature action 예외는 그 패턴으로만 제한한다.
- Next.js 15 [Data Security guide](https://nextjs.org/docs/15/app/guides/data-security)와 [Caching guide](https://nextjs.org/docs/15/app/guides/caching#client-side-router-cache)를 기준으로 server-only 모듈과 `no-store` board read를 보존한다.
- Node 22.13.1의 [`--experimental-test-module-mocks`](https://nodejs.org/download/release/v22.13.1/docs/api/cli.html#--experimental-test-module-mocks)와 [`mock.module`](https://nodejs.org/download/release/v22.12.0/docs/api/test.html#mockmodulespecifier-options)은 실험 기능이므로 고정된 Node 하한과 mock 격리 규칙을 verification에 둔다.

## Scope

포함 범위:

- `apps/admin/src` 62개 기존 파일의 재배치, 필요한 rename, import 갱신
- admin에 실제로 필요한 FSD slice/segment와 public API 생성
- Next.js protected route group과 공통 header layout
- auth infrastructure의 `src/server/auth` 이동
- architecture boundary 검사 script와 package script
- admin Node engine metadata에 따른 root `package-lock.json` workspace entry 갱신(의존성 버전 변경 없음)
- 구조 이동 전 characterization test와 누락된 reporting test
- 구조와 직접 연결된 타입 계약, parser, observability/error handling hardening
- `apps/admin/CLAUDE.md`, `.claude/agents/admin-dev.md`, 중첩 `remote-agent-pipeline-generalization.md`, 활성 FEAT-10 backlog locator, admin ADR, 이 proposal의 실행 기록 갱신
- FEAT-10과의 실행 순서 결정, `fsd-first`일 때 활성 FEAT-10 계획의 경로/경계 재기준화와 최종 FSD tree 기준 post-migration full reconciliation, `feat10-first`일 때 구현 완료 후 이 proposal 전체 재검증

제외 범위:

- `apps/web/src` 자체의 legacy deep import, casing, slice 구조 정리
- UI 디자인, 문구 전면 개편, Tailwind theme 재설계
- analytics schema/이벤트 이름/퍼널 제품 정의 변경
- DB migration 또는 admin의 DB 쓰기 추가
- 현재 forward/reject whitelist 밖의 새로운 pipeline command, agent, gate edit 추가
- GitHub repository/branch/issue 번호 변경
- live GitHub command/commit 또는 live Sentry 전송을 자동 검증에서 실행하는 것
- 재사용 근거가 없는 `pipeline-briefing` widget 생성
- 단순히 길다는 이유로 `analytics-page`의 정적 section을 여러 component로 분리하는 것
- pipeline 전용 global token을 별도 stylesheet로 옮기는 것
- `docs/plans/FEAT-03.md`, `FEAT-07.md`, `FEAT-09.md`와 `PROJECT_BOARD.md` 완료 행의 당시 경로·line reference를 현재 경로로 일괄 치환하는 것. 이들은 구현 당시 상태를 보존하는 역사 기록이며, 새 실행 목적지는 이 proposal의 mapping/public API 표가 소유한다.
- 이 migration 안에서 FEAT-10의 제품 동작, UI, FIFO 판별, 15초 폴링을 구현하는 것. `fsd-first`는 FEAT-10 계획을 새 경로에 맞게 **재기준화만** 하고 기능 구현은 별도 승인/실행으로 남긴다.

### 승인 단위와 완료 기준의 기준선

| 단위 | 포함 | 제외/처리 |
| --- | --- | --- |
| `Core: right-sized FSD migration` | Phase 0, 모든 `A` 단계, Phase 3, Phase 7A/7C. 구조 이동 전 auth/action characterization test, 경계 검사, public API, protected shell, ADR/CLAUDE 갱신 포함 | 모든 `B/C` hardening과 test-source typing은 구현하지 않는다. 발견 사항은 완료 기록의 follow-up proposal 링크로 남긴다. |
| `Full: right-sized FSD migration + contract hardening` | Core + Phase 1B, 2B, 4B, 5B, 5C, 6B, 7B | 이 문서에 열거된 hardening 전부가 완료 조건이다. 일부만 임의 선택할 수 없다. |

`Must`/`Should`/`Consider`는 품질 검토 심각도이고 구현 권한이 아니다. `approval-scope`가 실행 범위를 결정한다. `Core` 승인으로 `Full` 항목을 묵시적으로 구현하거나, `Full` 승인 후 실패한 hardening을 생략한 채 완료 처리하지 않는다.

### FEAT-10 실행 순서 gate (승인 당시; `fsd-first` 선택 완료)

현재 두 문서는 동일 파일군을 대상으로 하고 FEAT-10은 `검토대기`다. 승인자는 front matter의 `execution-order`에 아래 exact 값 중 하나를 기록해야 한다.

| 값 | 시작 조건 | 이 proposal의 기준선과 조치 |
| --- | --- | --- |
| `"fsd-first"` | FEAT-10 구현을 이 migration 완료 뒤로 명시적으로 미루고, `docs/plans/FEAT-10.md`의 flat 경로·peer-feature import를 아래 목적지로 먼저 재기준화 | 현재 62-file mapping과 Core 84/Full 89 exact set을 사용한다. migration 완료 뒤 최종 FSD tree를 기준으로 FEAT-10 계획에 INV-1~INV-7 full reconciliation과 no-edit clean pass를 다시 수행한 후에만 별도 구현승인/구현으로 넘어간다. |
| `"feat10-first"` | FEAT-10 구현·검증·board/backlog 갱신이 끝나고 `apps/admin/src`가 안정된 뒤 이 proposal을 **INV-1~INV-7 전체 재검증** | 현재 mapping/count/parser를 실행에 사용하지 않는다. 예상 기준선은 68 files이고, progress action contract test 1개를 Core 안전망에 더하면 예상 Core 91/Full 96이지만 실제 구현 inventory로 다시 확정해야 한다. |

`execution-order: null`이거나 FEAT-10 source가 일부만 들어온 혼합 상태면 Phase 0 이전에 중단한다. `fsd-first`를 선택한 뒤 FEAT-10 source가 하나라도 먼저 들어오거나, `feat10-first`를 선택한 뒤 62-file 기준선이 남아 있어도 중단하고 다시 검증한다. board status만으로 구현 완료를 추정하지 않고 실제 `apps/admin/src` path/content와 tests를 기준으로 판정한다.

`fsd-first`의 Phase 0에서 FEAT-10 계획을 편집하는 순간 그 계획의 기존 flat-tree clean pass는 현재 구현 준비 증거가 아니다. 계획에는 `post-FSD full reconciliation`과 `no-edit clean pass` 전 구현 금지를 명시하고 기존 검증 기록은 당시 근거로만 보존한다. `PROJECT_BOARD.md`의 `검토대기` status는 사용자 gate이므로 자동 전이하지 않으며, Phase 7A의 최종 source·public API·test owner가 확정된 뒤 해당 계획을 최신 코드와 다시 reconcile한다.

`fsd-first`에서 FEAT-10 계획을 재기준화할 exact 목적지는 다음과 같다. 이 표는 FEAT-10 기능 구현 권한이 아니라 두 계획 사이의 경계 계약이다.

| FEAT-10 flat 계획 | FSD 목적지/처리 |
| --- | --- |
| `pipeline/run-plan.ts`, `pipeline/run-plan.test.mjs` | `fsd/features/run-pipeline-command/model/run-plan.ts`, `fsd/features/run-pipeline-command/model/run-plan.test.mjs`; `describePipelineRun`/`RunPlan`만 소유. gate-waiting description의 exact `결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다. 방금 찍었다면 보드 반영까지 최대 5분 걸립니다.`와 대응 test를 보존 |
| `pipeline/progress.ts`, `pipeline/progress.test.mjs` | `fsd/features/run-pipeline-command/model/progress.ts`, `fsd/features/run-pipeline-command/model/progress.test.mjs` |
| `pipeline/progress-action.ts` | `fsd/features/run-pipeline-command/api/get-pipeline-progress.ts`; same-feature UI만 상대 import, public root 미수출 |
| FEAT-10에 빠진 GET action contract test/owner gate | `fsd/features/run-pipeline-command/api/get-pipeline-progress.test.mjs`를 필수 추가. auth-first, exact URL/`since`/`per_page`, token 유무 header, `cache: "no-store"`, non-OK·fetch reject·malformed JSON·non-array·**invalid `created_at`→`unknown`**, **수정돼 재진입한 창 밖 `created_at` 제외**, valid FIFO projection, live network 0을 mock으로 고정. 계획의 FSD 후속 경계 절에 entity query, command POST, gate GET/PUT, progress GET의 **네 full owner path**를 열거 |
| `ui/pipeline-run-control.tsx` | `fsd/features/run-pipeline-command/ui/pipeline-run-control.tsx`; feature root는 `PipelineRunControl`, `describePipelineRun`, `RunPlan`만 explicit named export |
| `pipeline/run-plan.ts`의 `gateNextActionHint` | peer feature import를 만들지 않고 기존 `fsd/features/transition-pipeline-gate/model/transitions.ts`로 옮겨 `GATE_TRANSITIONS` descriptor의 target/deliverable에서 도출. gate UI는 같은 slice 상대 import, run-command feature를 import하지 않음. success hint는 exact `보드에 반영되면` prefix와 대상별 deliverable을 보존 |
| `pipeline/briefing.ts`, `pipeline/briefing.test.mjs` | 기존 목적지 `fsd/pages/pipeline/model/briefing.ts`, `fsd/pages/pipeline/model/briefing.test.mjs`에서 run-command feature public root의 `describePipelineRun`/`RunPlan`을 import하고 plan 배선을 검증 |
| `ui/pipeline-page.tsx` | 기존 목적지 `fsd/pages/pipeline/ui/index.tsx`가 `PipelineRunControl`을 run-command public root에서 import |
| `ui/pipeline-gate.tsx` | 기존 목적지 `fsd/features/transition-pipeline-gate/ui/gate-transition-button.tsx`가 같은 slice `model/transitions.ts`의 local `gateNextActionHint`를 사용 |
| `env.js` 주석 | root `env.js`에서 그대로 수정; 스키마는 optional 유지 |

FEAT-10 완료 뒤 예상 파일 산식은 `기존 62 + FEAT-10 구현 6 = mapping 68`, `기존 Core 신규 22 + GET action contract test 1 = Core 신규 23`, 따라서 `Core 91`, `Full 96`이다. 이는 계획 입력으로 계산한 **예상치**이며 `feat10-first` 선택 시 최종 구현 파일과 exact mapping/parser를 다시 작성·검증하기 전에는 완료 기준으로 사용할 수 없다.

위 산식은 선택되지 않은 `feat10-first` 대안을 비교하던 당시 기록이다. 실제 선택·완료된 `fsd-first` 기준의 최신 산식은 `Core 84 + FEAT-10 신규 7 = 91`이며, 수정 대상 10개는 파일 수를 늘리지 않는다. `Full 96`은 후속 Full 제안의 신규 5개까지 별도 승인·재검증한 경우에만 성립한다.

## Proposal

### 1. 선택안

비교한 대안은 다음과 같다.

| 대안 | 장점 | 단점 | 판단 |
| --- | --- | --- | --- |
| A. 현재 flat 구조 유지 | 이동 비용이 없음 | “2 screens” 전제가 깨졌고 새 행위가 계속 generic 폴더에 누적됨 | 기각 |
| B. 현재 `web/src` 트리를 그대로 복사 | 표면적 경로가 가장 비슷함 | web의 casing/deep import/과도한 slice까지 복제하고 admin 규모에 불필요한 빈 레이어가 생김 | 기각 |
| C. web의 문서화된 의존성 모델을 admin 규모에 맞게 적용 | 두 앱이 같은 사고 모델을 쓰면서 admin의 실제 소유권만 표현함 | 초기 이동과 boundary test 비용이 있음 | 채택 |

채택안 C의 핵심은 “모든 레이어를 채우는 것”이 아니다. 실제 재사용이 있는 `admin-header`만 widget으로 두고, pipeline briefing과 Pixel Office는 한 페이지에서만 쓰이므로 `pages/pipeline`에 둔다. 빈 slice/segment는 만들지 않으며 두 번째 사용처가 생길 때 승격한다.

### 2. 제안 용어

아래 용어는 이번 Core 승인으로 admin의 ubiquitous language로 확정한다. 저장소에 domain `CONTEXT.md`를 도입하기로 별도 합의하면 구현 세부 경로를 제외한 정의만 옮긴다.

| 용어 | 정의 | 소유 후보 |
| --- | --- | --- |
| Admin Identity | 정규화한 이메일이 현재 `ADMIN_EMAILS`에 포함된 JWT 사용자 | `server/auth` |
| Analytics Report | shared analytics event contract를 읽어 만든 기간/퍼널 집계 | `entities/analytics-event` |
| Pipeline Board | dev 브랜치 `PROJECT_BOARD.md`를 해석한 read model | `entities/pipeline` |
| Briefing | newest-first board와 known-agent 표시 정보를 결합한 `/pipeline` 전용 projection | `pages/pipeline` |
| Pipeline Command | issue #87에 게시하는 whitelist된 실행 명령. gate status를 바꾸지 않음 | `features/run-pipeline-command` |
| Gate Edit | forward(`승인대기 → 계획지시`, `검토대기 → 구현승인`)와 reject(`검토대기 → 계획지시`, 승인/검토대기 → 보류 또는 최신 항목 제거) whitelist만 허용하는 board commit | `features/transition-pipeline-gate` |
| Observability Test | 관리자가 Sentry 도달 여부를 확인하는 합성 보고 시도 | `features/send-observability-test` |

### 3. 목표 디렉터리 구조

```text
apps/admin/src/
├─ app/
│  ├─ (protected)/
│  │  ├─ layout.tsx
│  │  ├─ analytics/page.tsx
│  │  ├─ observability/page.tsx
│  │  └─ pipeline/page.tsx
│  ├─ api/auth/[...nextauth]/route.ts
│  ├─ login/page.tsx
│  ├─ layout.tsx
│  ├─ page.tsx
│  └─ robots.ts
├─ fsd/
│  ├─ pages/
│  │  ├─ analytics/
│  │  │  ├─ lib/format-ratio-as-percent.ts
│  │  │  ├─ model/report-view.ts
│  │  │  ├─ model/search-params.ts                 # Full only
│  │  │  ├─ model/search-params.test.mjs           # Full only
│  │  │  ├─ ui/index.tsx
│  │  │  └─ index.ts
│  │  └─ pipeline/
│  │     ├─ model/briefing.ts
│  │     ├─ model/briefing.test.mjs
│  │     ├─ model/known-agents.ts
│  │     ├─ model/desk-commands.ts
│  │     ├─ model/desk-commands.test.mjs
│  │     ├─ model/sprites.ts
│  │     ├─ model/sprites.test.mjs
│  │     ├─ ui/
│  │     │  ├─ _component/
│  │     │  │  ├─ agent-avatar.tsx
│  │     │  │  ├─ pixel-sprite.tsx
│  │     │  │  ├─ pixel-office.tsx
│  │     │  │  ├─ owner-banner.tsx
│  │     │  │  ├─ board-warning-banner.tsx          # Full only
│  │     │  │  └─ board-warning-banner.test.mjs     # Full only
│  │     │  └─ index.tsx
│  │     └─ index.ts
│  ├─ widgets/
│  │  └─ admin-header/
│  │     ├─ ui/index.tsx
│  │     └─ index.ts
│  ├─ features/
│  │  ├─ admin-sign-in/
│  │  │  ├─ ui/login-button.tsx
│  │  │  └─ index.ts
│  │  ├─ run-pipeline-command/
│  │  │  ├─ api/post-pipeline-command.ts
│  │  │  ├─ api/post-pipeline-command.test.mjs
│  │  │  ├─ model/commands.ts
│  │  │  ├─ model/commands.test.mjs
│  │  │  ├─ ui/pipeline-command-button.tsx
│  │  │  └─ index.ts
│  │  ├─ transition-pipeline-gate/
│  │  │  ├─ api/commit-gate-transition.ts
│  │  │  ├─ api/commit-gate-transition.test.mjs
│  │  │  ├─ model/transitions.ts
│  │  │  ├─ model/transitions.test.mjs
│  │  │  ├─ ui/gate-transition-button.tsx
│  │  │  ├─ ui/reject-actions.tsx
│  │  │  └─ index.ts
│  │  └─ send-observability-test/
│  │     ├─ api/send-observability-test-event.ts
│  │     ├─ api/send-observability-test-event.test.mjs
│  │     ├─ ui/observability-test-panel.tsx
│  │     └─ index.ts
│  ├─ entities/
│  │  ├─ analytics-event/
│  │  │  ├─ api/index.ts
│  │  │  ├─ api/queries.ts
│  │  │  ├─ api/queries.test.mjs
│  │  │  ├─ model/report-options.ts                 # Full only
│  │  │  ├─ model/reporting.ts
│  │  │  ├─ model/reporting.test.mjs
│  │  │  └─ index.ts
│  │  └─ pipeline/
│  │     ├─ api/index.ts
│  │     ├─ api/queries.ts
│  │     ├─ api/queries.test.mjs
│  │     ├─ config/github.ts
│  │     ├─ model/board.ts
│  │     ├─ model/board.test.mjs
│  │     └─ index.ts
│  └─ shared/
│     ├─ api/result.ts
│     ├─ lib/utils.ts
│     ├─ observability/index.ts
│     ├─ observability/report-error.ts
│     ├─ observability/report-error.test.mjs
│     └─ ui/atoms/{badge,button,card,sonner,table}.tsx
├─ server/auth/
│  ├─ config.edge.ts
│  ├─ config.edge.test.mjs
│  ├─ config.ts
│  ├─ config.test.mjs
│  ├─ guard.ts
│  ├─ guard.test.mjs
│  ├─ index.ts
│  ├─ parse-admin-emails.ts
│  └─ parse-admin-emails.test.mjs
├─ env.js
├─ instrumentation.ts
├─ middleware.ts
├─ sentry.server.config.ts
└─ styles/globals.css
```

최종 트리에서 `analytics/`, `auth/`, `lib/`, `observability/`, `pipeline/`, `ui/`는 `src` 직속에 남지 않는다.

- `fsd-first` Core 목표: 기존 62개 파일을 일대일 매핑하고 Core 신규 22개를 더한 `src` 84개 파일
- `fsd-first` Full 목표: Core 84개 + `report-options`, search-param 2개, board-warning 2개를 더한 `src` 89개 파일
- `tsconfig.test.json`, boundary script 2개, package/lock metadata, ADR은 `src` 파일 수에 포함하지 않는다.
- `feat10-first`에서는 이 tree와 수를 그대로 실행하지 않는다. FEAT-10 실제 6개 추가와 새 GET action contract test를 포함한 예상 Core 91/Full 96을 출발점으로 full inventory/mapping/parser를 다시 만든다.

### 4. 의존성 규칙

#### 레이어 행렬

| source | 허용 대상 | 금지 대상 |
| --- | --- | --- |
| `app` | pages, widgets, features, entities, shared, `server/auth`, root framework config | route가 domain 구현 파일을 deep import하는 것 |
| `pages` | widgets, features, entities, shared | 다른 page slice, app |
| `widgets` | features, entities, shared | pages, 다른 widget slice |
| `features` | entities, shared, 허용된 root server infrastructure | pages, widgets, 다른 feature slice |
| `entities` | shared | features, widgets, pages, 다른 entity slice |
| `shared` | shared 내부 또는 외부 package | entities/features/widgets/pages |
| `server/auth` | root `env`, auth 내부, 외부 package | FSD page/widget/feature UI |

admin에서 허용하는 FSD 밖 인프라 예외는 다음 두 가지뿐이다.

- Server Action/API 구현이 `~/server/auth/guard`와 `~/env`를 import하는 것
- `middleware.ts`가 `~/server/auth/config.edge`를 직접 import하는 것

#### slice/public API 규칙

- `pages`, `widgets`, `features`, `entities`의 각 slice root에는 외부 소비자용 `index.ts`를 둔다.
- slice 내부 파일끼리는 상대 경로로 defining file을 import한다. 자기 slice의 root barrel을 다시 import하지 않는다.
- 외부 소비자는 `~/fsd/<layer>/<slice>`만 사용한다.
- entity의 server-only query는 runtime 혼합을 피하기 위해 `~/fsd/entities/<slice>/api`를 별도 public entry로 허용한다.
- `index.ts` 자체에는 `"use client"`나 `"use server"`를 붙이지 않는다. directive는 실제 구현 파일 첫 줄에 유지한다.
- Core의 `entities/analytics-event/index.ts`는 외부 runtime-neutral surface가 아직 없으므로 정확히 `export {};`만 둔다. server query는 `api/index.ts`, reporting 구현은 slice 내부에만 둔다. Full에서만 이 root가 report option/type/guard를 named export한다.
- feature root는 client component와 runtime-neutral type/model만 노출하고 Server Action은 노출하지 않는다. client component가 같은 slice의 action 구현을 상대 경로로 import한다. entity root는 `server-only` query를 재수출하지 않고, `server/auth/index.ts`는 Edge config를 재수출하지 않는다.
- 위 상대 import는 Next.js가 공식 지원하는 전용 module-level `"use server"` 파일에 대한 직접 import만 예외로 허용한다. boundary script는 이 edge를 허용하되, action의 `server/auth`, `env`, entity server API 의존성을 client graph로 재귀 전파하지 않는다.
- tests는 같은 slice 구현을 검증할 때 상대 경로를 사용하고, cross-slice contract test일 때만 상대 slice의 public API를 사용한다.
- page에서 분리한 page-private UI는 web FSD 가이드와 실제 web tree의 convention대로 `pages/<slice>/ui/_component`에 둔다. `ui/index.tsx`만 화면 조립을 소유하고 private component를 slice root에서 재수출하지 않는다.
- 모든 slice public entry는 explicit named export만 사용하고 `export * from` wildcard 재수출을 금지한다. 특히 pipeline root는 `AgentAvatar`, `PixelSprite`, `PixelOffice`, `OwnerBanner`, `BoardWarningBanner` 또는 `_component` 경로를 직접·별칭·전이 재수출하지 않는다.
- `shared`는 slice가 아니므로 목적 기반 subpath import를 허용한다. 예: `~/fsd/shared/ui/atoms/button`.

#### 자동 경계 검사

새 `apps/admin/scripts/verify-fsd-boundaries.mjs`는 Phase 0에 먼저 추가한다. runtime에서 검증된 `import ts from "typescript"`와 `ts.createSourceFile`로 `.ts`, `.tsx`, `.js`, `.mjs`의 static import, `export ... from`, local export specifier, dynamic `import()` module specifier를 수집하고 alias/상대 경로를 `.ts`/`.tsx`/`.js`/`.mjs` 또는 각 확장자의 `index` entry로 정규화한다. import binding과 named/aliased re-export의 원본 module provenance도 추적해 다음을 실패 처리한다.

1. 상향 레이어 import
2. 같은 레이어의 peer slice import
3. slice 외부에서 내부 파일을 직접 import하는 deep import
4. 자기 slice root barrel을 내부에서 import하는 cycle 유발 패턴
5. client module에서 `server/auth`, `env`, entity server API, shared server observability를 value import하는 패턴. 단, 같은 feature의 module-level `"use server"` action 직접 import는 허용
6. middleware가 `server/auth/config.edge` 이외의 auth entry를 import하는 패턴
7. `config.edge.ts`가 `env`, Google provider, `server-only`를 import하는 패턴
8. module specifier가 string literal이 아닌 dynamic `import()`로 경계 검사를 우회하는 패턴
9. `~/` 또는 상대 경로가 scan 대상 내부를 가리키지만 실제 target으로 resolve되지 않아 규칙을 우회하는 패턴
10. FSD public entry의 `export * from` wildcard와 page slice root가 `ui/_component` 아래 symbol/module을 직접·별칭·전이 재수출하는 패턴
11. slice/segment public entry의 `"use client"`/`"use server"` directive, feature root의 module-level `"use server"` origin 재수출, entity root의 `server-only` origin 재수출, `server/auth/index.ts`의 `config.edge`/`authConfigEdge` 재수출
12. `@repo/db`의 runtime `db` provenance가 최종 단일 owner `fsd/entities/analytics-event/api/queries.ts` 밖으로 흐르거나, 그 owner에서 exact `db.analyticsEvent.findMany` 이외의 model/method를 호출하는 패턴. named/namespace/static import, string-literal dynamic import, local alias/destructure와 local re-export provenance를 모두 추적한다. method/property를 정적으로 확정할 수 없는 computed access, 모든 mutation(`create*`, `update*`, `upsert`, `delete*`), raw query/execute와 `$transaction`은 owner 안에서도 실패한다. `@repo/db/*`, `packages/db/**`, generated Prisma, `@prisma/client` deep import로 canonical entry를 우회하는 것도 실패한다. 다른 파일의 type-only analytics contract import는 허용한다.
13. production source의 외부 network/Sentry effect가 고정 owner를 벗어나는 패턴. native fetch는 bare `fetch`와 `globalThis`/`window`/`self`의 dot·string-literal element access, global-object alias, local alias/destructure를 추적하며, known global의 computed call property를 정적으로 `fetch`가 아니라고 증명하지 못하면 fail closed한다. `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, `EventSource`와 `node:http`, `node:https`, `node:http2`, `undici`, `node-fetch`, `cross-fetch`, `axios`, `gaxios`, `got`, `ky`, `@octokit` 같은 별도 client import는 허용하지 않는다. `fsd-first`의 native fetch owner는 정확히 세 파일(`entities/pipeline/api/queries.ts`, `run-pipeline-command/api/post-pipeline-command.ts`, `transition-pipeline-gate/api/commit-gate-transition.ts`)이고, `src`의 direct `@sentry/nextjs` import owner는 정확히 `instrumentation.ts`, `sentry.server.config.ts`, `fsd/shared/observability/report-error.ts`다. test fixture는 production set에서 제외하고 fetch 세 owner의 GET/POST/PUT 의미·횟수·body와 report wrapper의 Sentry call은 contract test로 검증한다. FEAT-10이 구현된 뒤에는 `run-pipeline-command/api/get-pipeline-progress.ts`를 네 번째 read owner로 추가하고 전용 contract test와 rule fixture의 exact owner 수를 함께 갱신한 뒤에만 migration을 시작한다. 새 network dependency나 SDK owner는 이 proposal 범위가 아니며 dependency/source inventory 재검증과 별도 승인이 필요하다.

스크립트는 path separator를 `/`로 바꾼 repository-relative key를 사용하고 pure `analyzeFsdBoundaries({ files, mode })`를 export한다. `files`는 `{ path, sourceText }` fixture를 받아 rule test가 disk source를 만들지 않고 pass/fail matrix를 검증하며, CLI adapter만 `src`를 walk한다. rule 10 fixture는 정상 explicit named public API, root wildcard, root의 `_component` direct/aliased export, `ui/index.tsx`를 거친 private symbol 전이 재수출을 각각 pass/fail로 고정한다. rule 11은 정상 directive-free entry와 feature action/entity query/Edge config의 named·aliased·transitive leak mutant를 고정한다. rule 12는 type-only contract import와 exact query owner의 `db.analyticsEvent.findMany` pass, non-owner read·다른 model/read method·mutation/raw/transaction·literal/non-literal computed·namespace/dynamic/re-export alias·DB deep-import fail을 고정한다. rule 13은 선택한 안정 기준선의 production fetch owner(`fsd-first` 3개, FEAT-10 구현 후 4개)와 exact Sentry import owner 3개의 pass를 고정하고, 다른 server/client file의 bare/globalThis/window/self/aliased/destructured/computed fetch, browser primitive, 별도 network-client import, 비허용 Sentry import mutant를 실패시킨다. 지원하지 않는 `require()`/`createRequire()` 또는 해석할 수 없는 effect provenance도 우회로 간주해 실패한다. `import.meta.url === pathToFileURL(process.argv[1]).href`일 때만 CLI를 실행해 test import side effect를 막는다. CLI는 path, import/export/call specifier, 위반 rule id와 허용 방향을 출력하고 위반/해석 불가 시 non-zero로 종료한다. 새 dependency는 추가하지 않고 이미 설치된 `typescript`를 사용한다. 기본 모드는 이동 중 존재하는 `src/fsd`/`src/server` 경계와 현재 I/O owner를 검사하고, `--final`은 legacy top-level 폴더 부재, protected route/public entry 존재, 모든 slice root `index.ts`까지 검사한다. 따라서 Phase 1부터 `verify:fsd`를 실행할 수 있고, 최종 완료 때만 `verify:fsd:final`을 실행한다.

#### 최종 public API와 symbol provenance

| 현재 owner/필수 symbol | 최종 public entry와 export | 최종 소비자 | 검증 목적지 |
| --- | --- | --- | --- |
| `auth/index.ts`의 `auth`, `handlers`, `signIn`, `signOut`, `getAdminEmailSet` | `~/server/auth`; Edge config는 미수출 | auth route와 auth 내부 | auth tests, middleware rule, build |
| `auth/guard.ts`의 `requireAdmin` | `~/server/auth/guard` | protected layout/pages, 3개 Server Action | guard/action tests, boundary scan |
| analytics query 4개 | `~/fsd/entities/analytics-event/api`에서 `getAnalyticsOverview`, `getFunnelReport`, `getDropOffReport`, `getRecentFailureEvents` | protected analytics route | production typecheck, mocked/query contract tests |
| analytics entity root | Core는 exact `export {};`로 runtime-neutral root surface를 비워 두고 reporting/query를 미수출. Full은 아래 option/type/guard만 named export | Full analytics page model/UI | boundary rule 11, root source assertion, typecheck |
| analytics runtime options/guards(Full) | entity root에서 `ANALYTICS_RANGE_OPTIONS`, `ANALYTICS_FUNNEL_OPTIONS`, `DEFAULT_ANALYTICS_RANGE`, `DEFAULT_ANALYTICS_FUNNEL`, `ANALYTICS_REPORT_ROW_LIMIT`, `isAnalyticsEventName`, `isAnalyticsDateRangeKey`, `isFunnelId` | analytics page model/UI와 entity API | search-param/reporting tests, typecheck |
| analytics page view/parser | Core는 page root에서 `AdminAnalyticsPage`만 export. Full은 `parseAnalyticsSearchParams`와 `AnalyticsSearchParams`/`ParsedAnalyticsSearchParams`를 추가 export | protected analytics route | Core route/render smoke, Full search-param tests, boundary scan |
| board model/config | entity root에서 `parseBoard(markdown): BoardSection[]`, `BoardItem`, `BoardSection`, GitHub owner/repo/branch/path/URL 상수. Full은 기존 API를 그대로 두고 `parseBoardWithDiagnostics`, `BoardWarning`, `BoardParseResult`를 추가 | entity query, 두 write feature, pipeline page model | board tests, action payload tests, boundary scan |
| board server query | `~/fsd/entities/pipeline/api`에서 Core와 Full 모두 `getPipelineBoard(): Promise<BoardSection[]>` 유지. Full은 `getPipelineBoardWithDiagnostics(): Promise<BoardParseResult>`를 추가 | protected pipeline route | fetch mock, build/smoke |
| command model/UI | command feature root에서 `PipelineCommandButton`, `resolvePipelineCommand`, `PipelineCommandKey` | pipeline page model/UI | exact-body/desk/action tests |
| `postPipelineCommand` | public root에서는 미수출, 같은 slice UI가 `../api/post-pipeline-command`를 직접 import | `PipelineCommandButton` | action test, client→action boundary fixture |
| FEAT-10 실행 plan/progress/read/UI(조건부) | run-command feature root에서 `PipelineRunControl`, `describePipelineRun`, `RunPlan`만 explicit named export. `getPipelineProgress`는 root 미수출·same-feature UI 상대 import; progress model은 slice 내부. `gateNextActionHint`는 gate `transitions.ts` 소유 | pipeline page와 같은 run-command/gate slice UI | run-plan/progress 순수 test + GET action mock contract + peer-feature import 0 |
| gate model/UI | gate feature root에서 `GateTransitionButton`, `RejectActions`, `resolveGateTransition`, `isGateTransitionSource`, `REJECT_TRANSITIONS`, `rejectActionsFor`, forward/reject descriptor·reason types | pipeline briefing/UI | forward/reject transition tests, action tests, exhaustive typecheck |
| `commitGateTransition`, `commitRejectTransition` | public root에서는 미수출, 같은 slice UI가 `../api/commit-gate-transition`를 직접 import | `GateTransitionButton`, `RejectActions` | auth-first, GET/PUT/409, invalid action/status, exact edit/message action tests |
| pipeline page composition/model | Core는 page root에서 `PipelineBriefing`, `buildBriefing`, briefing public types를 explicit named export. Full은 `buildBriefingFromNewestFirstSections`로 rename하고 `PipelineBriefing`에 `warnings` prop을 추가한다. `AgentAvatar`, `PixelSprite`, `PixelOffice`, `OwnerBanner`, `BoardWarningBanner`는 `ui/_component` private implementation이라 root에서 직접·별칭·전이 재수출하지 않는다. | protected pipeline route | briefing/render tests, route smoke, boundary rule 10과 root prohibited-symbol scan |
| observability generic API | Core는 현재 `reportError`, `reportPipelineFailure`, `flushReports(): Promise<void>`, `setReportUser`, `withIsolatedReportScope`와 report types를 그대로 이동. Full은 `flushReports(): Promise<boolean>`과 `withReportUser<T>(userId, run): T`로 교체하고 raw setter/scope helper를 public entry에서 제거. entry와 implementation 모두 `server-only` | observability-test feature와 framework server code | Sentry mock tests, client prohibition rule |
| observability action/UI | feature root에서 `ObservabilityTestPanel`; action은 root 미수출, 같은 slice UI가 상대 import | protected observability route | Core characterization, Full true/false/reject/isolation tests |
| `AdminHeader`, `LoginButton` | 각각 widget/feature root | protected layout, login route | typecheck, route body smoke |
| `ActionResult`, `success`, `failure`, `cn`, atoms | `shared/api/result`, `shared/lib/utils`, `shared/ui/atoms/*` 목적 subpath | 각 feature/action/page 소비자 | typecheck, client/server boundary scan |

### 5. 기존 62개 파일의 전 파일 매핑

경로 이동은 history를 보존하도록 `git mv`를 사용한다. 내용이 동시에 바뀌는 파일도 먼저 이동, import 갱신, 동작 변경 순으로 나눠 diff를 읽을 수 있게 한다.

이 62-row 표는 `execution-order: "fsd-first"`에서만 실행 계약이다. `feat10-first`이면 FEAT-10 실제 구현 6개를 source row로 추가하고 기존 5개 수정의 symbol/import를 재수집한 68-row 표로 이 절과 exact path-set parser를 교체한 뒤 다시 승인한다. 위 실행 순서 표의 예상 목적지만으로 actual mapping 검증을 대체하지 않는다.

#### Framework root와 auth

| 현재 경로 (`src/` 기준) | 목표 경로 | 작업 |
| --- | --- | --- |
| `app/analytics/page.tsx` | `app/(protected)/analytics/page.tsx` | URL 유지, page 자체 `requireAdmin()`을 첫 작업으로 유지, header markup 제거 |
| `app/api/auth/[...nextauth]/route.ts` | 동일 | import만 `~/server/auth`로 변경 |
| `app/layout.tsx` | 동일 | Toaster import를 shared atom으로 변경 |
| `app/login/page.tsx` | 동일 | 단순 route view 유지, sign-in feature import |
| `app/observability/page.tsx` | `app/(protected)/observability/page.tsx` | URL·page guard 유지, feature panel import |
| `app/page.tsx` | 동일 | `/analytics` redirect 유지 |
| `app/pipeline/page.tsx` | `app/(protected)/pipeline/page.tsx` | `force-dynamic`, page guard, entity/page public API 사용 |
| `app/robots.ts` | 동일 | 변경 없음 |
| `auth/config.edge.ts` | `server/auth/config.edge.ts` | Core는 Edge-safe 상태와 현재 prefix match를 그대로 이동, Full은 auth route exact/segment match 적용 |
| `auth/config.ts` | `server/auth/config.ts` | parser 상대 import, `server-only` 추가, allowlist callback 보존 |
| `auth/guard.ts` | `server/auth/guard.ts` | `server-only`, redirect/notFound, live allowlist 재검사 보존 |
| `auth/index.ts` | `server/auth/index.ts` | Node auth entry에 `server-only`, Edge config는 re-export하지 않음 |
| `lib/parse-admin-emails.ts` | `server/auth/parse-admin-emails.ts` | auth-owned pure helper로 이동 |
| `lib/admin-emails.test.mjs` | `server/auth/parse-admin-emails.test.mjs` | source와 같은 이름으로 rename |
| `env.js` | 동일 | framework root 유지 |
| `instrumentation.ts` | 동일 | `import("./sentry.server.config")` dynamic import 유지 |
| `middleware.ts` | 동일 | `~/server/auth/config.edge` 직접 import만 허용 |
| `sentry.server.config.ts` | 동일 | framework convention file 유지 |
| `styles/globals.css` | 동일 | Core는 그대로 유지, Full은 shared/pipeline token을 보존하며 확인된 web-only 미사용 정의 2개만 제거 |

#### Shared, observability와 공통 UI

| 현재 경로 | 목표 경로 | 작업 |
| --- | --- | --- |
| `lib/result.ts` | `fsd/shared/api/result.ts` | post-auth handled outcome 계약 유지 |
| `lib/utils.ts` | `fsd/shared/lib/utils.ts` | `cn` 이동, 포맷은 별도 기계 정리 가능 |
| `observability/index.ts` | `fsd/shared/observability/index.ts` | Core는 기존 exports에 server-only boundary 적용, Full은 raw setter/scope helper를 제거해 surface 축소 |
| `observability/report-error.ts` | `fsd/shared/observability/report-error.ts` | Core는 generic telemetry 의미 보존 이동, Full은 raw user setter 비공개화/atomic API 적용 |
| `observability/test-action.ts` | `fsd/features/send-observability-test/api/send-observability-test-event.ts` | Core는 auth-first/current result 보존, Full은 truthful flush result 적용 |
| `ui/observability-panel.tsx` | `fsd/features/send-observability-test/ui/observability-test-panel.tsx` | client leaf 유지 |
| `ui/admin-header.tsx` | `fsd/widgets/admin-header/ui/index.tsx` | protected layout에서 재사용 |
| `ui/login-button.tsx` | `fsd/features/admin-sign-in/ui/login-button.tsx` | client sign-in scenario만 feature화 |
| `ui/atoms/badge.tsx` | `fsd/shared/ui/atoms/badge.tsx` | generic atom 이동 |
| `ui/atoms/button.tsx` | `fsd/shared/ui/atoms/button.tsx` | generic atom 이동 |
| `ui/atoms/card.tsx` | `fsd/shared/ui/atoms/card.tsx` | generic atom 이동 |
| `ui/atoms/sonner.tsx` | `fsd/shared/ui/atoms/sonner.tsx` | client directive 유지 |
| `ui/atoms/table.tsx` | `fsd/shared/ui/atoms/table.tsx` | Core는 그대로 이동, Full은 별도 commit에서 불필요한 client directive 제거 |

Core 신규 `observability/report-error.test.mjs`는 Sentry module mock으로 capture scope, isolation, never-throw flush를 현재 의미대로 characterization하고, 이동 시 `fsd/shared/observability/report-error.test.mjs`로 옮긴다. Full에서는 같은 파일의 기대값을 boolean flush/atomic `withReportUser` 계약으로 갱신한다.

#### Analytics

| 현재 경로 | 목표 경로 | 작업 |
| --- | --- | --- |
| `analytics/queries.ts` | `fsd/entities/analytics-event/api/queries.ts` | Core는 `server-only`/DB read/call shape 보존, Full은 I/O boundary runtime narrowing 적용 |
| `analytics/reporting.ts` | `fsd/entities/analytics-event/model/reporting.ts` | Core는 pure behavior 이동, Full은 canonical `AnalyticsEventName` 입력/명시적 return type 적용 |
| `analytics/reporting.test.mjs` | `fsd/entities/analytics-event/model/reporting.test.mjs` | 기존 case 유지, recent-failure 집계 case 추가 |
| `ui/analytics-page.tsx` | `fsd/pages/analytics/ui/index.tsx` | page-only 정적 section은 한 파일에 유지 |
| `ui/format-rate.ts` | `fsd/pages/analytics/lib/format-ratio-as-percent.ts` | 단위 전제를 드러내는 이름으로 rename |
| `ui/types.ts` | `fsd/pages/analytics/model/report-view.ts` | generic 이름 제거, page DTO 소유권 명시 |

추가 파일:

- Core: entity `api/index.ts`, entity/page slice `index.ts`
- Core: `entities/analytics-event/api/queries.test.mjs` — mocked `@repo/db`로 네 query의 read-only call shape, range/order/select, 25-row 현재 결과를 보호
- Full: `entities/analytics-event/model/report-options.ts` — range days/label/default row limit와 exhaustive guard
- Full: `pages/analytics/model/search-params.ts` — invalid range/funnel의 현재 default를 보존하는 pure parser
- Full: `pages/analytics/model/search-params.test.mjs` — 모든 노출 option round-trip과 invalid/array fallback

#### Pipeline entity

| 현재 경로 | 목표 경로 | 작업 |
| --- | --- | --- |
| `pipeline/board.ts` | `fsd/entities/pipeline/model/board.ts` | Core는 parser/read model만 이동, Full에서 기존 API를 깨지 않는 diagnostics 추가 |
| `pipeline/board.test.mjs` | `fsd/entities/pipeline/model/board.test.mjs` | Core는 기존 grammar case 보존, Full은 warning code/line case 추가 |
| `pipeline/github.ts` | `fsd/entities/pipeline/config/github.ts` | repo/branch/issue/URL single source 유지 |
| `pipeline/queries.ts` | `fsd/entities/pipeline/api/queries.ts` | Core는 `server-only`/raw GET 보존, Full은 structured warning log/additive diagnostics query 소유 |

Core 추가 파일은 entity root `index.ts`, server API public entry `api/index.ts`, `api/queries.test.mjs`다. query test는 exact raw URL, `{ cache: "no-store" }`, GET 1회, non-OK throw, parsed sections를 mock으로 보호한다. root는 runtime-neutral board type/parser와 repository coordinate만 노출하고 server query는 노출하지 않는다.

#### Pipeline external-write features

| 현재 경로 | 목표 경로 | 작업 |
| --- | --- | --- |
| `pipeline/commands.ts` | `fsd/features/run-pipeline-command/model/commands.ts` | key/body whitelist를 byte-for-byte 이동 |
| `pipeline/commands.test.mjs` | `fsd/features/run-pipeline-command/model/commands.test.mjs` | whitelist와 exact body 보호 |
| `pipeline/command-action.ts` | `fsd/features/run-pipeline-command/api/post-pipeline-command.ts` | `"use server"`, auth-first, key validation before fetch 유지 |
| `ui/pipeline-command.tsx` | `fsd/features/run-pipeline-command/ui/pipeline-command-button.tsx` | `"use client"` leaf 유지 |
| `pipeline/transitions.ts` | `fsd/features/transition-pipeline-gate/model/transitions.ts` | descriptor/whitelist/minimal edit single source |
| `pipeline/transitions.test.mjs` | `fsd/features/transition-pipeline-gate/model/transitions.test.mjs` | whitelist, stale, minimal diff, commit message 보호 |
| `pipeline/commit-transition.ts` | `fsd/features/transition-pipeline-gate/api/commit-gate-transition.ts` | Core는 forward/reject 공용 `"use server"`/auth-first/GET→edit→SHA PUT 보존, Full은 input/JSON decode 강화 |
| `ui/pipeline-gate.tsx` | `fsd/features/transition-pipeline-gate/ui/gate-transition-button.tsx` | typed transition descriptor를 받는 client leaf |
| `ui/pipeline-reject.tsx` | `fsd/features/transition-pipeline-gate/ui/reject-actions.tsx` | 반려 접힘/펼침, discard 확인, same-feature reject action 호출을 함께 이동 |

각 feature root `index.ts`는 component와 필요한 runtime-neutral type/predicate만 export한다. Server Action은 UI 내부 상대 import로만 연결한다.

#### Pipeline page

| 현재 경로 | 목표 경로 | 작업 |
| --- | --- | --- |
| `pipeline/agents.ts` | `fsd/pages/pipeline/model/known-agents.ts` | Core는 owner를 드러내는 rename/이동, Full은 known-agent tuple/union과 identity resolver를 exhaustive하게 정리 |
| `pipeline/briefing.ts` | `fsd/pages/pipeline/model/briefing.ts` | Core는 이동과 gate feature predicate 사용, Full은 newest-first 전제를 함수명/타입에 표현 |
| `pipeline/briefing.test.mjs` | `fsd/pages/pipeline/model/briefing.test.mjs` | entity/feature public API를 쓰는 cross-slice test로 이동 |
| `pipeline/desk-commands.ts` | `fsd/pages/pipeline/model/desk-commands.ts` | page-owned desk mapping, command feature type만 import |
| `pipeline/desk-commands.test.mjs` | `fsd/pages/pipeline/model/desk-commands.test.mjs` | 모든 known agent와 command resolution 보호 |
| `pipeline/sprites.ts` | `fsd/pages/pipeline/model/sprites.ts` | Core는 page display model 이동, Full은 known-agent exhaustive appearance 적용 |
| `pipeline/sprites.test.mjs` | `fsd/pages/pipeline/model/sprites.test.mjs` | palette/grid/fallback 보호 |
| `ui/pipeline-page.tsx` | `fsd/pages/pipeline/ui/index.tsx` | page composition과 server rendering 유지 |
| `ui/agent-avatar.tsx` | `fsd/pages/pipeline/ui/_component/agent-avatar.tsx` | page-private UI를 web convention에 맞춰 이동 |
| `ui/agent-character.tsx` | `fsd/pages/pipeline/ui/_component/pixel-sprite.tsx` | export 이름과 파일명을 일치시키고 page-private 경로에 둠 |
| `ui/pixel-office.tsx` | `fsd/pages/pipeline/ui/_component/pixel-office.tsx` | office private helper 유지, `OwnerBanner`만 같은 private 디렉터리의 별도 파일로 분리 |

추가 파일:

- Core: `ui/_component/owner-banner.tsx` — `ui/index.tsx`가 독립적으로 소비하는 inbox banner
- Core: page slice `index.ts`
- Full: `ui/_component/board-warning-banner.tsx` — parser warning count/code/line만 표시하는 non-blocking server UI
- Full: `ui/_component/board-warning-banner.test.mjs` — valid/warning view model을 `react-dom/server`로 렌더해 banner 노출 여부를 검증

### 6. 런타임과 보안 불변조건

#### 인증

1. `config.ts` sign-in callback은 normalized email allowlist 밖의 session 생성을 계속 거부한다.
2. `config.edge.ts`는 `/login`을 무한 redirect하지 않도록 미인증 login route를 허용하고, 로그인 상태면 `/analytics`로 보낸다.
3. Core는 현재 `startsWith("/login")` 동작을 characterization test로 기록하고 그대로 이동한다. Full에서 ``pathname === route || pathname.startsWith(`${route}/`)``인 pure predicate로 바꿔 `/login/help`는 auth segment, `/login-help`는 sibling protected route로 분류한다.
4. middleware는 Edge-safe config만 import한다.
5. 모든 protected `page.tsx`는 data access보다 먼저 `await requireAdmin()`을 직접 호출한다.
6. protected layout의 guard는 defense-in-depth/display email 용도일 뿐 page guard를 대체하지 않는다. App Router client navigation에서 layout이 보존될 수 있기 때문이다.
7. 모든 Server Action은 `requireAdmin()`을 `try` 밖 최상단에 유지한다. `NEXT_REDIRECT`/`NEXT_NOT_FOUND`를 catch하지 않는다.

#### Analytics

Core에서는 현재 query/reporting/search-param 동작을 파일 이동 전후 byte-for-byte 성격으로 보존한다. 아래 1~9는 Full에서만 적용하는 계약 hardening이다.

1. `@repo/db`의 `ANALYTICS_EVENT_NAMES`, `ANALYTICS_FUNNELS`, `AnalyticsEventName`가 canonical contract다.
2. local failure subset은 `satisfies readonly AnalyticsEventName[]`로 검증한다.
3. Prisma `name: string`은 query I/O boundary에서 `isAnalyticsEventName`으로 한 번만 guard/narrowing한다. filter를 통과한 row에 예상 밖 이름이 있으면 조용히 버리지 않고 `Analytics contract drift: unknown event name` 오류를 던져 drift를 드러낸다.
4. reporting은 type-only shared contract import만 허용하고 DB/fetch를 import하지 않는다.
5. output assertion으로 drift를 숨기지 않고 builder에 명시적 shared return type을 둔다.
6. range/funnel parser와 UI option은 같은 exhaustive metadata에서 파생한다.
7. 25-row 제한은 이름, parameter/default constant, UI copy에서 명시한다.
8. `AnalyticsRangeOption = { value: AnalyticsDateRangeKey; days: number; label: string }`, `AnalyticsFunnelOption = { value: FunnelId; label: string }`을 export하고 두 배열을 `as const satisfies readonly ...[]`로 만든다. 범위 순서는 `7d`, `30d`, `90d`, days는 각각 `7`, `30`, `90`, label은 기존 `7 days`, `30 days`, `90 days`다. funnel 순서는 `acquisition`, `activation`, `billing`, `review`이고 label은 `@repo/db`의 `FUNNEL_LABELS`를 사용한다.
9. `DEFAULT_ANALYTICS_RANGE = "30d"`, `DEFAULT_ANALYTICS_FUNNEL = "activation"`, `ANALYTICS_REPORT_ROW_LIMIT = 25`다. `isAnalyticsDateRangeKey`, `isFunnelId`, `isAnalyticsEventName`은 canonical 값에서 파생한다. `AnalyticsSearchParams`의 `range`/`funnel`은 `string | string[] | undefined`, `ParsedAnalyticsSearchParams`는 좁혀진 두 key이며 parser는 array/unknown 값을 기존 default로 보낸다.

#### Pipeline command

1. client는 `PipelineCommandKey`만 전송한다.
2. 본문은 server whitelist가 생성하며 기존 command string을 byte-for-byte 유지한다.
3. invalid key, missing token, failed auth에서는 fetch가 0회다.
4. command feature는 page의 agent/desk/Pixel Office를 import하지 않는다.
5. command는 board status를 바꾸지 않는다.
6. FEAT-10 구현 후에는 progress read가 같은 run-command slice에 속한다. `getPipelineProgress`는 public root에서 미수출하고 UI가 상대 import하며, `requireAdmin()`을 fetch보다 먼저 호출한다. GET은 exact issue #87 comments URL에 6시간 `since`와 `per_page=100`, `cache: "no-store"`, 선택적 Bearer token을 사용하고 모든 전송/status/JSON/shape 실패를 `unknown`으로 닫는다.
7. FEAT-10의 15초 polling은 외부 write를 늘리지 않지만 production fetch owner를 3→4로 늘린다. 구현 기준선에서는 mock contract test와 rule 13 exact owner fixture가 같이 추가돼야 하며 둘 중 하나만 추가하면 통과가 아니다.

#### Gate edit

1. Core에서 forward `GATE_TRANSITIONS`를 `{ 승인대기: { to: "계획지시", label: "계획지시" }, 검토대기: { to: "구현승인", label: "구현승인" } } as const` 형태의 descriptor로 만들고 source status, target, label, eligibility의 single source로 사용한다.
2. 현재 reject whitelist `REJECT_TRANSITIONS`를 함께 보존한다. exact 허용 쌍은 `bounce: 검토대기 → 계획지시`, `hold: 승인대기|검토대기 → 보류`, `discard: 승인대기|검토대기의 최신 항목 블록 제거`이며 다른 `(action, from)` 조합은 거부한다.
3. page inbox/feed partition은 forward feature predicate를 사용하고 별도 `GATE_STATUSES`를 만들지 않는다. `rejectActionsFor(status)`는 승인대기에 `hold, discard`, 검토대기에 `bounce, hold, discard`, 그 밖에는 빈 배열을 반환한다.
4. `GateTransitionSource = keyof typeof GATE_TRANSITIONS`, `GateTransitionDescriptor`, `isGateTransitionSource(value): value is GateTransitionSource`, `RejectAction = keyof typeof REJECT_TRANSITIONS`, `resolveGateTransition`, `rejectActionsFor`를 public API로 고정한다. UI는 arbitrary target/body 대신 source status, descriptor/action key만 전달한다.
5. forward/reject failure reason은 `"not-whitelisted" | "not-found" | "format" | "stale"`로 통일하고 failure message map을 exact union에 대한 `satisfies Record<..., string>`으로 완전성 검사한다.
6. untrusted forward/reject action input은 server boundary에서 다시 검증한다. 두 public Server Action은 모두 `requireAdmin()`을 shared GET helper 호출 전 최상단에 유지한다.
7. forward와 bounce는 status line만 바꾼다. hold는 status를 보류로 바꾸고 server-generated UTC 날짜의 고정 `결과:` 문구를 기존 결과 줄에 교체하거나 없으면 `근거:` 다음에 삽입한다. discard는 가장 위의 최신 항목 블록만 제거하며 과거 이력 행과 `TASK_BACKLOG.md`는 건드리지 않는다.
8. 모든 edit는 expected status stale 검사와 GET 이후 SHA 409 처리를 유지한다. discard 성공 UI는 되돌릴 수 없음을 확인받고 백로그 수동 정리를 안내하며, 실제 복구 경로는 Git revert다.
9. Full에서는 GitHub GET JSON을 `unknown`으로 decode하고 non-null object의 string `content`/`sha`를 검증한 뒤에만 PUT한다.
10. Full에서는 forward source와 reject `(action, expectedStatus)` whitelist를 token 확인/GitHub GET보다 먼저 검증해 invalid input에서 GET/PUT 모두 0회로 만든다. Core는 현재 동작을 characterization하므로 token이 있는 invalid input의 GET 1회/PUT 0회를 보존한다.

#### Observability

Core에서는 현재 public API와 `flushReports(): Promise<void>` 동작을 그대로 이동한다. 다음은 Full에서만 적용한다.

1. `setReportUser`와 `withIsolatedReportScope`는 public export에서 제거한다.
2. `withReportUser<T>(userId: string, run: () => T): T`가 `Sentry.withIsolationScope` 진입, `{ id: userId }` 설정, callback 실행을 한 lexical scope 안에서 원자적으로 소유한다. callback의 sync/async 반환과 throw/reject는 그대로 전달한다.
3. `flushReports(timeoutMs = 2_000): Promise<boolean>`는 `Sentry.flush`의 실제 boolean을 반환하고 reject만 log 후 `false`로 변환해 never-throw를 유지한다.
4. action은 `await flushReports()`가 `true`일 때만 `success()`를 반환하고 `false`/reject는 동일한 handled failure를 반환한다.
5. 자동 test는 Sentry를 module mock하고 live event를 전송하지 않는다.

#### Board diagnostics

구조 이동과 분리한 hardening 단계에서만 적용한다.

- warning: section 전 완전히 매치된 item(`orphan-item`)
- warning: fenced/quoted 영역 밖에서 `- [`로 시작하지만 item grammar가 아닌 줄(`malformed-item`)
- warning: current item 없는 field(`orphan-field`)
- warning: known field가 unindented이거나 값이 비어 있음(`malformed-field`)
- warning: 한 item에 같은 known field가 반복됨(`duplicate-field`, 기존 last-value-wins 유지)
- ignore: blank, heading, blockquote, ordinary prose/list, fenced/mermaid, unknown indented prose, valid item이 없는 guide section
- UI/log에는 warning code와 line number만 사용하고 raw board text를 기록하지 않는다.
- 한 줄에는 최대 warning 1개만 만든다. fence/blockquote ignore를 먼저 적용하고, exact item → malformed item → exact known field → malformed known field 순으로 판정한다. exact item이 section 전에 나오면 `orphan-item`, exact field가 item 전에 나오면 `orphan-field`, 현재 item의 반복 exact field는 `duplicate-field`이며 값은 기존처럼 마지막 값을 사용한다.

Full의 추가 API는 기존 소비자를 깨지 않는다.

- `BoardWarning = { code: "orphan-item" | "malformed-item" | "orphan-field" | "malformed-field" | "duplicate-field"; line: number }`이며 line은 1부터 시작한다.
- `BoardParseResult = { sections: BoardSection[]; warnings: BoardWarning[] }`다.
- `parseBoardWithDiagnostics(markdown): BoardParseResult`가 실제 parsing을 소유하고 `parseBoard(markdown): BoardSection[]`는 그 결과의 `sections`만 반환한다. 기존 fixture에서 이전 `parseBoard` 결과와 structural equality가 필수다.
- query의 private `loadPipelineBoardText()`가 `no-store` GET과 non-OK 오류를 한 번만 소유한다. `getPipelineBoard()`는 기존 `BoardSection[]` API를, `getPipelineBoardWithDiagnostics()`는 새 결과를 반환한다.
- Full의 pipeline route만 diagnostics query를 사용한다. warnings가 있으면 query가 `console.warn("Pipeline board parse warnings", { source: BOARD_PATH, warnings: warnings.map(({ code, line }) => ({ code, line })) })`를 요청당 한 번 호출하고, banner에는 동일한 code/line/count만 전달한다.

### 런타임 전이 매트릭스

| 진입점/상황 | 변경 전 | Core 완료 후 | Full 추가 변경 | 불변조건과 증거 |
| --- | --- | --- | --- | --- |
| `/` | `/analytics` redirect | 동일 | 없음 | route source + smoke |
| `/login` | public page, `LoginButton`, `AccessDenied` 문구 | import만 sign-in feature root로 변경 | auth matcher가 `/login-help`를 public으로 오인하지 않음 | auth edge tests + route smoke |
| protected layout | 없음; 각 page에 header | `await requireAdmin()` 후 정확히 `<><AdminHeader email={admin.email} />{children}</>` 렌더 | 없음 | layout source + server render/build |
| `/analytics` | page guard → params → DB query 4개 → header + `<main>` | page guard를 첫 await로 유지하고 header만 layout으로 이동; `<main><AdminAnalyticsPage ... /></main>` body와 4개 병렬 read 유지 | canonical options/parser와 query-boundary name guard | auth/query tests + rendered body + DB mock call shape |
| `/observability` | page guard → header + `<main><ObservabilityTestPanel /></main>` | page guard와 main body 유지, header만 layout으로 이동 | truthful flush/atomic user scope | auth/Sentry mocks + rendered body |
| `/pipeline` | page guard → no-store GET → parse → briefing → header + `bg-briefing` main | 같은 순서/API, header만 layout으로 이동, `force-dynamic` 유지 | diagnostics GET 1회, safe warn/banner 뒤에도 briefing/actions 유지 | fetch count + parse equality + rendered body |
| command action | auth → token/key → GitHub issue comment POST | `"use server"`와 exact request를 같은 feature로 이동 | 없음 | auth sentinel, fetch count, exact URL/header/body |
| FEAT-10 progress read/polling(조건부) | 구현 전이라 없음 | `fsd-first` migration 범위에는 없음; 후속 FEAT-10에서 run-command feature 내부 GET action/model/UI로 추가 | `feat10-first` 기준선이면 auth-first GET, FIFO 상태, 15초 cleanup/error→unknown을 보존 이동 | GET action mock contract, progress pure test, client timer/manual smoke, rule 13 exact 4 owners, `fsd-first`이면 최종 tree 기준 FEAT-10 post-migration full reconciliation/no-edit final pass |
| gate forward action | auth → token → contents GET → forward edit → SHA PUT | descriptor/public predicate로 중복 status set 제거, 외부 payload 보존 | input prevalidation, unknown JSON/shape handled failure | GET/PUT counts, exact PUT body, 409 |
| gate reject action | auth → token → contents GET → bounce/hold/discard edit → SHA PUT | same-feature UI/model/action 이동, whitelist·최소 diff·discard 확인/안내 보존 | `(action,status)` prevalidation과 unknown JSON/shape handled failure | pure edit/parser round-trip, action GET/PUT counts, exact message/body, UI confirmation smoke |
| observability action | auth → isolated scope → capture → flush → success | 같은 동작/API를 feature로 이동 | flush true만 success | Sentry call order/scope/result mocks |
| auth API/middleware | Node handlers와 Edge config 분리 | URL/handler 유지, middleware는 `config.edge`만 import | exact/segment login match | boundary fixtures + middleware manifest |
| instrumentation/Sentry init | Node runtime에서 config dynamic import | 경로와 init side effect 유지 | 없음 | source import + build; live 전송 금지 |

### 7. 파일명 규칙

- 새 일반 파일은 kebab-case를 사용한다.
- React component 파일도 kebab-case를 사용하고 export 이름은 PascalCase로 둔다.
- test는 source와 같은 basename + `.test.mjs`를 사용한다.
- `page.tsx`, `layout.tsx`, `route.ts`, `robots.ts`, `middleware.ts`, `instrumentation.ts`, `sentry.server.config.ts` 같은 framework-reserved 이름은 유지한다.
- `index.ts`/`index.tsx`는 slice 또는 segment의 의도적인 public entry에만 사용한다.
- Windows에서 case-only rename이 필요하면 임시 이름을 거치는 `git mv`로 처리한다.

### 8. 품질 게이트 반영표

초안 설계 시점에 5개 독립 lens(cohesion, coupling, predictability, readability, TypeScript)와 중립 품질 게이트를 2회 수행했다. 이는 설계 선택의 입력이지 이 reconciliation의 최신 코드 정합성 증거나 구현 준비 완료 판정은 아니다. 당시 45개 raw finding은 26개 canonical finding으로 수용됐고 3개는 기각됐다. 최신 코드 정합성과 남은 blocker는 이 문서의 `Reconciliation Evidence`에서 별도로 판정한다.

| Canonical | 우선도 | 반영 위치 |
| --- | --- | --- |
| ADM-001 analytics ownership/contract | Must | Phase 2 |
| ADM-002 external-write feature slices | Must | Phase 4 |
| ADM-005 runtime-specific auth | Must | Phase 1 |
| ADM-006 source-of-truth docs | Must | Phase 7A/7C |
| ADM-007 flat UI/lib ownership | Must | Phase 1~6 |
| ADM-008 gate single contract | Must | Phase 4 |
| ADM-010 runtime/public API boundaries | Must | 전체 phase + boundary script |
| ADM-015 truthful observability flush | Must | Phase 6B |
| ADM-022 auth/action characterization tests | Must | Phase 0 |
| ADM-003 pipeline entity/page split | Should | Phase 3, 5 |
| ADM-004 telemetry/test split | Should | Phase 6 |
| ADM-009 exhaustive analytics options | Should | Phase 2 |
| ADM-012 atomic telemetry attribution | Should | Phase 6B |
| ADM-013 explicit report limits | Should | Phase 2B |
| ADM-014 newest-first API | Should | Phase 5B |
| ADM-016 auth route match | Should | Phase 1B |
| ADM-018 exhaustive known agents | Should | Phase 5B |
| ADM-021 GitHub JSON decode | Should | Phase 4B |
| ADM-024 recent-failure tests | Should | Phase 0 |
| ADM-025 protected shell/page guards | Should | Phase 6 |
| ADM-026 board diagnostics | Should | Phase 5C |
| ADM-011 table server boundary | Consider | Phase 6B |
| ADM-017 ratio formatter naming | Consider | Phase 2A (Core structural rename) |
| ADM-019 OwnerBanner split | Consider | Phase 5A (Core colocation) |
| ADM-020 unused clip CSS | Consider | Phase 6B |
| ADM-023 checked test typing | Consider | Phase 7B (Full) |

기각된 항목은 의도적으로 범위에 넣지 않는다.

- global pipeline theme token을 별도 stylesheet로 이동하지 않는다.
- `requireAdmin` 이름을 Next control-flow 표현용으로 바꾸지 않는다. 대신 wrapper characterization test로 보호한다.
- 정적 analytics section을 길이만으로 분리하지 않는다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `apps/admin/src/app` | route group 이동, import 갱신, protected layout 추가 | framework wrapper와 FSD 화면 소유권 분리 | high — URL/auth 회귀 가능 |
| `apps/admin/src/server/auth` | auth cluster 이동/보호 | Edge/Node/auth ownership | high — 접근 제어 |
| `apps/admin/src/fsd/pages` | analytics/pipeline page-only composition | 한 화면 전용 projection/UI | medium |
| `apps/admin/src/fsd/widgets/admin-header` | 공통 protected shell UI | 3개 protected page 재사용 | low |
| `apps/admin/src/fsd/features` | 4개 user scenario slice | action/model/UI의 원자적 변경 | high — 외부 쓰기 포함 |
| `apps/admin/src/fsd/entities` | analytics/pipeline read model/API | 가장 낮은 domain data owner | medium |
| `apps/admin/src/fsd/shared` | generic result/lib/telemetry/atoms | 상향 의존 없는 공용 코드만 | medium — client/server 경계 |
| `apps/admin/scripts/verify-fsd-boundaries.mjs` | Core add | 구조·public runtime boundary·exact DB read owner·native/browser network·Sentry SDK owner 규칙 자동화, 기본/`--final` 모드 | high — false negative이면 auth/data/external-effect 경계 우회 |
| `apps/admin/scripts/verify-fsd-boundaries.test.mjs` | Core add | layer/public API/client-runtime/final-mode와 DB/fetch/browser-network/Sentry provenance mutation matrix 검증 | low |
| `apps/admin/package.json` | Core scripts update, Full에서 `test:types` 추가 | boundary/test module mock 연결 | medium |
| `package-lock.json` | Core workspace metadata update only | admin `engines.node` lockfile 반영 | low — dependency resolution 변경 금지 |
| `apps/admin/tsconfig.test.json` | Full add | `.mjs` test typing | low/medium |
| `apps/admin/CLAUDE.md` | update | 새 tree와 실제 package command/test inventory, scope별 reporting/test typing 계약의 source of truth | high — 경로만 바꾸고 old count/runner/type 계약을 남기면 구현과 운영 지침이 충돌 |
| `.claude/agents/admin-dev.md` | update | anti-FSD/flat-path 지침을 새 dependency/public API/test gate로 교체하고 module-mocked I/O·scope별 reporting/test typing 계약을 정확히 설명 | high — 미갱신 시 새 구조를 되돌리거나 검증 가능한 I/O를 미검증으로 처리할 수 있음 |
| `docs/proposals/active/remote-agent-pipeline-generalization.md` | update | legacy action 경로와 FEAT-08 시절 “status만” 문구를 새 feature 경로 및 status/result/block gate edit 계약으로 동기화 | medium — 중첩 문서 drift |
| `TASK_BACKLOG.md` | conditional update | FEAT-10이 여전히 active이면 삭제될 `src/pipeline + src/ui` area를 새 pipeline page/feature/entity 경로로 교체 | high — PM과 `admin-dev`의 다음 탐색 시작점 |
| `docs/plans/FEAT-10.md` | `fsd-first` conditional update + post-migration reconciliation | HEAD `0c5e42a`까지 누적된 raw-CDN 지연/카피, 0분 표시, 채널 범위와 mutation-test 계약을 보존하면서 flat source 경로를 FSD 목적지로 바꾸고 `gateNextActionHint` peer-feature import를 gate model 소유로 분리하며 GET action contract test를 추가한다. `보드에 반영되면` prefix와 gate-waiting의 `방금 찍었다면 보드 반영까지 최대 5분 걸립니다.` 계약을 source/test/plan에서 유지한다. 이전 flat-tree clean pass는 역사 기록으로 표시하고 최종 FSD tree 기준 full reconciliation/no-edit clean pass를 FEAT-10 구현 전 필수로 둔다. | high — 누적 계획 계약을 누락하면 후속 구현이 실제 CDN 지연·진행 채널 의미와 모순되고, 경로 미갱신/재검증 누락 시 legacy 폴더·금지 의존·stale 승인도 재생성할 수 있음 |
| `PROJECT_BOARD.md` FEAT-10 row | preserve, status only observe | 현재 `검토대기`와 계획 검증 기록은 실행 순서 판정 입력이며 migration이 임의 전이하지 않음 | high — board gate는 사용자 소유 |
| `apps/admin/docs/ADR/0001-adopt-fsd-for-admin.md` | add after approval | hard-to-reverse architecture decision | low |
| `apps/admin/docs/ADR/README.md` | index update | ADR discoverability | low |
| `apps/admin/docs/proposals/active/admin-src-fsd-refactoring.md` | approval/verification/completion 기록 후 completed로 이동 | 실행 source of truth와 audit trail | medium — 조기 완료/이동 금지 |

## Safety Analysis

### 확인한 항목

- [x] 앱 진입점과 라우팅 경계: `/`, `/login`, `/analytics`, `/observability`, `/pipeline`, auth API, robots를 확인했다.
- [x] 정적 `import` / `export from`: 62개 파일의 import/export를 확인했고 전 파일 목적지를 표로 고정했다.
- [x] dynamic `import()` 또는 lazy loading: `instrumentation.ts`의 Sentry config dynamic import는 경로와 동작을 유지한다.
- [x] barrel export(`index.ts`) 경유 참조: slice 외부용 root/segment entry와 내부 상대 import를 분리했다.
- [x] 테스트와 스크립트 참조: 8개 test의 source-relative import와 package glob을 확인했다.
- [x] 정적 자산 URL 또는 `public` 직접 접근 가능성: 이번 범위에 `public` 이동이나 URL 변경은 없다.
- [x] 타입 선언, 전역 선언, ambient module 영향: shared analytics contract와 strict/noUncheckedIndexedAccess를 확인했다.
- [x] 런타임 side effect 또는 초기화 코드: middleware, auth initialization, instrumentation, Sentry config, Server Actions를 확인했다.
- [x] API, storage, analytics, 외부 SDK 영향: DB read, GitHub GET/POST/PUT, Sentry flush/user scope를 확인했다. browser storage는 사용하지 않는다.
- [x] 활성 선행/경합 계획: FEAT-10의 신규 6개·수정 5개, peer-feature 충돌, 신규 authenticated GitHub GET과 polling cleanup/error 경계를 확인했다.

### 안전 장치

- 구조 이동 전 auth/action wrapper test를 먼저 추가한다.
- 이동과 observable 의미 변경을 같은 diff에서 섞지 않는다. `A`/Core 단계는 rename·public API·layout을 포함한 behavior-preserving structural change이고, `B/C`/Full 단계만 명시된 contract/behavior hardening을 수행한다.
- real GitHub/Sentry 호출은 자동 test에서 금지하고 fetch/SDK mock 호출 수와 body를 검증한다.
- `@repo/db`의 runtime `db` provenance는 AST로 추적해 exact analytics query owner의 `db.analyticsEvent.findMany`만 허용하고 non-owner/other-model read, mutation/raw/transaction과 DB deep import를 금지한다. native fetch는 선택한 안정 기준선의 pipeline owner에만 허용하고(`fsd-first` 3개, FEAT-10 구현 후 progress GET을 포함한 4개), global alias/computed/browser-network 우회와 별도 client를 거부한다. `src`의 Sentry SDK import도 instrumentation/config/report wrapper exact 3개로 제한한다.
- FSD migration과 FEAT-10 구현을 동시에 진행하지 않는다. 같은 파일의 move/behavior edit가 섞이거나 FEAT-10이 부분 구현된 상태면 작업을 중단하고 한 기준선으로 정리한 뒤 전체 reconciliation을 다시 한다.
- `fsd-first`에서 FEAT-10 plan을 편집한 뒤 이전 flat-tree clean 기록을 구현 준비 증거로 재사용하지 않는다. 최종 FSD tree 기준 full reconciliation의 마지막 pass가 no-edit인지와 canonical status를 확인하기 전까지 FEAT-10 구현승인/구현을 금지한다.
- FEAT-10 plan의 HEAD `0c5e42a` 누적 계약(raw-CDN 지연/카피, 0분 표시, 채널 범위, 확장 mutation-test)을 재기준화 후에도 보존하고 exact 카피와 대응 test를 검사한다. 이후 새 pre-existing plan diff가 생기면 편집·stash·reset하지 않고 사용자 작업이 종결되거나 명시적 통합 권한이 확인될 때까지 Phase 0을 중단한다.
- destination page/action의 auth check를 layout으로 대체하지 않는다.
- old path compatibility barrel은 만들지 않는다. residual import가 있으면 검사에서 실패시킨다.
- legacy 폴더 삭제는 exit-code-safe helper가 residual match count 0을 확인하고 test/typecheck/build가 통과한 뒤 수행한다.
- DB schema, route URL, command body, 현재 forward/reject gate edit whitelist는 바꾸지 않는다.

## Approval

승인 메모:

- 2026-08-17 사용자 승인: `Core: right-sized FSD migration`, `execution-order: "fsd-first"`, ADR 0001 accepted.
- 승인자는 front matter의 `approval-scope`에 정확히 `Core: right-sized FSD migration` 또는 `Full: right-sized FSD migration + contract hardening` 중 하나를 기록하고 `approved-by`, `approved-at`, `stage: approved`를 함께 갱신한다.
- 승인자는 `execution-order`도 정확히 `"fsd-first"` 또는 `"feat10-first"`로 기록한다. 이번 실행은 사용자 결정에 따라 `"fsd-first"`로 완료했다.
- `"fsd-first"` 승인은 FEAT-10 구현을 migration 완료 뒤로 미루고 Phase 0에서 FEAT-10 계획만 FSD 경계에 맞게 재기준화하는 권한을 포함해야 한다. 이 계획 edit는 기존 FEAT-10 clean pass를 현재성 증거로 사용할 수 없게 하므로, Phase 7A 최종 tree 기준 FEAT-10 full reconciliation/no-edit clean pass도 같은 승인 범위의 필수 검증이다. `"feat10-first"`이면 이 문서의 현재 62/84/89 mapping으로는 구현을 승인할 수 없고 FEAT-10 완료 뒤 full reconciliation과 재승인이 필요하다.
- “승인”, “Phase 0~7”, “전체 진행”처럼 exact scope가 없는 문구는 구현 권한이 아니다. 승인 metadata가 불완전하거나 본문과 충돌하면 구현을 시작하지 않고 결정을 요청한다.
- Core를 승인하면 Full 전용 파일/behavior/test typing은 만들지 않는다. ADM-015/021/026 등 Full 항목은 별도 follow-up proposal로 남기되 Core 완료를 막지 않는다.
- Full을 승인하면 이 문서의 모든 B/C 항목과 `tsconfig.test.json`/`test:types`까지 완료해야 한다. 일부 hardening을 생략하려면 구현 전에 approval-scope를 Core로 명시적으로 바꾸거나 새 proposal로 재승인한다.
- ADM-022 characterization test, Phase 0 boundary script/rule test, page/action guard 보존은 두 scope 모두 필수이며 제외할 수 없다.

### 실행 주체와 권한 전제

- front matter의 `owners: ["admin-dev"]`는 admin 도메인 책임을 뜻하며, 현재 `.claude/agents/admin-dev.md`에 적힌 standing file/command authority를 자동으로 넓히지 않는다.
- 현재 `admin-dev`는 `apps/admin/src/**`와 자기 plan/board row 중심으로만 수정할 수 있고, `apps/admin/CLAUDE.md`, `.claude/agents/admin-dev.md`, ADR, package/lock metadata 수정과 `npm install`을 금지한다. 따라서 이 migration 전체를 기존 `admin-dev` 세션에 디스패치하지 않는다.
- 구현은 repository-level maintainer가 직접 수행하거나, 사용자가 이 proposal의 exact scope와 함께 위 파일/명령을 포함하는 task-specific authority를 명시적으로 부여한 executor가 수행한다. 실행 주체를 확인하지 못하면 Phase 0에서 중단한다.
- `.claude/agents/admin-dev.md` 갱신은 Phase 7A의 최종 운영 전환이다. 그 편집이 이전 phase의 권한을 소급해 주지 않으며, migration 중간의 혼합 tree에서 `admin-dev`를 다시 디스패치하지 않는다.

## Execution Plan

### Phase 0 [Core] — 결정 기록과 회귀 안전망

1. 승인자가 이 proposal front matter에 exact `approval-scope`, `execution-order`, `approved-by`, `approved-at`, `stage: approved`를 기록한다. 이 다섯 값이 완전하기 전에는 아래 파일 변경을 시작하지 않는다. 이어서 실행 주체가 repository-level maintainer 또는 위 범위에 대한 명시적 task-specific authority를 가진 executor인지 확인한다. 기존 standing rule의 `admin-dev`뿐이면 중단한다.
2. 최신 `PROJECT_BOARD.md`, `TASK_BACKLOG.md`, `docs/plans/FEAT-10.md`, `apps/admin/src`를 대조한다. FEAT-10 plan/board에 새 pre-existing staged/unstaged edit가 있으면 사용자 작업을 편집·stash·reset하지 않고 중단해 해당 edit의 완료/커밋·병합 또는 명시적 통합 권한을 확인한다. clean HEAD `0c5e42a`의 FEAT-10 계약은 raw CDN `max-age=300`에 따른 도장 직후 최대 5분 지연, exact `보드에 반영되면` prefix, gate-waiting 문구, 0분 표시, 진행 pill의 채널 범위와 29개 pure mutation-test 명세를 포함한다. 이 계약을 누락하거나 과거 카피·테스트 설명으로 되돌리지 않는다. `execution-order: "fsd-first"`이면 FEAT-10 구현 source가 아직 0개이고 기존 62-file path/content 기준선이 유지돼야 한다. 같은 phase의 첫 기능계획 edit로 FEAT-10 계획을 exact FSD 목적지, gate-local hint, GET action contract test(`created_at` 창 필터 포함)에 맞게 재기준화하되 위 누적 계약도 source/test 목적지에 유지하고, `post-FSD full reconciliation`/`no-edit clean pass` 전 FEAT-10 구현 금지와 기존 flat-tree 검증 기록의 historical 성격을 계획 본문에 명시한다. 이 시점에는 최종 FSD tree가 없으므로 기존 clean 결과를 재사용하거나 새 clean pass를 주장하지 않는다.
3. `apps/admin/docs/ADR/0001-adopt-fsd-for-admin.md`를 `proposed`로 만들고 flat 유지/actual web 복제/right-sized FSD 대안, 선택 이유, Core/Full 중 승인된 scope를 기록한 뒤 ADR README index에 추가한다.
4. maintainer가 ADR acceptance를 명시한 뒤에만 ADR을 `accepted`로 바꾼다. proposal 승인 메시지가 exact scope와 “ADR 0001 accepted”를 모두 명시하면 같은 기록으로 충족할 수 있고, 하나라도 빠지면 별도 acceptance가 필요하다. 완료된 2026-08-02 proposal은 수정하지 않고 “2 screens이므로 no FSD” 판단만 새 결정이 대체한다고 양방향 링크한다.
5. `apps/admin/scripts/verify-fsd-boundaries.mjs`와 `verify-fsd-boundaries.test.mjs`를 먼저 추가하고 기본/`--final` mode, layer/peer/deep import/self-barrel/client→server/Edge/public-entry wildcard/page-private re-export/public-entry runtime leak, exact DB query owner/model/method, native/global/browser network, Sentry SDK owner rule의 pass/fail fixture를 만든다.
6. package에 `"engines": { "node": ">=22.3" }`를 명시하고 `test`를 정확히 `node --import tsx --experimental-test-module-mocks --test "src/**/*.test.mjs"`로 바꾼 뒤 `verify:fsd`, `verify:fsd:test`, `verify:fsd:final`을 연결한다. root에서 아래 PowerShell block을 실행해 `package-lock.json`의 `packages["apps/admin"].engines.node`만 동일하게 갱신한다. 시작 시 staged/unstaged lockfile 변경이 있으면 사용자 작업을 덮지 않고 중단하며, 갱신 전후 JSON을 Node `JSON.parse`로 읽어 허용된 `engines.node`를 제외한 정규화 SHA-256이 달라지면 dependency/version/metadata drift로 중단한다. mutation 직전 원본 bytes를 보관하고 install 또는 사후 검증이 실패하면 exact bytes를 복원하므로 실패한 명령이 lock drift를 남기지 않는다. Windows PowerShell 5.1의 `ConvertFrom-Json`은 현재 lockfile 전체를 파싱하지 못하므로 lockfile 전체 검증에는 사용하지 않는다. 현재 검증 runtime은 22.13.1이다.

   ```powershell
   $ErrorActionPreference = "Stop"

   & git diff --quiet -- package-lock.json
   $unstagedLockExit = $LASTEXITCODE
   if ($unstagedLockExit -eq 1) { throw "package-lock.json has pre-existing unstaged changes" }
   if ($unstagedLockExit -gt 1) { throw "git diff failed: exit $unstagedLockExit" }
   & git diff --cached --quiet -- package-lock.json
   $stagedLockExit = $LASTEXITCODE
   if ($stagedLockExit -eq 1) { throw "package-lock.json has pre-existing staged changes" }
   if ($stagedLockExit -gt 1) { throw "git diff --cached failed: exit $stagedLockExit" }

   $lockInspector = @'
   const crypto = require("node:crypto");
   const fs = require("node:fs");
   const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
   const admin = lock.packages?.["apps/admin"];
   if (!admin) throw new Error("apps/admin lock entry is missing");
   const nodeEngine = admin.engines?.node ?? null;
   if (admin.engines) {
     delete admin.engines.node;
     if (Object.keys(admin.engines).length === 0) delete admin.engines;
   }
   process.stdout.write(JSON.stringify({
     digestWithoutAdminNodeEngine: crypto
       .createHash("sha256")
       .update(JSON.stringify(lock))
       .digest("hex"),
     nodeEngine,
   }));
'@
   function Read-NormalizedLockState {
     $json = $lockInspector | node.exe -
     if ($LASTEXITCODE -ne 0) { throw "lock inspector failed: exit $LASTEXITCODE" }
     $state = $json | ConvertFrom-Json
     if ($state.digestWithoutAdminNodeEngine -notmatch '^[0-9a-f]{64}$') {
       throw "invalid normalized lock digest"
     }
     return $state
   }

   $lockPath = (Resolve-Path -LiteralPath package-lock.json).Path
   $lockBytesBefore = [System.IO.File]::ReadAllBytes($lockPath)
   $beforeLock = Read-NormalizedLockState
   try {
     npm.cmd install --package-lock-only --ignore-scripts
     if ($LASTEXITCODE -ne 0) { throw "package-lock update failed: exit $LASTEXITCODE" }
     $afterLock = Read-NormalizedLockState
     if ($afterLock.nodeEngine -cne ">=22.3") { throw "admin lock engine mismatch" }
     if ($afterLock.digestWithoutAdminNodeEngine -cne $beforeLock.digestWithoutAdminNodeEngine) {
       throw "package-lock changed outside apps/admin engines.node"
     }
   } catch {
     [System.IO.File]::WriteAllBytes($lockPath, $lockBytesBefore)
     throw
   }
   ```

7. module-mock test는 각 `.test.mjs`가 별도 process로 격리되는 기본 runner를 유지한다. dependency `mock.module(...)`을 subject dynamic import보다 먼저 등록하고, `server-only`를 직접 또는 전이 import하는 subject는 정확히 `mock.module("server-only", { namedExports: {} })`를 먼저 등록한다. controllable fake state/call log는 각 test 전에 reset하며, suite 종료 시 `mock.restoreAll()`과 교체한 `globalThis.fetch`를 원복한다. 자동 test에서 live network/SDK 호출은 허용하지 않는다.
8. 다음 characterization test를 현재 경로에 먼저 추가하고, source 이동 시 함께 `git mv`한다.
   - `auth/config.edge.test.mjs`: logged-out `/login`, logged-in `/login`, protected logged-out/in, 현재 prefix 동작의 `/login-help`. Full Phase 1B에서 sibling을 protected로 바꾼 기대값을 명시적으로 갱신
   - `auth/config.test.mjs`: allowlisted/denied/missing email sign-in
   - `auth/guard.test.mjs`: unauthenticated redirect sentinel, removed-admin notFound sentinel, allowed identity
   - `pipeline/command-action.test.mjs`: auth sentinel은 그대로 escape, invalid key와 missing token은 fetch 0회, valid key의 exact POST body
   - `pipeline/commit-transition.test.mjs`: auth sentinel escape. forward와 reject action 모두 auth-first, token 없음, token이 있는 invalid input의 현재 GET 1회/PUT 0회, malformed JSON과 `null`의 현재 reject, missing field handled failure, stale, exact commit message/base64 PUT body, SHA 409를 보호한다. Full Phase 4B에서 invalid/JSON 기대값을 의도적으로 갱신한다.
   - `observability/test-action.test.mjs`: auth sentinel escape, isolated scope/capture/flush 호출 순서, 현재 success/error 처리. Sentry는 module mock하고 실제 event를 보내지 않는다.
   - `analytics/queries.test.mjs`: `server-only`/`@repo/db` module mock, 네 public query의 `findMany` read-only where/select/order, range, 25-row 결과
   - `pipeline/queries.test.mjs`: `server-only` module mock, exact raw URL, no-store GET 1회, non-OK throw, parsed sections
   - `observability/report-error.test.mjs`: `server-only`/Sentry module mock, capture scope, user isolation, current never-throw `Promise<void>` flush
9. 현재 `pipeline/transitions.test.mjs`에 추가된 reject 순수 계층 26개를 기준선으로 고정해 함께 이동한다. `rejectActionsFor` 전체 여집합, bounce/hold/discard의 해피패스·parser round-trip·최소 diff, `not-whitelisted/not-found/format/stale`, hold 결과 줄 insert/replace와 `$` literal, 최신 행만 discard, 고정 UTC 문구와 exact commit message가 빠지거나 약화되면 중단한다. 이 단계는 이미 있는 테스트를 다시 작성하는 작업이 아니다.
10. `analytics/reporting.test.mjs`에 recent failure filtering/grouping/latest timestamp/3-key ordering case를 추가한다.
11. 기존 95개 test와 신규 action/auth/query/reporting test, production typecheck, `verify:fsd:test`, 현재 존재하는 경계에 대한 기본 `verify:fsd`를 통과시킨다.

중단 조건: `execution-order`가 확정되지 않았거나 선택한 FEAT-10 기준선과 실제 source가 다르거나, ADR이 accepted가 아니거나, wrapper test/boundary rule matrix를 현재 구현에 맞게 안정적으로 통과시키지 못하면 파일 이동을 시작하지 않는다.

### Phase 1A [Core] — Shared와 auth foundation의 의미 보존 이동

1. `fsd/shared` 목적 디렉터리를 만들고 atoms, `result`, `utils`, telemetry 두 파일과 신규 telemetry test를 `git mv`한다.
2. `server/auth`를 만들고 auth 4개 파일, Phase 0 auth test 3개, parser와 parser test를 함께 이동한다.
3. `middleware`, auth route, root layout, 기존 action/UI import를 새 경로로 갱신한다.
4. Node auth `config.ts`, `index.ts`, `guard.ts`에는 `server-only`를 유지/추가하고 `config.edge.ts`에는 추가하지 않는다.
5. 이 단계에서는 export/behavior를 바꾸지 않는다.
6. test, typecheck, 기본 boundary check를 실행한다.

### Phase 1B [Full] — Auth contract hardening

1. auth route matcher를 ``pathname === route || pathname.startsWith(`${route}/`)`` pure 함수로 바꾸고 `/login-help` characterization을 “미인증이면 protected” 기대값으로 갱신해 통과시킨다.
2. middleware가 `config.edge`만 가져가는지 boundary rule로 고정한다.
3. parser test명을 source와 맞춘다.
4. Node 자식 프로세스의 환경 객체에 빈 `SENTRY_AUTH_TOKEN` property를 명시한 production build와 middleware manifest로 Edge graph가 env/provider를 끌어오지 않는지 확인한다. Windows의 process environment API로 빈 값을 쓰면 변수가 삭제되어 root dotenv token이 다시 로드될 수 있으므로 사용하지 않는다.

### Phase 2A [Core] — Analytics vertical slice 이동

1. reporting + test를 `entities/analytics-event/model`로 이동한다.
2. query와 Phase 0 query test를 `entities/analytics-event/api`로 이동하고 `api/index.ts`를 만든다. Core의 entity root `index.ts`는 정확히 `export {};`만 가져 query/reporting을 공개하지 않는다.
3. page UI, DTO를 `pages/analytics`로 이동하고 formatter는 목표 파일명 `format-ratio-as-percent.ts`로 rename한 뒤 root `index.ts`를 만든다. 이름만 바꾸며 계산식/출력은 유지한다.
4. app route는 entity API와 page root만 import한다.
5. old analytics/ui path import가 0인지 검색한다.
6. test, typecheck, boundary check를 실행한다.

### Phase 2B [Full] — Analytics contract hardening

1. `AnalyticsReportEvent.name`을 `AnalyticsEventName`으로 좁히고 query boundary에서 runtime guard한다. 예상 밖 이름은 filter하지 말고 contract-drift 오류로 실패시킨다.
2. failure event subset과 return type을 canonical contract에 연결하고 output assertion을 제거한다.
3. `report-options.ts`와 `search-params.ts`를 추가해 range/funnel option을 한 source에서 파생한다.
4. invalid/array query가 current default(`30d`, `activation`)로 가는 동작을 test로 고정한다.
5. row limit 25를 named constant/함수명/UI copy로 명시한다.
6. analytics page의 정적 section은 추가 분리하지 않는다.
7. query test에 예상 밖 event name이 silent drop되지 않고 contract-drift 오류가 되는 case를 추가한다.

### Phase 3 [Core] — Pipeline entity 이동

1. board parser/test, GitHub coordinates, server query와 Phase 0 query test를 entity slice로 이동한다.
2. root `index.ts`는 runtime-neutral board/config만, `api/index.ts`는 server query만 노출한다.
3. 아직 legacy 위치인 app/briefing/action은 새 entity public API를 사용하도록 갱신한다.
4. entity가 feature/page를 import하지 않는지 검사한다.
5. board/briefing test, typecheck, boundary check를 실행한다.

### Phase 4A [Core] — External-write feature를 하나씩 원자 이동

1. command model/test/action/button을 `run-pipeline-command`로 한 번에 이동한다.
2. legacy desk mapping과 Pixel Office는 command feature root만 import하도록 바꾼다.
3. command test와 auth/action test를 통과시킨 뒤 별도 checkpoint를 만든다.
4. forward/reject transition model/test/shared action과 `pipeline-gate`/`pipeline-reject` UI를 `transition-pipeline-gate`로 한 번에 이동한다.
5. `GATE_STATUSES`를 제거하고 forward descriptor에서 eligibility/predicate/message type을 파생하며, reject whitelist/action 목록과 bounce/hold/discard edit 의미는 그대로 유지한다.
6. legacy briefing/page가 gate feature root만 import하도록 바꾸고 두 client UI만 같은 slice의 private action 구현을 상대 import한다.
7. forward/reject transition/action test와 discard confirmation smoke를 통과시킨 뒤 별도 checkpoint를 만든다.

중단 조건: command body snapshot, forward/bounce/hold/discard minimal markdown diff, stale/SHA test, discard 확인/백로그 안내 중 하나라도 달라지면 해당 feature 이동을 revert하고 다음 phase로 가지 않는다.

### Phase 4B [Full] — Gate action response hardening

1. 각 public action의 `requireAdmin()` 직후 forward는 `isGateTransitionSource(expectedStatus)`, reject는 exact `(action, expectedStatus)` whitelist를 검사하고 invalid이면 token 조회/GitHub GET/PUT 전에 handled failure를 반환한다.
2. contents GET JSON parse와 shape guard를 operational catch 안으로 옮긴다.
3. decode는 `unknown`에서 시작하고 `content`, `sha`가 string일 때만 Buffer decode/PUT을 허용한다.
4. invalid forward/reject input은 GET/PUT 0회, invalid JSON, `null`, missing field는 failure result와 PUT 0회인지 검증한다.
5. `requireAdmin()`은 catch 밖 최상단을 유지한다.

### Phase 5A [Core] — Pipeline page slice 이동

1. briefing/agents/desk/sprites와 tests를 `pages/pipeline/model`로 이동한다.
2. page composition은 `pages/pipeline/ui/index.tsx`로, office/avatar/character 같은 page-private UI는 `pages/pipeline/ui/_component`로 이동한다.
3. `agent-character.tsx`를 `_component/pixel-sprite.tsx`로 rename하고 `OwnerBanner`를 `_component/owner-banner.tsx`로 분리한다.
4. page root public API를 만들고 app pipeline route를 전환한다.
5. dependency가 `pages/pipeline → features/*, entities/pipeline, shared` 방향인지 검사한다.
6. pipeline 전체 test, typecheck, boundary check를 실행한다.

### Phase 5B [Full] — Page model contract hardening

1. `PIPELINE_AGENT_IDS` tuple과 `PipelineAgentId`를 `known-agents.ts`에 둔다.
2. identity, appearance, desk command mapping을 exhaustive record로 바꾸고 remote unknown fallback은 별도로 유지한다.
3. public function을 `buildBriefingFromNewestFirstSections(sections, today)`로 rename해 newest-first 전제를 이름에 고정하고 app route/public API/test를 함께 갱신한다.
4. 동일 ID가 여러 section에 있을 때 최신 항목을 유지하는 test를 보존한다.

### Phase 5C [Full] — Board diagnostics

1. `parseBoardWithDiagnostics`를 추가하고 `parseBoard`의 `BoardSection[]` signature를 유지한다. 기존 `sections` 결과를 snapshot/structural equality로 보존한다.
2. 정의된 5개 warning code와 exact line number를 table-driven test로 추가한다.
3. prose, blockquote, mermaid/fence, guide section이 warning 0개인지 검증한다.
4. `loadPipelineBoardText`, 기존 `getPipelineBoard`, 추가 `getPipelineBoardWithDiagnostics`로 API를 나누고 query는 raw text 없이 source path/code/line만 요청당 한 번 structured warning으로 기록한다.
5. `ui/_component/board-warning-banner.tsx`를 추가하고 `ui/index.tsx`의 `PipelineBriefing`이 `warnings` prop으로 private banner를 렌더한다. warning이 있어도 현재 board와 command/gate UI는 그대로 렌더링하며 banner를 slice root에서 재수출하지 않는다.
6. entity query test에 diagnostics API의 GET 1회, warning log 1회, code/line-only payload, raw text 부재를 추가한다.

### Phase 6A [Core] — 남은 feature/widget와 protected shell

1. observability test action/panel을 feature로 이동하고 shared telemetry import를 연결한다.
2. LoginButton만 sign-in feature로 이동하며 `app/login/page.tsx`는 유지한다.
3. AdminHeader를 widget으로 이동한다.
4. `app/(protected)/layout.tsx`를 추가하고 세 protected route를 URL-transparent route group으로 이동한다. layout body는 `await requireAdmin()` 뒤 정확히 `<><AdminHeader email={admin.email} />{children}</>`다.
5. 각 page에서 기존 fragment와 header만 제거하고 analytics/observability의 `<main>...</main>`, pipeline의 `<main className="bg-briefing min-h-screen">...</main>`을 그대로 유지한다.
6. layout guard와 별개로 각 page의 첫 `await requireAdmin()`과 모든 action guard를 유지한다.
7. `/login`, `/analytics`, `/observability`, `/pipeline` auth matrix와 protected rendered body를 검증한다.

### Phase 6B [Full] — Observability와 client boundary cleanup

1. `withReportUser` atomic API를 만들고 raw setter export를 제거한다.
2. `flushReports`를 `Promise<boolean>`으로 바꾸고 false/reject를 action failure로 연결한다.
3. shared `report-error.test.mjs`에는 flush true/false/reject와 concurrent/reused isolation을, feature action test에는 결과 연결을 추가한다.
4. table atom은 move commit 이후 별도 commit에서 `"use client"`를 제거하고 analytics 렌더/build를 확인한다.
5. `globals.css`에서 admin 사용처가 없는 두 family만 제거한다. picked family는 Tailwind alias `--color-picked: var(--picked)`, light/dark의 `--picked` 두 값과 picked-only 주석을 함께 제거한다. clipcard family는 `@keyframes clipcard-hashtag-fade-in`, `.animate-clipcard-hashtag-fade-in` utility와 그 animation declaration을 함께 제거한다. 이름 일부만 지워 dangling custom property/utility를 남기지 않으며 pipeline/shared token은 유지한다.

### Phase 7A [Core] — package gate, source of truth, legacy 제거

1. Phase 0에서 만든 boundary script/rule test를 최종 tree에 맞게 갱신한다. Core package scripts의 exact 값은 다음과 같다.

   ```json
   {
     "test": "node --import tsx --experimental-test-module-mocks --test \"src/**/*.test.mjs\"",
     "verify:fsd": "node scripts/verify-fsd-boundaries.mjs",
     "verify:fsd:test": "node --test scripts/verify-fsd-boundaries.test.mjs",
     "verify:fsd:final": "node scripts/verify-fsd-boundaries.mjs --final",
     "check": "npm run verify:fsd:test && npm run verify:fsd && next lint && tsc --noEmit"
   }
   ```

2. 운영 문서와 live locator를 새 tree로 전환한다.
   - `apps/admin/CLAUDE.md`의 “FSD를 적용하지 않는다” 규칙과 legacy code-span path를 제거하고 새 tree, dependency rules, public APIs, auth/DB/GitHub/Sentry 불변조건으로 갱신한다. Development Commands는 최종 `package.json`에서 다시 만들고 “기존 일곱 script뿐” 같은 폐쇄형 old 목록을 남기지 않는다. `### 테스트 인벤토리` 표의 첫 열은 repository-relative `src/**/*.test.mjs` 전체를 정확히 한 번씩 열거하며 최종 runner 출력에서 얻은 실제 file/test/suite 수를 기록한다.
   - `.claude/agents/admin-dev.md`의 담당 경로, anti-FSD 문구, flat auth/analytics/test 예시, 검증 명령을 새 `src/fsd`, `src/server/auth`, public API와 `verify:fsd` gate에 맞게 갱신한다. 두 운영 문서는 Node module mock으로 DB/GitHub/Sentry call을 live I/O 없이 검증할 수 있고, DOM client interaction만 수동 smoke에 남는다고 명시한다. 기존 “렌더링·DB 호출·외부 I/O 자체는 덮을 수 없다”는 문구와 old `tsx --test` command는 제거한다. 사용자 gate/board/backlog 권한과 DB read-only/범위 밖 중단 규칙은 보존한다.
   - 선택 scope를 두 운영 문서에 동일한 machine-checkable contract로 남긴다. Core는 exact `` `analytics-reporting-contract: import-free; DB/server-only/fetch forbidden` ``와 `` `test-typing-contract: production tsconfig only; no test:types` ``를, Full은 exact `` `analytics-reporting-contract: type-only AnalyticsEventName from @repo/db; runtime DB/server-only/fetch forbidden` ``와 `` `test-typing-contract: tsconfig.test.json + test:types` ``를 쓴다. 두 scope 모두 exact `` `test-runtime-contract: module-mocked DB/GitHub/Sentry; live I/O forbidden; DOM client interaction manual` ``를 쓴다. Full에서도 reporting의 type-only import 외 runtime `@repo/db`, DB 접근, `server-only`, fetch는 금지한다.
   - 중첩 `docs/proposals/active/remote-agent-pipeline-generalization.md`의 related/action 경로와 bare `command-action.ts`/`commit-transition.ts` basename을 새 command/gate feature 구현 파일로 바꾸고, FEAT-09를 열거하면서 남은 “이 경로는 status만 바꿔라” 문구는 whitelist된 `status/result/block` 최소 edit 계약으로 정정한다.
   - FEAT-10이 `TASK_BACKLOG.md`에 남아 있으면 `area`를 정확히 `apps/admin/src/fsd/pages/pipeline + apps/admin/src/fsd/features/run-pipeline-command + apps/admin/src/fsd/features/transition-pipeline-gate + apps/admin/src/fsd/entities/pipeline`으로 교체한다. 이미 완료되어 backlog에서 제거됐다면 이 항목은 non-applicable이다.
   - `execution-order: "fsd-first"`이고 FEAT-10이 active이면 Phase 0에서 재기준화한 `docs/plans/FEAT-10.md`가 더 이상 `src/pipeline/**`/`src/ui/**`를 구현 목적지로 지시하지 않고, `gateNextActionHint`를 transition feature가 소유하며, GET action contract test와 exact 4-fetch-owner 후속 gate를 명시하는지 확인한다. 또한 raw-CDN 지연 대응 카피인 exact `보드에 반영되면` prefix와 `결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다. 방금 찍었다면 보드 반영까지 최대 5분 걸립니다.`가 스케치·전 경우 표·test 명세에 유지되는지 검사한다. 계획 본문의 historical 검증 기록은 당시 flat 기준 증거로 보존하고 “구현 목적지” 표/스케치만 새 source of truth에 맞춘다. 이어서 최종 FSD source, public API, package/config, auth/GitHub read 경계를 입력으로 FEAT-10 계획 자체에 `reconciling-proposals-with-codebase`의 INV-1~INV-7 full reconciliation을 수행한다. 계획이 수정되면 처음부터 다시 돌리고 마지막 reconciliation pass는 no-edit여야 한다. 그 canonical status가 `clean pass achieved`일 때만 FEAT-10 구현승인/구현으로 넘어갈 수 있다. blocker나 user decision이 남으면 FEAT-10 구현승인/구현은 계속 금지하며 Phase 7C 완료 기록에 그 상태를 명시한다.
   - `docs/plans/FEAT-03.md`, `FEAT-07.md`, `FEAT-09.md`와 `PROJECT_BOARD.md` 완료 행의 옛 경로는 당시 실행 증거이므로 일괄 치환하지 않는다.
3. old alias/path와 외부 deep import가 0인지 exit-code-safe residual scan과 boundary script 양쪽으로 확인한다.
4. runtime test, `verify:fsd`, production typecheck, safe build가 통과하고 대상 legacy top-level 폴더가 실제로 비었음을 확인한 뒤에만 제거한다. compatibility barrel은 남기지 않는다.
5. `verify:fsd:final`로 legacy 폴더 부재, protected route/public entry, 모든 slice root와 wildcard/page-private/runtime-boundary re-export 부재, exact DB query owner/model/method, 선택한 안정 기준선의 native fetch owner 수와 global/browser/network-client 우회 0, Sentry SDK exact 3-owner를 확인한다. 현재 `fsd-first` migration의 fetch owner는 exact 3개다. FEAT-10이 먼저 구현된 기준선은 이 문서 전체를 재검증해 exact 4개와 progress GET action test로 갱신하기 전에는 이 단계에 진입할 수 없다.

### Phase 7B [Full] — test-source typecheck

1. `apps/admin/tsconfig.test.json`을 다음 exact shape로 추가한다. production strict 설정을 상속하고 test용 include만 분리한다.

   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": {
       "noEmit": true,
       "incremental": false,
       "allowJs": true,
       "checkJs": true,
       "allowImportingTsExtensions": true
     },
     "include": [
       "next-env.d.ts",
       "src/**/*.ts",
       "src/**/*.tsx",
       "src/**/*.js",
       "src/**/*.mjs",
       "scripts/**/*.mjs",
       "types/**/*.d.ts"
     ],
     "exclude": ["node_modules", ".next"]
   }
   ```

2. package에 `"test:types": "tsc --noEmit --incremental false -p tsconfig.test.json"`를 추가한다.
3. Full의 `check`는 정확히 `npm run verify:fsd:test && npm run verify:fsd && next lint && tsc --noEmit && npm run test:types`로 바꾼다.
4. 현재 설치된 `@types/node` 20.19.24는 `mock.module`을 선언한다. `package.json`의 TypeScript 범위는 `^5.8.2`지만 현재 `package-lock.json`과 `node_modules/typescript/package.json`이 함께 고정한 실제 compiler/runtime은 5.9.3이며, 이 5.9.3에서 위 exact strict 설정을 기존 8개 test entry에 적용한 probe는 6개 파일에서 108 errors로 실패했다: `reporting.test.mjs` 3, `board.test.mjs` 15, `briefing.test.mjs` 36, `commands.test.mjs` 6, `desk-commands.test.mjs` 1, `transitions.test.mjs` 47. 오류 분포는 TS7006 1, TS18047 2, TS18048 45, TS2531 5, TS2532 51, TS2538 4다.
5. Full에서는 이동된 위 6개 test를 같은 phase에서 type-clean하게 만든다. implicit-any fixture builder에는 `Parameters<typeof subject>[...]`에서 유도한 JSDoc 타입을 주고, array index/`find`/nullable 결과는 named local로 받은 뒤 `assert.ok` 또는 local generic `must` helper로 실제 존재를 검사하고 나서 접근한다. `@ts-ignore`/`@ts-expect-error`, production type assertion 남용, `strict`/`checkJs`/`noUncheckedIndexedAccess` 완화는 허용하지 않는다.
6. 신규 module-mock/boundary test까지 포함한 `npm.cmd run test:types -w apps/admin`을 실행해 0 errors를 확인한다. runtime `npm test`도 다시 실행해 narrowing용 assertion이 behavior를 바꾸지 않았음을 확인한다.

### Phase 7C [Core/Full] — 최종 산출물 검증과 완료 기록

1. 승인 scope에 맞는 전체 verification matrix를 깨끗한 최신 build 산출물로 실행한다.
   - `execution-order: "fsd-first"`이고 FEAT-10이 active이면 Phase 7A에서 수행한 FEAT-10 post-migration full reconciliation의 최종 status, 최종 FSD HEAD, 검사한 source/public API/test owner, 마지막 pass의 no-edit 여부를 이 proposal의 `verification-summary`와 완료 기록에 남긴다. FEAT-10 계획의 source edit 뒤 no-edit final pass가 없으면 migration 자체의 문서 전환이 끝난 것으로 간주하지 않는다.
2. `execution-order: "fsd-first"` 기준에서는 아래 exact path-set parser로 mapping table의 62개 목적지와 Core 신규 22개, 선택한 scope의 Full 신규 5개를 합친 기대 집합을 실제 `src` 전체 파일 집합과 비교한다. missing/unexpected가 모두 0이어야 하며, 그 결과로 Core 84/Full 89도 함께 확인한다. 파일 수만 맞거나 일부 필수 파일만 존재하는 것은 통과가 아니다. `feat10-first`이면 이 parser 자체를 68-row/23-addition 기준으로 재작성·재검증하지 않은 상태에서 완료할 수 없다.
3. exact proposal 승인/accepted ADR/ADR index/`CLAUDE.md`, package/lock/tsconfig, route/middleware manifest를 각 parser와 assertion으로 확인하고 manual smoke를 수행한다. live GitHub/Sentry write는 별도 승인 없이는 수행하지 않는다.
4. 실제 명령, 결과, test 수, scope, commit/PR, 남은 follow-up을 proposal에 기록하고 front matter를 `status: completed`, `stage: null`로 갱신한다.
5. 모든 완료 metadata가 채워지고 승인 scope의 gate가 통과한 뒤에만 `completed/YYYY-MM-DD-admin-src-fsd-refactoring.md`로 이동한다.
6. 이동 직후 아래 `completed proposal lifecycle 검증`을 실행해 active old path 부재, completed new path 단일 존재, 파일명과 `completed-at` 일치, `status: completed`, `stage: null`, 완료 metadata와 승인 metadata 보존, 완료 기록 필수 field의 단일 존재·실제 값과 `N/A` 부재, 닫힘 기록 필수 field의 정확한 `N/A (completed)`, 그 밖의 placeholder/임의 `N/A` field 부재를 확인한다. 실패하면 완료로 선언하지 않고 metadata/path를 바로잡은 뒤 다시 실행한다.

## Final Artifact Resolution Map

| 계약 | source input | 변환/owner | 최종 목적지·산출물 | old-absence / new-presence 증거 |
| --- | --- | --- | --- | --- |
| source tree inventory | `execution-order: "fsd-first"`의 62-row mapping + Core 신규 22개 + Full 신규 5개 | exact approval scope/order parser와 경로 집합 합성 | Core 84개 또는 Full 89개의 유일한 `apps/admin/src` 파일 집합 | mapping source/target 중복 0 + 실제 집합의 missing/unexpected 모두 0; `feat10-first`는 68-row/23-Core-addition parser 재작성 전 실행 금지 |
| slice public API/runtime boundary | slice/segment root `index.ts`, named/aliased/transitive export binding, origin directive/`server-only`, `ui/_component` 구현 | TypeScript AST import/export provenance | directive-free explicit named public surface; feature action/entity server query/Edge config와 pipeline private UI 5개는 각 금지 root에서 접근 불가; Core analytics entity root는 exact `export {};` | boundary rule 10/11의 wildcard/private/directive/action/query/Edge leak fail fixture + final scan + root prohibited-symbol/source assertion |
| public routes | `app/**/page.tsx`, `route.ts`, `robots.ts` | Next App Router build | `.next/routes-manifest.json`의 `/`, `/login`, `/analytics`, `/observability`, `/pipeline`, `/robots.txt`, `/api/auth/[...nextauth]` | manifest에 `(protected)` 노출 없음 + 기대 route 전부 존재 |
| protected shell/body | `app/(protected)/layout.tsx`와 세 page | layout은 header, page는 guard/data/main body | server component tree | 각 page의 header import/markup 부재 + layout header 존재 + 기존 main wrapper 존재 |
| auth Edge graph | `middleware.ts`, `server/auth/config.edge.ts` | Next middleware compiler | `.next/server/middleware-manifest.json` | matcher `/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)` 1개 + middleware에서 Node auth/env/provider import 부재 |
| auth runtime | `ADMIN_EMAILS`, JWT/session email, pathname | sign-in callback, edge authorized, `requireAdmin` | allow/redirect/notFound 또는 admin identity | auth/action tests의 auth-first·destination recheck |
| analytics read | URL range/funnel; Core는 현재 reporting의 `name: string` 경계를 보존하고 Full만 `@repo/db` canonical contract로 좁힘 | search parser → 4 query → reporting; Full은 query I/O와 reporting을 canonical event type에 연결 | 단일 owner `fsd/entities/analytics-event/api/queries.ts`의 exact `db.analyticsEvent.findMany`와 page DTO | Core characterization/query mock + boundary rule 12의 non-owner read/other model/method/aliased mutation/raw/transaction/dynamic·re-export/deep-import fail fixture; Full은 old local option sets 부재 + canonical guard/options/type coupling 존재 |
| board read | dev `PROJECT_BOARD.md` raw response | no-store GET → parser → briefing | `BoardSection[]`; Full은 warnings/banner 추가 | 기존 sections equality + GET 1회 + raw text가 log/props에 없음 |
| FEAT-10 progress read와 raw-board 지연 안내(후속/조건부) | issue #87 comments + 6h `since` + optional token, raw board CDN `max-age=300`, Phase 0에서 FSD 목적지로 편집된 FEAT-10 plan | auth-first no-store comments GET → shape filter → FIFO progress derivation; raw board가 stale일 수 있는 동안 gate hint/disabled description이 조건과 최대 지연을 설명 | run-command feature private action/model/UI + gate-local transition descriptor; production fetch fourth owner. plan의 기존 flat-tree 검증은 historical이고 최종 FSD tree 기준 post-migration reconciliation이 최신 실행 계약을 결정 | dedicated mock action test + pure FIFO/run-plan test + peer-feature import 0 + exact `보드에 반영되면`/`방금 찍었다면 보드 반영까지 최대 5분 걸립니다.` anchors + FEAT-10 INV-1~INV-7 no-edit clean pass 증거; 현재 `fsd-first` migration 산출물에는 기능 source가 아직 없음 |
| pipeline command write | `PipelineCommandKey` | server whitelist → JSON encode | issue #87 `POST`, body exact `{ "body": <whitelisted string> }` | boundary rule 13으로 final command action만 POST owner임을 확인 + bare/globalThis/window/self/alias/computed 우회와 client browser-network primitive 부재 + client-provided free-form body 부재 + URL/header/body snapshot 존재 |
| gate write | forward/reject action key + id + expected source status + contents GET response | whitelist validate → status/result/block 최소 edit → base64 | contents API `PUT` body의 action-specific `message`, `content`, GET `sha`, `branch: "dev"` | boundary rule 13으로 entity read/command/gate 외 native fetch와 별도 network client 부재 + invalid/stale/shape에서 PUT 부재 + bounce/hold/discard parser round-trip/minimal diff + success exact JSON/SHA 존재 |
| scope-specific visual/runtime cleanup | moved table atom과 `globals.css`의 picked/clipcard family | exact approval scope | Core는 table client directive와 picked alias/theme values/keyframes/utility를 보존; Full은 directive와 두 CSS family 전체가 부재 | scope parser가 table 첫 directive와 CSS definition counts(Core)를 확인하고 Full에서는 family 이름 잔존 0을 확인; analytics render/build로 exposed body 회귀 확인 |
| observability write | authenticated admin user id | isolated scope → `{ kind: "stuck-processing", uploadedFileId: "observability-test", processingStartedAt: <ISO>, elapsedMinutes: 0 }` capture → flush | Sentry event tagged by `app: admin`; Full은 boolean result. `src` SDK import owner는 instrumentation/config/report wrapper exact 3개 | boundary rule 13의 비허용 `@sentry/nextjs` import fail fixture + raw public user setter 부재(Full) + mocked exact payload/scope/capture/flush call order; live event 없음 |
| package/config gates | `package.json`, `package-lock.json` workspace entry, Full의 `tsconfig.test.json` | npm/TypeScript parsers | exact engine/scripts와 compiler/include/exclude shape | Phase 0의 Node JSON 정규화 digest로 `engines.node` 외 lock drift 부재 + 최종 small-entry parse; grep 문자열 비교만으로 판정하지 않음 |
| architecture/operational docs | exact proposal approval/order metadata, accepted ADR + completed implementation facts + admin runtime instruction + 중첩 remote pipeline 문서 + live FEAT-10 plan/backlog locator | maintainer decision과 Phase 0/7 기록 | active 승인 proposal, `ADR/0001...md`, ADR index, `apps/admin/CLAUDE.md`, `.claude/agents/admin-dev.md`, remote proposal, active FEAT-10 plan/area(존재 시), completed proposal | 승인/ADR/front matter parser + 두 admin 지침의 anti-FSD/legacy code-span 부재·scope contract 일치·module-mock runtime 설명 + CLAUDE test inventory와 실제 `src/**/*.test.mjs` exact set 일치 + remote legacy path/문구 부재 + FEAT-10 FSD destination/gate-local hint/GET-test/4-owner follow-up anchors + 기존 flat-tree 검증의 historical 표기 + post-migration full reconciliation/no-edit final-pass 기록 + completed lifecycle 검사 |

## Verification Plan

### 자동 검증 순서

저장소 root에서 다음을 순서대로 실행한다. 각 외부 명령의 종료 코드를 즉시 검사해 앞선 실패가 뒤 명령에 가려지지 않게 한다.

```powershell
$ErrorActionPreference = "Stop"
function Invoke-Checked {
  param([string]$FilePath, [string[]]$ArgumentList)
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "command failed ($LASTEXITCODE): $FilePath $($ArgumentList -join ' ')"
  }
}

$nodeVersion = [version]((node --version).Trim().TrimStart("v"))
if ($nodeVersion -lt [version]"22.3") { throw "Node >=22.3 is required" }
Invoke-Checked npm.cmd @("run", "test", "-w", "apps/admin")
Invoke-Checked npm.cmd @("run", "typecheck", "-w", "apps/admin")
Invoke-Checked npm.cmd @("run", "verify:fsd:test", "-w", "apps/admin")
Invoke-Checked npm.cmd @("run", "verify:fsd", "-w", "apps/admin")
Invoke-Checked npm.cmd @("run", "check", "-w", "apps/admin")
Invoke-Checked npm.cmd @("run", "verify:fsd:final", "-w", "apps/admin")
```

Full에서는 위 공통 block 뒤에 test-source typing을 별도로 확인한다. Core에서는 이 script/file이 없어야 한다.

```powershell
$ErrorActionPreference = "Stop"
npm.cmd run test:types -w apps/admin
if ($LASTEXITCODE -ne 0) { throw "admin test:types failed: exit $LASTEXITCODE" }
```

build는 `.next`를 갱신하는 검증 단계이며 Sentry source-map upload라는 외부 side effect를 차단한 상태에서 실행한다. Windows PowerShell/.NET에서 `[Environment]::SetEnvironmentVariable(..., "", "Process")`는 빈 값을 보존하지 않고 변수를 삭제하므로 사용하지 않는다. 대신 Node wrapper가 부모 환경을 복제한 자식 `env`에 `SENTRY_AUTH_TOKEN: ""` property를 직접 유지한 채 `npm.cmd`를 실행한다. 설치된 dotenv가 기존 empty property를 덮어쓰지 않고, `cmd.exe`를 거친 자식 Node process에도 empty property가 보존되는 것을 probe로 확인했다. wrapper process 안에서만 바꾸므로 원래 PowerShell process 환경은 수정하지 않는다.

```powershell
$ErrorActionPreference = "Stop"
$safeBuildRunner = @'
const { spawnSync } = require("node:child_process");

const env = { ...process.env, SENTRY_AUTH_TOKEN: "" };
const comspec = process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe";
const result = spawnSync(
  comspec,
  ["/d", "/s", "/c", "npm.cmd", "run", "build", "-w", "apps/admin"],
  { env, stdio: "inherit", shell: false },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
'@
$safeBuildRunner | node.exe -
if ($LASTEXITCODE -ne 0) { throw "admin safe build failed: exit $LASTEXITCODE" }
```

### approval/package/config parser 검증

구현 중인 active proposal의 flat front matter는 중복 key를 거부하는 scalar parser로 읽고 exact 승인 metadata와 이 62-file 문서가 실행 가능한 `execution-order: "fsd-first"`를 검증한다. `feat10-first`는 parser 우회 값이 아니라 full reconciliation 중단 신호다. `package.json`은 JSON parser로 exact script를 비교한다. Windows PowerShell 5.1에서 현재 `package-lock.json` 전체에 `ConvertFrom-Json`을 적용하면 실패하므로, lockfile은 quote 손실이 있는 `node -e` 대신 검증된 here-string을 `node.exe -`의 표준입력으로 전달해 `JSON.parse`하고 작은 admin entry만 PowerShell로 반환한다. Phase 0 normalized digest가 허용된 engine 외 lock drift를 막고, 이 block은 최종 workspace dependency map과 engine을 다시 확인한다.

```powershell
$ErrorActionPreference = "Stop"
function Read-FlatFrontMatter {
  param([string]$Path)
  $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $match = [regex]::Match(
    $text,
    '\A---\r?\n(?<body>.*?)\r?\n---',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
  if (-not $match.Success) { throw "front matter missing: $Path" }
  $metadata = @{}
  foreach ($line in ($match.Groups["body"].Value -split "`r?`n")) {
    if ($line -notmatch '^(?<key>[a-z][a-z0-9-]*):\s*(?<value>.*)$') { continue }
    $key = $Matches["key"]
    if ($metadata.ContainsKey($key)) { throw "duplicate front matter key: $key" }
    $metadata[$key] = $Matches["value"].Trim()
  }
  return $metadata
}

$proposalPath = "apps/admin/docs/proposals/active/admin-src-fsd-refactoring.md"
$proposalMeta = Read-FlatFrontMatter $proposalPath
if ($proposalMeta["status"] -cne '"pending"') { throw "active proposal status mismatch" }
if ($proposalMeta["stage"] -cne '"approved"') { throw "proposal is not approved" }
if ($proposalMeta["approved-by"] -notmatch '^"[^"]+"$') { throw "approved-by missing" }
if ($proposalMeta["approved-at"] -notmatch '^"\d{4}-\d{2}-\d{2}"$') { throw "approved-at invalid" }
if ($proposalMeta["execution-order"] -cne '"fsd-first"') {
  throw "this 62-file proposal can execute only with exact execution-order fsd-first; feat10-first requires full reconciliation"
}
$scopeByApproval = @{
  "Core: right-sized FSD migration" = "Core"
  "Full: right-sized FSD migration + contract hardening" = "Full"
}
$scopeValue = $proposalMeta["approval-scope"].Trim('"')
$scope = $scopeByApproval[$scopeValue]
if ($null -eq $scope) { throw "missing or invalid exact approval-scope" }

$package = Get-Content -LiteralPath apps/admin/package.json -Raw -Encoding UTF8 |
  ConvertFrom-Json
if ($package.engines.node -cne ">=22.3") { throw "Node engine mismatch" }
$lockEntryReader = @'
const fs = require("node:fs");
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const admin = lock.packages?.["apps/admin"];
if (!admin) throw new Error("apps/admin lock entry is missing");
process.stdout.write(JSON.stringify(admin));
'@
$adminLockJson = $lockEntryReader | node.exe -
if ($LASTEXITCODE -ne 0) { throw "admin lock entry parse failed: exit $LASTEXITCODE" }
$adminLock = $adminLockJson | ConvertFrom-Json
if ($adminLock.engines.node -cne $package.engines.node) {
  throw "admin package-lock engine mismatch"
}
function Assert-SameStringMap {
  param([string]$Name, $Expected, $Actual)
  $expectedProperties = @($Expected.PSObject.Properties)
  $actualProperties = @($Actual.PSObject.Properties)
  if ($expectedProperties.Count -ne $actualProperties.Count) {
    throw "$Name property count mismatch"
  }
  foreach ($property in $expectedProperties) {
    $actualProperty = $Actual.PSObject.Properties[$property.Name]
    if ($null -eq $actualProperty -or $actualProperty.Value -cne $property.Value) {
      throw "$Name mismatch: $($property.Name)"
    }
  }
}
Assert-SameStringMap "dependencies" $package.dependencies $adminLock.dependencies
Assert-SameStringMap "devDependencies" $package.devDependencies $adminLock.devDependencies

$expected = [ordered]@{
  "test" = 'node --import tsx --experimental-test-module-mocks --test "src/**/*.test.mjs"'
  "verify:fsd" = "node scripts/verify-fsd-boundaries.mjs"
  "verify:fsd:test" = "node --test scripts/verify-fsd-boundaries.test.mjs"
  "verify:fsd:final" = "node scripts/verify-fsd-boundaries.mjs --final"
  "check" = "npm run verify:fsd:test && npm run verify:fsd && next lint && tsc --noEmit"
}
if ($scope -eq "Full") {
  $expected["test:types"] = "tsc --noEmit --incremental false -p tsconfig.test.json"
  $expected["check"] = "npm run verify:fsd:test && npm run verify:fsd && next lint && tsc --noEmit && npm run test:types"
} elseif ($null -ne $package.scripts.PSObject.Properties["test:types"]) {
  throw "Core must not contain test:types"
}
foreach ($name in $expected.Keys) {
  $actual = $package.scripts.PSObject.Properties[$name].Value
  if ($actual -cne $expected[$name]) {
    throw "script mismatch: $name"
  }
}

$adrPath = "apps/admin/docs/ADR/0001-adopt-fsd-for-admin.md"
$adrMeta = Read-FlatFrontMatter $adrPath
if ($adrMeta["status"] -cne '"accepted"') { throw "ADR 0001 is not accepted" }
if ($adrMeta["date"] -notmatch '^"\d{4}-\d{2}-\d{2}"$') { throw "ADR date invalid" }
$adrIndex = Get-Content -LiteralPath apps/admin/docs/ADR/README.md -Raw -Encoding UTF8
if ($adrIndex -notmatch '(?m)^\|\s*\[0001\]\(0001-adopt-fsd-for-admin\.md\)\s*\|\s*[^|]+\|\s*accepted\s*\|\s*$') {
  throw "accepted ADR 0001 index entry missing"
}
$claude = Get-Content -LiteralPath apps/admin/CLAUDE.md -Raw -Encoding UTF8
foreach ($pattern in @('(?m)^### FSD가 아니다\s*$', 'admin은 쓰지 않는다', '여기로 가져오지 말 것')) {
  if ($claude -match $pattern) { throw "stale CLAUDE rule remains: $pattern" }
}
$legacyDocPathPattern = '`(?:(?:src/|~/)?(?:analytics|auth|lib|observability|pipeline|ui)/)[^`]*`'
if ($claude -match $legacyDocPathPattern) {
  throw "legacy flat-path code span remains in apps/admin/CLAUDE.md"
}
foreach ($anchor in @('src/fsd/', 'src/server/auth', 'verify:fsd')) {
  if ($claude -notmatch [regex]::Escape($anchor)) { throw "CLAUDE anchor missing: $anchor" }
}
$adminAgent = Get-Content -LiteralPath .claude/agents/admin-dev.md -Raw -Encoding UTF8
foreach ($pattern in @(
  'apps/admin`은 FSD가 아니다',
  'web과 달리 `model/` 디렉터리 관습은 없다',
  $legacyDocPathPattern
)) {
  if ($adminAgent -match $pattern) { throw "stale admin-dev rule remains: $pattern" }
}
foreach ($anchor in @('src/fsd/', 'src/server/auth', 'verify:fsd')) {
  if ($adminAgent -notmatch [regex]::Escape($anchor)) {
    throw "admin-dev anchor missing: $anchor"
  }
}
$staleOperationalClaims = @(
  '현재 **8개 파일, 95개 테스트.**',
  '있는 것은 `dev`, `build`, `start`, `check`, `lint`, `typecheck`, `test`뿐이다.',
  '렌더링·DB 호출·외부 I/O 자체는 덮을 수 없',
  'npm test`는 `tsx --test "src/**/*.test.mjs"'
)
foreach ($document in @(
  @{ Name = 'apps/admin/CLAUDE.md'; Text = $claude },
  @{ Name = '.claude/agents/admin-dev.md'; Text = $adminAgent }
)) {
  foreach ($claim in $staleOperationalClaims) {
    if ($document.Text -match [regex]::Escape($claim)) {
      throw "stale operational claim remains in $($document.Name): $claim"
    }
  }
  $runtimeContract = 'test-runtime-contract: module-mocked DB/GitHub/Sentry; live I/O forbidden; DOM client interaction manual'
  if ($document.Text -notmatch [regex]::Escape($runtimeContract)) {
    throw "test runtime contract missing in $($document.Name)"
  }
}
if ($scope -eq 'Core') {
  $analyticsContract = 'analytics-reporting-contract: import-free; DB/server-only/fetch forbidden'
  $typingContract = 'test-typing-contract: production tsconfig only; no test:types'
  $forbiddenScopeContracts = @(
    'analytics-reporting-contract: type-only AnalyticsEventName from @repo/db; runtime DB/server-only/fetch forbidden',
    'test-typing-contract: tsconfig.test.json + test:types'
  )
} else {
  $analyticsContract = 'analytics-reporting-contract: type-only AnalyticsEventName from @repo/db; runtime DB/server-only/fetch forbidden'
  $typingContract = 'test-typing-contract: tsconfig.test.json + test:types'
  $forbiddenScopeContracts = @(
    'analytics-reporting-contract: import-free; DB/server-only/fetch forbidden',
    'test-typing-contract: production tsconfig only; no test:types'
  )
}
foreach ($document in @(
  @{ Name = 'apps/admin/CLAUDE.md'; Text = $claude },
  @{ Name = '.claude/agents/admin-dev.md'; Text = $adminAgent }
)) {
  foreach ($contract in @($analyticsContract, $typingContract)) {
    if ($document.Text -notmatch [regex]::Escape($contract)) {
      throw "$scope contract missing in $($document.Name): $contract"
    }
  }
  foreach ($contract in $forbiddenScopeContracts) {
    if ($document.Text -match [regex]::Escape($contract)) {
      throw "opposite-scope contract remains in $($document.Name): $contract"
    }
  }
}
$adminRoot = (Resolve-Path -LiteralPath apps/admin).Path
$actualTestPaths = @(
  Get-ChildItem -LiteralPath apps/admin/src -Recurse -File -Filter *.test.mjs |
    ForEach-Object {
      $_.FullName.Substring($adminRoot.Length + 1).Replace('\', '/')
    } |
    Sort-Object
)
$inventoryMatches = [regex]::Matches(
  $claude,
  '(?m)^\|\s*`(?<path>src/[^`|]+\.test\.mjs)`\s*\|'
)
$documentedTestPaths = @(
  $inventoryMatches | ForEach-Object { $_.Groups['path'].Value } | Sort-Object
)
if (@($documentedTestPaths | Select-Object -Unique).Count -ne $documentedTestPaths.Count) {
  throw 'duplicate test path in apps/admin/CLAUDE.md test inventory'
}
$testInventoryDiff = @(
  Compare-Object $actualTestPaths $documentedTestPaths -CaseSensitive -SyncWindow 0
)
if ($testInventoryDiff.Count -ne 0) {
  throw "apps/admin/CLAUDE.md test inventory differs from actual src/**/*.test.mjs: $($testInventoryDiff | Out-String)"
}
$remoteProposal = Get-Content -LiteralPath docs/proposals/active/remote-agent-pipeline-generalization.md -Raw -Encoding UTF8
foreach ($old in @(
  'apps/admin/src/pipeline/command-action.ts',
  'apps/admin/src/pipeline/commit-transition.ts',
  '`command-action.ts`',
  '`commit-transition.ts`',
  '이 경로는 "status만 바꿔라"'
)) {
  if ($remoteProposal -match [regex]::Escape($old)) {
    throw "stale remote pipeline proposal text remains: $old"
  }
}
foreach ($anchor in @(
  'apps/admin/src/fsd/features/run-pipeline-command/api/post-pipeline-command.ts',
  'apps/admin/src/fsd/features/transition-pipeline-gate/api/commit-gate-transition.ts',
  'status/result/block'
)) {
  if ($remoteProposal -notmatch [regex]::Escape($anchor)) {
    throw "remote pipeline proposal anchor missing: $anchor"
  }
}
$backlog = Get-Content -LiteralPath TASK_BACKLOG.md -Raw -Encoding UTF8
$feat10 = [regex]::Match(
  $backlog,
  '(?ms)^- \[ \] \*\*FEAT-10\*\*:.*?(?=^- \[ \] \*\*|^## |\z)'
)
if ($feat10.Success) {
  $expectedFeat10Area = 'apps/admin/src/fsd/pages/pipeline + apps/admin/src/fsd/features/run-pipeline-command + apps/admin/src/fsd/features/transition-pipeline-gate + apps/admin/src/fsd/entities/pipeline'
  $areaMatches = [regex]::Matches(
    $feat10.Value,
    '(?m)^\s{2}- area:\s*(?<value>.+?)\s*$'
  )
  if ($areaMatches.Count -ne 1 -or
      $areaMatches[0].Groups['value'].Value -cne $expectedFeat10Area) {
    throw "active FEAT-10 area does not match the final FSD destinations"
  }
  foreach ($old in @('apps/admin/src/pipeline', 'apps/admin/src/ui')) {
    if ($feat10.Value -match [regex]::Escape($old)) {
      throw "active FEAT-10 still contains a legacy area path: $old"
    }
  }
  $feat10Plan = Get-Content -LiteralPath docs/plans/FEAT-10.md -Raw -Encoding UTF8
  foreach ($anchor in @(
    'fsd/entities/pipeline/api/queries.ts',
    'fsd/features/run-pipeline-command/api/post-pipeline-command.ts',
    'fsd/features/transition-pipeline-gate/api/commit-gate-transition.ts',
    'fsd/features/run-pipeline-command/api/get-pipeline-progress.ts',
    'fsd/features/run-pipeline-command/api/get-pipeline-progress.test.mjs',
    'fsd/features/transition-pipeline-gate/model/transitions.ts',
    '보드에 반영되면',
    '결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다. 방금 찍었다면 보드 반영까지 최대 5분 걸립니다.',
    'post-FSD full reconciliation',
    'no-edit clean pass'
  )) {
    if ($feat10Plan -notmatch [regex]::Escape($anchor)) {
      throw "active FEAT-10 FSD rebaseline anchor missing: $anchor"
    }
  }
  if ($feat10Plan -match 'from\s+["'']~/fsd/features/run-pipeline-command[^"'']*["'']') {
    throw "active FEAT-10 still directs the gate feature to import its peer run-command feature"
  }
}
```

Full의 `tsconfig.test.json`도 parser로 compiler option과 include/exclude sequence를 확인한다.

```powershell
$ErrorActionPreference = "Stop"
$config = Get-Content -LiteralPath apps/admin/tsconfig.test.json -Raw -Encoding UTF8 |
  ConvertFrom-Json
if ($config.extends -cne "./tsconfig.json") { throw "extends mismatch" }
foreach ($name in @("noEmit", "allowJs", "checkJs", "allowImportingTsExtensions")) {
  if ($config.compilerOptions.$name -ne $true) { throw "option mismatch: $name" }
}
if ($config.compilerOptions.incremental -ne $false) {
  throw "incremental must be false"
}
$expectedInclude = @(
  "next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", "src/**/*.js",
  "src/**/*.mjs", "scripts/**/*.mjs", "types/**/*.d.ts"
)
$actualInclude = @($config.include)
if (Compare-Object $expectedInclude $actualInclude -SyncWindow 0) {
  throw "include sequence mismatch"
}
$actualExclude = @($config.exclude)
if (Compare-Object @("node_modules", ".next") $actualExclude -SyncWindow 0) {
  throw "exclude sequence mismatch"
}
```

### residual/old-absence/new-presence 검증

`rg`의 no-match exit 1은 성공으로 취급하고, match(exit 0)와 검색 오류(exit >1)를 서로 다르게 실패시킨다.

```powershell
$ErrorActionPreference = "Stop"
function Assert-NoRgMatch {
  param([string]$Pattern, [string]$Path)
  & rg -n -- $Pattern $Path
  $rgExit = $LASTEXITCODE
  if ($rgExit -eq 0) { throw "unexpected residual match: $Pattern" }
  if ($rgExit -gt 1) { throw "rg failed ($rgExit): $Pattern" }
}

Assert-NoRgMatch '~/(analytics|auth|lib|observability|pipeline|ui)(/|"|$)' apps/admin/src
Assert-NoRgMatch '~/fsd/(pages|widgets|features|entities)/[^/]+/(api|model|ui|lib|config)/[^" ]+' apps/admin/src
Assert-NoRgMatch 'from "~/fsd/features/(run-pipeline-command|transition-pipeline-gate)/api' apps/admin/src
Assert-NoRgMatch '^\s*export\s+\*\s+from' apps/admin/src/fsd
Assert-NoRgMatch 'AgentAvatar|PixelSprite|PixelOffice|OwnerBanner|BoardWarningBanner|_component' apps/admin/src/fsd/pages/pipeline/index.ts

$proposalText = Get-Content -LiteralPath apps/admin/docs/proposals/active/admin-src-fsd-refactoring.md -Raw -Encoding UTF8
$scopeMatch = [regex]::Match($proposalText, '(?m)^approval-scope:\s*"([^"]+)"\s*$')
$scopeByApproval = @{
  "Core: right-sized FSD migration" = "Core"
  "Full: right-sized FSD migration + contract hardening" = "Full"
}
$scope = $scopeByApproval[$scopeMatch.Groups[1].Value]
if ($null -eq $scope) { throw "missing or invalid exact approval-scope" }
$executionOrderMatch = [regex]::Match(
  $proposalText,
  '(?m)^execution-order:\s*"([^"]+)"\s*$'
)
if (-not $executionOrderMatch.Success -or
    $executionOrderMatch.Groups[1].Value -cne 'fsd-first') {
  throw "62-row exact path parser requires execution-order fsd-first"
}

$analyticsEntityRoot = "apps/admin/src/fsd/entities/analytics-event/index.ts"
$pipelineBriefing = "apps/admin/src/fsd/pages/pipeline/model/briefing.ts"
$observabilityEntry = "apps/admin/src/fsd/shared/observability/index.ts"
$tableAtom = "apps/admin/src/fsd/shared/ui/atoms/table.tsx"
$globalCss = "apps/admin/src/styles/globals.css"
$tableText = Get-Content -LiteralPath $tableAtom -Raw -Encoding UTF8
$tableFirstNonblank = @(
  $tableText -split "`r?`n" | Where-Object { $_ -match '\S' }
)[0].Trim()
$cssText = Get-Content -LiteralPath $globalCss -Raw -Encoding UTF8
$cssCoreDefinitions = [ordered]@{
  "--color-picked alias" = '(?m)^\s*--color-picked\s*:'
  "--picked theme values" = '(?m)^\s*--picked\s*:'
  "clipcard keyframes" = '(?m)^\s*@keyframes\s+clipcard-hashtag-fade-in\s*\{'
  "clipcard utility" = '(?m)^\s*\.animate-clipcard-hashtag-fade-in\s*\{'
}
$cssCoreCounts = [ordered]@{
  "--color-picked alias" = 1
  "--picked theme values" = 2
  "clipcard keyframes" = 1
  "clipcard utility" = 1
}
$briefingText = Get-Content -LiteralPath $pipelineBriefing -Raw -Encoding UTF8
$observabilityText = Get-Content -LiteralPath $observabilityEntry -Raw -Encoding UTF8
if ($scope -eq "Core") {
  $analyticsRootText = (
    Get-Content -LiteralPath $analyticsEntityRoot -Raw -Encoding UTF8
  ).Trim()
  if ($analyticsRootText -cne 'export {};') {
    throw "Core analytics entity root must be exact export {};"
  }
  if ($tableFirstNonblank -cne '"use client";') {
    throw "Core must preserve the table client directive"
  }
  foreach ($name in $cssCoreDefinitions.Keys) {
    $count = [regex]::Matches($cssText, $cssCoreDefinitions[$name]).Count
    if ($count -ne $cssCoreCounts[$name]) {
      throw "Core CSS definition mismatch: $name expected=$($cssCoreCounts[$name]) actual=$count"
    }
  }
  if ($briefingText -notmatch '\bbuildBriefing\b' -or
      $briefingText -match '\bbuildBriefingFromNewestFirstSections\b') {
    throw "Core briefing API drifted into Full"
  }
  foreach ($name in @('setReportUser', 'withIsolatedReportScope')) {
    if ($observabilityText -notmatch "\b$([regex]::Escape($name))\b") {
      throw "Core observability export missing: $name"
    }
  }
} else {
  if ($tableFirstNonblank -match '^["'']use client["''];?(?:\s|$)') {
    throw "Full table atom still has a client directive"
  }
  foreach ($name in $cssCoreDefinitions.Keys) {
    if ([regex]::Matches($cssText, $cssCoreDefinitions[$name]).Count -ne 0) {
      throw "Full CSS cleanup incomplete: $name"
    }
  }
  if ($cssText -match '(?i)picked|clipcard-hashtag-fade-in') {
    throw "Full CSS cleanup left a dangling picked/clipcard reference"
  }
  if ($briefingText -match '\bbuildBriefing\b' -or
      $briefingText -notmatch '\bbuildBriefingFromNewestFirstSections\b') {
    throw "Full briefing API rename incomplete"
  }
  foreach ($name in @('setReportUser', 'withIsolatedReportScope')) {
    if ($observabilityText -match "\b$([regex]::Escape($name))\b") {
      throw "Full observability entry still exposes: $name"
    }
  }
  if ($observabilityText -notmatch '\bwithReportUser\b') {
    throw "Full observability entry is missing withReportUser"
  }
}

$legacy = @("analytics", "auth", "lib", "observability", "pipeline", "ui") |
  ForEach-Object { Join-Path apps/admin/src $_ } |
  Where-Object { Test-Path -LiteralPath $_ }
if (@($legacy).Count -ne 0) { throw "legacy directories remain: $legacy" }

$mappingSection = [regex]::Match(
  $proposalText,
  '(?ms)^### 5\. 기존 62개 파일의 전 파일 매핑\s*$\r?\n(?<body>.*?)(?=^### 6\.)'
)
if (-not $mappingSection.Success) { throw "mapping section missing" }
$mappingRows = @()
foreach ($match in [regex]::Matches(
  $mappingSection.Groups["body"].Value,
  '(?m)^\| `(?<source>[^`]+)` \| (?:(?:`(?<target>[^`]+)`)|(?<same>동일)) \|'
)) {
  $source = $match.Groups["source"].Value
  $target = if ($match.Groups["same"].Success) {
    $source
  } else {
    $match.Groups["target"].Value
  }
  $mappingRows += [pscustomobject]@{ Source = $source; Target = $target }
}
if ($mappingRows.Count -ne 62) {
  throw "mapping row count mismatch: expected 62, got $($mappingRows.Count)"
}
$duplicateMappingSources = @($mappingRows | Group-Object Source | Where-Object Count -gt 1)
$duplicateMappingTargets = @($mappingRows | Group-Object Target | Where-Object Count -gt 1)
if ($duplicateMappingSources.Count -ne 0) {
  throw "duplicate mapping sources: $($duplicateMappingSources.Name)"
}
if ($duplicateMappingTargets.Count -ne 0) {
  throw "duplicate mapping targets: $($duplicateMappingTargets.Name)"
}

$mappedTargets = @($mappingRows | ForEach-Object { "apps/admin/src/$($_.Target)" })
$coreAdditions = @(
  "apps/admin/src/app/(protected)/layout.tsx",
  "apps/admin/src/fsd/entities/analytics-event/api/index.ts",
  "apps/admin/src/fsd/entities/analytics-event/api/queries.test.mjs",
  "apps/admin/src/fsd/entities/analytics-event/index.ts",
  "apps/admin/src/fsd/entities/pipeline/api/index.ts",
  "apps/admin/src/fsd/entities/pipeline/api/queries.test.mjs",
  "apps/admin/src/fsd/entities/pipeline/index.ts",
  "apps/admin/src/fsd/features/admin-sign-in/index.ts",
  "apps/admin/src/fsd/features/run-pipeline-command/api/post-pipeline-command.test.mjs",
  "apps/admin/src/fsd/features/run-pipeline-command/index.ts",
  "apps/admin/src/fsd/features/transition-pipeline-gate/api/commit-gate-transition.test.mjs",
  "apps/admin/src/fsd/features/transition-pipeline-gate/index.ts",
  "apps/admin/src/fsd/features/send-observability-test/api/send-observability-test-event.test.mjs",
  "apps/admin/src/fsd/features/send-observability-test/index.ts",
  "apps/admin/src/fsd/pages/analytics/index.ts",
  "apps/admin/src/fsd/pages/pipeline/index.ts",
  "apps/admin/src/fsd/pages/pipeline/ui/_component/owner-banner.tsx",
  "apps/admin/src/fsd/shared/observability/report-error.test.mjs",
  "apps/admin/src/fsd/widgets/admin-header/index.ts",
  "apps/admin/src/server/auth/config.edge.test.mjs",
  "apps/admin/src/server/auth/config.test.mjs",
  "apps/admin/src/server/auth/guard.test.mjs"
)
$fullAdditions = @(
  "apps/admin/src/fsd/entities/analytics-event/model/report-options.ts",
  "apps/admin/src/fsd/pages/analytics/model/search-params.ts",
  "apps/admin/src/fsd/pages/analytics/model/search-params.test.mjs",
  "apps/admin/src/fsd/pages/pipeline/ui/_component/board-warning-banner.tsx",
  "apps/admin/src/fsd/pages/pipeline/ui/_component/board-warning-banner.test.mjs"
)
$expectedRaw = if ($scope -eq "Full") {
  $mappedTargets + $coreAdditions + $fullAdditions
} else {
  $mappedTargets + $coreAdditions
}
$duplicateExpected = @($expectedRaw | Group-Object | Where-Object Count -gt 1)
if ($duplicateExpected.Count -ne 0) {
  throw "duplicate expected source paths: $($duplicateExpected.Name)"
}
$expectedSourceFiles = @($expectedRaw | Sort-Object)
$expectedCount = if ($scope -eq "Full") { 89 } else { 84 }
if ($expectedSourceFiles.Count -ne $expectedCount) {
  throw "expected path-set size mismatch: expected $expectedCount, got $($expectedSourceFiles.Count)"
}

$repoRoot = (Resolve-Path ".").Path
$actualSourceFiles = @(
  Get-ChildItem -LiteralPath apps/admin/src -Recurse -File |
    ForEach-Object {
      $_.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
    } |
    Sort-Object
)
$missingExpected = @(
  $expectedSourceFiles | Where-Object { $_ -cnotin $actualSourceFiles }
)
$unexpectedActual = @(
  $actualSourceFiles | Where-Object { $_ -cnotin $expectedSourceFiles }
)
if ($missingExpected.Count -ne 0 -or $unexpectedActual.Count -ne 0) {
  throw "src exact path-set mismatch; missing=[$missingExpected]; unexpected=[$unexpectedActual]"
}

if ($scope -eq "Core") {
  if (Test-Path -LiteralPath apps/admin/tsconfig.test.json) {
    throw "Full-only tsconfig.test.json exists in Core"
  }
} elseif (-not (Test-Path -LiteralPath apps/admin/tsconfig.test.json)) {
  throw "Full requires tsconfig.test.json"
}
```

외부 deep import와 private symbol의 direct/aliased/transitive re-export 최종 판정은 text search가 아니라 TypeScript parser로 module/binding provenance를 resolve하는 `verify:fsd:final`이 authoritative하다. 위 wildcard와 pipeline root prohibited-symbol 검색은 전체 금지 목록을 빠르게 재확인하는 보조 negative check다.

### build 산출물 parser 검증

stale `.next`가 아니라 위 safe build가 성공한 직후 아래를 실행한다. manifest 전체를 출력하지 않아 build-time secret metadata가 로그에 노출되지 않게 한다.

```powershell
$ErrorActionPreference = "Stop"
$routes = Get-Content -LiteralPath apps/admin/.next/routes-manifest.json -Raw -Encoding UTF8 |
  ConvertFrom-Json
$actualRoutes = @(
  @($routes.staticRoutes | ForEach-Object { $_.page }) +
  @($routes.dynamicRoutes | ForEach-Object { $_.page })
)
$expectedRoutes = @(
  "/", "/login", "/analytics", "/observability", "/pipeline",
  "/robots.txt", "/api/auth/[...nextauth]"
)
$missingRoutes = $expectedRoutes | Where-Object { $_ -notin $actualRoutes }
if (@($missingRoutes).Count -ne 0) { throw "routes missing: $missingRoutes" }
if ($actualRoutes | Where-Object { $_ -match '\(protected\)' }) {
  throw "route group leaked into public URL"
}

$middleware = Get-Content -LiteralPath apps/admin/.next/server/middleware-manifest.json -Raw -Encoding UTF8 |
  ConvertFrom-Json
$rootMiddleware = $middleware.middleware.PSObject.Properties["/"].Value
$sources = @($rootMiddleware.matchers | ForEach-Object { $_.originalSource })
$expectedMatcher = "/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)"
if ($sources.Count -ne 1 -or $sources[0] -cne $expectedMatcher) {
  throw "middleware matcher mismatch"
}
```

### completed proposal lifecycle 검증

Phase 7C에서 완료 metadata를 기록하고 문서를 이동한 직후 실행한다. 이동 전 active 경로가 사라지고 날짜가 일치하는 completed 파일 하나만 남았는지, 완료 front matter와 본문의 실행 후 기록이 실제 완료 상태인지 구조적으로 확인한다.

```powershell
$ErrorActionPreference = "Stop"
function Read-FlatFrontMatter {
  param([string]$Path)
  $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $match = [regex]::Match(
    $text,
    '\A---\r?\n(?<body>.*?)\r?\n---',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
  if (-not $match.Success) { throw "front matter missing: $Path" }
  $metadata = @{}
  foreach ($line in ($match.Groups["body"].Value -split "`r?`n")) {
    if ($line -notmatch '^(?<key>[a-z][a-z0-9-]*):\s*(?<value>.*)$') { continue }
    $key = $Matches["key"]
    if ($metadata.ContainsKey($key)) { throw "duplicate front matter key: $key" }
    $metadata[$key] = $Matches["value"].Trim()
  }
  return $metadata
}

$activePath = "apps/admin/docs/proposals/active/admin-src-fsd-refactoring.md"
if (Test-Path -LiteralPath $activePath) { throw "completed proposal remains active" }
$completedFiles = @(
  Get-ChildItem -LiteralPath apps/admin/docs/proposals/completed -Filter "*-admin-src-fsd-refactoring.md" -File
)
if ($completedFiles.Count -ne 1) {
  throw "expected exactly one completed proposal, got $($completedFiles.Count)"
}
$completedPath = $completedFiles[0].FullName
$meta = Read-FlatFrontMatter $completedPath
if ($meta["status"] -cne '"completed"') { throw "completed status mismatch" }
if ($meta["stage"] -cne "null") { throw "completed stage must be null" }
if ($meta["completed-at"] -notmatch '^"\d{4}-\d{2}-\d{2}"$') { throw "completed-at invalid" }
if ($meta["verification-summary"] -notmatch '^"[^"]+"$') { throw "verification-summary missing" }
if ($meta["approved-by"] -notmatch '^"[^"]+"$') { throw "approved-by missing" }
if ($meta["approved-at"] -notmatch '^"\d{4}-\d{2}-\d{2}"$') { throw "approved-at invalid" }
$allowedScopes = @(
  '"Core: right-sized FSD migration"',
  '"Full: right-sized FSD migration + contract hardening"'
)
if ($meta["approval-scope"] -notin $allowedScopes) { throw "approval-scope invalid" }
if ($meta["execution-order"] -cne '"fsd-first"') {
  throw "completed 62-file migration must preserve execution-order fsd-first"
}
foreach ($name in @("closed-at", "closed-by", "closed-reason")) {
  if ($meta[$name] -cne "null") { throw "completed proposal has closed metadata: $name" }
}
$completedAt = $meta["completed-at"].Trim('"')
$expectedName = "$completedAt-admin-src-fsd-refactoring.md"
if ($completedFiles[0].Name -cne $expectedName) {
  throw "completed filename mismatch: expected $expectedName"
}
$completedText = Get-Content -LiteralPath $completedPath -Raw -Encoding UTF8
$notesSection = [regex]::Match(
  $completedText,
  '(?ms)^## Completion or Closure Notes\s*$\r?\n(?<body>.*?)(?=^## |\z)'
)
if (-not $notesSection.Success) { throw "completion/closure notes section missing" }
$completedRecord = [regex]::Match(
  $notesSection.Groups["body"].Value,
  '(?ms)^완료 기록\(`status: "completed"`일 때 작성\):\s*$\r?\n(?<body>.*?)(?=^닫힘 기록\()'
)
$closedRecord = [regex]::Match(
  $notesSection.Groups["body"].Value,
  '(?ms)^닫힘 기록\(`status: "closed"`일 때 작성\):\s*$\r?\n(?<body>.*)\z'
)
if (-not $completedRecord.Success -or -not $closedRecord.Success) {
  throw "completion or closure record block missing"
}
function Read-UniqueListFields {
  param([string]$Body, [string]$RecordName)
  $fields = @{}
  foreach ($line in ($Body -split "`r?`n")) {
    if ($line -notmatch '^\s*-\s*(?<key>[^:\r\n]+):\s*(?<value>.*)$') { continue }
    $key = $Matches["key"].Trim()
    if ($fields.ContainsKey($key)) { throw "duplicate $RecordName field: $key" }
    $fields[$key] = $Matches["value"].Trim()
  }
  return $fields
}
$completedFields = Read-UniqueListFields $completedRecord.Groups["body"].Value "completed"
$requiredCompletedFields = @(
  "completed-at", "verification-summary", "implementation PR/commit",
  "changed files summary", "final test count", "remaining follow-up"
)
foreach ($name in $requiredCompletedFields) {
  if (-not $completedFields.ContainsKey($name)) {
    throw "required completed field missing: $name"
  }
  $value = $completedFields[$name]
  if ([string]::IsNullOrWhiteSpace($value) -or
      $value -match '(?i)^(TBD|TODO|decide later|N/?A)(?:\s|$|\()') {
    throw "completed field has no actual value: $name"
  }
}
if ($completedFields["completed-at"] -cne $completedAt) {
  throw "body completed-at does not match front matter"
}
$closedFields = Read-UniqueListFields $closedRecord.Groups["body"].Value "closed"
$requiredClosedFields = @(
  "closed-at", "closed-by", "closed-reason", "close summary", "remaining follow-up"
)
foreach ($name in $requiredClosedFields) {
  if (-not $closedFields.ContainsKey($name)) {
    throw "required closed field missing: $name"
  }
  if ($closedFields[$name] -cne "N/A (completed)") {
    throw "inactive closed field must be N/A (completed): $name"
  }
}
foreach ($entry in $completedFields.GetEnumerator()) {
  if ($entry.Value -match '(?i)^N/?A(?:\s|$|\()') {
    throw "active completed field must not use N/A: $($entry.Key)"
  }
}
foreach ($entry in $closedFields.GetEnumerator()) {
  if ($entry.Value -match '(?i)^N/?A(?:\s|$|\()' -and
      $entry.Key -notin $requiredClosedFields) {
    throw "only required inactive closed fields may use N/A: $($entry.Key)"
  }
}
$placeholderFields = @(
  $completedText -split "`r?`n" |
    Where-Object {
      $_ -match '(?i)^\s*-\s*[^:\r\n]+:\s*(TBD|TODO|decide later)\s*$'
    }
)
if ($placeholderFields.Count -ne 0) {
  throw "completed proposal still contains placeholder fields: $placeholderFields"
}
```

### 필수 테스트 시나리오

| Scope | 경계 | 성공 기준 |
| --- | --- | --- |
| Both | unauthenticated `/login` | 200, redirect loop 없음 |
| Both | authenticated `/login` | `/analytics` redirect |
| Core | `/login-help` characterization | 현재 prefix match에 따라 login route로 취급되는 동작을 보존 |
| Full | `/login-help` hardening | login route로 분류되지 않고 미인증이면 protected 처리 |
| Both | unauthenticated protected route | `/login` redirect |
| Both | allowlisted admin | 3개 protected page 접근 가능 |
| Both | allowlist에서 제거된 기존 session | page/action destination guard가 data/fetch보다 먼저 차단 |
| Both | client navigation 중 allowlist 제거 | preserved layout과 무관하게 새 destination page가 차단 |
| Both | protected body | header는 layout에 정확히 1개, 각 page의 기존 `main` wrapper 유지 |
| Both | invalid analytics params | 기존 `30d`/`activation` default로 normalize |
| Full | canonical analytics contract coupling | query I/O와 reporting이 `@repo/db` canonical types를 직접 소비하고 production typecheck가 통과; shared contract 복사본 없음 |
| Both | recent failure aggregation | filter/group/latest/order case 통과 |
| Full | DB가 예상 밖 analytics name을 반환 | silent drop이 아니라 contract-drift 오류 |
| Both | invalid pipeline command | fetch 0회 |
| Both | valid pipeline command mock | method/URL/header/body 정확, whitelist body 문자열 불변 |
| Both | stale gate | GET 1회/PUT 0회, 명시적 failure |
| Core | invalid forward/reject characterization | token이 있으면 현재 GET 1회/PUT 0회 |
| Full | invalid forward/reject | whitelist prevalidation으로 GET/PUT 모두 0회 |
| Full | invalid GitHub JSON/`null`/shape | action reject가 아니라 failure, PUT 0회 |
| Both | concurrent SHA change | 409 안내 유지 |
| Both | reject availability | 승인대기는 hold/discard, 검토대기는 bounce/hold/discard, 그 밖의 status는 0개 |
| Both | reject edit semantics | bounce는 status 한 줄, hold는 status+결과 insert/replace, discard는 최신 항목 블록만 변경하며 parser round-trip/minimal diff 통과 |
| Both | discard UI/side effects | 실행 전 inline 확인, 성공 뒤 `TASK_BACKLOG.md` 수동 정리 안내, runtime은 backlog/과거 이력 행을 수정하지 않음 |
| Full | board warning fixture | 기존 sections 동일, 1-based code/line banner와 raw-text 없는 safe log |
| Core | observability action characterization | auth-first, scope/capture/flush 순서와 현재 success/error 의미 보존 |
| Full | Sentry flush true/false/reject | true만 success, 나머지는 failure, action은 throw하지 않음 |
| Full | telemetry user scope | concurrent/reused callback 사이 user attribution 누출 없음 |
| Both | analytics tables | populated/empty 상태와 hydration warning 없음 |
| Both | FSD public API | wildcard export 0, pipeline private UI 5개의 root direct/aliased/transitive export 0 |
| Both | public runtime boundary | public entry directive 0, feature action/entity server query/Edge config의 금지 root 재수출 0; Core analytics entity root는 exact `export {};` |
| Both | admin DB exact read ownership | runtime `db` provenance는 analytics query owner 한 파일뿐이고 exact `db.analyticsEvent.findMany`만 사용. non-owner/other-model read, mutation/raw/transaction, unresolved computed, namespace/dynamic/re-export alias와 DB deep import는 모두 실패 |
| Both | external fetch ownership | `fsd-first` native fetch owner는 pipeline entity read, command action, gate action의 최종 세 파일뿐이며 bare/globalThis/window/self/alias/computed 우회와 client `XMLHttpRequest`/`sendBeacon`/WebSocket/EventSource, 별도 network client import는 0. FEAT-10 구현 기준선은 progress GET action을 포함한 exact 4와 전용 mock contract test로 proposal/rule을 먼저 갱신 |
| Both | Sentry SDK ownership | `src`의 direct `@sentry/nextjs` import는 instrumentation, server config, shared report wrapper exact 3개뿐이고 feature/page/client의 direct SDK import 0; report wrapper mock contract와 safe build의 upload 차단 통과 |
| Both | operational documentation semantics | 두 admin 운영 문서의 runtime/analytics/test-typing contract가 선택 scope와 일치하고 CLAUDE test inventory가 실제 `src/**/*.test.mjs` exact set과 일치; old 8/95·old runner·“DB/외부 I/O 자체는 테스트 불가” 주장 0 |
| Both | active FEAT-10 raw-CDN copy preservation | `fsd-first` 재기준화 뒤 gate hint는 `보드에 반영되면` prefix를 사용하고 gate-waiting disabled description은 `방금 찍었다면 보드 반영까지 최대 5분 걸립니다.`를 포함하며, source sketch·전 경우 표·`run-plan.test.mjs` 명세가 동일함. 이후 새 pre-existing plan diff가 있으면 종결 전 Phase 0 시작 0회 |
| Core | scope-specific retained surface | table의 첫 nonblank statement가 `"use client";`, picked alias 1/theme value 2, clipcard keyframes/utility 각 1, legacy briefing/observability public 계약 보존 |
| Full | scope-specific cleanup | table client directive와 picked/clipcard 이름 0, newest-first briefing 이름 존재/old name 0, raw observability export 0/atomic export 존재 |

### 수동 smoke

- `/`, `/login?error=AccessDenied`, `/analytics`, `/observability`, `/pipeline`, `/robots.txt`
- range/funnel link를 클릭한 analytics URL과 invalid query URL
- protected route 간 client navigation
- light/dark 상태의 pipeline briefing, Pixel Office, gate button
- `/pipeline` 요청 하나당 board GET 1회인지 mock/개발 로그에서 확인한다.
- Sentry/GitHub의 실제 외부 쓰기는 staging/sandbox와 명시적 승인 없이는 실행하지 않는다.

검증 기준:

- 기존 95개 test가 모두 유지되고 승인 scope의 신규 regression test가 추가로 통과한다. 최종 정확한 test/suite 수는 완료 기록에 남긴다.
- production typecheck, boundary rule test/기본/final scan, lint/check, safe build가 모두 0으로 종료한다. Full은 test-source typecheck도 필수다.
- route URL, sign-in allowlist/destination guard, command bodies, forward/reject gate edit whitelist와 bounce/hold/discard diff, DB exact read owner/model/method contract는 바뀌지 않는다. Full에서 의도적으로 바뀌는 auth sibling match, invalid gate I/O, analytics drift failure, board warning, Sentry flush 결과만 승인된 예외다.
- parser-backed package/config/route/middleware 검사와 scope별 exact `src` path-set 비교가 통과한다. 현재 `fsd-first` mapping 62개 + Core 신규 22개 + Full 신규 5개를 모두 비교하며 Core 84/Full 89라는 수만 맞는 것으로는 부족하다. `feat10-first`라면 이 문장의 숫자를 실행 근거로 사용하지 않고 actual 68-row 기준으로 다시 reconcile한다.
- Core에서는 Full-only 5개 source와 `test:types`가 없어야 하고, Full에서는 모두 있어야 한다.
- FSD public entry에는 directive/wildcard export가 없고 pipeline private UI 5개는 root에서 direct/aliased/transitive export되지 않는다. feature action, entity server query, Edge config도 금지 root에서 재수출되지 않으며 Core analytics entity root는 exact empty public surface다.
- admin production source의 runtime `db` provenance는 analytics query 한 파일의 exact `db.analyticsEvent.findMany`로 제한되고 Prisma mutation/raw/transaction·DB deep import가 없다. native fetch는 최종 pipeline read/command/gate owner 세 파일에만 존재하며 global alias/computed/browser primitive/network-client 우회가 없다. `@sentry/nextjs` source import도 instrumentation/config/report wrapper exact 3개뿐이다.
- Core/Full별 table directive, picked/clipcard CSS family, briefing 이름, observability export assertions가 통과한다.
- accepted ADR, ADR index, 갱신된 `apps/admin/CLAUDE.md`·`.claude/agents/admin-dev.md`·중첩 remote pipeline proposal이 실제 구조와 일치한다. 두 admin 지침에 old “FSD 미적용” 규칙과 legacy flat-path code span이 없고 scope별 analytics/test-typing contract와 module-mocked I/O 설명이 일치하며, CLAUDE test inventory가 실제 test set과 같다. remote 문서에는 legacy full/bare action path와 FEAT-09에 모순되는 “status만” 문구가 없다. FEAT-10이 active이면 backlog area는 exact 새 FSD 경로이고 계획은 FSD 목적지, gate-local hint, GET action test, 후속 exact 4-owner gate와 raw-CDN 지연 카피의 exact `보드에 반영되면`/`방금 찍었다면 보드 반영까지 최대 5분 걸립니다.`를 가리킨다. 완료 이동 후에는 active old path가 없고 날짜가 일치하는 completed proposal 하나에 완료/승인/order metadata와 필수 완료 field의 실제 값이 남는다. completed 상태에서 사용하지 않는 닫힘 기록의 다섯 field는 정확히 `N/A (completed)`로 종결하며, 필드 삭제로 placeholder 검사를 우회할 수 없어야 한다.
- `fsd-first`에서 FEAT-10이 active이면 계획 edit 이전의 flat-tree clean 기록은 historical로만 남고, 최종 FSD tree 기준 FEAT-10 full reconciliation의 마지막 pass가 no-edit였는지와 canonical status를 완료 기록에서 확인한다. 이 증거가 없거나 blocker/user decision이 남으면 FEAT-10 구현승인/구현 가능 상태로 보고하지 않는다.
- `docs/plans/FEAT-03.md`, `FEAT-07.md`, `FEAT-09.md`, `PROJECT_BOARD.md` 완료 행, 2026-08-02 completed proposals의 옛 경로는 역사 기록으로 남는다. 이 old path 존재를 active guidance drift로 오판해 일괄 치환하지 않는다.
- 기존 실패가 발견되면 변경 전 같은 command 결과를 다시 확인해 신규 실패와 구분한다.

### Definition of Done

Core 완료 조건:

- `execution-order`가 exact `"fsd-first"`이고 FEAT-10 구현은 migration 뒤로 명시적으로 미뤄졌으며, HEAD `0c5e42a`의 active plan/backlog가 새 FSD 목적지와 no-peer/GET-test/4-owner 후속 계약 및 누적 raw-CDN/표시/mutation-test 계약으로 재기준화됐다. 계획 edit로 무효화된 이전 flat-tree clean 결과를 재사용하지 않고 최종 FSD tree 기준 FEAT-10 full reconciliation/no-edit final pass 상태를 완료 기록에 남긴다.
- exact Core approval과 accepted ADR이 있고 Phase 0, 모든 A 단계, Phase 3, Phase 7A/7C가 완료됐다.
- 기존 62개 파일이 누락/중복 없이 목표로 이동했고 Core 신규 22개를 포함한 exact `src` path set의 missing/unexpected가 0이며 총 84개, legacy top-level 0개다.
- auth/action characterization, 기존 test, production typecheck, boundary rule 1~13/basic/final, check, safe build, artifact parser, manual smoke가 모두 통과했고 public directive/runtime leak, 비허용 DB provenance/read/write, fetch/browser-network/Sentry effect, wildcard 및 pipeline private UI 5개의 public 재수출이 0이다.
- URL/auth/DB exact read owner/GitHub command 및 forward/reject payload·최소 diff/Sentry 기존 의미가 보존되고 `apps/admin/CLAUDE.md`, `.claude/agents/admin-dev.md`, remote pipeline proposal, active FEAT-10 area(존재 시), 완료 기록이 실제 tree·test runner·선택 scope를 설명한다.
- Full-only 5개 source, `tsconfig.test.json`, `test:types`, Full behavior는 없다. 발견된 hardening은 링크 가능한 follow-up으로 기록됐다.

Full 완료 조건:

- Core의 구조 이동, 기존 test/invariant, boundary, build, artifact, 문서 gate와 Phase 1B/2B/4B/5B/5C/6B/7B가 완료됐다. 단 Core-only인 “Full 산출물 부재/follow-up” 조건과 Full이 명시적으로 대체하는 기존 auth sibling/gate invalid/analytics drift/Sentry flush 의미는 상속하지 않는다.
- Full 신규 5개를 포함한 exact `src` path set의 missing/unexpected가 0이고 총 89개이며 `tsconfig.test.json`/`test:types`가 존재하고 parser 검증이 통과했다.
- analytics drift, gate JSON/input, board diagnostics, truthful Sentry flush/user isolation, table directive 및 picked/clipcard family 전체 제거를 포함한 Full 시나리오와 test-source typecheck가 모두 통과했다.
- Full 항목을 생략한 채 완료 처리하지 않았고 최종 기록의 필수 완료 field에는 실제 behavior change와 operator-visible warning이 명시됐으며 inactive 닫힘 field는 exact N/A로 종결됐다.

## Verification Results

### Core implementation execution — 2026-08-17

| 명령·검사 | 결과 | 실제 증거 |
| --- | --- | --- |
| exact source path-set parser | Pass | mapping 62 + Core 신규 22 = actual 84; missing 0, unexpected 0 |
| `npm.cmd run test -w apps/admin` | Pass | 17 files, 35 suites, 128 tests, 0 fail |
| `npm.cmd run check -w apps/admin` | Pass | boundary fixture 11/11, migration boundary, ESLint, production typecheck |
| `npm.cmd run verify:fsd:final -w apps/admin` | Pass | legacy top-level 0, required public entries/protected routes/effect owners 통과 |
| safe `npm.cmd run build -w apps/admin` | Pass | Sentry upload disabled; Next 15.5.7 compile/type/page generation 성공 |
| generated route/middleware manifest | Pass | `/`, `/login`, `/analytics`, `/observability`, `/pipeline`, `/robots.txt`, auth API 존재; route group URL 비노출; matcher가 `robots.txt` 제외 |
| local production route smoke | Pass | `/login`·`/robots.txt` 200, protected/root unauthenticated request 307→`/login`, robots body `User-Agent: *` + `Disallow: /` |
| package/lock structural check | Pass | Node engine `>=22.3`, Core scripts exact, `test:types` 부재; lockfile은 admin engine을 제외한 normalized SHA-256이 HEAD와 동일 |
| admin guidance/test inventory | Pass | CLAUDE 17 test path와 실제 `src/**/*.test.mjs` 집합 exact match; legacy flat/FSD 금지 문구 0 |
| live GitHub/Sentry write | Intentionally not run | contract tests/module mocks만 사용; 별도 승인 없는 외부 effect 없음 |

### Pre-implementation reconciliation evidence

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm.cmd run test -w apps/admin` | Pass | 최신 기준선: 95 tests, 26 suites, 0 fail; reject 순수 계층 26개 포함 |
| `npx.cmd tsc --noEmit --incremental false -p apps/admin/tsconfig.json` | Pass | lock/runtime TypeScript 5.9.3 기준선, build cache 미작성 |
| existing→target mapping inventory | Pass | current 62 / mapped 62 / missing 0 / stale 0 / duplicate target 0 / unrelated target collision 0 |
| source line inventory | Pass | reproducible `Get-Content` count: admin 4,934 physical / 4,450 nonblank, web 22,018 physical / 20,213 nonblank |
| target tree exact path-set/provenance inventory | Pass | mapping target 62 + Core 신규 22 = exact Core 84, Full-only 5를 합친 exact Full 89; duplicate/missing/unexpected 0 |
| exact path-set mutation probe | Pass | 기존 subset+file-count 검사는 `app/page.tsx` 누락 + 임의 `stray.ts` 추가 mutant를 통과시켰고, 새 exact set 비교는 missing 1/unexpected 1로 거부함 |
| current reject pure behavior coverage | Pass | 최신 reconciled HEAD의 26개 신규 test case와 독립 probe가 action 여집합, bounce, hold insert/replace와 `$` literal, discard, stale, UTC 문구, commit message를 모두 통과; Phase 0은 이 기준선을 재작성하지 않고 보존·이동 |
| public API escape mutation probe | Pass | pipeline root의 `export * from "./ui"` mutant가 기존 residual 3개/rule 1~9/exact path set을 모두 우회함을 재현; rule 10 fixture + wildcard/root prohibited-symbol scan이 거부하도록 보강 |
| public runtime boundary mutation probe | Pass | named export만 쓰는 public entry directive, feature action, entity server query, auth Edge config leak mutant가 rule 10과 기존 typecheck를 우회할 수 있음을 확인; rule 11의 origin/directive fixture가 모두 거부하고 Core analytics root exact assertion을 통과 |
| DB/fetch effect ownership mutation probe | Pass | unused aliased Prisma mutation과 허용 owner 밖 direct/globalThis/aliased fetch·별도 network client mutant를 기존 query/action test가 실행하지 않음을 확인; rule 12/13 AST fixture가 거부하고 현재 production inventory는 read 1 owner/fetch 3 owners로 통과 |
| DB provenance/owner closure audit | Blocker resolved in proposal | 기존 rule 12는 non-owner `db.analyticsEvent.findMany`, other-model read, namespace/dynamic/re-export alias와 generated Prisma deep import를 허용할 수 있었음. exact query owner·model·method provenance와 fail-closed fixture를 rule 12/artifact/scenario/DoD에 추가 |
| browser-network/Sentry ownership closure audit | Blocker resolved in proposal | 기존 rule 13은 `window.fetch`/`self.fetch`, known-global computed access, browser network primitive와 feature/page의 direct Sentry import를 놓쳤음. native/browser client deny matrix와 source Sentry exact 3-owner fixture를 추가 |
| scope-specific cleanup mutation probe | Pass | Full에서 `--picked` 값만 제거해 alias를 남기거나 clipcard keyframes/utility 한쪽만 남긴 fixture, table directive·old briefing/raw observability export 잔존 fixture를 scope parser가 거부; Core current-definition fixture는 통과 |
| remote proposal destination probe | Pass | 현재 중첩 문서의 stale path/문구 2개와 새 anchor 누락 3개를 검출하고, Phase 7A의 경로·`status/result/block` 치환을 적용한 in-memory fixture는 0 issues로 통과 |
| operational guidance destination probe | Pass | 현재 `.claude/agents/admin-dev.md`의 anti-FSD/legacy path, 활성 FEAT-10 old area/flat 계획 경로를 검출; 새 FSD/admin agent anchor, exact area, gate-local hint, GET action test/4-owner 후속 anchor를 완료 parser에 추가 |
| operational guidance semantic audit | Blocker resolved in proposal | path anchor만 갱신하면 old script/test count, old runner, “DB/외부 I/O 테스트 불가”, Core-only reporting import 0 설명이 Full에서도 남을 수 있었음. 선택 scope의 analytics/test-typing/runtime contract와 CLAUDE actual test-set 비교를 Phase 7A/parser/DoD에 추가 |
| active-vs-historical path classification probe | Pass | CLAUDE/admin-dev/remote/active FEAT-10은 destination update 대상으로, FEAT-03/07/09 plan·PROJECT_BOARD 완료 행·completed proposals는 historical keep으로 분리; live locator 방치와 audit 일괄 치환을 모두 금지 |
| concurrent HEAD/worktree drift classification probe | Pass after restart | 이전 clean anchor `cd0f67e` 뒤 `d89b2a4`가 FEAT-10 계획/board `검토대기`를 만들고 `5233907`이 계획 결함 3개, `5c7843f`가 `since`/`created_at` 등 4개, 최신 `2eb1c19`가 raw-CDN 카피 모순 보정과 board 검증 기록을 커밋했음을 확인. 각 drift마다 gate를 재시작했고 `apps/admin/src`는 계속 62-file 동일 path/content |
| FEAT-10 source-presence probe | Pass | 계획의 신규 6개가 authoritative `apps/admin/src`에는 0개이고 source path/content hash가 이전 62-file 기준선과 동일함을 확인. 이전 재검증 중 root-level `.feat10-build/`(66-source partial build clone)과 `.feat10-prop/`(4-file prototype/fuzz)이 일시 존재했지만 최신 HEAD snapshot에는 둘 다 없고 현재 root `.feat10-*`도 0개다. 이후 새 임시 workspace가 나타나면 이름으로 구현 상태를 추정하지 않고 path/type/content/reparse-point를 검사해 authoritative tree와 분리하며 삭제·복사·병합하지 않는다. |
| FEAT-10 FSD boundary probe | Blocker resolved in proposal | `gateNextActionHint`를 run-command model과 gate UI가 공유하는 flat 설계를 그대로 이동하면 peer-feature import가 됨을 확인; gate descriptor 소유로 분리하고 progress action/model/UI는 run-command slice에 모으는 exact rebaseline 표 추가 |
| FEAT-10 fetch/test ownership probe | Blocker resolved in proposal | authenticated comments GET이 production fetch owner를 3→4로 늘리지만 FEAT-10 고칠 파일에는 action contract test가 없음. post-FEAT-10 기준선에 `get-pipeline-progress.test.mjs`와 rule 13 exact 4-owner fixture를 함께 요구 |
| FEAT-10 plan-edit readiness probe | Blocker resolved in proposal | `fsd-first` Phase 0가 이미 clean 검증된 FEAT-10 plan을 편집하지만 기존 절차는 새 FSD tree 기준 재검증을 요구하지 않아 stale한 flat-tree 기록으로 구현승인할 수 있었음. Phase 0 historical 표시, Phase 7A INV-1~INV-7 full reconciliation, no-edit final pass, Phase 7C 기록과 DoD를 추가 |
| FEAT-10 raw-CDN copy drift probe | Pass after restart; blocker resolved in proposal | reconciliation 중 plan이 먼저 unstaged로 바뀌어 gate를 재시작했고, 이후 commit `2eb1c19`가 plan 20 additions/10 deletions와 board 1 addition/1 deletion로 이를 종결했다. 현재 plan raw SHA-256은 `2B6D5E26F96CDF8AA378A54F29209567258BA0C17F99B345A11E7B0BC8268952`, 실응답은 `Cache-Control: max-age=300`, `X-Cache: HIT`였으며 authoritative `apps/admin/src` 62-file source는 불변이다. exact copy/test 보존과 final parser·scenario·DoD를 유지 |
| analytics Core/Full scope audit | Blocker resolved in proposal | 현재 `analytics/reporting.ts`는 `name: string`인 local input type을 정의하고 import가 없으며 Phase 2A Core는 이를 behavior-preserving 이동한다. canonical query/reporting type coupling은 Phase 2B Full hardening이므로 Final Artifact Map과 필수 시나리오를 Full-only로 정정 |
| documentation basename mutation probe | Pass | remote에 bare `command-action.ts` 또는 `commit-transition.ts`, admin 지침에 legacy flat-path code span을 남기고 새 anchor만 추가한 mutant를 보강 parser가 거부 |
| completed record deletion mutation probe | Pass | 필수 완료 field를 모두 삭제한 mutant가 기존 placeholder-only 본문 검사를 0 match로 통과함을 재현; 필수 완료/닫힘 field presence·uniqueness·value 검증으로 보강 |
| completed record `N/A` mutation probe | Pass | 정상 완료 fixture는 통과하고 활성 완료 field의 plain `N/A`, 비활성 닫힘 block의 임의 추가 `N/A`, TODO, 필수 field 삭제 mutant는 모두 새 lifecycle parser가 거부 |
| proposal fenced JSON parse | Pass | 들여쓴 fence를 포함한 exact package scripts/`tsconfig.test.json` 2개 block 모두 valid JSON |
| proposal PowerShell AST parse | Pass | 들여쓴 Phase 0 lock transaction을 포함한 PowerShell fence 9개 모두 parser error 0; exact path-set/lifecycle semantic probe 별도 통과 |
| Windows PowerShell 5.1 lockfile parser probe | Original failed; replacement Pass | lockfile 전체 `ConvertFrom-Json`은 현재 파일에서 실패함을 재현했고, `node.exe -` stdin `JSON.parse`/normalized digest와 small-entry 변환은 통과 |
| `node --version` | Pass: `v22.13.1` | module mock 최소 버전 충족 |
| `node --import tsx --experimental-test-module-mocks --test "src/**/*.test.mjs"` | Pass | `apps/admin` 기준 기존 95 tests, 26 suites, 0 fail |
| alias/module-mock action probe | Pass | `~/auth/guard`, `~/env` mock 후 missing-token failure와 외부 호출 0회 |
| `server-only`/Sentry module-mock probe | Pass | `mock.module("server-only", { namedExports: {} })`를 subject import 전에 등록해 현재 telemetry module import 성공 |
| existing `.test.mjs` Full-options typecheck probe | Fail: 108 errors / 6 files | manifest 범위 `^5.8.2`가 아니라 lock/runtime TypeScript 5.9.3으로 재실행해 같은 파일별·코드별 108 errors를 재현. `@types/node`의 module-mock 선언은 해석되지만 strict/noUncheckedIndexedAccess가 fixture/index/find narrowing 부족을 검출. Full Phase 7B에 파일별 수정과 0-error gate를 추가했으며 Core gate에는 해당하지 않음 |
| current `.next` route manifest inspection | Stale artifact excluded | source에는 `/pipeline`이 있으나 manifest에는 없어 final build 산출물로 재검증 필요 |
| `npm.cmd run verify:fsd:test -w apps/admin` | Pass | 11 boundary rule fixtures, 0 fail |
| `npm.cmd run verify:fsd -w apps/admin` | Pass | final FSD tree의 migration mode 통과 |
| `npm.cmd run verify:fsd:final -w apps/admin` | Pass | legacy/public entry/runtime effect final mode 통과 |
| `npm.cmd run check -w apps/admin` | Pass | boundary fixture + migration boundary + ESLint + production typecheck 통과 |
| safe `npm.cmd run build -w apps/admin` | Pass | Sentry upload disabled, route/client-server/Edge graph 포함 production build 성공 |
| route/auth/manual smoke | Pass | generated manifest와 local production HTTP smoke에서 public/protected/robots 계약 확인 |
| live GitHub/Sentry write | Intentionally not run | mock 검증이 기본; 별도 승인 필요 |

## Risks and Rollback

잔여 리스크:

- App Router route group/layout 이동은 URL을 바꾸지 않지만 layout preservation 때문에 auth 검사를 잘못 중앙화할 위험이 있다. page guard를 의도적 중복으로 유지한다.
- barrel export가 server/client graph를 넓힐 수 있다. root public API와 entity server `api` entry를 분리한다.
- named export만 사용해도 feature action, entity server query, Edge config를 잘못된 root에서 재수출하거나 public entry에 directive를 붙이면 runtime graph가 넓어질 수 있다. rule 11은 export origin과 directive를 함께 판정한다.
- query mock만으로는 사용되지 않는 non-owner/other-model DB read·mutation helper, 다른 파일의 native/browser network call이나 Sentry direct import를 닫지 못한다. rule 12/13이 `db` provenance와 DB/network/Sentry exact owner를 정적으로 제한하고, contract test가 허용 owner의 실제 method/body/count/call order를 검증한다.
- FEAT-10과 migration을 병행하면 `briefing`/page/gate 파일의 behavior edit와 move가 교차하고 62-row mapping, test baseline, fetch owner gate가 동시에 stale해진다. `execution-order`와 actual source-presence gate로 한 작업만 진행한다.
- FEAT-10의 `gateNextActionHint`를 run-command slice에 둔 채 gate UI가 가져가면 peer feature 결합이 생긴다. gate transition descriptor가 hint를 소유하고 두 feature는 서로 import하지 않는다.
- FEAT-10 plan의 커밋된 raw-CDN 지연/카피 계약을 FSD 경로 치환 중 누락하면 “누르라는 버튼이 캐시 동안 비활성”인 모순을 되살릴 수 있다. exact copy/test anchors를 재기준화 뒤 검사하고, 향후 새 pre-existing diff가 있으면 종결 전 중단한다.
- `fsd-first`가 FEAT-10 계획의 경로·import·test owner를 편집한 뒤 기존 검토 기록을 그대로 현재 clean 증거로 취급하면 최종 FSD public API와 맞지 않는 계획을 곧바로 구현승인할 수 있다. 기존 기록은 historical로 남기고 최종 tree 기준 full reconciliation/no-edit final pass를 별도 완료 gate로 둔다.
- FEAT-10 progress polling은 auth/session/network/JSON 실패에서 마지막 성공 pill이 얼어붙을 수 있는 high-risk read 경계다. plan의 순수 test만으로 대체하지 않고 action mock contract와 timer cleanup/error manual smoke를 별도 요구한다.
- reject discard는 최신 보드 항목 블록을 제거하고 runtime undo가 없다. inline 확인, exact-block test, SHA 잠금, Git history 복구 경로를 유지하며 `TASK_BACKLOG.md`와 과거 이력 행은 자동 정리하지 않는다.
- module mock은 Node 22.13.1에서 실제 suite/alias probe가 통과했지만 여전히 experimental API다. Node를 `>=22.3`으로 유지하고 runner flag와 import-before-mock 순서를 test script/rules로 고정한다.
- `.mjs` test typing은 설치된 `@types/node` 20.19.24에서 module-mock API를 해석하지만 현재 6개 파일/108개 strict 오류가 있다. Full Phase 7B에서 named-local narrowing과 JSDoc으로 해소하고, 새 오류가 생겨도 production/test strict 설정을 약화하지 않는다.
- board diagnostics는 새로운 operator-visible behavior다. 구조 이동과 분리하고 기존 parsed sections equality를 요구한다.
- Core/Full을 혼합하면 파일 수와 완료 의미가 모호해진다. exact approval, Full-only 존재/부재 검사, scope별 DoD로 차단한다.
- 많은 `git mv`와 OneDrive/Windows 경로 환경에서 case-only rename이 불안정할 수 있다. 임시 파일명을 거치는 작은 checkpoint를 사용한다.
- migration 중간에 기존 `admin-dev`를 디스패치하면 anti-FSD standing rule과 제한된 수정 권한 때문에 새 tree를 거부하거나 필요한 package/ADR/운영 문서를 건드리지 못한다. repository-level executor가 전 phase를 수행하고 Phase 7A 운영 지침 전환 전에는 `admin-dev`를 재투입하지 않는다.
- 완료 항목의 plan/board path와 live guidance/backlog locator를 같은 방식으로 일괄 치환하면 audit trail을 훼손하거나 반대로 활성 FEAT-10을 stale하게 남길 수 있다. 역사 기록은 보존하고 active guidance와 active locator만 parser로 갱신한다.
- build가 환경 변수 또는 기존 lint 설정 때문에 실패할 수 있다. Node wrapper의 자식 `env`에 빈 token property를 유지해 dotenv 재주입과 upload를 차단하고, 동일 command를 refactor 전 commit에서도 확인해 기존 실패인지 기록한다.
- Full CSS cleanup에서 `--picked` 값만 지우면 `--color-picked` alias가 dangling 상태가 되고, animation 이름만 지우면 keyframes/utility 한쪽이 남을 수 있다. scope parser가 Core의 exact definition counts와 Full의 family 이름 0을 확인한다.
- 이전 `.next`는 `/pipeline`이 빠진 stale artifact였으나 최종 safe build로 교체했다. 완료 증거는 해당 build 직후 app/routes/middleware manifest와 local production HTTP smoke만 사용한다.

롤백 방법:

1. Phase별 독립 commit/checkpoint를 만든다. command와 gate feature는 각각 별도 commit으로 둔다.
2. 실패한 phase만 역순 revert한다. `git reset --hard`나 worktree 전체 복구는 사용하지 않는다.
3. route group, auth foundation, feature moves를 서로 다른 commit으로 두어 auth 문제 시 route group만 되돌릴 수 있게 한다.
4. behavior hardening(B/C 단계)은 move(A 단계)와 별도 commit이므로 기능 변경만 선택적으로 revert할 수 있다.
5. schema/data migration이 없으므로 데이터 롤백은 필요 없다.
6. legacy 폴더는 전체 검증 전까지 삭제하지 않으며, 삭제 후 문제는 해당 cleanup commit revert로 복구한다.
7. live external write를 검증에 사용하지 않으므로 롤백해야 할 GitHub/Sentry 운영 데이터는 생성하지 않는다.
8. 운영에서 reject discard를 잘못 실행한 경우 앱 코드 롤백이 보드 내용을 복구하지 않으므로 해당 board commit을 별도로 revert한다.

## Reconciliation Evidence

2026-08-17에 이 proposal을 HEAD `0c5e42a5b3352faa3c3cdeee56ead6745acf972c`의 최신 코드·활성 계획과 다시 대조했다. 이 절은 설계 lens 결과와 별개의 codebase reconciliation 기록이다.

### source bundle과 inventory

| Evidence | 확인 대상 | 결과 |
| --- | --- | --- |
| REC-E01 | 이 proposal 전체와 직접 참조한 web FSD guide, `docs/plans/FEAT-03.md`/`FEAT-07.md`/`FEAT-09.md`/**`FEAT-10.md`**, FEAT-10이 trade-off로 직접 인용한 `FEAT-08.md`, `.claude/agents/admin-dev.md`, 중첩 `remote-agent-pipeline-generalization.md`, runtime `PROJECT_BOARD.md`/`TASK_BACKLOG.md`, 두 2026-08-02 completed proposal | historical “화면 2개/no FSD” 전제, command/pixel/reject 계획·완료 기록, 운영 지침, 활성 FEAT-10의 실제 계획/검증/locator, 원격 pipeline 계약과 현재 코드가 같은지 확인 |
| REC-E02 | `apps/admin/src` 전체 path/import/export/directive/I/O inventory | 최신 reconciled HEAD의 FEAT-09를 포함한 actual 62개와 mapping table 62개가 정확히 일치; missing/stale 0; 4,934 physical / 4,450 nonblank lines |
| REC-E03 | 모든 mapping destination과 현재 tree | duplicate destination 0, unrelated existing target collision 0 |
| REC-E04 | `package.json`, `package-lock.json`, installed package metadata, tsconfig, Next/Sentry config, middleware, env entry, test runner | Next 15.5.7, React manifest `^19.0.0`/lock·runtime 19.2.0, TypeScript manifest `^5.8.2`/lock·runtime 5.9.3, Node 22.13.1과 script/runtime 제약 확인 |
| REC-E05 | `@repo/db` root exports와 analytics contract | canonical event/funnel/type provenance와 admin read-only query 확인 |
| REC-E06 | auth/page/action/query/Sentry 호출 경로 | DB read, GitHub raw GET, issue POST, forward/reject contents GET/PUT, Sentry capture/flush 외 다른 I/O 없음 |
| REC-E07 | 현재 test runner/type probe | 95/95 runtime pass, 26 suites, latest production typecheck pass; 신규 reject 순수 계층 26개가 suite와 독립 probe에서 통과. 제안한 Full-options test typing은 별도 실패로 분리 |
| REC-E08 | 현재 `.next` manifests | source `/pipeline`과 불일치하는 stale 산출물로 판정해 readiness 증거에서 제외 |
| REC-E09 | 목표 tree와 mapping destination의 독립 계산 | mapping target 62개 + Core 신규 22개의 exact Core 84, Full-only 5개를 합친 exact Full 89; duplicate/missing/unexpected 0 |
| REC-E10 | Windows PowerShell 5.1에서 proposal의 parser/inline command 실행 가능성 | package-lock 전체 `ConvertFrom-Json` 실패를 재현; Node stdin JSON parse/digest, small-entry parse, route/middleware JSON parse, `Invoke-Checked`, `server-only` mock은 통과 |
| REC-E11 | source line-count와 safe-build environment 의미 | admin/web physical·nonblank line을 전 파일에서 재계산; .NET empty process value는 변수 삭제, Node child `env` empty property는 `cmd.exe`/dotenv를 거쳐도 보존됨을 probe로 확인 |
| REC-E12 | web FSD guide와 실제 `apps/web/src/fsd/pages/*/ui/_component` tree | 분리된 page-private UI는 `_component`에 두고 root에서 재수출하지 않는 convention을 확인; pipeline private UI 목적지에 반영 |
| REC-E13 | 기존 subset+file-count residual 검사의 반례 | Core 기대 집합에서 `app/page.tsx`를 빼고 `stray.ts`를 더한 동일-count mutant가 기존 검사를 통과함을 재현; 새 exact set은 missing/unexpected를 각각 검출 |
| REC-E14 | completed placeholder 검사의 실제 정규식 의미 | 광범위 검색은 pending 원문에서 17건이며 검증 코드 자신의 regex literal도 매치; field-only 검색은 실제 11개만 잡고 simulated fill 후 0건임을 확인 |
| REC-E15 | public API 구조 우회 반례 | pipeline slice root의 wildcard re-export는 기존 residual pattern 3개, 경계 rule 1~9, exact path-set을 바꾸지 않으면서 private UI를 외부에 노출할 수 있음을 확인 |
| REC-E16 | completed 실행 기록 삭제 반례 | 완료 기록의 필수 list field를 모두 삭제해도 기존 placeholder-only body 검사는 0 match로 통과함을 확인 |
| REC-E17 | reconciliation 도중 순차 유입된 뒤 커밋된 FEAT-09 code/doc change | 1차로 `ui/pipeline-reject.tsx` 신규와 transition/action/page 수정 때문에 inventory 61→62 및 forward-only→forward/reject 계약 변화를 반영했고, 2차로 `transitions.test.mjs` +26 tests와 board 완료/backlog 제거, 3차로 CLAUDE/중첩 remote proposal 문서 보정을 반영한 뒤 최신 HEAD 기준으로 전체 gate를 다시 시작 |
| REC-E18 | 제안한 Full `tsconfig.test.json`과 동일한 strict/noUncheckedIndexedAccess test-entry probe | runtime 95 tests는 통과하지만 6개 기존 `.test.mjs`에서 108 type errors를 재현; 파일별/오류 코드별 수를 고정하고 설정 완화 없는 수정 전략을 도출 |
| REC-E19 | completed lifecycle `N/A` mutation fixture | 정상 completed record는 통과하고 필수 field 삭제/TODO/plain `N/A`와 비활성 branch의 임의 추가 `N/A`는 각각 명시적 오류로 거부됨을 actual PowerShell fence로 확인 |
| REC-E20 | 중첩 `remote-agent-pipeline-generalization.md` 전체와 최신 문서 diff | reject 세 편집을 열거하지만 FEAT-08 시절 “이 경로는 status만 바꿔라” 문구와 legacy action path가 남아 있음을 확인; 현재 코드의 status/result/block 계약과 충돌 |
| REC-E21 | `.claude/agents/admin-dev.md` 전체와 현재 executor 권한 | 운영 에이전트가 anti-FSD/flat path를 명시하고 package/lock/ADR/CLAUDE/자기 지침 수정과 `npm install`을 금지하므로 기존 standing authority만으로 proposal 전체를 실행할 수 없음을 확인 |
| REC-E22 | `TASK_BACKLOG.md`의 활성 FEAT-10 block과 PM/admin-dev area 사용 규칙 | FEAT-10의 `apps/admin/src/pipeline + apps/admin/src/ui`가 migration 후 사라지는 live locator이며 completed board 행의 옛 path와 달리 갱신 대상임을 확인 |
| REC-E23 | admin/remote 문서 검증 mutation probe | 새 FSD anchor만 추가한 채 CLAUDE의 legacy code span 또는 remote의 bare `command-action.ts`를 남기는 fixture가 기존 검증을 통과함을 재현; full/bare negative parser와 admin-dev destination check로 차단 |
| REC-E24 | proposal code-fence inventory와 실제 AST/JSON 대상 | 열 0과 목록 안 들여쓴 fence를 모두 세면 text 1개, PowerShell 9개, JSON 2개다. indent-tolerant parser로 PowerShell AST error 0과 JSON parse error 0을 확인 |
| REC-E25 | public entry requirement와 planned boundary rule의 독립 closure | wildcard/private UI만 막는 기존 rule 10은 named action/query/Edge re-export와 root directive를 검출하지 못함을 확인; origin/directive-aware rule 11, Core analytics empty root, phase/final/DoD assertions로 폐쇄 |
| REC-E26 | admin production DB/fetch AST inventory | 현재 `db.analyticsEvent.findMany` 1 owner와 pipeline fetch 3 owner만 존재하고 mutation/client fetch는 0. 허용 owner 밖 unused effect mutant가 behavior test를 우회하므로 rule 12/13과 owner contract test의 이중 검증을 추가 |
| REC-E27 | `globals.css` picked/clipcard definition closure와 table/briefing/observability scope surface | picked family가 alias 1 + theme values 2 + 관련 주석, clipcard family가 keyframes/utility 쌍임을 전수 확인; Core exact retention과 Full family 전체 부재를 parser로 분기 검증 |
| REC-E28 | 이전 reconciliation 중 `52e3e1a` → `cd0f67e` HEAD drift와 exact path diff | 변경은 당시 `PROJECT_BOARD.md`의 활성 FEAT-10 추가뿐이었고 source/package/DB 계약은 불변이어서 구현·계획을 revalidation trigger로 올렸음 |
| REC-E29 | 이번 재검증의 `cd0f67e` → `d89b2a4` → `5233907` → `5c7843f` → `2eb1c19` drift | FEAT-10 계획 생성, board `검토대기`, 계획 결함 3개, `since`/payload/order/redirect 설명 4개 보정, raw-CDN 카피 모순 보정과 board 기록이 순차 유입됨. `apps/admin/src` 62-file path/content는 불변이지만 proposal의 blocker/source-bundle/후속 copy 계약 판단은 stale해져 각 변화 뒤 full gate를 재시작 |
| REC-E30 | 최신 saved `docs/plans/FEAT-10.md` 전체와 board/backlog | 신규 6·수정 5, 15초 authenticated comments GET, FIFO progress, `created_at` 창 필터, gate hint를 확인. 계획 자체의 최신 검증은 prototype/조립본을 다루며 아직 authoritative `apps/admin/src` 구현은 0개임을 분리 |
| REC-E31 | FEAT-10 계획을 현재 FSD layer matrix에 투영한 import graph | `run-plan.ts` 전체를 run-command feature에 두면 gate UI→run-command peer import가 생김. gate hint를 transition descriptor로 이동하고 run plan/progress/action/control만 command feature에 모으는 목적지로 폐쇄 |
| REC-E32 | production fetch owner/test delta 산식 | FEAT-10 progress GET으로 owner 3→4, current 62→planned 68. 기존 Core additions 22에 GET action contract test 1을 더한 post-FEAT10 예상 Core 91/Full 96을 계산했으며 actual implementation full inventory 없이는 확정값으로 쓰지 않음 |
| REC-E33 | 최신 worktree dependency 분류 | 사용자 변경 `apps/web/.claude/settings.local.json`은 source bundle과 무관해 보존·제외. 재검증 중 `.feat10-check/`·`.feat10-fresh/`·`.feat10-build/`·`.feat10-prop/`·`.feat10-r1`·`eslint-full.err`와 FEAT-10 문구 전파를 점검한 3,048-byte 일반 텍스트 `scan.txt`가 일시 출현·소멸했다. 각각 path/type/content/reparse-point를 확인해 authoritative `apps/admin/src`/saved plan/board 밖의 임시 artifact로 분류했고 최종 판정에 의존하지 않았으며, 이 reconciliation은 삭제·수정하지 않았다. 최신 snapshot에는 root `.feat10-*`와 `scan.txt`가 모두 0개이고 source bundle 외 사용자 변경은 web local settings뿐이다. |
| REC-E34 | FEAT-10 `since` semantics 보정 | REST `since`가 last-updated 기준이라 오래된 수정 코멘트가 재진입할 수 있어 계획이 `created_at >= windowStart` 필터를 추가함. FSD 목적지/파일 산식은 불변이나 향후 GET action contract test에 창 밖 수정 코멘트 제외와 invalid timestamp 계약을 추가 |
| REC-E35 | `fsd-first`의 FEAT-10 plan edit와 기존 clean-pass 기록의 수명 | 현재 FEAT-10은 flat tree 기준 반복 검증 뒤 `검토대기`지만 Phase 0가 목적지·import·test owner를 수정하면 그 clean 결과는 최신 source bundle의 준비 증거가 아님. 최종 FSD tree가 생긴 Phase 7A 이후 plan 전체를 다시 reconcile하고 no-edit final pass를 요구해야 함을 확인 |
| REC-E36 | TypeScript manifest/lock/runtime identity와 Full-options compiler probe | `package.json`은 `^5.8.2` 범위를 선언하지만 `package-lock.json`과 `node_modules/typescript/package.json`은 5.9.3으로 일치함을 확인. TypeScript compiler API로 proposal의 exact Full test config를 구성해 5.9.3에서 기존 6파일/108-error 분포를 그대로 재현했으므로 dependency 변경 없이 실제 실행 기준만 정정 |
| REC-E37 | analytics Core/Full type-coupling scope | 현재 `apps/admin/src/analytics/reporting.ts`는 import 없이 local `AnalyticsReportEvent.name: string`을 사용한다. Phase 2A Core는 reporting을 behavior-preserving 이동하고 entity root도 `export {};`로 유지하지만 Phase 2B Full만 `AnalyticsEventName` type import와 query-boundary drift guard를 도입하므로 canonical coupling 검증은 Full-only임을 확인 |
| REC-E38 | `apps/admin/CLAUDE.md`와 `.claude/agents/admin-dev.md`의 경로 외 semantic 계약 | current CLAUDE는 old seven-script inventory, 8 files/95 tests, production tsconfig 밖 `.mjs`만 설명하고 두 문서는 reporting import 0을 고정한다. admin-dev는 old runner에서 rendering·DB·external I/O를 덮을 수 없다고 명시한다. Core module mocks와 Full type-only/test typing 계획 뒤에는 scope별로 거짓이 되므로 경로 anchor 검사만으로 부족함을 확인 |
| REC-E39 | global/browser network bypass inventory | 현재 production은 bare fetch 4 calls/3 owner이고 client browser primitive는 0이지만 기존 rule 13 문구는 `window.fetch`, `self.fetch`, global alias/non-literal computed와 `XMLHttpRequest`/`sendBeacon`/WebSocket/EventSource를 명시적으로 닫지 않아 동일 외부 효과를 새 owner에서 만들 수 있음을 확인 |
| REC-E40 | `@repo/db` export와 admin runtime DB provenance | package public entry는 singleton `db`를 export하고 현재 admin runtime DB call은 `analytics/queries.ts`의 `db.analyticsEvent.findMany` 한 site뿐이다. 기존 rule 12의 read-allowlist는 non-owner/other-model read와 namespace/dynamic/re-export alias, generated/client deep import를 막지 않아 exact owner/model/method gate가 필요함을 확인 |
| REC-E41 | admin Sentry import/side-effect owner inventory | `src`의 `@sentry/nextjs` direct import는 `instrumentation.ts`, `sentry.server.config.ts`, `observability/report-error.ts` exact 3개이고 `next.config.js`는 safe-build가 별도로 통제한다. 기존 boundary는 client가 shared wrapper를 value import하는 것만 막아 feature/page의 direct SDK import는 검출하지 못함을 확인 |
| REC-E42 | 커밋된 FEAT-10 raw-board cache/copy 계약 | HEAD `2eb1c19`가 `docs/plans/FEAT-10.md`와 `PROJECT_BOARD.md`의 raw-CDN 모순 보정을 커밋했고 현재 두 파일은 clean이다. plan raw SHA-256은 `2B6D5E26F96CDF8AA378A54F29209567258BA0C17F99B345A11E7B0BC8268952`; exact raw board URL 응답은 `Cache-Control: max-age=300`, `X-Cache: HIT`, `Source-Age: 7`이었다. gate hint의 `보드에 반영되면`, disabled description의 최대 5분, 대응 test 명세가 일치하고 authoritative `apps/admin/src` 62-file path/content는 불변임을 확인 |
| REC-E43 | `2eb1c19` → `0c5e42a` FEAT-10 문서 전용 drift | `7716b6b`, `0a2b9ea`, `5d9a9a4`, `0c5e42a`는 plan/board만 바꿔 template 정합성, 측정 귀속, 0분 표시, 채널 범위와 29개 mutation-test 명세를 보강했다. 재검증 전 plan SHA-256은 `59923D7FF58CB78A3DDB5AF7C53AC63B5ECB2CEAEC7321722811041E7F486F0E`, board SHA-256은 `F1B30C9AD2A09D9AA822F55A081AAABCCEBA94C2D4324E91B533AFA59C619FA0`이며 source 62개, DB/fetch/Sentry owner, package/config는 불변이다. 따라서 mapping은 유지하고 FEAT-10 재기준화 입력 계약만 확장했다. |
| REC-E44 | 완료된 Core tree 기준 FEAT-10 post-FSD reconciliation | actual source 84개와 fetch owner 3개를 입력으로 최신 계획의 신규 7개·수정 10개, 구현 전 신규 0개, 구현 후 예상 source 91개를 독립 확인했다. stale flat 경로, public entry/boundary 변경 누락, malformed GitHub response 부분 집계, polling race와 `apps/admin/scripts/**` 범위 누락을 수정하고 전체 gate를 재시작했다. 최종 계획 SHA-256은 `23B387A37D2CA669A44B633B33F16098D6DEE7716F0AEA58E78CEDA5ABFCD181`이며 마지막 INV-1~INV-7 pass는 문서 수정 0건이다. |

### reconciliation에서 해소한 blocker

| ID | 기존 문제 | 문서 반영 |
| --- | --- | --- |
| REC-B01 | 구조 이동과 behavior hardening 승인 범위 혼재 | exact Core/Full approval, phase, file count, DoD 분리 |
| REC-B02 | Phase 1부터 요구한 boundary script를 Phase 7에서 생성 | script/rule test를 Phase 0 선행 gate로 이동 |
| REC-B03 | board diagnostics가 `parseBoard`/query API를 깨뜨릴 수 있음 | additive API와 기존 signature/structural equality 고정 |
| REC-B04 | protected layout의 정확한 body와 page body 보존이 모호 | exact layout JSX, page-first guard, 기존 `main` wrapper 명시 |
| REC-B05 | build가 root token으로 Sentry upload를 일으킬 수 있음 | Node wrapper의 자식 `env`에 empty token property를 유지하는 safe build 명령 추가 |
| REC-B06 | no-match가 정상인 `rg` 명령이 exit 1로 pipeline을 실패시킴 | exit 0/1/>1을 구분하는 helper 추가 |
| REC-B07 | module mock/test typing feasibility가 추정 상태 | 실제 Node 22.13.1 full suite와 alias mock을 통과시켰고, test typing은 API 해석 가능하되 strict source 오류가 남는다는 결과를 분리 반영 |
| REC-B08 | package/config/route/generated artifact 판정 기준 부재 | parser-backed exact assertions와 Final Artifact Resolution Map 추가 |
| REC-B09 | gate/analytics/observability Full 계약이 구현자 해석에 의존 | exact types, constants, call order, failure semantics 고정 |
| REC-B10 | ADR proposal 승인과 acceptance 순서가 모호 | exact metadata와 ADR accepted 중단 조건 분리 |
| REC-B11 | DB query, board fetch, Sentry helper 검증을 요구하면서 소유 test 파일이 없음 | Core query 2개와 telemetry helper test를 목표 tree/Phase 0에 추가 |
| REC-B12 | 현재 PowerShell 5.1이 `package-lock.json` 전체 `ConvertFrom-Json`을 파싱하지 못하고 dependency 무변경 주장도 검증하지 못함 | tested Node stdin JSON parser와 engine 제외 normalized SHA-256 전후 비교로 교체; final에는 admin entry dependency/engine exact 비교 추가 |
| REC-B13 | exact 승인·accepted ADR·ADR index·`CLAUDE.md` 전환과 completed proposal destination이 DoD에만 있고 실행 가능한 검증이 없음 | flat front matter 중복-key/scalar parser, ADR/index/CLAUDE assertion, 이동 후 active 부재/completed 단일 존재·metadata·TBD 검증 추가 |
| REC-B14 | `server-only` subject의 신규 Node test가 side-effect import를 어떻게 처리할지 명시되지 않음 | 실제 runner probe를 통과한 empty named-export module mock을 공통 규칙과 query/telemetry test에 명시 |
| REC-B15 | Windows의 `[Environment]::SetEnvironmentVariable(..., "", "Process")`가 변수를 삭제해 root dotenv token을 다시 읽을 수 있음 | PowerShell process를 건드리지 않고 Node→`cmd.exe` 자식 환경에 empty property를 보존하는 tested wrapper로 교체 |
| REC-B16 | 최종 `src` 검사가 일부 필수 파일 16개와 총수만 확인해 누락 파일을 임의 파일로 대체해도 통과 | mapping table 62개를 parser로 읽고 Core 신규 22개/Full 신규 5개와 합친 실제 전체 경로 집합의 missing/unexpected를 case-sensitive 비교하도록 교체 |
| REC-B17 | completed lifecycle의 광범위 `TBD|TODO` 검색이 검증 코드 자체를 매치해 항상 실패하고, 비활성 완료/닫힘 branch 처리도 불명확 | placeholder 값인 list field만 검사하고 비활성 branch를 `N/A (completed|closed)`로 종결하도록 lifecycle·Phase 7C·기록 지침을 일치시킴 |
| REC-B18 | 직접 참조한 web FSD 가이드와 실제 web tree는 page-private UI를 `ui/_component`에 두지만 제안 tree는 `ui/` 직속에 두고 Full banner를 public export로 계획 | pipeline private UI 5개와 Full test/banner를 `_component`로 이동하고 `PipelineBriefing`이 private banner를 소유하며 root 미수출하도록 tree/mapping/public API/phase를 동기화 |
| REC-B19 | private UI 미수출 요구가 있었지만 root wildcard/direct/aliased/transitive re-export를 막는 boundary rule과 final negative check가 없어 위반한 구현도 완료 판정을 통과 가능 | explicit named export 원칙, AST binding provenance rule 10/fail fixture, wildcard와 pipeline private symbol 전체 목록 negative check를 implementation/verification/DoD에 전파 |
| REC-B20 | completed lifecycle이 placeholder 존재만 검사해 필수 실행 기록 field 삭제를 정상으로 오인 | completion/closure section과 두 record block, 필수 field 단일 존재, 완료 실제 값/front matter date 일치, 비활성 닫힘 field exact `N/A (completed)`를 parser로 검증 |
| REC-B21 | 검증 중 FEAT-09 구현과 테스트/보드/중첩 pipeline 문서가 순차 유입되어 61-file/69-test/forward-only proposal이 최신 codebase를 누락 | FEAT-09 plan·remote pipeline proposal·board·backlog를 source bundle에 추가하고 62-file mapping, 95-test 기준선, 84/89 exact target, reject UI/model/action/test provenance, runtime/artifact/DoD/rollback 검증을 전 구간에 반영 |
| REC-B22 | Full test-source typecheck가 현재 통과한다고 기록했지만 exact strict 설정은 6개 파일/108 errors로 실패 | Phase 7B에 파일별 오류 수, JSDoc/named-local narrowing 방식, suppression·설정 완화 금지, `test:types` 0-error와 runtime 재검증을 실행 가능한 작업으로 추가하고 결과/리스크/증거를 정정 |
| REC-B23 | completed 필수 field의 plain `N/A`와 임의 추가 field의 `N/A`가 placeholder 검사를 우회 | 활성 완료 field의 모든 `N/A` prefix를 거부하고 required inactive closed field만 exact `N/A (completed)`를 허용하도록 parser를 보강하고 semantic fixture를 추가 |
| REC-B24 | lockfile normalized digest가 허용 밖 drift를 검출해도 실패 시 이미 변경된 lockfile을 남김 | 시작 시 clean 확인 뒤 exact bytes를 저장하고 install/engine/digest 검증 실패를 catch해 원본 bytes를 복원하는 transaction으로 변경 |
| REC-B25 | 중첩 remote pipeline proposal이 FEAT-09 edit를 나열하면서도 “status만” 계약과 이동 전 action 경로를 유지 | Phase 7A/Affected Files/Final Artifact Map에 문서 동기화를 포함하고 legacy phrase/path 부재와 새 command/gate feature 경로·`status/result/block` anchor를 parser로 검증 |
| REC-B26 | 실제 admin 작업 에이전트 지침이 “admin은 FSD가 아니다”와 flat path를 계속 강제하지만 proposal source/affected/verification에 없었음 | `.claude/agents/admin-dev.md`를 source bundle/Affected/Phase 7A/final parser/DoD에 추가하고 user gate·DB read-only 규칙은 보존한 채 FSD/public API/test gate만 전환 |
| REC-B27 | 활성 FEAT-10 backlog `area`가 삭제될 `src/pipeline + src/ui`를 가리켜 migration 직후 PM/admin-dev의 탐색을 잘못 시작시킴 | FEAT-10이 여전히 active일 때 exact 새 page/command/gate/entity 경로로 갱신하고 해당 block을 구조적으로 검증; 이미 완료·제거됐으면 non-applicable 처리 |
| REC-B28 | 문서 검증이 remote full path 1개와 CLAUDE phrase 3개만 확인해 bare `command-action.ts`, `commit-transition.ts`, 다른 legacy code span을 남겨도 통과 | 두 admin 지침의 legacy code-span regex, remote full/bare action 금지 목록, 새 anchor 검증을 추가 |
| REC-B29 | proposal owner인 `admin-dev`의 standing authority가 package/lock/ADR/CLAUDE/agent 지침 수정과 install을 금지해 실행 계획과 충돌 | owner와 executor authority를 분리하고 repository-level 또는 명시적 task-specific executor를 Phase 0 중단 조건으로 추가; Phase 7A 전까지 기존 agent 재디스패치 금지 |
| REC-B30 | source bundle의 완료 plan/board 옛 경로와 활성 guidance/backlog 경로를 구분하지 않으면 audit trail을 일괄 치환하거나 live locator를 방치할 수 있음 | FEAT-03/07/09·board 완료 행·completed proposal은 historical keep, CLAUDE/admin-dev/remote/active FEAT-10만 migration destination update로 분류해 Scope/Phase 7A/verification에 전파 |
| REC-B31 | 열 0에서 시작하는 fence만 세는 reconciliation audit가 목록 안의 Phase 0 PowerShell과 Phase 7A/7B JSON을 누락해 8/0으로 오판 가능 | optional indentation을 허용하는 fence inventory로 바꾸고 실제 PowerShell 9개/JSON 2개를 각각 AST/JSON parser로 검증 |
| REC-B32 | public API 요구가 wildcard/page-private leak만 자동 검사해 named Server Action, entity server query, Edge config 재수출과 public entry directive를 남겨도 완료 판정을 통과 가능; Core analytics entity root 내용도 미정 | rule 11의 directive/origin provenance matrix를 추가하고 Core analytics root를 exact `export {};`로 고정해 public table, Phase 0/2/7, artifact map, verification, DoD에 전파 |
| REC-B33 | Full CSS cleanup이 `--picked`와 animation 이름만 지시해 `--color-picked` alias, light/dark 값, picked-only 주석, keyframes/utility 한쪽이 dangling 상태로 남을 수 있고 Core/Full 분기 검증도 없음 | 두 CSS family의 exact 구성과 table/briefing/observability scope surface를 명시하고 Core definition counts/Full 잔존 0 parser를 artifact/verification/DoD에 추가 |
| REC-B34 | DB read-only와 외부 쓰기 owner가 query/action behavior test에만 의존해 unused aliased mutation helper나 허용 파일 밖 direct/global/aliased fetch·별도 network client를 검출하지 못함 | rule 12로 `@repo/db` binding의 mutation/raw execute/transaction을 금지하고 rule 13으로 production network owner를 final 3개 파일로 제한; 허용 owner contract test와 결합 |
| REC-B35 | 최신 board에서 FEAT-10이 활성화됐는데 pre-execution trigger가 FEAT-09 코드와 board/backlog drift만 열거해, FEAT-10이 같은 pipeline source를 먼저 수정한 경우를 명시적으로 놓침 | active board의 broad area·생성 시점 기록은 보존하고, 활성 FEAT-10 구현·계획 및 그에 따른 `admin/src` path/content 변화를 전체 mapping/runtime/artifact 재검증 조건으로 명시 |
| REC-B36 | FEAT-10 계획이 실제로 생성·검증돼 `검토대기`인데 proposal은 여전히 “현재 구현 blocker 없음”과 62/84/89 단일 기준만 주장해 두 작업의 동시 실행을 허용 | exact `execution-order`, no-concurrency/source-presence gate, `fsd-first`와 `feat10-first`의 서로 다른 시작/재검증 조건을 front matter·Approval·Phase 0·DoD에 추가 |
| REC-B37 | FEAT-10 `run-plan.ts`의 `gateNextActionHint`를 run-command feature로 단순 이동하면 transition-gate UI가 peer feature를 import해 layer rule 2를 위반 | run plan/progress/action/control은 run-command feature, hint는 gate `transitions.ts` descriptor 소유로 분리하는 exact rebaseline 표와 peer-import negative check 추가 |
| REC-B38 | FEAT-10 progress GET이 production fetch owner를 3→4로 늘리지만 이 proposal의 rule 13/DoD는 exact 3만 허용하고 FEAT-10 고칠 파일에는 action contract test가 없음 | post-FEAT10 기준선은 exact 4-owner fixture와 `get-pipeline-progress.test.mjs`를 함께 요구하고 auth/URL/since/header/cache/failure/shape/FIFO 계약을 명시; 예상 Core 91/Full 96 산식 기록 |
| REC-B39 | board status나 root `.feat10-*` 임시 review/assembly/build/prototype snapshot을 actual source로 오인하면 62-row 또는 68-row mapping을 잘못 선택할 수 있음 | 실제 `apps/admin/src` 신규 6개 presence/path/content와 runtime tests로 기준선을 결정하고, 재검증 중 일시 존재했던 `.feat10-build`/`.feat10-prop` 같은 root 임시 workspace는 path/type/content를 분류한 뒤 implementation source에서 제외. 최신 snapshot에는 해당 workspace 0개 |
| REC-B40 | reconciliation 중 FEAT-10 계획이 다시 dirty해졌고 `since`/`created_at` 의미가 바뀌었는데 Phase 0이 active plan을 곧바로 재작성하면 사용자 작업을 덮거나 GET contract를 누락 | pre-existing plan diff 중단 조건, dirty source identity, 수정 코멘트 재진입/invalid timestamp action-test destination을 Phase 0·conditional mapping·evidence에 추가 |
| REC-B41 | `fsd-first`가 FEAT-10 계획을 편집하면서도 이전 flat-tree no-edit clean pass를 무효화하거나 최종 FSD tree 기준 재검증하지 않아 stale plan을 바로 구현승인할 수 있음 | 기존 검증을 historical로 표시하고 plan에 post-FSD full reconciliation/no-edit clean-pass 전 구현 금지를 남기며, Phase 7A에서 INV-1~INV-7 전체 재검증, Phase 7C evidence 기록, artifact map/parser/DoD gate로 전파 |
| REC-B42 | `package.json`의 TypeScript semver 범위 `^5.8.2`를 설치 exact version `5.8.2`로 기록해 실제 boundary parser/typecheck runtime 5.9.3과 검증 근거가 어긋남 | Current State와 REC-E04를 manifest/lock/runtime으로 분리하고 Phase 7B·Verification Results에 5.9.3 재현 근거를 명시. 동일 exact config의 6파일/108-error 분포가 유지됨을 compiler API로 확인해 dependency/version 변경은 하지 않음 |
| REC-B43 | 필수 테스트 표가 canonical analytics query/reporting coupling을 `Both`로 요구해, local `name: string` reporting 경계를 그대로 이동하는 Phase 2A Core 및 Core의 behavior-preserving 범위와 충돌 | 해당 시나리오를 `Full`로 정정하고 Final Artifact Resolution Map·Verification Results·REC-E37에 동일한 Core 보존/Full hardening 경계를 명시. Core는 현재 결과와 query contract를 characterization test로 보존하고 Full만 canonical type coupling과 drift guard를 완료 조건으로 사용 |
| REC-B44 | Phase 7A가 운영 문서의 경로/anti-FSD anchor만 검사해 old script·test count·runner capability와 Core-only reporting import 설명이 구현 뒤에도 남을 수 있음 | 두 문서에 scope별 analytics/test-typing/runtime contract를 exact marker로 기록하고 stale claim을 거부하며, CLAUDE test table을 actual `src/**/*.test.mjs` exact set과 구조 비교하도록 Phase 7A/parser/artifact/DoD를 보강 |
| REC-B45 | rule 13이 `globalThis.fetch` 중심이라 `window.fetch`/`self.fetch`, known-global computed, browser network primitive와 별도 client를 통한 client write가 exact fetch-owner gate를 우회 가능 | global root/alias/destructure/computed fail-closed 분석, browser primitive/network-client deny matrix, mutation fixture와 scenario/DoD를 추가. 새 dependency는 재승인 없이는 금지 |
| REC-B46 | rule 12가 Prisma write만 막고 허용 owner 밖/다른 model의 read와 namespace/dynamic/re-export/deep-import 우회를 허용해 admin DB access surface가 조용히 넓어질 수 있음 | runtime `db` provenance를 exact analytics query owner와 `db.analyticsEvent.findMany`로 제한하고 모든 mutation/raw/transaction/unresolved/deep-import fail fixture를 artifact/scenario/DoD에 전파 |
| REC-B47 | Sentry wrapper의 client import는 막지만 feature/page가 `@sentry/nextjs`를 직접 import해 capture하면 기존 tests/public-boundary gate를 통과 가능 | `src` direct SDK import owner를 instrumentation/server config/shared report wrapper exact 3개로 고정하고 비허용 import mutation fixture, safe-build/contract-test 결합과 final ownership scenario를 추가 |
| REC-B48 | FEAT-10 raw-CDN 지연/카피 변경이 유입되는 동안 Phase 0이 plan을 덮거나, 커밋 뒤 FSD 경로만 치환하면 source/test copy 계약이 유실될 수 있음 | drift 중에는 full gate를 재시작했고 `2eb1c19` 커밋 뒤 current clean 상태로 재기준화. 향후 pre-existing diff 중단 조건과 정확한 두 카피 anchor·대응 test 보존을 Affected Files/Phase 0/7/Final Artifact Map/parser/scenario/DoD/revalidation에 전파 |
| REC-B49 | post-FSD 계획이 최신 tree를 가리켜도 변경표 밖 공개 API·boundary owner와 실패·동시성 의미가 빠지거나 범위 문장이 scripts 변경을 부정할 수 있음 | command feature `index.ts`, boundary script/test를 수정 대상에 포함하고 malformed member fail-closed, latest-request-wins, `src/**` + 앱 전용 boundary scripts 범위를 명시했다. 각 edit 뒤 full gate를 처음부터 재시작해 최종 no-edit pass로 종결 |

### 남은 결정과 revalidation trigger

- 사용자 결정 blocker는 2026-08-17 해소됐다. exact scope는 `Core: right-sized FSD migration`, 실행 순서는 `fsd-first`, ADR 0001은 accepted이며 이 task의 repository-level 수정 권한으로 Phase 0~7A/7C를 수행한다.
- FEAT-10 계획은 최종 FSD 목적지, command feature public API, gate-local hint, progress GET contract test, exact 4-fetch-owner 후속 계약으로 재기준화했다. post-migration full reconciliation에서 stale 현재 경로, 누락 public entry/boundary file, malformed response 부분 집계, polling race를 문서에 해소했고 최신 저장본의 INV-1~INV-7 no-edit final pass를 완료했다. FEAT-10 자체의 구현승인/구현은 별도 사용자 gate다.
- Full은 승인 범위 밖이다. operator-visible board warning과 analytics/gate/Sentry failure 의미 변경, test-source typing은 구현하지 않았고 `apps/admin/docs/proposals/active/admin-src-fsd-contract-hardening.md`로 분리했다.
- implementation 시작 전에 HEAD, proposal, 직접 참조 문서, `.claude/agents/admin-dev.md`, FEAT-09 코드/테스트, 활성 FEAT-10 구현·계획과 `PROJECT_BOARD.md`/`TASK_BACKLOG.md`, `apps/admin/src` path-set/content, package/config, `@repo/db` analytics contract가 이 reconciliation 시점과 달라졌는지 확인한다. 하나라도 달라지거나 FEAT-10 신규 7개 중 일부만 존재하면 mapping/runtime/artifact inventory를 다시 수행한다. FEAT-10 plan diff가 종결됐더라도 exact raw-CDN 지연 카피와 대응 test 명세가 사라졌으면 drift로 간주한다.
- Node/Next/Sentry/NextAuth/TypeScript 버전, middleware matcher, 외부 GitHub 좌표/command body, route source, public entry export origin/directive, `@repo/db` runtime provenance/owner, native/browser network primitive·dependency, Sentry SDK import owner, 운영 문서의 test inventory/scope contract, picked/clipcard CSS definition 집합이 바뀌어도 관련 phase와 verification을 다시 reconcile한다.
- Core의 safe build, generated manifest, local production route smoke, final boundary는 모두 실행했다. Full 전용 `test:types`는 승인 범위 밖이라 존재하지 않으며 Core 완료 증거로 요구하지 않는다.

## Completion or Closure Notes

두 branch 중 현재 status에 해당하는 기록은 실제 값으로 채우고, 사용하지 않는 branch의 field도 placeholder로 남기지 않는다. 예를 들어 `completed` 문서는 아래 닫힘 기록을 `N/A (completed)`로, `closed` 문서는 완료 기록을 `N/A (closed)`로 명시한다.

완료 기록(`status: "completed"`일 때 작성):

- completed-at: 2026-08-17
- verification-summary: Core fsd-first exact 84-file tree, legacy 0, runtime/check/final-boundary/safe-build/generated manifest/local route smoke 모두 통과; FEAT-10 post-FSD reconciliation은 latest saved bundle의 no-edit final pass까지 완료
- implementation PR/commit: working tree implementation; PR/commit not created because the user did not request one; baseline HEAD 0c5e42a5b3352faa3c3cdeee56ead6745acf972c
- changed files summary: 기존 source 62개를 일대일 이동하고 Core 신규 source 22개, boundary script/test, Node engine/package gate, ADR 0001, 운영 문서와 live FEAT-10 locator/plan을 갱신
- final test count: admin runtime 128 tests / 35 suites / 17 test files; boundary rules 11 tests / 1 suite; all pass
- remaining follow-up: Full hardening은 apps/admin/docs/proposals/active/admin-src-fsd-contract-hardening.md에서 별도 승인; FEAT-10 기능 구현은 현재 검토대기 사용자 gate 뒤 별도 수행

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: N/A (completed)
- closed-by: N/A (completed)
- closed-reason: N/A (completed)
- close summary: N/A (completed)
- remaining follow-up: N/A (completed)

## Review Checklist

- [x] 완료/닫힘 기록의 필수 field를 실제 값과 exact `N/A (completed)`로 종결했다.
- [x] `status: completed`, `stage: null`, `completed-at`을 실제 완료 상태로 갱신했다.
- [x] 완료 경로와 front matter 날짜가 일치하도록 이동한다.
- [x] approval metadata와 exact Core/fsd-first 결정을 보존했다.
- [x] 활성 FEAT-10의 post-FSD full reconciliation/no-edit final pass를 완료하고 구현은 별도 사용자 gate로 남겼다.
- [x] 5개 이상 파일, routing/auth/runtime side effect를 포함하므로 `standard`를 사용했다.
- [x] 승인 기록의 단일 기준을 front matter로 두었다.
- [x] Core/Full exact approval 값, scope별 phase/file/DoD, 모호한 승인 중단 조건을 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 최신 reconciled HEAD의 FEAT-09 reject UI와 26개 신규 순수 회귀 case를 포함한 기존 62개 파일 전부의 목표 경로와 작업을 적었다.
- [x] page-private pipeline UI는 직접 참조한 web 가이드/실제 tree와 같은 `ui/_component`에 두고 public root에서 재수출하지 않도록 했다.
- [x] public entry wildcard와 pipeline private UI 5개의 direct/aliased/transitive re-export를 boundary rule 10, mutation fixture, final negative check로 차단했다.
- [x] named export만 사용하는 action/query/Edge runtime leak와 public entry directive를 rule 11 origin fixture로 차단하고 Core analytics root를 exact empty surface로 고정했다.
- [x] non-owner/other-model DB read, aliased Prisma mutation/raw/transaction/deep import와 허용 owner 밖 native/browser network·Sentry SDK import를 rule 12/13 AST fixture로 차단하고 허용 owner의 behavior contract test와 결합했다.
- [x] 라우팅, static/dynamic import, barrel, test, asset, type, side effect, 외부 SDK를 확인했다.
- [x] public symbol provenance, runtime transition, Final Artifact Resolution Map을 적었다.
- [x] 검증 명령, scope별 자동/수동 성공 기준, 기존/신규 실패 구분 방법을 적었다.
- [x] package/config/route/middleware를 parser로 검증하고 old-absence/new-presence를 확인하는 명령을 적었다.
- [x] mapping 62개와 Core/Full 신규 파일 전체의 exact path set을 실제 `src` 전체 집합과 비교해 count-only 대체 파일을 거부하도록 했다.
- [x] lockfile은 허용된 engine 변경 외 normalized JSON digest가 불변인지 확인하고 실패 시 clean 원본 bytes를 복원하며, exact 승인·accepted ADR·`CLAUDE.md`·completed proposal lifecycle을 최종 목적지에서 검증하도록 적었다.
- [x] build에서 Sentry upload를 차단하고 자동 test에서 GitHub/Sentry live write를 금지했다.
- [x] stale generated output을 배제하고 successful final build 직후 산출물만 증거로 쓰도록 했다.
- [x] 잔여 리스크와 단계별 rollback을 적었다.
- [x] reconciliation source bundle, 해소 blocker, revalidation trigger를 기록했다.
- [x] completed lifecycle은 검증 코드 자체를 매치하지 않는 field-only placeholder 검사와 비활성 branch의 명시적 `N/A` 처리를 사용한다.
- [x] completed lifecycle은 필수 완료/닫힘 field를 삭제해 placeholder 검사를 우회하지 못하도록 presence·uniqueness·actual value·front matter date 일치를 검사한다.
- [x] Full test-source typecheck의 현재 6-file/108-error 실패를 통과로 오기하지 않고 파일별 narrowing 작업과 0-error gate로 전환했다.
- [x] completed lifecycle은 활성 완료 field나 임의 추가 field의 `N/A`가 실제 실행 증거를 대신하지 못하도록 semantic fixture로 검증했다.
- [x] 중첩 remote pipeline proposal의 legacy action 경로와 FEAT-09에 모순되는 “status만” 문구를 구현 시 함께 갱신하고 parser로 검증하도록 했다.
- [x] `.claude/agents/admin-dev.md`의 anti-FSD/flat-path standing rule을 source/affected/Phase 7A/parser/DoD에 포함하고, migration executor authority와 agent 재디스패치 중단 조건을 명시했다.
- [x] 활성 FEAT-10 backlog area는 새 pipeline page/command/gate/entity 경로로 갱신하되 이미 완료됐으면 non-applicable로 처리하고, 완료 plan/board의 옛 경로는 역사 기록으로 보존하도록 분류했다.
- [x] CLAUDE/admin-dev의 모든 legacy flat-path code span과 remote의 full/bare action basename을 negative parser로 막아 anchor 추가만으로 통과하는 우회를 차단했다.
- [x] Core/Full의 table directive, picked alias/theme values, clipcard keyframes/utility, briefing API 이름, observability public export를 scope parser로 분기 검증하고 dangling CSS family를 막았다.
- [x] 최신 board의 FEAT-10 `검토대기`, 현재 saved 계획 전체, 신규 7·수정 10, source 미구현 상태, 커밋된 `since` semantics 보정을 확인하고 동시 실행과 향후 pre-existing plan 덮어쓰기를 금지했다.
- [x] FEAT-10 raw-CDN 지연/카피 drift와 이를 종결한 `2eb1c19`, 실응답 `max-age=300`, authoritative source 불변을 확인하고, exact copy/test 보존과 향후 pre-existing diff 중단 조건을 Affected Files·Phase 0/7·artifact/parser·scenario·DoD에 반영했다.
- [x] FEAT-10의 run-command↔gate peer-feature 충돌을 gate-local descriptor로 분리하고 progress GET의 4번째 fetch owner/전용 action contract test를 명시했다. 선택되지 않은 68-row 산식은 역사 기록으로 격리하고 현재 산식은 Core 84 + FEAT-10 신규 7 = 91(Full 후속 5개까지 별도 승인 시 96)로 갱신했다.
- [x] `fsd-first`의 FEAT-10 plan edit가 기존 flat-tree clean pass를 무효화함을 반영해 historical 표기, post-migration INV-1~INV-7 full reconciliation, no-edit final pass, 완료 evidence gate를 전 구간에 추가했다.
- [x] TypeScript manifest 범위(`^5.8.2`)와 lock/runtime exact version(5.9.3)을 구분하고, Full-options 6파일/108-error 기준선이 실제 5.9.3에서 재현됨을 Phase 7B·검증 결과·evidence에 반영했다.
- [x] analytics reporting의 local `name: string` 경계 보존은 Core, canonical query/reporting type coupling과 drift guard는 Full이라는 범위를 Final Artifact Map·필수 시나리오·evidence·blocker에 일관되게 반영했다.
- [x] 두 admin 운영 문서의 old runner/count/capability가 경로 anchor 뒤에 남지 않도록 scope별 analytics/test-typing/runtime contract와 CLAUDE actual test-set 구조 비교를 Phase 7A/parser/artifact/DoD에 반영했다.
- [x] DB는 exact analytics query owner의 `db.analyticsEvent.findMany`만 허용하고 namespace/dynamic/re-export/deep-import 우회를 fail closed하도록 rule 12와 mutation 시나리오를 보강했다.
- [x] native fetch의 globalThis/window/self/alias/computed 우회, browser network primitive/별도 client와 Sentry direct SDK import를 exact owner 밖에서 차단하도록 rule 13과 artifact/scenario/DoD를 보강했다.
- [x] 완료/닫힘 metadata와 기록은 실제 실행 후 갱신하도록 남겼다.
