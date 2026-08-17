---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-08-17"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: ["admin-dev"]
related:
  - "apps/admin/docs/proposals/completed/2026-08-17-admin-src-fsd-refactoring.md"
---

# Admin FSD contract hardening

## Summary

Core FSD migration에서 의도적으로 보존한 기존 동작 가운데 실패 의미, 입력 검증, parser diagnostics, test-source typing을 강화하는 후속 제안이다. 구조 이동의 완료 조건과 분리해 승인되지 않은 behavior change가 Core에 섞이지 않도록 한다.

## Goal

- Core가 만든 FSD ownership과 public boundary를 유지하면서 오류·입력·관측 계약을 명시적으로 강화한다.
- 인증, analytics, pipeline gate, observability의 조용한 실패 가능성을 테스트 가능한 계약으로 바꾼다.

## Proposal Size

`proposal-size`: standard

인증 분기, GitHub write payload, Sentry 결과 의미, parser 반환 구조, test compiler 설정을 함께 바꾸므로 standard다.

## Current State

Core migration은 기존 의미를 보존했다. 따라서 `/login-help`는 현재 login prefix로 분류되고, gate action은 token이 있는 invalid input에서도 GET 1회를 수행하며, GitHub JSON을 typed cast로 읽고, board parser는 malformed row를 조용히 제외한다. Sentry flush 결과는 사용자 성공/실패와 연결되지 않고 `.mjs` test source는 production typecheck 밖이다. 이 상태들은 characterization test로 고정되어 있어 별도 승인 없이 바꾸지 않는다.

## Scope

포함 범위:

- auth route의 exact segment 판정
- analytics option/search-param/canonical event type 계약
- pipeline board diagnostics와 warning banner
- gate input 선검증과 GitHub JSON runtime decode
- Sentry user isolation·flush 결과의 truthfulness
- test-source strict typecheck와 확인된 미사용 CSS/client directive 정리

제외 범위:

- FEAT-10 기능 구현
- route URL, DB schema/query 종류, GitHub command body 변경
- 새 외부 write, 새 dependency, live GitHub/Sentry 호출

## Proposal

1. `server/auth/config.edge.ts`의 login 판정을 exact route/segment predicate로 바꾸고 `/login-help`를 protected sibling으로 검증한다.
2. analytics entity에 canonical option/type guard를 추가하고 page search-param parser를 순수 model로 분리한다.
3. pipeline board parser가 warning code/line을 additive diagnostics로 반환하고 page-private warning banner가 이를 표시하게 한다.
4. gate action은 untrusted forward/reject input을 token/GET보다 먼저 거부하고 GitHub response를 `unknown`에서 string `content`/`sha`가 있는 객체로 decode한 뒤 PUT한다.
5. observability wrapper는 `withReportUser` atomic API와 boolean flush 결과를 제공하고 action이 false/reject를 실패로 반환하게 한다.
6. `tsconfig.test.json`과 `test:types`를 추가해 production strict/noUncheckedIndexedAccess를 test source에도 적용한다. suppression이나 strict 완화는 사용하지 않는다.
7. 사용처가 없는 picked/clipcard CSS family 전체와 table atom의 불필요한 client directive를 별도 diff에서 제거한다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `apps/admin/src/server/auth/config.edge.ts` + test | exact route/segment predicate | sibling prefix 오분류 제거 | high — auth |
| `apps/admin/src/fsd/entities/analytics-event` | option/type guard 추가 | query/reporting canonical coupling | medium |
| `apps/admin/src/fsd/pages/analytics/model` | search-param parser/test 추가 | URL 입력 검증 | medium |
| `apps/admin/src/fsd/entities/pipeline` | additive diagnostics | malformed board 가시성 | medium |
| `apps/admin/src/fsd/pages/pipeline/ui/_component` | warning banner/test 추가 | operator-visible warning | medium |
| `apps/admin/src/fsd/features/transition-pipeline-gate` | input/JSON hardening + contract tests | 외부 write 안전 | high |
| `apps/admin/src/fsd/shared/observability`와 send feature | atomic user scope와 truthful flush | 관측 실패 의미 | high |
| `apps/admin/src/fsd/shared/ui/atoms/table.tsx`, `src/styles/globals.css` | verified unused cleanup | client/CSS surface 축소 | low |
| `apps/admin/tsconfig.test.json`, `package.json` | test-source typecheck | `.mjs` 정적 오류 검출 | medium |

## Safety Analysis

- [x] Core public routes와 FSD ownership은 변경하지 않는다.
- [x] DB는 기존 analytics `findMany` owner 하나만 유지한다.
- [x] GitHub command body와 write owner 수는 바꾸지 않는다.
- [x] live GitHub/Sentry 호출 대신 module mock contract test를 사용한다.
- [x] operator-visible warning과 auth/gate behavior는 별도 승인 대상이다.
- [x] 각 behavior change는 먼저 현재 characterization 기대값을 새 계약으로 명시적으로 갱신한다.

## Approval

승인 메모:

- 승인 전. Core migration 승인으로 이 문서의 behavior hardening까지 승인된 것으로 간주하지 않는다.

## Execution Plan

1. 완료된 Core proposal과 최신 source/test inventory를 `reconciling-proposals-with-codebase`로 다시 검증한다.
2. auth와 analytics contract를 독립 diff로 구현·검증한다.
3. board diagnostics와 gate hardening을 구현하고 GET/PUT negative contract를 검증한다.
4. observability 결과 계약을 구현하고 Sentry mock call order/isolation을 검증한다.
5. test-source typing을 0-error로 만들고 CSS/client cleanup을 별도 diff로 적용한다.
6. 전체 test/check/build/manual smoke 후 proposal을 완료 처리한다.

## Verification Plan

```bash
npm run test -w apps/admin
npm run check -w apps/admin
npm run test:types -w apps/admin
npm run verify:fsd:final -w apps/admin
npm run build -w apps/admin
```

검증 기준:

- auth sibling, analytics option round-trip, parser warning, gate invalid/malformed input, Sentry false/reject/concurrency가 전용 test로 고정된다.
- DB owner 1개, fetch owner 수, Sentry SDK owner 3개와 public API runtime boundary가 유지된다.
- test-source typecheck 0 error, runtime test 0 failure, production build 성공이다.
- live GitHub/Sentry write는 실행하지 않는다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 승인 범위 검증 | Not run yet | 승인 전 |

## Risks and Rollback

잔여 리스크:

- warning UI와 auth sibling 분류는 사용자에게 보이는 behavior change다.
- test-source typing은 production behavior를 바꾸지 않지만 많은 fixture narrowing을 요구할 수 있다.

롤백 방법:

- 각 단계별 commit을 역순으로 되돌린다. DB schema나 외부 데이터 migration은 없으므로 데이터 복구 작업은 없다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] Core와 Full behavior hardening 승인 범위를 분리했다.
- [x] auth, DB, external write, Sentry, generated/test config 위험을 열거했다.
- [x] live I/O 없는 검증과 rollback을 명시했다.
- [ ] 최신 Core 완료 tree에 대한 full reconciliation
- [ ] 사용자 승인 metadata
