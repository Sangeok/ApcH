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
