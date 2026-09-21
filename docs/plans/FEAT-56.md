# FEAT-56: FEAT-52·53이 남긴 죽은 코드 여섯 정리

agent: web-dev

> 백로그 `source`가 여섯 잔재를 `파일:줄`로 지목했다. 아래 「현재 동작」의 인용은
> 계획 작성 시점에 각 줄을 다시 읽어 확인했다. **area 필드가 관측 6의 파일 하나를 빠뜨린다** —
> 보드 area는 `widgets/clip-draft-review + features/clip-review + features/caption-style + shared/config/constants.ts`이고
> (`features/caption-style`는 게이트① 때 메인 루프가 백로그 원본에 더한 것이다 — 관측 5의 3파일이 거기 있다),
> 관측 6의 `shared/config/caption-style-schema.ts`만 `shared/config/` 아래 다른 파일이라 이름이 빠져 있다.
> `apps/web/src` 안이라 web-dev 쓰기 범위 내다. area 값 자체는 고치지 않는다.

## 현재 동작

여섯 잔재는 모두 FEAT-52(검토 화면 캡션 스타일 제거)·FEAT-53(`ClipDraft.captionStyle` 컬럼 drop, 완료·DB 적용 2026-09-19)의 삭제가 남긴 것이다.

**① `playUrl` prop — 소비자 0**
- `widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx:38` `  playUrl: string | null;`(props 타입), `:54` `  playUrl,`(구조분해). 본문 어디서도 `playUrl`을 읽지 않는다(전문 확인 — 38·54에만 등장).
- `widgets/clip-draft-review/ui/index.tsx:454` `              playUrl={readyPlayUrl}`가 이 prop에 값을 넘기는 유일한 지점이다. `npm run check`가 `ClipDraftCard.tsx 54:3 'playUrl' is defined but never used.` 경고를 낸다(경고라 EXIT 0 유지).
- `readyPlayUrl`은 죽지 않았다 — `ui/index.tsx:100-101`이 선언하고 `:228` `  }, [readyPlayUrl]);`이 재생 이펙트 의존성으로 쓴다. 위젯 본체 플레이어는 `:403` `{playUrlState.status === "ready" && (`로 `playUrlState`를 직접 쓴다.

**② 사라진 코드를 가리키는 주석 3곳** — `widgets/clip-draft-review/model/use-clip-draft-review.ts`
- `:128-131` 낙관적 `setQueryData` 객체 안 주석 `// captionStyle은 의도적으로 낙관 반영하지 않는다. 헤더 카운트와 / // Generate 가드는 selected/start/end만 소비하며, 스타일은 / // onSettled의 invalidate가 서버 값으로 재동기화한다.` — 그 객체(`:123-131`)는 이제 `startSeconds`·`endSeconds`·`selected`만 설정하고 `captionStyle` 필드는 `ClipDraft`에 없다(FEAT-53 drop).
- `:206` `  // 전체 선택/해제. applyStyleMutation과 같은 순차 루프 패턴을 따르되,` — `applyStyleMutation`은 FEAT-52가 삭제했다.
- `:216` `      // applyStyleMutation과 동일하게 대상 전체를 무조건 저장한다.` — 동일.

**③ 소비자 0인 재수출** — `CaptionStyleInput`
- `features/clip-review/index.ts:7` `export type { CaptionStyleInput } from "./model/schemas";`(배럴 재수출).
- `features/clip-review/model/schemas.ts:12` `export type { CaptionStyleInput } from "~/fsd/shared/config/caption-style-schema";`(그 배럴의 상류 재수출).
- 정의는 `shared/config/caption-style-schema.ts:44` `export type CaptionStyleInput = CaptionStyle;`에 있다. `apps/web` 전역 grep 결과 `CaptionStyleInput`은 이 **세 줄(정의 1 + 재수출 2)에만** 나온다 — 임포트 소비자 0. 배럴의 유일한 임포터 `use-clip-draft-review.ts:10-15`는 `addCustomClipDraft·getTranscript·saveClipDraftEdit·TranscriptWord`만 가져간다.

