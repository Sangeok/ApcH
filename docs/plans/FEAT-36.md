# FEAT-36: 캡션 스타일 미리보기를 실제 영상 위 타이밍 오버레이로 — 렌더 없이 9:16 프레임에서 자막 큐 재생

agent: web-dev

> 인용한 `파일:줄`은 계획 작성 시점(2026-09-07)에 다시 읽어 확인했다. 백로그 FEAT-36 source가
> 인용한 줄은 전부 정확했다(`CaptionStyleEditor.tsx:22,29,111,316,327,339`,
> `ClipDraftCard.tsx:484`, `use-clip-draft-review.ts:65`, `main.py:287,353-360,369-375,403,555`).
>
> **폰트 상수는 백엔드가 설치하는 실제 파일을 받아 확정했다**(source A-2 지시). `main.py:70,74`의
> 다운로드 URL로 `Anton-Regular.ttf`·`NotoSansKR-Bold.otf`를 스크래치패드에 받아 OS/2·head 표를
> 파싱했다(스크립트는 저장소 밖 스크래치패드에만 둔다). 결과와 함정은 아래 「구현 스케치」의
> `CAPTION_RENDER.EM_SCALE` 주석에 리터럴로 박았다.
>
> **보드 상태 주의**: 이 계획 작성 시점에 보드의 FEAT-35는 `검토대기`(계획서 이미 존재)이고
> FEAT-36만 `계획지시`다. 아래 「고칠 파일」의 FEAT-35 겹침 표기는 `docs/plans/FEAT-35.md`
> (검토대기본)를 읽고 대조한 것이다.

## 현재 동작

캡션 스타일 편집은 슬라이스 `widgets/clip-draft-review`에서 3층으로 열린다:
`ClipDraftCard.tsx`(카드) → `CaptionStyleDialog.tsx`(다이얼로그) → `CaptionStyleEditor.tsx`(편집 폼+미리보기).

**미리보기가 정적 상자다 (요구가 겨냥)**

- 미리보기는 `CaptionStyleEditor.tsx:314-343`의 우측 컬럼이다. 컨테이너가
  `:316` `"relative mx-auto flex w-[180px] flex-col overflow-hidden rounded-lg bg-gradient-to-b from-slate-700 to-slate-900"`
  — **그라데이션 배경**에 텍스트 한 줄(`:321-333`)이고 시간축이 없다.
- 표시 텍스트는 `:108` `const previewText = previewWords.slice(0, effectiveMaxWords).join(" ");` — 타이밍 없이 앞 N단어를 이어붙인다.
- 좌표 환산은 이미 백엔드 PlayRes 기준이다: `:22` `PREVIEW_HEIGHT_PX = 320`, `:29` `ASS_PLAY_RES_Y = 1920`,
  `:111` `const previewScale = PREVIEW_HEIGHT_PX / ASS_PLAY_RES_Y;`, `:112` `previewFontPx = Math.max(10, Math.round(effectiveFontSize * previewScale))`,
  `:115` `const previewStrokePx = effectiveOutlineWidth * previewScale * 2;`(외곽선 2배 보정).
- 위치는 `:42-49`의 `POSITION_JUSTIFY_CLASS`(top→`justify-start pt-6` 등)로 근사한다 — marginv 픽셀이 아니다.
- 안내문 `:338-342`가 "배경은 실제와 다르다(렌더는 세로 크롭)"를 이미 자백한다.
- **폰트 크기 함정(미보정)**: `:112`는 ASS fontsize에 `previewScale`만 곱한다. libass는 face.ascender/descender를
  OS/2 `usWinAscent`/`usWinDescent`로 덮어쓴 뒤(`ass_font.c` `set_font_metrics` — 0.15.2 `:98-104`, master `:356-366`)
  FreeType `REAL_DIM`(= face.ascender − face.descender)으로 크기를 요청하므로(`ass_face_set_size`), ASS 크기 1단위 =
  winAscent+winDescent 픽셀이다. em이 아니라서 실렌더보다 크게 그린다 — Anton은 1.73배.

**재료가 이미 클라이언트에 있다**

- 원본 플레이어 URL: `ui/index.tsx:98` `const playUrlState = usePlayUrl(uploadedFileId, getOriginalPlayUrl);`,
  `:99-100` `const readyPlayUrl = playUrlState.status === "ready" ? playUrlState.url : null;`. 메인 `<video>`가 `:392-401`에서 이를 쓴다.
- 단어별 전사(타이밍 포함): `model/use-clip-draft-review.ts:65` `} = useQuery<TranscriptWord[]>({` → `features/clip-review/api/index.ts:43` `getS3ObjectText(file.transcriptS3Key)`.
  타입은 `features/clip-review/model/transcript.ts:1-5` `interface TranscriptWord { start; end; word }`, 배럴 재수출은 `features/clip-review/index.ts`.
