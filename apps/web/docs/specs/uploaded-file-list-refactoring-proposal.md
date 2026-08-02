# uploaded-file-list 위젯 리팩토링 제안서

## 개요

| 항목 | 내용 |
|------|------|
| 대상 | `src/fsd/widgets/uploaded-file-list/` |
| 분석 기준 | TypeScript Clean Code, Frontend Predictability, Cohesion, Naming Conventions, Readability, Coupling, File Naming |
| 발견 항목 | HIGH 5 / MEDIUM 6 / LOW 5 (총 16건) |
| 검증 상태 | 6차 검증 완료 — 1차 수정 4건 + 2차 수정 4건 + 3차 수정 2건 + 4차 수정 3건 + 5차 수정 1건 + 6차 수정 2건 (총 16건 반영) |
| 관련 파일 | `UploadedFileCard.tsx`, `OriginalMediaCard.tsx`, `useClipPlayUrl.ts`, `uploadDetail/model/type.ts`, `ProcessingTimeline.tsx`, `QueueStatus.tsx`, `uploads/[uploadedFileId]/page.tsx` |

---

## 잘된 점

- **Empty state 처리**: `UploadedFileList`에서 빈 배열에 대한 가드가 깔끔함
- **공유 디자인 시스템 활용**: `Card`, `Badge` 등 atoms를 일관되게 사용
- **적절한 컴포넌트 분리**: List/Card 분리로 각 컴포넌트가 단일 책임 유지
- **접근성**: `Link`에 `focus-visible:ring-2` 적용

---

## HIGH Priority

### 1. `status: string` → union type 필요

**스킬**: TypeScript Clean Code  
**위치**: `ui/index.tsx:8`, `ui/_component/UploadedFileCard.tsx:19`

**현재 코드**:
```typescript
// UploadedFileListProps, UploadedFileCardProps 모두 동일
status: string;
```

**문제**: 이미 프로젝트에 `ProcessingStatus` 타입이 존재하지만 사용하지 않음.
- `src/fsd/pages/uploadDetail/model/type.ts` → `type ProcessingStatus = "queued" | "processing" | "processed" | "failed" | "no credits"`
- `UploadDetailPage`에서 `status as ProcessingStatus` 단언 사용 중 (uploadDetail/ui/index.tsx:82)

**개선안**: `ProcessingStatus`를 shared 레이어로 승격 후 props에 적용.

```typescript
// src/fsd/shared/types/processing-status.ts
export type ProcessingStatus = "queued" | "processing" | "processed" | "failed" | "no credits";
```

```typescript
// UploadedFileCardProps
file: {
  // ...
  status: ProcessingStatus; // string → union type
};
```

**효과**: 컴파일 타임 exhaustiveness 체크, 자동완성 지원, 컴포넌트 레벨의 `as` 단언을 데이터 경계(서버 컴포넌트)로 이동 가능.

> **⚠️ 주의**: Prisma 스키마의 `status`가 `String` 타입이므로, DB → 프론트엔드 경계 어딘가에서 타입 단언 또는 런타임 검증이 반드시 필요하다. `as` 단언이 완전히 제거되는 것이 아니라, 컴포넌트 내부에서 데이터 경계(서버 컴포넌트)로 이동하는 것이다. 이는 관심사 분리 관점에서 올바른 방향이지만, "제거"가 아닌 "이동"임을 인지해야 한다.

---

### 2. 인라인 타입 중복 정의

**스킬**: TypeScript Clean Code  
**위치**: 아래 2곳에서 동일한 `{ id, fileName, status, createdAt, clipsCount }` 인라인 정의

| 파일 | 라인 | 상태 |
|------|------|------|
| `widgets/uploaded-file-list/ui/index.tsx` | 4-10 | 인라인 정의 (중복) |
| `widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx` | 16-22 | 인라인 정의 (중복) |
| ~~`pages/dashboard/ui/index.tsx`~~ | ~~24-30~~ | 이미 `UploadedFile` 타입 import 사용 중 |
| `pages/dashboard/ui/_component/QueueStatus.tsx` | 24 | `StatusBadge` 로컬 컴포넌트의 `status: string` → `ProcessingStatus` 변경 필요 (3차 검증) |

> **검증 결과**: Dashboard 컴포넌트들은 이미 `pages/dashboard/model/type.ts`의 `UploadedFile` 인터페이스를 import하여 사용 중. 실제 인라인 중복은 widget 2곳만 해당.
>
> 단, `pages/dashboard/model/type.ts`에 별도 `UploadedFile` 인터페이스가 존재하며, `StatusKey`와 `hasStatusConfig` 타입 가드도 함께 정의되어 있으므로 통합 시 이들의 관계를 고려해야 함.

**개선안**: 공유 타입 추출 후 widget 2곳 + dashboard 모델 통합.

```typescript
// src/fsd/shared/types/processing-status.ts
export type ProcessingStatus = "queued" | "processing" | "processed" | "failed" | "no credits";
```

