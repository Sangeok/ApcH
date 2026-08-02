# ProcessingTimeline 타임스탬프 중복 문제 분석 및 개선 제안

## 1. 문제 요약

업로드 상세 페이지(`/dashboard/uploads/[uploadedFileId]`)의 **Processing Timeline** 카드에서 "Processing" 단계와 "Processed" 단계가 **항상 동일한 시각**을 표시한다.

---

## 2. 증상

| 단계 | 표시 예시 |
|------|----------|
| Queued | 2026. 4. 19. 오전 10:00:00 ✅ |
| Processing | 2026. 4. 19. 오전 10:05:30 |
| Processed | 2026. 4. 19. 오전 10:05:30 ← Processing과 동일 |

처리 시작 시각과 완료 시각이 구분되지 않아 사용자가 실제 소요 시간을 파악할 수 없다.

---

## 3. 근본 원인 분석

### 3-1. 버그 발생 지점

**`src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx` line 45**

```typescript
const timestamp = key === "queued" ? createdAt : updatedAt;
```

"processing"과 "processed" 두 단계 모두 `updatedAt` 하나를 공유한다.

### 3-2. 타임스탬프 생애주기

Prisma `@updatedAt`은 레코드가 수정될 때마다 자동으로 `now()`로 덮어쓰이는 단일 값이다.

```
T0    파일 생성   createdAt = T0   updatedAt = T0    status = "queued"
T1    처리 시작   createdAt = T0   updatedAt = T1    status = "processing"
               (inngest/functions.ts line 54)
T_end 처리 완료  createdAt = T0   updatedAt = T_end status = "processed"
               (inngest/functions.ts line 174)
```

status가 `"processed"`가 되는 순간 `updatedAt`이 `T_end`로 갱신되면서 **T1(처리 시작 시각)이 영구 소실**된다.

### 3-3. 페이지 로드 시점의 데이터 상태

`getUploadedFileDetailsById`가 반환하는 값:
- `createdAt` = T0 (파일 큐 등록 시각)
- `updatedAt` = T_end (마지막 status 변경 시각 = 처리 완료 시각)

`ProcessingTimeline`이 받는 값:

| 단계 | 사용 필드 | 실제 값 | 기대 값 |
|------|----------|--------|--------|
| Queued | `createdAt` | T0 ✅ | T0 |
| Processing | `updatedAt` | T_end ❌ | T1 |
| Processed | `updatedAt` | T_end ✅ | T_end |

### 3-4. 구조적 결함

**2개 타임스탬프 필드로 3개 이벤트를 표현하려는 데이터 모델의 불충분.**

`@updatedAt`은 단조 증가(monotonically advancing) 값이라 중간 이력을 보존하지 못한다.

---

## 4. 개선 방안

### 핵심 변경: `processingStartedAt DateTime?` 필드 추가

`UploadedFile` 모델에 nullable 타임스탬프 필드를 추가하여 T1을 명시적으로 기록한다.

```
Queued     → createdAt            (T0)
Processing → processingStartedAt  (T1)  ← 신규
Processed  → updatedAt            (T_end)
```

기존 레코드는 `processingStartedAt = null` → 컴포넌트에서 `updatedAt` 폴백으로 하위 호환성 유지.

---

## 5. 변경 파일 및 구체적 수정 내용

### 5-1. `prisma/schema.prisma`

`UploadedFile` 모델 `updatedAt` 다음 줄에 필드 추가 및 status 주석 정정:

```diff
-    status String @default("queued") // processing, processed, no credits
+    status String @default("queued") // queued, processing, processed, failed, no credits
     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt 
+    processingStartedAt DateTime?
     language String @default("English")
```

> status 필드 주석이 일부 값(`"queued"`, `"failed"`)을 누락하고 있어 함께 수정한다. `updatedAt` 줄 끝에 실제 파일의 trailing space가 있으므로 diff 맥락 상 포함했다.

### 5-2. `src/fsd/entities/uploaded-file/api/index.ts`

**변경 A — `updateUploadedFileStatus` 시그니처 확장**

