# FEAT-03: 캡션 스타일 편집 확장 — Dialog 전환 + 외곽선/대문자/프리셋

agent: (메인 세션 직접 구현 — 2026-08-13 대화에서 사용자가 방향 3건을 선택하고 계획을 승인함)

## 현재 동작

**편집 표면** — 캡션 스타일 에디터는 카드 안 인라인이다. `ClipDraftCard.tsx:477-499`가 `styleOpen`일 때만 `CaptionStyleEditor`를 카드 푸터 아래에 렌더하고, 기본값은 접힘(`ClipDraftCard.tsx:104`). 열 때마다 서버 저장값으로 재동기화한다(`handleToggleStyleOpen`, `ClipDraftCard.tsx:215-224`).

**계약** — `CaptionStyle`은 4필드다: position / fontSize / color / maxWordsPerLine (`constants.ts:79-84`). 옵션 상수는 `CAPTION_STYLE_OPTIONS`(`constants.ts:49-58`). 검증은 `captionStyleSchema`(`schemas.ts:12-30`, `satisfies z.ZodType<CaptionStyle>`). 저장은 `updateClipDraftEdit`이 undefined=무변경 / null=`Prisma.JsonNull` / 객체=JSON으로 나눠 쓴다(`entities/clip-draft/api/index.ts:84-86`).

**저장 방식** — 카드가 `captionStyle`·`styleDirty` 로컬 상태를 들고(`ClipDraftCard.tsx:97-103`), 600ms 디바운스 자동 저장(`ClipDraftCard.tsx:19,166-196`)과 선택 토글 즉시 저장(`ClipDraftCard.tsx:202-211`) 페이로드에 `styleDirty ? captionStyle : undefined`를 싣는다(181, 209행). styleDirty는 Apply-to-all 결과가 이 카드의 스테일 로컬 값으로 되돌아가는 것을 막는 장치다(100-102행 주석).

**백엔드 렌더** — `resolve_caption_style`(`main.py:133-173`)이 스타일 페이로드를 해석하고 잘못된 값은 조용히 기본값으로 대체한다. EN은 `main.py:267-273`(fontsize 122, marginv 165, outline 1.1), KR은 `main.py:383-389`(fontsize 130, marginv 155, outline 1.3)로 호출. pysubs2 스타일 템플릿은 EN(`main.py:334-353`, Anton)/KR(`main.py:540-557`, Noto Sans KR) 중복 2벌이며 이벤트는 통짜 텍스트다.

**기존 버그(이번에 발견, 백엔드 반영분에서 수정됨)** — pysubs2 `SSAStyle`의 실제 속성명은 `primarycolor`/`borderstyle`/`backcolor`(밑줄 없음, 별칭 없음, dataclass라 오타 대입은 조용히 무시됨 — pysubs2 소스 `ssastyle.py` 확인, `requirements.txt:36`이 버전 미고정이라 최신이 설치됨). 이 계획 이전의 코드는 `primary_color`/`border_style`/`shadowcolor`로 대입하고 있었다. **즉 사용자가 고른 캡션 색상은 최종 렌더에 반영된 적이 없고 항상 기본 흰색으로 렌더됐다** (기본 프리셋이 흰색이라 드러나지 않았다). `fontname/fontsize/outline/shadow/alignment/marginl·r·v/spacing`은 올바른 이름이라 position·fontSize 기능은 정상 동작한다. 수정은 아래 「구현 스케치·백엔드」에 포함됐고 워킹트리에 적용된 상태다(`main.py:341-346`, `545-550`).

**분석** — 검토 단계 이벤트 5종뿐, 캡션 스타일 이벤트 없음(`analytics-contract.ts:27-31`, `metadata.ts:36-47`). `event-catalog.test.mjs:9-10`이 이벤트 수 28을 하드 어서션.

## 문제

**요구 원천: 백로그 항목이 아니라 사용자 직접 요청이다(2026-08-13 대화).** "caption style edit을 발전시키고 싶다. 인라인 대신 dialog로 수정하는 방식도 좋겠다. 진행 방식과 추가할 스타일 옵션을 함께 고안하라."