**④ 부분적으로만 고친 문장** — `shared/config/constants.ts:114`
- `CaptionStyle` 타입 doc(`:110-116`)의 마지막 줄 `* 렌더 디스패처의 JSON 캐스팅, 검토 UI가 전부 이 타입 하나를 참조한다.` — `widgets/clip-draft-review` 전역에서 `CaptionStyle`은 주석 속 `CaptionStyleEditor` 언급(`ui/index.tsx:279,423`)뿐이고 타입 참조는 0이다. "검토 UI"는 더는 `CaptionStyle`을 참조하지 않는다.

**⑤ 도달 불가가 된 라이브 미리보기 경로**
- `CaptionStyleEditor`(`features/caption-style/ui/CaptionStyleEditor.tsx`)의 렌더 소비자는 전수 확인 시 `pages/settings/ui/index.tsx:260` **하나뿐**이고(배럴 `features/caption-style/index.ts:1` 외 실사용 0), `:263` `sample`(불리언 축약 = `true`)·`:264` `playUrl={null}`을 고정 전달한다. `sample` prop 기본값은 `CaptionStyleEditor.tsx:77` `sample = false`.
- 그래서 `sample`이 항상 `true` → `CaptionStyleEditor.tsx:336-354`의 삼항 `{sample ? (샘플 안내) : language === "Korean" ? (라이브 KR 안내) : (라이브 EN 안내)}`에서 else 두 가지(`:341-354`)가 도달 불가다.
- `sample-captions.ts:89-95` `previewCaptionCues`는 `:94` `return language === "Korean" && !sample ? koreanSampleCues(cues) : cues;`인데 호출부(`CaptionPreviewPlayer.tsx:48-52`)가 `props.sample === true`를 넘기므로 `!sample`이 상시 false → `:70` `koreanSampleCues`가 호출되지 않고 `previewCaptionCues`는 항상 `cues`를 그대로 반환한다(항등).
- `previewCaptionCues`·`koreanSampleCues` 사용처는 전역 grep 상 `CaptionPreviewPlayer.tsx:15,48`·`sample-captions.test.mjs`·정의뿐이다.
- ⚠️ 이 잔재는 lint로 안 잡힌다 — `sample`은 `CaptionStyleEditor.tsx:331` `sample={sample}`, `CaptionPreviewPlayer.tsx:125` `displayText`에서 여전히 "쓰이는" prop이다.
- `sample-captions.test.mjs`는 `firstSampleCueText`(`:13-51`, 6케이스)·`koreanSampleCues`(`:55-92`, 5케이스)·`previewCaptionCues`(`:96-117`, 3케이스) 세 describe를 갖는다. `koreanSampleCues`·`previewCaptionCues` describe의 8케이스가 도달 불가가 된 계약을 지킨다.

**⑥ 없어진 컬럼을 세는 공용 검증기 주석** — `shared/config/caption-style-schema.ts:7-8`
- `:7` `// User.defaultCaptionStyle / UploadedFile.captionStyle / ClipDraft.captionStyle JSON의` · `:8` `// 공용 검증기. 세 컬럼이 같은 CaptionStyle 모양을 공유하므로 하위 레이어(shared)에 둬` — FEAT-53이 `ClipDraft.captionStyle`을 drop해 컬럼은 **둘**(`User.defaultCaptionStyle`·`UploadedFile.captionStyle`)이다. FEAT-53은 완료·DB 적용 상태라 "둘"이 지금 참이다(백로그 ⚠️ 순서 조건 충족).

## 문제

