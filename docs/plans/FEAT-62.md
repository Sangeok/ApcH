# FEAT-62: 설정 화면 캡션 미리보기에서 자막을 위아래로 끌어 위치를 정한다(세로만)

agent: web-dev

> **배포 순서(백로그 `source` 「순서」·메인 루프 계약):** 이 항목의 구현·배포는 **FEAT-61(apps/backend) 배포 뒤**에 한다.
> 웹이 먼저 나가면 사용자가 끌어 놓은 `marginV`가 저장은 되지만 백엔드가 읽지 않아 프리셋 위치로 조용히 렌더되고,
> 크레딧을 쓴 뒤에야 드러난다(FEAT-51→52 전례). 계획은 병행 가능하나 **구현 승인은 FEAT-61 배포 확인 후**가 전제다.

> **공유 계약(메인 루프 고정 — 그대로 옮김, 검증은 메인 루프가 두 계획을 함께 맞춘다):**
> - `CaptionStyle`의 새 필드 `marginV: number | null` — 정수. JSON 키 이름 그대로.
> - 의미: ASS 스크립트 좌표(PlayResY 1920 = `CAPTION_RENDER.PLAY_RES_Y`) 기준, `position`이 가리키는 가장자리에서의 세로 여백.
>   - `top` → 위 가장자리 ~ 자막 블록 위쪽(지금 Top 경로 그대로)
>   - `bottom` → 아래 가장자리 ~ 자막 블록 아래쪽(지금 Bottom 경로 그대로)
>   - `middle` → `marginV` 무시
> - 허용 범위: **0 ~ 960(양끝 포함, PlayResY/2)**. zod는 백엔드와 같은 값.
> - 드래그로 놓는 자리: 블록 중심이 위쪽 절반이면 `top` + 위에서의 여백, 아래쪽 절반이면 `bottom` + 아래에서의 여백. 그래서 960을 넘지 않는다. 블록은 가까운 가장자리 반대쪽으로 자라 화면 밖으로 나가지 않고, 기존 Top/Bottom 프리셋(200/260)은 이 표현의 특수값이 된다.
> - Top/Middle/Bottom 버튼은 스냅 단축으로 남기고, 누르면 `marginV`를 null(프리셋 값)로 되돌린다.
> - `marginV`는 프리셋 소속이 아니다(`position`과 같은 취급). 프리셋을 골라도 사용자 위치가 유지돼야 한다.

## 현재 동작

캡션 스타일은 `CaptionStyle` 타입 하나(`shared/config/constants.ts:117-127`)가 원천이고, 세로 위치는 **enum `position` 하나뿐**이다 — `top`·`middle`·`bottom`(`constants.ts:50` `POSITIONS`). 프리셋 세로 여백은 상수표 `CAPTION_RENDER.MARGINV = { top: 200, bottom: 260 }`(`constants.ts:77`, PlayResY `constants.ts:75` `PLAY_RES_Y: 1920`)에만 있다.

미리보기의 세로 위치 계산은 순수 함수 `getPreviewVerticalInset(position, previewHeightPx)`(`caption-preview.ts:107-117`) 하나다 — `top`이면 `{ top: MARGINV.top*scale, bottom: null }`(`:113`), `bottom`이면 `{ top: null, bottom: MARGINV.bottom*scale }`(`:115`), 그 외(middle)는 `{ top: null, bottom: null }`(`:116`). `scale = previewHeightPx / PLAY_RES_Y`(`:77`의 `previewScale`). `CAPTION_RENDER.MARGINV`를 읽는 곳은 이 함수 둘(`:113`·`:115`)뿐이다(전수 확인).

이 함수의 소비자는 둘이다:
- `CaptionPreviewPlayer.tsx:138` `getPreviewVerticalInset(props.position, PREVIEW_HEIGHT_PX)` — 설정 화면 미리보기(이 컴포넌트의 유일 소비자는 `CaptionStyleEditor`, 그 유일 소비자는 설정 페이지의 `sample` 미리보기다). 자막 블록은 클릭 통과: 컨테이너 `<div>`에 `pointer-events-none`(`:187`)이고, 위치는 `style={{ top: inset.top ?? undefined, bottom: inset.bottom ?? undefined }}`(`:190`), 가운데 정렬은 flex `justify-center`(가로) + `centered && inset-y-0 items-center`(세로)(`:186-188`).
- `CaptionStyleThumbnail.tsx:25` `getPreviewVerticalInset(effective.position, 100)` — 업로드 폼 썸네일(읽기 전용).

**미리보기의 줄 상자는 libass 줄 상자와 다르다(메인 루프 실측, 2026-10-14).** 자막 `<p>`는 `className="text-center leading-tight"`(`CaptionPreviewPlayer.tsx:194`)라 줄 높이가 1.25em이다. libass는 ASS fontsize를 줄 상자 높이로 요청하므로(`constants.ts`의 `EM_SCALE` 주석 — REAL_DIM) 줄 상자가 fontsize 그 자체이고, Anton에서 1.25em은 그 0.72배다. marginV는 줄 상자 끝까지의 거리라(FEAT-61 「열린 질문」 3), 상자 높이가 다르면 같은 marginV에서 글자가 다른 곳에 찍힌다. 미리보기 DOM을 Chrome 헤드리스에 6배(1080×1920)로 렌더하고, 같은 값을 로컬 ffmpeg(libass)로 렌더해 흰 글자 경계 상자를 비교했다(ASS px, +는 미리보기가 아래).