위 「현재 동작」 기준으로 다시 세우면: (1) 인라인 에디터(`ClipDraftCard.tsx:477-499`)는 열면 아래 카드들이 밀리고 기본 접힘이라 발견성이 낮다. (2) 스타일 4필드(`constants.ts:79-84`)에는 쇼츠 캡션의 핵심 레버(외곽선·대문자·프리셋 룩)가 없다. (3) 조사 중 발견한 색상 미반영 버그(수정 전 코드의 `primary_color` 오타 대입 — 「현재 동작」의 기존 버그 항목)는 같은 줄들을 고치는 작업이라 이 항목에서 함께 수정한다.

사용자 확정 결정: **중앙 Dialog** / **Apply·Cancel 커밋(자동저장의 스타일 분기 제거)** / **Phase 1 = outlineColor·outlineWidth·uppercase + 프리셋 4종** (배경 박스·폰트는 Phase 2, karaoke는 Phase 3 — 한국어는 줄 단위 번역이라 단어 타임스탬프가 없어 영어 전용이 되는 제약 때문).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/main.py` | resolve_caption_style에 outline·uppercase 해석 추가, EN/KR 템플릿 속성명 수정 + outline 배선, 이벤트 텍스트 uppercase **(적용 완료, py_compile 통과)** |
| `apps/backend/CLAUDE.md` | 캡션 문단 갱신 — 104-116행이 main.py 변경으로 스테일: 허용 값 목록에 `outlineColor`·`outlineWidth` 0-6·`uppercase` 추가, 기본 외곽선(EN 1.1/KR 1.3) 표 반영, 밀린 줄 인용(257-259→269-272, 366-368→385-388, 323, 522 등) 재실측 |
| `apps/web/src/fsd/shared/config/constants.ts` | CaptionStyle +3필드, OUTLINE_WIDTH_RANGE·DEFAULT_OUTLINE_COLOR·DEFAULT_OUTLINE_WIDTH, 프리셋 4종 |
| `apps/web/src/fsd/features/clip-review/model/schemas.ts` | zod 3필드 추가 |
| `apps/web/src/fsd/shared/ui/atoms/dialog.tsx` `(신규)` | shadcn Dialog 아톰 (`sheet.tsx` 패턴) |
| `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx` `(신규)` | 작업본 + Apply/Apply-to-all/Cancel 셸 |
| `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleEditor.tsx` | 프리셋 칩·외곽선 컨트롤·uppercase 토글·프리뷰 반영 |
| `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | captionStyle·styleDirty 상태와 자동저장 스타일 분기 제거, Dialog 연결, toCaptionStyle 구 행 백필 확장 |
| `apps/web/src/fsd/widgets/clip-draft-review/model/caption-presets.ts` `(신규)` | matchPresetId 순수 함수 |
| `apps/web/src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts` | saveMutation·applyStyleMutation의 onSuccess에서 캡션 스타일 계측 발화 |
| `apps/web/src/fsd/widgets/clip-draft-review/model/caption-presets.test.mjs` `(신규)` | 프리셋-스키마 정합 + matchPresetId |
| `packages/db/src/analytics-contract.ts` | `clip_review_caption_style_edited` 이벤트 추가 |
| `apps/web/src/fsd/shared/analytics/lib/metadata.ts` | 위 이벤트의 허용 메타데이터 키 |
| `apps/web/src/fsd/shared/analytics/event-catalog.test.mjs` | 이벤트 수 28 → 29 |
| `apps/web/CLAUDE.md` | 문서 동기 — 148행 "이벤트 이름 28개" → 29개, 69행 테스트 파일 수·개수 재실측 + 테스트 표에 `caption-presets.test.mjs` 행 추가 (69행 "5개 파일, 31개"는 FEAT-02의 미커밋 테스트로 이미 스테일 — 갱신 시점 실측으로 기록) |

## 구현 스케치

**배포 순서: 백엔드 먼저.** 웹을 먼저 내보내면 구 백엔드가 새 필드를 조용히 무시해 "프리뷰와 다른 결과물" 창이 생긴다. 백엔드가 먼저면 그 창이 0 (pydantic `moments: list[dict]`가 비타입이라 양방향 와이어 호환).

