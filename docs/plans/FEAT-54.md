# FEAT-54: 캡션 기본값을 언어별로

agent: main-loop

> **담당이 main-loop인 이유**: `packages/db`(스키마·마이그레이션)는 어느 dev도 쓰지 못한다.
> 백로그가 「마이그레이션만 떼어낼지는 계획 단계 판단」으로 남겼고, **쪼개지 않기로 했다**
> (2026-09-23 소유자 결정) — 스키마·데이터 이동·업로드 스냅샷·설정 화면이 한 덩어리라
> 나누면 그 경계에서 배포 순서가 깨진다.

## 현재 동작

**저장은 한 칸이다.** `packages/db/prisma/schema.prisma`의 `model User`에
`    defaultCaptionStyle         Json?` 하나뿐이고 언어를 모른다. 그 위 주석은
「검증은 `captionStyleSchema` 한 곳 · `UploadedFile.captionStyle`과 같은 `CaptionStyle` 모양」이라고
못박는다.

**기본값은 언어마다 다르다** — `apps/web/src/fsd/shared/config/constants.ts`의
`DEFAULT_FONT_SIZE: { English: 122, Korean: 130 }` · `DEFAULT_MAX_WORDS: { English: 5, Korean: 3 }` ·
`DEFAULT_OUTLINE_WIDTH: { English: 1.1, Korean: 1.3 }`.

**프리셋은 그걸 피해 간다** — `CAPTION_STYLE_PRESETS` 넷이 전부 `fontSize: null`·`maxWordsPerLine: null`이다.
「언어가 정해야 할 값은 프리셋이 손대지 않는다」가 이미 선 설계다.

### 이 컬럼을 만지는 곳 — 전수 (grep, 생성 클라이언트 제외)

| 자리 | 하는 일 |
| --- | --- |
| `entities/user/api/index.ts:167-172` `getUserDefaultCaptionStyle` | `select: { defaultCaptionStyle: true }` — **읽기 단일 창구** |
| `entities/user/api/index.ts:174-184` `updateUserDefaultCaptionStyle` | `data: { defaultCaptionStyle: style ?? Prisma.JsonNull }` — **쓰기 단일 창구** |
| `features/settings/api/index.ts` `saveDefaultCaptionStyle` | `captionStyleSchema` 검증 뒤 위 쓰기 호출 |
| `features/upload/api/index.ts:243-254` | 업로드 시점에 읽어 `createUploadDraft`의 `captionStyle:`로 스냅샷 고정 |
| `app/dashboard/settings/page.tsx:19-27` | 읽어서 `SettingsView`의 `initialCaptionStyle`로 |
| `app/dashboard/page.tsx:36-52` | 읽어서 `DashboardView`의 `defaultCaptionStyle`로 |
| `pages/dashboard/ui/index.tsx:46·55·131` | 그대로 `UploadPodcast`에 전달 |
| `pages/dashboard/ui/_component/UploadPodcast.tsx:68·74·302` | `captionStyleLabel(defaultCaptionStyle)`로 **업로드 폼의 `Video style:` 라벨** |
| `pages/settings/ui/index.tsx:58-60` | `captionStyle` 상태 |
| `pages/settings/ui/index.tsx:63-65` | `previewLanguage` 상태 — **미리보기 전용, 저장 안 함**(FEAT-52 관측 4) |
| `pages/settings/ui/index.tsx:106-120` `handleSaveCaption` | 저장 + `settings_defaults_saved` 계측(`preset`) |
| `pages/settings/ui/index.tsx:122-` `handleResetCaption` | `null`로 비우기 |
| `pages/settings/ui/index.tsx:260-269` | `CaptionStyleEditor`에 `language={previewLanguage}` · `value={captionStyle}` |
| `entities/uploaded-file/api/index.ts:112` | 주석 — 「`User.defaultCaptionStyle` 스냅샷」 |
| `shared/config/caption-style-schema.ts:7` | 주석 — 「`User.defaultCaptionStyle` / `UploadedFile.captionStyle` JSON의」 |

**하류는 단일 값이다.** `UploadedFile.captionStyle` → render 요청 `caption_style` →
백엔드 `select_caption_style` → `resolve_caption_style`. **이 항목은 하류를 건드리지 않는다.**

