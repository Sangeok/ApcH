# FEAT-62 — 설정 화면 캡션 미리보기 드래그로 세로 위치 지정(세로만)

## 2026-10-14 구현 (web-dev)

`docs/plans/FEAT-62.md`(클린 패스본, 보드 `구현승인`)를 파일에서 다시 읽고 그대로 구현했다.
구현 전 「현재 동작」을 코드와 대조해 전부 일치함을 확인했다(B-3 통과). 전제 FEAT-61은 같은 날 Modal 배포됨.

### 기준선(구현 전, 직접 재측정)
- `npm run check -w apps/web` → EXIT 0
- `npm test -w apps/web` → 198/198 (49 suites)

메인 루프가 브리핑한 기준선과 동일.

### 고친 파일 전수 (13 = 수정 11 + 신규 2)

수정:
1. `apps/web/src/fsd/shared/config/constants.ts` — `CAPTION_STYLE_OPTIONS.MARGIN_V_RANGE: { MIN: 0, MAX: 960 }` 추가(caption_position.py 동기 주석). `CaptionStyle` 타입에 `marginV: number | null` 추가. `CAPTION_STYLE_PRESETS`의 satisfies를 `Omit<CaptionStyle, "position">` → `Omit<CaptionStyle, "position" | "marginV">`. `CAPTION_RENDER.MARGINV` 주석의 백엔드 파일을 `main.py` → `apps/backend/caption_position.py`로.
2. `apps/web/src/fsd/shared/config/caption-style-schema.ts` — `z.object`에 `marginV: z.number().int().min(…MIN).max(…MAX).nullable()` 추가(7→8필드). satisfies 유지. 머리 주석 동기 범위에 `caption_position.py: marginV 0-960` 추가.
3. `apps/web/src/fsd/features/caption-style/model/caption-preview.ts` — `getPreviewLineHeightPx(assFontSize, previewHeightPx)` 신설(libass 줄 상자 = fontsize × scale). `getPreviewVerticalInset` 시그니처에 `marginV` 추가, top/bottom에서 `marginV ?? CAPTION_RENDER.MARGINV[가장자리]` 축척, middle 불변. 주석 갱신.
4. `apps/web/src/fsd/features/caption-style/model/effective-caption-style.ts` — `EffectiveCaptionStyle`에 `marginV: number | null`, 반환에 `marginV: style?.marginV ?? null` 패스스루.
5. `apps/web/src/fsd/features/caption-style/ui/CaptionPreviewPlayer.tsx` — `marginV` prop + 선택적 `onVerticalChange` prop, 포인터 드래그(포인터 캡처·잡은 지점 보정)·방향키 슬라이더, `getPreviewVerticalInset` 호출에 `marginV` 전달, `<p>`의 `leading-tight`를 `lineHeight: ${lineHeightPx}px`로 교체, 컨테이너에 `ref={containerRef}`.
6. `apps/web/src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx` — `EMPTY_STYLE`에 `marginV: null`, effective에서 `marginV` 구조분해, 미리보기에 `marginV`·`onVerticalChange`(`sample`일 때만) 전달, Position 버튼 `emit({ position, marginV: null })`, Position 묶음 아래 `sample`일 때 드래그 안내 한 줄.
7. `apps/web/src/fsd/features/caption-style/ui/CaptionStyleThumbnail.tsx` — `getPreviewVerticalInset(effective.position, effective.marginV, 100)`.
8. `apps/web/src/fsd/features/settings/api/index.ts` — `saveDefaultCaptionStyle`의 validate가 `safeParse({ ...value, marginV: value.marginV ?? null })`로(옛 저장값 키 누락 흡수).
9. `apps/web/src/fsd/features/caption-style/model/caption-preview.test.mjs` — `getPreviewLineHeightPx` import. `getPreviewVerticalInset` 3케이스에 `marginV` 인자(null) + 지정 marginV(top·bottom) + 저장 0 보존(top·bottom) + middle marginV 무시, 신규 `getPreviewLineHeightPx` suite(122·130). (+3 테스트, +1 suite)
10. `apps/web/src/fsd/features/caption-style/model/effective-caption-style.test.mjs` — 전수 비교 3케이스 기대 객체에 `marginV: null` + 저장 marginV 300·0 패스스루 케이스. (+1 테스트)
11. `apps/web/src/fsd/features/caption-style/model/caption-presets.test.mjs` — `withPosition`이 `marginV: null`을 넣어 8필드 완전 형태를 만들게. (테스트 수 불변)

신규:
12. `apps/web/src/fsd/features/caption-style/model/caption-vertical-drag.ts` — 지오메트리 순수 함수 넷: `clampMarginV`, `resolveVerticalDrop`, `verticalDropToCenterPx`, `captionHeightPercent`.
13. `apps/web/src/fsd/features/caption-style/model/caption-vertical-drag.test.mjs` — 위 넷의 분기·클램프·경계·왕복·marginV 0·단조성. 5 suite / 14 테스트.

