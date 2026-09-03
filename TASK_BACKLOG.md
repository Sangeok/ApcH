# TASK_BACKLOG

> 최초 부트스트랩: README.md의 Known Issues / Credit System 항목을 옮겨 담음.
> PM 에이전트는 이 파일과 PROJECT_BOARD.md만 읽고 우선순위를 판단한다.
> 보드에 올라가는 것만으로는 제거하지 않는다. 담당 에이전트가 보드에 `status: 완료`로 기록한 시점에, 그 에이전트가 여기서 해당 항목을 제거한다.
> `area`는 실제 코드 경로여야 한다. PM은 코드를 읽지 않으므로 이 값을 그대로 보드에 옮긴다 — 여기가 틀리면 보드도 틀린다.

## Backend / Pipeline

## Credit / Billing

- [ ] **FEAT-01**: Credit System 마무리 (현재 개발 중 상태)
  - area: apps/web/src/fsd/features/billing + apps/web/src/fsd/entities/user + apps/web/src/inngest
  - source: README "Currently in Development"

## Admin / Dashboard

## Web / 프론트엔드 구조

- [ ] **FEAT-31**: 엔티티 barrel 다섯 개를 클라이언트 안전 `index.ts` + 서버 전용 `server.ts`로 분할
  - area: apps/web/src/fsd/entities/analytics-event + apps/web/src/fsd/entities/order + apps/web/src/fsd/entities/processing-dispatch + apps/web/src/fsd/entities/subscription + apps/web/src/fsd/entities/user
  - source: 2026-09-03 클린코드 개선(정규 77건) 인수 시 메인 루프 관측. **관측**: 위 다섯 슬라이스의 `index.ts`가 `./api`를 재수출하는데(`analytics-event/index.ts:1`, `order/index.ts:1`, `processing-dispatch/index.ts:7`, `subscription/index.ts:7`, `user/index.ts:12`) 그 `api/index.ts`의 1행은 다섯 곳 모두 `import "server-only";`다. 오늘은 이 다섯 barrel을 임포트하는 `"use client"` 모듈이 0건이라 `npm run build`가 통과한다(2026-09-03 실측). C-07이 같은 문제를 가진 `entities/{uploaded-file,clip,clip-draft}` 셋은 이미 분할했다 — 클라이언트 안전 `index.ts`(`model`·`lib`·`ui`)와 `server.ts`(`import "server-only"` + `./api` 재수출). 규약은 `apps/web/docs/conventions/fsd-architecture-guidelines.md` §4 뒤 「슬라이스 공개 API를 런타임 기준으로 나눈다」. **진단(추정)**: 이 다섯을 임포트하는 첫 클라이언트 컴포넌트가 빌드를 깬다. `tsc --noEmit`은 통과하고 `npm run build`에서만 터지므로 배포 직전에 발견된다. C-07 이전의 `uploaded-file`이 정확히 그 상태였고, 그 결과 클라이언트 모듈 13개가 barrel을 우회해 `model/*`·`ui/*`를 직접 임포트해 공개 API 경계가 사실상 없었다(원 계획서 C-07 근거). **범위**: 기계적이다. 각 슬라이스에서 `./api` 재수출 줄을 `server.ts`로 옮기고 서버 측 임포터를 `~/fsd/entities/<slice>/server`로 돌린다. 검증은 `npm run build` — 타입 체크로는 못 잡는다.

