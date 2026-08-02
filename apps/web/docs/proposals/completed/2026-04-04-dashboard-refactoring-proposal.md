---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-04-04"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-04-04"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# Dashboard Page Refactoring Proposal

> **Scope**: `src/fsd/pages/dashboard/`
> **Review Skills**: typescript-clean-code, frontend-predictability, frontend-cohesion, naming-conventions, frontend-readability, frontend-coupling, frontend-file-naming
> **Date**: 2026-04-04

---

## Summary

Dashboard 페이지를 7가지 프론트엔드 품질 스킬로 분석한 결과, 3단계(HIGH/MEDIUM/LOW) 총 19개의 리팩토링 항목을 도출했다.

### File Structure Change

```
Before:                              After:
dashboard/                           dashboard/
  constants/index.ts                   constants/index.ts      (유지)
  types/index.ts          ← 삭제      model/
  utils/type-guard.ts     ← 삭제        type.ts               ← 신규
  ui/                                  ui/
    index.tsx                            index.tsx             ← rename
    _component/                          _component/
      UploadPodcast.tsx                    UploadPodcast.tsx   ← 내부 수정
      QueueStatus.tsx                      QueueStatus.tsx     ← import 변경
```

---

## PHASE 1 - HIGH PRIORITY (구조적 문제 & 버그)

### Item 1. 미사용 `clips` prop 제거

| | |
|---|---|
| **Skill** | typescript-clean-code |
| **Files** | `ui/index.tsx:3,23,32`, `src/app/dashboard/page.tsx:37-43,55` |

**현재 코드** (`ui/index.tsx`):

```tsx
import type { Clip } from "generated/prisma";  // line 3 - 이 import도 불필요해짐

interface DashboardClientProps {
  uploadedFiles: { /* ... */ }[];
  clips: Clip[];  // 선언됨
}

export default function DashboardClient({
  uploadedFiles,  // clips는 destructure도 안 됨
}: DashboardClientProps) {
```

**현재 코드** (`src/app/dashboard/page.tsx`):

```tsx
const userData = await db.user.findUniqueOrThrow({
  select: {
    uploadedFiles: { /* ... */ },
    clips: {                    // 불필요한 DB 쿼리
      orderBy: { createdAt: "desc" },
    },
  },
});

return <DashboardClient uploadedFiles={formattedFiles} clips={userData.clips} />;
```

**변경**:
1. `DashboardClientProps`에서 `clips: Clip[]` 제거
2. `import type { Clip }` 제거
3. `src/app/dashboard/page.tsx`에서 `clips` select 쿼리 및 JSX prop 제거

**근거**: 미사용 prop + 불필요한 DB 쿼리(전체 clips를 createdAt DESC로 fetch). 서버 리소스 낭비.

---

### Item 2. CardContent가 CardHeader 안에 중첩된 레이아웃 버그 수정

| | |
|---|---|
| **Skill** | frontend-predictability |
| **File** | `ui/_component/UploadPodcast.tsx:100-140` |

**현재 코드**:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Upload Podcast</CardTitle>
    <CardDescription>Upload your audio or video files...</CardDescription>
    <CardContent>          {/* CardHeader 내부에 중첩됨 */}
      <Dropzone>...</Dropzone>
    </CardContent>
  </CardHeader>            {/* CardContent가 여기서 닫힘 */}
</Card>
```

`CardHeader`는 `grid auto-rows-min grid-rows-[auto_auto]`로 title+description 2행 전용 grid. `CardContent`는 자체 `px-6` 패딩을 가지므로 grid 안에 들어가면 이중 패딩 + 레이아웃 깨짐.

**변경**:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Upload Podcast</CardTitle>
    <CardDescription>Upload your audio or video files...</CardDescription>
  </CardHeader>
  <CardContent>
    <Dropzone>...</Dropzone>
  </CardContent>
</Card>
```

**근거**: Card 컴포넌트의 설계 계약상 `CardHeader`와 `CardContent`는 `Card`의 형제 자식이어야 한다.

---

### Item 3. `types/` + `utils/` → `model/type.ts`로 통합

| | |
|---|---|
| **Skill** | frontend-cohesion, frontend-file-naming |
| **Files** | `types/index.ts` (삭제), `utils/type-guard.ts` (삭제), 신규 `model/type.ts` |

