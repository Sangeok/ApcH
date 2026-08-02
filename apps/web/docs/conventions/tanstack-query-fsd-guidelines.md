# FSD 기반 TanStack Query 사용 가이드라인

> 기준일: 2026-04-27  
> 적용 버전: `@tanstack/react-query` v5 계열

이 문서는 **Feature-Sliced Design(FSD) 구조를 사용하는 본 프로젝트 전용 TanStack Query 컨벤션**이다. TanStack Query의 일반 사용법 자체보다, FSD 레이어와 슬라이스 경계를 지키면서 query key, query options, invalidation, polling을 어디에 어떻게 배치할지 정의한다.

새 서버 상태 코드를 작성하거나 기존 `useEffect + polling + router.refresh()` 코드를 대체할 때 이 문서를 우선 적용한다.

## 1. 사용 원칙

TanStack Query는 **client component에서 관리해야 하는 server state**에 사용한다.

적합한 대상:

- 페이지에 머무는 동안 바뀌는 데이터
- polling, window focus refetch, reconnect refetch가 필요한 데이터
- mutation 이후 invalidate/refetch가 필요한 데이터
- 여러 client component가 공유하는 서버 데이터
- optimistic update가 필요한 데이터

계속 Server Component fetch로 두는 것이 적절한 대상:

- 최초 렌더링에만 필요한 정적/준정적 데이터
- SEO, metadata와 강하게 연결된 데이터
- `redirect`, `notFound`, auth gate처럼 서버 라우팅 제어와 붙은 데이터
- 서버에서만 접근 가능한 비밀값이나 DB cursor를 직접 다루는 로직

## 2. Provider 규칙

TanStack Query Provider는 앱 루트에서 한 번만 제공한다.

- Provider 위치: `src/app/providers.tsx`
- 적용 위치: `src/app/layout.tsx`
- 새 페이지나 feature에서 별도의 `QueryClientProvider`를 중첩하지 않는다.
- 테스트, Storybook, 격리된 sandbox 같은 특수 환경만 예외로 한다.

`QueryClient`는 render 중 새로 만들지 않는다. 브라우저에서는 싱글턴을 재사용하고, 서버에서는 요청 단위로 새 client를 만든다.

## 3. Query Key 기본 규칙

TanStack Query의 query key는 top-level array여야 하며, query function이 의존하는 모든 변수를 포함해야 한다.

기본 형태:

```ts
["uploadedFiles", "detail", uploadedFileId] as const;
```

규칙:

- key 첫 segment는 도메인 namespace를 사용한다. 예: `"uploadedFiles"`, `"clips"`, `"billing"`, `"user"`
- route 이름이나 page 이름이 아니라 **데이터 도메인**을 기준으로 이름 짓는다.
- detail key에는 entity id를 포함한다.
- list key에는 filter, pagination, sort 등 fetch 입력값을 포함한다.
- filter류 값은 positional array보다 object segment를 우선한다.
- key에 넣는 값은 JSON 직렬화 가능한 값이어야 한다.
- `Date`, `File`, class instance, function, React component, non-plain object를 key에 넣지 않는다.
- query 결과에서 나온 상태값은 key에 넣지 않는다. 예: `status`는 polling 여부 판단에 쓰되, detail fetch 입력값이 아니면 key에 넣지 않는다.

금지:

```ts
// 금지: string key
queryKey: "uploaded-file-detail";

// 금지: route/page 중심 이름
queryKey: ["upload-detail", uploadedFileId];

// 금지: 반환 상태를 key에 포함
queryKey: ["uploadedFiles", "detail", uploadedFileId, status];

// 금지: list filter를 순서 의존 array로 나열
queryKey: ["uploadedFiles", "list", status, page, sort];
```

권장:

```ts
queryKey: ["uploadedFiles", "detail", uploadedFileId] as const;

queryKey: [
  "uploadedFiles",
  "list",
  {
    status,
    page,
    sort,
  },
] as const;
```

## 4. Query Key Factory 규칙

프로덕션 코드에서는 query key를 component 안에 inline으로 만들지 않는다. 도메인별 key factory를 사용한다.

권장 위치:

```txt
src/fsd/entities/<domain>/model/query-keys.ts
```

예시:

```ts
export interface UploadedFileListFilters {
  status?: string;
  page?: number;
  sort?: "createdAt-desc" | "createdAt-asc";
}

export const uploadedFileKeys = {
  all: ["uploadedFiles"] as const,

  lists: () => [...uploadedFileKeys.all, "list"] as const,
  list: (filters: UploadedFileListFilters = {}) =>
    [...uploadedFileKeys.lists(), filters] as const,

  details: () => [...uploadedFileKeys.all, "detail"] as const,
  detail: (uploadedFileId: string) =>
    [...uploadedFileKeys.details(), uploadedFileId] as const,
};
```