```typescript
// src/fsd/widgets/uploaded-file-list/model/types.ts
import type { ProcessingStatus } from "~/fsd/shared/types/processing-status";

export interface UploadedFileSummary {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  createdAt: Date;
  clipsCount: number;
}
```

```typescript
// pages/dashboard/model/type.ts — 기존 UploadedFile을 UploadedFileSummary로 교체
import type { UploadedFileSummary } from "~/fsd/widgets/uploaded-file-list/model/types";
import type { ProcessingStatus } from "~/fsd/shared/types/processing-status";
import { STATUS_CONFIG } from "../constants";

export type { UploadedFileSummary as UploadedFile };

export type StatusKey = keyof typeof STATUS_CONFIG;

// ProcessingStatus 도입 후 status가 union type이므로, 매개변수 타입도 ProcessingStatus로 변경
export const hasStatusConfig = (status: ProcessingStatus): status is StatusKey =>
  status in STATUS_CONFIG;
```

> **⚠️ 3차 검증 결과 — QueueStatus.tsx 수정 필요 (SIGNIFICANT)**
>
> `hasStatusConfig`의 매개변수가 `string` → `ProcessingStatus`로 변경되면, `QueueStatus.tsx:24`의 `StatusBadge` 로컬 컴포넌트에서 **타입 에러가 발생**한다.
>
> **현재 코드** (`QueueStatus.tsx:24-26`):
> ```typescript
> function StatusBadge({ status }: { status: string }) {
>   const config = hasStatusConfig(status) ? STATUS_CONFIG[status] : undefined;
>   // ❌ string은 ProcessingStatus에 할당 불가 → 컴파일 에러
> ```
>
> `UploadedFile.status`가 `ProcessingStatus`로 변경되므로 `file.status`를 받는 `StatusBadge`의 파라미터도 `ProcessingStatus`로 변경해야 한다:
> ```typescript
> import type { ProcessingStatus } from "~/fsd/shared/types/processing-status";
>
> function StatusBadge({ status }: { status: ProcessingStatus }) {
>   const config = hasStatusConfig(status) ? STATUS_CONFIG[status] : undefined;
>   // ✅ ProcessingStatus → ProcessingStatus 정상
> ```

> **⚠️ 4차 검증 결과 — `hasStatusConfig` 타입 가드 dead logic 발생 (MODERATE)**
>
> `STATUS_CONFIG` 키와 `ProcessingStatus` 값이 **완전히 동일**하다:
> - `StatusKey` = `"queued" | "processing" | "processed" | "failed" | "no credits"`
> - `ProcessingStatus` = `"queued" | "processing" | "processed" | "failed" | "no credits"`
>
> 따라서 `hasStatusConfig(status: ProcessingStatus): status is StatusKey`는 **항상 `true`를 반환**하며, fallback 분기(`?? undefined`, `?? status`)가 dead code가 된다.
>
> **선택지**:
> - **A (권장)**: `hasStatusConfig` 타입 가드를 제거하고 `STATUS_CONFIG[status]`로 직접 접근. `ProcessingStatus`가 곧 `StatusKey`이므로 타입 안전성 유지됨.
>   ```typescript
>   // pages/dashboard/model/type.ts
>   export type StatusKey = ProcessingStatus; // 동일 타입임을 명시
>   // hasStatusConfig 제거
>   ```
>   ```typescript
>   // QueueStatus.tsx — 직접 접근
>   function StatusBadge({ status }: { status: ProcessingStatus }) {
>     const config = STATUS_CONFIG[status];
>     return <Badge variant={config.variant}>{config.label}</Badge>;
>   }
>   ```
> - **B (방어적)**: 향후 `ProcessingStatus`에 `STATUS_CONFIG`에 없는 값이 추가될 가능성을 대비해 타입 가드 유지. 단, 현재 시점에서는 dead logic임을 주석으로 명시.

**효과**: 필드 변경 시 한 곳만 수정. 타입 불일치 사전 방지.

---

### 3. N개 카드 마운트 시 N개 toast 동시 발생

**스킬**: Frontend Predictability  
**위치**: `ui/_component/UploadedFileCard.tsx:44,49`

**현재 코드**:
```typescript
useEffect(() => {
  const fetchOriginalPlayUrl = async () => {
    // ...
    toast.error("Failed to get original play url: " + result.error);
    // ...
  };
  void fetchOriginalPlayUrl();
}, [file.id]);
```

**문제**: 카드가 리스트로 렌더링되므로, API 장애 시 파일 수만큼 toast가 동시 표시됨. 6개 파일 = 6개 동일 에러 토스트.

**개선안**: 훅에서 toast를 제거하고 `error` 상태를 반환. 호출부에서 에러 표시 방식 결정.

```typescript
// useOriginalPlayUrl 훅 (개선 후)
export function useOriginalPlayUrl(fileId: string) {
  // ...
  return { playUrl, isLoading, error }; // toast 대신 error 반환
}
```

```typescript
// UploadedFileCard (호출부)
const { playUrl, isLoading, error } = useOriginalPlayUrl(file.id);
// error가 있으면 비디오 영역에 에러 UI 표시 (toast 아님)
```

