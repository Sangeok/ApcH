# BUG-05: 부분 생성 결과를 실패로 처리해 만들어진 클립을 버리는 문제

agent: web-dev

## 현재 동작

`processVideo` 워커는 요청 클립 수 `clipCount`(event.data, `functions.ts:289`)만큼 생성되길 폴링한다. `clipCount`의 출처는 디스패처다: auto/analyze 디스패치는 `targetClipCount`(`processing-dispatch/api/index.ts:216`, `:250`), render(검토) 디스패치는 선택된 draft 수 `renderMoments.length`(`:240`)다. **즉 render 모드에서는 `clipCount`가 `targetClipCount`보다 작을 수 있다.**

생성 감지 후 `persistGeneratedClips`(`functions.ts:573-585`)가 S3에 존재하는 클립을 `Clip` 레코드로 저장하고(`createClipsBulk`, `functions.ts:228`) `clipsFound = min(dbClipCount, expectedClipCount)`를 돌려준다. 이 저장은 **실패로 판정되기 전에 이미 일어난다** — 부분 클립은 DB에 남는다.

그 뒤 분기는 이렇다:

- `functions.ts:587-592` — `backendFailureMessage && clipsFound >= clipCount`: 경고만 남기고 완료로 진행.
- `functions.ts:594-596` — `backendFailureMessage && clipsFound === 0`: `throw` → catch(`:676-688`)가 `backend_failed`로 표시.
- `functions.ts:598-618` — 콜백 타임아웃 + `clipsFound === 0`: `callback_timeout`.
- `functions.ts:620-634` — `clipsFound === 0`: `no_clips_generated`.
- **`functions.ts:636-655` — `clipsFound < clipCount`(즉 1..clipCount-1): `markUploadedFileAttemptFailed(..., "incomplete_clips_generated")`.**
- `functions.ts:657-674` — 그 외(`clipsFound >= clipCount`): `completeUploadedFileProcessingAttempt`.

`completeUploadedFileProcessingAttempt`(`api/index.ts:800-824`)는 트랜잭션 안에서 `markUploadedFileAttemptProcessed`로 상태를 `processed`로 바꾸고 `lastSuccessfulAttempt = attempt`를 세운 뒤(`api/index.ts:721-741`), `decrementUserCreditsFloorZero(userId, clipsFound)`로 **생성된 수만큼** 차감한다(`user/api/index.ts:104-114`, `SET credits = GREATEST(credits - amount, 0)`).

반면 `markUploadedFileAttemptFailed`(`api/index.ts:826-857`)는 `status = "failed"` + `failureCode`만 쓰고, **`lastSuccessfulAttempt`를 갱신하지 않으며 크레딧도 건드리지 않는다.**

UI는 `getUploadedFileDetailsById`(`api/index.ts:413-424`)에서 `lastSuccessfulAttempt > 0`일 때 그 attempt의 클립만 조회한다. `failed` 경로는 `lastSuccessfulAttempt`를 그대로 두므로(대개 0), 저장된 부분 클립은 조회되지 않는다. 상세 페이지(`pages/upload-detail/ui/index.tsx:44`, `:112-115`)의 "Visible clips"는 이 빈 배열의 length라 0을 보여준다.

재처리는 `reprocessUploadedFile`이 `["processed", "failed", "no credits", "review_pending"]`에서 허용한다(`features/upload/api/index.ts:579-603`). 재스케줄 시 `failureCode`는 `null`로 초기화된다(`:155`). 같은 영상을 auto 모드로 다시 돌리면 같은 후보 → 같은 부분 결과 → 다시 `failed` → 여전히 0개.

상세 페이지는 이미 `failureCode`를 갖고 있고(`pages/upload-detail/ui/index.tsx:44`, `UploadedFileDetail.failureCode` in `uploaded-file/model/types.ts:33`), 라이브 폴링(`use-live-uploaded-file-detail.ts`)은 상세 전체를 다시 불러오므로 `failureCode` 변화가 그대로 반영된다.

참고로 처리 진입 게이트는 `functions.ts:364`의 `context.user.credits < clipCount`라 여전히 **full `clipCount`만큼의 크레딧을 선요구**한다. 이 게이트는 이 버그의 범위 밖이라 바꾸지 않는다.

### 재실행·동시성·과금 안전성 (기존 동작, 이 계획이 바꾸지 않음)

이 계획은 부분 결과를 **과금되는 완료 경로로 새로 흘려보내므로** 그 경로의 기존 안전장치를 확인해 둔다. 넷 다 이미 성립하며 이 계획은 어느 것도 건드리지 않는다.