| 경우 (Anton·크기 122) | `leading-tight` | line-height = fontsize × scale |
| --- | --- | --- |
| 한 줄, top 200 / 600 | −26 | −9 |
| 한 줄, bottom 260 / 600 | +8 | −9 |
| 두 줄(8단어), top 200 — 위끝 / 아래끝 | −26 / −67 | −9 / −16 |

`leading-tight`로는 위 기준 자막이 실렌더보다 26px 위에 보이고, 두 줄이면 블록 아래끝이 67px 어긋난다. line-height를 libass 줄 상자(fontsize × scale)로 맞추면 한 줄은 위·아래 기준 모두 −9px로 고르게 줄어든다. 남는 −9는 Chrome이 Anton의 줄 상자 안 글자 위치를 hhea 메트릭으로 잡기 때문이다(libass는 win 메트릭 — hhea 2409 vs win 2876, `constants.ts` `EM_SCALE` 주석). 드래그는 사용자가 "여기"라고 놓은 위치를 저장하는 기능이라 이 오차가 곧 기능의 오차다.

**웹 주석 둘이 백엔드 상수를 `main.py`의 것으로 가리킨다** — `constants.ts:77` `  MARGINV: { top: 200, bottom: 260 }, // main.py CAPTION_POSITION_MARGINV`, `caption-preview.ts:106` `// 세로 위치. top/bottom은 marginv(main.py CAPTION_POSITION_MARGINV)를 px로, middle은 중앙(둘 다 null).`. FEAT-61이 그 상수를 `apps/backend/caption_position.py`로 옮기므로 이 둘은 이 항목이 고친다(FEAT-61 「범위 밖 의존」).

`position`은 유효 스타일 `resolveEffectiveCaptionStyle`(`effective-caption-style.ts:18-45`)이 `style?.position ?? DEFAULT_POSITION`(`:24`)로 결정하고, `CaptionStyleEditor`가 이를 구조분해해(`:72-80`) 미리보기에 넘긴다(`:321`). Position 버튼 셋은 `emit({ position })`(`CaptionStyleEditor.tsx:135`). `emit`은 저장값 위에 패치를 병합한다(`:85-87` `onChange({ ...(value ?? EMPTY_STYLE), ...patch })`), 그래서 프리셋/위치를 바꿔도 다른 필드가 보존된다. `EMPTY_STYLE`(`:48-56`)은 7필드 전부를 가진 빈 틀이다.

저장·검증은 **쓰기 한 곳**뿐이다: `saveDefaultCaptionStyle`(`features/settings/api/index.ts:42-69`)가 `captionStyleSchema.safeParse(value)`(`:55`)로 검증하고 `parsed.data`를 쓴다(모르는 키 strip). 스키마는 `captionStyleSchema = z.object({...}) satisfies z.ZodType<CaptionStyle>`(`caption-style-schema.ts:13-42`)로 7필드이고, `position`(`:14` `  position: z.enum(CAPTION_STYLE_OPTIONS.POSITIONS),` — 비-nullable enum, 타입도 `constants.ts:118`에 `| null` 없음)을 뺀 6필드가 `.nullable()`이며, 허용 범위는 백엔드 `resolve_caption_style`과 동기(`:11-12` 주석). 프리셋 타입은 `Omit<CaptionStyle, "position">`(`constants.ts:197`)이고, `matchPresetId`(`caption-presets.ts:13-24`)는 `Object.entries(preset.style)`의 키만 비교하므로 `position`은 매칭에서 자동 제외된다(`:16-21`).

**저장값을 읽는 경로는 전부 직접 캐스트다(zod 파싱 없음, 전수 확인):** `app/dashboard/settings/page.tsx:28-29`, `app/dashboard/page.tsx:56-57`(둘 다 `as CaptionStyle | null` → 에디터·썸네일 초기값), `inngest/functions.ts:272`(`context.captionStyle as CaptionStyle | null` → 렌더 페이로드), 업로드 스냅샷은 `features/upload/api/index.ts:298-310`이 사용자 기본값을 `UploadedFile.captionStyle`로 복사한다. Modal로 가는 값은 `requestCaptionStyle(snapshot)`(`inngest/caption-style-request.ts:9-13`)이 스냅샷을 그대로 반환한다. `claim-processing-attempt.ts:27-45`의 `snapshotSchema`는 **처리 디스패치 입력**(clipCount·language·mode·moments)만 검증하고 캡션 스타일은 포함하지 않는다. 즉 `apps/web`에서 캡션 스타일 JSON을 zod로 파싱하는 **읽기 경로는 하나도 없다**.

## 문제

백로그 `source`가 지목한 문제: 설정 화면에서 세로 위치를 Top/Middle/Bottom **버튼 셋**으로만 고를 수 있어, 자막을 원하는 높이에 둘 수 없다. 특히 FEAT-58 검은 띠 안에 자막을 정확히 넣을 수 없다(Top 프리셋 200/1920 = 10.4%가 띠를 넘으면 겹친다 — FEAT-60 원장 줄).

요구는 미리보기에서 자막을 **끌어 세로 위치를 정하는 것**(세로만, 가로는 FEAT-61 근거로 범위 밖)이다. 위 「현재 동작」에서 확인한 대로 세로 위치는 `position` enum 하나뿐이고 여백은 프리셋 상수표에만 있다. 공유 계약대로 `CaptionStyle`에 `marginV: number | null`을 더해 `position`을 **기준 가장자리**로 재사용하면, 백엔드(FEAT-61)가 그 여백으로 렌더한다. 웹은 ① 필드·스키마 추가 ② 드래그/키보드로 `{position, marginV}` 저장 ③ 미리보기·썸네일이 그 여백을 반영 ④ 미리보기 줄 상자를 libass 줄 상자와 맞춤(「현재 동작」 실측 — 드래그로 놓은 위치가 실렌더와 맞으려면 필요) — 네 가지를 한다.