- 카드는 이미 구간 안 단어를 가진다: `ClipDraftCard.tsx:114-120` `const wordsInRange = useMemo(() => transcriptWords.filter((word) => word.start >= startSeconds && word.end <= endSeconds), ...)`.
  다이얼로그엔 **문자열만** 넘긴다: `:484` `previewWords={wordsInRange.map((word) => word.word)}`(타이밍 버림).
- `CaptionStyleDialog.tsx:23` `previewWords: string[];`, `:64-69`이 그대로 편집기에 전달.

**플레이어 URL은 카드에 없다** — `ClipDraftCard`의 props(`ClipDraftCard.tsx:45-56`)에 `playUrl`도 `uploadedFileId`도 없다.
`readyPlayUrl`은 `ui/index.tsx`에만 있고 카드로 내려오지 않는다.

**백엔드 자막은 결정적이다** (읽기만 — 담당 범위 밖, `apps/backend/main.py`)

- `main.py:287` `create_subtitles_with_ffmpeg(...)` — 구간 안 단어를 필터(`:300-305` start≥clip_start·end≤clip_end)한 뒤
  `max_word`개씩 묶고(`:329-345`), 큐 시각은 첫 단어 start_rel ~ 마지막 단어 end_rel(클립 상대, `:321-322` `max(0.0, seg-clip_start)`).
  쉼 분할·단어별 하이라이트 없음. 대문자는 이벤트 텍스트에 적용(`:384-385`).
- 스타일 상수: `:353-354` PlayResX 1080 / PlayResY 1920, `:360` fontname `"Anton"`, `:369` shadow 6.5,
  `:370` backcolor `(12,12,12,210)`, `:372-373` marginl/r 44, `:375` spacing 1.8, `:366-368` borderstyle 1·outline·outlinecolor.
- 위치: `:133-137` alignment top 8 / middle 5 / bottom 2, `:140-143` marginv top 200 / bottom 260,
  middle은 언어별 기본(`:295` EN 165 · `:411` KR 155).
- 한국어: `:403` `create_korean_subtitles_with_ffmpeg` — 영어 묶음을 만든 뒤 묶음별 Gemini 번역(`:555` fontname `"Noto Sans KR"`, fontsize 130, max_word 3).
  **한국어 텍스트는 렌더 중에만 생긴다** — 웹에 Gemini 없음.
- 폰트 설치: `:70` Anton `.../google/fonts/main/ofl/anton/Anton-Regular.ttf`,
  `:74` Noto Sans KR Bold `.../notofonts/noto-cjk/main/Sans/SubsetOTF/KR/NotoSansKR-Bold.otf`.
- 크롭: `:198` `create_vertical_video` — 화자 얼굴 검출(렌더 중 GPU ASD) 위치로 세로 크롭. 검토 시점엔 없다.

**앱은 이미 next/font/google을 쓴다**: `app/layout.tsx:4` `import { Geist } from "next/font/google";`,
`:64-67` `const geist = Geist({...})`, `:73` `<html ... className={`${geist.variable}`}>`.

## 문제

캡션 스타일 미리보기(`CaptionStyleEditor.tsx:314-343`)가 그라데이션 상자에 텍스트 한 줄이라, 실제 영상 위에서
스타일이 9:16 프레임·타이밍과 함께 어떻게 보일지 알 수 없다. source가 지목한 것은 "새 렌더 없이 원본 영상 위
오버레이로 보여준다"이고, 그것이 가능한 이유는 자막의 입력(전사, `use-clip-draft-review.ts:65`)과 알고리즘
(묶기, `main.py:287-345`)이 결정적이고 둘 다 클라이언트에 있기 때문이다(`ClipDraftCard.tsx:114-120`이 이미 구간 단어 보유).

**source 예측과 어긋난 점 하나** — source는 "`ui/index.tsx`는 이 항목에서 무변경 예정"이라 적었으나,
플레이어를 다이얼로그 안에 두려면 presigned URL이 카드까지 내려와야 한다. 그 URL(`readyPlayUrl`)은
`ui/index.tsx:99-100`에만 있고 `ClipDraftCard`의 props(`:45-56`)에 없다. 따라서 **`ui/index.tsx`가 `ClipDraftCard`에
`playUrl` 한 줄을 넘기도록 바뀐다.** 이 변경은 `apps/web` 안에서 닫히며 FEAT-35가 `ui/index.tsx`를
건드리지 않으므로 충돌하지 않는다(아래 겹침 표기). source의 "무변경 예정"만 사실과 달라 여기 명시한다.

정확히 재현되는 것: 텍스트·큐 시각·줄당 단어·대문자(알고리즘 이식). 계산으로 맞추는 것: 크기·위치·색·외곽선
(PlayRes 비율 환산 + 폰트 REAL_DIM 보정). 어떤 방식으로도 검토 시점엔 못 만드는 근사 둘: 크롭 위치
(`main.py:198`, 화자 트래킹은 렌더 중 생성)와 한국어 텍스트(`main.py:403`, 렌더 중 번역). 이 둘은 안내 문구로 알린다.

## 고칠 파일

