---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-07-28"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-07-28"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# 프로덕션 에러 인지 체계 (Sentry 서버 전용 + 파이프라인 실패 계측) 설계 문서

Date: 2026-07-28
Status: Design (구현 전) — 클린코드 5렌즈 리뷰 + 품질 게이트 1회 반영 완료
Scope: 1단계만. 2단계는 §9에 유예 사유와 함께 기록.

---

## 1. 배경/동기

### 문제

현재 프로덕션에서 에러가 나면 **직접 확인하거나 사용자가 CS를 넣기 전까지 알 수 없다.** 코드베이스를 훑어보니 이건 하나의 문제가 아니라 성격이 다른 네 가지 사각지대다.

| # | 사각지대 | 현재 상태 |
|---|---|---|
| ① | 터미널 실패가 DB에 조용히 쌓임 | `UploadedFile.status = "failed"` + `failureCode`가 기록되지만 아무도 조회하지 않음 |
| ② | 서버 예외가 `console.error`로 삼켜짐 | 서버 29곳이 `catch → console.error → failure()`. Vercel 런타임 로그는 휘발성이고 알림 없음 |
| ③ | 클라이언트 렌더링 에러 | `error.tsx` 4개 + `global-error.tsx`가 `console.error`만 함 → 사용자 브라우저 콘솔에만 남음 |
| ④ | 예외 없이 정체된 행 | Inngest 함수가 죽으면 행이 `processing`에 남음. 던져진 예외가 없어 어떤 에러 트래커도 못 잡음. **단, 완전한 사각지대는 아니다** — 아래 주석 참조 |

> **④ 정정**: 기존에 `PROCESSING_STALE_POLICY.processingTimeoutMs = 120분`(`src/fsd/entities/uploaded-file/model/stale-policy.ts:4`)과 이를 소비하는 `reconcileStaleUploadedFilesForUser`(`uploaded-file/api/index.ts:1034`)가 **이미 살아서 돌고 있다**. 대시보드 진입(`src/app/dashboard/page.tsx:20`)과 upload 피처 2곳(`features/upload/api/index.ts:497,508`)에서 호출되어 120분 넘은 `processing` 행을 `failed`/`worker_timeout`으로 마킹한다. 따라서 ④의 실제 공백은 "정체를 아무도 못 잡는다"가 아니라 **"해당 사용자가 대시보드에 다시 들어오지 않으면 아무 일도 안 일어나고, 마킹되더라도 나에게 알림이 오지 않는다"** 이다. §5.4는 이 기존 메커니즘과의 관계를 반드시 정리해야 한다.

①④는 **DB 상태**의 문제이고 ②③은 **예외 수집**의 문제다. 도구가 다르다. 그리고 이 제품처럼 비동기 파이프라인이 본체인 서비스에서 사용자가 실제로 아파하는 건 ①④ 쪽이다.

### 유리한 선행 조건 (코드베이스에서 확인)

- `/admin/analytics` 페이지와 `src/fsd/shared/api/admin-guard.ts`가 이미 있다 → 관리자 전용 진입점을 새로 만들 필요 없음.
- Inngest cron 패턴이 이미 돈다: `cleanupAnalyticsEvents`(`src/inngest/functions.ts:981`, `cron: "0 3 * * *"`). 새 cron은 이 패턴을 그대로 복제하면 된다.
- **스키마 변경이 전혀 필요 없다.** 필요한 컬럼이 이미 전부 있다:
  - `UploadedFile.terminalStatusAt` — 실패 시각
  - `UploadedFile.failureCode` — 실패 사유 (`callback_timeout`, `analysis_timeout`, `analysis_failed`, `dispatch_failed`, `no_clips_generated` …)
  - `UploadedFile.processingStartedAt` — 처리 시작 시각
  - `@@index([status, processingStartedAt])` — 정체 탐지 쿼리에 정확히 맞는 인덱스
  - `ProcessingDispatch.status = "dead_letter"` + `lastError`
- Vercel `icn1` 배포, `vercel.json`에 crons 없음. 현재 **Hobby**이며 **Pro 전환 예정**.

### 터미널 실패를 쓰는 함수는 3개 — 그러나 계측 지점은 3개가 아니다

`status: "failed"` / `"dead_letter"`를 쓰는 **함수**를 전수 조사한 결과 정확히 세 개이며 전부 엔티티 레이어다.

| 함수 | 위치 | 쓰는 값 |
|---|---|---|
| `markUploadedFileAttemptFailed` | `src/fsd/entities/uploaded-file/api/index.ts:826-857` | `status:"failed"`, `terminalStatusAt`, `failureCode` |
| dispatch 실패 경로 | `src/fsd/entities/processing-dispatch/api/index.ts:274` | `status:"failed"`, `failureCode:"dispatch_failed"` |
| `markProcessingDispatchDeadLetter` | `src/fsd/entities/processing-dispatch/api/index.ts:117-131` | `status:"dead_letter"`, `lastError` |

**여기에 보고를 얹으면 ①이 실시간으로 잡힌다. 단, "함수 안에" 얹으면 안 된다.** 이 세 함수는 공유 라이터라 계측 지점이 3개가 아니라 수십 개로 번진다:

- `markUploadedFileAttemptFailed`의 호출부는 **16곳**이다 — `inngest/functions.ts`(322, 342, 598, 614, 630, 669, 754, 862, 912, 965), `features/upload/api/index.ts:199`, `processing-dispatch/api/index.ts:261`, 그리고 reconcile stale 마킹 경로 4곳: `reconcileStaleUploadedFileForUser`(단일 파일, `:948`) 내부 `:1002`와 `reconcileStaleUploadedFilesForUser`(파일별 루프, `:1034`) 내부 `:1074, :1102, :1127`. 이 4곳은 stale 마킹 경로라(특히 루프 함수는 한 번의 대시보드 진입으로 여러 행을 연달아 마킹) 한 번의 조작으로 다수 이벤트가 발생할 수 있다.
- `markProcessingDispatchDeadLetter`는 진짜 실패(`:260`의 catch)뿐 아니라 **정상적인 동시성 결과**로도 호출된다 — `deadLetterClaimedNonSentDispatch`가 `stale_attempt`(`:159`), `not_found`(`:174`), `already_advanced:*`(`:179`)로 dead-letter 처리한다. 이들은 고장이 아니다.
- 진짜 dispatch 실패 1건은 `db.$transaction`(`:259-271`) 안에서 위 두 함수를 **모두** 호출한다. 함수 안에 계측하면 한 사건이 2~3개 이벤트로 쪼개지고, 커밋 전에 전송되며, (flush를 도입하면) 열린 트랜잭션 안에서 네트워크 I/O를 하게 된다.

따라서 보고는 **함수 내부가 아니라 실제 실패를 아는 호출부에서, 트랜잭션 밖에서, 사건당 한 번** 발생시킨다. 구체 배치는 §5.3, 제외 대상은 §6.4.

---

## 2. 목표 상태

### 목표 (1단계)

- **dispatch 실패**(①의 대표 경로)가 발생 즉시 Sentry에 도달한다. ①의 나머지 터미널 실패(`callback_timeout` 등)는 §5.5의 `functions.ts` 교체와 §5.6의 Inngest 알림이 부분적으로 덮고, 호출부 전면 계측은 §9로 미룬다 — 이유는 §5.3.
- 함수 사망으로 `processing`에 갇힌 행(④)이 **최악 105분 내**(90분 임계값 + 15분 cron 주기)에 탐지되어 Sentry에 도달한다. §5.4의 수치와 일치시킨 값이다 — 임계값 90분만 보고 "90분 내"라고 쓰면 주기가 빠진 과장이 된다.
- 서버 예외(②) 중 **파이프라인 본체(`src/inngest/functions.ts`)** 는 Sentry로 보고된다.
- 알림 목적지가 **Sentry 하나**다. 아침에 확인할 곳이 한 군데다.
- 클라이언트 번들 크기 증가 **0KB** — 헬퍼의 `import "server-only"`로 빌드 타임에 강제한다(§5.1).

### 비목표

- **클라이언트 SDK(③)**: 서버 전용으로 시작한다. `error.tsx` 4개 + `global-error.tsx` + `useUploadPodcast.ts`의 `console.error` 7곳은 이번 범위 밖. 브라우저에서만 터지는 렌더링 에러는 **계속 실명 상태**로 남는다. 의도된 트레이드오프.
- **서버 `console.error` 29곳 전면 교체**: `src/inngest/functions.ts` 2곳만 1단계에 포함. 나머지 27곳은 §9(2단계).
- **로그 드레인 도입**: Pro 전환 후 재검토. §9 참조.
- **`/admin/health` 대시보드**: 알림이 먼저다. 알림을 받고 파고들 도구가 필요해지면 그때. (§3 Option B)
- **스키마 변경·마이그레이션**: 없음.