백로그 `source`가 지목한 문제: FEAT-52·53의 삭제가 **삭제로 죽는 식별자·주석**을 남겼고(계획서 「고칠 파일」이 *추가·수정*만 열거하고 삭제 잔재는 열거하지 않았으며, 검증도 스케치가 *쓰는* 식별자만 대조해 같은 구멍을 지났다), 그중 하나(⑤ 라이브 미리보기 경로)는 `sample`·`playUrl`이 타입상 여전히 쓰이는 prop이라 lint조차 못 잡는다. 위 「현재 동작」에서 여섯을 `파일:줄`로 재확인했고 백로그의 지목과 코드가 일치한다. 목표는 **동작 무변경** — 실제로 렌더되는 마크업·저장되는 값·발신되는 계측이 하나도 달라지지 않게, 도달 불가·거짓이 된 것만 제거한다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | ① `playUrl` props 타입(`:38`)·구조분해(`:54`) 제거 |
| `widgets/clip-draft-review/ui/index.tsx` | ① `<ClipDraftCard>`의 `playUrl={readyPlayUrl}`(`:454`) 제거 |
| `widgets/clip-draft-review/model/use-clip-draft-review.ts` | ② 죽은 주석 3곳 제거·재작성(`:128-131`·`:206`·`:216`) |
| `features/clip-review/index.ts` | ③ `CaptionStyleInput` 배럴 재수출(`:7`) 제거 |
| `features/clip-review/model/schemas.ts` | ③ 고아가 된 `CaptionStyleInput` 상류 재수출(`:12`) 제거 |
| `shared/config/constants.ts` | ④ `CaptionStyle` doc(`:114`)에서 "검토 UI가" 제거 |
| `features/caption-style/ui/CaptionStyleEditor.tsx` | ⑤ 삼항(`:336-354`)을 샘플 안내만 남기고 축약, 주석(`:333-335`) 갱신 |
| `features/caption-style/model/sample-captions.ts` | ⑤ `koreanSampleCues`(`:70-83`)·`previewCaptionCues`(`:89-95`) 제거, `KR_WORDS` 주석(`:7-10`) 갱신 |
| `features/caption-style/ui/CaptionPreviewPlayer.tsx` | ⑤ `previewCaptionCues` 호출을 `buildCaptionCues` 직접 호출로, import(`:15`)·useMemo deps(`:53-61`)·주석(`:47`) 정리 |
| `features/caption-style/model/sample-captions.test.mjs` | ⑤ `koreanSampleCues`·`previewCaptionCues` describe(8케이스) 제거, import 정리 |
| `shared/config/caption-style-schema.ts` | ⑥ 주석(`:7-8`) "세 컬럼"→"두 컬럼", `ClipDraft.captionStyle` 제거 |

여기 없는 파일은 구현 단계에서 고치지 않는다.

## 구현 스케치

전부 삭제·주석 정정이라 새 순수 함수는 없다. 바뀌는 줄만 before/after로 적는다.

**① `playUrl` prop** — `ClipDraftCard.tsx`

`:37-38` (props 타입, before):
```tsx
  isBudgetFull: boolean;
  playUrl: string | null;
}
```
after:
```tsx
  isBudgetFull: boolean;
}
```
`:53-55` (구조분해, before):
```tsx
  isBudgetFull,
  playUrl,
}: ClipDraftCardProps) {
```
after:
```tsx
  isBudgetFull,
}: ClipDraftCardProps) {
```
`index.tsx:452-454` (before):
```tsx
              isOverlapping={overlappingDraftIds.has(draft.id)}
              isBudgetFull={budget.isFull}
              playUrl={readyPlayUrl}
```
after (마지막 두 prop 뒤 줄 제거):
```tsx
              isOverlapping={overlappingDraftIds.has(draft.id)}
              isBudgetFull={budget.isFull}
```
`readyPlayUrl`(`:100-101`)·의존성 사용(`:228`)은 유지한다.

**② 죽은 주석 3곳** — `use-clip-draft-review.ts`

`:123-132` (before):
```ts
              ? {
                  ...draft,
                  startSeconds: input.startSeconds,
                  endSeconds: input.endSeconds,
                  selected: input.selected,
                  // captionStyle은 의도적으로 낙관 반영하지 않는다. 헤더 카운트와
                  // Generate 가드는 selected/start/end만 소비하며, 스타일은
                  // onSettled의 invalidate가 서버 값으로 재동기화한다.
                }
              : draft,
```
after (주석 3줄만 제거):
```ts
              ? {
                  ...draft,
                  startSeconds: input.startSeconds,
                  endSeconds: input.endSeconds,
                  selected: input.selected,
                }
              : draft,
```
`:206` (before): `  // 전체 선택/해제. applyStyleMutation과 같은 순차 루프 패턴을 따르되,`
after: `  // 전체 선택/해제. 순차 루프로 대상 전체를 저장하되,`

