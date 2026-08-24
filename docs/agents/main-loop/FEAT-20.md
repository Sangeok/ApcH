# FEAT-20 — 메인 루프 기록 (게이트 결정·검증 라운드)

## 게이트① 개방 (2026-08-24)

소유자 직접 발주("발주해") — pm 미경유. 발주 계약은 백로그 FEAT-20(버튼 잠금 관측·서버 방어
사실·방향 제안). 보드 행 커밋 `3d5a4f1`.

## 계획서 접수 (2026-08-24)

admin-dev 디스패치(로컬, backend-dev와 병렬 — 커밋 직렬화를 위해 에이전트 git 사용 금지) →
`docs/plans/FEAT-20.md` 작성, 보드 행 `검토대기`(커밋 `4fe6c95`). 요지: feature 레벨
카드 단위 잠금 컨텍스트(`GateCardLock`) 신설, 네 액션(도장·되돌리기·보류·폐기) 성공 분기에서만
잠금, 도장 자리는 비상호작용 `LockedChip`("도장 찍음 · 보드 반영 대기" 등 4문구), 소비자 두 화면
(결재함 `InboxCard`·서류철 `DocViewer`) 공통 적용. 수정 7 · 신규 1.

부수 소득: 계획 비고가 백로그의 **BUG-07 제목 줄 유실**(메인 루프의 FEAT-20 삽입 편집이 삼킴)을
잡아 같은 커밋에서 복원했다.

## 검증 필수 경로 확정 (2026-08-24, 카탈로그 `docs/plans/verification-paths.md`)

| # | 경로 | 판정 | 근거 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | **필수** | 모든 항목 |
| 2 | 스케치 추출·실행 | **필수** | 스케치 실재 — 실제 tsconfig·eslint로 컴파일·린트 |
| 3 | before/after 기계 적용 | **필수** | 수정 7파일 |
| 4 | 전칭 여집합 열거 | **필수** | "버튼을 렌더하는 화면은 둘뿐"·"네 액션 모두" 전칭 — 소비자·액션 전수 열거 |
| 5 | 돌연변이 검사 | **필수** | 잠금 상태 로직 신설 — 테스트 명세를 실행체로 옮겨 돌연변이 사멸 확인 |
| 6 | 실제 사건 재생 | 제외 | 외부 신호 해석 없음(클라 상태 전이) — 스테일 가드는 기존 검증 자산 |
| 7 | 음성 시험 | **필수** | FSD 경계·재수출 규칙에 기댐(`index.ts` 수정) — 경계 검사 음성 시험 |
| 8 | 실물 렌더 | **필수** | 화면 변경(`LockedChip`·패널 숨김) — `renderToStaticMarkup` 계열 |
| 9 | 구조적 아티팩트 | 제외 | schema·config 변경 없음 |

계획서가 명시한 재확인 전제: `router.refresh()`의 클라 useState 보존 / `item.key` 안정성으로
Provider 유지 / 서버 컴포넌트 children으로의 컨텍스트 전파 / `bg-stamp` Tailwind 방출 /
보드 flip 후 잔여 잠금 부재 — 위 경로 실행 중 함께 검증한다.

검증 순서: BUG-03 먼저(먼저 접수), FEAT-20 다음 — 메인 루프 검증은 직렬이다.

## 검증 1라운드 (2026-08-25, reconciling — Standard 프로파일·전체 증거) — 결함 1건, 편집 1회

방법: 계획서 8개 변경을 실제 트리에 **기계 조립**해 진짜 게이트를 돌리고, 종료 후 원복
(`git status` 청결 검산·기준선 276/276 재확인). BUG-03 인수와 교차 없이 apps/admin만 사용.

**경로 실행 증거**

- **1 인용 전수**: 버튼 2파일·transitions.ts(`:19-26`·`:120`·`:156-160`·`:175`·`:209`·`:281`)·
  index.ts(`:1-2`)·pipeline ui(`:8-13`·`:164-218`·`:181-204`)·doc-viewer ui(`:3-6`·`:13-15`·`:36-69`)·
  build-doc-view(`:47-48`·`:60`)·briefing(`:267`)·commit-gate-transition(`:27`)·globals.css 토큰 —
  전부 내용까지 실측 일치. **`item.key = item.id` 실측**(briefing.ts `:106`·`:121`·`:179`) —
  잠금 수명 전제 성립.
- **4 여집합**: 버튼 소비자 grep 전수 — 정확히 두 페이지(pipeline·doc-viewer)뿐. 네 액션
  (도장+반려 3)이 전부 잠금 대상임을 스케치·REJECT_TRANSITIONS 열거로 확인.
- **2·3 조립 실행**: 신규 1+수정 7 기계 적용 → `npm run check` **EXIT 0**(fsd fixture·tree·
  ESLint 0·tsc 0 — 결함 ① 수정 후), `npm test` **278/278**(276+신규 2 it), `verify:fsd:final`
  **EXIT 0**, 프로덕션 `build` 통과. §6·§7 골격형 스케치는 라인 범위가 정확해 무모호 적용.
