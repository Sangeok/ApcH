# FEAT-48: 검토 카드에 참고 번역을 저장·표시 — 영어 원문 아래 한국어 번역 블록

agent: web-dev

> 선행: FEAT-47(컬럼, 완료·`71bf498`) · FEAT-46(백엔드 적재, 완료·배포). 표시 가치는 FEAT-46 배포 뒤 Korean 업로드에서만 난다 — 그 전엔 전부 null이다.

## 현재 동작

콜백 moment는 **이름을 댄 필드만** 통과한다. 계약 정본은 `src/inngest/modal-contract.ts`다.
- `modal-contract.ts:59` `export type AnalyzedMoment = {` — 필드는 `index`·`startSeconds`·`endSeconds`·`clipType?`·`hook?`·`payoff?` 여섯(`:60-65`). 번역 필드 없음.
- `modal-contract.ts:68` `export type RawAnalyzedMoment = {` — 백엔드 원본(camel/snake 혼재). 역시 번역 필드 없음(`:69-77`).
- `modal-contract.ts:173` `export function normalizeAnalyzedMoment(` — 반환에서 `clipType`/`hook`/`payoff`만 복사한다(`:197` `clipType: toNullableString(raw.clipType ?? raw.clip_type),`, `:198` `hook: toNullableString(raw.hook),`, `:199` `payoff: toNullableString(raw.payoff),`). 이 정규화기는 **모르는 필드를 버린다** — 반환 객체를 명시 필드로만 짓는다(`:193-200`).

두 경로가 이 계약을 쓴다.
- **프로덕션(웹훅)**: `app/api/webhooks/modal/route.ts:85` `.map(normalizeAnalyzedMoment)`가 정규화한 `moments`를 `route.ts:122` `moments: body.moments,`로 `modal/video.analyzed` 이벤트에 실어 보낸다(필드 재선별 없음). Inngest는 `functions.ts:879` `analyzedMoments = analysisResult.data.moments ?? [];`로 받는다. 이벤트 스키마는 `client.ts:84` `moments?: AnalyzedMoment[];`라 계약 타입을 그대로 쓴다.
- **로컬 동기**: `functions.ts:885` `analyzedMoments = Array.isArray(modalResponse.moments)`가 응답 본문을 `AnalyzedMomentPayload[]`로 **정규화 없이** 캐스트한다(`:886`). `AnalyzedMomentPayload = Partial<AnalyzedMoment>`(`functions.ts:681`).

저장 매핑은 필드를 하나씩 옮긴다 — `functions.ts:929` `await createClipDraftsBulk(`의 인자에서 `functions.ts:938` `clipType: moment.clipType ?? null,`~`:940` `payoff: moment.payoff ?? null,`까지 셋만 매핑한다(`:941` 뒤는 `selected`·`captionStyle`로 사용자 편집값). 벌크 생성 시그니처는 `entities/clip-draft/api/index.ts:16` `export async function createClipDraftsBulk(`이고 인자는 `:17` `data: Prisma.ClipDraftCreateManyInput[],`다 — 제네릭 생성 입력 타입이라 새 스칼라(선택 필드)는 시그니처 변경 없이 받는다.

DB에는 자리가 이미 있다(FEAT-47). `packages/db/prisma/schema.prisma:188` `referenceTranslation String?`이고 주석(`:183-187`)이 의미 계약이다 — "검토 화면 읽기 보조, 렌더는 안 씀, null = English·번역 실패·커스텀 클립·이 컬럼 이전 행, 원문은 AI 구간 기준이라 구간 편집 시 낡음". 생성 클라이언트는 `71bf498`에서 재생성돼 `Prisma.ClipDraftCreateManyInput`에 `referenceTranslation?`이 있고 `ClipDraft` 결과 타입에 `referenceTranslation: string | null`이 있다.