`git status --short`로 변경 집합이 계획 「고칠 파일」 13행과 정확히 일치함을 확인(범위 밖 파일 0). 저장소 루트의 미추적 `nul`은 Windows 예약 이름 찌꺼기로 건드리지 않았다.

### 스케치 대비 차이

분기 순서·조건·리터럴 값·사용자에게 보이는 문구: **차이 없음.** 스케치의 값·조건·문구를 그대로 썼다
(KEYBOARD_STEP_PX=4, MARGIN_V_RANGE {0,960}, aria-label "Caption vertical position", aria-valuetext "`${heightPercent}% from bottom`", 안내 "Or drag the caption in the preview to set its height.").

`CaptionPreviewPlayer`의 부분 스케치 조립 방식(계획이 "// … 본문"·"나머지 기존 스타일 그대로"로 남긴 부분):
- 새 `useRef`(captionRef·grabOffsetRef·containerRef)·`draggable`·`inset`·네 포인터/키보드 핸들러·`commitFromCenter`를 기존 `const inset = getPreviewVerticalInset(...)` 줄 자리에 넣어 컴포넌트 함수 최상위(조건·콜백 밖)에 뒀다 — hook 순서 불변.
- `lineHeightPx`·`heightPercent`는 계획대로 기존 `fontPx` 바로 아래에 뒀다.
- `<p>`는 스케치의 새 속성(ref·cn className·tabIndex·role·aria-*·onPointer*/onKeyDown·lineHeight)과 기존 보존 스타일(color·textTransform·WebkitTextStroke·paintOrder·textShadow)을 합쳤다. 컨테이너 `<div>`의 `pointer-events-none`은 유지하고 `<p>`만 `pointer-events-auto`(draggable일 때)로 잡는다.
- `React.PointerEvent`/`React.KeyboardEvent`는 @types/react의 전역 `React` 네임스페이스(`export as namespace React`)로 해석된다 — 기존 `login-form/ui/index.tsx`의 `React.ComponentProps` 용법과 동일해 React import를 새로 넣지 않았다.
- 포매팅: `verticalDropToCenterPx(...)`·`captionHeightPercent(...)` 호출을 prettier/eslint 규칙에 맞춰 여러 줄로 쪼갰다(공백만, 동작·분기·리터럴·문구 무관).

### 검증 (구현 후, 둘 다 통과)
- `npm run check -w apps/web` → EXIT 0 (typecheck + verify:fsd PASS + `next lint` 경고·오류 0)
- `npm test -w apps/web` → 216/216 (55 suites), fail 0

테스트 수 증가 198 → 216 = **+18**, 내가 추가한 케이스 수와 정확히 일치:
caption-vertical-drag.test.mjs 14 + caption-preview.test.mjs 3 + effective-caption-style.test.mjs 1 = 18. suites +6(새 파일 5 + getPreviewLineHeightPx 1).

### 골든값 근거(captionHeightPercent, assFontSize 122, PlayResY 1920 기준)
- top·null: center = 200 + 61 = 261 → round(100·(1−261/1920)) = 86
- bottom·null: center = 1920 − 260 − 61 = 1599 → 17
- bottom·0: center = 1920 − 0 − 61 = 1859 → 3
- middle: center = 960 → 50

### 테스트로 못 덮은 범위 (`tsx --test`, DOM·React 테스트 도구 없음 → 러너 한계, `보류` 사유 아님)
- 드래그 감각·포인터 캡처·터치·방향키 실제 동작(CaptionPreviewPlayer의 pointer/key 핸들) — DOM·포인터 없음. 배포 후 데스크톱 마우스·모바일 터치·키보드 방향키 수동 확인.
- 블록 높이 DOM 측정(`getBoundingClientRect`)과 미리보기 ↔ 실렌더 위치 오차 — 계획 검증 실측상 line-height 교체 뒤 한 줄 위·아래 기준 −9 ASS px, 두 줄 위 기준 아래끝 −16px. 저장 후 실제 업로드 클립 1개 위치가 미리보기와 맞는지 수동 확인(Modal 렌더는 FEAT-61 배포 뒤·소유자 승인 후).
- `inngest/functions.ts`·`caption-style-request.ts`·`app/dashboard/*/page.tsx` 캐스트 무변경 — 타입 레벨은 `npm run check`가, 실제 marginV 전달은 배포 후 실렌더가 확인.

### 비고(보고만 — web-dev가 고치지 않는 파일)
- `apps/web/CLAUDE.md` 테스트 표 — 신규 `caption-vertical-drag.test.mjs` 행 추가, `caption-preview.test.mjs` 행에 줄 높이(libass 줄 상자) 계약 반영 필요. 파일 수 30→31, suite 49→55, 테스트 198→216. 메인 루프가 인수 때 갱신(계획 「범위 밖 의존」).
- 계획 「범위 밖 의존」의 후속 후보(미리보기 가로 충실도 — libass 자간 letter-spacing)는 이 항목 범위 밖. 메인 루프가 인수 때 백로그 후보로 소유자에게 제시.
