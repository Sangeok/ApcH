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

- [ ] **BUG-06**: pricing FAQ가 부분 생성 시 크레딧 미차감이라고 안내하지만 실제로는 생성분만큼 차감됨
  - area: apps/web/src/fsd/pages/pricing/config
  - source: 2026-08-10 발견 — BUG-05(부분 성공 수용)가 동작을 바꿨는데 판매 문구가 남았다. `pricing/config/index.ts:46`은 "only partially completes, no credit is consumed", `:51`은 "do not complete the requested clip count do not affect your credit balance"라고 안내한다. 실제로는 `inngest/functions.ts:658`이 clipsFound>=1을 완료 경로로 보내고 `entities/uploaded-file/api/index.ts:827`이 clipsFound만큼 차감한다 — 3개 요청/2개 생성이면 무료 3크레딧 중 2가 소진되는데 페이지는 0이라고 적혀 있다. 수정 방향은 문구 쪽이다: `app/terms/page.tsx:86`("deducted only for clips that are successfully generated")과 `:202`가 이미 새 동작을 옳게 기술해, 지금은 약관과 FAQ가 서로 모순인 상태다. `pricing/ui/index.tsx:32`와 `product-tour/config/index.ts:74`는 확인 결과 정확하므로 건드릴 필요 없다. 같은 거짓 문장이 `README.md:198-199`에도 있으나 web-dev 담당 범위(`apps/web/src/**`) 밖이라 별도 처리가 필요하다

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