### 성공 기준

- 관리자 테스트 트리거를 눌러 Sentry 프로젝트에 이벤트가 도착한다(전송 경로 검증).
- 로컬에서 임계값을 낮춰 정체 감지 cron을 돌리면 대상 행이 조회되고 보고 호출이 일어난다.
- Vercel preview 배포에서 발생한 에러가 Sentry에 나타나지 않는다(DSN 미주입 확인).
- `npm run check`(lint + typecheck) 통과.
- **[미검증으로 시작]** 실제 `callback_timeout`이 발생했을 때 알림이 도착한다 — §8.3 참조.

---

## 3. 대안 분석

### Option A: Sentry 단일 목적지 — 엔티티 병목 계측 + 정체 감지 cron — 선택

터미널 실패는 실패를 아는 **호출부**에서 즉시 보고하고(공유 엔티티 함수 내부가 아니다 — §5.3), 어떤 코드도 실행되지 못해 상태조차 못 쓴 정체 행만 cron이 폴링한다. 알림·중복 묶기·해결 표시·이력을 전부 Sentry가 맡는다.

- 장점: 목적지 1개. 새 UI 불필요. ①은 실시간. 스키마 변경 없음.
- 단점: Sentry 무료 티어 이벤트 한도를 소모한다. `captureMessage` 기반이라 ①④에는 스택 추적이 없다(대신 `uploadedFileId`로 DB를 되짚을 수 있음).

### Option B: Sentry(②) + 자체 `/admin/health` 대시보드(①④)

- 장점: 도메인 맥락을 Sentry보다 풍부하게 보여줄 수 있고 Sentry 한도를 안 쓴다.
- 단점 (결정적): **내가 열어봐야 보인다.** 지금 겪는 문제("직접 확인하지 않으면 모른다")를 형태만 바꿔 재생산한다. push가 아니라 pull이라 단독으로는 부적합.

### Option C: Sentry(②) + cron → 이메일/디스코드 웹훅 직접 발송(①④)

- 장점: Sentry 한도와 무관, 채널 자유.
- 단점: 중복 억제·해결 처리·이력 조회를 직접 만들어야 한다. 알림 시스템 자작이고 목적지가 둘로 갈린다.

### 선택: Option A

지금 없는 건 "데이터"가 아니라 **밀어주는 통로**다. push인 A가 문제를 직접 겨냥한다. Sentry를 어차피 ②로 도입하므로 ①④까지 같은 곳으로 보내면 확인할 곳이 하나로 끝난다. B의 대시보드는 A가 알림을 준 **다음에** 파고들 도구라, 알림 없이 먼저 만들면 순서가 거꾸로다.

### 검토 과정에서 폐기된 설계

기록해 둘 가치가 있는 오답들:

- **cron이 최근 실패를 폴링해서 ①을 보고** — 이미 알고 있는 사실을 다시 조회하는 셈. 시간 창 로직(겹치면 중복, 벌어지면 누락), 최대 15분 지연, 불필요한 DB 왕복을 떠안는다. 병목 계측으로 대체.
- **cron이 정체 행을 `stuck_timeout`으로 마킹** — 마킹은 부작용 있는 쓰기 동작이라 오탐 시 **사용자가 성공할 작업을 실패로 보게 된다**. Inngest 큐 지연이나 재시도 대기를 "함수 사망"으로 오판할 수 있고, 그 뒤 함수가 정상 완료하면 `status:"failed"`인데 클립은 생성된 모순 상태가 된다. 크레딧 영향도 미확인이었다. 관측 기능이 사용자 가시 상태를 바꾸는 건 1단계에서 감수할 위험이 아님 → **알림만** 하는 쪽으로 철회.
- **정체 감지 윈도우 `90m ~ 120m`** — cron이 연속 2회 누락되면 그 행은 **영원히 탐지되지 않는다.** 감시 계층에 두면 안 되는 실패 모드 → 상한을 24시간으로 확대(§5.2).
- **소스맵 업로드 유예** — Sentry를 로그 드레인 대신 고른 이유가 "스택 추적과 그룹핑"인데, 소스맵이 없으면 그 우위가 사라져 선택 근거와 모순된다 → 1단계에 포함(§6.3).
- **엔티티 함수 3개 "내부"에 계측** — 이 문서 초안의 핵심 전제였고 클린코드 리뷰에서 뒤집혔다. `status:"failed"`를 *쓰는 함수*가 3개인 것은 맞지만, 그 함수들이 공유 라이터라 **계측 지점은 3개가 아니다**: `markUploadedFileAttemptFailed`만 호출부 16곳(그중 4곳은 reconcile stale 마킹 경로 — §1 참조), `markProcessingDispatchDeadLetter`는 정상 동시성 경로에서도 호출, 진짜 dispatch 실패 1건은 두 함수를 한 트랜잭션에서 모두 호출. 내부 계측은 정상 동작을 알림으로 만들고, 한 사건을 2~3개로 쪼개고, 커밋 전에 전송하고, flush 도입 시 열린 트랜잭션에서 네트워크 I/O를 한다 → **호출부·트랜잭션 밖·사건당 1회**로 전환(§5.3).
- **`reportPipelineFailure(kind, { failureCode?, ...Record })`** — `failureCode`가 optional이면 `pipeline-failure`인데 빠뜨려도 타입이 통과해 fingerprint가 `[kind, undefined]`로 퇴화, 모든 실패 모드가 한 이슈로 합쳐진다. 열린 `Record`는 제3자로 나가는 값을 타입에서 감춘다 → **kind별 판별 유니온**으로 전환(§5.2).
- **`void` 반환 확정** — §10 확인 항목 5(서버리스 flush 필요 여부)가 미해결인 상태에서 `void`로 못 박으면, flush가 필요한 것으로 밝혀졌을 때 전 호출부의 공개 시그니처를 고쳐야 한다 → `flushReports(): Promise<void>`를 API에 추가(§5.2).

---

## 4. 아키텍처

목적지는 Sentry 하나, 들어가는 경로는 둘이다.

```
[경로 1: 예외]
  Inngest 함수 예외 ─┐
  route handler 예외 ─┼─→ reportError() ─→ Sentry.captureException
  (1단계는 functions.ts 2곳 + onRequestError)

[경로 2: 예외 없는 실패]  ※ 엔티티 함수 "내부"가 아니라 호출부에서 발생
  dispatch 실패 catch (processing-dispatch/api:256-278, 트랜잭션 밖) ─┐
                                                                     ├─→ reportPipelineFailure()
  monitorPipelineHealth (cron 15m) ─→ listStuckProcessingUploadedFiles() ─┘        │
                                                                                   ▼
                                                                        Sentry.captureMessage
```

**클라이언트 번들 증가 0KB.** `instrumentation-client.ts`를 만들지 않으므로 브라우저는 Sentry를 모른다. 부수 효과로 `next.config.js`의 CSP `connect-src`도 수정 불필요 — 브라우저가 Sentry로 요청을 보내지 않는다.

다만 **"만들지 않는다"는 것만으로는 보장이 안 된다.** `shared`는 FSD 최하위 계층이라 클라이언트 컴포넌트도 import할 수 있고, 그러면 Sentry 서버 SDK가 조용히 클라이언트 번들로 딸려 들어간다. 0KB는 헬퍼 최상단의 `import "server-only"`가 빌드 타임 에러로 강제한다(§5.1). 기존 엔티티 모듈 두 개(`uploaded-file/api/index.ts:1`, `processing-dispatch/api/index.ts:1`)가 이미 쓰는 패턴이다.

**FSD 방향 준수.** 엔티티가 `shared/observability`를 import하는 것은 하위 계층 참조라 규칙에 맞는다. 단 FSD 방향 준수가 서버/클라이언트 경계를 보장하지는 않는다 — 그건 위의 `server-only`가 한다.

---

## 5. 구현 계획

### 5.1 신규 파일

| 파일 | 역할 |
|---|---|
| `instrumentation.ts` (프로젝트 루트) | `register()`에서 서버 런타임만 Sentry init. `onRequestError` 훅 export |
| `sentry.server.config.ts` | DSN, `environment`, `sendDefaultPii: false`, `beforeSend` 스크러빙, `tracesSampleRate: 0` |
| `src/fsd/shared/observability/report-error.ts` | 헬퍼 구현. **최상단에 `import "server-only";`** |
| `src/fsd/shared/observability/index.ts` | 배럴. `reportError` / `reportPipelineFailure` / `flushReports` export |

