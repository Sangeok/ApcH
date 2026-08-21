# FEAT-15 — main-loop 기록

## 게이트① 개방 (2026-08-20)

- 전이: `승인대기` → `계획지시` (`33561e7`)
- 결정자: 사용자 — 채팅에서 "계획 지시"
- 기록자: 메인 루프
- 경위: 소유자가 설계 대화(역할 출처 = `.claude/agents/<id>.md` 정의 파일, 닫힌 경로 화이트리스트, 읽기 전용)를 확정하고 백로그에 FEAT-15를 등재(`68d0c38`), pm이 같은 날 선정해 승인대기 진입. 발주 계약은 `TASK_BACKLOG.md`의 FEAT-15 항목(요구 4)
- 다음: admin-dev 디스패치 → `docs/plans/FEAT-15.md` 작성 → `검토대기` (`53564cf`)

## 계획서 검증 (2026-08-21) — reconciling-proposals-with-codebase, High-Risk 프로파일

대상: `docs/plans/FEAT-15.md`(admin-dev 작성, `53564cf`). 프로파일 근거: 신규 인가 라우트(외부 도달) + 문서 fetch 화이트리스트 확장(경로 기반 접근 제어) + `dangerouslySetInnerHTML` 재사용.

### 1라운드 — 결함 3건(전부 서술 정확성·전파), 통합 편집 1배치

폐쇄 경로: 인용 전수 실측(계획서가 인용한 코드 20여 곳 — pixel-office·known-agents·doc-location·repo-doc queries/index/config·agent-report queries/index/report-index·markdown·briefing·docs 라우트·globals.css·doc-viewer ui·middleware·guard·verify-fsd-boundaries R1~R5 실코드·api 세그먼트 index·queries.test.mjs mock 구조·package.json next 15.5.7), 여집합 열거(known-agents 소비자 grep 전수·ROSTER_ORDER 소비자 grep 전수·entities→shared 임포트 선례 grep), 정의 파일 6개 frontmatter 실측, `docs/agents/` 폴더 실측, 라우트 트리 실측(`agents/` 세그먼트 부재).

1. **[정확성] "임포트 자체를 금하는 계약은 reporting.ts뿐" 거짓 전칭.** `report-index.ts:1`("임포트가 하나도 없다")과 doc-location(`repo-doc/index.ts:2` "임포트 없는 순수 파일로 유지")도 같은 계약. known-agents가 거기 속하지 않는다는 논지는 유지된다 — 문장을 계약 파일 열거로 교체.
2. **[정확성] "기록 목록은 책상 라벨·브리핑 DocLinks로만 노출" 불완전 전칭.** 뷰어 서류철 탭(`build-doc-view.ts:29-37` `dossierTabs`)도 reports를 소비한다. 셋으로 정정(+인용 추가).
3. **[전파] apps/admin/CLAUDE.md 테스트 인벤토리 후속 미기록.** 신규 테스트 2개로 25→27파일이 되는데 계획 스코프 가드가 그 파일을 제외한다. 「범위 밖 의존」에 "완료 인수 시 메인 루프가 동기화" 명시(FEAT-08·14 비고 관례와 동일한 인수 경로).

결함 아님으로 닫은 것: before 스니펫 3곳(queries.ts:1-9·known-agents.ts:32-38·pixel-office.tsx:128-134) 바이트 일치. label→href 왕복(`AgentReport.label`=확장자 뗀 이름 → `reportDocHref` → `locationFromSlug`가 `.md` 재조립) 정합. FSD R1~R5 실코드 대조 — entities→shared 하향 허용(R1), shared는 R2 peer·R3 public-entry 예외라 `~/fsd/shared/agents/roster` 직접 임포트 적법, 라우트의 entities `/api` 세그먼트 임포트는 R3 publicTarget(segment index 실재 확인). ROSTER_ORDER 파생 교체는 소비자 1곳(briefing.ts:260)·픽스처 인코딩 0곳이라 안전. raw CDN 토큰 불필요(public, `config/github.ts:6` 실측 주석). 3중 인가(sign-in allowlist·Edge matcher가 신규 경로 포함·목적지 requireAdmin 스케치) 유지. 읽기 전용이라 멱등·동시성 해당 없음(양 데이터 경로 GET 실측). XSS는 renderMarkdown 전량 escape 계약(기존 테스트) + 저장소 통제 입력. Next 15.5.7 async params — 스케치가 기존 docs 라우트와 동형.

