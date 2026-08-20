# FEAT-14 — main-loop 기록

## 게이트① 개방 (2026-08-19)

- 전이: `승인대기` → `계획지시`
- 결정자: 사용자 — 채팅에서 "계획서 작성해" (FEAT-13 선례와 같은 개방 지시)
- 기록자: 메인 루프 (규약: 사용자가 게이트를 열고 메인 루프가 기록한다 — `docs/agents/README.md`)
- 경위: 소유자 직접 발주(pm 미경유, 최우선 지정)로 `fa1ad00`에서 승인대기 진입. 발주 계약은 `TASK_BACKLOG.md`의 FEAT-14 항목(관측 3·요구 5·스코프 결정 3·비목표 — 소유자와의 설계 대화에서 합의). 같은 날 게이트① 개방
- 다음: admin-dev 디스패치 → `docs/plans/FEAT-14.md` 작성 → `검토대기`

## 계획서 검증 (2026-08-19) — reconciling-proposals-with-codebase, High-Risk 프로파일

대상: `docs/plans/FEAT-14.md`(admin-dev 작성, `78b8365`). 프로파일 근거: 신규 인가 라우트 + `dangerouslySetInnerHTML` + URL 파라미터가 fetch 경로가 됨 + 신규 fetch owner + 게이트 쓰기 버튼의 새 진입점.

### 1라운드 — 결함 7건, 통합 편집 1배치

폐쇄 경로: 인용 전수 실측(계획서가 인용한 파일 18곳 — page.tsx·agent-report queries·pixel-office·known-agents·pipeline/ui·briefing·board·pipeline index·gate index·transitions·agent-report index·package.json·globals.css·verify-fsd-boundaries·layout·middleware·eslint.config·briefing.test), **스케치 렌더러 JS 이식 실행**(원판·수정판·블록판 3종), deepEqual 스타일 확인.

1. **[실질·실행 실증] renderInline 자리표시자 충돌.** 공백-숫자-공백(`" 0 "`) 자리표시자가 평문과 충돌 — `"결함 0 건, 총 2 라운드였다"` → `"결함건, 총라운드였다"`로 조용히 삭제(이식 실행 실측). 렌더 대상인 검증 기록·구현 보고가 정확히 이런 텍스트다. `CODE_SLOT = String.fromCharCode(0)` 구분자로 교체(수정판 실행으로 보존·XSS 방어·인접 코드·볼드 내 코드 전부 확인), 테스트 명세에 회귀 단언 추가.
2. **[조립·린트] 라우트 스케치 lint 불통.** `let boardItem = null`이 `any`로 넓혀져 `no-unsafe-argument`(recommendedTypeChecked, `eslint.config.js:17`) 발화, `as never` 우회는 계획서 스스로 "구현 시 고친다"고 표시 — 스케치가 승인 대상이라는 원칙 위반. 정타입 스케치로 교체(`BoardItem`·`AgentReport` 타입 임포트).
3. **[조립] `docSourceUrl` 이중 재수출 경로.** doc-location.ts가 config 임포트·재수출 + root도 config에서 재수출 → TS 중복 export 오류 위험, "순수, 임포트 없음" 헤더와 자기모순. doc-location에서 제거하고 root export 목록을 명시.
4. **[인용] 줄번호 4건** — `page.tsx:16-28`→`:16-29` · `PixelOffice :251-278`→`:251-279` · `verify-fsd :33-38`→`:32-38`(2곳) · `globals :11-13`→`:11-12`.
5. **[인용] §8 before 비정합.** page.tsx before가 실제 4줄 `Promise.all`을 1줄로 압축해 기계 적용 불가(FEAT-10 ⑬류). 실제 바이트로 교체.
6. **[문구] 나타나지 않는 카피.** `이 문서를 찾을 수 없습니다.`는 `notFound()`→Next 기본 404 경유라 어디에도 렌더되지 않는데 사용자 노출 카피 목록에 있었다(게이트② 승인 대상 오염). 제거·서술 정정.
7. **[정확성] raw CDN 잔상 범위 과소 + 존재 요구 일관.** max-age=300 잔상은 상태 칩만이 아니라 문서 본문·신규 문서 404에도 적용 — 못 덮는 범위 확장. `REQUIRED_FINAL_FILES`에 신규 라우트 page.tsx 추가 지시((protected) 페이지 전부 등재 일관).

