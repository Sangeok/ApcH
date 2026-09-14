# FEAT-39: 설정 화면 + 업로드 기본값(언어·클립 수·생성 모드)

agent: web-dev

## 현재 동작

업로드 폼의 세 옵션은 **매 페이지 로드마다 상수로 리셋**된다.

- `pages/dashboard/ui/_component/UploadPodcast.tsx:69-70`이 `useState<string>(DEFAULT_LANGUAGE)`·`useState<number>(DEFAULT_CLIP_COUNT)`로, `:74-75`가 `useState<boolean>(false)`로 초기 state를 하드코딩된 상수로 잡는다. `DEFAULT_LANGUAGE`/`DEFAULT_CLIP_COUNT`는 `shared/config/constants.ts:27-28`에서 각각 `SUPPORTED_LANGUAGES[0].value`(`"English"`)·`CLIP_COUNT_OPTIONS[2].value`(`3`)다.
- 파일 드롭 시 클립 수 하향 클램프는 이미 있다 — `UploadPodcast.tsx:102-106`이 `getMaxFeasibleClipCount(seconds)`(`pages/dashboard/model/clip-count-budget.ts:23`)를 구해 `setClipCount((prev) => (prev > max ? max : prev))`로 **현재 값**(초기값 포함)을 상한으로 내린다. 이 클램프는 초기값이 무엇이든 그대로 적용된다.

사용자 기본값을 담을 컬럼은 이미 있다(FEAT-38, 프로덕션 마이그레이션 적용). `packages/db/prisma/schema.prisma`의 `User`에 `defaultLanguage String?`·`defaultClipCount Int?`·`defaultReviewBeforeGenerate Boolean?`(그리고 FEAT-42 몫인 `defaultCaptionStyle Json?`)이 있다. 그러나 이 셋을 **읽거나 쓰는 코드가 없다** — `entities/user/api/index.ts`의 어떤 함수도 이 컬럼들을 `select`/`data`에 넣지 않고(`:12-40`,`:71-83` 등 전수), `entities/user/server.ts:4-15` 재수출 목록에도 없다. `entities/user/index.ts:1-4`는 `export {}`(클라이언트 안전 공개 표면 없음)다.

설정 화면과 진입점이 없다.

- `apps/web/src/app/dashboard/` 아래 라우트는 `page.tsx`·`billing/`·`uploads/`뿐이고 `settings/`가 없다. `pages/settings` 슬라이스도 없다.
- 대시보드 헤더 드롭다운(`widgets/dashboard-header/ui/index.tsx:71-87`)에는 `Billing`·`Sign out`만 있고 설정 링크가 없다.

계측 계약은 준비돼 있다(FEAT-38). `shared/analytics/lib/metadata.ts:58`이 `settings_viewed: []`, `:63`이 `settings_defaults_saved: ["source", "preset"]`로 허용 키를 정의하고, 두 이름은 `@repo/db`의 `AnalyticsEventName`에 있다(`as const satisfies Record<AnalyticsEventName, ...>`가 컴파일 타임에 강제). 그러나 아직 아무도 발신하지 않는다 — `shared/analytics/ui/AnalyticsTracker.tsx:18-31`의 라우트→이벤트 매핑은 `/dashboard`·`/dashboard/billing`만 다루고, `/dashboard/settings`는 `:26` `pathname.startsWith("/dashboard")` → `null`로 떨어져 아무 `*_viewed`도 내지 않는다.

라우트 보호는 이미 `/dashboard` 하위 전체를 덮는다.

- `middleware.ts:11-13`의 `matcher: ["/dashboard/:path*", "/login"]`이 `/dashboard/settings`를 포섭한다.
- `config.edge.ts:11` `PROTECTED_ROUTES = ["/dashboard"]`이고, `authorized` 콜백(`:32-36`)은 `nextUrl.pathname.startsWith(route)`로 판정하므로 `/dashboard/settings`도 미인증 시 로그인으로 리다이렉트된다 — **미들웨어·PROTECTED_ROUTES 변경 불필요**.
- 단, 이 포섭의 근거는 `middleware.ts:12`의 실제 패턴 `/dashboard/:path*`이지 테스트가 아니다. `middleware.test.mjs:16-20`의 `matchesPattern`은 `PROTECTED_ROUTES`의 접두사 `/dashboard` **자체**가 matcher에 포섭되는지만 검사해서, matcher를 정확 경로 `"/dashboard"`로 좁혀도(하위 `/dashboard/settings` 미포섭) 통과한다(계획 검증에서 실측: pass 3/3). 추가로 `app/dashboard/layout.tsx:20-24`(레이아웃 가드)와 새 라우트의 `auth()` 리다이렉트가 이중·삼중으로 막는다.

