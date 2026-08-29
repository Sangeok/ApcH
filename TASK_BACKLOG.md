# TASK_BACKLOG

> 최초 부트스트랩: README.md의 Known Issues / Credit System 항목을 옮겨 담음.
> PM 에이전트는 이 파일과 PROJECT_BOARD.md만 읽고 우선순위를 판단한다.
> 보드에 올라가는 것만으로는 제거하지 않는다. 담당 에이전트가 보드에 `status: 완료`로 기록한 시점에, 그 에이전트가 여기서 해당 항목을 제거한다.
> `area`는 실제 코드 경로여야 한다. PM은 코드를 읽지 않으므로 이 값을 그대로 보드에 옮긴다 — 여기가 틀리면 보드도 틀린다.

## Backend / Pipeline

- [ ] **FEAT-28**: 부분 성공 클립의 메타데이터를 사용자에게 전달 — web inngest가 `status: error` 콜백의 `clips`를 소비
  - area: apps/web/src/inngest + apps/web/src/fsd/entities/clip
  - source: BUG-08 계획서 「범위 밖 의존」 + 인수 기록(`docs/agents/main-loop/BUG-08.md`, 2026-08-29). 메인 루프 등재. **관측**: BUG-08 배포(2026-08-29)로 백엔드 에러 콜백이 실패 시점까지 완성된 `clip_results`(제목·대본·hook·payoff·subtitleStatus 포함)를 실어 보내지만, 사용자 리포트의 그 클립들은 여전히 메타데이터가 빈 채로 남는다. **진단(코드 확정)**: 실패 흐름에서 Clip 행은 S3 폴링(BUG-05, `apps/web/src/inngest/functions.ts:241`)이 만든 맨행뿐이고, 그 행을 채우는 유일 경로인 웹훅 경로 A(`route.ts`의 `updateClipMetadataFromBackendClips`=`updateMany`)는 행 생성보다 먼저 돌아 0건 갱신이 된다. inngest `applyModalPayload`(`functions.ts:471-487`)가 `!isSuccessfulModalStatus`면 `backendFailureMessage`만 세우고 `clips`를 읽지 않은 채 early return(`:479-483`)하기 때문. `persistGeneratedClips`(`:183-277`)는 `backendClips`가 있으면 `createDataByS3Key`에 메타데이터를 담아 행을 만들고(`:215`), 없으면 맨행(`:241`)을 만든다. **수정 방향(추정 — 계획 단계 확정)**: `applyModalPayload`가 `status: error`에서도 `clips`를 `normalizeBackendClips`로 받아 `backendClips`를 채우되 실패 판정(`backendFailureMessage`)은 그대로 유지한다(실패는 실패로, 부분 데이터만 살림). 그러면 `persistGeneratedClips`가 맨행 대신 메타데이터 붙은 행을 생성 시점에 만든다. **범위 밖 의존(추정)**: 부분 성공분의 크레딧 정산(차감/환불)과 부분 전달 안내 UX가 딸려오면 billing·entities/user 계약에 닿아 FEAT-01과 겹칠 수 있다 — 그 경계는 계획 단계가 정한다. BUG-05의 `clipsFound` 계산·`resolveModalPollAction`과의 상호작용도 확인. 전례: BUG-02(backend가 `subtitleStatus` 송신) → FEAT-21(web 소비)과 같은 두 절반 구조의 두 번째 절반.

## Credit / Billing

- [ ] **FEAT-01**: Credit System 마무리 (현재 개발 중 상태)
  - area: apps/web/src/fsd/features/billing + apps/web/src/fsd/entities/user + apps/web/src/inngest
  - source: README "Currently in Development"

## Admin / Dashboard

## Pipeline 운영 / 검증 하니스

