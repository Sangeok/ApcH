---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-04-13"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-04-13"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# UploadPodcast handleUpload 낙관적 업데이트 기능 개발 문서

> 브리프 기반으로 작성 후 dev-doc-review 검토 완료 (2026-04-13)

## 1. 배경/동기

`UploadPodcast` 컴포넌트의 `handleUpload` 실행 시, 3단계 순차 작업이 **모두 완료된 후에야** toast가 표시된다.

```
[버튼 클릭] → generateUploadUrl (~200-500ms) → uploadFileToS3 (수 초~수 분) → processVideo (~300-700ms) → [toast]
```

파일 크기에 따라 S3 업로드만 수십 초가 걸리며, 그 동안 사용자는 `Loader2` 스피너와 "Uploading..." 텍스트만 보게 된다. 업로드가 진행 중인지, 멈춘 것인지 구분할 수 없다.

현재 코드(`useUploadPodcast.ts:44`):
```typescript
const success = await upload(file, language, clipCount);
if (success) setFiles([]);
```

`upload`의 `await`가 3단계 전체를 블로킹하고, 그 사이 어떤 UI 피드백도 없다.

## 2. 목표 상태

### 목표

- 버튼 클릭 즉시(~0ms) QueueStatus 테이블에 "queued" 상태 아이템을 낙관적으로 추가한다
- 즉시 loading toast를 표시하고, 단계별로 toast 내용을 갱신한다
- 3단계 작업은 백그라운드에서 기존과 동일하게 순차 실행한다
- 작업 완료/실패 시 낙관적 상태가 서버 상태로 자연스럽게 교체된다

### 비목표

- S3 업로드 progress bar(XHR 전환)는 이번 범위에서 구현하지 않는다
- 업로드 중 페이지 이탈 방지(beforeunload 등)는 이번 범위에서 다루지 않는다
- `processVideo` server action 내부의 DB 쿼리 최적화는 이번 범위에서 다루지 않는다
- `uploaded=false` 상태의 고아 레코드(S3 업로드 실패 시 `generateUploadUrl`이 생성한 미완료 레코드) 정리 전략은 이번 범위에서 다루지 않는다

### 성공 기준

- 버튼 클릭 후 QueueStatus 테이블에 아이템이 즉시 보인다 (체감 0ms)
- 버튼 클릭 후 loading toast가 즉시 보인다
- 업로드 실패 시 낙관적으로 추가된 아이템이 사라지고, error toast가 표시된다
- 기존 타입 체크(`npm run typecheck`) 통과
- 기존 lint(`npm run lint`) 통과

## 3. 대안 분석

### Option A: `useOptimistic` + loading toast (선택)

DashboardView에서 `useOptimistic`으로 `uploadedFiles` 배열을 감싸고, 업로드 시작 시 즉시 낙관적 아이템을 추가한다. `sonner`의 `toast.loading()` → `toast.success()`/`toast.error()` 패턴으로 단계별 피드백을 제공한다.

- 장점: 코드베이스에 이미 `useOptimistic` 패턴이 존재(`clip-display/ui/index.tsx:13`). React 19 네이티브 API라 추가 의존성 없음. `revalidatePath` 호출 시 서버 상태가 자동으로 낙관적 상태를 교체함
- 단점: 낙관적 아이템의 `id`가 임시값이므로 "View details" 링크가 작동하지 않음 (서버 상태 교체 전까지)

### Option B: 즉시 toast만 표시 (loading toast only)

`useOptimistic` 없이 `toast.loading()`만 즉시 표시하고, 완료 시 `toast.success()`로 갱신한다.

- 장점: 가장 단순. `useUploadPodcast` 훅만 수정하면 됨
- 단점: QueueStatus 테이블에는 여전히 서버 응답 후에야 아이템이 보임. 사용자가 "업로드가 목록에 안 보인다"고 혼동할 수 있음

### 선택: Option A