- **Tailwind 방출 검침**: 빌드 CSS에 `.bg-stamp{background-color:var(--stamp)}` **HIT**
  (신규 유틸리티 — v4 스캐너가 문자열 리터럴에서 수집). `bg-hold` 등 기존 마커도 방출.
- **7 음성 시험**: index.ts에 서버 액션 재수출을 심으니
  `[R11] feature roots must not re-export Server Actions` **exit 1**, 제거 후 통과 —
  GateCardLock 컴포넌트 export는 경계 통과(정당).
- **8 실물 렌더**: tsx 러너 + `renderToStaticMarkup` — LockedChip 4종(마커 stamp/active/hold/
  destructive·`aria-hidden`·`size-2`·muted 라벨) 마크업 정확, **Provider 무DOM 실증**
  (`<i>true</i>` 그대로 — 계획의 레이아웃 불변 주장), Provider 밖 훅의 no-op 폴백 동작.
- **5 돌연변이 3종**: 라벨 가운뎃점 변경·bounce 낱말 스왑·접미(`· 보드 반영 대기`) 탈락 —
  **전원 사멸**(신규 2 it가 잡음).

**결함 → 편집 (1건)**

1. **[블로커] 스케치의 no-op 기본값 `setLock: () => {}`가 `@typescript-eslint/no-empty-function`
   위반** — 계획서 스스로 성공 기준으로 둔 lint가 exit 1(FEAT-10 ⑯과 같은 부류, 조립 실측).
   `() => undefined`(표현식 본문)로 교체하고 제약 주석을 스케치에 남김.

프레임워크 전제 처리: `router.refresh()`의 클라 상태 보존은 Next 문서화된 동작이고 계획이
수동 smoke + 서버 가드 fail-safe로 명시 — 증거 있는 범위 밖 처리 유지. 서버 컴포넌트
children 합성의 컨텍스트 전달은 빌드 컴파일 + 렌더 하니스로 방증.

Pass State: editing pass · source changed=yes · blockers resolved=1 · remaining=0 · next=무편집 최종 패스.

## 검증 2라운드 (2026-08-25) — 무편집 클린 패스 (편집 0건, 결함 0건)

최신 저장본(`17cf453`) 기준 재수립: §1이 게이트를 통과한 조립 검증본과 동일(조립은 결함 ① 수정
**후** 실행됐으므로 통과 증거가 현재 계획서 원문에 그대로 대응). Coverage Stability —
"버튼 소비자는 두 페이지뿐"을 2차 레시피(feature 경로 import 전수)로 재검: importer 4 중
버튼 소비는 두 페이지 ui뿐, 나머지 둘(briefing·build-doc-view)은 순수 함수만 —
계획서 「현재 동작」 기술과 일치. 사용자 노출 문구 4종은 리터럴 테스트로 고정(278/278).

**판정: 메인 루프 무편집 클린 패스.** plan-verifier 독립 패스 디스패치.

## plan-verifier 독립 패스 — 1사이클 (2026-08-25) — 결함 2건 (문서 위생)

독립 패스가 6경로 전부 실행(조립 게이트 4종·15개 before 조각 유일 매치·방출 4색 검침·R11에 더해
**R13 음성 시험까지 추가**·렌더에서 Provider 무DOM `<span id="child">` 정확 일치·돌연변이 10/10 사멸)
후 결함 2건 보고 — 둘 다 §디자인 방향의 줄번호 인용:

1. `globals.css:36-41` 주장에서 destructive(`:34`)·muted-foreground(`:31`)가 범위 밖 → `:31-41`로 정정.
2. "12px AA 미달" 기록은 `gate-transition-button.tsx:12`(주장 `:13`) → `:12`로 정정.

둘 다 메인 루프가 실측 재확인 후 계획서 수정. **메인 루프 1라운드가 ±1줄 어긋남을 관용한 지점을
독립 패스가 정확 기준으로 문 것** — 독립 검증의 소득. 트리 원복은 보고와 별개로 `git status` 직접
검산(청결). 구현 오류 유발 결함 0건. 계획서가 바뀌었으므로 2사이클 디스패치.

Minimal Replay Anchor (적용성 증거일 뿐): HEAD `17cf453`(dev) · 원천 docs/plans/FEAT-20.md@17cf453 ·
경계 apps/admin/src/fsd/{features/transition-pipeline-gate/**, pages/pipeline/ui,
pages/doc-viewer/**, pages/pipeline/model/briefing.ts} + globals.css · 레시피 컴포넌트명 grep +
feature 경로 import grep + 조립 게이트 4종 + 방출 검침 + R11 음성 + 렌더 하니스 + 돌연변이 3 ·
프로파일 Standard(전체 증거) · 최종 패스 무편집.
