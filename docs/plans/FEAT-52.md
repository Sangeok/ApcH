# FEAT-52: 캡션 스타일을 검토 화면에서 제거하고 설정 전용으로

agent: web-dev

## 현재 동작

캡션 스타일은 지금 **검토 화면(클립별)과 설정 화면(사용자 기본값)** 두 곳에서 편집되고, 업로드 스냅샷·드래프트 시드·렌더 페이로드·계측까지 클립별 경로가 걸려 있다. `파일:줄`로 확인한 사실:

**검토 화면 클립별 편집 경로**
- `widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx:520-523`에 `Caption style` 버튼(`onClick={() => setIsStyleDialogOpen(true)}`)이 있고, `:526-541`에서 `<CaptionStyleDialog ... initialValue={toCaptionStyle(draft.captionStyle)} ... snapshotValue={toCaptionStyle(uploadCaptionStyle)} />`를 렌더한다.
- `ClipDraftCard.tsx:207-216` `handleApplyStyle`가 `runSave({ ... captionStyle: style })`로 스타일을 저장하고, 구간 자동저장(`:175` `captionStyle: undefined,`)과 선택 저장(`:201` `captionStyle: undefined,`)은 스타일을 건드리지 않는다.
- `CaptionStyleDialog.tsx`는 `CaptionStyleEditor`를 감싸고, `Apply`(`:145` `onApply(working)`)·`Apply to all clips`(`:135` `onApplyToAll(working)`)·`Save as my default`(`:113` `onSaveAsDefault(working)`)·`Reset style`(`:97` `setWorking(snapshotValue)`)를 노출한다.
- `widgets/.../model/use-clip-draft-review.ts`가 이 콜백들의 뮤테이션을 소유한다: `applyStyleMutation`(`:182-207`, 벌크 `saveClipDraftEdit({ ... captionStyle: style })`), `saveDefaultMutation`(`:217-238`, `saveDefaultCaptionStyle(style)` + `settings_defaults_saved` `source: "review_dialog"` 계측 `:228`), 캡션 계측 `trackCaptionStyleEdited`(`:104-113`, `"clip_review_caption_style_edited"`), `saveMutation.onSuccess`(`:124-127`, `input.captionStyle !== undefined`일 때 계측).
- `use-clip-draft-review.ts:29-36` `SaveDraftInput`에 `captionStyle?: CaptionStyleInput | null`이 있고, `widgets/.../ui/index.tsx:99` `uploadCaptionStyle` prop → `:459-466`에서 카드로 `onApplyToAll`·`isApplyingToAll`·`uploadCaptionStyle`·`onSaveAsDefault`·`isSavingDefault`를 threading한다.

**저장·시드·페이로드 경로**
- `features/clip-review/api/index.ts:52-58` `saveClipDraftEdit` 입력에 `captionStyle?: CaptionStyleInput | null`, `:94-99`에서 `updateClipDraftEdit(..., { ... captionStyle })`. 스키마는 `features/clip-review/model/schemas.ts:21` `captionStyle: captionStyleSchema.nullable().optional(),`.
- `entities/clip-draft/api/index.ts:67-89` `updateClipDraftEdit`가 `captionStyle`를 `Prisma.JsonNull` 관용으로 쓰고(`:84-86`), `:94-113` `getSelectedRenderMomentsForAttempt`가 `:111` `caption_style: (draft.captionStyle as CaptionStyle | null) ?? undefined,`로 **클립별 스타일을 렌더 moment에 싣는다**(디스패치 페이로드). `:117-158` `createCustomClipDraft`가 `args.captionStyle`를 시드(`:151-153`).
- `features/clip-review/api/index.ts:140-148` `addCustomClipDraft`가 `createCustomClipDraft(..., { ... captionStyle: file.captionStyle as CaptionStyleInput | null })`로 커스텀 클립에 업로드 스냅샷을 시드한다.
- `inngest/functions.ts:927-951` analyze 핸들러의 `persist-clip-drafts` 스텝이 `:928` `const snapshotStyle = context.captionStyle as CaptionStyle | null;`을 읽어 `:948` `...(snapshotStyle !== null ? { captionStyle: snapshotStyle } : {}),`로 드래프트를 시드한다.
- `inngest/functions.ts:376-379`가 요청 단위 스냅샷을 실어 Modal에 보낸다: `caption_style: autoRequestCaptionStyle(shouldRenderSelectedMoments, context.captionStyle as CaptionStyle | null),`.
- `inngest/caption-style-request.ts:9-15` `autoRequestCaptionStyle(isRenderMode, snapshot)`: `:13` `if (isRenderMode) return undefined;` — **render는 요청 스냅샷을 무효화**하고 `auto`만 스냅샷을 싣는다.
- `inngest/client.ts:13` `export type RenderCaptionStyle = CaptionStyle;`, `:23` `caption_style?: RenderCaptionStyle | null;`(`RenderMoment` 필드).

