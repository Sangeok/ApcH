# FEAT-59: 업로드 폼 옵션 영역 개편 — 카드 안 2열 격자·세그먼트·Video style 9:16 썸네일

agent: web-dev

## 현재 동작

`UploadPodcast.tsx`(`pages/dashboard/ui/_component/UploadPodcast.tsx`)가 업로드 카드와 옵션 영역을 그린다. 이것이 「보존」의 기준선이다.

**상태(4)와 파생값** — `:79-88`:
- `:79` `files` (`File[]`), `:80` `language`, `:81` `clipCount`, `:86` `reviewBeforeGenerate` — 넷 다 `defaults`로 초기화(`:80,81,87`).
- `:82` `framingSummary = videoFramingSummary(defaultVideoPaddingPercent)` (파생, `shared/config/video-framing.ts:34`).
- `:83` `durationSeconds` (측정 결과), `:85` `durationRequestId` (늦게 온 측정 폐기용 ref).
- `:166` `maxFeasibleClips = getMaxFeasibleClipCount(durationSeconds)` (파생, `pages/dashboard/model/clip-count-budget.ts:23`).

**핸들러(3)와 계측** — `:94-164`:
- `:94` `handleFileDrop`: `setFiles`·`setDurationSeconds(null)` 뒤 `:101` `trackAnalyticsEvent("upload_file_selected", { fileType, fileSizeMb, language, clipCount })`, 그리고 `:110` `readVideoDurationSeconds(file)` 결과로 `:114` `setDurationSeconds`와 `:115-119` 자동 보정 `setClipCount((prev) => (prev > max ? max : prev))`(계측 없음).
- `:124` `handleUpload`: `:127` `upload({ file, language, clipCount, reviewBeforeGenerate })`.
- `:132` `trackOptionsChanged(overrides)`: `:139` `trackAnalyticsEvent("upload_options_changed", { fileType, fileSizeMb, language, clipCount, reviewBeforeGenerate, ...overrides })`.
- `:149` `handleLanguageChange` → `setLanguage` + `trackOptionsChanged({ language })`.
- `:154` `handleClipCountChange` → `setClipCount` + `trackOptionsChanged({ clipCount })`.
- `:161` `handleReviewModeChange` → `setReviewBeforeGenerate` + `trackOptionsChanged({ reviewBeforeGenerate })`.

**렌더** — `:168-347` (`:168` `return (` ~ `:347` `);`):
- 카드(`:170-210`)는 `Dropzone`(`:178`, `maxSize`·`accept`·`maxFiles={1}`·`disabled={isUploading}`) 한 개만 담는다. 옵션·파일 줄은 카드 **밖**(`:212` `<div className="mt-4 flex items-start justify-between">`)에 있다.
- 옵션 네 묶음(`:224` `<div className="flex gap-x-4">`)이 wrap 없는 한 줄: 언어 드롭다운(`:229-247`, 버튼 라벨 `{language}` = 값), 클립 수 드롭다운(`:250-276`, 길이로 막힌 값은 `disabled={isOptionUnreachable}`), 생성 드롭다운(`:280-300`), Video style(`:302-320`, `captionStyleLabel(...)` + `framingSummary` + `Change in settings` 링크 — 편집 불가 텍스트).
- 길이 안내 줄(`:322-328`): 30초 미만이면 `Source is shorter than ${CLIP_DURATION_LIMITS.MIN_SECONDS}s — too short to generate a clip. Try a longer video.`, 아니면 `Source length … This fits up to N clip(s); the AI may return fewer.`.
- 업로드 버튼(`:332-344`)은 파일 줄 옆 우상단. `disabled={files.length === 0 || isUploading || maxFeasibleClips === 0}`, 라벨 `Upload and Generate Clips` / `Uploading...`(스피너). 이 버튼은 `:214` `{files.length > 0 && (` 가드 **밖**이라 파일을 고르기 전에도 비활성으로 렌더된다.

**유효 캡션 스타일 계산** — `CaptionStyleEditor.tsx:79-90`은 저장값 위에 언어별 기본값을 얹은 `effectivePosition`·`effectiveFontSize`·… 7개를 **인라인**으로 만든다(`value?.color ?? CAPTION_STYLE_OPTIONS.DEFAULT_COLOR` 등, 언어 기본값은 `:39-55` `languageDefault*` 헬퍼). 이 값이 컨트롤·미리보기에 쓰인다. 썸네일이 같은 스타일을 그리려면 이 계산이 필요하다.

**세그먼트 컨트롤 atom**: 없다. `shared/ui/atoms/`에 `radio-group.tsx`·`segmented-control.tsx`가 없다(`Glob` 확인). 기존 atom은 `dialog.tsx:5` `import { Dialog as DialogPrimitive } from "radix-ui"` 형태(통합 `radix-ui` 1.4.3 네임스페이스)나 `tabs.tsx:4` `import * as TabsPrimitive from "@radix-ui/react-tabs"` 형태(개별 패키지)를 쓴다.

