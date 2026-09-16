# FEAT-50: 검토 화면에서 캡션 기본값 캡처 — 다이얼로그 「내 기본으로 저장」·Reset을 업로드 스냅샷으로

agent: web-dev

## 현재 동작

검토 화면의 캡션 스타일 다이얼로그(`widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx`)는 작업본(`working`)만 편집한다.

- 열릴 때 `initialValue`(카드가 넘긴 드래프트의 저장 스타일)로 `working`을 시드한다(`CaptionStyleDialog.tsx:48`, 재시드 `:52-59`).
- 푸터 버튼은 **넷**이다(`:81-124`): Reset style(`:83-90`) · Cancel(`:92-99`) · Apply to all clips(`:100-112`) · Apply(`:113-122`). Reset은 `:87` `onClick={() => setWorking(null)}`로 **언어 기본값**(null)으로 되돌린다.
- 다이얼로그는 업로드 스냅샷을 모른다 — props는 `initialValue`·`playUrl`·구간·`words`·`onApply`·`onApplyToAll`·`isApplyingToAll`뿐이다(`:18-31`).

카드(`ClipDraftCard.tsx`)가 다이얼로그를 렌더한다.

- `toCaptionStyle(raw)`가 Prisma JsonValue → shared `CaptionStyle`로 강제 변환한다 — 누락 키를 `DEFAULT_POSITION`·`null`로 채운다(`ClipDraftCard.tsx:36-50`). 카드 내부 지역 함수이고 export·테스트되지 않는다.
- 다이얼로그에 `initialValue={toCaptionStyle(draft.captionStyle)}`를 넘긴다(`:544`). 업로드 스냅샷은 받지도, 넘기지도 않는다.
- `onApplyToAll`·`isApplyingToAll`을 위젯에서 받아 다이얼로그로 흘린다(`:550-551`) — 위젯→카드→다이얼로그 threading의 기존 선례.

위젯(`ui/index.tsx`)이 데이터를 카드로 흘린다.

- `useClipDraftReview`에서 액션·플래그를 구조분해한다(`ui/index.tsx:108-122`).
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

1. 다이얼로그에 작업본을 사용자 기본값으로 저장하는 진입점이 없다 — `saveDefaultCaptionStyle`은 설정 화면(`pages/settings/ui/index.tsx:103`)에서만 호출된다. 계측 `settings_defaults_saved`의 `source: "review_dialog"`는 계약에 예고돼 있으나(`metadata.ts:59`) 아무도 발신하지 않는다.
2. Reset(`CaptionStyleDialog.tsx:87`)은 **언어 기본값**(null)으로 되돌린다 — 사용자가 이 업로드에 걸어 둔 캡션 기본값(업로드 스냅샷)으로 돌아갈 수 없다. 스냅샷은 DTO/props 어디에도 흐르지 않는다(`types.ts:27-48`, `ui/index.tsx:36-42`).
3. 커스텀 클립은 스냅샷으로 시드되지 않아(`functions.ts:946-947`) AI 형제 클립이 사용자 기본값으로 렌더될 때 혼자 언어 기본값으로 렌더된다 — 조용한 불일치. 백로그 ③은 이 결정의 **재판정**을 요구한다.

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

`ClipDraftCard.tsx:36-50`의 지역 함수를 그대로 옮기되 export하고, 스냅샷(같은 `Prisma.JsonValue`)도 받도록 입력 타입을 넓힌다.

```ts
import type { ClipDraft, UploadedFile } from "@repo/db";
import {
  CAPTION_STYLE_OPTIONS,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";

// draft.captionStyle / uploadedFile.captionStyle(Prisma JsonValue) → shared CaptionStyle 강제 변환의
// 단일 지점. 필드가 늘기 전에 저장된 행에는 신규 키가 없다. 그대로 다이얼로그에 넣으면
// 아무것도 고치지 않고 Apply 했을 때 zod(required-but-nullable)가 거부하므로 누락 키를
// null(= 백엔드 언어별 기본값)로 채운다.
export function toCaptionStyle(
  raw: ClipDraft["captionStyle"] | UploadedFile["captionStyle"],
): CaptionStyle | null {
  if (raw === null || raw === undefined) return null;
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

> 반환 본문 7줄은 `ClipDraftCard.tsx:41-49`를 한 글자도 바꾸지 않고 옮긴 것이다 — 입력 타입만 스냅샷(`UploadedFile["captionStyle"]`)을 받도록 넓혔다.

`ClipDraftCard.tsx`에서 지역 함수(`:32-50`)와 그 주석을 삭제하고 임포트한다.

```ts
// ClipDraftCard.tsx 상단 ../../model/* 임포트 무리에 추가
import { toCaptionStyle } from "../../model/caption-style-from-json";
```

### 2. 훅에 저장-기본값 뮤테이션 (`use-clip-draft-review.ts`)

임포트 추가(설정 화면과 동일한 딥 임포트 — features 공개 엔트리 `api`, 위젯→features 허용):

```ts
import { saveDefaultCaptionStyle } from "~/fsd/features/settings/api";
```

`applyStyleMutation` 근처에 뮤테이션 추가:

```ts
// 다이얼로그의 "Save as my default" — 작업본을 사용자 기본 캡션 스타일로 저장한다.
// 설정 화면 handleSaveCaption과 같은 서버 액션·계측을 쓰되, source로 진입점을 구분한다.
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
                계측·토스트는 훅(saveCaptionStyleAsDefault)이 발신한다. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isSavingDefault}
              onClick={() => onSaveAsDefault(working)}
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