`:216` (before): `      // applyStyleMutation과 동일하게 대상 전체를 무조건 저장한다.`
after: `      // 그래서 대상 전체를 무조건 저장한다.`

**③ 죽은 재수출** — `CaptionStyleInput`

`features/clip-review/index.ts:6-8` (before):
```ts
export { captionStyleSchema } from "./model/schemas";
export type { CaptionStyleInput } from "./model/schemas";
export type { TranscriptWord } from "./model/transcript";
```
after:
```ts
export { captionStyleSchema } from "./model/schemas";
export type { TranscriptWord } from "./model/transcript";
```
`features/clip-review/model/schemas.ts:11-12` (before):
```ts
export { captionStyleSchema };
export type { CaptionStyleInput } from "~/fsd/shared/config/caption-style-schema";
```
after (재수출 유지 대상은 `captionStyleSchema` 하나 — `caption-presets.test.mjs:7`이 딥 임포트로 소비):
```ts
export { captionStyleSchema };
```
`:8-10` 주석은 `captionStyleSchema` 재수출을 계속 설명하므로 그대로 둔다(`CaptionStyleInput`을 명시하지 않아 거짓이 되지 않는다). `shared/config/caption-style-schema.ts:44`의 정의는 손대지 않는다.

**④ 부분 정정 문장** — `constants.ts:114`

before: `* 렌더 디스패처의 JSON 캐스팅, 검토 UI가 전부 이 타입 하나를 참조한다.`
after: `* 렌더 디스패처의 JSON 캐스팅이 전부 이 타입 하나를 참조한다.`

**⑤ 라이브 미리보기 경로**

`CaptionStyleEditor.tsx:333-354` (before):
```tsx
        {/* 못 닫는 근사 둘을 말한다: 미리보기는 전체 프레임(resize 모드)을 보여주지만
            실렌더는 화자를 따라 크롭하고, 한국어는 렌더 시 번역되므로 여기선 영어 원문이다.
            정지 샘플(설정 화면)은 사용자 영상·전사가 없으므로 다른 안내를 낸다. */}
        {sample ? (
          <p className="text-center text-[11px] text-muted-foreground">
            This is a sample. Your clips use your own video and words — here
            you&apos;re setting the size, color, position, and words per line.
          </p>
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
after (도달하는 `sample` 분기만 남긴다 — 문구는 그대로):
```tsx
        {/* 정지 샘플 안내: 실제 클립은 사용자 영상·전사를 쓴다. */}
        <p className="text-center text-[11px] text-muted-foreground">
          This is a sample. Your clips use your own video and words — here
          you&apos;re setting the size, color, position, and words per line.
        </p>