- [ ] **FEAT-27**: 계획서 검증 하니스 — `verification-paths.md` 9경로를 deterministic/hybrid/reasoning으로 분류하고, 기계 재현 가능한 경로만 script/tool로 구현
  - area: scripts/verify-plan (신설, 루트) + docs/plans/verification-paths.md + .claude/agents/plan-verifier.md
  - source: 사용자 발주(2026-08-27 세션, 브리프 원문은 아래 「요구」). **관측**: 카탈로그의 9경로(`docs/plans/verification-paths.md:17-29`)는 매 검증 라운드 사람(메인 루프·`plan-verifier`)이 손으로 실행한다 — FEAT-22 기록에서 경로 1 인용 전수는 인용 줄을 하나씩 눈으로 대조(`docs/agents/main-loop/FEAT-22.md:47-48`), 경로 3 before 바이트 일치는 diff 전문 대조(`:172`), 경로 2 조립 게이트는 check·test·verify:fsd:final 수동 실행(`:36`)이었고, 3사이클 동안 같은 경로를 매 라운드 재수행했다. `plan-verifier`는 도구가 없어 하니스(스케치 추출·돌연변이·렌더)를 매번 스크래치패드에 재조립한다(`.claude/agents/plan-verifier.md:31`). 저장소 안 기계 검증 선례는 `apps/admin/scripts/verify-fsd-boundaries.mjs` 하나 — 종료코드 PASS/FAIL(`:722` `process.exitCode = 1`), `--final` 모드(`:708`), 규칙 ID별 메시지, 셀프테스트 13건(`verify-fsd-boundaries.test.mjs:21-196`, 음성 픽스처 포함)을 갖춰 이 항목이 요구하는 script/tool 성질의 저장소 내 모델이다. **진단(추정 — 분류 확정은 계획 단계)**: 9경로는 성격이 셋으로 갈린다. *deterministic*(입력이 계획서+트리뿐, 판단 불요): 1 인용 전수 대조의 "줄 존재 + 인용 내용 일치" 부분, 3 before/after 기계 적용(before 블록 바이트 일치·patch dry-run), 9 구조적 아티팩트 검사(파서), 7 음성 시험 중 검사가 스크립트인 경우(규칙 제거→검사 실패 확인). *hybrid*(대상·설정 선택은 판단, 실행·판정은 기계): 2 스케치 추출·실행(어느 워크스페이스 설정으로 어떤 파일에 실행할지), 5 돌연변이(명세→테스트 변환은 reasoning, 주입·사멸 판정은 기계), 8 실물 렌더(대상 선택 reasoning, `renderToStaticMarkup` 실행 기계). *reasoning*(의미 해석 본체): 4 전칭 여집합 열거(주장 발췌·여집합 설계), 6 실제 사건 재생(실측 데이터 선택·의미 판정), 그리고 hybrid의 판단 절반. 현재는 세 부류가 구분 없이 산문 증거로만 남아 라운드마다 비용과 편차가 생긴다. **요구(발주 원문 요지)**: ① `verification-paths.md`는 에이전트가 읽는 source of truth로 유지하고 전체를 하나의 script PASS/FAIL 시스템으로 바꾸지 않는다. ② 9경로를 deterministic/hybrid/reasoning으로 분류한 뒤 기계적으로 재현 가능한 path만 script/tool로 구현한다. ③ script/tool은 동일 입력→동일 결과 · exit code 기반 PASS/FAIL · evidence 출력 · negative fixture/self-test를 가진다. ④ 의미 해석이 필요한 검증은 `plan-verifier`에 남긴다. ⑤ 최종 verdict는 mechanical evidence + reasoning evidence를 종합하는 구조로 만든다. ⑥ 새 verification agent는 추가하지 않고 현재 main loop + `plan-verifier` 구조를 유지한다. ⑦ 기존 `apps/admin`의 `verify:fsd` 패턴 등 재사용 가능한 구현을 먼저 조사한다. ⑧ 절차: 현재 구조 분석 → 변경 계획 제시 → 구현 → 변경 파일·검증 결과·남은 reasoning-only 영역 보고(파이프라인상 계획서=분석+계획, 구현 보고=③④). **설계 시 판단**: 카탈로그 표에는 열 추가(분류·도구 명령)만 하고 행 제거는 하지 않는다(행 제거는 사용자 승인만 — `verification-paths.md:43`). 종합 구조는 새 파일이 아니라 기존 기록 자리에 둔다 — `docs/agents/main-loop/<항목ID>.md` 라운드 기록과 `plan-verifier` 보고 템플릿(`plan-verifier.md:65-82` [실행한 경로])에 mechanical 증거(도구 출력·종료코드)와 reasoning 증거를 나눠 적는 형식. 도구는 루트 `scripts/verify-plan/`에 두고 계획서 경로를 인자로 받는다(계획서는 backend·web·admin 공통이라 워크스페이스 안에 두지 않음). **담당**: 루트 `scripts/`·`docs/plans/`·`.claude/agents/`는 dev 로스터의 쓰기 범위 밖 — FEAT-19·FEAT-26 전례대로 main-loop가 계획·구현. **범위 밖 의존**: `plan-verifier`가 도구를 쓰려면 브리핑에 명령이 실려야 하고 스크래치패드 제약(`plan-verifier.md:31·36`)과 충돌하지 않아야 한다 — 도구는 저장소 파일을 읽기만 하고 출력은 stdout이라 충돌 없음을 계획서에서 확인. 경로 9는 실증 사례가 아직 없어(`verification-paths.md:29`) 첫 fixture가 곧 첫 실증이 된다.

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
- `source`를 쓸 때는 **관측과 진단을 분리한다.** 무엇을 봤는지(관측)와 왜 그렇다고 생각하는지(진단)를 한 문장에 섞지 않고, 진단은 추정임을 표시한다. FEAT-02가 실제로 이렇게 틀렸다 — 관측("10분 소스에 4개 요청 시 적게 생성됨")은 맞았는데 진단("유저가 무리한 개수를 골라서")이 틀렸고, 둘이 섞여 있어 담당 에이전트가 틀린 진단을 요구사항으로 받아 계획을 세 번 썼다. 반대로 BUG-06은 `파일:줄` 근거, 이미 맞는 곳, 수정 방향까지 적혀 있어 계획이 한 번에 끝났다.