카드는 그 값을 받을 수 있으나 그릴 자리가 없다.
- `ClipDraftCard.tsx:52` `draft: ClipDraft;`로 **전체 `ClipDraft`**를 받는다(`:4` `import type { ClipDraft } from "@repo/db";`). 상류도 전부 전체 타입이라 값이 실려 온다 — `uploaded-file/model/types.ts:47` `clipDrafts: ClipDraft[];`, `uploaded-file/api/index.ts:357` `? await db.clipDraft.findMany({`(select 없음 → 스칼라 전부), `use-clip-draft-review.ts:46` `clipDrafts: ClipDraft[],`.
- 영어 원문은 `ClipDraftCard.tsx:114` `const previewText = wordsInRange.map((word) => word.word).join(" ");`이고, `wordsInRange`(`:106-112`)는 **현재 구간**(로컬 state `startSeconds`/`endSeconds`, `:85-86`)의 단어를 이어 붙인다 — 구간을 편집하면 previewText가 즉시 바뀐다.
- 원문 블록은 `ClipDraftCard.tsx:474` `{previewText && (`~`:489` `)}`이다. 비영어일 때만 `:480-484`에 「What's said in the video (English)」 라벨(`showsEnglishSource`, `:115`)이 붙고, 원문 자체는 `:485` `<p className="bg-muted line-clamp-3 rounded p-2 text-xs">`에 온다. 번역을 둘 자리는 없다.
- AI 구간은 `draft.aiStartSeconds`/`draft.aiEndSeconds`(불변, `resetToAi`가 여기로 되돌린다 — `:137-140`). 참고 번역(FEAT-46 `build_reference_sources`)은 이 AI 구간의 단어로 만들어진다.
- 커스텀 클립은 `entities/clip-draft/api/index.ts:117` `export async function createCustomClipDraft(`가 만들며 `referenceTranslation`을 **넣지 않는다**(`:135-144` data에 없음) → 컬럼 null(요구 ④, 의도된 현재 동작).

## 문제

백로그 `source`가 지목한 문제(FEAT-46 참조): Korean 업로드 검토 화면에서 카드 본문(전사)은 영어라 소유자가 구간을 영어만 보고 골라야 한다. FEAT-46이 후보마다 참고 번역을 만들어 콜백에 실었고(`referenceTranslation`), FEAT-47이 담을 컬럼을 만들었다. 그런데 web은 그 값을 **계약에서 버리고**(위 「현재 동작」의 `normalizeAnalyzedMoment`가 명시 필드만 복사) **저장 매핑에도 넣지 않아**(`createClipDraftsBulk` 인자가 셋만 매핑) DB에 닿지 못하며, 닿더라도 카드에 **그릴 자리가 없다**.

백로그가 못박은 제약과 코드 확인:
- 요구 ①: 계약 타입 둘·정규화기·저장 매핑 **네 곳 모두** 새 필드를 지나야 한다. 하나라도 빠지면 에러 없이 null이 된다(`modal-contract.ts:1-11` 머리 주석이 경고하는 드리프트). `AnalyzedMoment.referenceTranslation`은 선택 필드라 정규화기가 복사를 빠뜨려도 **TS가 못 잡는다** — 이 지점이 "조용한 null"의 실제 구멍이다.
- 요구 ②: 원문 블록 아래 번역 블록, 라벨로 "최종 자막과 표현이 다를 수 있음"을 밝힌다(렌더는 따로 번역). null이면 블록 없음.
- 요구 ③: 번역은 AI 구간 기준이라 구간을 편집하면 낡는다. 현재 구간이 AI 구간과 다를 때의 처리(숨김 vs 라벨)를 이 계획에서 결정한다(아래 「구현 스케치」 §4).
- 요구 ④: 커스텀 클립·기존 드래프트는 null이라 블록이 없다 — 현재 동작 그대로(변경 없음).

