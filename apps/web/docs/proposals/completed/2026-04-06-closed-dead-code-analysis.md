---
status: "closed"
stage: null
proposal-size: "standard"
created-at: "2026-04-06"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: "2026-08-02"
closed-by: "HamSangEok"
closed-reason: "superseded"
owners: []
related: []
---

# Dead Code 분석 보고서

> 분석 기준일: 2026-04-05
> 대상 프로젝트: ai-podcast-clipper-frontend (Next.js 15 + React 19 + FSD)
> 분석 방법: 전체 파일 구조 파악 → export 심볼 추출 → cross-file import 검증 (3개 병렬 에이전트)
> 제외 범위: polar 관련 코드 일체

---

## 개요

코드베이스 전체를 대상으로 사용되지 않는 dead code를 탐지하고, **삭제 가능 여부를 세 등급으로 명확히 분류**했다.

| 등급 | 의미 | 건수 |
|------|------|------|
| ✅ **삭제 가능** | 확실히 사용되지 않음, 즉시 제거해도 무방 | 12건 |
| ⚠️ **유지 권장** | 기술적으로는 dead이나 shadcn/ui 관례상 유지 권장 | 5건 |
| ❌ **삭제 금지** | 에이전트 오탐 또는 실제 사용 중 | (하단 참조) |

---

## 1. 삭제 가능 — 즉시 제거 권장

### 1-1. `src/fsd/shared/lib/error-logger.ts` — 전체 파일

**판정: 삭제 가능**

```ts
// 파일 전체가 dead code
export function logError(context: string, error: unknown): void { ... }
export function getErrorMessage(error: unknown): string { ... }
```

**근거**: 프로젝트 내 어디서도 이 파일을 import하는 코드가 존재하지 않는다. 에러 처리는 각 파일에서 `console.error()` + `error instanceof Error ? error.message : String(error)` 패턴으로 직접 수행하고 있다.

**삭제 방법**: 파일 자체를 삭제한다.

---

### 1-2. `src/fsd/shared/api/result.ts` — `isSuccess()`, `isFailure()` 타입가드

**판정: 삭제 가능 (나머지 export는 유지)**

```ts
// dead — import처 없음
export function isSuccess<T>(result: ActionResult<T>): result is { success: true; data: T }
export function isFailure<T>(result: ActionResult<T>): result is { success: false; error: string }

// 사용 중 — 10+ 파일에서 import
export type ActionResult<T = void>
export function success<T>(data: T): ActionResult<T>
export function failure(error: string): ActionResult<never>
```

**근거**: 코드베이스 전체에서 두 타입가드가 import되는 곳이 없다. 실제 코드에서는 `result.success ? ... : ...` 형태로 프로퍼티를 직접 체크한다. `ActionResult`, `success()`, `failure()`는 10+ 파일에서 적극 사용 중이므로 건드리지 않는다.

**삭제 방법**: `result.ts`에서 `isSuccess`, `isFailure` 함수 선언만 제거한다.

---

### 1-3. `src/fsd/shared/ui/atoms/card.tsx` — `CardAction` 컴포넌트

**판정: 삭제 가능 (나머지 export는 유지)**

```tsx
// dead — import처 없음
function CardAction({ className, ...props }: React.ComponentProps<"div">) { ... }

// 사용 중 — OrderHistory, 여러 페이지에서 import
Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent
```

**근거**: `CardAction`은 shadcn/ui 최신 버전에서 추가된 컴포넌트로 보이나, 이 프로젝트에서는 단 한 번도 import되지 않는다. 나머지 Card 컴포넌트들은 광범위하게 사용된다.

**삭제 방법**: `card.tsx`에서 `CardAction` 함수 선언 및 export 구문을 제거한다.

---

### 1-4. `src/actions/uploaded-files.ts` — dead 함수 4개 + private helper

**판정: 삭제 가능 (`getUploadedFileDetails`만 유지)**

`~/actions/uploaded-files`를 import하는 파일은 프로젝트 전체에서 `app/dashboard/uploads/[uploadedFileId]/page.tsx` 단 1곳뿐이며, 거기서 import하는 것은 `getUploadedFileDetails` 하나뿐임을 전수 확인했다.