백로그가 지목한 문제와 코드가 어긋나는 점은 없다. 백로그 ③의 지점(썸네일·유효 스타일·`getPreviewVerticalInset`·프리셋 타입·설정 문구)은 「현재 동작」의 `파일:줄`과 일치한다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/shared/config/constants.ts` | `CAPTION_STYLE_OPTIONS`에 `MARGIN_V_RANGE: { MIN: 0, MAX: 960 }` 추가(`caption_position.py` `MARGINV_MIN`·`MARGINV_MAX` 동기 주석). `CaptionStyle` 타입에 `marginV: number \| null` 추가. `CAPTION_STYLE_PRESETS`의 `satisfies` 항목을 `Omit<CaptionStyle, "position">` → `Omit<CaptionStyle, "position" \| "marginV">`로(새 필드도 프리셋 소속이 아님). `:77` 주석이 가리키는 파일을 `caption_position.py`로 |
| `src/fsd/shared/config/caption-style-schema.ts` | `z.object`에 `marginV: z.number().int().min(MARGIN_V_RANGE.MIN).max(MARGIN_V_RANGE.MAX).nullable()` 추가(7→8필드). `satisfies z.ZodType<CaptionStyle>` 유지. 머리 주석의 동기 범위 목록에 `marginV 0-960` 추가 |
| `src/fsd/features/caption-style/model/caption-vertical-drag.ts` `(신규)` | 드래그·키보드 지오메트리 순수 함수: `clampMarginV`, `resolveVerticalDrop`(블록 중심 px → `{position, marginV}`), `verticalDropToCenterPx`(저장 위치 → 블록 중심 px, 역함수 — 프리셋 폴백은 `getPreviewVerticalInset`에 위임), `captionHeightPercent`(슬라이더 값 0~100) |
| `src/fsd/features/caption-style/model/caption-vertical-drag.test.mjs` `(신규)` | 위 네 함수의 분기·클램프·경계·왕복·marginV 0·단조성 |
| `src/fsd/features/caption-style/model/caption-preview.ts` | `getPreviewVerticalInset` 시그니처에 `marginV: number \| null` 추가 — `top`/`bottom`에서 `marginV ?? MARGINV[가장자리]`를 scale. middle 불변. `getPreviewLineHeightPx` 신설(libass 줄 상자 = fontsize × scale). `:106` 주석 갱신 |
| `src/fsd/features/caption-style/model/caption-preview.test.mjs` | `getPreviewVerticalInset` 3케이스에 `marginV` 인자 추가 + `marginV` 지정·`0` 보존·middle 무시 케이스 + `getPreviewLineHeightPx` |
| `src/fsd/features/caption-style/model/effective-caption-style.ts` | `EffectiveCaptionStyle`에 `marginV: number \| null` 추가, `resolveEffectiveCaptionStyle`가 `style?.marginV ?? null` 패스스루 |
| `src/fsd/features/caption-style/model/effective-caption-style.test.mjs` | 전수 비교 3케이스의 기대 객체에 `marginV: null` 추가 + 저장된 `marginV`(300·**0**)가 그대로 통과하는 케이스 |
| `src/fsd/features/caption-style/ui/CaptionPreviewPlayer.tsx` | `marginV` prop + 선택적 `onVerticalChange` prop 추가. `onVerticalChange`가 있으면 자막 `<p>`를 포인터 드래그(포인터 캡처·잡은 지점 보정)·키보드(방향키) 슬라이더로 만든다. `getPreviewVerticalInset` 호출에 `marginV` 전달. `<p>`의 `leading-tight`를 `lineHeight: getPreviewLineHeightPx(...)`로 교체 |
| `src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx` | `EMPTY_STYLE`에 `marginV: null` 추가(없으면 `CaptionStyle` 타입 미충족으로 컴파일 실패 — TS2741 실측). effective에서 `marginV` 구조분해 → 미리보기에 `marginV`·`onVerticalChange` 전달(`sample`일 때만). Position 버튼을 `emit({ position, marginV: null })`로(스냅 시 프리셋 복귀). Position 버튼 아래 드래그 안내 한 줄(`sample`일 때만) |
| `src/fsd/features/caption-style/ui/CaptionStyleThumbnail.tsx` | `getPreviewVerticalInset(effective.position, effective.marginV, 100)` |
| `src/fsd/features/caption-style/model/caption-presets.test.mjs` | `withPosition`이 `marginV: null`도 넣어 8필드 완전 형태를 만들게(스키마 통과) |
| `src/fsd/features/settings/api/index.ts` | `saveDefaultCaptionStyle`의 `validate`가 `safeParse({ ...value, marginV: value.marginV ?? null })`로 — 옛 저장값(키 없음)이 들어와도 null로 받는다(위험 1) |

여기 없는 파일은 고치지 않는다. 특히 `inngest/functions.ts`·`caption-style-request.ts`·`app/dashboard/*/page.tsx`의 캐스트는 `marginV`가 없으면 런타임에 `undefined`(JSON 생략 → 백엔드 폴백)이고, 있으면 그대로 흐르므로 **무변경**이다(아래 「테스트」에서 근거). `packages/db`·`apps/backend`는 손대지 않는다(「범위 밖 의존」). **설정 페이지 문구(`pages/settings/ui/index.tsx:290` `Captions keep their current position. Applies to both languages.`)도 고치지 않는다** — 이 문장은 Framing 슬라이더의 설명(`aria-describedby="video-padding-help"`)이고 뜻은 "검은 띠를 바꿔도 자막은 움직이지 않는다"(FEAT-58의 자막 위치 불변식)라 드래그가 생겨도 참이다. 드래그 안내를 여기 넣으면 화면 낭독기가 여백 슬라이더에서 자막 드래그 설명을 읽는다. 안내는 Position 컨트롤 아래에 둔다(§8).

## 구현 스케치

### 1) constants.ts

`CAPTION_STYLE_OPTIONS`(`:49-68`) 끝에 범위 추가:

```ts
  DEFAULT_OUTLINE_WIDTH: { English: 1.1, Korean: 1.3 },
  // 자막 세로 여백(ASS PlayResY 1920 기준) 허용 범위. 백엔드 apps/backend/caption_position.py MARGINV_MIN·MARGINV_MAX와 동기.
  // 상한 960 = PLAY_RES_Y/2: 블록 중심이 미리보기 중앙일 때의 기준 가장자리 거리 상한이라 드래그가 이를 넘지 않는다.
  MARGIN_V_RANGE: { MIN: 0, MAX: 960 },
} as const;
```

`CAPTION_RENDER.MARGINV` 주석(`:77`) — 상수가 FEAT-61로 옮겨 간 곳을 가리킨다:

```ts
// before (:77)
  MARGINV: { top: 200, bottom: 260 }, // main.py CAPTION_POSITION_MARGINV
// after
  MARGINV: { top: 200, bottom: 260 }, // apps/backend/caption_position.py CAPTION_POSITION_MARGINV
```

`CaptionStyle` 타입(`:117-127`)에 필드 추가(마지막 필드 뒤):

```ts
  uppercase: boolean | null;
  // position이 가리키는 가장자리에서의 세로 여백(ASS PlayResY 1920 기준, 정수 0~960).
  // null = 프리셋 여백(CAPTION_RENDER.MARGINV, top 200 / bottom 260). middle은 무시.
  // position처럼 프리셋 소속이 아니다 — 프리셋을 바꿔도 사용자 위치는 유지된다.
  marginV: number | null;
};
```

`CAPTION_STYLE_PRESETS`의 satisfies(`:194-198`):

```ts
// before (:197)
  style: Omit<CaptionStyle, "position">;
// after
  style: Omit<CaptionStyle, "position" | "marginV">;
```

(프리셋 리터럴 4개는 무변경 — `marginV`를 넣지 않는다. `matchPresetId`가 `preset.style` 키만 비교하므로 `marginV`는 position처럼 매칭에서 자동 제외된다.)

### 2) caption-style-schema.ts

`z.object`(`:13-42`)에 `uppercase` 다음 필드 추가:

```ts
  uppercase: z.boolean().nullable(),
  marginV: z
    .number()
    .int()
    .min(CAPTION_STYLE_OPTIONS.MARGIN_V_RANGE.MIN)
    .max(CAPTION_STYLE_OPTIONS.MARGIN_V_RANGE.MAX)
    .nullable(),
}) satisfies z.ZodType<CaptionStyle>;
```

(`.nullable()`만 쓴다 — `.default()`/`.optional()`은 입력 타입을 optional로 만들어 `satisfies z.ZodType<CaptionStyle>`의 입력 요구와 어긋난다. 옛 저장값의 키 누락은 쓰기 한 곳에서 흡수한다 — 아래 7.)

머리 주석(`:11-12`)의 동기 범위 목록:

```ts
// before (:12)
// (main.py: fontSize 60-200, maxWordsPerLine 1-8, outlineWidth 0-6).
// after
// (main.py: fontSize 60-200, maxWordsPerLine 1-8, outlineWidth 0-6 · caption_position.py: marginV 0-960).
```

### 3) caption-vertical-drag.ts (신규) — 지오메트리 순수 함수

```ts
import { CAPTION_RENDER, CAPTION_STYLE_OPTIONS } from "~/fsd/shared/config/constants";
import { getPreviewVerticalInset } from "./caption-preview";

// 정수·범위(0~960) 클램프. 비유한값은 MIN으로.
export function clampMarginV(value: number): number {
  const { MIN, MAX } = CAPTION_STYLE_OPTIONS.MARGIN_V_RANGE;
  if (!Number.isFinite(value)) return MIN;
  return Math.min(MAX, Math.max(MIN, Math.round(value)));
}

// 블록 중심 y(미리보기 px) → 저장할 {position, marginV}.
// 중심이 위쪽 절반이면 top(위 가장자리~블록 위), 아래쪽 절반이면 bottom(아래 가장자리~블록 아래).
// 기준 가장자리에서의 거리를 ASS px로 환산·클램프한다. 미리보기 1px ≈ PLAY_RES_Y/previewHeight ASS px.
export function resolveVerticalDrop(
  centerPx: number,
  blockHeightPx: number,
  previewHeightPx: number,
): { position: "top" | "bottom"; marginV: number } {
  const assPerPx = CAPTION_RENDER.PLAY_RES_Y / previewHeightPx; // 1920/320 = 6
  if (centerPx < previewHeightPx / 2) {
    const topEdgePx = centerPx - blockHeightPx / 2;
    return { position: "top", marginV: clampMarginV(topEdgePx * assPerPx) };
  }
  const bottomEdgePx = previewHeightPx - (centerPx + blockHeightPx / 2);
  return { position: "bottom", marginV: clampMarginV(bottomEdgePx * assPerPx) };
}

// 저장 위치 → 블록 중심 y(미리보기 px). 드래그 잡기·키보드 넛지의 역함수.
// 프리셋 폴백은 getPreviewVerticalInset이 소유한다 — 여기서 다시 쓰지 않는다. middle은 미리보기 중앙.
export function verticalDropToCenterPx(
  position: "top" | "middle" | "bottom",
  marginV: number | null,
  blockHeightPx: number,
  previewHeightPx: number,
): number {
  const inset = getPreviewVerticalInset(position, marginV, previewHeightPx);
  if (inset.top !== null) return inset.top + blockHeightPx / 2;
  if (inset.bottom !== null) return previewHeightPx - inset.bottom - blockHeightPx / 2;
  return previewHeightPx / 2; // middle
}

// 슬라이더 값(aria-valuenow): 한 줄 블록(libass 줄 상자 = assFontSize) 중심이 아래 가장자리에서 몇 %인가.
// 0 = 맨 아래, 100 = 맨 위. 위로 갈수록 커져 ArrowUp(위로 이동)과 방향이 같고, 기준 가장자리가 바뀌어도 연속이다.
export function captionHeightPercent(
  position: "top" | "middle" | "bottom",
  marginV: number | null,
  assFontSize: number,
): number {
  const H = CAPTION_RENDER.PLAY_RES_Y;
  const centerAss = verticalDropToCenterPx(position, marginV, assFontSize, H);
  return Math.round(100 * (1 - centerAss / H));
}
```

(`verticalDropToCenterPx`는 `previewHeightPx`에 1920을 넘기면 ASS px로도 그대로 쓰인다 — `captionHeightPercent`가 그렇게 쓴다. 슬라이더 값을 `marginV`로 두지 않는 이유는 「대안」.)

### 4) caption-preview.ts — getPreviewVerticalInset에 marginV

```ts
// before (:106-117)
// 세로 위치. top/bottom은 marginv(main.py CAPTION_POSITION_MARGINV)를 px로, middle은 중앙(둘 다 null).
export function getPreviewVerticalInset(
  position: CaptionStyle["position"],
  previewHeightPx: number,
): { top: number | null; bottom: number | null } {
  const scale = previewScale(previewHeightPx);
  if (position === "top")
    return { top: CAPTION_RENDER.MARGINV.top * scale, bottom: null };
  if (position === "bottom")
    return { top: null, bottom: CAPTION_RENDER.MARGINV.bottom * scale };
  return { top: null, bottom: null }; // middle
}
// after — 줄 높이 함수 신설 + marginV 오버라이드(null이면 프리셋 상수). 프리셋 폴백은 이 함수 한 곳에만 둔다.
// libass 줄 상자 높이를 미리보기 px로 — CSS line-height로 쓴다. libass는 ASS fontsize를 줄 상자 높이(REAL_DIM)로
// 요청하므로 폰트와 무관하게 fontsize × scale이다. leading-tight(1.25em)는 Anton에서 이 상자의 0.72배라 위 기준 자막이
// 실렌더보다 26 ASS px 위에 그려졌다(FEAT-62 계획 검증 실측 — 이 값으로 바꾸면 위·아래 기준 모두 −9 px로 고르게 준다).
export function getPreviewLineHeightPx(
  assFontSize: number,
  previewHeightPx: number,
): number {
  return assFontSize * previewScale(previewHeightPx);
}

// 세로 위치. top/bottom은 marginV(null이면 apps/backend/caption_position.py CAPTION_POSITION_MARGINV 프리셋)를 px로,
// middle은 중앙(둘 다 null). 프리셋 폴백(`marginV ?? MARGINV`)은 이 함수 한 곳에만 있다.
export function getPreviewVerticalInset(
  position: CaptionStyle["position"],
  marginV: number | null,
  previewHeightPx: number,
): { top: number | null; bottom: number | null } {
  const scale = previewScale(previewHeightPx);
  if (position === "top")
    return { top: (marginV ?? CAPTION_RENDER.MARGINV.top) * scale, bottom: null };
  if (position === "bottom")
    return { top: null, bottom: (marginV ?? CAPTION_RENDER.MARGINV.bottom) * scale };
  return { top: null, bottom: null }; // middle (marginV 무시)
}
```

### 5) effective-caption-style.ts — marginV 패스스루

`EffectiveCaptionStyle`(`:6-14`)에 `marginV: number | null;` 추가. `resolveEffectiveCaptionStyle`(`:23-44`) 반환 객체 끝에:

```ts
    uppercase: style?.uppercase ?? false,
    // marginV는 언어 기본값이 없다(position처럼). 프리셋 폴백은 getPreviewVerticalInset이 소유하므로 null 패스스루.
    marginV: style?.marginV ?? null,
  };
```

### 6) CaptionPreviewPlayer.tsx — 드래그·키보드

props 인터페이스(`:20-39`)에 추가:

```ts
  position: CaptionStyle["position"];
  marginV: number | null; // 저장 여백(null = 프리셋). 미리보기 세로 위치에 반영.
  // 설정 에디터만 넘긴다. 있으면 자막 블록이 드래그·방향키로 세로 위치를 바꾼다.
  onVerticalChange?: (next: { position: "top" | "bottom"; marginV: number }) => void;
```

`:138` 호출 교체 + 드래그 상태·핸들러. 키보드 스텝은 UI 리터럴(미리보기 px, ≈6 ASS px/px):

```ts
const KEYBOARD_STEP_PX = 4; // 방향키 한 번의 미리보기 px 이동(≈24 ASS px)

// ... 본문
const captionRef = useRef<HTMLParagraphElement>(null);
const grabOffsetRef = useRef(0); // 잡은 지점 − 블록 중심(px). 잡자마자 중심이 포인터로 튀지 않게 한다.
const containerRef = useRef<HTMLDivElement>(null); // 미리보기 상자(:150)
const draggable = props.onVerticalChange !== undefined;
const inset = getPreviewVerticalInset(props.position, props.marginV, PREVIEW_HEIGHT_PX);

const commitFromCenter = (centerPx: number) => {
  const blockH = captionRef.current?.getBoundingClientRect().height ?? 0;
  const clamped = Math.min(PREVIEW_HEIGHT_PX, Math.max(0, centerPx));
  props.onVerticalChange?.(resolveVerticalDrop(clamped, blockH, PREVIEW_HEIGHT_PX));
};

const onPointerDown = (e: React.PointerEvent) => {
  if (!draggable) return;
  e.preventDefault();
  const cap = e.currentTarget.getBoundingClientRect();
  grabOffsetRef.current = e.clientY - (cap.top + cap.height / 2);
  e.currentTarget.setPointerCapture(e.pointerId);
};
const onPointerMove = (e: React.PointerEvent) => {
  if (!draggable || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect) return;
  commitFromCenter(e.clientY - rect.top - grabOffsetRef.current);
};
const onPointerUp = (e: React.PointerEvent) => {
  if (e.currentTarget.hasPointerCapture(e.pointerId))
    e.currentTarget.releasePointerCapture(e.pointerId);
};
const onKeyDown = (e: React.KeyboardEvent) => {
  if (!draggable || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
  e.preventDefault();
  const blockH = captionRef.current?.getBoundingClientRect().height ?? 0;
  const center = verticalDropToCenterPx(props.position, props.marginV, blockH, PREVIEW_HEIGHT_PX);
  const delta = e.key === "ArrowUp" ? -KEYBOARD_STEP_PX : KEYBOARD_STEP_PX;
  commitFromCenter(center + delta);
};
```

줄 높이·슬라이더 값 — 기존 `fontPx`(`:139`) 바로 아래:

```ts
const lineHeightPx = getPreviewLineHeightPx(props.fontSize, PREVIEW_HEIGHT_PX);
const heightPercent = captionHeightPercent(props.position, props.marginV, props.fontSize);
```

컨테이너 상자(`:150-153`)에 `ref={containerRef}` 추가. 자막 `<p>`(`:193-207`)에 핸들 속성 추가(드래그 모드일 때만 상호작용·포커스) + `leading-tight`를 libass 줄 상자 높이로 교체(드래그 여부와 무관 — 미리보기 위치 계약이다):

```tsx
<p
  ref={captionRef}
  className={cn("text-center", draggable && "pointer-events-auto cursor-ns-resize touch-none")}
  tabIndex={draggable ? 0 : undefined}
  role={draggable ? "slider" : undefined}
  aria-label={draggable ? "Caption vertical position" : undefined}
  aria-orientation={draggable ? "vertical" : undefined}
  aria-valuemin={draggable ? 0 : undefined}
  aria-valuemax={draggable ? 100 : undefined}
  aria-valuenow={draggable ? heightPercent : undefined}
  aria-valuetext={draggable ? `${heightPercent}% from bottom` : undefined}
  onPointerDown={onPointerDown}
  onPointerMove={onPointerMove}
  onPointerUp={onPointerUp}
  onKeyDown={onKeyDown}
  style={{
    fontFamily,
    fontSize: fontPx,
    lineHeight: `${lineHeightPx}px`,
    /* 나머지 기존 스타일(color·textTransform·WebkitTextStroke·paintOrder·textShadow) 그대로 */
  }}
