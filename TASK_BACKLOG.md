# TASK_BACKLOG

> 최초 부트스트랩: README.md의 Known Issues / Credit System 항목을 옮겨 담음.
> PM 에이전트는 이 파일과 PROJECT_BOARD.md만 읽고 우선순위를 판단한다.
> 보드에 올라가는 것만으로는 제거하지 않는다. 담당 에이전트가 보드에 `status: 완료`로 기록한 시점에, 그 에이전트가 여기서 해당 항목을 제거한다.
> `area`는 실제 코드 경로여야 한다. PM은 코드를 읽지 않으므로 이 값을 그대로 보드에 옮긴다 — 여기가 틀리면 보드도 틀린다.

## Backend / Pipeline

- [ ] **BUG-02**: 한국어 번역 API 실패 시 영어로 조용히 폴백됨 (사용자에게 알림 없음)
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

- [ ] **FEAT-20**: 게이트 도장·반려 성공 후 해당 카드 버튼을 "반영 대기" 상태로 잠그기 — CDN 잔상 5분 동안 재클릭 유도 제거
  - area: apps/admin/src/fsd/features/transition-pipeline-gate
  - source: 소유자 첫 도장 실사용(2026-08-24, BUG-03 게이트①). **관측**: 성공 토스트 후에도 카드의 계획지시·반려 버튼이 활성으로 남아 계속 누를 수 있다 — 보드 투영이 최대 5분(raw CDN) 낡아 있는 동안. **방어는 이미 서버에 있다**: 재클릭은 스테일 가드가 거부하고 실측 게이트 커밋도 1건뿐(f028537) — 데이터 결함이 아니라 유도(affordance) 결함이다. **방향(제안)**: 클라이언트가 전이 성공을 기억해 해당 카드의 도장·반려 버튼을 비활성 + "도장 찍음 · 보드 반영 대기" 표시로 렌더. FEAT-10이 실행 콘솔 쪽에 넣은 "보드 반영까지 최대 5분" 안내의 결재함 카드판이다.

- [ ] **BUG-07**: 폰 뷰포트에서 `/pipeline` "당신의 책상" 배너 라벨이 판독 불가 수준으로 작게 렌더됨
  - area: apps/admin/src/fsd/pages/pipeline
  - source: FEAT-19 배포 확인 2차 스윕(2026-08-24, `docs/agents/main-loop/FEAT-19.md`). **관측**: 375px 스크린샷에서 배너 전체가 축소돼 "당신의 책상 / 결재 N건이 도장을 기다립니다" 라벨이 깨알 크기 — 데스크톱은 정상. **진단(추정)**: 배너 SVG가 고정 viewBox의 비율 축소라 텍스트도 함께 줄어듦. FEAT-07 승인 시안의 폰 데모에는 배너가 없어 시안 위반은 아님 — 폰 전용 배너 처리(라벨 분리 또는 최소 크기)가 필요할 것으로 보임.

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
- `source`를 쓸 때는 **관측과 진단을 분리한다.** 무엇을 봤는지(관측)와 왜 그렇다고 생각하는지(진단)를 한 문장에 섞지 않고, 진단은 추정임을 표시한다. FEAT-02가 실제로 이렇게 틀렸다 — 관측("10분 소스에 4개 요청 시 적게 생성됨")은 맞았는데 진단("유저가 무리한 개수를 골라서")이 틀렸고, 둘이 섞여 있어 담당 에이전트가 틀린 진단을 요구사항으로 받아 계획을 세 번 썼다. 반대로 BUG-06은 `파일:줄` 근거, 이미 맞는 곳, 수정 방향까지 적혀 있어 계획이 한 번에 끝났다.
