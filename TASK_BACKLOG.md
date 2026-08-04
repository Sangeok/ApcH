# TASK_BACKLOG

> 최초 부트스트랩: README.md의 Known Issues / Credit System 항목을 옮겨 담음.
> PM 에이전트는 이 파일과 PROJECT_BOARD.md만 읽고 우선순위를 판단한다.
> 보드에 올라가는 것만으로는 제거하지 않는다. 담당 에이전트가 보드에 `status: 완료`로 기록한 시점에, 그 에이전트가 여기서 해당 항목을 제거한다.
> `area`는 실제 코드 경로여야 한다. PM은 코드를 읽지 않으므로 이 값을 그대로 보드에 옮긴다 — 여기가 틀리면 보드도 틀린다.

## Backend / Pipeline

- [ ] **BUG-01**: 클립 처리 개수가 3개로 하드코딩되어 있음
  - area: apps/backend
  - source: README Known Issues

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

- [ ] **BUG-05**: 파이프라인 중간 실패 시에도 크레딧이 차감되지 않는 케이스 존재 (반대로 실패해도 안 돌려주는 케이스도 확인 필요)
  - area: apps/web/src/inngest/functions.ts + apps/web/src/fsd/entities/uploaded-file/api + apps/web/src/fsd/entities/user/api
  - source: README Known Issues

- [ ] **FEAT-01**: Credit System 마무리 (현재 개발 중 상태)
  - area: apps/web/src/fsd/features/billing + apps/web/src/fsd/entities/user + apps/web/src/inngest
  - source: README "Currently in Development"

- [ ] **FEAT-02**: Stripe 결제 연동 (계획 단계)
  - area: apps/web/src/fsd + 외부 연동
  - source: README "planned"

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
