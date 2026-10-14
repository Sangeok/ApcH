# BUG-12: admin 분석 화면의 시각 표시가 서버 런타임 타임존에 암묵적으로 의존한다

agent: admin-dev

## 현재 동작

- `src/fsd/pages/analytics/ui/index.tsx:236`이 최근 실패 이벤트 표의 "Last seen" 칸을 `<TableCell>{row.lastSeenAt.toLocaleString()}</TableCell>`로 그린다. `toLocaleString()`에 로케일·타임존 인자가 없어 **런타임 로케일과 런타임 타임존** 둘 다에 암묵적으로 의존한다.
- `row.lastSeenAt`는 `Date`다. `src/fsd/entities/analytics-event/model/reporting.ts:174`가 `{ ...; lastSeenAt: Date }` shape를 만들고 `:195` `lastSeenAt: event.createdAt`로 `createdAt: Date`(`:7`)를 그대로 싣는다. `:202`에서 `lastSeenAt.getTime()`으로 정렬하므로 Date가 맞다.
- 이 화면은 서버 컴포넌트다. `index.tsx:1-28`에 `"use client"` 지시자가 없고, 라우트 `src/app/(protected)/analytics/page.tsx:46` `AdminAnalyticsRoute`(async server component)가 `:11`에서 임포트한 `AdminAnalyticsPage`를 `:65`에서 server-side로 렌더한다. 클라이언트 컴포넌트로 전달되는 경계가 없어 `lastSeenAt`은 직렬화되지 않고 Date로 남는다. 따라서 하이드레이션 불일치(React #418)는 발생하지 않고, Vercel 런타임이 UTC라 현재 화면도 UTC로 보인다 — 코드가 아니라 배포 환경이 그렇게 만들 뿐이다.
- 같은 파일의 다른 `toLocaleString()` 일곱은 모두 **숫자** 포매팅이라 시간이 아니다: `:59,60,61`(overview `uniqueVisitors`/`loggedInUsers`/`totalEvents`), `:154`(`row.visitors`), `:161`(`row.dropOffFromPrevious`), `:198`(`row.sessions`), `:235`(`row.count`).
- admin에는 재사용할 날짜 포매터가 없다. `src/fsd/shared/lib/`에는 `utils.ts`(`cn` 클래스 유틸)만 있고, `apps/admin/src` 전체(테스트 제외)에 `Intl.DateTimeFormat`은 한 건도 없다.
- **여집합 열거** — `apps/admin/src`(테스트 제외)의 `toLocaleString|toLocaleDateString|toLocaleTimeString|Intl.DateTimeFormat|toISOString|new Date(` 전수:
  - `src/fsd/pages/analytics/ui/index.tsx:236` — **유일한 암묵적 TZ/로케일 시각 표시(이 항목의 대상).**
  - `src/fsd/pages/pipeline/model/briefing.ts:233` `formatToday` = `${today.getUTCMonth()+1}월 ${today.getUTCDate()}일` — 화면 표시지만 **명시적 `getUTC*`**라 암묵 의존 없음.
  - `src/fsd/pages/pipeline/model/briefing.ts:62,79` `daysOnBoard`/`nthDay` — `Date.UTC(...)` + `getUTC*`로 **명시적 UTC** 날짜 차 계산. 표시 아님.
  - `src/fsd/features/transition-pipeline-gate/model/transitions.ts:281` `holdResultLine` — `getUTCFullYear/getUTCMonth/getUTCDate`로 **명시적 UTC**(`commit-gate-transition.ts:143`이 `new Date()`를 넘김). 보드 `결과:` 줄(GitHub write)로 나가고 화면 표시 아님.
  - `src/fsd/features/run-pipeline-command/api/get-pipeline-progress.ts:17` `new Date(windowStart).toISOString()` — GitHub 쿼리의 `since` 파라미터. `toISOString()`은 정의상 UTC 결정적. 표시 아님.
  - `src/fsd/features/run-pipeline-command/api/get-pipeline-progress.ts:63`, `src/fsd/pages/pipeline/page.tsx:24` `new Date()` — `deriveProgress`/`buildBriefing`에 넘기는 "현재 시각" 로직 입력. `progress.ts:9`가 `sinceIso/lastEventIso는 화면에 렌더하지 않는다`고 명시. 표시 아님.
  - `src/fsd/features/send-observability-test/api/send-observability-test-event.ts:36` `new Date().toISOString()` — Sentry 테스트 payload `processingStartedAt`. UTC 결정적. 화면 표시 아님.
  - `src/fsd/entities/analytics-event/api/queries.ts:45` `new Date(Date.now() - RANGE_DAYS[range]*...)` — DB `createdAt` 필터의 범위 시작. 에폭 상대 계산이라 TZ 무관, 표시 아님.
- 결론: admin은 `:236`을 **제외하면** 모든 날짜 경로가 이미 명시적 UTC(`getUTC*`/`Date.UTC`/`toISOString`)이거나 비표시 로직이다. `:236`만 홀로 암묵 의존이다.

## 문제

요구의 원천은 `TASK_BACKLOG.md`의 BUG-12 `source`다: `pages/analytics/ui/index.tsx:236`의 `row.lastSeenAt.toLocaleString()`이 로케일·타임존 인자 없이 시각을 그려, 표시가 "UTC"인 이유가 코드가 아니라 배포 환경(Vercel=UTC)이라는 **암묵적 의존**이다. 런타임 TZ가 바뀌거나 이 컴포넌트가 클라이언트로 내려가는 순간 조용히 달라진다(후자는 web의 BUG-10이 실제로 겪은 경로다). 결함이 아니라 암묵 의존 제거다.

백로그가 지목한 문제와 코드가 일치한다(위 「현재 동작」). 어긋남 없음. 다만 백로그 제목은 "타임존"만 말하지만 `toLocaleString()`(무인자)은 **로케일도** 런타임에 의존하므로, 베낄 `format-date.ts`의 모양(로케일 `"en"` + 타임존 `"UTC"` 고정)이 둘 다를 한 번에 못박는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/shared/lib/format-date.ts` `(신규)` | 로케일 `"en"` + 타임존 `"UTC"` 고정 date-time 포매터 상수와 `formatDateTime`. `apps/web/src/fsd/shared/lib/format-date.ts`(BUG-10)의 모양을 베끼되, admin에 소비자가 없는 date-only(`formatDate`/`DATE_FORMATTER`)는 넣지 않는다 |
| `src/fsd/shared/lib/format-date.test.mjs` `(신규)` | `process.env.TZ`를 비-UTC로 강제한 뒤 동적 임포트, 골든 문자열·`resolvedOptions()` 단언 |
| `src/fsd/pages/analytics/ui/index.tsx` | `:236`의 `row.lastSeenAt.toLocaleString()` → `formatDateTime(row.lastSeenAt)`, 상단에 `~/fsd/shared/lib/format-date` 임포트 추가 |

## 구현 스케치

**`src/fsd/shared/lib/format-date.ts` (신규)** — web BUG-10 모양을 date-time만 발췌. 상수를 수출하는 이유는 테스트다(고정 옵션에서 `"en"`과 `"en-US"` 출력이 같아 함수 출력만으로는 로케일 인자 제거 회귀를 못 잡는다 — 테스트가 `resolvedOptions()`를 볼 핸들이 필요하다).

```ts
// 서버(Vercel, UTC)가 로케일·타임존을 코드로 고정하지 않으면, 표시 시각이 코드가
// 아니라 배포 환경에 의존한다 — 런타임 TZ가 바뀌거나 이 화면이 클라이언트로
// 내려가는 순간(web BUG-10 경로) 조용히 달라진다. 로케일은 "en", 타임존은
// "UTC"로 고정한다 — UTC는 서버 런타임과 같아 최소 변경이고, 사용자 위치를
// 가정하지 않는 중립값이다. (apps/web/src/fsd/shared/lib/format-date.ts와 같은 결정.)
// 상수를 수출하는 이유는 테스트다 — 고정 옵션에서 "en"과 "en-US"의 출력이 같아
// 함수 출력만으로는 로케일 인자를 지운 회귀를 en 계열 CI에서 못 잡는다.
export const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

// 날짜+시각(최근 실패 이벤트의 "Last seen" 등).
export function formatDateTime(value: Date | string | number): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}
```

**`src/fsd/pages/analytics/ui/index.tsx`** — 임포트 추가. 기존 shared 임포트(`~/fsd/shared/ui/atoms/...`, `:9-25`) 블록에 이어 둔다:

```tsx
import { formatDateTime } from "~/fsd/shared/lib/format-date";
```

`:236` 치환:

```tsx
// before
<TableCell>{row.lastSeenAt.toLocaleString()}</TableCell>
// after
<TableCell>{formatDateTime(row.lastSeenAt)}</TableCell>
```

**`src/fsd/shared/lib/format-date.test.mjs` (신규)** — 같은 slice 구현 test라 상대 임포트. 포매터가 모듈 스코프에서 생성되므로 `process.env.TZ` 설정이 임포트보다 먼저여야 한다. 골든은 web과 같은 입력/출력(동일 Node·ICU에서 검증: `"Jul 30, 2026, 10:55 PM"`, locale `en`, timeZone `UTC`).

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.TZ = "Asia/Seoul";
const { formatDateTime, DATE_TIME_FORMATTER } = await import("./format-date.ts");

describe("format-date", () => {
  it("renders date+time in UTC regardless of process timezone", () => {
    // 프로세스 TZ가 Asia/Seoul이어도 UTC 고정이라 KST(07:55 AM)가 아니라
    // UTC(10:55 PM)로 나온다 — timeZone 옵션 제거 돌연변이가 여기서 사멸한다.
    assert.equal(formatDateTime("2026-07-30T22:55:46Z"), "Jul 30, 2026, 10:55 PM");
  });

  it("locks the formatter to timeZone UTC", () => {
    assert.equal(DATE_TIME_FORMATTER.resolvedOptions().timeZone, "UTC");
  });

  it("locks the formatter to locale exactly en", () => {
    // 완전 일치 — 로케일 인자를 지운 구현은 en 계열 CI에서 "en-US"로 해석되는데
    // 고정 옵션에서 출력이 "en"과 같아 골든으로는 못 잡는다.
    assert.equal(DATE_TIME_FORMATTER.resolvedOptions().locale, "en");
  });
});
```

