# PROJECT_BOARD

> PM 에이전트가 TASK_BACKLOG.md에서 오늘 처리할 1~2개를 골라 여기에 "승인대기"로 기록한다.
> 단, 미결(`완료`·`보류`가 아닌 것) 항목이 2건 이상이면 새로 기록하지 않는다 — 먼저 진행시키거나 그 행을 지운다.
> 새 섹션은 이 안내 블록 바로 아래(최신순)에 들어간다.
>
> status 전이:
> `승인대기`(PM) → `계획지시`(**사용자만**) → `검토대기`(에이전트) → `구현승인`(**사용자만**) → `완료`·`보류`(에이전트)
>
> 담당 에이전트는 `계획지시`면 `docs/plans/<항목ID>.md`에 계획서만 쓰고 멈춘다.
> **`구현승인`이어야 코드를 고친다.** `완료`로 기록할 때 TASK_BACKLOG.md에서도 그 항목을 제거한다.
> `보류`에서 재개할 때는 계획부터 다시 받으려면 `계획지시`, 기존 계획으로 이어가려면 `구현승인`으로 되돌린다.

## 2026-08-03
- [ ] FEAT-01: Credit System 마무리
  agent: web-dev
  area: apps/web/src/fsd/features/billing + apps/web/src/fsd/entities/user + apps/web/src/inngest
  status: 승인대기
  근거: 현재 "개발 중" 상태로 남아 결제 흐름의 기반이 되는 항목. 결제 자체는 Polar로 이미 동작하므로, 크레딧 시스템을 완성해야 후속 작업이 안정적으로 얹힌다.
- [ ] BUG-05: 부분 생성 결과를 실패로 처리해 만들어진 클립을 버리는 문제
  agent: web-dev
  area: apps/web/src/inngest/functions.ts + apps/web/src/fsd/entities/uploaded-file/api + apps/web/src/fsd/features/upload + apps/web/src/fsd/pages/upload-detail
  status: 검토대기
  근거: 백로그의 "차감/환불 정합성 오류"는 오진이었다 — 차감이 성공 전이와 같은 트랜잭션에 한 번만 붙어 있어 원장은 정합적이고, 되돌릴 차감 자체가 없다. 실제 문제는 Modal이 요청보다 적은 클립을 정상 생성했을 때(예: 3개 요청 / 2개 생성) web이 이를 실패로 판정해(src/inngest/functions.ts:636) 이미 만들어진 클립을 사용자에게 보여주지 않고 버리는 것이다. 사용자는 0개를 받고, 재시도해도 같은 영상이라 같은 결과가 나오며, 요청 개수를 줄일 경로도 없다(targetClipCount는 업로드 시점에만 쓰인다). 방향은 "부분 성공 수용"으로 확정한다 — clipsFound >= 1을 성공으로 처리하고 생성된 수만큼 과금해 만들어진 클립을 전달한다. 함께 처리할 것 둘: (1) 완료 처리되면 재시도가 유료가 되므로, 같은 결과가 반복될 가능성을 알리거나 재시도 진입을 막는다. (2) backendFailureMessage 유무로 "후보 부족"과 "처리 중 크래시"를 구분할 수 있으니 각각을 어떻게 다룰지 계획서에서 판단한다 — 기본 방향은 어느 쪽이든 만들어진 클립은 전달하는 것이다.

