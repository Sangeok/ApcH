# FEAT-49: Korean 캡션 스타일 미리보기가 영어 원문 대신 한국어 샘플 문장을 그린다 — Uppercase·Words per line이 한국어 결과를 오도하지 않게

agent: web-dev

## 현재 동작

캡션 스타일 편집기(`features/caption-style/ui/CaptionStyleEditor.tsx`)는 미리보기 플레이어(`ui/CaptionPreviewPlayer.tsx`)를 두 소비자에서 쓴다.

- **검토 다이얼로그(라이브 분기, `sample` 미전달 → `false`)**: `widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx:71` `<CaptionStyleEditor`가 `words`를 넘기는데, 그 값은 카드의 `wordsInRange`다(`_component/ClipDraftCard.tsx:525` `        words={wordsInRange}`). `wordsInRange`는 영어 전사 단어다 — `ClipDraftCard.tsx:114` `  const previewText = wordsInRange.map((word) => word.word).join(" ");`.
- **설정 화면(샘플 분기, `sample`)**: `pages/settings/ui/index.tsx:229` `<CaptionStyleEditor`가 `:232` `            sample`, `:236` `            words={sampleCaptionWords(language)}`를 넘긴다.

플레이어가 큐를 만드는 지점 — `CaptionPreviewPlayer.tsx:45-49`:

```
  const cues = useMemo(
    () =>
      buildCaptionCues(words, clipStart, clipEnd, props.maxWords, props.uppercase),
    [words, clipStart, clipEnd, props.maxWords, props.uppercase],
  );
```

- 큐 묶기는 `model/caption-preview.ts:12` `export function buildCaptionCues(`가 하고, 큐 텍스트에 대문자를 직접 적용한다 — `:35` `      text: uppercase ? text.toUpperCase() : text, // main.py:384-385`.
- 그리는 텍스트는 `CaptionPreviewPlayer.tsx:112` `  const displayText = props.sample === true ? firstCueText(cues) : activeText;`이고 `:162` `            {displayText}`가 렌더한다. **`sample !== true`(라이브) 분기에서 `activeText`는 곧 `words`의 영어 단어다** — 이것이 영어 원문이 그려지는 유일한 지점이다.
- 폰트만 언어별이다 — `:108` `    language === "Korean" ? "var(--font-noto-sans-kr)" : "var(--font-anton)";`. 크기·줄당 단어 기본값도 언어별(`CaptionStyleEditor.tsx:43-47` `languageDefaultMaxWords`, `getPreviewFontPx`의 `EM_SCALE.Korean`).
- 대문자 CSS는 `CaptionPreviewPlayer.tsx:155` `              textTransform: props.uppercase ? "uppercase" : "none",` — 영어 전사를 전부 대문자로 바꿔 효과가 크게 보인다.

설정 화면 샘플 분기는 이미 언어별로 옳다. `sampleCaptionWords`가 Korean이면 `KR_WORDS`를 넘긴다 — `model/sample-captions.ts:20-30`(9개 한글 토큰), `:36-38` `export function sampleCaptionWords(language: string)`. 즉 **설정 화면 Korean 미리보기는 이미 한국어 샘플(`KR_WORDS`)을 그린다.**

컨트롤:
- Uppercase 버튼 — `CaptionStyleEditor.tsx:282-289`. 언어 무관하게 항상 활성.
- Words per line — `CaptionStyleEditor.tsx:239-276`. 라벨 `:241` `            Words per line: {effectiveMaxWords}`. Korean 의미 안내 없음.
- 라이브 안내(라이브 분기) — `CaptionStyleEditor.tsx:317-324`:

```
        ) : (
          <p className="text-center text-[11px] text-muted-foreground">
            Live preview on your video — the whole frame is shown here. The final
            clip crops to follow whoever is speaking, so framing will differ.
            Korean clips are translated at render time — the words shown here are
            what&apos;s said in the video, in English.
          </p>
        )}
```

실렌더에서 대문자는 한글에 무효가 아니다 — `apps/backend/main.py:583-585`: `        if resolved["uppercase"]:` / `            # 한글에는 no-op, 줄에 섞인 영문만 대문자화된다.` / `            text = text.upper()`. 즉 줄에 섞인 라틴 문자만 대문자화된다.