## 문제

백로그 `source`(FEAT-39)가 지목한 것: 사용자가 매 업로드에서 실제로 다시 누르는 세 옵션(언어·클립 수·생성 모드)이 폼에 노출돼 있고 매번 상수로 초기화된다(위 「현재 동작」 `UploadPodcast.tsx:69-70,74-75`). 이 셋을 사용자별 기본값으로 만들어 반복 클릭의 대부분을 없앤다.

백로그 요구:
① `/dashboard/settings` 라우트와 `pages/settings` 슬라이스 신설(캡션 섹션 자리는 FEAT-42 몫이라 이 항목에서 채우지 않는다).
② 서버 액션으로 `User` 스칼라 기본값 셋을 읽고/쓰고/**비운다**(비움 = `null` = 시스템 기본).
③ `UploadPodcast.tsx` 초기값을 상수에서 사용자 기본값(`?? DEFAULT_*`)으로 교체. 클립 수는 기존 `getMaxFeasibleClipCount` 클램프가 그대로 적용된다.
④ 계측 `settings_viewed`·`settings_defaults_saved`(`source: "settings_page"`). 업로드 폼에는 "기본으로 저장" 버튼을 붙이지 않는다.

`defaultCaptionStyle`(캡션 기본값)과 `settings_defaults_saved`의 `preset` 키는 FEAT-42 몫이라 이 항목에서 건드리지 않는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/entities/user/model/upload-defaults.ts` `(신규)` | 순수 함수 `resolveUploadDefaults`(저장값→폼 초기값, 범위 밖·null은 시스템 기본으로 폴백)·`normalizeUploadDefaults`(폼 입력→DB 쓰기 페이로드, null 통과·범위 밖 거부) + 타입 |
| `src/fsd/entities/user/model/upload-defaults.test.mjs` `(신규)` | 위 두 순수 함수 분기 테스트 |
| `src/fsd/entities/user/api/index.ts` | `getUserUploadDefaults`·`updateUserUploadDefaults` 추가(세 컬럼 select/update) |
| `src/fsd/entities/user/server.ts` | 위 두 함수 재수출 추가 |
| `src/fsd/entities/user/index.ts` | `export {}` → `./model/upload-defaults`의 순수 함수·타입 재수출(클라이언트 안전) |
| `src/fsd/features/settings/api/index.ts` `(신규)` | `"use server"` 서버 액션 `saveUploadDefaults`(인가·정규화·쓰기·revalidate) |
| `src/fsd/features/settings/index.ts` `(신규)` | 클라이언트 안전 배럴 = `export {}`(서버 전용 표면만, `entities/user/index.ts`와 같은 자기문서화) |
| `src/fsd/pages/settings/ui/index.tsx` `(신규)` | `SettingsView`(클라이언트) — 업로드 기본값 폼 + 저장/초기화 + 계측 |
| `src/app/dashboard/settings/page.tsx` `(신규)` | 라우트 — 인가·기본값 읽기·`SettingsView` 렌더 |
| `src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx` | 초기 state를 상수→`defaults` prop으로; 미사용 상수 임포트 제거 |
| `src/fsd/pages/dashboard/ui/index.tsx` | `DashboardViewProps`에 `uploadDefaults` 추가, `UploadPodcast`에 전달 |
| `src/app/dashboard/page.tsx` | `getUserUploadDefaults` 읽어 `resolveUploadDefaults`로 해석해 `DashboardView`에 전달 |
| `src/fsd/widgets/dashboard-header/ui/index.tsx` | 드롭다운에 `Settings` 링크 추가 |
| `src/fsd/shared/analytics/ui/AnalyticsTracker.tsx` | `/dashboard/settings` → `settings_viewed` 매핑 추가 |

여기 없는 파일은 구현 단계에서 고치지 않는다. 미들웨어·`config.edge.ts`·`schemas.ts`·`schema.prisma`는 변경 없음(위 「현재 동작」에서 이미 덮음을 실측).

## 구현 스케치

### `entities/user/model/upload-defaults.ts` (신규 — 전체)

```ts
import {
  CLIP_COUNT_OPTIONS,
  DEFAULT_CLIP_COUNT,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
} from "~/fsd/shared/config/constants";

const SUPPORTED_LANGUAGE_VALUES = new Set<string>(
  SUPPORTED_LANGUAGES.map((option) => option.value),
);
const SUPPORTED_CLIP_COUNTS = new Set<number>(
  CLIP_COUNT_OPTIONS.map((option) => option.value),
);

/** 생성 모드 시스템 기본값. UploadPodcast의 초기 false(:75)와 같은 값이다. */
export const DEFAULT_REVIEW_BEFORE_GENERATE = false;