**`captionStyle` select 세 곳(경계의 핵심)** — `entities/uploaded-file/api/index.ts`:
- `:314` `captionStyle: true,`(`getUploadedFileDetailsById`) → `UploadedFileDetail.captionStyle`(`model/types.ts:47`) → `pages/upload-detail/ui/index.tsx:51` `captionStyle: uploadCaptionStyle,` → `:125` `uploadCaptionStyle={uploadCaptionStyle}` → **검토 다이얼로그 Reset 전용 소비자**.
- `:480` `captionStyle: true,`(`findUploadedFileReviewState`) → `features/clip-review/api/index.ts:147` `file.captionStyle`를 **커스텀 클립 시드가 읽는 유일한 소비자**.
- `:519` `captionStyle: true, // auto 요청 스냅샷 · 분석 드래프트 시드가 읽는다`(`findCurrentProcessingAttemptContext`) → `functions.ts:376`(요청 스냅샷)과 `:928`(드래프트 시드) 둘이 읽는다. **디스패치가 읽는 몫**이다.
- 업로드 스냅샷 **쓰기**는 `:105-127` `createUploadDraft`의 `captionStyle` 파라미터(`features/upload/api/index.ts:243-255`에서 `getUserDefaultCaptionStyle` → `captionStyle: defaultCaptionStyle`).

**설정 화면 / 편집기 / 계측**
- `pages/settings/ui/index.tsx:53` `const [language, setLanguage] = useState(initialDefaults.language);` 하나가 **업로드 기본 언어 드롭다운(`:146-163`, `handleSave`로 저장)과 캡션 미리보기 언어(`:230` `language={language}`·`:236` `words={sampleCaptionWords(language)}`)를 겸한다.**
- `pages/settings/ui/index.tsx:222` `<CardTitle>Default caption style</CardTitle>`, `:223-226` 설명 `New uploads start with this caption style. You can still change it per clip while reviewing.`
- `features/caption-style/ui/CaptionStyleEditor.tsx:23` `onChange: (style: CaptionStyle) => void;` — `:93-95` `emit`이 `onChange({ ...(value ?? EMPTY_STYLE), ...patch })`라 **`null`을 낼 수 없다.** 프리셋 칩은 `:107-117`이고 `:97` `const activePreset = matchPresetId(value);`, `:112` `variant={activePreset === preset.id ? "default" : "outline"}` — `matchPresetId(null) === "default"`(`caption-presets.ts:14`)일 때 어떤 칩도 켜지지 않는다.
- `shared/analytics/lib/metadata.ts:48` `clip_review_caption_style_edited: ["uploadedFileId", "preset", "appliedToAll"],`, `:59-63` `settings_defaults_saved`의 `source` 주석이 `"review_dialog"`를 예고한다. 이 맵은 `:65` `as const satisfies Record<AnalyticsEventName, readonly string[]>`이고, `AnalyticsEventName`은 `@repo/db`의 `analytics-contract.ts:30`(`ANALYTICS_EVENT_NAMES`에 `"clip_review_caption_style_edited"`)에서 온다.
- 업로드 폼은 `pages/dashboard/ui/_component/UploadPodcast.tsx`이며 언어(`:216-238`)·클립 수(`:239-268`)·`Generation`(`:269-292`) 드롭다운이 파일 선택 후 뜬다. **캡션 스타일에 대한 언급은 없다** — 스타일 발견 경로는 검토 화면 버튼뿐이다.
- FEAT-51은 **완료·프로덕션 배포**됐다(보드 2026-09-16). 백엔드 `select_caption_style(moment_style, request_style)`이 auto·render 공통으로 클립별 스타일 부재 시 요청 스냅샷으로 폴백한다.

## 문제

백로그 FEAT-52 `source`가 지목한 문제: 검토 화면이 카드마다 성격이 다른 결정(구간·선택 = 클립별 편집 vs 스타일 = 영상 전체 미감)을 왕복시켜 "무겁다"(관측 1). 스타일은 이미 `Apply to all`이 있고(관측 2), 설정 화면 컨트롤·미리보기가 실제 적용값을 그린다(관측 3). 소유자 결정(관측·대화 확정): **스타일은 설정 화면 전용, 업로드 시점 스냅샷(`UploadedFile.captionStyle`)이 그 영상의 스타일**이고 업로드 뒤엔 안 바뀐다.

코드에서 확인한 것과 어긋나지 않는다: 검토 클립별 경로(`ClipDraftCard.tsx:520`의 `Caption style` 버튼 → `updateClipDraftEdit`의 `captionStyle` 쓰기 → `getSelectedRenderMomentsForAttempt:111`의 per-moment `caption_style`)가 실재하고, FEAT-51이 그 부재를 요청 스냅샷으로 폴백하도록 백엔드를 이미 배포했으므로, 웹이 클립별 경로를 끊고(요구 ①②) render도 요청 스냅샷을 싣게(요구 ③) 하면 전환이 성립한다. 관측 4(설정 화면 `language`가 미리보기 언어와 업로드 기본 언어를 겸함)도 `:53`에서 그대로 확인된다.

이 항목은 **컬럼을 지우지 않는다** — `ClipDraft.captionStyle` 참조만 0으로 만든다. 컬럼 drop은 FEAT-53(main-loop, `packages/db`).

## 고칠 파일

**삭제 (3)**

| 파일 | 변경 |
| --- | --- |
| `src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx` | 파일 삭제 — 검토 화면 스타일 다이얼로그 폐지(요구 ①) |
| `src/fsd/widgets/clip-draft-review/model/caption-style-from-json.ts` | 파일 삭제 — 소비자(`ClipDraftCard`의 `toCaptionStyle`)가 사라진다(요구 ①) |
| `src/fsd/widgets/clip-draft-review/model/caption-style-from-json.test.mjs` | 파일 삭제 — 위 모듈의 테스트 |

