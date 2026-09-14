# FEAT-42: 캡션 스타일 기본값 본체 (앞 절반 ①② — 기본값이 렌더까지 도달)

agent: web-dev

> **분할 결정 (계획 첫머리).** 백로그 FEAT-42는 계획서가 커지면 **①②(기본값이 렌더까지 도달)**
> 와 **③(검토 화면에서 캡처)**로 쪼개라고 했고, 메인 루프 게이트① 기록도 같은 분할을 지시한다.
> 이 계획은 **①②만** 다룬다. 근거:
> - ①(설정 화면에서 기본값 저장 + 정지 미리보기)은 ②(스냅샷→시드·디스패치)가 그 값을 소비해야
>   비로소 가치가 난다 — ① 단독은 아무도 안 읽는 값을 저장할 뿐이다. 그래서 ①②는 **함께** 나간다.
> - ③(다이얼로그 "내 기본으로 저장" + Reset을 스냅샷으로)은 ①②가 만든 스냅샷·시드 위에 얹는
>   순수 추가라 뒤로 미뤄도 ①②의 가치(설정→새 업로드→auto 렌더에 기본값 적용, 검토 시드 프리필)가
>   온전하다. 그리고 ③은 검토 UI에 스냅샷을 흘려보내는 새 데이터 흐름을 요구해 표면이 별도다.
> - 규모: ①②만으로도 신규 5 · 수정 14다. ③까지 한 계획에 넣으면 검증·구현이 한 항목에 과적된다.
>
> ③의 범위는 「범위 밖 의존」에 적는다(같은 워크스페이스지만 이 계획이 다루지 않는 뒤 절반 —
> 메인 루프가 인수 때 백로그에 등재한다; web-dev는 항목을 추가할 수 없다). 이 계획의 구현은
> `CaptionStyleDialog.tsx`·Reset·`createCustomClipDraft`를 **건드리지 않는다**.

## 현재 동작

**설정 화면.** `app/dashboard/settings/page.tsx:14`가 `getUserUploadDefaults`로 언어·클립수·생성모드만 읽어
`SettingsView`에 넘기고(`:16` `resolveUploadDefaults(stored)`), `pages/settings/ui/index.tsx`는 그 셋만 드롭다운으로
편집한다. 캡션 스타일 섹션은 없다. 저장 성공 후 `pages/settings/ui/index.tsx:59`가 `settings_defaults_saved`를
`{ source: "settings_page" }`로만 발신한다(`preset` 없음). `User.defaultCaptionStyle`을 읽거나 쓰는 코드는 0건이다.

**캡션 편집기 재사용.** `features/caption-style`(FEAT-40이 옮김)의 `CaptionStyleEditor`는
`ui/CaptionStyleEditor.tsx:65`에서 `language`·`value`·`playUrl`·`clipStart`·`clipEnd`·`words`를 받아
왼쪽 컨트롤 + 오른쪽 `CaptionPreviewPlayer`(`:291`)를 그린다. `CaptionPreviewPlayer`는 `playUrl === null`이면
두 이펙트가 early-return하고(`ui/CaptionPreviewPlayer.tsx:54` `if (!video) return;`(영상 미렌더로 `videoRef.current`가
null), `:63` `if (!video || playUrl === null) return;`) `activeText`가 `""`로 남아 **검은 상자만** 그린다
(영상 태그도 `:112` `{playUrl !== null && (`로 가려진다). 미리보기 밑에는 `ui/CaptionStyleEditor.tsx:307-312`의
라이브 영상 전제 안내("Live preview on your video …the words here are the English source.")가 고정으로 붙는다.

**검증 스키마의 위치.** `ClipDraft.captionStyle`/`UploadedFile.captionStyle`/`User.defaultCaptionStyle` JSON의 유일한
검증기 `captionStyleSchema`는 `features/clip-review/model/schemas.ts:13`에 있다. 배럴 `features/clip-review/index.ts:6`이
재수출하고, `features/clip-review/api/index.ts`·`widgets/clip-draft-review`가 소비한다. FSD 경계 검사기는
`apps/web/scripts/verify-fsd-boundaries.mjs:202`에서 **W2(peer 슬라이스 임포트)** 를 프로덕션 파일에 강제한다
(`:155` 테스트 파일은 스캔 제외). `shared`는 W2·W6 면제(`:202`·`:210`).

