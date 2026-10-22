# BUG-19 — 매분 cron 4개를 이벤트 구동 단일 정비 함수로 대체

구현 보고 (web-dev, 2026-10-22)

## 요약

`docs/plans/BUG-19.md`의 「고칠 파일」·「구현 스케치」대로 구현. 매분 도는 cron 함수
4개(`dispatch-pending-card-news`·`reconcile-card-news-jobs`·`cleanup-card-news-assets`·
`reconcile-video-credit-reservations`)를 제거하고, 이벤트 다중 트리거 + `singleton cancel`로
깨어나 지금의 복구 처리를 그대로 돌린 뒤 DB의 다음 기한까지 `sleepUntil`로 자는 단일
`maintenance-drain` 함수로 대체했다. 할 일이 없으면 런이 끝난다(사용자 0명이면 실행 0).

검증 게이트 둘 다 통과: `npm run check -w apps/web` EXIT 0, `npm test -w apps/web` 402/0(369→402).

## 고친 파일 전수 (23 — 수정 14 / 신규 9)

### 신규 순수 모듈 + 테스트 (스케치와 로직 동일)

- `src/inngest/maintenance-schedule.ts` — `DrainStep`(`Pick<GetStepTools<typeof inngest>, "run">`),
  `pastDueFloorMs`(30s→2배→30분 상한), `computeNextWake`(기한 최솟값, 바닥·천장 클램프,
  연속 기한경과 백오프, drainFailed=미해소). 상수 셋 수출.
- `src/inngest/maintenance-schedule.test.mjs` — 13 test. `pastDueFloorMs` 경계·클램프·내림,
  `computeNextWake` 14케이스(null·드레인실패·최솟값·바닥상승·천장·경계·미래·백오프·drainFailed 미해소·필터).
- `src/fsd/entities/card-news/model/job-due.ts` — `CARD_NEWS_HEARTBEAT_STALE_MS=90_000`,
  `cardNewsJobDueAt`(목록조건 ∧ 발송게이트 ∨ 마감).
- `src/fsd/entities/card-news/model/job-due.test.mjs` — 10 test. 미클레임/클레임·신선/낡은 heartbeat·
  리스·마감 케이스 + **고정 검사**: `job-lifecycle.ts`의 `heartbeatAt.getTime() < 90_000`이 정확히
  2곳이고 그 리터럴이 상수와 같은지.
- `src/fsd/features/card-news/model/cleanup-retry.ts` — `cleanupRetryDelayMs`(60s→2배→24h 상한).
- `src/fsd/features/card-news/model/cleanup-retry.test.mjs` — 3 test. 배가·상한·비정상 입력.

### 신규 Inngest 배선

- `src/inngest/maintenance-event.ts` — `MAINTENANCE_DRAIN_EVENT`, best-effort `kickMaintenanceDrain(reason)`.
  `./client`만 의존(순환 없음).
- `src/inngest/maintenance-functions.ts` — `maintenanceDrain`. 다섯 이벤트 트리거(cron 없음) +
  `singleton: { mode: "cancel" }`. 드레인 넷 순차 → `plan-next-wake` step에서 다음 기한 계산 →
  `sleepUntil` → 이어달리기 킥. idle이면 `{ idle: true }`, 기한 읽기 실패면 바닥만큼 자고 재킥.
- `src/inngest/maintenance-functions.test.mjs` — 7 test(vm+transpile 구조 시험, JSON 정규화로
  realm 불일치 회피): 드레인 순서·같은 step, 던져도 나머지 실행+drainFailed, null→idle,
  계획→sleepUntil(ISO)+킥, pastDueStreak은 drain 이벤트만, 계획 실패→sleep+streak+1 킥, 트리거/singleton 설정.

### 수정 — cron 셋을 드레인 루틴으로 (본문 바이트 불변, 껍데기만)

- `src/inngest/card-news-functions.ts` — 세 `createFunction(cron)`을 `export async function
  drainCardNewsDispatch/drainCardNewsRecovery/drainCardNewsCleanup({ step }: { step: DrainStep })`로.
  step id·목록 상한 100·작업별 step 불변. `DrainStep` 타입 import 추가. `generateCardNews`·`renderCardNews` 유지.
- `src/inngest/card-news-functions.test.mjs` — 시험 대상 이름 셋만 새 루틴 이름으로. 예산 모델·단언 불변.
- `src/inngest/video-reservation-functions.ts` — cron을 `export async function drainVideoReservations`로.
  step id `recover-video-reservations-globally` 불변.