프리셋 매칭은 `uppercase`를 비교한다 — `model/caption-presets.ts:13-24` `matchPresetId`가 `Object.entries(preset.style).every(...)`로 position을 뺀 모든 키를 비교하고, 프리셋들은 `uppercase` 값을 담는다(`shared/config/constants.ts:145` `uppercase: false`, `:157`/`:169` `uppercase: true`, `:181` `uppercase: false`).

교차 서술 — `widgets/clip-draft-review/model/review-language-notice.ts:8-12`: 카드 헤더/라벨 안내가 "CaptionStyleEditor의 라이브 미리보기 안내와도 / 일관된다"고 적혀 있다. 반환 문구 자체는 `:19` `  return \`Subtitles will be translated to ${trimmed} when you generate. This review shows what's said in the video, in English.\`;`.

기준선: `npm test -w apps/web` → tests 154 · suites 35 · pass 154.

## 문제

`TASK_BACKLOG.md` FEAT-49 `source`가 지목한 결함 두 개다.

1. **글자는 영어인데 나머지 판단은 한국어 기준이다.** Korean 클립을 검토할 때 라이브 미리보기(`CaptionPreviewPlayer.tsx:112`의 `activeText`)가 영어 전사 단어를 그린다. 폰트·크기·줄당 단어 기본값은 한국어에 맞췄지만, 글자 폭·줄 길이·화면 차지 같은 "한국어 스타일에서 가장 중요한 판단"이 영어 단어로 이뤄진다.
2. **Uppercase가 결과와 반대로 보인다.** 미리보기는 영어를 전부 대문자로 바꿔(`:155`) 효과가 크게 보이지만, 실렌더는 한글에 거의 변화가 없다(`main.py:583-585` — 줄에 섞인 영문만 대문자화). "Words per line"도 Korean에선 "한 자막에 들어가는 영어 원문 단어 수"라 라벨 뜻과 어긋난다.

사용자는 크레딧을 쓰고 렌더한 뒤에야 이 어긋남을 안다.