**before/after 트리 전제**: 아래 before/after는 **현재 트리**(FEAT-35 미적용)를 전제한다. FEAT-35는
`검토대기`일 뿐 아직 구현·인수되지 않았고 구현 순서가 확정되지 않았다. FEAT-36와 FEAT-35가 겹치는 파일은
`ClipDraftCard.tsx` 하나이며, **두 계획이 만지는 줄이 서로소**라 어느 쪽을 먼저 구현해도 anchor가 흔들리지 않는다
(FEAT-35, 계획서 `f7e6e57` 기준: import 블록 2줄 추가·`nearestBoundary :62-79`·state `:96-97` 아래 추가·
`adjustStart/End :124-138`·프리뷰 버튼 `:323-330`·입력 `:359-374`. FEAT-36: props 인터페이스 `:45-56`·구조분해 `:81-92`·
`CaptionStyleDialog` 호출 `:479-488`).
FEAT-36의 `ClipDraftCard` 변경은 **새 import가 필요 없어**(아래 스케치 참조) import 블록조차 건드리지 않는다.

| 파일 | 변경 |
| --- | --- |
| `src/fsd/shared/config/constants.ts` | 백엔드·폰트 동기 상수 블록 `CAPTION_RENDER` 추가(PlayRes·marginv·shadow·폰트 EM_SCALE). FEAT-35 무관 |
| `src/fsd/widgets/clip-draft-review/model/caption-preview.ts` `(신규)` | `buildCaptionCues`(묶기 이식)·`pickActiveCue`·지오메트리 px 환산(폰트 REAL_DIM 보정 포함) |
| `src/fsd/widgets/clip-draft-review/model/caption-preview.test.mjs` `(신규)` | 위 순수 함수 커버 |
| `src/fsd/widgets/clip-draft-review/ui/_component/CaptionPreviewPlayer.tsx` `(신규)` | 9:16 프레임·음소거 루프 `<video>`·큐 오버레이 |
| `src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleEditor.tsx` | 그라데이션 상자(`:313-343`)를 `CaptionPreviewPlayer`로 교체, 로컬 환산 상수 제거, props 교체. FEAT-35 무관 |
| `src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx` | props `previewWords: string[]` → `words`·`clipStart`·`clipEnd`·`playUrl`로 교체·전달. FEAT-35 무관 |
| `src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | **(FEAT-35 겹침, 줄 서로소)** props에 `playUrl` 수신, `CaptionStyleDialog` 호출(`:479-488`) props 확장 |
| `src/fsd/widgets/clip-draft-review/ui/index.tsx` | **(FEAT-35 무변경 파일)** `ClipDraftCard` 호출(`:434-446`)에 `playUrl={readyPlayUrl}` 추가 — source 예측과 어긋나는 지점 |
| `src/app/layout.tsx` | `Anton`·`Noto_Sans_KR`를 next/font/google로 로드, `<html>`에 CSS 변수 추가. FEAT-35 무관 |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다. 특히 백엔드(`apps/backend`)·저장 경로·서버 액션은
무변경 전제이므로 닿게 되면 `보류`.

## 구현 스케치

### ① 백엔드 동기 상수 — `constants.ts`에 추가

`CAPTION_STYLE_OPTIONS`(`:49-68`) 아래에 추가한다. 값은 `apps/backend/main.py`와 설치 폰트 파일에 묶인다:

```ts
/**
 * 캡션 렌더 좌표 상수. apps/backend/main.py 및 설치 폰트 파일과 동기.
 * 미리보기(CaptionPreviewPlayer)가 PlayRes 비율로 환산해 실렌더 픽셀을 근사한다.
 */
export const CAPTION_RENDER = {
  PLAY_RES_Y: 1920, // main.py:354 subs.info["PlayResY"]
  // top/bottom 세로 마진(PLAY_RES_Y 기준). middle은 중앙 정렬이라 마진 미사용.
  MARGINV: { top: 200, bottom: 260 }, // main.py:141-142
  SHADOW: 6.5, // main.py:369 new_style.shadow / :562 korean_style.shadow
  // ⚠️ libass는 face.ascender/descender를 OS/2 usWinAscent/usWinDescent로 덮어쓴 뒤
  // (ass_font.c set_font_metrics — 0.15.2 :98-104, master :356-366; Ubuntu 22.04 ffmpeg가
  // 링크하는 0.15.2도 동일) FreeType REAL_DIM(= ascender − descender)으로 크기를 요청한다
  // (ass_face_set_size, FT_SIZE_REQUEST_TYPE_REAL_DIM). 즉 ASS fontsize 1 = (winAscent +
  // winDescent) 픽셀. USE_TYPO_METRICS는 FreeType 기본값만 바꾸고 libass가 그 값을
  // 덮어쓰므로 무관하다.
  // 그래서 CSS font-size(px) = assFontSize × (unitsPerEm / (winAscent + winDescent)) × previewScale.
  // 아래 값은 main.py:70,74가 설치하는 실제 폰트 파일을 받아 OS/2·head 표를
  // 파싱해 확정했다(2026-09-07):
  //   Anton-Regular.ttf   : unitsPerEm 2048, usWinAscent 2876 + usWinDescent 674 = 3550
  //     (sTypo·hhea는 2409/−674 = 3083이지만 libass가 쓰는 값이 아니다)
  //   NotoSansKR-Bold.otf : unitsPerEm 1000, usWinAscent 1160 + usWinDescent 288 = 1448
  //     (hhea 1160/−288과 동일)
  EM_SCALE: {
    English: 2048 / 3550, // ≈ 0.576901  (Anton, 영어 클립)
    Korean: 1000 / 1448, //  ≈ 0.690608  (Noto Sans KR, 한국어 클립)
  },
} as const;
```

### ② 순수 모듈 — `model/caption-preview.ts` (신규, 전문)

```ts
import type { TranscriptWord } from "~/fsd/features/clip-review";
import { CAPTION_RENDER, type CaptionStyle } from "~/fsd/shared/config/constants";

