# FEAT-28: 부분 성공 클립의 메타데이터를 사용자에게 전달 — web inngest가 `status: error` 콜백의 `clips`를 소비

agent: web-dev

## 현재 동작

- `processVideo`의 클로저 `applyModalPayload`(`src/inngest/functions.ts:471-487`)는 Modal 응답/콜백을 받아 상태를 판정한다. `!isSuccessfulModalStatus(args.status)`이면 `backendFailureMessage`만 세우고 **`return`으로 즉시 빠져나가며**(`:479-483`), 그 아래의 `backendClips = normalizeBackendClips(args.clips)`(`:486`)에 **도달하지 못한다.** 즉 실패 상태 콜백에서는 `backendClips`가 초기값 `undefined`(`:464`)로 남는다.
- 폴링 루프는 `resolveModalPollAction`에 `backendClipCount: backendClips?.length ?? null`(`:546`)을 넘긴다. 실패 상태에서는 이 값이 `null`이다. `resolveModalPollAction`(`src/fsd/entities/uploaded-file/model/clip-generation-outcome.ts:36-70`)은 `hasBackendFailure`가 true면 "settle" 분기(`:55-63`, `!hasBackendFailure` 요구)를 건너뛰고 `generatedClipCount >= clipCount`이면 "detected"(`:51`), 아니면 "failed"(`:65-67`)를 돌린다.
- 최종 저장은 `persistGeneratedClips`(`:183-277`)가 한다. `backendClips`가 배열이면 s3Key가 S3 실재 키(`allowedClipKeys`, `expectedClipCount`로 캡)에 포함된 클립을 **메타데이터를 담은 create 행**으로 만들고(`createDataByS3Key.set(...)`, `:215-232`), 나머지 S3 키는 **맨행**(s3Key·uploadedFileId·userId·processingAttempt만)으로 만든다(`:241-246`). `backendClips`가 `undefined`면 전부 맨행이 된다.
- 웹훅 경로 A(`src/app/api/webhooks/modal/route.ts:269-279`)는 `modal/video.processed` 수신 즉시 `updateClipMetadataFromBackendClips`(updateMany)를 부르지만, 이는 `persistGeneratedClips`가 행을 만들기 **전에** 돌아 대상 행이 없어 0건 갱신이다(BUG-05 폴링이 행 생성을 Inngest 스텝 종반부로 미루기 때문).
- 부분 성공(실패 + `clipsFound > 0`) 경로는 `:643`에서 경고 로그만 남기고 계속 진행해 `completeUploadedFileProcessingAttempt`(`:692-708`)에 도달한다. 그 함수는 `decrementUserCreditsFloorZero(userId, clipsFound)`(`src/fsd/entities/uploaded-file/api/index.ts:827`)로 **전달된 클립 수만큼만** 크레딧을 차감하고, `resolvePartialClipNoteCode`(`clip-generation-outcome.ts:18-32`)로 `PARTIAL_CLIPS_AFTER_BACKEND_ERROR` 노트를 남긴다.
- `ClipCard`(`src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx:41-57`)는 Clip 행의 `scriptText`·`youtubeTitle`·`hook`·`payoff`·`subtitleStatus`·`clipType`를 **상위 업로드의 성공/실패와 무관하게** 행 필드에서 직접 읽어 대본·YouTube 메타·근거 블록(`:105-121`)·자막 폴백 안내(`:99-104`)를 렌더한다.

## 문제

백엔드는 BUG-08(2026-08-29 배포) 이후 `status: error` 콜백에도 실패 시점까지 완성된 `clips`(제목·대본·hook·payoff·subtitleStatus 포함)를 싣는다. 그러나 web `applyModalPayload`가 실패 분기에서 `clips`를 읽기 전에 early return(`functions.ts:479-483`)하므로 `backendClips`가 `undefined`로 남고, `persistGeneratedClips`가 부분 클립을 **메타데이터 없는 맨행**(`:241-246`)으로만 만든다. 결과적으로 이미 S3에 오른 부분 성공 클립이 사용자 리포트에서 제목·대본·근거가 빈 채로 표시된다.