`instrumentation-client.ts`는 **만들지 않는다**(서버 전용 결정).

**선행 의존성 (`@sentry/nextjs` 설치).** 위 표의 파일과 `next.config.js`(`withSentryConfig`), `sentry.server.config.ts`(`Sentry.init` / `captureException` / `captureMessage` / `setUser` / `flush`)가 전부 `@sentry/nextjs`를 import한다. 이 패키지는 현재 `package.json`에 **없으므로**, Step 1 최초 작업으로 **`npm install @sentry/nextjs`** 를 실행한다(안 하면 Step 1의 `npm run check`가 모듈 해석 실패로 깨진다). `server-only`는 이미 의존성에 있고(`package.json:53`), `next@15.5.7`은 `instrumentation.ts`/`onRequestError`를 지원한다.

**슬라이스 배치 근거.** 기존 공용 서버 인프라(`s3.ts`, `polar.ts`, `admin-guard.ts`, `result.ts`)는 `shared/api/` 아래에 평평하게 있고, 여러 파일을 갖는 유일한 공용 슬라이스인 `shared/analytics/`만 `index.ts` 배럴로 공개 API를 노출한다. 관측은 (a) 곧 구현 파일이 여러 개로 늘어나고(§9의 클라이언트 SDK, §8.1의 테스트 트리거), (b) `shared/api/`의 "외부 서비스 클라이언트"와 성격이 달라 `analytics`와 같은 급의 슬라이스로 둔다. 소비자는 배럴로만 import하며, 이는 엔티티가 `shared/analytics`를 쓰는 방식과 같다. `shared/analytics/`(제품 신호)와 `shared/observability/`(시스템 고장)의 경계는 §6.4에 적는다.

### 5.2 헬퍼 API 표면

```ts
import "server-only";

// 세 헬퍼 모두 어떤 경우에도 throw하지 않는다. 관측이 서비스를 죽이면 본말전도다.
// 내부를 try/catch로 감싸고 실패 시 console.error만 남긴다.

// (1) 예외 보고. console.error를 유지한 채 Sentry 전송을 추가한다.
export function reportError(
  error: unknown,
  context: { origin: string } & ReportContext,
): void;

// (2) 예외가 아닌 파이프라인 실패 보고. level: "error".
export type PipelineFailureReport =
  | { kind: "pipeline-failure";     failureCode: string; uploadedFileId: string; attempt: number }
  | { kind: "dispatch-failure";     failureCode: string; uploadedFileId: string; attempt: number }
  | { kind: "dispatch-dead-letter"; dispatchId: string;  lastError: string }
  | { kind: "stuck-processing";     uploadedFileId: string; processingStartedAt: Date; elapsedMinutes: number };

export function reportPipelineFailure(report: PipelineFailureReport): void;

// (3) 서버리스에서 전송 보장이 필요한 호출부가 반환 전에 await 한다.
//     내부에 타임아웃을 두어(예: Sentry.flush(timeout)) Sentry가 응답하지 않아도
//     bounded 시간 내에 끝낸다 — 위 never-throw 계약과 호환되도록 reject가 아니라 resolve로 종료한다.
export function flushReports(): Promise<void>;
```

**fingerprint는 호출부가 아니라 헬퍼가 만든다.** 규칙은 `[kind]`이고, `failureCode`가 있는 kind에 한해 뒤에 붙여 `[kind, failureCode]`가 된다. §5.3·§5.4 표의 fingerprint 열은 **호출부가 넘기는 값이 아니라 헬퍼가 도출한 결과를 기록한 것**이다. 호출부가 리터럴을 직접 쓰면 `kind`와 fingerprint가 갈라져(`"dispatch-failure"` vs `"dispatch_failed"`) 그룹핑이 조용히 깨진다 — §5.3이 막으려는 바로 그 결과다.

**판별 유니온을 쓰는 이유.** `failureCode`를 그냥 `failureCode?: string`으로 두면 `pipeline-failure`인데 `failureCode` 없이 호출하는 게 타입상 허용되고, fingerprint가 `["pipeline-failure", undefined]`로 퇴화해 **모든 실패 모드가 한 이슈로 합쳐진다.** 반대로 `stuck-processing`에는 `failureCode`가 원래 없다. 하나의 optional 필드로는 두 경우를 동시에 옳게 표현할 수 없으므로 kind별로 필요한 키를 타입에 박는다. 내부 fingerprint 조립은 `assertNever`로 exhaustiveness를 강제해 kind가 추가될 때 컴파일 에러가 나게 한다.

**컨텍스트를 `Record<string, unknown>`으로 열어두지 않는다.** 열린 인덱스 시그니처는 excess property check를 무력화해 키 오타(`uploadedFileld`)가 조용히 통과하고, 무엇보다 **무엇이 제3자에게 전송되는지가 타입에서 보이지 않는다.** §6.1과 §10 리스크 4가 정확히 이 문제를 다룬다. 자유 문자열이 들어가는 채널은 `lastError`(`toErrorMessage` → `error.message`, `processing-dispatch/api/index.ts:34`)와 `dispatch-failure`의 오류 메시지 둘뿐이며, `beforeSend` 스크러빙(§6.1)은 이 둘을 겨냥한다.

**`flushReports`가 필요한 이유.** Sentry 전송은 비동기 큐잉이라 `void` 호출만으로는 서버리스 함수가 얼어붙기 전에 전송이 끝난다는 보장이 없다. `monitorPipelineHealth` cron, §8.1 테스트 트리거, 그리고 dispatch 실패 catch(§5.3, 업로드 서버 액션 경로) — 이 세 곳이 반환 직전에 `await flushReports()` 한다. 실제로 flush가 필요한지는 §10 확인 항목 5로 남아 있지만, **필요 없는 것으로 밝혀져도 이 시그니처는 안전하다**(no-op). 반대로 `void`로 못 박아두면 나중에 모든 호출부의 공개 시그니처를 바꿔야 한다. `route.ts:9`의 `maxDuration = 10` 예산 안에서 끝나야 하므로 **이벤트마다 flush하지 말고 cron 종료 직전에 한 번만** 호출한다. **그리고 `flushReports`는 반드시 내부 타임아웃을 갖는다** — Sentry가 응답하지 않아도 cron이 `maxDuration = 10`을 넘기거나 dispatch 실패 catch가 사용자 응답을 무한정 붙잡지 않게 하기 위함이며, 타임아웃은 reject가 아니라 resolve로 끝나 위의 never-throw 계약을 그대로 지킨다(§5.3·§10 리스크 5).

**명명 주의.** `shared/api/result.ts`의 `failure()` / `ActionResult`는 실패를 **반환**하는 규약이지만, 여기 `reportPipelineFailure`는 `void`이고 throw하지 않는다. 이름의 "failure"가 겹치지만 Result API가 아니다. 두 헬퍼가 grouping 축을 각각 `context.origin`과 `report.kind`로 갖는 것은 대상이 다르기 때문이며(임의 예외 vs 정해진 실패 모드 집합), 이 차이는 의도된 것이다.

### 5.3 계측 배치 (①)

**엔티티 함수 안에 넣지 않는다.** §1에서 확인했듯 세 함수는 공유 라이터라 내부 계측은 16개 호출부·정상 동시성 경로·트랜잭션 내부로 번진다. 대신 **실제 실패를 아는 호출부**에 둔다.

| 계측 위치 | 발생 조건 | 헬퍼 인자 | 헬퍼가 도출할 fingerprint |
|---|---|---|---|
| dispatch 실패 catch (`processing-dispatch/api/index.ts:256-278`), **`db.$transaction` 종료 후** | 진짜 dispatch 예외 | `{ kind:"dispatch-failure", failureCode:"dispatch_failed", uploadedFileId, attempt }` | `["dispatch-failure","dispatch_failed"]` |
| `monitorPipelineHealth` cron (§5.4) | 정체 행 발견 | `{ kind:"stuck-processing", uploadedFileId, processingStartedAt, elapsedMinutes }` | `["stuck-processing"]` |

**사건당 정확히 한 이벤트.** 진짜 dispatch 실패 하나는 `db.$transaction`(`:259-271`) 안에서 `markProcessingDispatchDeadLetter`와 `markUploadedFileAttemptFailed("dispatch_failed")`를 **모두** 호출한다. 두 함수에 각각 계측하면 한 사건이 두세 개 이벤트로 쪼개진다. 그래서 dead-letter는 별도 보고하지 않고 dispatch 실패 catch에서 한 번만 보고한다.