>
  {displayText}
</p>
```

(컨테이너 `<div>`(`:185-191`)의 `pointer-events-none`은 유지한다 — 영상은 통과시키고 자막 `<p>`만 `pointer-events-auto`로 잡는다. import에 `getPreviewLineHeightPx`(`../model/caption-preview`)와 `captionHeightPercent`·`resolveVerticalDrop`·`verticalDropToCenterPx`(`../model/caption-vertical-drag`)를 추가한다. 계획 검증에서 이 조각을 조립해 `tsc --noEmit`·`next lint`·`renderToStaticMarkup`을 통과시켰다 — 프리셋 위치(`marginV` null)에서도 `aria-valuenow`가 붙는다.)

### 7) settings/api/index.ts — 옛 값 키 누락 흡수

```ts
// before (:55)
    const parsed = captionStyleSchema.safeParse(value);
// after — 옛 저장값에는 marginV 키가 없다(타입은 필수지만 런타임엔 undefined). z.number().nullable()은 undefined를
// 거부하므로 null로 받는다. 저장은 parsed.data라 null로 정규화되어 앞으로 키가 생긴다.
    const parsed = captionStyleSchema.safeParse({ ...value, marginV: value.marginV ?? null });
```

(`{ marginV: null, ...value }`는 쓰지 않는다 — `value: CaptionStyle`에 `marginV`가 필수라 TS가 앞의 키를 "항상 덮인다"로 거부한다(TS2783, 계획 검증 실측).)

### 8) CaptionStyleEditor.tsx — marginV 배선 + 스냅 버튼

`EMPTY_STYLE`(`:48-56`)에 필드 추가 — `CaptionStyle` 타입이라 빠지면 TS2741로 컴파일이 깨진다:

```ts
// before (:55-56)
  uppercase: null,
};
// after
  uppercase: null,
  marginV: null,
};
```

effective 구조분해(`:72-80`)에 `marginV: effectiveMarginV,` 추가. Position 버튼(`:135`):

```ts
// before
                onClick={() => emit({ position })}
