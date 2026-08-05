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

## 문제

Modal이 요청보다 적은 수(예: 3개 요청 / 2개 생성)를 **정상 생성**해도, 워커는 `clipsFound < clipCount`라는 이유만으로 그 시도를 `failed`(`incomplete_clips_generated`)로 표시한다(`functions.ts:636-655`). 부분 클립은 DB에 저장돼 있지만 `lastSuccessfulAttempt`가 갱신되지 않아 UI에서 조회되지 않고, 사용자는 0개를 받는다. 재시도해도 같은 영상이라 같은 결과가 반복되고 요청 개수를 줄일 경로도 없다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/entities/uploaded-file/model/clip-generation-outcome.ts` `(신규)` | 순수 모듈. 노트 코드 상수 두 개(`PARTIAL_CLIPS_INSUFFICIENT`, `PARTIAL_CLIPS_AFTER_BACKEND_ERROR`), `resolvePartialClipNoteCode({ clipsFound, expectedClipCount, backendFailureMessage })`(부분 판정 + 크래시/후보부족 구분, 완전·0이면 `null`), `isPartialClipResultCode(code)` 타입가드. **`server-only`·`db` 임포트 금지**(워커·클라이언트 컴포넌트·테스트 공용) |
| `src/fsd/entities/uploaded-file/model/clip-generation-outcome.test.mjs` `(신규)` | `resolvePartialClipNoteCode`의 네 갈래(0 이하 → null / 부분+메시지없음 → insufficient / 부분+메시지있음 → after_backend_error / 완전 이상 → null)와 `isPartialClipResultCode` 판정 |
| `src/inngest/functions.ts` | (a) `clipsFound < clipCount` 실패 분기(`636-655`) **제거**. 0-가드(`620-634`) 이후 남는 `clipsFound >= 1`은 모두 완료 경로로 흐른다. (b) 완료 호출(`657-668`)에 `resolvePartialClipNoteCode(...)` 결과를 `noteCode`로 전달. (c) 경고(`587`) 조건을 `clipsFound >= clipCount` → `clipsFound > 0`으로 넓혀 "크래시했지만 부분 전달"을 관측 가능하게 한다. `clipsFound === 0` 경로(callback_timeout / no_clips_generated / backend_failed throw)는 그대로 둔다 |
| `src/fsd/entities/uploaded-file/api/index.ts` | `markUploadedFileAttemptProcessed`(`721-741`)에 optional `noteCode?: string \| null` 추가 → `data.failureCode`에 `noteCode ?? null`로 기록(기본 null이라 기존 동작 유지). `completeUploadedFileProcessingAttempt`(`800-824`)에 optional `noteCode` 추가해 그대로 전달 |
| `src/fsd/pages/upload-detail/ui/index.tsx` | `status === "processed" && isPartialClipResultCode(failureCode)`일 때 헤더(`:94`) 아래에 부분 결과 안내 블록 렌더. 문구는 코드로 분기: 후보부족 → "요청보다 적게 생성됨 · 재처리는 크레딧을 다시 쓰며 같은 결과가 나올 수 있음", 크래시 → "처리가 중단돼 일부만 생성됨 · 재처리 시 더 만들어질 수 있고 크레딧이 든다". `isPartialClipResultCode`와 코드 상수는 신규 모델 파일에서 직접 임포트(`ProcessingTimeline`이 `model/processing-status`를 직접 임포트하는 패턴과 동일) |

`ProcessingTimeline.tsx`의 `incomplete_clips_generated` 라벨(`:120-121`)은 **남긴다** — 이 수정 이전에 이미 `failed/incomplete_clips_generated`로 굳은 역사적 행이 그 라벨을 필요로 한다(백필 없음, 아래 대안 참조). 배럴(`uploaded-file/index.ts`)은 건드리지 않는다 — 신규 순수 함수는 워커·UI 양쪽에서 모델 경로로 직접 임포트한다.

## 테스트

- **덮는 것**: `resolvePartialClipNoteCode`의 네 분기와 `isPartialClipResultCode` 판정을 `clip-generation-outcome.test.mjs`로 확인한다(입력은 평범한 객체·문자열, `node:test` + `node:assert/strict`, `.ts`를 확장자 포함해 임포트 — `selection-budget.test.mjs` 패턴). 이 순수 함수가 concern 2의 크래시/후보부족 구분과 "완전이면 노트 없음"을 잠근다.
- **못 덮는 범위**: (1) `functions.ts` 워커 흐름 자체(Inngest step, Modal fetch, S3 조회, 완료 트랜잭션 호출 순서) — Inngest·네트워크·S3에 의존해 현재 러너로 못 돈다. (2) `markUploadedFileAttemptProcessed`/`completeUploadedFileProcessingAttempt`의 실제 DB 효과(`processed` 전이 + `lastSuccessfulAttempt` 세팅 + `failureCode` 노트 기록 + `clipsFound` 차감) — DB 쓰기라 `tsx --test`로 못 덮는다. (3) 상세 페이지의 부분 안내 렌더 — DOM/React 테스트 도구가 없다. 이 셋은 수동 검증(3개 요청/2개 생성 시나리오로 클립 노출·2 크레딧 차감·안내 문구 확인)이 필요하며, 구현 후 `결과:`에 남긴다.

## 범위 밖 의존

없음. 모든 변경이 `apps/web` 안에서 끝난다. 부분 성공을 durable하게 표시할 때 **새 컬럼을 만들지 않고 기존 `UploadedFile.failureCode`(String?)를 `processed` 행의 "완료 노트"로 겸용**하므로 `packages/db` 스키마 변경이 없다. 역사적 데이터 백필도 하지 않는다(마이그레이션/DB 명령은 범위 밖).

## 대안

- **(A) DB에 부분 성공 전용 컬럼 추가**(예: `partialResultReason`): 의미가 가장 명확하지만 `packages/db` 스키마 변경 → 범위 밖. 그래서 `failureCode`를 겸용한다. "`failed`가 아닌데 `failureCode`가 있다"는 명명 긴장은 감수한다. 안전성은 확인됨 — `failureCode`를 실패의 근거로 읽는 곳이 없다(상태의 원천은 `status`다): `ProcessingTimeline`은 `event === "failed"`일 때만 라벨을 그리고(`:158`), `UploadedFileStatusBadge`는 `status`만 쓰며, `report-error.ts`의 `failureCode`는 DB 컬럼이 아니라 리포트 페이로드다. 재처리 시 `failureCode`는 `null`로 초기화된다(`features/upload/api/index.ts:155`). 역사적 `failed/incomplete_clips_generated` 행은 그대로 두고, 사용자가 재처리하면 새 로직으로 다시 판정된다.
- **(B) UI에서 `clips.length < targetClipCount`로 부분 추론**: render 모드는 `clipCount = 선택 draft 수`(`processing-dispatch/api/index.ts:240`)라 `< targetClipCount`가 정상 완전 성공일 수 있어 오탐한다. 그래서 워커가 `clipsFound` vs `clipCount`를 아는 지점에서 durable 노트로 기록한다.
- **(C) 부분 결과의 재처리를 차단**(버튼 비활성): board의 "알리거나 막는다" 중 크래시 케이스는 재시도가 도움이 될 수 있어 일괄 차단은 과하다. "알린다"(안내 블록)를 택하고 차단하지 않는다. 필요하면 후보부족 코드에 한해 재처리 확인 다이얼로그(`alert-dialog` 원자 존재)를 추가하는 것이 후속 선택지다.
- **(D) 완료 시 `clipCount`만큼 과금**: 만들어지지 않은 클립까지 과금해 사용자에게 손해다. `completeUploadedFileProcessingAttempt`의 기존 동작(`clipsFound`만 차감)을 유지한다.
