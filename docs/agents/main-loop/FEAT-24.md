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
