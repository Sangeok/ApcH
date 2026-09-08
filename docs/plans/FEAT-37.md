# FEAT-37: 한국어 업로드 검토 화면에 「자막은 렌더 때 번역된다」 안내

agent: web-dev

## 현재 동작

- `language`(문자열)는 검토 화면까지 온전히 전파된다. `pages/upload-detail/ui/index.tsx:42`에서 구조분해되고, `:117` `isUnderReview`일 때 `:118-124`에서 `<ClipDraftReviewSection … language={language} />`로 넘어간다.
- `widgets/clip-draft-review/ui/index.tsx:40`에서 프롭 타입은 `language: string`이며, `:433-448`의 `clipDrafts.map`에서 각 `<ClipDraftCard … language={language} />`(`:438`)로 다시 전달된다.
- 그 `language`가 현재 쓰이는 곳은 **카드 → 캡션 스타일 다이얼로그 하나뿐이다.** `ClipDraftCard.tsx:53`(`language: string;`)에서 프롭으로 받아 `:507`에서 `<CaptionStyleDialog … language={language} />`로만 넘긴다. 검토 화면 헤더·카드 본문 어디에도 언어 관련 문구가 없다.
- 검토 화면 헤더(`ui/index.tsx`)는 `:238` `<p …>Review clip plan</p>`(eyebrow) → `:243-267` h2 「N of M clips picked」+레일 → `:271-277` 「N moments suggested … Each clip uses 1 credit; you have X.」 → `:285-304` Fill/Clear 버튼 순이다. 번역 안내 줄은 없다.
- 카드 본문의 전사 미리보기는 영어 원문이다. `ClipDraftCard.tsx:113` `const previewText = wordsInRange.map((word) => word.word).join(" ");`이고 `:472-476`에서 라벨 없이 `<p className="bg-muted mt-2 line-clamp-3 rounded p-2 text-xs">{previewText}</p>`로만 렌더된다.
- "렌더 때 번역된다"는 설명은 저장소 전체에서 **「Caption style」 다이얼로그 안 11px 회색 한 줄뿐이다** — `CaptionStyleEditor.tsx:307-312`, 그 중 `:310-311` `Korean clips are translated at render time — the words here are the English source.`. 이 다이얼로그는 `ClipDraftCard.tsx:498` `setIsStyleDialogOpen(true)`로만 열리고 기본값이 닫힘(`:92` `useState<boolean>(false)`)이라, 열지 않으면 볼 수 없다.
- 번역은 렌더 단계에서만 일어난다(범위 밖, 대조용): `apps/backend/main.py:837` `elif selected_language == "Korean":` → `:840` `create_korean_subtitles_with_ffmpeg(...)`(그 안에서 `:474` Gemini 번역, 실패 시 `:535` `korean_texts = english_texts` 영어 폴백). 전사·후보 추출(analyze) 단계엔 영어 전사뿐이다. **백로그 인용 4건(`:474`·`:535`·`:837`·`:840`) 모두 실제 파일과 정확히 일치한다.**
- 언어 값의 집합: `shared/config/constants.ts:12-15` `SUPPORTED_LANGUAGES = [{ value: "English", label: "English" }, { value: "Korean", label: "한국어" }]`. DB에는 `value`가 저장되므로 `language`는 `"English"` 또는 `"Korean"`이다.
- 순수 안내 함수의 선례: `widgets/clip-display/model/subtitle-status.ts` — 상태 문자열 → 영어 안내 매핑을 `string | null`로 돌려주고, `subtitle-status.test.mjs`가 매핑·trim·nullish/공백을 덮는다. 앱 UI가 영어라 문구도 영어라는 규칙이 그 파일 주석(`:5`)에 적혀 있다.

**백로그 인용 대조(웹):** `ClipDraftCard.tsx:113`(previewText)·`:472-474`(렌더)·`CaptionStyleEditor.tsx:310-311`(안내 문구)·`ui/index.tsx`의 `Review clip plan`(실제 `:238`) — 네 곳 모두 줄 밀림 없이 일치.

## 문제

