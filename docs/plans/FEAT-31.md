# FEAT-31: 엔티티 배럴 다섯을 클라이언트 안전 `index.ts` + 서버 전용 `server.ts`로 분할

agent: web-dev

## 현재 동작

다섯 엔티티 슬라이스의 루트 barrel(`index.ts`)이 `server-only` api 세그먼트를 그대로 재수출한다.

각 슬라이스의 `api/index.ts` **1행은 다섯 곳 모두 `import "server-only";`** 다 (읽어서 확인):

- `entities/analytics-event/api/index.ts:1`
- `entities/order/api/index.ts:1`
- `entities/processing-dispatch/api/index.ts:1`
- `entities/subscription/api/index.ts:1`
- `entities/user/api/index.ts:1`

그리고 각 `index.ts`가 그 `./api`를 재수출한다:

- `entities/analytics-event/index.ts:1` — `export { cleanupExpiredAnalyticsEvents, recordAnalyticsEvent } from "./api";`
- `entities/order/index.ts:1` — `export { createOrder, findOrderByPolarId } from "./api";`
- `entities/processing-dispatch/index.ts:1-8` — `./api`에서 함수 5 + `type PendingProcessingDispatch`를 재수출. 추가로 `index.ts:9`가 `./model/types`에서 `type ProcessingDispatchStatus`(클라이언트 안전)를 재수출한다.
- `entities/subscription/index.ts:1-7` — `./api`에서 함수 5 재수출.
- `entities/user/index.ts:1-12` — `./api`에서 함수 10 재수출.

즉 다섯 중 넷(analytics-event·order·subscription·user)은 barrel이 **전부** `server-only` api뿐이고, processing-dispatch만 `./model/types`의 클라이언트 안전 타입 하나를 함께 내보낸다.

현재 이 다섯 barrel을 임포트하는 곳은 전부 서버 측이다(전수, 아래 「현재 임포터」 확인). `"use client"` 모듈이 이 barrel을 임포트하는 곳은 0건이라 `npm run build`가 통과한다.

같은 문제를 가졌던 세 슬라이스는 이미 `index.ts`(클라이언트 안전) + `server.ts`(`import "server-only"` + `./api` 재수출)로 분할돼 있다 — 읽어서 확인한 패턴:

- `entities/uploaded-file/index.ts:1-55`(주석 1-5 + `model`·`ui` 재수출) / `entities/uploaded-file/server.ts:1`(`import "server-only";`) `:11-40`(`./api` 함수 + `export type { StaleProcessingCandidate } from "./api";`)
- `entities/clip/index.ts:1-2`(`export { clipTypeLabel } from "./lib/clip-type-label";`) / `entities/clip/server.ts:1`(`import "server-only";`) `:4-10`(`./api` 함수 5)
- `entities/clip-draft/index.ts:1-2`(`export type { ClipDraft } from "./model/types";`) / `entities/clip-draft/server.ts:1`(`import "server-only";`) `:4-11`(`./api` 함수 6)

규약은 `apps/web/docs/conventions/fsd-architecture-guidelines.md:108-141` 「슬라이스 공개 API를 런타임 기준으로 나눈다 (`index.ts` / `server.ts`)」다. `index.ts`는 `model`·`lib`·`ui`만, `server.ts`는 `import "server-only"` + `./api`.

### 현재 임포터 (전수 — 13개 파일, 모두 서버 측)

`~/fsd/entities/<slice>`(bare barrel)로 서버 전용 심볼을 가져가는 곳 전부. 상대경로 임포터는 0건(`grep`으로 확인). 각 파일 1행을 읽어 `"use client"` 없음(전부 서버 컴포넌트·route handler·server action·`server-only` 헬퍼)을 확인했다.

