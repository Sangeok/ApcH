# FEAT-50: 검토 화면에서 캡션 기본값 캡처 — 다이얼로그 「내 기본으로 저장」·Reset을 업로드 스냅샷으로

agent: web-dev

## 현재 동작

검토 화면의 캡션 스타일 다이얼로그(`widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx`)는 작업본(`working`)만 편집한다.

- 열릴 때 `initialValue`(카드가 넘긴 드래프트의 저장 스타일)로 `working`을 시드한다(`CaptionStyleDialog.tsx:48`, 재시드 `:52-59`).
- 푸터 버튼은 **넷**이다(`:81-124`): Reset style(`:83-90`) · Cancel(`:92-99`) · Apply to all clips(`:100-112`) · Apply(`:113-122`). Reset은 `:87` `onClick={() => setWorking(null)}`로 **언어 기본값**(null)으로 되돌린다.
- 다이얼로그는 업로드 스냅샷을 모른다 — props 열한 개(`open`·`onOpenChange`·`language`·`initialValue`·`playUrl`·`clipStart`·`clipEnd`·`words`·`onApply`·`onApplyToAll`·`isApplyingToAll`, `:18-31`) 어디에도 없다.
- **`working`은 null이 될 수 있다.** `initialValue`가 null이면(드래프트에 저장된 스타일이 없는 정상 상태) 시드부터 null이고(`:48`, 재시드 `:54`), Reset을 누르면 `:87`이 null로 만든다. 그래서 `Apply to all clips`는 `:104` `disabled={isApplyingToAll || working === null}`와 `:106` `if (working === null) return;` 이중 가드를 갖는다 — 이 위젯이 이미 쓰는 패턴이다.

카드(`ClipDraftCard.tsx`)가 다이얼로그를 렌더한다.

- `toCaptionStyle(raw)`가 Prisma JsonValue → shared `CaptionStyle`로 강제 변환한다 — 누락 키를 `DEFAULT_POSITION`·`null`로 채운다(`ClipDraftCard.tsx:36-50`). 카드 내부 지역 함수이고 export·테스트되지 않는다.
- 다이얼로그에 `initialValue={toCaptionStyle(draft.captionStyle)}`를 넘긴다(`:544`). 업로드 스냅샷은 받지도, 넘기지도 않는다.
- `onApplyToAll`·`isApplyingToAll`을 위젯에서 받아 다이얼로그로 흘린다(`:550-551`) — 위젯→카드→다이얼로그 threading의 기존 선례.

위젯(`ui/index.tsx`)이 데이터를 카드로 흘린다.

- `useClipDraftReview`에서 액션·플래그를 구조분해한다(`widgets/clip-draft-review/ui/index.tsx:108-122` — 저장소에 `ui/index.tsx`가 29개라 슬라이스까지 적는다. 이 절의 나머지 맨 줄번호도 같은 파일이다).
- 카드에 `draft`·`language`·`onApplyToAll`·`isApplyingToAll`·`playUrl` 등을 넘긴다(`:445-460`). 업로드 스냅샷 prop은 없다.
- props는 `uploadedFileId`·`clipDrafts`·`targetClipCount`·`currentUserCredits`·`language`(`:36-42`).

페이지(`pages/upload-detail/ui/index.tsx`)가 위젯을 렌더한다.

- `liveUploadedFileData`를 구조분해한다(`:35-51`) — `captionStyle`은 없다.
- `ClipDraftReviewSection`에 `uploadedFileId`·`clipDrafts`·`targetClipCount`·`currentUserCredits`·`language`를 넘긴다(`:117-125`).

DTO/엔티티.

- `getUploadedFileDetailsById`의 `select`(`entities/uploaded-file/api/index.ts:306-329`)는 `captionStyle`을 읽지 않는다. 반환은 `...fileData` 스프레드(`:340`, `:368-377`).
- `UploadedFileDetail` 타입(`entities/uploaded-file/model/types.ts:27-48`)에 `captionStyle` 필드가 없다.
- `findUploadedFileReviewState`의 `select`(`entities/uploaded-file/api/index.ts:472-485`)도 `captionStyle`을 읽지 않는다.

저장·계측 경로(이미 있음).