**현재 구조**:

- `types/index.ts` → `StatusKey` 타입 (STATUS_CONFIG에서 파생)
- `utils/type-guard.ts` → `hasStatusConfig` 함수 (STATUS_CONFIG + StatusKey 사용)
- 3개 디렉토리에 걸쳐 밀접하게 결합된 코드 3개

**프로젝트 컨벤션 비교**:
- `pages/home/` → `model/type.ts`
- `pages/uploadDetail/` → `model/type.ts`
- `pages/dashboard/` → `types/index.ts` (불일치)

**변경**: `model/type.ts` 생성 후 `StatusKey`와 `hasStatusConfig`를 이동, 기존 파일 삭제.

```ts
// model/type.ts
import { STATUS_CONFIG } from "../constants";

export type StatusKey = keyof typeof STATUS_CONFIG;

export const hasStatusConfig = (status: string): status is StatusKey =>
  status in STATUS_CONFIG;
```

**근거**: `StatusKey`는 `STATUS_CONFIG`의 키 타입, `hasStatusConfig`는 이 타입의 가드. 하나의 응집 단위이며 프로젝트 컨벤션(`model/type.ts`)에 맞춰야 한다.

---

### Item 4. 인라인 중복 props 타입을 `UploadedFile` 공유 타입으로 추출

| | |
|---|---|
| **Skill** | typescript-clean-code, frontend-cohesion |
| **Files** | `ui/index.tsx:24-30`, `ui/_component/QueueStatus.tsx:21-27` |

**현재 코드** - 동일한 shape가 2곳에 인라인 정의:

```tsx
// DashboardClientProps (ui/index.tsx)
uploadedFiles: {
  id: string; s3Key: string; fileName: string;
  status: string; createdAt: Date; clipsCount: number;
}[];

// QueueStatusProps (_component/QueueStatus.tsx)
uploadedFiles: {
  id: string; fileName: string;
  createdAt: Date; status: string; clipsCount: number;
}[];
```

**변경**: `model/type.ts`에 공유 타입 추가:

```ts
export interface UploadedFile {
  id: string;
  fileName: string;
  status: string;
  createdAt: Date;
  clipsCount: number;
}
```

두 Props 인터페이스에서 `UploadedFile[]`로 참조.

**근거**: 중복 인라인 타입은 한 곳을 변경할 때 다른 곳을 놓칠 위험이 있다.

---

### Item 19. 미사용 `s3Key` prop 제거

| | |
|---|---|
| **Skill** | typescript-clean-code |
| **Files** | `ui/index.tsx:25`, `src/app/dashboard/page.tsx:47` |

**현재**: `DashboardClientProps`에 `s3Key: string` 포함. 하위 소비자 확인:
- `QueueStatus` → `s3Key` 없음
- `UploadedFileList` → `s3Key` 없음
- `DashboardClient` 자체 → `s3Key` 사용 안 함

**변경**: Item 4의 `UploadedFile` 타입에서 `s3Key` 제외. `src/app/dashboard/page.tsx`의 `formattedFiles` 매핑에서도 제거.

**근거**: 미사용 데이터의 서버→클라이언트 직렬화는 payload 낭비.

---

## PHASE 2 - MEDIUM PRIORITY (코드 품질 & 네이밍)

### Item 5. `handleUpload` 단일 책임 분해

| | |
|---|---|
| **Skill** | typescript-clean-code |
| **File** | `ui/_component/UploadPodcast.tsx:41-95` |

**현재**: `handleUpload`는 ~50줄의 함수로 4가지 책임 수행:
1. 파일 검증 (`files.length === 0` 체크)
2. S3 presigned URL 생성 (`generateUploadUrl`)
3. S3 직접 업로드 (`fetch(signedUrl, { method: "PUT" })`)
4. 비디오 처리 트리거 (`processVideo`)

**변경**: S3 업로드를 별도 함수로 추출:

```tsx
async function uploadFileToS3(file: File, signedUrl: string): Promise<void> {
  const response = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!response.ok) throw new Error("Failed to upload file to S3");
}
```

`handleUpload`는 오케스트레이션만 담당:

```tsx
const handleUpload = async () => {
  const file = files[0];
  if (!file) return;

  setIsUploading(true);
  try {
    const uploadResult = await generateUploadUrl({ ... });
    if (!uploadResult.success) { toast.error(uploadResult.error); return; }

    await uploadFileToS3(file, uploadResult.data.signedUrl);

    const processResult = await processVideo(uploadResult.data.uploadedFileId, language, clipCount);
    if (!processResult.success) { toast.error(processResult.error); return; }

    setFiles([]);
    toast.success("Video uploaded successfully", { ... });
  } catch (error) { ... }
  finally { setIsUploading(false); }
};
```

**근거**: SRP. 각 함수가 하나의 일을 하면 테스트와 디버깅이 용이하다.

---

### Item 6. 불필요한 `useState` 제네릭 타입 어노테이션 제거

| | |
|---|---|
| **Skill** | typescript-clean-code |
| **File** | `ui/_component/UploadPodcast.tsx:32-35` |

**현재**:

```tsx
const [files, setFiles] = useState<File[]>([]);          // OK - 빈 배열은 명시 필요
const [uploading, setUploading] = useState<boolean>(false);  // 불필요
const [language, setLanguage] = useState<string>("English"); // 불필요
const [clipCount, setClipCount] = useState<number>(3);       // 불필요
```

**변경**:

```tsx
const [files, setFiles] = useState<File[]>([]);
const [isUploading, setIsUploading] = useState(false);
const [language, setLanguage] = useState("English");
const [clipCount, setClipCount] = useState(3);
```

**근거**: TypeScript가 초기값에서 `boolean`, `string`, `number`를 추론한다. `File[]`만 빈 배열(`never[]`)이므로 명시 필요.

---

### Item 7. `uploading` → `isUploading` 리네이밍

| | |
|---|---|
| **Skill** | naming-conventions |
| **File** | `ui/_component/UploadPodcast.tsx` (7개 참조) |

**현재**: `uploading` / `setUploading` - Boolean에 `is/has/should` 접두사 없음.

**프로젝트 컨벤션**:
- `OriginalMediaCard.tsx` → `isLoadingOriginalPlayUrl`
- `QueueStatus.tsx` → `isPending`
- `ClipCard.tsx` → `isDeleting`, `isScriptOpen`

**변경**: `isUploading` / `setIsUploading`으로 일괄 변경.

---

### Item 8. `DashboardClient` → `DashboardView` 리네이밍

| | |
|---|---|
| **Skill** | naming-conventions |
| **Files** | `ui/index.tsx:35`, `src/app/dashboard/page.tsx:4,55` |

**현재**: `DashboardClient` - "Client"는 `"use client"` 구현 상세이지 도메인 개념이 아님.

**프로젝트 컨벤션**:
- `pages/home/ui/index.tsx` → `HomePage`
- `pages/uploadDetail/ui/index.tsx` → `UploadDetailPage`

**주의**: `DashboardPage`로 rename 불가. `src/app/dashboard/page.tsx`의 서버 컴포넌트가 이미 `export default async function DashboardPage()`로 선언되어 있어, 동일 파일에서 import 시 식별자 충돌이 발생한다.

```tsx
// src/app/dashboard/page.tsx - 충돌 예시
import DashboardPage from "~/fsd/pages/dashboard/ui";  // imported
export default async function DashboardPage() { ... }   // 동일 이름 → Error
```

**변경**: `DashboardView`로 rename. `src/app/dashboard/page.tsx`의 import도 갱신.

```tsx
// src/app/dashboard/page.tsx
import DashboardView from "~/fsd/pages/dashboard/ui";

export default async function DashboardPage() {
  // ...
  return <DashboardView uploadedFiles={formattedFiles} />;
}
```

---

### Item 9. 도달 불가 `language !== ""` 조건 제거

| | |
|---|---|
| **Skill** | frontend-predictability |
| **File** | `ui/_component/UploadPodcast.tsx:163` |

**현재**:

```tsx
{language !== "" ? language : "Language"}
```

`language` state는 `"English"`로 초기화(line 34)되고, `SUPPORTED_LANGUAGES`의 값(`"English"`, `"Korean"`)으로만 설정된다. `""` 가능성 없음.

**변경**: `{language}`로 단순화.

**근거**: 도달 불가 분기는 미래 독자에게 빈 문자열 케이스가 가능하다는 잘못된 신호를 준다.

---