백로그 지목과 코드 확인이 어긋나는 점: 없음.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/inngest/modal-contract.ts` | `AnalyzedMoment`·`RawAnalyzedMoment` 타입에 `referenceTranslation` 추가(요구 ① 2곳), `normalizeAnalyzedMoment` 반환에 필드 복사(요구 ① 3번째 곳) |
| `src/inngest/functions.ts` | `createClipDraftsBulk` 인자 매핑에 `referenceTranslation` 한 줄 추가(요구 ① 4번째 곳) |
| `src/fsd/widgets/clip-draft-review/model/reference-translation.ts` `(신규)` | 참고 번역 표시 판정 순수 함수 — 유무·구간 낡음(요구 ③)·라벨 골든 |
| `src/fsd/widgets/clip-draft-review/model/reference-translation.test.mjs` `(신규)` | 위 순수 함수 테스트 |
| `src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | 원문 블록 아래 참고 번역 블록 렌더(요구 ②·④) |
| `src/inngest/modal-contract.test.mjs` `(신규)` | `normalizeAnalyzedMoment`가 `referenceTranslation`을 복사/누락→null 처리하는지(요구 ①의 조용한 null 가드) |

여기 없는 파일은 고치지 않는다. `entities/clip-draft/api/index.ts`(area 밖, `createClipDraftsBulk`·`createCustomClipDraft`)는 **변경 불요**임을 따라가 확인했다 — 「범위 밖 의존」에 근거를 적는다. `app/api/webhooks/modal/route.ts`·`client.ts`도 정규화기/계약 타입의 소비자일 뿐 변경 불요다(위 「현재 동작」).

## 구현 스케치

### 1. `modal-contract.ts` — 계약 타입 둘 (요구 ① 곳 1·2)

`AnalyzedMoment` before (`:59-66`):

```ts
export type AnalyzedMoment = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  clipType?: string | null;
  hook?: string | null;
  payoff?: string | null;
};
```

after:

```ts
export type AnalyzedMoment = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  clipType?: string | null;
  hook?: string | null;
  payoff?: string | null;
  // Korean analyze 참고 번역(FEAT-46). 없으면 null. 저장 컬럼 ClipDraft.referenceTranslation.
  referenceTranslation?: string | null;
};
```

`RawAnalyzedMoment` before (`:68-78`):

```ts
export type RawAnalyzedMoment = {
  index?: number | string;
  startSeconds?: number | null;
  start_seconds?: number | null;
  endSeconds?: number | null;
  end_seconds?: number | null;
  clipType?: string | null;
  clip_type?: string | null;
  hook?: string | null;
  payoff?: string | null;
};
```

after — `hook?`/`payoff?` 두 줄 쌍은 이 파일에 **네 번** 나오므로(`ProcessVideoBackendClip`·
`RawProcessVideoBackendClip`·`AnalyzedMoment`·`RawAnalyzedMoment`) 단편이 아니라 타입 전체로 적는다:

```ts
export type RawAnalyzedMoment = {
  index?: number | string;
  startSeconds?: number | null;
  start_seconds?: number | null;
  endSeconds?: number | null;
  end_seconds?: number | null;
  clipType?: string | null;
  clip_type?: string | null;
  hook?: string | null;
  payoff?: string | null;
  // FEAT-46 attach_reference_translations는 camelCase 키만 싣는다(snake 변형 없음).
  referenceTranslation?: string | null;
};
```

**snake_case 변형을 두지 않는 이유**: 백엔드 `attach_reference_translations`(FEAT-46)는 `{**moment, "referenceTranslation": ...}`로 camelCase만 만든다. `clipType`처럼 두 이름으로 오지 않으므로 `raw.referenceTranslation` 하나만 읽는다.

### 2. `modal-contract.ts` — 정규화기 (요구 ① 곳 3)

`normalizeAnalyzedMoment` 반환 before (`:193-200`):

```ts
  return {
    index,
    startSeconds,
    endSeconds,
    clipType: toNullableString(raw.clipType ?? raw.clip_type),
    hook: toNullableString(raw.hook),
    payoff: toNullableString(raw.payoff),
  };
```

after:

```ts
  return {
    index,
    startSeconds,
    endSeconds,
    clipType: toNullableString(raw.clipType ?? raw.clip_type),
    hook: toNullableString(raw.hook),
    payoff: toNullableString(raw.payoff),
    referenceTranslation: toNullableString(raw.referenceTranslation),
  };
```

기존 `toNullableString`(`:111-113`)을 쓴다 — 문자열이 아니면 null. 프로덕션(웹훅) 경로가 이 함수를 거치므로 여기서 복사해야 값이 이벤트→Inngest→DB로 이어진다.

### 3. `functions.ts` — analyze 저장 매핑 (요구 ① 곳 4)

`createClipDraftsBulk` 인자 before (`functions.ts:938-940`):

```ts
            clipType: moment.clipType ?? null,
            hook: moment.hook ?? null,
            payoff: moment.payoff ?? null,
```

after:

```ts
            clipType: moment.clipType ?? null,
            hook: moment.hook ?? null,
            payoff: moment.payoff ?? null,
            // Korean analyze 참고 번역(FEAT-46). moment에 없으면 컬럼 null.
            referenceTranslation: moment.referenceTranslation ?? null,
```

`moment`는 `AnalyzedMomentPayload & { startSeconds: number; endSeconds: number }`(`functions.ts:903-906`)라
새 필드도 선택(`string | null | undefined`)이다 — `?? null`로 좁혀 `Prisma.ClipDraftCreateManyInput`에 맞춘다.
**이 한 줄을 지켜 주는 자동 게이트는 없다**: 계획 검증에서 이 줄만 지운 변이를 돌렸더니 `npm run check`(tsc 포함)와
전체 테스트가 **둘 다 통과**했다(선택 필드라 타입이 못 잡고, `step.run` 안 DB 호출이라 러너 밖이다).
그래서 여기 적힌 문자열이 곧 계약이다.

### 4. `reference-translation.ts` `(신규)` — 표시 판정 순수 함수 (요구 ②·③)

**요구 ③ 결정: 구간을 편집해 AI 구간과 달라지면 블록을 숨기지 않고, "AI 추천 구간 기준" 라벨로 그 사실을 밝혀 계속 보인다.** 근거:
1. **이 저장소에는 숨겨서 오독을 만든 전례가 있다** — 한국어 업로드의 검토 화면이 영어 전사만 보여 주자 소유자조차 번역 실패로 읽었고(FEAT-37), 그 오독이 `review-language-notice`의 안내 문구가 존재하는 이유다(`apps/web/CLAUDE.md` 테스트 표의 `review-language-notice.test.mjs` 행). "번역이 낡음"을 "번역 없음(블록 소멸)"으로 접으면 같은 종류의 오독을 만든다. 숨기면 사용자는 넛지 버튼을 누른 순간 블록이 이유 없이 사라지는 것을 보게 된다(편집에 집중하는 바로 그 순간).
2. 참고 번역은 방향 감각용이다 — ±0.5초 넛지로 구간이 조금 바뀌어도 그 moment가 무슨 얘기였는지는 유지된다. 라벨은 "지금 보이는 영어(현재 구간)"와 "번역(AI 구간)"이 다를 수 있음을 명시해 오독을 막는다.
3. 되돌리려면 이미 있는 `Reset to AI suggestion`(`ClipDraftCard.tsx:499-502`)이 AI 구간으로 복귀시켜 라벨이 자동으로 fresh로 바뀐다.

본문 전체(순수, DOM·React 없음):