**수정 — 검토 화면 위젯 (요구 ①)**

| 파일 | 변경 |
| --- | --- |
| `src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | `CaptionStyleDialog` 렌더·import·`Caption style` 버튼(`:514-523`)·`toCaptionStyle` import·`isStyleDialogOpen` state·`handleApplyStyle` 제거. props(`onApplyToAll`·`isApplyingToAll`·`uploadCaptionStyle`·`onSaveAsDefault`·`isSavingDefault`) 제거. 두 `runSave`의 `captionStyle: undefined` 줄 제거. 미사용된 `type CaptionStyle`·`type UploadedFile` import 제거 |
| `src/fsd/widgets/clip-draft-review/ui/index.tsx` | `ClipDraftReviewSectionProps.uploadCaptionStyle`(`:42-43`) 제거, 훅 구조분해에서 `applyStyleToAll`·`isApplyingToAll`·`saveCaptionStyleAsDefault`·`isSavingDefault` 제거, `<ClipDraftCard>`의 스타일 5 props 제거, 미사용 `UploadedFile` import 제거 |
| `src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts` | `applyStyleMutation`·`saveDefaultMutation`·`trackCaptionStyleEdited`·`saveMutation.onSuccess`(캡션 계측) 제거, `SaveDraftInput.captionStyle` 제거, 반환값 `applyStyleToAll`·`saveCaptionStyleAsDefault`·`isApplyingToAll`·`isSavingDefault` 제거, import `saveDefaultCaptionStyle`·`matchPresetId`·`CaptionStyleInput` 제거 |
| `src/fsd/pages/upload-detail/ui/index.tsx` | 구조분해 `captionStyle: uploadCaptionStyle,`(`:51`)와 `uploadCaptionStyle={uploadCaptionStyle}`(`:125`) 제거 |

**수정 — 저장·시드·페이로드 경로 (요구 ②③)**

| 파일 | 변경 |
| --- | --- |
| `src/fsd/features/clip-review/api/index.ts` | `saveClipDraftEdit` 입력·구조분해·`updateClipDraftEdit` 인자에서 `captionStyle` 제거, `addCustomClipDraft`의 `createCustomClipDraft` 호출에서 `captionStyle` 시드 제거(`:143-147`), `type CaptionStyleInput` import 제거 |
| `src/fsd/features/clip-review/model/schemas.ts` | `updateClipDraftSchema`에서 `captionStyle: captionStyleSchema.nullable().optional(),`(`:21`) 제거. **`captionStyleSchema` import·재수출은 유지**(`caption-presets.test.mjs:7`이 이 경로로 임포트한다) |
| `src/fsd/entities/clip-draft/api/index.ts` | `updateClipDraftEdit`에서 `captionStyle` 파라미터·`Prisma.JsonNull` 분기 제거, `getSelectedRenderMomentsForAttempt`에서 `caption_style` 매핑(`:111`) 제거, `createCustomClipDraft`에서 `captionStyle` 인자·시드 제거, `type CaptionStyle` import 제거, `import { Prisma }`를 `import type { Prisma }`로(값 용례 `JsonNull`·`InputJsonValue`가 사라지므로 — 상단 주석도 갱신) |
| `src/fsd/inngest/functions.ts` | analyze `persist-clip-drafts`에서 `snapshotStyle`(`:928`)과 `captionStyle` 시드 스프레드(`:948`) 제거, 디스패치 `caption_style` 호출(`:376-379`)을 `requestCaptionStyle(...)`로(bool 인자 제거), 주석 `:375`·`:378` 갱신, import를 `requestCaptionStyle`로 |
| `src/fsd/inngest/caption-style-request.ts` | `if (isRenderMode) return undefined;` 게이트 제거 → render도 스냅샷을 싣는다. `isRenderMode` 파라미터를 제거하고 함수명을 `requestCaptionStyle(snapshot)`로, 독스트링 재작성(요구 ③) |
| `src/fsd/inngest/caption-style-request.test.mjs` | `requestCaptionStyle`로 갱신 — 2 케이스 |
| `src/fsd/inngest/client.ts` | `RenderMoment.caption_style`(`:23`)·`RenderCaptionStyle` 타입(`:13`)·미사용 `CaptionStyle` import(`:2`) 제거 |
| `src/fsd/shared/config/constants.ts` | **주석 한 줄만.** `CaptionStyle` 독주석이 `* 렌더 이벤트 페이로드(src/inngest/client.ts의 RenderCaptionStyle),`로 위에서 지우는 타입을 가리킨다(`:113`). 그 타입이 사라지므로 이 줄을 실제 참조(요청 단위 `caption_style` 페이로드)로 고친다 — 안 고치면 계약 주석이 없는 타입을 가리키는 교차 파일 드리프트가 남는다(FEAT-44가 잡으려는 바로 그 부류). 코드·타입 무변경 |

**수정 — `captionStyle` select 경계 (요구 ②)**

| 파일 | 변경 |
| --- | --- |
| `src/fsd/entities/uploaded-file/api/index.ts` | `getUploadedFileDetailsById`의 `captionStyle: true,`(`:314`) 제거, `findUploadedFileReviewState`의 `captionStyle: true,`(`:480`) 제거. **`findCurrentProcessingAttemptContext`의 `:519`는 유지**하고 주석만 `// auto·render 요청 스냅샷이 읽는다`로. `createUploadDraft`의 `captionStyle` 파라미터(`:112`)는 **유지**(업로드 스냅샷 쓰기) |
| `src/fsd/entities/uploaded-file/model/types.ts` | `UploadedFileDetail.captionStyle`(`:46-47`) 제거, 미사용 `UploadedFile` import(`:1`) 제거 |

