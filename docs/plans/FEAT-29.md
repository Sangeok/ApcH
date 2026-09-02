# FEAT-29: 정체 감시를 15분 cron에서 처리 건별 이벤트 감시자로 전환 — Neon 유휴 compute 깨움 제거

agent: web-dev

## 현재 동작

정체(stuck) 감시는 15분 cron으로 도는 Inngest 함수가 담당한다.

- `monitorPipelineHealth`(`apps/web/src/inngest/functions.ts:1057`)가 `cron: "*/15 * * * *"`(`functions.ts:1064`)로 등록돼, 처리 중 업로드 유무와 무관하게 하루 96회 실행된다. `route.ts`에 등록돼 있다(`apps/web/src/app/api/inngest/route.ts:6`·`:18`).
- 매 실행마다 `list-stuck-processing` 스텝(`functions.ts:1070`)에서 `listStuckProcessingUploadedFiles({ limit: STUCK_SCAN_LIMIT })`(`functions.ts:1071`, `STUCK_SCAN_LIMIT = 50` `functions.ts:1055`)을 호출한다.
- `listStuckProcessingUploadedFiles`(`apps/web/src/fsd/entities/uploaded-file/api/index.ts:1312`)는 `db.uploadedFile.findMany`로 `status: "processing"` + `processingStartedAt`이 `[now-maxAge, now-minAge]` 윈도우인 행을 스캔한다(`api/index.ts:1324-1342`). `minAge`는 `PROCESSING_STALE_POLICY.stuckAlertMs`(90m), `maxAge`는 `stuckAlertMaxAgeMs`(24h)(`api/index.ts:1319-1321`, 값은 `model/stale-policy.ts:17`·`:22`). 이 쿼리는 DB 쓰기 없이 조회만 한다.
- 정체 행마다 `reportPipelineFailure({ kind: "stuck-processing", ... })`(`functions.ts:1095`)를 부르고 루프 뒤 `flushReports()`(`functions.ts:1105`) 한 번. Sentry fingerprint는 `[report.kind]`(`apps/web/src/fsd/shared/observability/report-error.ts:56-57`)라 재보고가 한 이슈로 묶인다. `reportPipelineFailure`는 never-throw(`report-error.ts:102-118`).

정체를 낳는 상태 쓰기(`status: "processing"`)와 그 트리거는 코드상 단일 경로다.

- `uploadedFile.status`를 `"processing"`으로 **쓰는** 곳은 `startUploadedFileProcessingAttempt`의 `updateMany.data`(`api/index.ts:697-700`) **한 곳뿐**이다. 파일 내 `status: "processing"` 나머지 5곳(`api/index.ts:736`·`761`·`781`·`947`·`1326`)은 전부 `where` 필터, `:846`은 `where.status.in` 배열 원소, `:1072`는 인메모리 비교, `:1086`은 필터 인자다. `createUploadDraft`의 최초 status는 `"upload_pending"`(`api/index.ts:200`)이고 동적 status 쓰기 경로는 없다(web `src` 전수: `status:"processing"`/`'processing'` 및 `status: <변수>` 검색 결과 위 목록이 전부).
- `startUploadedFileProcessingAttempt` 호출부는 `processVideo`의 `claim-processing-attempt` 스텝(`functions.ts:395-404`)과 `analyzeVideo`의 동일 스텝(`functions.ts:836-845`) **둘뿐**이다(web `src` 전수). 두 함수 모두 `event.data`에 `uploadedFileId`·`attempt`·`matchKey`를 갖는다(`client.ts:47-71`). claim 성공은 `claimResult.status === "started"`(`functions.ts:419`, `:847`).
- 단건 확인 함수 `isUploadedFileAttemptStillProcessing(uploadedFileId, attempt)`(`api/index.ts:773-787`, boolean)이 이미 있고 `processVideo`가 `check-attempt-still-processing` 스텝에서 쓴다(`functions.ts:622-627`).
- 취소 이벤트 `process-video-events/cancel`은 `sendProcessingCancelEventBestEffort`(`api/index.ts:165-185`)가 `matchKey: getProcessingMatchKey(uploadedFileId, attempt)`(`api/index.ts:175`)를 실어 보낸다. `getProcessingMatchKey`는 `` `${uploadedFileId}:${attempt}` ``(`model/attempt-prefix.ts:9-11`) — 이벤트 디스패치가 `event.data.matchKey`에 넣는 값과 동일한 출처다(`entities/processing-dispatch/api/index.ts:205-208`). `processVideo`·`analyzeVideo`는 이미 `cancelOn: [{ event: "process-video-events/cancel", match: "data.matchKey" }]`(`functions.ts:287-292`, `:750-755`)로 이 취소를 받는다.
- `step.sleep(id, time)`은 `time`으로 ms 숫자를 받는다(`node_modules/inngest/components/InngestStepTools.d.ts:208-218`, "a `number` of milliseconds"). 자는 동안 함수는 재호출 방식이라 compute를 쓰지 않으며 `route.ts`의 `maxDuration = 10`(`route.ts:10`)과 무관하다. `step.sendEvent(id, payload)`도 지원된다(`InngestStepTools.d.ts:114`, inngest 3.54.0).

