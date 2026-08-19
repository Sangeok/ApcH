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

- [ ] **FEAT-14**: `/pipeline` 기록 열람을 대시보드 안에서 — 항목 축 재배치 + 내부 문서 뷰어
  - area: apps/admin
  - source: 소유자 직접 발주 (2026-08-19, 채팅 설계 합의). 아래가 발주 계약이다.
  - 관측 (2026-08-19 실측):
    1. 책상 아래 `DeskReports`(`pixel-office.tsx`)가 에이전트별 보고서 파일명을 평문으로 전부 나열한다 — 링크가 없어 열 수 없다. 보고서는 append-only 규약(`docs/agents/README.md`)이라 목록은 계속 자라고, 코드포인트 파일명 정렬은 최근성 순서가 아니다.
    2. `getAgentReportIndex()`가 fetch하는 `docs/agents/main-loop/` 기록(검증 라운드·게이트 결정)은 책상 roster에 main-loop이 없어 화면 어디에도 나오지 않는다 — 매 요청 fetch만 되고 버려진다.
    3. 기록의 실제 소비 시점은 게이트 결정이다 — 게이트②에서 계획서와 검증 기록을 읽어야 하는데, 지금은 GitHub로 이탈해야만 읽을 수 있다(소유자가 마찰로 확인).
  - 요구 (core):
    1. 항목 카드(결재함·보고)에 그 항목의 **실재하는** 문서 링크 — 계획서(`docs/plans/<ID>.md`)·행위자 기록(`docs/agents/<행위자>/<ID>.md`). 실재 판별은 이미 fetch하는 report index 재사용(신규 요청 0).
    2. 내부 뷰어 라우트(RSC, `requireAdmin`, force-dynamic): dev 브랜치 raw CDN에서 파일을 서버 fetch해 GFM 렌더(마크다운 렌더러 의존성 1개 수준). raw CDN은 파일 내용은 준다 — 404는 디렉터리 목록뿐(실측).
    3. 컨텍스트 헤더: 경로에서 유도한 문서 종류 배지(계획서=현재 계약 하나만 유효 / 보고서=append-only 누적 기록) + 항목 ID.
    4. 경로 화이트리스트: `docs/plans/`·`docs/agents/` 밖은 렌더하지 않는다 — URL 파라미터가 fetch 경로가 되기 때문.
    5. GitHub 원문 링크(렌더 한계의 탈출구). 책상 아래 파일명 나열은 제거하고 "기록 N건"만 남긴다.
  - 스코프 결정 사항 (계획서·게이트②에서 확정, 괄호는 소유자와 합의된 권장):
    - (a) 뷰어 헤더에 보드 현재 상태 칩 + 항목이 `검토대기`면 게이트② 승인·반려 버튼(기존 `GateTransitionButton`/`RejectActions` 재사용) — **포함 권장**
    - (b) 같은 항목 서류철 탭: 계획서 ↔ 검증 기록 ↔ 구현 보고, 실재하는 것만 — **포함 권장**
    - (c) `##` 절 목차(append 누적 대비) — **보류**: 문서가 커져 실제 불편이 생기면 후속
  - 비목표: 편집·코멘트(어드민 외부 쓰기 2경로 유지 — 뷰어는 순수 읽기), 화이트리스트 밖 경로 렌더, 캐시(no-store 유지), 파일 커밋 일시 표시, dialog/intercepting route(후속에 뷰어 위에 얹을 수 있음).
  - 참고: 고정명 문서(`감사기록.md`·`정찰기록.md`)는 항목 무관이라 탭 없이 단독 렌더. 리포가 public이라 raw fetch에 토큰 불필요. 기각된 대안과 근거(GitHub 링크만·dialog·아카이브 페이지·최근 N건 나열)는 발주 대화에 있고, 핵심 기각 사유는 각각 흐름 이탈·긴 문서와 CSP·1인 운영 과잉·최근성 미도출이다.

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
- `source`를 쓸 때는 **관측과 진단을 분리한다.** 무엇을 봤는지(관측)와 왜 그렇다고 생각하는지(진단)를 한 문장에 섞지 않고, 진단은 추정임을 표시한다. FEAT-02가 실제로 이렇게 틀렸다 — 관측("10분 소스에 4개 요청 시 적게 생성됨")은 맞았는데 진단("유저가 무리한 개수를 골라서")이 틀렸고, 둘이 섞여 있어 담당 에이전트가 틀린 진단을 요구사항으로 받아 계획을 세 번 썼다. 반대로 BUG-06은 `파일:줄` 근거, 이미 맞는 곳, 수정 방향까지 적혀 있어 계획이 한 번에 끝났다.