**수정 — 설정 화면·편집기 (요구 ⑤⑥⑦)**

| 파일 | 변경 |
| --- | --- |
| `src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx` | `onChange` 타입을 `(style: CaptionStyle \| null) => void`로 확대, 프리셋 칩 줄 맨 앞에 `Default` 칩 추가(`onClick={() => onChange(null)}`, `activePreset === "default"`일 때 켜짐)(요구 ⑥) |
| `src/fsd/pages/settings/ui/index.tsx` | 카드 제목 `Default caption style`→`Video style`·설명 갱신·`Captions` 섹션 헤더 추가(요구 ⑤), 비저장 `previewLanguage` state + 미리보기 언어 토글 추가·편집기 `language`/`words`를 `previewLanguage`로(요구 ⑦) |

**수정 — 계측 (요구 ④)**

| 파일 | 변경 |
| --- | --- |
| `src/fsd/shared/analytics/lib/metadata.ts` | `settings_defaults_saved`의 `source` 주석에서 `"review_dialog"` 제거(이제 `"settings_page"`만 발신). **`clip_review_caption_style_edited` 키는 유지**(제거 시 `satisfies Record<AnalyticsEventName>`가 깨진다 — 「범위 밖 의존」) |
| `src/fsd/shared/analytics/lib/metadata.test.mjs` | `settings_defaults_saved` 케이스의 `source: "review_dialog"`→`"settings_page"`, 주석 정리(발신되지 않는 값 참조 제거) |

**수정 — 업로드 폼 발견 경로 (요구 ⑧)**

| 파일 | 변경 |
| --- | --- |
| `src/fsd/features/caption-style/model/caption-presets.ts` | `captionStyleLabel(style)` 순수 함수 추가(프리셋 라벨 / `"Default"` / `"Custom"`) |
| `src/fsd/features/caption-style/model/caption-presets.test.mjs` | `captionStyleLabel` describe 추가 — 3 케이스 |
| `src/fsd/features/caption-style/index.ts` | `captionStyleLabel` 배럴 재수출 |
| `src/app/dashboard/page.tsx` | `getUserDefaultCaptionStyle`를 `Promise.all`에 추가, `DashboardView`에 `defaultCaptionStyle` prop 전달 |
| `src/fsd/pages/dashboard/ui/index.tsx` | `DashboardViewProps.defaultCaptionStyle` 추가, `UploadPodcast`로 전달 |
| `src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx` | `defaultCaptionStyle` prop 추가, 옵션 블록에 읽기 전용 `Video style: <라벨>` + 설정 링크 한 줄 추가. **임포트 셋이 새로 필요하다** — 이 파일에는 지금 셋 다 없다(검증 라운드 1 실측): `import Link from "next/link";`(`widgets/dashboard-header/ui/index.tsx`가 `<Link href="/dashboard/settings">Settings</Link>`로 쓰는 집안 전례와 같은 라우트다) · `captionStyleLabel`(`~/fsd/features/caption-style` 배럴) · `type CaptionStyle`(`~/fsd/shared/config/constants`, prop 타입용) |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다. `entities/clip-draft/server.ts`(재수출 배럴)·`features/caption-style/model/caption-preview.ts`·`sample-captions.ts`·`CaptionPreviewPlayer.tsx`는 무변경(설정 화면이 편집기를 계속 쓴다). `createClipDraftsBulk`·`listClipDraftsForAttempt`(select 없는 `ClipDraft` 조회)는 컬럼이 남아 있는 동안 그대로 돈다 — FEAT-53이 컬럼을 drop할 때 재생성된다.

## 구현 스케치

### ⑥ Default 칩 배선 (함정 해결) — `CaptionStyleEditor.tsx`

`emit`(`:93-95`)은 `onChange({ ...(value ?? EMPTY_STYLE), ...patch })`라 항상 완전 객체를 내고 **`null`을 못 낸다.** `Default` 칩은 `null`을 내야 `matchPresetId(null) === "default"`가 되어 언어 기본값이 유지된다. 해결: **`onChange` 타입을 `null` 허용으로 넓히고 `Default` 칩은 `emit`을 거치지 않고 `onChange(null)`을 직접 호출한다.** FEAT-52 뒤 `CaptionStyleEditor`의 유일한 소비자는 설정 화면(`onChange={setCaptionStyle}`, `setCaptionStyle`은 `Dispatch<SetStateAction<CaptionStyle | null>>`)이라 타입 확대가 그대로 맞는다(다이얼로그 소비자 `setWorking`은 함께 삭제된다).

prop 타입 before(`:23`):

```tsx
  onChange: (style: CaptionStyle) => void;
```

after:

```tsx
  // Default 칩이 null을 낸다(= 언어별 기본값). emit은 여전히 완전 객체를 내므로
  // null 허용은 확대일 뿐이다.
  onChange: (style: CaptionStyle | null) => void;
```

프리셋 칩 블록 before(`:106-118`):

```tsx
          <div className="flex flex-wrap gap-1">
            {CAPTION_STYLE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={activePreset === preset.id ? "default" : "outline"}
                onClick={() => emit(preset.style)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
```

after (맨 앞에 `Default` 칩):

```tsx
          <div className="flex flex-wrap gap-1">
            {/* null = "설정 안 함". emit은 null을 못 내므로(effective 병합) onChange를
                직접 부른다. matchPresetId(null) === "default"라 이 칩만 켜진다. */}
            <Button
              type="button"
              size="sm"
              variant={activePreset === "default" ? "default" : "outline"}
              onClick={() => onChange(null)}
            >
              Default
            </Button>
            {CAPTION_STYLE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={activePreset === preset.id ? "default" : "outline"}
                onClick={() => emit(preset.style)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
```

### ③ render도 요청 스냅샷 — `caption-style-request.ts` (전체 교체)

```ts
import type { CaptionStyle } from "~/fsd/shared/config/constants";

/**
 * Modal 요청의 요청 단위 caption_style을 정한다 — auto·render 공통(FEAT-52).
 * - 업로드 스냅샷이 있으면 그 값. 클립별 스타일은 폐지됐고, 백엔드는 클립별
 *   caption_style이 없으면 이 요청 단위 값으로 폴백한다(FEAT-51 render 게이트 제거).
 * - null이면 undefined(JSON.stringify가 키를 생략) → 백엔드 언어 기본값.
 */
export function requestCaptionStyle(
  snapshot: CaptionStyle | null,
): CaptionStyle | undefined {
  return snapshot ?? undefined;
}
```

`functions.ts` 디스패치 before(`:375-379`):

```tsx
            // JSON.stringify가 undefined 키를 떨어뜨리므로 render·null 스냅샷에선 키가 생략된다.
            caption_style: autoRequestCaptionStyle(
              shouldRenderSelectedMoments,
              context.captionStyle as CaptionStyle | null, // 렌더 경로(entities/clip-draft/api :111)와 같은 캐스트
            ),
```

after:

```tsx
            // JSON.stringify가 undefined 키를 떨어뜨리므로 null 스냅샷에선 키가 생략된다(render·auto 공통).
            caption_style: requestCaptionStyle(
              context.captionStyle as CaptionStyle | null, // 업로드 시점 스냅샷(UploadedFile.captionStyle)
            ),
```

import before(`:33`): `import { autoRequestCaptionStyle } from "./caption-style-request";` → after: `import { requestCaptionStyle } from "./caption-style-request";`

### ② 드래프트 시드 제거 — `functions.ts` `persist-clip-drafts`

before(`:927-951`):

```tsx
      await step.run("persist-clip-drafts", async () => {
        const snapshotStyle = context.captionStyle as CaptionStyle | null;
        await createClipDraftsBulk(
          validMoments.map((moment, order) => ({
            uploadedFileId,
            attempt,
            // ...(index/aiStart/aiEnd/start/end/type/hook/payoff/referenceTranslation)
            selected: order < clipCount,
            // 스냅샷이 있으면 시드, null이면 필드 생략(컬럼 null → 언어 기본값).
            // 커스텀 클립(createCustomClipDraft)은 이 경로 밖이라 계속 null이다(의도 — render는
            // 드래프트 스타일만 쓰므로 언어 기본값으로 렌더된다).
            ...(snapshotStyle !== null ? { captionStyle: snapshotStyle } : {}),
          })),
        );
      });
```

after — `snapshotStyle` 선언과 마지막 스프레드 줄만 제거(다른 필드 매핑은 그대로). 드래프트는 이제 `captionStyle`을 시드하지 않는다(컬럼 항상 null). `CaptionStyle` import는 `:376` 캐스트가 계속 쓰므로 유지.

### ② 렌더 moment 페이로드 제거 — `entities/clip-draft/api/index.ts`

`getSelectedRenderMomentsForAttempt` before(`:103-113`):

```ts
  return drafts.map((draft, order) => ({
    index: order,
    start: draft.startSeconds,
    end: draft.endSeconds,
    type: draft.clipType,
    hook: draft.hook,
    payoff: draft.payoff,
    // 저장 시 captionStyleSchema(shared CaptionStyle)로 검증된 JSON.
    caption_style: (draft.captionStyle as CaptionStyle | null) ?? undefined,
  }));
```

after — `caption_style` 줄과 그 주석 제거(나머지 필드 유지). 백엔드는 per-moment 스타일 부재 시 요청 스냅샷으로 폴백한다(FEAT-51).

`updateClipDraftEdit` before(`:67-89`) — `captionStyle` 관련만 제거:

```ts
export async function updateClipDraftEdit(
  clipDraftId: string,
  data: { startSeconds: number; endSeconds: number; selected: boolean; },
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).clipDraft.update({
    where: { id: clipDraftId },
    data,
  });
}
```

`createCustomClipDraft` — `args`에서 `captionStyle?` 제거, `:151-153`의 시드 스프레드 제거. import: `type { CaptionStyle }` 제거, `import { Prisma }` → `import type { Prisma }`(상단 주석 `Prisma.JsonNull 값을 쓰므로...`는 없어진 근거이므로 삭제).

