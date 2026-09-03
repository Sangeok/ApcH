# release-checks — 배포 확인 원장

테스트가 원리상 못 덮어(Node 러너 — DOM·시각·실제 외부 I/O 없음) **배포된 실물에서만 닫히는
확인 항목**의 상태 원장이다. 완료 항목마다 계획서·구현 보고가 「못 덮는 범위」를 선언하는데,
이 원장이 생기기 전에는 그 선언이 문서 열여섯 곳에 흩어진 채 마감 기록 없이 쌓였다
(2026-08-24 FEAT-19 관측). 여기가 그 선언의 단일 수집처다.

## 규칙

- **등재**: 메인 루프가 완료 인수(런북 7단계) 시 그 항목의 「못 덮는 범위」를 여기에 옮긴다.
  원천은 구현 보고(`docs/agents/<행위자>/<항목ID>.md`)이고, 없으면 보드 `결과`·계획서다.
  구현 시점에 이미 닫히는 선언(예: BUG-06의 카피↔로직 사람 대조)은 등재하지 않는다.
- **마감**: 체크는 증거로만 한다 — 세 종류뿐이다.
  - `확인(날짜, 근거)` — 사용자가 배포 화면에서 실물을 관측했거나, 실측 기록(Playwright 스윕 포함)이 있다. `확인(날짜, 자동 — 근거)`는 release-verify 루틴(FEAT-26)이 프로덕션 응답으로 닫은 것이다.
  - `대체(항목ID)` — 후속 항목이 그 화면을 교체하거나 같은 확인을 재선언해 옛 줄이 무의미해졌다.
  - `이관(항목ID)` — 확인에서 결함이 나와 `TASK_BACKLOG.md` 항목이 됐다.
- **이 문서는 상태 문서다** — `PROJECT_BOARD.md`처럼 갱신하며 `docs/agents/`의 append-only
  규약을 따르지 않는다. 확인 활동의 상세는 `docs/agents/main-loop/`에 쓴다.