임포트(`:13-16`)에 `type CaptionStyle` 추가. `createCustomClipDraft` 호출(`:140-143`):

```ts
    const created = await createCustomClipDraft(file.id, file.reviewAttempt, {
      startSeconds,
      endSeconds,
      // 렌더 경로·AI persist와 같은 캐스트(entities/clip-draft/api:111, functions.ts:378).
      captionStyle: file.captionStyle as CaptionStyle | null,
    });
```

## 테스트

- **덮는 것**: `caption-style-from-json.test.mjs` — `toCaptionStyle`의
  - `null` → `null`, `undefined` → `null`
  - 부분 객체(신규 키 누락, 예: `{ color: "#ffffff" }`) → `position: "middle"`(DEFAULT_POSITION)·나머지 신규 키 `null`·기존 값 보존
  - 완전 객체 → 전 필드 통과
  - `position`이 있는 객체 → 그 값 유지(기본값이 덮지 않음)

  이 함수는 ②가 Reset 대상(스냅샷)과 initialValue(드래프트) **둘 다** 통과시키는 지점이라, 누락 키 채움이 깨지면 스냅샷/드래프트가 zod에서 거부되거나 위치가 뒤집힌다.

- **못 덮는 범위**(현재 러너로 확인 불가 — 전부 배포 후 육안):
  - 다이얼로그 렌더·다섯 버튼 배치, Reset 클릭이 `working`을 스냅샷으로 실제 세팅하는지 (DOM 없음)
  - `saveDefaultCaptionStyle` 서버 액션·`User.defaultCaptionStyle` 쓰기, 저장값이 설정 화면·다음 업로드에 반영되는지 (DB 없음)
  - `settings_defaults_saved`(`source: "review_dialog"`) 계측이 admin 분석에 기록되는지 (fire-and-forget I/O)
  - 스냅샷이 DTO→위젯→카드→다이얼로그로 흐르는지 (렌더 배선)
  - 커스텀 클립이 스냅샷으로 시드돼 렌더되는지 (DB write + 렌더)

  새 테스트 파일이 하나 늘므로 `apps/web/CLAUDE.md` 테스트 목록 표에 행이 필요하다 — 그 파일은 읽기 전용이라 구현 단계에서 `비고:`로 추가할 행을 보고한다.

## 범위 밖 의존

없음. `captionStyle` 컬럼은 `UploadedFile`(FEAT-42)·`ClipDraft`(AI 시드가 사용) 양쪽에 이미 있어 스키마·마이그레이션·백엔드 변경이 없고, 고칠 파일 11개가 모두 `apps/web/src` 안이다.

## 대안

- **③ 커스텀 클립을 시드하지 않는다(현행 유지)** — FEAT-41/42의 "render는 드래프트 스타일만"(`functions.ts:946-947`) 결정을 존중하고 변경 면적을 줄인다. 사용자는 ②의 Reset으로 스냅샷에 도달할 수 있다. 그러나 커스텀 클립이 형제 AI 클립과 다른 스타일로 렌더되는 **조용한 불일치**가 남는다 — 크레딧을 쓴 뒤에야 보인다. 백로그 ③이 "재판정"을 명시했으므로 **일관성을 위해 시드하는 쪽을 택했다.** 문서화된 이전 결정을 뒤집는 것이라 검토에서 소유자가 거부할 수 있게 이 절과 §8 주석에 드러냈다.
- **저장 로직을 다이얼로그에 직접 둔다** — 다이얼로그가 `saveDefaultCaptionStyle`·`matchPresetId`·`trackAnalyticsEvent`·`toast`를 직접 부른다(설정 화면처럼). prop threading이 준다. 그러나 이 위젯은 서버 호출·계측을 훅에 모으고(카드 주석 `ClipDraftCard`가 아니라 `use-clip-draft-review.ts:101-102`: "카드는 저장 성공을 관찰하지 못하므로 훅에서 발화") 카드/다이얼로그는 콜백만 부른다. `onApplyToAll`/`isApplyingToAll`이 이미 위젯→카드→다이얼로그로 흐르는 선례가 있어 **훅 중앙화**를 택했다.
- **「Save as my default」를 우측 그룹(Apply 옆)에 둔다** — Apply 액션들과 시각적으로 붙지만, 이 버튼은 "이 클립에 적용"이 아니라 "내 기본값 관리"라 Reset과 의미가 같다. 그래서 **좌측 그룹**에 뒀다.
- **Reset 라벨을 바꾼다** — "Reset style"이 이제 언어 기본값이 아니라 업로드 스냅샷으로 되돌리므로 "Reset to upload default" 같은 라벨도 가능하다. 스냅샷이 null일 땐 여전히 언어 기본값이라 어느 라벨도 완전히 정확하진 않고, 사용자 문구 변경을 최소화하려고 **"Reset style"을 유지**하되 주석으로 의미 변화를 남긴다.
