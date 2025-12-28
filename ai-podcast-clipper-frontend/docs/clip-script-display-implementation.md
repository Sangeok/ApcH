## 목적

백엔드가 생성한 클립 영상의 **스크립트(자막/대본)** 를 프론트에서 함께 보여주기 위해, 프론트 코드 변경을 3단계로 정리합니다.

- **3) Inngest(`src/inngest/functions.ts`)**: S3 “목록 기반” → “백엔드 메타 기반”으로 `Clip` 생성
- **4) 조회 액션(`src/actions/uploaded-files.ts`)**: 업로드 상세 조회에 **권한 체크(본인 데이터만)** + 필요한 필드 포함
- **5) UI(`ClipCard.tsx`)**: “Script 보기” 토글/섹션 추가

---

## 사전 준비(전제)

아래 설계는 “스크립트가 `Clip`과 1:1로 저장/표시”되는 구조를 전제로 합니다.

- **DB(Prisma) 변경 필요**
  - `Clip`에 `scriptText`, `startSeconds`, `endSeconds`(옵션) 컬럼을 추가
  - `prisma migrate` + `prisma generate` 실행
- **백엔드 응답 계약(Contract)**
  - 백엔드 `process_video`가 처리 결과로 `clips` 메타를 내려줘야 함
  - 예시:

```ts
type ProcessVideoResponse = {
  status: "ok";
  s3_prefix: string;
  clips_planned: number;
  language?: string;
  clips: Array<{
    index: number;
    startSeconds: number;
    endSeconds: number;
    s3Key: string | null;
    language?: string;
    scriptText?: string | null;
  }>;
};
```

> 현재 백엔드가 `scriptText: null`을 내려주는 단계라도, 프론트는 **null-safe** 로 동작하도록 구현합니다.

---

## 3) Inngest: S3 “목록 기반” → “백엔드 메타 기반”으로 `Clip` 생성

### 변경 대상 파일

- `src/inngest/functions.ts`의 `processVideo` 함수

### 현재 흐름(요약)

- `call-modal-endpoint` step에서 백엔드 호출(응답을 사용하지 않음)
- `create-clips-in-db` step에서 S3 prefix로 객체 목록을 조회하고(`listS3ObjectsByPrefix`) 클립 파일을 찾아 `Clip` 레코드를 생성

### 목표 흐름

- `call-modal-endpoint`에서 **응답 JSON을 읽고** `clips` 메타를 확보
- `create-clips-in-db`에서:
  - **(우선)** `response.clips[]`를 기준으로 `Clip`을 생성(= 백엔드 메타 기반)
  - **(fallback)** `response.clips`가 비었거나 형식이 깨졌으면 기존 S3 listing 방식으로 생성

### 구현 포인트(권장 설계)

- **(A) call-modal-endpoint**: `fetch(...)` 후 `await res.json()`을 저장
  - `res.ok` 체크
  - 파싱 실패 대비 `try/catch`
- **(B) create-clips-in-db**
  - `response.clips`가 유효하면 `createMany`에 다음을 넣음:
    - `s3Key`
    - `startSeconds`, `endSeconds`
    - `scriptText` (nullable 허용)
  - `clipsFound`는 `response.clips.length`로 계산(크레딧 차감/로깅에 사용)
- **(C) fallback의 필터 개선(중요)**
  - 기존 코드의 `!key.endsWith("original.mp4")`는 업로드 원본이 `original.<확장자>`일 수 있어 원본이 클립으로 오인될 수 있음
  - fallback에서는 최소한 다음과 같이 필터 권장:
    - `key.startsWith(\`\${folderPrefix}/clip_\`) && key.endsWith(".mp4")`

### 수정 예시(의사 코드)

```ts
// (A) call-modal-endpoint step
const res = await fetch(env.PROCESS_VIDEO_ENDPOINT, { ... });
if (!res.ok) throw new Error(`Process video failed: ${res.status}`);
const payload = (await res.json()) as ProcessVideoResponse;
return payload;

// (B) create-clips-in-db step
if (payload?.clips?.length) {
  await db.clip.createMany({
    data: payload.clips
      .filter((c) => c.s3Key)
      .map((c) => ({
        s3Key: c.s3Key!,
        uploadedFileId,
        userId,
        startSeconds: c.startSeconds,
        endSeconds: c.endSeconds,
        scriptText: c.scriptText ?? null,
      })),
  });
  return { clipsFound: payload.clips.length };
}

// (C) fallback - listS3ObjectsByPrefix()
// 기존 방식 유지하되, 필터를 안전하게 보정
```

---

## 4) 조회 액션: 보안 + 필요한 필드 포함

### 변경 대상 파일

- `src/actions/uploaded-files.ts`
  - `getUploadedFileDetails(uploadedFileId: string)`

### 문제점(현재 코드 기준)

- `getUploadedFileDetails`가 **로그인/소유자 검증 없이** `uploadedFileId`만으로 조회합니다.
- 스크립트가 들어가면 텍스트 노출 리스크가 커지므로, 반드시 **본인(userId) 데이터만** 조회되도록 제한해야 합니다.

### 목표

- `auth()`로 세션 확인
- `where: { id: uploadedFileId, userId: session.user.id }` 형태로 제한
- `clips`에 스크립트 필드가 포함되도록(Prisma 모델 확장 시 자동 포함되지만, 명시적으로 `select` 추천)

### 수정 예시(의사 코드)

```ts
export async function getUploadedFileDetails(uploadedFileId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  return db.uploadedFile.findFirstOrThrow({
    where: { id: uploadedFileId, userId: session.user.id },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      language: true,
      clips: {
        orderBy: { createdAt: "desc" },
        // select: { id: true, s3Key: true, startSeconds: true, endSeconds: true, scriptText: true, ... }
      },
    },
  });
}
```

---

## 5) UI: `ClipCard.tsx`에 “Script 보기” 토글 추가

### 변경 대상 파일

- `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx`

### 목표 UX

- 클립 카드에서 영상 아래/옆에 **“Script 보기/숨기기” 버튼**
- 열리면 `scriptText`를 그대로 표시(줄바꿈 유지)
- `scriptText`가 없으면 “스크립트 없음” 안내

### 구현 포인트

- `useState<boolean>`로 토글 상태 관리
- 텍스트 렌더링은 `pre` 또는 `div` + `whitespace-pre-wrap` 클래스로 줄바꿈 보존
- (선택) “Copy” 버튼 추가: `navigator.clipboard.writeText(clip.scriptText)`

### 수정 예시(의사 코드)

```tsx
const [isScriptOpen, setIsScriptOpen] = useState(false);

<Button variant="outline" size="sm" onClick={() => setIsScriptOpen((v) => !v)}>
  {isScriptOpen ? "Hide script" : "Show script"}
</Button>

{isScriptOpen && (
  <div className="mt-2 rounded-md border p-3 text-sm">
    <pre className="whitespace-pre-wrap">
      {clip.scriptText ?? "스크립트 없음"}
    </pre>
  </div>
)}
```

---

## 체크리스트(동작 확인)

- **Inngest**
  - 백엔드 응답 `clips[]`가 있을 때: S3 listing 없이도 `Clip` 레코드가 생성되는가
  - 응답이 비정상일 때: fallback이 정상 동작하는가
- **권한**
  - 다른 유저의 `uploadedFileId`로 접근 시 404/Unauthorized로 차단되는가
- **UI**
  - “Script 보기” 토글이 정상 동작하는가
  - `scriptText`가 `null`이어도 UI가 깨지지 않는가