- 근거: toast만으로는 "목록에 반영되었다"는 시각적 확신을 줄 수 없다. `useOptimistic`이 이미 코드베이스 컨벤션이므로 일관성이 있다. 구현 복잡도는 Option B 대비 소폭 증가하나, UX 개선 폭이 크다.

## 4. 구현 계획

### 4-0. `src/app/dashboard/page.tsx` (서버 쿼리 — 변경 없음)

기존 서버 쿼리의 `where: { uploaded: true }` 필터를 **유지한다**.

초기 검토에서는 "업로드 중 Refresh 시 낙관적 아이템이 깜빡이며 사라지는 문제"를 우려하여 필터 제거를 고려했으나, `useOptimistic`의 동작 방식을 분석한 결과 필터 제거가 불필요하며 오히려 부작용이 발생한다.

**필터 유지가 안전한 이유**: `useOptimistic`은 transition 진행 중 base state(서버 prop)가 변경되어도 pending action의 reducer를 **재적용**한다. 즉, Refresh로 서버 데이터가 갱신되어도 낙관적 아이템은 transition이 끝날 때까지 유지된다. 업로드 성공 시 `processVideo` → `revalidatePath("/dashboard")` 호출로 서버 데이터에 `uploaded: true` 레코드가 포함되고, transition 종료와 함께 낙관적 아이템이 서버 상태로 자연스럽게 교체된다.

**필터 제거 시 발생하는 문제**:
1. **Refresh 중 중복 표시**: 업로드 진행 중 Refresh를 클릭하면, `generateUploadUrl`이 생성한 `uploaded: false` 레코드가 서버 데이터에 포함된다. `useOptimistic`의 reducer가 이 위에 낙관적 아이템을 추가하므로, 같은 파일이 optimistic 아이템(`id: "optimistic-..."`)과 서버 레코드(`id: "cm..."`) 두 행으로 **중복 표시**된다
2. **기존 고아 레코드 노출**: 과거 S3 업로드 실패로 남은 `uploaded: false` 고아 레코드가 QueueStatus와 "My Clips" 탭 양쪽에 **배포 즉시 노출**된다

### 4-1. `src/fsd/pages/dashboard/ui/index.tsx` (DashboardView)

`useOptimistic`으로 `uploadedFiles`를 감싸고, `addOptimisticFile` 콜백을 `UploadPodcast`에 전달한다.

**Before:**
```tsx
"use client";

// ... 기존 import (Link, Button, Card, Tabs, QueueStatus, UploadPodcast, UploadedFileList, env)
import type { UploadedFileSummary } from "../model/types";

interface DashboardViewProps {
  uploadedFiles: UploadedFileSummary[];
}

export default function DashboardView({ uploadedFiles }: DashboardViewProps) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col space-y-6 px-4 py-8">
      {/* ... header ... */}
      {/* ... env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED && Buy Credits 링크 ... */}

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="my-clips">My Clips</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <UploadPodcast />
          <QueueStatus uploadedFiles={uploadedFiles} />
        </TabsContent>

        <TabsContent value="my-clips">
          <Card>
            <CardHeader>
              <CardTitle>My Clips</CardTitle>
              <CardDescription>
                View and manage your generated clips. Processing may take a few
                minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadedFileList files={uploadedFiles} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**After:**
```tsx
"use client";

// ... 기존 import 유지 (Link, Button, Card, Tabs, QueueStatus, UploadPodcast, UploadedFileList, env)
import { useOptimistic } from "react"; // 추가
import type { UploadedFileSummary } from "../model/types";

interface DashboardViewProps {
  uploadedFiles: UploadedFileSummary[];
}