- **재실행 안전성.** Inngest `retries: 1`(`functions.ts:265`)로 완료 step이 두 번 돌 수 있다. `completeUploadedFileProcessingAttempt`는 `markUploadedFileAttemptProcessed`의 `updateMany`가 `status: "processing"`을 요구하고, `updated.count !== 1`이면 **차감 전에** `{ completed: false }`로 빠져나간다(`api/index.ts:817-822`). 두 번째 실행은 상태가 이미 `processed`라 차감하지 않는다. `noteCode`는 같은 `updateMany`의 `data`에만 들어가므로 이 가드를 바꾸지 않는다.
- **중복 실행.** 유저당 동시성 1(account 스코프, `functions.ts:277-283`)로 직렬화되고, 뒤늦은 실행은 `isUploadedFileAttemptStillProcessing`(`functions.ts:562-571`)에서 `attempt_no_longer_active`로 조기 반환된다.
- **공유 집계(크레딧) 경합.** 차감은 애플리케이션 read-then-write가 아니라 단일 원자 UPDATE다 — `SET credits = GREATEST(credits - n, 0)`(`user/api/index.ts:109-113`). 진입 게이트(`:364`)의 읽고-나중에-쓰는 구간은 위 동시성 키가 같은 유저의 두 실행을 직렬화해 막는다.
- **과금 상한.** 새 경로가 차감하는 값은 `clipsFound`이고 부분 성공에서는 `clipsFound < clipCount`다. 게이트가 이미 `credits >= clipCount`를 요구했으므로 **차감액은 항상 게이트가 확보한 양 이하**다. 요청보다 많이 과금되는 경우는 없다.

### 폴링 루프의 조기 탈출 (concern 3)

Modal이 비동기로 접수하면(`modalResponse.status === "accepted"`, `functions.ts:448`) 워커는 `shouldWaitForCallback = true`로 콜백을 기다린다. 폴링 루프(`functions.ts:483-548`)는 `MODAL_RESULT_MAX_POLLS`(60, `:32`)회 돌며 매 회 콜백 이벤트를 기다리거나(`step.waitForEvent`, `:494-498`, 타임아웃 `MODAL_RESULT_POLL_INTERVAL` = 1m, `:31`) 이미 콜백을 받았으면 잔다(`step.sleep`, `:509-512`).

콜백이 오면 `applyModalPayload`(`:450-466`)가 `modalCallbackReceived = true`(`:456`)를 세우고, **성공 상태**면 `backendClips = normalizeBackendClips(args.clips)`(`:465`)를, **실패 상태**면 `backendFailureMessage`(`:459`)를 세운다. `backendClips`는 콜백의 `clips`가 배열이 아니면 `undefined`가 된다(`normalizeBackendClips`, `:142-152`; 웹훅은 `clips`를 생략할 수 있다 — `route.ts:193-197`, 전송 `:239-249`).

매 회 S3의 클립 객체 수를 센 뒤(`generatedClipCount`, `:515-518`), 루프는 **두 경우에만** 탈출한다:

- `generatedClipCount >= clipCount`(`:520`): 요청 수 전부가 S3에 있음. 메타데이터가 아직이면(`!modalCallbackReceived`) `MODAL_METADATA_GRACE_INTERVAL`(2m, `:33`) 동안 콜백을 한 번 더 기다린 뒤(`:521-539`) `generatedClipsDetected = true`로 탈출(`:541-542`).
- `backendFailureMessage`(`:545-547`): 실패 콜백 → 탈출.

**부분 성공은 둘 중 어느 쪽도 아니다.** Modal이 status `"ok"` + 클립 2개(요청 3개)를 콜백으로 보내면 `applyModalPayload`가 `backendClips`(길이 2)를 세우고 `backendFailureMessage`는 null로 둔다. Modal은 2개만 만들었으니 S3도 2개까지만 차 `generatedClipCount`(2) `>= clipCount`(3)이 영원히 거짓이고, `backendFailureMessage`도 없어 루프는 남은 폴을 전부 소진한다 — 최대 60 × 1m ≈ 60m. 콜백이 이미 "완료 + 2개"를 알렸는데도 워커가 계속 자고, 유저당 동시성이 1(`:277-283`)이라 그 시간 동안 그 유저의 다른 처리도 막힌다.

콜백을 못 받은 경로는 다르게 끝난다: 루프 후 `callbackTimedOutWithoutOutputs`(`:598-602`)가 `shouldWaitForCallback && !modalCallbackReceived && !generatedClipsDetected && generatedClipCount < clipCount`일 때 참이 되어 `callback_timeout`으로 실패한다. 이 판정은 **`modalCallbackReceived`가 거짓일 때만** 참이다.

이 세 상수(`:31-33`)의 곱/합 ≈62m가 `entities/uploaded-file/model/stale-policy.ts`의 `stuckAlertMs`(90m) 산정 근거다(`stale-policy.ts:11-17`; `functions.ts:29-33` 주석이 이를 명시). 그 주석은 62m를 **상한**으로 규정한다("함수가 살아 있으면 늦어도 ~62m에 스스로 종료하고 상태를 쓴다").

## 문제

