# BUG-19 — 메인 루프 기록

## 발주·게이트① (2026-10-21 ~ 10-22)

소유자가 2026-10-21 세션에서 「Inngest 사용 비율이 갑자기 올라갔다」고 물었다(처음엔 Neon으로 물음). 메인 루프가
`origin/main`의 합류 커밋별 매분 cron 수를 세어 PR #135(`54d74df`)가 넣은 매분 cron 4개를 원인으로 짚었다. 계산상
하루 12,960 execution이고, 매분 DB를 조회하므로 Neon도 자동 정지하지 못한다. 소유자가 Inngest 대시보드에서 4개를
일시정지하고 「확실히 그 4개만 runs가 튀었다」고 확인한 뒤, 「cron이 아닌 방식으로 최적안을 고안해서 처리」를 지시했다.

메인 루프는 세 안을 비교해 보고했다 — 주기만 낮추기, 작업별 개별 가드, 이벤트로 깨어 DB의 다음 기한까지 자는 단일
정비 함수. 셋째 안으로 백로그와 보드에 등재했다(소유자 직접 발주 — BUG-18 전례 `6ddc05c`). 대상 코드가 `main`에만
있었으므로, 선행 작업인 `origin/main` → dev 머지를 소유자의 「머지 진행해」로 실행했다(`745439f`, 충돌 0).
등재 커밋은 `0479a28`이다.

2026-10-22 소유자가 「계획 지시」로 게이트①을 열었다. 담당은 web-dev다. 이 항목은 영역이 FEAT-63(같은 날 사후 인수로
재범위)과 겹친다. 그래서 경계를 다음과 같이 나눴다 — cron **스케줄**과 그 대체는 BUG-19가 맡고, 복구 헬퍼의 **의미**에
대한 인수는 FEAT-63이 맡는다.

## 필수 경로 확정 (2026-10-22)

카탈로그(`docs/plans/verification-paths.md`) 기준:

- **1 인용 전수 대조**: 모든 항목.
- **2 스케치 추출·실행**, **3 before/after 기계 적용**: 새 파일 9개와 기존 파일 14개 수정.
- **4 전칭 여집합**: 「벌크 헬퍼는 어디서도 불리지 않는다」, 「`createAssetCleanupJob` 6곳 중 이벤트 없는 곳은 3곳」, 「FEAT-63과 겹치는 파일」, 「cron 이름을 참조하는 곳」.
- **5 돌연변이**: 순수 함수 넷(`computeNextWake`·`pastDueFloorMs`·`cardNewsJobDueAt`·`cleanupRetryDelayMs`).
- **6 실제 사건 재생**: 2026-10-20 운영 504(`FUNCTION_INVOCATION_TIMEOUT`). `card-news-functions.test.mjs`의 예산 모델이 그 사건의 모델이다.
- **7 음성 시험**: 작업별 step 불변, 90초 고정 검사, singleton·트리거 설정.
- **9 구조적 아티팩트**: SDK가 실제로 내보내는 함수 설정(트리거 배열·singleton·cron 부재).
- **8 실물 렌더 — 제외**: 화면 마크업 변경이 없다. `dashboard/page.tsx`는 서버 측 킥 한 줄이고, 카드뉴스 액션은 반환 형태가 바뀌지 않는다.

## 라운드 1 — 메인 루프 편집 라운드 (2026-10-22, 구현 영향 6 · 위생 1)

입력: FEAT-63 사후 인수 계획서를 쓴 포크가 보고한 N2(작업별 step)와 V3(영상 유예). 결함은 직접 재현해 확정했다.

1. **[구현 영향] 벌크 헬퍼를 한 step에서 호출 → 운영 504 재발.**
   - 경로 6 재생: 계획서의 `maintenance-functions.ts` 스케치를 바이트 그대로 추출했다. 이를 `card-news-functions.test.mjs`와 같은 예산 모델(작업 하나가 300초의 60%를 쓴다)에 통과시켰다.
   - 결과: `RESULT: threw FUNCTION_INVOCATION_TIMEOUT after processing [ 'job-a' ]`. 하니스는 스크래치패드 `b19r1/replay-504.mjs`에 있다.
   - 근거: 원인 기록 `docs/card-news-release-verification-20261020.md:62`, 수정 커밋 `4859d2e`.
   - 해소: 지금 cron 본문을 껍데기만 바꿔 수출 드레인 루틴으로 옮긴다. 기존 예산 시험을 그 루틴에 그대로 건다. 그 결과 파일 삭제 2건이 필요 없어졌다(web-dev가 비고로 남긴 삭제 수단 문제도 함께 해소).
   - 백로그 요구 ①의 「기존 헬퍼를 그대로」는 메인 루프가 쓴 문구의 오류다.