**트랜잭션 밖에서 보고한다.** 트랜잭션 안에서 보고하면 (a) 롤백 시 DB 변경은 취소됐는데 Sentry 이벤트는 이미 나간 유령 알림이 되고, (b) `flushReports`를 쓰는 경우 열린 Prisma 트랜잭션을 붙잡은 채 네트워크 I/O를 하게 된다(Neon 연결 점유).

**이 호출부도 `await flushReports()` 한다.** dispatch 실패 catch는 업로드 서버 액션 경로에서 실행되므로, cron과 마찬가지로 서버리스 인스턴스가 응답 후 얼어붙어 이벤트를 잃을 수 있다. 그런데 이건 §2 목표 1번의 **주 경로**라 유실되면 설계 목적 자체가 무너진다. §10 확인 항목 5(flush 실제 필요 여부)가 미해결이지만, `flushReports`는 불필요로 판명되면 no-op이라 **넣어서 손해가 없고 빠뜨리면 손해가 크다.** 트랜잭션 종료 후·응답 반환 직전에 호출한다.

> **감수하는 대가**: `await`이므로 사용자 응답이 flush만큼 지연된다. 이 경로는 이미 실패를 반환하는 중이라(사용자는 어차피 에러를 본다) 수백 ms 지연은 받아들인다고 판단했다. 단 `flushReports`는 **반드시 타임아웃을 갖는다** — Sentry가 응답하지 않을 때 사용자 요청이 무한정 붙잡히면 관측이 서비스를 해치는 것(§10 리스크 5)이 된다. cron 쪽은 `route.ts:9`의 `maxDuration = 10` 예산도 함께 고려한다.

**`dispatch-dead-letter`를 함수 내부에 계측하지 않는 결정적 이유.** `markProcessingDispatchDeadLetter`는 고장이 아닌 **정상 동시성 결과**로도 호출된다 — `deadLetterClaimedNonSentDispatch`가 `stale_attempt`(`:159`), `not_found`(`:174`), `already_advanced:*`(`:179`)로 dead-letter 처리한다. 이건 정상적인 선점/추월이며, 계측하면 진짜 장애와 구분되지 않는 알림이 쏟아져 "아침에 한 군데만 보면 된다"는 §2 목표가 무너진다. `PipelineFailureReport`에 `dispatch-dead-letter` kind를 남겨둔 것은 나중에 **진짜 실패 경로에서만** 쓰기 위한 자리이며, 1단계에서는 호출하지 않는다.

**터미널 실패 전반(`callback_timeout` 등)은 어디서 보고하나?** 1단계에서는 **보고하지 않는다.** 이들은 `markUploadedFileAttemptFailed`의 16개 호출부에 흩어져 있어, 전부 계측하려면 §9(2단계)의 `console.error` 교체 작업과 같은 규모가 된다. `src/inngest/functions.ts` 안의 실패 경로는 §5.5의 `reportError` 교체와 §5.6의 Inngest 실패 알림이 상당 부분 덮는다. 남은 공백(예: `analysis_source_failed`를 조용히 반환하는 경로)은 §9에서 호출부별로 판단한다.

> **함정 (호출부 계측에서도 유효)**
> `markUploadedFileAttemptFailed`는 `updateMany`이고 `where`에 `currentAttempt`와 `status in [...]` 가드가 걸려 있어 **0건 업데이트로 끝날 수 있다**(다른 경로가 이미 상태를 바꾼 경우, `uploaded-file/api/index.ts:843`). 호출부에서 보고할 때도 **반환된 `count`를 확인하고 `count > 0`일 때만** 보고할 것. 그러지 않으면 아무 일도 안 일어난 호출까지 알림이 된다.

**fingerprint 축이 `failureCode`인 이유는 그대로다.** 터미널 status는 `"failed"` 하나뿐이고 사유가 `failureCode`에 들어가므로, 이걸로 묶으면 Sentry 이슈가 실패 모드별로 하나씩 생긴다 — `callback_timeout` 이슈, `analysis_timeout` 이슈. "이번 주 `callback_timeout` 40건" 같은 패턴이 바로 보인다. `uploadedFileId`로 묶으면 이슈가 무한히 늘어나 쓸모없어진다. 개별 식별자는 컨텍스트로 싣는다.

### 5.4 정체 감지 cron (④)

`cleanupAnalyticsEvents`와 동일한 패턴으로 `monitorPipelineHealth`를 추가하고 `src/app/api/inngest/route.ts`의 functions 배열에 등록한다.

**임계값 90분의 근거** — 코드에 박힌 상한에서 나온다:

| 경로 | 계산 | 상한 |
|---|---|---|
| render (`processVideo`) | `MODAL_RESULT_MAX_POLLS(60) × MODAL_RESULT_POLL_INTERVAL(1m)` + `MODAL_METADATA_GRACE_INTERVAL(2m)` | ≈ 62분 |
| analyze (`analyzeVideo`) | `ANALYSIS_RESULT_TIMEOUT` | 60분 |

함수가 살아 있으면 늦어도 약 62분에 스스로 종료하고 상태를 쓴다. 따라서 90분 넘게 `processing`이면 **함수 자체가 죽은 것**이다. 62분에 28분 여유를 뒀다. 이보다 짧으면 정상 장기 실행을 오탐한다.

#### 기존 `PROCESSING_STALE_POLICY`와의 관계 (반드시 함께 볼 것)

"정상적인 처리 시간이 얼마인가"를 인코딩한 값이 **이미 코드에 있다**: `PROCESSING_STALE_POLICY.processingTimeoutMs = 120분`(`src/fsd/entities/uploaded-file/model/stale-policy.ts:4`). `getStaleFailureCode`(`uploaded-file/api/index.ts:151-158`)가 이를 읽어 `worker_timeout`을 판정하고, `reconcileStaleUploadedFilesForUser`(`:1034`)가 대시보드 진입과 upload 피처에서 호출되어 실제로 행을 `failed`로 마킹한다.

즉 두 임계값은 역할이 다르다:

| | 값 | 역할 | 주체 | 트리거 |
|---|---|---|---|---|
| `stuckAlertMs` (신규) | 90분 | **알림** (DB 쓰기 없음) | cron | 15분마다 자동 |
| `processingTimeoutMs` (기존) | 120분 | **마킹** (`failed`/`worker_timeout` 쓰기) | reconcile | 해당 사용자가 대시보드에 들어올 때만 |

알림이 마킹보다 30분 먼저 오는 건 의도한 것이다 — 사용자가 돌아오지 않아도 내가 먼저 안다. **다만 두 값이 서로 모르는 채 흩어져 있으면 안 된다.** Modal 상수가 바뀌면 90분 근거가 무너지는데 아무것도 그 사실을 알려주지 않는다.

그래서 **`stale-policy.ts`에 `stuckAlertMs`를 추가해 두 값을 한 파일에서 읽게 한다.** 90분/24시간을 cron 호출부에 생짜 숫자로 두지 않고, Modal 상수에서 유도했다는 동기화 주석을 `shared/config/constants.ts:34-36`의 `CLIP_DURATION_LIMITS` 스타일로 붙인다. 테스트용 인자 오버라이드(§8.2)는 유지하되 **기본값은 이 상수에서 온다**.

**중복 보고 방지**: 정체 행 하나가 90분에 `stuck-processing`으로 알림된 뒤, 120분에 reconcile이 `worker_timeout`으로 마킹한다. §5.3에서 `markUploadedFileAttemptFailed` 호출부를 1단계 보고 대상에서 제외했으므로 두 번째 이벤트는 발생하지 않는다. §9에서 그 호출부들을 계측할 때 **reconcile 루프 경로(`worker_timeout`, `dispatch_timeout`, `queued_worker_not_started`)는 반드시 제외**해야 이 중복이 되살아나지 않는다.

#### 쿼리 (윈도우 방식, DB 쓰기 없음)

```
status = "processing"
  AND processingStartedAt <  now - stuckAlertMs      (기본 90m)
  AND processingStartedAt >= now - stuckAlertMaxAge  (기본 24h)
```

기존 `@@index([status, processingStartedAt])`에 그대로 적중한다. 주기는 15분이므로 최악 인지 지연은 105분.

**쿼리는 cron이 아니라 엔티티가 소유한다.** `src/inngest/functions.ts`는 `db`를 직접 만지지 않는다 — `~/server/db` import가 없고 모든 `uploadedFile` 접근이 엔티티 함수를 거친다. 이 쿼리만 예외로 cron 안에 인라인하면 select 형태와 인덱스 의존성이 형제 쿼리들과 갈라지고 §4의 "FSD 방향 준수" 주장과도 어긋난다. 따라서 `uploaded-file/api/index.ts`에 `listStuckProcessingUploadedFiles({ minAgeMs, maxAgeMs, limit })`를 추가하고 cron은 그것을 호출만 한다 — `cleanupExpiredAnalyticsEvents`를 `cleanupAnalyticsEvents` cron이 호출하는 것과 같은 구조다.