- `saveDefaultCaptionStyle(input: CaptionStyle | null)` 서버 액션이 있다(`features/settings/api/index.ts:37-56`) — null은 비우기, 값이 있으면 write-time 검증 후 저장.
- 설정 화면이 이를 호출한다(`pages/settings/ui/index.tsx:101-115`): 성공 후 계측 `settings_defaults_saved`를 `{ source: "settings_page", preset: matchPresetId(captionStyle) }`로 fire-and-forget 발신한다(`:109-112`).
- 계측 계약: `metadata.ts:59` 주석이 `source ∈ {"settings_page","review_dialog"}`를 이미 예고하고, `:63`이 허용 키를 `["source","preset"]`로 못박는다. `matchPresetId(style)`은 `CaptionStyle | null → 프리셋 id | "custom" | "default"`(`features/caption-style/model/caption-presets.ts:13-24`).
- 검토 훅은 이미 `matchPresetId`를 임포트하고(`use-clip-draft-review.ts:19`) 캡션 계측을 훅에서 발신한다(`trackCaptionStyleEdited` `:103-112`) — 카드는 저장 성공을 관찰하지 못하기 때문(`:101-102` 주석).

커스텀 클립 시드.

- AI 드래프트는 업로드 스냅샷으로 시드된다(`inngest/functions.ts:928-948`): `snapshotStyle !== null`이면 `captionStyle`을 실어 `createClipDraftsBulk`한다(`:948`).
- 그러나 커스텀 클립은 시드하지 않는다 — `functions.ts:946-947` 주석이 명시: "커스텀 클립(createCustomClipDraft)은 이 경로 밖이라 계속 null이다(의도 — render는 드래프트 스타일만 쓰므로 언어 기본값으로 렌더된다)".
- `createCustomClipDraft`(`entities/clip-draft/api/index.ts:117-148`)는 `captionStyle`을 `create` data에 넣지 않는다(`:134-146`).
- `addCustomClipDraft` 서버 액션(`features/clip-review/api/index.ts:110-151`)이 `findUploadedFileReviewState`로 상태를 읽고(`:127`) `createCustomClipDraft(file.id, file.reviewAttempt, { startSeconds, endSeconds })`를 호출한다(`:140-143`) — 스냅샷을 넘기지 않는다.

## 문제

백로그(`TASK_BACKLOG.md` FEAT-50)는 FEAT-42가 만든 캡션 기본값 체인의 뒤 절반을 요구한다. 마음에 드는 스타일은 **내 영상 위에서** 정해지므로, 검토 다이얼로그에서 그 순간을 기본값으로 캡처할 자리가 필요하다(원 FEAT-42 요구 ③).

세 결함:

1. 다이얼로그에 작업본을 사용자 기본값으로 저장하는 진입점이 없다 — `saveDefaultCaptionStyle`의 호출부는 워크스페이스 전체에서 **둘뿐이고 둘 다 설정 화면 안**이다: `pages/settings/ui/index.tsx:103`(저장)과 `:120`(비우기, `handleResetCaption`). 계측 `settings_defaults_saved`의 `source: "review_dialog"`는 계약에 예고돼 있으나(`metadata.ts:59`) 아무도 발신하지 않는다.

   **`:120`이 이 계획에 직접 걸린다.** 그 액션은 `saveDefaultCaptionStyle(null)`로 사용자 기본값을 **지우고** 계측을 `preset: matchPresetId(null) // "default"`로 싣는다(`:117-131`). 즉 이 서버 액션에서 `null`은 "저장 안 함"이 아니라 **비우기 명령**이다.
2. Reset(`CaptionStyleDialog.tsx:87`)은 **언어 기본값**(null)으로 되돌린다 — 사용자가 이 업로드에 걸어 둔 캡션 기본값(업로드 스냅샷)으로 돌아갈 수 없다. 스냅샷은 DTO/props 어디에도 흐르지 않는다(`entities/uploaded-file/model/types.ts:27-48`, `widgets/clip-draft-review/ui/index.tsx:36-42` — 저장소에 `types.ts`가 13개, `ui/index.tsx`가 29개라 둘 다 슬라이스까지 적는다).
3. 커스텀 클립은 스냅샷으로 시드되지 않아(`functions.ts:946-947`) AI 형제 클립이 사용자 기본값으로 렌더될 때 혼자 언어 기본값으로 렌더된다 — 조용한 불일치. 백로그 ③은 이 결정의 **재판정**을 요구한다.

### 「저장」이 「삭제」가 되는 경우 — 이 계획이 반드시 막아야 하는 것

