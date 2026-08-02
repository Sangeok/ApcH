# Processing Timeline Truthfulness and Dispatch Safety Proposal

## 0. TL;DR

이 문서는 더 이상 `ProcessingTimeline.tsx`만 고치는 UI 문서가 아니다.

이번 버전은 아래 문제를 한 번에 해결하기 위한 제안이다.

1. `processing` 중인데 `Processed`가 미리 보이는 문제
2. `createdAt` / `updatedAt`이 실제 처리 시각처럼 보이는 문제
3. 중복 enqueue로 같은 파일이 두 번 처리될 수 있는 문제
4. reprocess 도중 기존 결과를 먼저 지워서 새 처리 실패 시 결과를 잃는 문제
5. outbox dispatch가 멈추면 row가 영구적으로 `pending_enqueue`에 머무를 수 있는 문제
6. detail / dashboard read-path가 attempt versioning과 맞지 않아 clip count와 상태가 어긋나는 문제
7. 외부 backend callback이 늦게 도착했을 때 이전 attempt 결과가 현재 attempt를 오염시킬 수 있는 문제

최종 방향은 아래와 같다.

- `UploadedFile` 생성 직후 기본 상태는 `upload_pending`으로 둔다.
- 사용자가 실제로 처리 요청을 확정한 뒤에만 `pending_enqueue`로 전환한다.
- 사용자 액션은 Inngest에 직접 `send()`하지 않고, DB transaction으로 attempt claim + outbox row 생성까지만 한다.
- 별도 dispatcher가 outbox row를 읽어 Inngest event를 발행하고, 성공 시 `queuedAt`을 기록한다.
- dispatcher는 best-effort trigger + 주기적 sweep 두 경로를 모두 가진다.
- dispatch dead-letter는 `UploadedFile.failed`로 종결해 영구 `pending_enqueue`를 허용하지 않는다.
- reprocess는 non-destructive로 바꾸고, clip은 attempt 단위로 versioning한다.
- 각 attempt의 generated clip은 전용 S3 prefix에 기록해 이전 attempt 결과를 덮어쓰지 않는다.
- detail과 dashboard는 모두 "현재 보여 줄 clip attempt" 기준으로 별도 조회한다.
- 외부 callback과 내부 event payload에 모두 `attempt`를 포함한다.
- `confirmUploadCompleted()`는 client success signal만 믿지 않고, server가 exact `UploadedFile.s3Key` 존재를 확인한 뒤에만 `uploaded = true`를 기록한다.
- S3 PUT 성공 이후 `confirmUploadCompleted()` 응답이 유실돼도 client는 row를 auto-delete하지 않고, reconciliation read 또는 idempotent retry로 commit 여부를 확인한다.
- `requestProcessingAttempt()` 호출이 시작된 뒤에는 client auto-cleanup으로 row를 삭제하지 않고, reconciliation read로 commit 여부를 확인한다.
- `upload_pending` row는 hidden 상태로 유지하되, `uploaded = true`인 recoverable draft는 dashboard의 별도 recovery surface에서만 다시 노출한다.
- upload form에서 선택한 최초 `clipCount`는 `generateUploadUrl()` row 생성 시점에 바로 `targetClipCount`로 기록해 recoverable draft resume에서도 그대로 재사용한다.
- `generateUploadUrl()`는 presigned URL 발급 전에 `language`와 `clipCount`를 server-side로 검증하고, invalid input이면 row를 만들지 않는다.
- `uploaded = false` raw draft도 exact source object가 실제로 존재하면 age와 무관하게 recoverable draft로 즉시 승격해 dashboard recovery surface로 올린다.
- raw draft promotion sweep는 dispatcher periodic sweep와 같은 1분 주기로 실행하고, 24시간 기준은 object absent raw draft cleanup에만 사용한다.
- raw draft / recoverable draft cleanup은 둘 다 DB row만 먼저 삭제하지 않고, exact source object 정리 성공 또는 object 부재 확인 이후에만 row를 제거한다.
- `UploadedFile.targetClipCount`를 process / reprocess의 clipCount source of truth로 둔다.
- `uploaded` boolean은 "원본 source upload confirmed" 의미로만 고정하고, queue/processing 의미는 전부 `status`가 담당한다.
- credit admission rule은 `credits > 0` 기준으로 명시하고, `clipsFound === 0`은 success promotion이 아니라 `failed + no_clips_generated`로 처리한다.
- detail route는 `upload_pending` row를 server-side에서 `notFound` 처리한다.
- 현재 visible attempt의 clip delete는 비활성화하고, server action도 직접 호출을 거부한다.
- active detail page는 polling으로 stale snapshot을 줄인다.

즉 최종 구조는 다음 한 줄로 요약된다.

**upload_pending + pending_enqueue + outbox dispatch + attempt versioning + non-destructive reprocess**

### 0-1. 이번 업데이트에서 닫은 리뷰 포인트

이번 수정으로 아래 검토 사항을 proposal 본문에 명시적으로 반영했다.

- 초기 row 상태는 `pending_enqueue`가 아니라 hidden 상태인 `upload_pending`으로 분리한다.
- outbox는 best-effort trigger만 두지 않고 periodic sweep, stale `sending` 회수, dead-letter 종결까지 포함한다.
- detail read는 parent field를 relation filter에 끼워 넣지 않고 two-step query로 정의한다.
- dashboard clip count는 전체 clip 수가 아니라 `lastSuccessfulAttempt` 기준 `visibleClipsCount`로 계산한다.
- optimistic row status도 `queued`가 아니라 `pending_enqueue`로 맞춘다.
- `no credits`는 `queued -> no credits` 전이로 정의하고, `processingStartedAt` 없이 종료될 수 있음을 명시한다.
- stale `processing` row는 recovery job이 `failed + worker_timeout`으로 정리한다.
- generated clip S3 key는 attempt namespace를 사용하고, fallback scan도 현재 attempt prefix만 읽도록 고정한다.
- `confirmUploadCompleted()`는 server-side exact-key verification과 transport-error reconciliation을 포함해, source upload confirmation 자체도 재시도 가능/idempotent하게 만든다.
- `requestProcessingAttempt()` 이후 transport error가 나도 client가 row를 auto-delete하지 않도록 reconciliation 절차를 둔다.
- `upload_pending`는 영구 hidden row로 남지 않도록 recoverable draft surface와 stale draft promotion/cleanup sweep를 함께 두고, raw draft에서 source object가 확인되면 먼저 recoverable draft로 승격한다.
- reprocess의 `clipCount`는 `UploadedFile.targetClipCount`를 source of truth로 사용한다.
- 최초 upload에서도 사용자가 고른 `clipCount`를 row 생성 시점에 `targetClipCount`로 고정해, source upload confirmation 이후 끊겨도 재개 시 값이 변하지 않게 한다.
- `generateUploadUrl()`는 `clipCount`/`language`를 server-side validation한 뒤에만 draft row를 만들고, `requestProcessingAttempt()`도 저장된 `targetClipCount`를 다시 defensive validation한다.
- `uploaded`는 source upload 완료 의미로만 쓰고, main list/detail visibility는 `status` 기준으로 분리한다.
- `clipsFound === 0`은 `processed`가 아니라 `failed + no_clips_generated`로 종결해 이전 성공 결과를 보호한다.
- `upload_pending` direct detail 접근은 `notFound`로 차단한다.
- visible attempt clip delete는 UI와 server action 양쪽에서 금지한다.
- active 상태(`pending_enqueue`, `queued`, `processing`)에서는 delete를 막아 cancellation 미정의를 피한다.

### 0-2. 현재 코드 대조로 추가 확정한 수정 포인트

이번 코드 대조에서 아래 사항을 별도 확인했고, 본 proposal은 이를 해결 범위에 포함한다.

- `src/fsd/pages/dashboard/model/useUploadPodcast.ts`의 `finally` auto-delete는 S3 PUT 성공 이후 또는 processing request 시작 이후 더 이상 허용하지 않는다. 이 구간의 transport error는 reconciliation으로만 복구한다.
- `src/fsd/features/clip/api/index.ts`와 `src/fsd/features/upload/api/index.ts`의 direct `inngest.send()` 경로는 모두 제거하고, atomic claim + outbox dispatch 경로로 일원화한다.
- 기존 구현에서 `uploaded` boolean을 queue/process state처럼 사용하는 경로는 모두 정리하고, `uploaded = source upload confirmed` 의미만 남긴다.
- `reprocessUploadedFile()`의 `clipCount: 3` 하드코드는 제거하고 `UploadedFile.targetClipCount`만 source of truth로 사용한다.
- Modal callback / internal wait match key는 `uploadedFileId` 단독이 아니라 `uploadedFileId + attempt` 조합으로 올려 stale callback 오염을 막는다.
- dashboard / detail read-path는 전체 clip, `_count.clips`, `uploaded = true` 의존을 제거하고 visible attempt 기준 조회로 교체한다.
- S3 listing / cleanup / fallback scan은 flat folder 가정을 버리고 current attempt prefix 범위로 제한한다.
- `ClipActions`, `UploadedFileActions`, 관련 server action은 UI disable만으로 끝내지 않고 server-side guard까지 함께 둔다.
- dispatcher sweep / raw draft promotion sweep / stale processing recovery job을 scheduled function으로 구현하는 경우, `src/app/api/inngest/route.ts`의 `serve({ functions: [...] })` 등록까지 완료해야 한다.

### 0-3. 현재 구현 기준 문제-해결 매핑

아래 표는 "현재 코드에서 실제로 남아 있는 위험"과 "이 문서가 그것을 어떻게 닫는지"를 직접 대응시킨 것이다.

| 현재 구현 증상 | 그대로 두면 생기는 문제 | 본 proposal의 해결 방식 |
|---|---|---|
| user action이 `inngest.send()`를 직접 호출하고, client가 `finally`에서 row를 지움 | post-send partial failure, duplicate enqueue, orphan job, 잘못된 cleanup | atomic claim + outbox dispatch로 분리하고, source confirmation 이후/client request 시작 이후 auto-delete를 금지 |
| reprocess가 기존 clip/S3 결과를 먼저 삭제함 | 새 시도 실패 시 이전 성공 결과 손실 | non-destructive reprocess + attempt versioning + `lastSuccessfulAttempt` 유지 |
| `reprocessUploadedFile()`가 `clipCount: 3`을 하드코딩함 | 최초 사용자 선택값이 유실되고 resume/reprocess 일관성이 깨짐 | `UploadedFile.targetClipCount`를 최초 row 생성 시 기록하고 process/reprocess 공통 source of truth로 사용 |
| callback / wait key가 `uploadedFileId`만 사용됨 | 늦게 온 이전 callback이 현재 attempt를 오염 | event payload, callback payload, wait/match key 모두 `uploadedFileId + attempt` 기준으로 고정 |
| `uploaded` boolean이 source upload confirmation과 queue/process 의미를 혼용함 | `upload_pending`, recoverable draft, active state가 서로 모순 | `uploaded = source upload confirmed` 의미만 남기고, queue/process/visibility는 `status`와 attempt/timestamp가 담당 |
| dashboard/detail이 전체 clip, `_count.clips`, `uploaded = true` 필터를 사용함 | visible attempt 기준 clip count와 상태가 왜곡됨 | visible attempt 전용 query, `lastSuccessfulAttempt`, `status != "upload_pending"` 기준 조회로 교체 |
| `ProcessingStatus`, `STATUS_CONFIG`, timeline/UI가 기존 상태 집합만 전제함 | 새 status 추가 시 badge lookup, timeline rendering, optimistic UI가 즉시 어긋나거나 깨짐 | status union, status config, optimistic row, queue/detail timeline을 current attempt state model 기준으로 한 번에 교체 |
| S3 fallback scan / cleanup이 flat folder를 가정함 | 이전 attempt 결과를 읽거나 지워 non-destructive reprocess가 깨짐 | generated clip을 `attemptPrefix`에 격리하고, scan/cleanup도 current attempt prefix만 대상으로 제한 |
| delete 금지가 UI에만 있거나 server guard가 없음 | direct server action 호출로 active row / visible attempt clip 삭제 가능 | UI disable + server-side guard를 동시에 두고, active status 및 visible attempt 조건에서 직접 호출도 거부 |
| scheduled sweep/recovery function을 추가해도 route 등록을 빠뜨릴 수 있음 | 문서상 liveness는 있어도 실제 dispatch recovery가 동작하지 않음 | `serve({ functions: [...] })` 등록을 구현 순서와 수동 검증 체크리스트에 포함 |