**효과**: UX 개선 (토스트 폭탄 방지), 관심사 분리 (훅은 데이터만, 컴포넌트는 표현만).

---

### 4. Play URL fetch 로직 3곳 중복

**스킬**: Frontend Cohesion  
**위치**:

| 파일 | 대상 함수 |
|------|-----------|
| `widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx:36-53` | `getOriginalPlayUrl` |
| `pages/uploadDetail/ui/_component/OriginalMediaCard.tsx:29-49` | `getOriginalPlayUrl` |
| `shared/hooks/useClipPlayUrl.ts:12-39` | `getClipPlayUrl` (동일 패턴, 다른 API) |

**현재 코드** (3곳 모두 동일 구조):
```typescript
const [playUrl, setPlayUrl] = useState<string | null>(null);
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  const fetch = async () => {
    setIsLoading(true);
    try {
      const result = await someApi(id);
      if (result.success) setPlayUrl(result.data.url);
      else { toast.error(...); console.error(...); }
    } catch (error) { toast.error(...); console.error(...); }
    finally { setIsLoading(false); }
  };
  void fetch();
}, [id]);
```

**개선안**: 제네릭 훅 추출 후 래퍼로 분리.

```typescript
// src/fsd/shared/hooks/usePlayUrl.ts
import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "~/fsd/shared/api/result";

interface UsePlayUrlReturn {
  playUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

export function usePlayUrl(
  id: string,
  fetcher: (id: string) => Promise<ActionResult<{ url: string }>>,
): UsePlayUrlReturn {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    const fetchUrl = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetcherRef.current(id);
        if (cancelled) return;
        if (result.success) {
          setPlayUrl(result.data.url);
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchUrl();
    return () => { cancelled = true; };
  }, [id]);

  return { playUrl, isLoading, error };
}
```

```typescript
// ❌ shared/hooks/useOriginalPlayUrl.ts에 배치하면 shared → features FSD 위반
// ✅ pages 레이어에 래퍼 훅 배치 (Finding #5 참조)

// src/fsd/pages/uploadDetail/hooks/useOriginalPlayUrl.ts
import { usePlayUrl } from "~/fsd/shared/hooks/usePlayUrl";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";

export function useOriginalPlayUrl(fileId: string) {
  return usePlayUrl(fileId, getOriginalPlayUrl);
}
// pages → features, pages → shared 모두 FSD 규칙 준수
```

```typescript
// ⚠️ useClipPlayUrl — shared/hooks/ 위치 유지 불가
// getClipPlayUrl이 ~/fsd/features/clip/api에 위치하므로, shared → features FSD 위반 발생.
// useOriginalPlayUrl과 동일 원칙 적용: pages 레이어로 이동하거나 widget에서 fetcher를 prop으로 주입해야 함.
// → clip-display 위젯 리팩토링 시 함께 처리 (별도 PR 권장, 본 PR 범위 외)
```

> **⚠️ 4차 검증 결과 — `fetcher` 참조 안정성 문제 (CRITICAL)**
>
> 초기 제안은 `useEffect` dependency에 `[id, fetcher]`를 사용했으나, `fetcher`가 인라인 함수로 전달되면 **매 렌더마다 새 참조가 생성**되어 **무한 렌더링**이 발생한다.
>
> **위험 시나리오**:
> ```typescript
> // ❌ 인라인 함수 → 매 렌더마다 새 참조 → useEffect 무한 실행
> <UploadedFileCard fetchPlayUrl={(id) => getOriginalPlayUrl(id)} />
> ```
>
> 현재 제안된 사용 패턴(모듈 레벨 함수 `getOriginalPlayUrl` 직접 전달)에서는 참조가 안정적이라 문제없지만, 향후 유지보수 시 footgun이 될 수 있다.
>
> **해결**: `useRef`로 `fetcher`를 감싸고, dependency에서 제거하여 `id` 변경 시에만 재실행되도록 변경. 위 코드에 이미 반영됨.

**효과**: 20줄 x 3곳 = 60줄 중복 → 1곳 집중. cleanup 로직 추가로 race condition 방지. `useRef` 패턴으로 fetcher 참조 안정성 보장.

---

### 5. Widget → features/ 직접 import (FSD 레이어 위반)

**스킬**: Frontend Coupling  
**위치**: `ui/_component/UploadedFileCard.tsx:7`

**현재 코드**:
```typescript
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
```

**문제**: FSD 규칙상 `widgets`는 `features`를 직접 import할 수 없음. 의존 방향: `pages → widgets → shared`. Widget이 feature API를 직접 참조하면 재사용 불가.

> **⚠️ 검증 결과 — 설계 수정 필요 (CRITICAL)**
>
> 초기 제안은 `useOriginalPlayUrl` 훅을 `shared/hooks/`에 배치하고 내부에서 `getOriginalPlayUrl`을 import하는 것이었으나, 이는 **shared → features import**이 되어 **더 심각한 FSD 위반**을 발생시킴. shared는 최하위 레이어이므로 상위 레이어를 절대 import할 수 없음.