export interface CaptionCue {
  start: number; // 클립 상대 초 (main.py start_rel)
  end: number; // 클립 상대 초 (main.py end_rel)
  text: string;
}

// apps/backend/main.py:287-345 create_subtitles_with_ffmpeg 의 묶기를 그대로 옮긴다.
// 전사가 같으면 큐도 같으므로(결정적) 새 렌더 없이 실렌더의 텍스트·큐 시각을 재현한다.
export function buildCaptionCues(
  words: readonly TranscriptWord[],
  clipStart: number,
  clipEnd: number,
  maxWords: number,
  uppercase: boolean,
): CaptionCue[] {
  // main.py:300-305 — 클립 범위 안 세그먼트만. (web TranscriptWord.start/end는
  // parseTranscriptWords가 이미 number로 보장하므로 null 검사는 불필요.)
  const inRange = words.filter(
    (w) => w.start >= clipStart && w.end <= clipEnd,
  );

  const cues: CaptionCue[] = [];
  let current: string[] = [];
  let curStart = 0;
  let curEnd = 0;

  const flush = () => {
    const text = current.join(" ");
    cues.push({
      start: curStart,
      end: curEnd,
      text: uppercase ? text.toUpperCase() : text, // main.py:384-385
    });
  };

  for (const w of inRange) {
    const word = w.word.trim();
    const startRel = Math.max(0, w.start - clipStart); // main.py:321
    const endRel = Math.max(0, w.end - clipStart); // main.py:322
    if (word === "" || endRel <= 0) continue; // main.py:317,324-326

    if (current.length === 0) {
      current = [word];
      curStart = startRel;
      curEnd = endRel;
    } else if (current.length >= maxWords) {
      flush(); // main.py:334-338
      current = [word];
      curStart = startRel;
      curEnd = endRel;
    } else {
      current.push(word); // main.py:340-342
      curEnd = endRel;
    }
  }
  if (current.length > 0) flush(); // main.py:344-345

  return cues;
}

// 현재 재생 위치(클립 상대 초)의 큐. 백엔드는 큐 사이에 공백을 두므로
// (앞 큐 end ~ 다음 큐 start) 그 구간엔 자막이 없다 → null.
export function pickActiveCue(
  cues: readonly CaptionCue[],
  relativeSeconds: number,
): CaptionCue | null {
  for (const cue of cues) {
    if (relativeSeconds >= cue.start && relativeSeconds < cue.end) return cue;
  }
  return null;
}

function previewScale(previewHeightPx: number): number {
  return previewHeightPx / CAPTION_RENDER.PLAY_RES_Y;
}

// libass REAL_DIM 보정 포함. main.py fontsize(EN 122 / KR 130 등)를 미리보기 px로.
export function getPreviewFontPx(
  assFontSize: number,
  language: string,
  previewHeightPx: number,
): number {
  const emScale =
    language === "Korean"
      ? CAPTION_RENDER.EM_SCALE.Korean
      : CAPTION_RENDER.EM_SCALE.English;
  return Math.max(8, assFontSize * emScale * previewScale(previewHeightPx));
}

// ASS 외곽선은 글리프 바깥, CSS 스트로크는 글리프 중앙 기준 → 같아 보이려면 2배.
export function getPreviewStrokePx(
  assOutlineWidth: number,
  previewHeightPx: number,
): number {
  return assOutlineWidth * previewScale(previewHeightPx) * 2;
}

// ASS shadow(6.5)를 미리보기 오프셋 px로. borderstyle 1의 드롭섀도 근사.
export function getPreviewShadowPx(previewHeightPx: number): number {
  return CAPTION_RENDER.SHADOW * previewScale(previewHeightPx);
}

