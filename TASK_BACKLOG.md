# TASK_BACKLOG

> 최초 부트스트랩: README.md의 Known Issues / Credit System 항목을 옮겨 담음.
> PM 에이전트는 이 파일과 PROJECT_BOARD.md만 읽고 우선순위를 판단한다.
> 보드에 올라가는 것만으로는 제거하지 않는다. 담당 에이전트가 보드에 `status: 완료`로 기록한 시점에, 그 에이전트가 여기서 해당 항목을 제거한다.
> `area`는 실제 코드 경로여야 한다. PM은 코드를 읽지 않으므로 이 값을 그대로 보드에 옮긴다 — 여기가 틀리면 보드도 틀린다.

## Backend / Pipeline

- [ ] **BUG-04**: 임시 디렉토리 정리가 파이프라인 성공/실패 여부와 무관하게 항상 실행됨
  - area: apps/backend
  - source: README Known Issues

- [ ] **BUG-08**: 에러 콜백이 `clips: []`를 하드코딩해 부분 성공을 유실함
  - area: apps/backend + apps/web/src/inngest
  - source: BUG-03 계획서 「범위 밖 의존」(2026-08-25, `docs/plans/BUG-03.md`). **관측**: 여러 클립 중 뒤쪽 업로드가 실패하면 `_do_process_video`의 포괄 except가 에러 콜백의 `clips`를 하드코딩 `[]`로 보내, 이미 S3에 올라간 앞쪽 클립들이 리포트에서 사라진다(S3에 고아 객체만 남음). **진단(추정)**: 에러 콜백에 부분 `clip_results`를 실어야 하는데 이는 웹 inngest 소비 계약 변경이라 양 워크스페이스 경계 — 계획 단계에서 경계 판단이 관건.

## Credit / Billing

- [ ] **FEAT-01**: Credit System 마무리 (현재 개발 중 상태)
  - area: apps/web/src/fsd/features/billing + apps/web/src/fsd/entities/user + apps/web/src/inngest
  - source: README "Currently in Development"

## Admin / Dashboard