export default function DashboardView({ uploadedFiles }: DashboardViewProps) {
  const [optimisticFiles, addOptimisticFile] = useOptimistic(
    uploadedFiles,
    (state, newFile: UploadedFileSummary) => [newFile, ...state],
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col space-y-6 px-4 py-8">
      {/* ... header ... */}
      {/* ... env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED && Buy Credits 링크 (변경 없음) ... */}

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="my-clips">My Clips</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <UploadPodcast onOptimisticAdd={addOptimisticFile} />
          <QueueStatus uploadedFiles={optimisticFiles} />
        </TabsContent>

        <TabsContent value="my-clips">
          <Card>
            <CardHeader>
              <CardTitle>My Clips</CardTitle>
              <CardDescription>
                View and manage your generated clips. Processing may take a few
                minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadedFileList files={uploadedFiles} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**변경 요약**: `"use client"` 디렉티브 유지, `useOptimistic` import 추가, `optimisticFiles` 상태 생성, `UploadPodcast`에 `onOptimisticAdd` prop 전달, `QueueStatus`에 `optimisticFiles` 전달. `UploadedFileList`는 기존 `uploadedFiles`(서버 상태)를 그대로 전달한다 — `UploadedFileCard`가 `usePlayUrl(file.id, getOriginalPlayUrl)`로 서버 호출을 하고 카드 전체가 `Link`로 감싸져 있어, 낙관적 아이템의 임시 `id`로 불필요한 서버 에러와 404 이동이 발생하기 때문이다. "My Clips" 탭은 처리 완료된 파일을 보여주는 용도이므로, 업로드 미완료 낙관적 아이템을 표시할 필요가 없다. 기존 import 및 Buy Credits 블록은 변경 없음.

### 4-2. `src/fsd/pages/dashboard/hooks/useUploadPodcast.ts`

`onOptimisticAdd` 콜백을 받아 업로드 시작 즉시 호출하고, `toast.loading()` 패턴으로 즉시 피드백을 제공한다.

**Before:**
```typescript
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { generateUploadUrl } from "~/fsd/features/upload/api";
import { processVideo } from "~/fsd/features/clip/api";

// uploadFileToS3 함수 정의 (변경 없음)

export function useUploadPodcast() {
  const [isUploading, setIsUploading] = useState(false);

  const upload = async (
    file: File,
    language: string,
    clipCount: number,
  ): Promise<boolean> => {
    setIsUploading(true);
    try {
      const uploadResult = await generateUploadUrl({
        fileName: file.name,
        contentType: file.type,
        language,
      });
      if (!uploadResult.success) {
        toast.error(uploadResult.error);
        return false;
      }

      await uploadFileToS3(file, uploadResult.data.signedUrl);

      const processResult = await processVideo(
        uploadResult.data.uploadedFileId,
        language,
        clipCount,
      );
      if (!processResult.success) {
        toast.error(processResult.error);
        return false;
      }

      toast.success("Video uploaded successfully", {
        description:
          "Your video has been scheduled for processing. Check the status below",
        duration: 5000,
      });
      return true;
    } catch (error) {
      console.error("Failed to upload video", error);
      toast.error("Failed to upload video", {
        description:
          "There was a problem uploading your video. Please try again.",
      });
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  return { upload, isUploading };
}
```

**After:**
```typescript
"use client";

import { useTransition } from "react"; // useState → useTransition 교체
import { toast } from "sonner";
import { generateUploadUrl } from "~/fsd/features/upload/api";
import { processVideo } from "~/fsd/features/clip/api";
import type { UploadedFileSummary } from "~/fsd/pages/dashboard/model/types"; // 추가

// uploadFileToS3 함수 정의 (변경 없음)

interface UseUploadPodcastOptions {
  onOptimisticAdd: (file: UploadedFileSummary) => void;
  onSuccess?: () => void;
}

export function useUploadPodcast({ onOptimisticAdd, onSuccess }: UseUploadPodcastOptions) {
  const [isUploading, startUploading] = useTransition();

  const upload = (file: File, language: string, clipCount: number) => {
    startUploading(async () => {
      const optimisticFile: UploadedFileSummary = {
        id: `optimistic-${Date.now()}`,
        fileName: file.name,
        status: "queued",
        createdAt: new Date(),
        clipsCount: 0,
      };
      onOptimisticAdd(optimisticFile);

      const toastId = toast.loading("Preparing upload...");

      try {
        const uploadResult = await generateUploadUrl({
          fileName: file.name,
          contentType: file.type,
          language,
        });
        if (!uploadResult.success) {
          toast.error(uploadResult.error, { id: toastId });
          return;
        }

        toast.loading("Uploading file to server...", { id: toastId });
        await uploadFileToS3(file, uploadResult.data.signedUrl);

        toast.loading("Scheduling processing...", { id: toastId });
        const processResult = await processVideo(
          uploadResult.data.uploadedFileId,
          language,
          clipCount,
        );
        if (!processResult.success) {
          toast.error(processResult.error, { id: toastId });
          return;
        }

        toast.success("Video uploaded successfully", {
          id: toastId,
          description:
            "Your video has been scheduled for processing. Check the status below",
          duration: 5000,
        });
        onSuccess?.();
      } catch (error) {
        console.error("Failed to upload video", error);
        toast.error("Failed to upload video", {
          id: toastId,
          description:
            "There was a problem uploading your video. Please try again.",
        });
      }
    });
  };

  return { upload, isUploading };
}
```

**변경 요약**:
- `useState(false)` + `setIsUploading(true/false)` → `useTransition()`으로 교체. `useOptimistic`의 dispatch는 React transition 내부에서 호출해야 낙관적 상태가 유지된다 (기존 `ClipActions.tsx:59-69` 패턴과 동일)
- `upload` 함수 본문을 `startUploading(async () => { ... })`로 감싸서 `onOptimisticAdd` 호출이 transition 내부에서 실행되도록 함
- `upload` 반환 타입이 `Promise<boolean>` → `void`로 변경 (transition callback은 값을 반환하지 않음). 에러 시 `return false` 대신 `return`으로 변경
- `finally { setIsUploading(false) }` 제거 — `useTransition`의 `isPending`이 transition 종료 시 자동으로 `false`가 됨
- `toast.loading()` + `id` 기반 단계별 갱신 패턴 적용
- 기존 import (`"use client"`, `toast`, `generateUploadUrl`, `processVideo`) 및 `uploadFileToS3` 함수 정의는 변경 없이 유지
- `onSuccess` 콜백 추가: 업로드 성공 시 호출. `UploadPodcast`에서 `setFiles([])` 초기화에 사용. 실패 시에는 호출되지 않아 파일 선택 상태가 유지됨

**실패 시 낙관적 상태 revert 메커니즘**:

`useOptimistic`의 낙관적 상태는 `startUploading` transition이 완료되면 `uploadedFiles` prop(서버 상태)으로 자동 교체된다. 서버 쿼리가 `uploaded: true` 필터를 유지하므로, 실패 시나리오에서 `uploaded: false` 상태의 레코드는 목록에 포함되지 않는다:

| 실패 시점 | revalidatePath 호출 여부 | 서버 DB 상태 | 낙관적 아이템 결과 |
|-----------|-------------------------|-------------|-------------------|
| `generateUploadUrl` 실패 | 호출 안 됨 | 레코드 없음 | transition 종료 시 사라짐 (서버 상태에 해당 아이템 없음) |
| `uploadFileToS3` 실패 (네트워크 에러) | 호출 안 됨 | 레코드 있음 (uploaded=false) | transition 종료 시 사라짐. 서버 쿼리가 `uploaded: true`만 반환하므로 base state에 포함되지 않음. 고아 레코드(`uploaded: false`)는 기존과 동일하게 숨겨짐 |
| `processVideo` 실패 (throw) | 호출 안 됨. `revalidatePath`는 `clip/api/index.ts:81`의 success path에만 존재하며, catch 블록(`clip/api/index.ts:83-86`)에서는 호출되지 않음 | 레코드 있음 (uploaded=false, inngest 전송 전 실패 시) 또는 (uploaded=false, inngest 전송 후 DB update 실패 시) | transition 종료 시 사라짐. error toast 표시 |
| `processVideo` 성공 | 호출됨 (`clip/api/index.ts:81`) | uploaded=true | 서버 상태의 실제 레코드로 교체됨 (transition 종료 시 base state에 `uploaded: true` 레코드 포함) |

### 4-3. `src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx`

`onOptimisticAdd` prop을 받아 `useUploadPodcast`에 전달한다.

**Before:**
```tsx
export default function UploadPodcast() {
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [clipCount, setClipCount] = useState<number>(DEFAULT_CLIP_COUNT);
  const { upload, isUploading } = useUploadPodcast();

  const handleFileDrop = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  };

  const handleUpload = async () => {
    const file = files[0];
    if (!file) return;
    const success = await upload(file, language, clipCount);
    if (success) setFiles([]);
  };

  return (
    // ... JSX
  );
}
```

**After:**
```tsx
import type { UploadedFileSummary } from "../../model/types";

interface UploadPodcastProps {
  onOptimisticAdd: (file: UploadedFileSummary) => void;
}

export default function UploadPodcast({ onOptimisticAdd }: UploadPodcastProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [clipCount, setClipCount] = useState<number>(DEFAULT_CLIP_COUNT);
  const { upload, isUploading } = useUploadPodcast({
    onOptimisticAdd,
    onSuccess: () => setFiles([]),
  });

  const handleFileDrop = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  };

  const handleUpload = () => {
    const file = files[0];
    if (!file) return;
    upload(file, language, clipCount);
  };

  return (
    // ... JSX (변경 없음)
  );
}
```

**변경 요약**:
- `UploadPodcastProps` 인터페이스 추가, `onOptimisticAdd` prop 수신
- `useUploadPodcast`에 `{ onOptimisticAdd, onSuccess }` 전달
- `handleUpload`에서 `async`/`await` 제거 — `upload`이 `useTransition` 내부에서 비동기 처리하므로 `Promise`를 반환하지 않음
- `setFiles([])`는 **성공 시에만** `onSuccess` 콜백을 통해 호출 (실패 시 파일 선택 상태를 유지하여 재시도 가능)

### 4-4. `src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx`

낙관적 아이템(`id`가 `optimistic-`으로 시작)의 "View details" 링크를 비활성화한다. S3 업로드가 대용량 파일의 경우 수십 초 걸릴 수 있어, 그 동안 사용자가 존재하지 않는 상세 페이지로 이동하는 것을 방지한다.

**변경 부분만:**
```tsx
{uploadedFiles.map((file) => {
  const isOptimistic = file.id.startsWith("optimistic-");
  return (
    <TableRow className="hover:!bg-transparent" key={file.id}>
      {/* ... 기존 셀들 (변경 없음) ... */}
      <TableCell className="max-w-xs truncate font-medium">
        {isOptimistic ? (
          <Button variant="outline" size="sm" disabled>
            View details
          </Button>
        ) : (
          <Link href={`/dashboard/uploads/${file.id}`}>
            <Button variant="outline" size="sm">
              View details
            </Button>
          </Link>
        )}
      </TableCell>
    </TableRow>
  );
})}
```

**변경 요약**: `file.id.startsWith("optimistic-")` 체크로 낙관적 아이템의 "View details" 버튼을 `disabled` 상태로 렌더링. 서버 상태로 교체되면 자동으로 활성화된다.

## 5. 실행 순서

### Phase 0: `useUploadPodcast` 훅 시그니처 변경 + `useTransition` 적용 + toast 패턴 교체

- 작업 내용: `useUploadPodcast`에 `UseUploadPodcastOptions` 인터페이스 추가, `onOptimisticAdd` 콜백 및 `onSuccess` 콜백 수신. `useState(false)` → `useTransition()` 교체. `upload` 본문을 `startUploading(async () => { ... })`으로 감싸기. `toast.loading()` + `id` 기반 단계별 갱신 패턴 적용. 낙관적 `UploadedFileSummary` 생성 및 `onOptimisticAdd` 호출 로직을 transition 내부에 배치. 업로드 성공 시 `onSuccess?.()` 호출.
- 검증: `npm run typecheck` 통과. 이 시점에서 `UploadPodcast.tsx`에서 컴파일 에러가 발생하는 것이 정상 (아직 prop을 전달하지 않았으므로).

### Phase 1: `UploadPodcast` 컴포넌트에 prop 연결

- 작업 내용: `UploadPodcastProps` 인터페이스 추가, `onOptimisticAdd` prop 수신, `useUploadPodcast`에 `{ onOptimisticAdd, onSuccess: () => setFiles([]) }` 전달. `handleUpload`에서 `async`/`await` 제거.
- 검증: `npm run typecheck` 통과. 이 시점에서 `DashboardView`에서 컴파일 에러가 발생하는 것이 정상 (아직 prop을 전달하지 않았으므로).

### Phase 2: `DashboardView`에 `useOptimistic` 적용 + `QueueStatus` 방어 코드 + 전체 연결

- 작업 내용: `useOptimistic` import 및 `optimisticFiles` 상태 생성. `UploadPodcast`에 `onOptimisticAdd` 전달, `QueueStatus`와 `UploadedFileList`에 `optimisticFiles` 전달. `QueueStatus`에서 낙관적 아이템(`id`가 `optimistic-`으로 시작)의 "View details" 버튼을 `disabled` 처리.
- 검증: `npm run typecheck` 통과. `npm run lint` 통과. 브라우저에서 업로드 버튼 클릭 시 QueueStatus 테이블에 아이템이 즉시 보이는지 확인. 낙관적 아이템의 "View details" 버튼이 비활성화 상태인지 확인. 업로드 완료 후 서버 상태로 자연스럽게 교체되고 "View details"가 활성화되는지 확인. 업로드 실패 시 낙관적 아이템이 사라지는지 확인.

## 6. 영향 범위

### 직접 수정 대상

| 파일 | 변경 유형 |
|------|----------|
| `src/fsd/pages/dashboard/ui/index.tsx` | `useOptimistic` 추가, prop 변경 |
| `src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx` | props 인터페이스 추가 |
| `src/fsd/pages/dashboard/hooks/useUploadPodcast.ts` | `useState` → `useTransition` 교체, 시그니처 변경, toast 패턴 변경 |
| `src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx` | 낙관적 아이템의 "View details" 링크 비활성화 |

### import 변경 필요

- `DashboardView`: `useOptimistic` import 추가
- `useUploadPodcast`: `useTransition` import 추가, `UploadedFileSummary` 타입 import 추가
- `UploadPodcast`: `UploadedFileSummary` 타입 import 추가

### 변경 없는 파일

| 파일 | 이유 |
|------|------|
| `src/app/dashboard/page.tsx` | `uploaded: true` 필터 유지. `useOptimistic`이 transition 중 reducer를 재적용하므로 필터 제거 불필요 (섹션 4-0 참조) |
| `src/fsd/widgets/uploaded-file-list/ui/index.tsx` | prop 타입(`UploadedFileSummary[]`)이 동일하고, 전달받는 데이터도 기존과 동일한 `uploadedFiles`(서버 상태)이므로 변경 불필요 |
| `src/fsd/features/upload/api/index.ts` | server action 변경 없음 |
| `src/fsd/features/clip/api/index.ts` | server action 변경 없음 |

## 7. 리스크 + 롤백 전략

### 리스크

| 리스크 | 가능성 | 영향도 | 대응 |
|--------|--------|--------|------|
| QueueStatus에서 낙관적 아이템의 임시 `id`로 "View details" 클릭 시 404 | 중간 | 낮음 | 섹션 4-4에서 `isOptimistic` 체크로 "View details" 버튼을 `disabled` 처리하여 해결 |
| "My Clips" 탭의 `UploadedFileCard`에서 낙관적 아이템의 임시 `id`로 `usePlayUrl` 서버 호출 실패 및 카드 클릭 시 404 | 높음 | 중간 | `UploadedFileList`에 `optimisticFiles` 대신 원본 `uploadedFiles`를 전달하여 해결 (섹션 4-1). `UploadedFileCard`는 `usePlayUrl(file.id, getOriginalPlayUrl)`로 마운트 시 서버 호출을 하고, 카드 전체가 `Link`로 감싸져 있어 두 가지 문제가 동시에 발생한다 |
| `processVideo` 실패(throw) 시 `revalidatePath` 미호출 | 낮음 | 낮음 | `revalidatePath`는 `clip/api/index.ts:81`의 success path에만 존재. catch 블록(`line 83-86`)에서는 호출되지 않는다. 서버 쿼리가 `uploaded: true` 필터를 유지하므로, 실패 시 낙관적 아이템은 transition 종료와 함께 사라지고 error toast가 표시된다. 고아 레코드(`uploaded: false`)는 기존과 동일하게 숨겨진 상태로 남는다 |
| `toast.loading()`의 `id` 재사용이 sonner 버전에 따라 동작이 다를 수 있음 | 낮음 | 낮음 | sonner 공식 문서에서 `id` 기반 toast 갱신은 안정 API로 문서화되어 있음 |
| 빠른 더블클릭으로 이중 업로드 발생 | 낮음 | 중간 | `useTransition`의 `isPending`은 `startTransition` 호출 즉시 동기적으로 `true`가 되므로, 업로드 버튼의 `disabled={isUploading}` prop이 즉시 작동한다. 기존 `ClipActions.tsx:51`과 동일한 패턴 |

### 롤백 전략

4개 파일의 변경으로 구성되어 있으며, 문제 발생 시 `git revert` 단일 커밋으로 롤백 가능하다. 서버 쿼리(`dashboard/page.tsx`)는 변경하지 않으므로 서버 측 영향이 없다.

## 8. 검증 전략

### 타입/린트 검증

```bash
npm run typecheck   # TypeScript 타입 체크
npm run lint        # ESLint
```

### 수동 확인 시나리오

| 시나리오 | 기대 결과 |
|----------|----------|
| 파일 선택 후 "Upload and Generate Clips" 클릭 | QueueStatus 테이블에 즉시 "Queued" 뱃지의 새 행 추가. loading toast "Preparing upload..." 즉시 표시 |
| 업로드 진행 중 | toast가 "Uploading file to server..." → "Scheduling processing..."으로 갱신 |
| 업로드 성공 | toast가 success로 전환. QueueStatus의 낙관적 아이템이 서버 데이터로 교체 (id가 실제 값으로 변경) |
| 업로드 실패 (S3 네트워크 에러) | toast가 error로 전환. 낙관적 아이템이 사라짐. 서버 쿼리가 `uploaded: true`만 반환하므로 고아 레코드(`uploaded: false`)는 목록에 표시되지 않음 |
| `generateUploadUrl` 실패 (인증 만료 등) | toast가 error로 전환. 낙관적 아이템이 사라짐 (DB에 레코드 없음) |
| `processVideo` 실패 (throw) | toast가 error로 전환. 낙관적 아이템이 사라짐. `revalidatePath`는 success path(`clip/api/index.ts:81`)에만 존재하므로, catch 블록 진입 시 호출되지 않음 |
| 업로드 직후 "My Clips" 탭 전환 | UploadedFileList에는 낙관적 아이템이 보이지 않음 (서버 상태만 표시). `UploadedFileCard`의 `usePlayUrl` 서버 호출 및 `Link` 클릭 404 문제를 방지하기 위해 의도된 동작 |
| 낙관적 아이템의 "View details" 클릭 | 버튼이 `disabled` 상태로 클릭 불가. 서버 상태 교체 후 활성화 |