/** DB에 저장되는 형태. 각 필드 null = 설정 안 함 = 시스템 기본. */
export type StoredUploadDefaults = {
  defaultLanguage: string | null;
  defaultClipCount: number | null;
  defaultReviewBeforeGenerate: boolean | null;
};

/** 업로드 폼이 초기 state로 쓰는 구체값. */
export type ResolvedUploadDefaults = {
  language: string;
  clipCount: number;
  reviewBeforeGenerate: boolean;
};

/**
 * 저장된(nullable, 어쩌면 범위 밖) 기본값을 폼 초기값으로 해석한다.
 * null이거나 현재 지원 집합에 없으면 시스템 상수로 떨어진다 — 저장 시 검증이
 * 범위 밖 쓰기를 막지만, 지원 목록이 줄어든 뒤 읽는 경우를 방어한다.
 */
export function resolveUploadDefaults(
  stored: StoredUploadDefaults,
): ResolvedUploadDefaults {
  const language =
    stored.defaultLanguage !== null &&
    SUPPORTED_LANGUAGE_VALUES.has(stored.defaultLanguage)
      ? stored.defaultLanguage
      : DEFAULT_LANGUAGE;
  const clipCount =
    stored.defaultClipCount !== null &&
    SUPPORTED_CLIP_COUNTS.has(stored.defaultClipCount)
      ? stored.defaultClipCount
      : DEFAULT_CLIP_COUNT;
  const reviewBeforeGenerate =
    stored.defaultReviewBeforeGenerate ?? DEFAULT_REVIEW_BEFORE_GENERATE;

  return { language, clipCount, reviewBeforeGenerate };
}

/**
 * 설정 폼 입력을 DB 쓰기 페이로드로 정규화한다. 입력은 서버 액션 경계를 넘어온
 * 신뢰할 수 없는 값이라 타입까지 런타임 검증한다. null = 비우기(시스템 기본).
 * 범위 밖·잘못된 타입은 **거부**한다(null 반환) — 조용히 null로 바꾸지 않는다.
 */
export function normalizeUploadDefaults(input: {
  defaultLanguage: unknown;
  defaultClipCount: unknown;
  defaultReviewBeforeGenerate: unknown;
}): StoredUploadDefaults | null {
  const { defaultLanguage, defaultClipCount, defaultReviewBeforeGenerate } =
    input;

  if (
    defaultLanguage !== null &&
    !(
      typeof defaultLanguage === "string" &&
      SUPPORTED_LANGUAGE_VALUES.has(defaultLanguage)
    )
  ) {
    return null;
  }
  if (
    defaultClipCount !== null &&
    !(
      typeof defaultClipCount === "number" &&
      SUPPORTED_CLIP_COUNTS.has(defaultClipCount)
    )
  ) {
    return null;
  }
  if (
    defaultReviewBeforeGenerate !== null &&
    typeof defaultReviewBeforeGenerate !== "boolean"
  ) {
    return null;
  }

  // 위 세 거부 분기가 각 값을 이미 string|null·number|null·boolean|null로 좁혔다.
  // 여기에 `as` 단언을 붙이면 no-unnecessary-type-assertion 에러로 lint가 실패한다.
  return { defaultLanguage, defaultClipCount, defaultReviewBeforeGenerate };
}
```

### `entities/user/api/index.ts` — 추가 (파일 끝, 기존 함수 패턴 그대로)

```ts
export async function getUserUploadDefaults(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      defaultLanguage: true,
      defaultClipCount: true,
      defaultReviewBeforeGenerate: true,
    },
  });
}