이것이 TASK_BACKLOG.md의 `source`가 지목한 문제이며, 「현재 동작」의 `파일:줄`과 일치한다. 크레딧 차감(`api/index.ts:827`)과 UX 렌더(`ClipCard.tsx:41-57`)는 이미 부분 클립을 올바로 다루고 있어(차감은 `clipsFound` 기준, 렌더는 행 필드 무조건 표시) 결함은 **오직 메타데이터가 행에 채워지지 않는 것** 하나로 좁혀진다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/inngest/functions.ts` | `applyModalPayload`에서 `backendClips = normalizeBackendClips(args.clips)`(`:486`) 한 줄을 실패 early return `if`(`:479`) **위로 이동** — 실패 상태에서도 부분 클립을 살리되 실패 판정(`backendFailureMessage`)은 그대로 유지 |
| `src/fsd/entities/uploaded-file/model/clip-generation-outcome.test.mjs` | `resolveModalPollAction` 불변식 회귀 테스트 추가 — `hasBackendFailure: true`일 때 `backendClipCount`가 비-null이어도 결정이 안 바뀜(실패는 여전히 "failed", 완전 검출은 "detected")을 잠근다 |

**area의 `apps/web/src/fsd/entities/clip`은 고치지 않는다.** 그 슬라이스의 `persistGeneratedClips`가 쓰는 `createClipsBulk`·`updateClipMetadataFromBackendClips`(`entities/clip/api/index.ts:14-125`)는 이미 `backendClips`를 받아 메타데이터를 저장하도록 되어 있어, `backendClips`만 채워지면 나머지는 기존 계약이 처리한다. `route.ts`도 고치지 않는다(그 경로 A의 조기 updateMany는 이 결함과 무관하며, 수정은 행 생성 시점의 metadata create로 닫힌다).

## 구현 스케치

`src/inngest/functions.ts` — `applyModalPayload` 본문. `backendClips = normalizeBackendClips(args.clips)` 한 줄을 early return `if` 위로 옮긴다.

before (`:477-486`):

```ts
        modalCallbackReceived = true;

        if (!isSuccessfulModalStatus(args.status)) {
          backendFailureMessage = `Modal ${args.source} reported status "${String(args.status)}": ${toErrorMessage(
            args.error ?? "Unknown modal processing error",
          )}`;
          return;
        }

        backendClips = normalizeBackendClips(args.clips);
```

after:

```ts
        modalCallbackReceived = true;

        // 성공·실패와 무관하게 부분 완성된 클립 메타데이터를 살린다.
        // applyModalPayload는 콜백당 1회만 호출되므로(backendClips 초기값 undefined)
        // 성공 경로 동작은 이전과 동일하고, 실패 상태에서만 backendClips가 새로 채워진다.
        // 실패 판정은 아래 backendFailureMessage로 그대로 유지된다.
        backendClips = normalizeBackendClips(args.clips);

        if (!isSuccessfulModalStatus(args.status)) {
          backendFailureMessage = `Modal ${args.source} reported status "${String(args.status)}": ${toErrorMessage(
            args.error ?? "Unknown modal processing error",
          )}`;
          return;
        }
```

`src/fsd/entities/uploaded-file/model/clip-generation-outcome.test.mjs` — `describe("resolveModalPollAction", ...)` 블록 안에 아래 두 케이스를 추가한다(기존 임포트·구조 그대로 사용). 값은 리터럴 그대로:

```mjs
  it("keeps failing when a failure callback also carries partial clips", () => {
    // FEAT-28: 실패 상태에서도 backendClips를 채우면 backendClipCount가 비-null이 된다.
    // hasBackendFailure=true면 settle 분기(!hasBackendFailure)를 타지 않고 여전히 failed여야 한다.
    assert.equal(
      resolveModalPollAction({
        generatedClipCount: 1,
        clipCount: 3,
        modalCallbackReceived: true,
        hasBackendFailure: true,
        backendClipCount: 2,
      }),
      "failed",
    );
  });

  it("still detects a full S3 set on a failure callback with partial clips", () => {
    // 실패 콜백이라도 S3에 전량이 이미 있으면 detected가 우선한다(backendClipCount 무관).
    assert.equal(
      resolveModalPollAction({
        generatedClipCount: 3,
        clipCount: 3,
        modalCallbackReceived: true,
        hasBackendFailure: true,
        backendClipCount: 2,
      }),
      "detected",
    );
  });