백로그의 요구 ①~④(각 큐 텍스트만 한국어 샘플로 순환·샘플 표기·Uppercase 표기/비활성·Words per line 의미 노출·안내 문장 갱신)를 위 `파일:줄`로 다시 세운 것이 아래 「고칠 파일」·「구현 스케치」다. 백로그가 지목한 문제와 코드에서 확인한 것 사이 어긋남은 없다 — 다만 설정 화면 샘플 분기는 백로그 작성 시점(FEAT-42 전) 대비 **이미 한국어 샘플을 그리므로**(위 「현재 동작」), 이 항목의 실제 수정 대상은 **라이브 분기와 편집기 공통 컨트롤**로 좁혀진다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/features/caption-style/model/sample-captions.ts` | 순수 함수 둘 신규 — `koreanSampleCues`(큐 텍스트를 `KR_WORDS` 순환으로 치환) · `previewCaptionCues`(Korean 라이브일 때만 치환을 고르는 판정) + `KR_WORDS` 주석에 두 번째 소비자 명시 |
| `src/fsd/features/caption-style/ui/CaptionPreviewPlayer.tsx` | `cues` useMemo가 `buildCaptionCues` 결과를 `previewCaptionCues`에 통과시킨다 + import에 `previewCaptionCues`. 치환 판정은 컴포넌트에 두지 않는다 |
| `src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx` | 라이브 안내를 언어별로 분리(요구 ①·④) + Letter case·Words per line에 Korean 전용 힌트(요구 ②·③) |
| `src/fsd/widgets/clip-draft-review/model/review-language-notice.ts` | 교차 서술 주석 한 곳 갱신(반환 문구 불변 — 주석만). 아래 「구현 스케치」 판정 결과 |
| `src/fsd/features/caption-style/model/sample-captions.test.mjs` | `koreanSampleCues`·`previewCaptionCues` 테스트 describe 둘 추가 |

여기 없는 파일은 고치지 않는다. 특히 `buildCaptionCues`(`caption-preview.ts`)와 `caption-preview.test.mjs`는 **불변**이다 — 치환은 그 결과 큐를 후처리할 뿐이다. `CaptionStyleDialog.tsx`·`pages/settings/ui/index.tsx`·`ClipDraftCard.tsx`는 props만 넘기므로 손대지 않는다.

## 구현 스케치

### 1. `sample-captions.ts` — `koreanSampleCues`·`previewCaptionCues` 신규 + `KR_WORDS` 주석

`KR_WORDS`(`:20-30`) 값은 그대로 두고 주석만 바꾼다. before(`:7-8`):

```
// 각 단어 {start:i, end:i+0.9}. maxWordsPerLine 최댓값(8, MAX_WORDS_RANGE.MAX)까지
// 한 줄을 채울 수 있도록 언어마다 9단어를 둔다.
```

after:

```
// 각 단어 {start:i, end:i+0.9}. maxWordsPerLine 최댓값(8, MAX_WORDS_RANGE.MAX)까지
// 한 줄을 채울 수 있도록 언어마다 9단어를 둔다. KR_WORDS는 두 소비자가 공유한다:
// 설정 화면 정지 샘플(sampleCaptionWords로 타이밍을 붙여 buildCaptionCues에 넣음)과,
// koreanSampleCues가 라이브 Korean 미리보기의 큐 텍스트를 채우는 어휘. 새 상수를 만들지 않는다.
```

새 함수 둘(파일 끝에 추가, `firstSampleCueText` 아래, 이 순서로). `CaptionCue`는 이미 `:2`에서 임포트돼 있다:

```ts
// 라이브 Korean 미리보기. 실렌더는 각 큐(영어 max_word단어 묶음)를 한국어로 번역하지만
// (apps/backend/main.py create_korean_subtitles_with_ffmpeg), 미리보기는 렌더 없이
// 큐의 타이밍·개수는 그대로 두고 텍스트만 KR_WORDS를 순환해 채운다. 큐별 "영어 단어 수"만큼
// 한국어 토큰을 뽑으므로 Words per line을 늘리면 줄이 길어진다(실동작의 근사).
// buildCaptionCues 계약은 건드리지 않는다 — 그 결과 큐를 후처리할 뿐이다.
export function koreanSampleCues(cues: readonly CaptionCue[]): CaptionCue[] {
  let cursor = 0;
  return cues.map((cue) => {
    const trimmed = cue.text.trim();
    const wordCount = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
    const tokens: string[] = [];
    for (let i = 0; i < wordCount; i += 1) {
      // cursor % length는 항상 범위 안이지만 noUncheckedIndexedAccess를 위해 ?? "".
      tokens.push(KR_WORDS[cursor % KR_WORDS.length] ?? "");
      cursor += 1;
    }
    return { start: cue.start, end: cue.end, text: tokens.join(" ") };
  });
}

// 미리보기 플레이어가 그릴 큐를 고른다. Korean 라이브 미리보기(검토 다이얼로그)만 텍스트를
// 한국어 샘플로 치환한다 — English는 그려지는 단어가 곧 실제 자막이라 그대로 두고, 설정 화면
// 정지 샘플(sample)은 이미 sampleCaptionWords(Korean)=KR_WORDS로 만든 큐라 그대로 둔다.
// 언어 판정은 폰트·EM_SCALE·languageDefaultMaxWords와 같은 language === "Korean"이다.
export function previewCaptionCues(
  cues: CaptionCue[],
  language: string,
  sample: boolean,
): CaptionCue[] {
  return language === "Korean" && !sample ? koreanSampleCues(cues) : cues;
}
```

리터럴: `KR_WORDS`는 `["지금","자막","스타일을","원하는","대로","화면에서","미리","확인해","보세요"]`(9개, 기존). 큐가 3영어단어면 텍스트는 `"지금 자막 스타일을"`, 이어지는 큐가 1단어면 `"원하는"`(cursor 계속), 누적 9를 넘기면 `KR_WORDS[0]`로 되돌아간다.

`previewCaptionCues`는 치환 여부 판정만 한다. 이 판정을 플레이어의 `useMemo` 안 삼항으로 두면 English 회귀(English 라이브까지 치환)나 치환 누락(항상 영어 원문)을 어떤 테스트도 잡지 못한다 — 라이브 캡션 텍스트는 `<video>` `timeupdate`가 채우는 state라 정적 렌더로도 관측되지 않는다. 그래서 판정을 순수 함수로 두고 테스트한다. `sample`일 때 그대로 두는 가드는 설정 화면 입력(`sampleCaptionWords("Korean")`)에서는 치환해도 결과가 같지만(줄당 단어 1–8 × 대문자 켬/끔 16조합 전부 동일), 설정 화면 큐를 다시 쓰지 않는다는 의도를 계약으로 남긴다.

### 2. `CaptionPreviewPlayer.tsx` — 치환 분기

import(`:15`) before → after:

```
import { firstCueText } from "../model/sample-captions";
```
```
import { firstCueText, previewCaptionCues } from "../model/sample-captions";
```

`cues` useMemo(`:45-49`) before → after:

```
  const cues = useMemo(
    () =>
      buildCaptionCues(words, clipStart, clipEnd, props.maxWords, props.uppercase),
    [words, clipStart, clipEnd, props.maxWords, props.uppercase],
  );