2. **[구현 영향] 읽기 게이트가 생성 중 폴링마다 참.**
   - claim은 `nextDispatchAt`을 지우지 않는다(`job-lifecycle.ts:412-420`).
   - 발송 게이트는 heartbeat가 신선하면 `nextDispatchAt`을 갱신하지 않고 돌아간다(`:325-333`).
   - 따라서 발송 60초 뒤부터 마감까지 `hasOverdueActiveCardNewsJob`이 참이다. 그동안 5초 폴링(`query-options.ts:24-30`·`:53-58`)마다 킥이 나가고, singleton cancel이 정비 함수를 5초마다 재시작한다.
   - 해소: 순수 함수 `cardNewsJobDueAt`(목록 조건 ∧ 발송 게이트, 또는 마감)을 게이트와 기한 계산이 함께 쓴다.
3. **[구현 영향] claim된 job의 기한을 `deadlineAt`으로 잡아 죽은 워커의 재발송이 사라짐.**
   - 지금 cron은 heartbeat가 90초 넘게 끊긴 job을 다시 보낸다(`:331`·`:405-411`).
   - 계획대로면 마감까지 아무도 보내지 않고, 마감에 실패·환불된다. 복구 의미가 바뀐다.
   - 해소: 3번은 2번과 같은 함수로 해소된다. 90초 리터럴의 드리프트는 고정 검사로 막는다.
4. **[구현 영향] 드레인으로 풀리지 않는 기한 경과 행이 30초 루프를 만듦.**
   - 바닥값을 30초로 고정하면 그런 행이 정비 함수를 30초마다 깨운다(cron의 2배).
   - 실례: `reconcile-video-reservations.ts:68`이 업로드가 `processing`이 아니면 마감 지난 후보도 넘긴다.
   - 해소: 연속 기한 경과 횟수를 이어달리기 킥에 실어 바닥을 30초에서 30분까지 2배씩 늘린다.
5. **[구현 영향] step 실패나 계획 실패 시 일정이 사라짐.**
   - 런이 실패로 끝나면 다음 깨움이 없다. cron은 1분 뒤 스스로 돌아왔다.
   - 해소: 드레인 루틴별 try/catch(`StepError`, `node_modules/inngest/components/StepError.d.ts:2-4`)와 계획 실패 시 `step.sleep` 후 재킥.
   - 같은 개편: 작업별 step을 한 런 안에서 반복하면 런당 step 1,000 한도(Inngest usage-limits)에 닿는다. 그래서 「한 런 = 한 사이클 + 이어달리기 킥」으로 바꾸고, 사이클 상한 상수를 없앴다.
6. **[구현 영향] 검증 스크립트가 route.ts에 cron 이름 넷이 있는지 단언함.**
   - 위치: `apps/web/scripts/verify-card-news-surfaces.mts:44-56`.
   - 경로 4(cron 이름 참조 전수 grep)로 발견했다. 계획대로면 이 스크립트가 실패한다.
   - web-dev 범위(`apps/web/src/**`) 밖이라 「범위 밖 의존」에 「같은 사이클에 메인 루프가 반영」으로 넣었다.
7. **[위생] FEAT-63과 겹치는 파일 서술이 틀림.**
   - 계획서는 `cleanup.ts`·`job-lifecycle.ts`가 겹친다고 썼다.
   - 실제로 겹치는 것은 `dashboard/page.tsx`·`entities/card-news/api/index.ts`·`features/card-news/api/index.ts` 셋이다. 두 계획서의 「고칠 파일」 전체 경로를 `comm`으로 대조해 확인했다.
   - 고친 뒤 「나중에 구현하는 쪽이 before를 다시 맞춘다」를 명시했다.