**wire 계약(변경 없음, 배경)**: `videoFramingSummary`의 골든 문구(`10% top & bottom`, 0이면 `null`)는 `shared/config/video-framing.test.mjs`가 지킨다. `pages/dashboard`가 `features/caption-style`를 임포트하는 것은 이미 있다(`UploadPodcast.tsx:29` `import { captionStyleLabel } from "~/fsd/features/caption-style";`) — pages→features는 FSD 정방향.

## 문제

요구사항의 원천은 `TASK_BACKLOG.md`의 FEAT-59 `source`(소유자와 목업으로 합의한 개편안 명세, 관측 ①~⑧·요구 (a)~(f))다. 표현 문제라 진단이 없고 관측이 곧 문제다: 옵션 줄이 1280px에서도 라벨이 두 줄로 접히고(관측 ①, `UploadPodcast.tsx:224` wrap 없는 한 줄), 390px에서 가로 스크롤이 나며(②), 업로드 버튼이 옵션보다 먼저 읽히고(③, `:212` 우상단 배치), 옵션이 카드 밖이라 드롭존이 카드를 차지하고(④), 편집 가능/불가가 같은 줄에 섞이고(⑤), 드롭다운이 선택지·자동 보정을 가리고(⑥, `:262`·`:118`), 어휘가 설정 화면과 다르고(⑦), Video style이 `Default` 한 단어라 무엇이 입혀지는지 안 보인다(⑧). **기능·계측·상한 계산·Dropzone 설정은 그대로 두고 배치와 표현만 바꾼다.**

**관계**: BUG-17이 고쳐져야 프로덕션에서 길이가 측정돼 클립 상한 표현이 실제로 보인다(구현 의존은 없음 — FEAT-59 코드는 길이가 측정되든 안 되든 정상 동작한다).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `pages/dashboard/ui/_component/UploadPodcast.tsx` | 옵션 영역 전체 재구성: 카드 **안**으로 이동, 파일 선택 뒤 드롭존을 파일 한 줄로 접기, 2열 격자(좁으면 1열) + 세그먼트, Video style 썸네일 행, 하단 업로드 버튼. 드롭다운→세그먼트. 상태·핸들러·계측·`upload()` 인자·Dropzone 설정·상한 계산·자동 보정은 불변 |
| `shared/ui/atoms/segmented-control.tsx` `(신규)` | radix `RadioGroup` 기반 세그먼트(라디오 그룹) atom |
| `features/caption-style/model/effective-caption-style.ts` `(신규)` | 저장값+언어 기본값 유효 스타일 계산 (`CaptionStyleEditor.tsx:79-90` 인라인에서 추출) |
| `features/caption-style/model/effective-caption-style.test.mjs` `(신규)` | 위 분기 테스트 |
| `features/caption-style/ui/CaptionStyleThumbnail.tsx` `(신규)` | 9:16 썸네일 (여백 실비율 + 캡션 견본) |
| `features/caption-style/ui/CaptionStyleEditor.tsx` | `:39-56` `languageDefault*` 헬퍼 셋과 뒤 빈 줄 제거, `:79-90` 인라인 유효 스타일을 `resolveEffectiveCaptionStyle` 호출로 교체 (동작 무변경) |
| `features/caption-style/index.ts` | `CaptionStyleThumbnail` 공개 |
| `pages/dashboard/model/clip-count-notice.ts` `(신규)` | 클립 수 세그먼트 옆 안내 문구 계산 |
| `pages/dashboard/model/clip-count-notice.test.mjs` `(신규)` | 위 분기 테스트 |
| `pages/dashboard/model/upload-options-copy.ts` `(신규)` | 업로드 버튼·생성 방식 문구 |
| `pages/dashboard/model/upload-options-copy.test.mjs` `(신규)` | 위 분기 테스트 |

여기 없는 파일은 구현 단계에서 고치지 않는다. `pages/dashboard/ui/index.tsx`(DashboardView)는 `UploadPodcast`에 이미 `defaultCaptionStyles`·`defaultVideoPaddingPercent`를 넘기므로(`:130-135`) 손대지 않는다.

## 구현 스케치

### 1) 새 순수 함수 — `features/caption-style/model/effective-caption-style.ts` (신규)

`CaptionStyleEditor.tsx:79-90`의 인라인 계산과 **바이트 동등**하게 옮긴다. 에디터(설정 미리보기)와 업로드 폼 썸네일이 같은 값을 쓰게 하는 단일 원천.