### 2라운드 — 무편집 클린 패스 (편집 0건, 결함 0건)

- 저장본 전문 재독(396줄). 편집 3건이 §현재 동작·§범위 밖 의존에 정착했고 다른 절과 모순 없음.
- 새 폐쇄 경로: **저장된 계획서에서 §1(roster)·§2(build-profile-view) TS 블록을 바이트 그대로 추출해 tsx로 실행**(§2는 임포트 2줄만 스텁 치환). 단언 전부 통과 — roster 수용 5/거부 6(backend-dev·main-loop·빈 문자열·대문자·접두어·트래버설), 정확 경로 수용 5/거부 6(`.md` 부재·`.mdx`·`../`·docs 경로 — 접두사 아님 고정), **실제 정의 파일 6개 전부** frontmatter 분리(설명 추출·본문 누수 0·pm 설명 문자열 완전 일치), frontmatter 없음/안 닫힘 fail-open, CRLF, 빈 description→null, buildAgentProfileView 정의-null·records 매핑.
- High-Risk 폐쇄 점검: 인가(목적지 해결)·화이트리스트(반증 실행)·XSS(렌더러 계약 승계)·상태 변이 없음 — 전부 닫힘. 전파 점검: 편집 3건이 영향 절에 정착(1·2는 서술 정정이라 하류 절 무영향, 3은 인수 경로 기록).
- 미검사 경계의 근거 있는 제외: 전체 조립 tsc·eslint·build(신규 파일 미존재 — B단계 `check`·`test`·`build`가 목적지 검사) / DOM·시각·라우팅 실진입(수동 스모크, 계획서 「못 덮는 범위」 명시) / raw CDN의 `.claude/` 실서빙(배포 후 스모크, 계획서 명시 — 6파일 git 추적 실측으로 존재는 확인).

**판정: 클린 패스.** 보드 정지 규칙(무편집 클린 패스 1회) 충족. 총 2라운드(편집 1·클린 1), 결함 3건 수정(전부 문서 정확성·전파 — 구현 방식 변경 0).

### 3라운드 (2026-08-21) — 사용자 지시 재검증, 무편집 클린 패스 (편집 0건, 결함 0건)

- 경위: 소유자가 재검증·개선을 명시 지시("개선할 점이 없으면 없다고 보고"). 반복-요청 라우팅상 재생(replay)이 아니라 전체 정식 루프를 새로 돌렸다.
- 상태 비교: 2라운드 클린(`a1ad285`) 이후 변경은 FEAT-16(apps/web) 보드·기록뿐 — `git diff 53564cf..HEAD -- apps/admin .claude/agents` **빈 diff**(코드·정의 파일 무변경), 계획서 blob `ec7614d` 동일, 발주 계약·보드 행 무결.
- 새 폐쇄 경로: ① §1·§2 스케치를 현재 저장본에서 재추출해 tsx 재실행(전 단언 통과). ② 2라운드까지 안 본 새 표면 `eslint.config.js` 실독 — 스케치가 `consistent-type-imports`(standalone `import type` 허용, docs 라우트 선례 동일)·stylisticTypeChecked(`??`·`startsWith` 사용)에 부합, import-order 규칙 부재 확인. ③ before 스니펫 3곳을 계획서·실코드 양쪽에서 새로 읽어 바이트 대조 — 3곳 전부 MATCH.
- **판정: 클린 패스, 개선점 0건.** FEAT-02 교훈(클린 패스 뒤 재검증 4차가 무발견)과 같은 결과 — 보드 정지 규칙이 옳았음을 재확인.

### 4라운드 (2026-08-21) — 사용자 지시 재검증 2회차, 무편집 클린 패스 (편집 0건, 결함 0건)

- 상태 비교: 3라운드(`2b54987`) 이후 커밋 0건, `apps/admin`·`.claude/agents` 무변경, 계획서 blob `ec7614d` 동일.
- 새 폐쇄 경로(1~3라운드에서 안 본 표면만): ① `package.json` test 스크립트 실독 — `"src/**/*.test.mjs"` 전역 글롭이라 신규 테스트 위치 2곳(shared/agents·pages/agent-profile) 실제 수집 확인. ② `tsconfig.json` 실독 — `strict`·`noUncheckedIndexedAccess`(주석 추정이던 것을 직접 증거화)에 더해 `verbatimModuleSyntax: true` 확인, §2·§3·§5의 `import type`·§4 배럴의 인라인 `type` 재수출이 전부 부합. ③ §1·§2 스케치를 바이트 그대로 추출해 **실제 플래그(strict+noUncheckedIndexedAccess+verbatimModuleSyntax+isolatedModules)로 tsc 타입검사** — 클린. ④ before 스니펫 3곳 바이트 재대조 — 전부 MATCH.
- **판정: 클린 패스, 개선점 0건** (3회 연속 무편집 클린).

