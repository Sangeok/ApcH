# PROJECT_BOARD

> PM 에이전트가 TASK_BACKLOG.md에서 오늘 처리할 1~2개를 골라 여기에 "승인대기"로 기록한다.
> 단, 미결(`완료`·`보류`가 아닌 것) 항목이 2건 이상이면 새로 기록하지 않는다 — 먼저 진행시키거나 그 행을 지운다.
> 새 섹션은 이 안내 블록 바로 아래(최신순)에 들어간다.
>
> status 전이:
> `승인대기`(PM) → `계획지시`(**사용자만**) → `검토대기`(에이전트) → `구현승인`(**사용자만**) → `완료`·`보류`(에이전트)
>
> 담당 에이전트는 `계획지시`면 `docs/plans/<항목ID>.md`에 계획서만 쓰고 멈춘다.
> `검토대기` 계획서의 검증은 **무편집 클린 패스(새 결함 0건)가 한 번 나오면 끝난 것이다.**
> 재검증은 계획서나 그것이 인용하는 코드가 바뀌었을 때만 돌린다 — FEAT-02에서 클린 패스 뒤에 돌린 4차가 아무것도 못 찾았다.
> **`구현승인`이어야 코드를 고친다.** `완료`로 기록할 때 TASK_BACKLOG.md에서도 그 항목을 제거한다.
> `보류`에서 재개할 때는 계획부터 다시 받으려면 `계획지시`, 기존 계획으로 이어가려면 `구현승인`으로 되돌린다.

## 2026-08-14
- [x] BUG-06: pricing FAQ가 부분 생성 시 크레딧 미차감이라고 안내하지만 실제로는 생성분만큼 차감됨
  agent: web-dev
  area: apps/web/src/fsd/pages/pricing/config
  status: 완료
  근거: 미결 1건(FEAT-01)이라 규칙상 오늘은 1건만 선정한다. BUG-06은 web-dev 범위의 고객 대면 문구가 실제 크레딧 차감 동작과 모순되는(약관과 FAQ가 서로 어긋난) 정합성 결함이라 이를 고른다.
  결과: pricingFaq의 두 답변("How does the free trial work?", "When are credits deducted?")을 실제 차감 동작(clipsFound===0 미차감, clipsFound>=1이면 생성분만큼 차감, 에러로 끝난 부분 생성도 차감)에 맞게 교체했다. 이 배열은 FAQ 화면 렌더와 schema.org JSON-LD 양쪽이 읽으므로 파일 하나로 두 표면에 반영된다. 수정: apps/web/src/fsd/pages/pricing/config/index.ts. 정적 카피 교체라 추출할 순수 함수가 없어 테스트는 추가하지 않았다(문구↔차감 로직 정합성은 사람 대조로 검증). 범위 밖: 같은 낡은 주장이 README.md:198-199·README.ko.md:345에 남아 있으나 web-dev 범위(apps/web/src/**) 밖이라 별도 처리 필요.

## 2026-08-06
- [x] FEAT-02: 업로드 영상 길이에 맞춰 클립 개수 기본값 제안
  agent: web-dev
  area: apps/web/src/fsd/pages/dashboard + apps/web/src/fsd/shared/config
  status: 완료
  근거: 미결 1건(FEAT-01)이라 규칙상 오늘은 1건만 선정한다. 백엔드 항목(BUG-02~04)은 담당 에이전트가 없어 제외되고, 선정 가능한 신규 web 항목은 실사용 관찰에서 올라온 FEAT-02뿐이라 이를 고른다.
  결과: 소스 재생 길이로 구조적 상한을 계산하는 순수 함수와 경계값 테스트를 추가하고, 업로드 UI가 드롭 시 길이를 읽어 상한 초과 개수 옵션 비활성화·선택값 하향 클램프·안내 문구·상한 0일 때 업로드 차단을 하도록 수정했다. 수정: apps/web/src/fsd/pages/dashboard/model/clip-count-budget.ts(신규), clip-count-budget.test.mjs(신규), ui/_component/UploadPodcast.tsx. 계획이 우려한 `~` 별칭은 테스트 러너에서 정상 해석돼 파라미터화 폴백은 불필요했다. 못 덮음: DOM `<video>` 측정과 컴포넌트 렌더/클램프/비활성화/안내(Node 러너에 DOM 없음), 백엔드 하이라이트 미달 생성(apps/backend 소관).

## 2026-08-03
- [ ] FEAT-01: Credit System 마무리
  agent: web-dev
  area: apps/web/src/fsd/features/billing + apps/web/src/fsd/entities/user + apps/web/src/inngest
  status: 승인대기
  근거: 현재 "개발 중" 상태로 남아 결제 흐름의 기반이 되는 항목. 결제 자체는 Polar로 이미 동작하므로, 크레딧 시스템을 완성해야 후속 작업이 안정적으로 얹힌다.