```ts
import {
  CAPTION_STYLE_OPTIONS,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";

export interface EffectiveCaptionStyle {
  position: CaptionStyle["position"];
  fontSize: number;
  color: string;
  maxWordsPerLine: number;
  outlineColor: string;
  outlineWidth: number;
  uppercase: boolean;
}

// 저장값(null 포함) 위에 언어별 기본값을 얹은 "유효 스타일".
// null 필드 = 백엔드 언어별 기본값. CaptionStyleEditor와 업로드 폼 썸네일이 공유한다.
export function resolveEffectiveCaptionStyle(
  style: CaptionStyle | null,
  language: string,
): EffectiveCaptionStyle {
  const isKorean = language === "Korean";
  return {
    position: style?.position ?? CAPTION_STYLE_OPTIONS.DEFAULT_POSITION,
    fontSize:
      style?.fontSize ??
      (isKorean
        ? CAPTION_STYLE_OPTIONS.DEFAULT_FONT_SIZE.Korean
        : CAPTION_STYLE_OPTIONS.DEFAULT_FONT_SIZE.English),
    color: style?.color ?? CAPTION_STYLE_OPTIONS.DEFAULT_COLOR,
    maxWordsPerLine:
      style?.maxWordsPerLine ??
      (isKorean
        ? CAPTION_STYLE_OPTIONS.DEFAULT_MAX_WORDS.Korean
        : CAPTION_STYLE_OPTIONS.DEFAULT_MAX_WORDS.English),
    outlineColor:
      style?.outlineColor ?? CAPTION_STYLE_OPTIONS.DEFAULT_OUTLINE_COLOR,
    outlineWidth:
      style?.outlineWidth ??
      (isKorean
        ? CAPTION_STYLE_OPTIONS.DEFAULT_OUTLINE_WIDTH.Korean
        : CAPTION_STYLE_OPTIONS.DEFAULT_OUTLINE_WIDTH.English),
    uppercase: style?.uppercase ?? false,
  };
}
```

### 2) 새 순수 함수 — `pages/dashboard/model/clip-count-notice.ts` (신규)

요구 (c): 길이를 알고 상한<4면 구체 안내(단수 `clip`·복수 `clips`), 그 외 일반 안내, 30초 미만이면 없음(그 안내는 파일 줄에서 destructive로 뜬다).

"길이를 아는가"는 따로 판정하지 않는다. `getMaxFeasibleClipCount`가 길이 미상(null·비유한·0 이하)이면 옵션 최댓값(4)을, 30초 미만이면 0을 돌려주므로(`clip-count-budget.ts:23-37` `getMaxFeasibleClipCount` 전체 — 미상 가드 `:24-30`, `Math.floor(durationSeconds / CLIP_DURATION_LIMITS.MIN_SECONDS)` `:32-34`. `clip-count-budget.test.mjs`가 지킴) `max`만으로 세 경우가 갈린다. 별도 `known` 가드를 두면 그 분기가 도달 불가가 되어 테스트로 고정되지 않는다 — 계획 검증 라운드 1에서 `known`을 지운 돌연변이 셋이 전부 생존했다(`caption-presets.ts` `captionStyleLabel` 주석과 같은 판단).

```ts
import { CLIP_COUNT_OPTIONS } from "~/fsd/shared/config/constants";
import { getMaxFeasibleClipCount } from "./clip-count-budget";

const MAX_CLIP_COUNT_OPTION =
  CLIP_COUNT_OPTIONS[CLIP_COUNT_OPTIONS.length - 1]!.value;

// 길이 미상은 getMaxFeasibleClipCount가 옵션 최댓값으로 돌려주므로 여기서 따로 가드하지 않는다.
export function clipCountNotice(durationSeconds: number | null): string | null {
  const max = getMaxFeasibleClipCount(durationSeconds);

  // 0 = 30초 미만. 그 안내는 파일 줄에 destructive로 뜬다.
  if (max === 0) return null;
  if (max < MAX_CLIP_COUNT_OPTION) {
    return `This video fits up to ${max} ${max === 1 ? "clip" : "clips"}. The AI may return fewer.`;
  }
  return "The AI may return fewer.";
}
```

### 3) 새 순수 함수 — `pages/dashboard/model/upload-options-copy.ts` (신규)

요구 (c)(e): 생성 방식에 따라 바뀌는 문구를 한 곳에 모아 테스트로 고정.

```ts
export function uploadButtonLabel(reviewBeforeGenerate: boolean): string {
  return reviewBeforeGenerate
    ? "Upload and review clips"
    : "Upload and generate clips";
}

export function generationModeHint(reviewBeforeGenerate: boolean): string {
  return reviewBeforeGenerate
    ? "Edit clips before generating."
    : "Generates clips immediately.";
}
```

### 4) 새 atom — `shared/ui/atoms/segmented-control.tsx` (신규)

설계 메모대로 `radix-ui` 1.4.3의 `RadioGroup`(설치 확인: 통합 패키지가 `@radix-ui/react-radio-group` 1.3.8을 `RadioGroup`으로 재수출, `.Root`/`.Item`/`.Indicator` 네임스페이스 노출)을 쓴다. import 형태는 `dialog.tsx:5`(`import { Dialog as DialogPrimitive } from "radix-ui"`)를 따른다. 스타일 관용구는 `tabs.tsx:37-51`(`data-[state=...]` 변형·`cn` 병합)을 따른다. `RadioGroup`은 값이 **바뀔 때만** `onValueChange`를 부르므로 `ToggleGroup type="single"`의 재선택 시 `""` 방출 문제가 없다(가드 불필요).