영상 복구 지연(영상 후보는 마감 때만 깬다)은 백로그 요구 ③과 소유자가 승인한 설계(기한까지 잔다)를 따른 것이다. 결함이 아니라 트레이드오프로 「못 덮는 범위」에 명시했다. FEAT-63 V3 유예와의 결합도 같은 성격(틀리지 않고 늦다)이라 「범위 밖 의존」에 적었다.

트리 검산: 편집 대상은 `docs/plans/BUG-19.md` 하나다.

## 라운드 2 — 메인 루프 무편집 실행 라운드 (2026-10-22, 구현 영향 1 · 명세 구멍 1 · 위생 2)

계획서 `8916909`를 스크래치 worktree에 그대로 적용했다(포크 실행). 하니스는 스크래치패드 `b19r2/`(`apply.mjs`·`mutate.mjs`·`cites.mjs`·`sql-rehearsal.sql`)에 있다.

- **경로 3+2**: `apply.mjs` 31단계, before 불일치 0. 바뀐 파일은 「고칠 파일」 23개에 범위 밖 의존인 `verify-card-news-surfaces.mts`를 더한 것과 정확히 일치한다(`comm` 양쪽 0줄).
- **경로 6**: 새 드레인 루틴 위에서 504 예산 모델(`card-news-functions.test.mjs`)이 통과한다.
- **`npm test`**: 387/387(기존 359 + 신규 28). `verify-card-news-surfaces`는 수정본 EXIT 0이고, 원본은 `Missing served worker dispatchPendingCardNews`로 EXIT 1이다. 범위 밖 의존이 실제로 필요하다는 뜻이다.
- **경로 5**: 33개를 심어 30개가 사멸했고 3개가 생존했다. 생존 중 등가 2개(해소 분기에서 streak가 이미 0, 비유한 값→0이 지수 동치)를 빼면 구멍은 1개다(아래 D2).
- **경로 7**: 모두 실패를 확인했다 — 벌크 헬퍼 한 step 호출, `< 60_000` 변조, singleton 제거·cron 추가·skip 모드, try/catch 제거, streak를 아무 이벤트에서 읽기, 계획 실패 시 streak 누락, 이어달리기 킥 누락.
- **경로 9**: 실제 SDK `getConfig`로 확인했다. `maintenance-drain`은 트리거가 이벤트 5개(cron 없음)이고 `"singleton":{"mode":"cancel"}`, `retries.attempts:1`이다. route가 등록하는 함수는 7개이고 옛 id 4개는 없다.
- **경로 1**: 인용 124개 중 내용이 틀린 것은 0개다(휴리스틱 표시 25개는 모두 오탐).
- **경로 4**: `createAssetCleanupJob(` 호출은 정확히 6곳이다(3/3 분류). 적용 뒤 `src`·`scripts`에서 cron 이름 참조는 0건이다.
- **SQL 리허설**(로컬 PG 16): 두 쿼리의 NULL·GREATEST 동작이 기대값과 같다. 업로드가 `completed`인데 예약이 held인 후보도 후보로 남는 것을 실측했다 — 라운드 1의 4번 결함(기한 경과 백오프)의 근거다.

결함:
- **D1 [구현 영향]**: `npm run check` EXIT 2(TS2322 3건). 세 삭제 경로를 `const result = await …`로 바꾸면 반환 문맥이 사라져 `status`가 `string`으로 넓어진다. 변수 타입 주석으로 고치면 `check` EXIT 0이다(포크 실측).
- **D2 [명세 구멍]**: `drainFailed`를 무시하는 돌연변이가 생존했다.
- **D3 [위생]**: vm realm 탓에 `deepEqual`이 거짓 실패를 낸다(정규화 지시가 없었다).
- **D4 [위생]**: 블록 줄 범위 표기 3곳과 `listCardNews`·`getCardNewsDetail` 선언 줄.

**사고**: 포크가 worktree를 정리하면서 `git worktree remove --force`를 썼고, 이 명령이 node_modules junction을 따라 들어가 메인 트리의 루트 `node_modules`(`.bin`과 약 30개 패키지)와 `apps/web/node_modules`를 지웠다. 추적 파일은 영향이 없다(`git status` 0줄). 메인 루프가 `npm ci`로 복구한다. 앞으로 worktree에 junction을 쓰면, 링크를 먼저 끊고(`[IO.Directory]::Delete(path,$false)` 또는 `/s` 없는 `rmdir`) 그 뒤에 제거한다.