```ts
// 참고 번역(FEAT-46 Korean analyze)의 카드 표시 판정.
// 번역은 AI 구간(aiStartSeconds~aiEndSeconds) 단어로 만들어지므로, 사용자가 현재 구간을
// 편집하면 카드에 보이는 영어 원문(현재 구간)과 번역(AI 구간)이 다른 단어를 가리킬 수 있다.
// 그래서 숨기지 않고 라벨로 "AI 추천 구간 기준"임을 밝힌다(FEAT-48 요구 ③ 결정).
// 라벨은 사용자에게 보이는 카피라 정확값이 계약이다(review-language-notice.ts 선례).

// AI 구간과 현재 구간의 차이가 이 값(초) 이하이면 "같은 구간"으로 본다.
// 화면 표기·편집 단위가 0.1초(ClipDraftCard roundTenth)라 그보다 작은 차이는 보이지 않는다.
const RANGE_MATCH_TOLERANCE_SECONDS = 0.05;

const FRESH_LABEL =
  "Korean reference — final subtitles are translated separately and may differ.";
const STALE_LABEL =
  "Korean reference for the AI-suggested range — final subtitles are translated separately and may differ.";

export interface ReferenceTranslationDisplay {
  text: string;
  label: string;
}

export function resolveReferenceTranslationDisplay(input: {
  referenceTranslation: string | null | undefined;
  aiStartSeconds: number;
  aiEndSeconds: number;
  currentStartSeconds: number;
  currentEndSeconds: number;
}): ReferenceTranslationDisplay | null {
  const { referenceTranslation } = input;
  if (referenceTranslation == null) return null;
  const text = referenceTranslation.trim();
  if (text.length === 0) return null;

  const isStale =
    Math.abs(input.currentStartSeconds - input.aiStartSeconds) >
      RANGE_MATCH_TOLERANCE_SECONDS ||
    Math.abs(input.currentEndSeconds - input.aiEndSeconds) >
      RANGE_MATCH_TOLERANCE_SECONDS;

  return { text, label: isStale ? STALE_LABEL : FRESH_LABEL };
}
```

- `null`/`undefined`/공백 → `null`(블록 없음): English 업로드·번역 실패·커스텀 클립·기존 드래프트 전부 여기로 떨어진다(요구 ②·④). `undefined`도 받는 이유는 `draft.referenceTranslation`이 `string | null`이지만 방어적으로 둔다.
- 언어 게이트를 따로 두지 않는 이유: English 경로는 컬럼이 항상 null이라(FEAT-46이 English에 필드를 안 실음 → normalizer가 null) 값 유무 판정만으로 충분하다. `showsEnglishSourceForTranslation` 같은 언어 술어를 겹치지 않아 판정 지점을 하나로 둔다.

### 5. `ClipDraftCard.tsx` — 번역 블록 렌더 (요구 ②·④)

임포트 추가(`:25` `import { showsEnglishSourceForTranslation } from "../../model/review-language-notice";` 아래):

```ts
import { resolveReferenceTranslationDisplay } from "../../model/reference-translation";
```

파생값(`:115` `const showsEnglishSource = showsEnglishSourceForTranslation(language);` 아래):

```ts
  const referenceTranslationDisplay = resolveReferenceTranslationDisplay({
    referenceTranslation: draft.referenceTranslation,
    aiStartSeconds: draft.aiStartSeconds,
    aiEndSeconds: draft.aiEndSeconds,
    currentStartSeconds: startSeconds,
    currentEndSeconds: endSeconds,
  });
```

렌더: 원문 블록(`:474-489` `{previewText && (...)}`)의 닫는 `)}` **바로 아래**에 형제로 추가한다. 마크업은 원문 블록의 라벨(`:481` `text-muted-foreground mb-1 text-[11px] font-medium`)·본문(`:485` `bg-muted line-clamp-3 rounded p-2 text-xs`) 클래스를 그대로 따른다:

```tsx
      {referenceTranslationDisplay && (
        <div className="mt-2">
          {/* 참고 번역 — draft.referenceTranslation(FEAT-46 Korean analyze). 렌더 자막은
              따로 번역되므로 표현이 다를 수 있고, 번역은 AI 구간 기준이라 구간을 편집하면
              라벨이 그 사실을 밝힌다(reference-translation.ts). null이면 이 블록은 없다. */}
          <p className="text-muted-foreground mb-1 text-[11px] font-medium">
            {referenceTranslationDisplay.label}
          </p>
          <p className="bg-muted line-clamp-3 rounded p-2 text-xs">
            {referenceTranslationDisplay.text}
          </p>
        </div>
      )}
```