```tsx
"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "~/fsd/shared/lib/utils";

function SegmentedControl({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented-control"
      className={cn(
        "bg-muted inline-flex w-fit items-center gap-0.5 rounded-lg p-[3px]",
        className,
      )}
      {...props}
    />
  );
}

function SegmentedControlItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="segmented-control-item"
      className={cn(
        "text-muted-foreground data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm focus-visible:ring-ring/50 inline-flex h-7 items-center justify-center rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:line-through disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export { SegmentedControl, SegmentedControlItem };
```

### 5) 새 컴포넌트 — `features/caption-style/ui/CaptionStyleThumbnail.tsx` (신규)

요구 (d): 상하 여백은 실비율, 캡션은 색·외곽선·대문자·서체·위치를 그리되 글자 크기는 축척하지 않는 견본. 캡션 세로 위치는 `MARGINV/PLAY_RES_Y`를 %로 — `getPreviewVerticalInset(position, 100)`을 재사용하면 반환값(100px 기준 px)이 곧 %다(같은 슬라이스 `../model/caption-preview.ts:107`, `video-framing`·`caption-preview` 계약과 이미 묶여 테스트됨). 서체 변수는 `layout.tsx`가 정의한 `--font-anton`/`--font-noto-sans-kr`(CaptionPreviewPlayer와 동일). `--picked` 토큰은 쓰지 않는다.

견본 문구는 목업에서 온 **비기능 견본**이다(source가 지정한 사용자 대면 문구가 아님) — 리터럴을 상수로 두고 게이트②에서 소유자가 바꿀 수 있게 한다.

```tsx
import {
  type CaptionStyle,
} from "~/fsd/shared/config/constants";
import { cn } from "~/fsd/shared/lib/utils";
import { getPreviewVerticalInset } from "../model/caption-preview";
import { resolveEffectiveCaptionStyle } from "../model/effective-caption-style";

// 썸네일 견본 문구 — 목업 유래 비기능 견본. 실제 클립은 사용자 전사를 쓴다.
const SPECIMEN_TEXT = { english: "the real reason", korean: "진짜 이유는" } as const;

interface CaptionStyleThumbnailProps {
  style: CaptionStyle | null;
  language: string;
  paddingPercent: number;
}

export default function CaptionStyleThumbnail({
  style,
  language,
  paddingPercent,
}: CaptionStyleThumbnailProps) {
  const effective = resolveEffectiveCaptionStyle(style, language);
  const isKorean = language === "Korean";
  // 100px 기준 inset = % (MARGINV/PLAY_RES_Y × 100). top/bottom은 프레임 전체 기준.
  const inset = getPreviewVerticalInset(effective.position, 100);
  const centered = inset.top === null && inset.bottom === null;
  // 견본이라 외곽선도 축척하지 않고 근사한다(0이면 0, 아니면 0.5 + w/2, 최대 3px).
  const strokePx =
    effective.outlineWidth === 0
      ? 0
      : Math.min(3, 0.5 + effective.outlineWidth * 0.5);
  const text = SPECIMEN_TEXT[isKorean ? "korean" : "english"];
  const fontFamily = isKorean
    ? "var(--font-noto-sans-kr)"
    : "var(--font-anton)";

  return (
    <div className="ring-border relative aspect-[9/16] w-[76px] shrink-0 overflow-hidden rounded-md bg-black ring-1">
      {/* 회색 장면 = 렌더 영상. 검은 상하 띠(여백)는 실비율. */}
      <div
        className="absolute inset-x-0 bg-neutral-500"
        style={{ top: `${paddingPercent}%`, bottom: `${paddingPercent}%` }}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 flex justify-center px-1 text-center",
          centered && "inset-y-0 items-center",
        )}
        style={{
          top: inset.top !== null ? `${inset.top}%` : undefined,
          bottom: inset.bottom !== null ? `${inset.bottom}%` : undefined,
        }}
      >
        <span
          className="text-[11px] leading-none"
          style={{
            fontFamily,
            color: effective.color,
            textTransform: effective.uppercase ? "uppercase" : "none",
            WebkitTextStroke: `${strokePx}px ${effective.outlineColor}`,
            paintOrder: "stroke fill",
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
```

### 6) `features/caption-style/ui/CaptionStyleEditor.tsx` 수정 (동작 무변경)

`resolveEffectiveCaptionStyle` import 추가(`:11` `import { matchPresetId } from "../model/caption-presets";` 다음 줄에 `import { resolveEffectiveCaptionStyle } from "../model/effective-caption-style";`). `:39-55`의 세 헬퍼(`languageDefaultFontSize`·`languageDefaultMaxWords`·`languageDefaultOutlineWidth`)는 아래 교체로 유일 소비자가 사라지므로 **함께 제거**한다(안 지우면 no-unused-vars로 `check` 실패). 제거 범위는 `:39-56` — 헬퍼 뒤 빈 줄(`:56`)까지 지워야 `:38`의 빈 줄과 겹치지 않는다.