Modal이 요청보다 적은 수(예: 3개 요청 / 2개 생성)를 **정상 생성**해도, 워커는 `clipsFound < clipCount`라는 이유만으로 그 시도를 `failed`(`incomplete_clips_generated`)로 표시한다(`functions.ts:636-655`). 부분 클립은 DB에 저장돼 있지만 `lastSuccessfulAttempt`가 갱신되지 않아 UI에서 조회되지 않고, 사용자는 0개를 받는다. 재시도해도 같은 영상이라 같은 결과가 반복되고 요청 개수를 줄일 경로도 없다.

**추가로(concern 3):** 결과 판정만 고치면 위 낭비가 그대로 남아 "60분 뒤 실패"가 "60분 뒤 성공"으로 바뀔 뿐이다. 콜백이 성공 상태로 도착한 순간 `backendClips.length`가 Modal이 보고한 클립 수 — 즉 도달 가능한 목표치 — 인데, 루프는 여전히 도달 불가능한 `clipCount`를 기준으로 남은 폴을 전부 소진한다. (이 수의 정확한 의미는 「조기 탈출 설계 상세」 첫 항목을 따른다.)

## 고칠 파일

각 파일에서 **무엇을** 바꿀지 적는다. 새로 만드는 파일은 `(신규)`를 붙인다.

| 파일 | 변경 |
| --- | --- |
| `src/fsd/entities/uploaded-file/model/clip-generation-outcome.ts` `(신규)` | 순수 모듈. **(concern 2)** 노트 코드 상수 두 개(`PARTIAL_CLIPS_INSUFFICIENT`, `PARTIAL_CLIPS_AFTER_BACKEND_ERROR`), `resolvePartialClipNoteCode({ clipsFound, expectedClipCount, backendFailureMessage })`(부분 판정 + 크래시/후보부족 구분, 완전·0이면 `null`), `isPartialClipResultCode(code)` 타입가드. **(concern 3)** 폴링 탈출 판정 `resolveModalPollAction({ generatedClipCount, clipCount, modalCallbackReceived, hasBackendFailure, backendClipCount })` → `"continue" \| "detected" \| "settle" \| "failed"`와 `ModalPollAction` 타입. 판정 순서: (1) `generatedClipCount >= clipCount` → `"detected"`; (2) 성공 콜백+확정 부분(`modalCallbackReceived && !hasBackendFailure && backendClipCount`가 `[1, clipCount)` 범위) → `generatedClipCount >= backendClipCount ? "detected" : "settle"`; (3) `hasBackendFailure` → `"failed"`; (4) 그 외 → `"continue"`. `backendClipCount`는 `number \| null`(콜백의 `backendClips?.length ?? null`). **`server-only`·`db` 임포트 금지**(워커 전용 함수와 UI 공용 함수가 한 파일에 있으나 모두 순수) |
| `src/fsd/entities/uploaded-file/model/clip-generation-outcome.test.mjs` `(신규)` | **(concern 2)** `resolvePartialClipNoteCode`의 네 갈래(0 이하 → null / 부분+메시지없음 → insufficient / 부분+메시지있음 → after_backend_error / 완전 이상 → null)와 `isPartialClipResultCode` 판정. **(concern 3)** `resolveModalPollAction`의 갈래: 완전(`generatedClipCount>=clipCount`) → detected / 성공 콜백+부분 present(`generatedClipCount>=backendClipCount`) → detected / 부분 lagging(`<backendClipCount`) → settle / 실패 콜백 → failed / 콜백 미수신 → continue / 메타데이터 없음(`backendClipCount=null`) → continue / 성공+0개(`backendClipCount=0`) → continue / 방어적 초과(`backendClipCount>clipCount`) → continue |
| `src/inngest/functions.ts` | (a) `clipsFound < clipCount` 실패 분기(`636-655`) **제거**. 0-가드(`620-634`) 이후 남는 `clipsFound >= 1`은 모두 완료 경로로 흐른다. (b) 완료 호출(`657-668`)에 `resolvePartialClipNoteCode(...)` 결과를 `noteCode`로 전달. (c) 경고(`587`) 조건을 `clipsFound >= clipCount` → `clipsFound > 0`으로 넓혀 "크래시했지만 부분 전달"을 관측 가능하게 한다. `clipsFound === 0` 경로(callback_timeout / no_clips_generated / backend_failed throw)는 그대로 둔다. **(d, concern 3)** 폴링 루프의 탈출 판정(`520-547`)을 `resolveModalPollAction({ generatedClipCount, clipCount, modalCallbackReceived, hasBackendFailure: backendFailureMessage !== null, backendClipCount: backendClips?.length ?? null })`로 대체한다. 매핑: `"detected"` → (콜백 미수신이면 기존 메타데이터 유예 `521-539` 유지 후) `generatedClipsDetected = true` + break; `"settle"` → `step.sleep("wait-for-partial-clips-settle", MODAL_METADATA_GRACE_INTERVAL)` 한 번 + `step.run("recount-generated-clips-after-settle", ...)`로 `generatedClipCount` 재집계 → **재집계 값이 콜백이 약속한 수보다 적으면 `console.warn`** → `generatedClipsDetected = true` + break; `"failed"` → break(`backendFailureMessage`가 이미 세워져 있음); `"continue"` → 계속. 새 step id 둘은 루프를 종료시키므로 실행당 최대 1회라 안정적이다. `MODAL_METADATA_GRACE_INTERVAL`을 **재사용**(새 상수 없음) |
| `src/fsd/entities/uploaded-file/api/index.ts` | `markUploadedFileAttemptProcessed`(`721-741`)에 optional `noteCode?: string \| null` 추가 → `data.failureCode`에 `noteCode ?? null`로 기록(기본 null이라 기존 동작 유지). `completeUploadedFileProcessingAttempt`(`800-824`)에 optional `noteCode` 추가해 그대로 전달 |
| `src/fsd/pages/upload-detail/ui/index.tsx` | `status === "processed" && isPartialClipResultCode(failureCode)`일 때 헤더(`:94`) 아래에 부분 결과 안내 블록 렌더. 문구는 코드로 분기하며 **실제 문자열은 「구현 스케치」의 해당 절이 유일한 출처다**(영문, 분모 없음 — 이유는 그 절 마지막 문단). `isPartialClipResultCode`와 코드 상수는 신규 모델 파일에서 직접 임포트(`ProcessingTimeline`이 `model/processing-status`를 직접 임포트하는 패턴과 동일) |