결함 아님으로 닫은 것: SpeechItem·buildBriefing·inboxSpeech·feedSpeech·InboxCard·FeedZone·DeskReports·ROSTER_ORDER·BoardItem/Section·gate root(`RejectAction` 타입 수출 확인)·agent-report 패턴·package.json 의존성 부재·globals 토큰 6종·middleware matcher(신규 라우트 Edge 보호 포함)·layout:11·R13/final owner 대조 지점 전부 실측 일치. briefing.test의 deepEqual은 id 배열에만 걸려 `docs` 필드 추가와 양립(기존 단언 유지 주장 실증). briefing.test가 features root(UI 포함)를 이미 임포트하므로 build-doc-view.test의 같은 경로 임포트는 선례로 안전. XSS 방어 실행 실측: 원시 HTML escape·`javascript:` 링크 차단·href의 `&quot;` 무해·미닫힘 펜스·CRLF 안전. 게이트 액션 재진입점의 동시성은 기존 sha 낙관적 잠금·스테일 가드가 그대로 덮는다(FEAT-08·13 검증 승계).

### 2라운드 — 무편집 클린 패스 (편집 0건, 결함 0건)

- 저장본 전문 재독. 새 폐쇄 경로: **저장된 계획서에서 §2(doc-location)·§3(markdown) TS 블록을 바이트 그대로 재추출해 tsx로 실행** — 단언 30개 전부 통과. 화이트리스트 경계 전수: 트래버설(`..`)·세그먼트 내 슬래시(`%2F` 디코드 경로)·`%` 문자·루트 밖(`config`)·길이 위반·확장자 위장(`.md.txt`)·하위 경로(`x/y.md`) 전부 차단, 한글 고정명(`감사기록`) 통과. `docLinksForItem` 순서(계획→검증→구현)·미지 행위자 제외·href 형식 일치. 렌더러: 자리표시자 회귀(평문 숫자 보존)·XSS(`<script>` escape·`javascript:` 링크 불변환)·표 셀 내 코드·펜스 내부 escape·CRLF·빈 입력.
- 상태 전이 표 전 행 답변: 초기(3층 인가 → slug 디코드) / 성공(화이트리스트+raw 200 → RSC 렌더) / 실패(화이트리스트 밖·404 → `notFound()`, 5xx → throw → 기존 페이지들과 같은 error 경로) / 종말 상태 복구(뒤로가기·헤더 내비) / 재진입(force-dynamic 매 요청 재fetch) / 입력 변화(slug 변경=서버 재렌더, 클라 상태 없음) / 클린업(뷰어 자체 타이머·구독 없음) / 프레임워크 전제(Next 15.5.7 async params — 설치 버전 실측).
- 상태 변이 경계: 게이트 도장·반려는 기존 서버 액션 재사용 — 이중 제출은 스테일 가드, 경쟁 커밋은 sha 낙관적 잠금, 부분 실패는 단일 파일 PUT 원자성(FEAT-08·13 검증 승계). 신규 쓰기 경로 0. 인가는 신규 라우트 목적지에서 `requireAdmin()` 재검사(3중 방어선 유지).
- High-Risk 폐쇄 점검·전파 점검(수정 7건이 표·스케치·테스트·못 덮는 범위·§9에 전파됨) 완료.
- 미검사 경계의 근거 있는 제외: 전체 조립 tsc·eslint·build(신규 14파일 생성이 필요 — B단계 `check`·`test`·`verify:fsd:final`이 파이프라인 자체의 목적지 검사이며 실패 시 보류 규약; 스케치는 줄 단위 타입·린트 감사 완료) / DOM 시각(수동 smoke 규약, 계획서 명시) / 실제 CDN 응답(module-mock 계약 + FEAT-12 실측 승계).