## 문제

`TASK_BACKLOG.md`의 FEAT-29 `source`가 지목한 문제: `monitorPipelineHealth`가 처리 중 업로드가 없어도 15분마다 DB를 조회해(`functions.ts:1064` cron × `api/index.ts:1324` findMany) Neon autosuspend(5분)와 겹쳐 하루 ≈96회 유휴 compute를 깨운다 — DB에는 메타데이터만 있고 비용은 compute라, 1인 사용 대비 과다한 Neon 비용의 원인이다.

위 「현재 동작」에서 확인한 대로, 정체 가능 행은 예외 없이 `startUploadedFileProcessingAttempt` 단일 쓰기(`api/index.ts:697-700`)로 생기고 그 트리거는 두 claim 스텝(`functions.ts:395`·`:836`)뿐이다. 즉 정체 후보는 항상 `uploadedFileId`·`attempt`·`matchKey`를 아는 Inngest 런 안에서 태어나므로, 24시간 상시 전수 스캔 없이 **claim된 건마다 하나의 감시자**로 대체할 수 있다. 감시자는 `step.sleep`으로 임계값만큼 자다(compute 0) 깨어나 `isUploadedFileAttemptStillProcessing` 단건 조회로만 판정한다.

백로그가 지목한 문제와 코드가 어긋나는 지점은 없다. 커버리지도 동률이다: 현재 cron도 `processing`만 본다(`api/index.ts:1326`); `queued` 정체는 지금도 조회 시점의 `reconcileStaleUploadedFileForUser`(`api/index.ts:954`)가 처리하며 이 항목은 그 경로를 건드리지 않는다. 알림은 15분마다 최대 96회 재보고에서 건별 1회로 준다(fingerprint가 `[kind]`라 이미 한 이슈로 묶임 `report-error.ts:56-57`).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/inngest/client.ts` | `Events`에 `processing/attempt.claimed` 이벤트 스키마 추가(`uploadedFileId`·`attempt`·`matchKey`·`claimedAt`) |
| `src/inngest/functions.ts` | ① import에서 `listStuckProcessingUploadedFiles` 제거, `PROCESSING_STALE_POLICY`(stale-policy)·`stuckAlertElapsedMinutes`(신규 stuck-alert) 추가 ② `processVideo`·`analyzeVideo`의 claim "started" 직후 `step.sendEvent`로 `processing/attempt.claimed` 발송 ③ `STUCK_SCAN_LIMIT`·`monitorPipelineHealth` 삭제 ④ `watchProcessingAttempt` 함수 신설 |
| `src/app/api/inngest/route.ts` | 등록 목록·import에서 `monitorPipelineHealth`를 `watchProcessingAttempt`로 교체 |
| `src/fsd/entities/uploaded-file/api/index.ts` | `StuckProcessingUploadedFile` 타입(`:1295-1302`)과 `listStuckProcessingUploadedFiles` 함수(`:1304-1343`) 삭제 |
| `src/fsd/entities/uploaded-file/index.ts` | 재수출 제거: `listStuckProcessingUploadedFiles`(`:18`), `type StuckProcessingUploadedFile`(`:44`) |
| `src/fsd/entities/uploaded-file/model/stale-policy.ts` | `stuckAlertMaxAgeMs`와 cron 전제 주석(`:18-22`) 삭제. `stuckAlertMs`(`:17`)와 그 근거 주석(`:8-16`)은 감시자가 계속 소비하므로 유지 |
| `src/fsd/entities/uploaded-file/model/stuck-alert.ts` `(신규)` | 순수 함수 `stuckAlertElapsedMinutes(claimedAtIso, now)` |
| `src/fsd/entities/uploaded-file/model/stuck-alert.test.mjs` `(신규)` | 위 순수 함수 테스트 |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다. 특히 `reconcileStaleUploadedFileForUser`·`sendProcessingCancelEventBestEffort`·`report-error.ts`의 `stuck-processing` 리포트 타입은 그대로 둔다(감시자가 그 계약을 재사용한다).

## 구현 스케치

### 1) `client.ts` — 새 이벤트 스키마

`process-video-events/cancel`(`client.ts:72-78`) 아래에 추가:

```ts
  "processing/attempt.claimed": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
      // claim 직후 ISO. stuck 리포트의 processingStartedAt·elapsedMinutes 산정에 쓴다.
      claimedAt: string;
    };
  };