### 0-4. 부분 적용 금지 묶음

이 proposal은 아래 항목을 따로따로 나눠 적용하면 안 된다.

- `outbox dispatch + reconciliation cleanup`
- `attempt schema + callback/event payload + wait/match key`
- `uploaded 의미 정리 + upload confirmation flow`
- `visible attempt query + dashboard/detail UI`
- `attemptPrefix S3 layout + fallback scan/cleanup`
- `delete UI guard + server-side guard`
- `ProcessingStatus union + STATUS_CONFIG + optimistic/timeline rendering`

즉 이 문서는 "타임라인 UI만 먼저 수정"하거나 "`attempt` 필드만 먼저 추가"하는 식의 부분 rollout을 허용하지 않는다. 최소 단위는 위 묶음 단위다.

### 0-5. 구현 완료 판정 기준

현재 코드 대조 기준으로, 아래 묶음이 모두 적용되면 이 proposal 범위 안에서 추가 known issue는 남기지 않는 것으로 본다.

1. user-triggered processing 경로에 direct `inngest.send()`가 남아 있지 않다.
2. S3 PUT 성공 이후 또는 `requestProcessingAttempt()` 시작 이후 client `finally` cleanup이 row를 삭제하지 않는다.
3. `reprocessUploadedFile()`가 기존 성공 clip/S3 결과를 선삭제하지 않고, `targetClipCount` 하드코드 없이 새 attempt만 생성한다.
4. schema, event payload, callback payload, wait/match key가 모두 `attempt`를 포함한다.
5. `uploaded`는 source upload confirmation 의미만 가지며, dashboard/detail visibility는 `status`와 attempt 기준으로만 판정한다.
6. dashboard/detail query는 visible attempt 전용 read-path를 사용하고 `_count.clips`, 전체 clip read, `uploaded = true` 필터 의존을 제거한다.
7. generated clip scan/cleanup/delete cleanup은 모두 current `attemptPrefix` 범위만 다룬다.
8. active uploaded file delete와 visible attempt clip delete는 UI와 server action 양쪽에서 모두 차단된다.
9. `ProcessingStatus` union, `STATUS_CONFIG`, optimistic row, queue UI, detail timeline이 새 상태 집합을 일관되게 반영한다.
10. dispatcher/recovery scheduled function을 도입했다면 Inngest route 등록까지 완료한다.

즉 본 문서가 요구하는 것은 "설계 반영"이 아니라, 위 판정 기준을 모두 만족하는 end-to-end 구현이다.

### 0-6. 현재 레포 스냅샷 기준 직접 충돌 예시

아래 파일들은 이번 코드 대조 시점에 proposal과 직접 충돌하는 구현이 실제로 남아 있음을 확인한 경로다.

- `src/fsd/pages/dashboard/model/useUploadPodcast.ts`
  - optimistic row를 아직 `queued`로 추가한다
  - upload/request 실패 시 `finally`에서 `deleteUploadedFileWithClips()`를 호출한다
- `src/fsd/features/clip/api/index.ts`
  - user-triggered processing에서 direct `inngest.send()`를 호출한다
  - `uploaded` boolean을 processing trigger 상태처럼 사용한다
  - clip delete에 visible attempt guard가 없다
- `src/fsd/features/upload/api/index.ts`
  - `generateUploadUrl()`가 `clipCount`를 받지 않고 최초 선택값을 저장하지 않는다
  - `reprocessUploadedFile()`가 기존 clip/S3 결과를 먼저 삭제한다
  - `reprocessUploadedFile()`가 `clipCount: 3`을 하드코딩한다
  - reprocess 경로에서도 direct `inngest.send()`를 호출한다
- `src/fsd/entities/uploaded-file/api/index.ts`
  - dashboard list가 `uploaded = true` 필터에 의존한다
  - summary가 `_count.clips`를 사용한다
  - detail이 전체 `clips` relation을 읽는다
- `src/inngest/functions.ts`
  - worker wait match key가 `uploadedFileId`만 사용된다
  - fallback S3 scan이 flat `clip_*.mp4` 구조를 가정한다
- `src/app/api/webhooks/modal/route.ts`
  - callback payload에 `attempt`가 없다
- `src/fsd/entities/uploaded-file/model/processing-status.ts`
  - `upload_pending`, `pending_enqueue`를 포함하지 않는다
- `src/fsd/pages/dashboard/config/index.ts`
  - `pending_enqueue` status badge가 없다
- `src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx`
  - `createdAt` / `updatedAt` 기반 고정 step timeline을 렌더링한다
- `prisma/schema.prisma`
  - `upload_pending` 기본 상태, attempt/timestamp 필드, `ProcessingDispatch`, `Clip.processingAttempt` 및 관련 uniqueness가 없다

이 목록은 참고 예시가 아니라, 현재 레포 기준으로 proposal 반영 시 반드시 교정되어야 하는 baseline 충돌 목록이다.

### 0-7. 리뷰 판정 규칙

이 문서를 기준으로 구현 리뷰를 할 때 판정 규칙은 아래와 같다.

- `0-6. 현재 레포 스냅샷 기준 직접 충돌 예시`에 해당하는 구현이 하나라도 남아 있으면, "이 proposal 기준 수정 시 발생 가능한 문제 있음"으로 판정한다.
- `0-5. 구현 완료 판정 기준` 10개 항목을 모두 만족하고, `14. 수동 검증 체크리스트`의 proposal 관련 항목이 통과하면, 이 proposal 범위 안에서는 "추가 known issue 없음"으로 판정한다.
- 즉 "타임라인 UI가 바뀌었다", "새 status가 추가됐다", "attempt 필드가 생겼다" 같은 부분 완료만으로는 문제 없음 판정을 내리지 않는다.

### 0-8. 현재 코드 감사 결과 최종 정리

이번 레포 기준 코드 감사에서 확인된 문제들은 모두 아래 범주 중 하나로 수렴한다.

- direct enqueue / client auto-cleanup
- destructive reprocess / `targetClipCount` 부재
- attempt schema / callback matching 부재
- `uploaded` 의미 혼용
- visible attempt read-path 부재
- attempt-aware S3 prefix / cleanup 부재
- delete UI/server guard 부재
- status union / status config / timeline UI 불일치
- scheduled function route 등록 누락 가능성

즉 현재 코드 감사 기준으로, **이 proposal 밖의 별도 신규 설계 이슈는 추가로 발견되지 않았다.**

반대로 말하면, 위 범주 중 하나라도 구현에 남아 있으면 그것은 "새로운 예외"가 아니라 이 proposal이 이미 해결 대상으로 정의한 미완료 항목이다.

### 0-9. Scope Closure

이 문서는 현재 코드 감사에서 드러난 scope 내 이슈를 모두 흡수하도록 업데이트되었다.

- `0-3`은 위험과 해결 방식을 1:1로 닫는다.
- `0-4`는 부분 적용으로 새 문제가 생기지 않도록 최소 적용 단위를 고정한다.
- `0-5`는 구현 완료 조건을 정의한다.
- `0-6`은 현재 레포 기준 baseline 충돌을 빠짐없이 명시한다.
- `0-7`은 리뷰 판정 규칙을 정의한다.
- `0-8`은 코드 감사 결과가 이 proposal 범주 밖으로 새지 않음을 확인한다.

따라서 **이 문서에 정의된 묶음과 완료 판정 기준을 모두 만족하는 구현에 대해서는, proposal scope 안에서 남는 open known issue는 없다.**

남는 것은 설계 결함이 아니라 구현 미완료뿐이다.

### 0-10. No Open Gaps Matrix

아래 표는 이번 코드 감사에서 확인한 모든 문제 범주가 이 문서 어디에서 닫히는지 추적하기 위한 것이다.

| 감사에서 확인된 문제 범주 | 설계가 닫히는 본문 섹션 | 구현/검증이 닫히는 위치 |
|---|---|---|
| direct enqueue / client auto-cleanup | `1-2`, `3-3`, `4`, `10-1` | `13`의 10~13번, `14`의 5, 17, 40번 |
| destructive reprocess / `targetClipCount` 부재 | `1-3`, `3-1`, `3-2`, `4`, `10-1` | `13`의 3~4, 8, 12번, `14`의 10, 11, 19, 20, 21, 41번 |
| attempt schema / callback matching 부재 | `1-4`, `3-2`, `3-3`, `6`, `7` | `13`의 1, 9, 10, 19~20번, `14`의 4, 8, 9, 18, 48, 49번 |
| `uploaded` 의미 혼용 | `2`, `3-1-1`, `4`, `10-1`, `10-3` | `13`의 6~8, 13, 15~18, 23~25번, `14`의 1, 17, 21, 31, 32, 33, 36번 |
| visible attempt read-path 부재 | `1-5`, `8`, `9`, `10-3`, `10-4` | `13`의 17~18, 23~29번, `14`의 13, 15, 27, 31, 37, 44번 |
| attempt-aware S3 prefix / cleanup 부재 | `3-2`, `6`, `10-1` | `13`의 5, 9, 14~16, 19번, `14`의 18, 24, 25, 26, 34, 35, 42번 |
| delete UI/server guard 부재 | `10-5`, `10-6` | `13`의 31~32번, `14`의 30, 38번 |
| status union / status config / timeline UI 불일치 | `2`, `8-6`, `8-7`, `9`, `10-2` | `13`의 25~30번, `14`의 7, 14, 15, 43번 |
| scheduled function route 등록 누락 가능성 | `3-3`, `5`, `10-1` | `13`의 10, 15~17, 22번, `14`의 5, 16, 24, 39번 |

이 표에 없는 추가 범주가 새로 필요하다면 그 시점에는 proposal scope가 부족한 것이고, 현재 코드 감사 기준으로는 그런 누락 범주는 발견되지 않았다.

---

## 1. 문제 정의

현재 구현은 timeline UI와 처리 파이프라인이 서로 독립적으로 진화해서, 사용자에게 보이는 상태와 실제 backend 처리 전이가 자주 어긋난다.

특히 아래가 핵심 문제다.

### 1-1. timeline이 "고정된 step 목록"을 렌더링한다

현재 `ProcessingTimeline.tsx`는 `queued`, `processing`, `processed` 3개 step을 항상 렌더링한다.

그래서:

- `processing` 중인데도 `Processed`가 먼저 보인다.
- `failed` / `no credits`에서도 미래 step이 남아 있다.
- `updatedAt`이 완료 시각처럼 보인다.