- 원문 블록과 **독립 조건**으로 둔다: previewText는 현재 구간에 단어가 없으면 비지만(사용자가 구간을 공백 구간으로 옮김), 참고 번역은 AI 구간 기준이라 그때도 유효하다 — 이 경우 stale 라벨과 함께 번역만 보인다(허용).
- 요구 ④(커스텀·기존 드래프트): `draft.referenceTranslation`이 null → `resolveReferenceTranslationDisplay`가 null → 블록 없음. `createCustomClipDraft`는 변경하지 않는다.

## 테스트

- **덮는 것**
  - `reference-translation.test.mjs` — `resolveReferenceTranslationDisplay`:
    - null/undefined/`""`/공백 `referenceTranslation` → `null`(요구 ②·④: 블록 없음).
    - 값이 있고 현재 구간 == AI 구간 → `{ text, label: FRESH_LABEL }`, 골든 문자열 정확 일치.
    - 값이 있고 start만 차이 > 0.05초 → `label: STALE_LABEL`(골든), end만 차이 > 0.05초 → STALE, 둘 다 차이 → STALE.
    - 경계: 차이 0.04초(양끝) → FRESH(허용오차 안), 차이 0.1초 → STALE. **양쪽을 다 밟아** 허용오차 술어가 항진/항위로 무너지는 변이를 잡는다.
    - **방향**: 현재 구간이 AI 구간보다 **앞선** 경우도 STALE — start를 `9.8`로 당긴 케이스와 end를 `39.8`로 당긴 케이스를 각각 둔다. 양수 차이만 밟으면 `Math.abs`를 지운 구현이 **모든 케이스를 통과한다**(계획 검증 돌연변이 실측). `adjustStart("back")` 넛지가 매번 만드는 경우라 실입력에서 도달한다.
    - 허용오차 **정확값(차이 == 0.05)은 의도적으로 테스트하지 않는다** — `>`를 `>=`로 바꾼 변이는 **도달 가능한 입력으로 구별되지 않는 등가 변이**다(`boundary-snap.test.mjs`의 `roundTenth` 판정과 같은 부류 — `apps/web/CLAUDE.md` 테스트 표). 구간 값이 부동소수라 정확히 0.05가 나오지 않는다: `10.05 - 10 = 0.05000000000000071`(실측)이라 `>`에서도 STALE이고, 정확값은 `0` 기준 같은 인위적 입력에서만 생긴다. 경계는 양쪽(0.04 → FRESH, 0.1 → STALE)으로 이미 고정돼 있다.
    - `text`는 trim된 값(앞뒤 공백 제거) — 골든 비교.
  - `modal-contract.test.mjs` — `normalizeAnalyzedMoment`(요구 ①의 조용한 null 가드):
    - `referenceTranslation: "..."` 있는 raw → 반환에 그 문자열. **이 단언이 없으면 정규화기 복사 줄을 지워도(선택 필드라) TS·기존 테스트가 통과한다** — 조용한 null 회귀.
    - 키 없는 raw → `referenceTranslation: null`. 비문자열(숫자·객체) → null(`toNullableString` 경유).
    - 기존 필드 회귀 방지 최소 단언: 유효 moment(`index`·`startSeconds`·`endSeconds`)가 정상 정규화되고, 그때 `referenceTranslation` 없으면 null.
  - 새 테스트로 web 스위트 수가 오른다(현재 162 → 신규 케이스만큼 증가). `npm test -w apps/web`가 전부 통과.
  - 두 파일 다 `src/**/*.test.mjs` 글롭에 자동으로 잡힌다(`apps/web/package.json` `test`) — 등록 절차는 없다. 다만 `apps/web/CLAUDE.md`의 테스트 목록 표에 **행 2개**와 머리 수치(`23개 파일, 37 suite, 162개 테스트`) 갱신이 따라온다. 그 파일은 web-dev에게 읽기 전용이라 구현 때 `비고:`로 행 문안만 보고하고, 반영은 인수 때 메인 루프가 한다(`.claude/agents/web-dev.md` B-4).
