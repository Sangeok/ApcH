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

## plan-verifier 독립 무편집 패스 — 2사이클 (2026-08-25) — 결함 0건, 클린 패스 확정

새 컨텍스트가 필수 경로 전부(1·2·3·4·5·7·8)를 증거와 함께 실행하고 무소득 보고. 실질:
인용 전수(정정된 `:12`·`:31-41` 포함) 일치 / 조립 게이트 check·test 278/59·final·build 전부 통과 +
`bg-stamp` 등 4마커 방출 검침 / before 조각 전부 `count==1` 유일 매치·골격형 앵커도 유일 /
여집합(소비 두 화면·4액션 전수 — `~/` alias라 타 워크스페이스 소비 불가까지) / 돌연변이 6/6 사멸 /
음성 시험 R13·**R1(상향 import)까지 추가**로 exit 1 확인 / 실물 렌더 4마커·Provider 무DOM
(`childOnly===wrapped`)·밖 훅 무throw. 트리 원복은 메인 루프가 `git status` 직접 검산 — 청결,
HEAD `ef63715` 불변.

**판정: 클린 패스 (2026-08-25, 독립 무편집 1라운드 — plan-verifier 2사이클째).**
보드에 `검증:` 줄 기록. 게이트② 대기.

## 검증 3라운드 (2026-08-25) — 사용자 지시 재검증, 무편집 클린 패스 (편집 0건, 개선점 0건)

경위: 소유자가 reconciling 기반 재검증을 명시 지시("없었으면 없었다고 해야만 한다"). 반복-요청
라우팅상 재생이 아니라 전체 정식 루프(FEAT-15 3라운드 전례).

상태 비교: 클린 패스 근거(`ef63715`) 이후 변경은 보드·기록 문서뿐 — 계획서 blob `0350b24` 동일
(작업 파일 hash = HEAD blob), `apps/admin`·`.claude/agents` 무변경, 트리 청결. 따라서 기계 게이트
재실행은 비트 동일 재생이라 제외하고(2사이클이 같은 내용에서 전부 통과), 라운드를 **미답 분석 경로**에 썼다:

- **전 경우 매트릭스** (status×화면×액션→칩): 결재함 승인대기(도장=계획지시·반려 hold/discard —
  bounce는 `REJECT_TRANSITIONS.bounce.from=[검토대기]`라 원천 배제)·검토대기(3종 전부)·서류철
  검토대기만 — 모든 조합의 칩 라벨·마커가 코드 구조에서 결정되고 `Record<RejectAction,…>`이
  전수성을 tsc로 강제. 불가능 조합(승인대기에서 "되돌림" 칩) 원천 차단 확인.
- **교차 버튼 동시 클릭 race**: 도장·반려는 각자 useTransition이라 서로를 disabled로 안 막음 —
  짧은 창에서 동시 발사 가능하나 서버에서 한쪽만 성공(스테일 가드+sha 409, 둘 다 성공 불가) →
  성공한 쪽만 setLock → 칩이 실제 전이를 정확히 표시. 결함 아님(도출 가능·구현 지침 불변) — 관찰.
- **포커스 소실(a11y)**: 성공 시 버튼→span 교체로 포커스가 body로 떨어짐. 기존 화면들(FEAT-08·09)도
  성공 후 포커스 관리가 없어 이 항목만의 회귀가 아니고, 토스트가 알림을 담당 — 비차단 관찰
  (계획 수정 불요, 내부 도구 관행과 일관).
- **React 19 `Context.Provider` 유효성**: 신 문법(`<Context value>`)이 추가됐을 뿐 Provider는 유효 —
  설치본 렌더 하니스가 이미 실증. discard 칩의 수명 의미(행 제거 후 카드 소멸)도 라벨과 정합.

**판정: 클린 패스, 개선점 0건.** FEAT-02·15와 같은 결과 — 클린 패스 뒤 무변경 재검증은 역대
소득 0이라는 보드 정지 규칙의 근거를 재확인. 관찰 2건은 계획 수정을 요구하지 않는다.

## 게이트② 개방 (2026-08-25)

사용자가 세션에서 "진행"으로 `구현승인` 전이를 결정했다. 메인 루프가 보드를 편집했고 결정은
사용자의 것이다. `검증:` 줄 유지(전진 전이). admin-dev를 구현으로 디스패치 — 백로그 FEAT-20
항목 제거 시 바로 아래 BUG-07 항목을 건드리지 않도록 명시(이전 편집 사고의 재발 방지).
구현 후 잠금 실동작(수동 smoke 목록)은 dev→main 합류·배포 뒤 원장에서 닫는다.

## 완료 인수 (2026-08-25) — 다섯 조건 직접 재현, 전부 통과

1. **변경 파일 ↔ 「고칠 파일」**: 신규 1 + 수정 7, 표와 정확히 일치. 표 밖 없음.
2. **diff ↔ 스케치**: `gate-card-lock.tsx`는 계획서 §1 코드 블록과 **바이트 동일**(기계 대조).
   수정 7파일의 훅 전부 스케치 원문 — model 추가·버튼/반려 배선·index export·테스트 describe.
3. **검증 재실행**: check EXIT 0 · test **278/59** · verify:fsd:final EXIT 0 · build EXIT 0 — 넷 다 직접.
4. **백로그 제거**: FEAT-20 소멸, **BUG-07 3줄 무결 직접 확인**(제목·area·source 원문 그대로).
5. **상세 기록 실재**: `docs/agents/admin-dev/FEAT-20.md`(7,652B) — 파일 표·스케치 무차이 상세·
   검증 출력·handoff가 실제와 부합.

후속 동기화(메인 루프): `apps/admin/CLAUDE.md` 테스트 인벤토리 58→59 suite·276→278 test(파일 27
불변), transitions.test.mjs 행에 잠금 칩 문구 계약 추가. 원장에 FEAT-20 절 등재(수동 smoke 6줄 —
배포 전, dev→main 합류 후 확인). status `완료` 수리.

Minimal Replay Anchor (적용성 증거일 뿐): HEAD `17cf453`(dev) · 원천 docs/plans/FEAT-20.md@17cf453 ·
경계 apps/admin/src/fsd/{features/transition-pipeline-gate/**, pages/pipeline/ui,
pages/doc-viewer/**, pages/pipeline/model/briefing.ts} + globals.css · 레시피 컴포넌트명 grep +
feature 경로 import grep + 조립 게이트 4종 + 방출 검침 + R11 음성 + 렌더 하니스 + 돌연변이 3 ·
프로파일 Standard(전체 증거) · 최종 패스 무편집.