```diff
 export async function updateUploadedFileStatus(
   uploadedFileId: string,
   status: ProcessingStatus,
-  options?: { tx?: Prisma.TransactionClient },
+  options?: { tx?: Prisma.TransactionClient; processingStartedAt?: Date | null },
 ) {
   return getClient(options?.tx).uploadedFile.update({
     where: { id: uploadedFileId },
-    data: { status },
+    data: {
+      status,
+      ...(options?.processingStartedAt !== undefined
+        ? { processingStartedAt: options.processingStartedAt }
+        : {}),
+    },
   });
 }
```

> `processingStartedAt` 타입을 `Date | null`로 선언해야 한다. `Date`만 허용하면 `null`을 전달해 필드를 명시적으로 초기화할 수 없다. 스프레드 조건(`!== undefined`)은 `null`과 `Date` 모두 전달 가능하게 하여, reprocess 시 `processingStartedAt: null`을 넘겨 이전 값을 DB에서 명시적으로 지울 수 있다.

> **TypeScript 오류 타이밍**: 이 변경을 작성한 직후에는 `processingStartedAt`이 Prisma 생성 클라이언트(`generated/prisma/`)에 아직 없으므로 TypeScript 오류가 발생한다. `npm run db:generate`(섹션 6)를 실행해 Prisma Client가 재생성되면 오류가 해소된다. 섹션 9의 `typecheck`(step 3)는 반드시 `db:generate`(step 2) 이후에 실행해야 한다.

**변경 B — `getUploadedFileDetailsById` select에 필드 추가**

```diff
     select: {
       id: true,
       displayName: true,
       createdAt: true,
       updatedAt: true,
+      processingStartedAt: true,
       status: true,
       language: true,
       clips: {
         orderBy: { createdAt: "desc" },
       },
     },
```

### 5-3. `src/inngest/functions.ts`

`set-status-processing` step (line 53–55):

```diff
         await step.run("set-status-processing", async () => {
-          await updateUploadedFileStatus(uploadedFileId, "processing");
+          await updateUploadedFileStatus(uploadedFileId, "processing", {
+            processingStartedAt: new Date(),
+          });
         });
```

> **Inngest step 재실행 안전성**: Inngest는 `step.run()` 결과를 memoize한다. 이후 step이 실패하여 함수가 replay될 때, `set-status-processing` step은 재실행되지 않고 캐시된 결과가 사용된다. 따라서 `new Date()`는 최초 실행 시 단 한 번만 평가되며, replay로 인해 `processingStartedAt`이 변경되지 않는다. 단, `set-status-processing` step 자체(DB 장애 등)가 실패하여 재시도될 경우 `new Date()`는 재평가되어 약간 다른 타임스탬프가 기록된다. 이는 Prisma `@updatedAt`의 기존 재시도 동작과 동일하므로 허용 가능하다.

### 5-4. `src/fsd/pages/upload-detail/ui/index.tsx`

Props 인터페이스 및 컴포넌트 전달:

```diff
 interface UploadDetailPageProps {
   uploadedFileData: {
     id: string;
     displayName: string | null;
     createdAt: Date;
     updatedAt: Date;
+    processingStartedAt: Date | null;
     status: ProcessingStatus;
     language: string;
     clips: Clip[];
   };
 }
```

```diff
-  const { id: uploadedFileId, displayName, createdAt, updatedAt, status, clips } =
+  const { id: uploadedFileId, displayName, createdAt, updatedAt, processingStartedAt, status, clips } =
     uploadedFileData;

             <ProcessingTimeline
               status={status}
               createdAt={new Date(createdAt)}
+              processingStartedAt={processingStartedAt ? new Date(processingStartedAt) : null}
               updatedAt={new Date(updatedAt)}
             />
```

> **`page.tsx` 수정 불필요**: `page.tsx`는 Server Component로 `getUploadedFileDetails()`의 반환값을 `{ ...uploadedFileData, status: ... }` 스프레드로 전달한다. `getUploadedFileDetailsById` select에 `processingStartedAt: true`가 추가되면 Prisma 반환 타입에 자동 포함되고, 스프레드를 통해 `UploadDetailPage`로 그대로 전파된다. `page.tsx` 자체는 변경이 필요 없다.

