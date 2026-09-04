# BUG-10: 날짜를 로케일 지정 없이 포매팅해 하이드레이션 불일치(React #418)가 매 렌더 발생

agent: web-dev

## 현재 동작

다섯 호출부가 로케일·타임존 인자 없이 날짜를 포매팅한다. 전부 `"use client"`
컴포넌트이고, 서버가 데이터를 갖고 렌더(SSR)한 뒤 브라우저가 하이드레이트한다:

- `features/billing/ui/OrderHistory.tsx:55` — `{new Date(order.createdAt).toLocaleDateString()}`
  (날짜만). `OrderHistory`는 지시자 없는 컴포넌트지만 `"use client"`인
  `BillingPage.tsx:1,9`가 임포트하므로 클라이언트 트리에 든다. `orders`는 서버
  라우트 `app/dashboard/billing/page.tsx`가 `getBillingData()`로 읽어
  `BillingPage`에 넘긴 SSR 데이터다. `order.createdAt`은 `Date`
  (`features/billing/model/types.ts`의 `OrderInfo.createdAt: Date`).
- `features/billing/ui/SubscriptionStatus.tsx:95` — `{new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
  (날짜만). `:127-129` — AlertDialog 설명 안 `{new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
  (날짜만). `SubscriptionStatus.tsx:1`은 `"use client"`. `currentPeriodEnd: Date`.
- `pages/upload-detail/ui/index.tsx:87` — `{new Date(createdAt).toLocaleString()}`
  (날짜+시각). `index.tsx:1`은 `"use client"`.
- `pages/upload-detail/ui/_component/ProcessingTimeline.tsx:159` —
  `{timestamp ? timestamp.toLocaleString() : "Waiting..."}`(날짜+시각). `timestamp`는
  `Date | null`. `:1`은 `"use client"`.
- `pages/dashboard/ui/_component/QueueStatus.tsx:71` — `{new Date(file.createdAt).toLocaleString()}`
  (날짜+시각). `:1`은 `"use client"`. 대시보드 기본 탭("upload")에 있어 SSR된다 —
  `pages/dashboard/ui/index.tsx:124`가 기본 `TabsContent value="upload"`(`:121`) 안에서
  `QueueStatus`를 렌더하고, 큐 데이터는 서버가 넘긴 `initialActiveQueue`(`:42,57,61`)다.

`toLocaleDateString()`/`toLocaleString()`는 인자가 없으면 **런타임의 기본 로케일·
타임존**을 쓴다. 서버(Vercel, UTC·en-US)와 브라우저(관측상 ko-KR·Asia/Seoul)가 다른
문자열을 만든다 — 관측된 클라이언트 렌더는 `2026. 9. 27.`, `2026. 7. 30. 오후 10:55:46`
(ko-KR). 서버 HTML과 달라 React가 하이드레이션 텍스트 불일치(#418)를 던지고 그
서브트리를 클라이언트 렌더로 되돌린다.

**저장소의 대비 사례(로케일만 고정, 타임존은 미고정)**:

- `widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx:19-22` —
  `const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });`,
  `:30`에서 `dateFormatter.format(new Date(file.createdAt))`.
- `pages/dashboard/ui/_component/RecoverableUploadDrafts.tsx:22-25` — 동일한 `"en"`
  포매터, `:88`에서 `formatter.format(...)`.

**중요 — 이 두 "정상" 사례가 #418을 안 내는 이유는 로케일 고정 때문이 아니다**:
- `UploadedFileCard`는 비활성 탭("my-clips") 안에 있다(`dashboard/ui/index.tsx:131-141`).
  Radix `Tabs`는 기본값이 아닌 탭 내용을 초기 SSR에 렌더하지 않으므로, 이 카드는
  탭 전환 후 클라이언트에서만 마운트된다 — 서버 HTML에 날짜가 없어 대조 자체가 없다.
- `RecoverableUploadDrafts`는 기본 탭에 있으나 `drafts.length === 0`이면 `null`을
  렌더한다(`RecoverableUploadDrafts.tsx:39-41`). 관측 계정에 복구 대상 초안이 없어
  포매터가 실행되지 않았을 뿐이다.

즉 두 포매터는 **로케일만 고정하고 타임존은 고정하지 않아**, SSR되며 시각을 그리는
순간 서버(UTC)·브라우저(Asia/Seoul)가 시각 부분에서 어긋난다("10:55 PM" vs "7:55 AM").
지금 #418을 안 내는 것은 우연(비활성 탭·빈 상태)이지 옳아서가 아니다.

## 문제

백로그(`BUG-10` source)가 지목한 것: 로케일 미지정 포매팅이 서버·클라이언트에서 다른
문자열을 만들어 하이드레이션이 매 렌더 깨진다. 코드에서 확인한 원인은 로케일뿐 아니라
**타임존도 미고정**이라는 점이다 — 다섯 호출부(`toLocaleDateString`/`toLocaleString`,
인자 없음)와, 심지어 대비 사례로 제시된 `"en"` 포매터 둘도 타임존을 고정하지 않는다.
따라서 백로그가 "이미 있는 정상 패턴으로 통일"이라 부른 대상(`"en"`만 고정) 자체가
잠복 결함이며, 그대로 베끼면 시각을 그리는 SSR 지점에서 #418이 재발한다.

**백로그와 코드가 어긋난 지점**: 백로그는 두 `"en"` 포매터를 "서버·클라이언트가 같다"
는 정상 사례로 들지만, 코드상 그 둘은 타임존 미고정이라 SSR+시각 렌더 시 어긋난다.
이번 수정은 로케일뿐 아니라 **타임존까지 고정**해야 하고, 기존 두 곳도 같은 공용
포매터로 합쳐 잠복 결함을 함께 닫는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/shared/lib/format-date.ts` `(신규)` | 로케일 `"en"` + 타임존 `"UTC"` 고정 포매터 둘: `formatDate`(날짜만)·`formatDateTime`(날짜+시각) |
| `src/fsd/shared/lib/format-date.test.mjs` `(신규)` | 고정 입력→고정 출력이 일정한지(로케일·타임존 비의존) |
| `src/fsd/features/billing/ui/OrderHistory.tsx` | `:55`를 `formatDate(order.createdAt)`로 |
| `src/fsd/features/billing/ui/SubscriptionStatus.tsx` | `:95`·`:127-129`를 `formatDate(subscription.currentPeriodEnd)`로 |
| `src/fsd/pages/upload-detail/ui/index.tsx` | `:87`을 `formatDateTime(createdAt)`로 |
| `src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx` | `:159`를 `formatDateTime(timestamp)`로(널 가드 유지) |
| `src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx` | `:71`을 `formatDateTime(file.createdAt)`로 |
| `src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx` | 모듈 상수 `dateFormatter`(`:19-22`) 제거, `:30`을 `formatDateTime(file.createdAt)`로(잠복 결함 통합) |
| `src/fsd/pages/dashboard/ui/_component/RecoverableUploadDrafts.tsx` | 모듈 상수 `formatter`(`:22-25`) 제거, `:88`을 `formatDateTime(...)`로(잠복 결함 통합) |

**기존 두 곳도 합친다** — 같은 타임존 잠복 결함을 갖고 있고, 통합하면 중복 포매터가
사라지고 재발 지점이 준다. 기계적이며 같은 파일 부류 안이다.

## 구현 스케치

**`shared/lib/format-date.ts` (신규)** — `format-duration.ts`(`formatSecondsAsClock`)와
같은 자리·같은 스타일(순수 함수, null 처리는 호출부). 로케일·타임존을 **둘 다** 고정해
서버·클라이언트가 동일 문자열을 낸다.

```ts
// 서버(Vercel, UTC)와 브라우저(사용자 로케일·타임존)가 같은 문자열을 내야
// 하이드레이션(React #418)이 깨지지 않는다. 로케일은 "en", 타임존은 "UTC"로
// 고정한다 — UTC는 서버 런타임과 같아 최소 변경이고, 사용자 위치를 가정하지
// 않는 중립값이다. 표시 시각이 사용자 로컬이 아니라 UTC라는 점은 감수한다
// (「대안」의 Asia/Seoul·클라이언트 전용 렌더 참조).
const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

// 날짜만(주문일·구독 갱신/만료일 등 시계가 무의미한 곳).
export function formatDate(value: Date | string | number): string {
  return DATE_FORMATTER.format(new Date(value));
}

// 날짜+시각(업로드 시각·처리 타임라인 등).
export function formatDateTime(value: Date | string | number): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}
```

- `Date | string | number`를 받아 내부에서 `new Date(value)` — 호출부가 `Date`
  (`OrderInfo.createdAt`, `ProcessingTimeline`의 `timestamp`)든 직렬화 문자열이든
  같은 함수를 쓴다.
- **널 처리는 하지 않는다**(`format-duration.ts:8` 철학과 동일). `ProcessingTimeline`
  은 기존 `timestamp ? … : "Waiting..."` 널 가드를 유지하고 truthy일 때만 호출한다.

**호출부 교체(전부 import 추가 + 한 줄 치환)** — 예:

- `OrderHistory.tsx:55`: `{new Date(order.createdAt).toLocaleDateString()}` →
  `{formatDate(order.createdAt)}`
- `SubscriptionStatus.tsx:95`: → `{formatDate(subscription.currentPeriodEnd)}`;
  `:127-129`: → `{formatDate(subscription.currentPeriodEnd)}`
- `upload-detail/ui/index.tsx:87`: `{new Date(createdAt).toLocaleString()}` →
  `{formatDateTime(createdAt)}`
- `ProcessingTimeline.tsx:159`: `{timestamp ? timestamp.toLocaleString() : "Waiting..."}`
  → `{timestamp ? formatDateTime(timestamp) : "Waiting..."}`
- `QueueStatus.tsx:71`: → `{formatDateTime(file.createdAt)}`
- `UploadedFileCard.tsx`: `:19-22` 상수 제거, `:30` `dateFormatter.format(new Date(file.createdAt))`
  → `formatDateTime(file.createdAt)`
- `RecoverableUploadDrafts.tsx`: `:22-25` 상수 제거, `:88` `formatter.format(<원래 인자>)`
  → `formatDateTime(<원래 인자>)`

import 경로는 `format-duration`과 동일 관례: `import { formatDate, formatDateTime } from "~/fsd/shared/lib/format-date";`.

**표시 문구 변화(사용자 가시)**: 날짜+시각 문구가 ko-KR "2026. 7. 30. 오후 10:55:46"
에서 `"en"`/UTC "Jul 30, 2026, 10:55 PM" 형태로 바뀐다. 시각은 이제 UTC 기준이다
(예: KST 오후 10:55 = 다음날 표기가 아니라 UTC 시각으로 재계산). 존 라벨은 붙이지
않는다(`dateStyle`/`timeStyle`에 `timeZoneName`을 섞으면 Intl이 throw). UTC 표기라는
점은 「테스트」의 못 덮는 범위와 「대안」에 남긴다.

## 테스트

- **덮는 것**: `shared/lib/format-date.test.mjs`로 `formatDate`·`formatDateTime`가
  **런타임 로케일·타임존과 무관하게 고정 출력**을 내는지. 골든 문자열은 검증 라운드에서
  실측했다(Node v22.13.1): `formatDateTime("2026-07-30T22:55:46Z")` →
  `"Jul 30, 2026, 10:55 PM"`, `formatDate("2026-09-27T00:00:00Z")` → `"Sep 27, 2026"`.
  (ICU 버전 의존이므로 구현 시 CI 러너 출력으로 재확인한다.)

  **이 테스트는 아래 두 장치가 있어야 회귀를 실제로 잡는다**(없으면 장식이다 — 검증
  라운드 결함 ④⑤의 실측 근거):

  1. **테스트가 프로세스 타임존을 비-UTC로 강제한 뒤 모듈을 임포트한다.** 골든 대조만
     으로는 **러너의 TZ가 UTC일 때 `timeZone: "UTC"`를 지운 구현이 그대로 통과한다**
     (실측: `TZ=UTC`에서 돌연변이 생존, `TZ=Asia/Seoul`에서 사멸). CI·Vercel이 UTC이므로
     기본 상태가 곧 생존 조건이다. 포매터는 모듈 스코프에서 만들어지므로 **`process.env.TZ`
     설정이 임포트보다 먼저**여야 한다 — 테스트 첫 줄에서 `process.env.TZ = "Asia/Seoul"`
     을 설정하고 `await import("./format-date.ts")`로 동적 임포트한다 — 확장자는 `.ts`다
     (저장소의 모든 `*.test.mjs`에서 상대 임포트를 전수 열거하면 **11건 전부**
     `"./모듈.ts"` 형태이고 `.js`는 0건이다 — `caption-presets`·`clip-count-budget`·
     `clip-generation-outcome`·`clip-rationale`·`clip-type-label`·`event-catalog`·
     `metadata`·`normalize-path`·`selection-budget`·`stuck-alert`·`subtitle-status`.
     `.js`도 tsx가 해석하지만 관례를 따른다).
     **실제 러너로 실측**: `TZ=UTC npx tsx --test`에서 원본은 통과, `timeZone: "UTC"`를
     지운 돌연변이는 `actual: 'Jul 31, 2026, 7:55 AM'`으로 **사멸**했다.
  2. **`resolvedOptions().locale`이 정확히 `"en"`인지 단언한다**(`startsWith("en")`이
     아니라 완전 일치). 로케일 인자를 지운 구현은 시스템 로케일로 해석되는데, en 계열
     CI에서는 `"en-US"`가 되어 골든 문자열이 우연히 같을 수 있다. 완전 일치 단언이면
     `"en-US" !== "en"`으로 사멸한다.
- **못 덮는 범위**(배포 후 수동 확인으로 이관):
  - **프로덕션 콘솔의 React #418 소멸이 최종 판정이다.** 이 결함은 `npm run build`·
    현재 러너로 재현되지 않는다(서버·클라 로케일·타임존이 같은 러너에서는 불일치가
    안 난다). 배포 후 `/dashboard/billing`과 `/dashboard/uploads/<id>`를 열어 콘솔에
    `Minified React error #418`이 더 이상 뜨지 않는지 확인해야 한다.
  - `RecoverableUploadDrafts`(복구 초안이 있을 때)·`UploadedFileCard`(My Clips 탭)의
    시각 표기가 서버·클라 동일한지는 실제 데이터·탭 전환이 필요해 러너로 못 덮는다.
  - UTC 표기가 사용자에게 혼란을 주는지(로컬 시각 기대) — 표시 정책 판단이라 실물
    관측 대상.

## 범위 밖 의존

없음. 전부 `apps/web/src/fsd/shared/lib`와 호출부(features/billing·pages) 안이다.
`packages/db`·다른 워크스페이스에 닿지 않는다.

## 대안

- **타임존 `"Asia/Seoul"` 고정** — 현재 관측 화면이 이미 KST를 보여주므로 현
  운영자(1인, 한국)에겐 표시 시각이 그대로 유지되고 #418도 사라진다. 그러나 영어로
  글로벌 마케팅하는 제품에 한국 타임존을 박는 것이라, 다른 지역 사용자에게는 KST가
  뜬다. UTC는 사용자 위치를 가정하지 않아 중립적이고 서버와 같아 최소 변경이라
  1차로 채택했다. (유저가 붙으면 "사용자 로컬 시각" 표시는 후속 항목으로.)
- **클라이언트 전용 렌더(마운트 후 로컬 시각)** — `useEffect`/마운트 플래그나
  `suppressHydrationWarning`으로 서버는 안정 자리표시자, 클라는 로컬 시각. 진짜 로컬
  시각을 보여주지만 자리표시자→시각의 깜빡임과 컴포넌트별 상태가 늘어 복잡하다.
  저장소가 이미 `Intl.DateTimeFormat` 고정 포매터 방향을 택했으므로(대비 사례 둘)
  그 방향을 완성(타임존까지 고정)하는 편이 일관적이라 채택하지 않았다.
- **로케일만 고정("en"), 타임존 미고정** — 저장소의 기존 두 포매터가 이 형태다.
  날짜+시각을 SSR하는 순간 서버(UTC)·브라우저(Asia/Seoul)가 시각 부분에서 어긋나
  #418을 재발시키므로 불충분하다(「문제」 참조).

## 검증 라운드 기록 (메인 루프, 2026-09-04 1라운드)

`docs/plans/verification-paths.md`의 필수 경로 1·2·3·4·5·7·8을 돌렸다. 결함 둘을 위
「테스트」 절에 반영했다. 증거는 `docs/agents/main-loop/BUG-10.md`.

**결함 ④ (블로커) — 골든 테스트가 CI에서 타임존 돌연변이를 못 잡는다.**
계획서는 "이 테스트가 로케일·타임존 미고정으로의 회귀를 잡는다"고 주장했다. 명세대로
테스트를 짜고 `timeZone: "UTC"`를 제거한 돌연변이를 넣어 돌리니, `TZ=Asia/Seoul`(개발자
머신)에서는 사멸했지만 **`TZ=UTC`에서는 생존**했다 — 프로세스 TZ가 이미 UTC면 옵션을
지워도 같은 문자열이 나온다. CI와 Vercel이 UTC이므로 이 테스트는 가장 중요한 회귀를
못 잡는 상태로 들어간다. `resolvedOptions().timeZone === "UTC"` 단언을 더해도 같은
이유로 생존한다(실측). → 테스트가 임포트 전에 `process.env.TZ`를 비-UTC로 강제하는
방식으로 명세를 강화했다(실측으로 사멸 확인).

**결함 ⑤ (블로커) — 로케일 돌연변이도 같은 구멍이 있다.**
로케일 인자를 지운 구현은 시스템 로케일로 해석된다. 이 머신은 ko-KR이라 사멸하지만,
en 계열 CI에서는 `"en-US"`로 해석돼 골든 문자열이 우연히 일치할 수 있다.
`resolvedOptions().locale`은 `"en"` 인자에 대해 정확히 `"en"`을, `undefined`에 대해
시스템 로케일(`"ko-KR"` 실측)을 돌려주므로, **완전 일치** 단언이면 en 계열 CI에서도
사멸한다. → 명세에 완전 일치 단언을 명시했다.

**통과한 것**: 인용 전수 대조(경로 1) — 다섯 호출부와 대비 사례 둘의 `파일:줄`을 다시
읽어 내용까지 일치 확인. 스케치 실행(경로 2) — 포매터 스케치를 그대로 Node에서 돌려
골든 문자열 두 개가 **정확히 일치**함을 실측(Node v22.13.1). 전칭 여집합(경로 4) —
저장소 전체에서 `toLocaleDateString|toLocaleTimeString|toLocaleString|Intl.DateTimeFormat`
를 열거해 여덟 곳(대상 다섯 + 기존 포매터 둘 + 테스트 제외)이 전부임을 확인, 「고칠 파일」
표가 그 여덟을 빠짐없이 덮는다. 돌연변이 검사(경로 5)는 위 결함 ④⑤로 이어졌다.
계획서의 "`dateStyle`/`timeStyle`에 `timeZoneName`을 섞으면 Intl이 throw" 주장도 실측
확인(TypeError).

**남은 비차단 위험**: 표시 시각이 UTC로 바뀌는 것은 사용자 가시 변화다. 계획서가
「대안」에 트레이드오프를 남겼고 게이트②에서 소유자가 선택할 수 있다 — 검증 결함이
아니라 결정 사항이다.