**판정: 클린 패스.** 보드 정지 규칙(무편집 클린 패스 1회) 충족. 총 2라운드(편집 1·클린 1), 결함 7건 수정.

재현 앵커(적용성 증거일 뿐 완전성 증명 아님): 코드 기점 HEAD `78b8365`(검증 중 코드 무변경, 계획서·이 기록만 편집), 계획서 blob `4837cf3`(수정 후, 커밋 예정), 경계 = 계획서가 인용한 코드 18곳 + 백로그 FEAT-14 발주 계약 + `docs/plans/template.md` + 보드 안내 블록, 폐쇄 레시피 = 인용 전수 실측 + 스케치 줄 단위 타입·린트 감사(recommendedTypeChecked 실측) + §2·§3 재추출 tsx 실행 30단언 + briefing.test deepEqual 호환 실측. 미시험 경계와 제외 근거는 위 2라운드 절. 이 클린은 reconcile 범위의 판정이며 구현 후 런타임 정당성은 B단계 검증 명령이 닫는다.

## 계획서 재검증 (2026-08-20) — reconciling-proposals-with-codebase, High-Risk 프로파일

사용자 재지시. 직전 클린 패스(2026-08-19, 2라운드) **이후 계획서가 편집됐으므로** readiness가 리셋된 상태에서 시작했다
(Tier-0: 모든 소스 편집은 readiness를 리셋한다). 보드의 `검증:` 줄은 이 시점에 이미 낡아 있었다.

### 3라운드 — 편집 1건 (블로커 1)

**[블로커·정확성] GFM 이스케이프 파이프 `\|`를 표 셀 분리가 존중하지 않는다.**
§3 `splitRow`가 `split("|")`로 순진하게 쪼개, 셀 안의 `\|`가 열 경계로 오인된다.

실측 근거 — **합성 프로브가 아니라 저장소의 실제 문서 18개에 렌더러를 실행**했다(직전 라운드가 못 잡은 이유가 여기 있다.
그 라운드는 §2·§3을 재추출해 30단언을 돌렸으나 입력이 전부 구성된 예제였다):

```
표 148행 검사 → 5행 파손
  docs/plans/BUG-05.md:70  헤더 2열 vs 행 6열
  docs/plans/BUG-05.md:73  헤더 2열 vs 행 3열
  docs/plans/FEAT-06.md:88 헤더 2열 vs 행 3열
  docs/plans/FEAT-06.md:92 헤더 2열 vs 행 3열
  docs/plans/FEAT-13.md:37 헤더 2열 vs 행 3열   ← `validation: string \| null`
```

즉 **문서를 렌더하는 것이 목적인 기능이, 자기 형제 문서 3개의 표를 깨뜨린 채 출시된다.** 계획서 「테스트」의
표 케이스는 이스케이프 없는 표만 덮어 테스트는 초록으로 통과한다 — 조용히 틀리는 종류다.

수정: 비이스케이프 파이프에서만 분리하고 셀 안에서 `\|`→`|` 복원. 끝 파이프 제거도 이스케이프를 보게 했다
(`(?<!\)\|\s*$` — 안 그러면 `...\|`로 끝나는 행에서 역슬래시가 남는다). 수정본 실측: **파손 0행, 회귀 0행.**

전파 3곳: §3 스케치(수정) · §3 전제(지원/미지원 문법 재기술) · 「테스트」(순진한 `split("|")` 복귀를 사멸시키는 돌연변이 단언 추가).

`docs/plans/FEAT-07.md:91`은 수정 후에도 쪼개진다 — 인라인 코드 안의 **비이스케이프** 파이프이고,
GFM 명세(§4.10)와 GitHub이 동일하게 쪼갠다. 스케치 결함이 아니므로 §3 전제에 그렇게 명시했다.

### 4라운드 — 무편집 클린 패스 (편집 0건, 결함 0건)

저장본 재독 후 전 게이트 재확인. 이 라운드에서 새로 닫은 경로:

- **보안 경계 실행 검증** — §2를 바이트 그대로 추출해 37단언 실행, 전부 통과. `locationFromSlug` 거부:
  트래버설·점 세그먼트·잘못된 root·길이 위반(초과/미달/빈 slug)·인코딩 우회(`..%2f..%2fenv`)·디코드된 `../../.env`·
  슬래시 포함·후행 공백·틸드·빈 세그먼트·agents 깊이 초과. `isWhitelistedDocPath` 2층 거부: `docs/../env`·`src/env.js`·
  `docs/other/x.md`·`docs/plans/..md`·`docs/agents/./FEAT-14.md`·`/etc/passwd`·확장자 뒤 트래버설·빈 문자열.
  slug→path→2층 재검사 왕복 3건 일치. 한글 고정명(`감사기록`) 통과.
- **수정본 전체 재실행** — 문서 18개 렌더, 원시 위험태그 0·`javascript:` URL 0·CODE_SLOT 잔재 0·표 파손 0(FEAT-07:91 제외, 위 근거).
  직전 라운드가 보고한 `on*=` 류는 전부 코드펜스 내부의 escape된 문자열(`onClick={() =&gt; ...}`)로 오탐 확인.
- **인용 재대조** — `docs/agents/README.md:16-27`은 오늘 `backend-dev` 추가로 내용이 바뀌었으나 계획서 주장(보고 행위자 여섯)과
  여전히 일치. `known-agents.ts:32-38`(다섯)·`pipeline/page.tsx:18-22` 바이트 일치·`agent-report/api/queries.ts:37-62`·
  `verify-fsd-boundaries.mjs:32-38`(fetch owner 다섯)·`:46-63`·`:580-591` 메시지 문자열·`:665-676`·`globals.css` 토큰 6종·
  `package.json:21-42`(마크다운 의존성 부재)·`eslint.config.js:17`·`layout.tsx:11` 전부 재실측 일치.
- **컴파일 가능성** — `GateTransitionButton({id,status,label})`·`RejectActions({id,status,actions})` 실제 시그니처 일치.
  `resolveGateTransition(fromStatus: string)`·`rejectActionsFor(fromStatus: string)` 일치. `BoardSection.items` 실재.
  `PROHIBITED_PIPELINE_EXPORTS`(5개 UI 심볼)에 `latestItemById` 없음 → R10 미발동. `AgentReport.name`이 확장자 포함
  파일명이라 `r.name === \`${itemId}.md\`` 성립. `replaceAll`·lookbehind는 `lib: ES2022`에서 가용(tsconfig 실측).
- **인가** — 신규 라우트가 middleware matcher `/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)`에 포함되어
  Edge 보호되고, 목적지에서 `requireAdmin()` 재검사. 3층 모두 확인.
- `flatten`(briefing.ts:42-56)이 첫 등장 우선이므로 신규 `latestItemById`와 규칙 동일 — 뷰어 상태 칩과 결재함 카드가
  같은 행을 가리킨다.

**판정: 클린 패스.** 보드 정지 규칙(무편집 클린 패스 1회) 충족. 이 세션 2라운드(편집 1·클린 1), 누적 4라운드·결함 8건.

재현 앵커(적용성 증거일 뿐 완전성 증명 아님): 코드 기점 HEAD `5aeb4bc`(검증 중 코드 무변경, 계획서·이 기록만 편집),
경계 = 계획서가 인용한 코드 18곳 + 백로그 FEAT-14 발주 계약 + 보드 안내 블록,
폐쇄 레시피 = 인용 전수 재실측 + §2 추출 37단언 + §3 추출 후 **실제 문서 18개 렌더 대조**(합성 프로브 아님) + 컴포넌트 시그니처 대조.
미시험 경계: 전체 조립 tsc·eslint·build(신규 14파일 필요 — B단계 검증 명령이 목적지), DOM 시각(수동 smoke 규약), 실제 CDN 응답.

## 계획서 재검증 (2026-08-20, 2회차) — reconciling-proposals-with-codebase, High-Risk 프로파일