요구 ①의 버튼을 `onSaveAsDefault(working)`으로 단순 배선하면, `working === null`인 상태(위 「현재 동작」에서 열거한 두 경로: 드래프트에 스타일이 없어 처음부터 null · Reset 직후)에서 누르는 순간 `saveDefaultCaptionStyle(null)`이 나가 **사용자 기본값이 삭제된다.** 버튼 이름은 "Save as my default"이고 토스트는 "Saved as your default caption style"이며 계측은 `preset: "default"`로 나간다 — 셋 다 일어난 일과 반대를 말한다. 되돌릴 UI도 없다(설정 화면에서 다시 만들어야 한다).

그래서 **`working === null`일 때 이 버튼은 비활성이다.** 같은 다이얼로그의 `Apply to all clips`가 쓰는 가드 형태를 그대로 따른다(§5). 「스냅샷/언어 기본값으로 되돌리기」는 Reset의 몫이지 이 버튼의 몫이 아니다 — 기본값을 비우려는 사용자는 설정 화면의 `handleResetCaption`을 쓴다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/widgets/clip-draft-review/model/caption-style-from-json.ts` `(신규)` | `ClipDraftCard`의 지역 `toCaptionStyle`을 export 순수 함수로 추출 — 드래프트·스냅샷 두 JsonValue 입력을 공유 |
| `src/fsd/widgets/clip-draft-review/model/caption-style-from-json.test.mjs` `(신규)` | `toCaptionStyle`의 null/undefined·부분 객체 키 채움·완전 객체 통과 |
| `src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx` | props에 `snapshotValue`·`onSaveAsDefault`·`isSavingDefault` 추가. Reset을 `setWorking(snapshotValue)`로. 「Save as my default」 버튼을 Reset과 같은 좌측 그룹에 추가(넷→다섯) |
| `src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | 지역 `toCaptionStyle` 제거·모델 임포트. props에 `uploadCaptionStyle`·`onSaveAsDefault`·`isSavingDefault` 추가. 다이얼로그에 `snapshotValue={toCaptionStyle(uploadCaptionStyle)}`·나머지 둘 전달 |
| `src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts` | `saveDefaultMutation` 추가(`saveDefaultCaptionStyle` 호출 + `settings_defaults_saved` 계측 + 토스트). `saveCaptionStyleAsDefault`·`isSavingDefault` 노출 |
| `src/fsd/widgets/clip-draft-review/ui/index.tsx` | props에 `uploadCaptionStyle` 추가. 훅에서 `saveCaptionStyleAsDefault`·`isSavingDefault` 구조분해. 카드에 세 값 전달 |
| `src/fsd/pages/upload-detail/ui/index.tsx` | `liveUploadedFileData`에서 `captionStyle` 구조분해(별칭 `uploadCaptionStyle`), 위젯에 `uploadCaptionStyle` 전달 |
| `src/fsd/entities/uploaded-file/model/types.ts` | `UploadedFileDetail`에 `captionStyle: UploadedFile["captionStyle"]` 추가(+`UploadedFile` 타입 임포트) |
| `src/fsd/entities/uploaded-file/api/index.ts` | `getUploadedFileDetailsById`·`findUploadedFileReviewState`의 `select`에 `captionStyle: true` 추가 |
| `src/fsd/entities/clip-draft/api/index.ts` | `createCustomClipDraft` args에 `captionStyle?: CaptionStyle | null` 추가·null 아니면 시드(③) |
| `src/fsd/features/clip-review/api/index.ts` | `addCustomClipDraft`가 `file.captionStyle`을 `createCustomClipDraft`에 전달(③)·`CaptionStyle` 타입 임포트 |

`area`에 없는 `features/clip-review/api`를 건드린다 — 백로그 ③이 지목한 `createCustomClipDraft`(clip-draft 엔티티)를 스냅샷으로 시드하려면 그 유일한 호출부이기 때문이다. `apps/web/src` 안이라 쓰기 범위 안이다.

## 구현 스케치

### 1. 순수 함수 추출 (신규 `model/caption-style-from-json.ts`)

`ClipDraftCard.tsx:36-50`의 지역 함수를 그대로 옮기되 export한다. **입력 타입은 넓히지 않는다** — 스키마에서 `ClipDraft.captionStyle`(`packages/db/prisma/schema.prisma:194`)과 `UploadedFile.captionStyle`(`:98`)이 둘 다 `Json?`이라 생성 클라이언트에서 같은 `JsonValue | null`이고(`packages/db/generated/prisma/index.d.ts:5801`·`:8465`), 유니온으로 쓰면 `@typescript-eslint/no-duplicate-type-constituents`가 `next lint`를 깨뜨린다(계획 검증에서 실측 — `npm run check` EXIT 1). 한쪽 타입이 두 입력을 이미 덮으므로 `ClipDraft["captionStyle"]` 하나로 둔다.