> **서버→클라이언트 직렬화 주의**: `page.tsx`는 Server Component이고 `UploadDetailPage`는 Client Component(`"use client"`)다. Next.js는 이 경계를 넘을 때 `Date` 객체를 ISO 문자열(`string`)로 직렬화한다. 따라서 props 인터페이스의 `processingStartedAt: Date | null` 타입은 런타임 실제값(`string | null`)과 다르다. 이는 `createdAt: Date`, `updatedAt: Date`가 이미 동일하게 선언된 기존 패턴을 그대로 따른 것이며, JSX 호출부의 `new Date(processingStartedAt)` 래핑이 런타임에서 올바르게 변환해 준다. 추후 타입을 엄밀하게 하려면 세 필드 모두 `string | null` 또는 `Date | string` 유니온으로 통일하는 별도 리팩토링이 필요하다.

### 5-5. `src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx`

Props 타입 및 타임스탬프 선택 로직:

```diff
 interface ProcessingTimelineProps {
   status: ProcessingStatus;
   createdAt: Date;
+  processingStartedAt: Date | null;
   updatedAt: Date;
 }

 export default function ProcessingTimeline({
   status,
   createdAt,
+  processingStartedAt,
   updatedAt,
 }: ProcessingTimelineProps) {
```

```diff
-        const timestamp = key === "queued" ? createdAt : updatedAt;
+        const timestamp =
+          key === "queued"
+            ? createdAt
+            : key === "processing"
+              ? (processingStartedAt ?? updatedAt)
+              : updatedAt;
```

### 5-6. `src/fsd/features/upload/api/index.ts`

`reprocessUploadedFile` 함수의 트랜잭션 블록 내 `updateUploadedFileStatus` 호출에 `processingStartedAt: null`을 추가해 재처리 시 이전 처리 시작 시각을 DB에서 명시적으로 초기화한다:

```diff
     await db.$transaction(async (tx) => {
       await deleteClipsByUploadedFileId(uploadedFileId, { tx });
-      await updateUploadedFileStatus(uploadedFileId, "queued", { tx });
+      await updateUploadedFileStatus(uploadedFileId, "queued", { tx, processingStartedAt: null });
       await setUploadedFileUploaded(uploadedFileId, false, { tx });
     });
```

> 이 변경이 없어도 현재 UI는 안전하다 (`status = "queued"` 상태에서 Processing 단계가 완료로 표시되지 않고, 이후 Inngest가 `processingStartedAt`을 덮어쓴다). 그러나 DB에 스테일 값이 잔류하면 향후 이 필드를 직접 읽는 API나 분석 쿼리에서 오류 데이터가 노출될 수 있으므로 반드시 함께 적용한다.

---

## 6. DB 마이그레이션

이 프로젝트는 PostgreSQL(Neon)을 사용하므로 마이그레이션 히스토리를 유지하는 방식을 사용해야 한다. `db:push`는 마이그레이션 히스토리를 생성하지 않으므로 절대 사용하지 않는다.

`package.json` 스크립트 실제 정의:
| 스크립트 | 실행 명령 | 동작 |
|---------|----------|------|
| `db:generate` | `prisma migrate dev` | 대화형. 마이그레이션 이름 입력 후 파일 생성 + DB 적용 + Client 재생성을 한 번에 수행 |
| `db:migrate` | `prisma migrate deploy` | 비대화형. 이미 생성된 마이그레이션 파일을 DB에 적용만 함 (CI/프로덕션용) |

```bash
# 개발 환경: 마이그레이션 파일 생성 + 적용 + Client 재생성 (대화형, 이름 입력 필요)
npm run db:generate

# 프로덕션/CI 환경: 생성된 마이그레이션 파일 적용만 수행
npm run db:migrate
```

> `db:generate`(`prisma migrate dev`)는 단순 파일 생성이 아니라 **즉시 DB에 적용**까지 한다. 개발 환경에서 이 명령 하나로 충분하며, 이후 `db:migrate`를 추가로 실행할 필요가 없다.