- [ ] **FEAT-25**: admin 검증기 인증 경로 — 비밀값 로그인으로 읽기 전용 `verifier` 세션 발급 (FEAT-26 선행)
  - area: apps/admin/src/server/auth
  - source: 사용자 결정(2026-08-27 세션) — 배포 확인 원장(`docs/release-checks.md`)을 사람 지시 없이 자동으로 닫는 검증 루틴(FEAT-26)을 두기로 함. **관측**: 원장 열린 줄 36건(2026-08-27), 닫힌 `확인(` 32건은 전부 사용자가 세션에서 지시했을 때 메인 루프가 이 PC의 Playwright 프로필 세션으로 스윕한 것(`docs/agents/main-loop/FEAT-19.md:52-110`). 클라우드에서 도는 루틴은 그 프로필이 없어 프로덕션 `/pipeline`을 열 수 없다. **진단(코드 확정)**: admin 로그인은 Google 단일 provider(`src/server/auth/config.ts:16`) + `ADMIN_EMAILS` 화이트리스트 signIn 콜백(`config.ts:22-24`)이고, `requireAdmin`(`src/server/auth/guard.ts:7-25`)이 세션 없으면 `/login`, 화이트리스트 밖이면 404. 세션 maxAge 8h(`config.edge.ts:11`). Google OAuth는 로봇이 통과할 수 없고, 프로필 쿠키는 8시간짜리라 자동화의 인증 경로가 없다. **수정 방향**: (1) `VERIFIER_SECRET`(optional env, 긴 난수)이 설정된 경우에만 활성되는 Credentials provider — 비밀값 일치 시 고정 신원 `verifier`(이메일 아님)의 JWT 세션 발급, 로그인 화면엔 노출하지 않음(POST 전용). (2) 읽기 전용 강제: `requireAdmin`은 verifier의 페이지 렌더를 허용하되, 쓰기 액션(게이트 전이 `commit-gate-transition.ts`, 반려, 명령 POST `post-pipeline-command.ts`, dev 책상 명령)은 verifier를 거부 — `requireAdmin`에 쓰기 모드 옵션을 두거나 `requireOperator`를 분리. 비밀값이 새도 화면 열람 이상은 불가해야 한다. (3) `ADMIN_EMAILS` 우회가 아니다 — 별도 신원이며 화이트리스트 검사 로직은 그대로. **설계 시 판단**: verifier 세션 maxAge는 짧게(루틴 1회 실행 분량, 예 1h). 테스트는 signIn/guard 순수 로직(토큰 부재 시 provider 비활성, verifier 쓰기 거부, Google 경로 회귀 없음). **범위 밖 의존**: 비밀값은 Vercel env와 claude.ai 환경변수 양쪽에 두며 후자는 시크릿 금고가 없어 그 환경을 쓰는 세션 전부가 읽는다(계정이 단일 소유자라 감수 — https://code.claude.com/docs/en/cloud-environments). web 앱은 대상 아님(원장의 web 줄 2건은 사용자 몫 유지).

- [ ] **FEAT-26**: release-verifier 루틴 — 배포 확인 원장의 화면 판정 가능 줄을 매일·배포 직후 자동 확인·마감 (FEAT-25 의존)
  - area: .mcp.json + .claude/skills/release-verify (신설) + docs/release-checks.md
  - source: 사용자 결정(2026-08-27 세션) "체크리스트가 자동으로 검증됐으면". **관측**: 원장 열린 36건 중 화면만 열면 판정되는 줄이 약 7건(문구·렌더·hover·대비), 나머지는 실제 도장·업로드(Modal 과금)·실기기·web 로그인이 있어야 보이는 줄. 닫힌 줄은 전부 사용자 지시 스윕이었고, 배포·실사용 뒤 원장을 다시 보는 트리거가 런북에 없어 FEAT-08 도장 실사용처럼 실제로 여러 번 일어났는데도 열린 채 남은 줄이 있다(`FEAT-19.md:41-43`). FEAT-19가 "확장형(release-verifier 에이전트) 미결정"으로 남겼던 것(`FEAT-19.md:45-48`). **진단(문서 확정, 2026-08-27 조사)**: 로스터 에이전트는 메인 루프가 디스패치해야 돌고 메인 루프는 사용자 세션이 있어야 돌므로 "자동"이 안 된다 — 세션 밖에서 깨어나는 claude.ai 루틴(기존 `pipeline-command`와 같은 부류)이어야 한다. 루틴 문서(https://code.claude.com/docs/en/routines): 트리거는 schedule(최소 1h, daily 프리셋)·API·GitHub(**PR·Release 이벤트만, push 없음**; 필터 base branch·merged 가능), 계정당 일일 실행 상한. 환경 문서(https://code.claude.com/docs/en/cloud-environments): setup script가 Ubuntu 24.04 root로 돌아 `apt install` 가능·결과 스냅샷 캐시(약 7일) → Playwright Chromium 설치 가능; 기본 네트워크는 allowlist라 admin 프로덕션 도메인을 Allowed domains에 추가해야 함(아니면 403 `host_not_allowed`); 루틴은 저장소에 커밋된 스킬과 `.mcp.json`을 쓴다. **설계**: 트리거 = 매일 1회 + GitHub `pull_request.closed`(base `main`, merged=true — 배포 직후). 하는 일 = ① 원장의 `- [ ]` 줄 수집 → ② 화면 판정 가능한 줄만 분류(실제 도장·반려·명령·업로드·실기기·web 로그인 필요 줄은 제외) → ③ FEAT-25 세션으로 프로덕션 admin을 Playwright로 열어 판정 → ④ 통과 줄만 `확인(날짜, 근거 — 스크린샷/실측값)`으로 체크, 불합격은 체크하지 않고 어긋난 내용만 기록(백로그 이관은 사람) → ⑤ `docs/release-checks.md`만 `dev`에 커밋·푸시. 새 줄 없으면 즉시 종료(`pipeline-command`의 "처리할 명령 없으면 종료"와 동일). "도장→즉시 반영"류는 보드 푸시 트리거가 미보장이라 제외 — 다음 실제 도장 때 사용자 몫. **저장소 쪽 산출물**: `.mcp.json`에 Playwright MCP(headless), 루틴 절차 스킬 `.claude/skills/release-verify/SKILL.md`(위 ①~⑤ + 판정 가능/불가 분류 기준 + 증거 형식), 루틴 지침 계약 사본을 `docs/proposals/active/remote-agent-pipeline-generalization.md`에(FEAT-24 관례), 원장 머리말에 자동 확인의 증거 형식 한 줄. **claude.ai 쪽(저장소 밖, 사용자가 `/schedule`로)**: 루틴 생성·트리거 2종·환경(admin 도메인 allowlist, setup script `npx playwright install --with-deps chromium`, `VERIFIER_SECRET`). **담당**: `.claude/`·루트 문서는 dev 로스터의 쓰기 범위 밖이라 FEAT-19 전례대로 main-loop가 계획·구현. **비용**: Modal 0(admin에 호출 경로 없음, 업로드 안 함), Neon은 `/analytics` 열 때 읽기만, 나머지는 구독 사용량·일일 실행 상한. **기각한 대안**: GitHub Actions + Claude(종량 API 경로를 안 만든 원칙과 충돌), 로스터 에이전트 추가(자동 아님 + 대시보드 8책상 재동기화 비용).

## Pipeline 운영 / 검증 하니스

- [ ] **FEAT-27**: 계획서 검증 하니스 — `verification-paths.md` 9경로를 deterministic/hybrid/reasoning으로 분류하고, 기계 재현 가능한 경로만 script/tool로 구현
  - area: scripts/verify-plan (신설, 루트) + docs/plans/verification-paths.md + .claude/agents/plan-verifier.md
  - source: 사용자 발주(2026-08-27 세션, 브리프 원문은 아래 「요구」). **관측**: 카탈로그의 9경로(`docs/plans/verification-paths.md:17-29`)는 매 검증 라운드 사람(메인 루프·`plan-verifier`)이 손으로 실행한다 — FEAT-22 기록에서 경로 1 인용 전수는 인용 줄을 하나씩 눈으로 대조(`docs/agents/main-loop/FEAT-22.md:47-48`), 경로 3 before 바이트 일치는 diff 전문 대조(`:172`), 경로 2 조립 게이트는 check·test·verify:fsd:final 수동 실행(`:36`)이었고, 3사이클 동안 같은 경로를 매 라운드 재수행했다. `plan-verifier`는 도구가 없어 하니스(스케치 추출·돌연변이·렌더)를 매번 스크래치패드에 재조립한다(`.claude/agents/plan-verifier.md:31`). 저장소 안 기계 검증 선례는 `apps/admin/scripts/verify-fsd-boundaries.mjs` 하나 — 종료코드 PASS/FAIL(`:722` `process.exitCode = 1`), `--final` 모드(`:708`), 규칙 ID별 메시지, 셀프테스트 13건(`verify-fsd-boundaries.test.mjs:21-196`, 음성 픽스처 포함)을 갖춰 이 항목이 요구하는 script/tool 성질의 저장소 내 모델이다. **진단(추정 — 분류 확정은 계획 단계)**: 9경로는 성격이 셋으로 갈린다. *deterministic*(입력이 계획서+트리뿐, 판단 불요): 1 인용 전수 대조의 "줄 존재 + 인용 내용 일치" 부분, 3 before/after 기계 적용(before 블록 바이트 일치·patch dry-run), 9 구조적 아티팩트 검사(파서), 7 음성 시험 중 검사가 스크립트인 경우(규칙 제거→검사 실패 확인). *hybrid*(대상·설정 선택은 판단, 실행·판정은 기계): 2 스케치 추출·실행(어느 워크스페이스 설정으로 어떤 파일에 실행할지), 5 돌연변이(명세→테스트 변환은 reasoning, 주입·사멸 판정은 기계), 8 실물 렌더(대상 선택 reasoning, `renderToStaticMarkup` 실행 기계). *reasoning*(의미 해석 본체): 4 전칭 여집합 열거(주장 발췌·여집합 설계), 6 실제 사건 재생(실측 데이터 선택·의미 판정), 그리고 hybrid의 판단 절반. 현재는 세 부류가 구분 없이 산문 증거로만 남아 라운드마다 비용과 편차가 생긴다. **요구(발주 원문 요지)**: ① `verification-paths.md`는 에이전트가 읽는 source of truth로 유지하고 전체를 하나의 script PASS/FAIL 시스템으로 바꾸지 않는다. ② 9경로를 deterministic/hybrid/reasoning으로 분류한 뒤 기계적으로 재현 가능한 path만 script/tool로 구현한다. ③ script/tool은 동일 입력→동일 결과 · exit code 기반 PASS/FAIL · evidence 출력 · negative fixture/self-test를 가진다. ④ 의미 해석이 필요한 검증은 `plan-verifier`에 남긴다. ⑤ 최종 verdict는 mechanical evidence + reasoning evidence를 종합하는 구조로 만든다. ⑥ 새 verification agent는 추가하지 않고 현재 main loop + `plan-verifier` 구조를 유지한다. ⑦ 기존 `apps/admin`의 `verify:fsd` 패턴 등 재사용 가능한 구현을 먼저 조사한다. ⑧ 절차: 현재 구조 분석 → 변경 계획 제시 → 구현 → 변경 파일·검증 결과·남은 reasoning-only 영역 보고(파이프라인상 계획서=분석+계획, 구현 보고=③④). **설계 시 판단**: 카탈로그 표에는 열 추가(분류·도구 명령)만 하고 행 제거는 하지 않는다(행 제거는 사용자 승인만 — `verification-paths.md:41`). 종합 구조는 새 파일이 아니라 기존 기록 자리에 둔다 — `docs/agents/main-loop/<항목ID>.md` 라운드 기록과 `plan-verifier` 보고 템플릿(`plan-verifier.md:65-82` [실행한 경로])에 mechanical 증거(도구 출력·종료코드)와 reasoning 증거를 나눠 적는 형식. 도구는 루트 `scripts/verify-plan/`에 두고 계획서 경로를 인자로 받는다(계획서는 backend·web·admin 공통이라 워크스페이스 안에 두지 않음). **담당**: 루트 `scripts/`·`docs/plans/`·`.claude/agents/`는 dev 로스터의 쓰기 범위 밖 — FEAT-19·FEAT-26 전례대로 main-loop가 계획·구현. **범위 밖 의존**: `plan-verifier`가 도구를 쓰려면 브리핑에 명령이 실려야 하고 스크래치패드 제약(`plan-verifier.md:31·36`)과 충돌하지 않아야 한다 — 도구는 저장소 파일을 읽기만 하고 출력은 stdout이라 충돌 없음을 계획서에서 확인. 경로 9는 실증 사례가 아직 없어(`verification-paths.md:29`) 첫 fixture가 곧 첫 실증이 된다.

## 비고

- 위 항목의 우선순위는 아직 정해지지 않음 — PM 에이전트가 매일 이 목록에서 오늘 처리할 1~2개를 골라 PROJECT_BOARD.md에 "승인대기"로 기록한다.
- 새 이슈가 생기면 이 파일 하단에 추가한다 (형식: ID, 설명, area, source).
- `source`를 쓸 때는 **관측과 진단을 분리한다.** 무엇을 봤는지(관측)와 왜 그렇다고 생각하는지(진단)를 한 문장에 섞지 않고, 진단은 추정임을 표시한다. FEAT-02가 실제로 이렇게 틀렸다 — 관측("10분 소스에 4개 요청 시 적게 생성됨")은 맞았는데 진단("유저가 무리한 개수를 골라서")이 틀렸고, 둘이 섞여 있어 담당 에이전트가 틀린 진단을 요구사항으로 받아 계획을 세 번 썼다. 반대로 BUG-06은 `파일:줄` 근거, 이미 맞는 곳, 수정 방향까지 적혀 있어 계획이 한 번에 끝났다.