`ProcessingTimeline.tsx`의 `incomplete_clips_generated` 라벨(`:120-121`)은 **남긴다** — 이 수정 이전에 이미 `failed/incomplete_clips_generated`로 굳은 역사적 행이 그 라벨을 필요로 한다(백필 없음, 아래 대안 참조). 배럴(`uploaded-file/index.ts`)은 건드리지 않는다 — 신규 순수 함수는 모델 경로로 직접 임포트한다(`resolvePartialClipNoteCode`·`isPartialClipResultCode`는 워커·UI 양쪽, `resolveModalPollAction`은 워커 전용). `functions.ts`는 기존 배럴 임포트에 더해 `~/fsd/entities/uploaded-file/model/clip-generation-outcome`에서 이 순수 함수들을 가져온다.

### 조기 탈출 설계 상세 (concern 3)

- **어느 조건에서 탈출하는가.** 성공 콜백이 도착하면(`modalCallbackReceived && !backendFailureMessage`) `backendClips.length`가 Modal이 보고한 클립 수다. 정확히는 **정규화를 두 번 통과한 메타데이터 항목 수**다 — 웹훅이 `normalizeClip`(`route.ts:124-129`)에서, 워커가 `normalizeBackendClip`(`functions.ts:115-125`)에서 각각 `index`가 strict non-negative integer가 아닌 항목을 버린다. 정상 경로에서는 `process_clip`이 `enumerate` 값을 `"index"`로 항상 넣으므로(`apps/backend/main.py:769`) 이 수가 실제 생성 수와 같고, 어긋나더라도 **적게** 나올 뿐이라 아래 판정이 조기 탈출을 앞당길 수는 있어도 늦추지는 않는다. 실제 저장은 `persistGeneratedClips`가 S3를 다시 리스트해 결정하므로(`functions.ts:183`) 이 수를 저장 상한으로 쓰지 않는다. 이때 확정 목표를 `backendClipCount`로 삼아, `resolveModalPollAction`이 `generatedClipCount >= backendClipCount`이면 `"detected"`(S3에 이미 다 있음 → 안전하게 즉시 탈출), 아직 못 미치면 `"settle"`(유예 후 탈출)을 반환한다. 콜백 이전 또는 목표를 모르는 경우엔 기존 `generatedClipCount >= clipCount`(`"detected"`)만 유효하다. 이렇게 `applyModalPayload`가 세우는 상태 변수(`modalCallbackReceived`, `backendFailureMessage`, `backendClips`)를 판정 입력으로 옮기고, `generatedClipCount >= clipCount` 검사는 완전 성공·S3 폴백 경로용으로 그대로 남긴다.
- **S3 결과적 일관성 유예 — 몇 회/얼마.** 확정 목표에 S3가 아직 못 미치면(`"settle"`) `MODAL_METADATA_GRACE_INTERVAL`(2m)만큼 **한 번** 자고 재집계한 뒤 탈출한다. 근거: (i) 기존 메타데이터 유예와 같은 "S3/콜백이 정착하도록 유한 시간을 준다"는 성격이라 같은 상수를 재사용한다. (ii) Modal은 클립을 전부 S3에 올린 뒤 콜백을 보낸다 — 업로드가 `process_clip` 안에서 끝나고(`apps/backend/main.py:1073-1094`) 성공 콜백은 그 루프가 끝난 뒤에 나간다(`main.py:1097-1104`). 따라서 지연은 대개 초 단위이고 2m면 충분하다. (iii) 즉시 break하지 않는 이유가 바로 이 지연이다: 콜백 도착 순간 S3가 아직 목표에 못 미칠 수 있고, 그때 바로 persist하면 과소 전달 또는 `no_clips_generated` 오판이 난다. `"detected"`(S3가 이미 목표 도달) 경로는 이 위험이 없어 유예 없이 탈출하고, `"settle"` 경로만 2m 유예를 둔다.
- **재집계 값의 쓸 곳 — 경고.** `settle`은 `generatedClipsDetected = true`로 탈출한다(그래야 루프 뒤 `:551`의 "Timed out…" 경고가 안 뜬다 — 타임아웃이 아니라 정착이므로 그 문구는 틀리다). 그런데 그 플래그가 켜지면 `generatedClipCount`를 읽는 곳이 루프 뒤에 하나도 남지 않는다: `:550`의 경고는 건너뛰고, `callbackTimedOutWithoutOutputs`(`:598-602`)는 `!modalCallbackReceived`가 거짓이라 이미 무관하며, `persistGeneratedClips`는 S3를 스스로 다시 리스트한다(`functions.ts:183`). **따라서 재집계는 그 자체로는 아무것도 바꾸지 못한다.** 재집계를 남기되 그 값을 경고에 쓴다 — 유예 후에도 S3가 콜백이 약속한 수에 못 미치면 `console.warn`으로 남긴다. 이것이 "Modal은 2개를 만들었다는데 S3엔 1개뿐"이라는, `settle`이 존재하는 이유인 상황을 알려주는 유일한 신호다.
- **62m 상한과의 충돌 여부(직접 확인).** `detected`(메타데이터 유예)와 `settle`은 한 실행에서 **상호 배타적**이다(각각 즉시 break). 따라서 어떤 실행이든 2m 유예는 최대 1회다. 최악의 경우 콜백이 폴 60(≈59m 경과)에 도착해 `settle`이 걸려도 총 ≈61m로, `stale-policy.ts:11-17`의 62m 유도(60×1m + 2m)를 넘지 않는다. 이 변경은 상한을 **늘리지 않고** 흔한 경우의 실제 소요만 줄이므로 62m 상한 주석은 그대로 유효하다. `stale-policy.ts`는 손대지 않는다.
- **콜백 미수신 경로 불변.** `"settle"`과 부분 `"detected"`는 `modalCallbackReceived && !hasBackendFailure`일 때만 나오므로 콜백 없이 `generatedClipsDetected`를 세우지 않는다. 따라서 `callbackTimedOutWithoutOutputs`(`functions.ts:598-602`)의 `!modalCallbackReceived && !generatedClipsDetected` 조건이 그대로 성립해 `callback_timeout` 판정이 깨지지 않는다.
- **`backendClips` undefined / S3 폴백 경로.** 콜백의 `clips` 생략, 또는 메타데이터 없이 S3 폴백으로만 도는 경우 `backendClipCount = null`이라 `resolveModalPollAction`은 확정 목표를 만들지 못하고 기존 `"detected"`(`generatedClipCount >= clipCount`)/`"failed"`/`"continue"`만 반환한다 → 기존 clipCount 기준 폴링이 그대로 유지된다. S3 폴백 경로는 이 변경의 영향을 받지 않는다.
- **성공 콜백 + 0개(빈 매니페스트).** `backendClipCount = 0`은 `[1, clipCount)` 범위 밖이라 조기 탈출 대상이 아니고 `"continue"`로 기존 폴링→`no_clips_generated`가 유지된다. board의 concern (3)은 "만들어진 클립(≥1)을 버리는" 문제라 0개는 이미 올바른 실패 상태로 끝난다(지연만 남으며, 아래 대안 H 참조).

