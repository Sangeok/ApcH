# FEAT-57: `clip_review_caption_style_edited` 계측 이름을 계약에서 완전 제거

agent: main-loop

## 현재 동작

이벤트 이름은 `packages/db`의 계약 하나에서 나오고 web·admin이 그것만 본다.

- `packages/db/src/analytics-contract.ts:9-41` `ANALYTICS_EVENT_NAMES`가 이름 **31개**를 `as const` 배열로 정의하고, `:30`이 `  "clip_review_caption_style_edited",`다. `:43` `export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];`가 그 배열에서 타입을 뽑는다.
- `apps/web/src/fsd/shared/analytics/lib/metadata.ts:48` `  clip_review_caption_style_edited: ["uploadedFileId", "preset", "appliedToAll"],`가 허용 메타데이터 키를 정의하고, 그 위 `:46-47`에 설명 주석 두 줄이 붙어 있다. 이 맵은 `:63` `} as const satisfies Record<AnalyticsEventName, readonly string[]>;`로 계약에 묶여 있다 — **이름 31개 전부에 항목이 있어야 컴파일된다.**
- 이름 목록 **전체**를 소비하는 곳은 넷이다(전수 열거): `apps/web/src/app/api/analytics/events/route.ts:15` `  name: z.enum(ANALYTICS_EVENT_NAMES),`(수집 엔드포인트 검증) · `apps/admin/src/fsd/entities/analytics-event/api/queries.ts:74`와 `:90`(범위 조회) · `apps/web/src/fsd/shared/analytics/event-catalog.test.mjs:27` `  for (const name of ANALYTICS_EVENT_NAMES) {`(모든 이름에 metadata 정의가 있는지 단언).
- admin 조회는 이름 집합을 `where`에 넣는다 — `apps/admin/src/fsd/entities/analytics-event/api/queries.ts:48-70` `listRangeEvents`의 `      ...(names ? { name: { in: [...names] } } : {}),`. 그 집합을 `ANALYTICS_EVENT_NAMES`로 부르는 것은 `getAnalyticsOverview`(`:74`)와 `getDropOffReport`(`:90`) **둘뿐**이다. `getFunnelReport`는 `ANALYTICS_FUNNELS[input.funnel]`을, `getRecentFailureEvents`는 `FAILURE_EVENT_NAMES`를 쓴다.
- 퍼널 정의(`packages/db/src/analytics-contract.ts:95-122`) 넷 어디에도 이 이름이 없다 — `review`는 `clip_review_opened`·`clip_review_confirmed`·`clip_viewed` 셋이다.

**발신부는 이미 없다.** FEAT-52가 검토 다이얼로그와 훅을 지워, 이 이름으로 `trackAnalyticsEvent`를 부르는 코드가 0이다. `apps/web/src/fsd/shared/analytics/lib/metadata.ts:59` 주석이 그 사실을 이미 적고 있다 — `  // source는 "settings_page"(검토 다이얼로그 진입점은 FEAT-52에서 폐지).`

## 문제

죽은 등록이 셋을 끌고 있다.

1. **계약에 발신자 없는 이름이 남아 있다.** `ANALYTICS_EVENT_NAMES`는 "이 제품이 기록하는 이벤트"의 목록인데, 그중 하나는 아무도 기록하지 않는다. 목록을 읽는 사람이 없는 기능을 있다고 믿는다.
2. **`metadata.ts`가 그 키를 지울 수 없다.** `:63`의 `satisfies Record<AnalyticsEventName, …>`가 31개 전부를 요구하므로, 키만 지우면 `tsc`가 `TS1360`으로 거부한다(FEAT-52 검증 경로 7 실측). `packages/db`를 먼저 고쳐야 하는데 web-dev의 쓰기 범위 밖이라 그때 미뤄졌다.
3. **테스트 주석이 이 이름을 근거로 든다.** `apps/web/src/fsd/shared/analytics/lib/metadata.test.mjs:46-48`이 `settings_defaults_saved`를 별 이벤트로 두는 이유를 "`clip_review_caption_style_edited`로 재사용하면 그쪽 `appliedToAll` 집계가 오염되므로"라고 설명한다. 이름이 사라지면 **없는 이벤트를 근거로 드는 유령 주석**이 된다(FEAT-56이 정리한 「낡은 주석」과 같은 부류).

### 요구 ①의 답 — 과거 행 가시성은 포기한다

백로그는 "이름을 지우면 과거에 쌓인 행이 분석 화면에서 보이지 않게 된다"를 먼저 결정하라고 요구했다. **결정: 지운다.** 근거는 추정이 아니라 프로덕션 실측이다(2026-09-21, 소유자 승인 후 읽기 전용 count 1회):

| 측정 | 값 |
| --- | --- |
| 전체 `AnalyticsEvent` 행 | 1116 |
| `clip_review_caption_style_edited` 행 | **1** |
| 그 행의 최초 = 최근 | 2026-08-14T15:40:55Z (한 번 발생하고 그뿐) |
| 최근 7일 창 안 | **0** |
| 최근 30일 창 안 | **0** |
| 최근 90일 창 안 | 1 |
| 대조: `settings_defaults_saved` 행 | 0 |