### 1-2. enqueue가 durable하지 않다

현재는 frontend/server action이 직접 `inngest.send()`를 호출한다.

이 구조의 문제:

- 동시에 두 요청이 들어오면 중복 enqueue가 가능하다.
- `send`는 성공했는데 DB 갱신이 실패하면 partial failure가 생긴다.
- frontend는 이를 실패로 보고 row를 삭제할 수 있지만, queue에는 이미 잡이 있을 수 있다.

### 1-3. reprocess가 destructive하다

현재 reprocess flow는 새 시도를 확정하기 전에 기존 clip과 생성 결과를 먼저 삭제한다.

이 구조의 문제:

- 새 enqueue가 실패하면 기존 성공 결과를 잃는다.
- 사용자는 "다시 돌리려다 결과가 사라진" 상태를 경험한다.

### 1-4. attempt 개념이 없다

현재 `Clip`은 어떤 처리 시도에서 만들어졌는지 구분하지 못한다.

이 구조의 문제:

- reprocess 중에도 이전 결과를 유지할 수 없다.
- 늦게 도착한 callback이나 중복 dispatch가 어느 시도의 결과인지 안전하게 판단하기 어렵다.

### 1-5. dashboard / detail read-path가 현재 보이는 결과와 맞지 않는다

현재:

- detail page는 clip 전체를 읽는다.
- dashboard summary는 `_count.clips`를 그대로 쓴다.
- optimistic row는 무조건 `queued`로 추가한다.

이 구조는 attempt versioning을 도입하면 바로 깨진다.

### 1-6. `pending_enqueue`만으로는 초기 row 상태를 표현할 수 없다

`generateUploadUrl()` 시점에 DB row를 먼저 만들기 때문에, 생성 직후 row와 "사용자가 실제로 scheduling을 확정한 row"는 다른 상태여야 한다.

이 문제를 해결하지 않으면:

- fresh row가 이미 active 상태로 간주되어 첫 processing request가 막힌다.
- `pending_enqueue`가 본래 의미를 잃는다.

---

## 2. 상태 모델

### 2-1. `upload_pending`를 추가한다

이번 proposal에서는 `ProcessingStatus`를 아래처럼 확장한다.

```ts
export type ProcessingStatus =
  | "upload_pending"
  | "pending_enqueue"
  | "queued"
  | "processing"
  | "processed"
  | "failed"
  | "no credits";
```

의미는 다음과 같다.

- `upload_pending`
  - presigned URL 발급으로 DB row는 생성됐지만
  - 아직 원본 업로드 및 scheduling request가 확정되지 않은 상태
  - 내부 상태이며 기본적으로 사용자 목록/타임라인에 노출하지 않는다
- `pending_enqueue`
  - processing request는 DB에 durable하게 기록됐지만
  - external dispatch는 아직 보장되지 않은 상태
- `queued`
  - dispatcher가 Inngest event 전송 성공을 확인한 상태
- `processing`
  - worker가 현재 attempt를 실제로 claim한 상태
- `processed`
  - 현재 attempt 성공
- `failed`
  - 현재 attempt 실패
- `no credits`
  - 현재 attempt가 credit 부족으로 종료

### 2-2. 왜 `upload_pending`와 `pending_enqueue`를 분리해야 하는가

이 둘은 의미가 다르다.

- `upload_pending`: row만 존재
- `pending_enqueue`: 처리 요청은 이미 확정

이 둘을 분리해야 다음이 동시에 가능해진다.

- `generateUploadUrl()` 직후 row를 안전하게 만들 수 있다.
- 첫 `requestProcessingAttempt()`가 active-status 충돌 없이 성공한다.
- timeline 첫 visible active state를 `pending_enqueue`로 유지할 수 있다.

### 2-3. visibility 규칙

기본 규칙:

- `upload_pending` row는 main dashboard processing list / detail page / timeline에 기본 노출하지 않는다.
- 사용자에게 보이는 active 상태는 `pending_enqueue`부터 시작한다.

즉 user-visible active status 집합은 아래다.

```ts
const ACTIVE_VISIBLE_STATUSES = [
  "pending_enqueue",
  "queued",
  "processing",
] as const;
```

### 2-4. hidden draft와 recoverable draft를 구분한다

`upload_pending`는 하나의 status지만, operational하게는 아래 둘을 구분한다.

- `upload_pending + uploaded = false`
  - presigned URL은 발급됐지만 원본 source upload 완료 확인이 아직 없는 raw draft
  - 사용자 UI에서는 기본적으로 완전 비노출
  - 단, `uploaded = false`가 source object 부재를 보장하지는 않는다. S3 PUT 성공 후 `confirmUploadCompleted()` commit이 빠진 케이스도 포함될 수 있다.
  - background exact-key probe가 source object 존재를 확인하면 age와 무관하게 `uploaded = true` recoverable draft로 승격된다
  - object가 실제로 없고 `createdAt < now - 24h`일 때만 stale cleanup sweep 대상
- `upload_pending + uploaded = true`
  - 원본 source upload는 끝났지만 scheduling commit이 아직 없는 recoverable draft
  - main processing list / detail / timeline에는 여전히 비노출
  - 대신 dashboard의 별도 `Recoverable Uploads` surface에서만 노출
  - 사용자 액션은 `Resume processing` 또는 `Discard`

즉 `upload_pending`를 숨긴다는 말은 "영구적으로 접근 불가"가 아니라, **main processing 경험에서는 숨기고 recovery surface에서만 다룬다**는 의미다.

---

## 3. 데이터 모델

## 3-1. `UploadedFile`

파일:

- `prisma/schema.prisma`

권장 필드:

```prisma
model UploadedFile {
  id                    String    @id @default(cuid())
  s3Key                 String
  displayName           String?
  uploaded              Boolean   @default(false)
  sourceUploadedAt      DateTime?
  status                String    @default("upload_pending")
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  enqueueRequestedAt    DateTime?
  queuedAt              DateTime?
  processingStartedAt   DateTime?
  terminalStatusAt      DateTime?

  currentAttempt        Int       @default(0)
  lastSuccessfulAttempt Int       @default(0)

  failureCode           String?

  language              String    @default("English")
  targetClipCount       Int       @default(3)
  userId                String

  clips                 Clip[]
  dispatches            ProcessingDispatch[]

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([s3Key])
}
```

필드 의미:

- `enqueueRequestedAt`: 사용자가 scheduling request를 commit한 시각
- `queuedAt`: outbox dispatcher가 Inngest event 전송 성공을 확인한 시각
- `processingStartedAt`: worker가 현재 attempt를 claim한 시각
- `terminalStatusAt`: 현재 attempt가 terminal state가 된 시각
- `sourceUploadedAt`: 원본 media upload 완료를 server가 확인한 시각
- `currentAttempt`: 가장 최근에 요청된 attempt 번호
- `lastSuccessfulAttempt`: UI가 현재 보여 줄 clip 결과 attempt 번호
- `targetClipCount`: 다음/현재 attempt가 목표로 하는 clip 개수
- `failureCode`: `failed` 상태의 세부 원인
  - 예: `dispatch_dead_letter`, `worker_timeout`, `backend_failed`, `no_clips_generated`

중요:

- `updatedAt`은 timeline 계산에 사용하지 않는다.
- `createdAt`은 row 생성 시각일 뿐이며 timeline 본문에서 기본적으로 사용하지 않는다.

### 3-1-1. `uploaded` boolean의 의미를 고정한다

이번 proposal에서 `uploaded`는 아래 의미로만 쓴다.

- `uploaded = false`
  - 원본 source object upload 완료를 server가 아직 확인하지 못한 상태
- `uploaded = true`
  - 원본 source object upload 완료를 확인한 상태

즉 `uploaded`는 아래 의미를 가지면 안 된다.

- processing request가 commit됐는가
- outbox dispatch가 됐는가
- 현재 queue/processing 중인가

이 세 가지는 전부 `status`와 attempt/timestamp 필드가 담당한다.

따라서 아래 규칙을 고정한다.

- `generateUploadUrl({ ..., clipCount })`는 `uploaded = false`, `sourceUploadedAt = null`, `targetClipCount = clipCount` row를 만든다.
- client가 S3 PUT 성공 직후 `confirmUploadCompleted()`를 호출하고, server는 exact `UploadedFile.s3Key` 존재를 확인한 경우에만 `uploaded = true`, `sourceUploadedAt = now`로 바꾼다.
- `requestProcessingAttempt()`는 `uploaded = true`를 전제 조건으로만 사용하고, `uploaded`를 직접 쓰지 않는다.
- main dashboard list visibility는 `uploaded = true`가 아니라 `status != "upload_pending"` 기준으로 판단한다.
- `uploaded = true && status = "upload_pending"`는 유효한 상태이며, 이는 recoverable draft를 의미한다.

## 3-2. `Clip`

clip은 어느 처리 시도에서 생성됐는지 알아야 한다.

```prisma
model Clip {
  id                String   @id @default(cuid())
  s3Key             String
  processingAttempt Int      @default(1)

  startSeconds      Float?
  endSeconds        Float?
  scriptText        String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  youtubeTitle       String?
  youtubeDescription String?
  youtubeHashtags    String?

  uploadedFile   UploadedFile? @relation(fields: [uploadedFileId], references: [id], onDelete: Cascade)
  uploadedFileId String?

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId String

  @@unique([uploadedFileId, processingAttempt, s3Key])
}
```

이 unique index는 방어막이다.

- duplicate dispatch가 있어도 같은 attempt의 동일 clip key는 중복 insert되지 않는다
- `createMany({ skipDuplicates: true })`와 같이 사용하면 한 번 더 안전해진다

generated output 규칙:

- original source file은 기존처럼 `UploadedFile.s3Key`에 유지한다.
- generated clip은 반드시 현재 attempt 전용 prefix 아래에 저장한다.
- 권장 prefix 형태는 아래와 같다.

```ts
const originalPrefix = uploadedFile.s3Key.slice(
  0,
  uploadedFile.s3Key.lastIndexOf("/"),
);
const attemptPrefix = `${originalPrefix}/attempts/${attempt}`;
```

- 예시 generated key:

```text
{originalPrefix}/attempts/{attempt}/clip_0.mp4
{originalPrefix}/attempts/{attempt}/clip_1.mp4
```

- Modal backend request에는 `attempt`와 함께 `output_prefix = attemptPrefix`를 전달한다.
- Modal callback이 반환하는 `clips[].s3Key`도 반드시 현재 `attemptPrefix` 아래 key여야 한다.
- backend metadata가 비어 fallback S3 scan을 사용할 때도 전체 folder가 아니라 현재 `attemptPrefix`만 스캔한다.
- 이 규칙이 없으면 non-destructive reprocess가 실제로는 이전 결과 덮어쓰기와 섞임으로 깨진다.

## 3-3. `ProcessingDispatch`

dispatch는 durable outbox row로 분리한다.

```prisma
model ProcessingDispatch {
  id             String   @id @default(cuid())
  uploadedFileId String
  attempt        Int
  language       String
  clipCount      Int

  status         String   @default("pending") // pending, sending, sent, retryable_failed, dead_letter
  dispatchCount  Int      @default(0)
  lastError      String?

  dispatchedAt   DateTime?
  nextRetryAt    DateTime?
  lockedAt       DateTime?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  uploadedFile UploadedFile @relation(fields: [uploadedFileId], references: [id], onDelete: Cascade)

  @@unique([uploadedFileId, attempt])
  @@index([status, nextRetryAt])
}
```

