---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-04-26"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-04-26"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# Generated Clip Completion & Persistence Fix Proposal

## 0. TL;DR

현재 `processVideo`는 Modal callback을 기다리다가 callback이 오지 않으면 S3 prefix를 polling한다. 이 fallback 경로에서 **clip이 1개라도 발견되면 처리 완료로 간주**한다.

```ts
if (generatedClipCount > 0) {
  generatedClipsDetected = true;
  break;
}
```

이 때문에 `targetClipCount = 4`인 작업에서도 첫 번째 clip만 S3에 먼저 올라오면 Inngest가 즉시 `processed`로 마감하고, 그 시점에 보이는 1개만 `Clip` 테이블에 저장한다. 이후 S3에 나머지 clip 3개가 올라와도 Inngest run은 이미 끝났으므로 DB에 반영되지 않는다.

해결 방향은 다음과 같다.

1. S3 fallback 완료 조건을 `generatedClipCount > 0`에서 `generatedClipCount >= clipCount`로 바꾼다.
2. 완료 판정용 S3 count는 **반드시 현재 attempt의 `outputPrefix/`만** 본다. 기존 root fallback(`uploadedFilePrefix/clip_*.mp4`)은 legacy backfill 용도로만 분리한다.
3. `persistGeneratedClips`는 backend callback의 `clips`만 저장하고 return하지 말고, 현재 attempt S3 listing 결과와 merge해서 DB를 보강한다.
4. callback clip count만으로 완료 처리하지 않는다. 실제 S3 object가 `clipCount`개 이상 확인되어야 `processed`로 마감한다.
5. S3 object가 먼저 완성되고 callback metadata가 늦게 오는 경우를 위해 짧은 metadata grace wait를 둔다.
6. grace window 이후에 도착한 late Modal webhook은 기존 `Clip` row를 best-effort update해서 metadata를 보강한다.
7. backend가 목표보다 많은 clip을 생성해도 저장/credit 차감은 `clipCount`개로 cap한다.
8. Modal failure callback은 S3 산출물 존재 여부와 함께 해석한다. 현재 attempt S3 object가 `clipCount`개 이상이면 산출물 성공으로 처리하고, 부족하면 실패로 처리한다.
9. `clipsFound < clipCount`인 상태에서는 `processed`로 마감하지 않는다. 계속 기다리거나 최종 timeout 시 0개면 `no_clips_generated`, 1개 이상이면 `incomplete_clips_generated`로 실패 처리한다.
10. 이미 발생한 데이터는 S3 prefix를 기준으로 `Clip` 테이블을 backfill한다.

이 문서는 위 수정이 바로 가능하도록 원인, 변경 대상, 구체 코드 구조, 검증 절차를 정리한다.

---

## 1. 확인된 실제 장애 사례

대상 prefix:

```txt
0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/
```

해당 업로드 DB 상태:

```json
{
  "id": "cmofdtqc20001l504q5giidrg",
  "userId": "cmn36ae4h0000si6g7pb4k3w1",
  "s3Key": "0c47ca5d-3c86-43da-a8c1-1dae734d5510/original.mp4",
  "status": "processed",
  "currentAttempt": 1,
  "lastSuccessfulAttempt": 1,
  "targetClipCount": 4,
  "processingStartedAt": "2026-04-26T06:23:52.056Z",
  "terminalStatusAt": "2026-04-26T06:28:01.073Z",
  "failureCode": null
}
```

S3에는 4개가 존재한다.

```json
[
  {
    "key": "0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/clip_0_kr.mp4",
    "lastModified": "2026-04-26T06:27:40.000Z"
  },
  {
    "key": "0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/clip_1_kr.mp4",
    "lastModified": "2026-04-26T06:29:52.000Z"
  },
  {
    "key": "0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/clip_2_kr.mp4",
    "lastModified": "2026-04-26T06:33:10.000Z"
  },
  {
    "key": "0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/clip_3_kr.mp4",
    "lastModified": "2026-04-26T06:35:52.000Z"
  }
]
```

하지만 DB `Clip` 레코드는 1개뿐이다.

```json
{
  "dbClipCount": 1,
  "clips": [
    {
      "id": "cmofdzoy60000l804sh6ydo8l",
      "s3Key": "0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/clip_0_kr.mp4",
      "uploadedFileId": "cmofdtqc20001l504q5giidrg",
      "processingAttempt": 1,
      "createdAt": "2026-04-26T06:27:59.118Z"
    }
  ]
}
```

타임라인상 핵심은 다음이다.

| 시각 (UTC) | 이벤트 |
|---|---|
| 06:27:40 | S3에 `clip_0_kr.mp4` 생성 |
| 06:27:59 | DB에 `clip_0_kr.mp4` 1개 저장 |
| 06:28:01 | `UploadedFile.status = processed` 마감 |
| 06:29:52 | S3에 `clip_1_kr.mp4` 생성 |
| 06:33:10 | S3에 `clip_2_kr.mp4` 생성 |
| 06:35:52 | S3에 `clip_3_kr.mp4` 생성 |

즉 frontend가 1개만 인식한 이유는 UI 문제가 아니라 **DB에 1개만 저장되어 있기 때문**이다. UI는 S3를 직접 세지 않고 `Clip` 테이블을 기준으로 보여준다.

---

## 2. 현재 처리 흐름

### 2-1. 요청 생성

파일: `src/fsd/features/upload/api/index.ts`

`createProcessingAttempt`는 `currentAttempt + 1`로 새 processing attempt를 만들고 `ProcessingDispatch`를 생성한다.

```ts
const nextAttempt = uploadedFile.currentAttempt + 1;

await createProcessingDispatch(
  {
    uploadedFileId,
    attempt: nextAttempt,
  },
  { tx, now },
);
```

### 2-2. Inngest 이벤트 발행

파일: `src/fsd/entities/processing-dispatch/api/index.ts`

`dispatchPendingProcessingRequests`는 `outputPrefix`를 attempt별 prefix로 만든다.

```ts
outputPrefix: getAttemptOutputPrefix(
  dispatch.uploadedFile.s3Key,
  dispatch.attempt,
),
```

파일: `src/fsd/entities/uploaded-file/model/attempt-prefix.ts`

```ts
export function getAttemptOutputPrefix(s3Key: string, attempt: number): string {
  return `${getUploadedFilePrefix(s3Key)}/attempt-${attempt}`;
}
```

예:

```txt
original: 0c47ca5d-3c86-43da-a8c1-1dae734d5510/original.mp4
output:   0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/
```

### 2-3. Modal 호출

파일: `src/inngest/functions.ts`

`processVideo`는 Modal endpoint에 `output_prefix`를 넘긴다.

```ts
body: JSON.stringify({
  uploaded_file_id: uploadedFileId,
  s3_key: context.s3Key,
  attempt,
  language,
  clip_count: clipCount,
  output_prefix: outputPrefix,
  callback_url: callbackUrl,
}),
```

### 2-4. 완료 대기

현재 완료 대기 방식은 두 가지다.

1. `modal/video.processed` callback event 수신
2. callback이 아직 없으면 S3에 `clip_*.mp4`가 생성됐는지 polling

문제는 2번 fallback에서 1개만 발견해도 완료로 판단한다는 점이다.

```ts
if (generatedClipCount > 0) {
  generatedClipsDetected = true;
  break;
}
```

### 2-5. DB 저장

파일: `src/inngest/functions.ts`

`persistGeneratedClips`는 다음 순서로 동작한다.

1. `backendClips`가 있으면 그 배열만 DB에 저장하고 바로 return
2. `backendClips`가 없으면 S3 listing으로 `clip_*.mp4`를 찾아 DB에 저장

현재 코드:

```ts
if (Array.isArray(backendClips) && backendClips.length > 0) {
  const createData = backendClips
    .filter(...)
    .map(...);

  if (createData.length > 0) {
    await createClipsBulk(createData);
    return { clipsFound: createData.length };
  }
}

const clipKeys = await findGeneratedClipKeys(
  outputPrefix,
  uploadedFilePrefix,
);
```

이 구조에는 보조 문제가 있다. callback이 일부 clip만 내려주면 S3에 나머지가 있어도 listing fallback까지 가지 않는다.

### 2-6. UI 조회

대시보드와 상세 페이지는 S3를 직접 조회하지 않는다. DB `Clip` 레코드만 본다.

파일: `src/fsd/entities/uploaded-file/api/index.ts`

대시보드 count:

```ts
visibleClipsCount:
  file.lastSuccessfulAttempt > 0
    ? (countsByAttempt.get(`${file.id}:${file.lastSuccessfulAttempt}`) ?? 0)
    : 0,
```

상세 페이지 clips:

```ts
const clips =
  file.lastSuccessfulAttempt > 0
    ? await db.clip.findMany({
        where: {
          uploadedFileId: file.id,
          processingAttempt: file.lastSuccessfulAttempt,
        },
        orderBy: {
          createdAt: "desc",
        },
      })
    : [];
```

따라서 S3에 4개가 있어도 DB에 1개만 있으면 frontend는 1개로 인식하는 것이 정상 동작이다.

---

## 3. Root Cause

### 원인 1: S3 fallback 완료 조건이 너무 느슨함

현재:

```ts
if (generatedClipCount > 0) {
  generatedClipsDetected = true;
  break;
}
```

문제:

- `clipCount = 4`인데 1개만 있어도 완료로 처리한다.
- Modal backend가 clip을 순차 업로드하면 첫 clip과 마지막 clip 사이에 몇 분 차이가 날 수 있다.
- 실제 장애 사례에서도 `clip_0`과 `clip_3` 생성 시각 차이가 약 8분 12초다.

수정:

```ts
if (generatedClipCount >= clipCount) {
  generatedClipsDetected = true;
  break;
}
```

### 원인 2: backend callback clips와 S3 listing을 merge하지 않음

현재:

```ts
if (Array.isArray(backendClips) && backendClips.length > 0) {
  ...
  await createClipsBulk(createData);
  return { clipsFound: createData.length };
}
```

문제:

- callback payload가 일부 clip만 포함하면 그 일부만 DB에 저장된다.
- S3에는 나머지가 있어도 fallback listing을 실행하지 않는다.
- `createMany(..., skipDuplicates: true)`를 쓰면서 `createData.length`를 반환하므로 실제 insert count와도 다를 수 있다.

수정:

- backend clips를 먼저 map에 넣는다.
- S3 listing 결과를 항상 가져온다.
- 같은 `s3Key`는 backend metadata를 우선한다.
- S3에만 있는 clip은 metadata 없이 DB에 보강 저장한다.
- 저장 후에는 DB에 실제 존재하는 attempt clip count를 다시 count한다.

### 원인 3: 저장 후 expected count 검증이 없음

현재:

```ts
if (clipsFound === 0) {
  mark failed
}

deduct credits
mark processed
```

문제:

- `clipsFound = 1`, `clipCount = 4`여도 `processed`가 된다.
- 처리 성공 상태와 실제 결과 수가 불일치한다.

수정:

```ts
if (clipsFound < clipCount) {
  mark failed with "incomplete_clips_generated"
  return { skipped: false, status: "incomplete_clips_generated" };
}
```

단, timeout 전에 바로 실패시키면 늦게 업로드되는 clip을 놓칠 수 있으므로, 이 검증은 polling이 끝난 최종 단계에서 수행한다.

### 원인 4: root fallback을 완료 판정에 섞으면 stale clip을 새 attempt로 오인할 수 있음

현재 `findGeneratedClipKeys`는 두 위치를 함께 조회한다.

```ts
const [attemptClipCandidates, rootClipCandidates] = await Promise.all([
  listS3Objects(`${outputPrefix}/`),
  outputPrefix === uploadedFilePrefix
    ? Promise.resolve<string[]>([])
    : listS3Objects(`${uploadedFilePrefix}/`),
]);
```

이 fallback은 과거 backend가 `{uploadPrefix}/clip_*.mp4`에 직접 저장하던 legacy 결과를 찾기 위한 방어 로직으로 보인다. 그러나 현재 설계에서는 attempt별 결과가 `{uploadPrefix}/attempt-{attempt}/clip_*.mp4`에 저장된다.

문제:

- reprocess attempt 2가 진행 중일 때, root에 남아 있는 과거 `clip_*.mp4`가 `generatedClipCount >= clipCount` 조건을 만족시킬 수 있다.
- `Clip` 모델의 unique key는 `@@unique([uploadedFileId, processingAttempt, s3Key])`이므로, 같은 root `s3Key`도 다른 attempt 번호로 다시 저장될 수 있다.
- 그 결과 새 attempt가 실제로는 아직 완료되지 않았는데 `processed`로 마감될 수 있다.

수정:

- 완료 판정용 count는 `outputPrefix/`만 조회한다.
- legacy root fallback은 일반 처리 완료 판정에서 제외한다.
- root fallback이 반드시 필요하다면 migration/backfill 또는 명시적인 legacy mode에서만 사용한다.

### 원인 5: callback count만으로 완료 처리하면 S3 object가 아직 없을 수 있음

Modal callback이 `clips` 배열을 먼저 보내고 실제 S3 upload visibility가 늦게 따라오는 경우를 배제할 수 없다. 현재 재생 URL은 DB의 `s3Key`로 presigned URL을 만들 뿐, DB 저장 시 S3 object 존재를 보장하지 않는다.

따라서 완료 판정은 다음 기준이어야 한다.

```txt
현재 attempt outputPrefix 아래 실제 S3 clip object 수 >= clipCount
```

callback clips는 metadata source로 사용하되, 완료 판정의 최종 근거는 S3 object listing이다.

### 원인 6: 목표보다 많은 clip이 생성되면 credit을 초과 차감할 수 있음

현재 credit 차감은 `clipsFound` 기준이다.

```ts
await decrementUserCreditsFloorZero(context.userId, clipsFound);
```

backend가 `clipCount = 4` 요청에 대해 5개 이상을 생성하면, 모든 S3 object를 DB에 저장하는 구현은 5개 이상 credit을 차감할 수 있다. UI의 지원 clip count는 현재 1~4개이므로, 저장과 차감은 목표 개수로 cap해야 한다.

권장 정책:

- attempt outputPrefix의 clip key를 정렬한다.
- 최대 `clipCount`개만 DB에 persist한다.
- credit은 실제 persist된 capped count 기준으로 차감한다.

### 원인 7: S3가 callback보다 먼저 완성되면 metadata가 비어 저장될 수 있음

완료 판정을 S3 object 기준으로 바꾸면 clip 개수 문제는 해결된다. 그러나 S3 object가 먼저 `clipCount`개에 도달하고 Modal callback이 늦게 도착하면, `backendClips` 없이 DB persist가 실행될 수 있다. 이 경우 다음 metadata가 null로 저장된다.

- `startSeconds`
- `endSeconds`
- `scriptText`
- `youtubeTitle`
- `youtubeDescription`
- `youtubeHashtags`

현재 UI는 이 metadata를 실제로 사용한다. 따라서 단순히 S3 count만 보고 즉시 `processed`로 마감하면 "clip 개수는 맞지만 metadata가 비는" 새 문제가 생길 수 있다.

수정:

- S3 object가 `clipCount`개 이상 확인됐지만 callback을 아직 받지 못했다면, 짧은 metadata grace wait를 한 번 수행한다.
- grace wait 안에 callback이 오면 callback metadata와 S3 key를 merge해서 저장한다.
- grace wait 이후에도 callback이 없으면 S3-only clip을 저장하고 `processed`로 마감한다. 이때 metadata는 일단 null일 수 있다.
- grace window 이후 늦게 도착한 Modal webhook은 기존 `Clip` row를 update해서 metadata를 보강한다.

### 원인 8: Modal failure callback 정책이 불명확하면 산출물 성공/실패 판단이 흔들릴 수 있음

현재 코드도 `backendFailureMessage`가 있어도 `clipsFound === 0`일 때만 throw한다.

```ts
if (backendFailureMessage && clipsFound === 0) {
  throw new Error(backendFailureMessage);
}
```

즉 "backend는 failure를 보고했지만 S3에 산출물이 있다"는 상태를 성공처럼 처리할 여지가 이미 있다. 수정 후에는 이 정책을 명시해야 한다.

권장 정책:

| 상태 | 처리 |
|---|---|
| failure callback 수신 + 현재 attempt S3 clip 수 `>= clipCount` | 산출물 성공으로 간주하고 capped persist 후 `processed` |
| failure callback 수신 + 현재 attempt S3 clip 수 `0` | `backend_failed` |
| failure callback 수신 + 현재 attempt S3 clip 수 `1..clipCount-1` | `incomplete_clips_generated` 또는 `backend_failed` 중 하나로 실패. 기본 권장은 `incomplete_clips_generated` |

이 정책은 "사용자가 볼 수 있는 산출물이 목표 개수만큼 있으면 성공"을 우선한다. backend failure가 metadata 생성 실패를 의미하더라도 video clip 자체가 모두 존재하면 사용자는 결과를 받을 수 있기 때문이다. 단, 이 경우 metadata는 비어 있을 수 있으므로 late webhook reconciliation이 필요하다.

---

## 4. 목표 동작

`clipCount = 4`인 경우:

| 상태 | 처리 |
|---|---|
| S3 clip 0개 | 계속 대기 |
| S3 clip 1~3개 | 계속 대기 |
| 현재 attempt `outputPrefix/`의 S3 clip 4개 이상 + callback 수신됨 | 최대 4개 DB 저장 후 `processed` |
| 현재 attempt `outputPrefix/`의 S3 clip 4개 이상 + callback 미수신 | metadata grace wait 후 저장/`processed` |
| callback clips 4개 이상, S3 clip 4개 미만 | 계속 대기 |
| callback clips 일부 + 현재 attempt S3 clip 4개 이상 | merge 저장 후 `processed` |
| failure callback + 현재 attempt S3 clip 4개 이상 | 산출물 성공으로 처리, metadata는 late reconciliation 대상 |
| failure callback + 현재 attempt S3 clip 1~3개 | `failed`, 기본 `failureCode = incomplete_clips_generated` |
| failure callback + 현재 attempt S3 clip 0개 | `failed`, `failureCode = backend_failed` |
| timeout까지 1~3개만 존재 | `failed`, `failureCode = incomplete_clips_generated` |
| timeout까지 0개 | `failed`, `failureCode = no_clips_generated` |
| 현재 attempt S3 clip 5개 이상 | 정렬 후 최대 `clipCount`개만 저장/차감 |