상한 24시간의 의미: 정체 행은 아무도 안 고치면 매 주기 재조회된다. Sentry는 기본적으로 **새 이슈가 생길 때** 알림을 보내고 같은 이슈의 반복 이벤트마다 메일을 쏘지 않으므로(→ §10 확인 항목), 재알림의 실제 대가는 받은편지함 스팸이 아니라 **이벤트 쿼터**뿐이다. 24시간이면 약 96회 후 자연 종료되고, 24시간을 무시했다면 더 알려도 소용없다. 좁은 윈도우(예: 30분)는 cron 2회 누락 시 영구 미탐지를 만들기 때문에 쓰지 않는다.

cron은 발견한 행마다 `reportPipelineFailure({ kind:"stuck-processing", uploadedFileId, processingStartedAt, elapsedMinutes })`를 호출한다. fingerprint `["stuck-processing"]`은 헬퍼가 도출한다(§5.2). 루프가 끝난 뒤 **반환 직전에 `await flushReports()`를 한 번** 호출한다 — 이벤트마다 flush하면 `route.ts:9`의 `maxDuration = 10` 예산을 넘길 수 있다.

**임계값은 명명된 상수를 기본값으로 쓰되 인자로 오버라이드 가능하게 한다.** 상수는 `stale-policy.ts`에 두어 기존 `processingTimeoutMs`와 한 파일에서 읽히게 하고(위 참조), 인자 오버라이드는 로컬에서 낮춰 테스트하기 위함이다(§8.2). 생짜 `90`/`24`를 cron 호출부에 박으면 62분 유도 근거가 코드에서 사라진다.

### 5.5 `functions.ts`의 `console.error` 2곳

cron 추가로 어차피 이 파일을 열고, 파이프라인 본체라 값이 높다. `reportError`로 교체한다(`functions.ts:305`, `:737`). 나머지 27곳은 2단계.

### 5.6 Inngest 자체 실패 알림 활성화 (코드 0줄)

`analyzeVideo`는 실패를 마킹한 뒤 **`throw error`로 다시 던진다**(`src/inngest/functions.ts:976`). 즉 이 경로는 **Inngest가 이미 실패한 run으로 인식하고 있다.** Inngest 대시보드의 실패 알림을 켜면 함수 예외·재시도 소진·플랫폼 타임아웃이 코드 변경 없이 커버된다.

cron이 맡는 영역은 그만큼 좁아진다: run은 성공으로 끝났는데 행이 `processing`에 남은 논리 공백, 그리고 Inngest가 함수를 아예 호출하지 못한 경우. **설정 작업이라 가장 먼저 한다.**

### 5.7 수정 대상 요약

| 파일 | 변경 |
|---|---|
| `next.config.js` | `withSentryConfig`로 래핑 (소스맵 업로드 포함) |
| `src/env.js` | `SENTRY_DSN`/`SENTRY_AUTH_TOKEN`을 **`z.string().optional()`** 로 server 스키마에 추가하고 **`runtimeEnv`에도 등록** — 아래 경고 참조 |
| `src/fsd/entities/uploaded-file/model/stale-policy.ts` | `stuckAlertMs`(90m), `stuckAlertMaxAgeMs`(24h) 추가 + Modal 상수 유도 동기화 주석 |
| `src/fsd/entities/uploaded-file/api/index.ts` | `listStuckProcessingUploadedFiles({ minAgeMs, maxAgeMs, limit })` 신규 쿼리 추가. **`markUploadedFileAttemptFailed`는 수정하지 않는다**(§5.3) |
| `src/fsd/entities/processing-dispatch/api/index.ts` | dispatch 실패 catch(`:256-278`)에서 **트랜잭션 종료 후** 1회 보고하고 **반환 직전에 `await flushReports()`**(§5.3, 타임아웃 有). 엔티티 함수 본문은 수정하지 않는다 |
| `src/inngest/functions.ts` | `monitorPipelineHealth` cron 추가(엔티티 쿼리 호출 + 종료 전 `flushReports`), `console.error` 2곳 교체 |
| `src/app/api/inngest/route.ts` | `monitorPipelineHealth` 등록 |
| `src/app/privacy/page.tsx` | 처리 업체 목록에 Sentry 추가 (§6.1) |
| 관리자 테스트 트리거 | 서버 액션은 `shared/observability`를 import하는 작은 슬라이스에 두고, `/admin` 라우트는 버튼만 렌더 — 기존 `admin/analytics` → `pages/admin-analytics` 위임 구조를 따른다. **인가는 서버 액션 본문 최상단의 `requireAdmin()`(`shared/api/admin-guard`) 호출로 목적지에서 강제한다** — Server Action은 렌더 레이아웃과 무관한 독립 POST 엔드포인트라 `admin/layout.tsx`의 GET 렌더 가드로는 막히지 않는다 (§8.1) |

> **경고: env를 필수로 선언하면 preview·로컬 빌드가 깨진다**
> `src/env.js`는 `createEnv`를 즉시 실행하고 `next.config.js:5`가 이를 import하므로 **모든 `next build`가 env를 검증**한다. §6.2대로 DSN을 production 스코프에만 주입하면, `DATABASE_URL: z.string()`(`env.js:14`) 같은 주변 필수 변수 스타일을 따라 선언할 경우 preview·로컬 빌드가 ZodError로 실패한다 — §2의 성공 기준("preview에서 Sentry에 나타나지 않는다")과 정면 충돌이다.
> `AUTH_SECRET`의 `NODE_ENV === "production" ? … : …optional()` 패턴(`env.js:10-13`)을 **템플릿으로 삼으면 안 된다.** Vercel preview 빌드도 `NODE_ENV=production`이라 preview에서 여전히 필수가 된다.
> 반드시 **평범한 `.optional()`** 을 쓸 것. DSN이 `undefined`면 `Sentry.init`이 no-op이 되며, 그게 정확히 원하는 "preview = 전송 없음" 동작이다. 그리고 `createEnv`는 `server`에 선언한 키가 `runtimeEnv`(`env.js:62-89`의 수동 매핑)에도 있어야 하므로 **두 곳 모두** 등록해야 한다 — 빠뜨리면 `npm run check`의 `tsc --noEmit`에서 잡힌다. DSN은 raw `process.env`가 아니라 검증된 `env` 객체로 읽는다.

---

## 6. 데이터·환경·빌드 정책

### 6.1 Sentry로 보내는 데이터 범위

에러 보고는 제3자에게 데이터를 넘기는 행위다. `src/app/privacy/page.tsx`는 이미 Google·Polar·AWS·Vercel·Neon을 처리 업체로 나열하고 있으므로, Sentry를 붙이면 그 목록에 빠진 항목이 생긴다.

- `sendDefaultPii: false` — SDK가 자동으로 붙이는 IP·쿠키 등을 차단.
- 사용자 식별은 **`Sentry.setUser({ id })`만**. 이메일·이름은 보내지 않는다. `userId`만 있으면 DB에서 되짚을 수 있어 디버깅에 부족하지 않다.
- **`beforeSend` 스크러빙을 처음부터 넣는다.** `sendDefaultPii: false`는 **자동 수집만** 막고, 우리가 명시적으로 실어 보내는 문자열은 그대로 나간다. 현재 위험은 낮다 — `toErrorMessage`(`processing-dispatch/api/index.ts:34`)가 `error.message`만 뽑고, Node fetch 실패는 보통 URL을 `cause`에 넣지 `message`에 안 넣는다. 그러나 Modal 응답 본문이나 S3 presigned URL이 에러 메시지에 섞이는 경로가 **나중에 하나만 생겨도** 그대로 전송되고, 이건 **사후 추가로는 이미 늦는** 종류의 실수다. 스크럽 대상: presigned URL 서명 파라미터(`X-Amz-Signature`, `X-Amz-Credential`), `PROCESS_VIDEO_ENDPOINT` 호스트.
- **자유 문자열이 들어오는 채널은 정확히 둘뿐이다** — `dispatch-dead-letter`의 `lastError`와 `dispatch-failure`의 오류 메시지(둘 다 `toErrorMessage` 산출물). §5.2가 컨텍스트를 `Record<string, unknown>` 대신 kind별 판별 유니온으로 못 박은 이유가 이것이다: **무엇이 제3자에게 나가는지가 타입에서 보여야** `beforeSend`가 무엇을 겨냥해야 하는지도 명확해진다. 열린 인덱스 시그니처였다면 새 호출부가 임의 문자열을 얹어도 아무도 몰랐을 것이다.
- `src/app/privacy/page.tsx`의 처리 업체 목록에 Sentry를 **1단계 작업으로 추가**한다. 이미 있는 목록에 항목 하나를 더하는 것뿐이다.

