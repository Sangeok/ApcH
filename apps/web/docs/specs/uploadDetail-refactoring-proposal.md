# uploadDetail 페이지 리팩토링 제안서

**대상 경로**: `src/fsd/pages/uploadDetail/`  
**분석 기준**: typescript-clean-code, frontend-predictability, frontend-cohesion, naming-conventions, frontend-readability, frontend-coupling, frontend-file-naming  
**분석 파일**: `model/type.ts`, `ui/index.tsx`, `ui/_component/processing-timeline.tsx`

---

## 이슈 1. `ProcessingStatus` 타입 미활용 (typescript-clean-code)

### 현상

`model/type.ts`에 `ProcessingStatus` 타입이 정의되어 있으나, 실제 사용처에서 재사용되지 않고 있다.

**`ui/index.tsx:29`** — props에서 `status: string`으로 정의:

```typescript
interface UploadDetailPageProps {
  uploadedFileData: {
    // ...
    status: string;        // string으로 느슨하게 정의
    // ...
  };
}
```

이로 인해 `ProcessingTimeline`에 전달할 때 unsafe type assertion이 필요하다:

```typescript
// ui/index.tsx:154
<ProcessingTimeline
  status={status as ProcessingStatus}  // unsafe cast
  // ...
/>
```

**`ui/_component/processing-timeline.tsx:16,22,28`** — `ProcessingStatus`를 import하지 않고 inline union type 반복:

```typescript
interface ProcessingTimelineProps {
  status: "queued" | "processing" | "processed" | "failed";  // 반복 정의
  // ...
}

const statusOrder: ProcessingTimelineProps["status"][] = [/* ... */];
const statusLabel: Record<ProcessingTimelineProps["status"], string> = {/* ... */};
```

### 제안

**`ui/index.tsx`** — props 타입에 `ProcessingStatus` 직접 사용:

```typescript
import type { ProcessingStatus } from "../model/type";

interface UploadDetailPageProps {
  uploadedFileData: {
    // ...
    status: ProcessingStatus;  // 타입 안전
    // ...
  };
}
```

이렇게 하면 `status as ProcessingStatus` cast가 불필요해진다:

```typescript
<ProcessingTimeline
  status={status}  // cast 제거
  // ...
/>
```

**`ui/_component/processing-timeline.tsx`** — `ProcessingStatus` import하여 재사용:

```typescript
import type { ProcessingStatus } from "../../model/type";

interface ProcessingTimelineProps {
  status: ProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}

const statusOrder: ProcessingStatus[] = ["queued", "processing", "processed"];
const statusLabel: Record<ProcessingStatus, string> = {/* ... */};
```

---

## 이슈 2. Dead Code 제거 (typescript-clean-code)

### 현상

**`ui/_component/processing-timeline.tsx:7-13,19`** — `TimelineLog` 인터페이스와 `logs` prop이 정의되어 있으나 컴포넌트 내부에서 전혀 사용되지 않는다:

```typescript
interface TimelineLog {
  id: string;
  label: string;
  createdAt: Date;
  description?: string | null;
  status: "queued" | "processing" | "processed" | "failed";
}

interface ProcessingTimelineProps {
  // ...
  logs?: TimelineLog[];  // 미사용
}
```

**`ui/index.tsx:40`** — 불필요한 변수 별칭:

```typescript
const { id, displayName, createdAt, updatedAt, status, clips } =
  uploadedFileData;

const uploadedFileId = id;  // id를 그대로 쓰거나, 구조분해 시 rename 가능
```

### 제안

**`processing-timeline.tsx`** — `TimelineLog` 인터페이스와 `logs` prop 제거:

```typescript
interface ProcessingTimelineProps {
  status: ProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}
```

**`index.tsx`** — 구조분해 시 직접 rename:

```typescript
const { id: uploadedFileId, displayName, createdAt, updatedAt, status, clips } =
  uploadedFileData;
```

---

## 이슈 3. 파일 네이밍 불일치 (frontend-file-naming)

### 현상

`ui/_component/processing-timeline.tsx`는 kebab-case를 사용하고 있다.

프로젝트 내 다른 `_component/` 파일들은 모두 PascalCase를 사용한다:

| 경로 | 파일명 | 케이스 |
|------|--------|--------|
| `pages/dashboard/ui/_component/` | `QueueStatus.tsx` | PascalCase |
| `pages/dashboard/ui/_component/` | `UploadPodcast.tsx` | PascalCase |
| `widgets/clip-display/ui/_component/` | `ClipCard.tsx` | PascalCase |
| `widgets/clip-display/ui/_component/` | `ClipActions.tsx` | PascalCase |
| `widgets/clip-display/ui/_component/` | `ClipVideoPlayer.tsx` | PascalCase |
| `widgets/clip-display/ui/_component/` | `ScriptModal.tsx` | PascalCase |
| `widgets/clip-display/ui/_component/` | `YoutubeMetadataModal.tsx` | PascalCase |
| `widgets/uploaded-file-list/ui/_component/` | `UploadedFileCard.tsx` | PascalCase |
| **`pages/uploadDetail/ui/_component/`** | **`processing-timeline.tsx`** | **kebab-case** |

### 제안

파일명을 `ProcessingTimeline.tsx`로 rename하고, import 경로도 함께 변경:

```typescript
// ui/index.tsx — 변경 전
import ProcessingTimeline from "~/fsd/pages/uploadDetail/ui/_component/processing-timeline";

// ui/index.tsx — 변경 후
import ProcessingTimeline from "~/fsd/pages/uploadDetail/ui/_component/ProcessingTimeline";
```

---

## 이슈 4. 오래된 경로 주석 (frontend-readability)

### 현상

`processing-timeline.tsx:1`에 FSD 이전 전의 파일 경로가 주석으로 남아 있다:

```typescript
// src/app/dashboard/uploads/[uploadedFileId]/processing-timeline.tsx
"use client";
```

실제 경로는 `src/fsd/pages/uploadDetail/ui/_component/processing-timeline.tsx`이므로 주석이 틀리다.

### 제안

주석 제거. 파일 경로는 IDE와 git이 관리하므로 수동 경로 주석은 유지 비용 대비 가치가 없다.

```typescript
"use client";

import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
// ...
```

---

## 이슈 5. Download 버튼 예측 가능성 부족 (frontend-predictability)

### 현상

`ui/index.tsx:136-143` — Download 버튼이 `playUrl`이 null이거나 로딩 중일 때도 활성화 상태로 렌더링된다. 클릭해도 `handleDownload`가 `if (!playUrl) return;`으로 조용히 무시한다:

```typescript
const handleDownload = () => {
  if (!playUrl) return;  // 사용자에게 피드백 없이 무시
  // ...
};

// JSX
<Button variant="outline" className="w-full" onClick={handleDownload}>
  <Download className="mr-2 h-4 w-4" />
  Download
</Button>
```

사용자 관점에서 버튼이 활성화되어 있으므로 클릭 가능하다고 기대하지만, 실제로는 동작하지 않는다.

### 제안

버튼에 `disabled` 속성 추가:

```typescript
<Button
  variant="outline"
  className="w-full"
  onClick={handleDownload}
  disabled={!playUrl || isLoadingOriginalPlayUrl}
>
  <Download className="mr-2 h-4 w-4" />
  Download
</Button>
```

---

## 이슈 6. 단일 컴포넌트 응집도 (frontend-cohesion)

### 현상

`ui/index.tsx`의 `UploadDetailPage` 컴포넌트(190줄)가 다음을 모두 포함한다:

- Original video URL 페칭 로직 (`useState` + `useEffect`)
- 파일 다운로드 핸들러 (`handleDownload`)
- Header 섹션
- Summary 카드
- Original Media 카드 (비디오 플레이어 + 다운로드)
- Processing Timeline 카드
- Generated Clips 섹션

특히 Original Media 카드는 자체 상태(`playUrl`, `isLoadingOriginalPlayUrl`)와 부수효과(`useEffect`), 핸들러(`handleDownload`)를 가지고 있어 독립적인 관심사를 형성한다.

### 제안

Original Media 카드를 `_component/OriginalMediaCard.tsx`로 추출:

```typescript
// ui/_component/OriginalMediaCard.tsx
"use client";

import { useEffect, useState } from "react";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "~/fsd/shared/ui/atoms/card";

interface OriginalMediaCardProps {
  uploadedFileId: string;
  displayName: string | null;
  status: string;
}

export default function OriginalMediaCard({
  uploadedFileId,
  displayName,
  status,
}: OriginalMediaCardProps) {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUrl = async () => {
      setIsLoading(true);
      try {
        const result = await getOriginalPlayUrl(uploadedFileId);
        if (result.success) {
          setPlayUrl(result.data.url);
        } else {
          toast.error("Failed to get original play url: " + result.error);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error("Failed to get original play url: " + message);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchUrl();
  }, [uploadedFileId]);

  const handleDownload = () => {
    if (!playUrl) return;
    const link = document.createElement("a");
    link.href = playUrl;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card className="from-background/70 to-background overflow-hidden rounded-2xl border bg-gradient-to-b shadow-lg lg:col-span-1">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-sm">Original media</p>
          <h3 className="text-lg font-semibold">
            {displayName ?? "Untitled"}
          </h3>
        </div>
        <Badge variant="secondary" className="capitalize">
          {status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-xl bg-black">
          {!isLoading && playUrl && (
            <video
              src={playUrl}
              controls
              preload="metadata"
              className="w-full rounded-md object-cover"
            />
          )}
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleDownload}
          disabled={!playUrl || isLoading}
        >
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
      </CardContent>
    </Card>
  );
}
```

추출 후 `index.tsx`에서는 상태와 부수효과가 제거되어 순수한 레이아웃 조합 역할만 남는다:

```typescript
// ui/index.tsx — 변경 후 (핵심 부분)
export default function UploadDetailPage({ uploadedFileData }: UploadDetailPageProps) {
  const { id: uploadedFileId, displayName, createdAt, updatedAt, status, clips } =
    uploadedFileData;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header>...</header>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Summary card */}
        <Card>...</Card>
        {/* Original media card — 상태 로직이 캡슐화됨 */}
        <OriginalMediaCard
          uploadedFileId={uploadedFileId}
          displayName={displayName}
          status={status}
        />
        {/* Processing timeline card */}
        <Card>...</Card>
      </section>
      <section>...</section>
    </div>
  );
}
```

이 변경으로 `index.tsx`는 `"use client"` 지시어도 제거할 수 있게 되며, Server Component로 전환할 가능성이 열린다.

---

## 요약

| # | 스킬 | 이슈 | 난이도 | 영향도 |
|---|------|------|--------|--------|
| 1 | typescript-clean-code | `ProcessingStatus` 타입 활용으로 type safety 확보 | 낮음 | 높음 |
| 2 | typescript-clean-code | Dead code 제거 (`TimelineLog`, 불필요한 변수 별칭) | 낮음 | 낮음 |
| 3 | frontend-file-naming | `processing-timeline.tsx` → `ProcessingTimeline.tsx` | 낮음 | 중간 |
| 4 | frontend-readability | 오래된 경로 주석 제거 | 낮음 | 낮음 |
| 5 | frontend-predictability | Download 버튼 `disabled` 상태 처리 | 낮음 | 중간 |
| 6 | frontend-cohesion | Original Media 카드 컴포넌트 추출 | 중간 | 높음 |

### 검토 후 이슈 아닌 것으로 제외한 항목

- **`_component` 폴더명**: 프로젝트 전체에서 일관되게 사용 중이므로 문제 아님.
- **`import type { Clip } from "generated/prisma"`**: entity 레이어가 비어 있는 현 프로젝트 구조에서 re-export만을 위한 entity 레이어 생성은 YAGNI 위반.
- **FSD 레이어 import 방향**: page → widget, page → feature, page → shared 모두 정상적인 하향 의존.
- **naming-conventions (변수/함수명)**: `playUrl`, `isLoadingOriginalPlayUrl`, `handleDownload` 등 기존 네이밍은 의도가 명확하고 프로젝트 컨벤션에 부합.
- **frontend-coupling**: 현재 의존 구조는 FSD 원칙을 준수하며 불필요한 결합 없음.