## 구현 스케치

### `entities/uploaded-file/model/clip-generation-outcome.ts` (신규 · 전체)

```ts
export const PARTIAL_CLIPS_INSUFFICIENT = "partial_clips_insufficient";
export const PARTIAL_CLIPS_AFTER_BACKEND_ERROR =
  "partial_clips_after_backend_error";

export type PartialClipResultCode =
  | typeof PARTIAL_CLIPS_INSUFFICIENT
  | typeof PARTIAL_CLIPS_AFTER_BACKEND_ERROR;

export function isPartialClipResultCode(
  code: string | null | undefined,
): code is PartialClipResultCode {
  return (
    code === PARTIAL_CLIPS_INSUFFICIENT ||
    code === PARTIAL_CLIPS_AFTER_BACKEND_ERROR
  );
}

export function resolvePartialClipNoteCode(args: {
  clipsFound: number;
  expectedClipCount: number;
  backendFailureMessage: string | null;
}): PartialClipResultCode | null {
  const { clipsFound, expectedClipCount, backendFailureMessage } = args;

  if (clipsFound <= 0 || clipsFound >= expectedClipCount) {
    return null;
  }

  return backendFailureMessage
    ? PARTIAL_CLIPS_AFTER_BACKEND_ERROR
    : PARTIAL_CLIPS_INSUFFICIENT;
}

export type ModalPollAction = "continue" | "detected" | "settle" | "failed";

export function resolveModalPollAction(args: {
  generatedClipCount: number;
  clipCount: number;
  modalCallbackReceived: boolean;
  hasBackendFailure: boolean;
  backendClipCount: number | null;
}): ModalPollAction {
  const {
    generatedClipCount,
    clipCount,
    modalCallbackReceived,
    hasBackendFailure,
    backendClipCount,
  } = args;

  if (generatedClipCount >= clipCount) {
    return "detected";
  }

  if (
    modalCallbackReceived &&
    !hasBackendFailure &&
    backendClipCount !== null &&
    backendClipCount >= 1 &&
    backendClipCount < clipCount
  ) {
    return generatedClipCount >= backendClipCount ? "detected" : "settle";
  }

  if (hasBackendFailure) {
    return "failed";
  }

  return "continue";
}
```