## 테스트

- **덮는 것**: `formatDateTime`가 런타임 로케일·타임존과 무관하게 고정 출력을 내는지(TZ를 `Asia/Seoul`로 강제한 뒤 동적 임포트해 골든 대조), `DATE_TIME_FORMATTER.resolvedOptions()`의 `timeZone === "UTC"`·`locale === "en"` 완전 일치. 러너가 UTC(CI·Vercel)여도 `timeZone`/`locale` 인자 제거 회귀가 잡히도록 TZ 강제 + 상수 수출이 핵심이다.
- **못 덮는 범위**: `index.tsx:236`이 실제로 `formatDateTime`을 부르는지(화면 렌더)는 Node 러너가 DOM·React 렌더가 없어 판정하지 못한다 — 순수 포매터 계약만 러너가 덮고, 호출 연결은 수동 smoke 대상이다.

## 범위 밖 의존

없음. 모든 변경이 `apps/admin/src` 안이다. `format-date.ts`는 아무것도 임포트하지 않아(전역 `Intl`/`Date`만 사용) DB/fetch/Sentry owner를 바꾸지 않으므로 `scripts/verify-fsd-boundaries.mjs`와 그 fixture는 손대지 않는다. `@repo/db`의 analytics 계약(`ANALYTICS_EVENT_NAMES`/`ANALYTICS_FUNNELS`)도 건드리지 않는다.