백로그가 지목한 것은 **기능 결함이 아니라 안내 부재다.** 언어 전파(폼→액션→DB→Inngest payload→백엔드)는 온전하고 번역은 설계대로 렌더 단계(`main.py:837/840`)에 있다. 그런데 검토 화면(`ui/index.tsx` 헤더·`ClipDraftCard.tsx:113/472` 본문)은 언어와 무관하게 영어 전사를 보여주면서, "지금 보는 것은 영어 원문이고 생성 때 번역된다"는 문장을 **눈에 띄는 자리에 두지 않는다.** 유일한 안내(`CaptionStyleEditor.tsx:310-311`)는 기본 닫힘 다이얼로그 안 11px 한 줄이라, 소유자조차 Korean 업로드를 열고 번역 실패로 오독했다. 즉 "Korean을 골랐다"는 기억과 "화면이 온통 영어"라는 관측 사이를 메우는 문장이 필요하다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/widgets/clip-draft-review/model/review-language-notice.ts` `(신규)` | 언어값 → 헤더 안내 문구(`string \| null`)와 영어원문 표기 여부(boolean)를 판정하는 순수 함수 2개 |
| `src/fsd/widgets/clip-draft-review/model/review-language-notice.test.mjs` `(신규)` | 위 순수 함수의 분기(비영어/영어/nullish·공백/padded/비허용 언어, 정확한 문구) 검증 |
| `src/fsd/widgets/clip-draft-review/ui/index.tsx` | `reviewLanguageNotice` 임포트 + 헤더 크레딧 줄 아래에 `language !== "English"`일 때만 안내 한 줄(①) |
| `src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | `showsEnglishSourceForTranslation` 임포트 + `previewText` 위에 "English transcript" 라벨을 같은 조건일 때만(②) |

`CaptionStyleEditor.tsx:310-311`의 기존 문구는 **유지한다(③)** — 손대지 않으므로 「고칠 파일」에 없다. 백엔드·`pages/upload-detail`·barrel `index.ts`는 건드리지 않는다.

## 구현 스케치

### 신규 순수 모듈 `model/review-language-notice.ts` (전체)

```ts
// 검토 화면은 언어 선택과 무관하게 영어 전사를 보여준다 — previewText는 wordsInRange의
// 영어 단어들이고(ClipDraftCard.tsx:113), 한국어 번역은 렌더 단계에서만 만들어진다
// (apps/backend/main.py:837 elif selected_language == "Korean" → :840
// create_korean_subtitles_with_ffmpeg, :474 Gemini 번역, 실패 시 :535
// korean_texts = english_texts 영어 폴백). 그래서 "Korean을 골랐는데 화면이 영어"라는
// 오독을 막는 안내는 English가 아닌 언어에서만 필요하다.
//
// 언어 이름은 전달된 값(SUPPORTED_LANGUAGES[].value: "English"|"Korean")을 그대로
// 문장에 넣는다 — 앱 UI가 영어라(clip-display/model/subtitle-status.ts:5 주석) 영어
// 문장 안의 언어명도 값("Korean")이 맞고, CaptionStyleEditor.tsx:310-311의 기존 문구와도
// 일관된다. English·nullish/공백은 안내 없음(null) — 영어 전사가 곧 최종 자막이라
// 오독 여지가 없다. "English"만 제외하므로 향후 언어가 늘어도 자동으로 커버된다.
export function reviewLanguageNotice(
  language: string | null | undefined,
): string | null {
  if (language == null) return null;
  const trimmed = language.trim();
  if (trimmed.length === 0 || trimmed === "English") return null;
  return `Subtitles will be translated to ${trimmed} when you generate. This review shows the English transcript.`;
}

// 이 검토 화면이 최종 자막과 다른 언어(영어 원문)를 보여주는가.
// 헤더 안내와 카드 previewText 라벨이 같은 조건으로 켜지도록 안내 존재로 판정한다 —
// "English" 리터럴을 두 곳에 두지 않는다.
export function showsEnglishSourceForTranslation(
  language: string | null | undefined,
): boolean {
  return reviewLanguageNotice(language) !== null;
}
```

### `ui/index.tsx` — 임포트 추가

