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