> `UploadedFile` 타입 임포트도 이 파일에는 필요 없다 — 아래 블록의 첫 줄은 `import type { ClipDraft } from "@repo/db";`다.

```ts
import type { ClipDraft } from "@repo/db";
import {
  CAPTION_STYLE_OPTIONS,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";

// draft.captionStyle / uploadedFile.captionStyle(Prisma JsonValue) → shared CaptionStyle 강제 변환의
// 단일 지점. 필드가 늘기 전에 저장된 행에는 신규 키가 없다. 그대로 다이얼로그에 넣으면
// 아무것도 고치지 않고 Apply 했을 때 zod(required-but-nullable)가 거부하므로 누락 키를
// null(= 백엔드 언어별 기본값)로 채운다.
export function toCaptionStyle(
  raw: ClipDraft["captionStyle"],
): CaptionStyle | null {
  if (raw === null || raw === undefined) return null;
  // Partial로 받는다 — 저장된 행에 신규 키가 없을 수 있다는 사실을 타입에도
  // 남겨야 아래 기본값이 죽은 코드로 취급되지 않는다.
  const stored = raw as Partial<CaptionStyle>;
  return {
    position: stored.position ?? CAPTION_STYLE_OPTIONS.DEFAULT_POSITION,
    fontSize: stored.fontSize ?? null,
    color: stored.color ?? null,
    maxWordsPerLine: stored.maxWordsPerLine ?? null,
    outlineColor: stored.outlineColor ?? null,
    outlineWidth: stored.outlineWidth ?? null,
    uppercase: stored.uppercase ?? null,
  };
}
```

> 판정 본문은 `ClipDraftCard.tsx:32-50`과 동일하다 — 가드·`??` 채움·`as Partial<CaptionStyle>` 캐스트·내부 주석까지 그대로다. **표면은 두 군데 다르다**(기계 대조 실측): `export`가 붙었고, 선두 주석이 두 입력(드래프트·스냅샷)을 함께 가리키도록 다시 감쌌으며 그에 맞춰 시그니처가 prettier 폭으로 여러 줄이 됐다. 동작 차이는 없다. 스냅샷도 같은 `JsonValue | null`이라 타입을 넓힐 필요가 없다(위 문단).

`ClipDraftCard.tsx`에서 지역 함수(`:32-50`)와 그 주석을 삭제하고 임포트한다. **같이 `CAPTION_STYLE_OPTIONS` 임포트도 지운다**(`:9`) — 그 상수의 이 파일 안 유일한 사용처가 방금 지운 `:42` `position: stored.position ?? CAPTION_STYLE_OPTIONS.DEFAULT_POSITION,`이라(여집합 열거로 확인) 남기면 `'CAPTION_STYLE_OPTIONS' is defined but never used`로 `next lint`가 경고를 낸다. 같은 임포트 무리의 `CLIP_DURATION_LIMITS`·`CaptionStyle`·`isClipDurationWithinLimits`는 다른 곳에서 쓰이므로 남긴다.

```ts
// ClipDraftCard.tsx 상단 ../../model/* 임포트 무리에 추가
import { toCaptionStyle } from "../../model/caption-style-from-json";
```

### 2. 훅에 저장-기본값 뮤테이션 (`use-clip-draft-review.ts`)

임포트 추가(설정 화면과 같은 경로). `~/fsd/features/settings/api`는 **딥 임포트가 아니라 public entry**다 — 경계 검사 W6(`apps/web/scripts/verify-fsd-boundaries.mjs:209-212` — `apps/admin`에도 동명 파일이 있으니 web 쪽이다)이 `features`의 `api/index.ts`를 세 종류 public entry 중 하나로 통과시키고(셀프테스트 `apps/web/scripts/verify-fsd-boundaries.test.mjs:111-119`가 동형 임포트에 위반 0을 단언), 이 슬라이스의 루트 배럴은 `export {};`뿐이라(`features/settings/index.ts:1-3`, "소비자는 `~/fsd/features/settings/api`로 임포트한다") 배럴 경유는 애초에 불가능하다. 위젯→features 방향은 W1 위반이 아니며 이 훅이 이미 `clip-review`·`upload`·`caption-style`을 그렇게 쓴다:

```ts
import { saveDefaultCaptionStyle } from "~/fsd/features/settings/api";
```

`applyStyleMutation` 근처에 뮤테이션 추가:

```ts
// 다이얼로그의 "Save as my default" — 작업본을 사용자 기본 캡션 스타일로 저장한다.
// 설정 화면 handleSaveCaption과 같은 서버 액션·계측을 쓰되, source로 진입점을 구분한다.
//
// ⚠️ style에 null을 넘기지 않는다. saveDefaultCaptionStyle(null)은 "저장 안 함"이 아니라
//    기본값 비우기이고(설정 화면 handleResetCaption:117-131이 그 용법), 이 버튼 이름과
//    토스트는 정반대를 말한다. 호출부(§5)가 working === null일 때 비활성으로 막지만,
//    타입이 null을 허용하는 것은 계측 matchPresetId(null) 경로와 시그니처를 맞추기
//    위해서일 뿐이다 — 새 호출자를 붙일 때 이 주석을 먼저 읽는다.
const saveDefaultMutation = useMutation({
  mutationFn: async (style: CaptionStyleInput | null) => {
    const result = await saveDefaultCaptionStyle(style);
    if (!result.success) {
      throw new Error(result.error);
    }
  },
  onSuccess: (_data, style) => {
    // 계측은 fire-and-forget(저장은 이미 성공). preset = matchPresetId 결과.
    void trackAnalyticsEvent(
      "settings_defaults_saved",
      { source: "review_dialog", preset: matchPresetId(style) },
      { path: REVIEW_ANALYTICS_PATH },
    );
    toast.success("Saved as your default caption style");
  },
  onError: (error) => {
    toast.error(
      error instanceof Error ? error.message : "Failed to save default",
    );
  },
});
```

반환 객체에 추가(`return { ... }` 안, `isApplyingToAll` 근처):

```ts
saveCaptionStyleAsDefault: (style: CaptionStyleInput | null) => {
  saveDefaultMutation.mutate(style);
},
isSavingDefault: saveDefaultMutation.isPending,
```

`CaptionStyleInput`(= `CaptionStyle`, `caption-style-schema.ts:44`)·`useMutation`·`toast`·`trackAnalyticsEvent`·`matchPresetId`·`REVIEW_ANALYTICS_PATH`는 이미 이 파일에 있다.

### 3. 위젯 (`ui/index.tsx`)

임포트를 `ClipDraft`에서 `ClipDraft, UploadedFile`로(`:5`):

```ts
import type { ClipDraft, UploadedFile } from "@repo/db";
```

props 인터페이스에 추가(`:36-42`):

```ts
  // 업로드 스냅샷(User.defaultCaptionStyle 캡처). Reset이 이 값으로 되돌린다.
  uploadCaptionStyle: UploadedFile["captionStyle"];
```

함수 파라미터·훅 구조분해에 반영:

```ts
export default function ClipDraftReviewSection({
  uploadedFileId,
  clipDrafts,
  targetClipCount,
  currentUserCredits,
  language,
  uploadCaptionStyle,
}: ClipDraftReviewSectionProps) {
```

```ts
// 훅 구조분해(:108-122)에 추가
    saveCaptionStyleAsDefault,
    isSavingDefault,
```

카드 렌더(`:445-460`)에 세 prop 추가:

```tsx
              uploadCaptionStyle={uploadCaptionStyle}
              onSaveAsDefault={saveCaptionStyleAsDefault}
              isSavingDefault={isSavingDefault}
```

### 4. 카드 (`ClipDraftCard.tsx`)

임포트를 넓힌다(`:4`): `import type { ClipDraft, UploadedFile } from "@repo/db";`

props 인터페이스(`:52-64`)에 추가:

```ts
  uploadCaptionStyle: UploadedFile["captionStyle"];
  onSaveAsDefault: (style: CaptionStyle | null) => void;
  isSavingDefault: boolean;
```

구조분해(`:70-82`)에 `uploadCaptionStyle`·`onSaveAsDefault`·`isSavingDefault` 추가. 다이얼로그(`:540-552`)에 전달:

```tsx
        snapshotValue={toCaptionStyle(uploadCaptionStyle)}
        onSaveAsDefault={onSaveAsDefault}
        isSavingDefault={isSavingDefault}
```

### 5. 다이얼로그 (`CaptionStyleDialog.tsx`)

props 인터페이스(`:18-31`)에 추가:

```ts
  // Reset이 되돌릴 대상 — 업로드 스냅샷(null이면 언어 기본값).
  snapshotValue: CaptionStyle | null;
  onSaveAsDefault: (style: CaptionStyle | null) => void;
  isSavingDefault: boolean;
```