### 실측 (2026-09-23, 프로덕션 Neon)

```
User 전체                          7
defaultCaptionStyle IS NOT NULL    0
defaultLanguage = 'Korean'         0
```

**둘 다 0이다.** 따라서 ① 기존 행 데이터 이동은 **0행을 옮긴다**(SQL은 옳게 쓰되 실효가 없다),
② 이 항목이 고치는 버그는 **아직 아무도 물지 않았다** — 예방이다.

## 문제

`User.defaultCaptionStyle`이 한 칸이라 **언어를 모른다.** 프리셋만 고르면 문제가 없지만
(`fontSize`·`maxWordsPerLine`이 `null`이라 언어 기본값이 살아난다), `fontSize`나
`maxWordsPerLine`을 **한 번이라도 직접 건드리면** 그 값이 두 언어 모두에 적용된다 —
영어용 6단어를 고르면 한국어 자막도 6단어가 되고, 한국어 적정은 3이다.

두 언어를 다 쓰면서 커스터마이즈한 사용자에게만 나타나므로 지금까지 드러나지 않았다
(위 실측: 커스터마이즈한 사용자 **0명**).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `packages/db/prisma/schema.prisma` | `User`에 `defaultCaptionStyleEnglish`·`defaultCaptionStyleKorean` **추가**. `defaultCaptionStyle`은 **이 항목에서 지우지 않는다**(「적용 순서」) |
| `packages/db/prisma/migrations/<신규>/migration.sql` | 컬럼 둘 `ADD` + 기존 값을 언어 쪽으로 옮기는 `UPDATE` 둘 |
| `packages/db/generated/prisma/*` | `prisma generate` 산출물 — **커밋한다**(FEAT-47 `71bf498`·FEAT-53 선례) |
| `entities/user/api/index.ts` | `getUserDefaultCaptionStyle`이 **둘 다** 반환. `updateUserDefaultCaptionStyle`이 **둘 다** 쓴다 |
| `features/settings/api/index.ts` | `saveDefaultCaptionStyle`이 `{ english, korean }`을 받아 **각각** 검증 |
| `features/upload/api/index.ts` | 업로드 `language`에 맞는 쪽을 **골라** 스냅샷에 넣는다 |
| `app/dashboard/settings/page.tsx` | 둘 다 읽어 `SettingsView`에 넘긴다 |
| `app/dashboard/page.tsx` | 둘 다 읽어 `DashboardView`에 넘긴다 |
| `pages/settings/ui/index.tsx` | 상태를 둘로. `previewLanguage`를 **편집 대상 전환**으로 승격 |
| `pages/dashboard/ui/index.tsx` | prop을 둘로 전달 |
| `pages/dashboard/ui/_component/UploadPodcast.tsx` | 폼에서 **고른 언어**에 맞는 라벨을 그린다 |
| `entities/uploaded-file/api/index.ts` | 주석 `:112` 갱신 |
| `shared/config/caption-style-schema.ts` | 주석 `:7` 갱신 |

여기 없는 파일은 고치지 않는다. **하류(`UploadedFile.captionStyle` 이후)는 무변경**이다.

## 구현 스케치

### 1. 스키마 (`packages/db/prisma/schema.prisma`)

before:

```prisma
    // 검증은 captionStyleSchema(features/clip-review/model/schemas.ts) 한 곳.
    // UploadedFile.captionStyle(업로드 시점 스냅샷)과 같은 CaptionStyle 모양이다.
    defaultCaptionStyle         Json?
```

after:

```prisma
    // 검증은 captionStyleSchema(features/clip-review/model/schemas.ts) 한 곳.
    // UploadedFile.captionStyle(업로드 시점 스냅샷)과 같은 CaptionStyle 모양이다.
    // 언어마다 따로 둔다(FEAT-54) — fontSize·maxWordsPerLine의 적정값이 언어마다 달라
    // 한 칸이면 한쪽을 손대는 순간 다른 쪽이 깨진다.
    defaultCaptionStyleEnglish  Json?
    defaultCaptionStyleKorean   Json?
    // 구 단일 칸. FEAT-54가 두 칸으로 옮겼고 읽는 코드는 0이다.
    // 제거는 새 클라이언트 배포 뒤 후속 항목이 맡는다(FEAT-53과 같은 순서).
    defaultCaptionStyle         Json?
```