### 6.2 환경 분리

`environment: process.env.VERCEL_ENV ?? "development"`로 production / preview / development를 구분한다. `VERCEL_ENV`는 Vercel 밖(로컬)에서 `undefined`이므로 **폴백을 코드에 명시**해야 한다 — 산문으로만 "로컬은 development"라고 적고 식에서 빠뜨리면 구현자가 그대로 옮겨 적는다.

다만 **필터링은 알림 규칙이 아니라 DSN 주입 단계에서 끝낸다** — Vercel 환경변수 `SENTRY_DSN`을 **production 스코프에만** 설정한다. preview 배포는 DSN이 없어 아무것도 보내지 않는다. 규칙을 관리할 필요가 없고, preview 에러가 무료 티어 쿼터를 태우지도 않는다.

### 6.3 소스맵 업로드 — 1단계에 포함

Sentry를 로그 드레인 대신 고른 근거가 "스택 추적과 그룹핑"이다. 소스맵이 없으면 스택 프레임이 `.next/server/chunks/xxxx.js:1:23456`으로 찍혀 **그 우위가 사라지고 선택 근거와 모순된다.**

비용도 작다: `withSentryConfig`는 어차피 추가하고, 실제로 필요한 건 `SENTRY_AUTH_TOKEN` 환경변수 하나다.

### 6.4 노이즈 정책

- **`no credits` 제외** — 시스템 고장이 아니라 정상 비즈니스 상태다. 넣으면 알림이 금방 무의미해진다. (반복 발생은 전환 신호이므로 기존 `AnalyticsEvent` 쪽 관심사다.)
- **`retryable_failed` 제외** — 재시도로 회복되는 중간 상태. `dead_letter` 도달 시에만 보고.
- **정상 동시성 dead-letter 제외** — `stale_attempt`, `not_found`, `already_advanced:*`(`processing-dispatch/api/index.ts:159/:174/:179`). 선점·추월은 설계된 동작이지 고장이 아니다. 1단계는 `dispatch-dead-letter` kind를 아예 호출하지 않는 것으로 이를 달성한다(§5.3).
- **reconcile 루프 코드 제외** — `worker_timeout`, `dispatch_timeout`, `queued_worker_not_started`. `reconcileStaleUploadedFilesForUser`가 파일별 루프로 마킹하는 값들이라 한 번의 대시보드 진입으로 다수 이벤트가 발생할 수 있고, `stuck-processing` cron 알림과 같은 사건을 중복 보고한다. §9에서 호출부를 계측할 때도 이 셋은 제외 대상이다.
- **preview / development 제외** — §6.2.
- `tracesSampleRate: 0` — 1단계는 에러만. 성능 추적은 쿼터만 태운다.

**`shared/analytics` vs `shared/observability` 경계.** 전자는 **제품 신호**(사용자가 무엇을 했나, 어디서 이탈했나)로 `AnalyticsEvent` 테이블에 쌓이고 `/admin/analytics`에서 본다. 후자는 **시스템 고장**(무엇이 깨졌나)으로 Sentry에 간다. `no credits`처럼 둘 다로 읽힐 수 있는 사건은 **전자**에 속한다 — 고장이 아니기 때문이다. 새 신호를 어디에 넣을지 헷갈리면 "이걸 보고 코드를 고칠 것인가"로 판단한다.

---

## 7. 실행 순서

아래 Step 0~3은 모두 **1단계 안의 작업 순서**다. §9의 "2단계"와 혼동하지 말 것.

### Step 0: 설정 (코드 변경 없음)

- Sentry 프로젝트 생성, DSN 발급, **production 스코프에만** Vercel 환경변수 주입.
- `SENTRY_AUTH_TOKEN` 발급 및 주입.
- **Inngest 대시보드 실패 알림 활성화** (§5.6) — 코드 없이 즉시 값이 나오므로 가장 먼저.
- 검증: Inngest에서 의도적으로 실패한 run이 알림을 만드는지 확인.

### Step 1: Sentry 서버 init + 헬퍼

- 작업: **`npm install @sentry/nextjs`(선행 필수 — 이하 파일들이 전부 이 패키지를 import한다)**, `instrumentation.ts`, `sentry.server.config.ts`, `report-error.ts`, `next.config.js`, `src/env.js`, `privacy/page.tsx`.
- 검증: `npm run check`. 관리자 테스트 트리거로 이벤트 도달 확인(§8.1). 테스트 액션이 비관리자 호출을 거부하는지도 함께 확인.

### Step 2: dispatch 실패 호출부 계측 (①)

- 작업: `processing-dispatch/api/index.ts:256-278`의 catch에서 **트랜잭션 종료 후 1회** 보고하고 **반환 직전에 `await flushReports()`**(§5.3). 엔티티 함수 본문(`markUploadedFileAttemptFailed`, `markProcessingDispatchDeadLetter`)은 **건드리지 않는다** — 이유는 §5.3.
- 검증: `npm run check`. 로컬에서 dispatch 실패를 강제해 이벤트가 **정확히 하나** 나가는지, `await flushReports()`가 반환 전에 끝나는지, 정상 동시성(`stale_attempt` 등)에서는 **아무것도 안 나가는지** 확인.

### Step 3: 정체 감지 cron (④) + `functions.ts` 2곳

- 작업: `stale-policy.ts`에 `stuckAlertMs`/`stuckAlertMaxAgeMs` 추가, `uploaded-file/api`에 `listStuckProcessingUploadedFiles` 추가, `monitorPipelineHealth` cron(엔티티 쿼리 호출 + 종료 전 `flushReports`), route 등록, `console.error` 2곳 교체.
- 검증: 로컬에서 임계값을 1분으로 낮춰 cron 수동 트리거(§8.2).

---

## 8. 검증 전략

**전제**: `npm run check`(lint + typecheck)가 유일한 품질 게이트다(CLAUDE.md). `npm test` 스크립트가 없어 자동화 테스트가 게이트에 묶여 있지 않다 — 다만 `shared/analytics/lib`에 node:test 기반 `*.test.mjs`(예: `metadata.test.mjs`, `normalize-path.test.mjs`)가 게이트 밖 관례로 존재한다. 새 단위 테스트를 성공 기준으로 명시하지 않는다.

그리고 정직하게 말해 **`callback_timeout`을 프로덕션에서 의도적으로 재현할 방법이 마땅치 않다** — Modal이 콜백을 안 보내게 만들어야 한다. 세 겹으로 푼다.

### 8.1 관리자 전용 테스트 트리거 (전송 경로 검증)

`/admin`에 "Sentry 도달 테스트" 버튼을 하나 둔다. 배포 직후 눌러 **DSN·네트워크·`beforeSend`·flush·환경 태그가 전부 통하는지** 확인한다. 실제 실패를 기다리지 않고 전송 경로 자체를 검증하는 것이 목적이라 가장 확실하며, 상시 유지해도 부담이 없다.

**배치는 기존 admin 관례를 따른다.** `src/app/admin/analytics/page.tsx`는 얇은 라우트이고 UI는 `~/fsd/pages/admin-analytics/ui`에 위임하며, **라우트 렌더** 인가는 `src/app/admin/layout.tsx`의 `requireAdmin`이 처리한다. 테스트 트리거도 같은 모양으로 두되 — **서버 액션은 `shared/observability`를 import하는 작은 슬라이스에** 두고 `/admin` 라우트는 버튼만 렌더한다. **단, 서버 액션의 인가는 레이아웃이 아니라 액션 본문 최상단의 `requireAdmin()`(`shared/api/admin-guard`) 호출로 목적지에서 강제한다** — Next.js Server Action은 버튼을 렌더한 레이아웃과 무관하게 직접 POST로 호출되는 독립 엔드포인트라 `admin/layout.tsx`의 GET 렌더 가드로는 보호되지 않는다. 미인가 호출 시 Sentry 테스트 이벤트가 쿼터를 태울 수 있으므로 목적지 인가는 필수이며, 검증에 비관리자 호출 거부를 포함한다. 액션이 §5.2 헬퍼 API를 직접 호출하므로 헬퍼 시그니처가 바뀌면 그 검증 코드가 함께 눈에 들어와야 한다.

### 8.2 임계값 오버라이드 (cron 로직 검증)