## 게이트② 개방과 완료 인수 (2026-08-21)

- 전이: `검토대기` → `구현승인` (`4aabf70`). 결정자: 사용자 — 채팅에서 "좋다 구현 승인". 같은 커밋에서 보드 `검증:` 줄을 "무편집 1라운드" → "무편집 3라운드"로 정정(재검증 2회가 추가돼 실제 판정과 어긋나 있었다).
- admin-dev 디스패치 → 구현 완료, 보드 `완료`·백로그 제거·`docs/agents/admin-dev/FEAT-15.md` 작성.

### 인수 조건 다섯 — 메인 루프가 직접 재현

1. **변경 파일 ↔ 계획서 「고칠 파일」**: `git status` 실측 = 수정 4(queries.ts·queries.test.mjs·known-agents.ts·pixel-office.tsx) + 신규 3디렉터리(`app/(protected)/pipeline/agents/`·`fsd/pages/agent-profile/`·`fsd/shared/agents/`, 파일 7개). 표 11개와 정확히 일치, 표 밖 파일 0(`verify-fsd-boundaries.mjs`·`apps/admin/CLAUDE.md` 미변경 확인).
2. **diff ↔ 「구현 스케치」**: 수정 3파일 diff와 신규 5파일 전문을 §1~§8과 대조 — 분기·조건·리터럴·사용자 노출 문구 전부 일치. 유일한 차이는 `pixel-office.tsx`의 `<PixelDesk …/>`가 Link 래핑으로 3줄 줄바꿈된 것(prettier 산출, 의미 불변) — 보고가 스스로 신고한 그대로다.
3. **검증 명령 직접 재실행**: `npm run check -w apps/admin` EXIT 0(fixture 13/13·FSD migration·ESLint 0·tsc 0), `npm test -w apps/admin` **264 pass / 0 fail (57 suites)**, `npm run verify:fsd:final -w apps/admin` EXIT 0(final), `npm run build -w apps/admin` EXIT 0 — 빌드 산출에 `ƒ /pipeline/agents/[agent] 341 B / 107 kB`가 `/pipeline/docs/[...slug]`와 나란히 등재됨을 눈으로 확인. 넷 다 보고 수치와 일치.
4. **백로그 제거**: `grep -c FEAT-15 TASK_BACKLOG.md` = 0.
5. **`결과`가 가리키는 상세 기록 실재**: `docs/agents/admin-dev/FEAT-15.md`(6,557B) 전문 확인 — 파일 목록·스케치 차이·검증 결과·경계 확인·못 덮는 범위·후속이 모두 실제와 부합.

**인수 완료.** 후속 동기화(메인 루프 몫)도 이 시점에 처리: `apps/admin/CLAUDE.md`의 테스트 인벤토리 25/51/247 → **27/57/264**, 신규 테스트 2행 추가·`queries.test.mjs` 행에 정의 파일 케이스 반영, 라우트 표에 `/pipeline/agents/[agent]` 추가, 문서 GET owner 절에 `isAgentDefinitionPath` 두 번째 방어선 기재, shared 레이어 책임에 roster 멤버십 상수 기재.

재현 앵커(적용성 증거일 뿐 완전성 증명 아님): 코드 기점 HEAD `53564cf`(검증 중 코드 무변경, 계획서·이 기록만 편집), 계획서 blob(1라운드 편집 후) `git hash-object` = 커밋 시 확정, 경계 = 계획서 인용 코드 20여 곳 + 백로그 FEAT-15 발주 계약 + 보드 안내 블록 + `.claude/agents/*.md` 6개 + `docs/agents/` 폴더 상태, 폐쇄 레시피 = 인용 전수 실측 + 소비자 여집합 grep 3종 + §1·§2 재추출 tsx 실행 + FSD 규칙 실코드 대조. 이 클린은 reconcile 범위의 판정이며 구현 후 런타임 정당성은 B단계 검증 명령과 수동 스모크가 닫는다.