사용자 재지시. Repeat-Request Routing에 따라 리플레이가 아닌 전체 캐노니컬 루프.
직전 패스가 못 닫은 경로 하나를 이번에 닫았다 — **스케치를 실제 툴체인에 통과시켜 본 적이 없었다.**
`apps/admin` 미러(`.fm14`)에 §1~§9를 적용해 진짜 tsc·ESLint·FSD·테스트를 돌렸다.

### 5라운드 — 편집 1건 (블로커 1)

**[블로커·검증 게이트] 스케치가 `check`의 ESLint 0 기준을 통과하지 못한다.**

계획서 §7 말미는 *"`check`의 lint 0 기준"*을 명시적으로 인지하고 스케치가 그것을 만족한다고 전제했다.
**그 전제가 거짓이었다.** 미러에 스케치를 그대로 적용하고 실제 ESLint를 돌린 결과:

```
ESLint EXIT=1 — 오류 4건
  repo-doc/api/queries.ts:35    prefer-optional-chain        `m && m[1] !== undefined`
  repo-doc/model/markdown.ts:62 prefer-string-starts-ends-with  /^```/.test(line)
  repo-doc/model/markdown.ts:66 prefer-string-starts-ends-with  !/^```/.test(lines[i] ?? "")
  repo-doc/model/markdown.ts:88 prefer-includes              /-/.test(next)
```

기준선 대조: 수정 전 `apps/admin` 현재 tree에 같은 명령 → **EXIT 0**. 즉 4건 전부 이 계획이 새로 들이던 것이다.
`stylisticTypeChecked`(`eslint.config.js:17`)가 켜져 있어 전부 **error**다 — 경고가 아니다.

결과적으로 admin-dev가 스케치를 글자 그대로 구현하면 B-5의 `npm run check`가 실패하고,
자기 계약("실제 출력을 봤고 모두 통과했다 / 아니면 보류")에 따라 **`보류`로 기록하고 멈춘다.**
계획서가 스스로 막겠다고 적은 실패를 계획서가 일으킨다.

수정: 네 곳을 `startsWith`/`includes`/옵셔널 체이닝으로 교체.
**동작 보존 실증** — 수정 전후 렌더러로 문서 18개를 렌더해 출력 **421,098바이트 전량 바이트 일치**, 경계 케이스 8개도 일치.

전파: §3·§4 스케치(수정, 이유 주석 포함) · §7 말미 lint 단락(추정 → 실측 근거로 교체).

### 6라운드 — 무편집 클린 패스 (편집 0건, 결함 0건)

**저장된 계획서에서 코드 블록을 다시 추출해 미러에 재기록**한 뒤(전사 오차 제거) 툴체인 전량 재실행.

```
계획서 블록 ↔ 미러 파일   6/6 바이트 일치 (불일치 0)
tsc --noEmit                        EXIT 0
eslint src                          EXIT 0
verify-fsd-boundaries.mjs --final   EXIT 0
경계 fixture                        12/12
기존 테스트 스위트                  187/187 pass, 0 fail
```

**187/187이 닫은 것**: 계획서가 *"기존 단언(inbox/feed/team) 유지"*라고 주장했는데,
`SpeechItem`에 필수 필드 `docs`를 더하고 `buildBriefing`에 선택 인자를 붙이는 변경이다.
직전 라운드들은 이걸 코드 읽기로만 판단했다. 이번엔 실제로 돌려서 확인했다.

`--final` EXIT 0이 닫은 것: §9의 `FSD_EFFECT_OWNERS.fetch` 한 줄 추가로 owner 집합이 실제 tree와 정확히 일치하고,
`REQUIRED_FINAL_FILES`에 넣은 `src/app/(protected)/pipeline/docs/[...slug]/page.tsx`가 **대괄호 경로인데도** 존재 검사를 통과한다.

부수 확인: §6 프로세 명세의 `status!` 비널 단언은 `no-non-null-assertion`이 이 설정에 없어 lint를 통과한다(실측).

**판정: 클린 패스.** 이 세션 2라운드(편집 1·클린 1), 누적 6라운드·결함 9건.