---

## 7. 하위 호환성

| 레코드 유형 | processingStartedAt | Processing 표시 | Processed 표시 |
|-------------|---------------------|----------------|----------------|
| 신규 (수정 후) | T1 | T1 ✅ | T_end ✅ |
| 기존 (수정 전) | null | T_end (폴백) | T_end |

기존 레코드는 수정 전과 동일하게 동작하며 데이터 손실 없음. 단, **마이그레이션 이전에 처리 완료된 레코드는 `processingStartedAt = null`이므로 Processing과 Processed 타임스탬프가 동일하게 표시되는 기존 버그가 그대로 유지된다.** 소급 수정(backfill)은 이번 변경 범위 밖이다.

### 재처리(Reprocess) 시나리오

`features/upload/api/index.ts`의 `reprocessUploadedFile` 함수는 트랜잭션 내에서 status를 `"queued"`로 리셋한다. 이 시점에 `processingStartedAt`을 명시하지 않으면 스프레드 조건(`!== undefined`)에 의해 이전 처리의 T1이 DB에 잔류한다. 이를 방지하기 위해 **섹션 5-6의 변경을 반드시 함께 적용**해야 한다.

재처리 전후의 필드 상태:

| 시점 | processingStartedAt | status |
|------|---------------------|--------|
| 재처리 트리거 직후 (5-6 적용 전) | T1 (스테일) | "queued" |
| 재처리 트리거 직후 (5-6 적용 후) | null | "queued" |
| Inngest 재실행 후 | T2 (새 시각) | "processing" → "processed" |

---

## 8. 스코프 외 알려진 한계

### `failed` 상태의 UX 불일치 (기존 문제, 이번 수정 대상 아님)

`isStepCompleted("processing", "failed") = true`로 Processing 단계에 CheckCircle 아이콘이 표시되지만, 처리가 성공적으로 완료되지 않았음에도 완료 아이콘이 보이는 것은 의미적으로 부정확하다. 이번 수정 후 "Processing" 단계에 `processingStartedAt`(T1)가 올바르게 표시되지만, 아이콘 로직은 변경하지 않는다. 별도 이슈로 추적 권장.

### `no credits` 상태의 타임스탬프 표시 (기존 문제, 이번 수정 대상 아님)

`isStepCompleted("processing", "no credits") = false`로 Processing 단계가 미완료로 표시되지만, 타임스탬프는 항상 렌더링된다. 이 상태에서는 처리가 시작되지 않았으므로 `processingStartedAt = null`이고, 폴백인 `updatedAt`은 크레딧 부족으로 상태가 변경된 시각을 가리켜 "처리 시작 시각"과 의미가 다르다. 이번 수정으로 새로 발생하는 문제가 아니며 기존 동작과 동일하다. 별도 이슈로 추적 권장.

---

## 9. 검증 방법

**전제 조건**: 아래 검증 중 처리 트리거가 포함된 항목(4, 6, 7)은 Inngest 워커가 실행 중이어야 한다.
```bash
# 별도 터미널에서 실행
npm run inngest-dev
```

1. 섹션 5 (5-1 ~ 5-6) 코드 변경 전체 적용
2. `npm run db:generate` 실행 (대화형 — 마이그레이션 이름 입력 후 파일 생성 + DB 적용 + Prisma Client 재생성 자동 완료)
3. `npm run typecheck` 통과 확인 (반드시 step 2 이후 실행)
4. 새 파일 업로드 → 처리 트리거 → 완료 대기
5. 업로드 상세 페이지 타임라인 확인:
   - Queued ≠ Processing ≠ Processed 시각이 모두 다르게 표시
6. 재처리 시나리오 확인:
   - 처리 완료 후 재처리 트리거 → 완료 대기 → Processing 시각이 재처리 시점으로 갱신됨
7. `failed` 경로 확인:
   - 처리 실패 유도 시 Processing 단계에 `processingStartedAt`(T1) 표시, Processed 단계는 미완료로 표시