**개선안 (수정됨)**: `usePlayUrl` 제네릭 훅만 shared에 배치하고, `fetcher` 함수는 **pages 레벨에서 주입**한다.

```typescript
// src/fsd/shared/hooks/usePlayUrl.ts — 제네릭 훅 (shared 레이어, 외부 의존 없음)
// Finding #4에서 정의한 그대로 사용. fetcher를 매개변수로 받으므로 FSD 위반 없음.
```

```typescript
// Widget에서는 fetcher를 props로 받거나, pages에서 훅을 조립하여 전달
// 방법 A: pages에서 UploadedFileList를 거쳐 전달 (prop drilling)
//
// 1) src/fsd/pages/dashboard/ui/index.tsx (pages 레이어 — features import 가능)
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
<UploadedFileList files={uploadedFiles} fetchPlayUrl={getOriginalPlayUrl} />

// 2) src/fsd/widgets/uploaded-file-list/ui/index.tsx (passthrough)
interface UploadedFileListProps {
  files: UploadedFileSummary[];
  fetchPlayUrl: (id: string) => Promise<ActionResult<{ url: string }>>;
}
// ...
<UploadedFileCard file={file} fetchPlayUrl={fetchPlayUrl} />

// 3) src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx
// fetchPlayUrl을 usePlayUrl에 전달
const { playUrl, isLoading, error } = usePlayUrl(file.id, fetchPlayUrl);
```

```typescript
// 방법 B: pages 레이어에 래퍼 훅 배치
// src/fsd/pages/uploadDetail/hooks/useOriginalPlayUrl.ts
import { usePlayUrl } from "~/fsd/shared/hooks/usePlayUrl";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";

export function useOriginalPlayUrl(fileId: string) {
  return usePlayUrl(fileId, getOriginalPlayUrl);
}
// pages → features import은 FSD 규칙 준수 (pages > features)
```

**효과**: FSD 레이어 규칙 완전 준수, 위젯 재사용성 확보.

---

## MEDIUM Priority

### 6. model/ 디렉토리 미활용

**스킬**: Frontend Cohesion  
**위치**: `widgets/uploaded-file-list/` (model/ 부재)

**현재 상태**: 타입이 컴포넌트 파일에 인라인 정의. 프로젝트 내 다른 slice는 `model/`에 타입 배치 (`uploadDetail/model/type.ts`, `features/billing/model/types.ts`).

**개선안**: Finding #2에서 정의한 `UploadedFileSummary`를 `model/types.ts`에 배치.

```
uploaded-file-list/
├── model/
│   └── types.ts          ← 추가
└── ui/
    ├── index.tsx
    └── _component/
        └── UploadedFileCard.tsx
```

---

### 7. 과도하게 긴 변수명

**스킬**: Naming Conventions  
**위치**: `UploadedFileCard.tsx:33-34`

**현재 코드**:
```typescript
const [isLoadingOriginalPlayUrl, setIsLoadingOriginalPlayUrl] = useState<boolean>(true);
```

**문제**: 컴포넌트 스코프에 로딩 상태가 하나뿐인데 풀네임 사용. `setIsLoadingOriginalPlayUrl`은 38자.

**개선안**: 훅 추출 시 자동 해결.
```typescript
const { playUrl, isLoading, error } = useOriginalPlayUrl(file.id);
```

---

### 8. 폴더명 camelCase/kebab-case 혼용

**스킬**: Naming Conventions  
**위치**: 프로젝트 전반

| 현재 | 규칙 위반 |
|------|-----------|
| `widgets/loginForm/` | camelCase (대다수는 kebab-case) |
| `pages/uploadDetail/` | camelCase |
| `widgets/signupForm/` | camelCase |

**개선안**: kebab-case로 통일 (`login-form`, `upload-detail`, `signup-form`). 이 위젯(`uploaded-file-list`)은 이미 kebab-case로 규칙 준수 중.

> 참고: 이 항목은 `uploaded-file-list` 자체의 문제가 아니라 프로젝트 전반 컨벤션 이슈. 별도 PR로 처리 권장.

---

### 9. `fileName` vs DB `displayName` 불일치

**스킬**: Naming Conventions  
**위치**: Props `fileName` vs Prisma `displayName`

**현재 상태**:
- Prisma schema: `displayName String`
- Widget props: `fileName: string`
- Dashboard 서버 컴포넌트에서 `displayName` → `fileName`으로 매핑하는 것으로 추정

**개선안**: 두 가지 선택지:
1. Props를 `displayName`으로 통일 (DB 스키마와 일치)
2. 매핑 위치를 명시적으로 문서화

권장: `displayName`으로 통일. `UploadedFileSummary` 타입 정의 시 반영.

---

### 10. 비디오 로딩/에러 상태 UI 부재

**스킬**: Frontend Readability  
**위치**: `UploadedFileCard.tsx:70-79`