**업로드 스냅샷 · 드래프트 시드.** `prepareUpload`(`features/upload/api/index.ts:207`)는 클라이언트가 보낸
언어·클립수·생성모드만 저장하고(`createUploadDraft` 호출 `:240`) `User.defaultCaptionStyle`을 읽지 않는다.
`createUploadDraft`(`entities/uploaded-file/api/index.ts:105`)는 `captionStyle`을 받지 않아 `UploadedFile.captionStyle`은
항상 null로 생성된다(스키마 `schema.prisma:98` `captionStyle Json?`, FEAT-38이 컬럼만 추가). 분석 경로가 드래프트를
만드는 `createClipDraftsBulk`(`inngest/functions.ts:921`, 엔티티 `entities/clip-draft/api/index.ts:16`)는
`captionStyle`을 시드하지 않아 모든 드래프트가 `captionStyle: null`로 생긴다 — 그래서 검토 다이얼로그
초기값(`widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx:521` `initialValue={toCaptionStyle(draft.captionStyle)}`)이
항상 null(= 언어 기본값)이다.

**디스패치 페이로드.** auto/render 모두 `process-video-events`로 발신된다(`features/upload/api/dispatch-processing.ts`
auto=`:166` else 브랜치, render=`:156`). 워커 `inngest/functions.ts`는 `findCurrentProcessingAttemptContext`로 컨텍스트를
읽고(auto·render 공용 `:236`, analyze `:704`; 셀렉트 `entities/uploaded-file/api/index.ts:507-516`에 `captionStyle` 없음)
Modal에 POST한다. auto/render 본문은 `:365-376`이고 **`caption_style`을 싣지 않는다**. render는 대신 moment마다
`caption_style`을 싣는다(`entities/clip-draft/api/index.ts:111`, 계약 `inngest/client.ts:23`). analyze 본문 `:805-814`도
`caption_style`이 없다. 백엔드는 FEAT-41(2026-09-15 Modal 배포)로 요청 단위 `caption_style`을 **auto 폴백에만** 쓴다
(`docs/agents/main-loop/FEAT-41.md`, render·analyze는 무시).

## 문제