사용:

```ts
queryKey: uploadedFileKeys.detail(uploadedFileId);
```

이 구조를 쓰면 invalidation 범위를 의도대로 조절할 수 있다.

```ts
// uploadedFiles 전체
queryClient.invalidateQueries({
  queryKey: uploadedFileKeys.all,
});

// uploadedFiles list 계열만
queryClient.invalidateQueries({
  queryKey: uploadedFileKeys.lists(),
});

// 특정 detail만
queryClient.invalidateQueries({
  queryKey: uploadedFileKeys.detail(uploadedFileId),
});
```

## 5. Query Options 규칙

`queryKey`와 `queryFn`을 여러 곳에서 공유해야 하면 TanStack Query v5의 `queryOptions` helper를 사용한다.

권장:

```ts
import { queryOptions } from "@tanstack/react-query";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file/model/query-keys";
import { getUploadedFileDetails } from "~/fsd/features/upload/api";

export const uploadedFileDetailQueryOptions = (uploadedFileId: string) =>
  queryOptions({
    queryKey: uploadedFileKeys.detail(uploadedFileId),
    queryFn: async () => {
      const data = await getUploadedFileDetails(uploadedFileId);

      if (!data) {
        throw new Error("Upload detail not found");
      }

      return data;
    },
  });
```

사용:

```ts
const query = useQuery({
  ...uploadedFileDetailQueryOptions(uploadedFileId),
  initialData: uploadedFileData,
});
```

`queryOptions`의 장점:

- `useQuery`, `prefetchQuery`, `invalidateQueries`, `getQueryData`에서 같은 key와 fetcher를 재사용할 수 있다.
- `queryOptions(...).queryKey`가 queryFn의 반환 타입 정보를 보존하므로 TypeScript 추론이 좋아진다.
- key와 queryFn이 흩어지지 않는다.

## 6. FSD 배치 규칙

TanStack Query 코드는 FSD 의존성 규칙을 깨지 않게 배치한다.

### 6.1 Query key factory

Query key factory는 도메인 cache namespace이므로 entity의 `model/`에 둔다.

```txt
src/fsd/entities/uploaded-file/model/query-keys.ts
```

이 파일은 순수해야 한다.

- 허용: 타입, string literal, key factory 함수
- 금지: server action import, route fetcher import, DB import, React hook import

### 6.2 Query options

`queryOptions`는 queryFn이 호출하는 fetcher를 소유한 레이어에 둔다.

예시:

```txt
src/fsd/features/upload/model/query-options.ts
```

`uploadedFileDetailQueryOptions`가 `features/upload/api`의 server action을 호출한다면, query options도 `features/upload/model/`에 두는 것이 맞다. `entities/uploaded-file/model/query-options.ts`에 두면 entity가 feature를 import하게 되어 FSD 위반이다.

페이지 전용 집계 fetcher라면 page slice의 `model/`에 둘 수 있다.

```txt
src/fsd/pages/upload-detail/model/query-options.ts
```

다만 여러 페이지나 feature에서 재사용될 수 있는 데이터라면 page 전용으로 가두지 말고 feature/entity 경계를 다시 검토한다.

### 6.3 Custom hook

반복되는 query 조합이 생기면 custom hook을 만들 수 있다.

권장 위치:

```txt
src/fsd/features/upload/model/use-uploaded-file-detail-query.ts
```

금지:

```txt
src/fsd/features/upload/hooks/use-uploaded-file-detail-query.ts
src/fsd/features/upload/model/hooks/use-uploaded-file-detail-query.ts
```

`hooks/` 세그먼트는 만들지 않는다. hook은 구현 방식이고, 파일은 목적 기준으로 `model/`에 둔다.

## 7. Polling 규칙

polling은 `useEffect`, `setInterval`, `router.refresh()`로 직접 구현하지 않는다. TanStack Query 옵션을 사용한다.

권장:

```ts
const POLLING_INTERVAL_MS = 7_500;

useQuery({
  ...uploadedFileDetailQueryOptions(uploadedFileId),
  initialData: uploadedFileData,
  staleTime: POLLING_INTERVAL_MS,
  refetchInterval: (query) =>
    isActiveProcessingStatus(
      query.state.data?.status ?? uploadedFileData.status,
    )
      ? POLLING_INTERVAL_MS
      : false,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: (query) =>
    isActiveProcessingStatus(
      query.state.data?.status ?? uploadedFileData.status,
    )
      ? "always"
      : false,
  refetchOnReconnect: (query) =>
    isActiveProcessingStatus(
      query.state.data?.status ?? uploadedFileData.status,
    )
      ? "always"
      : false,
});
```

