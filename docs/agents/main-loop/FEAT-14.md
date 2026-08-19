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