핵심 포인트:

- `pending` / `retryable_failed` row만 sweep 대상이다
- dispatcher는 먼저 row를 `sending`으로 claim한다
- `lockedAt`으로 stale sending row를 감지할 수 있다

---

## 4. 사용자 액션과 Atomic Claim

### 4-1. `generateUploadUrl()`는 `upload_pending` row를 만든다

현재처럼 presigned URL 발급 시 DB row를 먼저 만드는 구조는 유지한다.

권장 input:

```ts
generateUploadUrl({
  fileName,
  contentType,
  language,
  clipCount,
})
```

server-side validation 규칙:

- `clipCount`는 현재 지원되는 `CLIP_COUNT_OPTIONS` 범위와 일치해야 한다
- `language`는 현재 지원되는 `SUPPORTED_LANGUAGES` 집합 안에 있어야 한다
- invalid input이면 presigned URL을 발급하지 않고 DB row도 생성하지 않는다
- 권장 방식은 `src/fsd/features/upload/model/schemas.ts` 같은 전용 schema를 두거나, 동등한 server validator를 구현하는 것이다

다만 이 시점의 row는 다음 상태여야 한다.

- `status = "upload_pending"`
- `uploaded = false`
- `sourceUploadedAt = null`
- `currentAttempt = 0`
- `lastSuccessfulAttempt = 0`
- `targetClipCount = clipCount`

이 row는 scheduling request가 commit되기 전까지 기본적으로 dashboard/detail에 보이지 않는다.

중요:

- 최초 upload에서 사용자가 고른 `clipCount`는 **row 생성 시점에 이미 durable하게 기록**돼야 한다
- 그래야 S3 PUT 성공 후 `confirmUploadCompleted()`까지만 끝나고 끊겨도, 나중에 recoverable draft를 `Resume processing`할 때 원래 선택한 clip 개수를 그대로 재사용할 수 있다
- 이 durable record 자체도 반드시 server validation을 통과한 값이어야 한다

### 4-2. `confirmUploadCompleted()`로 source upload 완료를 확정한다

client는 S3 PUT 성공 직후 아래 server action을 호출한다.

```ts
confirmUploadCompleted({
  uploadedFileId,
  userId,
})
```

이 helper의 역할은 하나뿐이다.

- `uploaded = true`
- `sourceUploadedAt = now`

를 기록해, original source object upload가 끝났음을 server 기준으로 확정하는 것이다.

권장 규칙:

- `where: { id, userId, status: "upload_pending" }`
- update 전에 exact `UploadedFile.s3Key`에 대해 `HeadObject` 또는 동등한 object existence check를 수행한다
- object가 존재하지 않으면 `SourceObjectNotFoundError`를 반환하고 `uploaded` / `sourceUploadedAt`를 쓰지 않는다
- 이미 `uploaded = true`인 경우 idempotent no-op으로 취급 가능
- S3 PUT 성공 전에 호출되면 안 된다
- `targetClipCount`는 이 단계에서 변경하지 않는다
- `requestProcessingAttempt()`는 반드시 이 helper 성공 이후에만 호출한다

즉 **source upload confirmation**과 **processing scheduling**은 다른 단계다.

권장 구조:

- `confirmUploadCompleted()`는 auth wrapper 역할을 한다
- 실제 exact-key verification + `uploaded = true` / `sourceUploadedAt = now` 기록은 내부 helper로 분리한다
- exact-key `HeadObject` / `objectExists` helper는 `src/fsd/shared/api/s3.ts`에 둔다
- `confirmUploadCompleted()`, raw draft promotion probe, stale raw draft cleanup은 이 shared S3 helper를 재사용해 verification 로직을 중복 구현하지 않는다

#### transport error / timeout 복구 규칙

`confirmUploadCompleted()`도 `requestProcessingAttempt()`와 동일하게 응답 유실을 고려해야 한다.

권장 규칙:

1. client는 S3 PUT 성공 직후 `sourceObjectUploaded = true`, `uploadConfirmationRequested = true` 로컬 플래그를 세운다
2. `confirmUploadCompleted()`를 호출한다
3. transport error / timeout이 나면 즉시 `reconcileUploadConfirmation(uploadedFileId)`를 호출한다
4. reconciliation 결과가 `uploaded = true`면 commit 성공으로 간주하고 다음 단계로 진행한다
5. reconciliation 결과가 `status = "upload_pending" && uploaded = false`면 auto-delete하지 않고 `confirmUploadCompleted()`를 idempotent retry하거나 `Retry source confirmation` CTA만 노출한다
6. reconciliation 자체가 실패해도 안전 쪽으로 치우쳐 row와 source object를 auto-delete하지 않는다
7. `requestProcessingAttempt()`는 direct success 또는 reconciliation을 통해 `uploaded = true`가 확인된 뒤에만 시작한다

권장 helper 예시:

```ts
reconcileUploadConfirmation(uploadedFileId): Promise<{
  status: ProcessingStatus;
  uploaded: boolean;
  sourceUploadedAt: Date | null;
}>
```

### 4-3. `requestProcessingAttempt()`를 도입한다

`processVideo()`와 `reprocessUploadedFile()`는 둘 다 실제 enqueue를 직접 수행하지 않고, 아래 helper를 호출하도록 바꾼다.

```ts
requestProcessingAttempt({
  uploadedFileId,
  userId,
  language,
  clipCount,
})
```

이 helper의 성공 기준은:

- DB transaction이 성공했고
- 새 attempt용 `ProcessingDispatch` row가 durable하게 생성되었는가

이다.

`clipCount` source of truth 규칙:

- 최초 upload에서 UI가 선택한 `clipCount`는 `generateUploadUrl()` 단계에서 바로 `UploadedFile.targetClipCount`로 기록한다.
- 최초 `requestProcessingAttempt()`는 caller input보다 기존 row의 `targetClipCount`를 source of truth로 사용한다.
- 최초 attempt에서 caller가 `clipCount`를 함께 보내는 경우, server는 그 값이 기존 `targetClipCount`와 같을 때만 진행하거나 아예 row 값을 우선 사용해야 한다.
- 아래 pseudo code의 `clipCount`는 raw caller input이 아니라 위 규칙을 거쳐 normalize된 `effectiveClipCount`를 의미한다.
- `effectiveClipCount`는 claim transaction 직전에 한 번 더 `CLIP_COUNT_OPTIONS` 범위로 defensive validation한다.
- `requestProcessingAttempt()` transaction은 reprocess override가 들어온 경우에만 `UploadedFile.targetClipCount = effectiveClipCount`를 다시 기록한다.
- reprocess는 기본적으로 `UploadedFile.targetClipCount`를 다시 사용한다.
- 향후 reprocess UI에서 count override를 열면, 그 override를 `targetClipCount`에 다시 기록한 뒤 새 attempt를 만든다.

### 4-4. claim transaction 규칙

권장 pseudo code:

```ts
await db.$transaction(async (tx) => {
  const claimed = await tx.uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      userId,
      uploaded: true,
      status: {
        notIn: ["pending_enqueue", "queued", "processing"],
      },
    },
    data: {
      status: "pending_enqueue",
      currentAttempt: { increment: 1 },
      enqueueRequestedAt: now,
      queuedAt: null,
      processingStartedAt: null,
      terminalStatusAt: null,
      failureCode: null,
      targetClipCount: clipCount,
    },
  });

  if (claimed.count !== 1) {
    throw new AlreadyProcessingError();
  }

  const file = await tx.uploadedFile.findUniqueOrThrow({
    where: { id: uploadedFileId },
    select: { currentAttempt: true },
  });

  await tx.processingDispatch.create({
    data: {
      uploadedFileId,
      attempt: file.currentAttempt,
      language,
      clipCount,
      status: "pending",
      nextRetryAt: now,
    },
  });
});
```

이 transaction이 해결하는 것:

- 첫 시도는 `upload_pending -> pending_enqueue`로 안전하게 전환
- reprocess는 `processed/failed/no credits -> pending_enqueue`로 안전하게 전환
- active 상태에서 중복 scheduling request는 막음
- 같은 attempt에 대한 dispatch row는 1개만 생성됨
- scheduling이 `uploaded` 의미를 덮어쓰지 않음

### 4-5. `requestProcessingAttempt()` 성공 후 cleanup 규칙

이 transaction이 성공한 순간부터 DB row가 source of truth가 된다.

따라서 frontend는:

- S3 PUT 성공 전까지는 기존 cleanup을 유지해도 됨
- S3 PUT 성공 이후에는 `confirmUploadCompleted()` 단계에서든 `requestProcessingAttempt()` 단계에서든 응답이 실패했다는 이유만으로 row를 auto-delete하면 안 됨
- `requestProcessingAttempt()` 호출이 시작된 이후에는 성공 응답을 받지 못해도 row를 자동 삭제하면 안 됨

즉 `useUploadPodcast.ts`는 아래 규칙으로 바꾼다.

1. S3 PUT 성공 직후 `sourceObjectUploaded = true`, `uploadConfirmationRequested = true`
2. `confirmUploadCompleted()`를 호출
3. `confirmUploadCompleted()`에서 transport error / timeout이 나면 즉시 `reconcileUploadConfirmation(uploadedFileId)`를 호출
4. confirmation이 direct success 또는 reconciliation으로 확정되면 그때 `schedulingRequested = true`
5. `requestProcessingAttempt()`를 호출
6. `finally` cleanup은 `createdFileId != null && sourceObjectUploaded === false && schedulingRequested === false`일 때만 수행
7. `requestProcessingAttempt()`에서 transport error / timeout이 나면 즉시 `reconcileProcessingRequest(uploadedFileId)`를 호출
8. reconciliation 결과가 아래면 commit된 것으로 간주하고 row를 유지한다
   - `pending_enqueue`
   - `queued`
   - `processing`
   - `processed`
   - `failed`
   - `no credits`
9. reconciliation 결과가 `upload_pending && uploaded = true`이면 recoverable draft로 간주하고 `Resume processing` / `Discard`만 허용한다
10. reconciliation 결과가 `upload_pending && uploaded = false`이면 scheduling commit은 안 됐지만 source object는 이미 존재할 수 있으므로 auto-delete하지 않고 explicit cleanup 또는 confirmation retry만 허용한다
11. reconciliation 자체가 실패해도 안전 쪽으로 치우쳐 row를 auto-delete하지 않는다

즉 **"request를 보낸 뒤 응답을 못 받았다"는 이유만으로 delete cleanup을 치면 안 된다.**

권장 helper 예시:

```ts
reconcileProcessingRequest(uploadedFileId): Promise<{
  status: ProcessingStatus;
  uploaded: boolean;
  currentAttempt: number;
}>
```

### 4-6. `upload_pending` recovery path를 별도로 둔다

`upload_pending` row는 main processing UX에서 숨기더라도 recovery path는 반드시 있어야 한다.

규칙:

1. `status = "upload_pending" && uploaded = true` row는 `Recoverable Uploads` query로 따로 조회한다
2. dashboard는 이 row를 main processing list가 아니라 별도 recovery section에서만 보여 준다
3. row별 액션:
   - `Resume processing`
      - `requestProcessingAttempt({ uploadedFileId, language, clipCount: targetClipCount })`
   - `Discard`
       - shared draft cleanup helper를 통해 exact source object 정리 후 row 삭제