따라서 손실은 이렇다: 7일·30일 창에서는 **오늘 지워도 화면이 그대로다**. 90일 창에서만 `getAnalyticsOverview`의 총계가 1116 → 1115가 되고 `getDropOffReport` 상위 25에서 그 줄이 빠진다. 그 1건도 2026-11-12경 창 밖으로 나가 자연 소멸한다.

**행 자체는 DB에 남는다** — 이름을 빼는 것은 조회 `where`의 `name: { in: [...] }`에서 제외하는 것이지 삭제가 아니다. 나중에 필요하면 직접 조회로 읽을 수 있다. 백로그가 쓴 "이력이 조용히 사라진다"는 실제보다 강한 표현이었다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `packages/db/src/analytics-contract.ts` | `ANALYTICS_EVENT_NAMES`에서 `:30` 한 줄 제거 (31 → 30개) |
| `apps/web/src/fsd/shared/analytics/lib/metadata.ts` | `:46-48` 세 줄(설명 주석 2 + 키 1) 제거 |
| `apps/web/src/fsd/shared/analytics/lib/metadata.test.mjs` | `:46-48` 주석에서 사라진 이름 참조를 걷어내고 같은 취지를 남긴다 |

**백로그의 `apps/admin/.../queries.test.mjs`는 대상이 아니다.** 그 파일 `:6`의 `ANALYTICS_EVENT_NAMES`는 계약 사본이 아니라 `mock.module("@repo/db", …)`(`:15-19`)로 주입하는 **세 개짜리 목 픽스처**다(`"landing_view"`·`"dashboard_viewed"`·`"upload_prepare_failed"`). 계약은 31개이므로 애초에 일치시킬 의도가 없고, 이름을 지워도 이 파일은 깨지지 않는다. 백로그 요구 ③의 진단("하드코딩 사본이 계약과 어긋나 깨진다")이 사실과 다르다.

**`event-catalog.test.mjs`도 대상이 아니다.** `:27`이 목록을 순회할 뿐 이름을 박지 않으므로, 계약과 `metadata.ts`를 **함께** 고치면 그대로 통과한다. 한쪽만 고치면 이 테스트(또는 `tsc`)가 잡는다 — 이번 변경의 안전망이다.

## 구현 스케치

### 1. 계약에서 이름 제거 (`packages/db/src/analytics-contract.ts`)

**before** (`:29-31`):

```ts
  "clip_review_custom_clip_added",
  "clip_review_caption_style_edited",
  "clip_review_generate_blocked",
```

**after**:

```ts
  "clip_review_custom_clip_added",
  "clip_review_generate_blocked",
```

### 2. 허용 키 맵에서 제거 (`apps/web/src/fsd/shared/analytics/lib/metadata.ts`)

주석 두 줄이 그 키의 설명이므로 함께 간다.

**before** (`:45-49`):

```ts
  clip_review_custom_clip_added: ["uploadedFileId"],
  // preset은 matchPresetId의 결과다(프리셋 id | "custom" | "default").
  // 프리셋이 실제로 쓰이는지, 아니면 손으로 만지는지를 이 값이 답한다.
  clip_review_caption_style_edited: ["uploadedFileId", "preset", "appliedToAll"],
  // reason은 getGenerateBlockReason의 kind와 동일한 값이다.
```

**after**:

```ts
  clip_review_custom_clip_added: ["uploadedFileId"],
  // reason은 getGenerateBlockReason의 kind와 동일한 값이다.
```

### 3. 유령이 될 주석 교체 (`apps/web/src/fsd/shared/analytics/lib/metadata.test.mjs`)

주장의 취지(이 이벤트는 User만 바꾸므로 별 이벤트로 둔다)는 살리되, 사라진 이름을 근거로 들지 않는다.

**before** (`:46-48`):

```js
    // 이 이벤트는 User만 바꾼다. clip_review_caption_style_edited로 재사용하면
    // 그쪽 appliedToAll 집계가 오염되므로 별 이벤트로 두고, 그 사실을
    // 허용 키 목록이 지킨다.
```

**after**:

```js
    // 이 이벤트는 User의 기본값만 바꾼다(클립별 편집이 아니다). 클립 검토
    // 쪽 이벤트에 얹지 않고 별 이벤트로 두며, 허용 키를 source·preset 둘로
    // 묶어 uploadedFileId 같은 클립 스코프 값이 섞이지 않게 한다.
```

## 테스트