`clipCount`는 현재 UI에서 사용자가 선택한 목표 개수이며 `CLIP_COUNT_OPTIONS`도 1~4개를 지원한다. 따라서 backend가 명시적으로 partial success를 지원하기 전까지는 `clipCount`를 완료 기준으로 삼는 것이 가장 일관적이다.

---

## 5. 구현 계획

### 5-0. 구현 정책 확정

이 수정에서 사용할 기준을 먼저 고정한다.

1. **완료 판정은 S3 실존 기준**이다.
   - callback `clips.length`가 충분해도, 현재 attempt `outputPrefix/` 아래 실제 S3 object가 `clipCount`개 이상 확인되기 전에는 `processed`로 마감하지 않는다.
2. **완료 판정은 현재 attempt prefix만 본다.**
   - `outputPrefix/clip_*.mp4`만 count한다.
   - `uploadedFilePrefix/clip_*.mp4` root fallback은 완료 판정에서 제외한다.
3. **legacy root fallback은 별도 함수로 분리한다.**
   - 일반 신규 처리에서는 사용하지 않는다.
   - 이미 존재하는 root clip 복구가 필요하면 backfill script나 legacy-only 복구 루틴에서 명시적으로 사용한다.
4. **저장/credit은 `clipCount`로 cap한다.**
   - backend가 목표보다 많은 clip을 생성해도 최대 `clipCount`개만 DB에 저장한다.
   - credit 차감도 실제 DB에 저장된 capped clip 수 기준으로 수행한다.
5. **metadata source는 backend callback을 우선한다.**
   - 같은 `s3Key`가 callback과 S3 listing 양쪽에 있으면 callback metadata를 보존한다.
   - S3에만 있는 clip은 metadata 없이 저장한다.
6. **S3가 먼저 완성되면 metadata grace wait를 둔다.**
   - 현재 attempt S3 clip 수가 `clipCount`에 도달했지만 callback을 아직 못 받았다면, 짧은 추가 대기 후 persist한다.
   - grace wait 이후에도 callback이 없으면 S3-only로 저장하되, late webhook reconciliation으로 metadata 보강 가능성을 남긴다.
7. **Modal failure callback은 S3 산출물 기준과 함께 해석한다.**
   - S3 clip 수가 `clipCount`에 도달했으면 산출물 성공으로 처리한다.
   - S3 clip 수가 부족하면 실패 처리한다.
8. **기존 DB row도 cap 정책과 metadata 보강 정책에 맞춘다.**
   - 새 insert는 `clipCount`개로 cap한다.
   - 이미 존재하는 동일 attempt의 초과 `Clip` row는 backfill/cleanup 단계에서 탐지하고 정리한다.
   - `createMany(..., skipDuplicates: true)`로 인해 insert가 skip된 기존 row도 backend metadata로 update한다.

### 5-1. `Clip` keyed count helper 추가

파일: `src/fsd/entities/clip/api/index.ts`

추가:

```ts
export async function countClipsByUploadedFileAttemptS3Keys(
  uploadedFileId: string,
  processingAttempt: number,
  s3Keys: string[],
  options?: { tx?: Prisma.TransactionClient },
) {
  if (s3Keys.length === 0) {
    return 0;
  }

  return getClient(options?.tx).clip.count({
    where: {
      uploadedFileId,
      processingAttempt,
      s3Key: {
        in: s3Keys,
      },
    },
  });
}
```

이 helper는 `createMany(..., skipDuplicates: true)` 이후 **이번 run에서 허용한 capped S3 key 집합**이 실제 DB에 몇 개 존재하는지 확인하는 데 쓴다. 전체 attempt row를 세면 과거 backfill/수동 수정으로 남은 초과 row 때문에 `clipsFound`가 과대 계산될 수 있으므로, 완료 판정과 credit 차감에는 전체 count를 쓰지 않는다.

`src/fsd/entities/clip/index.ts` barrel export도 함께 갱신한다. 이 파일을 갱신하지 않으면 `~/fsd/entities/clip`에서 새 helper를 import할 때 typecheck가 실패한다.

```ts
export {
  countClipsByUploadedFileAttemptS3Keys,
  createClipsBulk,
  deleteClipRecord,
  deleteClipsByUploadedFileId,
  findClipById,
  updateClipMetadataFromBackendClips,
} from "./api";
```

### 5-2. S3 listing helper를 attempt-only로 정리하고 legacy-root는 backfill 전용으로 이동

파일: `src/inngest/functions.ts`

현재 `findGeneratedClipKeys`는 attempt prefix와 root prefix를 함께 반환한다. 이 함수는 완료 판정에 그대로 쓰면 안 된다.

`processVideo` 내부 변경 방향:

```ts
async function findAttemptGeneratedClipKeys(
  outputPrefix: string,
): Promise<string[]> {
  const clipCandidates = await listS3Objects(`${outputPrefix}/`);

  return clipCandidates
    .filter(
      (key) =>
        key.startsWith(`${outputPrefix}/clip_`) && key.endsWith(".mp4"),
    )
    .sort();
}
```

적용 원칙:

- `countGeneratedClipKeys`는 `findAttemptGeneratedClipKeys(outputPrefix)`만 사용한다.
- `src/inngest/functions.ts`에 미사용 `findLegacyRootGeneratedClipKeys`를 추가하지 않는다. 현재 ESLint의 `@typescript-eslint/no-unused-vars`는 warning이므로 빌드를 깨지는 않지만, 경고를 만들 필요가 없다.
- `processVideo` 내부의 `uploadedFilePrefix` 지역 변수와 `getUploadedFilePrefix` import는 제거한다. attempt-only 완료 판정에서는 더 이상 필요 없다.
- legacy root clip 복구가 필요하면 `scripts/backfill-clips-from-s3-prefix.mjs` 같은 backfill script 안에만 root listing 로직을 둔다.

`countGeneratedClipKeys` 변경:

```ts
async function countGeneratedClipKeys(outputPrefix: string): Promise<number> {
  return (await findAttemptGeneratedClipKeys(outputPrefix)).length;
}
```

### 5-3. `persistGeneratedClips`를 merge + cap 방식으로 변경

파일: `src/inngest/functions.ts`

현재 import:

```ts
import { createClipsBulk } from "~/fsd/entities/clip";
```

변경:

```ts
import type { Prisma } from "generated/prisma";
import {
  countClipsByUploadedFileAttemptS3Keys,
  createClipsBulk,
  updateClipMetadataFromBackendClips,
} from "~/fsd/entities/clip";
```

`persistGeneratedClips` 변경 방향:

```ts
async function persistGeneratedClips(args: {
  backendClips?: ProcessVideoBackendClip[];
  outputPrefix: string;
  uploadedFileId: string;
  userId: string;
  attempt: number;
  expectedClipCount: number;
}): Promise<{ clipsFound: number }> {
  const {
    backendClips,
    outputPrefix,
    uploadedFileId,
    userId,
    attempt,
    expectedClipCount,
  } = args;

  const attemptClipKeys = await findAttemptGeneratedClipKeys(outputPrefix);
  const cappedClipKeys = attemptClipKeys.slice(0, expectedClipCount);
  const allowedClipKeys = new Set(cappedClipKeys);
  const createDataByS3Key = new Map<string, Prisma.ClipCreateManyInput>();

  if (Array.isArray(backendClips)) {
    for (const clip of backendClips) {
      if (
        typeof clip.s3Key !== "string" ||
        clip.s3Key.length === 0 ||
        !allowedClipKeys.has(clip.s3Key)
      ) {
        continue;
      }

      createDataByS3Key.set(clip.s3Key, {
        s3Key: clip.s3Key,
        uploadedFileId,
        userId,
        processingAttempt: attempt,
        startSeconds: clip.startSeconds ?? null,
        endSeconds: clip.endSeconds ?? null,
        scriptText: clip.scriptText ?? null,
        youtubeTitle: clip.youtubeTitle ?? null,
        youtubeDescription: clip.youtubeDescription ?? null,
        youtubeHashtags: clip.youtubeHashtags
          ? JSON.stringify(clip.youtubeHashtags)
          : null,
      });
    }
  }

  for (const clipKey of cappedClipKeys) {
    if (createDataByS3Key.has(clipKey)) {
      continue;
    }

    createDataByS3Key.set(clipKey, {
      s3Key: clipKey,
      uploadedFileId,
      userId,
      processingAttempt: attempt,
    });
  }

  await createClipsBulk([...createDataByS3Key.values()]);

  const metadataClips = Array.isArray(backendClips)
    ? backendClips.filter(
        (clip): clip is ProcessVideoBackendClip & { s3Key: string } =>
          typeof clip.s3Key === "string" &&
          clip.s3Key.length > 0 &&
          allowedClipKeys.has(clip.s3Key),
      )
    : [];

  if (metadataClips.length > 0) {
    await updateClipMetadataFromBackendClips({
      uploadedFileId,
      processingAttempt: attempt,
      clips: metadataClips,
    });
  }

  const dbClipCount = await countClipsByUploadedFileAttemptS3Keys(
    uploadedFileId,
    attempt,
    cappedClipKeys,
  );

  return {
    clipsFound: Math.min(dbClipCount, expectedClipCount),
  };
}
```

주의:

- `expectedClipCount`는 `event.data.clipCount`를 넘긴다.
- 호출부에서는 기존 `uploadedFilePrefix` 인자를 제거하고 `expectedClipCount: clipCount`를 추가한다.
- S3 key를 정렬한 뒤 `clipCount`개로 cap한다.
- callback metadata는 S3에 실제 존재하고 cap 안에 포함되는 key에 대해서만 저장한다.
- S3에 없는 callback `s3Key`는 DB에 저장하지 않는다.
- `createMany(..., skipDuplicates: true)` 때문에 이미 존재하던 row가 insert skip되더라도, `updateClipMetadataFromBackendClips`를 한 번 더 호출해 기존 row metadata를 보강한다.
- 반환하는 `clipsFound`는 capped S3 key 집합에 해당하는 DB row만 세고, 다시 `expectedClipCount`로 cap해서 과거 초과 row나 stale row 때문에 credit/완료 판정이 흔들리지 않게 한다.
- S3에만 있는 clip은 video 재생에는 충분하지만 `startSeconds`, `scriptText`, YouTube metadata는 null이 된다. metadata 복구가 필요하면 Modal callback payload 또는 backend 로그에서 별도 backfill이 필요하다.

호출부 예:

```ts
return persistGeneratedClips({
  backendClips,
  outputPrefix,
  uploadedFileId,
  userId: context.userId,
  attempt,
  expectedClipCount: clipCount,
});
```

### 5-4. S3 fallback 완료 조건 강화

파일: `src/inngest/functions.ts`

현재:

```ts
if (generatedClipCount > 0) {
  generatedClipsDetected = true;
  break;
}
```

변경:

```ts
if (generatedClipCount >= clipCount) {
  generatedClipsDetected = true;
  break;
}
```

단, 이 조건은 `countGeneratedClipKeys`가 현재 attempt의 `outputPrefix/`만 세도록 바뀐 뒤에 적용해야 한다. root fallback까지 섞인 count에 이 조건을 적용하면 stale clip 오인 문제가 남는다.

이것만으로는 callback이 일부 clip만 내려주는 케이스를 막지 못한다. 따라서 아래 5-5까지 같이 적용해야 한다.

### 5-5. callback/동기 응답 모두 S3 실존 개수 기준으로 처리

현재 구조는 callback을 받으면 성공/실패를 판단하고 바로 loop를 종료한다.

```ts
if (!isSuccessfulModalStatus(modalResult.data.status)) {
  backendFailureMessage = ...
} else {
  backendClips = modalResult.data.clips as ...
}

break;
```

변경 목표:

- callback이 성공이어도 현재 attempt `outputPrefix/` 아래 실제 S3 object가 `clipCount`개 이상 확인되지 않으면 바로 `processed`로 가지 않는다.
- Modal이 동기 success 응답을 반환해도 현재 attempt S3 object가 `clipCount`개 이상 확인될 때까지 같은 polling 흐름을 탄다.
- Modal이 동기 failure 응답을 반환해도 현재 attempt S3 object가 이미 `clipCount`개 이상 있으면 산출물 성공으로 처리하고, 부족하면 실패로 처리한다.
- callback의 `clips` 배열은 metadata source로만 보관한다.
- 동기 응답과 callback의 clip payload는 모두 같은 normalization을 거친다. backend가 `s3_key`, `start_seconds` 같은 snake_case를 보내도 `ProcessVideoBackendClip`의 camelCase로 변환한 뒤 persist한다.
- Modal이 `accepted`를 반환했는데 `callbackUrl`이 없으면 기존처럼 즉시 throw한다. 받을 수 없는 callback을 기다리면 timeout까지 불필요하게 대기한다.
- callback 이후에는 동일 callback event를 다시 기다릴 필요가 없으므로 `step.sleep` + S3 count polling으로 나머지 clip을 기다린다.
- S3 object가 먼저 완성됐고 callback이 아직 없으면, metadata 보존을 위해 짧은 grace wait를 한 번 수행한다.
- failure callback을 받아도 현재 attempt S3 object가 `clipCount`개 이상이면 산출물 성공으로 처리한다. S3 object가 부족하면 실패 처리한다.
- polling timeout은 backend failure callback과 분리한다. timeout 자체를 `backendFailureMessage`에 넣으면 `clipsFound === 0`일 때 `backend_failed`로 마감되어, `timeout까지 0개 => no_clips_generated` 정책과 충돌한다.

권장 구조:

```ts
const MODAL_METADATA_GRACE_INTERVAL = "2m";

let backendClips: ProcessVideoBackendClip[] | undefined;
let backendFailureMessage: string | null = null;
let generatedClipsDetected = false;
let modalCallbackReceived = false;
let generatedClipCount = 0;
const shouldWaitForCallback = modalResponse.status === "accepted";

type RawProcessVideoBackendClip = {
  index?: number | string;
  startSeconds?: number | null;
  start_seconds?: number | null;
  endSeconds?: number | null;
  end_seconds?: number | null;
  s3Key?: string | null;
  s3_key?: string | null;
  scriptText?: string | null;
  script_text?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtube_title?: string | null;
  youtubeDescription?: string | null;
  youtube_description?: string | null;
  youtubeHashtags?: string[] | null;
  youtube_hashtags?: string[] | null;
};

function toBackendClipIndex(index: unknown): number | null {
  if (typeof index === "number" && Number.isInteger(index) && index >= 0) {
    return index;
  }

  if (typeof index === "string") {
    const normalized = index.trim();

    if (!/^\d+$/.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}

function normalizeBackendClip(
  clip: unknown,
): ProcessVideoBackendClip | null {
  if (!clip || typeof clip !== "object") {
    return null;
  }

  const rawClip = clip as RawProcessVideoBackendClip;
  const index = toBackendClipIndex(rawClip.index);

  if (index === null) {
    return null;
  }

  return {
    index,
    startSeconds: rawClip.startSeconds ?? rawClip.start_seconds ?? null,
    endSeconds: rawClip.endSeconds ?? rawClip.end_seconds ?? null,
    s3Key: rawClip.s3Key ?? rawClip.s3_key ?? null,
    scriptText: rawClip.scriptText ?? rawClip.script_text ?? null,
    language: rawClip.language ?? null,
    youtubeTitle: rawClip.youtubeTitle ?? rawClip.youtube_title ?? null,
    youtubeDescription:
      rawClip.youtubeDescription ?? rawClip.youtube_description ?? null,
    youtubeHashtags:
      rawClip.youtubeHashtags ?? rawClip.youtube_hashtags ?? null,
  };
}

function normalizeBackendClips(clips: unknown): ProcessVideoBackendClip[] | undefined {
  if (!Array.isArray(clips)) {
    return undefined;
  }

  return clips
    .map(normalizeBackendClip)
    .filter((clip): clip is ProcessVideoBackendClip => clip !== null);
}

function applyModalPayload(args: {
  status: unknown;
  error?: unknown;
  clips?: unknown;
  source: "modal-response" | "modal-callback";
}) {
  modalCallbackReceived = true;

  if (!isSuccessfulModalStatus(args.status)) {
    backendFailureMessage = `Modal ${args.source} reported status "${String(args.status)}": ${toErrorMessage(
      args.error ?? "Unknown modal processing error",
    )}`;
    return;
  }

  backendClips = normalizeBackendClips(args.clips);
}

if (shouldWaitForCallback && !callbackUrl) {
  throw new Error(
    "Modal accepted async processing, but NEXT_PUBLIC_SITE_URL is not configured for callbacks",
  );
}

if (!shouldWaitForCallback) {
  applyModalPayload({
    status: modalResponse.status,
    error: modalResponse.error,
    clips: modalResponse.clips,
    source: "modal-response",
  });
}

for (
  let pollAttempt = 1;
  pollAttempt <= MODAL_RESULT_MAX_POLLS;
  pollAttempt++
) {
  if (shouldWaitForCallback && !modalCallbackReceived) {
    const waitStepId =
      pollAttempt === 1
        ? "wait-for-modal-result"
        : `wait-for-modal-result-${pollAttempt}`;

    const modalResult = await step.waitForEvent(waitStepId, {
      event: "modal/video.processed",
      match: "data.matchKey",
      timeout: MODAL_RESULT_POLL_INTERVAL,
    });

    if (modalResult) {
      applyModalPayload({
        status: modalResult.data.status,
        error: modalResult.data.error,
        clips: modalResult.data.clips,
        source: "modal-callback",
      });
    }
  } else if (pollAttempt > 1) {
    await step.sleep(
      `wait-for-generated-clips-${pollAttempt}`,
      MODAL_RESULT_POLL_INTERVAL,
    );
  }

  generatedClipCount = await step.run(
    `check-generated-clips-${pollAttempt}`,
    async () => countGeneratedClipKeys(outputPrefix),
  );

  if (generatedClipCount >= clipCount) {
    if (!modalCallbackReceived) {
      const metadataResult = await step.waitForEvent(
        "wait-for-modal-metadata-after-s3-complete",
        {
          event: "modal/video.processed",
          match: "data.matchKey",
          timeout: MODAL_METADATA_GRACE_INTERVAL,
        },
      );

      if (metadataResult) {
        applyModalPayload({
          status: metadataResult.data.status,
          error: metadataResult.data.error,
          clips: metadataResult.data.clips,
          source: "modal-callback",
        });
      }
    }

    generatedClipsDetected = true;
    break;
  }

  if (backendFailureMessage) {
    break;
  }
}

if (!generatedClipsDetected && !backendFailureMessage) {
  console.warn("Timed out before expected generated clips were detected", {
    uploadedFileId,
    attempt,
    generatedClipCount,
    expectedClipCount: clipCount,
  });
}
```

