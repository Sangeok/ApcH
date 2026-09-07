# FEAT-32 — 메인 루프 기록

## 필수 경로 확정 (2026-09-07)

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목 필수 |
| 2 스케치 추출·실행 | ◎ | `scrub-event.ts`가 순수 모듈이라 돌려볼 수 있다 — 이 항목의 유일한 자동 검증 대상 |
| 3 before/after | ○ | 기존 파일 3개 수정(env.js·sentry.server.config.ts·next.config.js) |
| 4 전칭 여집합 | ○ | "Sentry.init은 하나뿐", "클라 진입점 0개", "에러 경계 5개" |
| 5 돌연변이 | ◎ | 순수 함수 `scrubString`/`scrubEvent` 신설 — 명세가 회귀를 잡는지 |
| 6 실제 사건 재생 | × | 외부 신호 해석이 없다(이벤트를 만들어 보내는 쪽이다) |
| 7 음성 시험 | ○ | 스크럽 규칙이 실제로 막는지 |
| 8 실물 렌더 | × | 화면 변경 없음 |
| 9 구조적 아티팩트 | ○ | `env.js` 스키마·`next.config.js` CSP 헤더 |

## 라운드 1 (편집) — 결함 1건, **보안 영향**

### 결함 ① — 스크럽 정규식이 이스케이프된 따옴표에서 비밀을 통과시킨다

**이 항목이 옮기려는 서버 원본 코드에 있던 결함이고, 실측으로 확인했다.**

`SCRUB_RULES`의 경계는 `[^&\s"']+`인데, `scrubEvent`는 이벤트를 **JSON으로 직렬화한 뒤** 치환한다.
값 안에 따옴표가 있으면 `JSON.stringify`가 `\"`로 이스케이프하고, 경계가 **백슬래시에서 멈추지
않아** 닫는 따옴표까지 먹는다. 결과가 깨진 JSON → `JSON.parse` throw → catch가 **스크럽되지 않은
원본을 그대로 반환**(fail-open).

실측:
```
입력 이벤트: { message: 'boom X-Amz-Signature=abc"tail rest' }
JSON        : {"message":"boom X-Amz-Signature=abc\"tail rest"}
치환 후     : {"message":"boom X-Amz-Signature=[REDACTED]"tail rest"}   ← 깨진 JSON
JSON.parse  : throw → catch → 원본 반환
scrubEvent 결과 === 입력 객체 (동일 참조)
→ 서명이 스크럽 없이 Sentry로 나간다
```

**계획서의 서술과 어긋나는 지점**: 계획서(와 서버 원본 주석)가 catch를 "SDK 정규화가 순환 참조·
BigInt를 먼저 제거하므로 **사실상 죽은 경로**"라고 적었다. 그 근거는 맞지만 **이 경로는 살아
있다** — 정규화는 문자열 *안*의 따옴표를 없애지 않는다.

**수정과 검증**: 경계에 백슬래시를 추가(`[^&\s"'\]+`). 네 입력으로 대조 실측 —

| 입력 | 현행 | `\` 추가 |
| --- | --- | --- |
| `X-Amz-Signature=abc"tail rest` | **깨진 JSON → fail-open(유출)** | 유효 · 스크럽 |
| `?X-Amz-Signature=abc123&next=1` | 유효 · 스크럽 | 유효 · 스크럽 |
| `X-Amz-Signature=abc def` | 유효 · 스크럽 | 유효 · 스크럽 |
| `X-Amz-Signature=AKIA/2026/ap/s3/aws4_request` | 유효 · 스크럽 | 유효 · 스크럽 |