백로그 `source`가 지목한 것: 캡션 스타일은 `ClipDraft.captionStyle`에만 있고 `reviewBeforeGenerate=true`로 검토 화면에
들어가야만 편집된다. 사용자가 자기 캡션 기본값을 한 번 정해 두고 그것이 업로드·auto 렌더·검토 시드까지 도달하게 하는
길이 없다. FEAT-38이 컬럼(`User.defaultCaptionStyle`·`UploadedFile.captionStyle`)을, FEAT-41이 백엔드 요청 단위 필드를
이미 깔아 두었으나, web 쪽 배선(설정 화면 · 스냅샷 복사 · 드래프트 시드 · auto 페이로드)이 전부 비어 있어 컬럼이
항상 null이다(위 「현재 동작」의 0건·null 확인). ①②는 이 배선을 채워 "기본값이 렌더까지 도달"하게 한다. ③(검토 화면
인라인 저장)은 이 계획 밖이다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/shared/config/caption-style-schema.ts` `(신규)` | `captionStyleSchema`·`type CaptionStyleInput`을 여기로 이관(3개 컬럼 공용 검증기를 하위 레이어에 둬 W2 회피) |
| `src/fsd/features/clip-review/model/schemas.ts` | `captionStyleSchema` 로컬 정의를 지우고 shared에서 임포트+재수출(배럴·기존 소비자 무변경). `updateClipDraftSchema`·`addCustomClipDraftSchema`는 그대로 |
| `src/fsd/shared/config/constants.ts` | `captionStyleSchema` 위치를 가리키는 주석(`:112`) 한 줄을 새 경로로 갱신 (주석 전용) |
| `src/fsd/features/caption-style/model/sample-captions.ts` `(신규)` | 정지 미리보기용 샘플 단어(영/한 각 1벌)·창 상수·`firstSampleCueText` 순수 함수. FEAT-49가 재사용 |
| `src/fsd/features/caption-style/model/sample-captions.test.mjs` `(신규)` | `firstSampleCueText`/샘플 단어 계약 테스트 |
| `src/fsd/features/caption-style/index.ts` | 배럴에 `sampleCaptionWords`·`SAMPLE_CAPTION_CLIP_END` 수출(pages/settings가 public entry로 쓴다) |
| `src/fsd/features/caption-style/ui/CaptionPreviewPlayer.tsx` | `playUrl === null`이면 첫 큐를 고정으로 그리는 정지 분기 추가(타이머 없음) |
| `src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx` | 미리보기 밑 안내를 `playUrl === null`(정지=샘플)과 라이브로 분기. **라이브 문장 텍스트는 그대로**(FEAT-45 몫) |
| `src/fsd/entities/user/api/index.ts` | `getUserDefaultCaptionStyle`·`updateUserDefaultCaptionStyle` 추가(`import type { Prisma }`→값 임포트로 `Prisma.JsonNull` 사용) |
| `src/fsd/entities/user/server.ts` | 위 두 함수 재수출 |
| `src/fsd/features/settings/api/index.ts` | `saveDefaultCaptionStyle` 서버 액션 추가(shared `captionStyleSchema` 검증, null=비우기) |
| `src/fsd/pages/settings/ui/index.tsx` | 캡션 기본 스타일 섹션(편집기+정지 미리보기+Save/Reset+`preset` 계측) 추가. 언어는 페이지 `language` state를 따름 |
| `src/app/dashboard/settings/page.tsx` | `getUserDefaultCaptionStyle` 읽어 `SettingsView`에 초기 캡션값 전달 |
| `src/fsd/features/upload/api/index.ts` | `prepareUpload`가 서버에서 `User.defaultCaptionStyle`을 읽어 `createUploadDraft`에 넘김(스냅샷 복사) |
| `src/fsd/entities/uploaded-file/api/index.ts` | `createUploadDraft`에 `captionStyle` 인자 추가(쓰기); `findCurrentProcessingAttemptContext` 셀렉트에 `captionStyle: true` |
| `src/inngest/caption-style-request.ts` `(신규)` | `autoRequestCaptionStyle` 순수 함수(auto만 요청 단위 스타일, render 무효화, null 생략) |
| `src/inngest/caption-style-request.test.mjs` `(신규)` | 위 함수 테스트 |
| `src/inngest/functions.ts` | auto 본문에 `caption_style`(스냅샷) 추가 · analyze 드래프트 시드에 `captionStyle`(스냅샷) 추가 |

여기 없는 파일(특히 `CaptionStyleDialog.tsx`·`createCustomClipDraft`·`packages/db/**`)은 구현 단계에서 고치지 않는다.

## 구현 스케치

### 신규 순수 모듈 (테스트 대상)

`src/inngest/caption-style-request.ts` — 런타임 임포트 0(타입만), 그래서 독립 테스트 가능:

```ts
import type { CaptionStyle } from "~/fsd/shared/config/constants";

/**
 * auto Modal 요청의 요청 단위 caption_style을 정한다.
 * - render 모드: undefined — 백엔드는 render에서 요청 단위 스타일을 무시하고
 *   moments[].caption_style만 쓴다(FEAT-41 소유자 결정 2026-09-14). 키를 아예 생략한다.
 * - auto 모드: 업로드 스냅샷. 스냅샷이 null이면 undefined(키 생략) → 백엔드 언어 기본값.
 */
export function autoRequestCaptionStyle(
  isRenderMode: boolean,
  snapshot: CaptionStyle | null,
): CaptionStyle | undefined {
  if (isRenderMode) return undefined;
  return snapshot ?? undefined;
}
```

`src/fsd/features/caption-style/model/sample-captions.ts` — 실렌더 큐 묶기(`buildCaptionCues`)를 그대로 써
설정 화면 정지 미리보기의 **첫 큐 텍스트**를 만든다. FEAT-49가 Korean 샘플 문장을 재사용한다:

```ts
import type { TranscriptWord } from "~/fsd/shared/lib/transcript";
import { buildCaptionCues } from "./caption-preview";

// 정지 미리보기 창(초). 아래 샘플 단어 전부를 포함(마지막 end 8.9 < 10).
export const SAMPLE_CAPTION_CLIP_END = 10;