// 세로 위치. top/bottom은 marginv(main.py:141-142)를 px로, middle은 중앙(둘 다 null).
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
```

`import type`는 tsx가 런타임 방출하지 않으므로 `.test.mjs`가 feature 배럴의 `"use server"` 액션을 끌어오지 않는다
(FEAT-35 `preview-range.ts`가 `ClipRange`를 같은 방식으로 type-import한 선례와 동형).

### ③ 미리보기 플레이어 — `_component/CaptionPreviewPlayer.tsx` (신규, 핵심부)

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptWord } from "~/fsd/features/clip-review";
import type { CaptionStyle } from "~/fsd/shared/config/constants";
import { cn } from "~/fsd/shared/lib/utils";
import {
  buildCaptionCues,
  getPreviewFontPx,
  getPreviewShadowPx,
  getPreviewStrokePx,
  getPreviewVerticalInset,
  pickActiveCue,
} from "../../model/caption-preview";

const PREVIEW_HEIGHT_PX = 320;
const PREVIEW_WIDTH_PX = 180; // 9:16

interface CaptionPreviewPlayerProps {
  playUrl: string | null;
  clipStart: number;
  clipEnd: number;
  words: TranscriptWord[];
  language: string;
  // effective(언어 기본값 얹은) 스타일. CaptionStyleEditor가 계산해 넘긴다.
  fontSize: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  maxWords: number;
  uppercase: boolean;
  position: CaptionStyle["position"];
}

export default function CaptionPreviewPlayer(props: CaptionPreviewPlayerProps) {
  const { playUrl, clipStart, clipEnd, words, language } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeText, setActiveText] = useState("");

  const cues = useMemo(
    () =>
      buildCaptionCues(words, clipStart, clipEnd, props.maxWords, props.uppercase),
    [words, clipStart, clipEnd, props.maxWords, props.uppercase],
  );

  // 큐 목록은 ref로 읽는다. 재생 이펙트의 의존성에 cues를 넣으면 줄당 단어·대문자를
  // 바꿀 때마다 재생이 클립 시작으로 되돌아간다. 스타일 변경은 현재 위치의 큐만 다시 고른다.
  const cuesRef = useRef(cues);
  useEffect(() => {
    cuesRef.current = cues;
    const video = videoRef.current;
    if (!video) return;
    setActiveText(pickActiveCue(cues, video.currentTime - clipStart)?.text ?? "");
  }, [cues, clipStart]);

  // 클립 구간을 음소거로 반복 재생하며 timeupdate마다 현재 큐를 고른다.
  // timeupdate 주기(~250ms)만큼 큐 전환이 늦을 수 있다 — 메인 프리뷰
  // (ui/index.tsx:213-225)와 같은 한계다.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playUrl === null) return;

    const seekToStart = () => {
      video.currentTime = clipStart;
      void video.play();
    };
    const onTimeUpdate = () => {
      if (video.currentTime >= clipEnd) video.currentTime = clipStart; // 루프
      setActiveText(
        pickActiveCue(cuesRef.current, video.currentTime - clipStart)?.text ?? "",
      );
    };

    video.addEventListener("loadedmetadata", seekToStart);
    video.addEventListener("timeupdate", onTimeUpdate);
    if (video.readyState >= 1) seekToStart();
    return () => {
      video.removeEventListener("loadedmetadata", seekToStart);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [playUrl, clipStart, clipEnd]);

  const inset = getPreviewVerticalInset(props.position, PREVIEW_HEIGHT_PX);
  const fontPx = getPreviewFontPx(props.fontSize, language, PREVIEW_HEIGHT_PX);
  const strokePx = getPreviewStrokePx(props.outlineWidth, PREVIEW_HEIGHT_PX);
  const shadowPx = getPreviewShadowPx(PREVIEW_HEIGHT_PX);
  const fontFamily =
    language === "Korean" ? "var(--font-noto-sans-kr)" : "var(--font-anton)";
  const centered = inset.top === null && inset.bottom === null;

  return (
    <div
      className="relative mx-auto overflow-hidden rounded-lg bg-black"
      style={{ width: PREVIEW_WIDTH_PX, height: PREVIEW_HEIGHT_PX }}
    >
      {playUrl !== null && (
        // 크롭은 렌더 시 화자 추적이라 여기선 중앙 크롭(object-cover)으로 근사.
        <video
          ref={videoRef}
          src={playUrl}
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      )}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 flex justify-center px-2",
          centered && "inset-y-0 items-center",
        )}
        style={{ top: inset.top ?? undefined, bottom: inset.bottom ?? undefined }}
      >
        {activeText !== "" && (
          <p
            className="text-center leading-tight"
            style={{
              fontFamily,
              fontSize: fontPx,
              color: props.color,
              textTransform: props.uppercase ? "uppercase" : "none",
              WebkitTextStroke: `${strokePx}px ${props.outlineColor}`,
              paintOrder: "stroke fill",
              // ASS backcolor (12,12,12,210): 알파 210/255는 투명도라 불투명도는 1 − 0.82 ≈ 0.18.
              textShadow: `${shadowPx}px ${shadowPx}px 0 rgba(12,12,12,0.18)`,
            }}
          >
            {activeText}
          </p>
        )}
      </div>
    </div>
  );
}
```