### ⑤⑦ 설정 화면 — `pages/settings/ui/index.tsx`

state 추가(`:53` 옆):

```tsx
  // 미리보기 전용 언어. 업로드 기본 언어(language, Save defaults로 저장됨)와 분리한다 —
  // 한국어 미리보기를 보려고 업로드 언어를 건드리는 사고 경로를 막는다(FEAT-52 관측 4). 저장 안 함.
  const [previewLanguage, setPreviewLanguage] = useState(initialDefaults.language);
```

카드 제목·설명 before(`:220-227`):

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Default caption style</CardTitle>
          <CardDescription>
            New uploads start with this caption style. You can still change it
            per clip while reviewing.
          </CardDescription>
        </CardHeader>
```

after:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Video style</CardTitle>
          <CardDescription>
            New uploads use this style. It&apos;s locked in when you upload — to
            change a video&apos;s style, upload it again.
          </CardDescription>
        </CardHeader>
```

`CardContent` 안, 편집기 위에 `Captions` 섹션 헤더 + 미리보기 언어 토글 추가:

```tsx
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Captions</p>
            <p className="text-muted-foreground text-xs">
              Right now you can style the captions. Framing and background will
              live here too.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-xs font-medium">
              Preview language
            </p>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <Button
                key={lang.value}
                type="button"
                size="sm"
                variant={previewLanguage === lang.value ? "default" : "outline"}
                onClick={() => setPreviewLanguage(lang.value)}
              >
                {lang.label}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-[11px]">
            Preview only — this doesn&apos;t change your upload language.
          </p>
          <CaptionStyleEditor
            language={previewLanguage}
            value={captionStyle}
            sample
            playUrl={null}
            clipStart={0}
            clipEnd={SAMPLE_CAPTION_CLIP_END}
            words={sampleCaptionWords(previewLanguage)}
            onChange={setCaptionStyle}
          />
          {/* 기존 Save/Reset 버튼 블록 유지 */}
```

(편집기의 `language={language}`·`words={sampleCaptionWords(language)}`가 `previewLanguage`로 바뀌는 것이 요점이다. 업로드 기본 언어 드롭다운(`:146-163`)은 `language`를 그대로 쓴다.)

### ⑧ 업로드 폼 라벨 — `caption-presets.ts` + `UploadPodcast.tsx`

`caption-presets.ts`에 추가:

```ts
// 업로드 폼·발견 경로가 쓰는 사람이 읽는 라벨. matchPresetId 위에 얹는다.
// "custom"을 따로 분기하지 않는다 — find가 못 찾으면 ?? 가 받는다. 분기를 두면
// 그 ??가 도달 불가가 되어 테스트로 고정되지 않는다(검증 라운드 1 돌연변이 실측).
export function captionStyleLabel(style: CaptionStyle | null): string {
  const match = matchPresetId(style);
  if (match === "default") return "Default";
  return CAPTION_STYLE_PRESETS.find((preset) => preset.id === match)?.label ?? "Custom";
}
```

> **왜 `custom` 분기를 뺐나(검증 라운드 1, 경로 5).** 처음 안은 `if (match === "custom") return "Custom";`을 두었는데, 아래 세 케이스에 돌연변이 7종을 심으니 **2마리가 살아남았다** — (a) 그 분기를 통째로 지워도 뒤의 `?? "Custom"`이 같은 값을 내고, (b) 그래서 `??` 폴백이 도달 불가라 `?? "Default"`로 바꿔도 아무 케이스가 안 죽었다. 분기를 빼면 `custom`이 `??`로 흘러 폴백이 **도달 가능**해지고, 같은 3케이스로 **7/7 사멸·생존 0**이 된다. 명세를 늘리지 않고 구현의 잉여를 없앤 쪽이다.

`UploadPodcast.tsx` — `defaults` 옆에 prop 추가, 옵션 블록(`Generation` 드롭다운 `:292` 뒤)에 읽기 전용 한 줄:

```tsx
                <div className="flex gap-x-2">
                  <p className="mt-1.5 text-sm font-medium">Video style:</p>
                  <div className="mt-1.5 flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {captionStyleLabel(defaultCaptionStyle)}
                    </span>
                    <Link
                      href="/dashboard/settings"
                      className="text-primary text-xs underline underline-offset-2"
                    >
                      Change in settings
                    </Link>
                  </div>
                </div>
```

`defaultCaptionStyle: CaptionStyle | null` prop을 `app/dashboard/page.tsx`(`getUserDefaultCaptionStyle`를 `Promise.all`에 추가 → `defaultCaptionStyle as CaptionStyle | null`) → `DashboardView`(prop 추가) → `UploadPodcast`로 threading.

### ④ 계측 정리 — `metadata.ts`

`settings_defaults_saved` 주석 before(`:59-63`):

```ts
  // source는 "settings_page" | "review_dialog". 기본값을 어디서 저장하는지가
  // FEAT-42의 인라인 저장 진입점이 실제로 쓰이는지에 답한다.
  // preset은 matchPresetId의 결과(프리셋 id | "custom" | "default")로
  // clip_review_caption_style_edited의 동명 키와 같은 의미다.
  settings_defaults_saved: ["source", "preset"],
```