`step.sleep`는 Inngest step API를 사용한다. 현재 설치된 `inngest` 타입에는 `sleep(idOrOptions, time)`이 존재하므로 이 repo 기준으로 사용 가능하다. 그래도 구현 후 `npm run typecheck`로 확인한다.

위 구조에서 `backendFailureMessage`가 설정돼도 `generatedClipCount >= clipCount`이면 `generatedClipsDetected = true`가 되므로 산출물 성공으로 처리된다. 반대로 Modal failure 응답 또는 failure callback을 받았고 S3 count가 부족하면 loop를 종료하고 최종 count 검증에서 실패 처리한다. polling timeout만 발생한 경우에는 `backendFailureMessage`를 설정하지 않고, 최종 `clipsFound`에 따라 `no_clips_generated` 또는 `incomplete_clips_generated`로 마감한다.

주의:

- 기존 `else if (isSuccessfulModalStatus(modalResponse.status)) { backendClips = ... }` 경로는 제거한다. 동기 success도 `applyModalPayload` 후 S3 polling 검증으로 들어가야 한다.
- 기존 `else { backendFailureMessage = ... }` 경로도 즉시 최종 처리로 가지 않는다. 동기 failure도 S3 count를 한 번 이상 확인해야 "failure지만 산출물은 완성됨" 케이스를 살릴 수 있다.
- 기존 `if (modalResponse.status === "accepted" && !callbackUrl) throw ...` guard는 유지한다.
- 동기 `modalResponse.clips`와 callback `modalResult.data.clips`는 `normalizeBackendClips`를 통과시킨다. webhook route는 이미 snake_case를 normalize하지만, 동기 Modal 응답은 `src/inngest/functions.ts`에서 직접 처리하므로 별도 normalization이 필요하다.

### 5-6. 최종 저장 후 count 검증 추가

파일: `src/inngest/functions.ts`

현재:

```ts
if (clipsFound === 0) {
  await step.run("mark-no-clips-generated", async () => {
    await markUploadedFileAttemptFailed(
      uploadedFileId,
      attempt,
      "no_clips_generated",
      {
        now: new Date(),
        statuses: ["processing"],
      },
    );
  });

  return { skipped: false, status: "no_clips_generated" };
}

await step.run("deduct-credits", async () => {
  await decrementUserCreditsFloorZero(context.userId, clipsFound);
});

await step.run("mark-processed", async () => {
  await markUploadedFileAttemptProcessed(uploadedFileId, attempt, {
    now: new Date(),
  });
});
```

변경:

```ts
if (backendFailureMessage && clipsFound >= clipCount) {
  console.warn(
    "Modal reported failure after expected clips were generated",
    backendFailureMessage,
  );
}

if (backendFailureMessage && clipsFound === 0) {
  throw new Error(backendFailureMessage);
}

if (clipsFound === 0) {
  await step.run("mark-no-clips-generated", async () => {
    await markUploadedFileAttemptFailed(
      uploadedFileId,
      attempt,
      "no_clips_generated",
      {
        now: new Date(),
        statuses: ["processing"],
      },
    );
  });

  return { skipped: false, status: "no_clips_generated" };
}

if (clipsFound < clipCount) {
  await step.run("mark-incomplete-clips-generated", async () => {
    await markUploadedFileAttemptFailed(
      uploadedFileId,
      attempt,
      "incomplete_clips_generated",
      {
        now: new Date(),
        statuses: ["processing"],
      },
    );
  });

  return {
    skipped: false,
    status: "incomplete_clips_generated",
    clipsFound,
    expectedClips: clipCount,
  };
}

await step.run("deduct-credits", async () => {
  await decrementUserCreditsFloorZero(context.userId, clipsFound);
});

await step.run("mark-processed", async () => {
  await markUploadedFileAttemptProcessed(uploadedFileId, attempt, {
    now: new Date(),
  });
});
```

주의:

- 이 검증은 polling을 충분히 수행한 뒤의 최종 방어선이다.
- `clipsFound < clipCount`를 즉시 실패시키면 늦게 생성되는 clip을 놓칠 수 있으므로, 5-5의 polling 강화와 함께 적용해야 한다.
- `backendFailureMessage && clipsFound >= clipCount`는 산출물 성공으로 처리한다. 현재 schema에는 warning 필드가 없으므로 우선 log만 남긴다.
- `backendFailureMessage && clipsFound === 0`은 기존 catch 경로를 타게 해서 `backend_failed`로 마감한다.
- 이 `backendFailureMessage`는 Modal이 명시적으로 failure callback을 보낸 경우에만 설정한다. polling timeout에는 설정하지 않는다.
- `backendFailureMessage && 0 < clipsFound < clipCount`는 `incomplete_clips_generated`로 마감한다.
- polling timeout 후 `clipsFound === 0`이면 `no_clips_generated`, `0 < clipsFound < clipCount`이면 `incomplete_clips_generated`가 된다.

### 5-7. 실패 라벨 추가

파일: `src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx`

현재:

```ts
case "no_clips_generated":
  return "No clips were generated";
```

추가:

```ts
case "incomplete_clips_generated":
  return "Only some clips were generated";
```

사용자에게 더 명확히 보여주려면 다음 문구도 가능하다.

```ts
return "Only some requested clips were generated";
```

### 5-8. late Modal webhook metadata reconciliation 추가

파일:

- `src/app/api/webhooks/modal/route.ts`
- `src/fsd/entities/clip/api/index.ts`

S3가 먼저 완성되어 `processVideo`가 S3-only clip을 저장한 뒤 Modal callback이 늦게 도착할 수 있다. 현재 webhook route는 Inngest event만 발행한다.

```ts
await inngest.send({
  name: "modal/video.processed",
  data: {
    uploadedFileId: body.uploadedFileId,
    attempt: body.attempt,
    matchKey: getProcessingMatchKey(body.uploadedFileId, body.attempt),
    status: body.status,
    clips: body.clips,
    error: body.error,
  },
});
```

`processVideo` run이 이미 종료된 뒤에는 이 event를 기다리는 consumer가 없을 수 있다. 따라서 webhook route에서 best-effort로 기존 `Clip` row metadata를 update해야 한다.

`src/fsd/entities/clip/api/index.ts`에 helper 추가:

```ts
type ClipMetadataPatch = {
  s3Key?: string | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
  scriptText?: string | null;
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  youtubeHashtags?: string[] | null;
};

function getClipMetadataUpdateData(
  clip: ClipMetadataPatch,
): Prisma.ClipUpdateManyMutationInput {
  return {
    ...(clip.startSeconds != null ? { startSeconds: clip.startSeconds } : {}),
    ...(clip.endSeconds != null ? { endSeconds: clip.endSeconds } : {}),
    ...(clip.scriptText != null ? { scriptText: clip.scriptText } : {}),
    ...(clip.youtubeTitle != null ? { youtubeTitle: clip.youtubeTitle } : {}),
    ...(clip.youtubeDescription != null
      ? { youtubeDescription: clip.youtubeDescription }
      : {}),
    ...(clip.youtubeHashtags != null
      ? { youtubeHashtags: JSON.stringify(clip.youtubeHashtags) }
      : {}),
  };
}

export async function updateClipMetadataFromBackendClips(
  args: {
    uploadedFileId: string;
    processingAttempt: number;
    clips: ClipMetadataPatch[];
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  let updated = 0;

  for (const clip of args.clips) {
    if (typeof clip.s3Key !== "string" || clip.s3Key.length === 0) {
      continue;
    }

    const data = getClipMetadataUpdateData(clip);

    if (Object.keys(data).length === 0) {
      continue;
    }

    const result = await getClient(options?.tx).clip.updateMany({
      where: {
        uploadedFileId: args.uploadedFileId,
        processingAttempt: args.processingAttempt,
        s3Key: clip.s3Key,
      },
      data,
    });

    updated += result.count;
  }

  return { updated };
}
```

주의:

- late reconciliation은 기존 row를 update만 한다. 새 `Clip` row를 생성하지 않는다. 생성은 `processVideo`의 S3 실존 기준 persist가 담당한다.
- callback이 null을 보내는 필드는 기존 DB 값을 덮어쓰지 않는다.
- 이 helper는 `server-only` entity module에 둘 수 있다. `src/app/api/webhooks/modal/route.ts`는 server route이므로 import 가능하다.
- 이 helper는 `src/fsd/entities/clip/index.ts`에서도 export한다. `processVideo`와 webhook route가 `~/fsd/entities/clip` barrel import를 쓰면 export 누락이 곧 typecheck 실패가 된다.

webhook route 적용:

```ts
await inngest.send({ ... });

if (body.clips && body.clips.length > 0) {
  try {
    await updateClipMetadataFromBackendClips({
      uploadedFileId: body.uploadedFileId,
      processingAttempt: body.attempt,
      clips: body.clips,
    });
  } catch (error) {
    console.error("Failed to reconcile modal clip metadata", error);
  }
}
```

이 reconciliation 실패가 webhook 응답을 실패로 만들 필요는 없다. Inngest event delivery가 더 중요하므로 event send 후 best-effort로 처리한다.

### 5-9. Modal webhook index normalization 보강

파일: `src/app/api/webhooks/modal/route.ts`

현재 `normalizeClip`은 `index`가 number가 아니면 clip 전체를 버린다.

```ts
if (typeof rawClip.index !== "number") {
  return null;
}
```