before (`:79-90`, 적기 직전 재확인):

```tsx
  // 저장된 값 위에 언어별 기본값을 얹은 "유효 스타일". 컨트롤과 미리보기가 이 값을 표시한다.
  const effectivePosition =
    value?.position ?? CAPTION_STYLE_OPTIONS.DEFAULT_POSITION;
  const effectiveFontSize = value?.fontSize ?? languageDefaultFontSize(language);
  const effectiveColor = value?.color ?? CAPTION_STYLE_OPTIONS.DEFAULT_COLOR;
  const effectiveMaxWords =
    value?.maxWordsPerLine ?? languageDefaultMaxWords(language);
  const effectiveOutlineColor =
    value?.outlineColor ?? CAPTION_STYLE_OPTIONS.DEFAULT_OUTLINE_COLOR;
  const effectiveOutlineWidth =
    value?.outlineWidth ?? languageDefaultOutlineWidth(language);
  const effectiveUppercase = value?.uppercase ?? false;
```

after:

```tsx
  // 저장된 값 위에 언어별 기본값을 얹은 "유효 스타일". 컨트롤과 미리보기가 이 값을 표시한다.
  // 계산은 model/effective-caption-style.ts에 있다 — 업로드 폼 썸네일과 공유한다.
  const {
    position: effectivePosition,
    fontSize: effectiveFontSize,
    color: effectiveColor,
    maxWordsPerLine: effectiveMaxWords,
    outlineColor: effectiveOutlineColor,
    outlineWidth: effectiveOutlineWidth,
    uppercase: effectiveUppercase,
  } = resolveEffectiveCaptionStyle(value, language);
```

`CAPTION_STYLE_OPTIONS`·`CAPTION_STYLE_PRESETS` import는 다른 곳(`:102` 이하)에서 계속 쓰므로 유지한다.

### 7) `features/caption-style/index.ts` 수정

before:

```ts
export { default as CaptionStyleEditor } from "./ui/CaptionStyleEditor";
```

after (한 줄 추가):

```ts
export { default as CaptionStyleEditor } from "./ui/CaptionStyleEditor";
export { default as CaptionStyleThumbnail } from "./ui/CaptionStyleThumbnail";
```

`resolveEffectiveCaptionStyle`은 슬라이스 내부(에디터·썸네일)만 쓰므로 공개하지 않는다.

### 8) `pages/dashboard/ui/_component/UploadPodcast.tsx` 재구성

**import 변경** (`:10-38` 중 관련부):
- 제거: `DropdownMenu*` (`:10-15`).
- 추가: `import { SegmentedControl, SegmentedControlItem } from "~/fsd/shared/ui/atoms/segmented-control";`
- `:22` `import { Loader2, UploadCloud } from "lucide-react";` → `import { FileVideo, Loader2, UploadCloud } from "lucide-react";`
- `:29` `import { captionStyleLabel } from "~/fsd/features/caption-style";` → `import { captionStyleLabel, CaptionStyleThumbnail } from "~/fsd/features/caption-style";`
- 추가: `import { clipCountNotice } from "~/fsd/pages/dashboard/model/clip-count-notice";`
- 추가: `import { uploadButtonLabel, generationModeHint } from "~/fsd/pages/dashboard/model/upload-options-copy";`

**상태·핸들러·`upload()`·계측·`getMaxFeasibleClipCount`·자동 보정은 `:79-166` 그대로 둔다.** 세그먼트의 `onValueChange`는 기존 핸들러에 값을 넘기는 얇은 어댑터로 감싼다(아래 JSX). 클립 수 값은 문자열이라 `Number(v)`로, 생성 방식은 `v === "review"`로 변환한다.

**렌더 교체** — `:168`의 `return (`부터 `:347`의 `);`까지를 아래로 바꾼다(`:348`의 함수 닫는 `}`는 남는다). 파일 선택 전 화면은 지금처럼 큰 드롭존 + **비활성 업로드 버튼**이고(요구 (a) — 현재 버튼이 `:214` 가드 밖이라 항상 렌더된다), 버튼만 카드 안 하단으로 옮긴다. 선택 뒤에는 파일 줄 + 옵션 격자 + Video style + 하단 버튼이 모두 카드 안에 든다. 좁은 폭 전환은 뷰포트가 아니라 카드 폭 기준 — 옵션 래퍼에 `@container`를 걸고 Tailwind v4 내장 컨테이너 변형 `@[600px]:`를 쓴다(대시보드가 `max-w-5xl` 안이라 카드 폭이 뷰포트보다 먼저 한계에 닿는다, `pages/dashboard/ui/index.tsx:106`). 큰 드롭존 마크업(`UploadCloud`·안내문·`Select File` 버튼)은 `:186-206`을 그대로 옮긴다.