플레이어가 없을 때(=`playUrl === null`, presign 로딩/실패)는 검은 상자가 남는다. 안내는 CaptionStyleEditor 쪽
(아래 ④)의 문구가 담당한다.

### ④ CaptionStyleEditor 배선 (바뀌는 줄만)

**props 교체** — `:12-19`의 `interface CaptionStyleEditorProps`에서 `:16-17`
`// 현재 구간에 포함되는 전사 단어 (미리보기 텍스트용).` / `previewWords: string[];` 를
다음으로 교체한다:

```ts
  // 미리보기 플레이어가 쓰는 원본 영상 URL·클립 구간·구간 안 단어(타이밍 포함).
  playUrl: string | null;
  clipStart: number;
  clipEnd: number;
  words: TranscriptWord[];
```

`import type { TranscriptWord } from "~/fsd/features/clip-review";`를 상단 import에 추가한다.
구조분해(`:81-86`)의 `previewWords`를 `playUrl, clipStart, clipEnd, words`로 교체한다.

**로컬 환산 제거** — `:21-22`(`PREVIEW_HEIGHT_PX` 주석+상수), `:24-29`(`ASS_PLAY_RES_Y` 주석+상수),
`:40-49`(`POSITION_JUSTIFY_CLASS`), `:108`(`previewText`), `:110-117`(`previewScale`·`previewFontPx`·
`previewStrokePx`·`justifyClass`)를 삭제한다 — 크기/외곽선/위치 환산은 이제 `model/caption-preview.ts`가 한다.
`import CaptionPreviewPlayer from "./CaptionPreviewPlayer";`를 추가한다.

**미리보기 컬럼 교체** — `:313-343`의 `<div className="flex flex-col gap-2">…</div>`(그라데이션 상자 + 안내문)를
다음으로 바꾼다(effective 값은 `:88-98`에서 이미 계산됨):

```tsx
      <div className="flex flex-col gap-2">
        <CaptionPreviewPlayer
          playUrl={playUrl}
          clipStart={clipStart}
          clipEnd={clipEnd}
          words={words}
          language={language}
          fontSize={effectiveFontSize}
          color={effectiveColor}
          outlineColor={effectiveOutlineColor}
          outlineWidth={effectiveOutlineWidth}
          maxWords={effectiveMaxWords}
          uppercase={effectiveUppercase}
          position={effectivePosition}
        />
        {/* 못 닫는 근사 둘을 말한다: 크롭은 렌더 시 화자를 따라가 중앙 크롭과 다르고,
            한국어는 렌더 시 번역되므로 여기선 영어 원문으로 보인다. */}
        <p className="text-center text-[11px] text-muted-foreground">
          Live preview on your video. The final clip crops to whoever is
          speaking, so framing will differ. Korean clips are translated at
          render time — the words here are the English source.
        </p>
      </div>
```

### ⑤ CaptionStyleDialog 배선 (바뀌는 줄만)

**props 교체** — `:23` `previewWords: string[];` 를 다음으로 교체하고
`import type { TranscriptWord } from "~/fsd/features/clip-review";`를 추가한다:

```ts
  playUrl: string | null;
  clipStart: number;
  clipEnd: number;
  words: TranscriptWord[];
```

구조분해(`:29-38`)의 `previewWords`를 `playUrl, clipStart, clipEnd, words`로 바꾸고,
편집기 호출(`:64-69`)의 `previewWords={previewWords}`를 다음으로 교체한다:

```tsx
        <CaptionStyleEditor
          language={language}
          value={working}
          playUrl={playUrl}
          clipStart={clipStart}
          clipEnd={clipEnd}
          words={words}
          onChange={setWorking}
        />
```

### ⑥ ClipDraftCard 배선 — **FEAT-35 겹침 파일(줄 서로소)**

**props 수신** — `interface ClipDraftCardProps`(`:45-56`)에 한 줄 추가(예: `isBudgetFull` 아래):

```ts
  playUrl: string | null;
```

구조분해(`:81-92`)에 `playUrl,`을 추가한다. (FEAT-35는 `:96-97` 아래에 텍스트 버퍼 state를 더할 뿐
props 인터페이스·구조분해를 건드리지 않는다.)

**다이얼로그 호출 확장** — `:479-488`의 `<CaptionStyleDialog .../>`에서
`:484` `previewWords={wordsInRange.map((word) => word.word)}` 를 다음으로 교체한다:

```tsx
        playUrl={playUrl}
        clipStart={startSeconds}
        clipEnd={endSeconds}
        words={wordsInRange}
```

`wordsInRange`(`:114-120`, `TranscriptWord[]`)·`startSeconds`/`endSeconds`(로컬 편집값, `:96-97`)는 모두 이미 존재하고
`TranscriptWord` 타입도 이미 import돼 있어(`:15-19`) **새 import가 필요 없다.** buildCaptionCues가 `[clipStart, clipEnd]`로
다시 필터하지만 `wordsInRange`가 같은 술어로 이미 필터돼 있어 무해하다.