backend가 `index: "0"`처럼 numeric string을 보내면 `s3Key`와 metadata가 모두 유실되고, 이후 S3 fallback으로 video만 복구된다. 이 경우 DB에는 clip은 생기지만 metadata가 null이 될 수 있다.

변경 방향:

```ts
interface RawModalWebhookClip {
  index?: number | string;
  startSeconds?: number | null;
  start_seconds?: number | null;
  endSeconds?: number | null;
  end_seconds?: number | null;
  s3Key?: string | null;
  s3_key?: string | null;
  scriptText?: string | null;
  script_text?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtube_title?: string | null;
  youtubeDescription?: string | null;
  youtube_description?: string | null;
  youtubeHashtags?: string[] | null;
  youtube_hashtags?: string[] | null;
}

function toClipIndex(index: unknown): number | null {
  if (typeof index === "number" && Number.isInteger(index) && index >= 0) {
    return index;
  }

  if (typeof index === "string") {
    const normalized = index.trim();

    if (!/^\d+$/.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}

function normalizeClip(rawClip: RawModalWebhookClip): ModalWebhookClip | null {
  const index = toClipIndex(rawClip.index);

  if (index === null) {
    return null;
  }

  return {
    index,
    startSeconds: rawClip.startSeconds ?? rawClip.start_seconds ?? null,
    endSeconds: rawClip.endSeconds ?? rawClip.end_seconds ?? null,
    s3Key: rawClip.s3Key ?? rawClip.s3_key ?? null,
    scriptText: rawClip.scriptText ?? rawClip.script_text ?? null,
    language: rawClip.language ?? null,
    youtubeTitle: rawClip.youtubeTitle ?? rawClip.youtube_title ?? null,
    youtubeDescription:
      rawClip.youtubeDescription ?? rawClip.youtube_description ?? null,
    youtubeHashtags:
      rawClip.youtubeHashtags ?? rawClip.youtube_hashtags ?? null,
  };
}
```

이 변경은 완료 판정 자체를 바꾸지는 않지만, callback metadata 보존율을 높인다.

`Number.parseInt`는 `"1abc"`를 `1`로 파싱하므로 사용하지 않는다. webhook의 `attempt` normalization도 같은 원칙으로 `/^\d+$/` 검증 후 `Number()`를 사용한다.

`attempt` strict normalization 예:

```ts
function toPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();

    if (!/^\d+$/.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function normalizeBody(rawBody: RawModalWebhookBody): NormalizedModalWebhookBody | null {
  const uploadedFileId = rawBody.uploadedFileId ?? rawBody.uploaded_file_id;
  const attempt = toPositiveInteger(rawBody.attempt);

  if (
    typeof uploadedFileId !== "string" ||
    uploadedFileId.length === 0 ||
    attempt === null ||
    typeof rawBody.status !== "string" ||
    rawBody.status.length === 0
  ) {
    return null;
  }

  return {
    uploadedFileId,
    attempt,
    status: rawBody.status,
    clips: Array.isArray(rawBody.clips)
      ? rawBody.clips
          .map(normalizeClip)
          .filter((clip): clip is ModalWebhookClip => clip !== null)
      : undefined,
    error: toWebhookErrorMessage(rawBody.error),
  };
}
```

### 5-10. 문서 정정

파일: `CLAUDE.md`

현재 문서에는 다음과 같은 표현이 있다.

```txt
Generated clips: `{userId}/{uuid}/clip_{n}.mp4`
```

현재 구현 기준으로는 다음이 정확하다.

```txt
Generated clips: `{uploadPrefix}/attempt-{attempt}/clip_{index}.mp4`
```

예:

```txt
0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/clip_0_kr.mp4
```

---

## 6. 기존 장애 데이터 backfill 방안

이미 S3에는 존재하지만 DB에 누락된 clip은 별도 backfill이 필요하다.

대상 케이스:

```txt
uploadedFileId: cmofdtqc20001l504q5giidrg
userId:         cmn36ae4h0000si6g7pb4k3w1
attempt:        1
prefix:         0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/
```

### 6-1. 일회성 backfill script 예시

아래는 제안용 script다. 실제 실행 전에는 dry-run으로 출력만 확인한다.
backfill도 `targetClipCount`로 cap해서 과거/예외 S3 object가 목표 개수보다 많아도 UI count와 credit 정책이 흔들리지 않도록 한다.
기존 DB에 이미 `targetClipCount`를 초과하는 row가 있으면 dashboard와 상세 페이지는 현재 DB row 수를 그대로 세므로, `surplusExistingKeys`를 dry-run에서 확인한 뒤 명시적으로 정리해야 한다. 자동 삭제는 위험하므로 `DELETE_SURPLUS=true`와 `CONFIRM_DELETE_SURPLUS="<uploadedFileId>:<attempt>"`가 모두 맞고, S3 listing이 목표 개수 이상 확인된 경우에만 수행한다.
이 script는 앱의 `src/env.js`를 통하지 않는 standalone 실행이므로 DB/AWS/S3 env를 직접 검증한다. `BACKFILL_OUTPUT_PREFIX`는 trailing slash 유무와 관계없이 `<prefix>/` 형태로 정규화한 뒤, DB의 `UploadedFile.s3Key`와 `BACKFILL_ATTEMPT`로 계산한 expected prefix와 반드시 일치해야 한다.

```js
// scripts/backfill-clips-from-s3-prefix.mjs
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma/index.js";

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Required env: ${name}`);
  }

  return value;
}

function parsePositiveIntegerEnv(name) {
  const rawValue = requireEnv(name).trim();

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

const uploadedFileId = requireEnv("BACKFILL_UPLOADED_FILE_ID");
const attempt = parsePositiveIntegerEnv("BACKFILL_ATTEMPT");
const rawPrefix = requireEnv("BACKFILL_OUTPUT_PREFIX");
const prefix = rawPrefix.endsWith("/") ? rawPrefix : `${rawPrefix}/`;
const dryRun = process.env.DRY_RUN !== "false";
const databaseUrl = requireEnv("DATABASE_URL");
const awsRegion = requireEnv("AWS_REGION");
const awsAccessKeyId = requireEnv("AWS_ACCESS_KEY_ID");
const awsSecretAccessKey = requireEnv("AWS_SECRET_ACCESS_KEY");
const s3BucketName = requireEnv("S3_BUCKET_NAME");

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: databaseUrl }),
});

const s3 = new S3Client({
  region: awsRegion,
  credentials: {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  },
});

const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
  where: { id: uploadedFileId },
  select: {
    id: true,
    s3Key: true,
    userId: true,
    targetClipCount: true,
    lastSuccessfulAttempt: true,
  },
});

const uploadPrefix = uploadedFile.s3Key.split("/")[0] ?? uploadedFile.s3Key;
const expectedPrefix = `${uploadPrefix}/attempt-${attempt}/`;

if (prefix !== expectedPrefix) {
  throw new Error(
    `BACKFILL_OUTPUT_PREFIX mismatch. Expected ${expectedPrefix}, received ${prefix}`,
  );
}

const response = await s3.send(
  new ListObjectsV2Command({
    Bucket: s3BucketName,
    Prefix: prefix,
  }),
);

const clipKeys = (response.Contents ?? [])
  .map((object) => object.Key)
  .filter(
    (key) =>
      typeof key === "string" &&
      key.startsWith(`${prefix}clip_`) &&
      key.endsWith(".mp4"),
  )
  .sort();

const cappedClipKeys = clipKeys.slice(0, uploadedFile.targetClipCount);

const existing = await db.clip.findMany({
  where: {
    uploadedFileId,
    processingAttempt: attempt,
  },
  select: {
    s3Key: true,
  },
});

const existingKeys = new Set(existing.map((clip) => clip.s3Key));
const cappedKeySet = new Set(cappedClipKeys);
const missingKeys = cappedClipKeys.filter((key) => !existingKeys.has(key));
const surplusExistingKeys = existing
  .map((clip) => clip.s3Key)
  .filter((key) => !cappedKeySet.has(key));
const deleteSurplus = process.env.DELETE_SURPLUS === "true";
const expectedDeleteConfirmation = `${uploadedFileId}:${attempt}`;
const deleteConfirmation = process.env.CONFIRM_DELETE_SURPLUS;
const canDeleteSurplus =
  !dryRun &&
  deleteSurplus &&
  deleteConfirmation === expectedDeleteConfirmation &&
  clipKeys.length > 0 &&
  cappedClipKeys.length === uploadedFile.targetClipCount;

console.log(
  JSON.stringify(
    {
      dryRun,
      uploadedFile,
      expectedPrefix,
      clipKeys,
      cappedClipKeys,
      existingCount: existing.length,
      missingKeys,
      surplusExistingKeys,
      deleteSurplus,
      expectedDeleteConfirmation,
      deleteConfirmation,
      canDeleteSurplus,
    },
    null,
    2,
  ),
);

if (!dryRun && missingKeys.length > 0) {
  const result = await db.clip.createMany({
    data: missingKeys.map((s3Key) => ({
      s3Key,
      uploadedFileId,
      userId: uploadedFile.userId,
      processingAttempt: attempt,
    })),
    skipDuplicates: true,
  });

  console.log({ inserted: result.count });
}

if (deleteSurplus && !canDeleteSurplus) {
  console.warn(
    "DELETE_SURPLUS requested but blocked. Require dryRun=false, matching CONFIRM_DELETE_SURPLUS, non-empty S3 listing, and full targetClipCount listing.",
  );
}