after (검토 다이얼로그 저장 진입점이 사라지므로 `"review_dialog"` 삭제):

```ts
  // source는 "settings_page"(검토 다이얼로그 진입점은 FEAT-52에서 폐지).
  // preset은 matchPresetId의 결과(프리셋 id | "custom" | "default").
  settings_defaults_saved: ["source", "preset"],
```

`clip_review_caption_style_edited: [...]`(`:48`) 줄은 **남긴다** — 「범위 밖 의존」 참조.

## 테스트

- **덮는 것**
  - `caption-style-request.test.mjs` (2 케이스, `requestCaptionStyle(snapshot)`):
    1. `returns the upload snapshot when present (auto and render alike)` — dict 스냅샷 → 그대로 반환. render/auto 구분이 사라진 것을 명세로 못박는다.
    2. `returns undefined when the snapshot is null (key omitted → language defaults)` — `null` → `undefined`.
  - `caption-presets.test.mjs`에 `captionStyleLabel` describe 추가 (3 케이스). **이 셋이 함수를 완전히 고정한다** — 검증 라운드 1에서 돌연변이 7종(Default 라벨 뒤바꿈 · 라벨 대신 프리셋 id 반환 · `default` 분기 삭제 · 폴백을 `"Default"`로 · 폴백을 빈 문자열로 · `find`를 `[0]` 고정 · `null`도 `"Custom"`으로)을 심어 **7/7 사멸·생존 0**을 실측했다(위 「구현 스케치 ⑧」의 잉여 분기 제거가 전제다):
    1. `null → "Default"`.
    2. bold-yellow의 style(+임의 position `middle`) → `"Bold Yellow"` — 프리셋 매칭.
    3. 프리셋과 안 맞는 style(예: `fontSize: 200`) → `"Custom"`.
  - 기존 `caption-presets.test.mjs`(프리셋이 스키마 안·`matchPresetId`)·`caption-preview.test.mjs`·`sample-captions.test.mjs`는 설정 화면이 편집기를 계속 쓰므로 불변(회귀 가드).
- **삭제되는 테스트**: `caption-style-from-json.test.mjs`(7 케이스, `toCaptionStyle` 소비자 소멸).
- **기준선(착수 전 실측, 2026-09-17)**: `npm test -w apps/web` → **`tests 183 / suites 42 / pass 183 / fail 0`**, 테스트 파일 **26개**(`find src -name "*.test.mjs" | wc -l`).
- **구현 후 기대값**: 파일 **25개**(from-json 제거), suites **42**(from-json −1 · captionStyleLabel +1), tests **178**(from-json −7 · caption-style-request −1 · captionStyleLabel +3). 다른 숫자가 나오면 이 계획 밖의 무언가가 함께 바뀐 것이므로 멈추고 원인을 밝힌다.
- **게이트**: `npm run check -w apps/web`(= `verify:fsd:test` → `verify:fsd` → `next lint` → `tsc --noEmit`, `package.json:10`) · `npm test -w apps/web`. FSD 경계 검사가 `check`에 포함돼 있다 — 이 항목은 pages→features(`UploadPodcast`가 `captionStyleLabel` 임포트), app→entities(page.tsx→user/server) 정방향뿐이라 위반이 없다.
- **못 덮는 범위(배포 후 육안 — `docs/release-checks.md` 등재 대상)**:
  - 설정 카드 제목 `Video style`·설명·`Captions` 섹션 헤더 문구.
  - `Default` 칩이 뜨고, 눌렀을 때 켜지며(null 선택), 컨트롤·미리보기가 언어 기본값을 그리는지.
  - 미리보기 언어 토글이 미리보기만 바꾸고 `Save defaults`로 업로드 언어를 바꾸지 않는지(관측 4 해소).
  - 업로드 폼의 `Video style: <라벨>` 한 줄과 설정 링크.
  - 검토 화면에서 `Caption style` 버튼·다이얼로그가 사라진 것.
  - **render 실렌더가 업로드 스냅샷 스타일로 나오는지** — FEAT-51 배포 + 이 항목 배포 뒤 실 `.mp4`로만 확인(GPU·ffmpeg·pysubs2, 러너 밖). auto 경로는 FEAT-42부터 동작 중이라 무변경.

## 범위 밖 의존