// 각 단어 {start:i, end:i+0.9}. maxWordsPerLine 최댓값(8, MAX_WORDS_RANGE.MAX)까지
// 한 줄을 채울 수 있도록 언어마다 9단어를 둔다.
const EN_WORDS = [
  "Style", "your", "captions", "the", "way", "you", "want", "them", "shown",
];
const KR_WORDS = [
  "지금", "자막", "스타일을", "원하는", "대로", "화면에서", "미리", "확인해", "보세요",
];

function toWords(list: readonly string[]): TranscriptWord[] {
  return list.map((word, i) => ({ start: i, end: i + 0.9, word }));
}

export function sampleCaptionWords(language: string): TranscriptWord[] {
  return toWords(language === "Korean" ? KR_WORDS : EN_WORDS);
}

// 정지 미리보기가 그리는 텍스트 = 첫 큐. maxWords·uppercase 효과가 곧바로 보인다.
export function firstSampleCueText(
  language: string,
  maxWords: number,
  uppercase: boolean,
): string {
  const cues = buildCaptionCues(
    sampleCaptionWords(language),
    0,
    SAMPLE_CAPTION_CLIP_END,
    maxWords,
    uppercase,
  );
  return cues[0]?.text ?? "";
}
```

리터럴 확인: `firstSampleCueText("English", 5, false) === "Style your captions the way"`,
`("English", 5, true) === "STYLE YOUR CAPTIONS THE WAY"`, `("Korean", 3, false) === "지금 자막 스타일을"`,
`("Korean", 8, false) === "지금 자막 스타일을 원하는 대로 화면에서 미리 확인해"`.

### 검증 스키마 이관

`src/fsd/shared/config/caption-style-schema.ts` `(신규)` — 현재 `features/clip-review/model/schemas.ts:13-44`의
`captionStyleSchema`(z.object 전체)와 `export type CaptionStyleInput = CaptionStyle;`를 **본문 변경 없이** 옮긴다.
임포트는 `~/fsd/shared/config/constants`의 `CAPTION_STYLE_OPTIONS`·`type CaptionStyle`만 필요(현재도 그 둘만 씀).

`features/clip-review/model/schemas.ts` — 정의를 지우고 재수출로 바꾼다(배럴·기존 소비자 경로 유지):

```ts
// before (:1-44 발췌): captionStyleSchema를 여기서 z.object로 정의
// after:
import { z } from "zod";
import {
  CLIP_DURATION_LIMITS,
  isClipDurationWithinLimits,
} from "~/fsd/shared/config/constants";
import { captionStyleSchema } from "~/fsd/shared/config/caption-style-schema";

// 같은 CaptionStyle 모양을 features/settings·features/upload도 검증하므로 shared로 이관했다.
// 검토 편집 스키마는 이 슬라이스가 계속 소유한다.
export { captionStyleSchema };
export type { CaptionStyleInput } from "~/fsd/shared/config/caption-style-schema";

export const updateClipDraftSchema = z /* :46-60 그대로 */;
export const addCustomClipDraftSchema = z /* :62-73 그대로 */;
```

`features/clip-review/index.ts:6-7`(`export { captionStyleSchema } from "./model/schemas"` 등)은 무변경으로 계속
작동한다. `caption-presets.test.mjs:7`의 딥 임포트(`~/fsd/features/clip-review/model/schemas`)도 재수출 덕에 무변경.

### 엔티티 · 업로드 배선 (②)

`entities/user/api/index.ts` — 값 임포트로 바꾸고 두 함수 추가:

```ts
// before: import type { Prisma } from "@repo/db";
// after:  import { Prisma } from "@repo/db";
//         import type { CaptionStyle } from "~/fsd/shared/config/constants";

export async function getUserDefaultCaptionStyle(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { defaultCaptionStyle: true },
  });
}