if (canDeleteSurplus && surplusExistingKeys.length > 0) {
  const result = await db.clip.deleteMany({
    where: {
      uploadedFileId,
      processingAttempt: attempt,
      s3Key: {
        in: surplusExistingKeys,
      },
    },
  });

  console.log({ deletedSurplus: result.count });
}

await db.$disconnect();
```

실행 예:

```bash
BACKFILL_UPLOADED_FILE_ID=cmofdtqc20001l504q5giidrg \
BACKFILL_ATTEMPT=1 \
BACKFILL_OUTPUT_PREFIX=0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/ \
DRY_RUN=true \
DELETE_SURPLUS=false \
CONFIRM_DELETE_SURPLUS= \
node --env-file=.env scripts/backfill-clips-from-s3-prefix.mjs
```

확인 후 실제 반영:

```bash
BACKFILL_UPLOADED_FILE_ID=cmofdtqc20001l504q5giidrg \
BACKFILL_ATTEMPT=1 \
BACKFILL_OUTPUT_PREFIX=0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/ \
DRY_RUN=false \
DELETE_SURPLUS=false \
CONFIRM_DELETE_SURPLUS= \
node --env-file=.env scripts/backfill-clips-from-s3-prefix.mjs
```

초과 DB row가 dry-run에서 확인됐고, 해당 row가 현재 attempt의 capped S3 결과에 포함되지 않는 것이 명확하면 별도 승인 후 `DELETE_SURPLUS=true`와 `CONFIRM_DELETE_SURPLUS="<uploadedFileId>:<attempt>"`를 함께 지정해 정리한다. 예:

```bash
BACKFILL_UPLOADED_FILE_ID=cmofdtqc20001l504q5giidrg \
BACKFILL_ATTEMPT=1 \
BACKFILL_OUTPUT_PREFIX=0c47ca5d-3c86-43da-a8c1-1dae734d5510/attempt-1/ \
DRY_RUN=false \
DELETE_SURPLUS=true \
CONFIRM_DELETE_SURPLUS=cmofdtqc20001l504q5giidrg:1 \
node --env-file=.env scripts/backfill-clips-from-s3-prefix.mjs
```

### 6-2. credit 보정

현재 장애 케이스는 DB에 1개만 저장된 시점에 `decrementUserCreditsFloorZero(context.userId, clipsFound)`가 실행됐을 가능성이 높다. 즉 4개 생성에 대해 1 credit만 차감됐을 수 있다.

정책 선택이 필요하다.

| 선택 | 설명 |
|---|---|
| 추가 차감함 | 누락 3개 backfill 후 user credits를 3 더 차감한다. clip당 credit 과금 정책과 일관됨. |
| 추가 차감하지 않음 | 장애 보상으로 간주한다. 사용자 경험 측면에서 안전함. |

자동 backfill script에 credit 차감을 포함하지 않는 것을 권장한다. 데이터 복구와 과금/credit 보정은 별도 명시 승인 후 실행해야 한다.

### 6-3. metadata 복구 한계

S3 listing으로 backfill하면 다음 필드는 복구되지 않는다.

- `startSeconds`
- `endSeconds`
- `scriptText`
- `youtubeTitle`
- `youtubeDescription`
- `youtubeHashtags`

이 필드는 Modal callback payload에만 있다. callback payload를 로그에서 복구할 수 없다면 backfill된 clip은 video 재생만 가능하고 metadata는 비어 있게 된다.

---

## 7. 검증 계획

### 7-1. Unit-level 검증

`src/inngest/functions.ts`의 helper를 직접 unit test하기 어렵다면, 최소한 pure helper로 분리해서 검증한다.

권장 분리:

```ts
function hasExpectedClipCount(found: number, expected: number): boolean {
  return found >= expected;
}
```

테스트 케이스:

| found | expected | 결과 |
|---:|---:|---|
| 0 | 4 | false |
| 1 | 4 | false |
| 3 | 4 | false |
| 4 | 4 | true |
| 5 | 4 | true |

### 7-2. Integration 시나리오

#### 시나리오 A: callback 없음, S3 순차 생성

조건:

- `clipCount = 4`
- polling 1회차 현재 attempt `outputPrefix/` S3 count = 1
- polling 2회차 현재 attempt `outputPrefix/` S3 count = 2
- polling 3회차 현재 attempt `outputPrefix/` S3 count = 4

기대:

- 1회차에 `processed`로 마감하지 않는다.
- 3회차 이후 DB에 4개 저장한다.
- `lastSuccessfulAttempt = attempt`
- dashboard `visibleClipsCount = 4`

#### 시나리오 B: callback이 일부 clips만 포함

조건:

- callback `clips.length = 1`
- 현재 attempt `outputPrefix/` S3에는 4개 존재

기대:

- callback 1개만 저장하고 return하지 않는다.
- S3 listing 결과 4개와 merge한다.
- DB에 4개 저장한다.
- callback에 있던 1개는 metadata 유지, S3-only 3개는 metadata null.

#### 시나리오 C: callback 성공, S3도 일부만 존재

조건:

- `clipCount = 4`
- callback clips = 4
- 현재 attempt `outputPrefix/` S3 count = 1
- timeout까지 4개 미도달

기대:

- `processed`로 마감하지 않는다.
- callback count만으로 완료 처리하지 않는다.
- 최종 `failed`
- `failureCode = incomplete_clips_generated`
- credit 차감 없음.

#### 시나리오 D: clip 0개

조건:

- timeout까지 callback 없음
- S3 count = 0

기대:

- 기존과 동일하게 `failureCode = no_clips_generated`

#### 시나리오 E: reprocess attempt 분리

조건:

- attempt 1 성공, 4개
- reprocess attempt 2 성공, 4개

기대:

- S3 경로가 각각 `attempt-1/`, `attempt-2/`로 분리된다.
- `lastSuccessfulAttempt = 2`
- UI에는 attempt 2의 4개만 보인다.
- attempt 1 clip은 DB에 남아 있어도 visible count에 포함되지 않는다.

#### 시나리오 F: root stale clip 존재

조건:

- root에 legacy `uploadedFilePrefix/clip_*.mp4` 4개 존재
- attempt 2의 `outputPrefix/`에는 아직 0개
- `clipCount = 4`

기대:

- root clip 4개를 보고 attempt 2를 `processed`로 마감하지 않는다.
- 완료 판정은 attempt 2 `outputPrefix/`만 기준으로 한다.

#### 시나리오 G: backend가 목표보다 많은 clip 생성

조건:

- `clipCount = 4`
- 현재 attempt `outputPrefix/` S3 count = 5

기대:

- 정렬된 S3 key 중 최대 4개만 DB에 저장한다.
- credit은 4개 이하로만 차감한다.
- dashboard `visibleClipsCount`는 4를 넘지 않는다.

#### 시나리오 H: S3가 callback보다 먼저 완료

조건:

- `clipCount = 4`
- 현재 attempt `outputPrefix/` S3 count = 4
- callback은 아직 없음
- metadata grace wait 안에 callback 도착

기대:

- 즉시 S3-only로 저장하지 않고 grace wait를 수행한다.
- callback이 grace wait 안에 도착하면 metadata를 포함해 DB에 저장한다.
- YouTube metadata modal과 script modal에서 metadata가 표시된다.

#### 시나리오 I: callback이 grace window 이후 늦게 도착

조건:

- `clipCount = 4`
- 현재 attempt `outputPrefix/` S3 count = 4
- metadata grace wait 안에는 callback 없음
- `processed` 이후 callback 도착

기대:

- S3-only clip 4개가 먼저 DB에 저장되고 `processed`가 된다.
- late Modal webhook이 도착하면 기존 `Clip` row metadata가 best-effort update된다.
- webhook reconciliation 실패가 webhook response 실패로 이어지지는 않는다.

#### 시나리오 J: failure callback과 S3 산출물 동시 존재

조건:

- Modal callback status = failure
- 현재 attempt `outputPrefix/` S3 count = 4
- `clipCount = 4`

기대:

- 산출물 성공으로 보고 DB에 4개를 저장한다.
- `processed`로 마감한다.
- failure message는 log로 남긴다.

#### 시나리오 K: failure callback과 partial S3 산출물

조건:

- Modal callback status = failure
- 현재 attempt `outputPrefix/` S3 count = 2
- `clipCount = 4`

기대:

- `processed`로 마감하지 않는다.
- `failureCode = incomplete_clips_generated`로 실패 처리한다.

### 7-3. 수동 검증

1. 새 파일 업로드
2. clip count 4 선택
3. Modal backend가 clip을 순차 업로드하도록 실행
4. 첫 clip만 올라온 시점에 `/dashboard`가 `processed`로 바뀌지 않는지 확인
5. 4개가 모두 올라온 뒤 `processed`로 바뀌는지 확인
6. detail page에서 4개 clip이 모두 표시되는지 확인
7. DB 확인:

```sql
SELECT "s3Key", "processingAttempt"
FROM "Clip"
WHERE "uploadedFileId" = '<uploadedFileId>'
ORDER BY "s3Key";
```

8. S3 확인:

```txt
<uploadPrefix>/attempt-<attempt>/clip_*.mp4
```

S3 clip 수가 `clipCount` 이하이면 DB row 수와 S3 clip 수가 일치해야 한다. S3 clip 수가 `clipCount`보다 많으면 DB row 수는 `clipCount`로 cap되어야 한다.

### 7-4. 빌드 검증

필수:

```bash
npm run typecheck
npm run build
```

가능하면 추가:

```bash
npm run lint
```

---

## 8. 리스크와 결정 사항

### 8-1. backend가 의도적으로 적은 clip을 반환하는 경우

현재 product UI는 사용자가 1~4개 clip count를 선택한다. 이 값은 요청한 목표 개수로 해석된다. 따라서 `clipCount = 4`인데 1개만 생성된 상태를 성공으로 보는 것은 사용자 기대와 맞지 않는다.

다만 향후 backend가 "소스 영상에서 충분한 하이라이트가 없어 2개만 생성" 같은 partial success를 명시적으로 지원하려면 callback schema에 별도 필드가 필요하다.

예:

```json
{
  "status": "partial_success",
  "requestedClipCount": 4,
  "generatedClipCount": 2,
  "clips": [...]
}
```

그 전까지는 `clipsFound < clipCount`를 incomplete failure로 보는 것이 안전하다.

### 8-2. 대기 시간이 길어질 수 있음

기존에는 첫 clip이 올라오면 즉시 완료되었으므로 UI가 빠르게 `processed`가 됐다. 수정 후에는 모든 clip이 올라올 때까지 `processing` 상태가 유지된다.

이것은 의도한 변경이다. 실제 결과가 불완전한데 성공으로 보이는 것보다 낫다.

### 8-3. credit 차감 시점

credit은 `processed` 직전에 차감된다. 수정 후 incomplete 상태에서는 차감하지 않는다.

정책상 partial clip도 사용자에게 보여주고 그 수만큼 차감하려면 별도 UX와 상태 모델이 필요하다. 현재 제안 범위에서는 partial 결과를 성공으로 노출하지 않는다.

### 8-4. Inngest step id 안정성

loop 안에서 추가되는 step은 deterministic한 id를 써야 한다.

좋은 예:

```ts
`wait-for-generated-clips-${pollAttempt}`
`check-generated-clips-${pollAttempt}`
```

나쁜 예:

```ts
`check-generated-clips-${Date.now()}`
```

Inngest step replay 안정성을 위해 runtime 값으로 step id를 만들지 않는다.

---

## 9. 적용 순서

1. `src/fsd/entities/clip/api/index.ts`
   - `countClipsByUploadedFileAttemptS3Keys` 추가
   - `updateClipMetadataFromBackendClips` 추가
2. `src/fsd/entities/clip/index.ts`
   - 새로 추가한 `countClipsByUploadedFileAttemptS3Keys`, `updateClipMetadataFromBackendClips` barrel export 추가
3. `src/inngest/functions.ts`
   - S3 listing helper를 attempt-only로 정리하고 legacy-root 로직은 backfill script로 이동
   - `getUploadedFilePrefix` import와 `uploadedFilePrefix` 지역 변수 제거
   - 완료 판정용 count는 현재 attempt `outputPrefix/`만 보도록 변경
   - `persistGeneratedClips`를 backend clips + attempt S3 listing merge 방식으로 변경
   - `createMany(..., skipDuplicates: true)` 후 기존 row metadata도 update
   - persist 대상과 credit count를 `clipCount`로 cap
   - S3 fallback 완료 조건을 `generatedClipCount >= clipCount`로 변경
   - callback success와 동기 success 응답 모두 현재 attempt S3 object가 expected count에 도달할 때까지 polling
   - 동기 failure 응답도 현재 attempt S3 count를 확인한 뒤 성공/실패 정책 적용
   - `accepted` 응답인데 `callbackUrl`이 없으면 기존처럼 즉시 throw
   - 동기 Modal 응답과 callback clip payload 모두 `normalizeBackendClips`로 camelCase 정규화
   - S3가 먼저 완성되고 callback이 없으면 metadata grace wait 수행
   - failure callback은 현재 attempt S3 count 기준 정책에 따라 처리
   - 최종 `clipsFound < clipCount` 방어 조건 추가
4. `src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx`
   - `incomplete_clips_generated` failure label 추가
5. `src/app/api/webhooks/modal/route.ts`
   - numeric string `index`도 strict integer로 normalize할 수 있도록 보강
   - `attempt` normalization도 `parseInt` 대신 `/^\d+$/` 검증 후 `Number()` 사용
   - event send 이후 best-effort late metadata reconciliation 실행
6. `CLAUDE.md`
   - generated clips 경로 문서 정정
7. 기존 장애 데이터 backfill
   - standalone script에서 `DATABASE_URL`, AWS credential, `S3_BUCKET_NAME` env 검증
   - `BACKFILL_OUTPUT_PREFIX` trailing slash 정규화
   - `BACKFILL_OUTPUT_PREFIX`가 `UploadedFile.s3Key`와 attempt로 계산한 expected prefix와 일치하는지 검증
   - `BACKFILL_ATTEMPT`는 strict positive integer로 검증
   - dry-run으로 S3와 DB 차이 확인
   - 누락 `Clip` row insert
   - `surplusExistingKeys`가 있으면 capped result 밖의 초과 row 정리 여부를 별도 승인 후 결정
   - 초과 row 삭제는 `DELETE_SURPLUS=true`, `CONFIRM_DELETE_SURPLUS="<uploadedFileId>:<attempt>"`, non-empty/full S3 listing 조건을 모두 만족할 때만 수행
   - credit 보정 여부 별도 결정
8. 검증
   - `npm run typecheck`
   - `npm run build`
   - 실제 4 clip 처리 시나리오 확인

---

## 10. 완료 기준

이 작업은 아래 조건을 모두 만족하면 완료로 본다.

- `clipCount = 4` 작업에서 현재 attempt `outputPrefix/` S3에 1개만 생긴 시점에는 `UploadedFile.status`가 `processed`로 바뀌지 않는다.
- 현재 attempt `outputPrefix/` S3에 4개가 모두 생긴 뒤 DB `Clip` row도 4개가 된다.
- 대시보드 `visibleClipsCount`가 4로 표시된다.
- 상세 페이지에서 4개 clip이 모두 보인다.
- callback clips가 일부만 와도 S3 listing으로 누락 clip이 보강된다.
- callback clips가 충분해도 S3 object가 부족하면 `processed`로 마감하지 않는다.
- Modal 동기 success 응답도 현재 attempt S3 object가 `clipCount`개 이상 확인되기 전에는 `processed`로 마감하지 않는다.
- Modal 동기 failure 응답도 현재 attempt S3 object가 `clipCount`개 이상이면 산출물 성공으로 처리하고, 부족하면 실패로 처리한다.
- Modal `accepted` 응답에서 `NEXT_PUBLIC_SITE_URL`이 없어 callback을 받을 수 없는 경우 즉시 실패한다.
- 동기 Modal 응답과 callback clip payload의 snake_case 필드가 모두 camelCase로 정규화되어 metadata가 보존된다.
- S3 object가 callback보다 먼저 완성되면 metadata grace wait를 수행한다.
- `processed` 이후 늦게 도착한 callback은 기존 `Clip` row metadata를 best-effort로 보강한다.
- 이미 존재하는 동일 `s3Key` row가 `createMany(..., skipDuplicates: true)`로 skip되어도 backend metadata가 update된다.
- failure callback이 와도 현재 attempt S3 clip이 `clipCount`개 이상 있으면 산출물 성공으로 처리한다.
- failure callback이 오고 현재 attempt S3 clip이 부족하면 실패로 처리한다.
- root `uploadedFilePrefix/clip_*.mp4` stale 파일은 새 attempt 완료 판정에 포함되지 않는다.
- backend가 `clipCount`보다 많은 clip을 만들어도 DB 저장과 credit 차감은 `clipCount`를 넘지 않는다.
- `clipsFound`는 전체 attempt DB row가 아니라 capped S3 key 집합에 해당하는 DB row만 기준으로 계산된다.
- 기존 장애 데이터 backfill 후 동일 attempt의 DB `Clip` row 수가 `targetClipCount`를 초과하지 않는다.
- 새 `Clip` helper들이 `src/fsd/entities/clip/index.ts`에서 export되어 barrel import typecheck가 통과한다.
- attempt-only 전환 후 `src/inngest/functions.ts`에 `getUploadedFilePrefix`/`uploadedFilePrefix` unused warning이 남지 않는다.
- timeout까지 0개가 생성되면 `no_clips_generated`, 일부만 생성되면 `incomplete_clips_generated`가 된다.
- webhook `index`와 `attempt`, backfill `BACKFILL_ATTEMPT`는 `parseInt`가 아니라 strict integer 검증 후 `Number()`로 변환한다.
- backfill script는 DB/AWS/S3 env를 실행 초기에 검증하고, `BACKFILL_OUTPUT_PREFIX` trailing slash를 정규화한다.
- backfill script는 `BACKFILL_OUTPUT_PREFIX`가 해당 `UploadedFile.s3Key`와 attempt에서 계산한 expected prefix와 다르면 중단한다.
- backfill S3 filter는 정확히 `${prefix}clip_*.mp4` 형태의 object만 대상으로 한다.
- backfill의 초과 row 삭제는 explicit confirmation과 non-empty/full S3 listing guard 없이는 실행되지 않는다.
- `npm run typecheck`와 `npm run build`가 통과한다.