```ts
// dead — FSD 레이어 버전으로 대체됨, import처 없음
export async function getOriginalPlayUrl(uploadedFileId: string)

// dead — @deprecated 명시 + import처 없음
/** @deprecated src/fsd/features/upload/api/index.ts의 동일 함수를 사용하세요. */
export async function deleteUploadedFile(uploadedFileId: string)

// dead — @deprecated 명시 + import처 없음
/** @deprecated src/fsd/features/upload/api/index.ts의 동일 함수를 사용하세요. */
export async function deleteUploadedFileWithClips(uploadedFileId: string)

// dead — FSD 레이어 버전으로 대체됨, import처 없음 (초기 분석에서 누락)
// upload/ui/index.tsx는 ~/fsd/features/upload/api에서 import함
export async function reprocessUploadedFile(uploadedFileId: string)

// dead — 위 4개 함수의 private helper. 모든 호출처가 삭제되면 함께 제거
async function removeGeneratedClipsFromS3(originalKey: string, options?)

// 사용 중 — 유지
export async function getUploadedFileDetails(uploadedFileId: string)
```

**`getOriginalPlayUrl` 주의**: 코드에 `@deprecated` 태그가 없으나 `~/actions/uploaded-files`에서 이 함수를 import하는 곳이 없고, `getOriginalPlayUrl`의 실제 사용처(`dashboard/ui/index.tsx`, `uploadDetail/hooks/useOriginalPlayUrl.ts`)는 모두 `~/fsd/features/upload/api`에서 import한다.

**삭제 방법**: `uploaded-files.ts`에서 `getUploadedFileDetails`를 제외한 4개 함수와 `removeGeneratedClipsFromS3` private helper를 제거하고, **동시에 고아가 되는 import 8개도 함께 제거**한다. 남겨야 할 import는 `auth`와 `db` 두 개뿐이다.

```ts
// 함수 삭제 후 고아가 되므로 함께 제거할 imports
import {
  DeleteObjectsCommand,   // removeGeneratedClipsFromS3 전용
  GetObjectCommand,       // getOriginalPlayUrl 전용
  ListObjectsV2Command,   // removeGeneratedClipsFromS3 전용
  S3Client,               // getOriginalPlayUrl, removeGeneratedClipsFromS3 전용
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"; // getOriginalPlayUrl 전용
import { revalidatePath } from "next/cache";                  // 3개 dead 함수 전용
import { env } from "~/env";                                  // getOriginalPlayUrl, removeGeneratedClipsFromS3 전용
import { inngest } from "~/inngest/client";                   // reprocessUploadedFile 전용

// 유지할 imports
import { auth } from "~/server/auth";
import { db } from "~/server/db";
```

> **참고**: import만 남기고 함수를 지울 경우 `@typescript-eslint/no-unused-vars`가 `"warn"`으로 설정되어 있어 빌드 실패는 없지만 경고가 발생한다. 함수와 import를 동시에 처리한다.

---

### 1-5. `src/fsd/pages/dashboard/model/type.ts` — `StatusKey` 타입만 제거

**판정: `StatusKey`만 삭제 가능 (`UploadedFile` re-export는 유지)**

```ts
// dead — import처 없음
export type StatusKey = ProcessingStatus;

// 사용 중 — 2곳에서 import
export type { UploadedFileSummary as UploadedFile };
```

**근거**: `StatusKey`는 프로젝트 전체에서 import하는 곳이 없다. 그러나 `UploadedFile` re-export는 아래 2곳에서 활발히 사용 중이므로 **파일 전체를 삭제하면 TypeScript 컴파일 에러가 발생한다**.

| 사용처 | import 구문 |
|--------|-----------|
| `dashboard/ui/index.tsx:21` | `import type { UploadedFile } from "../model/type"` |
| `dashboard/ui/_component/QueueStatus.tsx:18` | `import type { UploadedFile } from "../../model/type"` |

**삭제 방법**: `dashboard/model/type.ts`에서 `StatusKey` 타입 선언과 `ProcessingStatus` import만 제거한다.

---

### 1-6. `src/fsd/entity/other/` — 빈 디렉토리

**판정: 삭제 가능**

**근거**: 디렉토리가 존재하지만 내부에 파일이 하나도 없다. FSD 구조 placeholder로 생성된 것으로 보이나, 현재 entity 레이어에서 실질적으로 사용하는 개념이 없다면 불필요하다.

**삭제 방법**: 디렉토리를 삭제한다.

---

## 2. 유지 권장 — 기술적 dead이나 관례상 제거 보류

