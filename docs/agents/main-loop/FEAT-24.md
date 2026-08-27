# FEAT-24 — 메인 루프 기록 (게이트 결정·검증 라운드)

## 발주와 게이트① 개방 (2026-08-27)

발단은 2026-08-26 사용자 관측 — 대시보드에서 "BUG-07 계획서 작성" 실행 버튼을 누른 뒤 pill이
3분 만에 "무응답 N분 · 이슈 #87 확인"으로 바뀌었고 버튼은 다시 활성이라, 돌고 있는지도 다시
눌러도 되는지도 알 수 없었다. 실제로는 정상 진행 중이었다 — 원격 루틴 세션
`cse_01Fe8Yd9rDkGF5ikSeK8fEPW` 로그 실측: 14:01 접수 → 14:05 계획서 작성 → 14:07~09 `npm install`
+check·test·SSR 렌더 검증 → 14:10 검증 기록 → 14:13 푸시 → 14:28 `[claude]` 답글. 실행 중
저장소·이슈 어디에도 흔적이 없고, 이를 알 수 있었던 경로는 Claude Code 안의 `/schedule`
(RemoteTrigger `list_runs`/`get_run_log`)뿐이었다.

조사(claude-code-guide, 2026-08-26): 세션 API(`/v1/code/sessions…`)는 비공개·미문서화이고
루틴 토큰은 문서상 쓰기 전용(no read access) — 서버 직결 불가
(https://platform.claude.com/docs/en/api/claude-code/routines-fire). Managed Agents는 별도
제품(x-api-key + webhook/SSE)이라 1인 운영 범위 밖. 지원되는 길은 **루틴이 실행 중 진행
코멘트를 #87에 남기고 대시보드가 읽는 것**뿐이다.

- 백로그 등재: FEAT-24 (관측/진단(코드 확정)/조사/범위 밖 의존 분리 — 같은 커밋)
- 게이트①: 사용자가 세션에서 "Feat 24에 대해 계획 승인"으로 지시 — 선정(소유자 직접 발주)과
  `계획지시` 전이를 함께 결정했다. 메인 루프가 보드를 편집했고 결정은 사용자의 것이다.
- 병렬 미결: BUG-07 `구현승인`(대시보드 게이트②, `15b39af`). 미결 2건은 소유자 결정으로 기록.

admin-dev를 계획서 작성에 디스패치한다. 핵심 판단 지점(계획 단계에서 다뤄야 할 것):

- **코멘트 규약**: 진행 코멘트 접두(예 `[claude][진행]`)는 반드시 `[claude]`로 시작해야 루틴이
  명령으로 오인하지 않는다(루틴 지침: `[claude]`로 시작하면 무시). 반대로 현행
  `isReply`(`progress.ts:23-25`)는 그 접두 하나로 명령을 상환하므로, 진행 코멘트를 **상환에서
  제외**하는 판별이 먼저다 — 없으면 접수 코멘트가 곧바로 "응답 옴"이 된다.
- **상태 모델**: `ProgressState`에 `running{sinceIso, lastEventIso, steps[]}` 추가. 짝짓기(FIFO)
  모델은 유지 — 진행 코멘트는 `unanswered`를 건드리지 않고, 가장 오래된 미응답 명령에 귀속.
- **임계**: 무응답 판정 기준 시각을 "명령 시각"에서 "마지막 진행 코멘트 시각"으로. 값 자체(3분)를
  실행 종류별로 올릴지는 계획서가 판단 — 진행 코멘트가 오면 3분도 충분할 수 있다.
- **버튼 잠금**: awaiting/running/silent 중 실행 버튼 비활성(`pipeline-run-control.tsx:114`).
  게이트 버튼 LockedChip(`gate-transition-button.tsx:42-47`)과 같은 결. silent에서도 잠글지
  (재전송 경로를 남길지)는 계획서가 정한다 — 2026-08-15 삼킴 사건 때 재전송이 필요했다.
- **범위 밖 의존(명시 필수)**: 루틴 지침은 claude.ai에 있어 사용자가 직접 고친다. 계획서는 그
  지침 문안(접수·단계·종료 규칙, "명령 1건당 답글 1건" 재정의)을 산출물로 내고, 계약 사본
  (`docs/proposals/active/remote-agent-pipeline-generalization.md` 루틴 지침 템플릿,
  `post-pipeline-command.ts:12-19` 주석)의 갱신을 고칠 파일에 포함한다.
- **폴링 예산**: 15초 폴링·6시간 창·per_page=100(`get-pipeline-progress.ts:10-18`)은 실행당
  코멘트 2~5건이 늘어도 넉넉한지 계산으로 확인.

## 계획서 검증 라운드 (2026-08-27)

**필수 경로 확정**(카탈로그 `docs/plans/verification-paths.md`): 항목 성격(순수 판정 함수 신설·변경 + 외부 신호 해석 + 화면 변경 + 기존 파일 수정)에 따라 1(인용 전수)·2(스케치 추출·실행)·3(before/after)·4(전칭 여집합)·5(돌연변이)·6(실제 사건 재생)·8(실물 렌더)을 필수로 확정. 7(음성 시험)·9(구조 아티팩트)는 트리거 없음 — 화이트리스트/owner 무변경, schema/config/생성 파일 무변경.

### 라운드 1 — 메인 루프 편집 (결함 1건, 수정)
`reconciling-proposals-with-codebase` 스킬로 검증. 스크래치패드 harness(`feat24/harness.mjs`, `progress.proposed.ts`)로 경로 2·5·6 실행: 기존 progress.test 단언 회귀 보존 + 신규 running/귀속/임계 단언 + 실 #87 재생 + 돌연변이 5종 사멸 = 37/37. 경로 8은 `ProgressLog`를 `renderToStaticMarkup`으로 렌더(`<ol>`/분기/마크업 유효). 경로 3·4는 앵커 바이트 일치·소비자 여집합 확인.
- **결함(수정)**: 계획 line 331 근거 부정확 — "cmd+접수→running" 단언이 "isReply에서 !isProgress 제외 제거" 돌연변이를 잡는다고 했으나, 루프가 `isProgress`를 `isReply`보다 먼저 검사해 그 돌연변이는 도출 불변(생존). 진짜 방어는 분기 순서, 제외는 이중화. 근거를 정정하고 분기 순서 고정 단언을 명세에 추가.

### 라운드 2 — plan-verifier 독립 패스 1차 (결함 4건, 전부 수정)
자기 라운드가 무소득이 아니어서가 아니라, 편집 후 독립 검증을 받기 위해 `plan-verifier`(새 컨텍스트) 디스패치. 7개 경로 전부 실행하고 결함 4건을 증거와 함께 보고 — 메인 루프가 각각 코드로 재확인 후 한 편집으로 수정:
1. **테스트 커버리지 구멍**(line 334, 구현 오류 유발): "귀속 리셋" 단언 벡터 `[명령1,진행1,답글1,명령2]`가 리셋-제거 오구현을 못 잡음(baseline·오구현 양쪽 `awaiting{2}`, "리셋 없으면 running" 근거도 오류). 스케치 런타임 코드는 옳음 — 결함은 테스트 명세. `reset_probe.mjs`로 재확인: 명령2 뒤 진행 코멘트를 넣은 벡터 `[…,명령2,진행2]`라야 `steps:["접수","구현중"]` 로그 혼입이 드러나 사멸. 벡터·근거 강화.
2. **fetch owner 수 오기**(line 91·327): 실제 6개·3번째(계획은 "4개/네 번째"). `verify-fsd-boundaries.mjs:32-38` 재확인. 빌드 무해(스크립트가 수를 단언 안 함). "6개 중 3번째"로 정정.
3. **줄번호 off-by-one**(line 15): `unanswered.shift()`는 `:45`(계획 `:44`는 둘러싼 `if`). 정정.
4. **전칭 열거 누락**(line 17): `unknown` 반환 6곳인데 `:52` 누락. 추가.

### 라운드 3 — plan-verifier 독립 패스 2차 (무편집 무소득 — 클린)
동일 브리핑(사전 판단·직전 결함 미포함, 독립성 유지)으로 재디스패치. 7개 경로 전부 실행, **결함 0건**. 강화된 귀속 리셋 벡터가 `stepsForOldest=[]`-제거 돌연변이를 사멸시킴을 실측 재확인. 등가 돌연변이 2종(d `lastEventIso=null`만 제거·g 순서만 역전)은 관측 불가능한 등가로, 계획이 line 331·334에서 이미 명시한 성질 — 명세 결함 아님. 실 #87 재생 126지점 old≡new 0 diff(회귀 보존). 트리 청결 입증(신규/수정 0, 하니스는 스크래치패드).

**판정**: 독립 무편집 클린 패스 1회 달성 → 보드 정지 규칙 충족. `검증:` 줄 기록. 게이트②(구현승인) 대기 — 사용자만 연다.

**게이트②에서 사용자가 알아야 할 것**: 구현 자체는 `apps/admin/src/**` 안에서 닫히지만, 이 기능이 실제로 `running`을 보이려면 **claude.ai 루틴 지침 변경이 선행**돼야 한다(계획서 「범위 밖 의존」의 새 지침 전문). 지침 미변경 시 화면은 기존 awaiting/silent만 보인다(퇴행은 아님 — 실 #87 재생으로 회귀 0 확인). 지침 변경은 사용자 몫이고, 저장소 계약 사본 2곳(proposals 문서·post-pipeline-command.ts 주석) 중 후자만 구현 범위 안이다.

## 구현 인수 (2026-08-27, 메인 루프)

게이트②는 사용자 세션 지시로 개방(`0195f4a`). 구현 순서를 FEAT-23보다 앞에 둔 이유: (a) 대기 중
재클릭 방지가 운영 안전장치이고, (b) FEAT-24는 `features/run-pipeline-command/**`만 만져
FEAT-23 계획서가 인용한 `ui/index.tsx` 줄번호를 밀지 않는다(반대 순서면 B-3 대조에서 어긋난다).

**인수 다섯 조건 — 전부 직접 재현:**
1. **변경 파일 ↔ 「고칠 파일」**: 코드 5개가 표와 정확히 일치(progress.ts·progress.test.mjs·
   get-pipeline-progress.test.mjs·pipeline-run-control.tsx·post-pipeline-command.ts) + 보드·백로그·구현 보고.
   범위 밖(`get-pipeline-progress.ts` 본체·`verify-fsd-boundaries.mjs`·`run-plan.ts`·`briefing.ts`·`env.js`) 무접촉 확인.
2. **diff ↔ 「구현 스케치」**: 분기 순서(`isProgress`→`isReply`), 귀속 리셋 2문장(`stepsForOldest=[]`+`lastEventIso=null`),
   `RUNNING_STALE_THRESHOLD_MS = 600_000`, `isRunLocked`(awaiting·running만), UI 3개소(running 케이스·`ProgressLog`·
   `disabled`에 `isRunLocked` 합류)까지 스케치와 동일. **검증 라운드에서 강화한 두 단언이 실제 테스트에 반영됨을
   직접 확인**: 귀속 리셋 벡터가 명령2 뒤 진행 코멘트를 포함(`progress.test.mjs:243-250`), 분기 순서 고정 단언(`:174-178`).
3. **검증 직접 재실행**: `check` EXIT 0 · `test` EXIT 0(292 pass/62 suites, fail 0) · `verify:fsd:final` EXIT 0.
   에이전트 보고가 아니라 메인 루프가 재실행한 출력. 테스트 281→292(+11), suite 60→62(+2), 파일 수 27 불변.
4. **백로그 제거**: FEAT-24 블록 소멸, 인접 FEAT-23·25·26·27 전문 무결 직접 확인.
5. **상세 기록 실재**: `docs/agents/admin-dev/FEAT-24.md`(8.8KB). 보드 `결과` 136자(예산 내).

**「범위 밖 의존」 처리**: (1) claude.ai 루틴 지침 — 사용자 몫, 계획서에 새 문안 전문 수록. 미반영 시
`running`이 안 보이나 퇴행은 없다(진행 코멘트 0건이면 기존 awaiting/silent 동작, 실 #87 재생으로 회귀 0 확인).
(2) `docs/proposals/active/remote-agent-pipeline-generalization.md` 정합 사본 3곳(`:120`·`:130-144`·`:168`) —
admin-dev 쓰기 범위 밖이라 메인 루프가 지침 교체 확정 후 반영한다(지금 반영하면 아직 안 바뀐 지침과 어긋난다).

**CLAUDE.md handoff**: `apps/admin/CLAUDE.md:37` 테스트 인벤토리 총계 281→292 test·60→62 suite(파일 27 불변),
`progress.test.mjs`·`get-pipeline-progress.test.mjs` 행 계약 문구 갱신 — 읽기 전용 파일이라 메인 루프가 동기화.

「못 덮는 범위」는 `docs/release-checks.md`에 등재.
