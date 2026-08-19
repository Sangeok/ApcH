# FEAT-13 — 결재함에서 게이트② 승인 전에 계획서 검증 통과 여부가 보이게

## 구현 (2026-08-19, 게이트②)

계획서 `docs/plans/FEAT-13.md`를 파일에서 다시 읽고, 검증 라운드에서 강화된 판을 그대로 이식했다.
게이트② 승인은 추가 조건 없음 — 계획서 기본값대로 구현.

### 고친 파일 (7 — 계획서 「고칠 파일」과 1:1)

프로덕션 4:

1. `src/fsd/entities/pipeline/model/board.ts`
   - `FIELD_RE`에 `검증` alternation 추가: `/^\s+(agent|area|status|근거|결과|검증):\s*(.+)$/`
   - `BoardItem`에 `validation: string | null;` 추가(주석 "메인 루프가 클린 패스일 때만 쓴다")
   - `currentItem` 초기화에 `validation: null,` 추가(`result: null,` 뒤)
   - switch에 `case "검증": currentItem.validation = value; break;` 추가(`결과` case 뒤).
     `결과`와 달리 누적하지 않고 last-wins 대입.
2. `src/fsd/pages/pipeline/model/briefing.ts`
   - `SpeechItem`에 `validation: string | null;` 추가(`status` 아래)
   - `inboxSpeech` 승인대기 분기 반환에 `validation: null,`
   - `inboxSpeech` 검토대기 분기 반환에 `validation: item.validation,`
   - `feedSpeech` 반환에 `validation: null,`(타입 총체성)
3. `src/fsd/pages/pipeline/ui/index.tsx`
   - `ValidationMark` 컴포넌트 신설(`BudgetFlag` 아래). 통과=실선 active 칩(`border-active/60 bg-active/10 text-active`, 라벨 `검증 통과`, `title`=보드 원문), 검증 전=점선 hold 칩(`border-dashed border-hold/60 text-hold`, 라벨 `검증 전`, `title`="아직 검증 클린 패스 기록이 없습니다 — 승인 전 확인하세요")
   - `InboxCard` 메타 행 `<p>`에 `flex-wrap` 추가 + `item.status === "검토대기"`일 때만 `<ValidationMark validation={item.validation} />`를 `BudgetFlag` 앞에 렌더
4. `src/fsd/features/transition-pipeline-gate/model/transitions.ts`
   - `VALIDATION_LINE_RE = /\r?\n[ \t]+검증:[ \t]*[^\r\n]*/g;` 신설(`STATUS_LINE_RE` 아래). g 플래그 필수 주석 포함
   - `applyBounceTransition`에서 status 교체 후 `withStatus.replace(VALIDATION_LINE_RE, "")`로 검증 줄 제거.
     다른 반려 경로(hold/discard)는 손대지 않음(hold는 죽은 대기로 감·discard는 블록 통째 제거).

테스트 3:

5. `src/fsd/entities/pipeline/model/board.test.mjs` — `검증` 필드 파싱 테스트 1건 추가:
   인라인 md에 `검증:` 줄 있는 항목은 값이 담기고, 기존 `BOARD` 픽스처 전 항목은 `validation === null`(회귀).
6. `src/fsd/pages/pipeline/model/briefing.test.mjs`
   - 픽스처에 `검증:` 줄 3개 추가: FEAT-04(검토대기, 값 전달용) · FEAT-05(승인대기, null 돌연변이 감지용) · BUG-06(완료 feed, null 돌연변이 감지용)
   - 테스트 2건 추가: (a) 검토대기 inbox가 보드 `검증` 값을 나르고 승인대기·feed는 항상 null(픽스처에 줄이 있어도), (b) `검증:` 줄 없는 검토대기 항목은 null(없으면 null)
7. `src/fsd/features/transition-pipeline-gate/model/transitions.test.mjs` — bounce 검증 줄 제거 테스트 2건 추가:
   (a) 검증 줄 1개 항목 bounce → status 계획지시 + 검증 줄 제거(줄 수 -1, `validation === null`),
   (b) 검증 줄 2개 항목 bounce → 둘 다 제거(줄 수 -2) = g 플래그 고정 단언.
   검증 줄 없는 bounce의 최소 diff(status 1줄)는 기존 테스트가 회귀로 덮음(shared `BOARD`에 검증 줄 안 넣음).