## 라운드 3 — 메인 루프 편집 라운드 (2026-10-22, D1~D4 반영)

- **D1**: 세 곳 after에 `const result: { status: "deleting"; cleanupId: string } = await …`를 넣고 이유를 적었다(clip·upload는 진행 중 정리 `return`이 `:47-48`·`:57-58`에 더 있다).
- **D2**: `maintenance-schedule.test.mjs` 명세에 「미래 기한 + 드레인 실패 → 해소 아님」 사례를 추가했다.
- **D3**: `maintenance-functions.test.mjs` 명세에 JSON 왕복 정규화를 추가했다.
- **D4**: 줄 범위를 `:228-230`·`:117-119`·`:139-141`로, 선언 줄을 `:93`·`:108`로 고쳤다.

D1 수정은 라운드 2에서 이미 실측했다(같은 수정으로 `check` EXIT 0). 다음 단계는 `plan-verifier` 독립 무편집 패스다. node_modules 복구 뒤에 디스패치한다.

## 독립 패스 1 — `plan-verifier` (2026-10-22, 결함 3 · 전부 문서 위생)

- 브리핑 계약 위반: 없음.
- 실행한 경로: 1·2·3·4·5·6·7·9 전부.
  - 경로 2의 eslint 하위 검사는 스크래치 파일이 eslint base path 밖이라 실행하지 못했다. 다만 라운드 2 worktree의 `npm run check`가 이미 lint를 통과했다.
- 트리 청결: `git status --porcelain` 빈 출력.
- 경로 5: 21개 중 20개 사멸. 생존 1개(`claimedAt && heartbeatAt`→`||`)는 이식한 입력이 낡은 heartbeat였던 탓이다. 검증자가 신선한 heartbeat로 다시 돌려 사멸을 확인했다(명세 구멍이 아니라 이식 충실도 문제).
- 경로 6: 계획의 작업별 드레인 구조는 4개 작업 모두에 도달했고, 벌크 1-step 구조에서는 `FUNCTION_INVOCATION_TIMEOUT`이 재현됐다.

결함(전부 위생):
1. `deadlineAt` 계산 줄이 `:301`이 아니라 `:257`이다.
2. `listRecoverableCardNewsJobs` 호출 줄이 `:114`가 아니라 `:115`다.
3. `types.d.ts:1385`의 경로 접두가 모호하다 — `components/` 아래가 아니라 `node_modules/inngest/types.d.ts`다.

반영: 세 곳을 정정했다. 생존 돌연변이의 교훈은 테스트 명세의 「미클레임 + heartbeat」 사례에 「신선한 heartbeat로 둔다」고 덧붙였다.

사이클 계수: 위생만 나온 사이클이라 정지 규칙 계수에 넣지 않는다. 계획서가 바뀌었으므로 독립 패스를 다시 받는다.

## 독립 패스 2 — `plan-verifier` (2026-10-22, 결함 0 · 경로 2 일부 미실행)

- 브리핑 계약 위반: 없음. 트리 청결: 빈 출력.
- 경로 1·3·4·6·7·9: 전부 실행했고 결함은 0이다.
- 경로 5: schedule 11개 중 9개, job-due 5개 중 5개, cleanup 7개 중 4개가 사멸했다. 생존한 것은 모두 등가 돌연변이로 확인됐다(상한 포화, 지역 변수가 이미 0, DB Int라 소수 입력이 도달 불가).
- 경로 2의 실행 범위: 순수 모듈 셋과 핸들러 패턴의 사본을 엄격 플래그와 실제 inngest 타입으로 `tsc`해 0 에러를 얻었다. 그러나 「스케치 **적용본** 전체의 `npm run check`(eslint 포함)」는 실행하지 않았다.
- 판정: FEAT-63 독립 패스 1과 같은 기준을 적용한다 — 경로 2의 일부가 미실행이므로 무소득 보고로 받지 않는다. 이 패스는 정의 문구를 고치기(`7054b7f`) 전에 출발했다. 고친 정의로 같은 브리핑을 다시 디스패치한다. 계획서는 바뀌지 않았다.

## 독립 패스 3 — `plan-verifier` (2026-10-22, 결함 0 · 미실행 0) → 클린 패스