- **요구 ④의 완전 제거는 `packages/db`에서 막힌다.** `metadata.ts`의 `ANALYTICS_METADATA_KEYS_BY_EVENT`는 `as const satisfies Record<AnalyticsEventName, readonly string[]>`(`metadata.ts:65`)이고 `AnalyticsEventName`은 `@repo/db`의 `analytics-contract.ts:30` `ANALYTICS_EVENT_NAMES`에 있는 `"clip_review_caption_style_edited"`에서 온다. 그래서 **이 이벤트를 `metadata.ts`에서 지우면 `satisfies Record`가 "키 누락"으로 컴파일 오류가 난다.** 추정이 아니라 실측이다 — 검증 라운드 1에서 그 줄을 실제로 지우고 `npx tsc --noEmit`을 돌리니 `src/fsd/shared/analytics/lib/metadata.ts(64,12): error TS1360: ... Property 'clip_review_caption_style_edited' is missing in type ... but required in type 'Record<...>'`와 `(88,23): error TS7053`이 났다(파일은 `git checkout --`로 복원) — 지우려면 먼저 `analytics-contract.ts`의 `ANALYTICS_EVENT_NAMES`에서 이름을 빼야 하는데 `packages/db`는 web-dev 쓰기 범위 밖이다(FEAT-53 전례). **여집합 확인 결과 소비자는 없다**: `clip_review_caption_style_edited`를 읽는 곳은 `apps/web`(발신부 = 삭제 대상)·`metadata.ts`(계약 맵)·`analytics-contract.ts`(이름)뿐이고 **`apps/admin`에는 참조가 0**이다(전역 grep). `ANALYTICS_FUNNELS.review`(`analytics-contract.ts:121`)도 이 이벤트를 쓰지 않는다. 따라서 이 항목은 **발신만 제거**하고(다이얼로그·훅 삭제로 자동), `metadata.ts` 키는 **죽은 등록으로 남긴다**(FEAT-51이 `moment_style`을 남긴 것과 같은 전환 관용). 이름·키의 완전 제거는 `packages/db` 후속(main-loop) 항목 — **백로그 후보로 제시**한다(현재 백로그에 없다).
- **`ClipDraft.captionStyle` 컬럼 drop = FEAT-53(`packages/db`, main-loop).** 이 항목은 컬럼을 지우지 않고 코드 참조만 0으로 만든다. **FEAT-53은 이 항목 배포 뒤에 와야 한다** — 컬럼을 먼저 drop하면 아직 도는 옛 웹 코드(`updateClipDraftEdit`·`getSelectedRenderMomentsForAttempt` 등)가 존재하지 않는 컬럼을 읽어 런타임 오류가 난다. FEAT-52가 그 참조를 전부 없앤 뒤라야 안전하다(FEAT-53 요구 ④의 "grep 0" 전제를 이 항목이 만든다).
- **백엔드 죽은 코드 정리 = FEAT-55(`apps/backend`, backend-dev).** FEAT-52가 per-moment `caption_style`을 안 보내면 백엔드 `moment.get("caption_style")`·`moment_style` 인자·주석이 죽지만, **FEAT-55는 이 항목 배포 + FEAT-53 뒤에 와야 한다** — FEAT-51 계획이 못박은 대로, 전이 구간에 웹이 아직 클립별 스타일을 보내는 동안 백엔드가 그걸 버리면 회귀가 난다. FEAT-52 배포가 그 전이 구간을 닫는다.
- **배포 순서**: FEAT-51(백엔드, **이미 배포됨**) → **FEAT-52(이 항목)** → FEAT-53(컬럼 drop) → FEAT-55(백엔드 정리). FEAT-51이 선행 배포됐으므로 이 항목의 웹 구현은 `apps/web` 안에서 완결된다. 배포 시퀀싱은 소유자·메인 루프가 지킨다.
- **배포·마이그레이션 실행은 사용자 몫** — 이 항목은 마이그레이션을 동반하지 않는다(컬럼 불변). Vercel 배포는 소유자.

## 대안

- **⑥ Default 칩을 `null`로 두기 vs 구체값 저장 — `null` 채택.** 구체값(예: 언어 기본값 상수를 박아 저장)을 저장하면 "설정 안 함"과 "시스템 기본과 같은 값으로 설정함"이 구분되지 않고, 시스템 상수를 바꿔도 전파되지 않는다(`docs/plans/FEAT-38.md` 대안 (B) 기각 사유, 백로그 요구 ⑥). `onChange(null)` 직접 호출로 `emit`의 완전 객체 강제를 우회한다.
- **⑦ 새 `previewLanguage` state vs `language` 재사용 — 분리 채택.** 관측 4의 사고 경로(미리보기 보려다 업로드 언어를 저장)를 막으려면 미리보기 언어가 `Save defaults`에 실려선 안 된다. `language`는 업로드 기본 언어 드롭다운 전용으로 남긴다.
- **② per-moment `caption_style` 제거 vs 유지 — 제거 채택.** 유지하면 `getSelectedRenderMomentsForAttempt`가 `draft.captionStyle`을 계속 읽어 FEAT-53의 컬럼 drop이 TS 오류를 낸다. 지금 끊어야 FEAT-53이 열린다. 백엔드는 FEAT-51 폴백으로 요청 스냅샷을 쓴다.
- **③ `isRenderMode` 파라미터 유지(미사용) vs 제거 — 제거 채택.** 게이트를 지우면 파라미터가 죽어 `no-unused-vars` 경고가 뜨고 함수명 `autoRequestCaptionStyle`이 오도한다(더는 auto 전용이 아님). `requestCaptionStyle(snapshot)`로 이름·시그니처를 정리한다.
- **④ 이벤트 완전 제거 vs 발신만 제거 — 발신만(계약 이름은 packages/db 후속).** 「범위 밖 의존」 참조. 죽은 등록을 남기는 비용은 미사용 enum 멤버 하나뿐이다.
- **⑧ `captionStyleLabel` 순수 함수 vs `UploadPodcast` 인라인 — 순수 함수 채택.** 프리셋 id→라벨·`default`→`"Default"`·`custom`→`"Custom"` 매핑은 러너로 덮이는 순수 로직이고, 프리셋 라벨과 묶인 계약이라 슬라이스 `model/`에 두고 테스트한다(저장소 관용).
