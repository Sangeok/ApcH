# PROJECT_BOARD

> PM 에이전트가 TASK_BACKLOG.md에서 오늘 처리할 1~2개를 골라 여기에 "승인대기"로 기록한다.
> 단, 미결(`승인대기`/`승인완료`) 항목이 2건 이상이면 새로 기록하지 않는다 — 먼저 승인하거나 그 행을 지운다.
> 새 섹션은 이 안내 블록 바로 아래(최신순)에 들어간다.
>
> status 전이: `승인대기`(PM) → `승인완료`(**사용자만**) → `완료` 또는 `보류`(담당 에이전트)
> 담당 에이전트는 `승인완료`인 항목만 착수한다. `완료`로 기록할 때 TASK_BACKLOG.md에서도 그 항목을 제거한다.

## 2026-08-03
- [ ] FEAT-01: Credit System 마무리
  agent: web-dev
  area: apps/web/src/fsd/features/billing + apps/web/src/fsd/entities/user + apps/web/src/inngest
  status: 승인대기
  근거: 현재 "개발 중" 상태로 남아 결제 흐름의 기반이 되는 항목. Stripe 등 확장 기능 전에 크레딧 시스템을 완성해야 후속 작업이 안정적으로 얹힌다.
- [ ] BUG-05: 파이프라인 중간 실패 시 크레딧 차감/환불 정합성 오류
  agent: web-dev
  area: apps/web/src/inngest/functions.ts + apps/web/src/fsd/entities/uploaded-file/api + apps/web/src/fsd/entities/user/api
  status: 승인대기
  근거: 크레딧 정합성 오류는 과금과 직결되어 사용자 신뢰·매출에 직접 영향. FEAT-01과 동일한 credit 영역이라 함께 처리하기 적합하다.

