# FEAT-31 — 엔티티 배럴 다섯을 클라이언트 안전 `index.ts` + 서버 전용 `server.ts`로 분할

## 2026-09-04 구현 (web-dev)

계획서 `docs/plans/FEAT-31.md`를 파일에서 다시 읽고, 「현재 동작」이 코드와 일치함을
확인한 뒤 구현했다(다섯 `api/index.ts:1` 전부 `import "server-only"`, 다섯 barrel이
그것을 재수출, 13개 임포터의 before 경로 전수 대조 — 전부 일치). 스케치와의 차이 없음.

### 고친 파일 (전수)

**신규 5 (`server.ts` — 선례 `entities/clip/server.ts` 형태·주석 문구 동일):**

- `src/fsd/entities/analytics-event/server.ts` — `import "server-only"` + `cleanupExpiredAnalyticsEvents, recordAnalyticsEvent` 재수출
- `src/fsd/entities/order/server.ts` — `createOrder, findOrderByPolarId`
- `src/fsd/entities/subscription/server.ts` — 함수 5 (`deleteSubscriptionByUserId, findSubscriptionByPolarId, findSubscriptionByUserId, updateSubscriptionByPolarId, upsertSubscription`)
- `src/fsd/entities/user/server.ts` — 함수 10 (알파벳 순)
- `src/fsd/entities/processing-dispatch/server.ts` — 함수 5 + `export type { PendingProcessingDispatch }`

**수정 5 (`index.ts`):**

- `analytics-event/index.ts` · `order/index.ts` · `subscription/index.ts` · `user/index.ts` — `./api` 재수출 제거 → 주석 3줄 + `export {};`
- `processing-dispatch/index.ts` — `./api` 함수 5 + `type PendingProcessingDispatch` 제거, `./model/types`의 `type ProcessingDispatchStatus`만 남김(클라이언트 안전)

**수정 13 (서버 임포터 — module specifier 끝에 `/server`만 추가, 심볼 목록 불변):**

- `src/inngest/functions.ts` (analytics-event)
- `src/app/api/analytics/events/route.ts` (analytics-event)
- `src/app/page.tsx` (user)
- `src/app/api/portal/route.ts` (user)
- `src/app/dashboard/layout.tsx` (user)
- `src/fsd/features/handle-order-created/api/index.ts` (order·user 각각)
- `src/fsd/features/upload/api/index.ts` (processing-dispatch)
- `src/fsd/features/upload/api/dispatch-processing.ts` (processing-dispatch)
- `src/fsd/features/upload/api/complete-processing-attempt.ts` (user)
- `src/fsd/features/handle-subscription-updated/api/index.ts` (subscription·user)
- `src/fsd/features/handle-subscription-active/api/index.ts` (subscription·user)
- `src/fsd/features/handle-subscription-canceled/api/index.ts` (subscription)
- `src/fsd/features/billing/api/index.ts` (subscription·user)

계획서에 없는 파일은 고치지 않았다. 스케치 대비 분기·조건·리터럴·문구 차이 없음.

### 스케치와의 차이

없음. 계획서 「구현 스케치」의 코드를 그대로 적용했다.

### 검증 (계획서 「테스트」 절 순서대로 실제 실행)

1. **`npm run check -w apps/web`** (`next lint && tsc --noEmit`) — **EXIT 0**.
   `✔ No ESLint warnings or errors`. 임포터 누락 안전망(`TS2305`) 통과 = 13개 임포터
   전부 `/server`로 돌렸음이 입증됨.

2. **분할 후 프로브 — `npm run build`.** `src/app/barrel-probe/page.tsx`에
   `"use client"` + 다섯 barrel side-effect 임포트를 넣고 빌드 → **EXIT 0** 통과.
   프로브 라우트가 클라이언트 정적 라우트로 컴파일됐다:

   ```
   ├ ○ /barrel-probe                                             387 B         104 kB
   ...
   ○  (Static)   prerendered as static content
   EXIT: 0
   ```

   `○`(Static) 판정 = `"use client"` 모듈이 다섯 barrel을 전부 side-effect로
   임포트해도 `server-only`가 클라이언트 번들에 섞이지 않는다 = **다섯 전부**
   클라이언트 안전해졌다는 동시 증명. (분할 전 절반은 검증 라운드에서 이미 실측:
   프로브가 `You're importing a component that needs "server-only"`로 빌드 실패했고,
   같은 상태에서 `tsc --noEmit` EXIT 0 — `check`는 통과하고 `build`만 깨지는
   비대칭이 이 항목의 전제였다.)

3. **프로브 삭제 + `.next` 삭제 후 `npm run build` 재실행** — **EXIT 0**.
   (`rm -rf apps/web/.next`로 이전 라운드의 `.next/types` 잔존 `TS2307` 전례를 예방.)
   실물 통과 확인.

4. **`npm test -w apps/web`** — `tests 77 / pass 77 / fail 0` (**77개 유지**, 로직 무변경).

`git status --short`로 트리 청결 확인: 수정 18 + 신규 5(`server.ts`)만, barrel-probe
아티팩트 없음. 프로브는 커밋하지 않았다.

### 테스트로 못 덮은 범위

- **이 결함의 유일한 게이트는 `npm run build`다.** `npm test`(Node 내장 러너, `tsx --test`)는
  `server-only`가 클라이언트 번들에 섞였는지, barrel이 클라이언트에서 임포트 가능한지를
  검사할 수 없다. barrel 재구성이라 순수 함수 추출이 없어 새 `*.test.mjs`도 없다.
  분할의 효과 증명은 위 프로브 빌드가 유일한 실물 증거이며, 프로브는 커밋에 포함되지
  않으므로 CI 회귀 방어선으로 남지 않는다 — 향후 새 `api/index.ts` 심볼이 다시 `index.ts`로
  재수출되면 클라이언트 임포터가 생기기 전까지 잠복한다(FEAT-31이 없앤 상태로의 회귀).
- 이 변경은 순수 배럴 재배선이라 런타임 DB 접근 경로·비즈니스 로직은 한 줄도 바뀌지 않았다.
  DB 호출·서버 액션 인가·실제 요청 흐름은 이 항목 범위 밖이며 배포 실물에서만 관측된다.