### ⑦ ui/index.tsx 배선 — **FEAT-35 무변경 파일**

`ClipDraftCard` 호출(`:434-446`)에 한 줄 추가한다(예: `isBudgetFull` 아래):

```tsx
              playUrl={readyPlayUrl}
```

`readyPlayUrl`(`:99-100`, `string | null`)은 이미 있다. FEAT-35는 이 파일을 건드리지 않는다.

### ⑧ layout.tsx 배선 (바뀌는 줄만)

`:4` `import { Geist } from "next/font/google";` 를 확장한다:

```ts
import { Anton, Geist, Noto_Sans_KR } from "next/font/google";
```

`:64-67`의 `const geist = ...` 아래에 추가한다:

```ts
const anton = Anton({
  subsets: ["latin"],
  weight: "400", // main.py:360 Anton-Regular
  variable: "--font-anton",
});

// 미리보기는 영어 원문만 표시(한국어는 렌더 시 번역)하므로 latin 서브셋으로 충분하다.
// 한글 서브셋은 크므로 preload하지 않는다 — 필요한 것은 폰트 메트릭(EM_SCALE)과 패밀리다.
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: "700", // main.py:74 NotoSansKR-Bold
  variable: "--font-noto-sans-kr",
  preload: false,
});
```

`:73` `<html lang="en" className={`${geist.variable}`}>` 를 다음으로 교체한다:

```tsx
    <html
      lang="en"
      className={`${geist.variable} ${anton.variable} ${notoSansKr.variable}`}
    >
```

> 서브셋·굵기는 설치된 next 15.5.7의 폰트 메타데이터
> (`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`)를 파싱해 확인했다 —
> Anton: weights `["400"]`, subsets `latin`·`latin-ext`·`vietnamese`; Noto Sans KR: weights `100`~`900`·`variable`,
> subsets `cyrillic`·`latin`·`latin-ext`·`vietnamese`. 위 두 호출은 그대로 통과한다(한글 글리프는 Google Fonts의
> unicode-range 슬라이스로 필요 시 내려온다).

## 테스트

- **덮는 것** (`model/caption-preview.test.mjs`)
  - `buildCaptionCues`: 픽스처 단어 목록으로 —
    ① 묶기 경계: max_word=3에 7단어 → 3+3+1 큐(마지막 잔여 flush, `main.py:344-345`). **두 번째 큐의 start가
       4번째 단어의 start_rel임을 함께 단언한다** — flush 뒤 `curStart` 재설정을 빼도 텍스트 단언만으로는 살아남는다
       (검증 라운드 1 돌연변이 생존).
    ② 큐 시각: 각 큐 start=첫 단어 start_rel·end=마지막 단어 end_rel(클립 상대), `clipStart=100`에서 원시 167.9 → 67.9.
    ③ 범위 필터: `clipStart`/`clipEnd` 밖 단어 제외(`main.py:300-305`). **`end === clipEnd`인 단어는 포함**
       (`main.py:304` `<=` 경계 포함) — 없으면 `<`로 바꾼 돌연변이가 살아남는다(같은 라운드).
    ※ 기대값은 `clipStart`를 뺀 뒤에도 정확히 표현되는 수로 쓴다(예: 100.5 − 100 = 0.5). `100.4 − 100`은
       0.40000000000000568이라 `deepEqual`이 실패한다 — 백엔드 Python도 같은 부동소수이므로 구현 결함이 아니다.
    ④ 빈 단어(`" "`) 스킵, endRel<=0(zero-length at clipStart) 스킵.
    ⑤ uppercase=true → 텍스트 대문자(`main.py:384-385`), false → 원본.
    ⑥ max_word=1 → 단어당 한 큐.
  - `pickActiveCue`: 큐 안(start≤t<end)→해당 큐, 큐 사이 공백→null, 마지막 end 이후→null, 첫 start 이전→null,
    경계값 t==start→포함·t==end→다음/ null.
  - `getPreviewFontPx`: EN 122·height 320 → `122 × 2048/3550 × (320/1920)` ≈ 11.73, KR 130 → `130 × 1000/1448 × (1/6)` ≈ 14.96,
    하한 클램프(작은 fontSize→8), 언어 분기(Korean vs 그 외).
  - `getPreviewStrokePx`: `outline × (320/1920) × 2`(예: 3 → 1.0).
  - `getPreviewVerticalInset`: top → `{top: 200×1/6≈33.33, bottom:null}`, bottom → `{top:null, bottom:260×1/6≈43.33}`,
    middle → `{top:null, bottom:null}`.
  - `getPreviewShadowPx`: `6.5 × 1/6 ≈ 1.083`.
- **못 덮는 범위**: `npm test`는 Node 내장 러너라 DOM·React 테스트 도구가 없다. `CaptionPreviewPlayer`의
  `<video>` 로드·seek·루프·timeupdate 큐 전환, `object-fit: cover` 크롭, DOM 오버레이 위치·`WebkitTextStroke`·
  next/font 로딩(`--font-anton`/`--font-noto-sans-kr` 적용)·다이얼로그 렌더는 이 러너 밖이다 — 배포 후 검토 화면에서
  실제 클립으로 수동 확인 대상이다(특히 폰트 크기 환산이 실렌더와 맞는지 EN/KR 각각 1회씩 대조).