export async function updateUserDefaultCaptionStyle(
  userId: string,
  style: CaptionStyle | null,
) {
  return db.user.update({
    where: { id: userId },
    // null = 비우기(언어 기본값). Prisma는 JSON 컬럼에 명시적 null을 JsonNull로 쓴다
    // (updateClipDraftEdit :85와 같은 관용).
    data: { defaultCaptionStyle: style ?? Prisma.JsonNull },
  });
}
```

`entities/user/server.ts` — `getUserDefaultCaptionStyle`·`updateUserDefaultCaptionStyle`을 export 목록에 추가.

`entities/uploaded-file/api/index.ts`:

```ts
// createUploadDraft (:105-121) — captionStyle 인자 추가:
export async function createUploadDraft(data: {
  userId: string;
  s3Key: string;
  displayName: string | null;
  language: string;
  targetClipCount: number;
  reviewBeforeGenerate: boolean;
  captionStyle?: Prisma.JsonValue; // User.defaultCaptionStyle 스냅샷 (없으면 null 컬럼)
}) {
  const { captionStyle, ...rest } = data;
  return db.uploadedFile.create({
    data: {
      ...rest,
      uploaded: false,
      status: "upload_pending",
      // null/미지정이면 필드를 생략 → 컬럼 null. 있으면 그대로 스냅샷을 쓴다.
      ...(captionStyle != null
        ? { captionStyle: captionStyle as Prisma.InputJsonValue }
        : {}),
    },
    select: { id: true },
  });
}

// findCurrentProcessingAttemptContext (:507-516) select 에 한 줄 추가:
//   s3Key: true,
//   status: true,
//   captionStyle: true,   // ← auto 요청 스냅샷 · 분석 드래프트 시드가 읽는다
//   user: { select: { credits: true } },
```

`features/upload/api/index.ts` — `prepareUpload` 안:

```ts
// import 추가: import { getUserDefaultCaptionStyle } from "~/fsd/entities/user/server";

// try 블록 안, createUploadDraft 호출(:240) 직전에 서버에서 스냅샷을 읽는다.
// 클라이언트는 스타일을 보내지 않으므로 prepareUploadSchema(검증 표면)는 늘지 않는다.
const { defaultCaptionStyle } = await getUserDefaultCaptionStyle(
  authResult.data.userId,
);

const uploadDraft = await createUploadDraft({
  userId: authResult.data.userId,
  s3Key: key,
  displayName: fileName,
  language,
  targetClipCount: clipCount,
  reviewBeforeGenerate,
  captionStyle: defaultCaptionStyle, // 업로드 시점에 고정되는 스냅샷
});
```

`inngest/functions.ts` — import 추가(`import { autoRequestCaptionStyle } from "./caption-style-request";`,
`import type { CaptionStyle } from "~/fsd/shared/config/constants";`), 두 지점 배선:

```ts
// (A) processVideo auto/render 본문 (:365-376) 안, transcript_s3_key 줄 옆에 추가:
//   mode: shouldRenderSelectedMoments ? "render" : "auto",
//   moments: shouldRenderSelectedMoments ? moments : undefined,
//   caption_style: autoRequestCaptionStyle(
//     shouldRenderSelectedMoments,
//     context.captionStyle as CaptionStyle | null, // 렌더 경로(:111)와 같은 캐스트
//   ),
// JSON.stringify가 undefined 키를 떨어뜨리므로 render·null 스냅샷에선 키가 생략된다.

// (B) analyzeVideo persist-clip-drafts (:920-936) — 스냅샷을 각 드래프트에 시드:
const snapshotStyle = context.captionStyle as CaptionStyle | null;
await createClipDraftsBulk(
  validMoments.map((moment, order) => ({
    uploadedFileId,
    attempt,
    index: moment.index ?? order,
    aiStartSeconds: moment.startSeconds,
    aiEndSeconds: moment.endSeconds,
    startSeconds: moment.startSeconds,
    endSeconds: moment.endSeconds,
    clipType: moment.clipType ?? null,
    hook: moment.hook ?? null,
    payoff: moment.payoff ?? null,
    selected: order < clipCount,
    // 스냅샷이 있으면 시드, null이면 필드 생략(컬럼 null → 언어 기본값).
    // 커스텀 클립(createCustomClipDraft)은 이 경로 밖이라 계속 null이다(의도 — render는
    // 드래프트 스타일만 쓰므로 언어 기본값으로 렌더된다).
    ...(snapshotStyle !== null ? { captionStyle: snapshotStyle } : {}),
  })),
);
```

### 설정 화면 (①)

`features/settings/api/index.ts` — 새 서버 액션(기존 `saveUploadDefaults`와 같은 파일):

```ts
// import 추가:
//   import { captionStyleSchema } from "~/fsd/shared/config/caption-style-schema";
//   import { updateUserDefaultCaptionStyle } from "~/fsd/entities/user/server";
//   import type { CaptionStyle } from "~/fsd/shared/config/constants";