- 브리핑 계약 위반: 없음. 트리 청결, `node_modules` 온전(`.bin` 99개), 스크래치 worktree 잔존 0 — 메인 루프가 직접 확인했다.
- **경로 2(적용본 전체)**: worktree(HEAD `cf11f39`)에 스케치를 모두 적용했다(신규 5개 + 편집 14개).
  - `verify:fsd` 통과, `tsc --noEmit` 0, `next lint`는 경고·오류 0(타입 기반 규칙 포함), `npm test` 359/359.
  - 새 테스트 파일은 계획서에 산문 명세로만 있다. 그 명세는 경로 5 하니스로 실행됐다.
  - junction은 링크를 먼저 끊었고, 잔여가 0인지 확인한 뒤 worktree를 제거했다.
- **경로 3**: before 치환이 모두 정확히 1회 매치됐다.
- **경로 4**: 전칭 넷(매분 cron 4, 벌크 헬퍼 호출 0, `createAssetCleanupJob` 6 = 3+3, `< 90_000` 2회)과 적용본의 옛 수출명 잔존 0을 확인했다.
- **경로 5**: 대표 돌연변이 10종이 모두 사멸했다(`drainFailed` 무시, `&&`→`||` 포함).
- **경로 6**: 504 예산 모델 3/3이 통과했다.
- **경로 7**: `verify-card-news-surfaces`는 수정 전 적용본에서 `Missing served worker`로 실패했고, 계획의 처방을 적용한 뒤 통과했다.
- **경로 9**: Events 형태를 tsc가 소비처와 함께 수용했다. 새 SQL의 WHERE는 선례와 바이트가 같다.
- 검증자가 결함이 아니라고 판단한 범위 표기 2건: `verify-card-news-surfaces.mts:44-56`(assert는 `:57`), `processing-dispatch/server.ts:5-16`(블록은 `:4`에서 열린다). 둘 다 지시 대상이 범위 안이나 바로 옆에 있어 적용을 오도하지 않는다.

**판정: 클린 패스.** 무편집 독립 패스 1회에서 결함 0, 미실행 0이다.

사이클 계수: 구현 영향 결함을 낸 독립 사이클은 0이다(1회차는 위생만, 2회차는 판정 불가). 「위생만 2사이클 연속」에는 해당하지 않는다.

교훈 — 경로 2를 「사본 tsc」로 대신한 패스가 두 번 나왔다(BUG-19 2회차, FEAT-63 1회차). 정의 문구(`7054b7f`)로 「적용본 worktree가 표준」임을 밝힌 뒤에는 두 항목 모두 적용본 전체 게이트를 돌렸다.

다음은 게이트②(소유자)다.

## 게이트② (2026-10-22)

FEAT-63이 먼저 배포됐다(`a7fa447`, 배포 순서 FEAT-63 → BUG-19 — V1 orphan 정리 행을 BUG-19의 정비 함수가 실행하기 전에 V1을 고친다). 그 뒤 소유자가 「BUG-19 구현 승인」으로 `구현승인`으로 전이했다.

FEAT-63과 겹치는 파일 셋의 삽입 지점을 메인 루프가 지금 트리에서 다시 확인했다.
- `app/dashboard/page.tsx`: `await reconcileUploadDraftsForUser(…)`·`reconcileStaleUploadedFilesForUser(…)`가 각 1회 있다.
- `features/card-news/api/index.ts`: `listCardNews`가 `:93`에서 `:92`로, `getCardNewsDetail`이 `:108`에서 `:107`로 한 줄씩 밀렸다. 콜백 줄은 함수 안에 그대로 있다.
- `entities/card-news/api/index.ts`: `../model/contract` import(`:10-14`)와 파일 끝이 그대로 있다.

계획서의 「나중에 구현하는 쪽은 before와 줄 번호를 다시 맞춘다」 규칙의 범위 안이다. BUG-19가 고치는 나머지 파일은 FEAT-63이 건드리지 않았다.

## 메인 루프 반영 — 계획서 「범위 밖 의존」 (2026-10-22)