### Item 10. `handleRefresh`의 불필요한 `async` 제거

| | |
|---|---|
| **Skill** | frontend-predictability |
| **File** | `ui/_component/QueueStatus.tsx:34-36` |

**현재**:

```tsx
const handleRefresh = async () => {
  startTransition(async () => {
    router.refresh();
  });
};
```

외부 함수: `async`이지만 `await` 없음. `startTransition`은 `void` 반환.
내부 콜백: `async`이지만 `router.refresh()`는 `void` 반환.

**변경**:

```tsx
const handleRefresh = () => {
  startTransition(() => {
    router.refresh();
  });
};
```

**근거**: await하지 않는 async 함수는 반환값을 불필요하게 Promise로 감싸며, 비동기 작업이 있다는 오해를 유발한다.

---

### Item 11. `hover:bg-gray-200` → 테마 토큰 사용

| | |
|---|---|
| **Skill** | frontend-readability |
| **File** | `ui/_component/UploadPodcast.tsx:118` |

**현재**:

```tsx
className={cn(
  "flex flex-col items-center ... hover:bg-gray-200",
)}
```

프로젝트 전체에서 `text-muted-foreground`, `bg-card`, `border-primary` 등 테마 토큰을 사용. `hover:bg-gray-200`은 대시보드 유일한 하드코딩 컬러.

**변경**: `hover:bg-muted` 또는 `hover:bg-accent`로 교체.

**근거**: 하드코딩 컬러는 다크 모드를 깨뜨리고 디자인 시스템에서 벗어난다.

---

### Item 12. `handleDrop` → `handleFileDrop` 리네이밍

| | |
|---|---|
| **Skill** | naming-conventions |
| **File** | `ui/_component/UploadPodcast.tsx:37,108` |

**변경**: `handleDrop` → `handleFileDrop`. 참조 2개.

**근거**: 컴포넌트에 여러 인터랙티브 요소(dropzone, language dropdown, clip count dropdown, upload button)가 있으므로, 구체적 이름이 모호성을 줄인다.

---

## PHASE 3 - LOW PRIORITY (개선)

### Item 13. 매직 스트링 기본값을 named constants로 추출

| | |
|---|---|
| **Skill** | typescript-clean-code, frontend-readability |
| **Files** | `ui/_component/UploadPodcast.tsx:34-35`, `src/fsd/shared/config/constants.ts` |

**현재**: `useState("English")`와 `useState(3)` - 매직 값. `"English"`은 코드베이스 3곳(UploadPodcast, `upload/api/index.ts:46`, `reprocessUploadedFile`)에서 반복.

**변경**: `src/fsd/shared/config/constants.ts`에 추가:

```ts
export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES[0]!.value;    // "English"
export const DEFAULT_CLIP_COUNT = CLIP_COUNT_OPTIONS[2]!.value;   // 3
```

**근거**: 기본값 변경 시 단일 소스가 없으면 클라이언트/서버 코드가 불일치할 수 있다.

---

### Item 14. QueueStatus의 status badge 렌더링 로직 추출

| | |
|---|---|
| **Skill** | frontend-readability |
| **File** | `ui/_component/QueueStatus.tsx:68-106` |

**현재**: `uploadedFiles.map` 콜백 내에 status config 조회 + Badge 렌더링 + clip count 복수형 처리가 인라인으로 존재.

**변경**: `StatusBadge` 컴포넌트 추출:

```tsx
function StatusBadge({ status }: { status: string }) {
  const config = hasStatusConfig(status) ? STATUS_CONFIG[status] : undefined;
  return (
    <Badge variant={config?.variant ?? "outline"}>
      {config?.label ?? status}
    </Badge>
  );
}
```

**근거**: map 콜백을 짧게 유지하면 테이블 행 구조가 한눈에 보인다.

---

### Item 15. non-null assertion `files[0]!` → 명시적 가드로 교체

| | |
|---|---|
| **Skill** | frontend-readability |
| **File** | `ui/_component/UploadPodcast.tsx:44` |

**현재**:

```tsx
if (files.length === 0) return;
const file = files[0]!;  // non-null assertion
```

**변경**:

```tsx
const file = files[0];
if (!file) return;
```

**근거**: `!` 연산자는 TypeScript 타입 좁히기를 우회한다. 명시적 가드가 더 안전하고 가독성이 높다.