### 백엔드 — `main.py` (2026-08-14 워킹트리에 적용 완료 — 배포는 아직)

`resolve_caption_style` 시그니처에 `default_outline: float` 추가(적용: `main.py:133`), 본문에(적용: `main.py:155-161`):

```python
outline_width = style.get("outlineWidth")
if isinstance(outline_width, bool) or not isinstance(outline_width, (int, float)) or not (0 <= outline_width <= 6):
    outline_width = default_outline

outline_color = parse_hex_color(style.get("outlineColor")) or pysubs2.Color(0, 0, 0)
uppercase = style.get("uppercase") is True
```

(`isinstance(True, int)`가 파이썬에서 참이므로 bool 선제 검사가 필요하다.)
반환 dict에 `"outline": float(outline_width)`, `"outline_color": outline_color`, `"uppercase": uppercase` 추가.

EN 템플릿 before → after (적용: `main.py:341-346`; KR 동일 패턴 `korean_style.`, 적용: `main.py:545-550`):

```python
# before                                           # after
new_style.primary_color = resolved["primary_color"]  new_style.primarycolor = resolved["primary_color"]
new_style.border_style = 1                           new_style.borderstyle = 1
new_style.outline = 1.1                              new_style.outline = resolved["outline"]
                                                     new_style.outlinecolor = resolved["outline_color"]
new_style.shadowcolor = pysubs2.Color(12, 12, 12, 210)  new_style.backcolor = pysubs2.Color(12, 12, 12, 210)
```

속성명 수정으로 **색상이 처음으로 실제 반영**되고, 그림자도 의도했던 반투명 값이 적용된다(기존엔 둘 다 조용히 무시). 호출부는 EN `default_outline=1.1`(적용: `main.py:272`), KR `default_outline=1.3`(적용: `main.py:388`).

uppercase — EN 이벤트 루프(적용: `main.py:360-361`), KR 루프(적용: `main.py:563-565`)에서 `SSAEvent(...)` 직전:

```python
if resolved["uppercase"]:
    text = text.upper()
```

(한글엔 no-op, 섞인 영문만 대문자화.)

**문서 동기** — `apps/backend/CLAUDE.md`의 Subtitle Overlay 문단(104-116행)이 위 변경으로 스테일해졌다(허용 값 목록이 구 4필드 기준, 줄 인용 이동). 구현 단계에서 함께 갱신한다: 허용 값에 `outlineColor` `#RRGGBB`(기본 검정)·`outlineWidth` 0-6(기본 EN 1.1/KR 1.3)·`uppercase` boolean 추가, 줄 인용은 갱신 시점에 재실측.

### 웹 계약 — `constants.ts`

`CAPTION_STYLE_OPTIONS`에 추가: `OUTLINE_WIDTH_RANGE: { MIN: 0, MAX: 6 }`, `DEFAULT_OUTLINE_COLOR: "#000000"`, `DEFAULT_OUTLINE_WIDTH: { English: 1.1, Korean: 1.3 }`(백엔드 `default_outline`과 동기 — DEFAULT_FONT_SIZE와 같은 패턴. 프리뷰가 null일 때 쓸 값). 타입 확장:

```ts
export type CaptionStyle = {
  position: (typeof CAPTION_STYLE_OPTIONS.POSITIONS)[number];
  fontSize: number | null;
  color: string | null;
  maxWordsPerLine: number | null;
  outlineColor: string | null;   // #RRGGBB, null = 검정
  outlineWidth: number | null;   // int 0-6, null = 언어 기본 (EN 1.1 / KR 1.3)
  uppercase: boolean | null;     // null/false = 원문 유지
};
```

프리셋 — position은 사용자가 고른 값을 보존해야 하므로 제외한다(에디터의 `emit`이 저장값 위에 병합하므로 `emit(preset.style)`이 position을 그대로 남긴다):