- `apps/web/scripts/verify-card-news-surfaces.mts`: route.ts serve 심볼 목록의 cron 넷(`dispatchPendingCardNews`·`reconcileCardNewsJobs`·`cleanupCardNewsAssets`·`reconcileVideoCreditReservations`)을 `"maintenanceDrain",` 한 줄로 바꿨다. 실행하면 「…registered workers… passed」.
- `apps/web/CLAUDE.md` 테스트 표: 4행을 추가했다(`maintenance-schedule`·`maintenance-functions`·`job-due`·`cleanup-retry`). `card-news-functions.test.mjs` 행은 「드레인 루틴 셋」으로 고쳤다(FEAT-63 25번이 남긴 지시). 수치 줄은 「50개 파일, 56 suite, 402개 테스트」로 바꿨다(`npm test` 실측, `*.test.mjs` 50개).

## 인수 (2026-10-22)

인수 조건 다섯은 모두 메인 루프가 직접 본 것이다.

1. **변경 파일 ↔ 「고칠 파일」**: 소스 변경 23개(수정 14, 신규 9)와 계획서 23행이 `comm` 양쪽 차집합 0으로 일치한다. 그 밖의 변경은 보드·백로그·보고서와 메인 루프 반영 두 파일뿐이다.
2. **diff ↔ 구현 스케치**
   - 새 파일 5개: 계획서 코드 블록을 추출해 비교했다. 4개는 바이트가 같고, `maintenance-functions.ts`는 반환 객체 한 줄을 여러 줄로 감싸고 쉼표를 붙인 것만 다르다.
   - `card-news-functions.ts`: `git diff -w HEAD`로 보면 바뀐 것은 껍데기 셋(`createFunction` → `export async function drain…({ step }: { step: DrainStep })`)과 import 하나다. cleanup 목록 줄이 한 줄로 합쳐진 것은 줄바꿈뿐이고, 작업별 step·id·상한 100은 그대로다.
   - 나머지 수정 파일: plan-verifier 독립 패스 3의 적용 스크립트(`e2a~c.py`)를 HEAD worktree에 돌려 비교했다. 그 스크립트가 적용하지 않은 부분(inngest 파일, 주석)과 import 위치, 80열 줄바꿈 말고는 다른 점이 없다. 남은 차이도 계획서 본문과 일치한다.
3. **검증 명령 재실행**(로그는 스크래치패드 `acc19/`)
   - `npm run check -w apps/web` EXIT 0, `npm test` 402/0(56 suite).
   - `verify-card-news-surfaces` 통과(메인 루프 반영 뒤), client 회귀 6/0.
   - 실 PostgreSQL 통합 CLI EXIT 0 — 「All isolated PostgreSQL card news integration checks passed」. 기대된 `23514` 거부 3건과 테스트가 일부러 일으키는 `synthetic analytics outage`가 나왔다. 이 검사는 정리 재시도 백오프와 삭제 경로 킥이 실 DB에서 깨지지 않는지 함께 덮는다.
   - `npm run build -w apps/web` EXIT 0.
4. **백로그 제거**: `TASK_BACKLOG.md`에 `**BUG-19**`가 0건이다. web-dev가 3줄을 `sed`로 지웠고 diff는 그 3줄 삭제뿐이다. BUG-14·20·21·FEAT-27은 그대로다.
5. **상세 기록 실재**: `docs/agents/web-dev/BUG-19.md`(129줄)가 있다. 보드 `결과`(138자)가 그 파일을 가리킨다.

원장: `docs/release-checks.md`에 「BUG-19」 절 7줄을 등재했다(미배포).

## 배포 (2026-10-23)

- **web**: PR #138(dev→main)은 소유자가 `gh pr merge 138 --merge --admin`으로 머지했다(2026-10-22T22:59:09Z, `6e93c4e`). 자동 모드 분류기가 관리자 머지를 거부하므로 PR #137과 같은 방식이다. Vercel `apc-h`·`apch-admin` 두 status가 모두 success다(`Deployment has completed`).
- **serve 목록**: 무인증 `GET https://a-pch.com/api/inngest`의 `function_count`가 배포 전 10, 배포 뒤 7이다. 「cron 넷 제거 + `maintenanceDrain` 하나 추가」와 맞는다. Inngest Cloud 쪽 sync(옛 넷 소멸·`maintenance-drain` 등록)와 유휴 실행 0, Neon Idle 복귀는 대시보드로만 보인다. 원장 7줄은 아직 열려 있다.