`packages/` 공용 날짜 유틸을 만드는 것은 **하지 않는다**(「대안」 참조) — 만들려면 `packages/` 신규 패키지가 담당 범위 밖이 되어 여기서 막힌다. 베끼는 쪽을 택하므로 막히는 지점이 없다.

## 대안

- **`packages/` 공용 날짜 포매터로 web·admin이 공유** — 택하지 않음. (1) admin과 web은 `@repo/db`만 공유하고 UI·유틸은 앱별로 소유하기로 한 결정이다(`apps/admin/CLAUDE.md:3`, `apps/web/CLAUDE.md` monorepo-admin-split 결정 2). 날짜 포매터는 DB 계약이 아니라 표시 유틸이다. (2) 새 `packages/` 패키지는 내 쓰기 범위(`apps/admin/src/**`) 밖이라 범위 밖 의존이 된다. (3) 중복은 약 10줄의 `Intl` 설정뿐이고, 패키지 신설의 빌드 배선·버전 결합 비용이 이를 넘는다. 백로그도 "워크스페이스가 달라 코드 공유는 하지 않는다"고 명시한다.
- **web `format-date.ts`를 통째로 복사(date-only `formatDate`/`DATE_FORMATTER` 포함)** — 택하지 않음. admin에는 date-only 소비자가 없고(여집합 열거에서 확인), 이 저장소는 죽은 코드를 두지 않는다(FEAT-56·57 선례). 베끼는 "모양"의 본질은 로케일·타임존 고정 + 테스트용 상수 수출이며, date-time만으로 그 본질을 지킨다. admin이 date-only가 필요해지면 그때 추가한다(YAGNI). 이 분기점은 구현 스케치가 명시한다.
- **타임존을 `Asia/Seoul`로 고정하거나 클라이언트 전용 렌더로 사용자 로컬 표시** — 택하지 않음. web BUG-10이 같은 선택지를 검토하고 UTC 고정을 택한 것과 동일 결론이다. 운영자 대시보드이고 현재 표시가 이미 UTC(Vercel)라 UTC 고정이 최소 변경·무회귀다. 사용자 위치를 가정하지 않는 중립값이기도 하다.