리터럴 두 개는 `UploadedFile.failureCode` 컬럼에 저장되므로 구현 후 바꾸면 이미 저장된 행이 고아가 된다. 위 값으로 고정한다.

### `src/inngest/functions.ts` — 폴링 탈출 (`520-547` 대체)

before:

```ts
        if (generatedClipCount >= clipCount) {
          if (!modalCallbackReceived) {
            const metadataResult = await step.waitForEvent(
              "wait-for-modal-metadata-after-s3-complete",
              { /* ...unchanged... */ },
            );

            if (metadataResult) {
              applyModalPayload({ /* ...unchanged... */ });
            }
          }

          generatedClipsDetected = true;
          break;
        }

        if (backendFailureMessage) {
          break;
        }
```

after:

```ts
        const pollAction = resolveModalPollAction({
          generatedClipCount,
          clipCount,
          modalCallbackReceived,
          hasBackendFailure: backendFailureMessage !== null,
          backendClipCount: backendClips?.length ?? null,
        });

        if (pollAction === "detected") {
          if (!modalCallbackReceived) {
            const metadataResult = await step.waitForEvent(
              "wait-for-modal-metadata-after-s3-complete",
              { /* ...unchanged... */ },
            );

            if (metadataResult) {
              applyModalPayload({ /* ...unchanged... */ });
            }
          }

          generatedClipsDetected = true;
          break;
        }

        if (pollAction === "settle") {
          const promisedClipCount = backendClips?.length ?? 0;

          await step.sleep(
            "wait-for-partial-clips-settle",
            MODAL_METADATA_GRACE_INTERVAL,
          );

          generatedClipCount = await step.run(
            "recount-generated-clips-after-settle",
            async () => countGeneratedClipKeys(outputPrefix),
          );

          if (generatedClipCount < promisedClipCount) {
            console.warn("Modal reported more clips than S3 exposed", {
              uploadedFileId,
              attempt,
              generatedClipCount,
              promisedClipCount,
              expectedClipCount: clipCount,
            });
          }

          generatedClipsDetected = true;
          break;
        }

        if (pollAction === "failed") {
          break;
        }
```

`generatedClipCount`는 `let`으로 이미 선언돼 있어(`functions.ts:447`) 재대입이 가능하다.

### `src/inngest/functions.ts` — 결과 판정 (`587`, `636-655`, `657-668`)

```ts
// :587 — 조건만 넓힌다
if (backendFailureMessage && clipsFound > 0) {

// :636-655 — 블록 전체 삭제 (clipsFound < clipCount 실패 분기)

// :657-668 — noteCode 한 줄 추가
          return completeUploadedFileProcessingAttempt({
            uploadedFileId,
            attempt,
            userId: context.userId,
            clipsFound,
            noteCode: resolvePartialClipNoteCode({
              clipsFound,
              expectedClipCount: clipCount,
              backendFailureMessage,
            }),
            now: new Date(),
          });
```

### `entities/uploaded-file/api/index.ts` — 노트 기록 (`721-741`, `800-824`)

```ts
export async function markUploadedFileAttemptProcessed(
  uploadedFileId: string,
  attempt: number,
  options?: {
    tx?: Prisma.TransactionClient;
    now?: Date;
    noteCode?: string | null;   // 추가
  },
) {
  // ...where 절은 그대로...
    data: {
      status: "processed",
      terminalStatusAt: now,
      lastSuccessfulAttempt: attempt,
      failureCode: options?.noteCode ?? null,   // 기존: failureCode: null
    },
}

// completeUploadedFileProcessingAttempt: args에 noteCode?: string | null 추가 후
// markUploadedFileAttemptProcessed(..., { tx, now: args.now, noteCode: args.noteCode })
```

`noteCode`를 넘기지 않으면 `null`이라 기존 호출부의 동작이 그대로다. `where` 절을 건드리지 않으므로 재실행 가드(`updated.count !== 1`)도 그대로다.

### `pages/upload-detail/ui/index.tsx` — 부분 결과 안내 (`</header>` 바로 아래)

```tsx
      </header>

      {status === "processed" && isPartialClipResultCode(failureCode) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {failureCode === PARTIAL_CLIPS_INSUFFICIENT
                ? "Fewer clips than requested"
                : "Processing stopped before all clips were done"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {failureCode === PARTIAL_CLIPS_INSUFFICIENT
              ? "Processing finished without an error but produced fewer clips than requested. Reprocessing costs credits again and may return the same result."
              : "The clips below finished before processing failed. Reprocessing may produce more clips and will cost credits again."}
          </CardContent>
        </Card>
      )}
```

