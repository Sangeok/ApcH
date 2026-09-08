# FEAT-35 — 클립 경계 편집 루프를 닫는다 (구현 보고)

## 2026-09-08 — 구현 (구현승인 → 완료)

계획서 `docs/plans/FEAT-35.md`를 파일에서 다시 읽고 그대로 구현했다. B-3 확인:
계획서 「현재 동작」이 인용한 `파일:줄`을 전부 실코드와 대조했고 어긋남 없음
(Preview 버튼 `:323-330`/`:327`, `STEP_SECONDS` `:22`, `nearestBoundary` `:62-79`,
`adjustStart/adjustEnd` `:124-138`, 넛지 버튼 `:353/379/395/415`, 입력 `:359-374`/`:399-410`,
라벨 `:341/388`, 배지 `:285-286`, `roundTenth` `:58-60`, `ClipRange` `:39-42`).

### 고친 파일 (전수 — 계획 「고칠 파일」과 일치, 그 밖은 무변경)

수정 2:
- `apps/web/src/fsd/shared/lib/format-duration.ts` — `parseClockToSeconds` 추가(③). `formatSecondsAsClock`은 무변경.
- `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` —
  - 임포트: `parseClockToSeconds` 추가, `getPreviewRange`·`snapToAdjacentBoundary` 두 모델 임포트 추가.
  - 로컬 `nearestBoundary`(옛 `:62-79`) 삭제. `roundTenth`·`STEP_SECONDS` 유지.
  - `startText`/`endText` 텍스트 버퍼 state 추가(초 state 아래).
  - 넛지 `adjustStart`/`adjustEnd`를 `delta` 인자에서 `direction: "back"|"forward"` + `snapToAdjacentBoundary(..., STEP_SECONDS)`로 재작성.
  - Preview 버튼 1개 → Start/Full/End 3개(`getPreviewRange` 호출, aria-label 셋). `isSaving` 표시 유지.
  - 넛지 버튼 onClick 넷을 `("back")`/`("forward")`로 교체.
  - 라벨 `Start (s)`→`Start`, `End (s)`→`End`. 좌표계 주석을 m:ss.s 설명으로 교체.
  - Start/End 입력을 `type="number"`(초)에서 `type="text"`(m:ss.s 버퍼 + blur 커밋)로 교체. aria-label `Start time (m:ss.s)`/`End time (m:ss.s)`.

신규 5:
- `apps/web/src/fsd/widgets/clip-draft-review/model/preview-range.ts` — `getPreviewRange` + `PreviewKind`(①). pre-roll 1.5s / post-roll 3.5s.
- `apps/web/src/fsd/widgets/clip-draft-review/model/preview-range.test.mjs`
- `apps/web/src/fsd/widgets/clip-draft-review/model/boundary-snap.ts` — `snapToAdjacentBoundary`(②).
- `apps/web/src/fsd/widgets/clip-draft-review/model/boundary-snap.test.mjs`
- `apps/web/src/fsd/shared/lib/format-duration.test.mjs`

### 스케치 대비 차이 (분기 순서·조건·리터럴·사용자 문구는 모두 일치)

세 곳 모두 로직·조건·리터럴·사용자에게 보이는 문구가 스케치와 동일하다. 형식/테스트 기법만 다르다:
1. `ClipDraftCard.tsx`의 두 input `onBlur`에서 `const parsed = startText === null ? null : parseClockToSeconds(startText);`를
   prettier가 `const parsed =\n  startText === null ? ...`로 두 줄로 접었다. 값·분기 동일.
2. `preview-range.test.mjs`는 pre/post-roll 결과값(166.4·171.4·249.0·254.0)을 `assert.equal` 대신 `approx(<1e-9)`로 비교한다 —
   순수 뺄셈이라 부동소수점 오차 가능성이 있어서다. 차이는 정수초 단위라 계획이 명시한 돌연변이 4종은 그대로 사멸한다.
3. `format-duration.test.mjs` 왕복 케이스도 같은 이유로 `Math.abs(parsed - x) < 1e-9`로 비교한다.
   boundary-snap의 반환값은 전부 `roundTenth` 격자값이라 `assert.equal`로 정확 비교한다.

### 테스트 — 계획 「테스트」 절의 케이스 전수 반영, 등가변이는 제외

- `format-duration.test.mjs` (신규): `parseClockToSeconds` — `"2:47.9"→167.9`·`"2:47"→167`·맨숫자·`"0:05.5"`·공백,
  무효 10종(`"2:60"`·`"2:"`·`":30"`·`"abc"`·`""`·`"-3"`·`"2:-5"`·`"-1:30"`·`"x:30"`·`"2:xy"`)→null, 왕복.
  `formatSecondsAsClock` — `65→"1:05"`·`167.9→"2:47.9"`·`9.1→"0:09.1"`·`-5→"0:00"`.
- `boundary-snap.test.mjs` (신규): no-op 회귀(167.9→back 165.2/forward 170.3), 격자 strict 배제(167.893→167.9),
  2연속 back(170.3→167.9→165.2), 원시 현재값(167.893 → M5), forward 최소 선택(165.2→167.9 → MB4),
  back 폴백 격자-부정확(0.6→0.1 → M4)·격자값(167.9→167.4), forward 폴백 방향(170.3→170.8 → MB9).
  forward 폴백의 `roundTenth`는 계획 지시대로 **추가하지 않았다**(등가 변이 — 도달 가능한 입력으로 구별 불가).
- `preview-range.test.mjs` (신규): `("start",167.9,252.5)→{166.4,171.4}`·`("full")→{167.9,252.5}`·
  `("end")→{249.0,254.0}`·0 클램프(`("start",1.0,…)`→startSeconds 0).

### 검증 (직접 실행, 둘 다 통과)

- `npm run check -w apps/web` → EXIT 0 (verify:fsd PASS · FSD boundary analyzer 11/11 · ESLint 0 warn/err · tsc 0).
- `npm test -w apps/web` → 104 pass / 0 fail (23 suites). 종전 88 → +16(신규 3파일: format-duration 6 · boundary-snap 6 · preview-range 4).
- `git status --short`로 변경 파일 7개 확인 — 계획 「고칠 파일」과 정확히 일치, 범위 밖 파일 무변경.

### 테스트로 못 덮는 범위 (배포 후 검토 화면 수동 확인)

`npm test`는 Node 내장 러너라 DOM·React 도구가 없다. 순수 함수 밖은 이 러너로 확인 불가:
- 실제 `video.currentTime`/`play`/`pause`/`timeupdate` 재생 동작(세 프리뷰 버튼이 실제로 경계 구간을 재생하는지).
- 입력 텍스트 버퍼의 blur 커밋/복원, focus↔click 순서(편집 중 넛지 버튼 누를 때 blur→click 순서로 초 state가 먼저 확정되는지).
- 세 버튼 렌더·aria-label·`type="text"`·시계 표기 초기값·라벨 교체는 계획 검증 라운드에서 `renderToStaticMarkup` 13/13로 확인됨(마크업 계약 한정).

### CLAUDE.md 갱신 필요 (읽기 전용이라 직접 못 고침 — 보드 비고로 보고)

`apps/web/CLAUDE.md:69` 수치 `현재 15개 파일, 19 suite, 88개 테스트` → `18개 파일, 23 suite, 104개 테스트`.
테스트 목록 표에 3행 추가 필요(format-duration·boundary-snap·preview-range).