- **못 덮는 범위**(러너로 확인 불가 — DOM·DB·wire·렌더)
  - `functions.ts`의 `createClipDraftsBulk` 매핑(요구 ① 곳 4)은 `step.run` 안 DB 호출이라 순수 추출 불가 — `npm run check`의 타입 검사(`Prisma.ClipDraftCreateManyInput`에 `referenceTranslation`이 맞는 타입인지)만 정적으로 확인된다. 실제 저장은 배포 후 확인.
  - `ClipDraftCard.tsx` 렌더(블록이 실제로 원문 아래 뜨는지, stale 라벨 전환, 카드 높이 변화)는 React 렌더라 러너 밖 — Korean 업로드 실물 육안.
  - 웹훅→이벤트→Inngest 배선으로 `referenceTranslation`이 실제 DB 행에 저장되는지 — 프로덕션 Korean 업로드로만.

## 검증 게이트

```bash
npm run check -w apps/web
npm test -w apps/web
```

둘 다 EXIT 0이어야 한다. `check`는 `verify:fsd`(FSD 경계)·ESLint·`tsc`를 돈다 — 새 순수 함수가 `model/`에 있고 카드가 슬라이스 내부 상대경로(`../../model/reference-translation`)로 임포트하므로 경계 위반이 없다.

## 범위 밖 의존

- `apps/web/src/fsd/entities/clip-draft/api/index.ts`(area 밖 — `entities`, area는 `widgets/clip-draft-review`): 백로그 요구대로 `createClipDraftsBulk` 시그니처가 새 필드를 받는지 따라가 확인했다 — **변경 불요, 막히지 않음.** 인자 타입이 `Prisma.ClipDraftCreateManyInput[]`(`:17`)라 FEAT-47이 재생성한 클라이언트의 선택 필드 `referenceTranslation`을 그대로 받는다. 같은 파일 `createCustomClipDraft`(`:117`)도 요구 ④가 "커스텀 = null"이라 **현재 동작(필드 미설정)이 곧 요구**이므로 변경 불요다. 구현 중 이 파일을 고쳐야 할 상황이 오면(예상과 달리 시그니처가 필드를 거부) 그 지점에서 `보류`한다.
- `packages/db`: 변경 없음 — FEAT-47이 컬럼·마이그레이션·생성 클라이언트를 이미 넣었다(`71bf498`).
- `apps/backend`: 변경 없음 — FEAT-46이 콜백 적재를 이미 배포했다.

## 대안

- **요구 ③에서 stale 시 블록 숨김** — 기각. 위 §4 근거대로 상태를 조용히 접는 것이라 FEAT-37이 남긴 오독 전례와 같은 부류이고, 편집 중 블록이 이유 없이 사라진다. 라벨이 오독(영어 X + 한국어 Y)을 이미 막는다.
- **번역 블록을 원문 블록 안(`{previewText && ...}`)에 중첩** — 기각. previewText는 현재 구간 단어 유무에 걸리고 번역은 저장 필드 유무에 걸려 조건이 다르다. 중첩하면 사용자가 구간을 공백으로 옮겼을 때 유효한 번역이 함께 사라진다.
- **`entities/clip-draft`에 `Pick`/DTO를 만들어 `referenceTranslation`만 카드로 흘리기** — 기각. 카드는 이미 전체 `ClipDraft`를 받고(`ClipDraftCard.tsx:52`) 상류도 전체 타입이라, 새 필드는 배선 변경 없이 흐른다. DTO 추가는 불필요한 층이고 area 밖(`entities`) 수정을 부른다.
- **정규화기에 snake_case(`reference_translation`) 변형 추가** — 기각. 백엔드가 camelCase만 싣는다(FEAT-46 `attach_reference_translations`). 있지도 않은 변형을 받으면 계약이 실제와 어긋나 오해를 남긴다.