`Card`·`CardHeader`·`CardTitle`·`CardContent`는 이 파일이 이미 임포트하고 있다(`index.tsx:10-15`). 새 원자를 만들지 않는다 — `shared/ui/atoms`에 인라인 `alert` 원자가 없고, 이 페이지의 다른 블록도 전부 `Card`를 쓴다.

**문구에 "N개 중 M개" 형태의 분모를 쓰지 않는다.** 행에 저장된 건 `targetClipCount`뿐인데 render 모드에서는 요청 수가 `renderMoments.length`(`processing-dispatch/api/index.ts:240`)라 둘이 다르다. 분모를 쓰면 검토 렌더에서 틀린 수를 보여준다. 실제 개수는 기존 Summary 카드의 "Visible clips"(`index.tsx:113-114`)가 이미 보여준다.

**문구가 원인을 단언하지 않는다.** `PARTIAL_CLIPS_INSUFFICIENT`는 `backendFailureMessage === null`에서만 유도되는데, 그 조건을 만족하는 원인이 최소 셋이다: (1) `validate_moments`가 구간을 버림(30~90s, `apps/backend/main.py:89`; render 모드도 사용자가 고른 구간에 이걸 다시 돌린다 — `main.py:1031-1046`), (2) Gemini가 애초에 후보를 적게 반환(`main.py:904-906`의 "If fewer genuine moments exist, return only valid ones"), (3) 클립의 S3 업로드가 조용히 실패(`apps/backend/CLAUDE.md`의 Known Issues — "No error handling for failed S3 uploads"). 코드는 셋을 구분하지 못한다. 그래서 문구는 **관측된 사실**("에러 없이 끝났는데 요청보다 적게 나왔다")만 말하고 원인을 지목하지 않으며, 재처리 안내도 "같은 결과가 나올 것"이 아니라 "같은 결과가 나올 수 있다"로 둔다 — (3)에서는 재처리가 실제로 도움이 되기 때문이다.

참고로 (3)은 concern 3의 `settle` 경고가 잡는 상황과 같다: 콜백은 3개를 보고했는데 S3에 2개뿐이면 `settle` → 유예 후 재집계 → `generatedClipCount < promisedClipCount` → `console.warn`. 사용자에게는 원인을 단언하지 않되 로그에는 신호가 남는다.

## 테스트

- **덮는 것**: `resolvePartialClipNoteCode`의 네 분기와 `isPartialClipResultCode` 판정을 `clip-generation-outcome.test.mjs`로 확인한다(입력은 평범한 객체·문자열, `node:test` + `node:assert/strict`, `.ts`를 확장자 포함해 임포트 — `selection-budget.test.mjs` 패턴). 이 순수 함수가 concern 2의 크래시/후보부족 구분과 "완전이면 노트 없음"을 잠근다. **또한 같은 파일에서 `resolveModalPollAction`(concern 3)의 여덟 갈래를 확인한다** — 완전 감지 / 성공 콜백+부분 present→detected / 부분 lagging→settle / 실패→failed / 콜백 미수신→continue / 메타데이터 없음→continue / 성공+0개→continue / 방어적 초과→continue. 입력이 전부 원시값(number·boolean·`number|null`)이라 순수하게 잠기며, 이 함수가 "성공 콜백이 오면 콜백이 보고한 수가 도달 가능한 목표"라는 조기 탈출 규칙을 계약으로 고정한다.
- **못 덮는 범위**: (1) `functions.ts` 워커 흐름 자체(Inngest step, Modal fetch, S3 조회, 완료 트랜잭션 호출 순서) — Inngest·네트워크·S3에 의존해 현재 러너로 못 돈다. (2) `markUploadedFileAttemptProcessed`/`completeUploadedFileProcessingAttempt`의 실제 DB 효과(`processed` 전이 + `lastSuccessfulAttempt` 세팅 + `failureCode` 노트 기록 + `clipsFound` 차감) — DB 쓰기라 `tsx --test`로 못 덮는다. (3) 상세 페이지의 부분 안내 렌더 — DOM/React 테스트 도구가 없다. (4, concern 3) 폴링 루프가 `resolveModalPollAction` 결과를 실제 Inngest step(`step.waitForEvent`/`step.sleep`/`break`)으로 옮기는 부분, `settle`의 새 step id(`wait-for-partial-clips-settle`/`recount-generated-clips-after-settle`), 재집계 후 `generatedClipCount < promisedClipCount`일 때의 `console.warn`, `generatedClipsDetected`가 `callbackTimedOutWithoutOutputs`에 미치는 영향 — Inngest 런타임·S3에 의존해 못 돈다. 이 넷은 수동 검증이 필요하며 구현 후 `결과:`에 남긴다. **수동 검증 시나리오(concern 2·3 공통)**: 3개 요청 / 2개 생성 상황에서 Modal이 `accepted` 후 콜백으로 status `ok`+클립 2개를 보낼 때 — 워커가 60분을 소진하지 않고 S3에 2개가 보인 직후(또는 최대 2m 유예 후) 탈출하는지, 2개 클립이 노출되고 2 크레딧이 차감되는지, 상세 페이지에 부분 안내 문구가 뜨는지 확인한다.