### 2. 마이그레이션 (`migration.sql`)

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "defaultCaptionStyleEnglish" JSONB;
ALTER TABLE "User" ADD COLUMN "defaultCaptionStyleKorean" JSONB;

-- 기존 값을 사용자의 기본 언어 쪽으로 옮긴다.
-- defaultLanguage가 NULL이면 시스템 기본(English, constants.ts DEFAULT_LANGUAGE)을 따른다.
UPDATE "User"
   SET "defaultCaptionStyleKorean" = "defaultCaptionStyle"
 WHERE "defaultCaptionStyle" IS NOT NULL
   AND "defaultLanguage" = 'Korean';

UPDATE "User"
   SET "defaultCaptionStyleEnglish" = "defaultCaptionStyle"
 WHERE "defaultCaptionStyle" IS NOT NULL
   AND ("defaultLanguage" IS NULL OR "defaultLanguage" <> 'Korean');
```

**두 `UPDATE`는 오늘 0행을 건드린다**(위 실측 — `defaultCaptionStyle` non-null이 0). 그래도 쓰는
이유는 계획과 적용 사이에 행이 생길 수 있고, SQL이 옳아야 그때도 맞기 때문이다.
`defaultLanguage`가 `'Korean'`·`NULL`·그 밖의 값 셋으로 갈리는데 **여집합이 둘째 `UPDATE`에
전부 들어간다**(`IS NULL OR <> 'Korean'`) — 어느 행도 두 컬럼에 동시에 들어가지 않고,
어느 행도 누락되지 않는다.

### 3. 읽기·쓰기 창구 (`entities/user/api/index.ts`)

```ts
export async function getUserDefaultCaptionStyle(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      defaultCaptionStyleEnglish: true,
      defaultCaptionStyleKorean: true,
    },
  });
}