- [ ] **FEAT-32**: 클라이언트 Sentry 초기화 — 브라우저 오류가 현재 어떤 텔레메트리에도 도달하지 않음
  - area: apps/web/src/sentry.server.config.ts + apps/web/src/instrumentation.ts + apps/web/next.config.js + apps/web/src/fsd/shared/observability/use-report-boundary-error.ts
  - source: 2026-09-03 클린코드 개선 C-74·C-27, 원 계획서 §Needs human judgment 7. **관측**: 저장소 전체에서 `Sentry.init`은 `src/sentry.server.config.ts:65` 하나뿐이고, `src/instrumentation.ts:4`가 `process.env.NEXT_RUNTIME === "nodejs"`로 그 로드를 게이트한다. `onRequestError = Sentry.captureRequestError`는 서버 컴포넌트·route handler 전용이다. 라우트 에러 경계 다섯은 C-74로 `useReportBoundaryError` 훅을 쓰는데 그 훅은 `console.error`만 한다 — `shared/observability/report-error.ts`가 `import "server-only"`라 클라이언트에서 호출할 수 없다. 별도로 C-27이 고친 버려진 프라미스 넷도 실패 시 브라우저 콘솔에만 남았다. **진단(추정)**: 클라이언트 렌더 오류와 미처리 rejection이 프로덕션에서 관측되지 않는다. 유저가 아직 없어 지금은 손실이 작지만, 유저가 붙는 시점에는 "화면이 하얗게 뜬다"는 제보 외에 근거가 없다. **미검증(계획 단계에서 확인할 것)**: `@sentry/nextjs` 10.68.0의 클라이언트 진입점이 `instrumentation-client.ts`인지 `sentry.client.config.ts`인지, 그리고 `next.config.js:115-121`의 `withSentryConfig` 옵션이 클라이언트 번들에 무엇을 넣는지는 이번 검토에서 확인하지 않았다 — 버전 의존이라 계획서가 실물로 확인해야 한다. **딸려 오는 결정**: 번들 크기 증가와 PII 스크러빙 정책(업로드 파일명·이메일이 이벤트에 실릴 수 있다). **순서**: 이것이 먼저다. 초기화 없이 `use-report-boundary-error.ts`에 `Sentry.captureException`을 넣으면 아무 데도 도달하지 않는다 — 도달을 브라우저에서 실측한 뒤에 훅을 고친다.

## Pipeline 운영 / 검증 하니스