기존 `../model/use-clip-draft-review` 임포트 블록(`:28-31`) 아래에 한 줄 추가한다:

```ts
import { reviewLanguageNotice } from "../model/review-language-notice";
```

### `ui/index.tsx` — 파생값 추가

`clipNoun`/`creditNoun` 계산(`:231-232`) 근처에 추가한다:

```ts
const languageNotice = reviewLanguageNotice(language);
```

### `ui/index.tsx` — 헤더 안내 줄 삽입 (①)

크레딧 안내 문단(`:271-277`) **바로 다음**, Fill/Clear 버튼 주석(`:278-`) **앞**에 삽입한다. before/after는 앵커만 표기:

before (`:277-278`):
```tsx
          </p>
          {/* 예산을 바꾸는 버튼이므로 예산 표시 옆에 둔다. 카드 목록 안에 두면
```

after:
```tsx
          </p>
          {/* 번역은 렌더 단계에서만 일어나므로(apps/backend/main.py:837/840) 검토
              화면은 영어 원문을 보여준다. 유일한 기존 안내(CaptionStyleEditor
              :310-311)는 기본 닫힘 다이얼로그 안 11px라 소유자조차 못 봤다 — 항상
              보이는 헤더에 두되, 주변 muted 산문에 묻히지 않게 bg-muted 박스로
              구분한다. English일 때 languageNotice === null이라 렌더되지 않는다. */}
          {languageNotice && (
            <p className="text-foreground bg-muted mt-2 rounded-md px-3 py-2 text-xs">
              {languageNotice}
            </p>
          )}
          {/* 예산을 바꾸는 버튼이므로 예산 표시 옆에 둔다. 카드 목록 안에 두면
```

### `ClipDraftCard.tsx` — 임포트 추가

기존 `../../model/boundary-snap` 임포트(`:24`) 아래에 추가한다:

```ts
import { showsEnglishSourceForTranslation } from "../../model/review-language-notice";
```

### `ClipDraftCard.tsx` — 파생값 추가

`previewText`(`:113`) 아래에 추가한다:

```ts
const showsEnglishSource = showsEnglishSourceForTranslation(language);
```

### `ClipDraftCard.tsx` — 미리보기 라벨 (②)

before (`:472-476`):
```tsx
      {previewText && (
        <p className="bg-muted mt-2 line-clamp-3 rounded p-2 text-xs">
          {previewText}
        </p>
      )}
```

after:
```tsx
      {previewText && (
        <div className="mt-2">
          {/* previewText는 영어 원문이다(:113). 헤더 안내가 스크롤로 벗어나도
              카드마다 이 라벨이 "지금 이 텍스트가 영어 원문"임을 되짚는다.
              헤더 안내와 같은 조건(비영어)일 때만 — 영어 업로드에선 이 텍스트가
              곧 최종 자막이라 라벨이 군말이 된다. */}
          {showsEnglishSource && (
            <p className="text-muted-foreground mb-1 text-[11px] font-medium">
              English transcript
            </p>
          )}
          <p className="bg-muted line-clamp-3 rounded p-2 text-xs">
            {previewText}
          </p>
        </div>
      )}
```

`mt-2`를 안쪽 `<p>`에서 바깥 `<div>`로 옮긴 것 외에 본문 박스 스타일(`bg-muted line-clamp-3 rounded p-2 text-xs`)은 그대로다.

**확정 문구(①):** `Subtitles will be translated to Korean when you generate. This review shows the English transcript.` — `{language}` 자리에 값("Korean")이 그대로 들어간다.
**확정 문구(②):** `English transcript`

## 테스트