## 범위 밖 의존

없음. 모든 변경이 `apps/web` 안에서 끝난다. 부분 성공을 durable하게 표시할 때 **새 컬럼을 만들지 않고 기존 `UploadedFile.failureCode`(String?)를 `processed` 행의 "완료 노트"로 겸용**하므로 `packages/db` 스키마 변경이 없다. concern 3의 조기 탈출도 기존 상수(`MODAL_METADATA_GRACE_INTERVAL`)를 재사용하고 순수 함수를 `apps/web` 안에 두므로 범위 밖 의존이 없다. 역사적 데이터 백필도 하지 않는다(마이그레이션/DB 명령은 범위 밖).

## 대안

- **(A) DB에 부분 성공 전용 컬럼 추가**(예: `partialResultReason`): 의미가 가장 명확하지만 `packages/db` 스키마 변경 → 범위 밖. 그래서 `failureCode`를 겸용한다. "`failed`가 아닌데 `failureCode`가 있다"는 명명 긴장은 감수한다. 안전성은 확인됨 — `failureCode`를 실패의 근거로 읽는 곳이 없다(상태의 원천은 `status`다): `ProcessingTimeline`은 `event === "failed"`일 때만 라벨을 그리고(`:158`), `UploadedFileStatusBadge`는 `status`만 쓰며, `report-error.ts`의 `failureCode`는 DB 컬럼이 아니라 리포트 페이로드다. 재처리 시 `failureCode`는 `null`로 초기화된다(`features/upload/api/index.ts:155`). 역사적 `failed/incomplete_clips_generated` 행은 그대로 두고, 사용자가 재처리하면 새 로직으로 다시 판정된다.
- **(B) UI에서 `clips.length < targetClipCount`로 부분 추론**: render 모드는 `clipCount = 선택 draft 수`(`processing-dispatch/api/index.ts:240`)라 `< targetClipCount`가 정상 완전 성공일 수 있어 오탐한다. 그래서 워커가 `clipsFound` vs `clipCount`를 아는 지점에서 durable 노트로 기록한다.
- **(C) 부분 결과의 재처리를 차단**(버튼 비활성): board의 "알리거나 막는다" 중 크래시 케이스는 재시도가 도움이 될 수 있어 일괄 차단은 과하다. "알린다"(안내 블록)를 택하고 차단하지 않는다. 필요하면 후보부족 코드에 한해 재처리 확인 다이얼로그(`alert-dialog` 원자 존재)를 추가하는 것이 후속 선택지다.
- **(D) 완료 시 `clipCount`만큼 과금**: 만들어지지 않은 클립까지 과금해 사용자에게 손해다. `completeUploadedFileProcessingAttempt`의 기존 동작(`clipsFound`만 차감)을 유지한다.
- **(E, concern 3) 임계값만 `min(backendClipCount, clipCount)`로 일반화하고 별도 유예 없이 루프에 맡김**: S3가 `backendClipCount`에 도달하면 자연히 탈출하므로 흔한 경우엔 충분하다. 그러나 약속된 클립 하나가 S3에 끝내 안 올라오면(업로드 누락) 남은 폴을 다시 다 소진한다. 그래서 목표 미달 상태에서도 유예 후 탈출하는 `"settle"`을 둬 상한을 짧게 잡는다.
- **(F, concern 3) 콜백 도착 즉시 break(S3 확인 없이)**: 결과적 일관성으로 `persistGeneratedClips`가 0~부분만 찾아 과소 전달하거나 `no_clips_generated`로 오판할 수 있다. 그래서 S3가 목표에 도달했는지 확인하거나(`"detected"`) 2m 유예 후 재집계한다(`"settle"`).
- **(G, concern 3) 메타데이터 없는 성공 콜백도 조기 탈출**: `backendClips`가 `undefined`라 신뢰할 목표치가 없다. S3 카운트 안정화(연속 N회 동일)를 목표 추정에 쓰는 휴리스틱은 정상 진행 중인 생성을 "정착"으로 오판할 위험이 커 채택하지 않고, 기존 `clipCount` 기준 폴링을 유지한다.
- **(H, concern 3) 성공 콜백 + 0개도 조기 탈출**: 지연을 더 줄일 수 있으나 `"detected"` 명칭·의미가 어긋나고 `no_clips_generated` 경로의 판정을 건드린다. board concern (3)은 "만든 클립을 버리는" 문제라 0개는 범위 밖으로 두고 기존 폴링→`no_clips_generated`를 유지한다. 필요하면 확정 0개를 빠르게 종료시키는 후속 선택지로 남긴다.