재현 앵커: 코드 기점 HEAD `be9df1d`(검증 중 `apps/admin` 무변경 — 미러는 저장소 밖 사본이며 검증 후 제거),
경계 = 계획서 §1~§9 전체 + 인용 코드 18곳 + 실제 툴체인 5명령,
폐쇄 레시피 = **계획서 블록 추출 → 미러 재기록 → 바이트 대조 → tsc·eslint·fsd:final·fixture·test 실행**.
미시험 경계: `npm run build`(Next 라우트 방출·Tailwind `.doc-prose` 방출 — B-5의 네 번째 명령이 목적지),
DOM 시각(수동 smoke 규약), 실제 CDN 응답(module-mock 계약), §6 UI는 프로세 명세라 내 재현 구현으로만 lint 확인.

## 계획서 재검증 (2026-08-20, 3회차) — 소득 0건

사용자 재지시. 전체 캐노니컬 루프. **결함 0건, 편집 0건 — 개선할 점이 없었다.**
소득 없는 라운드도 기록한다: 무엇을 닫았는지가 다음 라운드의 중복 조사를 막는다.

검증 기반이 여전히 유효함을 먼저 확인했다 — `docs/plans/FEAT-14.md`는 `3517ff5`(툴체인을 통과한 바로 그 내용)
이후 무변경이고, `apps/admin`은 `e48120c`(FEAT-13) 이후 무변경이다. 즉 5·6라운드의 실행 증거가 그대로 적용된다.

이번에 새로 닫은 경계 셋(직전 라운드가 「미시험」으로 남긴 것들):

1. **`.doc-prose` CSS 명세 실현 가능성.** §8의 목록을 집 관례(`@apply`, `globals.css:152-159`의 `@layer base` 패턴)대로
   구현해 실제 Tailwind v4.1.17 PostCSS 파이프라인에 통과시켰다 — **컴파일 성공, 출력 111,135바이트, 경고 0건.**
   `.doc-prose h1/table/blockquote` 방출 확인, Gowun Batang·`var(--stamp)`·`var(--active)` 해소 확인.
   §8이 `@apply`인지 생 CSS인지 명시하지 않는 것은 사실이나, **두 읽기 모두 동작한다**(토큰은 `@theme inline`에 등록돼
   있어 유틸리티로도 변수로도 쓸 수 있다). 오해를 낳는 텍스트가 아니라 두 정답이 있는 미명세라 블로커가 아니다.

2. **테스트 명세의 구현 가능성.** 계획서가 기술한 `globalThis.fetch` 저장·스텁·`after` 복원 패턴은
   기존 테스트 **4개**(`entities/pipeline/api`·`run-pipeline-command/api` 둘·`transition-pipeline-gate/api`)에
   선례가 있다. `~/env` mock이 추가로 필요하다는 계획서 지시도 맞다 — `repo-doc/api/queries.ts`가
   `getPlanDocIds`에서 `env`를 읽기 때문이고, 선례인 `pipeline/api/queries.test.mjs`가 `~/env`를 목하지 않는 것은
   `getPipelineBoard`가 raw CDN이라 토큰이 없어서다.

3. **GitHub contents API 요청 예산.** 이 기능은 `/pipeline`에 1회(`getPlanDocIds`), 뷰어 1회 열람마다 4회
   (plans 1 + agents 1+N)를 더한다. 보드 본문은 raw CDN이라 한도와 무관하다. 비인증 한도는 60/시간이라
   문제로 보였으나, **게이트 PUT이 토큰을 하드 요구하고**(`commit-gate-transition.ts:38-39`,
   없으면 "GitHub 토큰이 설정되지 않았습니다"로 실패) 그 기능이 배포돼 쓰이고 있으므로 프로덕션에 토큰이 있다.
   인증 시 5,000/시간이라 증가분은 유의미하지 않다. 계획서에 caveat을 억지로 넣지 않는다.

**판정: 클린 패스(무편집).** 누적 7라운드·결함 9건.

