# FEAT-32 — 클라이언트 Sentry 초기화

## 2026-09-07 — 구현 (완료)

계획서 `docs/plans/FEAT-32.md`(검증 클린 패스 6라운드)대로 구현. 구현 전 「현재 동작」을
현재 트리와 대조: `sentry.server.config.ts`·`env.js`·`next.config.js`·`shared/observability/{index,report-error}.ts`·
`instrumentation.ts` 전부 계획서 서술과 일치, 클라 진입점 0개 확인(전수 `ls`). 어긋남 없음.

### 고친 파일 (전수 6개 — 계획서 「고칠 파일」과 일치)

신규 3
- `apps/web/src/fsd/shared/observability/scrub-event.ts` — 서버 설정의 스크럽 3요소를 클라이언트
  안전 순수 모듈로 추출. `scrubString`/`scrubEvent` + `LiteralReplacement` 타입. env·server-only 의존 없음.
  정규식 경계에 `\\` 추가(계획서 결함 ① 수정: JSON.stringify가 만든 `\"`의 백슬래시에서 멈추게 해
  fail-open 유출을 막음). barrel(`index.ts`)에는 넣지 않고 파일 경로로만 임포트.
- `apps/web/src/fsd/shared/observability/scrub-event.test.mjs` — 순수 스크럽 분기 테스트 11개.
- `apps/web/src/instrumentation-client.ts` — 브라우저 `Sentry.init`(dsn=`env.NEXT_PUBLIC_SENTRY_DSN`,
  environment 생략=SDK 자동, sendDefaultPii false, tracesSampleRate 0, beforeSend=scrubEvent 리터럴 없이)
  + `onRouterTransitionStart = Sentry.captureRouterTransitionStart` export.

수정 3
- `apps/web/src/env.js` — client 스코프에 `NEXT_PUBLIC_SENTRY_DSN: z.string().optional()`(SITE_URL 위),
  runtimeEnv에 `NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN`(SITE_URL 위) 추가.
- `apps/web/src/sentry.server.config.ts` — 인라인 `SCRUB_RULES`·`scrub`·`scrubEvent`를 제거하고
  추출 모듈 재사용. `getEndpointHost`·`ENDPOINT_HOST` 유지, `ENDPOINT_REPLACEMENTS` 상수 신설,
  `beforeSend`를 `scrubEvent(event, ENDPOINT_REPLACEMENTS)`로 교체(동작 보존).
- `apps/web/next.config.js` — CSP `connect-src`에 `https://*.sentry.io` 추가,
  `withSentryConfig`에 `webpack: { treeshake: { removeTracing: true, removeDebugLogging: true } }` 추가.

### 스케치 대비 차이

- 분기 순서·조건·리터럴 값·사용자에게 보이는 문구: **스케치와 동일.** before/after 블록을 그대로 적용.
- `sentry.server.config.ts`에서 스케치가 "SCRUB_RULES(:11-15)·scrub(:27-39)·scrubEvent(:57-63) 삭제"로
  코드 라인만 명시했으나, 그에 딸린 설명 주석(SCRUB_RULES 위 4-10, scrubEvent 위 41-56 — 계획서가
  "죽은 경로 주석도 함께 고친다"고 지목한 것)도 함께 제거했다. 남기면 이 파일에 더는 없는 함수·상수를
  가리키는 문서 드리프트가 된다. 새 주석 텍스트는 발명하지 않음(추출 모듈이 근거를 담는다).
  로직·분기·리터럴 무변경이라 승인 판단 대상은 아니다.
- 테스트 개수: 순수 모듈이라 계획서 「덮는 것」 항목을 11개 `it`으로 구현(scrubString 7 + scrubEvent 4).

### 검증

- `npm run check -w apps/web` → EXIT 0. verify:fsd:test 11/11, verify:fsd "passed",
  next lint "No ESLint warnings or errors", tsc --noEmit 무출력(성공).
  (첫 실행이 `| tail`의 broken-pipe로 비정상 종료코드를 냈으나, 파일 리다이렉트 재실행이 EXIT 0.
   lint·tsc 단독 실행도 각각 EXIT 0으로 재확인.)
