# AI Podcast Clipper - 리팩토링 가이드

## 목차
1. [즉시 수정 필요한 버그](#1-즉시-수정-필요한-버그)
2. [코드 중복 제거](#2-코드-중복-제거)
3. [FSD 아키텍처 개선](#3-fsd-아키텍처-개선)
4. [타입 시스템 강화](#4-타입-시스템-강화)
5. [에러 핸들링 통일](#5-에러-핸들링-통일)
6. [상수 및 설정 중앙화](#6-상수-및-설정-중앙화)
7. [커스텀 훅 추출](#7-커스텀-훅-추출)
8. [컴포넌트 추상화](#8-컴포넌트-추상화)
9. [성능 최적화](#9-성능-최적화)
10. [코드 품질 개선](#10-코드-품질-개선)

---

## 1. 즉시 수정 필요한 버그

### 1.1 디버그 코드 제거

**파일**: `src/app/dashboard/page.tsx:15`

```typescript
// ❌ 현재 코드 - 프로덕션에 5초 딜레이가 있음
await new Promise((resolve) => setTimeout(resolve, 5000));

// ✅ 수정 - 삭제
// (해당 라인 삭제)
```

### 1.2 오타 및 중복 렌더링 수정

**파일**: `src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx:77-91`

```typescript
// ❌ 현재 코드 - "Faileds" 오타 + 중복 렌더링
{file.status === "failed" && (
  <Badge variant="destructive">Faileds</Badge>
)}
{file.status === "failed" && (
  <Badge variant="destructive">Faileds</Badge>
)}

// ✅ 수정
{file.status === "failed" && (
  <Badge variant="destructive">Failed</Badge>
)}
```

### 1.3 LoginForm 버튼 텍스트 수정

**파일**: `src/fsd/widgets/loginForm/ui/index.tsx:122`

```typescript
// ❌ 현재 코드 - Login 폼인데 "Sign up" 표시
<Button type="submit" disabled={isSubmitting}>
  {isSubmitting ? "Signing up..." : "Sign up"}
</Button>

// ✅ 수정
<Button type="submit" disabled={isSubmitting}>
  {isSubmitting ? "Logging in..." : "Log in"}
</Button>
```

---

## 2. 코드 중복 제거

### 2.1 S3 클라이언트 싱글톤 패턴

현재 S3Client가 4개 파일에서 반복 생성됨:
- `src/actions/s3.ts`
- `src/actions/generation.ts`
- `src/actions/uploaded-files.ts`
- `src/inngest/functions.ts`

**새 파일 생성**: `src/lib/s3.ts`

```typescript
// src/lib/s3.ts
import { S3Client } from "@aws-sdk/client-s3";
import { env } from "~/env";

// 싱글톤 패턴으로 S3 클라이언트 재사용
let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

// 자주 사용하는 S3 작업 헬퍼 함수들
export async function generatePresignedGetUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(getS3Client(), command, { expiresIn });
}

export async function generatePresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn = 600
): Promise<string> {
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(getS3Client(), command, { expiresIn });
}

export async function deleteS3Objects(keys: string[]): Promise<void> {
  const { DeleteObjectsCommand } = await import("@aws-sdk/client-s3");

  if (keys.length === 0) return;

  await getS3Client().send(
    new DeleteObjectsCommand({
      Bucket: env.S3_BUCKET_NAME,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    })
  );
}

export async function listS3Objects(prefix: string): Promise<string[]> {
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");

  const { Contents = [] } = await getS3Client().send(
    new ListObjectsV2Command({
      Bucket: env.S3_BUCKET_NAME,
      Prefix: prefix,
    })
  );

  return Contents
    .map((obj) => obj.Key)
    .filter((key): key is string => Boolean(key));
}
```

**사용 예시** (기존 코드 리팩토링):

```typescript
// src/actions/generation.ts
import { generatePresignedGetUrl, deleteS3Objects, listS3Objects } from "~/lib/s3";

export async function getClipPlayUrl(clipId: string) {
  // ...인증 체크...

  const clip = await db.clip.findUniqueOrThrow({
    where: { id: clipId, userId: session.user.id },
  });

  const signedUrl = await generatePresignedGetUrl(clip.s3Key);
  return { success: true, url: signedUrl };
}
```

### 2.2 Play URL 가져오기 로직 훅으로 추출

3개 컴포넌트에서 거의 동일한 useEffect 로직이 반복됨:
- `UploadedFileCard.tsx`
- `UploadDetailPage.tsx`
- `ClipCard.tsx`

**새 파일 생성**: `src/fsd/shared/hooks/usePlayUrl.ts`

```typescript
// src/fsd/shared/hooks/usePlayUrl.ts
import { useState, useEffect } from "react";
import { toast } from "sonner";

type PlayUrlFetcher = (id: string) => Promise<{
  success: boolean;
  url?: string;
  error?: string;
}>;

interface UsePlayUrlOptions {
  showErrorToast?: boolean;
}

interface UsePlayUrlResult {
  playUrl: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePlayUrl(
  id: string,
  fetcher: PlayUrlFetcher,
  options: UsePlayUrlOptions = {}
): UsePlayUrlResult {
  const { showErrorToast = true } = options;

  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchPlayUrl = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetcher(id);

        if (!isMounted) return;

        if (result.success && result.url) {
          setPlayUrl(result.url);
        } else {
          const errorMessage = result.error ?? "Failed to get play URL";
          setError(errorMessage);
          if (showErrorToast) {
            toast.error(errorMessage);
          }
        }
      } catch (err) {
        if (!isMounted) return;

        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        if (showErrorToast) {
          toast.error(`Failed to get play URL: ${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchPlayUrl();

    return () => {
      isMounted = false;
    };
  }, [id, fetcher, showErrorToast, refreshKey]);

  const refetch = () => setRefreshKey((k) => k + 1);

  return { playUrl, isLoading, error, refetch };
}
```

**사용 예시**:

```typescript
// src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx
import { usePlayUrl } from "~/fsd/shared/hooks/usePlayUrl";
import { getClipPlayUrl } from "~/actions/generation";

export default function ClipCard({ clip, onDeleted }: ClipCardProps) {
  const { playUrl, isLoading: isLoadingUrl } = usePlayUrl(
    clip.id,
    getClipPlayUrl
  );

  // ... 나머지 컴포넌트 로직
}
```

---

## 3. FSD 아키텍처 개선

### 3.1 현재 구조 문제점

```
src/
├── actions/           # ❌ FSD 레이어가 아님
│   ├── auth.ts
│   ├── generation.ts
│   ├── s3.ts
│   └── uploaded-files.ts
├── fsd/
│   ├── pages/
│   │   └── dashboard/
│   │       └── ui/
│   │           └── _component/  # ❌ pages에 컴포넌트가 있으면 안됨
│   ├── widgets/
│   ├── features/
│   ├── entity/
│   └── shared/
└── server/
```

### 3.2 권장 구조

```
src/
├── fsd/
│   ├── app/              # App 레이어 (라우팅, 프로바이더)
│   │   └── providers/
│   │
│   ├── pages/            # 페이지 조합만 담당
│   │   ├── home/
│   │   ├── dashboard/
│   │   │   └── ui/
│   │   │       └── index.tsx    # 위젯 조합만
│   │   └── upload-detail/
│   │
│   ├── widgets/          # 독립적인 UI 블록
│   │   ├── queue-status/        # QueueStatus 이동
│   │   │   └── ui/
│   │   ├── upload-podcast/      # UploadPodcast 이동
│   │   │   └── ui/
│   │   ├── clip-display/
│   │   ├── uploaded-file-list/
│   │   └── ...
│   │
│   ├── features/         # 사용자 상호작용 + 비즈니스 로직
│   │   ├── auth/
│   │   │   ├── api/            # 서버 액션
│   │   │   │   ├── sign-up.ts
│   │   │   │   └── sign-in.ts
│   │   │   ├── model/
│   │   │   └── ui/
│   │   ├── upload/
│   │   │   ├── api/
│   │   │   │   ├── generate-upload-url.ts
│   │   │   │   └── process-video.ts
│   │   │   └── ui/
│   │   ├── clip/
│   │   │   ├── api/
│   │   │   │   ├── get-clip-url.ts
│   │   │   │   ├── delete-clip.ts
│   │   │   │   └── reprocess.ts
│   │   │   └── ui/
│   │   └── ...
│   │
│   ├── entities/         # 비즈니스 엔티티
│   │   ├── user/
│   │   │   ├── model/
│   │   │   │   ├── types.ts
│   │   │   │   └── schemas.ts
│   │   │   └── api/
│   │   ├── uploaded-file/
│   │   │   ├── model/
│   │   │   │   ├── types.ts
│   │   │   │   └── status.ts
│   │   │   └── api/
│   │   └── clip/
│   │       ├── model/
│   │       └── api/
│   │
│   └── shared/           # 공유 유틸리티
│       ├── api/
│       │   ├── s3.ts           # S3 클라이언트
│       │   └── result.ts       # ActionResult 타입
│       ├── config/
│       │   └── constants.ts    # 상수
│       ├── hooks/
│       │   └── use-play-url.ts
│       ├── lib/
│       │   ├── utils.ts
│       │   └── auth.ts
│       └── ui/
│           └── atoms/
│
├── server/              # 서버 전용 (auth, db)
└── inngest/             # 백그라운드 작업
```

### 3.3 마이그레이션 단계

**Phase 1**: 서버 액션 이동 (기능 유지)
```bash
# 1. features 폴더 구조 생성
mkdir -p src/fsd/features/auth/api
mkdir -p src/fsd/features/upload/api
mkdir -p src/fsd/features/clip/api

# 2. 파일 이동
mv src/actions/auth.ts src/fsd/features/auth/api/sign-up.ts
mv src/actions/s3.ts src/fsd/features/upload/api/generate-upload-url.ts
# ... 등
```

**Phase 2**: 컴포넌트 이동
```bash
# QueueStatus, UploadPodcast를 widgets로 이동
mv src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx \
   src/fsd/widgets/queue-status/ui/index.tsx
mv src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx \
   src/fsd/widgets/upload-podcast/ui/index.tsx
```

**Phase 3**: Import 경로 업데이트
```typescript
// 변경 전
import { signUp } from "~/actions/auth";

// 변경 후
import { signUp } from "~/fsd/features/auth/api/sign-up";
```

---

## 4. 타입 시스템 강화

### 4.1 공통 타입 정의

현재 동일한 타입이 여러 곳에서 인라인으로 정의됨:

```typescript
// ❌ 현재 - 여러 파일에서 반복
interface UploadedFileCardProps {
  file: {
    id: string;
    fileName: string;
    status: string;
    createdAt: Date;
    clipsCount: number;
  };
}
```

**새 파일 생성**: `src/fsd/entities/uploaded-file/model/types.ts`

```typescript
// src/fsd/entities/uploaded-file/model/types.ts
import type { Clip } from "generated/prisma";

export type UploadedFileStatus =
  | "queued"
  | "processing"
  | "processed"
  | "failed"
  | "no credits";

export interface UploadedFileSummary {
  id: string;
  s3Key: string;
  displayName: string | null;
  status: UploadedFileStatus;
  createdAt: Date;
  clipsCount: number;
}

export interface UploadedFileDetail extends UploadedFileSummary {
  updatedAt: Date;
  language: string;
  clips: Clip[];
}

// API 응답 타입 재사용
export type UploadedFileListItem = Omit<UploadedFileSummary, "s3Key"> & {
  fileName: string;  // displayName의 별칭
};
```

### 4.2 서버 액션 결과 타입 통일

**새 파일 생성**: `src/fsd/shared/api/result.ts`

```typescript
// src/fsd/shared/api/result.ts

// 기본 결과 타입
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// 데이터 없는 결과 (삭제, 업데이트 등)
export type ActionResultVoid = ActionResult<void>;

// 헬퍼 함수
export function success<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function successVoid(): ActionResultVoid {
  return { success: true, data: undefined };
}

export function failure(error: string): ActionResult<never> {
  return { success: false, error };
}

// 타입 가드
export function isSuccess<T>(result: ActionResult<T>): result is { success: true; data: T } {
  return result.success;
}

export function isFailure<T>(result: ActionResult<T>): result is { success: false; error: string } {
  return !result.success;
}
```

**적용 예시**:

```typescript
// src/fsd/features/clip/api/get-clip-url.ts
import { type ActionResult, success, failure } from "~/fsd/shared/api/result";

export async function getClipPlayUrl(
  clipId: string
): Promise<ActionResult<{ url: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return failure("Unauthorized");
  }

  try {
    const clip = await db.clip.findUniqueOrThrow({
      where: { id: clipId, userId: session.user.id },
    });

    const url = await generatePresignedGetUrl(clip.s3Key);
    return success({ url });
  } catch (error) {
    console.error("Failed to generate play URL", error);
    return failure("Failed to generate play URL");
  }
}
```

---

## 5. 에러 핸들링 통일

### 5.1 현재 문제점

```typescript
// ❌ 일관성 없는 에러 핸들링 패턴들

// 패턴 1: throw 사용 (s3.ts)
if (!session) throw new Error("Unauthorized");

// 패턴 2: 결과 객체 반환 (auth.ts)
return { success: false, error: "User already exists" };

// 패턴 3: 다른 형태의 결과 객체 (generation.ts)
return { success: false, error: "Unauthorized" };
```

### 5.2 통일된 에러 핸들링

```typescript
// src/fsd/shared/api/errors.ts

export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "ALREADY_EXISTS"
  | "INSUFFICIENT_CREDITS"
  | "PROCESSING_ERROR"
  | "EXTERNAL_SERVICE_ERROR";

export const Errors = {
  unauthorized: () => new AppError("Unauthorized", "UNAUTHORIZED", 401),
  notFound: (entity: string) => new AppError(`${entity} not found`, "NOT_FOUND", 404),
  alreadyExists: (entity: string) => new AppError(`${entity} already exists`, "ALREADY_EXISTS", 409),
  insufficientCredits: () => new AppError("Insufficient credits", "INSUFFICIENT_CREDITS", 402),
  validation: (message: string) => new AppError(message, "VALIDATION_ERROR", 400),
} as const;
```

### 5.3 서버 액션 래퍼

```typescript
// src/fsd/shared/api/action-wrapper.ts
import { type ActionResult, failure } from "./result";
import { AppError } from "./errors";

export async function withActionHandler<T>(
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    if (error instanceof AppError) {
      return failure(error.message);
    }

    console.error("Unexpected error:", error);
    return failure("An unexpected error occurred");
  }
}
```

**사용 예시**:

```typescript
// src/fsd/features/auth/api/sign-up.ts
import { withActionHandler } from "~/fsd/shared/api/action-wrapper";
import { Errors } from "~/fsd/shared/api/errors";

export async function signUp(data: SignupFormValues) {
  return withActionHandler(async () => {
    const validated = signupSchema.safeParse(data);
    if (!validated.success) {
      throw Errors.validation(validated.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await db.user.findUnique({
      where: { email: validated.data.email },
    });

    if (existing) {
      throw Errors.alreadyExists("User");
    }

    const hashedPassword = await hashPassword(validated.data.password);

    await db.user.create({
      data: {
        email: validated.data.email.toLowerCase(),
        password: hashedPassword,
      },
    });

    return undefined; // void 반환
  });
}
```

---

## 6. 상수 및 설정 중앙화

### 6.1 상수 파일 생성

**새 파일 생성**: `src/fsd/shared/config/constants.ts`

```typescript
// src/fsd/shared/config/constants.ts

// 업로드 설정
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB
  ACCEPTED_TYPES: {
    "video/mp4": [".mp4"],
  },
  MAX_FILES: 1,
  PRESIGNED_URL_EXPIRY: 600, // 10분
} as const;

// 클립 설정
export const CLIP_CONFIG = {
  PLAY_URL_EXPIRY: 3600, // 1시간
  MIN_DURATION: 40,
  MAX_DURATION: 60,
} as const;

// 지원 언어
export const SUPPORTED_LANGUAGES = [
  { value: "English", label: "English" },
  { value: "Korean", label: "한국어" },
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]["value"];

// 기본값
export const DEFAULTS = {
  LANGUAGE: "English" as SupportedLanguage,
  CREDITS: 3,
} as const;

// 파일 상태
export const FILE_STATUS = {
  QUEUED: "queued",
  PROCESSING: "processing",
  PROCESSED: "processed",
  FAILED: "failed",
  NO_CREDITS: "no credits",
} as const;

export type FileStatus = typeof FILE_STATUS[keyof typeof FILE_STATUS];

// 상태별 UI 매핑
export const STATUS_BADGE_VARIANT: Record<FileStatus, "outline" | "destructive" | "default"> = {
  [FILE_STATUS.QUEUED]: "outline",
  [FILE_STATUS.PROCESSING]: "outline",
  [FILE_STATUS.PROCESSED]: "outline",
  [FILE_STATUS.FAILED]: "destructive",
  [FILE_STATUS.NO_CREDITS]: "destructive",
} as const;
```

### 6.2 상수 사용 예시

```typescript
// UploadPodcast.tsx
import { UPLOAD_CONFIG, SUPPORTED_LANGUAGES, DEFAULTS } from "~/fsd/shared/config/constants";

export default function UploadPodcast() {
  const [language, setLanguage] = useState<string>(DEFAULTS.LANGUAGE);

  return (
    <Dropzone
      maxSize={UPLOAD_CONFIG.MAX_FILE_SIZE}
      accept={UPLOAD_CONFIG.ACCEPTED_TYPES}
      maxFiles={UPLOAD_CONFIG.MAX_FILES}
    >
      {/* ... */}
    </Dropzone>

    {/* 언어 선택 드롭다운 */}
    <DropdownMenuContent>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <DropdownMenuItem
          key={lang.value}
          onClick={() => setLanguage(lang.value)}
        >
          {lang.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}
```

---

## 7. 커스텀 훅 추출

### 7.1 useServerAction 훅

서버 액션 호출 패턴 통일:

```typescript
// src/fsd/shared/hooks/useServerAction.ts
import { useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import type { ActionResult } from "~/fsd/shared/api/result";

interface UseServerActionOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  successMessage?: string;
  errorMessage?: string;
}

export function useServerAction<TInput, TOutput>(
  action: (input: TInput) => Promise<ActionResult<TOutput>>,
  options: UseServerActionOptions<TOutput> = {}
) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    (input: TInput) => {
      startTransition(async () => {
        setError(null);

        const result = await action(input);

        if (result.success) {
          if (options.successMessage) {
            toast.success(options.successMessage);
          }
          options.onSuccess?.(result.data);
        } else {
          setError(result.error);
          toast.error(options.errorMessage ?? result.error);
          options.onError?.(result.error);
        }
      });
    },
    [action, options]
  );

  return { execute, isPending, error };
}
```

**사용 예시**:

```typescript
// ClipCard.tsx
import { useServerAction } from "~/fsd/shared/hooks/useServerAction";
import { deleteClip } from "~/fsd/features/clip/api/delete-clip";

export default function ClipCard({ clip, onDeleted }: ClipCardProps) {
  const { execute: handleDelete, isPending: isDeleting } = useServerAction(
    deleteClip,
    {
      successMessage: "Clip deleted",
      onSuccess: () => onDeleted(clip.id),
    }
  );

  return (
    <Button onClick={() => handleDelete(clip.id)} disabled={isDeleting}>
      {isDeleting ? <Loader2 className="animate-spin" /> : <Trash />}
      Delete
    </Button>
  );
}
```

### 7.2 useConfirmAction 훅

확인 다이얼로그가 필요한 액션용:

```typescript
// src/fsd/shared/hooks/useConfirmAction.ts
import { useCallback, useState } from "react";

interface UseConfirmActionOptions {
  message: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export function useConfirmAction(options: UseConfirmActionOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const trigger = useCallback(() => {
    setIsOpen(true);
  }, []);

  const confirm = useCallback(async () => {
    setIsPending(true);
    try {
      await options.onConfirm();
    } finally {
      setIsPending(false);
      setIsOpen(false);
    }
  }, [options]);

  const cancel = useCallback(() => {
    options.onCancel?.();
    setIsOpen(false);
  }, [options]);

  return { isOpen, isPending, trigger, confirm, cancel, message: options.message };
}
```

---

## 8. 컴포넌트 추상화

### 8.1 AuthForm 공통 컴포넌트

LoginForm과 SignupForm의 90% 코드가 동일함:

```typescript
// src/fsd/features/auth/ui/AuthForm.tsx
"use client";

import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/fsd/shared/ui/atoms/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "~/fsd/shared/ui/atoms/field";
import { Input } from "~/fsd/shared/ui/atoms/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import Link from "next/link";
import type { z } from "zod";

interface AuthFormProps<T extends z.ZodObject<z.ZodRawShape>> {
  mode: "login" | "signup";
  schema: T;
  onSubmit: (data: z.infer<T>) => Promise<{ success: boolean; error?: string }>;
  className?: string;
}

const CONFIG = {
  login: {
    title: "Login to your account",
    description: "Enter your email below to login to your account",
    submitText: "Log in",
    submittingText: "Logging in...",
    alternateText: "Don't have an account?",
    alternateLinkText: "Sign Up",
    alternateLinkHref: "/signup",
  },
  signup: {
    title: "Sign up for an account",
    description: "Enter your email below to create your account",
    submitText: "Sign up",
    submittingText: "Signing up...",
    alternateText: "Already have an account?",
    alternateLinkText: "Log in",
    alternateLinkHref: "/login",
  },
} as const;

export function AuthForm<T extends z.ZodObject<z.ZodRawShape>>({
  mode,
  schema,
  onSubmit,
  className,
}: AuthFormProps<T>) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const config = CONFIG[mode];

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<T>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" } as z.infer<T>,
  });

  const handleFormSubmit = async (data: z.infer<T>) => {
    try {
      setIsSubmitting(true);
      setError(null);

      const result = await onSubmit(data);
      if (!result.success) {
        setError(result.error ?? "An error occurred");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <Card>
        <CardHeader>
          <CardTitle>{config.title}</CardTitle>
          <CardDescription>{config.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(handleFormSubmit)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  {...register("email" as never)}
                />
                {errors.email && (
                  <FieldError>{String(errors.email.message)}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  {...register("password" as never)}
                />
                {errors.password && (
                  <FieldError>{String(errors.password.message)}</FieldError>
                )}
              </Field>
              {error && (
                <FieldError className="rounded-md bg-red-50 p-3 text-sm">
                  {error}
                </FieldError>
              )}
              <Field>
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting ? config.submittingText : config.submitText}
                </Button>
                <FieldDescription className="text-center">
                  {config.alternateText}{" "}
                  <Link href={config.alternateLinkHref}>
                    {config.alternateLinkText}
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 8.2 VideoPlayer 컴포넌트

```typescript
// src/fsd/shared/ui/molecules/VideoPlayer.tsx
"use client";

import { Loader2, Play } from "lucide-react";

interface VideoPlayerProps {
  src: string | null;
  isLoading: boolean;
  className?: string;
  controls?: boolean;
  preload?: "none" | "metadata" | "auto";
}

export function VideoPlayer({
  src,
  isLoading,
  className = "w-full rounded-md object-cover",
  controls = true,
  preload = "metadata",
}: VideoPlayerProps) {
  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <Play className="h-10 w-10 text-muted-foreground opacity-50" />
      </div>
    );
  }

  return (
    <video
      src={src}
      controls={controls}
      preload={preload}
      className={className}
    />
  );
}
```

### 8.3 StatusBadge 컴포넌트

```typescript
// src/fsd/entities/uploaded-file/ui/StatusBadge.tsx
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { FILE_STATUS, STATUS_BADGE_VARIANT, type FileStatus } from "~/fsd/shared/config/constants";

interface StatusBadgeProps {
  status: FileStatus;
  className?: string;
}

const STATUS_LABELS: Record<FileStatus, string> = {
  [FILE_STATUS.QUEUED]: "Queued",
  [FILE_STATUS.PROCESSING]: "Processing",
  [FILE_STATUS.PROCESSED]: "Processed",
  [FILE_STATUS.FAILED]: "Failed",
  [FILE_STATUS.NO_CREDITS]: "No Credits",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      variant={STATUS_BADGE_VARIANT[status]}
      className={className}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
```

---

## 9. 성능 최적화

### 9.1 React.memo 적용

리스트 아이템 컴포넌트에 memo 적용:

```typescript
// ClipCard.tsx
import { memo } from "react";

function ClipCardComponent({ clip, onDeleted }: ClipCardProps) {
  // ... 컴포넌트 로직
}

export default memo(ClipCardComponent);
```

### 9.2 useMemo/useCallback 활용

```typescript
// QueueStatus.tsx
import { useMemo, useCallback } from "react";

export default function QueueStatus({ uploadedFiles }: QueueStatusProps) {
  // 정렬된 파일 목록 메모이제이션
  const sortedFiles = useMemo(
    () => [...uploadedFiles].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [uploadedFiles]
  );

  // 핸들러 메모이제이션
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }, [router]);

  // ...
}
```

### 9.3 동적 임포트

무거운 컴포넌트 지연 로딩:

```typescript
// src/fsd/pages/upload-detail/ui/index.tsx
import dynamic from "next/dynamic";
import { Suspense } from "react";

const ClipDisplay = dynamic(
  () => import("~/fsd/widgets/clip-display/ui"),
  {
    loading: () => <p className="text-muted-foreground">Loading clips...</p>,
    ssr: false,
  }
);

export default function UploadDetailPage({ uploadedFileData }: Props) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ClipDisplay clips={uploadedFileData.clips} />
    </Suspense>
  );
}
```

---

## 10. 코드 품질 개선

### 10.1 ESLint 규칙 강화

```javascript
// eslint.config.js
export default [
  // 기존 설정...
  {
    rules: {
      // 일관된 임포트 순서
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling"],
            "index",
          ],
          pathGroups: [
            { pattern: "~/**", group: "internal", position: "before" },
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc" },
        },
      ],
      // 사용하지 않는 변수 경고
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      // 명시적 반환 타입
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        { allowExpressions: true },
      ],
    },
  },
];
```

### 10.2 Prettier 설정 확인

```javascript
// prettier.config.js
export default {
  plugins: ["prettier-plugin-tailwindcss"],
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "es5",
  printWidth: 80,
  bracketSameLine: false,
};
```

### 10.3 타입 체크 스크립트

```json
// package.json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "next lint",
    "lint:strict": "next lint --max-warnings 0",
    "check": "npm run typecheck && npm run lint:strict",
    "check:fix": "npm run lint -- --fix && npm run format:write"
  }
}
```

---

## 리팩토링 우선순위

| 순위 | 항목 | 영향도 | 난이도 | 예상 소요 |
|-----|------|-------|-------|----------|
| 1 | 버그 수정 (섹션 1) | 높음 | 낮음 | 10분 |
| 2 | S3 클라이언트 통합 (2.1) | 중간 | 낮음 | 30분 |
| 3 | 상수 중앙화 (섹션 6) | 중간 | 낮음 | 30분 |
| 4 | usePlayUrl 훅 추출 (2.2) | 중간 | 낮음 | 20분 |
| 5 | 타입 통일 (섹션 4) | 중간 | 중간 | 1시간 |
| 6 | 에러 핸들링 통일 (섹션 5) | 높음 | 중간 | 2시간 |
| 7 | FSD 구조 개선 (섹션 3) | 높음 | 높음 | 4시간+ |
| 8 | 컴포넌트 추상화 (섹션 8) | 중간 | 중간 | 2시간 |
| 9 | 성능 최적화 (섹션 9) | 낮음 | 낮음 | 1시간 |

---

## 체크리스트

### 즉시 실행 (P0)
- [ ] 5초 딜레이 디버그 코드 제거
- [ ] QueueStatus "Faileds" 오타 수정
- [ ] QueueStatus 중복 Badge 제거
- [ ] LoginForm 버튼 텍스트 수정

### 단기 (1-2일)
- [ ] S3 클라이언트 싱글톤 구현
- [ ] 상수 파일 생성 및 적용
- [ ] usePlayUrl 커스텀 훅 추출
- [ ] ActionResult 타입 통일

### 중기 (1주)
- [ ] 서버 액션 FSD 구조로 이동
- [ ] 에러 핸들링 시스템 구축
- [ ] AuthForm 공통 컴포넌트 생성
- [ ] VideoPlayer, StatusBadge 컴포넌트화

### 장기 (2주+)
- [ ] 전체 FSD 구조 마이그레이션
- [ ] 테스트 코드 추가
- [ ] 성능 최적화 적용
- [ ] ESLint 규칙 강화