export async function saveDefaultCaptionStyle(
  input: CaptionStyle | null,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  // null = 언어 기본값으로 비우기(검증 안 함). 값이 있으면 write-time 단일 검증.
  if (input !== null) {
    const parsed = captionStyleSchema.safeParse(input);
    if (!parsed.success) return failure("Invalid caption style");
  }

  await updateUserDefaultCaptionStyle(authResult.data.userId, input);
  revalidatePath("/dashboard/settings");
  return success();
}
```

`app/dashboard/settings/page.tsx` — 초기 캡션값을 함께 읽어 넘긴다:

```ts
// import 추가: import { getUserDefaultCaptionStyle } from "~/fsd/entities/user/server";
//             import type { CaptionStyle } from "~/fsd/shared/config/constants";
const stored = await getUserUploadDefaults(session.user.id);
const { defaultCaptionStyle } = await getUserDefaultCaptionStyle(session.user.id);

return (
  <SettingsView
    initialDefaults={resolveUploadDefaults(stored)}
    // 저장 시 captionStyleSchema로 검증된 값(렌더 경로와 같은 캐스트). null = 언어 기본값.
    initialCaptionStyle={defaultCaptionStyle as CaptionStyle | null}
  />
);
```

`features/caption-style/index.ts` — 배럴에 두 줄 추가:

```ts
export { default as CaptionStyleEditor } from "./ui/CaptionStyleEditor";
export { matchPresetId } from "./model/caption-presets";
export {
  sampleCaptionWords,
  SAMPLE_CAPTION_CLIP_END,
} from "./model/sample-captions";
```

`pages/settings/ui/index.tsx` — `SettingsViewProps`에 `initialCaptionStyle: CaptionStyle | null` 추가,
`captionStyle` state 도입, 기존 "Upload defaults" 카드(`:85-169`) 아래에 캡션 카드를 추가한다.
카드 구조·Card/Button 원자는 기존 카드(`:85-169`)를 그대로 따르고, 미리보기는 `CaptionStyleEditor`에
`playUrl={null}`·샘플 words를 넘긴다. 언어는 페이지의 `language` state를 따라 폰트·샘플·기본 크기가 함께 바뀐다:

```tsx
// import 추가:
//   CaptionStyleEditor, matchPresetId, sampleCaptionWords, SAMPLE_CAPTION_CLIP_END
//     from "~/fsd/features/caption-style";
//   saveDefaultCaptionStyle from "~/fsd/features/settings/api";
//   type CaptionStyle from "~/fsd/shared/config/constants";

const [captionStyle, setCaptionStyle] = useState<CaptionStyle | null>(
  initialCaptionStyle,
);

const handleSaveCaption = () =>
  startSaving(async () => {
    const result = await saveDefaultCaptionStyle(captionStyle);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    // 계측은 fire-and-forget(저장은 이미 성공). preset = matchPresetId 결과.
    void trackAnalyticsEvent("settings_defaults_saved", {
      source: "settings_page",
      preset: matchPresetId(captionStyle),
    });
    toast.success("Caption style saved");
    router.refresh();
  });

const handleResetCaption = () => {
  setCaptionStyle(null);
  startSaving(async () => {
    const result = await saveDefaultCaptionStyle(null);
    if (!result.success) toast.error(result.error);
    else {
      void trackAnalyticsEvent("settings_defaults_saved", {
        source: "settings_page",
        preset: matchPresetId(null), // "default"
      });
      toast.success("Caption style saved");
      router.refresh();
    }
  });
};