### 스케치 대비 차이

없음. 분기·조건·리터럴·사용자 노출 문구 전부 「구현 스케치」대로 바이트 이식.
- 프로덕션 코드(board.ts·briefing.ts·transitions.ts·ValidationMark JSX)는 스케치 조각을 그대로 옮김.
- 테스트는 스케치가 코드를 주지 않고 「테스트」 절이 "덮는 것"만 명세하므로 자작했다. 명세가 요구한 필수 케이스를 전부 포함:
  검토대기 값 전달 / 승인대기·feed null(픽스처에 검증 줄 부여) / 검토대기 없으면 null / bounce 1줄 제거 / bounce 2줄 제거(g 플래그).

### 검증 (직접 실행, 셋 다 EXIT 0)

- `npm run check -w apps/admin` → EXIT 0 (verify:fsd:test 12/12 · verify:fsd migration · ESLint 0경고 · `tsc --noEmit` 0)
- `npm test -w apps/admin` → EXIT 0, **187 pass / 0 fail** (40 suite / 21 파일; FEAT-12 시점 182에서 +5)
  - "Failed to read pipeline progress" 로그는 기존 progress 테스트의 의도된 mock(network down/invalid json)이며 실패 아님
- `npm run verify:fsd:final -w apps/admin` → EXIT 0 (final, fetch owner 4 유지)

### 테스트로 못 덮는 범위 (도구 신설 없음 — 수동 smoke)

- `ValidationMark` 실물 렌더: 실선 active 칩 vs 점선 hold 칩, `title` 툴팁, `flex-wrap` 반응형(폰 줄바꿈), active/hold 토큰 시각 대비, 검토대기에서만 렌더되는 조건부 — Node 러너에 DOM 없음. 배포 후 데스크톱+폰 수동 확인.
- 메인 루프가 `검증:` 필드를 실제로 쓰는 절차와 값 형식 — admin-dev 코드 밖(범위 밖 의존 2).
- 보드 raw fetch·GitHub 왕복 — 모듈 계약만 덮고 live I/O는 못 덮음(기존과 동일).

### 범위 밖 의존 (닿지 않음 — 코드가 필드 부재에 graceful degrade)

계획서 「범위 밖 의존」대로, 기능이 온전히 작동하려면 admin-dev 쓰기 범위 밖 둘이 필요하나 구현이 거기 닿지 않았다:
1. `PROJECT_BOARD.md` 안내 블록 규약 문서화(검증 필드 = 클린 패스일 때만·형식 예·수동 전이 청소·라운드 상세 vs 요약 판정 구분) — 메인 루프 handoff.
2. 메인 루프가 `검증:` 필드를 쓰는 절차 자체 — 채택 순서는 코드 먼저(bounce 청소 배포 후에만 필드 기록 시작).
필드 부재 시 화면은 `검증 전` 칩을 보이므로 무해하게 degrade한다. `packages/db`·다른 워크스페이스·DB 쓰기 경로 의존 없음.

### 비고 — 읽기 전용 `apps/admin/CLAUDE.md` 동기화 (메인 루프 handoff)

「테스트 인벤토리」(`CLAUDE.md:35`): **21파일·40suite·182test → 21파일·40suite·187test**.
- 파일 수·suite 수 불변(기존 3개 test 파일에 `it` 블록만 추가, 새 describe/파일 없음).
- test +5: board.test.mjs +1 · briefing.test.mjs +2 · transitions.test.mjs +2.
- 인벤토리 표의 세 행 설명은 유지 가능하나, 원하면 각 행에 검증 필드 계약을 한 구절 덧붙일 수 있다:
  `board.test.mjs`(검증 필드 파싱 존재→값/부재→null 추가) · `briefing.test.mjs`(SpeechItem.validation 전달) · `transitions.test.mjs`(bounce의 검증 줄 제거·g 플래그).