4. `status = "upload_pending" && uploaded = false` row는 raw draft로 간주하고 기본적으로 UI에 노출하지 않는다
5. scheduled promotion / cleanup sweep를 둔다
   - raw draft promotion probe:
       - dispatcher periodic sweep와 같은 1분 cadence의 scheduled job에서 함께 처리한다
       - 대상 조건은 `uploaded = false`
       - `createdAt` age gate를 두지 않는다
       - `src/fsd/shared/api/s3.ts`의 shared exact-key probe helper로 `UploadedFile.s3Key` 존재를 확인한다
       - object가 있으면 shared confirmation helper를 통해 `uploaded = true`, `sourceUploadedAt = now`로 승격한다
       - 승격된 row는 다음 dashboard 조회부터 `Recoverable Uploads` section에 노출된다
       - probe나 promotion이 실패하면 row를 남겨 다음 sweep에서 재시도한다
   - stale raw draft cleanup:
       - 대상 조건은 `uploaded = false && createdAt < now - 24h`
       - 같은 shared exact-key probe helper로 `UploadedFile.s3Key` object absent를 확인한 경우에만 row를 삭제한다
       - object가 있으면 cleanup하지 말고 위 promotion 규칙을 우선 적용한다
       - existence check가 실패하면 row를 남겨 다음 sweep에서 재시도한다
   - recoverable draft cleanup:
       - 대상 조건은 `uploaded = true && sourceUploadedAt < now - 7d`
       - 같은 scheduled sweep family에서 함께 처리해도 된다
       - exact `UploadedFile.s3Key`를 삭제한 뒤 row를 삭제한다
       - object delete가 실패하면 row를 남겨 다음 sweep에서 재시도한다

중요:

- `uploaded = false`는 source object가 없다는 증거가 아니다
- 따라서 raw draft 처리는 "promotion first, delete only when absent + stale" 규칙을 따른다
- source object가 있으면 age와 무관하게 recoverable draft로 승격하고, source object가 없고 stale 조건이 만족될 때만 row를 삭제한다
- 사용자 `Discard` action과 background sweep는 동일한 helper를 공유해야 한다

즉 hidden row를 도입하는 대신, **recoverable draft surface + stale draft cleanup**을 같이 구현해야 한다.

---

## 5. Dispatch Pipeline

### 5-1. 사용자 액션은 outbox row만 만든다

사용자 액션은 Inngest에 직접 `send()`하지 않는다.

그 대신:

1. attempt claim
2. outbox row 생성
3. commit
4. commit 후 best-effort dispatch nudge

만 수행한다.

### 5-2. best-effort nudge + periodic sweep를 같이 둔다

dispatcher liveness를 보장하려면 두 경로가 모두 있어야 한다.

1. **best-effort nudge**
   - `requestProcessingAttempt()` 성공 직후 dispatcher를 한 번 깨운다
   - 빠른 반응을 위한 경로다
2. **periodic sweep**
   - Inngest scheduled function 또는 cron 기반 함수가 1분 주기로
   - `pending` / `retryable_failed` / stale `sending` row를 스캔한다
   - nudge가 유실돼도 eventually dispatch가 진행된다
   - Inngest scheduled function으로 구현하면, 새로 추가한 function은 반드시 `src/app/api/inngest/route.ts`의 `serve({ functions: [...] })` 목록에도 등록한다

중요:

- sweep가 없으면 outbox 도입만으로는 liveness가 보장되지 않는다
- 이번 proposal에서는 sweep가 필수 범위다

### 5-3. dispatch row를 먼저 `sending`으로 claim한다

여러 dispatcher가 동시에 같은 row를 잡지 않도록, 먼저 outbox row를 atomically claim해야 한다.

권장 방식:

1. `pending` 또는 `retryable_failed` row를 찾는다
2. `nextRetryAt <= now` 조건을 확인한다
3. `status = "sending"`, `lockedAt = now`로 `updateMany` claim한다
4. `count === 1`인 dispatcher만 실제 `inngest.send()`를 수행한다

stale `sending` row 규칙:

- `lockedAt`이 너무 오래된 row는 sweep가 다시 `retryable_failed`로 되돌린다

### 5-4. dispatch 성공 시 DB에 기록할 것

`send()` 성공 후 같은 transaction에서 아래를 기록한다.

1. `ProcessingDispatch.status = "sent"`
2. `ProcessingDispatch.dispatchedAt = now`
3. `UploadedFile.status = "queued"`
4. `UploadedFile.queuedAt = now`

단, `UploadedFile` update는 아래 조건에서만 성공해야 한다.

- `id = uploadedFileId`
- `currentAttempt = attempt`
- `status = "pending_enqueue"`

즉 stale dispatch가 최신 attempt를 덮지 못하게 해야 한다.

### 5-5. dispatch 실패 시 retry와 dead-letter

`send()` 실패 시:

- `dispatchCount += 1`
- `lastError = error.message`
- `status = "retryable_failed"`
- `nextRetryAt = now + backoff`

권장 backoff:

- exponential backoff with cap
- 예: 30초, 1분, 2분, 5분, 10분

dead-letter 조건 예시:

- `dispatchCount >= 10`
- 또는 `createdAt` 기준 15분 이상 dispatch 실패 지속

dead-letter 처리 시:

1. `ProcessingDispatch.status = "dead_letter"`
2. `UploadedFile.status = "failed"`
3. `UploadedFile.terminalStatusAt = now`
4. `UploadedFile.failureCode = "dispatch_dead_letter"`

이 규칙이 있으면 row가 영구적으로 `pending_enqueue`에 남지 않는다.

---

## 6. Worker Semantics and Idempotency

파일:

- `src/inngest/functions.ts`
- `src/inngest/client.ts`
- `src/app/api/webhooks/modal/route.ts`

### 6-1. 모든 이벤트와 callback에 `attempt`를 포함한다

event payload:

```ts
{
  uploadedFileId,
  userId,
  language,
  clipCount,
  attempt,
}
```

외부 backend 요청 body에도 `attempt`를 포함한다.

Modal callback body와 `modal/video.processed` 이벤트에도 `attempt`를 포함한다.

외부 backend 요청 body는 아래 정보까지 포함한다.

```ts
{
  uploaded_file_id: uploadedFileId,
  s3_key: originalS3Key,
  attempt,
  clip_count: clipCount,
  output_prefix: attemptPrefix,
}
```

이 변경이 필요한 이유:

- 늦게 도착한 이전 attempt callback이 현재 attempt 결과를 덮지 못하게 하기 위해서다

즉 `waitForEvent()` match 기준도:

- `uploadedFileId`
- `attempt`

둘 다 포함해야 한다.

### 6-2. `no credits`는 `processing` 전에 판정한다

timeline 명세상 `no credits`는 `Pending Queue -> Queued -> No Credits`로 보여야 한다.

이 proposal은 credit policy를 아래처럼 명시적으로 고정한다.

- processing admission check는 `credits > 0` 기준이다.
- `no credits`는 dequeue 시점 credits가 `0` 이하일 때만 발생한다.
- `targetClipCount`는 목표 output 개수이지 선차감 예약량이 아니다.
- processing이 끝난 뒤 차감은 기존처럼 `decrementUserCreditsFloorZero(userId, clipsFound)`를 사용한다.
- 따라서 `credits = 1`, `targetClipCount = 3`인 job은 실행될 수 있고, 최종 잔액은 floor-zero로 내려간다.
- 만약 future policy가 `credits >= targetClipCount`를 요구한다면, 그건 별도 billing change다.

이 policy를 전제로 worker 흐름은 아래 순서여야 한다.

1. `queued` 상태의 row context를 읽는다
2. credits를 확인한다
3. 부족하면 `queued -> no credits`를 atomically 수행한다
4. 충분하면 그때 `queued -> processing` claim을 한다

즉 `no credits`는 `processingStartedAt` 없이 terminal state가 된다.

### 6-3. `queued -> processing`은 atomic claim이어야 한다

권장 pseudo code:

```ts
const claimed = await db.uploadedFile.updateMany({
  where: {
    id: uploadedFileId,
    currentAttempt: attempt,
    status: "queued",
  },
  data: {
    status: "processing",
    processingStartedAt: now,
    failureCode: null,
  },
});

if (claimed.count !== 1) {
  return; // duplicate dispatch or stale attempt
}
```

### 6-4. Inngest retry와 duplicate event는 다른 문제다

이 둘은 구분해서 설계해야 한다.

1. **같은 Inngest function run의 retry/resume**
   - stable `step.run()` / `step.waitForEvent()` id를 사용한다
   - Inngest step memoization이 동일 run의 중복 side effect를 줄여 준다
2. **outbox duplicate dispatch로 생성된 별도 event**
   - `attempt`와 atomic claim으로 no-op 처리한다

즉 "duplicate event는 no-op" 규칙은

- outbox duplicate send에 대한 규칙이지
- Inngest 내부 resume를 대체하는 규칙이 아니다

### 6-5. terminal update도 attempt-aware해야 한다

예시:

```ts
await db.uploadedFile.updateMany({
  where: {
    id: uploadedFileId,
    currentAttempt: attempt,
    status: "processing",
  },
  data: {
    status: "processed",
    terminalStatusAt: now,
    lastSuccessfulAttempt: attempt,
    failureCode: null,
  },
});
```

`failed` 처리 예시:

```ts
await db.uploadedFile.updateMany({
  where: {
    id: uploadedFileId,
    currentAttempt: attempt,
    status: "processing",
  },
  data: {
    status: "failed",
    terminalStatusAt: now,
    failureCode: "backend_failed",
  },
});
```

`no credits`에서는 `lastSuccessfulAttempt`를 건드리지 않는다.

### 6-6. `clipsFound === 0`은 success promotion이 아니다

현재 attempt에서 실제로 저장된 clip이 0개라면 `processed`로 승격하면 안 된다.

규칙:

- backend metadata 결과가 비어 있고
- fallback S3 scan 결과도 0개라면
- `processing -> failed`로 종결한다
- `failureCode = "no_clips_generated"`
- `lastSuccessfulAttempt`는 유지한다

즉 "처리 API 호출은 성공했지만 사용자에게 보여 줄 결과는 없는 상태"는 reprocess 성공으로 취급하지 않는다.

권장 pseudo code:

```ts
if (clipsFound === 0) {
  await db.uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
      status: "processing",
    },
    data: {
      status: "failed",
      terminalStatusAt: now,
      failureCode: "no_clips_generated",
    },
  });

  return;
}
```

### 6-7. 새 clip은 모두 `processingAttempt = attempt`로 저장한다

`createClipsBulk()` 입력에 `processingAttempt`를 추가한다.

또한 다음 형태로 바꾼다.

```ts
createMany({
  data,
  skipDuplicates: true,
})
```

### 6-8. stale `processing` 복구 job을 둔다

worker가 `processing`으로 claim한 뒤 비정상 종료되면 row가 영구 `processing`으로 남을 수 있다.

이를 막기 위해 scheduled recovery job을 추가한다.

권장 규칙:

- `processingStartedAt < now - 2h`
- `status = "processing"`

인 row는:

- `status = "failed"`
- `terminalStatusAt = now`
- `failureCode = "worker_timeout"`

으로 전환한다.

이 job도 이번 proposal의 범위에 포함한다.

---

## 7. Reprocess Strategy

### 7-1. reprocess는 non-destructive여야 한다

새 규칙:

1. 기존 성공 clip과 생성 결과를 먼저 지우지 않는다
2. 새 attempt를 `pending_enqueue`로 claim한다
3. 새 attempt가 성공하면 `lastSuccessfulAttempt`를 promotion한다
4. 그 이후에만 이전 attempt clip cleanup을 비동기로 할 수 있다

### 7-2. reprocess output도 attempt 단위로 분리한다

reprocess가 truly non-destructive가 되려면 DB row만 versioning해서는 부족하다.

추가 규칙:

- 새 attempt output은 반드시 새 `attemptPrefix`에 쓴다.
- 이전 attempt가 사용하던 prefix를 재사용하지 않는다.
- fallback S3 scan도 새 `attemptPrefix`만 읽는다.
- success 이후 old attempt cleanup이 필요하면 `processingAttempt < lastSuccessfulAttempt`인 clip row와 해당 prefix를 비동기로 정리한다.

즉 "reprocess 중 이전 결과를 유지한다"는 말은 DB row뿐 아니라 S3 object namespace 수준에서도 보장되어야 한다.

### 7-3. upfront delete 금지

reprocess 시작 시 즉시 금지할 것:

- `deleteClipsByUploadedFileId(...)`
- 기존 generated clip S3 삭제

이 둘은 새 attempt 성공 전에는 수행하지 않는다.

### 7-4. UI가 보여 줄 clip 기준

detail page와 dashboard는 모두:

- `processingAttempt === lastSuccessfulAttempt`

인 clip만 사용자에게 보여 준다.

이렇게 해야:

- 새 attempt 진행 중에도 이전 성공 결과를 계속 볼 수 있다
- 새 attempt 실패 시에도 결과가 보존된다
- 새 attempt 성공 시에만 결과가 전환된다

---

## 8. Read Path

### 8-1. detail read는 두 단계로 나눈다

Prisma relation filter 안에서 부모 row의 `lastSuccessfulAttempt`를 직접 참조하는 형태는 literal하게 구현하지 않는다.

따라서 `getUploadedFileDetailsById()`는 두 단계로 나눈다.

1. `UploadedFile` 메타데이터 조회
2. `lastSuccessfulAttempt` 값을 사용해 `Clip.findMany()` 수행

예시:

```ts
const file = await db.uploadedFile.findUniqueOrThrow({
  where: { id: uploadedFileId, userId },
  select: {
    id: true,
    displayName: true,
    createdAt: true,
    status: true,
    enqueueRequestedAt: true,
    queuedAt: true,
    processingStartedAt: true,
    terminalStatusAt: true,
    currentAttempt: true,
    lastSuccessfulAttempt: true,
    language: true,
  },
});

if (file.status === "upload_pending") {
  throw new HiddenUploadDraftError();
}

const clips =
  file.lastSuccessfulAttempt > 0
    ? await db.clip.findMany({
        where: {
          uploadedFileId: file.id,
          processingAttempt: file.lastSuccessfulAttempt,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
```

route 처리 규칙:

- `HiddenUploadDraftError`는 최종적으로 `notFound()` 또는 dashboard redirect로 매핑한다.
- `src/app/dashboard/uploads/[uploadedFileId]/page.tsx`는 `getUploadedFileDetails()`가 던진 `HiddenUploadDraftError`를 catch해 `notFound()`로 변환해야 한다.
- 즉 id를 직접 알고 있어도 `upload_pending` row는 detail page를 렌더링하지 않는다.

### 8-2. main dashboard summary는 `uploaded`가 아니라 `status` 기준으로 필터링한다

main processing list는 아래 조건을 사용한다.

```ts
where: {
  userId,
  status: {
    not: "upload_pending",
  },
}
```

즉 list visibility는 `uploaded = true`가 아니라 `status != "upload_pending"`가 source of truth다.

### 8-3. recoverable draft query를 별도로 둔다

main processing list와 별도로 아래 query를 둔다.

```ts
listRecoverableUploadDraftsByUserId(userId)
```

권장 조건:

```ts
where: {
  userId,
  status: "upload_pending",
  uploaded: true,
}
```

권장 select:

- `id`
- `displayName`
- `language`
- `targetClipCount`
- `sourceUploadedAt`

이 query 결과는 dashboard의 별도 `Recoverable Uploads` section에서만 사용한다.

### 8-4. dashboard summary도 두 단계로 계산한다

기존 `_count.clips`는 attempt versioning과 맞지 않는다.

따라서 summary query도 두 단계로 계산한다.

1. 파일 목록 조회
   - `id`
   - `status`
   - `createdAt`
   - `lastSuccessfulAttempt`
2. clip groupBy
   - `by: ["uploadedFileId", "processingAttempt"]`
3. 각 파일의 `lastSuccessfulAttempt`에 해당하는 count만 매핑

### 8-5. `UploadedFileSummary`에서 의미를 명시적으로 바꾼다

현재 `clipsCount`는 "전체 clip 수"처럼 읽힌다.

attempt versioning 이후에는 의미가 달라지므로 아래 중 하나를 택한다.

1. 권장: 필드명을 `visibleClipsCount`로 변경
2. 차선: `clipsCount` 이름은 유지하되 주석/타입 문서로 "current visible attempt clip count"라고 못 박기

이번 proposal에서는 **`visibleClipsCount`로 이름 변경**을 권장한다.

영향 파일 예시:

- `src/fsd/entities/uploaded-file/model/types.ts`
- `src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx`
- `src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx`

### 8-6. optimistic row도 `pending_enqueue`를 써야 한다

현재 optimistic row는 `status: "queued"`로 추가된다.

이 proposal 이후에는 아래처럼 바꾼다.

```ts
const optimisticFile: UploadedFileSummary = {
  id: `optimistic-${Date.now()}`,
  fileName: file.name,
  status: "pending_enqueue",
  createdAt: new Date(),
  visibleClipsCount: 0,
};
```

### 8-7. hidden row 규칙

`upload_pending` row는 기본적으로:

- main dashboard list 비노출
- detail route 비노출
- timeline 비노출

단, `uploaded = true`인 row는 dashboard의 dedicated `Recoverable Uploads` section에서만 예외적으로 노출할 수 있다.

즉 presigned URL만 발급되고 scheduling이 안 된 row는 사용자 처리 목록의 일부로 취급하지 않는다.

---

## 9. Timeline Rendering Rules

timeline은 "현재 attempt의 실제 event"만 렌더링한다.

### 9-1. event key

```ts
type TimelineEventKey =
  | "pendingEnqueue"
  | "queued"
  | "processing"
  | "processed"
  | "failed"
  | "noCredits";
```

### 9-2. timestamp source

| event | timestamp |
|---|---|
| `Pending Queue` | `enqueueRequestedAt` |
| `Queued` | `queuedAt` |
| `Processing` | `processingStartedAt` |
| `Processed` | `terminalStatusAt` |
| `Failed` | `terminalStatusAt` |
| `No Credits` | `terminalStatusAt` |

`createdAt`, `updatedAt`은 timeline에서 사용하지 않는다.

### 9-3. status별 visible event

| status | event sequence |
|---|---|
| `upload_pending` | 기본 비노출 |
| `pending_enqueue` | `Pending Queue` |
| `queued` | `Pending Queue -> Queued` |
| `processing` | `Pending Queue -> Queued -> Processing` |
| `processed` | `Pending Queue -> Queued -> Processing -> Processed` |
| `failed` | 아래 세 경우 중 하나 |
| `no credits` | `Pending Queue -> Queued -> No Credits` |

`failed`의 경우:

1. `Pending Queue -> Failed`
   - dispatch dead-letter
2. `Pending Queue -> Queued -> Failed`
   - queued 이후 processing 시작 전 실패
3. `Pending Queue -> Queued -> Processing -> Failed`
   - 실제 처리 시작 후 실패

즉 `failed`는 `queuedAt`, `processingStartedAt`, `failureCode` 조합으로 렌더링한다.

### 9-4. `ProcessingTimelineProps`

권장 props:

```ts
interface ProcessingTimelineProps {
  status: ProcessingStatus;
  enqueueRequestedAt: Date | null;
  queuedAt: Date | null;
  processingStartedAt: Date | null;
  terminalStatusAt: Date | null;
  failureCode: string | null;
}
```

### 9-5. style 규칙

| state | icon | style |
|---|---|---|
| `completed` | `CheckCircle2` | `border-primary bg-primary/10 text-primary` |
| `current` | `Clock` | `border-primary/40 bg-background text-primary` |
| `error` | `AlertTriangle` | `border-destructive bg-destructive/10 text-destructive` |

---

## 10. Frontend Behavior

### 10-1. upload flow cleanup

파일:

- `src/fsd/pages/dashboard/model/useUploadPodcast.ts`

새 규칙:

- `createdFileId` 자동 정리는 S3 PUT 성공 전 raw draft 구간까지만 허용한다
- `generateUploadUrl()` 호출 시 `clipCount`를 함께 전달해 `targetClipCount`를 row 생성 시점에 먼저 기록한다
- `generateUploadUrl()`는 `clipCount`와 `language`를 server-side validation한 뒤에만 presigned URL과 draft row를 만든다
- S3 PUT 성공 전까지만 기존 cleanup 유지 가능
- S3 PUT 성공 직후 `confirmUploadCompleted(uploadedFileId)`를 먼저 호출
- `confirmUploadCompleted()`는 server-side object existence verification을 통과한 경우에만 `uploaded = true`로 올린다
- `confirmUploadCompleted()` transport error 시 `reconcileUploadConfirmation(uploadedFileId)`로 source confirmation commit 여부를 다시 읽음
- reconciliation 결과가 `upload_pending && uploaded = false`이면 auto-delete하지 않고 `confirmUploadCompleted()` retry 또는 explicit cleanup만 허용
- `requestProcessingAttempt()` 호출을 시작한 뒤에는 응답이 실패해도 row를 auto-delete하지 않음
- `confirmUploadCompleted()` 성공 이후 또는 `requestProcessingAttempt()` 시작 이후에는 client `finally` cleanup으로 row를 삭제하지 않는다
- transport error 시 `reconcileProcessingRequest(uploadedFileId)`로 server 상태를 다시 읽음
- reconciliation 결과가 `upload_pending && uploaded = true`이면 `Recoverable Uploads` section 또는 retry CTA로 유도
- reconciliation 결과가 `upload_pending && uploaded = false`이면 source object가 이미 존재할 수 있으므로 explicit cleanup 또는 confirmation retry만 허용
- reconciliation 결과가 active/terminal 상태면 `createdFileId = null`로 전환하고 row를 유지
- 그 이후에는 dispatcher나 queue 전환이 늦어져도 row를 삭제하지 않음
- 사용자가 페이지를 떠나 raw draft가 남더라도, 1분 주기 background raw-draft promotion sweep가 age와 무관하게 source object 존재를 확인하면 이후 `Recoverable Uploads` section에서 다시 복구할 수 있어야 한다

### 10-2. dashboard status config

`STATUS_CONFIG`에 아래를 추가한다.

- `pending_enqueue: { label: "Pending Queue", ... }`

`upload_pending`는 기본적으로 사용자에게 보여 주지 않으므로 config에 없어도 된다.

### 10-3. recoverable draft section을 둔다

dashboard page는 main processing list와 별도로 `Recoverable Uploads` section을 둔다.

구현 책임:

- `src/app/dashboard/page.tsx`
  - main list query와 별도로 `listRecoverableUploadDraftsByUserId(userId)`를 호출한다
  - `DashboardView`에 `recoverableDrafts` prop을 함께 전달한다