// after — 스냅 단축: 프리셋 여백으로 되돌린다(계약 ④)
                onClick={() => emit({ position, marginV: null })}
```

미리보기 호출(`:309-324`)에 전달 추가:

```tsx
          position={effectivePosition}
          marginV={effectiveMarginV}
          onVerticalChange={sample ? (next) => emit(next) : undefined}
          paddingPercent={paddingPercent}
          sample={sample}
```

(`emit(next)`는 `{position, marginV}`를 저장값 위에 병합한다 — 다른 필드·프리셋 보존.)

Position 버튼 묶음(`:128-140`) 아래 드래그 안내 — 기존 힌트 문단(`:280-283`)과 같은 클래스:

```tsx
// before (:137-141)
                {POSITION_LABELS[position]}
              </Button>
            ))}
          </div>
        </div>
// after
                {POSITION_LABELS[position]}
              </Button>
            ))}
          </div>
          {sample && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Or drag the caption in the preview to set its height.
            </p>
          )}
        </div>
```

### 9) CaptionStyleThumbnail.tsx

```ts
// before (:25)
  const inset = getPreviewVerticalInset(effective.position, 100);
// after
  const inset = getPreviewVerticalInset(effective.position, effective.marginV, 100);
```

### 10) settings/ui/index.tsx — 고치지 않는다

`:290`의 Framing 설명은 그대로 둔다(「고칠 파일」 아래 문단 — 그 문장은 여백 슬라이더의 설명이고 드래그가 생겨도 참이다). 드래그 안내는 §8의 Position 아래 한 줄이 맡는다.

## 테스트

- **덮는 것**(`npm test` = `tsx --test`, Node 내장 러너):
  - `caption-vertical-drag.test.mjs`(신규): `clampMarginV`(0 미만→0, 960 초과→960, 반올림, 비유한→0), `resolveVerticalDrop`(위쪽 절반→top, 아래쪽 절반→bottom, 경계 `centerPx === H/2`→bottom, 음수 가장자리→0 클램프, H=320·blockH로 계산한 ASS 값), `verticalDropToCenterPx`(top/bottom/middle, marginV null→프리셋 200/260, **marginV 0→가장자리**(top `blockH/2` · bottom `H − blockH/2`)), 두 함수 왕복 연속성(경계 근처에서 위치가 튀지 않음), `captionHeightPercent`(크기 122에서 top·null→86, bottom·null→17, bottom·0→3, middle→50 골든값 + 미리보기 중앙을 위에서 아래로 지나는 동안 값이 **증가하지 않음**).
  - `caption-preview.test.mjs`: `getPreviewVerticalInset` 3케이스에 `marginV` 인자(null) 추가 + `marginV` 지정 시 프리셋 대신 그 값을 scale하는 케이스(top·bottom 각 1개) + **`marginV` 0을 프리셋으로 바꾸지 않는 케이스(top·bottom)**, middle은 marginV 무관. `getPreviewLineHeightPx(122, 320) = 122·320/1920`, `(130, 320) = 130·320/1920`(언어와 무관).
  - `effective-caption-style.test.mjs`: 전수 비교 3케이스 기대 객체에 `marginV: null` 추가(입력 style에 marginV 없으면 패스스루 null) + **저장된 marginV 300과 0이 그대로 통과**하는 케이스.
  - **0과 저장값을 명세에 넣는 이유(계획 검증 돌연변이 실측)**: 처음 스케치·명세로는 17마리 중 6마리가 살았다. `??`→`||` 다섯(`getPreviewVerticalInset` top·bottom, 당시 자체 폴백을 갖던 `verticalDropToCenterPx` top·bottom, `resolveEffectiveCaptionStyle`)은 marginV 0을 프리셋으로 되돌린다 — 0은 끌어서 가장자리에 붙이면 나오는 값이다(outlineWidth 0과 같은 부류, `apps/web/CLAUDE.md` 테스트 표). 여섯째는 유효 스타일이 marginV를 **항상 null**로 내는 구현으로, 저장한 위치가 새로고침 뒤 미리보기에서 프리셋으로 돌아가는데도 전 케이스가 통과했다. 지금의 스케치(폴백을 `getPreviewVerticalInset` 한 곳으로 모음)와 위 명세로는 적용 가능한 19마리(새 함수 몫 5 포함)가 전부 사멸했다 — 나머지 3마리는 `verticalDropToCenterPx`의 자체 폴백을 노리던 것이라 대상 코드가 사라졌고, 그 자리는 `getPreviewVerticalInset`의 0 케이스가 덮는다.
  - `caption-presets.test.mjs`: `withPosition`에 `marginV: null`을 넣어 8필드 완전 형태가 스키마를 통과하는지(기존 계약 보존 확인). matchPresetId가 marginV를 무시하는 것은 preset.style에 marginV가 없어 자동 성립 — 별도 케이스 불필요.
  - `caption-style-schema`는 `caption-presets.test.mjs`의 `safeParse(withPosition(preset.style))`가 간접 검증한다(marginV 범위 거부는 outlineWidth 전례와 등가라 추가하지 않는다).
- **못 덮는 범위**(러너로 확인 불가):
  - 드래그 감각·포인터 캡처·터치(`CaptionPreviewPlayer`의 pointer/key 핸들) — DOM·포인터가 없다. 배포 후 데스크톱 마우스·모바일 터치·키보드 방향키로 수동 확인.
  - 블록 높이 DOM 측정(`getBoundingClientRect`)과 미리보기 ↔ 실렌더 위치 오차 — 계획 검증 실측으로 line-height 교체 뒤 한 줄은 위·아래 기준 모두 **−9 ASS px**(1920의 0.5%, 미리보기 1.5px), 두 줄 위 기준 아래끝 −16px(「현재 동작」 표). 여러 줄은 줄바꿈 위치도 다를 수 있다(미리보기에 libass 자간 1.8이 없고, CSS는 앞에서부터 채우고 libass `WrapStyle 0`은 고르게 나눈다 — 「범위 밖 의존」 후속 후보). 측정은 로컬 Chrome·로컬 libass라 프로덕션 브라우저·컨테이너 libass와 빌드가 다르다. 저장 후 실제 업로드 클립 1개의 위치가 미리보기와 맞는지 수동 확인(Modal 렌더는 FEAT-61 배포 뒤·소유자 승인 후).
  - `inngest/functions.ts`·`caption-style-request.ts`·`app/dashboard/*/page.tsx`의 캐스트 무변경 근거(marginV 유무가 런타임 JSON에 자연히 반영) — 타입 레벨이라 `npm run check`가, 실제 전달은 배포 후 실렌더가 확인한다.

## 범위 밖 의존

- **`apps/backend`(FEAT-61)** — 실렌더가 `marginV`를 쓰게 하는 쪽. 이 항목은 저장·UI·미리보기만 담당하고, 실제 렌더 반영은 FEAT-61이 배포돼야 성립한다. 구현은 가능하나 **배포는 FEAT-61 배포 뒤**가 전제다(구현 중 백엔드 파일에 닿지 않는다 — 닿으면 `보류`).
- **`packages/db`** — 불필요. `User.defaultCaptionStyleEnglish·Korean`·`UploadedFile.captionStyle`은 `Json?` 컬럼이라 마이그레이션이 없다(백로그 `source` ② 확인). 스키마 파일은 손대지 않는다.
- **`apps/web/CLAUDE.md` 테스트 표** — 신규 `caption-vertical-drag.test.mjs` 행, `caption-preview.test.mjs` 행에 줄 높이(libass 줄 상자) 계약, 파일·suite·테스트 수가 바뀐다. web-dev는 이 파일을 고치지 않으므로 **메인 루프가 인수 때 갱신한다**.
- **후속 후보(이 항목은 하지 않는다) — 미리보기 가로 충실도**: 계획 검증 실측에서 미리보기 한 줄 폭이 실렌더보다 6% 좁았다(782 vs 831 ASS px). 원인은 libass 자간(`spacing` EN 1.8 · KR 1.2)이 미리보기에 없는 것이고, `letter-spacing: 0.3px`(1.8 × 320/1920)를 넣으면 829 vs 831로 맞았다. 여러 줄은 줄바꿈 방식 차이(CSS 탐욕 vs libass 균형)가 남는다. 줄바꿈 위치가 다르면 줄 수가 달라져 블록 높이가 바뀐다. 세로 위치 기능과는 따로 다룰 가로 정합 문제라 이 계획에 넣지 않는다 — 메인 루프가 인수 때 백로그 후보로 소유자에게 제시한다.

## 대안

- **`getPreviewVerticalInset`에서 프리셋 상수를 떼어 `effective-caption-style`로 옮기고 effective.marginV를 해석값(top→200 등)으로** — 프리셋 상수(200/260) 소유자가 두 곳으로 갈려 드리프트 위험. 현 설계는 폴백(`marginV ?? MARGINV`)을 `getPreviewVerticalInset` 한 곳에 두고, `verticalDropToCenterPx`는 그 함수를 불러 쓰며, effective.marginV는 null 패스스루라 소유자가 하나다. 기각.
- **스키마 필드를 `.default(null)`/`.nullish()`로 해 옛 값 키 누락을 흡수** — 입력 타입이 optional이 되어 `satisfies z.ZodType<CaptionStyle>`(입력도 `CaptionStyle`)과 어긋나 컴파일 깨짐. 대신 쓰기 한 곳(`saveDefaultCaptionStyle`)에서 `{ ...value, marginV: value.marginV ?? null }`로 흡수하고 읽기는 전부 캐스트+`??`라 런타임 안전. 기각.
- **슬라이더 값(`aria-valuenow`)을 `marginV` 그대로** — 기각. 같은 숫자가 top이면 위에서, bottom이면 아래에서의 거리라 방향이 뒤집히고(top 200과 bottom 260이 화면 반대편), 프리셋(`marginV` null)에서는 값이 사라져 `role="slider"`가 현재 값 없이 낭독된다(계획 검증 `renderToStaticMarkup` 실측). `captionHeightPercent`(아래에서 몇 %, 0~100)는 위로 갈수록 커져 ArrowUp과 같은 방향이고 프리셋에서도 값이 있다.
- **`leading-tight` 유지(줄 높이를 건드리지 않음)** — 기각. 위 기준 자막이 실렌더보다 26 ASS px 위에, 두 줄이면 아래끝이 67px 어긋난다(「현재 동작」 표). 드래그로 놓은 위치가 곧 저장값이라 이 오차가 기능의 오차가 된다.
- **설정 문구(`:290`)를 드래그 안내로 교체** — 기각. 그 문장은 Framing 슬라이더의 `aria-describedby` 설명이고 뜻(여백을 바꿔도 자막은 그대로)이 여전히 참이다. 안내는 Position 아래에 둔다(§8).
- **읽기 경로(세 캐스트)에서 런타임 정규화** — 읽기 경로가 셋(+스냅샷)이고 캐스트는 타입 단언이라 런타임 보강 코드를 네 곳에 넣어야 한다. 쓰기 한 곳 흡수가 단일 지점이라 더 좁다. 기각.
- **드래그를 2D(가로+세로)로** — 가로는 범위 밖(FEAT-61 근거: Anton 실측 한 줄이 프레임 폭 77%). 기각.