수확 곡선: 1–2라운드 7건 → 3–4라운드 1건 → 5–6라운드 1건 → **7라운드 0건.** 검증이 수렴했다.
보드 안내 블록의 정지 규칙이 이 지점을 가리킨다 — "재검증은 계획서나 그것이 인용하는 코드가 바뀌었을 때만 돌린다".
다음 유의미한 증거는 구현 자체(B단계 `check`·`test`·`verify:fsd:final`·`build`)에서 나온다.

남은 미시험 경계(변동 없음): `npm run build`의 Next 라우트 방출(B-5 네 번째 명령이 목적지),
DOM 시각·반응형(수동 smoke 규약), 실제 CDN/contents 응답(module-mock 계약), §6 UI 프로세 명세.

## 계획서 재검증 (2026-08-20, 4회차) — 소득 0건, 마지막 미시험 게이트 폐쇄

사용자 재지시. 전체 캐노니컬 루프. **결함 0건, 편집 0건 — 개선할 점이 없었다.**
다만 이번 라운드는 빈손이 아니다: 7라운드까지 두 번 「미시험」으로 남겼던 **`npm run build`를 실제로 돌렸다.**

### 방법

`apps/admin-fm14`(같은 깊이 — `next.config.js`가 `../../.env`와 `outputFileTracingRoot: ../../`를 쓰므로
경로 전제를 재현해야 한다)에 저장된 계획서의 §1~§9를 적용하고 진짜 `next build`를 실행했다.
§6은 프로세 명세라 그 지시대로 재현했고, §8의 `.doc-prose`는 집 관례(`@apply`)로 구현했다.

### 결과 — EXIT 0

```
✓ Compiled successfully
Route (app)
  ƒ /pipeline/docs/[...slug]      365 B    128 kB
  ƒ /pipeline                    1.62 kB   130 kB
ƒ  (Dynamic)  server-rendered on demand
```

계획서 「테스트」가 건 조건 — *"빌드 결과의 route 목록에 `/pipeline/docs/[...slug]`가 있어야 한다"* — **충족.**
`ƒ`(동적)로 잡혔으므로 `force-dynamic`도 반영됐다. `.next/server/app/(protected)/pipeline/docs/[...slug]/` 실재 확인.

산출 CSS 검사: **`.doc-prose` 규칙 21개 방출**, `Gowun Batang`·`var(--stamp)` 포함.
7라운드의 격리된 PostCSS 프로브를 실제 프로덕션 번들로 승격해 닫았다.

첫 시도는 `next.config.js`의 `@prisma/nextjs-monorepo-workaround-plugin` 타입 선언 부재로 실패했으나,
이는 **새 디렉터리라 `.next/types`가 없어서 생긴 미러 인공물**이다(실제 `apps/admin`은 이전 빌드 산출물이 있어
`tsc --noEmit` EXIT 0). FEAT-14가 건드리지 않는 파일이며, 셤 한 줄 추가 후 EXIT 0. 계획서 결함이 아니다.

부수 관찰(FEAT-14 무관, 기존 조건): Sentry가 `global-error.js` 부재를 경고한다. 이 항목 범위 밖.

**판정: 클린 패스(무편집).** 누적 8라운드·결함 9건.

수확 곡선: 7 → 1 → 1 → 0 → **0.** 두 라운드 연속 소득 0이고, B-5의 네 명령
(`check`·`test`·`verify:fsd:final`·`build`)이 **전부 실행 증거로 닫혔다.**

남은 미시험 경계는 이제 원리적으로 이 단계에서 닫을 수 없는 것들뿐이다:
DOM 시각·반응형(수동 smoke 규약), 실제 raw CDN/contents 응답(module-mock 계약),
`GateTransitionButton`/`RejectActions`의 클라이언트 상호작용(FEAT-08·09에서 이미 못 덮음으로 기록).
다음 유의미한 증거는 구현 자체에서 나온다.

## 게이트② 개방 (2026-08-20)

사용자가 `구현승인`으로 전이했다. 메인 루프가 보드를 편집했고 결정은 사용자의 것이다.
`검증:` 줄은 유지한다 — 전진 전이라 보드 규약의 제거 대상(계획 재작성으로 가는 전이)이 아니다.