아래 항목들은 코드베이스 내 import처가 현재 없으나, shadcn/ui의 공식 컴포넌트 패키징 관례에 따라 의도적으로 export되는 경우에 해당한다. 삭제 시 **shadcn/ui CLI의 업데이트 및 재생성 시 충돌 가능성**이 있으므로 유지를 권장한다.

### 2-1. `src/fsd/shared/ui/atoms/badge.tsx` — `badgeVariants`

```ts
// 현재 미사용이지만 shadcn/ui CVA 패턴 — 유지 권장
export const badgeVariants = cva(...)
```

`Badge` 컴포넌트 자체는 `OrderHistory.tsx` 등에서 사용 중이다. `badgeVariants`는 다른 컴포넌트가 Badge 스타일을 직접 참조할 때 쓰는 패턴으로, shadcn/ui에서 명시적으로 export하도록 설계된 것이다.

---

### 2-2. `src/fsd/shared/ui/atoms/button.tsx` — `buttonVariants`

```ts
// 현재 미사용이지만 shadcn/ui CVA 패턴 — 유지 권장
export const buttonVariants = cva(...)
```

`buttonVariants`는 `asChild` 패턴이나 링크를 버튼처럼 보이게 할 때 활용되는 export다. 현재 미사용이나 향후 활용 가능성이 높고 shadcn/ui 관례다.

---

### 2-3. `src/fsd/shared/ui/atoms/dropdown-menu.tsx` — 9개 미사용 컴포넌트

현재 사용 중인 컴포넌트:
- `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuLabel`

현재 미사용 컴포넌트 (9개):
- `DropdownMenuPortal`, `DropdownMenuGroup`
- `DropdownMenuCheckboxItem`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`
- `DropdownMenuShortcut`, `DropdownMenuSub`, `DropdownMenuSubTrigger`, `DropdownMenuSubContent`

shadcn/ui 컴포넌트는 전체 세트를 하나의 파일로 관리하는 것이 표준 방식이다. 개별 export를 제거하면 shadcn/ui 업데이트 시 충돌이 발생할 수 있고, 미래 기능 추가 시 재작업이 필요해진다. **유지를 강력 권장한다.**

---

### 2-4. `src/fsd/shared/ui/atoms/table.tsx` — `TableFooter`, `TableCaption`

현재 사용 중인 컴포넌트 (OrderHistory.tsx에서):
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`

현재 미사용 컴포넌트:
- `TableFooter`, `TableCaption`

동일한 이유로 유지 권장한다. 테이블 하단 합계 행이나 접근성 캡션이 필요해질 경우 즉시 활용 가능하다.

---

### 2-5. `src/fsd/shared/ui/atoms/field.tsx` — 전체 파일

```
현재 import처: 0건
```

이 파일은 폼 필드 관련 복합 컴포넌트(`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldTitle` 등)를 제공한다. 현재 로그인/회원가입 폼은 직접 구현되어 있어 이 컴포넌트를 사용하지 않지만, 향후 폼 기능 확장 시 활용 가능성이 있다.

**단, 확장 계획이 없다고 확정된다면 삭제 가능하다.** 이 경우 삭제해도 런타임 영향 없음이 보장된다.

---

## 3. 오탐 목록 (삭제 금지)

분석 과정에서 dead code로 의심되었으나, 실제 사용 중인 것으로 확인된 항목들이다.

| 항목 | 파일 | 실제 사용처 |
|------|------|-----------|
| `ActionResult`, `success()`, `failure()` | `result.ts` | upload/api, clip/api, hooks 등 10+ 파일 |
| `processVideoSchema` 스키마 | `clip/model/schemas.ts` | `clip/api/index.ts`에서 `safeParse` 검증에 사용. 단, `ProcessVideoInput` 타입 자체는 import처 없음 (스키마와 함께 유지 권장) |
| `usePlayUrl` hook | `shared/hooks/usePlayUrl.ts` | `UploadedFileCard.tsx` |
| `useClipPlayUrl` hook | `shared/hooks/useClipPlayUrl.ts` | `ClipCard.tsx` |
| `useOriginalPlayUrl` hook | `uploadDetail/hooks/useOriginalPlayUrl.ts` | `OriginalMediaCard.tsx` |
| `UPLOAD_CONFIG`, `SUPPORTED_LANGUAGES` 등 | `shared/config/constants.ts` | `UploadPodcast.tsx`, `clip/model/schemas.ts` |
| `FeatureCard`, `WorkflowStep`, `HeroHighlight` 타입 | `home/model/type.ts` | `home/constants/index.ts` |
| `UploadedFileSummary` 인터페이스 | `uploaded-file-list/model/types.ts` | 위젯, 카드 컴포넌트 다수 |
| `Table`, `TableHeader` 등 (6개) | `atoms/table.tsx` | `billing/ui/OrderHistory.tsx` |