```
`sample` prop은 `:331` `sample={sample}` 전달과 `CaptionPreviewPlayer.tsx:125`에서 계속 쓰이므로 prop 자체는 남긴다.

`sample-captions.ts:65-95` (before) — `koreanSampleCues`(주석 `:65-69` 포함)와 `previewCaptionCues`(주석 `:85-88` 포함)를 통째로 제거한다. `firstCueText`(`:42-45`)·`firstSampleCueText`(`:47-63`)·`sampleCaptionWords`·`SAMPLE_CAPTION_CLIP_END`는 유지.

`sample-captions.ts:7-10` (before):
```ts
// 각 단어 {start:i, end:i+0.9}. maxWordsPerLine 최댓값(8, MAX_WORDS_RANGE.MAX)까지
// 한 줄을 채울 수 있도록 언어마다 9단어를 둔다. KR_WORDS는 두 소비자가 공유한다:
// 설정 화면 정지 샘플(sampleCaptionWords로 타이밍을 붙여 buildCaptionCues에 넣음)과,
// koreanSampleCues가 라이브 Korean 미리보기의 큐 텍스트를 채우는 어휘. 새 상수를 만들지 않는다.
```
after:
```ts
// 각 단어 {start:i, end:i+0.9}. maxWordsPerLine 최댓값(8, MAX_WORDS_RANGE.MAX)까지
// 한 줄을 채울 수 있도록 언어마다 9단어를 둔다. KR_WORDS는 설정 화면 정지 샘플이
// sampleCaptionWords로 타이밍을 붙여 buildCaptionCues에 넣는 어휘다.
```

`CaptionPreviewPlayer.tsx:15` (before): `import { firstCueText, previewCaptionCues } from "../model/sample-captions";`
after: `import { firstCueText } from "../model/sample-captions";`

`CaptionPreviewPlayer.tsx:45-62` (before):
```tsx
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
after (`previewCaptionCues`는 `sample=true`에서 항상 항등이었으므로 `buildCaptionCues` 결과와 동치. 더는 memo가 `language`·`props.sample`을 읽지 않으므로 deps에서 뺀다):
```tsx
  const cues = useMemo(
    () =>
      buildCaptionCues(words, clipStart, clipEnd, props.maxWords, props.uppercase),
    [words, clipStart, clipEnd, props.maxWords, props.uppercase],
  );
```
`language`는 폰트(`:117`)·글꼴군(`:120-121`)에서 계속 쓰이고, `props.sample`은 `:125` `displayText`에서 계속 쓰이므로 두 prop·구조분해는 남는다. `playUrl` 기반 재생 이펙트(`:77-114`)·`<video>` 마크업(`:132-153`)은 이 항목 범위 밖이라 손대지 않는다(「대안」 참조).

`sample-captions.test.mjs:4-8` (before):
```js
import {
  firstSampleCueText,
  koreanSampleCues,
  previewCaptionCues,
} from "./sample-captions.ts";
```
after:
```js
import { firstSampleCueText } from "./sample-captions.ts";
```
`koreanSampleCues` describe(`:53-92`)와 `previewCaptionCues` describe(`:94-117`)를 통째로 제거한다(총 8 `it`). `firstSampleCueText` describe(`:13-51`, 6 `it`)는 유지.

**⑥ 컬럼 수 주석** — `caption-style-schema.ts:7-8`

before:
```ts
// User.defaultCaptionStyle / UploadedFile.captionStyle / ClipDraft.captionStyle JSON의
// 공용 검증기. 세 컬럼이 같은 CaptionStyle 모양을 공유하므로 하위 레이어(shared)에 둬
```
after:
```ts
// User.defaultCaptionStyle / UploadedFile.captionStyle JSON의
// 공용 검증기. 두 컬럼이 같은 CaptionStyle 모양을 공유하므로 하위 레이어(shared)에 둬
```

## 테스트

- **덮는 것**: `sample-captions.test.mjs`의 `firstSampleCueText`(6케이스)는 도달하는 `sample` 경로를 계속 지킨다. `koreanSampleCues`·`previewCaptionCues` describe(8케이스)는 도달 불가가 된 계약이라 함수와 함께 제거한다(백로그 요구 ③의 판정: 계약이 도달 불가가 됐으므로 케이스도 정리 대상). 이 항목은 새 순수 함수를 만들지 않으므로 새 테스트는 없다 — 남은 스위트가 전부 통과하는 것으로 삭제의 무해함을 본다.
  - **착수 기준선(백로그 요구 ④)**: 보드상 마지막 web 변경 FEAT-52 결과 `test 178/0(파일25)`, CLAUDE.md `42 suite`. 이후 web 변경 없음(FEAT-55는 backend 전용). 구현은 착수 시 `npm test -w apps/web`로 `tests 178 / suites 42 / files 25`를 재실측해 확정한 뒤 편집한다.
  - **기대 변화**: `it` 8개 제거 → **tests 178 → 170**. describe 2개(`koreanSampleCues`·`previewCaptionCues`) 제거 → **suites 42 → 40**(러너 실측으로 확정). 파일은 `firstSampleCueText`가 남아 **25 불변**. 구현 스케치와 다른 실측이 나오면 그 사실을 구현 보고에 남긴다.