export async function updateUserUploadDefaults(
  userId: string,
  values: {
    defaultLanguage: string | null;
    defaultClipCount: number | null;
    defaultReviewBeforeGenerate: boolean | null;
  },
) {
  return db.user.update({
    where: { id: userId },
    data: {
      defaultLanguage: values.defaultLanguage,
      defaultClipCount: values.defaultClipCount,
      defaultReviewBeforeGenerate: values.defaultReviewBeforeGenerate,
    },
  });
}
```

`getUserUploadDefaults`의 반환 모양은 `StoredUploadDefaults`와 같다(세 컬럼). 기존 `server.ts:4-15` 알파벳 재수출 목록에 두 이름을 끼워 넣는다.

### `entities/user/index.ts` — 교체

`export {}`(및 위 3줄 주석)를 아래로 바꾼다. `./model/*`는 클라이언트 안전(`server-only` 아님)이므로 클라이언트 배럴에 둔다 — W5는 `./api` 재수출만 막는다.

```ts
export {
  DEFAULT_REVIEW_BEFORE_GENERATE,
  normalizeUploadDefaults,
  resolveUploadDefaults,
  type ResolvedUploadDefaults,
  type StoredUploadDefaults,
} from "./model/upload-defaults";
```

### `features/settings/api/index.ts` (신규 — 전체)

```ts
"use server";

import { revalidatePath } from "next/cache";
import { normalizeUploadDefaults } from "~/fsd/entities/user";
import { updateUserUploadDefaults } from "~/fsd/entities/user/server";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { type ActionResult, failure, success } from "~/fsd/shared/api/result";

export async function saveUploadDefaults(input: {
  defaultLanguage: string | null;
  defaultClipCount: number | null;
  defaultReviewBeforeGenerate: boolean | null;
}): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult;
  }

  const normalized = normalizeUploadDefaults(input);
  if (normalized === null) {
    return failure("Invalid upload defaults");
  }

  await updateUserUploadDefaults(authResult.data.userId, normalized);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");

  return success();
}
```

- **인가**: 액션 본문 최상단 `requireAuth()`(`shared/api/auth-guard.ts:18`). 사용자는 `authResult.data.userId` — **자기** 행만 쓴다.
- **검증**: `normalizeUploadDefaults`가 언어=`SUPPORTED_LANGUAGES` 값, 클립 수=`CLIP_COUNT_OPTIONS` 값, 생성 모드=boolean, null=비우기를 강제. 범위 밖은 `failure("Invalid upload defaults")`로 **거부**한다 — 근거: 드롭다운은 유효값·명시적 null만 보내므로 범위 밖 입력은 조작된 직접 POST거나 버그다. 조용히 null로 바꾸면 사용자가 의도치 않은 값을 저장하게 되고, 거부하면 나쁜 쓰기 자체가 안 들어간다(읽기 측 `resolveUploadDefaults`도 이중 방어).
- W8 없음(db 직접 임포트 없이 `entities/user/server` 경유). W1/W6 없음(features→entities, 공개 진입 `index`·`server`).

### `features/settings/index.ts` (신규 — 전체)

```ts
// 이 슬라이스는 클라이언트 안전 공개 표면이 없다 (model·lib·ui 세그먼트 없음).
// 서버 액션은 `./api`. 소비자(pages/settings)는 `~/fsd/features/settings/api`로 임포트한다.
export {};
```

### `pages/settings/ui/index.tsx` (신규 — `SettingsView`, 클라이언트)

`initialDefaults: ResolvedUploadDefaults`를 받아 세 옵션 드롭다운 + 저장/초기화 버튼을 그린다. 드롭다운 마크업은 `UploadPodcast.tsx:216-288`의 세 `DropdownMenu` 블록(언어·클립 수·생성 모드) 패턴을 그대로 따른다. 핵심 로직·문구만 코드로 적는다.

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveUploadDefaults } from "~/fsd/features/settings/api";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import {
  CLIP_COUNT_OPTIONS,
  DEFAULT_CLIP_COUNT,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
} from "~/fsd/shared/config/constants";
import { DEFAULT_REVIEW_BEFORE_GENERATE, type ResolvedUploadDefaults } from "~/fsd/entities/user";
// Card·DropdownMenu·Button atoms — UploadPodcast.tsx:3-15·20과 같은 경로

interface SettingsViewProps {
  initialDefaults: ResolvedUploadDefaults;
}

export default function SettingsView({ initialDefaults }: SettingsViewProps) {
  const router = useRouter();
  const [language, setLanguage] = useState(initialDefaults.language);
  const [clipCount, setClipCount] = useState(initialDefaults.clipCount);
  const [reviewBeforeGenerate, setReviewBeforeGenerate] = useState(
    initialDefaults.reviewBeforeGenerate,
  );
  const [isSaving, startSaving] = useTransition();

  const persist = (payload: {
    defaultLanguage: string | null;
    defaultClipCount: number | null;
    defaultReviewBeforeGenerate: boolean | null;
  }) =>
    startSaving(async () => {
      const result = await saveUploadDefaults(payload);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // 계측은 fire-and-forget — 실패해도 저장(이미 성공)을 막지 않는다.
      // preset 키는 FEAT-42(캡션 기본값) 몫이라 여기서 싣지 않는다.
      void trackAnalyticsEvent("settings_defaults_saved", {
        source: "settings_page",
      });
      toast.success("Defaults saved");
      router.refresh();
    });

  const handleSave = () =>
    persist({
      defaultLanguage: language,
      defaultClipCount: clipCount,
      defaultReviewBeforeGenerate: reviewBeforeGenerate,
    });

  const handleReset = () => {
    setLanguage(DEFAULT_LANGUAGE);
    setClipCount(DEFAULT_CLIP_COUNT);
    setReviewBeforeGenerate(DEFAULT_REVIEW_BEFORE_GENERATE);
    persist({
      defaultLanguage: null,
      defaultClipCount: null,
      defaultReviewBeforeGenerate: null,
    });
  };

  // ... Card + 세 드롭다운(UploadPodcast.tsx:216-288 패턴) + 두 버튼 ...
}
```

사용자에게 보이는 문구(앱 언어 = 영어, 그대로):

- 페이지/카드 제목: `Upload defaults`
- 카드 설명: `These options are pre-selected each time you upload. You can still change them for a single upload.`
- 행 라벨: `Subtitle language` · `Number of clips` · `Generation`
- 언어 옵션 라벨: `SUPPORTED_LANGUAGES`의 `label`(`English`/`한국어`) 그대로
- 클립 수 옵션 라벨: `CLIP_COUNT_OPTIONS`의 `label`(`1 clip`…`4 clips`) 그대로
- 생성 모드 옵션 라벨: `Auto (generate immediately)` · `Review first (edit clips before generating)`(UploadPodcast.tsx:278,284와 동일)
- 저장 버튼: `Save defaults` (저장 중: `Saving...`, `isSaving`으로 비활성)
- 초기화 버튼: `Reset to system defaults` (variant `outline`)
- 성공 토스트: `Defaults saved` · 실패 토스트: 액션의 `result.error`

**캡션 섹션**: FEAT-39에서는 **렌더하지 않는다**. 컨트롤 없는 빈 제목 섹션은 사용자에게 고장처럼 보인다(main-loop 지침). FEAT-42가 캡션 섹션을 추가한다.

### `app/dashboard/settings/page.tsx` (신규 — 전체)

```tsx
import { redirect } from "next/navigation";
import { resolveUploadDefaults } from "~/fsd/entities/user";
import { getUserUploadDefaults } from "~/fsd/entities/user/server";
import SettingsView from "~/fsd/pages/settings/ui";
import { auth } from "~/server/auth";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const stored = await getUserUploadDefaults(session.user.id);

  return <SettingsView initialDefaults={resolveUploadDefaults(stored)} />;
}
```

`app/dashboard/layout.tsx`가 헤더·가드를 이미 감싸므로 이 라우트에 별도 `layout.tsx`는 없다. 에러 경계는 부모 세그먼트 `app/dashboard/error.tsx`가 중첩 세그먼트까지 잡으므로 새로 만들지 않는다.

### `UploadPodcast.tsx` — 초기 state를 prop으로 (before/after)

인터페이스(`:63-65`)에 prop 추가:

```tsx
// before (:63-65)
interface UploadPodcastProps {
  onOptimisticAdd: (file: UploadedFileSummary) => void;
}
// after
interface UploadPodcastProps {
  onOptimisticAdd: (file: UploadedFileSummary) => void;
  defaults: ResolvedUploadDefaults;
}
```

시그니처·초기 state(`:67-75`):

```tsx
// before
export default function UploadPodcast({ onOptimisticAdd }: UploadPodcastProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [clipCount, setClipCount] = useState<number>(DEFAULT_CLIP_COUNT);
  ...
  const [reviewBeforeGenerate, setReviewBeforeGenerate] =
    useState<boolean>(false);
// after
export default function UploadPodcast({ onOptimisticAdd, defaults }: UploadPodcastProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<string>(defaults.language);
  const [clipCount, setClipCount] = useState<number>(defaults.clipCount);
  ...
  const [reviewBeforeGenerate, setReviewBeforeGenerate] =
    useState<boolean>(defaults.reviewBeforeGenerate);
```

임포트(`:29-37`)에서 이제 미사용이 되는 `DEFAULT_LANGUAGE`·`DEFAULT_CLIP_COUNT`를 제거하고(`SUPPORTED_LANGUAGES`·`CLIP_COUNT_OPTIONS`·`UPLOAD_CONFIG`·`CLIP_DURATION_LIMITS`는 유지), `ResolvedUploadDefaults` 타입을 `~/fsd/entities/user`에서 `import type`으로 추가한다. 드롭에서의 클립 수 클램프(`:102-106`)는 손대지 않는다 — 초기값이 `defaults.clipCount`로 바뀌어도 `prev > max` 클램프가 그대로 적용된다(백로그 요구 ③).

### `pages/dashboard/ui/index.tsx` — prop 스레딩 (before/after)

```tsx
// before (:37-43)
interface DashboardViewProps {
  userId: string;
  uploadedFiles: UploadedFileSummary[];
  recoverableDrafts: RecoverableUploadDraftSummary[];
  /** 서버 컴포넌트가 읽어 준 큐 상태. refetch가 돌려주는 것과 같은 형태다 */
  initialActiveQueue: ActiveUploadedFileQueueState;
}
// after — 필드 추가
  uploadDefaults: ResolvedUploadDefaults;
