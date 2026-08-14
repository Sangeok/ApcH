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

## Admin / Observability

- [ ] **FEAT-03**: 파이프라인 대시보드 — 보드 카드 뷰 + 원격 명령 버튼
  - area: apps/admin
  - source: 사용자 요구 (2026-08-14). 관측: (1) 작업 상태의 진실은 dev 브랜치 `PROJECT_BOARD.md`이고, 각 항목은 `status:` 필드가 있는 구조화 형식이다. (2) 이슈 #87 코멘트 → webhook 루틴(pipeline-command) 자동 실행이 2026-08-14 검증됨 — 코멘트 게시 후 51초 만에 `[claude]` 답글까지 완주. (3) 저장소는 public — 보드 raw 읽기는 토큰 불요, 이슈 코멘트 게시(쓰기)는 토큰 필요. 요구: apps/admin에 페이지 1개 — (a) 보드를 파싱해 항목·status를 카드로 렌더 (b) 명령 버튼 클릭 시 GitHub API로 이슈 #87에 코멘트 게시 (c) admin 인증 뒤에서만 접근. 제약: 대시보드는 보드의 투영이다 — 상태를 자체 저장하지 않는다. 게이트 전이(계획지시·구현승인) 버튼은 두지 않는다(원격 게이트 잠김). 게시용 토큰은 서버 환경변수로 읽는다 — 값 세팅은 구현 후 사용자 몫.

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
- `source`를 쓸 때는 **관측과 진단을 분리한다.** 무엇을 봤는지(관측)와 왜 그렇다고 생각하는지(진단)를 한 문장에 섞지 않고, 진단은 추정임을 표시한다. FEAT-02가 실제로 이렇게 틀렸다 — 관측("10분 소스에 4개 요청 시 적게 생성됨")은 맞았는데 진단("유저가 무리한 개수를 골라서")이 틀렸고, 둘이 섞여 있어 담당 에이전트가 틀린 진단을 요구사항으로 받아 계획을 세 번 썼다. 반대로 BUG-06은 `파일:줄` 근거, 이미 맞는 곳, 수정 방향까지 적혀 있어 계획이 한 번에 끝났다.