```
```
  const cues = useMemo(
    () =>
      // Korean 라이브 미리보기만 텍스트를 한국어 샘플로 치환한다 — 판정은 previewCaptionCues.
      previewCaptionCues(
        buildCaptionCues(words, clipStart, clipEnd, props.maxWords, props.uppercase),
        language,
        props.sample === true,
      ),
    [
      words,
      clipStart,
      clipEnd,
      props.maxWords,
      props.uppercase,
      language,
      props.sample,
    ],
  );
```

`language`는 이미 `:40`에서 구조분해돼 있고, `displayText`(`:112`)·`activeText`·`cuesRef`는 모두 이 `cues`를 읽으므로 아래 코드는 손대지 않는다. 언어 판정(`previewCaptionCues` 안)은 기존 `language === "Korean"`을 그대로 쓴다 — 폰트(`:108`)·`getPreviewFontPx`의 `EM_SCALE`·`languageDefaultMaxWords`가 전부 같은 판정이라 일관된다.

### 3. `CaptionStyleEditor.tsx` — 안내·힌트

**(a) 라이브 안내 언어별 분리(요구 ①·④)** — `:317-324` else 분기를 language 중첩 삼항으로. before → after:

```
        ) : (
          <p className="text-center text-[11px] text-muted-foreground">
            Live preview on your video — the whole frame is shown here. The final
            clip crops to follow whoever is speaking, so framing will differ.
            Korean clips are translated at render time — the words shown here are
            what&apos;s said in the video, in English.
          </p>
        )}
```
```
        ) : language === "Korean" ? (
          <p className="text-center text-[11px] text-muted-foreground">
            Live preview on your video — the whole frame is shown here. The final
            clip crops to follow whoever is speaking, so framing will differ. The
            Korean words shown are a sample — your captions are translated from the
            video when you generate, so the exact wording and line length will
            differ.
          </p>
        ) : (
          <p className="text-center text-[11px] text-muted-foreground">
            Live preview on your video — the whole frame is shown here. The final
            clip crops to follow whoever is speaking, so framing will differ.
          </p>
        )}
```

바깥 구조는 `{sample ? (<샘플 안내 :312-316>) : (<라이브 안내>)}`이고, 라이브 분기만 language로 다시 나눈다. 샘플 분기(`:312-316`)는 불변. 영어 라이브는 이제 "샘플/번역" 꼬리가 빠져 프레임 안내만 남는다(영어는 그려지는 단어가 곧 실전사라 번역 안내가 불필요).

**(b) Words per line Korean 힌트(요구 ③)** — Words per line 블록(`:239-276`)의 닫는 `</div>`(`:276`) 직전에:

```jsx
            {language === "Korean" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                For Korean, this counts English source words per line before
                translation.
              </p>
            )}
```

**(c) Letter case Korean 힌트(요구 ②)** — Letter case 블록(`:278-290`)의 Uppercase 버튼(`:282-289`) 아래, 닫는 `</div>`(`:290`) 직전에:

```jsx
            {language === "Korean" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Korean text isn&apos;t affected — only English words mixed into a
                line are uppercased.
              </p>
            )}