**현재 코드**:
```tsx
{!isLoadingOriginalPlayUrl && playUrl && (
  <div className="flex flex-col gap-y-2">
    <video src={playUrl} controls preload="metadata" className="w-full rounded-md object-cover" />
  </div>
)}
```

**문제**: 로딩 중에는 아무것도 표시되지 않아 카드 높이가 점프. 에러 시에도 무반응.

**개선안**: 로딩 스켈레톤과 에러 플레이스홀더 추가.

```tsx
{isLoading && (
  <div className="aspect-video w-full animate-pulse rounded-md bg-muted" />
)}
{!isLoading && error && (
  <div className="aspect-video flex items-center justify-center rounded-md bg-muted">
    <p className="text-muted-foreground text-xs">Video unavailable</p>
  </div>
)}
{!isLoading && playUrl && (
  <video src={playUrl} controls preload="metadata" className="w-full rounded-md object-cover" />
)}
```

---

### 11. Link 내부 video controls 클릭 충돌

**스킬**: Frontend Coupling  
**위치**: `UploadedFileCard.tsx:59,72-77`

**현재 코드**:
```tsx
<Link href={detailHref} className="block focus:outline-none">
  <Card>
    {/* ... */}
    <video src={playUrl} controls preload="metadata" />
    {/* ... */}
  </Card>
</Link>
```

**문제**: `<video controls>` 내부 클릭(재생/일시정지/볼륨)이 `<Link>`로 버블링되어 페이지 이동 발생.

**개선안**: 비디오 래퍼에 bubbling phase에서 `stopPropagation`.

> **⚠️ 검증 결과 — 코드 수정 (SIGNIFICANT)**
>
> 초기 제안의 `onClickCapture`에서 `stopPropagation()`은 **capture phase에서 이벤트를 차단**하여 video controls(재생/일시정지/볼륨)에 이벤트가 도달하지 않는 버그를 발생시킴.
> 이벤트 전파 순서: `window → div(capture) → video(target) → div(bubble) → Link`. capture에서 멈추면 video(target)에 도달 불가.
> **bubbling phase**에서 차단해야 video 내부 controls는 정상 동작하면서 Link로의 전파만 막을 수 있음.

```tsx
<div onClick={(e) => e.stopPropagation()}>
  <video src={playUrl} controls preload="metadata" className="w-full rounded-md object-cover" />
</div>
```

또는 카드 내부에서는 poster 이미지(썸네일)만 표시하고 상세 페이지에서 재생하는 방식으로 변경.

---

## LOW Priority

### 12. 불필요한 `useState<boolean>` 타입 어노테이션

**스킬**: TypeScript Clean Code  
**위치**: `UploadedFileCard.tsx:34`

```typescript
// 현재: 초기값으로 타입 추론 가능
useState<boolean>(true);
// 개선: 어노테이션 제거
useState(true);
```

---

### 13. DateTimeFormat 매 렌더링마다 생성

**스킬**: Frontend Predictability  
**위치**: `UploadedFileCard.tsx:27-30`

```typescript
// 현재: 렌더링마다 새 인스턴스
const createdLabel = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" })
  .format(new Date(file.createdAt));

// 개선: 모듈 스코프로 호이스팅
const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

// 컴포넌트 내부
const createdLabel = dateFormatter.format(new Date(file.createdAt));
```

---

### 14. 불필요한 div wrapper

**스킬**: Frontend Readability  
**위치**: `UploadedFileCard.tsx:71-78`

```tsx
// 현재: 단일 자식에 불필요한 flex wrapper
<div className="flex flex-col gap-y-2">
  <video ... />
</div>

// 개선: wrapper 제거
<video ... />
```

동일 패턴이 `OriginalMediaCard.tsx:77-83`에도 존재.

---

### 15. 하드코딩된 로케일 "en"

**스킬**: Frontend Readability  
**위치**: `UploadedFileCard.tsx:27`

```typescript
new Intl.DateTimeFormat("en", { ... })
```

동시에 `QueueStatus.tsx`에서는 `toLocaleString()` (브라우저 기본 로케일) 사용. 동일 데이터가 뷰마다 다른 포맷으로 표시됨.

**개선안**: 공유 유틸리티로 통일하거나, 둘 다 브라우저 로케일 사용.

---

### 16. `_component` 폴더 컨벤션

**스킬**: Frontend File Naming  
**위치**: `ui/_component/`

Next.js App Router에서 `_` prefix는 라우팅 제외를 의미하지만, FSD slice 내부에서는 라우팅과 무관. 다만 프로젝트 전반에서 일관되게 사용 중이므로 **변경 불필요**. 프로젝트 컨벤션으로 문서화 권장.

---

## 구현 순서

### Phase 1: 공유 타입 & 훅 추출 (HIGH 5건 해결)

> Finding #1, #2, #3, #4, #5, #6, #7 동시 해결