- 절은 항목별·최신순(보드 섹션 순서). 전부 닫힌 절도 지우지 않는다 — 닫혔다는 사실이 기록이다.
- **자동 판정 태그**: 응답 상태·본문 문구·CSS 방출만으로 판정되는 열린 줄에는 등재 시 메인 루프가 줄 끝에 `〔auto GET <경로> [status=] [text=""]… [notext=""]… [css="a,b"] [when=""]… [when-any="a|b"] [when-board="<regex>"]〕`를 붙인다(문법·판정은 `scripts/release-verify/ledger.mjs`). 루틴은 `pass`면 태그를 지우고 `[x]` + `확인(…, 자동 — …)`로 닫고, `fail`이면 줄 아래에 `  - 자동 불합격(날짜): 사유`만 남기며(이관은 사람), `when*` 전제가 안 맞으면 건드리지 않는다.
- 스윕 이력: 2026-08-24 1차(Playwright, admin 프로덕션) · 2차(시각 판정 — 스크린샷 판독 + FEAT-07 승인 시안 대조) · 3차(PR #101 합류 직후 재스윕 — FEAT-17·18 마감, 실보드 파생 상태 라이브 관측). 상세는 `docs/agents/main-loop/FEAT-19.md`.

---

## 클린코드 개선 (5렌즈 검토, 정규 77건) — web, 구현 2026-09-03

원천: `apps/web/docs/proposals/completed/2026-09-03-frontend-clean-code-improvements.md` §Verification Plan 수동 표.
보드 항목이 아니라 사용자 직접 지시로 돈 작업이라 항목ID가 없다. 커밋 `9dd6dfb`~`a3461aa`(159파일). **배포 대기** — `dev`에 커밋, `main` 합류 전.
자동 검사 게이트(typecheck·lint·70/70 테스트·build·라우트 static/dynamic 대조)는 Phase마다 통과했다. 아래는 그 넷이 원리상 못 덮는 것뿐이다 — 외부 SaaS 테넌트, 브라우저 렌더·타이밍, 실제 워커 실행.
**`〔auto〕` 태그를 붙이지 않는다**: release-verify 루틴의 base는 `admin.a-pch.com`이고(`scripts/release-verify/run.mjs:11`) 아래는 전부 web(`a-pch.com`) 경로다. 루틴이 web을 대상으로 확장되면 공개 라우트 줄부터 태그를 붙일 수 있다.

동작이 바뀐 것 — 실물에서만 닫힌다:

- [ ] **C-02 Polar 테넌트(가장 위험)**: 프로덕션 `/dashboard/billing` → "Manage Subscription"이 **프로덕션** Polar 포털을 연다(sandbox 아님). 이전에는 `getPolarClient`가 `env.POLAR_SERVER`를 보고 포털 라우트는 `"sandbox"`를 하드코딩해 둘이 갈렸다. 반대로 지금까지 sandbox가 의도였다면 이 줄이 아니라 `POLAR_SERVER` 값을 재검토해야 한다
- [ ] **C-49 포털 미로그인·미고객 경로**: 로그아웃 상태로 `/api/portal` → `/login` 리다이렉트, 로그인했지만 Polar 고객이 아닌 계정 → `/dashboard/billing` 리다이렉트. 이전에는 빈 문자열 고객 id를 Polar에 넘겼다
- [ ] **C-29 존재하지 않는 업로드**: `/dashboard/uploads/<없는 id>`가 404(not-found) 화면이다. 이전에는 `findFirstOrThrow`가 던져 에러 경계로 떨어졌다
- [ ] **C-30 웹훅 입력 방어**: Modal 웹훅에 깨진 JSON을 POST하면 500이 아니라 400
- [ ] **C-63 빈 제목 클립**: DB에서 `youtubeTitle`을 `""`로 비운 클립에서 "YouTube Metadata" 메뉴가 **활성**이다(설명·해시태그가 있으면). `??`를 `||`로 고친 결과
- [ ] **C-17 마지막 클립 삭제**: 마지막 클립을 지운 직후 "No clips found"가 즉시 보인다(낙관적 목록 기준 판정)
- [ ] **C-66 자동재생 재개 없음**: 업로드 하나가 `processing`인 상태에서 목록 카드를 펼쳐 재생 → 일시정지 후 15초(7.5초 큐 폴 두 번) 관찰. 재생이 다시 시작되지 않는다
- [ ] **C-10 presign 실패 표시**: 업로드 상세의 Original media와 검토 화면 플레이어에서 presign이 실패하면 "Video unavailable"·"Preview unavailable" 문구가 보인다. 이전에는 빈 검은 상자가 영원히 남았다
- [ ] **C-71 파괴적 액션 확인창**: 업로드 삭제와 구독 해지가 브라우저 `confirm()` 대신 앱 AlertDialog를 띄우고, 취소하면 아무 일도 없다

무회귀 — 형태만 바꿨으나 실물에서만 보이는 것:

- [ ] **C-72/C-73 법률 페이지와 헤더**: `/privacy`·`/terms`가 마케팅 헤더·푸터와 함께 렌더되고 URL은 그대로다. 로그인 상태로 `/`와 `/features`·`/pricing`을 오갈 때 헤더가 **같은** 인증 상태(아바타)를 보인다 — 이전에는 `/`만 아바타였다
- [ ] **C-73 분석 라벨 합류**: 합쳐진 "Log in" 버튼의 `cta_clicked` 이벤트가 `location: "public_header"`로 기록된다. 홈의 옛 `"site_header"` 시계열은 여기로 합류한다 — 분석 소유자가 다른 값을 원하면 `widgets/site-header/ui/public-header.tsx` 한 단어를 바꾼다
- [ ] **C-33/C-34 실패 라벨**: 실패한 업로드 상세의 타임라인에 실패 사유 문구가 그대로 뜬다(어휘를 카탈로그로 옮기면서 생산자 없는 case 둘을 지웠다 — 그 둘은 원래 표시된 적이 없다)
- [ ] **C-36/C-37 마케팅 라우트**: `/about`·`/contact`·`/security`·`/how-it-works`·`/changelog` 다섯이 분할 전과 같은 화면을 낸다. 푸터·헤더 nav의 링크가 전부 살아 있다
- [ ] **C-74 에러 경계**: 라우트 오류를 유도하면 다섯 경계가 이전과 같은 콘솔 문구(`<라벨> error boundary caught:`)를 남긴다
- [ ] **C-75/C-76/C-56/C-46 워커 경로(자동 테스트 없음)**: 업로드 1건을 실제로 처리해 `processVideo` 완료 → 크레딧 차감 → 클립 표시까지 확인한다. 이어서 stale reconcile을 수동으로 유도(타임아웃)해 상태가 `failed`로 전이하고 `worker_timeout`이면 취소 이벤트가 나가는지 본다. 서버 모듈이 엔티티에서 feature로 옮겨간 것이 이 경로 전체의 유일한 검증이다
- [ ] **C-09 두 ingest 경로**: 위 실행에서 웹훅 직접 쓰기와 Inngest 폴링 응답이 **같은** 정규화를 거친다 — 클립 카드의 13개 필드(제목·대본·해시태그·근거·자막 상태)가 두 경로 어느 쪽으로 들어와도 동일하게 채워진다


## FEAT-29 — 정체 감시를 cron에서 건별 이벤트 감시자로 전환 (web, 구현 2026-09-02)

원천: `docs/agents/web-dev/FEAT-29.md` 「테스트로 못 덮은 범위」 + 계획서 「테스트」. **배포 대기** — `dev`에 커밋, `main` 합류 전.
이 항목은 Inngest 오케스트레이션(이벤트 발송·`step.sleep` 재개·`cancelOn`·concurrency)이 본체인데 현재 러너(`tsx --test`, Inngest·DB 하니스 없음)로는 그 전부를 못 덮는다 — 아래는 배포 후 Inngest 대시보드와 Neon 콘솔에서만 닫힌다.
남는 정기 깨움: `cleanupAnalyticsEvents`(일 1회 03:00)는 유지 대상이라 정상이다.

- [ ] **배포 전 전제 — 전환 구간 공백**: 배포 순간 이미 `processing`인 attempt는 `processing/attempt.claimed`를 받은 적이 없어 감시자가 없고, 그것을 잡던 cron은 사라진다. **처리 중 업로드가 없을 때 배포**한다. 있는 채로 배포했다면 그 건은 정체돼도 알림이 없다는 것을 알고 넘어간다(사용자 가시 영향 없음 — 조회 시점 `reconcileStaleUploadedFileForUser`가 여전히 강제 실패시킨다)
- [ ] **이벤트 발송**: 업로드 1건을 처리시키면 Inngest 대시보드에 `processing/attempt.claimed`가 claim 직후 1회 발송되고(analyze·render 각 1회), `watch-processing-attempt` 런이 그 이벤트로 시작된다
- [ ] **sleep → check 흐름**: 그 감시자 런이 `wait-for-stuck-threshold`에서 90분 잔 뒤 `check-attempt-still-processing`을 1회 실행하고, 정상 종료된 업로드였다면 `{ alerted: false }`로 끝난다(알림 없음)
- [ ] **슬롯 비점유(중요)**: 자는 감시자가 있는 동안 같은 유저의 다음 업로드가 **즉시** 처리 시작된다. 감시자에 concurrency를 두지 않은 이유가 이것이며, 막히면 유저당 1건 직렬화가 최대 90분 잠긴다 — 회귀 시 영향이 가장 큰 줄이다
- [ ] **취소 매칭**: 정체된 업로드를 화면에서 열어 `reconcileStaleUploadedFileForUser`가 강제 실패시키면, 그 attempt의 자는 감시자가 `process-video-events/cancel`(같은 `matchKey`)로 취소된다
- [ ] **정체 알림 실물**: 실제로 90분을 넘겨 `processing`에 머문 건이 생기면 Sentry에 `stuck-processing: <N>m` 이슈가 **1회** 뜬다(옛 cron은 15분마다 최대 96회 재보고했다)
- [ ] **이 항목의 목적 — Neon 유휴 깨움 소멸**: 배포 며칠 뒤 Neon 콘솔 Billing → Usage에서 compute 시간이 눈에 띄게 떨어진다. 배포 전 하루 ≈96회 깨움(15분 cron × autosuspend 5분)이 유휴 0회가 되어야 한다. 떨어지지 않으면 다른 깨움원(로컬 개발이 프로덕션 엔드포인트 공유 등)이 남은 것이므로 백로그 항목을 만든다

## FEAT-28 — 실패 콜백의 부분 클립 메타데이터 소비 (web, 구현 2026-09-02)

원천: `docs/agents/web-dev/FEAT-28.md` 「테스트로 못 덮은 범위」. **배포 대기** — `dev`에 커밋, `main` 합류 전.
BUG-08(backend 절반, 2026-08-29 배포)의 두 번째 절반이라, 이 절이 닫혀야 그 항목의 사용자 가시 효과가 처음 확인된다.
`applyModalPayload`는 `processVideo` 안의 클로저라 현재 러너(`tsx --test`)로 종단 구동이 불가능하다 — 아래는 전부 실제 부분-실패 실행에서만 닫힌다.

- [ ] **핵심 — 부분 성공 클립의 메타데이터 표시**: 클립 루프 중간 실패를 유도한 실제 실행에서, 이미 S3에 오른 앞쪽 클립의 카드에 제목·대본·근거(clipType 라벨·hook·payoff)와 자막 폴백 안내가 뜬다. 수정 전에는 같은 상황에서 이 값들이 전부 빈 맨행이었다
- [ ] **실패 판정 유지**: 위와 같은 실행에서 업로드 자체는 여전히 실패/부분으로 남는다 — `failureCode`가 `PARTIAL_CLIPS_AFTER_BACKEND_ERROR`이고 성공으로 뒤집히지 않는다(수정이 `backendFailureMessage`를 건드리지 않았다는 것의 실물 확인)
- [ ] **크레딧 차감 불변**: 같은 실행에서 차감량이 전달된 클립 수(`clipsFound`)와 일치하고, 메타데이터가 붙었다고 달라지지 않는다
- [ ] **성공 경로 무회귀**: 정상 실행의 클립 메타데이터 반영·폴링 조기 탈출(settle/detected)이 이전과 동일
- [ ] **웹훅 무회귀**(BUG-08에서 이관): 실패 페이로드로 웹훅이 200을 돌려주고 `normalizeBody`를 통과한다. 단 inngest 결과는 이제 **맨행이 아니라 메타데이터 행**이며, 경로 A `updateMany` 0건은 그대로 정상이다(행 생성 시점에 메타데이터가 담기므로)

## BUG-08 — 에러 콜백에 부분 clip_results 싣기 (backend, 구현 2026-08-29)

원천: `docs/agents/backend-dev/BUG-08.md` 「못 덮은 범위」. **배포 완료(2026-08-29 11:25 KST, BUG-04와 묶어 `modal deploy` — 사용자 승인 하에 메인 루프 실행).** 주의: 이 항목만으로는 사용자 가시 변화가 없다 — web inngest가 `status: error` 페이로드의 `clips`를 소비하는 후속(백로그 후보)이 있어야 메타데이터가 행에 실린다. 아래 줄은 그 전제 절반만 확인한다.

- [ ] `modal deploy` — 이미지 번들에 `error_callback` 포함 — **번들은 배포 출력으로 실측**(2026-08-29 11:25 KST: mount에 `PythonPackage:error_callback`), 컨테이너 import는 다음 실사용 실행에서
- [ ] 에러 콜백 본문 — 클립 루프 중간 실패를 유도한 `modal run`에서 웹훅이 받은 `status: error` 페이로드의 `clips`에 그때까지 완성된 클립(성공 콜백과 같은 원소 모양, `index`·`s3Key` 포함)이 실려 옴(웹훅 로그 또는 `modal/video.processed` 이벤트 payload). 루프 진입 전 실패는 `clips: []`(기존과 동일)
- [x] 웹 무회귀 — 그 페이로드로 웹훅이 200을 돌려주고(`normalizeBody` 통과), inngest는 기존대로 실패 처리(행은 맨행) — 경로 A `updateMany`는 행 부재로 0건이 정상 — 대체(FEAT-28). "행은 맨행"은 FEAT-28 구현(2026-09-02)으로 더 이상 참이 아니다 — 이 줄을 그대로 두면 확인자가 회귀(메타데이터 유실)를 정상으로 판정한다. 200·`normalizeBody` 통과 확인은 FEAT-28 절의 「웹훅 무회귀」 줄이 이어받는다
- [ ] 성공 경로 불변 — 정상 실행의 성공 콜백·클립 메타데이터 반영이 이전과 동일

## BUG-04 — 임시 디렉토리 정리 정책(KEEP_TEMP_ON_FAILURE opt-in) (backend, 구현 2026-08-29)

원천: `docs/agents/backend-dev/BUG-04.md` 「못 덮은 범위」. **배포 완료(2026-08-29 11:25 KST, BUG-08과 묶어 `modal deploy` — 사용자 승인 하에 메인 루프 실행, `App deployed in 6.437s`).** 잔여는 다음 실사용 실행에서 닫는다.

- [ ] `modal deploy` — 이미지 번들에 `temp_cleanup_policy` 포함 — **번들은 배포 출력으로 실측**(2026-08-29 11:25 KST: `Created mount PythonPackage:s3_upload_policy, PythonPackage:translation_fallback, PythonPackage:temp_cleanup_policy, PythonPackage:error_callback`), 컨테이너 import는 다음 실사용 실행에서(첫 실행 로그에 `ModuleNotFoundError` 없음)
- [ ] 기본값 동작 불변 — 프로덕션 실행(성공·실패)에서 기존 `Cleaning up temp dir after …` 로그만 나오고 `Preserving temp dir` 로그는 없음
- [ ] 로컬 `modal run` + `KEEP_TEMP_ON_FAILURE=1` — 실패 유도 시 `Preserving temp dir for debugging after failure: …` 로그와 `/tmp/<run_id>` 잔존, 성공 시에는 정리
- [ ] `succeeded` 제어흐름 — 예외 경로에서 False 유지(실패 실행에서 보존 스위치가 켜졌을 때만 보존되는 것으로 간접 확인)

## FEAT-26 — release-verify 루틴(원장 자동 마감) (main-loop, 구현 2026-08-29)

원천: `docs/agents/main-loop/FEAT-26.md` 「구현 인수」·계획서 「못 덮는 범위」. **배포 완료(2026-08-29 11:23 KST, PR #108 머지 — 루틴은 `dev`를 pull하므로 저장소 쪽은 그 전부터 유효).**
선행(사용자, claude.ai 환경 `Default`): 환경변수 `VERIFIER_SECRET`(Vercel admin과 같은 값) + 허용 도메인 `admin.a-pch.com`·`raw.githubusercontent.com` — **아직 미설정**. 실행 이력: 즉시 실행(00:35 KST, `cse_012JpnKvc33bPw1T9PWDHfn4`)·첫 예약 실행(09:02 KST, `cse_01Cnivmce2ajszFwQcjNK7ev`) 둘 다 비밀값 부재로 SKILL 2단계에서 무변경 종료 + 푸시 알림 — 설계된 실패 모드가 cron에서도 재현됨(스케줄 발화·저장소 pull·스킬 준수 확인).

- [ ] 클라우드에서 끝까지 실행 — 비밀값·도메인 허용 뒤 `action: run` 또는 09:00 KST 예약 실행이 SKILL 3~7단계를 통과(로그인 ok, `docs/release-checks.md`만 커밋·푸시, 종료 보고에 pass/fail/skip 줄 단위)
- [ ] 첫 자동 마감 — 원장의 `〔auto …〕` 줄이 루틴 커밋으로 `[x] … 확인(날짜, 자동 — 근거)`가 됨(전제 조건이 맞는 시점: 검토대기·검증 줄이 있는 보드 등)
- [ ] 메인 루프 편집과의 커밋 왕복 — 같은 날 사람이 원장을 고친 뒤 루틴 푸시가 `pull --rebase` 재시도로 붙는지
- [ ] PR 머지 트리거 — API `create_webhook_trigger` 필터 스키마 불일치(`filter.action`·`filter.base_branch` 거부)로 미배선. 웹 UI에서 배선하거나 cron만 유지(사용자 결정)
- [ ] 네트워크 허용 — 첫 실행이 2단계에서 멈춰 `admin.a-pch.com`·raw 접근은 미검증(호스트 차단이면 `login.step = csrf`로 종료코드 2)

## FEAT-25 — admin 검증기 인증 경로(읽기 전용 verifier 세션) (admin, 구현 2026-08-28)

원천: `docs/agents/admin-dev/FEAT-25.md` 「테스트로 못 덮은 범위」. **배포 완료(2026-08-28 12:07 KST, PR #107 머지).**
선행: Vercel admin 프로젝트 env에 `VERIFIER_SECRET`(긴 난수) 주입 — 미주입이면 provider가 등록되지 않아 아래
첫 줄이 "callback 실패"로 보이는 것이 정상이다(기능 휴면). 아래 줄들은 FEAT-26 루틴이 처음 성공적으로 돌면
`대체(FEAT-26)`로 닫힌다.

- [x] 실제 핸드셰이크 — `GET /api/auth/csrf`(`__Host-authjs.csrf-token` 쿠키) → `POST /api/auth/callback/verifier`(urlencoded `csrfToken`+`secret`) → **302 + `__Secure-authjs.session-token` 설정**. 오답이면 302 `/login?error=CredentialsSignin&code=credentials` + 세션 쿠키 없음 — 확인(2026-08-28 12:28 KST, curl 실측: csrf 쿠키 2개 발급 → 정답 POST 302 `/` + `__Secure-authjs.session-token`; 오답 302 `/login?error=CredentialsSignin&code=credentials` 세션 쿠키 없음; CSRF 누락 302 `/login?error=MissingCSRF`; `/api/auth/session` = `{id: verifier, role: verifier, email: null, verifierIssuedAt: number}`. `VERIFIER_SECRET` 주입 전엔 `providers`가 `google`뿐·callback `error=Configuration`이었고 Redeploy 뒤 `verifier` 등록)
- [x] verifier 세션으로 protected 페이지 GET(`/pipeline`·`/analytics`·`/observability`·`/pipeline/docs/…`·`/pipeline/agents/…`)이 렌더되고(Edge가 실제 verifier JWT를 통과), 헤더에 「검증기 (읽기 전용)」 폴백, `/login`은 `/analytics`로 리다이렉트 — 확인(2026-08-28 12:28 KST, curl 실측: 다섯 경로 전부 200·본문에 「검증기 (읽기 전용)」·이메일 없음; `/login` 302 `Location: /analytics`; 무세션 `/pipeline` 307 `/login?callbackUrl=…`)
- [x] 쓰기 거부 — verifier 세션으로 쓰기 액션이 404(`notFound`)로 막힘 — 확인(2026-08-28 12:32 KST, Playwright 실측: verifier 세션 쿠키로 `/observability` 렌더(헤더 「검증기 (읽기 전용)」) 후 「Send test event」 클릭 → 서버 액션 POST **HTTP 404** `text/x-component`, 화면 "404: This page could not be found." 나머지 3곳(명령 POST·게이트 승인·반려)은 같은 `requireAdmin({ write: true })` 호출이며 단위 테스트가 덮는다 — 게이트 버튼은 결재함이 비어 실물 클릭 대상이 없었음)
- [ ] Google admin 회귀 없음 — 관리자 계정으로 도장·실행 버튼이 그대로 동작 (사용자의 다음 실제 도장·실행 때 확인)
- [x] 1h 만료 — 발급 1h 뒤 같은 세션 쿠키로 protected 페이지 → 404, 재로그인으로 복구 — 확인(2026-08-29 00:47 KST, curl 실측: 23:40 KST 발급 세션(JWT 8h 유효, `/api/auth/session`에 verifier 신원 그대로)으로 67분 뒤 `/pipeline`·`/analytics`·`/observability` 전부 **404**(guard의 1h 가드), 재로그인 302 → `/pipeline` 200. 참고: 12:29 KST 세션은 8h JWT 만료 뒤 확인해 `session null`·307이었음 — 가드가 아니라 쿠키 만료라 관측 창을 다시 잡았다)

## FEAT-23 — 항목 카드 파이프라인 여정 스테퍼 (admin, 구현 2026-08-27)

원천: `docs/agents/admin-dev/FEAT-23.md` 「못 덮는 범위」. **배포 완료(2026-08-27 14:23 KST, PR #106 머지).**
주의: 스테퍼는 **결재함 카드에만** 뜬다 — 미결 0건이면 결재함이 비어 관측 자체가 불가하다. 다음 pm
선정이나 게이트 항목이 생길 때 확인한다.

- [ ] 노드 색/형태 — done 흑연 채움 · **현재·사용자 게이트 = 호박 빈 링**(`border-2 border-stamp`) · **현재·팀 = 남색 채움**(`bg-active`) · upcoming 옅은 빈 링. 현재 노드 크기 강조(size-2.5 vs 1.5)와 연결선 색
- [ ] 단계 라벨 반응형 — 데스크톱(sm↑) 7 라벨 노출, 폰에서 숨김(`hidden sm:block`)이되 노드 레일은 유지
- [ ] 캡션 항상 표시 — "지금 <현재> · [대기 낱말] · 다음 <다음>", 호박/남색 색 일치, `flex-wrap` 폰 줄바꿈 〔auto GET /pipeline text="지금 " text="· 다음 " css="flex-wrap" when-any="선정 중|당신 차례|작업 중|검증 중|인수 중"〕
- [ ] `InboxCard` 통합 — 발화↔레일↔게이트 순서, `GateCardLock` 밖 배치, `ValidationMark` 칩과 시각 일관(검증 줄 있으면 칩=통과·레일=게이트②)
- [x] 신규 Tailwind 유틸 조합 방출 — `bg-silence`·`bg-active`·`border-stamp`·`border-active/50`·`border-stamp/50`가 실빌드에서 나오는지 — 확인(2026-08-29 13:41 KST, 자동 — GET /pipeline 200 · css 5/5)

## FEAT-24 — 원격 실행 진행 로그·버튼 잠금 (admin, 구현 2026-08-27)

원천: `docs/agents/admin-dev/FEAT-24.md` 「못 덮는 범위」. **배포 완료(2026-08-27 14:23 KST, PR #106 머지).**
**선행 의존 — 해소됨**: claude.ai 루틴 지침을 새 문안으로 교체 완료(2026-08-27 05:04Z, 메인 루프가
`RemoteTrigger update`로 실행). 다음 원격 실행부터 `[claude][진행]` 코멘트가 쌓이므로 아래 running
줄들이 관측 가능해졌다 — **실행 버튼을 한 번 누르면 대부분 함께 닫힌다.**

- [ ] `running` pill 실표시 — 파랑 점 + `animate-pulse` + "진행 중 · N분째"(N=0이면 "진행 중"). `motion-reduce` 정지
- [ ] 실행 로그(`ProgressLog`) 실화면 — 단계 줄이 pill 아래로 누적, 마지막 단계만 `text-foreground` 대비, `items-end` 우측 정렬, `<ol>` 스크린리더 순서
- [ ] 버튼 잠금/해제 전환 — awaiting·running에서 회색 비활성, responded·idle·silent에서 다시 활성(재전송 경로 유지)
- [ ] `RUNNING_STALE`(10분) 오경보 여부 — 실제 루틴 진행 코멘트 간격이 전제(≤4분·커밋 직전 코멘트)를 지키는지. 어긋나면 정상 실행이 `silent`로 잘못 넘어간다 → 결함 시 백로그 이관
- [ ] 진행 코멘트 도입 후 기존 상태 회귀 없음 — pm-select류 짧은 실행에서 awaiting→responded 정상

## BUG-07 — 폰 배너 라벨 판독 불가(라벨 분리) (admin, 구현 2026-08-27)

원천: `docs/agents/admin-dev/BUG-07.md` 「못 덮는 범위」. **배포 완료(2026-08-27 10:28 KST, PR #105 머지).**
참고: FEAT-07 절 하단의 관찰(2026-08-24, 원장 밖 개선 후보)이 이 항목으로 구현됨.

- [ ] 폰 라벨 판독성 — 375px·320px에서 "당신의 책상"·부제가 고정 px(`text-sm`/`text-xs`)로 읽힘 (이전: 스케일 축소로 ≈7.8px/6.2px)
- [ ] 오버레이-배경 정렬 — `pl-[30.3%]`가 텍스트를 책상 프레임(x 57~117) 밖 원위치에 놓는지, 세로 중앙 정렬 자연스러운지 (375·320·데스크톱 세 폭 스크린샷)
- [ ] 데스크톱 회귀 없음 — 640px 콘텐츠 폭에서 이전 렌더(≈14.5px/11.6px)와 동등한 모양

## FEAT-22 — 보드 읽기 raw CDN → contents API (admin, 구현 2026-08-26)

원천: `docs/agents/admin-dev/FEAT-22.md` 「못 덮는 범위」. **배포 완료(2026-08-27 10:28 KST, PR #105 머지).**
참고: 이 항목은 클린 패스 없이 게이트②가 열렸다(3사이클 정지 규칙 위 사용자 결정 — 잔여는
문서 위생 부류였고 조립·돌연변이·라이브 API 재생 증거는 3사이클 내내 유효).

- [ ] 도장 → 즉시 반영 — 게이트 도장 후 새로고침/refresh 시 실행 콘솔이 5분 대기 없이 새 status를 반영 (토큰 설정 배포, 데스크톱)
- [ ] 잠금 칩 새 문구 렌더 — 도장 후 "도장 찍음"(· 보드 반영 대기 없이), 반려 후 액션 낱말만
- [ ] 게이트대기 설명 새 문구 — "결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다."(최대 5분 문장 없음) 〔auto GET /pipeline text="결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다." notext="최대 5분" when="진행할 작업 없음" when-board="status: (승인대기|검토대기)"〕
- [ ] 토큰 부재 폴백의 5분 잔상 재발 성질 — 프로덕션 미경유(토큰 필수)라 확인 불요, 성질만 기록

## FEAT-21 — 번역 폴백 안내의 웹 절반 (web, 구현 2026-08-26)

원천: `docs/agents/web-dev/FEAT-21.md` 「못 덮는 범위」. **배포 완료(2026-08-26 08:14 KST, PR #103 머지).**

- [x] 정상 클립 카드 회귀 없음 — `확인(2026-08-26, 프로덕션 스윕 — 최신 재처리 업로드의 4카드 전부 안내 미표시, FEAT-16 근거 블록 정상 렌더. 상세 main-loop/FEAT-21.md)`
- [ ] 폴백 안내 실표시 — amber `AlertTriangle` + 문구. **배포만으론 확인 불가**: 기존 행은 NULL이고 새 클립은 번역이 실제 실패해야 값이 실린다. 확인 방법 둘 중 사용자 선택 — (a) 번역 실패 소스 실주행(L40S 과금·비결정적) (b) 기존 행에 폴백값 임시 주입 후 되돌리기(프로덕션 DB 쓰기)
- [ ] wire 왕복 — 백엔드 콜백 → 정규화 → 이벤트 → DB `subtitleStatus` 저장. 주의: 2026-08-26 00:22~00:32 실주행(재처리 1회 성공)은 **웹 배포(08:14) 전**이라 옛 웹이 값을 버렸다 — 다음 실사용은 배포 후여야 닫힌다

## BUG-02 — 번역 폴백 subtitleStatus 전달 (backend, 구현 2026-08-25)

원천: `docs/agents/backend-dev/BUG-02.md` 「못 덮는 범위」. **배포 완료(2026-08-25, BUG-03과 묶어
`modal deploy` — 사용자 승인 하에 메인 루프 실행, 6.7초 성공).** 잔여는 다음 실사용 실행에서 닫는다.

- [ ] 실제 Gemini 호출·예외 → except 배선과 튜플 언패킹 실동작 — 다음 실사용 업로드에서
- [ ] `subtitleStatus`가 실제 콜백 페이로드로 전달(정상 `"ok"`·실패 시 폴백값 관측) — 다음 실사용에서
- [ ] 컨테이너에서 `translation_fallback` import — **번들 자체는 배포 출력으로 실측**(`Created mount PythonPackage:s3_upload_policy, translation_fallback`), import는 다음 실행에서

## FEAT-20 — 게이트 카드 잠금(반영 대기 칩) (admin, 구현 2026-08-25)

원천: `docs/agents/admin-dev/FEAT-20.md`·계획서 「못 덮는 범위」. **배포 완료 — PR #102(2026-08-25)로 이미 합류·배포됐음. 이 머리말의 "⚠ 배포 전"은 낡은 기록이었고(아래 2026-08-25 LockedChip 실사용 관측이 증거) 2026-08-27 정정.**

- [ ] 잠금 공유 — 도장 성공 → 반려 패널도 사라짐 / 반려 성공 → 도장 버튼도 칩으로 (도장 쪽 절반은 2026-08-25 실사용에서 정황상 함께 발생 — 명시 관측은 다음 도장 때)
- [x] `LockedChip` 시각 — 확인(2026-08-25, **첫 실사용 관측**: FEAT-21 게이트① 도장 직후 소유자가 "도장 찍음 · 보드 반영 대기" 칩 등장을 직접 봄. 점 마커 4색 정밀 대비는 스크린샷 판정 승계)
- [ ] 실패는 잠그지 않음 — 스테일 실패 시 버튼 활성 유지·재시도 가능
- [ ] `router.refresh()` 후 잠금 유지 + 보드 flip 시 카드 소멸로 잠금 자연 소거
- [ ] 하드 리로드 시 CDN 창(≤5분) 동안 버튼 재노출(설계된 한계 — 서버 가드가 오커밋 차단)
- [ ] 서류철(doc-viewer) 게이트②에서 동일 잠금 동작

## BUG-03 — S3 업로드 재시도·맥락 오류 (backend, 구현 2026-08-25)

원천: `docs/agents/backend-dev/BUG-03.md` 「못 덮는 범위」. **배포 완료(2026-08-25, BUG-02와 묶어
`modal deploy` — 사용자 승인 하에 메인 루프 실행).** 잔여는 다음 실사용 실행에서 닫는다.

- [ ] 컨테이너에서 `s3_upload_policy` import — **번들 자체는 배포 출력으로 실측**(mount 생성), import는 다음 실행에서
- [ ] 재시도 실동작 — 분류 로직은 검증 라운드에서 boto3 재생으로 확인됨, 컨테이너 배선은 다음 실사용에서
- [x] `modal deploy` — 확인(2026-08-25: `App deployed in 6.706s`, process_video 웹 함수 등록). 업로드 경로 정상은 다음 실사용에서

## FEAT-18 — 대시보드 로스터 7인 동기화 (admin, 보드 2026-08-24 절)

원천: `docs/agents/admin-dev/FEAT-18.md` 「못 덮는 범위」. PR #101 합류(2026-08-24 12:24Z)로 배포 → 같은 날 재스윕.

- [x] 새 두 책상(backend-dev·plan-verifier)의 픽셀 SVG 실제 렌더 — 확인(2026-08-24 재스윕: 스프라이트·소품·명패 수납, 기존 5책상과 픽셀 일관)
- [x] 말풍선 색과 "검증 중"/"작업 중" 문구 — 확인(2026-08-24, 실보드 라이브: BUG-03 검토대기 파생으로 plan-verifier "검증 중", FEAT-20 계획지시로 admin-dev "작업 중" 동시 실렌더)
- [x] 폰 2열 / 데스크톱 flex-wrap에서 7책상 줄바꿈 — 확인(grid 143px×2·넘침 0·데스크톱 wrap 실측)
- [ ] backend-work 명령 버튼 — 렌더는 확인(backend-dev 책상 "작업 진행"), useTransition·토스트·GitHub POST는 클릭이 실제 코멘트라 실사용 시
- [x] 프로필 라우트 실개방 — 확인(2026-08-24: `/pipeline/agents/backend-dev` 상세 렌더 실측·`/pipeline/agents/plan-verifier` 개방. 합류 전 404 → 합류 후 200 전환 관측)
- [x] 새 hex 색의 픽셀 대비 — 확인(2026-08-24, 스크린샷 판정: 기존 팔레트와 일관·가독)

## FEAT-17 — 행위자 역할 정의 점진 공개 (admin, 보드 2026-08-23 절)

원천: `docs/agents/admin-dev/FEAT-17.md` 「테스트로 못 덮은 범위」. PR #101 합류로 배포 → 같은 날 재스윕.

- [x] `<details>` 실제 펼침/접힘, `+`→`×` 마커 회전, `list-none` — 확인(2026-08-24: backend-dev 프로필에서 10절 접힘·클릭 펼침·열림 시 `rotate: 45deg` 실측 — Tailwind v4가 `transform`이 아닌 `rotate` 속성으로 방출·네이티브 마커 없음)
- [ ] `hover:text-stamp`, `motion-reduce:transition-none`, 반응형 패딩 — 클래스 실재·렌더 정상 확인. hover 시각만 잔여
- [x] `dangerouslySetInnerHTML` 실제 렌더 모양 — 확인(2026-08-24: 역할 정의 본문 표·코드·강조 실렌더)
- [ ] 명조 디스플레이(`font-briefing-display`)의 폰 폴백 — Gowun Batang → 고딕(실기기 필요, FEAT-04와 동일 한계)

## FEAT-16 — 최종 클립에 선택 근거 저장·표시 (web, 보드 2026-08-20 절)

원천: `docs/agents/web-dev/FEAT-16.md`

- [ ] `ClipCard` 선택 근거 블록 렌더·clamp 시각·`showRationale` 분기 (web 로그인 세션 필요 — 미스윕)

## FEAT-15 — 행위자별 상세 페이지 (admin, 보드 2026-08-20 절)

원천: `docs/agents/admin-dev/FEAT-15.md` 「못 덮는 범위」

- [x] `/pipeline/agents/[agent]` 실제 진입 — `requireAdmin`·`notFound`·docs 라우트 공존 — 확인(2026-08-24, Playwright: pm 진입 렌더·roster 밖 backend-dev 404·`/pipeline/docs/**` 나란히 동작·비로그인 시 /login 리다이렉트)
- [x] `AgentProfile` 렌더 — 확인(2026-08-24: 렌더·빈 상태("아직 기록이 없습니다")·GFM 실측 + `.doc-prose` 시각 스크린샷 판정 합격. `Link` 클릭 경유만 실사용 시 자연 확인)
- [ ] pixel-office 책상 `Link` hover 들림·접근명·중첩 인터랙티브(명령 버튼과 링크 분리)
- [x] raw CDN이 `dev` 브랜치 `.claude/agents/*.md`를 실제로 서빙하는지 — 확인(2026-08-24, curl 200: backend-dev.md·plan-verifier.md)

## FEAT-14 — 대시보드 내부 문서 뷰어 (admin, 보드 2026-08-19 절)

원천: `docs/agents/admin-dev/FEAT-14.md` 「테스트로 못 덮은 범위」

- [x] `DocViewer` 렌더 — 확인(2026-08-24: FEAT-16 계획서 h1+prose 18블록+형제 탭 3 실측 + 시각 판정 합격 — 명조 제목·오커 인용·모노 코드·서류철 탭 활성·375px 래핑 정상)
- [x] `next/link` 카드 링크 네비게이션·`DocLinks` 렌더 — 확인(2026-08-24 재스윕: BUG-03 카드 "계획서 →" 클릭 → 뷰어가 방금 푸시된 계획서 렌더)
- [x] 실제 raw CDN fetch·contents API 응답 — 확인(2026-08-24: 문서 본문 렌더=raw fetch 실동작, 책상 "기록 N건"=contents API 실동작)
- [x] 배포 후 smoke 목적지 1~6 — 확인(2026-08-24: 인가 보호·plan 렌더·행위자 기록 렌더·화이트리스트 밖 404·카드 링크 경유·게이트 가시성(BUG-03 검토대기 카드에 구현승인 도장+검증 전 칩 노출) 전부 관측)

제외: 헤더 게이트/반려 버튼 상호작용은 FEAT-08·09 절에서 관리(보고 스스로 승계 명시).
raw CDN 잔상(max-age=300)은 확인 항목이 아니라 수용된 트레이드오프(FEAT-10 결정 6).

## FEAT-13 — 결재함 검증 통과 칩 (admin, 보드 2026-08-18 절)

원천: `docs/agents/admin-dev/FEAT-13.md`

- [x] `ValidationMark` 점선 「검증 전」 칩 + 검토대기 조건부 — 확인(2026-08-24, 실보드: BUG-03 검토대기 카드에 점선 칩 실렌더, 승인대기 BUG-02 카드엔 없음 — 조건부 양·음성 동시 관측)
- [ ] `ValidationMark` 실선 「검증 통과」 칩·`title` 툴팁 — BUG-03 검증 클린 패스 후 보드에 `검증:` 줄이 생기면 자연 확인 〔auto GET /pipeline text="검증 통과" text="클린 패스 (" when-board="status: 검토대기[^\n]*\n(?:[^\n]*\n){0,2}\s*검증: 클린 패스"〕

## FEAT-12 — 보드 감압·행위자 보고서 표시 (admin+루트 문서, 보드 2026-08-18 절)

원천: `docs/proposals/completed/2026-08-18-board-decompression-and-agent-reports.md` 「못 덮음」

- [x] `getAgentReports`·`getAgentReportIndex` 실제 fetch·404→빈 목록 분기·토큰 유무 분기 — 확인(2026-08-24: 책상 "기록 5건/1건" 실표시, pm 프로필 "아직 기록이 없습니다"=폴더 부재의 빈 목록 처리)
- [x] `BudgetFlag` 시각 — 확인(2026-08-24: 보고 피드에 "150자 초과" 칩 다수 실렌더, 툴팁 문구 포함)
- [x] `DeskReports` 렌더·`<details>` 펼침 — 대체(FEAT-14가 책상을 "기록 N건" 문구로, FEAT-15가 클릭을 행위자 상세 페이지로 교체 — 그 details 표면 자체가 더는 없음. 2026-08-24 실측: 책상엔 문구뿐)

## FEAT-10 — 동적 실행 콘솔·진행 pill (admin, 보드 2026-08-16 절)

원천: 보드 FEAT-10 `결과`(구현 보고 이전 관행)

- [x] `PipelineRunControl` 폴링·disabled — 확인(2026-08-24: 35초 관찰 콘솔 에러 0, 여집합(게이트대기만) 보드에서 비활성 "진행할 작업 없음"+게이트대기 설명+"보드 반영까지 최대 5분" 카피·pill "최근 요청 없음" 실렌더 — 계획서 결정 사슬대로)
- [ ] 실행 버튼 useTransition·토스트 — 클릭이 실제 이슈 #87 코멘트라 스윕 제외. 다음 실사용 시 확인
- [ ] `ProgressPill` 다섯 상태 시각 — idle만 관측(2026-08-24). 요청 보냄/응답 옴/무응답의 점 색·awaiting 맥박·`motion-reduce`는 실제 명령이 돌 때 확인
- [x] 헤더 `flex-wrap` 반응형·설명 `max-w-64` — 확인(2026-08-24, 스크린샷 판정: 데스크톱 우측 정렬 폭 제한 래핑·폰 세로 배치 정상)
- [ ] `per_page=100` 상한(바쁜 창에서의 실동작)

제외: 폴링 race는 제어흐름 재현으로 검증 시 확인됨. CDN 잔상은 결정 6(범위 밖·후속 항목).

## FEAT-09 — 결재함 반려 세 갈래 (admin, 보드 2026-08-16 절)

원천: 보드 FEAT-09 `결과`

- [ ] `commitBoardEdit` GET/PUT·base64·sha 409·`commitRejectTransition` action 분기 — 실제 GitHub 상대 왕복 (반려 실사용 시 확인)
- [ ] `RejectActions` useState/useTransition/toast/router.refresh·여백 펜 메모 시각(평평·산세리프·회색 접힘) — 여백 펜 메모 시각은 스크린샷 판정 합격(2026-08-24: 도장과 형태 대비되는 평평한 회색 "반려"). 잔여: 클릭 동작
- [ ] 폐기 확인 잉크 oklch(0.50 0.20 27) 12px AA 실측·마커 3:1
- [ ] `requireAdmin` 차단 경로

## FEAT-08 — 게이트 도장 버튼 (admin, 보드 2026-08-16 절)

원천: 보드 FEAT-08 `결과`

- [x] 도장 커밋 왕복 — 확인(2026-08-24, 실사용: BUG-03 게이트① 도장 → 커밋 `f028537`, status 1줄 최소 diff 실측. 잔여 이론 분기: sha 409 경합·토큰 미설정 토스트 — 미발생, 발생 시 확인)
- [x] `GateTransitionButton` useTransition·toast — 확인(2026-08-24, 실사용: 소유자가 성공 토스트 관측. router.refresh는 CDN 잔상 탓에 화면 무변화가 설계된 정상 동작)
- [ ] 도장 임프린트 시각(테두리·hard 그림자·hover 들림·active 눌림)·라벨 잉크 5.20:1 실화면·세리프 폴백(폰) — 임프린트 렌더·라벨 가독은 스크린샷 판정 합격(2026-08-24). 잔여: hover 들림·active 눌림(정적 스크린샷으로 불가)·폰 실기기 세리프 폴백
- [x] 투영 지연 체감(raw CDN 잔상) — 확인(2026-08-24, 실사용: 도장 후 "토스트만 뜨고 화면 무변화"를 소유자가 그대로 체감 — FEAT-10이 안내 카피까지 만든 설계된 트레이드오프)

관찰(2026-08-24, 실사용 발견 → 백로그 FEAT-20 이관): 성공 후에도 도장·반려 버튼이 잔상 5분 동안
활성으로 남아 재클릭을 유도한다. 재클릭 자체는 서버 스테일 가드가 거부(데이터 안전, 실측 커밋 1건).

## FEAT-07 — 픽셀 사무실 (admin, 보드 2026-08-15 절)

원천: 보드 FEAT-07 `결과`

- [x] SVG 렌더·`crispEdges` 선명도·격자/말풍선/명패 기하·명패 폭 초과 — 확인(2026-08-24, **승인 시안 v7(`docs/design/FEAT-07/pixel-office-mock.html`)과 실물 대조**: 그림체·말풍선·명패·기하 일치, 픽셀 선명, 명패 폭은 시안 ⑥이 "책상보다 넓어도 허용")
- [x] 반응형 배치(폰 2열/데스크톱 flex-wrap, 5책상) — 대체(FEAT-18이 7책상 기준으로 재선언). 참고: 5책상 폰 2열은 2026-08-24 실측 확인(grid 150.5px×2·가로 스크롤 0)
- [x] 방 배경(벽·걸레받이·체커 바닥·화분·액자)·명령 버튼 픽셀 스타일 — 확인(2026-08-24, 시안 v7 대조 일치)
- [ ] 책상 명령 버튼 5종 — `PipelineCommandButton` useTransition/토스트·`postPipelineCommand` GitHub POST (클릭이 실제 코멘트라 스윕 제외 — 실사용 시)

관찰(2026-08-24, 원장 밖 개선 후보): 폰에서 "당신의 책상" 배너 SVG가 비율 축소돼 라벨이 매우 작다.
시안 v7의 폰 데모에는 배너가 없어 계약 위반은 아님 — 개선 여부는 소유자 결정.

## FEAT-06 — 사무실 뷰·책상별 명령 (admin, 보드 2026-08-15 절)

원천: 보드 FEAT-06 `결과`. 전부 후속 항목이 화면을 교체했다.

- [x] `AgentCharacter` 플랫 SVG·포즈 기하·상태 채움색 — 대체(FEAT-07이 픽셀 그림체로 재작성, 포즈/tone-채움 시스템 제거)
- [x] `OfficeZone`/`OfficeDesk`·당신의 책상 서류 모티프·모바일 단일 컬럼 — 대체(FEAT-07 pixel-office 재구성)
- [x] `PipelineCommandButton`·`postPipelineCommand` 계열 — 대체(FEAT-07 절이 5책상 기준으로 재선언)

## FEAT-04 — 3구역 브리핑 개편 (admin, 보드 2026-08-14 절)

원천: 보드 FEAT-04 `결과`

- [x] `TeamZone` 캐릭터 발화 칩 렌더 — 대체(FEAT-06이 책상 세로 스택으로 교체)
- [x] `getPipelineBoard` raw fetch·`postPipelineCommand` POST·토스트 — 확인(2026-08-15, 원격 파이프라인 제안서 검증 ③ — 버튼→토스트→코멘트→`[claude]` 답글 전 구간 관측)
- [x] 결재함·보고 `<details>` 피드 펼침·모바일 단일 컬럼 — 확인(2026-08-24: "근거 보기" 펼침 실측·375px 가로 스크롤 0·단일 컬럼)
- [x] line-clamp·group-open·색토큰(stamp/stamp-soft/active/silence/hold/briefing)·디스플레이 세리프의 시각 결과 — 확인(2026-08-24, 스크린샷 판정: 세리프 디스플레이 헤딩·크림/브라운 토큰 일관·피드 줄임 정상)
- [x] 폰 세리프 고딕 폴백 전제(iOS·Android) — 대체(FEAT-17이 동일 한계 재선언)
- [ ] `requireAdmin` 차단 경로 — 비로그인 리다이렉트는 확인(2026-08-24). 잔여: 로그인했으나 ADMIN_EMAILS 밖 계정의 차단

## FEAT-03 — 파이프라인 대시보드 첫 판 (admin, 보드 2026-08-14 절)

원천: 보드 FEAT-03 `결과`

- [x] `queries.ts` raw fetch·`command-action.ts` 코멘트 POST·toast — 확인(2026-08-15, 원격 파이프라인 제안서 검증 ③ 전 구간 관측)
- [x] React 카드 렌더·useTransition — 대체(FEAT-04가 pipeline-page 재작성)
- [ ] `requireAdmin` 차단 경로 — FEAT-04 절과 동일 잔여

## FEAT-02 — 영상 길이 기반 클립 개수 상한 (web, 보드 2026-08-06 절)

원천: 보드 FEAT-02 `결과`

- [ ] DOM `<video>` 길이 측정과 업로드 UI — 상한 초과 옵션 비활성화·선택값 하향 클램프·안내 문구·상한 0일 때 업로드 차단 (web 로그인 세션 필요 — 미스윕)

## BUG-05 — 부분 생성 클립 전달 (web, 2026-08-05 커밋 1a38e1e — 보드 행 없음)

원천: `docs/plans/BUG-05.md` 「테스트」 절의 못 덮는 범위·수동 검증 시나리오

- [ ] 수동 검증 시나리오 — 3개 요청/2개 생성 상황에서 워커가 60분 소진 없이 S3 2개 확인 직후(최대 2m 유예) 탈출·클립 2개 노출·2크레딧 차감·상세 페이지 부분 안내 문구
- [ ] Inngest 워커 흐름과 DB 실효 — `processed` 전이·`lastSuccessfulAttempt`·`failureCode` 노트·`clipsFound` 차감
