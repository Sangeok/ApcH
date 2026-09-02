# FEAT-29 — web-dev 구현 보고

## 2026-09-02 — 구현 (완료)

정체(stuck) 감시를 15분 cron 전수 스캔(`monitorPipelineHealth`)에서 **처리 건별 이벤트 감시자**(`watchProcessingAttempt`)로 전환했다. claim 성공 직후 `processing/attempt.claimed` 이벤트를 발송하고, 감시자가 `step.sleep(stuckAlertMs)`로 자다 깨어나 `isUploadedFileAttemptStillProcessing` 단건 조회로만 판정한다. 처리 중 업로드가 없을 때 Neon 유휴 compute를 깨우던 하루 ≈96회의 주기 스캔이 사라진다.

`docs/plans/FEAT-29.md`의 「고칠 파일」·「구현 스케치」를 그대로 구현했다. 「현재 동작」이 인용한 줄(client.ts cancel 블록, functions.ts claim/try 경계·monitorPipelineHealth 위치, api/index.ts 정의·불변식 지점, index.ts 재수출, stale-policy.ts) 전부 구현 시점 코드와 일치했다(B-3 확인).

### 고친 파일 (전수)

수정 6개:

1. `apps/web/src/inngest/client.ts` — `Events`에 `"processing/attempt.claimed"` 이벤트 스키마 추가(`uploadedFileId`·`attempt`·`matchKey`·`claimedAt`), `process-video-events/cancel`과 `modal/video.processed` 사이.
2. `apps/web/src/inngest/functions.ts`
   - import: 묶음 import에서 `listStuckProcessingUploadedFiles` 제거, `PROCESSING_STALE_POLICY`(stale-policy)·`stuckAlertElapsedMinutes`(stuck-alert) 직접 import 2줄 추가.
   - `processVideo`: claim `"started"` 확인 직후(try 앞) `step.sendEvent("schedule-stuck-watch", …)` 블록 삽입.
   - `analyzeVideo`: 동일 블록 삽입(claim `"started"` 분기와 try 사이).
   - `STUCK_SCAN_LIMIT`·`monitorPipelineHealth`(cron `*/15 * * * *`) 통째 삭제, 그 자리에 `watchProcessingAttempt` 신설(`retries:1`, `cancelOn` data.matchKey, concurrency 미설정, sleep→check→report).
3. `apps/web/src/app/api/inngest/route.ts` — import·등록 목록에서 `monitorPipelineHealth`→`watchProcessingAttempt` 교체.
4. `apps/web/src/fsd/entities/uploaded-file/api/index.ts` — `StuckProcessingUploadedFile` 타입·`listStuckProcessingUploadedFiles` 함수 삭제(파일 말미), `updateUploadedFileStatus` 위에 ⚠️ 불변식 주석 추가("이 함수로 processing을 쓰면 감시자 미예약으로 정체 알림 유실").
5. `apps/web/src/fsd/entities/uploaded-file/index.ts` — 재수출 제거: `listStuckProcessingUploadedFiles`, `export type { StuckProcessingUploadedFile }`.
6. `apps/web/src/fsd/entities/uploaded-file/model/stale-policy.ts` — cron 전제 주석 4줄 + `stuckAlertMaxAgeMs` 삭제. `stuckAlertMs`(90m)와 그 근거 주석은 감시자가 계속 소비하므로 유지.

신규 2개:

7. `apps/web/src/fsd/entities/uploaded-file/model/stuck-alert.ts` — 순수 함수 `stuckAlertElapsedMinutes(claimedAtIso, now)`.
8. `apps/web/src/fsd/entities/uploaded-file/model/stuck-alert.test.mjs` — 위 함수 테스트(describe 1 / it 7 = 테스트 7).

### 스케치 대비 차이

없음. 분기 순서·조건·리터럴 값·사용자 가시 문구 모두 스케치대로다. import 교체 후 `route.ts`의 import 멤버 순서가 사전순을 벗어나지만(`watchProcessingAttempt`가 `processVideo` 앞) ESLint가 통과했다(정렬 규칙 없음).

의존 정합성 사전 확인:
- `PROCESSING_STALE_POLICY` import는 `api/index.ts`의 다른 5지점(131·144·153·1164·1167)이 계속 쓰므로 함수 삭제 후에도 unused가 아니다.
- `stuckAlertMaxAgeMs`는 삭제한 `listStuckProcessingUploadedFiles`(구 1321)·삭제한 monitorPipelineHealth 주석(구 1062)에서만 참조됐다 → 정의 삭제 후 잔여 참조 0.
- `listStuckProcessingUploadedFiles`/`StuckProcessingUploadedFile` 전수 참조는 functions.ts(import·호출)·index.ts(재수출)·정의부뿐. 전부 제거.

### 검증

- `npm run check -w apps/web` → EXIT 0 (next lint: no warnings/errors, tsc --noEmit: 통과).
- `npm test -w apps/web` → EXIT 0, tests 67 / pass 67 / fail 0 (직전 60 → +7 = stuck-alert.test.mjs).

### 테스트로 못 덮는 범위

`npm test`는 Node 내장 러너(`tsx`)라 DOM·React·DB·Inngest 하니스가 없다. 다음은 이 러너로 못 덮으며 배포 후 Inngest 대시보드 실물 확인 대상이다(계획서 「테스트」·「전환 구간 공백」과 동일):
- `step.sendEvent`의 `processing/attempt.claimed` 발송·idempotency, `step.sleep` 후 재개, `cancelOn` 매칭, `watchProcessingAttempt` 배선, `isUploadedFileAttemptStillProcessing`의 DB 조회, `reportPipelineFailure`/`flushReports` 부수효과, concurrency 미설정의 슬롯 비점유.
- 전환 구간 공백(배포 시점 1회): 배포 순간 이미 `processing`인 attempt는 감시자가 없고 cron도 사라져 그 attempt의 정체 알림 1회가 유실될 수 있다. 코드로 메우지 않는다. 완화=처리 중 업로드 없을 때 배포. 사용자 가시 영향 없음(조회 시점 `reconcileStaleUploadedFileForUser`가 여전히 강제 실패). → 배포 확인 원장 등재 대상.

### 남은 일 / 보고

- `apps/web/CLAUDE.md` 테스트 목록 표에 새 행이 필요하다(그 파일은 web-dev 읽기 전용이라 직접 고치지 않고 여기·보드 비고로 보고). 추가할 행:
  `| entities/uploaded-file/model/stuck-alert.test.mjs | claim 시각→정체 경과(분) 산정. 90m→90, 반올림 경계(89.6→90·89.4→89), now→0, 미래(음수)→0, parse 불가·""·공백→0. step 경계가 Date를 JSON으로 넘겨 claimedAt이 문자열이므로 감시자 check 스텝이 이 순수 함수로 경과를 낸다 |`
  또한 같은 표 머리말의 "9개 파일, 58개 테스트" 수치도 낡았다(현재 stuck-alert 포함 다수 추가로 67 테스트). 수치 갱신도 그 파일 소유자 몫.
