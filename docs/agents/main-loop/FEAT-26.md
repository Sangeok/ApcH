# FEAT-26 — 메인 루프 기록 (게이트 결정·검증 라운드)

## 발주와 게이트① 개방 (2026-08-28)

FEAT-26은 2026-08-27 사용자 결정("체크리스트가 자동으로 검증됐으면")으로 FEAT-25와 함께 등재됐다(`ce2ae45`).
FEAT-25(검증기 인증 경로)가 같은 날 구현·배포·실측까지 끝나(PR #107, 핸드셰이크·읽기 전용·쓰기 거부 실증)
선행 의존이 해소됐고, 사용자가 세션에서 "feat 26 계획 지시"로 선정과 `계획지시` 전이를 함께 결정했다.
담당은 main-loop — `.claude/`·`.mcp.json`·루트 문서가 dev 로스터의 쓰기 범위 밖이라 FEAT-19 전례대로
메인 루프가 계획·구현한다. 메인 루프가 보드 행을 만들었고 결정은 사용자의 것이다. 병렬 미결 없음.

- 요구 원천: `TASK_BACKLOG.md`의 FEAT-26 `source`(관측 / 진단(문서 확정) / 설계 ①~⑤ / 산출물 / claude.ai 쪽 / 담당 / 비용 / 기각 대안).
- 검증 규칙: 메인 루프가 쓴 계획서를 메인 루프가 검증하면 재독이 회상과 구분되지 않는다 — 카탈로그 경로를
  소진한 뒤 `plan-verifier` 독립 패스가 판정이라는 보드 규칙이 이 항목에 특히 무겁게 적용된다.

핵심 판단 지점(계획 단계에서 다뤄야 할 것 — 착수 시점에 메인 루프가 잡은 것):

- **루틴을 누가 만드는가**: FEAT-24에서 메인 루프가 `RemoteTrigger`로 기존 루틴을 갱신할 수 있음이 드러났다.
  생성·트리거 2종·환경 설정(도메인 allowlist·setup script·env)까지 `/schedule` 스킬이 어디까지 하는지를
  실측해 "사용자 몫"을 최소로 좁힌다 — 백로그의 "claude.ai 쪽은 사용자가 `/schedule`로"는 FEAT-24 이전 가정이다.
- **판정 층 분리**: FEAT-25로 로봇이 세션을 얻으므로, 원장 줄을 (a) HTTP 응답·본문 텍스트로 판정 가능
  (b) 렌더된 DOM·상호작용·시각이 필요(Playwright) (c) 실제 도장·업로드·실기기·web 로그인이 필요(자동 불가)
  셋으로 분류한다. (a)는 브라우저 없이 `fetch`로 닫히므로 Playwright 설치가 실패해도 부분 가치가 남는다.
- **원장 쓰기 계약**: 루틴은 `docs/release-checks.md`만 `dev`에 커밋한다. 마감 증거 형식(`확인(날짜, 자동 — 근거)`)을
  원장 머리말 규칙에 한 줄로 추가하고, 불합격은 체크하지 않고 관찰만 남긴다(백로그 이관은 사람).
  같은 파일을 메인 루프도 편집하므로 충돌 전략(최신 dev 위에서 편집·푸시, 실패 시 재시도/포기)을 명시.
- **트리거**: 매일 1회 + GitHub `pull_request.closed`(base `main`, merged). 배포 완료와 머지 사이 지연
  (Vercel 빌드 1~2분) — 루틴이 머지 직후 돌면 옛 배포를 볼 수 있다. 대기 또는 배포 커밋 확인 방법을 정한다.
- **비밀값 취급**: `VERIFIER_SECRET`을 루틴 환경변수로. 지침·로그·커밋 어디에도 값이 찍히지 않게 하는 규칙.
- **세션 계약 소비**: FEAT-25 「공개 계약」 그대로 — 성공 판정은 상태코드가 아니라 세션 쿠키 존재. 1h 안에 끝나는 실행.
- **환경**: Ubuntu setup script(`npx playwright install --with-deps chromium`), 네트워크 allowlist에 `admin.a-pch.com`
  (없으면 403 `host_not_allowed`), `.mcp.json`의 Playwright MCP(headless). 스냅샷 캐시 ~7일.
- **범위 밖**: web 원장 줄(사용자 몫 유지), FEAT-27(하니스)과의 접점 없음.

## 계획서 작성 (2026-08-28, 메인 루프)

main-loop 담당 항목이라 메인 루프가 `docs/plans/FEAT-26.md`를 썼다(A단계 상당, 코드 무수정). 설계 결정 둘은 백로그와 다르다 — ① HTTP 층(verifier 세션·본문 문구·CSS 방출)만으로 판정하는 결정적 스크립트를 본체로 하고 브라우저 층은 후속 후보로 분리(`.mcp.json` 미생성), ② 루틴 생성·트리거는 `RemoteTrigger`로 메인 루프가(FEAT-24 실측), 사용자 몫은 환경 설정 둘(허용 도메인·`VERIFIER_SECRET`). 사전 실측: `RemoteTrigger get`으로 기존 루틴 설정, `list_runs`/`get_run_log`로 클라우드 환경 능력(git push·node_modules·GitHub MCP·사용자 스킬 없음), verifier 세션으로 `/pipeline` HTML 문구·CSS 청크(Tailwind 이스케이프 선택자)·raw 보드 200. 03:29Z 발급 세션이 14:38Z에 307로 거부된 것은 8h JWT 만료(정상) — 1h 가드 관측 창을 놓쳐 14:40Z 세션을 새로 보관.

## 필수 검증 경로 확정 (카탈로그)

| # | 경로 | 이 항목에서의 구체 검사 |
| --- | --- | --- |
| 1 | 인용 전수 대조 | 원장·FEAT-19/25 기록·admin 코드(verifier/config/guard/run-plan/journey/index.tsx)·제안서·package.json·CLAUDE.md 인용 전부 |
| 2 | 스케치 추출·실행 | 신규 4파일(모듈 3·SKILL) 조립 → `npm run test:release-verify` → `run.mjs` 실행 |
| 3 | before/after 기계 적용 | 기존 4파일 10블록 바이트 일치·1회 매치, 신규 4파일 충돌 없음 |
| 4 | 전칭 여집합 열거 | "열린 51줄/26절", "자동 판정 가능한 줄은 이 넷", "루트 scripts/·.claude/skills 없음", package.json scripts 목록 |
| 5 | 돌연변이 검사 | `ledger.mjs` 순수 함수 전부(파서·판정·되쓰기·이스케이프·시각) |
| 6 | 실제 사건 재생 | 태그 4줄을 붙인 원장 사본으로 프로덕션 admin에 드라이런(`--ledger 사본 --apply`) — 실제 HTML·CSS·보드 |
| 7 | 음성 시험 | 전제 조건(`when-board`) 제거 시 skip→fail, 미지 키·비밀값 부재·오답 시 종료코드 2·원장 무변경 |
| 8 | 실물 렌더 | 트리거 없음 — 화면 변경 없음 |
| 9 | 구조적 아티팩트 | `package.json` JSON 파싱·`SKILL.md` frontmatter·`when-board` 정규식 컴파일 |

## 검증 1라운드 (2026-08-28, 메인 루프 — 편집 라운드)

하니스는 스크래치패드 `feat26/`(펜스 길이 인식 추출·적용 스크립트, 명세→테스트, 돌연변이 러너, 인용 덤프). 트리에 적용 → 검사 → `git checkout`/삭제 복원. 경로 3 14/14. 경로 6: **로그인 ok, pass 3·skip 1** — 보드 상태(FEAT-26 검토대기)와 정확히 일치, 사본 되쓰기 정확. 경로 7: 비밀값 부재/오답 → 2, `when-board` 제거 → FEAT-13 줄이 거짓 불합격(전제가 load-bearing). 경로 4: 51/26 일치.

**결함 5건**(전부 계획서 수정): ① `test:release-verify`의 디렉터리 인자가 로컬 Node 22.13에서 `Cannot find module`로 실패 → glob으로(경로 2 실측). ② `run.mjs`가 태그 문법 오류에 스택으로 종료코드 1 → try/catch로 종료코드 2·보고서 `parse`·원장 무변경(경로 7). ③ `verifier.ts:84-92` 인용이 FEAT-25 계획서 줄번호를 소스 줄로 옮긴 오기(파일 42줄) → `:34-42`; `CLAUDE.md:7-18`→`:7-16`, before `:16-17`→`:15-16`(경로 1, 적용 전 원본 트리 재대조). ④ 돌연변이 M14(applyResults 위→아래 적용) **생존** = 명세 구멍 — "fail 삽입 직후 줄 pass" 케이스 추가(경로 5). ⑤ 「테스트」 실측 기대치가 보드 상태 의존임을 안 적음 → 실측값과 상태 의존 명시. 중첩 코드 펜스(제안서 after 블록) 바깥을 4중 백틱으로.

## 검증 2라운드 — 무편집 최종 패스 (2026-08-28, 메인 루프)

최신 저장본 재독 후 원본 트리에서 재실행: 경로 1 인용 17(명명)+8(bare) 전부 내용 일치 · 경로 3 14/14 · 경로 2 `npm run test:release-verify` **18/18** · 경로 5 **16/16 사멸**(M14 포함) · 경로 6 프로덕션 드라이런 로그인 ok·pass 3·skip 1 · 경로 7 미지 키 → 종료코드 2·원장 무변경 · 경로 9 package.json 파싱·스크립트 인식·frontmatter 키 · 복원 후 트리 청결. **결함 0건.** 비-결함 위험: (1) 클라우드 환경 네트워크·환경변수는 첫 실행 로그로만 확인(계획서 「못 덮는 범위」), (2) FEAT-13 태그의 "검증 통과" 낱말은 다른 카드에도 있어 `title="클린 패스 ("`+`when-board`가 판정의 실체(계획서에 기록).

**판정**: 메인 루프 라운드 무소득 → `plan-verifier` 디스패치 자격. 메인 루프가 쓴 계획서라 독립 패스가 특히 중요하다. 브리핑 중립.

## 검증 3라운드 — `plan-verifier` 독립 무편집 패스 (2026-08-29 00:16 KST, 1사이클째)

중립 브리핑(항목ID·계획서 경로·필수 경로 9개, 실무 참고만). 검증자가 "사전 판단 없음"을 명시. detached worktree(스크래치패드)에 조립, 종료 시 제거 — 메인 루프가 `git status --untracked-files=all`·`git worktree list`로 검산: 저장소 무변경·worktree 잔존 없음.

**결함 0건.** 경로별 증거: ① 인용 전부 내용 일치(원장 규칙·before 대상 6줄·admin 코드 9곳·제안서·package.json·CLAUDE.md·FEAT-19/25 기록), 51줄/26절 재계수 ② 신규 4파일 조립 `node --check` 통과, 명세→테스트 **15/15**, `run.mjs` 무태그 원장에서 exit 0 ③ before 10블록 1회 매치·4중 백틱 구조 확인·신규 충돌 없음 ④ 전칭 5건 여집합 확인 + "이 넷이 전부"의 반례 탐색(47줄 훑어 없음 — `:78` 도장 칩은 액션 후에만 렌더) ⑤ 돌연변이 9/9 사멸 ⑥ 프로덕션 드라이런 **login ok·pass 3·skip 1**(계획서 진술·보드 상태 일치), 사본 되쓰기 형식 일치, 보고서에 비밀값·쿠키·csrf 없음 grep 확인, `when-board` 정규식 양·음성 매치 ⑦ `when-board` 제거 → fail + 사본에 불합격 메모 실제 기입, 비밀값 부재/오답/미지 키 → exit 2·원장 무변경 ⑧ 트리거 없음 ⑨ package.json 파싱·스크립트 인식, frontmatter YAML, 정규식 컴파일, 전각 괄호 파싱 4/4.

**판정**: 독립 무편집 클린 패스 1회 → 보드 정지 규칙 충족. `검증:` 줄 기록. **게이트②(구현승인) 대기 — 사용자만 연다.** 메인 루프가 쓴 계획서를 독립 컨텍스트가 프로덕션 재현까지 포함해 확인했다.

## 게이트② 개방 (2026-08-29)

사용자가 세션에서 "구현 승인"으로 개방. 계획서는 클린 패스 시점(`66d9994`) 그대로 — 사용자 편집 없음. 메인 루프가 직접 구현한다(B단계 상당): 계획서 블록 기계 적용 → 「테스트」 명세 테스트 → `npm run test:release-verify` → 프로덕션 드라이런(원장 되쓰기는 루틴 첫 실행에 맡긴다) → 커밋·푸시 → `RemoteTrigger`로 루틴 생성·즉시 실행 → 실행 로그로 클라우드 전제 확인 → 인수·원장 등재·PR.

## 구현 (2026-08-29, 메인 루프)

계획서 블록을 스크래치패드 하니스로 기계 적용(14/14 — 검증 라운드와 같은 스크립트), 「테스트」 명세 테스트 `ledger.test.mjs`(18 케이스) 투입. `npm run test:release-verify` **18/18**. 프로덕션 드라이런(원장 무변경): login ok, pass 1(유틸 방출)·skip 3 — 보드가 `구현승인`이라 캡션·게이트대기·검증 칩 전제 미충족(상태 의존이 설계대로). 커밋 `37ec918`.

**루틴 생성(RemoteTrigger)**: `release-verify` = `trig_01LNKaB5VF59MLuSZRM7E8HR`, cron `0 0 * * *`(다음 예약 2026-08-29 00:01Z = 09:01 KST), 모델 sonnet-5, 도구 `Bash·Read·Edit·Glob·Grep`, 소스 ApcH. 서버가 기본 부착한 MCP 연결(Notion·Claude_Code_Remote)은 `clear_mcp_connections`로 제거(최소 권한). **webhook 트리거**: `create_webhook_trigger`에 `filter.action`(closed)·`filter.base_branch`(main) 둘 다 "Extra inputs are not permitted"(req_011CeVPgkMsBoncFpUmhDkJ4·req_011CeVPi5CEUEysEM8y1Nr63) — 필터 스키마 미공개라 미배선, cron이 본체(계획서 best effort 그대로). 원장에 사용자 결정으로 등재.

**첫 실행(`action: run`, `cse_012JpnKvc33bPw1T9PWDHfn4`, 15:35Z, 27초)**: sandbox 할당 → 저장소 fetch → `git checkout -B dev origin/dev`(37ec918) → SKILL.md 읽음 → `pull --ff-only` → `test -n "$VERIFIER_SECRET"` **UNSET** → 2단계 중단, `git status` clean, 파일·커밋·#87 무변경, 푸시 알림 발송("VERIFIER_SECRET 미설정 — 환경변수 필요"). 지침·스킬을 글자대로 따랐고 실패 모드가 무해함이 실측됐다. 네트워크 허용·`git push`는 그 앞에서 멈춰 미검증(원장 등재).

## 구현 인수 (2026-08-29, 메인 루프)

**인수 다섯 조건**(자기 항목이라 더 엄격히): 1. 변경 파일 = 계획서 「고칠 파일」 9개(신규 4 + 수정 4 + 테스트 1) 정확히 — `git show --stat 37ec918`. 2. diff ↔ 스케치: 하니스가 블록을 바이트 그대로 썼다(손 편집 0). 3. 검증 재실행: `npm run test:release-verify` 18/18, 드라이런 login ok. 4. 백로그 FEAT-26 블록 제거(잔존 언급 0). 5. 상세 기록 = 이 파일. 보드 `결과` 150자 이내.
「범위 밖 의존」: 사용자 환경 설정(원장 선행 조건), 브라우저 층 후속 후보(백로그 미등재 — 사용자 결정 대기), webhook(원장 줄). 「못 덮는 범위」 → 원장 FEAT-26 절 5줄.

## 정정 — 백로그 과삭제 (2026-08-29, 메인 루프)

`986f640`의 FEAT-26 블록 제거 정규식(`re.S` + `(?:  - .*\n)+`)이 줄을 넘어 탐욕 매치해 **12줄**(FEAT-26 4 + 「Pipeline 운영 / 검증 하니스」 절 + FEAT-27 4 + 「비고」 제목)을 삭제했다. 6차 doc-auditor 보고("잔존 3건, FEAT-27 없음")로 드러났고 직전 커밋 파일에서 FEAT-26 4줄만 인덱스 삭제로 복원. 교훈: 상태 문서의 블록 제거는 정규식이 아니라 줄 인덱스로, 제거 후 인접 항목 무결을 인수 조건 4에서 **열거로** 확인한다(FEAT-25 인수 때는 했고 이번엔 `grep FEAT-26` 0건만 봤다).

정정의 정정: 위 복원 시도(`1d6b2d0`)는 `git show > /tmp/…`가 Git Bash 경로 매핑으로 python에 보이지 않아 **실패했는데 `set -e` 없이 기록만 커밋됐다** — 그 커밋 메시지의 "복원"은 사실이 아니었다. 스크래치패드 경로로 다시 복원해 이 커밋에서 실제로 반영(`git diff 986f640^ -- TASK_BACKLOG.md`가 FEAT-26 4줄만 보이는 것으로 검산). 교훈 둘째: 복원 스크립트는 `set -e` + 결과 검산을 커밋 앞에 둔다.

## 첫 끝까지-실행 + 파서 버그 (2026-08-29, 메인 루프)

사용자가 claude.ai 환경 `Default`에 `VERIFIER_SECRET` + 허용 도메인(Custom: `admin.a-pch.com`·`raw.githubusercontent.com`)을 설정한 뒤 `action: run`으로 즉시 실행.

- **첫 시도(`cse_01XJcg7DakZsH2DdKYYrgKhV`, 13:37 KST)**: 로그인 전에 `run.mjs`가 종료코드 2 — `원장 태그 파싱 실패 — unsupported method: …`. 원인: `parseLedger`가 `line.indexOf(TAG_OPEN)`로 줄 **어디든** `〔auto `를 잡아, FEAT-26 절 자기 설명 줄(`docs/release-checks.md:49` "원장의 `〔auto …〕` 줄이 …")의 산문 언급을 태그로 오독했다. 원장이 검사 명세이자 산문인 데서 온 결함 — 계획서 검증(경로 2·5)이 태그 4줄로만 돌아 "산문에 태그 낱말이 등장하는" 케이스를 못 밟았다.
- **수정(`991662f`+`a0533ed`)**: `parseLedger`·`stripTag`가 **줄 끝(`〕`로 끝)에 붙은 마지막 태그만** 파싱하고, 줄 끝이 아닌 실제 `〔auto GET ` 태그는 명시적 오류. 회귀 테스트 3개 추가(산문 무시·줄끝 아닌 GET 오류·마지막 태그만 strip), 20/20. 주의: `991662f`가 파서만 커밋되고 테스트 갱신이 문자열 불일치로 누락돼 잠시 스위트 1건 red였고 `a0533ed`로 즉시 복구 — 인수 시 "적용 스크립트가 조용히 실패해도 커밋되지 않게" 검산이 필요했던 사례.
- **둘째 시도(`cse_01PeC3HvrTBQfGCipyDpuF4D`, 13:41 KST)**: `login=ok pass 1·fail 0·skip 3`, `docs/release-checks.md` 1줄만 커밋·푸시(`84baa37`, 작성자 Claude via 루틴). 닫힌 줄 = FEAT-23 「신규 Tailwind 유틸 조합 방출」(css 5/5). skip 3은 보드 상태 전제 미충족(캡션·게이트대기·검증 칩). 커밋 전문 비밀값·세션 쿠키 유출 0(grep 검산). **루틴이 설계대로 프로덕션 응답으로 원장을 자동 마감함을 실증 — FEAT-26의 핵심 가치 달성.** 원장 FEAT-26 절 "클라우드 끝까지 실행" 줄은 이 실행으로 닫을 수 있으나, 매일 09:00 KST 예약 실행이 같은 경로를 밟으므로 다음 예약 성공으로 자연 확인한다.