| 파일:줄 | 슬라이스 | 가져가는 심볼 |
| --- | --- | --- |
| `src/inngest/functions.ts:24` | analytics-event | `cleanupExpiredAnalyticsEvents` |
| `src/app/api/analytics/events/route.ts:3` | analytics-event | `recordAnalyticsEvent` |
| `src/fsd/features/handle-order-created/api/index.ts:1` | order | `createOrder, findOrderByPolarId` |
| `src/fsd/features/upload/api/index.ts:7` | processing-dispatch | `createProcessingDispatch` |
| `src/fsd/features/upload/api/dispatch-processing.ts:3-9` | processing-dispatch | `claimPendingProcessingDispatch, findPendingProcessingDispatchById, markProcessingDispatchDeadLetter, markProcessingDispatchSent, type PendingProcessingDispatch` |
| `src/fsd/features/handle-subscription-updated/api/index.ts:1-4` | subscription | `findSubscriptionByPolarId, updateSubscriptionByPolarId` |
| `src/fsd/features/handle-subscription-active/api/index.ts:1-6` | subscription | `deleteSubscriptionByUserId, findSubscriptionByPolarId, findSubscriptionByUserId, upsertSubscription` |
| `src/fsd/features/handle-subscription-canceled/api/index.ts:1-4` | subscription | `findSubscriptionByPolarId, updateSubscriptionByPolarId` |
| `src/fsd/features/billing/api/index.ts:4` | subscription | `findSubscriptionByUserId, updateSubscriptionByPolarId` |
| `src/app/page.tsx:2` | user | `getHomeUserProfile` |
| `src/app/api/portal/route.ts:4` | user | `getUserPolarCustomerId` |
| `src/app/dashboard/layout.tsx:3` | user | `getDashboardHeaderUser` |
| `src/fsd/features/handle-subscription-updated/api/index.ts:5` | user | `incrementUserCredits` |
| `src/fsd/features/handle-subscription-active/api/index.ts:7-11` | user | `incrementUserCreditsAndSetPolarCustomerId, resolvePolarCustomerUserId, updateUserPolarCustomerId` |
| `src/fsd/features/handle-order-created/api/index.ts:2` | user | `resolvePolarCustomerUserId` |
| `src/fsd/features/upload/api/complete-processing-attempt.ts:3` | user | `decrementUserCreditsFloorZero` |
| `src/fsd/features/billing/api/index.ts:5` | user | `getBillingUserSnapshot` |

파일 단위로는 13개(두 심볼을 각각 다른 슬라이스에서 가져가는 파일 4개 — handle-subscription-updated·handle-subscription-active·handle-order-created·billing — 때문에 위 행은 17개). `dispatch-processing.ts:10`은 이미 `~/fsd/entities/clip-draft/server`를 쓴다 — `/server` 진입점을 쓰는 선례가 소비처에도 이미 있다.

## 문제

백로그(`TASK_BACKLOG.md` FEAT-31)가 지목한 문제: 이 다섯 barrel을 임포트하는 **첫 `"use client"` 컴포넌트가 빌드를 깬다.** `api/index.ts`가 `server-only`인데 barrel이 그것을 재수출하므로, 클라이언트가 barrel을 임포트하면 `server-only`가 클라이언트 번들에 들어가 `npm run build`가 실패한다. `tsc --noEmit`은 통과하므로 배포 직전(또는 Vercel 빌드)에서야 발견된다.

「현재 동작」에서 확인한 것과 백로그의 지목이 일치한다: 다섯 `api/index.ts:1`이 모두 `server-only`이고, 다섯 `index.ts`가 그것을 재수출한다. `uploaded-file`이 C-07 이전에 정확히 이 상태였고, 그래서 클라이언트 모듈 13개가 barrel을 우회해 `model/*`·`ui/*`를 직접 임포트해 공개 API 경계가 사실상 없었다(선례의 근거).

지금은 클라이언트 임포터가 0건이라 빌드가 통과하는 잠복 상태다. 이 항목은 잠복 파손을 미리 제거한다.

## 고칠 파일

