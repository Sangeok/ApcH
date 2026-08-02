---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-06-11"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# Neon Launch 비용 최소화 검토

작성일: 2026-06-11

## 요약

현재 앱은 기존 기능을 유지하면서도 Neon Launch 비용이 불필요하게 커질 가능성을 줄일 수 있다. 가장 현실적인 절감 포인트는 테이블 삭제나 핵심 DB 사용 방식 재작성보다는 Neon Launch 설정과 백그라운드 작업 주기다.

비용을 줄일 수 있는 항목은 다음과 같다.

- Neon compute의 scale to zero 설정을 유지한다.
- Launch 시작 시 compute 범위를 보수적으로 설정한다.
- 런타임 트래픽이 Neon pooled connection string을 사용하는지 확인한다.
- 복구 지연을 조금 허용할 수 있다면 백그라운드 cron 주기를 줄이거나 조정한다.
- 사용하지 않는 branch를 삭제하고 branch restore window를 의도적으로 짧게 유지한다.

반대로, "현재 기능 유지" 조건에서는 변경을 권장하지 않는 항목도 있다.

- 운영 쿼리 근거 없이 현재 status/queue 관련 인덱스를 제거하지 않는다.
- DB 비용 절감만을 이유로 사용자 업로드 히스토리나 생성된 clip 메타데이터를 자동 삭제하지 않는다.
- active upload polling을 baseline 비용의 핵심 원인으로 보지 않는다. 이 polling은 활성 업로드가 보이는 동안에만 실행된다.

## 현재 DB 사용 방식

이 앱은 Prisma를 통해 Neon Postgres를 사용한다.

- 런타임 Prisma client: `src/server/db.ts`
- Prisma schema: `prisma/schema.prisma`
- 생성된 Prisma client: `generated/prisma/`

DB에는 업로드된 미디어 파일 자체가 아니라 애플리케이션 메타데이터가 저장된다.

- 인증 사용자와 OAuth account
- 사용자 credits
- 업로드 파일 상태와 처리 타임스탬프
- 생성된 clip 메타데이터와 S3 key
- 처리 dispatch queue 상태
- Polar subscription과 order 기록

원본 영상과 생성된 clip 파일은 S3에 저장되고, DB row는 key와 상태만 저장한다.

## Neon Launch 비용 요인

2026-06-11 기준 Neon pricing/docs 확인 내용은 다음과 같다.

- Launch는 사용량 기반 과금이다.
- Compute는 CU-hour 기준으로 과금된다.
- Storage는 GB-month 기준으로 과금된다.
- Branch, restore history, 추가 storage가 비용에 영향을 줄 수 있다.
- Idle compute는 scale to zero가 가능하지만, 주기적인 query가 compute를 다시 깨울 수 있다.

관련 Neon 문서:

- https://neon.com/pricing
- https://neon.com/docs/introduction/plans
- https://neon.com/docs/introduction/cost-optimization
- https://neon.com/docs/introduction/compute-lifecycle
- https://neon.com/docs/guides/prisma

## 검토 결과

### 1. Scale To Zero 유지

저트래픽 launch에서는 가장 중요한 Launch 설정이다. compute가 idle 상태에서 zero로 내려가면, idle 시간 동안 DB compute 비용을 피할 수 있다.

현재 앱의 DB 사용은 이벤트 기반과 dashboard 기반에 가깝다. 따라서 백그라운드 job이 DB를 너무 자주 깨우지만 않는다면 scale to zero의 효과를 볼 수 있다.

권장 사항:

- 선택한 branch/compute에서 Neon이 허용한다면 minimum compute를 `0`으로 설정한다.
- autosuspend를 켜 둔다.
- launch 후 compute active time을 모니터링한다.

### 2. Compute 크기를 보수적으로 시작

이 앱의 무거운 작업은 DB 밖에서 수행되는 구조로 보인다.

- 영상 처리는 Modal로 전달된다.
- 미디어 파일은 S3에 저장된다.
- Inngest가 async job을 조율한다.
- DB는 상태, 메타데이터, queue record를 저장한다.

권장 사항:

- 처음에는 작은 compute 범위로 시작한다. 예를 들면 minimum `0`, maximum `1-2 CU` 수준이다.
- Neon metrics에서 CPU, memory, connection, query latency 압박이 보일 때만 올린다.

이 변경은 capacity 설정만 바꾸므로 기존 기능을 바꾸지 않는다.

### 3. Runtime에서 Neon pooled connection 사용 확인

현재 코드는 런타임 URL과 direct DB URL을 분리할 수 있게 되어 있다.

- `DATABASE_URL`은 Prisma runtime에서 사용된다.
- `DATABASE_URL_UNPOOLED`는 `prisma/schema.prisma`의 `directUrl`로 설정되어 있다.

Next.js serverless 배포에서는 런타임 트래픽이 Neon pooled connection URL을 사용하는 것이 좋다. migration/direct 작업은 unpooled URL을 사용하면 된다.

권장 사항:

- production env var에서 `DATABASE_URL`이 pooled Neon URL인지 확인한다. 일반적으로 hostname에 `-pooler`가 포함된다.
- `DATABASE_URL_UNPOOLED`는 migration/direct access 용도로 유지한다.