| 순서 | 작업 | 파일 |
|------|------|------|
| 1-1 | `ProcessingStatus` 타입을 shared로 이동 | `src/fsd/shared/types/processing-status.ts` (신규) |
| 1-2 | `usePlayUrl` 제네릭 훅 생성 | `src/fsd/shared/hooks/usePlayUrl.ts` (신규) |
| 1-3 | `useOriginalPlayUrl` 래퍼를 **pages 레이어**에 생성 | `src/fsd/pages/uploadDetail/hooks/useOriginalPlayUrl.ts` (신규) |
| ~~1-4~~ | ~~`useClipPlayUrl` → `usePlayUrl` 래퍼로 리팩토링~~ | ~~`src/fsd/shared/hooks/useClipPlayUrl.ts` (수정)~~ → 별도 clip-display 리팩토링 PR에서 처리 (본 PR 범위 외). `getClipPlayUrl`이 `features/clip/api`에 위치하므로 shared에서 래퍼로 전환해도 FSD 위반 유지됨 |
| 1-5 | `UploadedFileSummary` 타입 정의 | `src/fsd/widgets/uploaded-file-list/model/types.ts` (신규) |
| 1-6 | `UploadedFileCard` 리팩토링 (fetcher를 props로 받도록 변경) | `ui/_component/UploadedFileCard.tsx` (수정) |
| 1-7 | `UploadedFileList` 타입 교체 + `fetchPlayUrl` prop 추가 및 `UploadedFileCard`로 전달 | `ui/index.tsx` (수정) |
| 1-8 | `OriginalMediaCard` 리팩토링 (pages 레이어 훅 사용) | `pages/uploadDetail/ui/_component/OriginalMediaCard.tsx` (수정) |
| 1-9 | 기존 `uploadDetail/model/type.ts` → shared 타입 import 후 re-export로 변경 | `pages/uploadDetail/model/type.ts` (수정) |
| 1-10 | `pages/dashboard/model/type.ts`의 `UploadedFile` → `UploadedFileSummary` 통합, `hasStatusConfig` 매개변수 타입 조정 | `pages/dashboard/model/type.ts` (수정) |
| 1-11 | `QueueStatus.tsx`의 `StatusBadge` 로컬 컴포넌트 `status` 파라미터를 `ProcessingStatus`로 변경 (3차 검증 추가) | `pages/dashboard/ui/_component/QueueStatus.tsx` (수정) |
| 1-12 | `UploadDetailPageProps.status` → `ProcessingStatus`로 변경, 내부 `as ProcessingStatus` 단언 제거 (3차 검증 추가) | `pages/uploadDetail/ui/index.tsx` (수정) |
| 1-13 | upload detail 라우트 페이지에서 데이터 경계 타입 단언 추가 (3차 검증 추가) | `src/app/dashboard/uploads/[uploadedFileId]/page.tsx` (수정) |
| 1-14 | `ProcessingTimeline.tsx`의 `ProcessingStatus` import 경로를 shared로 변경 (5차 검증 추가) | `pages/uploadDetail/ui/_component/ProcessingTimeline.tsx` (수정) |
| 1-15 | dashboard 서버 컴포넌트에서 `formattedFiles` 매핑 시 `status` 타입 단언 추가 (6차 검증 추가) | `src/app/dashboard/page.tsx` (수정) |
| 1-16 | `DashboardView`에서 `getOriginalPlayUrl` import 추가 + `UploadedFileList`에 `fetchPlayUrl` prop 전달 (6차 검증 추가) | `src/fsd/pages/dashboard/ui/index.tsx` (수정) |

### Phase 2: UI/UX 개선 (MEDIUM 3건 해결)

> Finding #10, #11, #14 해결

| 순서 | 작업 | 파일 |
|------|------|------|
| 2-1 | 비디오 로딩 스켈레톤 & 에러 UI 추가 | `UploadedFileCard.tsx` (수정) |
| 2-2 | Link 내부 video 클릭 전파 차단 | `UploadedFileCard.tsx` (수정) |
| 2-3 | 불필요한 div wrapper 제거 | `UploadedFileCard.tsx`, `OriginalMediaCard.tsx` (수정) |

### Phase 3: 네이밍 & 컨벤션 정리 (별도 PR 권장)

> Finding #8, #9, #12, #13, #15 해결

| 순서 | 작업 |
|------|------|
| 3-1 | 폴더명 kebab-case 통일 (`loginForm` → `login-form` 등) |
| 3-2 | `fileName` → `displayName` 통일 |
| 3-3 | 날짜 포맷 유틸리티 추출 |
| 3-4 | 불필요한 타입 어노테이션 제거 |

---

## 영향 범위