```ts
export const CAPTION_STYLE_PRESETS = [
  { id: "clean-white", label: "Clean White",
    style: { fontSize: null, color: "#FFFFFF", maxWordsPerLine: null, outlineColor: "#000000", outlineWidth: 1, uppercase: false } },
  { id: "bold-yellow", label: "Bold Yellow",
    style: { fontSize: null, color: "#FFE45E", maxWordsPerLine: null, outlineColor: "#000000", outlineWidth: 3, uppercase: true } },
  { id: "outline-punch", label: "Outline Punch",
    style: { fontSize: null, color: "#FFFFFF", maxWordsPerLine: null, outlineColor: "#000000", outlineWidth: 5, uppercase: true } },
  { id: "mint-pop", label: "Mint Pop",
    style: { fontSize: null, color: "#7CF3FF", maxWordsPerLine: null, outlineColor: "#111111", outlineWidth: 2, uppercase: false } },
] as const satisfies readonly { id: string; label: string; style: Omit<CaptionStyle, "position"> }[];

export type CaptionStylePresetId = (typeof CAPTION_STYLE_PRESETS)[number]["id"];
```

### zod — `schemas.ts` (captionStyleSchema에 추가)

```ts
outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be #RRGGBB").nullable(),
outlineWidth: z.number().int()
  .min(CAPTION_STYLE_OPTIONS.OUTLINE_WIDTH_RANGE.MIN)
  .max(CAPTION_STYLE_OPTIONS.OUTLINE_WIDTH_RANGE.MAX)
  .nullable(),
uppercase: z.boolean().nullable(),
```

`satisfies z.ZodType<CaptionStyle>` 절이 타입-스키마 드리프트를 컴파일 타임에 잡는다. 기존 DB 행은 마이그레이션 불필요 — 렌더 경로는 캐스트 후 백엔드 `.get()` fallback이라 4필드 구 행도 그대로 동작한다.

**단, 편집 표면은 구 행을 백필해야 한다.** v2 이전에 저장된 4필드 행을 Dialog로 열어 수정 없이 Apply하면 작업본에 신규 3키가 없어 zod(required-but-nullable)가 거부한다. 단일 캐스트 지점인 `toCaptionStyle`(`ClipDraftCard.tsx:33-35`)을 백필로 확장한다:

```ts
function toCaptionStyle(raw: ClipDraft["captionStyle"]): CaptionStyle | null {
  if (raw === null || raw === undefined) return null;
  return {
    outlineColor: null,
    outlineWidth: null,
    uppercase: null,
    ...(raw as CaptionStyle),
  };
}
```

(스프레드가 나중이라 기존 값이 이기고, 누락 키만 null이 된다. `matchPresetId`도 이 백필 덕에 구 행에서 undefined 비교 없이 일관 동작한다.)

### 프리셋 매칭 — `model/caption-presets.ts` (신규, 전문)

```ts
import {
  CAPTION_STYLE_PRESETS,
  type CaptionStyle,
  type CaptionStylePresetId,
} from "~/fsd/shared/config/constants";

// 분석 메타데이터용 프리셋 판정. position은 프리셋 소속이 아니므로 무시한다.
export function matchPresetId(
  style: CaptionStyle | null,
): CaptionStylePresetId | "custom" | "default" {
  if (style === null) return "default";
  const hit = CAPTION_STYLE_PRESETS.find((preset) =>
    Object.entries(preset.style).every(
      ([key, value]) => style[key as keyof Omit<CaptionStyle, "position">] === value,
    ),
  );
  return hit?.id ?? "custom";
}
```

### UI