export async function updateUserDefaultCaptionStyle(
  userId: string,
  styles: { english: CaptionStyle | null; korean: CaptionStyle | null },
) {
  return db.user.update({
    where: { id: userId },
    // null = 비우기(언어 기본값). Prisma는 JSON 컬럼에 명시적 null을 JsonNull로 쓴다.
    data: {
      defaultCaptionStyleEnglish: styles.english ?? Prisma.JsonNull,
      defaultCaptionStyleKorean: styles.korean ?? Prisma.JsonNull,
    },
  });
}
```

**둘 다 쓰는 이유**: 부분 갱신으로 두면 「한국어를 고치고 저장했더니 영어가 사라졌나?」를
호출부마다 따져야 한다. 화면이 둘을 함께 들고 있으므로 함께 쓰는 것이 단순하다(「대안」).

### 4. 업로드 스냅샷 (`features/upload/api/index.ts`)

before (`:243-254`):

```ts
    const { defaultCaptionStyle } = await getUserDefaultCaptionStyle(
      authResult.data.userId,
    );

    const uploadDraft = await createUploadDraft({
      ...
      captionStyle: defaultCaptionStyle, // 업로드 시점에 고정되는 스냅샷
```

after:

```ts
    const defaults = await getUserDefaultCaptionStyle(authResult.data.userId);
    // 업로드 언어에 맞는 쪽만 스냅샷에 넣는다 — 하류(UploadedFile.captionStyle →
    // render caption_style → resolve_caption_style)는 단일 값 그대로라 무변경이다.
    const snapshot =
      language === "Korean"
        ? defaults.defaultCaptionStyleKorean
        : defaults.defaultCaptionStyleEnglish;

    const uploadDraft = await createUploadDraft({
      ...
      captionStyle: snapshot, // 업로드 시점에 고정되는 스냅샷(업로드 언어 기준)
```

`language`는 같은 함수가 이미 갖고 있다(`createUploadDraft`의 `language` 인자와 같은 값).

### 5. 저장 액션 (`features/settings/api/index.ts`)

`saveDefaultCaptionStyle(input)` → `saveDefaultCaptionStyle({ english, korean })`.
검증은 **각 쪽마다** 기존과 같은 규칙으로 돈다 — `null`이면 비우기(검증 안 함),
값이 있으면 `captionStyleSchema.safeParse` 뒤 **파싱 결과**를 쓴다(원본 input이 아니라).
한쪽이라도 실패하면 **아무것도 저장하지 않고** `failure("Invalid caption style")`.

### 6. 설정 화면 (`pages/settings/ui/index.tsx`)

- 상태: `captionStyle` 하나 → `captionStyles: { english, korean }` 하나.
- `previewLanguage` → **`editLanguage`**. 라벨을 `Preview language`에서 **`Editing`**으로 바꾸고,
  그 아래 안내 `Preview only — this doesn't change your upload language.`를
  **`This picks which language you're styling — it doesn't change your upload language.`**로 바꾼다.
  **「업로드 언어를 안 바꾼다」는 문장은 유지한다** — FEAT-52 관측 4가 막은 사고 경로가 그대로 살아 있다.
- `CaptionStyleEditor`는 `language={editLanguage}` · `value={captionStyles[key]}` ·
  `onChange={(s) => setCaptionStyles((p) => ({ ...p, [key]: s }))}`
  (`key = editLanguage === "Korean" ? "korean" : "english"`).
- `handleSaveCaption` → `saveDefaultCaptionStyle(captionStyles)` (**둘 다**).
- `handleResetCaption` → 둘 다 `null`. 버튼 라벨을
  `Reset to language default` → **`Reset both languages`**로 바꾼다(무엇이 지워지는지 보이게).

### 7. 업로드 폼 라벨 (`UploadPodcast.tsx`)

prop이 `defaultCaptionStyle: CaptionStyle | null` → `defaultCaptionStyles: { english, korean }`.
`:302`는 **폼에서 고른 언어**를 따라간다:

```tsx
{captionStyleLabel(
  language === "Korean"
    ? defaultCaptionStyles.korean
    : defaultCaptionStyles.english,
)}
```

`language`는 이 컴포넌트가 이미 들고 있는 업로드 폼 상태다 — **언어를 바꾸면 라벨이 따라 바뀐다.**

### 8. 주석 둘

- `entities/uploaded-file/api/index.ts:112` `// User.defaultCaptionStyle 스냅샷 (없으면 null 컬럼)`
  → `// User.defaultCaptionStyle{English,Korean} 중 업로드 언어 쪽의 스냅샷 (없으면 null 컬럼)`
- `shared/config/caption-style-schema.ts:7` `// User.defaultCaptionStyle / UploadedFile.captionStyle JSON의`
  → `// User.defaultCaptionStyleEnglish·Korean / UploadedFile.captionStyle JSON의`
  (바로 아래 `// 공용 검증기. 두 컬럼이 …`도 **세 컬럼**으로 되돌린다 — FEAT-56이 「둘」로 고쳤는데
  이 항목이 다시 셋이 된다.)

## 테스트

- **덮는 것**: 새 순수 함수가 없다. 이 항목은 전부 **배선**(컬럼 선택·prop 전달·상태 분리)이고
  Node 러너에 DOM이 없어 설정 화면·업로드 폼의 렌더를 덮지 못한다.
  - `tsc --noEmit`이 **이 항목의 진짜 게이트**다. `getUserDefaultCaptionStyle`의 반환 모양,
    `updateUserDefaultCaptionStyle`·`saveDefaultCaptionStyle`의 인자 모양, `UploadPodcast`의 prop
    모양이 전부 바뀌므로 **호출부를 하나라도 빠뜨리면 컴파일이 깨진다.**
  - **착수 기준선을 실측해 못박는다**(요구): `npm test -w apps/web`의 숫자가 **그대로**여야 한다
    (2026-09-23 기준 `tests 170 / suites 40 / files 25` — 착수 시 재실측).
    바뀌면 이 계획 밖의 무언가가 함께 바뀐 것이다.
  - `npm run check -w apps/web` EXIT 0 · **경고 0**.
- **못 덮는 범위**(배포 후 실물):
  - 설정 화면에서 `Editing` 토글이 **편집 대상을 바꾸는가** — 한국어로 넘겨 크기를 바꾸고
    영어로 돌아왔을 때 영어 값이 그대로인지. 이 항목의 존재 이유다
  - 저장 뒤 **두 값이 각각** 남는가(새로고침 후에도)
  - 업로드 폼에서 **언어를 바꾸면 `Video style:` 라벨이 따라 바뀌는가**
  - 업로드가 **그 언어의 스냅샷**을 고정하는가 — 렌더까지 가야 보인다(크레딧)

## 범위 밖 의존

- **구 컬럼 `User.defaultCaptionStyle` 제거는 이 항목이 하지 않는다.** 새 Prisma 클라이언트가
  배포되기 전에 지우면 프로덕션의 옛 클라이언트가 없는 컬럼을 `SELECT`한다 —
  FEAT-53이 실측으로 겪은 그 순서다. **후속 항목**으로 낸다(백로그 후보).
- `apps/backend`·`apps/admin` 무변경. 하류가 단일 값 그대로라 백엔드는 이 항목을 모른다.
- **`migrate deploy`는 소유자의 별도 승인**이다(이 저장소의 상시 규칙).

## 적용 순서

**FEAT-53과 방향이 반대다.** 그때는 DROP이라 **코드 먼저**였고, 이번은 ADD라 **DB 먼저**다.

```
① 마이그레이션 적용 (ADD 둘 + UPDATE 둘)   ← 별도 승인
② 코드 커밋·푸시 → main 합류 → Vercel 배포  (새 클라이언트가 새 컬럼을 읽는다)
```

**①을 먼저 하는 이유**: 컬럼 추가는 옛 클라이언트에 무해하다(Prisma는 자기 스키마의 컬럼만
`SELECT`하므로 새 컬럼을 모른 채 계속 돈다). 반대로 ②를 먼저 하면 새 클라이언트가
**없는 컬럼을 `SELECT`해** 설정·대시보드·업로드가 동시에 깨진다.

**되돌리기**: ①만 적용된 상태는 안전하다(아무도 새 컬럼을 안 읽는다). ②가 문제면 코드만
되돌리면 된다. 데이터 이동이 0행이라 롤백에 데이터 손실이 없다.

## 대안

- **`Json` 맵 한 칸(`{english: …, korean: …}`)으로 두기 — 기각.** 맵 검증기와 부분 갱신 로직이
  새로 필요하고 `saveDefaultCaptionStyle(null)`의 「비우기」 의미가 「어느 언어를 비우나」로 흐려진다.
  `docs/plans/FEAT-38.md` 「대안」(A)가 블롭을 기각한 것과 같은 계열이고, 두 칸이면
  `captionStyleSchema`를 **모양 변경 없이 그대로** 재사용한다.
- **저장을 「활성 언어만」으로 — 기각(뒤집을 수 있다).** 화면이 두 값을 함께 들고 있으므로
  한쪽만 쓰면 「한국어 고치고 저장했더니 영어는?」을 호출부마다 따져야 한다. 둘 다 쓰면
  화면 상태와 저장 상태가 항상 같다. **다만 소유자가 게이트②에서 뒤집을 수 있다** —
  뒤집으면 `Reset` 범위도 함께 바뀐다.
- **`Reset`을 「활성 언어만」으로 — 기각(같은 이유).** 저장이 둘이면 초기화도 둘이어야 대칭이다.
  대신 버튼 라벨을 `Reset both languages`로 바꿔 **무엇이 지워지는지 보이게** 한다.
- **계측에 `language` 키 추가 — 기각.** 저장이 **둘 다** 쓰므로 「어느 언어를 저장했나」가
  의미를 잃는다. `preset`은 **편집 중이던 쪽**의 `matchPresetId` 결과를 계속 보낸다.
  허용 키 맵(`metadata.ts`의 `settings_defaults_saved: ["source", "preset"]`)은 **무변경**이다.
- **구 컬럼을 같은 마이그레이션에서 DROP — 기각.** 위 「적용 순서」의 이유. 순서를 지키려면
  DROP은 새 클라이언트 배포 **뒤**여야 하고, 그건 별개 적용이다.
