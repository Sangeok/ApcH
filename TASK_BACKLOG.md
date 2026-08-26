# TASK_BACKLOG

> 최초 부트스트랩: README.md의 Known Issues / Credit System 항목을 옮겨 담음.
> PM 에이전트는 이 파일과 PROJECT_BOARD.md만 읽고 우선순위를 판단한다.
> 보드에 올라가는 것만으로는 제거하지 않는다. 담당 에이전트가 보드에 `status: 완료`로 기록한 시점에, 그 에이전트가 여기서 해당 항목을 제거한다.
> `area`는 실제 코드 경로여야 한다. PM은 코드를 읽지 않으므로 이 값을 그대로 보드에 옮긴다 — 여기가 틀리면 보드도 틀린다.

## Backend / Pipeline

- [ ] **BUG-04**: 임시 디렉토리 정리가 파이프라인 성공/실패 여부와 무관하게 항상 실행됨
  - area: apps/backend
  - source: README Known Issues

- [ ] **BUG-08**: 에러 콜백이 `clips: []`를 하드코딩해 부분 성공을 유실함
  - area: apps/backend + apps/web/src/inngest
  - source: BUG-03 계획서 「범위 밖 의존」(2026-08-25, `docs/plans/BUG-03.md`). **관측**: 여러 클립 중 뒤쪽 업로드가 실패하면 `_do_process_video`의 포괄 except가 에러 콜백의 `clips`를 하드코딩 `[]`로 보내, 이미 S3에 올라간 앞쪽 클립들이 리포트에서 사라진다(S3에 고아 객체만 남음). **진단(추정)**: 에러 콜백에 부분 `clip_results`를 실어야 하는데 이는 웹 inngest 소비 계약 변경이라 양 워크스페이스 경계 — 계획 단계에서 경계 판단이 관건.

## Credit / Billing

- [ ] **FEAT-01**: Credit System 마무리 (현재 개발 중 상태)
  - area: apps/web/src/fsd/features/billing + apps/web/src/fsd/entities/user + apps/web/src/inngest
  - source: README "Currently in Development"

## Admin / Dashboard

- [ ] **FEAT-23**: 항목 카드에 파이프라인 여정 스테퍼 — 전체 단계·현재 위치·다음 단계 표시
  - area: apps/admin/src/fsd/pages/pipeline
  - source: 사용자 관측(2026-08-26 세션). **관측**: 대시보드가 항목의 "지금 상태"(status 낱말·검토대기 카드의 검증 칩·문서 링크·책상 말풍선)는 보여주지만, 파이프라인 전 과정(선정 → 게이트① → 계획서 → 검증 → 게이트② → 구현 → 인수)에서 어디까지 왔고 다음 단계가 무엇인지는 보여주지 않는다 — status 낱말을 해석하려면 상태 기계를 외우고 있어야 한다. **진단(코드 확정)**: 필요한 데이터는 보드 파서가 이미 다 뽑는다(`entities/pipeline/model/board.ts`의 status + `검증:` 줄) — status→단계 인덱스 결정적 매핑 순수 모델 + 카드 스테퍼 UI만 얹으면 된다. 설계 시 판단: 게이트①②는 사용자 단계임을 구분 표시하면 "지금 누구를 기다리는지"까지 전달된다. `검증:` 줄 존재로 검토대기를 "검증 중/검증 통과·게이트② 대기" 둘로 쪼갤 수 있다(FEAT-13 칩과 같은 신호원).

- [ ] **BUG-07**: 폰 뷰포트에서 `/pipeline` "당신의 책상" 배너 라벨이 판독 불가 수준으로 작게 렌더됨
  - area: apps/admin/src/fsd/pages/pipeline
  - source: FEAT-19 배포 확인 2차 스윕(2026-08-24, `docs/agents/main-loop/FEAT-19.md`). **관측**: 375px 스크린샷에서 배너 전체가 축소돼 "당신의 책상 / 결재 N건이 도장을 기다립니다" 라벨이 깨알 크기 — 데스크톱은 정상. **진단(추정)**: 배너 SVG가 고정 viewBox의 비율 축소라 텍스트도 함께 줄어듦. FEAT-07 승인 시안의 폰 데모에는 배너가 없어 시안 위반은 아님 — 폰 전용 배너 처리(라벨 분리 또는 최소 크기)가 필요할 것으로 보임.