| 변경 대상 | 변경 유형 |
|-----------|-----------|
| `src/fsd/shared/types/processing-status.ts` | 신규 |
| `src/fsd/shared/hooks/usePlayUrl.ts` | 신규 |
| ~~`src/fsd/shared/hooks/useOriginalPlayUrl.ts`~~ | ~~신규~~ → FSD 위반으로 취소 |
| `src/fsd/pages/uploadDetail/hooks/useOriginalPlayUrl.ts` | 신규 (pages 레이어에 배치) |
| ~~`src/fsd/shared/hooks/useClipPlayUrl.ts`~~ | ~~수정 (래퍼로 전환)~~ → 별도 clip-display 리팩토링 PR로 분리 |
| `src/fsd/widgets/uploaded-file-list/model/types.ts` | 신규 |
| `src/fsd/widgets/uploaded-file-list/ui/index.tsx` | 수정 (타입 import + `fetchPlayUrl` prop 추가/전달) |
| `src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx` | 수정 (주요 리팩토링, fetcher props 추가) |
| `src/fsd/pages/uploadDetail/ui/_component/OriginalMediaCard.tsx` | 수정 (pages 레이어 훅 적용) |
| `src/fsd/pages/uploadDetail/model/type.ts` | 수정 (shared 타입 참조) |
| `src/fsd/pages/dashboard/model/type.ts` | 수정 (`UploadedFile` → `UploadedFileSummary` 통합, `hasStatusConfig` 타입 조정) |
| `src/fsd/pages/dashboard/ui/index.tsx` | 수정 (`getOriginalPlayUrl` import 추가, `UploadedFileList`에 `fetchPlayUrl` prop 전달, 6차 검증에서 구현 단계 추가) |
| `src/app/dashboard/page.tsx` | 수정 (`formattedFiles` 매핑 시 `status` 타입 단언 추가, 6차 검증에서 구현 단계 추가) |
| `src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx` | 수정 (`StatusBadge` 로컬 컴포넌트의 `status: string` → `ProcessingStatus` 변경, 3차 검증) |
| `src/app/dashboard/uploads/[uploadedFileId]/page.tsx` | 수정 (데이터 경계에서 `status` 타입 단언 추가, 3차 검증) |
| `src/fsd/pages/uploadDetail/ui/index.tsx` | 수정 (`UploadDetailPageProps.status` → `ProcessingStatus` 변경, 내부 `as ProcessingStatus` 단언 제거, 3차 검증) |
| `src/fsd/pages/uploadDetail/ui/_component/ProcessingTimeline.tsx` | 수정 (`ProcessingStatus` import 경로를 `../../model/type` → `~/fsd/shared/types/processing-status`로 변경, 5차 검증) |

> **⚠️ 5차 검증 결과 — `ProcessingTimeline.tsx` import 경로 변경 필요 (SIGNIFICANT)**
>
> `ProcessingTimeline.tsx:5`에서 `ProcessingStatus`를 `../../model/type`(상대 경로, `uploadDetail/model/type.ts`)에서 import하고 있다. `ProcessingStatus`가 `shared/types/processing-status.ts`로 이동하면, 이 import 경로도 변경해야 한다.
>
> **현재 코드** (`ProcessingTimeline.tsx:5`):
> ```typescript
> import type { ProcessingStatus } from "../../model/type";
> ```
>
> **수정 필요**:
> ```typescript
> import type { ProcessingStatus } from "~/fsd/shared/types/processing-status";
> ```
>
> 단, step 1-9에서 `uploadDetail/model/type.ts`가 `ProcessingStatus`를 shared에서 import 후 **re-export**하도록 변경하면 기존 상대 경로 import도 동작한다. 그러나 일관성을 위해 shared 경로로 직접 import하는 것을 권장한다. `uploadDetail/model/type.ts`의 re-export는 점진적 마이그레이션을 위한 과도기 조치이며, 최종적으로는 모든 소비처가 shared에서 직접 import해야 한다.

> **⚠️ `src/app/dashboard/page.tsx` 필수 수정 사항**
>
> `UploadedFileSummary.status`가 `string` → `ProcessingStatus`로 변경되면, 서버 컴포넌트에서 Prisma가 반환하는 `file.status`(plain `string`)를 `ProcessingStatus`에 할당할 수 없어 **타입 에러가 발생**한다.
>
> **현재 코드** (`src/app/dashboard/page.tsx`):
> ```typescript
> const formattedFiles = userData.uploadedFiles.map((file) => ({
>   id: file.id,
>   fileName: file.displayName ?? "Untitled",
>   status: file.status,     // ← string (Prisma 반환값)
>   clipsCount: file._count.clips,
>   createdAt: file.createdAt,
> }));
> ```
>
> **수정 필요**:
> ```typescript
> import type { ProcessingStatus } from "~/fsd/shared/types/processing-status";
>
> const formattedFiles = userData.uploadedFiles.map((file) => ({
>   id: file.id,
>   fileName: file.displayName ?? "Untitled",
>   status: file.status as ProcessingStatus,  // 데이터 경계에서 타입 단언
>   clipsCount: file._count.clips,
>   createdAt: file.createdAt,
> }));
> ```
>
> Prisma 스키마의 `status`가 `String` 타입인 한, 이 데이터 경계에서의 타입 단언은 불가피하다. 컴포넌트 내부(`uploadDetail/ui/index.tsx:82`)에서 사용하던 `as ProcessingStatus`를 서버 컴포넌트(데이터 경계)로 이동시키는 것이 이 리팩토링의 핵심이다.