### 배럴 분할 (5 슬라이스: index.ts 수정 5 + server.ts 신규 5)

| 파일 | 변경 |
| --- | --- |
| `src/fsd/entities/analytics-event/index.ts` | `./api` 재수출 제거 → 클라이언트 안전 표면 없음(주석 + `export {};`) |
| `src/fsd/entities/analytics-event/server.ts` `(신규)` | `import "server-only"` + `./api` 함수 2 재수출 |
| `src/fsd/entities/order/index.ts` | `./api` 재수출 제거 → `export {};` |
| `src/fsd/entities/order/server.ts` `(신규)` | `import "server-only"` + `./api` 함수 2 재수출 |
| `src/fsd/entities/subscription/index.ts` | `./api` 재수출 제거 → `export {};` |
| `src/fsd/entities/subscription/server.ts` `(신규)` | `import "server-only"` + `./api` 함수 5 재수출 |
| `src/fsd/entities/user/index.ts` | `./api` 재수출 제거 → `export {};` |
| `src/fsd/entities/user/server.ts` `(신규)` | `import "server-only"` + `./api` 함수 10 재수출 |
| `src/fsd/entities/processing-dispatch/index.ts` | `./api` 함수 5 + `type PendingProcessingDispatch` 재수출 제거. `./model/types`의 `type ProcessingDispatchStatus`만 남김(클라이언트 안전) |
| `src/fsd/entities/processing-dispatch/server.ts` `(신규)` | `import "server-only"` + `./api` 함수 5 + `type PendingProcessingDispatch` 재수출 |

### 서버 측 임포터 교체 (13개 파일 — `~/fsd/entities/<slice>` → `~/fsd/entities/<slice>/server`)

| 파일 | 변경 |
| --- | --- |
| `src/inngest/functions.ts` | analytics-event 임포트를 `/server`로 |
| `src/app/api/analytics/events/route.ts` | analytics-event 임포트를 `/server`로 |
| `src/app/page.tsx` | user 임포트를 `/server`로 |
| `src/app/api/portal/route.ts` | user 임포트를 `/server`로 |
| `src/app/dashboard/layout.tsx` | user 임포트를 `/server`로 |
| `src/fsd/features/handle-order-created/api/index.ts` | order·user 임포트를 각각 `/server`로 |
| `src/fsd/features/upload/api/index.ts` | processing-dispatch 임포트를 `/server`로 |
| `src/fsd/features/upload/api/dispatch-processing.ts` | processing-dispatch 임포트를 `/server`로 |
| `src/fsd/features/upload/api/complete-processing-attempt.ts` | user 임포트를 `/server`로 |
| `src/fsd/features/handle-subscription-updated/api/index.ts` | subscription·user 임포트를 각각 `/server`로 |
| `src/fsd/features/handle-subscription-active/api/index.ts` | subscription·user 임포트를 각각 `/server`로 |
| `src/fsd/features/handle-subscription-canceled/api/index.ts` | subscription 임포트를 `/server`로 |
| `src/fsd/features/billing/api/index.ts` | subscription·user 임포트를 각각 `/server`로 |

여기 없는 파일은 구현 단계에서 고치지 않는다. features 슬라이스의 공개 API(`features/*/api/index.ts`)는 이 다섯 barrel을 **재수출하지 않는다**(전수 확인: 모든 참조가 `import`, `export ... from` 0건) — 파급 없음.

## 심볼 → 목적지 표 (분할 후 각 심볼이 어디로 가나)