이렇게 하면 짧게 생성되는 serverless connection이 많아질 때 connection pressure를 줄이고, 불필요한 scaling 가능성도 낮출 수 있다.

### 4. 백그라운드 cron 주기 조정

코드베이스에서 발견한 주요 상시 비용 리스크는 scheduled background work다.

- `processingMaintenanceSweep`는 `src/inngest/functions.ts`에서 15분마다 실행된다.
- `uploadDraftSweep`는 `src/inngest/functions.ts`에서 1시간마다 실행된다.

이 job들은 사용자 트래픽이 없어도 DB를 조회한다. Neon compute가 idle 후 suspend되는 상태라면, 15분 cron이 compute를 반복적으로 깨울 수 있다.

대략적인 baseline 영향:

- 각 wake 이후 compute가 약 5분간 active 상태로 유지된다고 보면, 15분 cron은 대략 `60 CU-hours/month`의 wake time을 만들 수 있다.
- Launch 가격을 약 `$0.106 / CU-hour`로 보면, `1 CU` 기준 약 `$6.36/month`다.
- 30분 주기는 약 `$3.18/month` 수준이다.
- 60분 주기는 약 `$1.59/month` 수준이다.

이 수치는 추정치다. 실제 비용은 compute 크기, autosuspend timing, query duration, 다른 트래픽의 존재 여부에 따라 달라진다.

권장 사항:

- draft recovery/cleanup을 더 빠르게 처리해야 하는 요구가 없다면 `uploadDraftSweep`는 hourly 유지가 적절하다.
- 느린 failure recovery를 허용할 수 있다면 `processingMaintenanceSweep`를 15분마다 실행하는 대신 30분 또는 60분 주기로 바꾸는 것을 검토한다.
- 사용자 upload flow에서 즉시 dispatch를 nudging하는 로직은 유지한다. 정상 경로의 사용자 경험을 보존하기 위해 필요하다.

트레이드오프:

- cron 빈도를 낮추면 idle wakeup이 줄어든다.
- cron 빈도를 낮추면 stuck queued 또는 stale processing record의 최악 복구 시간이 늘어난다.

### 5. Branch와 Restore Window 관리

Launch 비용은 branch 관련 storage와 restore history에서도 발생할 수 있다.

권장 사항:

- 사용하지 않는 preview/dev branch를 삭제한다.
- 가능한 경우 branch expiration/TTL을 사용한다.
- restore window는 비즈니스가 감당 가능한 수준에서 짧게 유지한다.
- storage가 누적되는 장기 child branch를 피한다.

이 항목은 운영 설정이며 코드 변경이 필요하지 않다.

## 비용 절감을 위해 권장하지 않는 항목

### 현재 인덱스를 근거 없이 제거하지 않는다

현재 schema에는 upload status, timestamp, user/status 조합에 대한 여러 인덱스가 있다. 이들은 dashboard list, queue state, maintenance sweep을 지원한다.

인덱스를 제거하면 storage를 아주 조금 줄일 수는 있지만 query latency와 compute time을 늘릴 수 있다. 운영 쿼리 metric 없이 진행하기에는 안전한 비용 절감 방식이 아니다.

### DB 비용만을 이유로 사용자 히스토리를 삭제하지 않는다

Uploaded file row와 clip metadata는 dashboard history 기능을 지원한다. 이를 자동 삭제하면 제품 동작이 바뀐다.

나중에 retention이 제품 요구사항이 된다면 사용자에게 보이는 retention policy로 설계해야 한다. 숨겨진 DB 비용 최적화로 처리해서는 안 된다.

### Active UI Polling은 baseline 비용의 핵심 원인이 아니다

Polling interval은 `src/fsd/entities/uploaded-file/model/polling.ts`에 정의된 `7.5s`다. 하지만 이 polling은 upload가 active processing 상태일 때만 사용되고, background refetch는 꺼져 있다.

즉 이 비용은 활성 사용자 세션에 영향을 주는 비용이지, idle baseline 비용의 핵심 원인은 아니다. 나중에 효율화를 위해 재검토할 수는 있지만 Launch 비용 절감의 1순위는 아니다.

## 권장 실행 순서

1. Neon Console에서 production compute를 scale to zero와 보수적인 max CU로 설정한다.
2. production `DATABASE_URL`이 Neon pooled connection string을 사용하는지 확인한다.
3. 사용하지 않는 Neon branch를 삭제하고 restore window를 짧게 유지한다.
4. launch 후 Neon metrics에서 compute active time, storage, branch storage, connection usage를 확인한다.
5. idle compute 비용이 의미 있게 발생하면 `processingMaintenanceSweep`를 `*/15 * * * *`에서 `*/30 * * * *` 또는 `0 * * * *`로 바꾸는 것을 검토한다.

## 결론

현재 기능을 제거하지 않고도 비용을 줄일 수 있는 현실적인 방법은 있다. 핵심은 Neon 운영 설정과 cron 빈도 조정이다. 반면 현재 시점에서는 table, index, dashboard polling을 제거해야 한다는 강한 코드 근거는 없다.