정체 감지의 기본값은 `stale-policy.ts`의 명명된 상수에서 오지만(§5.4), 쿼리와 cron은 **인자로 오버라이드**를 받는다. 로컬 `npm run inngest-dev`에서 1분으로 낮춰 실제로 돌려 쿼리가 대상 행을 잡는지, 보고가 호출되는지, `flushReports`가 반환 전에 끝나는지 확인한다.

### 8.3 미검증 정직 표기

위 둘로도 **"실제 `callback_timeout` 발생 시 알림이 온다"까지는 증명되지 않는다.** 첫 실제 실패가 날 때까지 이 항목은 **미검증**이다.

- [ ] 첫 실제 파이프라인 실패 알림 수신 확인 — 날짜: ____
- [ ] 첫 실제 정체 감지 알림 수신 확인 — 날짜: ____

이 두 칸이 채워지기 전까지 "에러 인지 체계가 동작한다"고 말하지 않는다.

---

## 9. 2단계 (유예)

**내용**: 서버 `console.error` 나머지 27곳을 `reportError`로 교체. 아울러 1단계에서 보류한 **터미널 실패 호출부 계측**(§5.3)도 여기서 다룬다.

> **2단계에서 반드시 지킬 제외 규칙**
> `markUploadedFileAttemptFailed`의 16개 호출부를 계측할 때 **reconcile stale 마킹 경로는 제외**한다 — `worker_timeout`, `dispatch_timeout`, `queued_worker_not_started`를 쓰는 `uploaded-file/api/index.ts:1002`(`reconcileStaleUploadedFileForUser`, 단일 파일)와 `:1074, :1102, :1127`(`reconcileStaleUploadedFilesForUser`, 파일별 루프). 이들(특히 루프 함수)은 한 번의 대시보드 진입으로 다수 이벤트를 만들고, `stuck-processing` cron 알림과 같은 사건을 중복 보고한다(§6.4, §10 리스크 1). 제외 기준은 함수 이름이 아니라 위 세 `failureCode`다. 마찬가지로 정상 동시성 dead-letter(`stale_attempt`, `not_found`, `already_advanced:*`)도 제외한다.

| 파일 | 건수 | 우선순위 |
|---|---|---|
| `src/app/api/webhooks/polar/route.ts` | 9 | 높음 (결제) |
| `src/fsd/features/upload/api/index.ts` | 8 | 높음 (파이프라인·크레딧) |
| `src/fsd/features/clip-review/api/index.ts` | 3 | 보통 |
| `src/fsd/entities/uploaded-file/api/index.ts` | 3 | 보통 |
| `src/fsd/features/clip/api/index.ts` | 2 | 보통 |
| `src/app/api/webhooks/modal/route.ts` | 1 | 보통 |
| `src/app/api/analytics/events/route.ts` | 1 | 낮음 |

**유예 사유** (넷):

1. **Pro 전환이 2단계의 답을 바꾼다.** Pro가 되면 Vercel Log Drain(Axiom, Better Stack 등)이 열려서, `console.error`가 이미 stderr로 나가므로 **코드 변경 없이** 수집·검색·알림을 걸 수 있다. 지금 27곳을 고치면 그중 상당수는 안 해도 됐을 수고가 된다. (되돌려야 하는 건 아니다 — `reportError`는 `console.error`를 유지하므로 드레인과 공존한다.)
2. **회귀 위험의 성격이 다르다.** 1단계는 파일 추가와 세 줄 삽입이라 검증이 단순하다. 2단계는 기존 catch 블록 27개를 건드리므로 각 자리의 반환값이 여전히 올바른지 확인해야 한다. 두 위험을 한 커밋에 섞으면 분리가 안 된다.
3. **1단계가 2단계의 판단 근거를 만든다.** 파이프라인 알림을 실제로 받아보면 "이것만으로 원인을 알 수 있나, 서버 액션 로그가 더 필요한가"를 추측이 아니라 경험으로 판단하게 된다. 지금 27곳을 고르는 건 짐작이다.
4. **Sentry 무료 티어 소진 속도를 모른다.** 특히 Polar 웹훅 9곳은 재시도가 몰리면 이벤트가 빠르게 쌓일 수 있다. 1단계 한 달 볼륨을 본 뒤 범위를 정한다.

**2단계 시점의 권고 (잠정)**: Pro 전환 후에도 **결제·파이프라인 경로 17곳**(polar 9 + upload 8)은 Sentry로 직접 보내는 편이 낫다 — 묶어서 추적해야 하고 컨텍스트가 중요하다. 나머지 10곳은 로그 드레인으로 충분하다.

**③(클라이언트) 재검토**: 서버 전용으로 시작한 결정은 1단계 운영 경험 후 다시 본다. 클라이언트 SDK는 번들 30-40KB와 쿼터 소모를 마케팅 페이지 SEO까지 포함해 감수하는 결정이므로, 실제로 클라이언트 에러 CS가 들어오는지 확인한 뒤 판단한다.

---

## 10. 리스크 + 롤백 전략

### 확인 항목 (구현 전 콘솔에서 검증할 것)

책상에서는 답이 안 나오는 것들이다. 이 문서의 일부 논리가 여기에 기대고 있다.

| # | 확인할 것 | 틀렸을 때의 영향 |
|---|---|---|
| 1 | Sentry 기본 알림 규칙이 "새 이슈 발생 시"인가 (반복 이벤트마다 메일이 오지 않는가) | 24시간 윈도우가 받은편지함을 스팸함. 윈도우를 좁히거나 알림 규칙을 조정해야 함 |
| 2 | Inngest 현재 플랜에서 실패 알림을 제공하는가 | §5.6이 무효가 되고 cron의 비중이 커짐 |
| 3 | Vercel Log Drain의 Pro 게이팅 | §9의 유예 사유 1이 약해짐 |
| 4 | Sentry 무료 티어 실제 한도와 현재 트래픽 볼륨 | 쿼터 조기 소진. 샘플링이나 범위 축소 필요 |
| 5 | Inngest cron / 서버리스 환경에서 명시적 `Sentry.flush()`가 필요한가 | **설계는 이미 대비됨** — §5.2가 `flushReports()`를 API에 포함하고 cron·서버 액션(dispatch 실패 catch)이 반환 전 `await`한다. 불필요로 판명되면 no-op으로 두면 되고, 필요로 판명돼도 시그니처 변경이 없다 |
| 6 | Inngest 재시도 시 step 메모이즈로 90분 상한이 유지되는가 | 오탐 발생. 임계값 상향 (그래서 인자화함 — §8.2) |

### 리스크

1. **알림 폭풍** (가능성 저, 영향 중): 두 가지 원천이 있다. (a) Modal이 통째로 다운되면 실패가 대량 발생한다. (b) **`reconcileStaleUploadedFilesForUser`의 파일별 루프** — 대시보드 진입 한 번으로 여러 행을 연달아 마킹할 수 있다. 1단계는 (b)의 코드(`worker_timeout` 등)를 보고 대상에서 제외해 원천을 (a)로 한정했다(§6.4). §9에서 호출부를 확대할 때 이 제외를 유지하지 않으면 (b)가 되살아난다. fingerprint가 `failureCode` 기준이라 이슈는 하나로 묶이지만 이벤트 수는 쌓이므로, Sentry spike protection에 기대되 무료 티어 월 한도를 태울 수 있다.
2. **유령 알림** (가능성 중, 영향 저): 두 경로가 있다. (a) `markUploadedFileAttemptFailed`의 `updateMany` count를 확인하지 않으면 실제로 아무 일도 안 일어난 호출까지 보고된다(§5.3 함정). (b) 트랜잭션 **안에서** 보고하면 이후 롤백 시 DB 변경은 취소됐는데 이벤트는 이미 나간다. 보고를 트랜잭션 밖으로 뺀 이유다(§5.3).
3. **정체 오탐** (가능성 저, 영향 저): Inngest 큐 지연이나 재시도 대기를 함수 사망으로 오판할 수 있다. **알림만 하고 DB를 쓰지 않으므로 사용자에게는 아무 영향이 없다** — 마킹 설계를 철회한 이유가 정확히 이것이다. 오탐이 잦으면 임계값을 올린다.
4. **민감값 유출** (가능성 저, 영향 고): 에러 메시지에 presigned URL이나 내부 엔드포인트가 섞여 제3자로 전송될 수 있다. §6.1의 `beforeSend` 스크러빙으로 처음부터 방어한다. **사후 대응이 불가능한 유일한 리스크**라 가능성이 낮아도 선제 조치한다.
5. **관측이 서비스를 죽임** (가능성 저, 영향 고): 보고 경로의 예외가 비즈니스 로직으로 전파되면 안 된다. `reportError`/`reportPipelineFailure`/`flushReports` **셋 다 어떤 경우에도 throw하지 않는다** — 내부를 try/catch로 감싸고 실패 시 `console.error`만 남긴다. `flushReports`는 `Promise<void>`지만 reject하지 않는다. **또한 `flushReports`는 내부 타임아웃으로 대기를 제한한다** — dispatch 실패 catch가 `await flushReports()`를 하는 업로드 서버 액션 경로(§5.3)에서 Sentry가 응답하지 않아도 사용자 요청이 무한정 붙잡히지 않게 하기 위함이며, 타임아웃은 reject가 아니라 resolve로 끝나 위의 never-throw 계약을 유지한다.
6. **이벤트 유실** (가능성 중, 영향 중): Sentry 전송은 비동기 큐잉이라 서버리스 함수가 먼저 얼어붙으면 이벤트가 사라진다. §5.2의 `flushReports()`를 cron·서버 액션이 반환 직전에 `await`해 방어한다. 실제 필요 여부는 확인 항목 5이지만, **필요 없는 것으로 밝혀져도 시그니처는 안전**(no-op)하고 반대로 `void`로 못 박으면 나중에 전 호출부를 고쳐야 한다.