- `atoms/dialog.tsx` (신규): shadcn new-york Dialog. `sheet.tsx`와 동일하게 `import { Dialog as DialogPrimitive } from "radix-ui"`, data-slot, `cn()` — 기존 패턴 그대로라 본문 생략.
- `CaptionStyleDialog.tsx` (신규): 열릴 때 `initialValue`(카드가 `toCaptionStyle(draft.captionStyle)`로 계산해 전달)로 작업본 시드. `DialogContent`는 `max-w-2xl max-h-[90dvh] overflow-y-auto`, 내부 `grid grid-cols-1 gap-4 md:grid-cols-2`. 푸터 버튼(앱 언어 영어 그대로): **"Apply"** — `onApply(working)` 1회 호출 후 닫기, **"Apply to all clips"** — `onApplyToAll(working)` 후 닫기(working이 null이면 비활성), **"Cancel"** — 폐기. "Reset style"은 작업본을 null로만 바꾼다(Apply해야 null 저장 = 기본값 리셋, `updateClipDraftSchema`의 null 의미 그대로). **실패 경로**: Apply는 저장 결과를 기다리지 않고 즉시 닫는다 — 카드의 `runSave`가 에러를 삼키므로(`ClipDraftCard.tsx:145-155`) Dialog는 성공을 관찰할 수 없고, 실패는 기존 `saveMutation` onError 토스트("Failed to save clip")로 표면화되며 재열기 시 서버값으로 재시드된다.
- `CaptionStyleEditor.tsx`: 프리셋 칩 행(클릭 시 `emit(preset.style)`, 활성 표시는 `matchPresetId`), 외곽선 색 스와치(기존 COLOR_PRESETS 패턴 `CaptionStyleEditor.tsx:128-142`) + 두께 스테퍼(words-per-line 패턴 150-181행), "Uppercase" 토글 버튼. **effective 계산에 신규 필드를 얹는다**: `outlineColor ?? DEFAULT_OUTLINE_COLOR`, `outlineWidth ?? 언어별 DEFAULT_OUTLINE_WIDTH`, `uppercase ?? false`. **단 `emit`은 effective가 아니라 저장값(null 포함)을 펼친다** — effective를 펼치면 위치만 바꿔도 폰트·줄당 단어가 실제 값으로 굳어져, 겉모습이 프리셋과 같은데도 프리셋 칩이 꺼진다(프리셋은 position을 포함하지 않으므로 위치 변경은 매칭에 영향을 주면 안 된다). 두께 스테퍼는 기본값이 소수(1.1/1.3)이므로 `Math.round(현재값) ± 1` 후 `OUTLINE_WIDTH_RANGE`로 클램프해 emit한다(이후엔 정수만 오간다). 프리뷰: `WebkitTextStroke: \`${effectiveOutlineWidth * 320 / 1920 * 2}px ${effectiveOutlineColor}\``(기존 폰트 스케일 계수 재사용; CSS 스트로크는 글리프 중앙 기준이라 ASS 바깥 스트로크의 근사 — ×2로 보정), `textTransform: uppercase ? "uppercase" : "none"`. 안내 문구에 외곽선 근사 언급 추가.
- `ClipDraftCard.tsx`: `captionStyle`(97-99행)·`styleDirty`(103행) 상태 삭제, 자동저장 deps `[startSeconds, endSeconds]`로 축소(196행)·페이로드 `captionStyle: undefined` 고정(181, 209행), `handleToggleStyleOpen`(215-224행)은 open 토글만으로 단순화, 인라인 에디터 자리(477-499행)에 Dialog 마운트. "Caption style" 버튼은 `!withinLimits`면 disabled(범위 무효면 `saveClipDraftEdit` 자체가 거부하므로).

### 분석

- `analytics-contract.ts:31` 다음 줄에 `"clip_review_caption_style_edited",`
- `metadata.ts:47` 다음에 `clip_review_caption_style_edited: ["uploadedFileId", "preset", "appliedToAll"],` — preset 값은 `matchPresetId` 결과(프리셋 id | "custom" | "default"). boolean은 `SafeMetadataValue`에 포함되어 통과한다(`metadata.ts:1`)
- **발화 지점은 Dialog가 아니라 훅이다.** Dialog는 성공을 관찰할 수 없다(카드 `runSave`가 에러를 삼킴). 기존 계측이 전부 훅에 모여 있는 패턴 그대로(`use-clip-draft-review.ts:94-105`), 두 곳에 추가한다:
  - `saveMutation`에 `onSuccess: (_data, input) => {...}` 추가 — `input.captionStyle !== undefined`일 때만 `matchPresetId(input.captionStyle)`로 preset 판정, `appliedToAll: false`. (카드 자동저장은 리팩터 후 항상 `captionStyle: undefined`를 보내므로 이 조건이 Dialog Apply만 정확히 골라낸다. null Apply = 리셋도 `undefined`가 아니므로 preset "default"로 잡힌다.)
  - `applyStyleMutation.onSuccess`를 `async (_data, style) => {...}`로 바꿔 동일 이벤트를 `matchPresetId(style)`, `appliedToAll: true`로 발화.
  - 둘 다 `REVIEW_ANALYTICS_PATH` 사용, `matchPresetId`는 같은 model 디렉터리 `./caption-presets`에서 임포트.