### 수정 — 등록·계약

- `src/app/api/inngest/route.ts` — cron 4개 등록 제거, `maintenanceDrain` 등록. `maxDuration = 300` 불변.
- `src/inngest/client.ts` — `Events`에 `"maintenance/drain.requested": { data: { reason?; pastDueStreak? } }` 추가.

### 수정 — 다음 기한 쿼리 (읽기 전용)

- `src/fsd/entities/card-news/api/index.ts` — `cardNewsJobDueAt` import, `jobTimingSelect`,
  `nextCardNewsJobWakeAt`·`nextAssetCleanupWakeAt`·`hasDueActiveCardNewsJob` 추가.
- `src/fsd/entities/processing-dispatch/api/index.ts` — `nextVideoReservationWakeAt`
  (`listProcessingDispatchRecoveryCandidates`와 동일 WHERE의 MIN(deadlineAt)).
- `src/fsd/entities/processing-dispatch/server.ts` — `nextVideoReservationWakeAt` 재수출.

### 수정 — 킥·백오프·주석

- `src/fsd/features/card-news/api/cleanup.ts` — `cleanupRetryDelayMs`·`kickMaintenanceDrain` import,
  재시도 `+ 60_000` → `+ cleanupRetryDelayMs(current.attemptCount)`(요구 ⑥),
  `acceptCardNewsDeletion` 커밋 뒤 `kickMaintenanceDrain("card-news-deletion")`(요구 ④).
- `src/fsd/features/card-news/api/job-lifecycle.ts` — `:658` 매분 워커 전제 주석을 정비 드레인 주석으로(요구 ⑦).
- `src/fsd/features/card-news/api/index.ts` — `hasDueActiveCardNewsJob`·`kickMaintenanceDrain` import,
  `listCardNews`·`getCardNewsDetail` 콜백 시작에 읽기 시 안전망 킥(요구 ⑤).
- `src/fsd/features/clip/api/delete-clip-assets.ts` — `acceptClipAssetDeletion` 커밋 뒤 킥(요구 ④).
- `src/fsd/features/upload/api/delete-upload-assets.ts` — `acceptUploadAssetDeletion` 커밋 뒤 킥(요구 ④).
- `src/app/dashboard/page.tsx` — 방문 시 처리할 때가 된 카드뉴스 작업이 있으면 킥(요구 ⑤).

## 스케치 대비 차이

**분기 순서·조건·리터럴 값·사용자에게 보이는 문구는 스케치와 동일하다.** 아래는 공백(들여쓰기)만의 차이다.

- `acceptCardNewsDeletion`(cleanup.ts)·`acceptClipAssetDeletion`(delete-clip-assets.ts)·
  `acceptUploadAssetDeletion`(delete-upload-assets.ts)의 트랜잭션 반환을 `const result: {...} =
  await ...` 로 바꾸면서(스케치의 변수 타입 주석 — TS2322 회피) 콜백 본문을 +2 들여쓰기했다.
  `prettier`는 `check` 게이트가 아니고(스크립트는 `verify:fsd → next lint → tsc`뿐) 환경상 실행하지
  않아, 스케치가 "줄바꿈은 prettier에 맡긴다"고 한 대로 손으로 prettier 스타일에 맞췄다.
- delete-clip-assets.ts의 `dedicatedPrefixes: sets.map((set) => \`card-news/...\`)`는 +2 들여쓰기로
  80열을 넘어 여러 줄로 감쌌다(동작 무변경).
- `FEAT-63 선구현으로 밀린 줄 번호`: `listCardNews`·`getCardNewsDetail`(features/card-news/api/index.ts)과
  `reconcileUploadDraftsForUser`(app/dashboard/page.tsx)의 삽입 지점은 스케치의 줄 번호가 아니라 현 트리의
  앵커 텍스트로 맞췄다(계획서 「범위 밖 의존」의 규칙). 삽입 텍스트 자체는 스케치 그대로.

## 검증

- `npm run check -w apps/web` — EXIT 0. `verify:fsd:test`(11/0)·`verify:fsd`(FSD boundary passed)·
  `next lint`(No ESLint warnings or errors)·`tsc --noEmit`(무출력) 모두 통과.
  FSD: features→`~/inngest/maintenance-event` 임포트는 `~/inngest`가 `src/fsd` 밖이라 레이어 위반이 아니고,
  W7(해석 가능)만 적용돼 통과(새 파일 실재). inngest→entities server 임포트는 기존 card-news-functions 선례와 동일.