```tsx
  const langStyle =
    language === "Korean"
      ? defaultCaptionStyles.korean
      : defaultCaptionStyles.english;
  const clipHint = clipCountNotice(durationSeconds);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Podcast</CardTitle>
        <CardDescription>
          Upload your audio or video files to get started.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Dropzone
          onDrop={handleFileDrop}
          maxSize={UPLOAD_CONFIG.MAX_FILE_SIZE}
          accept={UPLOAD_CONFIG.ACCEPTED_TYPES}
          maxFiles={1}
          disabled={isUploading}
        >
          {(dropzone: DropzoneState) =>
            files.length === 0 ? (
              <div
                {...dropzone.getRootProps()}
                className={cn(
                  "flex flex-col items-center justify-center space-y-4 rounded-lg border border-dashed p-10 text-center transition hover:cursor-pointer hover:bg-muted",
                )}
              >
                <input {...dropzone.getInputProps()} />
                <UploadCloud className="text-muted-foreground h-12 w-12" />
                <p className="font-medium">
                  Drag and drop your audio or video files here, or click to
                  browse.
                </p>
                <Button variant="default" size="sm" disabled={isUploading} className="cursor-pointer">
                  Select File
                </Button>
              </div>
            ) : (
              <div
                {...dropzone.getRootProps()}
                className="flex items-center gap-3 rounded-lg border border-dashed p-3 transition hover:cursor-pointer hover:bg-muted"
              >
                <input {...dropzone.getInputProps()} />
                <div className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-md">
                  <FileVideo className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{files[0]?.name}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {files[0] ? toFileSizeMb(files[0]).toFixed(1) : "0.0"} MB
                    {durationSeconds !== null && `, ${formatSecondsAsClock(durationSeconds)}`}
                  </p>
                  {maxFeasibleClips === 0 && (
                    <p className="text-destructive text-xs">
                      {`Source is shorter than ${CLIP_DURATION_LIMITS.MIN_SECONDS}s — too short to generate a clip. Try a longer video.`}
                    </p>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0 text-xs font-medium">
                  Replace
                </span>
              </div>
            )
          }
        </Dropzone>

        <div className="@container">
          {files.length > 0 && (
            <div className="grid grid-cols-1 gap-y-2 @[600px]:grid-cols-[152px_minmax(0,1fr)] @[600px]:gap-x-6 @[600px]:gap-y-4 @[600px]:items-start">
              <p className="text-muted-foreground text-xs @[600px]:col-span-2">
                Pre-filled from your settings. Changes here apply to this upload only.
              </p>

              <p id="upload-lang-label" className="pt-1.5 text-sm font-medium">
                Subtitle language
              </p>
              <div>
                <SegmentedControl
                  aria-labelledby="upload-lang-label"
                  value={language}
                  onValueChange={handleLanguageChange}
                  disabled={isUploading}
                  className="w-full @[600px]:w-fit"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SegmentedControlItem key={lang.value} value={lang.value} className="flex-1 @[600px]:flex-none">
                      {lang.label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              </div>

              <p id="upload-clip-label" className="pt-1.5 text-sm font-medium">
                Number of clips
              </p>
              <div className="space-y-1.5">
                <SegmentedControl
                  aria-labelledby="upload-clip-label"
                  value={String(clipCount)}
                  onValueChange={(v) => handleClipCountChange(Number(v))}
                  disabled={isUploading}
                  className="w-full @[600px]:w-fit"
                >
                  {CLIP_COUNT_OPTIONS.map((option) => {
                    const hasClipCountCap = maxFeasibleClips >= 1;
                    const isOptionUnreachable =
                      hasClipCountCap && option.value > maxFeasibleClips;
                    return (
                      <SegmentedControlItem
                        key={option.value}
                        value={String(option.value)}
                        disabled={isOptionUnreachable}
                        className="flex-1 tabular-nums @[600px]:flex-none"
                      >
                        {option.value}
                      </SegmentedControlItem>
                    );
                  })}
                </SegmentedControl>
                {clipHint && <p className="text-muted-foreground text-xs">{clipHint}</p>}
              </div>

              <p id="upload-gen-label" className="pt-1.5 text-sm font-medium">
                Generation
              </p>
              <div className="space-y-1.5">
                <SegmentedControl
                  aria-labelledby="upload-gen-label"
                  value={reviewBeforeGenerate ? "review" : "auto"}
                  onValueChange={(v) => handleReviewModeChange(v === "review")}
                  disabled={isUploading}
                  className="w-full @[600px]:w-fit"
                >
                  <SegmentedControlItem value="auto" className="flex-1 @[600px]:flex-none">
                    Auto
                  </SegmentedControlItem>
                  <SegmentedControlItem value="review" className="flex-1 @[600px]:flex-none">
                    Review first
                  </SegmentedControlItem>
                </SegmentedControl>
                <p className="text-muted-foreground text-xs">
                  {generationModeHint(reviewBeforeGenerate)}
                </p>
              </div>

              <div className="bg-border my-1 h-px @[600px]:col-span-2" role="presentation" />

              <p id="upload-style-label" className="flex flex-col pt-1.5 text-sm font-medium">
                Video style
                <span className="text-muted-foreground text-xs font-normal">From settings</span>
              </p>
              <div className="flex items-start gap-4">
                <CaptionStyleThumbnail
                  style={langStyle}
                  language={language}
                  paddingPercent={defaultVideoPaddingPercent}
                />
                <div className="min-w-0 space-y-2">
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Captions</dt>
                    <dd className="font-medium">{captionStyleLabel(langStyle)}</dd>
                    <dt className="text-muted-foreground">Framing</dt>
                    <dd className="font-medium">{framingSummary ?? "None"}</dd>
                  </dl>
                  <p className="text-muted-foreground text-xs">
                    Caption style follows the subtitle language.
                  </p>
                  <Link
                    href="/dashboard/settings"
                    className="text-primary inline-block text-xs underline underline-offset-2"
                  >
                    Change in settings
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* 파일 선택 전에도 비활성으로 보인다 — 현재 버튼이 files 가드 밖인 것과 같다(요구 (a)). */}
          <div className={cn("flex justify-end", files.length > 0 && "mt-6")}>
            <Button
              disabled={files.length === 0 || isUploading || maxFeasibleClips === 0}
              onClick={handleUpload}
              className="w-full @[600px]:w-auto"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                uploadButtonLabel(reviewBeforeGenerate)
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
```