- `event-catalog.test.mjs:9-10`: "28개"→"29개", `28`→`29`
- **문서 동기** — `apps/web/CLAUDE.md:148`의 "이벤트 이름 28개"가 이 추가로 거짓이 된다 → "29개"로 갱신. 같은 파일 69행(테스트 파일 수·개수)과 테스트 표도 신규 `caption-presets.test.mjs`를 반영해 갱신 시점에 실측으로 재기록.

## 테스트

- **덮는 것** (`caption-presets.test.mjs`, tsx 러너): ① 모든 프리셋이 `captionStyleSchema.safeParse({ ...preset.style, position: "middle" })` 통과 ② outlineWidth가 `OUTLINE_WIDTH_RANGE` 안 ③ `matchPresetId` — 각 프리셋 스타일은 자기 id, 한 필드 변형은 "custom", null은 "default" ④ 범위 밖 outlineWidth(7)·잘못된 hex("red") 거부. `event-catalog.test.mjs` 카운트 29.
- **못 덮는 범위**: Dialog/에디터 DOM 상호작용(러너에 DOM 없음), `main.py` 전부(파이썬 하네스 없음 — 아래 수동 검증으로 갈음), pysubs2 속성명 수정의 실제 렌더 효과(육안).

수동 검증: 백엔드 배포 후 ① 구 스타일 행(4필드)으로 렌더 — 색상이 **이제** 반영되는 것 확인(기존 버그 수정 효과) ② 신 필드 페이로드(노랑 + 외곽선 5 + uppercase)로 렌더 ③ 웹에서 Dialog 열기→프리셋→Apply→재열기 유지→Cancel 폐기→Apply-to-all 전파→범위 무효 클립 버튼 disabled→모바일 스택 확인 ④ **v2 이전 4필드 스타일이 저장된 클립**에서 Dialog를 열어 무수정 Apply — 백필 덕에 저장이 성공해야 한다 ⑤ Generate 후 번인 결과와 프리뷰 대조.

## 범위 밖 의존

이 계획은 web-dev 에이전트가 아니라 메인 세션이 직접 구현한다(사용자 승인 완료). web-dev에 위임할 경우 다음 두 지점에서 `보류`가 된다:

- `apps/backend/main.py`·`apps/backend/CLAUDE.md` — 백엔드 담당 에이전트 부재
- `packages/db/src/analytics-contract.ts` — 워크스페이스 밖 (web 담당 범위는 apps/web)

Modal 배포(`modal deploy`)는 사용자 인증이 필요할 수 있어 세션에서 막히면 사용자에게 요청한다.

## 대안

- **Sheet(side="right") 재사용** — 새 컴포넌트 0개지만 `max-w-md`(≈448px) 폭에 2열(컨트롤+9:16 프리뷰)이 안 들어가 컨트롤이 늘수록 세로 스크롤이 길어진다. 기각.
- **자동저장 유지** — styleDirty 동기화 로직(스테일 값이 Apply-to-all을 덮는 문제의 방어 장치)을 Dialog에서도 유지해야 한다. Apply 커밋이 그 장치 자체를 불필요하게 만든다. 기각.
- **karaoke 선행** — 쇼츠 지배 스타일이지만 한국어 자막이 Gemini 줄 단위 번역(`main.py:525-528`)이라 단어 타임스탬프가 없어 영어 전용 비대칭이 된다. Phase 3로 미룸.
- **bold/italic/letterSpacing/그림자 노출 안 함** — Anton·Noto KR Bold는 이미 단일 헤비 웨이트라 bold 토글이 시각적 no-op이고, italic은 페이스 자체가 이미지에 없다. letterSpacing·그림자는 조정 가치 대비 UI 복잡도만 늘린다.