---

### Item 16. `StatusKey`와 `ProcessingStatus` 통합 검토

| | |
|---|---|
| **Skill** | frontend-cohesion |
| **Files** | `pages/dashboard/types/index.ts`, `pages/uploadDetail/model/type.ts` |

**현재**: 두 페이지가 동일한 유니온을 독립적으로 정의:
- Dashboard: `StatusKey = keyof typeof STATUS_CONFIG` → `"queued" | "processing" | "processed" | "failed" | "no credits"`
- UploadDetail: `ProcessingStatus = "queued" | "processing" | "processed" | "failed" | "no credits"`

**검토 사항**:
- **Option A** (권장): `STATUS_CONFIG`를 `shared/config/`로 이동 후 두 페이지가 공유
- **Option B**: 현행 유지하되, 두 타입이 동일 도메인 개념임을 주석으로 명시

**근거**: 동일 도메인 개념의 독립 정의는 시간이 지나면 서로 다르게 분화할 위험이 있다. 단, FSD 페이지 간 공유는 `shared` 레이어로 이동해야 하므로 아키텍처 결정이 필요하다.

> **Note**: cross-page 변경이므로 Phase 1/2를 블로킹하지 않고 별도 논의 후 결정.

---

### Item 17. UploadPodcast 크로스 피처 결합도 검토

| | |
|---|---|
| **Skill** | frontend-coupling |
| **File** | `ui/_component/UploadPodcast.tsx:22-23` |

**현재**: 2개 피처 API를 직접 import:

```tsx
import { generateUploadUrl } from "~/fsd/features/upload/api";
import { processVideo } from "~/fsd/features/clip/api";
```

FSD 계층 규칙상 pages > features이므로 기술적으로 유효하지만, upload→process 오케스트레이션이 컴포넌트에 위치.

**검토 사항**:
- **Option A**: upload feature API에 `uploadAndProcess` 통합 함수 생성
- **Option B**: 현행 유지 (FSD 허용 범위 내, 2-call 순서가 명확)

**근거**: 현재는 두 호출이지만 향후 credit 체크, validation 등이 추가되면 오케스트레이션 함수가 필요할 수 있다. 다만 시기상조 추상화의 위험도 있으므로 판단 필요.

---

### Item 18. QueueStatus import 경로 순회 개선

| | |
|---|---|
| **Skill** | frontend-coupling |
| **File** | `ui/_component/QueueStatus.tsx:17-18` |

**현재**:

```tsx
import { STATUS_CONFIG } from "../../constants";
import { hasStatusConfig } from "../../utils/type-guard";
```

`../../` 2단계 상위 순회.

**변경**: Item 3 적용 후:

```tsx
import { STATUS_CONFIG } from "../../constants";
import { hasStatusConfig } from "../../model/type";
```

파일 수는 줄지만 경로 깊이는 동일. FSD page slice 내부에서 barrel export 없이는 상대경로가 유일한 방법이므로, 이 수준의 순회는 수용 가능.

**근거**: Item 3의 자연스러운 결과. 별도 작업 불필요.

---

## Implementation Sequence

| 순서 | Items | 이유 |
|------|-------|------|
| 1 | Item 1 | 독립적. 미사용 코드 + DB 쿼리 제거 |
| 2 | Items 3 + 4 + 19 | 파일 구조 변경 + 공유 타입 추출 (함께) |
| 3 | Item 2 | CardContent/CardHeader 레이아웃 버그 수정 |
| 4 | Items 6 + 7 + 9 + 10 + 12 + 15 | 소규모 로컬 변경 배치 (네이밍, 타입, dead branch) |
| 5 | Item 8 | 컴포넌트 rename (server page import도 변경) |
| 6 | Items 5 + 11 + 13 + 14 | 코드 품질 개선 (함수 추출, 테마 토큰, 상수) |
| 7 | Items 16 + 17 + 18 | Cross-cutting (팀 논의 후 결정) |

## Verification

- `npm run check` (lint + typecheck) 통과
- 대시보드 페이지 렌더링 확인 (특히 Item 2 Card 레이아웃)
- Upload 기능 E2E 동작 확인 (Item 5 handleUpload 분해 후)
- My Clips 탭 정상 표시 확인 (Item 1 clips prop 제거 후)