### 보존(바뀌면 안 되는 것) — 위 스케치가 지키는 방식

- 상태 4·핸들러 3·`upload()` 인자: `:79-164` 그대로. 세그먼트는 기존 핸들러를 부른다.
- 계측 `upload_file_selected`·`upload_options_changed` 페이로드: `handleFileDrop`·`trackOptionsChanged` 불변.
- 상한 계산·자동 보정: `getMaxFeasibleClipCount`(`:166`)·`setClipCount((prev)=>...)`(`:118`) 불변. 클립 세그먼트 disable 규칙도 `:261-263`과 동일(`hasClipCountCap`·`option.value > maxFeasibleClips`).
- Dropzone `maxSize`·`accept`·`maxFiles`·`disabled` 불변. 파일 선택 전 옵션 숨김(`files.length > 0` 가드) 불변. 업로드 버튼은 지금처럼 가드 **밖**이라 파일 선택 전에도 비활성으로 보이고, `disabled` 식(`files.length === 0 || isUploading || maxFeasibleClips === 0`)도 `:333` 그대로다.
- `videoFramingSummary` 골든 문구: `framingSummary`(`:82`)를 그대로 표시하고 `null`에만 `None`을 붙인다 — `video-framing.test.mjs`에 영향 없음.

### 알려진 동작 차이 (게이트②에서 소유자 판단)

둘이다. 둘 다 `upload_options_changed`의 **발생 횟수**만 바꾸고 페이로드 모양은 그대로다.

1. **같은 값 재선택은 이벤트를 내지 않는다.** 드롭다운은 이미 선택된 값을 다시 눌러도 `upload_options_changed`를 냈다(`:239` `onClick`이 무조건 `handleLanguageChange` 호출). radix `RadioGroup`은 값이 **바뀔 때만** `onValueChange`를 부른다.
2. **방향키 이동은 한 칸마다 이벤트를 낸다.** 라디오 그룹은 방향키로 포커스를 옮기면 그 항목이 곧바로 선택된다(라디오 시맨틱). 클립 수 1에서 3으로 방향키 두 번 이동하면 `clipCount: 2`, `clipCount: 3` 두 건이 남는다. 드롭다운은 목표 값을 한 번에 골라 한 건이었다. 마우스·터치 선택은 지금처럼 한 건이다.

이 이벤트 수를 세는 집계가 있으면 1은 값을 줄이고 2는 늘린다. 페이로드의 최종 값(마지막 이벤트)은 두 경우 모두 사용자가 고른 값과 같다.

## 테스트

- **덮는 것**:
  - `effective-caption-style.test.mjs`: `null`+English → 영어 기본값 7필드 골든(`middle`/`122`/`#FFFFFF`/`5`/`#000000`/`1.1`/`false`), `null`+Korean → 한국어 기본값(`130`/`3`/`1.3`), 부분 저장값은 있는 필드 override·없는(`null`) 필드는 언어 기본값(각 필드 독립 폴백), **저장된 `outlineWidth: 0`은 0 그대로**(falsy 저장값 보존 — `??`를 `||`로 바꾼 돌연변이가 이 케이스 없이는 생존한다. 외곽선 0은 `OUTLINE_WIDTH_RANGE.MIN`이라 실제로 저장될 수 있는 값이다), `uppercase` `true`/`false`/`null`(→`false`), 알 수 없는 언어(예 `"Japanese"`·`""`·소문자 `"korean"`) → 영어 분기. (에디터 인라인과 값이 일치해 설정 미리보기·썸네일 공유를 보증) `fontSize`·`maxWordsPerLine`의 `??`→`||`는 0이 허용 범위 밖(`FONT_SIZE_RANGE.MIN` 60, `MAX_WORDS_RANGE.MIN` 1)이고 `uppercase`의 `?? false`→`|| false`는 항상 같은 값이라, 도달 가능한 입력으로 구별되지 않는 등가 변이여서 테스트하지 않는다.
  - `clip-count-notice.test.mjs`: `null` → `The AI may return fewer.`; `NaN`·`Infinity`·`0`·음수 → 같은 일반 안내(가드 고정); `20`(30초 미만) → `null`; `30` → `This video fits up to 1 clip. The AI may return fewer.`(단수); `60` → `…2 clips…`; `90` → `…3 clips…`(복수); `120`·`600`(상한 4) → `The AI may return fewer.`. (단수/복수 경계·상한<4 분기. 길이 미상 케이스는 `getMaxFeasibleClipCount`의 미상→4 규칙을 이 함수가 그대로 따르는지를 고정한다)
  - `upload-options-copy.test.mjs`: `uploadButtonLabel` `false`→`Upload and generate clips`·`true`→`Upload and review clips`; `generationModeHint` `false`→`Generates clips immediately.`·`true`→`Edit clips before generating.`. (사용자 대면 골든 문구 고정)