- **덮는 것** (`review-language-notice.test.mjs`, `subtitle-status.test.mjs` 형식 차용):
  - `reviewLanguageNotice("Korean")` → 정확한 문구 `"Subtitles will be translated to Korean when you generate. This review shows the English transcript."` (골든 문자열 — 사용자에게 보이는 카피라 정확값이 계약이다)
  - `reviewLanguageNotice("English")` → `null`
  - `reviewLanguageNotice(null)` / `undefined` → `null`
  - `reviewLanguageNotice("")` / `"  "` → `null`
  - `reviewLanguageNotice(" Korean ")` → 위 골든 문자열(trim 존재 이유 — trim 제거 돌연변이를 잡는다. 공백 padding이 붙은 값도 안내를 내야 한다)
  - `reviewLanguageNotice("Spanish")` → 언어명이 박힌 문구(허용목록이 아니라 "English 아님"으로 판정 = 언어 추가 시 자동 커버를 못박는다)
  - `showsEnglishSourceForTranslation`이 위 각 입력에서 `reviewLanguageNotice(x) !== null`과 일치(비영어 true / 영어·nullish·공백 false) — 헤더 안내와 카드 라벨이 반드시 같은 조건으로 켜짐을 잡는다
- **못 덮는 범위**: 헤더 안내 줄과 카드 라벨의 실제 렌더/표시 여부(JSX 조건부 마크업), `language` 프롭이 page→section→card로 실제 흘러 넘어가는 런타임 값(타입은 `tsc`가 묶지만 값 전달은 아님), 헤더 레이아웃 안에서의 위치·`bg-muted` 시각 구분 — Node 내장 러너에 DOM이 없어 확인 불가. 배포 후 실물에서 Korean 업로드로 육안 확인이 필요하다.
- 신규 테스트 파일 1개가 추가되므로 구현 단계에서 `apps/web/CLAUDE.md` 테스트 목록 표에 행이 하나 필요하다(그 파일은 읽기 전용 — 직접 고치지 않고 구현 보고 `비고`에 추가할 행을 적는다).

## 범위 밖 의존

없음. 모든 변경이 `apps/web/src/fsd/widgets/clip-draft-review`(신규 `model/` 순수 모듈 + 그 슬라이스의 `ui/`) 안에서 닫힌다. 슬라이스 내부 상대 임포트(`../model/…`·`../../model/…`)만 쓰고 barrel(`index.ts`)이나 레이어 경계를 새로 넘지 않는다(FSD 규칙·FEAT-33/34 경계 검출과 무충돌). 백엔드 번역 동작은 그대로 두고 대조용으로만 인용한다.

백로그의 「범위 밖 의존」 (a)·(c)는 이 계획의 대상이 아니며 그대로 남는다 — (a) 검토 단계 사전 번역은 backend analyze에 Gemini 호출을 더하는 별 항목, (c) 실제 이 업로드의 「Generate」 후 자막이 영어면 폴백 조사는 별개의 백엔드 작업. 둘 다 `packages/db`·다른 워크스페이스가 아니라 **범위 밖 기능**이므로 여기서 손대지 않는다.

## 대안

- **백로그 (b) 업로드 상세 페이지(`pages/upload-detail`) 상단 안내 추가** — 택하지 않는다. 검토 위젯 헤더의 안내는 검토 화면이 열려 있는 동안 항상 보이고, 오독이 일어나는 지점이 바로 그 화면이다. 페이지 상단에 또 하나의 배너를 두면 같은 문장이 중복된다. (백로그가 "계획 단계 판단"으로 남긴 결정.)
- **카드 라벨(②)을 언어와 무관하게 항상 표시** — 택하지 않는다. 영어 업로드에서는 previewText가 곧 최종 자막이라 "English transcript" 라벨이 군말이 된다. 헤더 안내와 같은 비영어 조건으로 묶어 두 표시가 일관되게 켜지고 꺼지게 한다.
- **문장에 값("Korean") 대신 라벨("한국어") 사용** — 택하지 않는다. 앱 UI가 영어이고(`subtitle-status.ts:5`) 기존 카피(`CaptionStyleEditor.tsx:310` "Korean clips …")가 값을 쓰므로, 영어 문장 안에 "한국어"를 박으면 어긋난다.
- **안내를 eyebrow "Review clip plan"(`:238`) 바로 아래(h2 위)에 삽입** — 택하지 않는다. eyebrow→h2→count 묶음이 갈라진다. 크레딧 문단 아래에 두고 `bg-muted` 박스로 구분하면 grouping을 깨지 않으면서도 눈에 띈다(원래 안내의 비가시성은 위치가 아니라 "닫힌 다이얼로그 안"이 원인이었고, 헤더는 항상 보인다).