- `src/fsd/pages/dashboard/ui/index.tsx`
  - `recoverableDrafts`를 받도록 props를 확장한다
  - upload optimistic state는 main processing list에만 적용하고, recoverable draft는 server truth 기준으로 렌더링한다
  - `Recoverable Uploads` section과 main processing list를 분리 렌더링한다
- `src/fsd/pages/dashboard/ui/_component/RecoverableUploadDrafts.tsx`
  - `Resume processing` / `Discard` CTA를 담당하는 전용 component로 분리하는 것을 권장한다

표시 대상:

- `status = "upload_pending"`
- `uploaded = true`

즉 원래 raw draft였더라도, background promotion sweep가 source object 존재를 확인해 `uploaded = true`로 승격한 row는 이 section에서 복구 가능해야 한다.

row별 action:

- `Resume processing`
- `Discard`

이 section은 `STATUS_CONFIG` badge와 섞지 않는다. processing timeline이 아니라 draft recovery UX이기 때문이다.

### 10-4. active detail polling

detail page는 아래 상태에서 polling한다.

```ts
const ACTIVE_STATUSES = ["pending_enqueue", "queued", "processing"] as const;
```

권장 구현:

- `useEffect`
- `setInterval`
- interval 내부에서 `startTransition(() => router.refresh())`
- terminal 상태가 되면 polling 중지

5~10초 간격을 권장한다.

### 10-5. active delete는 막는다

이번 proposal 범위에서는 active attempt cancellation flow를 새로 도입하지 않는다.

따라서 아래 상태에서는 delete를 금지한다.

- `pending_enqueue`
- `queued`
- `processing`

구현 규칙:

- `UploadedFileActions`에서 delete button / menu를 disabled 처리
- `deleteUploadedFileWithClips()` server action도 active status면 실패를 반환
- active row 삭제가 필요하면 별도 attempt-aware cancellation proposal로 분리한다

### 10-6. visible attempt clip delete는 막는다

이번 proposal은 `lastSuccessfulAttempt`를 "현재 사용자에게 보여 주는 유일한 성공 attempt"로 유지한다.

따라서 detail page에 현재 노출되는 clip에 대해서는 user-facing delete를 허용하지 않는다.

구현 규칙:

- `ClipDisplay` / `ClipActions`에서 delete action을 비활성화한다
- `deleteClip(clipId)` server action도 아래 조건이면 실패를 반환한다
  - `clip.processingAttempt === uploadedFile.lastSuccessfulAttempt`
- 현재 detail view는 visible attempt clip만 보여 주므로, 결과적으로 user-facing per-clip delete는 이 proposal 범위에서는 꺼진다

만약 future에 clip curation UX를 다시 열고 싶다면, `lastSuccessfulAttempt` fallback/demotion 규칙을 포함한 별도 proposal이 필요하다

---

## 11. Migration and Backfill

### 11-1. schema migration

추가 항목:

- `UploadedFile.sourceUploadedAt`
- `UploadedFile.enqueueRequestedAt`
- `UploadedFile.queuedAt`
- `UploadedFile.processingStartedAt` 유지
- `UploadedFile.terminalStatusAt`
- `UploadedFile.currentAttempt`
- `UploadedFile.lastSuccessfulAttempt`
- `UploadedFile.failureCode`
- `UploadedFile.targetClipCount`
- `Clip.processingAttempt`
- `ProcessingDispatch` 신규 테이블
- `Clip` unique index `[uploadedFileId, processingAttempt, s3Key]`

그리고 migration 후 반드시 Prisma client를 regenerate한다.

### 11-2. legacy backfill 기본 원칙

권장 기본값:

- 기존 row는 `currentAttempt = 1`
- 기존 clip은 `processingAttempt = 1`
- clip이 하나 이상 있으면 `lastSuccessfulAttempt = 1`, 아니면 `0`
- 기존 row의 `targetClipCount`는 가능한 clip count로 근사한다
  - legacy clip이 하나 이상 있으면 그 clip 수를 사용
  - 없으면 기본값 `3`
- 기존 row의 `uploaded = true`이면 `sourceUploadedAt`는 `COALESCE(createdAt, updatedAt)` 근사치로 backfill한다

### 11-3. legacy 상태 정규화

현재 데이터는 `uploaded`와 `status` 의미가 완전히 일치하지 않을 수 있다.

따라서 backfill은 보수적으로 수행한다.

권장 규칙:

1. `uploaded = false`
2. `processingStartedAt IS NULL`
3. clip 없음
4. terminal status도 아님

이면 `upload_pending`로 본다.

그 외:

- active/terminal row는 가능한 기존 의미를 보존
- timestamp는 근사치로만 backfill

예시 SQL 방향:

```sql
UPDATE "UploadedFile" uf
SET "status" = 'upload_pending'
WHERE uf."uploaded" = false
  AND uf."processingStartedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Clip" c
    WHERE c."uploadedFileId" = uf."id"
  )
  AND uf."status" NOT IN ('processed', 'failed', 'no credits');
```

timestamp backfill은 근사치다.

```sql
UPDATE "UploadedFile"
SET "sourceUploadedAt" = COALESCE("sourceUploadedAt", "createdAt", "updatedAt")
WHERE "uploaded" = true;
```

```sql
UPDATE "UploadedFile"
SET "enqueueRequestedAt" = COALESCE("enqueueRequestedAt", "createdAt")
WHERE "status" IN ('pending_enqueue', 'queued', 'processing', 'processed', 'failed', 'no credits');
```

```sql
UPDATE "UploadedFile"
SET "queuedAt" = CASE
  WHEN "status" IN ('queued', 'processing', 'processed', 'failed', 'no credits')
    THEN COALESCE("queuedAt", "createdAt")
  ELSE "queuedAt"
END;
```

```sql
UPDATE "UploadedFile"
SET "terminalStatusAt" = CASE
  WHEN "status" IN ('processed', 'failed', 'no credits')
    THEN COALESCE("terminalStatusAt", "updatedAt")
  ELSE "terminalStatusAt"
END;
```

중요:

- legacy backfill은 근사치다
- migration 이후 새 flow에서는 `updatedAt`을 timeline 근거로 사용하지 않는다

---

## 12. 구현 범위

필수 수정 파일:

- `prisma/schema.prisma`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/uploads/[uploadedFileId]/page.tsx`
- `src/fsd/entities/uploaded-file/model/processing-status.ts`
- `src/fsd/entities/uploaded-file/model/types.ts`
- `src/fsd/entities/uploaded-file/api/index.ts`
- `src/fsd/entities/clip/api/index.ts`
- `src/fsd/features/clip/api/index.ts`
- `src/fsd/features/clip/model/schemas.ts`
- `src/fsd/features/upload/api/index.ts`
- `src/fsd/features/upload/ui/index.tsx`
- `src/fsd/shared/api/s3.ts`
- `src/inngest/client.ts`
- `src/inngest/functions.ts`
- `src/app/api/inngest/route.ts`
- `src/app/api/webhooks/modal/route.ts`
- `src/fsd/pages/dashboard/ui/index.tsx`
- `src/fsd/pages/upload-detail/ui/index.tsx`
- `src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx`
- `src/fsd/pages/dashboard/model/useUploadPodcast.ts`
- `src/fsd/pages/dashboard/config/index.ts`
- `src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx`
- `src/fsd/widgets/clip-display/ui/index.tsx`
- `src/fsd/widgets/clip-display/ui/_component/ClipActions.tsx`
- `src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx`

추가 생성 가능 파일:

- `src/fsd/entities/processing-dispatch/api/index.ts`
- `src/fsd/entities/processing-dispatch/model/types.ts`
- `src/fsd/features/processing-dispatch/...`
- `src/fsd/features/upload/model/schemas.ts`
- `src/fsd/pages/dashboard/ui/_component/RecoverableUploadDrafts.tsx`

---

## 13. 구현 순서

1. schema에 `upload_pending`, attempt, timestamp, `sourceUploadedAt`, failureCode, `targetClipCount`, dispatch 모델 추가
2. Prisma migration 생성 및 client regenerate
3. `generateUploadUrl()` server validation을 추가해 `clipCount` / `language` invalid input이면 presigned URL과 row를 만들지 않도록 수정
4. `generateUploadUrl()` signature와 row creation을 바꿔 최초 `clipCount`를 즉시 `targetClipCount`로 기록
5. `src/fsd/shared/api/s3.ts`에 exact source object `HeadObject` / `objectExists` helper를 추가한다
6. `confirmUploadCompleted()`를 위 shared S3 helper 기반 exact source object verification + idempotent confirmation helper로 구현
7. `reconcileUploadConfirmation()`를 추가해 confirmation transport-error 복구 규칙을 구현
8. `requestProcessingAttempt()`를 `uploaded = true` precondition + stored `targetClipCount` source-of-truth + defensive validation 규칙 기반으로 구현
9. `Clip` unique index, `processingAttempt`, attempt별 generated output prefix 규칙 반영
10. `ProcessingDispatch` entity API와 dispatcher sweep / dead-letter 처리 추가
11. `src/fsd/features/clip/api/index.ts`와 `src/fsd/features/upload/api/index.ts`의 direct enqueue를 모두 제거하고 request creation + outbox dispatch 방식으로 교체
12. `reprocessUploadedFile()`를 non-destructive attempt creation 방식으로 교체하고 `targetClipCount`를 재사용하도록 수정
13. upload flow client를 `confirmUploadCompleted()` reconciliation + `requestProcessingAttempt()` reconciliation-aware cleanup 방식으로 수정하고, source confirmation 이후 `finally` auto-delete를 제거
14. draft `Discard` helper를 exact source object cleanup 순서로 구현
15. raw draft promotion probe를 dispatcher periodic sweep와 같은 1분 cadence로 붙이고, shared S3 helper 기반으로 age와 무관하게 "object exists -> recoverable draft promotion" 규칙을 구현
16. stale raw draft cleanup은 같은 shared S3 helper로 `object absent + createdAt < now - 24h`를 확인했을 때만 row delete 하도록 별도 분기 구현
17. recoverable draft query / dashboard section / stale recoverable draft cleanup sweep 추가
18. `src/app/dashboard/page.tsx`, `src/fsd/pages/dashboard/ui/index.tsx`에 recovery section wiring 추가
19. Inngest event payload, external backend request, Modal callback payload에 `attempt`와 `output_prefix`를 반영하고, wait/match key도 `uploadedFileId + attempt` 기준으로 교체
20. worker를 credit-first + attempt-aware + idempotent start 방식으로 수정
21. `clipsFound === 0`을 `failed + no_clips_generated`로 처리
22. stale processing recovery job 추가
   - dispatcher sweep / raw draft promotion sweep / stale processing recovery job을 Inngest scheduled function으로 구현했다면, `src/app/api/inngest/route.ts`의 `serve({ functions: [...] })` 목록에 새 function들을 모두 등록한다
23. detail read를 two-step query + `upload_pending` `notFound` guard 방식으로 변경
24. `src/app/dashboard/uploads/[uploadedFileId]/page.tsx`에 `HiddenUploadDraftError -> notFound()` 매핑 추가
25. dashboard main list를 `status != "upload_pending"` 기준으로 변경하고, 기존 `uploaded = true` 필터 의존을 제거
26. dashboard summary를 visible attempt count 방식으로 변경
27. `UploadedFileSummary.clipsCount`를 `visibleClipsCount`로 변경
28. optimistic row status를 `pending_enqueue`로 변경
29. timeline, `ProcessingStatus` union, `STATUS_CONFIG`를 current attempt event 기반으로 함께 교체
30. active detail polling 추가
31. active file delete UI / server guard 추가
32. visible attempt clip delete UI / server guard 추가
33. backfill 실행

---

## 14. 수동 검증 체크리스트

1. 새 upload row는 생성 직후 `upload_pending`이며 dashboard/detail에 보이지 않아야 한다.
2. 첫 `requestProcessingAttempt()`가 `upload_pending -> pending_enqueue`로 정상 전환되어야 한다.
3. 같은 파일에 대해 거의 동시에 두 번 scheduling 요청을 보내도 하나만 성공해야 한다.
4. `ProcessingDispatch`는 `(uploadedFileId, attempt)`당 한 row만 생성되어야 한다.
5. best-effort nudge가 실패해도 periodic sweep가 eventually dispatch를 수행해야 한다.
6. dispatch가 반복 실패하면 row가 영구 `pending_enqueue`에 머무르지 않고 `failed + dispatch_dead_letter`로 종결되어야 한다.
7. `no credits`는 `Pending Queue -> Queued -> No Credits`로 보여야 하고 `processingStartedAt`이 없어야 한다.
8. duplicate dispatch event가 들어와도 `processingStartedAt`이 두 번 찍히면 안 된다.
9. Modal callback이 늦게 도착해도 다른 attempt를 덮지 않도록 `attempt` match가 동작해야 한다.
10. reprocess 시작 후에도 이전 성공 clip이 계속 보여야 한다.
11. reprocess 실패 시 이전 성공 clip이 유지되어야 한다.
12. reprocess 성공 시 `lastSuccessfulAttempt`가 새 attempt로 넘어가야 한다.
13. dashboard clip count는 전체 clip 수가 아니라 visible attempt clip 수를 보여야 한다.
14. optimistic row는 `queued`가 아니라 `pending_enqueue`로 보여야 한다.
15. active detail page는 polling으로 상태가 자동 갱신되어야 한다.
16. stale `processing` row는 recovery job으로 `failed + worker_timeout`으로 정리되어야 한다.
17. request scheduling 응답이 유실돼도 client finally cleanup이 row를 삭제하지 않고 reconciliation이 동작해야 한다.
18. backend가 생성한 clip `s3Key`는 모두 현재 `attemptPrefix` 아래에 있어야 한다.
19. reprocess는 이전 `targetClipCount`를 기본값으로 재사용해야 한다.
20. 최초 upload에서 사용자가 선택한 `clipCount`는 `generateUploadUrl()` 직후 row의 `targetClipCount`에 기록되어야 한다.
21. source upload confirmation 이후 scheduling 전에 끊겨 recoverable draft가 되더라도, `Resume processing`은 최초 사용자가 선택한 `targetClipCount`를 그대로 재사용해야 한다.
22. `generateUploadUrl()`는 invalid `clipCount` 또는 unsupported `language`를 받으면 presigned URL과 draft row를 만들지 않아야 한다.
23. `requestProcessingAttempt()`는 stored `targetClipCount`를 사용하더라도 claim 직전에 같은 범위 제약으로 defensive validation해야 한다.
24. raw draft promotion sweep는 dispatcher periodic sweep와 같은 1분 cadence로 실행되어, source object가 있는 hidden raw draft를 age와 무관하게 빠르게 recoverable draft로 승격해야 한다.
25. stale raw draft cleanup은 `createdAt < now - 24h`만으로 row를 삭제하면 안 되고, exact source object absent가 확인된 경우에만 동작해야 한다.
26. stale raw draft(`upload_pending && uploaded = false`)에 exact source object가 실제로 존재하면 row를 삭제하지 말고 recoverable draft로 승격해야 한다.
27. raw draft promotion으로 `uploaded = true`가 된 row는 이후 dashboard `Recoverable Uploads` section에서 보여야 한다.
28. `credits = 0`이면 `queued -> no credits`로 끝나고, `credits = 1 / targetClipCount = 3`이면 processing이 시작되어야 한다.
29. `clipsFound = 0`이면 `processed`가 아니라 `failed + no_clips_generated`가 되어야 하고 이전 `lastSuccessfulAttempt`는 유지되어야 한다.
30. active 상태에서는 delete action이 disabled되고 server action도 삭제를 거부해야 한다.
31. `upload_pending && uploaded = true` row는 main list가 아니라 `Recoverable Uploads` section에서만 보여야 한다.
32. S3 PUT 성공 후 `confirmUploadCompleted()` 응답이 유실돼도 `reconcileUploadConfirmation()` 또는 idempotent retry로 `uploaded` commit 여부를 복구할 수 있어야 한다.
33. `confirmUploadCompleted()`는 exact `UploadedFile.s3Key` object가 실제로 존재할 때만 `uploaded = true`로 바꿔야 한다.
34. stale raw draft와 stale recoverable draft 정리 규칙은 둘 다 source object 존재 여부를 먼저 확인한 뒤 동작해야 한다.
35. raw draft / recoverable draft `Discard`는 둘 다 source object cleanup이 성공했거나 object 부재가 확인된 뒤에만 row를 삭제해야 한다.
36. `uploaded`는 `confirmUploadCompleted()` 이후에만 `true`가 되고, `requestProcessingAttempt()`는 그 값을 다시 쓰지 않아야 한다.
37. `upload_pending` row에 대한 direct detail route 접근은 `notFound` 또는 dashboard redirect로 막혀야 한다.
38. 현재 detail page에 보이는 clip의 delete action은 disabled되어야 하고, server action direct 호출도 거부되어야 한다.
39. dispatcher sweep / raw draft promotion sweep / stale processing recovery job을 Inngest scheduled function으로 구현했다면, `src/app/api/inngest/route.ts`의 `serve({ functions: [...] })`에 해당 function들이 모두 등록되어 실제로 실행 가능해야 한다.
40. user-triggered server action 경로(`src/fsd/features/clip/api/index.ts`, `src/fsd/features/upload/api/index.ts`)에 direct `inngest.send()`가 더 이상 남아 있지 않아야 한다.
41. `reprocessUploadedFile()`는 `clipCount: 3` 같은 하드코드를 사용하지 않고, 저장된 `targetClipCount`만 재사용해야 한다.
42. generated clip fallback scan / cleanup / delete cleanup은 전체 upload folder가 아니라 현재 `attemptPrefix` 범위만 읽고 지워야 한다.
43. `ProcessingStatus` union, `STATUS_CONFIG`, optimistic row status, queue badge, detail timeline이 모두 새 상태 집합(`upload_pending`, `pending_enqueue`, `queued`, `processing`, `processed`, `failed`, `no credits`)을 일관되게 반영해야 한다.
44. dashboard summary/detail read-path는 더 이상 `uploaded = true`, `_count.clips`, 전체 `clips` relation read에 의존하지 않고 visible attempt 기준 조회만 사용해야 한다.
45. 이 proposal 구현 완료 판정은 "타임라인 UI가 바뀌었다"가 아니라 `0-5. 구현 완료 판정 기준` 10개 항목을 모두 만족하는지로 한다.
46. `src/fsd/pages/dashboard/model/useUploadPodcast.ts`는 더 이상 optimistic status를 `queued`로 두지 않고, source upload/process request 이후 `finally`에서 row 삭제를 호출하지 않아야 한다.
47. `src/fsd/features/upload/api/index.ts`의 `generateUploadUrl()`는 `clipCount`를 입력/검증/저장해야 하고, `reprocessUploadedFile()`는 기존 clip/S3 선삭제와 direct `inngest.send()`를 제거해야 한다.
48. `src/inngest/functions.ts`와 `src/app/api/webhooks/modal/route.ts`는 request/callback/wait matching 전부에서 `attempt`를 포함해야 하며, fallback scan도 flat `clip_*.mp4` 가정을 제거해야 한다.
49. `prisma/schema.prisma`는 `upload_pending` 기본 상태, attempt/timestamp 필드, `ProcessingDispatch`, `Clip.processingAttempt`, attempt-aware uniqueness를 모두 포함해야 한다.
50. proposal 기준 최종 판정은 `0-7. 리뷰 판정 규칙`을 따르며, baseline 충돌이 하나라도 남아 있으면 "문제 없음"으로 판정하지 않는다.
51. 현재 코드 감사에서 새로 발견된 문제는 모두 `0-8. 현재 코드 감사 결과 최종 정리` 범주 안에 포함되어야 하며, 이 범주 밖의 추가 설계 이슈가 없다면 proposal scope는 충분한 것으로 본다.

---

## 15. 비목표

이번 proposal에서 하지 않는 것:

- 전체 도메인을 event sourcing으로 재작성
- websocket / SSE 기반 실시간화
- 과거 모든 attempt history를 UI로 노출
- 이전 성공 attempt clip의 즉시 물리 삭제
- active attempt cancellation flow 추가
- current visible attempt clip curation / fallback 정책 추가
- `uploaded` boolean 제거

다만 `uploaded` 제거는 별도 status unification proposal과 연결할 수 있다.

이번 문서의 목표는 그 이전 단계로서:

- timeline truthfulness
- dispatch durability
- duplicate enqueue 방지
- non-destructive reprocess

를 먼저 확보하는 것이다.

---

## 16. 결론

이번 문서의 핵심은 "타임라인을 예쁘게 만든다"가 아니다.

핵심은 아래 여섯 줄이다.

- 생성 직후 row와 scheduling-request-confirmed row를 같은 상태로 두면 안 된다
- enqueue는 DB claim과 external dispatch를 분리해야 한다
- outbox에는 liveness를 보장하는 sweep와 dead-letter가 같이 있어야 한다
- duplicate dispatch는 허용해도 duplicate processing은 허용하면 안 된다
- reprocess는 기존 성공 결과를 먼저 파괴하면 안 된다
- timeline과 dashboard는 모두 "현재 attempt / 현재 visible attempt" 기준으로 읽어야 한다

즉 이 proposal의 최종 형태는:

**upload_pending + atomic claim + outbox dispatch + attempt-safe callbacks + non-destructive reprocess**

이다.

그리고 현재 코드 대조 기준으로는, 이 문서가 정의한 묶음과 완료 판정 기준을 모두 충족했을 때에만 "proposal 반영으로 인한 추가 known issue 없음"이라고 판정한다.

반대로 말하면, direct enqueue, auto-delete, destructive reprocess, attempt 없는 callback matching, `uploaded` 의미 혼용, visible attempt query 부재, flat S3 cleanup, delete server guard 부재, status/UI 불일치, route 등록 누락 중 하나라도 남아 있으면 여전히 "문제 있음" 판정이다.

현재 코드 감사 기준으로는 위 열 가지 범주가 전부이며, 이 문서는 그 범주를 모두 닫는 것을 목표로 한다.

즉 이 문서는 scope 내 open issue가 남지 않도록 업데이트되었고, 남은 리스크는 문서 밖의 새로운 설계 문제가 아니라 구현이 이 문서를 끝까지 따라가지 못한 경우로 한정된다.

이 기준으로 가야만:

- 미래 `Processed` 노출
- `updatedAt` 오용
- 초기 row 상태 모순
- 중복 enqueue
- post-send partial failure
- 영구 `pending_enqueue`
- stale callback 오염
- reprocess 시 기존 결과 손실
- dashboard clip count 왜곡

을 하나의 일관된 설계 안에서 같이 해결할 수 있다.