| 슬라이스 | 심볼 | 성격 | 분할 후 위치 |
| --- | --- | --- | --- |
| analytics-event | `cleanupExpiredAnalyticsEvents`, `recordAnalyticsEvent` | 서버(`./api`) | `server.ts` |
| order | `createOrder`, `findOrderByPolarId` | 서버(`./api`) | `server.ts` |
| processing-dispatch | `claimPendingProcessingDispatch`, `createProcessingDispatch`, `findPendingProcessingDispatchById`, `markProcessingDispatchDeadLetter`, `markProcessingDispatchSent` | 서버(`./api`) | `server.ts` |
| processing-dispatch | `PendingProcessingDispatch` (type) | 서버 파생(`./api`) | `server.ts` |
| processing-dispatch | `ProcessingDispatchStatus` (type) | 클라이언트 안전(`./model/types`) | `index.ts` |
| subscription | `deleteSubscriptionByUserId`, `findSubscriptionByPolarId`, `findSubscriptionByUserId`, `updateSubscriptionByPolarId`, `upsertSubscription` | 서버(`./api`) | `server.ts` |
| user | `decrementUserCreditsFloorZero`, `findUserIdByEmail`, `getBillingUserSnapshot`, `getDashboardHeaderUser`, `getHomeUserProfile`, `getUserPolarCustomerId`, `incrementUserCredits`, `incrementUserCreditsAndSetPolarCustomerId`, `resolvePolarCustomerUserId`, `updateUserPolarCustomerId` | 서버(`./api`) | `server.ts` |

analytics-event·order·subscription·user는 `index.ts`에 남는 클라이언트 안전 심볼이 0개다(세 선례와 달리 이 넷은 `model`·`lib`·`ui` 세그먼트 자체가 없다). processing-dispatch만 `model/types`가 있어 세 선례와 같은 모양(`index.ts`에 타입 하나)이 된다.

## 구현 스케치

### 서버 전용 슬라이스 넷 — index.ts (클라이언트 안전 표면 없음)

네 파일(`analytics-event`·`order`·`subscription`·`user`)의 `index.ts`를 아래로 교체한다. 선례 셋과 달리 재수출할 클라이언트 안전 세그먼트가 없어 빈 모듈이 된다 — `export {};`로 명시적 ES 모듈로 둔다(주석으로 이유를 남긴다):

```ts
// 이 슬라이스는 클라이언트 안전 공개 표면이 없다 (model·lib·ui 세그먼트 없음).
// 서버 전용 DB 접근은 `./server`. `./api`(server-only)를 여기에 재수출하면
// 이 barrel을 임포트하는 클라이언트 모듈의 빌드가 깨진다.
export {};
```

### 서버 전용 슬라이스 넷 — server.ts (신규)

선례 `entities/clip/server.ts:1-10` 형태 그대로. 각 슬라이스의 `./api` 함수를 알파벳 순으로 재수출한다.

`analytics-event/server.ts`:
```ts
import "server-only";

/** 이 슬라이스의 **서버 전용** 공개 API. 클라이언트 안전 표면은 `./index`. */
export { cleanupExpiredAnalyticsEvents, recordAnalyticsEvent } from "./api";
```

`order/server.ts`:
```ts
import "server-only";

/** 이 슬라이스의 **서버 전용** 공개 API. 클라이언트 안전 표면은 `./index`. */
export { createOrder, findOrderByPolarId } from "./api";
```

`subscription/server.ts`:
```ts
import "server-only";

/** 이 슬라이스의 **서버 전용** 공개 API. 클라이언트 안전 표면은 `./index`. */
export {
  deleteSubscriptionByUserId,
  findSubscriptionByPolarId,
  findSubscriptionByUserId,
  updateSubscriptionByPolarId,
  upsertSubscription,
} from "./api";
```

`user/server.ts`:
```ts
import "server-only";

/** 이 슬라이스의 **서버 전용** 공개 API. 클라이언트 안전 표면은 `./index`. */
export {
  decrementUserCreditsFloorZero,
  findUserIdByEmail,
  getBillingUserSnapshot,
  getDashboardHeaderUser,
  getHomeUserProfile,
  getUserPolarCustomerId,
  incrementUserCredits,
  incrementUserCreditsAndSetPolarCustomerId,
  resolvePolarCustomerUserId,
  updateUserPolarCustomerId,
} from "./api";
```