규칙:

- background tab polling은 기본적으로 끈다. `refetchIntervalInBackground: false`
- focus/reconnect 시 최신성이 필요한 query만 `"always"`를 사용한다.
- polling 조건은 반환된 데이터 상태를 보고 결정할 수 있다.
- polling 여부를 위해 `status`를 query key에 넣지 않는다.

## 8. Mutation과 Invalidation 규칙

새 client-side mutation은 `useMutation`을 우선 사용한다.

mutation 성공 후에는 영향받은 query key를 명시적으로 invalidate한다.

```ts
const queryClient = useQueryClient();

const mutation = useMutation({
  mutationFn: () => reprocessUploadedFile(uploadedFileId),
  onSuccess: () => {
    void queryClient.invalidateQueries({
      queryKey: uploadedFileKeys.detail(uploadedFileId),
    });

    void queryClient.invalidateQueries({
      queryKey: uploadedFileKeys.lists(),
    });
  },
});
```

규칙:

- mutation이 특정 entity 하나만 바꾸면 detail key를 invalidate한다.
- list에 노출되는 값도 바뀌면 list prefix도 invalidate한다.
- 여러 도메인에 영향이 있으면 각 도메인의 key factory를 사용해 명시한다.
- `queryClient.invalidateQueries()`처럼 전체 cache를 날리는 방식은 피한다.
- `router.refresh()`는 RSC layout/header 데이터까지 반드시 다시 받아야 하는 경우에만 사용한다.

### 8.1 Mutation ownership 규칙

mutation을 발생시키는 feature가 mutation hook과 invalidation을 함께 소유한다.

권장 구조:

```txt
src/fsd/features/upload/model/use-reprocess-uploaded-file.ts
  - useMutation
  - reprocessUploadedFile
  - queryClient.invalidateQueries(...)

src/fsd/features/upload/ui/index.tsx
  - useReprocessUploadedFile(uploadedFileId)

src/fsd/pages/upload-detail/ui/index.tsx
  - useQuery로 detail data 소비
  - reprocess mutation/invalidation을 모름
```

권장 예시:

```ts
export function useReprocessUploadedFile(uploadedFileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await reprocessUploadedFile(uploadedFileId);

      if (!result.success) {
        throw new Error(result.error ?? "Failed to reprocess file");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: uploadedFileKeys.detail(uploadedFileId),
        }),
        queryClient.invalidateQueries({
          queryKey: uploadedFileKeys.lists(),
        }),
      ]);
    },
  });
}
```

규칙:

- `useQueryClient()`는 cache 작업을 수행하는 feature model hook 내부에서 호출한다.
- page component는 mutation 성공 후 invalidate callback을 child component에 넘기지 않는다.
- page component는 `queryClient`나 invalidate callback의 전달자가 되지 않는다.
- feature UI component는 feature model hook을 호출하고, toast/confirmation/disabled state 같은 사용자 상호작용을 처리한다.
- mutation hook은 성공 시 영향받는 detail/list key를 targeted invalidate한다.
- mutation hook은 Server Action의 `ActionResult<T>` 실패를 `throw new Error(...)`로 변환한다.
- feature 내부에서만 쓰는 mutation hook은 feature public API에서 export하지 않아도 된다.

금지:

```tsx
// 금지: page가 invalidation을 소유하고 feature UI에 callback으로 전달
const queryClient = useQueryClient();

const handleReprocessSuccess = () => {
  void queryClient.invalidateQueries({
    queryKey: uploadedFileKeys.detail(uploadedFileId),
  });
};

return (
  <UploadedFileActions
    uploadedFileId={uploadedFileId}
    onReprocessSuccess={handleReprocessSuccess}
  />
);
```

예외:

- mutation 결과가 page-local UI 상태만 바꾸고 cache invalidation이 전혀 필요 없다면 page-local handler로 둘 수 있다.
- mutation 성공 후 RSC layout/header 데이터까지 반드시 갱신해야 하면 `router.refresh()`를 추가로 사용할 수 있다. 이 경우에도 query invalidation을 대체하기 위해 `router.refresh()`만 사용하는 것은 피한다.

## 9. Server Component 초기 데이터 규칙

Next.js App Router에서는 Server Component fetch와 TanStack Query를 함께 쓸 수 있다.

권장 패턴:

1. Server Component에서 auth, `notFound`, 최초 데이터 조회를 처리한다.
2. Client Component에 `initialData`로 넘긴다.
3. Client Component의 `useQuery`가 이후 refetch, polling, focus refresh를 소유한다.

예시:

```tsx
// Server Component
const uploadedFileData = await getUploadedFileDetails(uploadedFileId);

if (!uploadedFileData) {
  notFound();
}

return <UploadDetailPage uploadedFileData={uploadedFileData} />;
```

```tsx
// Client Component
const query = useQuery({
  ...uploadedFileDetailQueryOptions(uploadedFileData.id),
  initialData: uploadedFileData,
});
```

hydration/dehydration은 여러 query를 서버에서 prefetch해야 하거나, 깊은 subtree에서 cache를 공유해야 할 때 도입한다. 단일 page prop이면 `initialData`를 먼저 사용한다.

## 10. Error 처리 규칙

queryFn은 실패 시 throw해야 한다. TanStack Query는 throw/rejected Promise를 기준으로 query error state를 만든다.

Server Action이 `ActionResult<T>`를 반환한다면 queryFn에서 Error로 변환한다.

```ts
queryFn: async () => {
  const result = await getBillingSummary();

  if (!result.success) {
    throw new Error(result.error ?? "Failed to load billing summary");
  }

  return result.data;
};
```

`null`이 정상적인 empty state라면 그대로 반환해도 된다. 하지만 `notFound`에 해당하는 값이면 queryFn 또는 Server Component에서 명시적으로 처리한다.

## 11. 타입 규칙

필요해질 때 전역 query key type 등록을 도입한다. query namespace가 충분히 안정되기 전에는 서두르지 않는다.

도입 예시:

```ts
import "@tanstack/react-query";

type AppQueryKey = [
  "uploadedFiles" | "clips" | "billing" | "user",
  ...ReadonlyArray<unknown>,
];

declare module "@tanstack/react-query" {
  interface Register {
    queryKey: AppQueryKey;
    mutationKey: AppQueryKey;
  }
}
```

도입 기준:

- query key namespace가 5개 이상으로 늘었다.
- inline key 실수가 반복된다.
- `invalidateQueries`, `getQueryData`, `setQueryData` 사용이 늘어 타입 안정성이 중요해졌다.

## 12. 업로드 상세 페이지 기준 개선 목표

현재 업로드 상세 페이지 계열 코드는 다음 구조를 목표로 한다.

```txt
src/fsd/entities/uploaded-file/model/query-keys.ts
  - uploadedFileKeys

src/fsd/features/upload/model/query-options.ts
  - uploadedFileDetailQueryOptions

src/fsd/pages/upload-detail/ui/index.tsx
  - useQuery({...uploadedFileDetailQueryOptions(id), initialData, polling options})
  - queryClient.invalidateQueries({ queryKey: uploadedFileKeys.detail(id) })
```

`src/fsd/pages/upload-detail/ui/index.tsx` 안에 로컬 `uploadDetailQueryKey`를 두는 방식은 초기 도입 단계에서는 허용되지만, TanStack Query를 앱 전반의 서버 상태 관리 도구로 쓰기 시작한 이후에는 도메인 key factory로 이동해야 한다.

## 13. Anti-pattern 체크리스트

다음 중 하나라도 있으면 수정한다.

- `queryKey`가 component 안에 inline string/array로 흩어져 있다.
- 같은 데이터를 가리키는 key가 여러 이름으로 존재한다.
- key 첫 segment가 route/page 이름이다.
- queryFn 입력값이 key에 빠져 있다.
- query 결과값인 `status`, `count`, `updatedAt` 등을 key에 넣었다.
- key에 `Date`, `File`, function, class instance를 넣었다.
- `useEffect + setInterval`로 server state polling을 직접 구현했다.
- mutation 후 `invalidateQueries()`로 전체 cache를 무차별 invalidate한다.
- query options가 FSD 하위 레이어에서 상위 레이어 fetcher를 import한다.
- `QueryClientProvider`를 page/feature 안에 중첩했다.
- queryFn이 실패를 throw하지 않고 `{ success: false }`를 그대로 반환한다.

## 14. 참고 문서

- TanStack Query v5 Query Keys: https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
- TanStack Query v5 Query Options: https://tanstack.com/query/v5/docs/framework/react/guides/query-options
- TanStack Query v5 TypeScript: https://tanstack.com/query/v5/docs/framework/react/typescript
- TanStack Query v5 Query Invalidation: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation
- TanStack Query v5 Query Functions: https://tanstack.com/query/v5/docs/framework/react/guides/query-functions