```

이 두 힌트는 편집기 공통이라 라이브(검토 다이얼로그)·샘플(설정 화면) 두 화면 모두에서 `language === "Korean"`일 때 나온다 — 의도된 일관성이다.

### 4. `review-language-notice.ts` — 교차 서술 주석(요구 ④ 판정)

판정: FEAT-49 뒤 CaptionStyleEditor 라이브 미리보기는 Korean에서 **한국어 샘플**을 그리는데, 이 카드 안내(`reviewLanguageNotice`)는 여전히 카드 본문 `previewText`(영어 원문)를 설명한다. 두 안내가 더는 같은 것을 말하지 않으므로 `:10`의 "라이브 미리보기 안내와도 일관된다"는 서술이 오해를 부른다 → **주석 한 곳만** 고친다(반환 문구 `:19`는 불변, 그래서 `review-language-notice.test.mjs`도 불변).

before(`:10-12`):

```
// 문장 안의 언어명도 값("Korean")이 맞고, CaptionStyleEditor의 라이브 미리보기 안내와도
// 일관된다. English·nullish/공백은 안내 없음(null) — 영어 전사가 곧 최종 자막이라
// 오독 여지가 없다. "English"만 제외하므로 향후 언어가 늘어도 자동으로 커버된다.
```
after:

```
// 문장 안의 언어명도 값("Korean")이 맞다. 이 안내는 카드 본문(previewText=영어 원문) 몫이다
// — 캡션 스타일 미리보기는 FEAT-49 뒤 한국어 샘플을 그려 카드 본문과 다르다.
// English·nullish/공백은 안내 없음(null) — 영어 전사가 곧 최종 자막이라
// 오독 여지가 없다. "English"만 제외하므로 향후 언어가 늘어도 자동으로 커버된다.
```

### Uppercase — 비활성화가 아니라 "표기"를 택한 이유

요구 ②는 "비활성화 또는 표기(택일)"다. **표기**를 택한다.

- 실렌더에서 대문자는 한글에 완전 무효가 아니다 — 줄에 섞인 라틴 문자를 대문자화한다(`main.py:583-585`). 비활성화하면 "아무 효과 없음"이라는 틀린 신호를 준다.
- 프리셋이 `uppercase`를 담고(`constants.ts:157`·`:169` `uppercase: true`), `matchPresetId`가 그 값을 비교한다(`caption-presets.ts:16-21`). 버튼만 비활성화하면 프리셋으로는 여전히 `uppercase: true`가 들어가는데 사용자가 그것을 끌 길이 없어 **컨트롤 표면이 불일치**한다.
- 이미 저장된 `uppercase: true` 값도 비활성 버튼이 "켜짐"으로 표시되며 해제 불가 상태로 갇힌다.

표기(힌트)는 저장·프리셋·해제 경로를 전혀 건드리지 않고 진실만 알린다. 샘플이 순수 한글이라 미리보기의 대문자 CSS(`CaptionPreviewPlayer.tsx:155`)는 자연히 무효가 되어(요구 ②의 "미리보기 쪽 변화 없음"), 힌트가 그 이유를 설명한다.

### 결합 주의(코드 아님, 착수 전 확인)

- **BUG-14**가 Korean 큐 묶기(`buildCaptionCues`/백엔드 묶기)를 바꾸면 큐 타이밍·개수가 바뀌고, `koreanSampleCues`는 그 큐를 그대로 후처리하므로 자동으로 따라간다 — `koreanSampleCues` 자체는 재작업 불필요.
- **FEAT-44**는 이 폴더의 `main.py:\d+` 주석을 앵커로 바꾼다. 이 항목은 그 주석을 건드리지 않는다 — 위 스케치의 새 주석은 `main.py`를 함수명(`create_korean_subtitles_with_ffmpeg`)으로만 가리키고 새 줄번호 인용을 만들지 않는다 — FEAT-44 결정(교차 파일 줄번호 인용은 곧 낡는다)을 따르며, 그래서 FEAT-44의 교체 대상을 늘리지 않는다(동시 진행 안 함, 게이트① 기록). `review-language-notice.ts` 주석 편집도 `main.py:\d+` 인용 줄이 아니라 별개 서술이라 FEAT-44 대상과 겹치지 않는다.

## 테스트

- **덮는 것**: `sample-captions.test.mjs`에 새 `describe` 둘. `import`에 `koreanSampleCues`·`previewCaptionCues` 추가.
  - `describe("koreanSampleCues")`:
    - 빈 큐 → `[]`.
    - 각 큐의 `start`/`end` 타이밍 보존(예: `{start:1.5,end:2.5}` 그대로).
    - 큐의 영어 단어 수만큼 한국어 토큰(예: `text:"one two three"` → `"지금 자막 스타일을"`, 이어지는 `text:"four"` → `"원하는"` — cursor 연속).
    - `KR_WORDS` 9개 소진 후 wrap(9단어 큐 → 전부, 다음 1단어 큐 → `"지금"`).
    - 결과가 한글 토큰만(영어 누출 없음) — `/[가-힣]/u` 존재, 원본 영어와 불일치.
  - `describe("previewCaptionCues")`:
    - Korean·라이브(`sample` false) → 치환: `[{start:0,end:1,text:"We shipped it"}]` → 텍스트 `"지금 자막 스타일을"`, 타이밍 보존. 치환 누락을 잡는다.
    - English·라이브 → 입력 그대로(`deepEqual`, 텍스트 `"We shipped it"`). English 회귀를 잡는다.
    - Korean·샘플(`sample` true) → 입력 그대로(`deepEqual`). 설정 화면 큐를 다시 쓰지 않는다는 계약.
  - 예상 증가: **tests 154 → 162(+8), suites 35 → 37(+2)**.
- **못 덮는 범위**: 
  - 실제 Korean 업로드 검토 화면에서 샘플 문장의 **크기·줄 길이가 실제 렌더 클립과 대략 비슷해 보이는지**는 배포 후 육안 대조다(DOM 렌더·재생 타이밍은 Node 러너 밖).
  - 샘플 한 줄 길이는 "영어 원문 N단어 = 한국어 N토큰"으로 근사한 것이라 **실제 번역 길이와 다르다**(한국어 어절 수는 영어 단어 수와 일치하지 않는다). "화면 차지"는 근사값이다.
  - 실렌더가 줄에 섞인 영문을 대문자화하는 효과(`main.py:583-585`)는 순수 한글 샘플에는 나타나지 않는다 — 미리보기가 그 부분 효과까지 재현하지는 않는다.
  - 치환 판정은 `previewCaptionCues` 테스트가 덮는다. 다만 플레이어가 그 함수에 실제 `language`·`sample`을 넘기는지(배선)와 재생 중 한국어 샘플이 큐 시각에 맞춰 바뀌는지는 `<video>` 재생 state라 러너·정적 렌더로 못 덮는다 — 인수 때 diff ↔ 스케치 대조와 배포 후 육안 몫이다. 안내·힌트 문구가 옳은 소비자에 뜨는지는 정적 렌더(`renderToStaticMarkup`)로 확인할 수 있다.

## 범위 밖 의존

없음. 수정 대상 5개 파일은 전부 `apps/web/src/` 안이다(`features/caption-style`와 `widgets/clip-draft-review/model` — 후자는 area 밖이지만 담당 워크스페이스 안, 주석 한 줄뿐). `apps/backend/main.py`는 인용만 하고 수정하지 않는다.

## 대안

- **고정 한국어 문장 배열을 큐마다 순환**(예: `KR_SAMPLE_LINES[i % N]`): 자연스럽게 읽히지만 (1) 새 상수가 필요해 "두 벌을 만들지 않는다"와 어긋나고, (2) Words per line을 바꿔도 줄 길이가 반응하지 않아 요구 ③(줄당 단어의 Korean 의미)을 시각적으로 못 보여준다. `KR_WORDS` 단어 수 매칭 방식은 두 문제를 모두 피한다 — 채택.
- **Korean일 때 Uppercase 버튼 비활성화**: 위 「Uppercase」 절 근거로 기각(부분 효과를 지우고, 프리셋·저장값과 컨트롤이 불일치).
- **치환 판정을 플레이어 `useMemo` 안 삼항으로 두기**(초안): 코드는 짧지만 English 회귀·치환 누락을 어떤 테스트도 잡지 못한다(라이브 캡션 텍스트는 정적 렌더로도 관측 불가) — 기각, `previewCaptionCues`로 뺀다.