검증 종료 상태: 8라운드, 결함 9건 수정, 마지막 두 라운드 소득 0.
B-5 네 명령이 모두 실행 증거로 닫힌 상태에서 구현에 들어간다
(`check` tsc·ESLint·fixture 12/12 / `test` 187/187 / `verify:fsd:final` / `build` EXIT 0 + 라우트 방출).

구현 뒤 메인 루프가 인수 조건 다섯을 직접 재현한다 — 에이전트 보고가 아니라 직접 본 것이어야 한다.

## 완료 인수 (2026-08-20)

admin-dev의 보고를 받지 않고 보드 안내 블록의 인수 조건 **다섯을 직접 재현**했다.

**① 변경 파일 ↔ 「고칠 파일」** — 기계 대조: 계획서 선언 25개, 실제 변경 25개, **정확 일치.**
선언했으나 미변경 0건, **선언 밖 변경 0건**(범위 위반 없음).

**② diff ↔ 「구현 스케치」** — 계획서 코드 블록 6개를 추출해 구현 파일과 바이트 대조: **5개 완전 일치.**
불일치 1건은 §3 19행 `"\uFFFD"` → 리터럴 `"�"`로, admin-dev가 **스스로 신고한** 차이이며 런타임 동일 문자열이다
(`node -e` 확인). 분기·조건·리터럴 값·노출 문구 불변.
§8·§9 편집 실물 확인: `latestItemById` · `splitRow`의 `(?<!\)\|` 이스케이프 처리 · `startsWith`/`includes`
(정규식으로 되돌리지 않음) · fetch owner 6번째 · `REQUIRED_FINAL_FILES` 신규 4 · `기록 {reports.length}건` ·
`getPlanDocIds` · `.doc-prose` · `DocLinks`.

**③ 검증 명령 직접 재실행** — 보고서 수치가 아니라 내 셸의 출력이다.

```
npm run check -w apps/admin              EXIT 0   ✔ No ESLint warnings or errors
npm test -w apps/admin                   EXIT 0   247 pass / 51 suites / 0 fail
npm run verify:fsd:final -w apps/admin   EXIT 0   FSD boundary check passed (final)
npm run build -w apps/admin              EXIT 0   ƒ /pipeline/docs/[...slug]  366 B
```

**④ 백로그 제거** — `TASK_BACKLOG.md`에 `FEAT-14` 잔존 0건, 빈 섹션도 정리됨.

**⑤ 상세 기록 실재** — `docs/agents/admin-dev/FEAT-14.md` 8,523바이트.

보드 `결과` 129자 / 150 이내.

### 메인 루프가 처리한 handoff

admin-dev는 `apps/admin/CLAUDE.md` 쓰기 권한이 없어 셋을 넘겼고(둘은 자기 신고, 하나는 내가 여집합 확인에서 추가):

1. 「테스트 인벤토리」 `21파일·40suite·187test` → **`25파일·51suite·247test`**. 숫자는 러너 출력과 파일 전수로 직접 셌다.
   신규 4행(doc-location·markdown·repo-doc queries·build-doc-view) 추가, board.test·briefing.test 설명 확장.
   갱신 후 대조: 표 25행 ↔ 실제 25파일, 누락 0·유령 0.
2. 「데이터와 외부 효과 소유권」에 6번째 fetch owner 추가 — 두 방어선(라우트 slug 검증 + api 층 경로 재검사)을 명시.
3. **(추가)** 「앱 개요」 라우트 표에 `/pipeline/docs/[...slug]` 누락 — admin-dev가 신고하지 않았다.
   여집합 확인(라우트를 나열하는 문서를 전수)에서 잡았다.

### 미실행으로 남은 것

배포 후 수동 smoke 1~5(인가 보호·카드 링크·plan/report 렌더·화이트리스트 밖 404·게이트 가시성)는 인가 브라우저가 필요해
구현 세션에서 실행하지 않았다. smoke 6(게이트 버튼 클릭)은 실제 `PROJECT_BOARD.md`를 바꾸는 외부 효과라
계획서가 명시적으로 **누르지 말라**고 적었고 지키지 않을 이유가 없다.