구조분해에 셋 추가. 푸터를 좌측 2개 그룹으로 바꾼다(`:81-124`):

**before** (`:81-90`):

```tsx
        <DialogFooter className="sm:justify-between">
          {/* 작업본만 비운다. 저장(= 언어 기본값으로 리셋)은 Apply가 한다. */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setWorking(null)}
          >
            Reset style
          </Button>
```

**after**:

```tsx
        <DialogFooter className="sm:justify-between">
          {/* 좌측은 "기본값 관리"(Reset·Save as default), 우측은 "이 클립에 적용". */}
          <div className="flex gap-2">
            {/* Reset은 업로드 스냅샷으로 되돌린다(FEAT-50). 스냅샷이 null이면
                지금까지처럼 언어 기본값이다. 저장은 Apply/Save가 한다. */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setWorking(snapshotValue)}
            >
              Reset style
            </Button>
            {/* 마음에 드는 스타일을 이 순간 사용자 기본값으로 캡처한다.
                계측·토스트는 훅(saveCaptionStyleAsDefault)이 발신한다.
                working === null 가드는 Apply to all clips(:104·:106)와 같은 형태다 —
                null을 그대로 보내면 saveDefaultCaptionStyle이 기본값을 "비운다"(설정
                화면 handleResetCaption:120이 그 용법). 버튼 이름과 반대 동작이 된다. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isSavingDefault || working === null}
              onClick={() => {
                if (working === null) return;
                onSaveAsDefault(working);
              }}
            >
              Save as my default
            </Button>
          </div>
```

우측 그룹(`:91-123` Cancel·Apply to all clips·Apply)은 그대로 둔다.

### 6. DTO 타입 (`entities/uploaded-file/model/types.ts`)

임포트(`:1`): `import type { Clip, ClipDraft, UploadedFile } from "@repo/db";`

`UploadedFileDetail`(`:27-48`)에 추가:

```ts
  /** 업로드 시점 User.defaultCaptionStyle 스냅샷. 검토 Reset이 이 값으로 되돌린다(FEAT-50). */
  captionStyle: UploadedFile["captionStyle"];
```

### 7. 엔티티 read (`entities/uploaded-file/api/index.ts`)

`getUploadedFileDetailsById`의 `select`(`:306-329`)에 `captionStyle: true,` 추가 — `...fileData` 스프레드(`:340`)가 DTO로 옮긴다.

`findUploadedFileReviewState`의 `select`(`:472-485`)에 `captionStyle: true,` 추가(③ — 커스텀 클립 시드용).

> **앵커 주의**: 이 파일에서 `where: { id: uploadedFileId, userId },` + `select: {` 조합은 **여덟 번** 나온다(계획 검증 실측). 줄번호로 찾지 말고 **함수명으로** 연 뒤 그 안의 `select`를 고친다. 두 대상의 고유 식별줄은 각각 `displayName: true,` 다음 줄이 `createdAt: true,`인 쪽(detail)과 `reviewAttempt: true,` 다음 줄이 `transcriptS3Key: true,`인 쪽(reviewState)이며 둘 다 파일에서 1회뿐이다. `findUploadedFileForDeletion`(`:492` 부근)을 포함한 나머지 여섯은 건드리지 않는다.

### 8. 커스텀 클립 시드 (`entities/clip-draft/api/index.ts`)

`createCustomClipDraft`(`:117-148`) args에 `captionStyle` 추가, AI persist 경로(`functions.ts:948`)와 동형으로 시드:

```ts
export async function createCustomClipDraft(
  uploadedFileId: string,
  attempt: number,
  args: {
    startSeconds: number;
    endSeconds: number;
    captionStyle?: CaptionStyle | null;
  },
) {
  return db.$transaction(async (tx) => {
    const aggregate = await tx.clipDraft.aggregate({
      where: { uploadedFileId, attempt },
      _max: { index: true },
    });

    const nextIndex = (aggregate._max.index ?? -1) + 1;

    return tx.clipDraft.create({
      data: {
        uploadedFileId,
        attempt,
        index: nextIndex,
        aiStartSeconds: args.startSeconds,
        aiEndSeconds: args.endSeconds,
        startSeconds: args.startSeconds,
        endSeconds: args.endSeconds,
        selected: true,
        // 업로드 스냅샷이 있으면 시드(AI 드래프트 persist-clip-drafts와 동형). null이면
        // 필드 생략 → 컬럼 null → 렌더 시 언어 기본값. FEAT-50에서 기존 "커스텀은 항상 null"
        // 의도(functions.ts 주석)를 뒤집었다.
        ...(args.captionStyle != null
          ? { captionStyle: args.captionStyle as Prisma.InputJsonValue }
          : {}),
      },
      select: { id: true },
    });
  });
}
```