- `npm test -w apps/web` — 402/0(이전 369). 신규 4파일 33 test(schedule 13·job-due 10·cleanup-retry 3·
  maintenance-functions 7) 추가, card-news-functions 3 test는 이름만 교체(개수 불변).

## 테스트로 못 덮는 범위 (Node 내장 러너·DOM/DB/외부 I/O 없음)

- `singleton cancel`이 자고 있는(sleeping) 런도 대체하는지 — SDK 문서 미명시. 복구 함수가 행 잠금·CAS·리스로
  멱등이라 겹쳐 실행돼도 정확. 배포 후 Inngest 대시보드 관측.
- 재시도 소진 step의 핸들러 catch(`StepError`) — SDK 타입/주석으로만 확인(실행 미확인).
- `nextCardNewsJobWakeAt`/`nextAssetCleanupWakeAt`/`nextVideoReservationWakeAt`의 실제 쿼리 결과,
  `GREATEST`의 NULL 무시 — DB 없이 판정 불가(코드 독해·로컬 PG 리허설 몫).
- `deadlineAt`이 null인 영상 후보만 남는 경우 정비 함수가 그 후보로는 안 깸 — 다른 이벤트/방문이 메움.
- 영상 복구 지연(정비 함수는 영상 후보엔 `deadlineAt`=claim+65분에만 깸) — 틀리지 않고 늦음.
- 킥 발송·트리거 매칭·`step.sleepUntil`의 실제 수면 — 전부 Inngest 런타임 I/O.
- 배포 후 수동 확인(원장 등재 대상, 계획서 「테스트」 ①~⑤): 유휴 시 실행 0 / 업로드 1건 claim+마감 2회 /
  카드뉴스 생성 중 heartbeat+90초 간격만·폴링 킥 없음 / Neon Idle 복귀 / 일시정지 4개 id 배포로 소멸(새 id·Resume 불필요).

## 범위 밖 (메인 루프 소관 — 계획서 「범위 밖 의존」대로)

- `apps/web/scripts/verify-card-news-surfaces.mts`(web-dev `src/**` 밖): route.ts의 cron 넷 이름 단언이
  이 구현으로 깨진다(`Missing served worker`). `:52-55` 네 줄을 `"maintenanceDrain",` 한 줄로 바꿔야 한다.
  이 스크립트는 `package.json`에 없어 `npm run check`가 돌리지 않으므로 검증 게이트엔 영향 없음.
- `apps/web/CLAUDE.md` 테스트 목록 표(읽기 전용): 신규 4 test 파일 4행 추가 필요(아래 「비고」).
- FEAT-63 행·계획서·복구 함수 내부 의미는 손대지 않음.

## 비고 — CLAUDE.md 테스트 표에 추가할 행 (읽기 전용이라 web-dev가 직접 못 고침)

| 파일 | 지키는 것 |
|---|---|
| `inngest/maintenance-schedule.test.mjs` | 정비 드레인의 다음 깨움 계산 — `pastDueFloorMs`(30s→2배→30분 상한·비정상 입력 클램프), `computeNextWake`(기한 최솟값·30s 바닥·6h 천장·연속 기한경과 백오프·drainFailed는 미래 기한도 미해소로 셈) |
| `inngest/maintenance-functions.test.mjs` | `maintenanceDrain` 구조 — 드레인 넷 순차 실행(하나 실패해도 나머지+drainFailed), 계획 null→idle, 계획→`sleepUntil`(ISO)+이어달리기 킥, pastDueStreak은 drain 이벤트만, 계획 실패→바닥 sleep+streak+1, 트리거 5개·cron 없음·singleton cancel |
| `entities/card-news/model/job-due.test.mjs` | `cardNewsJobDueAt` — job이 처리 가능해지는 시각(목록 조건 ∧ 발송 게이트, 또는 마감). claim·heartbeat 신선/낡음, 미클레임 heartbeat 무시(`&&`). `CARD_NEWS_HEARTBEAT_STALE_MS=90_000`이 `job-lifecycle.ts`의 발송·claim 게이트 리터럴 2곳과 같은지 고정 검사 |
| `features/card-news/model/cleanup-retry.test.mjs` | `cleanupRetryDelayMs` — 정리 재시도 간격(attempt 1→60s, 2배씩, 24h 상한). 60초 고정이던 것을 지수 백오프로(BUG-19 관측 6) |