- `npm test -w apps/web` → 88 pass / 0 fail (77→88, +11 scrub-event). suites 17→19.
- FSD 경계: `instrumentation-client.ts`·`sentry.server.config.ts`(둘 다 src 루트, non-fsd)가
  `~/fsd/shared/observability/scrub-event`를 파일 경로로 임포트 — W4는 widgets에만, shared 내부 직접
  임포트는 허용(에러 경계 5개가 use-report-boundary-error를 같은 방식으로 임포트하는 것과 동일). 위반 0.
- 탐침 빌드는 돌리지 않음. `next lint`가 만든 `.next/`(cache/만, types/ 없음)를 제거해 트리 청결.

### 테스트로 못 덮는 범위 (배포 후 수동 — release-checks 등재 대상)

Node 내장 러너에 DOM·브라우저·실네트워크가 없어 원리상 불가:
- 브라우저에서 `Sentry.init`이 실제 실행되고 이벤트가 Sentry ingest에 **도달**하는지(이 항목의 본체).
- CSP `connect-src`가 실제 이벤트 POST를 막지 않는지(프로덕션에서만 CSP 적용).
- `webpack.treeshake`가 실제 번들에서 tracing을 제거했는지(산출물 크기 실측).
- `instrumentation-client.ts`가 webpack/Turbopack 엔트리에 주입되는지.
- 검증 절차·environment 값 주의는 계획서 §검증/§environment 값 주의 참조.

### 저장소 밖 선행 (사람 몫 — 구현을 막지 않음)

- Vercel Production·Preview 스코프에 `NEXT_PUBLIC_SENTRY_DSN`을 기존 `SENTRY_DSN`과 동일 DSN 값으로 주입.
  없으면 client init이 조용히 no-op(빌드·배포는 됨). §검증 성립에 필요.
- Sentry 대시보드 접근(이벤트 도달·스크럽 확인).

### 후속 (계획서 §대안 — 새 백로그 후보, web 범위)

- 에러 경계 훅 `use-report-boundary-error.ts`에 `Sentry.captureException` 배선.
  백로그·파일 주석이 "초기화·도달 실측 뒤"로 순서를 못 박아 이 항목에서는 연기. §검증에서 도달이
  확인되면 등재할 후속.

## 2026-09-07 — 인수 지적 반영 (3건)

메인 루프 인수 재현에서 나온 3건을 코드·분기·리터럴 무변경으로 수정. 인수 조건 5개는 이미 통과 상태였다.

- ① 보드 `결과`가 154자(150자 초과, 대시보드가 초과분을 표시). `env 클라DSN`→`env`, `CSP sentry.io`→`CSP`로
  줄여 113자로 축소.
- ② `scrub-event.ts`의 scrubEvent 주석 "(서버 원본 주석의 한계 1과 동일 …)"이 내가 삭제한 원본 주석을
  가리키는 매달린 참조였다. 해당 참조 문구를 제거하고 fail-open 설명을 자기완결형으로 다시 씀
  (`grep "서버 원본 주석의 한계" src/` = 0으로 확인).
- ③ 삭제된 주석에 딸려 사라진, **지금도 유효한 계약** 둘을 새 위치에 옮겨 적음:
  - 왕복 손실(원본 「한계 2」): scrubEvent가 여전히 `JSON.parse(JSON.stringify(...))`라 undefined/함수/심볼
    소실·Date 문자열화가 유효 → scrubEvent 주석에 「한계 2」로 복원.
  - 유지보수 지시: 자유 문자열이 report-error.ts의 ReportContext로 들어온다는 것과, 새로운 종류의 비밀은
    규칙 추가가 필요하다는 지시. 규칙 추가 지점이 이제 이 모듈이므로 SCRUB_RULES 위 헤더 주석으로 옮김
    (서버 엔드포인트 리터럴은 sentry.server.config.ts라고 명시).

검증: `npm run check -w apps/web` EXIT 0(verify:fsd:test 11/11·verify:fsd passed·lint clean·tsc clean),
`npm test -w apps/web` 88 pass / 0 fail. 주석만 바뀌어 테스트·타입·경계 결과 불변.