```

## 테스트

- **덮는 것**: `resolveModalPollAction`의 실패-지배 불변식 — `hasBackendFailure: true`에서 `backendClipCount`가 비-null이 되어도 "settle"/"continue"로 새지 않고 "failed"(부분) 또는 "detected"(전량 검출)를 유지한다는 것. 이 함수는 이미 순수하며 `clip-generation-outcome.test.mjs`가 덮는다. 이 테스트가 이번 수정이 **의존하는** 불변식(실패 경로에 backendClips를 채워도 폴링 결정이 안 바뀜)을 잠근다.
- **못 덮는 범위**: `applyModalPayload`는 `processVideo` 안의 클로저이고 Inngest 스텝 머신·`step.waitForEvent`·`persistGeneratedClips`의 DB/S3 호출에 얽혀 있다. 현재 러너(`tsx --test`, DOM·React·DB·Inngest 하니스 없음)로는 실패 콜백이 실제로 `backendClips`를 채우고 그 결과 메타데이터 행이 생성되는 것까지는 구동할 수 없다. 그 종단 확인은 diff 대조(한 줄 이동) + 배포 후 실제 부분-실패 실행에서 클립 카드에 제목·대본·근거가 뜨는지 관측으로만 닫힌다(「범위 밖 의존」 아님 — 도구 부재이지 담당 범위 밖이 아니다).

## 범위 밖 의존

없음.

TASK_BACKLOG.md가 후보로 지목한 두 딸림 항목을 코드로 확인한 결과 이 수정에 딸려오지 않는다:

- **크레딧 정산(billing·entities/user)**: 부분-실패 경로는 이미 `completeUploadedFileProcessingAttempt`에 도달해 `decrementUserCreditsFloorZero(userId, clipsFound)`(`api/index.ts:827`)로 전달된 클립 수만큼만 차감한다. 메타데이터 부착은 생성되는 행의 **개수**(같은 S3 키, 같은 `cappedClipKeys`)를 바꾸지 않으므로 `clipsFound`가 불변이고, 따라서 크레딧 로직·`FEAT-01`에 닿지 않는다.
- **부분 전달 안내 UX**: 부분 클립의 메타데이터 전달은 `ClipCard`(`ClipCard.tsx:41-57`)가 행 필드를 무조건 렌더하므로 행에 값이 채워지면 자동 표시된다. "N개 중 M개만 생성됨" 같은 별도 안내 배너는 이 항목의 제목(메타데이터 전달)과 다른 별개 기능이며, 여기서 만들지 않는다.

## 대안

- **`applyModalPayload`를 순수 함수(`resolveModalPayloadOutcome`)로 추출해 model 레이어로 옮기고 테스트로 직접 덮기.** 그러려면 `normalizeBackendClips`·`normalizeBackendClip`·`isSuccessfulModalStatus`·`toErrorMessage`·`toStrictNonNegativeInteger`를 inngest 레이어에서 model로 옮겨야 하고, 성공 경로까지 건드리는 큰 리팩터가 된다. 실제 행위 변화는 한 줄 이동뿐이라 YAGNI에 어긋난다 — 채택하지 않고, 대신 이 수정이 의존하는 불변식을 기존 순수 함수 테스트로 잠근다.
- **`route.ts` 경로 A(webhook의 조기 `updateClipMetadataFromBackendClips`)를 행 생성 이후로 미뤄 실패 경로 메타데이터를 그쪽에서 채우기.** 경로 A는 웹훅 수신 시점에 돌아 행 생성(Inngest 스텝 종반)과 순서가 어긋나며, 순서를 맞추려면 웹훅·워커 간 조율이 필요해 복잡도가 크다. `applyModalPayload` 한 줄로 `persistGeneratedClips`가 생성 시점에 메타데이터를 담게 하는 편이 단순하고 성공 경로와 대칭적이다 — 채택하지 않는다.
