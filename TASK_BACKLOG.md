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

- [ ] **FEAT-22**: 파이프라인 보드 읽기의 최대 5분 지연 제거 — raw CDN을 contents API로 교체
  - area: apps/admin/src/fsd/entities/pipeline
  - source: 사용자 관측(2026-08-26 세션). **관측**: 게이트 도장 직후에도 대시보드가 낡은 보드를 최대 5분 보여줌 — 전역 「파이프라인 실행」 버튼이 "진행할 작업 없음"으로 잠기고, FEAT-20 잠금 칩 문구("보드 반영 대기")가 이 지연의 존재를 전제한다. 이번엔 "계획 지시 전인데 책상 버튼이 전부 활성"이라는 의문으로 재부상. **진단(코드 확정)**: `src/fsd/entities/pipeline/api/queries.ts:8`이 `BOARD_RAW_URL`(raw.githubusercontent.com)을 `cache: "no-store"`로 읽지만, raw CDN의 엣지 캐시 max-age=300은 클라이언트 캐시 모드와 무관하게 낡은 본문을 준다. **수정 방향**: contents API GET으로 교체(base64 디코드 필요). 인증은 기존 `GITHUB_PIPELINE_TOKEN` 재사용 — 비인증 contents API는 IP당 60회/시라 Vercel 공유 IP에서 위험, 인증 시 5,000회/시로 1인 운영 무관. 토큰 부재 시 raw CDN 폴백 유지. 앱 내 선례: agent-report·repo-doc 엔티티가 이미 contents API를 쓴다. **후속(이 항목 범위 밖)**: dev 책상 「작업 진행」 버튼의 보드 상태 게이팅은 읽기가 신선해진 뒤에만 정당하므로, 계획서 「범위 밖 의존」으로 기록해 승계한다.

- [ ] **BUG-07**: 폰 뷰포트에서 `/pipeline` "당신의 책상" 배너 라벨이 판독 불가 수준으로 작게 렌더됨
  - area: apps/admin/src/fsd/pages/pipeline
  - source: FEAT-19 배포 확인 2차 스윕(2026-08-24, `docs/agents/main-loop/FEAT-19.md`). **관측**: 375px 스크린샷에서 배너 전체가 축소돼 "당신의 책상 / 결재 N건이 도장을 기다립니다" 라벨이 깨알 크기 — 데스크톱은 정상. **진단(추정)**: 배너 SVG가 고정 viewBox의 비율 축소라 텍스트도 함께 줄어듦. FEAT-07 승인 시안의 폰 데모에는 배너가 없어 시안 위반은 아님 — 폰 전용 배너 처리(라벨 분리 또는 최소 크기)가 필요할 것으로 보임.

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
- `source`를 쓸 때는 **관측과 진단을 분리한다.** 무엇을 봤는지(관측)와 왜 그렇다고 생각하는지(진단)를 한 문장에 섞지 않고, 진단은 추정임을 표시한다. FEAT-02가 실제로 이렇게 틀렸다 — 관측("10분 소스에 4개 요청 시 적게 생성됨")은 맞았는데 진단("유저가 무리한 개수를 골라서")이 틀렸고, 둘이 섞여 있어 담당 에이전트가 틀린 진단을 요구사항으로 받아 계획을 세 번 썼다. 반대로 BUG-06은 `파일:줄` 근거, 이미 맞는 곳, 수정 방향까지 적혀 있어 계획이 한 번에 끝났다.