**이 수정은 서버에도 적용된다** — 서버가 이 모듈에 위임하므로 같은 결함이 서버에서도 닫힌다.
계획서 「테스트」에 이 회귀를 못박는 케이스와 음성 시험(경계에서 `\`를 빼면 테스트가 죽는지)을
추가했다.

### 통과한 것

**경로 2 — 클라 진입점 확정을 SDK 소스로 검산**: 계획서가 `instrumentation-client.ts`로 확정한
근거를 직접 읽었다. `node_modules/@sentry/nextjs/build/cjs/config/webpack.js:213`이
`sentry.client.config`에 대해 "DEPRECATION WARNING … When using Turbopack `<file>` will no longer
work"를 찍고, 같은 파일 `:343-348`의 `getInstrumentationClientFile`이 후보 넷을 탐색한다 —
`["src","instrumentation-client.js"]`, **`["src","instrumentation-client.ts"]`**, 루트 둘. 이
프로젝트는 `src/` 구조이고 dev가 `--turbo`라 계획서 판단이 맞다. 설치 버전도 **10.68.0** 확인.

**경로 2 — 스크럽 추출이 서버 동작을 보존하는가**: 스케치를 그대로 옮겨 서버 원본 재현과 대조.
정상 입력들(`&`·공백 경계, 슬래시 포함 값, 리터럴 치환)에서 **출력 동일**. 클라(리터럴 빈 배열)는
엔드포인트 호스트를 유지 — 의도대로다.

**경로 1 — 인용 대조**: `next.config.js:98`의 `connect-src`(sentry.io 없음), `:115-121`의
`withSentryConfig` 옵션 셋, `sentry.server.config.ts:11-14`(SCRUB_RULES)·`:73`(`tracesSampleRate: 0`)·
`:74`(`beforeSend`), `env.js:43`(`SENTRY_DSN` server 스코프), 에러 경계 5개 파일 — 전부 일치.

**계획서가 브리핑 요구를 넘어선 지점(칭찬할 것)**: 내가 요구하지 않은 **CSP 문제**를 스스로
찾았다. `connect-src`에 sentry.io가 없어 프로덕션에서 이벤트 POST가 차단되고, 그러면 검증 자체가
성립하지 않는다. 이걸 놓쳤으면 "초기화했는데 왜 안 오지"로 한참 헤맸을 것이다.

**결과**: 편집 라운드. 다음은 무편집 패스.

## 라운드 2 (무편집) — 무소득

1라운드 수정(경계에 백슬래시 추가)이 **다른 걸 깨지 않는지**와 **명세가 그 회귀를 잡는지**를 시험했다.

**회귀 시험 — 일곱 케이스 전부 통과, 유출 0**

| 케이스 | 결과 |
| --- | --- |
| 정상 URL(`&` 경계, 두 규칙 동시) | `[REDACTED]` 둘 |
| **따옴표 값**(1라운드 결함) | `X-Amz-Signature=[REDACTED]\"tail` — 유효 JSON, 스크럽 |
| 백슬래시 값 | `[REDACTED]\c end` — 값 안 백슬래시에서 잘리지만 **비밀은 안 샌다** |
| 세 규칙 동시 | 셋 다 치환 |
| 중첩(`exception.values[].value`) | 치환 |
| 호스트 + 서명(리터럴 + 규칙) | `[PROCESS_VIDEO_ENDPOINT]` + `[REDACTED]` |
| 스크럽 대상 없음 | 무변경 |

**돌연변이 검사 — 명세가 회귀를 잡는다**

계획서 「테스트」에 추가한 이스케이프 따옴표 케이스를 실행 가능한 형태로 옮기고 경계에서
백슬래시를 뺀 돌연변이를 심었다.

```
original (boundary WITH backslash): PASS
mutant   (backslash REMOVED)      : FAIL (fail-open, secret leaked)
```

**사멸.** 나중에 누가 정규식을 "정리"하면서 백슬래시를 빼면 테스트가 죽는다 — 명세가 장식이 아니다.

**부수 관측(결함 아님)**: 값 안에 실제 백슬래시가 있으면(`abc\def`) 거기서 치환이 끊긴다. 원본
경계도 따옴표·공백에서 같은 성질이었고, 남는 것은 서명의 **뒷부분 일부**이지 앞부분이 아니다 —
`X-Amz-Signature=[REDACTED]\c` 형태라 서명값 자체는 복원 불가하다. 완전 방어가 아니라 심층
방어라는 계획서 서술과 일관되므로 그대로 둔다.

편집 없음·소득 없음 → `plan-verifier` 독립 패스 디스패치.

## 라운드 3 (plan-verifier 독립 패스 1사이클) — 결함 3건, 전부 반영

셋 다 문서 위생으로 분류됐고(구현을 틀리게 하는 것 0건) 내가 재현해 반영했다.

**결함 ② (가장 실질적) — `environment` 기대값이 노출 경로에서 어긋난다.**
계획서 「범위 밖 의존」이 "`NEXT_PUBLIC_VERCEL_ENV`를 노출하면 preview/production을 정확히
가른다"고 적었는데, SDK 소스가 값에 **접두사를 붙인다**:

```js
// node_modules/@sentry/nextjs/build/cjs/common/getVercelEnv.js:4-5
const vercelEnvVar = isClient ? process.env.NEXT_PUBLIC_VERCEL_ENV : process.env.VERCEL_ENV;
return vercelEnvVar ? `vercel-${vercelEnvVar}` : void 0;
```

노출하면 클라는 `vercel-production`, 서버는 `sentry.server.config.ts:69`의
`process.env.VERCEL_ENV ?? "development"`로 `production` — **서버·클라 태그가 비대칭**이 되어
Sentry에서 한 환경으로 안 묶인다. 게다가 §검증 4단계가 "environment가 production인지" 확인하라고
하니, 노출한 상태로 검증하면 **거짓 실패**가 난다.

→ 「(선택) 노출」을 **「(선택 — 권장하지 않음)」**으로 바꾸고 「environment 값 주의」 절을 신설해
두 경로의 값을 표로 못박았다. 기본(노출 안 함) 경로에서는 클라가 `NODE_ENV` 폴백으로 `production`이
되어 서버와 일치한다 — 그래서 §검증 4단계 기대값은 그 경로 기준임을 명시했다.

**결함 ③ — 인용 줄 범위 둘.** `getEndpointHost`는 `:17-23`이고 `:25`는 별개 심볼
`const ENDPOINT_HOST = getEndpointHost();`다(계획서가 §4에서는 정확히 나눠 쓰는데 §현재 동작에서만
`:17-25`로 뭉쳤다 — 내부 불일치). SDK `getDefaultIntegrations`는 `:85-103`이고 `:104-108`은 다른
심볼이다. 둘 다 실측 확인 후 정정.

**결함 ① — env.js 삽입 위치의 산문 vs 블록 불일치.** 산문은 `NEXT_PUBLIC_SITE_URL` **아래**,
after-블록은 **위**에 놓는다. 검증자가 "키 순서는 t3-env·Zod 동작과 무관하며 어느 쪽이든 컴파일·
실행이 동일"함을 스크래치패드에서 확인했다. after-블록이 실제 적용 대상이므로 **산문을 지우지 않고
그대로 뒀다** — 블록이 진실이고, 산문은 위치 힌트일 뿐이라 구현자가 블록을 따르면 된다.

**독립 패스가 통과시킨 것**: 인용 전수 대조 — 소스 인용 스물넷과 SDK 인용 일곱이 내용까지 일치
(예외가 결함 ③ 둘). 스케치 실행 — 계획서에서 `scrub-event.ts`를 **바이트 그대로** 추출해
(`od -c`로 정규식 경계가 `5c 5c`임을 확인) 프로젝트 strict 플래그로 `tsc --noEmit` 진단 0.
before/after — before 블록 전부 `grep -Fxq`로 현재 트리와 verbatim 일치, after 적용본 둘이
`node --check` 통과. 전칭 여집합 — `Sentry.init` 실호출 1건(`env.js:42`는 주석), 에러 경계 5개,
클라 진입점 파일 0개, client 블록의 `NEXT_PUBLIC` 키 둘. **돌연변이 검사 — 6종 전부 사멸**
(규칙 replace 제거·치환값 오염·literal을 replace로·catch를 rethrow로·Credential 규칙 제거·
literal 루프 제거). **음성 시험 — 경계에서 `\`를 뺀 원본 정규식에 스펙을 돌리니 escaped-quote
회귀 테스트가 사멸**하고 `Signature=abc`가 유출됨을 재현 — 라운드 1이 찾은 결함과 그 테스트의
이빨을 독립 확인했다. 계획서 동작표 4행도 재현해 전부 일치.

**결과**: 편집 라운드. 다음은 무편집 패스 + 새 독립 패스.