- [ ] **FEAT-24**: 원격 실행의 진행 과정을 대시보드에서 본다 — 루틴의 진행 코멘트 기반 실행 로그 + 대기 중 실행 버튼 잠금
  - area: apps/admin/src/fsd/features/run-pipeline-command
  - source: 사용자 관측(2026-08-26 세션). **관측**: "BUG-07 계획서 작성" 실행 버튼을 누른 뒤 pill이 3분 만에 "무응답 N분 · 이슈 #87 확인"으로 바뀌었고 버튼은 다시 활성이라, 사용자는 돌고 있는지도 다시 눌러도 되는지도 알 수 없었다. 실제로는 정상 진행 중이었다 — 원격 세션 로그 실측(14:01 접수 → 14:05 계획서 작성 → 14:07~09 `npm install`+check·test·SSR 렌더 검증 → 14:10 검증 기록 → 14:13 푸시, 답글은 맨 끝). 같은 형태의 2026-08-16 실행도 23분간 무신호였다. 이를 알 수 있었던 유일한 경로는 Claude Code 안의 `/schedule`(RemoteTrigger `list_runs`/`get_run_log`)뿐이었다. **진단(코드 확정)**: `progress.ts:12-17`의 상태는 idle/awaiting/silent/responded/unknown뿐 — "진행 중"이 없다. 신호원이 #87 코멘트뿐인데 루틴 지침이 답글을 종료 시 1건만 남기므로 실행 중엔 코멘트가 0건이고, `isReply`(`progress.ts:23-25`)는 `[claude]` 접두 하나로 명령을 상환하므로 중간 코멘트를 넣으면 종료로 오판된다. 임계 3분(`progress.ts:21`, 근거 `docs/plans/FEAT-10.md:127`)은 pm-select류(0.3~2.6분) 기준이라 계획서·구현 실행에선 항상 오경보다. 실행 버튼은 `pipeline-run-control.tsx:114`에서 POST 왕복 중에만 비활성 — 대기 중 재클릭을 막지 않는다(재클릭 = 같은 명령 재게시 → 루틴 재발화·동시 실행 위험. 지침의 "함께 처리됨" 규칙은 잠금이 아니다). **조사(2026-08-26)**: 세션 API(`/v1/code/sessions…`)는 비공개·미문서화이고 루틴 토큰은 문서상 쓰기 전용(no read access)이라 서버 직결은 불가(https://platform.claude.com/docs/en/api/claude-code/routines-fire). Managed Agents는 별도 제품이라 범위 밖. 남는 길은 **루틴이 실행 중 진행 코멘트를 #87에 남기고 대시보드가 읽는 것**: 접수 시 `[claude][진행] 접수 …`, 단계마다 `[claude][진행] 계획서 작성 완료 → 검증 중`, 종료 시 기존 `[claude]` 답글. `deriveProgress`가 `[진행]` 코멘트를 상환에서 제외하고 `running{steps, lastEventIso}` 상태를 더하면 pill이 "진행 중 · N분째 · 마지막: 검증 중"과 단계 목록을 보여줄 수 있고, 무응답 임계는 명령 시각이 아니라 마지막 진행 코멘트 기준으로 잰다. 대기·진행 중엔 실행 버튼을 잠근다(게이트 버튼 LockedChip과 같은 결, `gate-transition-button.tsx:42-47`). **범위 밖 의존**: 루틴 지침은 저장소 밖(claude.ai)이라 사용자가 직접 고쳐야 하고, "명령 1건당 답글 1건" 규칙을 "종료 답글 1건 + 진행 코멘트 N건"으로 다시 써야 한다 — 계약 사본(`docs/proposals/active/remote-agent-pipeline-generalization.md` 루틴 지침 템플릿, `post-pipeline-command.ts:12-19` 주석)도 함께 갱신.

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
- `source`를 쓸 때는 **관측과 진단을 분리한다.** 무엇을 봤는지(관측)와 왜 그렇다고 생각하는지(진단)를 한 문장에 섞지 않고, 진단은 추정임을 표시한다. FEAT-02가 실제로 이렇게 틀렸다 — 관측("10분 소스에 4개 요청 시 적게 생성됨")은 맞았는데 진단("유저가 무리한 개수를 골라서")이 틀렸고, 둘이 섞여 있어 담당 에이전트가 틀린 진단을 요구사항으로 받아 계획을 세 번 썼다. 반대로 BUG-06은 `파일:줄` 근거, 이미 맞는 곳, 수정 방향까지 적혀 있어 계획이 한 번에 끝났다.