### processing-dispatch

`processing-dispatch/index.ts` (현재 `:1-9`)를 아래로 교체 — 클라이언트 안전 타입만 남긴다:
```ts
/** 클라이언트 안전 표면. 서버 전용 DB 접근은 `./server`. */
export type { ProcessingDispatchStatus } from "./model/types";
```

`processing-dispatch/server.ts` (신규):
```ts
import "server-only";

/** 이 슬라이스의 **서버 전용** 공개 API. 클라이언트 안전 표면은 `./index`. */
export {
  claimPendingProcessingDispatch,
  createProcessingDispatch,
  findPendingProcessingDispatchById,
  markProcessingDispatchDeadLetter,
  markProcessingDispatchSent,
} from "./api";
export type { PendingProcessingDispatch } from "./api";
```

### 임포터 교체 (module specifier만 `/server` 추가)

각 임포트문의 심볼 목록은 그대로 두고 경로 끝에 `/server`만 붙인다. before는 적기 직전 다시 읽어 확인했다. 대표 예:

`src/inngest/functions.ts:24`
```ts
// before
import { cleanupExpiredAnalyticsEvents } from "~/fsd/entities/analytics-event";
// after
import { cleanupExpiredAnalyticsEvents } from "~/fsd/entities/analytics-event/server";
```

`src/app/api/analytics/events/route.ts:3`
```ts
// before
import { recordAnalyticsEvent } from "~/fsd/entities/analytics-event";
// after
import { recordAnalyticsEvent } from "~/fsd/entities/analytics-event/server";
```

`src/app/page.tsx:2` · `src/app/api/portal/route.ts:4` · `src/app/dashboard/layout.tsx:3`
```ts
// before:  from "~/fsd/entities/user";
// after:   from "~/fsd/entities/user/server";
```

`src/fsd/features/handle-order-created/api/index.ts:1-2`
```ts
// before
import { createOrder, findOrderByPolarId } from "~/fsd/entities/order";
import { resolvePolarCustomerUserId } from "~/fsd/entities/user";
// after
import { createOrder, findOrderByPolarId } from "~/fsd/entities/order/server";
import { resolvePolarCustomerUserId } from "~/fsd/entities/user/server";
```

`src/fsd/features/upload/api/index.ts:7`
```ts
// before
import { createProcessingDispatch } from "~/fsd/entities/processing-dispatch";
// after
import { createProcessingDispatch } from "~/fsd/entities/processing-dispatch/server";
```

`src/fsd/features/upload/api/dispatch-processing.ts:3-9` (다중행 블록의 `from` 줄만 교체)
```ts
// before
} from "~/fsd/entities/processing-dispatch";
// after
} from "~/fsd/entities/processing-dispatch/server";
```

`src/fsd/features/upload/api/complete-processing-attempt.ts:3`
```ts
// before:  from "~/fsd/entities/user";
// after:   from "~/fsd/entities/user/server";
```

`src/fsd/features/handle-subscription-updated/api/index.ts` (`:4` subscription 블록의 `from` 줄, `:5` user 줄), `handle-subscription-active/api/index.ts` (`:6` subscription 블록, `:11` user 블록의 `from` 줄), `handle-subscription-canceled/api/index.ts` (`:4` subscription 블록의 `from` 줄), `billing/api/index.ts` (`:4` subscription, `:5` user) — 전부 심볼 유지, `from "...subscription"`→`"...subscription/server"`, `from "...user"`→`"...user/server"`.

## 테스트

- **덮는 것**: 없음. 순수 함수를 추출하지 않는다 — barrel 재구성이라 새 `*.test.mjs`가 없다. `apps/web/CLAUDE.md` 테스트 목록 표에 추가할 행 없음.
- **못 덮는 범위**: 이 결함의 유일한 게이트는 `npm run build`다. `npm test`(Node 내장 러너, `tsx --test`)는 `server-only`가 클라이언트 번들에 섞였는지, barrel이 클라이언트에서 임포트 가능한지를 검사할 수 없다. 다음으로 판정한다:

1. **`npm run check -w apps/web`** (`next lint && tsc --noEmit) — 임포터 누락 검출.** 분할로 `index.ts`에서 서버 심볼이 사라지므로, `/server`로 못 돌린 임포터가 하나라도 남으면 `TS2305`(no exported member)로 tsc가 잡는다. 즉 「서버 측 임포터 전수」의 누락은 여기서 빌드 전에 걸린다.
2. **분할이 실제로 효과가 있는지 증명 — `"use client"` 프로브로 `npm run build`.** 임시 라우트 파일 `src/app/barrel-probe/page.tsx`를 만든다(구현 단계에서, 커밋하지 않고 검증 후 삭제):
   ```tsx
   "use client";
   import "~/fsd/entities/analytics-event";
   import "~/fsd/entities/order";
   import "~/fsd/entities/processing-dispatch";
   import "~/fsd/entities/subscription";
   import "~/fsd/entities/user";
   export default function BarrelProbe() {
     return null;
   }
   ```
   - **분할 전에 이 프로브를 넣고 `npm run build`** → `server-only` 위반으로 빌드 실패해야 한다(잠복 파손이 실재함을 증명). `next build`가 첫 위반에서 멈추므로 이 실패는 "다섯 중 적어도 하나"를 보이며, 다섯 `api/index.ts:1`이 모두 `server-only`임은 「현재 동작」에서 파일로 확인했다.
     **이 절반은 검증 라운드에서 이미 실행해 확정됐다**(2026-09-04, 메인 루프): `src/app/barrel-probe/page.tsx`에 `"use client"` + `import "~/fsd/entities/user";`만 넣고 `npm run build` →
     ```
     Failed to compile.
     Error: You're importing a component that needs "server-only". ...
       1 | import "server-only";
     > Build failed because of webpack errors     (exit 1)
     ```
     같은 프로브가 있는 상태에서 `npx tsc --noEmit` **EXIT 0**, `npx next lint` **EXIT 0** — 즉 `npm run check`는 통과하는데 `npm run build`만 깨진다는 이 항목의 전제가 실물로 확인됐다. 구현 단계에서는 **분할 후 절반**(다섯 barrel 동시 임포트 프로브가 통과하는지)만 실행하면 된다.
   - **분할 후에 같은 프로브로 `npm run build`** → 통과해야 한다. 프로브가 다섯 barrel을 side-effect로 전부 임포트하므로, 하나라도 여전히 `server-only`를 끌어오면 빌드가 실패한다 — 통과는 **다섯 전부**가 클라이언트 안전해졌다는 동시 증명이다.
   - 검증 후 프로브 라우트를 삭제하고 `npm run build`를 한 번 더 돌려 실물 통과를 확인한다.
3. **`npm test -w apps/web`** — 로직 무변경 회귀 확인(**기존 77 테스트 유지**. 검증 라운드에서 실측: BUG-11·BUG-10이 신규 테스트 7개를 더해 70 → 77이 됐다).

프로브 파일은 검증 아티팩트이므로 최종 커밋에 포함하지 않는다. `next build`가 `_`-접두 private 폴더는 라우트로 컴파일하지 않으므로 프로브는 실제 라우트 세그먼트(`barrel-probe`)로 둔다.

## 범위 밖 의존

없음. 모든 변경이 `apps/web/src` 안이다. `packages/db`·다른 워크스페이스·스키마·마이그레이션과 무관하다(barrel 재구성이라 DB 접근 코드 자체는 한 줄도 바뀌지 않는다).

## 대안

- **순수 서버 슬라이스 넷의 `index.ts`를 아예 삭제하고 `server.ts`만 둔다.** 기각: 규약 §5.3(각 슬라이스는 `index.ts`로 공개 API를 노출)과 어긋나고, 빈 barrel이 모듈 해석을 안정적으로 유지하며(bare barrel 임포트가 `TS2307` 대신 "심볼 없음"으로 걸려 의도가 명확), 나중에 클라이언트 안전 심볼이 생기면 한 줄 추가로 끝난다.
- **`index.ts`가 `./api`를 계속 재수출하되 lint/build 규칙으로 클라이언트 임포트를 금지한다.** 기각: 잠복 파손을 없애지 못한다 — barrel은 여전히 클라이언트가 못 쓰고, 클라이언트는 계속 barrel을 우회해 공개 API 경계가 사라진다. FEAT-31이 지목한 바로 그 상태다.
- **당장 위험한 슬라이스만 분할한다.** 기각: 다섯 모두 동일한 잠복 파손(`api/index.ts:1` = `server-only`, barrel이 재수출)을 갖고, 백로그가 다섯 전부를 범위로 지정했다.

## 검증 라운드 기록 (메인 루프, 2026-09-04 1라운드)

필수 경로: 1(인용 전수 대조) · 2(스케치 추출·실행) · 3(before/after) · 4(전칭 여집합) · 7(음성 시험).
5(돌연변이)는 판정 로직·순수 함수 신설이 없어 제외, 6(실제 사건 재생)은 외부 신호 해석이 없어 제외,
8(실물 렌더)은 마크업 변경이 없어 제외했다. 증거는 `docs/agents/main-loop/FEAT-31.md`.

**결함 ① (정밀도) — 테스트 수가 낡았다.** 「테스트」 3번이 "기존 70 테스트 유지"라 적었으나 현재는
**77**이다(BUG-11의 `transcript.test.mjs` 3 + BUG-10의 `format-date.test.mjs` 4). 구현자가 70을
기준으로 대조하면 정상을 회귀로 읽는다. → 77로 고치고 근거를 남겼다.

**통과한 것**

- **경로 4 전칭 여집합(이 항목의 본체)** — 다섯 barrel의 임포터를 독립 열거해
  **13개 파일**이 전부임을 확인(계획서 표와 일치). 여집합을 넓혀도 깨끗하다: 상대경로 임포터
  **0건**, barrel을 우회한 깊은 임포트(`entities/<slice>/...`) **0건**, 13개 중 `"use client"`
  **0건**(1행이 `next/server`·`"use server"`·`import "server-only"`·metadata 등 전부 서버 측),
  `features/*` 공개 API가 다섯 barrel을 재수출하는 곳 **0건**.
- **경로 7 음성 시험(전제 증명)** — 프로브로 잠복 파손이 실재함을 실물 확인(위 「테스트」 2번에
  출력 인용). `npm run check`는 통과하고 `npm run build`만 깨진다는 비대칭까지 확인.
- **경로 1 인용 전수 대조** — 임포터 12곳의 `파일:줄`을 다시 읽어 내용까지 대조, 전부 일치.
  `processing-dispatch/index.ts:9`가 `export type { ProcessingDispatchStatus } from "./model/types";`
  인 것도 확인.
- **경로 2·3 구조 확인** — 네 슬라이스(`analytics-event`·`order`·`subscription`·`user`)에 `api`
  세그먼트뿐이고 `model`·`lib`·`ui`가 없음을 확인 → `index.ts`가 `export {};`가 되는 근거가 맞다.
  `processing-dispatch`만 `api`+`model`이라 타입 하나가 남는 것도 맞다. `user/index.ts`가 실제로
  계획서가 센 심볼 **10개**를 알파벳 순으로 내보내는 것도 대조. 선례 `entities/clip/server.ts`의
  형태(주석 문구 포함)와 스케치가 일치. `export {};` 한 줄짜리 모듈이 프로젝트 설정에서
  `npx eslint` **0건** · `tsc --noEmit` **EXIT 0**임도 실측(빈 barrel이 게이트를 깨지 않는다).