```

구조분해(`:45-50`)에 `uploadDefaults` 추가, 렌더(`:122`) `<UploadPodcast onOptimisticAdd={addOptimisticFile} />` → `<UploadPodcast onOptimisticAdd={addOptimisticFile} defaults={uploadDefaults} />`. `ResolvedUploadDefaults`를 `~/fsd/entities/user`에서 `import type`으로 추가.

### `app/dashboard/page.tsx` — 읽기·해석·전달 (before/after)

`~/fsd/entities/user/server`에서 `getUserUploadDefaults`, `~/fsd/entities/user`에서 `resolveUploadDefaults`를 임포트한다. `Promise.all`(`:25-29`)에 읽기를 하나 더 넣는다:

```tsx
// before (:25-29)
  const [uploadedFiles, recoverableDrafts, activeQueue] = await Promise.all([
    listUploadedFileSummariesByUserId(session.user.id),
    listRecoverableUploadDraftsByUserId(session.user.id),
    listActiveUploadedFileQueueStateByUserId(session.user.id),
  ]);
// after — userDefaults 추가
  const [uploadedFiles, recoverableDrafts, activeQueue, userDefaults] =
    await Promise.all([
      listUploadedFileSummariesByUserId(session.user.id),
      listRecoverableUploadDraftsByUserId(session.user.id),
      listActiveUploadedFileQueueStateByUserId(session.user.id),
      getUserUploadDefaults(session.user.id),
    ]);