- **덮는 것**: 새 테스트를 만들지 않는다. 기존 방어선이 **양방향 불일치를 모두** 잡는다 — 다만 방향마다 잡는 주체가 다르다. 계획 검증에서 한쪽씩 깨 실측했다(실트리, 적용 후 `git checkout --` 되돌림).

  | 불일치 방향 | 잡는 주체 | 실측 |
  | --- | --- | --- |
  | **맵에서만 제거**(계약에 이름이 남음) | `apps/web/src/fsd/shared/analytics/event-catalog.test.mjs:26-33`의 전수 순회 **와** 타입 | `npm test -w apps/web` 1 fail(`모든 이벤트 이름에 metadata 정의가 있다`) · `npm run check -w apps/web` EXIT 1 — 체인에서 **`next lint`가 먼저** 걸린다(`satisfies` 불성립으로 맵이 error 타입이 되어 `no-unsafe-*` Error 4줄). `npx tsc --noEmit` 단독으로는 **TS1360** |
  | **계약에서만 제거**(맵에 키가 남음) | `tsc --noEmit`만 | `npx tsc --noEmit` EXIT 2 **TS2353**(알려지지 않은 속성). `next lint` 통과, `event-catalog.test.mjs`도 **3/0 통과** — 그 테스트는 "이름마다 맵 항목이 있는가"만 보므로 **맵에 남은 잉여 키는 못 본다** |

  즉 `event-catalog.test.mjs`는 **한쪽 방향만** 지킨다. 반대쪽은 `apps/web/src/fsd/shared/analytics/lib/metadata.ts:63`의 `satisfies`가 홀로 지키므로, `check`에서 `tsc --noEmit` 단계를 빼면 그 방향이 무방비가 된다.
- **둘을 함께 고쳐야 게이트가 통과한다**: 셋을 전량 적용한 상태에서 게이트 넷이 전부 EXIT 0이다(web 170/40/0 · admin 334/75/0, 계획 검증 실측).
- **못 덮는 범위**(배포 후 확인):
  - admin 분석 화면의 90일 창에서 총계가 1 줄고 이탈 상위 25에서 그 줄이 빠지는 것 — 실물에서만 보인다(위 실측대로 7·30일 창은 변화 없음)
  - 수집 엔드포인트(`apps/web/src/app/api/analytics/events/route.ts:15` `z.enum`)가 그 이름을 이제 거부하는 것 — 발신자가 0이라 실제로 도달하지 않는다

## 범위 밖 의존

없다. 스키마·마이그레이션·백엔드 변경이 없고, 고칠 파일 셋이 전부 저장소 안 텍스트 편집이다.

**게이트는 넷이다** — `npm run check -w apps/web` · `npm test -w apps/web` · `npm run check -w apps/admin` · `npm test -w apps/admin`. `packages/db`는 게이트에서 빠지는 것이 아니라 **원래 없다**: 그 워크스페이스의 `package.json` 스크립트는 `postinstall`·`db:*`(prisma) 뿐이고 `check`·`test`가 없으며, 루트 `check`가 `--workspaces --if-present`라 건너뛴다. 계약 파일의 타입 오류는 소비자 쪽 `tsc`가 잡는 구조다.

## 대안

- **이름을 남기고 "폐기됨" 표시를 둔다**(백로그가 제시한 다른 안) — 과거 행이 admin 조회에 계속 포함되고, 목록을 읽는 사람은 그 이름이 더는 발신되지 않음을 안다. **채택하지 않았다**: 지키는 이력이 **행 1건**이고 그마저 30일 창 밖이라(위 실측) 얻는 것이 없는데, `AnalyticsEventName`에 "살아 있음/폐기됨" 두 상태가 생겨 `satisfies`로 묶인 맵·`z.enum`·퍼널 타입이 전부 그 구분을 알아야 한다. 죽은 등록 하나를 없애려다 계약에 상태 개념을 들이는 것은 비용이 이익보다 크다. 다만 이 판단은 **1건**이라는 수치에 걸려 있다 — 수치가 달랐다면 결론도 달랐을 것이므로, 소유자가 게이트②에서 뒤집을 수 있게 근거를 「문제」 절에 표로 남겼다.
- **`metadata.ts`의 키만 지우고 계약은 둔다** — 불가능하다. `:63`의 `satisfies`가 31개 전부를 요구해 `TS1360`이 난다(FEAT-52에서 실측된 바로 그 벽이고, 이 항목이 존재하는 이유다).
- **테스트 주석을 그냥 지운다**(교체 대신) — 그 주석은 "왜 별 이벤트인가"를 설명하는 유일한 자리다. 없애면 다음 사람이 `settings_defaults_saved`에 `uploadedFileId`를 얹으려 할 때 막을 근거가 사라진다. 이름 참조만 걷어내고 취지는 남긴다.
- **admin 조회를 이름 목록이 아니라 무필터로 바꾼다**(`listRangeEvents`에 `names`를 안 넘김) — 과거 행이 전부 보이게 되어 가시성 문제가 아예 사라진다. 그러나 이 항목의 범위가 아니고(계약 정리가 아니라 조회 설계 변경), 필터가 있는 이유(수집 안 하는 이름의 잡음 차단)를 따로 검토해야 한다.