### 롤백 전략

전부 additive이며 스키마 변경이 없다.

- **즉시 무력화**: Vercel에서 `SENTRY_DSN` 환경변수를 제거하면 SDK가 아무것도 보내지 않는다. 재배포도 불필요한 경우가 많다. `console.error`는 그대로 남으므로 기존 동작이 보존된다.
- **부분 롤백**: cron만 문제면 `src/app/api/inngest/route.ts`의 functions 배열에서 `monitorPipelineHealth`를 빼면 된다.
- **DB 정리 불필요**: 어떤 경로도 DB에 쓰지 않는다(마킹 설계를 철회했으므로).

---

## 11. Reconciliation Notes (2026-07-28, round 1)

코드베이스 대조로 확인/수정한 사항. 구현 시 이 절을 함께 볼 것.

**해소한 blocker 2건:**

1. **관리자 테스트 트리거 인가** — 초안은 인가를 `admin/layout.tsx`의 `requireAdmin`에 맡겼으나, Next.js Server Action은 렌더 레이아웃과 무관하게 직접 POST로 호출되는 독립 엔드포인트다. 액션 본문 최상단에서 `requireAdmin()`(`shared/api/admin-guard`, 이미 존재·`server-only`)을 직접 호출하도록 §5.7·§8.1 수정. 검증에 비관리자 호출 거부 포함.
2. **`@sentry/nextjs` 미설치** — 설계가 의존하는 SDK가 `package.json`에 없다(`server-only`는 있음, `next@15.5.7`은 `instrumentation.ts`/`onRequestError` 지원). Step 1 선행 작업으로 설치를 §5.1·§7에 명시.

**정정한 코드 사실:**

- `markUploadedFileAttemptFailed` 호출부 16곳 전수 확인(정의 `:826`). reconcile 마킹 경로 4곳 중 `:1002`는 `reconcileStaleUploadedFileForUser`(단일, `:948`), `:1074/:1102/:1127`은 `reconcileStaleUploadedFilesForUser`(루프, `:1034`) — §1·§9의 함수 표기 정정(제외 기준은 이름이 아니라 `failureCode`).
- 게이트 밖 `*.test.mjs`(node:test) 관례 존재 — §8·§10 전제 정정.

**대조로 확인된 앵커(변경 없음):** dispatch 실패 catch `:256-278` / `db.$transaction :259-271`; 정상 동시성 dead-letter `:159/:174/:179`; `PROCESSING_STALE_POLICY.processingTimeoutMs=120m`(`stale-policy.ts:4`); Modal 상수 `MODAL_RESULT_MAX_POLLS=60`·`MODAL_RESULT_POLL_INTERVAL=1m`·`MODAL_METADATA_GRACE_INTERVAL=2m`·`ANALYSIS_RESULT_TIMEOUT=60m`; `cleanupAnalyticsEvents` cron `0 3 * * *`(`functions.ts:981`); 서버 `console.error` 29곳(functions.ts 2곳 `:305,:737` + §9의 27곳) / 클라이언트 7곳; `@@index([status, processingStartedAt])`(`schema.prisma:95`); `route.ts:9 maxDuration=10`; `env.js`의 `createEnv` 즉시 실행 + `runtimeEnv` 수동 매핑(`:62-89`), `next.config.js:5`가 import; `privacy/page.tsx` 처리 업체 표에 Sentry 부재(추가 대상 확인).

**남은 비차단 메모:** 일부 라인 참조에 ±1 드리프트(`markProcessingDispatchDeadLetter`는 실제 `:118`부터, 문서는 `:117`) — 심볼명이 병기돼 탐색에 지장 없음. `processVideo`도 `:680`에서 재-throw하므로 §5.6의 Inngest 실패 인지는 `analyzeVideo`(`:976`)뿐 아니라 이 경로도 포함한다.

**Round 2 재대조 (2026-07-28):** round 1 클린 이후 오케스트레이터가 추가한 편집 3건을 코드베이스·문서 내부와 재대조했다.

1. §2 "최악 105분 내(90분 임계값 + 15분 cron 주기)"는 §5.4(정체 감지 쿼리, "최악 인지 지연은 105분")·§5.4 임계값 표와 일치. 모순 없음.
2. dispatch 실패 catch의 `await flushReports()`(§5.3 추가분)를 flush 호출부 목록(§5.2), 수정 대상 표(§5.7), 실행 순서 Step 2·검증(§7), 확인 항목 5(§10)에 **전파**해 세 섹션의 flush 호출부 집합을 §5.3과 일치시켰다.
3. `flushReports` 타임아웃 요구(§5.3 추가분)는 §5.2 **never-throw 계약과 충돌하지 않는다** — 타임아웃은 reject가 아니라 resolve로 종료(§5.2 시그니처 주석·§10 리스크 5에 명시). `route.ts:9 maxDuration=10`은 cron 경로(`src/app/api/inngest/route.ts`)에만 적용되고 dispatch catch에는 적용되지 않으므로 상보적이며 충돌 없음 — dispatch catch는 `dispatchProcessingRequestByIdOrFail`(`processing-dispatch/api:141`) → `scheduleProcessingAttempt`(`upload/api:73`, `"use server"`) → 서버 액션(`:377/:464/:592`) 경로에서만 실행되어(Inngest 함수는 이 경로를 import하지 않음) "사용자 응답 지연" 서술이 정확.

**대조로 재확인한 앵커(변경 없음):** `markUploadedFileAttemptFailed` 정의 `:826`·호출부 16곳; dispatch catch `:256-278`·`db.$transaction :259-271`; `markProcessingDispatchDeadLetter :118`·정상 동시성 `:159/:174/:179`; `PROCESSING_STALE_POLICY.processingTimeoutMs=120m`(`stale-policy.ts:4`); Modal 상수 `:23-25`·`ANALYSIS_RESULT_TIMEOUT :685`; `cleanupAnalyticsEvents :981`(`0 3 * * *`); `@@index([status, processingStartedAt]) :95`; `env.js` `createEnv`·`runtimeEnv :62-89`; `route.ts:9 maxDuration=10`; `@sentry/nextjs` 미설치; `*.test.mjs` 3개(`analytics-event/model/reporting.test.mjs`, `shared/analytics/lib/metadata.test.mjs`, `normalize-path.test.mjs`).

---

<!-- doc-validation-skip -->
## Open Questions

- **[알림 채널]** Sentry 이슈 알림을 이메일로 받을지, Slack/Discord 연동을 걸지. 1인 운영이라 이메일로 충분할 가능성이 높지만 실제 반응 속도를 보고 결정.
- **[④ 후속 조치]** 정체 행을 알림만 받고 **수동으로** 처리할지, 운영 경험이 쌓인 뒤 자동 복구(재큐잉 등)를 넣을지. 자동 마킹은 §3에서 철회했으나, "자동 재시도"는 성격이 다른 별개 논의다.
- **[검증 커버리지]** 게이트에 묶인 테스트가 없다(node:test `*.test.mjs` 관례만 게이트 밖에 존재, §8). `reportPipelineFailure`의 fingerprint 조립과 정체 감지 쿼리의 경계 조건(90분/24시간)은 순수 로직에 가까워, 도입한다면 기존 `*.test.mjs` 관례를 따르는 우선 대상.
- **[2단계 분기]** Pro 전환 후 로그 드레인을 실제로 도입할지, 아니면 27곳을 전부 Sentry로 보낼지 — §10 확인 항목 3·4의 결과에 달렸다.

<!-- doc-validation-restore -->