> **⚠️ 4차 검증 결과 — `getUploadedFileDetails` / `getOriginalPlayUrl` 중복 함수 정리 필요 (SIGNIFICANT)**
>
> 동일 함수가 legacy 경로와 FSD 경로에 **중복 존재**한다:
>
> | 함수 | Legacy 경로 (`src/actions/`) | FSD 경로 (`src/fsd/features/upload/api/`) |
> |------|------------------------------|------------------------------------------|
> | `getUploadedFileDetails` | `uploaded-files.ts:16-39` | `index.ts:63-86` |
> | `getOriginalPlayUrl` | `uploaded-files.ts:41-74` | `index.ts:91-115` |
>
> **현재 상황**:
> - `src/app/dashboard/uploads/[uploadedFileId]/page.tsx`는 **legacy 경로**(`~/actions/uploaded-files`)에서 import
> - `UploadedFileCard.tsx`, `OriginalMediaCard.tsx`는 **FSD 경로**(`~/fsd/features/upload/api`)에서 import
> - legacy `getOriginalPlayUrl`은 `ActionResult<{ url: string }>`을 반환하지 않아, 본 제안서의 `usePlayUrl` 타입 시그니처와 **호환되지 않음**
>
> **권장**: 이번 리팩토링과 함께 upload detail 라우트 페이지의 import를 FSD 경로로 통일하고, legacy 경로의 중복 함수는 제거하거나 FSD 경로로 re-export하는 방식으로 정리. 최소한 `getOriginalPlayUrl`은 FSD 경로로 통일해야 `usePlayUrl` 훅의 `fetcher` 타입과 일관성이 유지된다.

> **⚠️ `src/app/dashboard/uploads/[uploadedFileId]/page.tsx` 필수 수정 사항 (3차 검증 추가)**
>
> `dashboard/page.tsx`와 동일한 문제가 upload detail 라우트 페이지에도 존재한다. `getUploadedFileDetails`가 반환하는 `status`도 Prisma의 plain `string`이다.
>
> 현재 `UploadDetailPage` 컴포넌트 내부(`uploadDetail/ui/index.tsx:82`)에서 `status as ProcessingStatus` 단언을 수행하고 있으며, 이를 데이터 경계(서버 컴포넌트)로 이동시키려면 이 라우트 페이지에서도 타입 단언이 필요하다.
>
> **현재 코드** (`src/app/dashboard/uploads/[uploadedFileId]/page.tsx`):
> ```typescript
> const uploadedFileData = await getUploadedFileDetails(uploadedFileId);
> return <UploadDetailPage uploadedFileData={uploadedFileData} />;
> ```
>
> **수정 필요**:
> ```typescript
> import type { ProcessingStatus } from "~/fsd/shared/types/processing-status";
>
> const uploadedFileData = await getUploadedFileDetails(uploadedFileId);
> return (
>   <UploadDetailPage
>     uploadedFileData={{
>       ...uploadedFileData,
>       status: uploadedFileData.status as ProcessingStatus,
>     }}
>   />
> );
> ```
>
> 동시에 `UploadDetailPageProps`의 `status` 타입도 `string` → `ProcessingStatus`로 변경하고, 컴포넌트 내부의 `status as ProcessingStatus` 단언(82행)을 제거해야 한다.

> **⚠️ 6차 검증 결과 — 구현 순서에 필수 수정 파일 2개 누락 (CRITICAL)**
>
> 영향 범위 테이블에는 기재되어 있으나, Phase 1 구현 순서(1-1 ~ 1-14)에 해당 단계가 빠져 있어 **구현 순서대로 진행하면 빌드가 깨지는** 문제가 있었다.
>
> | 누락 파일 | 필요한 수정 | 누락 시 결과 |
> |---|---|---|
> | `src/app/dashboard/page.tsx` | `formattedFiles` 매핑에서 `status: file.status as ProcessingStatus` 타입 단언 추가 | `UploadedFile.status`가 `ProcessingStatus`로 변경되면 Prisma 반환값(`string`)을 할당 불가 → **컴파일 에러** |
> | `src/fsd/pages/dashboard/ui/index.tsx` | `getOriginalPlayUrl` import 추가 + `<UploadedFileList>`에 `fetchPlayUrl` prop 전달 | step 1-7에서 `fetchPlayUrl`이 required prop으로 추가되므로, 전달하지 않으면 → **컴파일 에러** |
>
> **해결**: 구현 순서에 step 1-15, 1-16을 추가하여 반영 완료.

---

## 검증 방법

1. `npm run typecheck` — 타입 에러 없음 확인
2. `npm run lint` — ESLint 규칙 통과 확인
3. `npm run build` — 프로덕션 빌드 성공 확인
4. Dashboard 페이지에서 파일 목록 정상 렌더링 확인
5. 카드 클릭 시 상세 페이지 이동 확인
6. 비디오 controls 클릭 시 페이지 이동 없이 재생 확인
7. API 에러 시 toast 폭탄 대신 카드 내 에러 UI 표시 확인