- **못 덮는 범위**: `npm test`는 Node 내장 러너라 DOM·React 렌더가 없다.
  - "sample=false로 도달하는 경로가 0"(요구 ②b)은 소비자 전수 열거(정적, 위 「현재 동작」⑤)로 보인다 — 러너가 아니라 grep/코드리딩의 몫.
  - 검토 카드·설정 화면·미리보기 플레이어의 실제 렌더 마크업 무변경은 배포 후 육안.
  - `npm run check`의 경고 0(요구 ②a)은 lint 게이트(`check`)의 몫이며 `test`가 아니다.

## 범위 밖 의존

없음. 대상 11파일이 전부 `apps/web/src` 안이라 web-dev 쓰기 범위 내다. 백로그 ⑥의 순서 조건(FEAT-53 이후)은 FEAT-53 완료·DB 적용(2026-09-19)으로 이미 충족돼 "두 컬럼"이 지금 참이다.

(참고 — 게이트: 요구 ②a `npm run check -w apps/web` 경고 0, ②b sample=false 경로 0의 소비자 전수 열거. 둘 다 web-dev 검증 범위 안이다.)

## 대안

- **③ 재수출 범위**: 백로그는 배럴 줄(`index.ts:7`)만 지목했다. 그 줄만 지우면 `schemas.ts:12`가 소비자 0인 고아 재수출로 남는다(`CaptionStyleInput`은 전역에서 정의 1 + 재수출 2뿐). 완전한 죽은 코드 제거를 위해 두 재수출을 함께 지운다. 정의(`shared:44`)와 `captionStyleSchema` 재수출(딥 임포트 소비자 있음)은 손대지 않는다.
- **⑤ 절단 깊이**: (A) 지목된 분기만 지우고 `previewCaptionCues`를 `return cues` 항등으로 남기는 안 — 무의미한 함수가 새 잔재로 남아 기각. (B) `sample`·`playUrl` prop과 `CaptionPreviewPlayer`의 영상 재생 machinery(`playUrl !== null` 경로)까지 전부 제거하는 안 — `playUrl`은 현재도 항상 null이라 그 machinery도 도달 불가지만, 백로그 ⑤는 `sample=false` 경로로 범위를 한정했고(요구 ②b) ⚠️ 주석이 `sample`·`playUrl`을 "타입상 쓰이는 prop"으로 남긴다고 명시했다. 폭이 크고 FEAT-54(설정 언어 토글을 편집 대상 전환으로 승격)의 영역에 닿아 기각. 채택: `sample=false` 기반 죽은 코드(라이브 안내 둘 + `koreanSampleCues` + `previewCaptionCues`)만 제거하고 `playUrl` 파라미터화 machinery는 그대로 둔다.
  - **`sample=false` 기반 죽은 코드 여집합(전수)**: 이 항목 적용 후 `features/caption-style`에서 `sample`에 의존하는 코드는 넷이다 — `CaptionStyleEditor.tsx:77`(기본값 `false`), `:331`(전달), `CaptionPreviewPlayer.tsx:36`(prop 타입), `:125` `const displayText = props.sample === true ? firstCueText(cues) : activeText;`. **앞 셋은 분기가 아니고, 넷째 `:125`의 `: activeText` 갈래는 도달 불가로 남는다.** 지우지 않는 이유는 그것이 **유지하기로 한 `playUrl` machinery와의 접합부**이기 때문이다 — `activeText`는 재생 이펙트가 세팅하므로 그 갈래를 지우려면 machinery도 함께 지워야 하고, 그건 위 (B)다. 즉 이 항목이 「`sample=false` 기반 죽은 코드를 전부 제거한다」고 말하지 않는다 — **셋을 제거하고 하나(`:125`)는 (B)에 딸려 남긴다.**
  - **관측(범위 밖)**: `CaptionPreviewPlayer`의 `playUrl`-기반 `<video>` 재생 경로도 현재 유일 소비자가 `playUrl={null}`이라 도달 불가다. 이 항목에서는 남기지만, `:125`의 잔여 갈래와 함께 **후속 정리 후보**로 보고한다(둘은 한 덩어리다).