- [ ] **FEAT-27**: 계획서 검증 하니스 — `verification-paths.md` 9경로를 deterministic/hybrid/reasoning으로 분류하고, 기계 재현 가능한 경로만 script/tool로 구현
  - area: scripts/verify-plan (신설, 루트) + docs/plans/verification-paths.md + .claude/agents/plan-verifier.md
  - source: 사용자 발주(2026-08-27 세션, 브리프 원문은 아래 「요구」). **관측**: 카탈로그의 9경로(`docs/plans/verification-paths.md:17-29`)는 매 검증 라운드 사람(메인 루프·`plan-verifier`)이 손으로 실행한다 — FEAT-22 기록에서 경로 1 인용 전수는 인용 줄을 하나씩 눈으로 대조(`docs/agents/main-loop/FEAT-22.md:47-48`), 경로 3 before 바이트 일치는 diff 전문 대조(`:172`), 경로 2 조립 게이트는 check·test·verify:fsd:final 수동 실행(`:36`)이었고, 3사이클 동안 같은 경로를 매 라운드 재수행했다. `plan-verifier`는 도구가 없어 하니스(스케치 추출·돌연변이·렌더)를 매번 스크래치패드에 재조립한다(`.claude/agents/plan-verifier.md:31`). 저장소 안 기계 검증 선례는 `apps/admin/scripts/verify-fsd-boundaries.mjs` 하나 — 종료코드 PASS/FAIL(`:722` `process.exitCode = 1`), `--final` 모드(`:708`), 규칙 ID별 메시지, 셀프테스트 13건(`verify-fsd-boundaries.test.mjs:21-196`, 음성 픽스처 포함)을 갖춰 이 항목이 요구하는 script/tool 성질의 저장소 내 모델이다. **진단(추정 — 분류 확정은 계획 단계)**: 9경로는 성격이 셋으로 갈린다. *deterministic*(입력이 계획서+트리뿐, 판단 불요): 1 인용 전수 대조의 "줄 존재 + 인용 내용 일치" 부분, 3 before/after 기계 적용(before 블록 바이트 일치·patch dry-run), 9 구조적 아티팩트 검사(파서), 7 음성 시험 중 검사가 스크립트인 경우(규칙 제거→검사 실패 확인). *hybrid*(대상·설정 선택은 판단, 실행·판정은 기계): 2 스케치 추출·실행(어느 워크스페이스 설정으로 어떤 파일에 실행할지), 5 돌연변이(명세→테스트 변환은 reasoning, 주입·사멸 판정은 기계), 8 실물 렌더(대상 선택 reasoning, `renderToStaticMarkup` 실행 기계). *reasoning*(의미 해석 본체): 4 전칭 여집합 열거(주장 발췌·여집합 설계), 6 실제 사건 재생(실측 데이터 선택·의미 판정), 그리고 hybrid의 판단 절반. 현재는 세 부류가 구분 없이 산문 증거로만 남아 라운드마다 비용과 편차가 생긴다. **요구(발주 원문 요지)**: ① `verification-paths.md`는 에이전트가 읽는 source of truth로 유지하고 전체를 하나의 script PASS/FAIL 시스템으로 바꾸지 않는다. ② 9경로를 deterministic/hybrid/reasoning으로 분류한 뒤 기계적으로 재현 가능한 path만 script/tool로 구현한다. ③ script/tool은 동일 입력→동일 결과 · exit code 기반 PASS/FAIL · evidence 출력 · negative fixture/self-test를 가진다. ④ 의미 해석이 필요한 검증은 `plan-verifier`에 남긴다. ⑤ 최종 verdict는 mechanical evidence + reasoning evidence를 종합하는 구조로 만든다. ⑥ 새 verification agent는 추가하지 않고 현재 main loop + `plan-verifier` 구조를 유지한다. ⑦ 기존 `apps/admin`의 `verify:fsd` 패턴 등 재사용 가능한 구현을 먼저 조사한다. ⑧ 절차: 현재 구조 분석 → 변경 계획 제시 → 구현 → 변경 파일·검증 결과·남은 reasoning-only 영역 보고(파이프라인상 계획서=분석+계획, 구현 보고=③④). **설계 시 판단**: 카탈로그 표에는 열 추가(분류·도구 명령)만 하고 행 제거는 하지 않는다(행 제거는 사용자 승인만 — `verification-paths.md:43`). 종합 구조는 새 파일이 아니라 기존 기록 자리에 둔다 — `docs/agents/main-loop/<항목ID>.md` 라운드 기록과 `plan-verifier` 보고 템플릿(`plan-verifier.md:65-82` [실행한 경로])에 mechanical 증거(도구 출력·종료코드)와 reasoning 증거를 나눠 적는 형식. 도구는 루트 `scripts/verify-plan/`에 두고 계획서 경로를 인자로 받는다(계획서는 backend·web·admin 공통이라 워크스페이스 안에 두지 않음). **담당**: 루트 `scripts/`·`docs/plans/`·`.claude/agents/`는 dev 로스터의 쓰기 범위 밖 — FEAT-19·FEAT-26 전례대로 main-loop가 계획·구현. **범위 밖 의존**: `plan-verifier`가 도구를 쓰려면 브리핑에 명령이 실려야 하고 스크래치패드 제약(`plan-verifier.md:31·36`)과 충돌하지 않아야 한다 — 도구는 저장소 파일을 읽기만 하고 출력은 stdout이라 충돌 없음을 계획서에서 확인. 경로 9는 실증 사례가 아직 없어(`verification-paths.md:29`) 첫 fixture가 곧 첫 실증이 된다.

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
- `source`를 쓸 때는 **관측과 진단을 분리한다.** 무엇을 봤는지(관측)와 왜 그렇다고 생각하는지(진단)를 한 문장에 섞지 않고, 진단은 추정임을 표시한다. FEAT-02가 실제로 이렇게 틀렸다 — 관측("10분 소스에 4개 요청 시 적게 생성됨")은 맞았는데 진단("유저가 무리한 개수를 골라서")이 틀렸고, 둘이 섞여 있어 담당 에이전트가 틀린 진단을 요구사항으로 받아 계획을 세 번 썼다. 반대로 BUG-06은 `파일:줄` 근거, 이미 맞는 곳, 수정 방향까지 적혀 있어 계획이 한 번에 끝났다.