`CaptionStyle`(`:6`)·`Prisma`(`:4`)는 이미 임포트돼 있다.

### 9. 커스텀 클립 서버 액션 (`features/clip-review/api/index.ts`)

임포트는 **추가하지 않는다.** 이 파일은 이미 `type CaptionStyleInput`을 `../model/schemas`에서 가져오고 있고(`:20`), 그것이 곧 `CaptionStyle`이다(`caption-style-schema.ts:44` `export type CaptionStyleInput = CaptionStyle;`). 같은 타입을 `~/fsd/shared/config/constants`에서 한 번 더 가져오면 이름만 둘인 동의어가 된다. `createCustomClipDraft` 호출(`:140-143`):

```ts
    const created = await createCustomClipDraft(file.id, file.reviewAttempt, {
      startSeconds,
      endSeconds,
      // 렌더 경로·AI persist와 같은 캐스트(entities/clip-draft/api:111, functions.ts:378).
      // 타입은 이 파일에 이미 있는 CaptionStyleInput(:20)이다 — CaptionStyle을 새로
      // 임포트하면 동의어가 둘이 되고, 임포트 없이 그 이름을 쓰면 error 타입이 되어
      // no-unsafe-assignment로 next lint가 깨진다(계획 검증에서 실측).
      captionStyle: file.captionStyle as CaptionStyleInput | null,
    });
```

## 테스트

- **덮는 것**: `caption-style-from-json.test.mjs` — `toCaptionStyle`의
  - `null` → `null`, `undefined` → `null`
  - 부분 객체(신규 키 누락, 예: `{ color: "#ffffff" }`) → `position: "middle"`(DEFAULT_POSITION)·나머지 신규 키 `null`·기존 값 보존
  - 완전 객체 → 전 필드 통과
  - `position`이 있는 객체 → 그 값 유지(기본값이 덮지 않음)
  - **falsy 값 보존: `{ uppercase: false }` → `uppercase: false`** (null이 아니다). `??`를 `||`로 바꾼 구현은 위 네 케이스를 **전부 통과한다**(계획 검증 돌연변이 실측 — 변이 9개 중 유일한 생존). 도달 가능한 입력이다: `CaptionStyle.uppercase`는 `boolean | null`이고(`shared/config/constants.ts:126`) 저장되는 프리셋 `clean-white`·`mint-pop`이 `uppercase: false`를 싣는다(`:145`·`:181`) — 칩 한 번으로 만들어지는 값이다. `||`가 그 `false`를 `null`로 갈아치우면 백엔드 언어 기본값으로 렌더되는데, 화면에는 "기본값이 적용된 모습"으로 보여 사용자는 크레딧을 쓴 뒤에야 안다. `outlineWidth: 0`은 `captionStyleSchema`의 `.int()`와 프리셋 범위(1~5)상 UI로 도달하지 않으므로 케이스로 두지 않는다.

  이 함수는 ②가 Reset 대상(스냅샷)과 initialValue(드래프트) **둘 다** 통과시키는 지점이라, 누락 키 채움이 깨지면 스냅샷/드래프트가 zod에서 거부되거나 위치가 뒤집힌다.

- **못 덮는 범위**(현재 러너로 확인 불가 — 전부 배포 후 육안):
  - 다이얼로그 렌더·다섯 버튼 배치, Reset 클릭이 `working`을 스냅샷으로 실제 세팅하는지 (DOM 없음)
  - `saveDefaultCaptionStyle` 서버 액션·`User.defaultCaptionStyle` 쓰기, 저장값이 설정 화면·다음 업로드에 반영되는지 (DB 없음)
  - `settings_defaults_saved`(`source: "review_dialog"`) 계측이 admin 분석에 기록되는지 (fire-and-forget I/O)
  - 스냅샷이 DTO→위젯→카드→다이얼로그로 흐르는지 (렌더 배선)
  - 커스텀 클립이 스냅샷으로 시드돼 렌더되는지 (DB write + 렌더)

  새 테스트 파일이 하나 늘므로 `apps/web/CLAUDE.md` 테스트 목록 표에 행이 필요하다 — 그 파일은 읽기 전용이라 구현 단계에서 `비고:`로 추가할 행을 보고한다.

## 검증 게이트