---

## 4. 실행 계획

### Phase 1 — 즉시 실행 가능 (리스크 없음)

1. `src/fsd/shared/lib/error-logger.ts` 파일 삭제
2. `src/fsd/shared/api/result.ts`에서 `isSuccess`, `isFailure` 함수 제거
3. `src/fsd/shared/ui/atoms/card.tsx`에서 `CardAction` 제거
4. `src/actions/uploaded-files.ts`에서 dead 함수 4개(`getOriginalPlayUrl`, `deleteUploadedFile`, `deleteUploadedFileWithClips`, `reprocessUploadedFile`) 및 private helper `removeGeneratedClipsFromS3` 제거
5. `src/fsd/pages/dashboard/model/type.ts`에서 `StatusKey` 타입 선언 및 `ProcessingStatus` import 제거 (`UploadedFile` re-export는 유지)
6. `src/fsd/entity/other/` 디렉토리 삭제

### Phase 2 — 팀 확인 후 결정

7. `src/fsd/shared/ui/atoms/field.tsx` — 향후 폼 확장 계획이 없으면 삭제
8. shadcn/ui 미사용 exports (`badgeVariants`, `buttonVariants`, dropdown 9개, `TableFooter`, `TableCaption`) — shadcn/ui를 지속 관리할 계획이면 유지, 더 이상 업데이트하지 않을 계획이면 정리 가능

---

## 5. 예상 효과

| 항목 | 변화 |
|------|------|
| 삭제 파일 수 | 1개 (`error-logger.ts`) + `entity/other/` 디렉토리 |
| 삭제 함수/타입 수 | 약 10건 (6개 함수 + 1개 컴포넌트 + 1개 private helper + 1개 타입가드 쌍 + 1개 타입) |
| 빌드/런타임 영향 | 없음 (모두 사용되지 않는 코드) |
| TypeScript 타입 오류 | 없음 (삭제 대상이 어디서도 참조되지 않음) |
| 코드 명확성 | 향상 (deprecated 코드, 불필요한 export 제거) |

---

## 6. 분석 신뢰도 관련 추가 확인

### Barrel index.ts 확인

`src/fsd/**/index.ts` 패턴으로 전수 검색한 결과 FSD 레이어 내에 barrel 파일이 다수 존재한다 (`features/billing/api/index.ts`, `features/clip/api/index.ts`, `features/upload/api/index.ts` 등). 그러나 이 barrel 파일들이 본 보고서에서 dead로 판정한 심볼을 re-export하는 경우는 없으므로, "import처 없음"이라는 판정이 곧 "사용처 없음"과 동일하다. 분석 결과의 신뢰도를 추가로 보강한다.

## Completion or Closure Notes (2026-08-02)

이 분석은 실행하지 않고 닫는다. 일부는 이미 실행됐고, 나머지는 전제가
무효가 됐다.

| 삭제 후보 | 2026-08-02 현재 |
| --- | --- |
| `src/actions/uploaded-files.ts` | 삭제됨 |
| `src/fsd/pages/dashboard/model/type.ts` | 삭제됨 |
| `src/fsd/shared/lib/error-logger.ts` | 삭제됨 |
| `src/fsd/shared/api/result.ts` | **9곳에서 사용 중** |
| `src/fsd/shared/ui/atoms/badge.tsx` | **15곳에서 사용 중** |
| `src/fsd/shared/ui/atoms/card.tsx` | **22곳에서 사용 중** |
| `src/fsd/shared/ui/atoms/table.tsx` | **2곳에서 사용 중** |
| `src/fsd/shared/ui/atoms/field.tsx` | 참조 0곳. 여전히 미사용 |

즉 이 문서는 "미결"이 아니라 **낡았다.** 실행할 것은 실행됐고, 남은
후보 5개 중 4개는 그 뒤 실제로 쓰이기 시작해 삭제 대상이 아니게 됐다.

유일하게 남은 것은 `atoms/field.tsx` 하나다. 이 문서를 되살려 쓰는 것보다
현재 코드베이스를 기준으로 새 proposal을 쓰는 편이 낫다. 이 문서의 나머지
근거를 그대로 신뢰하면 사용 중인 파일을 지우게 된다.