- **못 덮는 범위**: 2열↔1열 컨테이너 전환·모바일 가로 스크롤 해소·세그먼트 키보드 조작·`RadioGroup` `onValueChange` 발화 조건(같은 값 재선택 무발화 · 방향키 한 칸마다 발화)·썸네일 렌더(서체·외곽선·여백/위치 픽셀)·드롭존으로의 파일 교체는 DOM/렌더라 Node 러너로 못 덮는다 — 배포 후 실물·렌더로 확인한다. 프로덕션에서 클립 상한 표시가 실제로 보이려면 BUG-17(CSP `blob:`)이 먼저 고쳐져야 한다.

`apps/web/CLAUDE.md` 테스트 표에 추가할 행(이 파일은 읽기 전용이라 직접 못 고침 — 구현 시 비고로 보고):

| 파일 | 지키는 것 |
|---|---|
| `features/caption-style/model/effective-caption-style.test.mjs` | 저장값+언어 기본값 유효 스타일. 설정 미리보기(CaptionStyleEditor)와 업로드 폼 썸네일이 **같은 계산**을 쓰는 단일 원천 — 각 필드의 언어별 기본값 폴백과 `uppercase` 기본 `false`, 저장된 외곽선 `0` 보존(`??`→`||` 회귀)을 고정한다 |
| `pages/dashboard/model/clip-count-notice.test.mjs` | 클립 수 세그먼트 옆 안내 문구. 길이를 알고 상한<4면 구체 안내(단수/복수), 그 외 일반 안내, 30초 미만은 `null`(그 안내는 파일 줄 destructive). 골든 문구가 계약 |
| `pages/dashboard/model/upload-options-copy.test.mjs` | 업로드 버튼·생성 방식 문구의 생성 방식별 골든 문구 |

## 범위 밖 의존

없음. 모든 변경이 `apps/web/src/**`(features/caption-style · shared/ui/atoms · pages/dashboard) 안에서 완결된다. `radix-ui` 1.4.3·`@radix-ui/react-radio-group` 1.3.8은 이미 설치돼 있어 `npm install`이 필요 없다. BUG-17(next.config.js CSP)은 별도 항목이며 FEAT-59 코드와 구현 의존이 없다.

## 대안

- **세그먼트 primitive**: `ToggleGroup type="single"` vs `RadioGroup` → `RadioGroup`. `ToggleGroup`은 활성 항목을 다시 누르면 `""`를 방출해 가드가 필요하다(설계 메모). `RadioGroup`은 값이 바뀔 때만 `onValueChange`를 불러 그 문제가 없고, 라디오 시맨틱·화살표 키 이동이 기본 제공된다.
- **좁은 폭 전환 수단**: 뷰포트 브레이크포인트(`sm:`) vs 컨테이너 쿼리 → 컨테이너 쿼리. 대시보드가 `max-w-5xl` 안이라 카드 폭이 뷰포트 폭보다 먼저 한계에 닿는다(`pages/dashboard/ui/index.tsx:106`) — 뷰포트 기준이면 카드가 좁아도 전환이 늦는다. Tailwind v4는 `@container`·`@[600px]:`를 플러그인 없이 내장한다(`globals.css:1` `@import "tailwindcss"`).
- **썸네일 위치**: `pages/dashboard` vs `features/caption-style` → 후자. 캡션 렌더 로직(effective 스타일·`MARGINV`·서체)을 캡션 슬라이스에 응집하고, pages→features 임포트는 이미 있다(`captionStyleLabel`). 썸네일이 `getPreviewVerticalInset`·`resolveEffectiveCaptionStyle`을 같은 슬라이스에서 직접 쓴다.
- **effective 계산 공유 범위**: 썸네일에만 두기 vs 에디터와 공유 → 공유(모델 추출). 두 곳이 따로 계산하면 설정 미리보기와 업로드 썸네일이 조용히 어긋난다(설계 메모 권장). 추출 함수는 에디터 인라인과 바이트 동등해 동작 무변경.