// 새 Card (기존 Card 마크업 :85-169 패턴):
//   CardTitle: "Default caption style"
//   CardDescription: "New uploads start with this caption style. You can still
//                     change it per clip while reviewing."
//   <CaptionStyleEditor
//     language={language}                         // 페이지 언어 state
//     value={captionStyle}
//     playUrl={null}
//     clipStart={0}
//     clipEnd={SAMPLE_CAPTION_CLIP_END}
//     words={sampleCaptionWords(language)}
//     onChange={setCaptionStyle}
//   />
//   Buttons: "Save caption style" (disabled={isSaving}), "Reset to language default"
```

`features/caption-style/ui/CaptionPreviewPlayer.tsx` — cues 이펙트(`:50-55`)에 정지 분기:

```tsx
// after:
const cuesRef = useRef(cues);
useEffect(() => {
  cuesRef.current = cues;
  // 정지 미리보기(설정 화면): 영상이 없으면 첫 큐를 고정으로 그린다. 타이머 없음.
  if (playUrl === null) {
    setActiveText(cues[0]?.text ?? "");
    return;
  }
  const video = videoRef.current;
  if (!video) return;
  setActiveText(pickActiveCue(cues, video.currentTime - clipStart)?.text ?? "");
}, [cues, clipStart, playUrl]);
```

`features/caption-style/ui/CaptionStyleEditor.tsx` — 미리보기 밑 안내(`:305-312`)를 정지/라이브로 분기.
**라이브 `<p>`의 텍스트는 한 글자도 바꾸지 않는다**(FEAT-45가 그 문장을 고칠 예정):

```tsx
// after (구조만; 라이브 문장은 현행 :307-312 그대로):
{playUrl === null ? (
  <p className="text-center text-[11px] text-muted-foreground">
    This is a sample. Your clips use your own video and words — here you&apos;re
    setting the size, color, position, and words per line.
  </p>
) : (
  <p className="text-center text-[11px] text-muted-foreground">
    Live preview on your video — the whole frame is shown here. The final clip
    crops to follow whoever is speaking, so framing will differ. Korean clips are
    translated at render time — the words here are the English source.
  </p>
)}
```

## 테스트

- **덮는 것**:
  - `src/inngest/caption-style-request.test.mjs` (신규) — `autoRequestCaptionStyle`: render 모드는 스냅샷이
    있어도 `undefined`(요청 단위 무효화), auto+스냅샷은 스냅샷 반환, auto+null은 `undefined`(키 생략). 이 셋이
    "render는 moment 스타일만, auto만 요청 단위, null은 언어 기본값" 계약을 못박는다.
  - `src/fsd/features/caption-style/model/sample-captions.test.mjs` (신규) — `firstSampleCueText`: 위 리터럴
    4종(영 maxWords 5·대문자, 한 maxWords 3·8), Korean 결과가 비-ASCII(한국어), maxWords 8이 8단어 큐를 내
    샘플이 ≥8단어임을 보장(누가 샘플을 줄이면 실패). `buildCaptionCues`(이미 `caption-preview.test.mjs`가 계약)를
    재사용하므로 이 테스트는 **샘플 데이터→화면 텍스트** 연결만 지킨다.
  - 회귀: `caption-presets.test.mjs`(재수출 경로 유지로 무변경 통과), `caption-preview.test.mjs`(큐 계약 불변).
- **못 덮는 범위**(Node 러너에 DOM·DB·외부 I/O 없음):
  - 설정 화면 캡션 섹션 렌더·정지 미리보기의 시각 정합(폰트/크기/위치가 실렌더와 근사한지), 언어 토글 시
    폰트·샘플·기본 크기 동시 변화 — 육안.
  - `saveDefaultCaptionStyle`/`prepareUpload` 스냅샷/`createClipDraftsBulk` 시드의 DB 왕복 — 서버 액션·Prisma.
  - **엔드투엔드(배포 후)**: 설정에서 기본 캡션 저장 → 새 업로드 → `UploadedFile.captionStyle` 스냅샷 →
    auto 렌더가 요청 단위 `caption_style`로 나오는지. 이는 `docs/release-checks.md` FEAT-41 절 **:68**
    「(FEAT-42 배포 후) auto 생성 클립이 요청 단위 스냅샷 스타일로 렌더되는가」가 FEAT-42 배포 뒤에야 닫히는
    항목이다. 같은 절 **:69**「render에서 스타일 없는 클립(커스텀·Reset)은 언어 기본값으로 렌더」도
    `autoRequestCaptionStyle`이 render에서 `undefined`를 내는 것으로 로직상 보장하나 최종 판정은 배포 후 육안이다.
  - 드래프트 시드가 검토 다이얼로그 초기값을 프리필하는지 — 배포 후 검토 화면 육안.

## 범위 밖 의존

- **③ 검토 화면 인라인 저장 (이 계획이 다루지 않는 뒤 절반 — 분할로 미룸).** 같은 워크스페이스(`apps/web`)지만
  이 계획의 구현은 여기에 **닿지 않는다**. 닿으면 `보류`. 메인 루프가 인수 때 백로그에 후속으로 등재한다
  (web-dev는 항목 추가 불가). 뒤 절반의 정확한 범위:
  - `widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx`에 "내 기본으로 저장" 버튼 추가
    (계측 `settings_defaults_saved`, `source: "review_dialog"`; 계측 실패가 저장을 막지 않게).
  - 같은 파일 `:87` `onClick={() => setWorking(null)}`(Reset style)을 **언어 기본값이 아니라 업로드 스냅샷**으로
    되돌리게 변경 — 이를 위해 `UploadedFile.captionStyle` 스냅샷을 위젯/카드/다이얼로그로 흘려보내는 **새 데이터
    흐름**이 필요하다(현재 검토 UI는 스냅샷을 모른다).
  - 필요 시 `createCustomClipDraft` 시드 여부 재판정(현재 결정: 시드 안 함 = 언어 기본값 유지).
- **packages/db 문서 드리프트(이관 부수효과 — 블로커 아님).** 스키마 이관 뒤 `schema.prisma:59`·`:186`의
  주석이 `captionStyleSchema`를 여전히 `features/clip-review/model/schemas.ts`로 인용한다. 정의는
  `shared/config/caption-style-schema.ts`로 옮겨간다(재수출은 남아 인용 경로가 깨지진 않는다). `packages/db`는
  web-dev 쓰기 범위 밖이라 이 계획은 손대지 않는다 — 메인 루프가 다음 스키마 변경 항목(FEAT-47 선례)과 함께
  함수/파일 앵커로 교정한다. 컬럼(FEAT-38)은 이미 있으므로 앞 절반 구현을 막지 않는다.

## 대안

- **스냅샷 전달 경로.** (기각) inngest 이벤트로 실어 나르기 — `client.ts`의 `process-video-events` data에
  `captionStyle` 필드 추가 + `dispatch-processing.ts` else 브랜치 + `processing-dispatch` 셀렉트까지 세 파일이
  더 바뀐다. (채택) `findCurrentProcessingAttemptContext` 셀렉트에 `captionStyle: true` 한 줄만 더해 워커에서
  DB로 읽는다. 스냅샷은 업로드 시점에 `UploadedFile.captionStyle`에 고정되어 이후 안 바뀌므로 처리 시점에 읽어도
  디스패치 시점 값과 동일하다 — 이벤트 스키마 드리프트 없이 같은 결과.
- **검증 스키마의 집.** (기각) `entities/clip-draft/model` — 캡션 스타일은 세 컬럼(User·UploadedFile·ClipDraft)이
  공유하는 모양이라 어느 한 엔티티가 소유한다고 하기 어렵고, `features/settings`가 clip-draft를 검증용으로
  임포트하는 것도 의미가 어긋난다. (채택) `shared/config` — 이 스키마가 검증하는 `CaptionStyle` 타입과
  `CAPTION_STYLE_OPTIONS` 상수가 이미 거기 있고, `shared`는 W2/W6 면제라 모든 feature가 딥 임포트해도 경계
  위반이 없다.
- **읽기 시점 재검증(스냅샷 방어).** (기각) `resolveUploadDefaults`(FEAT-39)처럼 DB JSON을 읽을 때 다시 검증하기.
  기존 render 경로(`getSelectedRenderMomentsForAttempt :111`)가 `draft.captionStyle`을 **캐스트만** 하고 백엔드
  `resolve_caption_style`이 범위를 클램프하므로, 스냅샷도 같은 관용을 따른다 — write-time `captionStyleSchema`가
  이미 `User.defaultCaptionStyle`을 검증하고 스냅샷은 그 값을 서버에서 복사한 것이라 이중 검증은 표면만 늘린다.
- **정지 미리보기 컴포넌트 분리.** (기각) 새 `CaptionStaticPreview`. (채택) `CaptionPreviewPlayer` 재사용 —
  프레임/폰트/위치 계산이 실렌더와 동일해야 정합이 서고, `playUrl === null`이면 영상 이펙트가 이미 early-return해
  타이머가 안 생긴다. 정지 분기 한 곳만 더하면 된다.