```

### 2) `model/stuck-alert.ts` `(신규)` — 순수 함수

```ts
/**
 * claim 시각(ISO)과 현재 시각으로 정체 경과(분, 반올림)를 낸다.
 * parse 불가·음수(미래 시각)면 0을 돌려준다(방어). Inngest step 경계가 Date를
 * JSON으로 넘나들므로 claimedAt은 문자열이며, 계산은 감시자의 check 스텝 안에서 끝낸다.
 */
export function stuckAlertElapsedMinutes(claimedAtIso: string, now: Date): number {
  const claimedMs = Date.parse(claimedAtIso);
  if (Number.isNaN(claimedMs)) {
    return 0;
  }
  const elapsedMs = now.getTime() - claimedMs;
  if (elapsedMs <= 0) {
    return 0;
  }
  return Math.round(elapsedMs / 60_000);
}
```

### 3) `functions.ts` — import 교체

`~/fsd/entities/uploaded-file` 묶음 import(`functions.ts:8-17`)에서 `listStuckProcessingUploadedFiles`(`:12`)를 뺀다. `isUploadedFileAttemptStillProcessing`(`:11`)·`startUploadedFileProcessingAttempt`(`:16`)는 유지. 그리고 model 직접 import 두 줄 추가(기존 `clip-generation-outcome` 직접 import `functions.ts:18-21`과 같은 패턴):

```ts
import { PROCESSING_STALE_POLICY } from "~/fsd/entities/uploaded-file/model/stale-policy";
import { stuckAlertElapsedMinutes } from "~/fsd/entities/uploaded-file/model/stuck-alert";
```

### 4) `functions.ts` — `processVideo` claim 직후 감시자 예약

`processVideo`의 claim "started" 확인(`functions.ts:419-421`)과 `try`(`:423`) 사이에 삽입:

```ts
    if (claimResult.status !== "started") {
      return { skipped: true };
    }

    await step.sendEvent("schedule-stuck-watch", {
      name: "processing/attempt.claimed",
      data: {
        uploadedFileId,
        attempt,
        matchKey: event.data.matchKey,
        claimedAt: new Date().toISOString(),
      },
    });

    try {
```

`matchKey`는 destructure(`functions.ts:307-315`)에 없으므로 `event.data.matchKey`로 직접 참조한다. `step.sendEvent`는 스텝이라 재시도·리플레이에 중복 발송되지 않고, `claimedAt`은 최초 실행 시점 값으로 고정된다.

### 5) `functions.ts` — `analyzeVideo` claim 직후 감시자 예약

`analyzeVideo`의 claim "started" 분기(`functions.ts:847-855`)와 `try`(`:857`) 사이에 4)와 동일한 `step.sendEvent` 블록을 삽입한다. 여기도 `matchKey`는 destructure(`functions.ts:771-772`)에 없어 `event.data.matchKey`로 참조한다.

### 6) `functions.ts` — `monitorPipelineHealth`·`STUCK_SCAN_LIMIT` 삭제, `watchProcessingAttempt` 신설

`functions.ts:1053-1114`(주석 `:1053-1055` + `STUCK_SCAN_LIMIT` + `monitorPipelineHealth`)를 통째로 삭제하고 그 자리에:

```ts
export const watchProcessingAttempt = inngest.createFunction(
  {
    id: "watch-processing-attempt",
    retries: 1,
    // reconcile이 정체를 강제 실패시키며 보내는 취소 이벤트로 자는 감시자도 함께 끝낸다.
    // processVideo·analyzeVideo와 동일한 matchKey 매칭이라 계약이 일치한다.
    cancelOn: [
      {
        event: "process-video-events/cancel",
        match: "data.matchKey",
      },
    ],
  },
  // ⚠️ concurrency를 두지 않는다. processVideo·analyzeVideo는 account/userId 스코프
  //    limit 1을 갖는데(functions.ts:298·:762), 자는 감시자가 그 슬롯을 점유하면
  //    유저의 다음 처리 런이 최대 stuckAlertMs 동안 막힌다.
  { event: "processing/attempt.claimed" },
  async ({ event, step }) => {
    const { uploadedFileId, attempt, claimedAt } = event.data;

    await step.sleep(
      "wait-for-stuck-threshold",
      PROCESSING_STALE_POLICY.stuckAlertMs,
    );

    // 경과 계산까지 step 안에서 끝내고 원시 값만 넘긴다(monitorPipelineHealth의
    // Date-경계 규율과 동일). still-processing이면 처리 함수가 stuckAlertMs가 지나도록
    // 상태를 못 바꿨다는 뜻이다.
    const check = await step.run("check-attempt-still-processing", async () => {
      const stillProcessing = await isUploadedFileAttemptStillProcessing(
        uploadedFileId,
        attempt,
      );
      return {
        stillProcessing,
        elapsedMinutes: stuckAlertElapsedMinutes(claimedAt, new Date()),
      };
    });

    if (!check.stillProcessing) {
      return { alerted: false };
    }

    reportPipelineFailure({
      kind: "stuck-processing",
      uploadedFileId,
      processingStartedAt: claimedAt,
      elapsedMinutes: check.elapsedMinutes,
    });

    await flushReports();

    return { alerted: true };
  },
);
```

`reportPipelineFailure`+`flushReports`를 마지막 스텝 뒤 본문에 두는 것은 `monitorPipelineHealth`(`functions.ts:1094-1105`)와 동일한 형태다 — 뒤에 스텝이 없어 최종 리플레이 1회에서만 실행되므로 중복 보고가 없다. `stuck-processing` 리포트 타입(`report-error.ts:37-43`)이 요구하는 `processingStartedAt`(ISO)·`elapsedMinutes`는 이벤트의 `claimedAt`에서 얻는다. `claimedAt`은 claim 스텝의 DB `processingStartedAt`(`api/index.ts:699`)와 같은 순간을 가리키되 별도 `new Date()`라 초 미만의 오차가 있을 수 있다 — 알림 메시지(`stuck-processing: ${elapsedMinutes}m` `report-error.ts:73`)에는 영향이 없다.

### 7) `route.ts` — 등록 교체

`monitorPipelineHealth`(`route.ts:6` import, `:18` 등록)를 `watchProcessingAttempt`로 바꾼다. 나머지 세 함수(`processVideo`·`analyzeVideo`·`cleanupAnalyticsEvents`)는 그대로.

### 8) `api/index.ts`·`index.ts`·`stale-policy.ts` — 삭제

- `api/index.ts`: `StuckProcessingUploadedFile` 타입(`:1295-1302`)과 `listStuckProcessingUploadedFiles`(`:1304-1343`) 삭제. 둘 다 다른 사용처가 없다(web `src` 전수 확인).
- `index.ts`: `listStuckProcessingUploadedFiles`(`:18`)와 `export type { StuckProcessingUploadedFile }`(`:44`) 제거.
- `stale-policy.ts`: `:18-22`(주석 4줄 + `stuckAlertMaxAgeMs`) 삭제. `stuckAlertMs`(`:17`)는 감시자가 소비하므로 유지. 삭제 후 객체는 `stuckAlertMs: 90 * 60 * 1000,` 뒤 `} as const;`로 끝난다.

## 테스트

- **덮는 것**: `stuck-alert.test.mjs`가 `stuckAlertElapsedMinutes`를 덮는다 — 90분 전 → 90, 반올림 경계(89.6m→90·89.4m→89), 정확히 now → 0, 미래 시각(음수) → 0, parse 불가 문자열 → 0, `""`/공백 → 0.
- **못 덮는 범위**: `npm test`(Node 내장 러너, `tsx`)는 DOM·React·DB·Inngest 하니스가 없다. 따라서 다음은 이 러너로 못 덮는다 — `step.sendEvent`의 이벤트 발송과 idempotency, `step.sleep` 후 재개, `cancelOn` 매칭, `watchProcessingAttempt`의 배선, `isUploadedFileAttemptStillProcessing`의 DB 조회, `reportPipelineFailure`/`flushReports` 부수효과, concurrency 미설정의 슬롯 비점유. 이들은 배포 후 Inngest 대시보드에서 `processing/attempt.claimed` 발송·`watch-processing-attempt` 런의 sleep→check 흐름과 취소를 실물로 확인해야 한다(배포 확인 대상).
- **전환 구간 공백(배포 시점 1회)**: 배포 순간 이미 `processing`인 attempt는 `processing/attempt.claimed`를 받은 적이 없어 감시자가 없고, 그것을 잡던 cron은 이 변경으로 사라진다 — 그 attempt가 정체되면 알림이 나가지 않는다. 코드로 메우지 않는다(과거 attempt를 위한 일회성 백필은 이 항목의 범위를 넘고, 남길 코드도 아니다). 완화: 처리 중 업로드가 없을 때 배포한다. 잔여 영향은 Sentry 알림 1회 유실뿐이며 사용자 가시 영향은 없다 — 그 업로드는 조회 시점 `reconcileStaleUploadedFileForUser`(`api/index.ts:954`)가 여전히 강제 실패시킨다. 배포 확인 원장에 등재해 닫는다.

## 범위 밖 의존

없음. 구현은 전부 `apps/web/src` 안에서 완결한다 — `packages/db` 스키마·마이그레이션이 필요 없다(기존 `status`·`processingStartedAt` 컬럼과 `@@index([status, processingStartedAt])`만 쓴다, `api/index.ts:1307` 주석). 백로그가 적은 Neon 콘솔 설정(scale-to-zero·최소 CU·브랜치 정리)과 로컬 `.env`가 프로덕션 엔드포인트를 공유하는 문제는 코드 밖 사용자 작업이라 이 항목의 구현 대상이 아니다.

## 대안

- **기존 `process-video-events` 트리거에 감시자를 얹기**: 새 이벤트 없이 같은 이벤트로 별도 감시 함수를 구독시키는 변형. 택하지 않는다 — account 스코프 concurrency(limit 1) 때문에 이벤트 수신(발송) 시각이 실제 claim 시각과 어긋나, 아직 claim되지 않은 상태에서 깨어난 감시자가 "아직 processing 아님"을 stuck으로 오인하거나 재수면 분기를 따로 둬야 한다(백로그 `source` 명시). claim 성공 직후 발송하는 전용 이벤트는 이 어긋남을 없앤다.
- **cron 주기만 늘리기**(예: 1시간): 스캔 횟수는 줄지만 여전히 처리 중 업로드가 없어도 Neon을 주기적으로 깨운다 — 비용 원인(유휴 compute 깨움)을 제거하지 못한다.
- **감시자가 `processingStartedAt`을 DB에서 재조회**: `isUploadedFileAttemptStillProcessing` 대신 `processingStartedAt`을 함께 반환하는 새 조회 함수를 만들어 리포트를 정확한 DB 값으로 채우는 안. 택하지 않는다 — 백로그가 지목한 기존 boolean 단건 확인 함수를 재사용하고 조회 표면을 늘리지 않는 편이 낫다. `claimedAt`을 이벤트에 실어 초 미만 오차만 감수한다.
