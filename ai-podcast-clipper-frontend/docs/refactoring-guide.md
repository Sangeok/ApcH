# AI Podcast Clipper - 리팩토링 가이드

> 최종 업데이트: 2026-01-08
>
> 이 문서는 프로젝트의 FSD 아키텍처 준수, 코드 품질, 컨벤션 일관성을 분석하여 리팩토링이 필요한 사항을 **심각도별**로 정리합니다.

## 목차

1. [Critical - 즉시 수정 필요](#1-critical---즉시-수정-필요)
2. [High - 빠른 시일 내 수정](#2-high---빠른-시일-내-수정)
3. [Medium - 개선 권장](#3-medium---개선-권장)
4. [Low - 개선 고려](#4-low---개선-고려)
5. [실행 계획](#5-실행-계획)

---

## 1. Critical - 즉시 수정 필요

### 1.1 ClipCard.tsx 과도한 복잡성 (676줄) (해결)

**파일**: `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx`

**문제점**:

- 단일 컴포넌트가 **676줄**로 단일 책임 원칙(SRP) 심각하게 위반
- 7개의 useState 훅이 상호의존적 로직으로 구성
- 2개의 모달(Script, Metadata)이 동일 컴포넌트에서 관리
- Title/Description/Hashtags 탭 섹션의 JSX 코드 중복 (약 90줄+ 유사 패턴)
- 복잡한 키보드 핸들링과 document.body 조작

**Before** (현재 구조):

```typescript
// ClipCard.tsx - 676줄의 단일 컴포넌트
export default function ClipCard({ clip, onDeleted }: ClipCardProps) {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState<boolean>(true);
  const [isDeleting, startDeleting] = useTransition();
  const [isScriptOpen, setIsScriptOpen] = useState<boolean>(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // ... 모든 로직이 한 컴포넌트에 집중
  // ... Script Modal JSX (70줄)
  // ... Metadata Modal JSX (300줄+)
  // ... Video Player JSX
  // ... Action Buttons JSX
}
```

**After** (권장 구조):

```typescript
// ClipCard/index.tsx - 메인 컨테이너
import { ClipVideoPlayer } from "./ClipVideoPlayer";
import { ClipActions } from "./ClipActions";
import { ScriptModal } from "./ScriptModal";
import { YoutubeMetadataModal } from "./YoutubeMetadataModal";
import { useClipPlayUrl } from "~/fsd/shared/hooks/usePlayUrl";

export default function ClipCard({ clip, onDeleted }: ClipCardProps) {
  const { playUrl, isLoading } = useClipPlayUrl(clip.id);
  const [isScriptOpen, setIsScriptOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);

  return (
    <div className="flex max-w-52 flex-col gap-2">
      <ClipVideoPlayer src={playUrl} isLoading={isLoading} />
      <ClipActions
        clip={clip}
        playUrl={playUrl}
        isLoading={isLoading}
        onOpenScript={() => setIsScriptOpen(true)}
        onOpenMetadata={() => setIsMetadataOpen(true)}
        onDeleted={onDeleted}
      />
      <ScriptModal
        clip={clip}
        isOpen={isScriptOpen}
        onClose={() => setIsScriptOpen(false)}
      />
      <YoutubeMetadataModal
        clip={clip}
        isOpen={isMetadataOpen}
        onClose={() => setIsMetadataOpen(false)}
      />
    </div>
  );
}
```

```typescript
// ClipCard/YoutubeMetadataModal.tsx - 메타데이터 모달 분리
interface YoutubeMetadataModalProps {
  clip: Clip;
  isOpen: boolean;
  onClose: () => void;
}

export function YoutubeMetadataModal({ clip, isOpen, onClose }: YoutubeMetadataModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopyMetadata = async (field: string, value: string) => {
    // 복사 로직
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Modal content */}
    </div>
  );
}
```

**예상 효과**:

- 각 컴포넌트 100-150줄 이하로 분리
- 테스트 용이성 향상
- 재사용성 증가

---

### 1.2 QueueStatus.tsx 중복 렌더링 및 오타 (해결)

**파일**: `src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx:86-91`

**문제점**:

- "failed" 상태 Badge가 **두 번** 렌더링됨 (동일 조건문 중복)
- "Failed"가 "Faileds"로 오타

**Before**:

```typescript
// 86-91줄 - 중복 + 오타
{file.status === "failed" && (
  <Badge variant="destructive">Faileds</Badge>
)}
{file.status === "failed" && (
  <Badge variant="destructive">Faileds</Badge>
)}
```

**After**:

```typescript
// 상태-Badge 매핑으로 개선
const STATUS_CONFIG = {
  queued: { label: "Queued", variant: "outline" },
  processing: { label: "Processing", variant: "outline" },
  processed: { label: "Processed", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
  "no credits": { label: "No Credits", variant: "destructive" },
} as const;

// 사용
<Badge variant={STATUS_CONFIG[file.status]?.variant ?? "outline"}>
  {STATUS_CONFIG[file.status]?.label ?? file.status}
</Badge>
```

---

## 2. High - 빠른 시일 내 수정

### 2.1 FSD 아키텍처 위반 - Server Actions 직접 Import

**영향 파일**:
| 파일 | 위반 Import | 심각도 |
|------|-------------|--------|
| `pages/dashboard/ui/_component/UploadPodcast.tsx` | `~/actions/s3`, `~/actions/generation` | High |
| `widgets/clip-display/ui/_component/ClipCard.tsx` | `~/actions/generation` | High |
| `widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx` | `~/actions/uploaded-files` | High |
| `widgets/signupForm/ui/index.tsx` | `~/actions/auth` | High |
| `features/upload/ui/index.tsx` | `~/actions/uploaded-files` | Medium |
| `pages/uploadDetail/ui/index.tsx` | `~/actions/uploaded-files` | Medium |

**문제점**:

- FSD 원칙: 상위 레이어 → 하위 레이어만 import 가능
- `src/actions/`는 FSD 레이어 외부에 위치
- Widgets에서 Server Actions 직접 호출 시 테스트 어려움 및 결합도 증가

**Before**:

```typescript
// widgets/clip-display/ui/_component/ClipCard.tsx
import { deleteClip, getClipPlayUrl } from "~/actions/generation";

export default function ClipCard({ clip, onDeleted }: ClipCardProps) {
  useEffect(() => {
    const result = await getClipPlayUrl(clip.id); // 직접 호출
    // ...
  }, []);

  const handleDelete = () => {
    const result = await deleteClip(clip.id); // 직접 호출
    // ...
  };
}
```

**After** (옵션 A - Feature API 레이어 생성):

```typescript
// src/fsd/features/clip/api/index.ts
"use server";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { generatePresignedGetUrl, deleteS3Object } from "~/fsd/shared/api/s3";
import { type ActionResult, success, failure } from "~/fsd/shared/api/result";

export async function getClipPlayUrl(
  clipId: string,
): Promise<ActionResult<{ url: string }>> {
  const session = await auth();
  if (!session?.user?.id) return failure("Unauthorized");

  try {
    const clip = await db.clip.findUniqueOrThrow({
      where: { id: clipId, userId: session.user.id },
    });
    const url = await generatePresignedGetUrl(clip.s3Key);
    return success({ url });
  } catch {
    return failure("Failed to generate play URL");
  }
}

export async function deleteClip(clipId: string): Promise<ActionResult<void>> {
  // ... 구현
}
```

```typescript
// widgets/clip-display/ui/_component/ClipCard.tsx
import { deleteClip, getClipPlayUrl } from "~/fsd/features/clip/api";
// 이제 FSD 원칙 준수: widgets → features
```

**After** (옵션 B - Props로 콜백 전달):

```typescript
// pages/dashboard/ui/index.tsx
import { deleteClip, getClipPlayUrl } from "~/fsd/features/clip/api";

export default function DashboardPage() {
  return (
    <ClipCard
      clip={clip}
      onGetPlayUrl={getClipPlayUrl}
      onDelete={deleteClip}
    />
  );
}

// widgets/clip-display/ui/_component/ClipCard.tsx
interface ClipCardProps {
  clip: Clip;
  onGetPlayUrl: (id: string) => Promise<ActionResult<{ url: string }>>;
  onDelete: (id: string) => Promise<ActionResult<void>>;
}
// Widgets는 서버 액션을 직접 알지 못함 - 순수 UI 컴포넌트
```

---

### 2.2 S3Client 중복 인스턴스화 (5회)

**영향 파일**:

- `src/actions/generation.ts` (2회: getClipPlayUrl, deleteClip)
- `src/actions/uploaded-files.ts` (2회: getOriginalPlayUrl, removeGeneratedClipsFromS3)
- `src/inngest/functions.ts` (1회: listS3ObjectsByPrefix)

**Before**:

```typescript
// generation.ts:79-85
const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

// uploaded-files.ts:51-57 - 동일 코드 반복
const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

// inngest/functions.ts:239-245 - 또 반복
const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});
```

**After**:

```typescript
// src/fsd/shared/api/s3.ts (또는 src/lib/s3.ts)
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";

// 싱글톤 패턴
let s3ClientInstance: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3ClientInstance;
}

// 헬퍼 함수들
export const S3_CONFIG = {
  PRESIGNED_URL_EXPIRY: 3600, // 1시간
  UPLOAD_URL_EXPIRY: 600, // 10분
} as const;

export async function generatePresignedGetUrl(
  key: string,
  expiresIn = S3_CONFIG.PRESIGNED_URL_EXPIRY,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn });
}

export async function deleteS3Object(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    }),
  );
}

export async function listS3Objects(prefix: string): Promise<string[]> {
  const { Contents = [] } = await getS3Client().send(
    new ListObjectsV2Command({
      Bucket: env.S3_BUCKET_NAME,
      Prefix: prefix,
    }),
  );
  return Contents.map((obj) => obj.Key).filter((key): key is string =>
    Boolean(key),
  );
}

export async function deleteS3Objects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await getS3Client().send(
    new DeleteObjectsCommand({
      Bucket: env.S3_BUCKET_NAME,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }),
  );
}
```

```typescript
// 사용 예시 - generation.ts 리팩토링
import {
  generatePresignedGetUrl,
  deleteS3Object,
  listS3Objects,
} from "~/fsd/shared/api/s3";

export async function getClipPlayUrl(clipId: string) {
  // ...
  const signedUrl = await generatePresignedGetUrl(clip.s3Key);
  return { success: true, url: signedUrl };
}
```

---

### 2.3 일관성 없는 에러 핸들링 패턴

**현재 상태**:
| 파일 | 패턴 | 예시 |
|------|------|------|
| `uploaded-files.ts:20` | throw Error | `throw new Error("Unauthorized")` |
| `uploaded-files.ts:43` | 결과 객체 | `return { success: false, error: "..." }` |
| `generation.ts:68` | 결과 객체 | `return { success: false, error: "..." }` |

**Before**:

```typescript
// uploaded-files.ts - 혼합 패턴
export async function getUploadedFileDetails(uploadedFileId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized"); // throw 패턴
  }
  // ...
}

export async function getOriginalPlayUrl(uploadedFileId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }; // 결과 객체 패턴
  }
  // ...
}
```

**After**:

```typescript
// src/fsd/shared/api/result.ts - 통일된 결과 타입
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export function success<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function failure(error: string): ActionResult<never> {
  return { success: false, error };
}

// 타입 가드
export function isSuccess<T>(
  result: ActionResult<T>,
): result is { success: true; data: T } {
  return result.success;
}
```

```typescript
// src/fsd/shared/api/action-wrapper.ts - 에러 핸들링 래퍼
import { type ActionResult, failure } from "./result";

export async function withActionHandler<T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    if (error instanceof Error) {
      console.error("Action error:", error.message);
      return failure(error.message);
    }
    return failure("An unexpected error occurred");
  }
}
```

```typescript
// 사용 예시 - 모든 서버 액션에 적용
import { withActionHandler } from "~/fsd/shared/api/action-wrapper";

export async function getUploadedFileDetails(uploadedFileId: string) {
  return withActionHandler(async () => {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Unauthorized"); // 내부에서는 throw 사용
    }
    return await db.uploadedFile.findUniqueOrThrow({
      where: { id: uploadedFileId, userId: session.user.id },
    });
  });
  // 결과는 항상 ActionResult<T> 형태로 반환
}
```

---

## 3. Medium - 개선 권장

### 3.1 매직 넘버/상수 하드코딩

**현재 상태**:

```typescript
// generation.ts:93 - 매직 넘버
const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

// s3.ts:44 - 매직 넘버
const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });

// UploadPodcast.tsx:95 - 매직 넘버
maxSize={500 * 1024 * 1024}  // 500MB
```

**After**:

```typescript
// src/fsd/shared/config/constants.ts
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB
  ACCEPTED_TYPES: { "video/mp4": [".mp4"] },
  PRESIGNED_URL_EXPIRY: 600, // 10분
} as const;

export const CLIP_CONFIG = {
  PLAY_URL_EXPIRY: 3600, // 1시간
  MIN_DURATION: 40, // 초
  MAX_DURATION: 60, // 초
} as const;

export const SUPPORTED_LANGUAGES = [
  { value: "English", label: "English" },
  { value: "Korean", label: "한국어" },
] as const;

export const CLIP_COUNT_OPTIONS = [
  { value: 1, label: "1 clip" },
  { value: 3, label: "3 clips" },
  { value: 5, label: "5 clips" },
] as const;

export const FILE_STATUS = {
  QUEUED: "queued",
  PROCESSING: "processing",
  PROCESSED: "processed",
  FAILED: "failed",
  NO_CREDITS: "no credits",
} as const;

export type FileStatus = (typeof FILE_STATUS)[keyof typeof FILE_STATUS];
```

```typescript
// 사용 예시
import { UPLOAD_CONFIG, CLIP_CONFIG, SUPPORTED_LANGUAGES } from "~/fsd/shared/config/constants";

// UploadPodcast.tsx
<Dropzone maxSize={UPLOAD_CONFIG.MAX_FILE_SIZE} accept={UPLOAD_CONFIG.ACCEPTED_TYPES}>

// generation.ts
const signedUrl = await getSignedUrl(s3Client, command, {
  expiresIn: CLIP_CONFIG.PLAY_URL_EXPIRY
});
```

---

### 3.2 입력 값 검증 누락

**현재 상태**:

```typescript
// generation.ts - 검증 없이 파라미터 사용
export async function processVideo(
  uploadedFileId: string, // 검증 없음
  language: string, // 검증 없음
  clipCount: number, // 검증 없음
) {
  await db.uploadedFile.update({
    where: { id: uploadedFileId }, // 잘못된 ID면 런타임 에러
    // ...
  });
}
```

**After**:

```typescript
// src/fsd/features/upload/model/schemas.ts
import { z } from "zod";
import {
  SUPPORTED_LANGUAGES,
  CLIP_COUNT_OPTIONS,
} from "~/fsd/shared/config/constants";

export const processVideoSchema = z.object({
  uploadedFileId: z.string().cuid(),
  language: z.enum(
    SUPPORTED_LANGUAGES.map((l) => l.value) as [string, ...string[]],
  ),
  clipCount: z.number().int().min(1).max(10),
});

export type ProcessVideoInput = z.infer<typeof processVideoSchema>;
```

```typescript
// generation.ts - 검증 적용
import { processVideoSchema } from "~/fsd/features/upload/model/schemas";

export async function processVideo(
  uploadedFileId: string,
  language: string,
  clipCount: number,
) {
  // 입력 검증
  const validated = processVideoSchema.safeParse({
    uploadedFileId,
    language,
    clipCount,
  });
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const {
    uploadedFileId: fileId,
    language: lang,
    clipCount: count,
  } = validated.data;
  // ... 검증된 값 사용
}
```

---

### 3.3 LoginForm 버튼 텍스트 오류

**파일**: `src/fsd/widgets/loginForm/ui/index.tsx:122`

**Before**:

```typescript
// 로그인 폼인데 "Sign up" 표시
<Button type="submit" disabled={isSubmitting}>
  {isSubmitting ? "Signing up..." : "Sign up"}
</Button>
```

**After**:

```typescript
<Button type="submit" disabled={isSubmitting}>
  {isSubmitting ? "Logging in..." : "Log in"}
</Button>
```

---

## 4. Low - 개선 고려

### 4.1 Export 패턴 불일치

**현재 상태**:
| 파일 | Export 방식 | FSD 권장 |
|------|-------------|----------|
| `loginForm/ui/index.tsx` | `export function LoginForm` | default export |
| `signupForm/ui/index.tsx` | `export function SignupForm` | default export |
| `features/upload/ui/index.tsx` | `export function UploadedFileActions` | default export |
| `pages/dashboard/ui/index.tsx` | `export default function DashboardPage` | default export |

**권장사항**:

- FSD UI 컴포넌트는 일관되게 `export default` 사용
- 타입/유틸리티만 named export 사용

**After**:

```typescript
// loginForm/ui/index.tsx
export default function LoginForm({ className }: LoginFormProps) {
  // ...
}

// signupForm/ui/index.tsx
export default function SignupForm({ className }: SignupFormProps) {
  // ...
}
```

---

### 4.2 빈 디렉토리 정리

**발견된 빈 디렉토리**:

- `src/fsd/widgets/loginForm/model/`
- `src/fsd/widgets/dashboard-header/model/`
- `src/fsd/entity/other/`

**권장사항**:

- 사용하지 않는 빈 디렉토리 제거
- 또는 실제 모델 로직 추가 (타입, 스키마, 상태 등)

```bash
# 삭제 명령어
rm -rf src/fsd/widgets/loginForm/model
rm -rf src/fsd/widgets/dashboard-header/model
rm -rf src/fsd/entity/other
```

---

### 4.3 한국어 주석 통일

**파일**: `src/inngest/functions.ts`

**Before**:

```typescript
// 업로드된 파일의 사용자 ID·크레딧 및 S3 키를 조회해 처리 가능한 상태인지 확인한다.
const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
  // ...
});

// CHANGED: clips[]가 있으면 그걸로 DB 저장, 없으면 S3 listing fallback
const { clipsFound } = await step.run("create-clips-in-db", async () => {
  // 아래 3개 필드는 Prisma에 컬럼이 있어야 합니다.
});
```

**After** (영어로 통일 권장):

```typescript
// Check if the uploaded file is ready for processing by fetching user ID, credits, and S3 key
const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
  // ...
});

// Use clips[] from backend response if available, otherwise fallback to S3 listing
const { clipsFound } = await step.run("create-clips-in-db", async () => {
  // These 3 fields require corresponding columns in Prisma schema
});
```

---

## 5. 실행 계획

### 5.1 우선순위별 로드맵

| 단계        | 작업                       | 예상 소요  | 영향도 |
| ----------- | -------------------------- | ---------- | ------ |
| **Phase 1** | Critical 이슈 수정         | 2-3시간    | 높음   |
| ├ 1.1       | QueueStatus 오타/중복 수정 | 10분       | 낮음   |
| └ 1.2       | ClipCard 컴포넌트 분리     | 2시간      | 높음   |
| **Phase 2** | High 이슈 수정             | 4-6시간    | 높음   |
| ├ 2.1       | S3 유틸리티 모듈 생성      | 30분       | 중간   |
| ├ 2.2       | ActionResult 타입 통일     | 1시간      | 중간   |
| ├ 2.3       | 에러 핸들링 표준화         | 1시간      | 중간   |
| └ 2.4       | FSD 아키텍처 위반 수정     | 2시간      | 높음   |
| **Phase 3** | Medium 이슈 수정           | 2-3시간    | 중간   |
| ├ 3.1       | 상수 파일 생성             | 30분       | 낮음   |
| ├ 3.2       | 입력 검증 추가             | 1시간      | 중간   |
| └ 3.3       | LoginForm 버튼 텍스트 수정 | 5분        | 낮음   |
| **Phase 4** | Low 이슈 수정              | 30분-1시간 | 낮음   |
| ├ 4.1       | Export 패턴 통일           | 15분       | 낮음   |
| ├ 4.2       | 빈 디렉토리 정리           | 5분        | 낮음   |
| └ 4.3       | 주석 언어 통일             | 15분       | 낮음   |

---

### 5.2 체크리스트

#### Critical (즉시)

- [ ] QueueStatus "Faileds" → "Failed" 오타 수정
- [ ] QueueStatus 중복 Badge 렌더링 제거
- [ ] ClipCard 컴포넌트 분리 계획 수립
  - [ ] ScriptModal 분리
  - [ ] YoutubeMetadataModal 분리
  - [ ] ClipVideoPlayer 분리
  - [ ] ClipActions 분리

#### High (1-2일)

- [ ] `src/fsd/shared/api/s3.ts` S3 유틸리티 모듈 생성
- [ ] `src/fsd/shared/api/result.ts` ActionResult 타입 생성
- [ ] `src/fsd/shared/api/action-wrapper.ts` 에러 핸들링 래퍼 생성
- [ ] `src/fsd/features/clip/api/` 클립 관련 API 생성
- [ ] `src/fsd/features/upload/api/` 업로드 관련 API 생성
- [ ] Widget 컴포넌트들의 직접 import 제거

#### Medium (3-5일)

- [ ] `src/fsd/shared/config/constants.ts` 상수 파일 생성
- [ ] 매직 넘버 상수로 교체
- [ ] Zod 스키마로 입력 검증 추가
- [ ] LoginForm 버튼 텍스트 수정

#### Low (선택)

- [ ] export default로 통일
- [ ] 빈 디렉토리 제거
- [ ] 한국어 주석 영어로 변환

---

### 5.3 영향 받는 파일 목록

```
Critical:
├── src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx
└── src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx

High:
├── src/actions/generation.ts
├── src/actions/uploaded-files.ts
├── src/actions/s3.ts
├── src/inngest/functions.ts
├── src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx
├── src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx
├── src/fsd/widgets/signupForm/ui/index.tsx
├── src/fsd/features/upload/ui/index.tsx
└── src/fsd/pages/uploadDetail/ui/index.tsx

Medium:
├── src/actions/* (상수 적용)
├── src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx (상수 적용)
└── src/fsd/widgets/loginForm/ui/index.tsx

Low:
├── src/fsd/widgets/loginForm/ui/index.tsx
├── src/fsd/widgets/signupForm/ui/index.tsx
├── src/fsd/features/upload/ui/index.tsx
└── src/inngest/functions.ts
```

---

## 부록: 신규 파일 생성 목록

```
src/
├── fsd/
│   ├── shared/
│   │   ├── api/
│   │   │   ├── s3.ts              # S3 유틸리티 (NEW)
│   │   │   ├── result.ts          # ActionResult 타입 (NEW)
│   │   │   └── action-wrapper.ts  # 에러 핸들링 래퍼 (NEW)
│   │   ├── config/
│   │   │   └── constants.ts       # 상수 중앙화 (NEW)
│   │   └── hooks/
│   │       └── usePlayUrl.ts      # Play URL 훅 (NEW)
│   │
│   ├── features/
│   │   ├── clip/
│   │   │   └── api/
│   │   │       └── index.ts       # 클립 API (NEW)
│   │   └── upload/
│   │       ├── api/
│   │       │   └── index.ts       # 업로드 API (NEW)
│   │       └── model/
│   │           └── schemas.ts     # 입력 검증 스키마 (NEW)
│   │
│   └── widgets/
│       └── clip-display/
│           └── ui/
│               └── _component/
│                   ├── ClipCard.tsx           # 리팩토링
│                   ├── ScriptModal.tsx        # 분리 (NEW)
│                   ├── YoutubeMetadataModal.tsx  # 분리 (NEW)
│                   ├── ClipVideoPlayer.tsx    # 분리 (NEW)
│                   └── ClipActions.tsx        # 분리 (NEW)
```