## 범위 밖 의존

없음(차단 없음). 요구는 전부 `apps/web` 안에서 닫힌다 — 위젯 + `shared/config/constants.ts` + `app/layout.tsx`.
`apps/backend/main.py`는 **읽기만** 했고(자막 상수·묶기 알고리즘·폰트 URL의 근거), 백엔드 변경은 없다.
`packages/db`·다른 워크스페이스·서버 액션·DB 스키마를 건드리지 않는다.

백로그 source가 「범위 밖 의존(후속 후보) (a)(b)(c)」로 적은 셋은 **교차 경계 차단이 아니라 이 반복에서
의도적으로 빼는 후속 범위**다: (a) 렌더 후 자막 전 세로 영상(`main.py:755`) 보관 → 크롭·한국어·libass 픽셀을
실물로 확인(backend+web, 크레딧 정책 필요), (b) 한국어 미리보기 번역 서버 액션(Gemini 키 위치에 따라 web/backend),
(c) 같은 플레이어를 왼쪽 메인 패널에도 재사용. 셋 다 이 항목이 못 닫는 두 근사(크롭·한국어)를 겨냥하거나 재사용이라
효과를 본 뒤 별 항목으로 판단한다 — 이 계획에는 넣지 않는다. (a)(b)는 backend를 필요로 하므로 착수 시 별도 발주가 필요하다.

## 대안

- **클라이언트 오버레이 vs 서버 프리뷰 렌더·브라우저 mp4 합성·정지 프레임** — 메인 루프가 대조한 뒤 소유자가
  "1(클라이언트 오버레이) 수행"으로 지목했다(source). 서버 렌더는 크레딧·지연을 발생시키고, 브라우저 mp4 합성은
  libass 미탑재라 폰트 픽셀을 재현 못하며, 정지 프레임은 타이밍을 잃는다. 오버레이는 재료가 이미 클라이언트에
  있어(전사+원본 URL) 새 비용 없이 텍스트·큐·크기·위치를 재현한다.
- **큐 전환: timeupdate vs requestAnimationFrame** — rAF가 더 매끄럽지만(프레임마다), timeupdate(~250ms)는
  메인 프리뷰(`ui/index.tsx:213-225`)와 같은 패턴이고 리스너 정리가 단순하다. 미리보기 용도에 250ms 지연은
  허용 범위라 timeupdate를 택한다. 체감이 나쁘면 후속으로 rAF 전환.
- **폰트 크기 보정 분모: winAscent+winDescent vs FreeType 기본 REAL_DIM** — 1차 계획은 Anton의
  `USE_TYPO_METRICS`(fsSelection bit7) 때문에 FreeType가 sTypo(3083)를 쓴다고 보고 3083을 택했다. 검증 라운드 1에서
  libass 소스로 뒤집혔다: libass는 FreeType 기본값을 쓰지 않고 `set_font_metrics`가 face.ascender/descender를
  OS/2 win 값으로 덮어쓴 뒤 REAL_DIM을 요청한다(0.15.2·master 동일). 그래서 분모는 두 폰트 모두
  winAscent+winDescent다(Anton 3550, Noto 1448). Noto는 hhea와 win이 같아 값이 바뀌지 않았다.
- **재생 이펙트 의존성에서 `cues` 제외** — 1차 스케치는 `[playUrl, clipStart, clipEnd, cues]`였다. 그러면 줄당 단어나
  대문자를 바꿀 때마다 이펙트가 다시 걸려 `seekToStart()`가 재생을 클립 시작으로 되돌린다. 큐는 ref로 읽고 재생
  이펙트는 URL·구간에만 묶는다(검증 라운드 1).
- **미리보기 텍스트 언어 vs 폰트** — 미리보기 텍스트는 항상 영어(한국어는 렌더 시 번역, `main.py:403`)지만
  폰트·EM_SCALE는 클립 언어로 고른다. 한국어 클립은 Noto Sans KR에 영어 원문을 얹어 크기·위치를 정확히
  맞추되(Latin 글리프로 렌더) 텍스트가 렌더와 다름을 문구로 알린다.
- **환산 상수 위치: constants.ts vs model 모듈** — 원시 백엔드·폰트 동기 값은 "main.py와 동기" 관례의 홈인
  `constants.ts`(`CLIP_DURATION_LIMITS`·`CAPTION_STYLE_OPTIONS`가 이미 그 형태)에 `CAPTION_RENDER`로 두고,
  파생 계산(px 환산·묶기)은 순수·테스트 가능한 `model/caption-preview.ts`에 둔다. source의 "이 모듈로 모은다"는
  파생 로직을 한 모듈에 모으라는 뜻으로 읽고, 동기 리터럴만 constants에 남긴다.