```

`DashboardView`(`:32-38`)에 `uploadDefaults={resolveUploadDefaults(userDefaults)}` 추가. 읽기는 SSR에서 await되므로 클라이언트 로딩 상태가 없고, null(미설정) 컬럼은 `resolveUploadDefaults`가 시스템 기본으로 떨어뜨린다. 사용자 행이 없어 읽기가 throw하면 기존 대시보드 에러 경계가 처리한다(폼을 조용히 막지 않는다).

### `widgets/dashboard-header/ui/index.tsx` — 진입점

드롭다운(`:71-87`)의 `Billing` 항목(`:76-78`) 바로 위에 `Settings` 링크를 추가한다(패턴 동일):

```tsx
<DropdownMenuItem asChild>
  <Link href="/dashboard/settings">Settings</Link>
</DropdownMenuItem>
<DropdownMenuSeparator />
```

문구: `Settings`. 대시보드 어느 화면에서든(레이아웃 헤더) 도달 가능해진다.

### `AnalyticsTracker.tsx` — 라우트 매핑 추가

`getRouteEventName`의 `/dashboard/billing` 분기(`:22-24`) 다음, `startsWith("/dashboard")` 캐치(`:26`) **앞에** 추가:

```tsx
if (pathname === "/dashboard/settings") {
  return "settings_viewed";
}
```

`settings_viewed`는 메타데이터 없음(`metadata.ts:58` `[]`)이라 기존 `*_viewed`와 같은 경로 기반 발신으로 충분하다.

## 테스트

- **덮는 것** (`entities/user/model/upload-defaults.test.mjs`, Node 내장 러너):
  - `resolveUploadDefaults`: 전부 null → 시스템 기본(`English`/`3`/`false`); 유효 저장값(`Korean`/`2`/`true`) → 그대로; 범위 밖 클립 수(`5`) → `DEFAULT_CLIP_COUNT`(3); 미지원 언어(`"French"`) → `DEFAULT_LANGUAGE`(English); `reviewBeforeGenerate` null → false, true → true.
  - `normalizeUploadDefaults`: 전부 null → 전부 null(비우기 통과); 유효 구체값 → 동일; 범위 밖 클립 수(`5`) → null(거부); 미지원 언어 → null; 문자열 클립 수(`"3"`) → null(타입 거부); 비-boolean 생성 모드 → null; **필드 누락(`undefined`) → null(거부) — 세 필드 각각**. 누락 케이스가 없으면 `!== null`을 `!= null`로 바꾼 구현이 나머지 케이스를 전부 통과한다 — 누락 필드가 검증을 통과해 Prisma `update`가 그 컬럼을 조용히 건너뛰는 부분 갱신이 된다(계획 검증 돌연변이 실측).
- **못 덮는 범위**(현재 러너로 확인 불가 — DOM·React·DB·라우팅 없음, 배포 후 수동 확인):
  - 설정 화면 실제 렌더·드롭다운 선택·저장 토스트, 저장이 `User` 컬럼에 반영, 저장 뒤 대시보드 업로드 폼이 새 기본값으로 초기화되는지.
  - `settings_viewed`·`settings_defaults_saved` 계측 행이 실제로 기록되는지(admin 분석).
  - 라우트 보호가 프로덕션에서 미인증 리다이렉트하는지.
  - 이 범위는 `docs/release-checks.md` FEAT-38 절의 `(FEAT-39 배포 후) 새 컬럼이 실제로 읽히고 쓰이며 이벤트 두 개가 기록되는가` 줄에서 함께 닫힌다.

## 범위 밖 의존

없음 — 전부 `apps/web` 안이다. 필요한 DB 컬럼·이벤트 이름·허용 키는 FEAT-38이 이미 만들었고(프로덕션 마이그레이션 적용), 스키마는 이 항목에서 건드리지 않는다.

## 대안

- **서버 액션을 `pages/settings`에 두기**: 슬라이스 내부 상대 임포트라 FSD 검사기는 통과하지만, `apps/web/CLAUDE.md` 「서버 액션」 규약("서버 액션은 각 feature 슬라이스의 `api/index.ts`에 있다")과 어긋난다. 규약대로 `features/settings/api`에 둔다.
- **순수 검증을 zod 스키마(`prepareUploadSchema` 방식)로**: 계약과 묶이는 이점은 있으나, main-loop 지침이 "판단 로직을 순수 함수로 빼 `*.test.mjs`로 덮으라"고 명시했고, `unknown` 입력을 받는 순수 함수가 조작된 POST(잘못된 타입) 방어를 그대로 단언 테스트로 드러낸다. 지원 집합은 `shared/config/constants`에서 파생하므로 `features/upload/model/schemas.ts`(엔티티가 임포트할 수 없는 상위 레이어)와 중복되지 않는다.
- **드롭다운마다 "시스템 기본" 항목으로 필드별 비우기**: 세밀하지만 UI가 복잡해진다. 백로그 요구는 "비운다"뿐이라, 각 드롭다운은 구체값을 유지하고 `Reset to system defaults` 버튼 하나로 셋을 함께 null로 비운다(더 단순하고 요구 충족).
- **업로드 폼에 "이 값을 기본으로 저장" 버튼**: 백로그가 명시적으로 배제(이번만 바꾼 것과 기본 변경이 같은 자리에서 헷갈린다). 저장은 설정 화면에서만.