`npm run check -w apps/web`(= `verify:fsd:test` → `verify:fsd` → `next lint` → `tsc --noEmit`)와 `npm test -w apps/web`. 계획 검증에서 이 스케치를 격리 워크트리에 기계 적용해 실제로 돌렸고(편집 전부 유일 앵커, 손 개입 0), 그때 걸린 것이 셋이다. **셋의 성격이 다르므로 나눠 적는다** — 묶으면 셋째가 게이트에 막힐 것처럼 읽힌다.

**게이트가 막는 둘 (ERROR — `next lint` 종료코드 1)**

1. `toCaptionStyle` 입력을 두 모델의 유니온으로 쓰면 `no-duplicate-type-constituents`(§1 — 같은 `JsonValue | null`이라 유니온이 성립하지 않는다)
2. `features/clip-review/api`에서 임포트 없는 `CaptionStyle`을 캐스트에 쓰면 `no-unsafe-assignment`(§9 — 그 파일의 이름은 `CaptionStyleInput`이다)

**게이트가 막지 않는 하나 (WARNING — 통과한다)**

3. 지역 함수를 들어낸 뒤 `CAPTION_STYLE_OPTIONS` 임포트를 남기면 `no-unused-vars`(§1). 이건 **경고일 뿐이라 `check`를 세우지 못한다** — `apps/web/eslint.config.js:27-30`이 그 규칙을 `"warn"`으로 낮추고 `check`의 `next lint`에는 `--max-warnings`가 없다. `tsc --noEmit`도 못 잡는다(`apps/web/tsconfig.json`에 `noUnusedLocals`가 없고 `extends`도 없다 — `strict: true`뿐). 즉 **§1의 임포트 제거 지시를 잊으면 아무 게이트도 알려주지 않는다.** 이 한 줄은 자동 방어선이 없으니 구현자가 지켜야 지켜진다.

`verify:fsd`는 통과한다 — 워크트리 실측으로 확인했다(W6 public entry 판정, §2).

## 범위 밖 의존

없음. `captionStyle` 컬럼은 `UploadedFile`(FEAT-42)·`ClipDraft`(AI 시드가 사용) 양쪽에 이미 있어 스키마·마이그레이션·백엔드 변경이 없고, 고칠 파일 11개가 모두 `apps/web/src` 안이다.

## 대안

- **③ 커스텀 클립을 시드하지 않는다(현행 유지)** — FEAT-41/42의 "render는 드래프트 스타일만"(`functions.ts:946-947`) 결정을 존중하고 변경 면적을 줄인다. 사용자는 ②의 Reset으로 스냅샷에 도달할 수 있다. 그러나 커스텀 클립이 형제 AI 클립과 다른 스타일로 렌더되는 **조용한 불일치**가 남는다 — 크레딧을 쓴 뒤에야 보인다. 백로그 ③이 "재판정"을 명시했으므로 **일관성을 위해 시드하는 쪽을 택했다.** 문서화된 이전 결정을 뒤집는 것이라 검토에서 소유자가 거부할 수 있게 이 절과 §8 주석에 드러냈다.
- **저장 로직을 다이얼로그에 직접 둔다** — 다이얼로그가 `saveDefaultCaptionStyle`·`matchPresetId`·`trackAnalyticsEvent`·`toast`를 직접 부른다(설정 화면처럼). prop threading이 준다. 그러나 이 위젯은 서버 호출·계측을 훅에 모으고(카드 주석 `ClipDraftCard`가 아니라 `use-clip-draft-review.ts:101-102`: "카드는 저장 성공을 관찰하지 못하므로 훅에서 발화") 카드/다이얼로그는 콜백만 부른다. `onApplyToAll`/`isApplyingToAll`이 이미 위젯→카드→다이얼로그로 흐르는 선례가 있어 **훅 중앙화**를 택했다.
- **「Save as my default」를 우측 그룹(Apply 옆)에 둔다** — Apply 액션들과 시각적으로 붙지만, 이 버튼은 "이 클립에 적용"이 아니라 "내 기본값 관리"라 Reset과 의미가 같다. 그래서 **좌측 그룹**에 뒀다.
- **Reset 라벨을 바꾼다** — "Reset style"이 이제 언어 기본값이 아니라 업로드 스냅샷으로 되돌리므로 "Reset to upload default" 같은 라벨도 가능하다. 스냅샷이 null일 땐 여전히 언어 기본값이라 어느 라벨도 완전히 정확하진 않고, 사용자 문구 변경을 최소화하려고 **"Reset style"을 유지**하되 주석으로 의미 변화를 남긴다.
