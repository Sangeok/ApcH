# TASK_BACKLOG

> 최초 부트스트랩: README.md의 Known Issues / Credit System 항목을 옮겨 담음.
> PM 에이전트는 이 파일과 PROJECT_BOARD.md만 읽고 우선순위를 판단한다.
> 보드에 올라가는 것만으로는 제거하지 않는다. 담당 에이전트가 보드에 `status: 완료`로 기록한 시점에, 그 에이전트가 여기서 해당 항목을 제거한다.
> `area`는 실제 코드 경로여야 한다. PM은 코드를 읽지 않으므로 이 값을 그대로 보드에 옮긴다 — 여기가 틀리면 보드도 틀린다.

## Backend / Pipeline

- [ ] **BUG-02**: 한국어 번역 API 실패 시 영어로 조용히 폴백됨 (사용자에게 알림 없음)
  - area: apps/backend
  - source: README Known Issues

- [ ] **BUG-03**: S3 업로드 실패에 대한 에러 핸들링 부재
  - area: apps/backend
  - source: README Known Issues

- [ ] **BUG-04**: 임시 디렉토리 정리가 파이프라인 성공/실패 여부와 무관하게 항상 실행됨
  - area: apps/backend
  - source: README Known Issues

## Credit / Billing

- [ ] **FEAT-01**: Credit System 마무리 (현재 개발 중 상태)
  - area: apps/web/src/fsd/features/billing + apps/web/src/fsd/entities/user + apps/web/src/inngest
  - source: README "Currently in Development"

## Admin / Dashboard

- [ ] **FEAT-18**: 대시보드 로스터를 현행 파이프라인 7인 체제로 동기화 — backend-dev·plan-verifier가 어드민 세계에 없음
  - area: apps/admin/src/fsd/shared/agents + apps/admin/src/fsd/pages/pipeline + apps/admin/src/fsd/features/run-pipeline-command
  - source: 메인 루프 admin/pipeline 실측 분석 (2026-08-24)
  - 관측 1: `roster.ts:5-11`의 닫힌 로스터가 5인(pm·admin-dev·web-dev·doc-auditor·feature-scout)이다. backend-dev 배제 주석(`roster.ts:25`)의 전제("백엔드 항목은 선정된 적 없음")는 만료됐다 — 보드에 `agent: backend-dev` 항목(BUG-03·BUG-02)이 승인대기로 실재한다.
  - 관측 2: 그 결과 (a) 사무실에 backend-dev 책상이 없어 게이트① 이후 "작업 중" 상태·항목 칩을 보여줄 곳이 없다 (b) 보고 피드에서 폴백 정체성(역할 "에이전트"·이모지 없음, `known-agents.ts:36-41`)으로 나온다 (c) `/pipeline/agents/backend-dev`·`/pipeline/agents/plan-verifier`가 roster 가드(`agents/[agent]/page.tsx:26`)에서 404라 FEAT-17 역할 정의 열람이 7인 중 2인에게 닫혀 있다 (d) 책상 명령 화이트리스트(`commands.ts:3-9`)에 backend-work가 없다.
  - 요구 1: backend-dev·plan-verifier를 로스터·정체성·스프라이트 외형에 편입하고 프로필 라우트(역할 정의 열람)를 연다.
  - 요구 2: backend-dev 책상 명령 `backend-work`를 admin-work·web-work와 동형으로 추가한다(본문 불변식 — GATE_GUARD 포함, "[claude]" 비시작 — 유지, `commands.ts:11-14`).
  - 요구 3: plan-verifier에는 책상 명령을 두지 않는다 — 검증은 런북 4단계에서 메인 루프가 수행하는 일이라 별도 트리거 대상이 아니다. 책상 상태는 보드에서 파생 가능한 것만 쓴다(예: 검토대기 항목 존재 → "검증 중"; 구체 설계는 계획서 몫).
  - 이미 맞는 곳(손대지 않는다): 문서 링크 계층 `doc-location.ts:64-76`은 main-loop 「검증 기록」·backend-dev 「구현 보고」를 이미 알고, agent-report는 실재 폴더를 동적 열거한다(`agent-report/api/queries.ts:37-62`).

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
- `source`를 쓸 때는 **관측과 진단을 분리한다.** 무엇을 봤는지(관측)와 왜 그렇다고 생각하는지(진단)를 한 문장에 섞지 않고, 진단은 추정임을 표시한다. FEAT-02가 실제로 이렇게 틀렸다 — 관측("10분 소스에 4개 요청 시 적게 생성됨")은 맞았는데 진단("유저가 무리한 개수를 골라서")이 틀렸고, 둘이 섞여 있어 담당 에이전트가 틀린 진단을 요구사항으로 받아 계획을 세 번 썼다. 반대로 BUG-06은 `파일:줄` 근거, 이미 맞는 곳, 수정 방향까지 적혀 있어 계획이 한 번에 끝났다.
