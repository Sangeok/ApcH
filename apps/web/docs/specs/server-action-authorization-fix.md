# Server Action 인가(Authorization) 누락 수정 제안서

> 최종 업데이트: 2026-03-23
> 프로젝트: AI Podcast Clipper Frontend (Next.js 15 / T3 Stack / FSD Architecture)
> 심각도: CRITICAL
> 예상 공수: 0.5 - 1일

---

## 목차

1. [개요](#1-개요)
2. [현재 상태 분석](#2-현재-상태-분석)
3. [공통 인가 헬퍼 함수 설계](#3-공통-인가-헬퍼-함수-설계)
4. [수정 방안](#4-수정-방안)
5. [추가 보안 강화](#5-추가-보안-강화)
6. [테스트 계획](#6-테스트-계획)
7. [영향도 분석](#7-영향도-분석)

---

## 1. 개요

### 1.1 문제 요약

AI Podcast Clipper 프로젝트의 Server Action 중 **7개 함수**에서 인가(Authorization) 처리가 누락되어 있다. 인증되지 않은 사용자 또는 리소스 소유자가 아닌 사용자가 파일 삭제, 영상 처리 트리거, S3 Presigned URL 생성 등 민감한 작업을 수행할 수 있는 심각한 보안 취약점이 존재한다.

### 1.2 왜 CRITICAL인가

| 위험 요소 | 설명 |
|-----------|------|
| **데이터 파괴** | 인증 없이 타인의 업로드 파일 및 클립을 DB + S3에서 영구 삭제할 수 있음 |
| **리소스 탈취** | 인증 없이 영상 처리를 트리거하여 타인의 크레딧을 소모시킬 수 있음 |
| **S3 무단 접근** | 클라이언트가 임의의 userId를 전달하여 타인의 S3 경로에 Presigned URL을 생성할 수 있음 |
| **수평적 권한 상승(IDOR)** | 인증된 사용자 A가 사용자 B의 리소스에 접근/삭제 가능 |

### 1.3 영향받는 파일

| 파일 경로 | 패턴 | 취약 함수 수 |
|-----------|------|-------------|
| `src/fsd/features/upload/api/index.ts` | NEW (FSD) | 3개 |
| `src/fsd/features/clip/api/index.ts` | NEW (FSD) | 1개 |
| `src/actions/uploaded-files.ts` | OLD (레거시) | 2개 |
| `src/actions/generation.ts` | OLD (레거시) | 1개 |

---

## 2. 현재 상태 분석

### 2.1 안전한 패턴 (참조 기준)

프로젝트 내에서 이미 올바르게 인가 처리를 수행하고 있는 함수들이 존재한다. 이것이 수정의 기준 패턴이 된다.

**NEW 패턴 (FSD) - `ActionResult<T>` 사용:**

```typescript
// src/fsd/features/upload/api/index.ts - reprocessUploadedFile (line 176)
export async function reprocessUploadedFile(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const session = await auth();
  if (!session?.user?.id) {
    return failure("Unauthorized");     // 인증 체크
  }

  const uploadedFile = await db.uploadedFile.findFirstOrThrow({
    where: { id: uploadedFileId, userId: session.user.id },  // 소유권 체크
    select: { id: true, userId: true, status: true, uploaded: true, s3Key: true, language: true },
  });
  // ...
}
```

동일 패턴을 사용하는 안전한 함수 목록:
- `generateUploadUrl` (`src/fsd/features/upload/api/index.ts:21`) - auth + userId
- `getUploadedFileDetails` (`src/fsd/features/upload/api/index.ts:69`) - auth + userId
- `getOriginalPlayUrl` (`src/fsd/features/upload/api/index.ts:97`) - auth + userId
- `getClipPlayUrl` (`src/fsd/features/clip/api/index.ts:87`) - auth + userId
- `deleteClip` (`src/fsd/features/clip/api/index.ts:119`) - auth + userId

### 2.2 취약 함수 상세 분석

---

#### 취약점 #1: `deleteUploadedFile` (NEW)

- **파일**: `src/fsd/features/upload/api/index.ts`
- **위치**: Line 126-137
- **반환 타입**: `Promise<ActionResult<void>>`

```typescript
// 현재 코드 (취약)
export async function deleteUploadedFile(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  try {
    await db.uploadedFile.delete({ where: { id: uploadedFileId } });
    // auth() 호출 없음
    // userId 소유권 검증 없음
    revalidatePath("/dashboard");
    return success(undefined);
  } catch (error) {
    console.error("Failed to delete uploaded file", error);
    return failure("Failed to delete uploaded file");
  }
}
```

**공격 벡터**: 공격자가 임의의 `uploadedFileId`를 전달하면 인증 없이 어떤 사용자의 업로드 파일이든 DB에서 삭제할 수 있다. Server Action은 HTTP POST 요청으로 직접 호출 가능하므로, UI에서만 접근을 제한하는 것은 무의미하다.

---

#### 취약점 #2: `deleteUploadedFileWithClips` (NEW)

- **파일**: `src/fsd/features/upload/api/index.ts`
- **위치**: Line 142-171
- **반환 타입**: `Promise<ActionResult<void>>`

```typescript
// 현재 코드 (취약)
export async function deleteUploadedFileWithClips(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  try {
    const uploadedFile = await db.uploadedFile.findUnique({
      where: { id: uploadedFileId },  // userId 조건 없음
      select: { s3Key: true },
    });
    // auth() 호출 없음
    if (!uploadedFile) {
      return failure("Uploaded file not found");
    }

    await removeGeneratedClipsFromS3(uploadedFile.s3Key, {
      includeOriginal: true,
    });

    await db.$transaction([
      db.clip.deleteMany({ where: { uploadedFileId } }),
      db.uploadedFile.delete({ where: { id: uploadedFileId } }),
    ]);
    // ...
  }
}
```

**공격 벡터**: 가장 심각한 취약점. 인증 없이 타인의 업로드 파일 + 모든 연관 클립을 DB와 S3에서 모두 삭제할 수 있다. **데이터 복구가 불가능**한 파괴적 작업이 무방비 상태이다.

---

#### 취약점 #3: `getPresignedUploadUrl` (NEW)

- **파일**: `src/fsd/features/upload/api/index.ts`
- **위치**: Line 236-255
- **반환 타입**: `Promise<ActionResult<{ url: string; s3Key: string }>>`

```typescript
// 현재 코드 (취약)
export async function getPresignedUploadUrl(
  fileName: string,
  contentType: string,
  userId: string,    // 클라이언트에서 전달받는 userId (신뢰 불가)
  fileId: string,
): Promise<ActionResult<{ url: string; s3Key: string }>> {
  try {
    const s3Key = `${userId}/${fileId}/original.mp4`;  // 임의 경로 생성 가능
    const url = await generatePresignedPutUrl(
      s3Key,
      contentType,
      S3_CONFIG.PRESIGNED_PUT_URL_EXPIRY,
    );
    return success({ url, s3Key });
  } catch (error) {
    // ...
  }
}
```

**공격 벡터**: `userId`를 파라미터로 받아 신뢰한다. 공격자가 임의의 `userId`를 전달하면 다른 사용자의 S3 경로에 파일을 업로드할 수 있는 Presigned URL을 획득할 수 있다 (IDOR 취약점).

**참고**: 이 함수는 현재 프로젝트 내에서 직접 호출되는 곳이 없다. `generateUploadUrl` 함수가 실제로 사용되며, 해당 함수는 `auth()`를 올바르게 호출한다. 그러나 `"use server"` 파일에 export되어 있으므로 Server Action으로 직접 호출 가능하다.

---

#### 취약점 #4: `processVideo` (NEW)

- **파일**: `src/fsd/features/clip/api/index.ts`
- **위치**: Line 19-82
- **반환 타입**: `Promise<ActionResult<void>>`

```typescript
// 현재 코드 (취약)
export async function processVideo(
  uploadedFileId: string,
  language: string,
  clipCount: number,
): Promise<ActionResult<void>> {
  const validated = processVideoSchema.safeParse({
    uploadedFileId, language, clipCount,
  });
  // Zod 입력 검증은 있으나 auth() 호출 없음

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid input");
  }

  const { uploadedFileId: fileId, language: lang, clipCount: count } = validated.data;

  try {
    await db.uploadedFile.update({
      where: { id: fileId },  // userId 조건 없음
      data: { language: lang },
    });

    const uploadedVideo = await db.uploadedFile.findUniqueOrThrow({
      where: { id: fileId },  // userId 조건 없음
      select: { uploaded: true, id: true, userId: true },
    });

    // Inngest 이벤트 발송 (영상 처리 트리거)
    await inngest.send({
      name: "process-video-events",
      data: {
        uploadedFileId: uploadedVideo.id,
        userId: uploadedVideo.userId,
        language: lang,
        clipCount: count,
      },
    });
    // ...
  }
}
```

**공격 벡터**: Zod 스키마로 입력 형식은 검증하지만 인가가 전혀 없다. 공격자가 타인의 `uploadedFileId`를 알면 해당 파일에 대해 영상 처리를 트리거하여 **크레딧을 무단 소모**시키고 Inngest 워커에 불필요한 부하를 발생시킬 수 있다.

---

#### 취약점 #5: `deleteUploadedFile` (OLD)

- **파일**: `src/actions/uploaded-files.ts`
- **위치**: Line 76-80

```typescript
// 현재 코드 (취약)
export async function deleteUploadedFile(uploadedFileId: string) {
  await db.uploadedFile.delete({ where: { id: uploadedFileId } });
  // auth() 호출 없음, userId 소유권 검증 없음
  revalidatePath("/dashboard");
  return { success: true };
}
```

**공격 벡터**: 취약점 #1과 동일. OLD 패턴으로 `{ success: boolean }` 객체를 반환한다.

---

#### 취약점 #6: `deleteUploadedFileWithClips` (OLD)

- **파일**: `src/actions/uploaded-files.ts`
- **위치**: Line 82-111

```typescript
// 현재 코드 (취약)
export async function deleteUploadedFileWithClips(uploadedFileId: string) {
  try {
    const uploadedFile = await db.uploadedFile.findUnique({
      where: { id: uploadedFileId },  // userId 조건 없음
      select: { s3Key: true },
    });
    // auth() 호출 없음
    // ...DB + S3 삭제 로직
  }
}
```

**공격 벡터**: 취약점 #2와 동일한 OLD 버전.

---

#### 취약점 #7: `processVideo` (OLD)

- **파일**: `src/actions/generation.ts`
- **위치**: Line 16-60

```typescript
// 현재 코드 (취약)
export async function processVideo(
  uploadedFileId: string,
  language: string,
  clipCount: number,
) {
  // auth() 호출 없음, Zod 입력 검증도 없음, userId 소유권 검증 없음
  await db.uploadedFile.update({
    where: { id: uploadedFileId },
    data: { language },
  });
  // ...
}
```

**공격 벡터**: 취약점 #4의 OLD 버전. Zod 검증도 없어 더욱 위험하다.

---

### 2.3 취약점 요약 매트릭스

| # | 함수명 | 파일 패턴 | auth() | 소유권 | Zod 검증 | 위험 수준 | 공격 결과 |
|---|--------|-----------|--------|--------|----------|-----------|-----------|
| 1 | `deleteUploadedFile` | NEW | X | X | 불필요 | CRITICAL | DB 레코드 무단 삭제 |
| 2 | `deleteUploadedFileWithClips` | NEW | X | X | 불필요 | CRITICAL | DB + S3 완전 삭제 |
| 3 | `getPresignedUploadUrl` | NEW | X | X | X | HIGH | 임의 S3 경로 업로드 |
| 4 | `processVideo` | NEW | X | X | O | HIGH | 크레딧 탈취, 무단 처리 |
| 5 | `deleteUploadedFile` | OLD | X | X | 불필요 | CRITICAL | DB 레코드 무단 삭제 |
| 6 | `deleteUploadedFileWithClips` | OLD | X | X | 불필요 | CRITICAL | DB + S3 완전 삭제 |
| 7 | `processVideo` | OLD | X | X | X | HIGH | 크레딧 탈취, 무단 처리 |

---

## 3. 공통 인가 헬퍼 함수 설계

### 3.1 설계 결정

**선택지 A**: 각 함수에 인라인으로 `auth()` + 체크 패턴 반복 (현재 안전한 함수들의 패턴)
**선택지 B**: 재사용 가능한 `requireAuth()` 헬퍼 함수 생성

**결론: 선택지 B 채택**

이유:
- 7개 함수에 동일한 3줄 패턴을 반복하면 DRY 위반
- 향후 인가 로직 변경 시(예: 역할 기반 접근 제어) 한 곳만 수정하면 됨
- 타입 안전성을 `ActionResult` 패턴과 통합 가능

### 3.2 헬퍼 함수 구현

**신규 파일**: `src/fsd/shared/api/auth-guard.ts`

```typescript
import { auth } from "~/server/auth";
import { failure } from "~/fsd/shared/api/result";
import type { ActionResult } from "~/fsd/shared/api/result";
import type { Session } from "next-auth";

/**
 * 인증된 세션의 userId를 포함하는 타입
 */
export type AuthenticatedUser = {
  userId: string;
  session: Session;
};

/**
 * Server Action에서 인증을 요구하는 헬퍼 함수.
 * 인증 실패 시 ActionResult failure를 반환하고,
 * 성공 시 userId와 세션 정보를 반환한다.
 */
export async function requireAuth(): Promise<ActionResult<AuthenticatedUser>> {
  const session = await auth();

  if (!session?.user?.id) {
    return failure("Unauthorized");
  }

  return {
    success: true,
    data: {
      userId: session.user.id,
      session,
    },
  };
}
```

### 3.3 사용 패턴

```typescript
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { type ActionResult, success, failure } from "~/fsd/shared/api/result";

export async function someAction(resourceId: string): Promise<ActionResult<void>> {
  // Step 1: 인증 체크
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  // Step 2: 소유권 체크 (DB WHERE 절에 userId 포함)
  const resource = await db.uploadedFile.findUniqueOrThrow({
    where: { id: resourceId, userId },
  });

  // Step 3: 비즈니스 로직
  return success(undefined);
}
```

### 3.4 기존 안전한 함수와의 호환성

`requireAuth()`는 새로 작성하는 수정 코드에만 적용한다. 이미 인라인으로 안전하게 동작하는 기존 함수들은 현재 상태를 유지한다. 향후 리팩토링 시 일괄 전환을 고려할 수 있다.

---

## 4. 수정 방안

### 4.0 OLD 파일 처리 전략

**결정**: OLD 파일(`src/actions/*`)은 **인가 수정 + `@deprecated` 주석 추가**를 동시에 진행한다.

이유:
- OLD 파일은 `"use server"` 지시문이 있으므로 export된 함수가 Server Action으로 여전히 호출 가능
- 마이그레이션이 진행 중이므로 OLD 파일의 보안 구멍도 반드시 패치해야 함
- OLD 파일에는 `requireAuth()` 대신 기존 인라인 패턴을 사용하여 새 의존성을 추가하지 않음

---

### 4.1 수정 #1: `deleteUploadedFile` (NEW)

**파일**: `src/fsd/features/upload/api/index.ts` (Line 126-137)

**Before:**
```typescript
export async function deleteUploadedFile(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  try {
    await db.uploadedFile.delete({ where: { id: uploadedFileId } });
    revalidatePath("/dashboard");
    return success(undefined);
  } catch (error) {
    console.error("Failed to delete uploaded file", error);
    return failure("Failed to delete uploaded file");
  }
}
```

**After:**
```typescript
export async function deleteUploadedFile(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  try {
    await db.uploadedFile.delete({
      where: { id: uploadedFileId, userId },
    });
    revalidatePath("/dashboard");
    return success(undefined);
  } catch (error) {
    console.error("Failed to delete uploaded file", error);
    return failure("Failed to delete uploaded file");
  }
}
```

**변경 요약**: `requireAuth()` 호출 추가 + WHERE 절에 `userId` 추가

---

### 4.2 수정 #2: `deleteUploadedFileWithClips` (NEW)

**파일**: `src/fsd/features/upload/api/index.ts` (Line 142-171)

**Before:**
```typescript
export async function deleteUploadedFileWithClips(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  try {
    const uploadedFile = await db.uploadedFile.findUnique({
      where: { id: uploadedFileId },
      select: { s3Key: true },
    });

    if (!uploadedFile) {
      return failure("Uploaded file not found");
    }

    await removeGeneratedClipsFromS3(uploadedFile.s3Key, {
      includeOriginal: true,
    });

    await db.$transaction([
      db.clip.deleteMany({ where: { uploadedFileId } }),
      db.uploadedFile.delete({ where: { id: uploadedFileId } }),
    ]);

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/uploads/${uploadedFileId}`);
    return success(undefined);
  } catch (error) {
    console.error("Failed to delete uploaded file with clips", error);
    return failure("Failed to delete uploaded file with clips");
  }
}
```

**After:**
```typescript
export async function deleteUploadedFileWithClips(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  try {
    const uploadedFile = await db.uploadedFile.findUnique({
      where: { id: uploadedFileId, userId },
      select: { s3Key: true },
    });

    if (!uploadedFile) {
      return failure("Uploaded file not found");
    }

    await removeGeneratedClipsFromS3(uploadedFile.s3Key, {
      includeOriginal: true,
    });

    await db.$transaction([
      db.clip.deleteMany({ where: { uploadedFileId } }),
      db.uploadedFile.delete({ where: { id: uploadedFileId, userId } }),
    ]);

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/uploads/${uploadedFileId}`);
    return success(undefined);
  } catch (error) {
    console.error("Failed to delete uploaded file with clips", error);
    return failure("Failed to delete uploaded file with clips");
  }
}
```

**변경 요약**: `requireAuth()` 호출 추가 + `findUnique`와 `delete` WHERE 절에 `userId` 추가

---

### 4.3 수정 #3: `getPresignedUploadUrl` (NEW)

**파일**: `src/fsd/features/upload/api/index.ts` (Line 236-255)

**판단**: 이 함수는 현재 프로젝트 내 어디서도 호출되지 않는다. `generateUploadUrl` 함수가 이미 `auth()`를 호출하며 동일한 역할을 수행한다.

**권장: 삭제** - 공격 표면을 줄이기 위해 사용하지 않는 Server Action export를 제거하는 것이 가장 안전하다.

**삭제가 부담스러운 경우의 대안 (deprecated + 인가 추가):**
```typescript
/**
 * @deprecated generateUploadUrl 함수를 사용하세요. 이 함수는 다음 버전에서 제거됩니다.
 */
export async function getPresignedUploadUrl(
  fileName: string,
  contentType: string,
  _userId: string,  // 무시됨 - 세션에서 추출
  fileId: string,
): Promise<ActionResult<{ url: string; s3Key: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;  // 세션에서 안전하게 추출

  try {
    const s3Key = `${userId}/${fileId}/original.mp4`;
    const url = await generatePresignedPutUrl(
      s3Key,
      contentType,
      S3_CONFIG.PRESIGNED_PUT_URL_EXPIRY,
    );

    return success({ url, s3Key });
  } catch (error) {
    console.error("Failed to generate presigned upload URL", error);
    return failure("Failed to generate presigned upload URL");
  }
}
```

**핵심 변경**: 클라이언트에서 전달받은 `userId` 파라미터를 무시하고, `requireAuth()`로 세션에서 추출한 `userId`를 사용한다.

---

### 4.4 수정 #4: `processVideo` (NEW)

**파일**: `src/fsd/features/clip/api/index.ts` (Line 19-82)

**Before:**
```typescript
export async function processVideo(
  uploadedFileId: string,
  language: string,
  clipCount: number,
): Promise<ActionResult<void>> {
  const validated = processVideoSchema.safeParse({
    uploadedFileId, language, clipCount,
  });

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid input");
  }

  const { uploadedFileId: fileId, language: lang, clipCount: count } = validated.data;

  try {
    await db.uploadedFile.update({
      where: { id: fileId },
      data: { language: lang },
    });

    const uploadedVideo = await db.uploadedFile.findUniqueOrThrow({
      where: { id: fileId },
      select: { uploaded: true, id: true, userId: true },
    });
    // ... inngest.send + update
  }
}
```

**After:**
```typescript
export async function processVideo(
  uploadedFileId: string,
  language: string,
  clipCount: number,
): Promise<ActionResult<void>> {
  // Step 1: 인증 체크
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  // Step 2: 입력 검증
  const validated = processVideoSchema.safeParse({
    uploadedFileId, language, clipCount,
  });

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid input");
  }

  const { uploadedFileId: fileId, language: lang, clipCount: count } = validated.data;

  try {
    await db.uploadedFile.update({
      where: { id: fileId, userId },
      data: { language: lang },
    });

    const uploadedVideo = await db.uploadedFile.findUniqueOrThrow({
      where: { id: fileId, userId },
      select: { uploaded: true, id: true, userId: true },
    });

    if (uploadedVideo.uploaded) {
      return failure("Video already uploaded");
    }

    await inngest.send({
      name: "process-video-events",
      data: {
        uploadedFileId: uploadedVideo.id,
        userId: uploadedVideo.userId,
        language: lang,
        clipCount: count,
      },
    });

    await db.uploadedFile.update({
      where: { id: uploadedVideo.id, userId },
      data: { uploaded: true },
    });

    revalidatePath("/dashboard");
    return success(undefined);
  } catch (error) {
    console.error("Failed to process video", error);
    return failure("Failed to process video");
  }
}
```

**변경 요약**: `requireAuth()` 호출 추가 (Zod 검증 이전에 배치 - 인증이 먼저) + 모든 DB 쿼리 WHERE 절에 `userId` 추가

---

### 4.5 수정 #5: `deleteUploadedFile` (OLD)

**파일**: `src/actions/uploaded-files.ts` (Line 76-80)

**After:**
```typescript
/**
 * @deprecated src/fsd/features/upload/api/index.ts의 동일 함수를 사용하세요.
 */
export async function deleteUploadedFile(uploadedFileId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  await db.uploadedFile.delete({
    where: { id: uploadedFileId, userId: session.user.id },
  });
  revalidatePath("/dashboard");
  return { success: true };
}
```

**참고**: OLD 패턴은 `{ success: boolean; error?: string }` 반환 형식을 유지한다. `requireAuth()` 대신 인라인 패턴을 사용하여 OLD 파일에 새로운 의존성을 추가하지 않는다.

---

### 4.6 수정 #6: `deleteUploadedFileWithClips` (OLD)

**파일**: `src/actions/uploaded-files.ts` (Line 82-111)

**After:**
```typescript
/**
 * @deprecated src/fsd/features/upload/api/index.ts의 동일 함수를 사용하세요.
 */
export async function deleteUploadedFileWithClips(uploadedFileId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const uploadedFile = await db.uploadedFile.findUnique({
      where: { id: uploadedFileId, userId: session.user.id },
      select: { s3Key: true },
    });

    if (!uploadedFile) {
      return { success: false, error: "Uploaded file not found" };
    }

    await removeGeneratedClipsFromS3(uploadedFile.s3Key, {
      includeOriginal: true,
    });

    await db.$transaction([
      db.clip.deleteMany({ where: { uploadedFileId } }),
      db.uploadedFile.delete({
        where: { id: uploadedFileId, userId: session.user.id },
      }),
    ]);
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/uploads/${uploadedFileId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete uploaded file with clips", error);
    return {
      success: false,
      error: "Failed to delete uploaded file with clips",
    };
  }
}
```

---

### 4.7 수정 #7: `processVideo` (OLD)

**파일**: `src/actions/generation.ts` (Line 16-60)

**After:**
```typescript
/**
 * @deprecated src/fsd/features/clip/api/index.ts의 동일 함수를 사용하세요.
 */
export async function processVideo(
  uploadedFileId: string,
  language: string,
  clipCount: number,
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await db.uploadedFile.update({
    where: { id: uploadedFileId, userId: session.user.id },
    data: { language },
  });

  const uploadedVideo = await db.uploadedFile.findUniqueOrThrow({
    where: {
      id: uploadedFileId,
      userId: session.user.id,
    },
    select: {
      uploaded: true,
      id: true,
      userId: true,
    },
  });

  if (uploadedVideo.uploaded) return;

  await inngest.send({
    name: "process-video-events",
    data: {
      uploadedFileId: uploadedVideo.id,
      userId: uploadedVideo.userId,
      language,
      clipCount,
    },
  });

  await db.uploadedFile.update({
    where: {
      id: uploadedVideo.id,
      userId: session.user.id,
    },
    data: {
      uploaded: true,
    },
  });

  revalidatePath("/dashboard");
}
```

---

### 4.8 파일별 import 변경 요약

#### `src/fsd/features/upload/api/index.ts`

기존 import에 추가:
```typescript
import { requireAuth } from "~/fsd/shared/api/auth-guard";
```

#### `src/fsd/features/clip/api/index.ts`

기존 import에 추가:
```typescript
import { requireAuth } from "~/fsd/shared/api/auth-guard";
```

#### OLD 파일 (`src/actions/uploaded-files.ts`, `src/actions/generation.ts`)

이미 `import { auth } from "~/server/auth"`가 존재하므로 추가 import 불필요.

---

### 4.9 새로 생성할 파일

| 파일 경로 | 목적 |
|-----------|------|
| `src/fsd/shared/api/auth-guard.ts` | `requireAuth()` 헬퍼 함수 |

---

## 5. 추가 보안 강화

### 5.1 입력 검증 (Zod)

현재 Zod 스키마 적용 현황:

| 함수 | Zod 검증 | 상태 |
|------|----------|------|
| `processVideo` (NEW) | `processVideoSchema` | 이미 적용 |
| `signUp` (NEW) | `signupSchema` | 이미 적용 |
| `deleteUploadedFile` | 없음 | 권장: `uploadedFileId`에 `.cuid()` 검증 |
| `deleteUploadedFileWithClips` | 없음 | 권장: `uploadedFileId`에 `.cuid()` 검증 |

**권장 스키마** (`src/fsd/features/upload/model/schemas.ts` 신규 생성):

```typescript
import { z } from "zod";

export const uploadedFileIdSchema = z.string().cuid();
```

**적용 예시**:
```typescript
export async function deleteUploadedFile(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  const parsed = uploadedFileIdSchema.safeParse(uploadedFileId);
  if (!parsed.success) {
    return failure("Invalid file ID");
  }

  try {
    await db.uploadedFile.delete({
      where: { id: parsed.data, userId },
    });
    // ...
  }
}
```

### 5.2 Rate Limiting

현재 Server Action에 Rate Limiting이 없다. 프로덕션 배포 전에 다음을 고려:

- **Upstash Ratelimit** 라이브러리를 사용한 Server Action 레벨 Rate Limiting
- 특히 `processVideo` (크레딧 소모), `generateUploadUrl` (S3 URL 생성)에 우선 적용
- `@upstash/ratelimit` + `@upstash/redis` 조합 권장

이 항목은 현재 제안서 범위 밖이며, 별도 제안서로 다루는 것을 권장한다.

### 5.3 CSRF 보호

Next.js 15의 Server Actions는 기본적으로 CSRF 보호를 제공한다:
- `Origin` 헤더 자동 검증
- 동일 출처 정책(Same-Origin Policy) 적용

**현재 상태**: 별도 조치 불필요.

### 5.4 사용하지 않는 Server Action export 제거

`"use server"` 파일에서 export된 모든 async 함수는 클라이언트에서 호출 가능한 Server Action이 된다. 사용하지 않는 함수도 여전히 공격 표면이 된다.

**권장 사항**:
- `getPresignedUploadUrl`이 미사용 확인 후 삭제
- OLD 파일(`src/actions/*`)의 모든 함수가 NEW 파일로 마이그레이션 완료된 후 OLD 파일 자체를 삭제

---

## 6. 테스트 계획

### 6.1 수동 테스트 시나리오

#### 시나리오 1: 미인증 사용자 접근 차단

| # | 테스트 | 기대 결과 |
|---|--------|-----------|
| 1-1 | 로그아웃 상태에서 `deleteUploadedFile` 호출 | `{ success: false, error: "Unauthorized" }` |
| 1-2 | 로그아웃 상태에서 `deleteUploadedFileWithClips` 호출 | `{ success: false, error: "Unauthorized" }` |
| 1-3 | 로그아웃 상태에서 `processVideo` 호출 | `{ success: false, error: "Unauthorized" }` |

#### 시나리오 2: 타 사용자 리소스 접근 차단 (IDOR 테스트)

| # | 테스트 | 기대 결과 |
|---|--------|-----------|
| 2-1 | 사용자 A 로그인 후 사용자 B의 파일 ID로 `deleteUploadedFile` 호출 | Prisma 에러 (WHERE 불일치로 삭제 안됨) |
| 2-2 | 사용자 A 로그인 후 사용자 B의 파일 ID로 `deleteUploadedFileWithClips` 호출 | `"Uploaded file not found"` 반환 |
| 2-3 | 사용자 A 로그인 후 사용자 B의 파일 ID로 `processVideo` 호출 | Prisma 에러 (update WHERE 불일치) |

#### 시나리오 3: 정상 동작 확인 (회귀 테스트)

| # | 테스트 | 기대 결과 |
|---|--------|-----------|
| 3-1 | 로그인 상태에서 자신의 파일 삭제 | 정상 삭제, `{ success: true }` |
| 3-2 | 로그인 상태에서 자신의 파일 + 클립 삭제 | 정상 삭제, S3 + DB 모두 정리 |
| 3-3 | 로그인 상태에서 자신의 파일로 영상 처리 트리거 | 정상 처리, Inngest 이벤트 발송 |
| 3-4 | 업로드 -> 처리 -> 클립 재생 -> 삭제 전체 플로우 | 모든 단계 정상 동작 |

### 6.2 자동화 테스트 (향후)

프로젝트에 테스트 프레임워크가 아직 도입되지 않았으므로, 도입 시 다음 테스트를 우선 작성:

```typescript
// 예시: vitest + prisma mock 활용
describe("deleteUploadedFile", () => {
  it("미인증 시 Unauthorized 반환", async () => {
    // auth() -> null 모킹
    const result = await deleteUploadedFile("some-id");
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("타 사용자의 파일 삭제 불가", async () => {
    // auth() -> { user: { id: "user-a" } } 모킹
    // DB에 userId: "user-b"인 파일 존재
    const result = await deleteUploadedFile("other-user-file-id");
    expect(result.success).toBe(false);
  });

  it("자신의 파일 정상 삭제", async () => {
    // auth() -> { user: { id: "user-a" } } 모킹
    // DB에 userId: "user-a"인 파일 존재
    const result = await deleteUploadedFile("own-file-id");
    expect(result).toEqual({ success: true, data: undefined });
  });
});
```

---

## 7. 영향도 분석

### 7.1 UI 컴포넌트 영향

| UI 컴포넌트 | 호출하는 취약 함수 | 예상 영향 |
|------------|-------------------|-----------|
| `UploadedFileActions` | `deleteUploadedFileWithClips` (NEW) | 없음. 인증된 사용자가 자신의 파일을 삭제하는 정상 플로우이므로 동작 변경 없음. |
| `UploadPodcast` | `processVideo` (NEW) | 없음. `generateUploadUrl`에서 이미 인증 후 파일을 생성하므로, 직후 호출되는 `processVideo`도 같은 세션으로 통과. |

### 7.2 Breaking Changes

**결론: Breaking Change 없음**

- 인증된 사용자가 자신의 리소스에 대해 작업하는 경우, 기존과 동일하게 동작
- `ActionResult<T>` 반환 타입 변경 없음
- 함수 시그니처 변경 없음 (단, `getPresignedUploadUrl`은 삭제 권장)

### 7.3 Prisma WHERE 절 호환성

Prisma의 `delete`, `update`, `findUnique` 등에 복합 WHERE 조건(`{ id, userId }`)을 사용할 때:
- `UploadedFile` 모델에 `userId` 필드가 존재하므로 WHERE 절에 직접 사용 가능
- `id` (PK)로 검색 후 `userId` 필터링이 적용되므로 성능 저하 없음

### 7.4 구현 순서

| 순서 | 작업 | 예상 시간 |
|------|------|-----------|
| 1 | `src/fsd/shared/api/auth-guard.ts` 생성 | 10분 |
| 2 | `src/fsd/features/upload/api/index.ts` 수정 (#1, #2, #3) | 20분 |
| 3 | `src/fsd/features/clip/api/index.ts` 수정 (#4) | 15분 |
| 4 | `src/actions/uploaded-files.ts` 수정 (#5, #6) | 15분 |
| 5 | `src/actions/generation.ts` 수정 (#7) | 15분 |
| 6 | (선택) Zod 검증 스키마 추가 | 15분 |
| 7 | 수동 회귀 테스트 | 30분 |
| 8 | `npm run check` (lint + typecheck) 통과 확인 | 10분 |
| **합계** | | **약 2-2.5시간** |

### 7.5 롤백 계획

모든 변경은 기존 동작의 **전방에** 인가 가드를 추가하는 형태이므로:
- 문제 발생 시 `requireAuth()` 호출 부분만 제거하면 원복 가능
- Git으로 단일 커밋으로 관리하여 `git revert`로 즉시 롤백 가능

### 7.6 커밋 전략

```
fix(security): add authorization checks to vulnerable Server Actions

- Add requireAuth() helper in shared/api/auth-guard.ts
- Fix deleteUploadedFile: add auth + ownership check
- Fix deleteUploadedFileWithClips: add auth + ownership check
- Fix getPresignedUploadUrl: replace untrusted userId param with session
- Fix processVideo: add auth + ownership check to all DB queries
- Patch legacy actions (src/actions/*) with inline auth checks
- Mark legacy actions as @deprecated

Resolves: Server Action authorization gaps (CRITICAL)
```
