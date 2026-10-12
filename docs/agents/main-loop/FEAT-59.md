# FEAT-59 — 메인 루프 기록

## 게이트① (2026-09-30)

소유자가 이 세션에서 업로드 폼 옵션 영역의 UI/UX 개편을 요청했다(「기능은 동일하되 표현되는 ui/ux가 달리
되어야 한다」). 메인 루프가 프로덕션(a-pch.com/dashboard, 소유자 로그인 세션)에서 파일 선택 상태를 1280px·390px로
관찰하고, 현재 화면을 재현한 것과 개편안을 같은 상태로 조작하는 목업(claude.ai artifact 「업로드 옵션 개편안」)을
만들어 제시했다. 소유자가 「좋다. 방금 이야기한 것을 바탕으로 수정을 진행해」로 답했다 — 소유자 직접 발주로
게이트①을 연 것으로 기록한다. 게이트②는 계획 검증 뒤 소유자가 따로 연다.

- 백로그 등재: 목업은 에이전트가 읽을 수 없으므로 합의 내용을 `TASK_BACKLOG.md` FEAT-59 `source`에 명세로 옮겼다
  (관측 ①~⑧, 요구 (a)~(f), 보존, 알려진 동작 차이, 설계 메모).
- 담당: 전부 `apps/web/src/**` 안이라 web-dev.
- 병행: BUG-17(`apps/web/next.config.js`)과 파일이 겹치지 않는다(BUG-15·FEAT-44 전례).
- 관찰 부수 효과: 프로덕션에서 파일을 **선택만** 했다(업로드 버튼은 누르지 않음). `upload_file_selected` 계측 1건이
  기록됐고 소유자에게 알렸다.

## 필수 경로 확정 (2026-09-30)

| # | 경로 | 판정 | 이유 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | **채택** | 모든 항목 |
| 2 | 스케치 추출·실행 | **채택** | ts·tsx 블록 8개(신규 5 + 수정 3) |
| 3 | before/after 기계 적용 | **채택** | 기존 파일 수정 3(`UploadPodcast.tsx`·`CaptionStyleEditor.tsx`·`index.ts`) |
| 4 | 전칭 여집합 열거 | **채택** | 「헬퍼 셋의 유일 소비자」·「상태·핸들러·계측·`upload()` 인자 불변」·「보존」 절 전체 |
| 5 | 돌연변이 검사 | **채택** | 순수 함수 신설 3(`resolveEffectiveCaptionStyle`·`clipCountNotice`·`uploadButtonLabel`/`generationModeHint`) |
| 7 | 음성 시험 | **채택** | FSD 경계(`verify:fsd`)에 기댄다 — 새 atom·새 model·features 내부 상대 임포트 |
| 8 | 실물 렌더 | **채택** | 화면 변경. 레이아웃(2열↔1열·가로 넘침)은 실제 Tailwind 컴파일 + 브라우저로만 판정된다 |
| 6 | 실제 사건 재생 | 비채택 | 외부 신호 해석 없음 |
| 9 | 구조적 아티팩트 | 비채택 | schema·config·생성 파일 변경 없음 |

**하니스 위치**: 스크래치패드 `v59/`(세션 한정). `git archive HEAD apps`로 푼 사본(`wt`)에 루트 `node_modules`를
정션으로 연결했다 — 저장소 작업 트리와 git 메타데이터는 건드리지 않았다. `apply59.py`가 계획서의 코드 블록을
**바이트 그대로** 추출해 사본에 적용한다(before 바이트 일치·줄 범위를 assert로 검사). 렌더 하니스는 esbuild 번들 +
`@tailwindcss/postcss`로 `globals.css`를 실제 컴파일하고, 서버 액션(`useUploadPodcast`)·계측·`next/link`만 스텁으로
바꿨다. `readVideoDurationSeconds`가 만드는 `<video>`는 쿼리 파라미터로 길이를 고정하는 가짜로 대체했다.

## 라운드 1 — 편집 라운드 (소득 6건: 구현 영향 3 · 명세 구멍 1 · 판단 정보 1 · 위생 1)

- **D1 (구현 영향, 경로 3)**: 렌더 교체 범위가 `:168`~`:346`이었다. 그대로 적용하면 `:347`의 `);`가 남아
  `UploadPodcast.tsx(366,3): error TS1128: Declaration or statement expected.` → `:168`~`:347`로 고치고 `:348` `}`는 남는다고 명시.
  「현재 동작」의 렌더 범위도 같은 뿌리라 함께 고쳤다.
- **D2 (구현 영향, 경로 8)**: 스케치가 업로드 버튼을 `files.length > 0` 가드 **안**에 넣어, 파일 선택 전에는 버튼이 사라졌다
  (렌더 실측: 버튼이 `Select File` 하나뿐). 현재 코드는 버튼이 `:214` 가드 **밖**이라 항상(비활성으로) 렌더되고, 백로그 요구
  (a) 「파일 선택 전 화면은 지금과 같다」와 합의 목업도 그렇다. → `@container` 래퍼가 격자(조건부)와 버튼(항상)을 함께 감싸게
  재구성, 「보존」에 명시. 버튼의 `files.length === 0` 조건이 스케치에서 죽은 식이었던 것도 이것으로 되살아난다.
- **D3 (명세 구멍, 경로 5)**: `effective-caption-style` 테스트 명세로 돌연변이 12개 중 `outlineWidth ?? → ||`가 생존했다.
  외곽선 0은 `OUTLINE_WIDTH_RANGE.MIN`이라 실제 저장 가능한 값이고, `||`면 0이 언어 기본값(1.1/1.3)으로 바뀐다 → 「저장된
  `outlineWidth: 0`은 0 그대로」 케이스 추가. `fontSize`·`maxWordsPerLine`의 `||`(0이 범위 밖)와 `uppercase ?? false → || false`는
  등가 변이라 테스트하지 않는다고 명시.
- **D4 (경로 5, 도달 불가 분기)**: `clipCountNotice`의 `known` 판정은 `getMaxFeasibleClipCount`의 미상 가드를 되풀이한 것이라
  `known`을 지운 돌연변이 셋(첫째 조건·둘째 조건·`> 0`→`>= 0`)이 전부 생존했다 — 테스트로 고정할 수 없는 코드다.
  `caption-presets.ts` `captionStyleLabel` 주석과 같은 판단으로 가드를 빼고 `max`만으로 가르게 단순화. 명세 케이스는 그대로
  유효하다(미상 케이스가 budget의 미상→4 규칙을 따르는지를 고정).
- **D5 (소유자 판단 정보, 경로 8)**: 브라우저에서 라디오 그룹에 방향키를 누르면 한 칸마다 선택이 바뀌어 `upload_options_changed`가
  한 건씩 났다(`ArrowLeft on 3 -> checked2=true +1`). 「알려진 동작 차이」에 같은 값 재선택 무발화만 있고 이것이 없었다 → 2번째
  차이로 추가, 「못 덮는 범위」에도 반영. 구현을 바꾸지는 않는다 — 게이트②에서 소유자가 판단할 정보다.
- **D6 (위생, 경로 3)**: 헬퍼 제거 범위 `:39-55`를 그대로 지우면 `:38`·`:56` 빈 줄이 겹친다 → `:39-56`. 에디터 import 추가 줄의
  정확한 위치(`:11` 다음)도 적었다. `clip-count-budget.ts` 인용을 함수 전체(`:23-37`)로 넓혔다.

**경로별 실행 기록(라운드 1)**
- 1: 계획서의 `파일:줄` 인용 전부를 `sed -n`으로 출력해 내용까지 대조. 어긋남은 D1(렌더 범위)뿐.
- 2: 추출 → 사본 적용 → `tsc --noEmit` EXIT 0 · `SKIP_ENV_VALIDATION=1 next lint --file ×8` 경고 0 · `verify:fsd` 통과 ·
  기존 테스트 182/182.
- 3: before 블록 바이트 일치(assert). 적용 범위 결함 D1·D6.
- 4: `languageDefault*` 소비자 전수(`grep -rn` apps·packages) = 에디터 `:82,85,89`뿐. `resolveEffectiveCaptionStyle`의 옛 인라인 대비
  **동작 동등**: 필드 값 격자 × 언어 4개 = 3,892 조합을 옛 코드(HEAD `:39-55` + `:80-90` 그대로 옮김)와 비교해 전부 일치.
  렌더에서 계측 페이로드 모양·자동 보정(저장값 4 → 105초 소스에서 3)·`upload()` 인자 불변 확인.
- 5: 명세를 실행 가능한 테스트로 옮겨(11건) 돌연변이 21개 → 사멸 14, 생존 7(D3 1 + 등가 3 + D4 3).
- 7: 새 atom에 `features` 임포트를 심으니 `[W1] shared cannot import upward from features`, 썸네일에 `pages` 임포트를 심으니
  `[W1] features cannot import upward from pages` + exit 1. 되돌리면 통과.
- 8: 1024px — 격자 `152px 766px`, 4 비활성 + 취소선, 안내 `This video fits up to 3 clips. The AI may return fewer.`, 썸네일
  76×135px·여백 13.5px(=10%)·Bold Yellow 대문자·외곽선 2px, 한국어 전환 시 견본 `진짜 이유는`·흰색·`Default`. 같은 값 클릭 +0,
  다른 값 +1(페이로드 동일 모양), 비활성 클릭 +0. 390px — 넘침 없음(375/390), 1열 293px, 세그먼트·버튼 전폭, 30초 미만 안내
  destructive + 버튼 비활성, 긴 파일명 말줄임. 길이 미상 — 파일 줄 `3.0 MB`만, 일반 안내, 보정 없음. 25% 여백 33.77px, top 캡션
  14.06px(기대 14.07 = 200/1920).

## 라운드 2 — 무편집 라운드 (소득 0)

라운드 1 편집본을 새 사본에 처음부터 다시 적용(`apply59.py` 재작성 — 새 범위 `:347`·`:39-56`을 assert로 검사).
- 2·3: 적용 성공, `tsc` EXIT 0 · lint 경고 0 · `verify:fsd:test` 11/11 · `verify:fsd` 통과 · 전체 테스트 194/194(기존 182 + 새 명세 12).
- 5: 돌연변이 20개 → 사멸 16, 생존 4 전부 등가(계획서에 적은 셋 + 단순화로 생긴 `max === 0`→`max <= 0` — `max`는 음수가 될 수 없다).
- 8: 390px 파일 선택 전 버튼 `Upload and generate clips` 비활성·전폭(308px) — D2 해소. 선택 뒤 넘침 없음·1열·보정·안내·같은 값 +0·
  Review first 전환 시 버튼 `Upload and review clips`. 1024px 파일 선택 전 버튼 우측 정렬·자동 폭(200px), 선택 뒤 2열.
- 1: 편집으로 새로 생긴 인용(`:214`·`:333`·`:11`·`:38`·`:56`·`:348`·budget `:24-30`·`:32-34`) 재대조 일치.

메인 루프 라운드가 무소득이 되어 `plan-verifier` 독립 패스를 부른다.

## 라운드 3 — 독립 패스 #1 (plan-verifier, 2026-10-01)

브리핑은 계약 셋(항목ID·계획서 경로·경로 1·2·3·4·5·7·8 카탈로그 발췌)뿐. 검증자가 계약 준수를 스스로 확인했다.

**보고: 「결함 0건」, 단 본문에 주석 둘.**
- 실행 기록: 1(인용 전부 + constants 골든값 전수 일치), 2(신규 5 + 편집 2를 바이트 추출해 프로젝트 tsconfig로 `tsc` exit 0, 타입 오류
  주입으로 검사가 실제로 도는지 자가검증), 3(before 유일 매치·헬퍼 `:39-56` 제거·import 앵커 일치), 4(atoms 전수 나열로 세그먼트 부재,
  신규 의존 0, 핸들러 어댑터·disable 규칙·버튼 가드 밖), 5(명세 15/15 green, 돌연변이 7종 — `uppercase ?? → ||`만 생존, 계획서가 적은 등가),
  7(외곽선 0 케이스를 빼면 `??→||`가 생존·넣으면 사멸 — 그 케이스가 load-bearing), 8(`react-dom/server`로 썸네일·세그먼트 SSR 20/20).
- **주석 1 — 경로 8 부분 실행**: 편집된 `UploadPodcast` 전체는 렌더하지 않았다(대신 경로 2의 `tsc`로 렌더 교체 전체를 타입 검사).
  **주석 2 — lint 미실행 + 근거 부정확**: `next lint`·`verify:fsd`는 스크래치패드에서 돌리지 않았고, 계획서 6)의 「안 지우면
  no-unused-vars로 `check` 실패」는 `eslint.config.js`가 그 규칙을 `warn`으로 두므로 약간 부정확하다고 적었다(구현엔 무영향).

**메인 루프 판정: 결함 1건(문서 위생) — 클린 패스 아님.**
- 주석 2를 직접 재현했다. `eslint.config.js:27-28` `"@typescript-eslint/no-unused-vars": [ "warn",`, `tsconfig.json`에 `noUnusedLocals`
  0건. 적용 사본에 미사용 헬퍼를 되살려 `next lint --file`을 돌리니 `Warning: 'languageDefaultFontSize' is defined but never used.` +
  **exit 0**. 계획서 문장은 거짓 주장이다 — 구현(헬퍼 제거)은 바뀌지 않으므로 **문서 위생**. 검증자가 결함으로 분류하지 않고 주석으로
  낸 것을 메인 루프가 결함으로 판정한다(`plan-verifier.md` 「결함의 기준」 — 거짓 주장은 결함).
- 주석 1은 판정을 바꾸지 않는다. `UploadPodcast` 전체 렌더는 메인 루프 라운드 1·2가 Tailwind 실컴파일 + 브라우저로 수행했다. 다음
  사이클에서도 부분 실행이면 그 사이클은 무소득 판정 자격이 없다.
- 정지 규칙 계수: 문서 위생만 나온 사이클이라 계수에 넣지 않는다.

**반영(편집)**: 6)의 괄호를 「안 지우면 `next lint`에 `@typescript-eslint/no-unused-vars` **경고**가 셋 남는다 — `eslint.config.js`가
이 규칙을 `"warn"`으로 두고 `tsconfig.json`에 `noUnusedLocals`가 없어 `check`는 통과하지만, 이 저장소의 인수는 lint 경고 0을
본다」로 교체.

## 라운드 4 — 무편집 라운드 (소득 0)

바뀐 것은 6)의 산문 한 문장이다. 코드 블록은 바이트 그대로라 새 사본에 `apply59.py`가 그대로 적용됐다(범위 assert 통과). 새 문장의
사실 셋(`:28` `"warn"`, `noUnusedLocals` 0건, 헬퍼를 남기면 lint exit 0 + 경고)은 위에서 실측했다. 나머지 절은 라운드 2 이후 바뀌지
않았다. 트리 청결: 라운드 3 종료 `git status --porcelain` = `?? nul` 한 줄(세션 시작 전부터 있던 파일).

독립 패스 2사이클째를 같은 브리핑(계약 셋)으로 부른다.

## 라운드 5 — 독립 패스 #2 (plan-verifier, 2026-10-01)

브리핑은 1사이클째와 같은 계약 셋. 검증자가 계약 준수를 확인했다.

**보고: 결함 1건(문서 위생).** 「현재 동작」의 「`files`·`language`·`clipCount`·`reviewBeforeGenerate` — 넷 다 `defaults`로 초기화」가
틀렸다 — `:79` `const [files, setFiles] = useState<File[]>([]);`는 빈 배열이고, 자기 인용(`:80,81,87`)도 셋이다. 스케치는 상태를
「`:79-166` 그대로」 두므로 구현 무영향. 메인 루프가 `:79-81`·`:87`을 다시 읽어 확인했다.
- 실행 기록: 1(인용 전부 + constants 골든값), 2(§1~5 추출 → 프로젝트 strict 설정으로 `tsc` exit 0), 3(에디터 before·배럴 before 바이트
  일치, 헬퍼 제거 `:39-56` 빈 줄 겹침 없음), 4(atoms 나열·새 파일 4개 부재·`languageDefault*` 소비자 전수·radix 재수출·`FileVideo`
  export), 5(명세 16케이스 green, 돌연변이 사멸/생존이 계획 주장과 전부 일치), 7(규칙을 깨는 주입이 해당 테스트를 실패시킴),
  8(`renderToStaticMarkup`으로 썸네일 4분기·세그먼트 — top 10.4166%·bottom 13.5416%·서체·색·외곽선·disabled). `UploadPodcast`
  전체 렌더는 이번에도 하지 않았다(앱 컨텍스트 의존이라고 판단).
- 부수 관찰: 대안 절 `globals.css:1`이 풀 경로가 아니다(결함으로 세지 않음). 1사이클 반영분(lint 근거)은 실측과 일치한다고 재확인.

**정지 규칙 계수**: 문서 위생만 나온 사이클 — 계수에 넣지 않는다.

**문서 위생만 2사이클 연속 — 보드 안내 블록의 「경로 선정이 과했다는 신호」 판단.** 두 결함(lint 근거 문장, 「넷 다」 문장)은 둘 다
경로 1·4가 다루는 **산문 주장**에서 나왔고, 무거운 경로(5·7·8)는 두 사이클 모두 계획서 주장을 그대로 재확인했다. 즉 과했던 것은
경로 수가 아니라, 메인 루프 라운드가 경로 1을 「`파일:줄` 줄 내용 대조」로만 돌리고 **인용 없는 산문 주장**(개수·「전부」·
「실패한다」 같은 단정)을 대조하지 않은 것이다. 그래서 다음 사이클 전에 메인 루프가 계획서 산문 전체를 처음부터 다시 읽어 단정문을
하나씩 실측했다(라운드 6). 다음 항목부터는 메인 루프의 경로 1에 「인용 없는 단정문 대조」를 포함한다 — 경로를 줄이는 대신 경로 1의
범위를 바로잡는 판단이다.

## 라운드 6 — 편집 라운드 (메인 루프 산문 전수 재독, 소득 8건: 전부 문서 위생)

- 「현재 동작」 상태 넷 → 「뒤의 셋은 `defaults`로 초기화」로 교체(독립 패스 #2 결함).
- 「카드는 `Dropzone` 한 개만 담는다」 → 헤더도 담는다(`:171-176` `CardHeader`).
- 길이 안내 줄 → 「길이를 알 때만」(`:322` 조건) 추가.
- 1)의 「인라인 계산과 **바이트 동등**」 → 코드 모양은 다르고 값이 같다(3,892 조합 대조)로 교체. 대안 절 같은 표현도 교체.
- 5)의 「`video-framing`·`caption-preview` 계약과 이미 묶여 테스트됨」 → `video-framing`은 무관, `caption-preview.test.mjs`
  `describe("getPreviewVerticalInset"`(`:180`)이 세 분기를 지킨다로 교체.
- 6)의 「`CAPTION_STYLE_OPTIONS`·`CAPTION_STYLE_PRESETS`는 `:102` 이하에서 계속 쓴다」 → `:31`·`:60`·`:119`·`:138`로 교체
  (`:102` 위에서도 쓴다).
- 8)의 「옵션 래퍼에 `@container`」 → 라운드 1 D2 뒤로 래퍼가 업로드 버튼(항상)까지 감싸므로 그렇게 교체.
- 대안 절 `globals.css:1` → `src/styles/globals.css:1` `@import "tailwindcss";`.

코드 블록 10개는 편집 전 저장본과 바이트 동일(스크립트 대조). `ToggleGroup`의 `""` 방출 주장은 `@radix-ui/react-toggle-group`
`dist/index.mjs:53` `onItemDeactivate: React.useCallback(() => setValue(""), [setValue])`로 확인 — 사실이라 두었다.

## 라운드 7 — 무편집 라운드 (소득 0)

새 사본에 `apply59.py` 적용 성공(범위 assert 통과). 라운드 6이 새로 쓴 인용(에디터 `:31`·`:60`·`:119`·`:138`, 테스트 `:180`,
`UploadPodcast.tsx:322`·`:171-176`) 전부 내용 일치. 트리 청결: 독립 패스 #2 종료 `git status --porcelain` = `?? nul`.

독립 패스 3사이클째를 같은 브리핑으로 부른다.

## 라운드 8 — 독립 패스 #3 (plan-verifier, 2026-10-01)

브리핑은 같은 계약 셋. 검증자가 계약 준수를 확인했다.

**1차 보고: 결함 0건, 실행하지 못한 경로 없음 — 단 수정 파일 둘을 적용 상태로 돌리지 않았다.** 경로 2는 신규 5파일을 격리 컴파일·
lint했고, 경로 8은 썸네일·세그먼트만 렌더했다. 검증자 스스로 「`CaptionStyleEditor` 파일 전체 in-context 재컴파일은 하지 않았다」고
적었다. 계획서 「고칠 파일」의 기존 파일 수정 둘(`UploadPodcast.tsx`·`CaptionStyleEditor.tsx`)은 경로 2·8의 대상이므로, 라운드 5에서
정한 대로 이 상태로는 무소득 판정 자격이 없다. BUG-17 라운드 2와 같은 방식으로 같은 검증자에게 **범위 확인 + 환경 사실**(루트
`node_modules`의 esbuild·`@tailwindcss/postcss`·react-dom, 헤드리스 Chrome 경로, `git archive` 사본 + 정션으로 전체 `tsc`·`next lint`·
`verify:fsd`를 돌릴 수 있다는 것)만 보내 두 파일을 적용 상태로 마저 돌리게 했다. 메인 루프의 결과·결함 정보는 보내지 않았다.

**재보고: 결함 0건.**
- 2(적용 상태): 전체 트리 사본에 계획서 전부를 적용 → `tsc --noEmit -p tsconfig.json` exit 0 · `next lint` 「No ESLint warnings or
  errors」 · `verify-fsd-boundaries.mjs` 통과. 격리분: strict 설정 `tsc` 클린, 새 명세 테스트 19 pass.
- 3: 에디터 before `diff` 바이트 동일, 적용 뒤 341→323행으로 계획 산술과 정합.
- 4: 추출 함수 = 에디터 인라인을 **116,645 조합**(언어 5개)으로 대조 → 불일치 0.
- 5·7: 돌연변이 7종 전부 사멸, 불변식 위반 주입이 해당 테스트를 실제로 실패시킴.
- 8(적용 상태): `CaptionStyleEditor` 적용본 전체를 `renderToStaticMarkup` — null+English 122/5/1.1, null+Korean 130/3, 저장 fontSize 90 +
  outlineWidth 0 → 「Outline width: 0」(falsy 0 보존), `CaptionPreviewPlayer` 포함 무예외. `UploadPodcast`는 `useUploadPodcast`가 끄는
  `features/upload/api`(server-only)가 tsx 런타임 임포트에서 멈춰 컴포넌트째 SSR은 못 하고, 적용본의 return 본문을 바이트 추출해 실제
  자식 컴포넌트로 감싸 4상태를 렌더했다 — 빈(`Select File` + 버튼, 격자 없음), 60초(radiogroup 3·안내 「This video fits up to 2 clips.
  The AI may return fewer.」·클립 옵션 2개 disabled·썸네일·`1:00`), 20초(destructive 안내·clipHint 없음·버튼 비활성), Korean+review
  (「Upload and review clips」·「Edit clips before generating.」·견본 「진짜 이유는」).
- 검증자는 이 마지막 항목을 「실행하지 못한 경로 — 8(UploadPodcast) 부분 한정」으로 적었다.

**메인 루프 판정 — 경로 8 소진으로 본다.** 계획이 바꾸는 것은 `UploadPodcast`의 **렌더 본문과 import**이고, 그 본문 전부를 모든 분기에서
실렌더했다. 렌더하지 못한 것은 상태 훅 껍데기(`:79-166`, 계획이 「그대로 둔다」는 코드)이고 원인은 계획과 무관한 server-only 임포트다.
컴포넌트 전체(훅 포함) 실렌더는 메인 루프 라운드 1·2가 `useUploadPodcast`를 스텁으로 바꾼 브라우저 하니스로 수행했다. 브라우저 전용
관측(컨테이너 폭 전환·키보드·가로 넘침)은 계획서 「못 덮는 범위」이자 배포 확인 원장 대상이다.

**트리 청결 검산(메인 루프 직접)**: 라운드 종료 `git status --porcelain` = `?? nul` 한 줄. 무수정 확인.

**판정: 독립 무편집 클린 패스 — 3사이클째 결함 0, 필수 7경로 전수.** 1·2사이클은 문서 위생만(계수 제외)이었다. 보드에 `검증:` 줄을
쓴다. 게이트②는 소유자 몫이다.

## 게이트② (2026-10-01)

소유자가 「BUG-17, FEAT-59 구현 승인」으로 게이트②를 열었다. 계획서는 클린 패스본(`501b744` 시점) 그대로다.
메인 루프가 게이트② 판단 사항으로 올린 둘에 소유자는 별도 지시 없이 승인했다 — 계획서대로 간다.
- 「알려진 동작 차이」 둘(같은 값 재선택 무발화 · 방향키 한 칸마다 발화): 계획서대로 수용.
- 썸네일 견본 문구 `the real reason` / `진짜 이유는`: 계획서대로.

## 인수 (2026-10-01)

web-dev가 `완료`로 보고했다. 인수 조건 다섯을 메인 루프가 직접 재현했다.
1. **변경 파일 ↔ 「고칠 파일」**: `git status --porcelain` — 코드 11개(수정 3: `UploadPodcast.tsx`·`CaptionStyleEditor.tsx`·
   `caption-style/index.ts` / 신규 8: model 3 + 테스트 3 + `CaptionStyleThumbnail.tsx` + `segmented-control.tsx`). 계획서 표와 1:1, 초과 0.
2. **diff ↔ 「구현 스케치」**: 스크립트로 대조 — 신규 5파일이 스케치 블록과 **바이트 동일**, 에디터는 after 블록 포함·before 소멸·헬퍼
   소멸·import 한 줄, 배럴은 after 포함, `UploadPodcast.tsx`는 렌더 블록이 바이트 그대로 들어가 `}`로 닫히고 HEAD의 함수 본문
   (`:41-167`)이 그대로 남았다. import는 계획대로(여러 줄 서식만 다름 — 승인 네 범주 밖).
3. **검증 명령 재실행**: `npm run check -w apps/web` EXIT 0(`verify:fsd:test` 11/11 · `verify:fsd` 통과 · `next lint` 경고 0 · `tsc` 통과),
   `npm test -w apps/web` **198/49/0**(기준 182/45 + 새 테스트 16·suite 4).
4. **백로그 제거**: `TASK_BACKLOG.md`에서 FEAT-59 항목 4줄 삭제, 남은 언급 0.
5. **상세 기록 실재**: `docs/agents/web-dev/FEAT-59.md`(8,831바이트). 보드 `결과` 108자.

**구현본 실물 렌더(메인 루프 추가 확인)**: 작업 트리 `apps/web`을 스크래치패드로 복사(`diff -rq`로 동일 확인)해 계획 검증 때와 같은
브라우저 하니스로 띄웠다. 390px — 파일 선택 전 `Select File` + 비활성 `Upload and generate clips`, 넘침 없음(390/390), 선택 뒤 1열
`308px`·`4` 비활성·저장값 4→3·안내 문구·같은 값 재클릭 +0·한국어 전환 시 견본 `진짜 이유는`·`Default`, 계측 페이로드 모양 불변.
1024px — 격자 `152px 766px`, 넘침 없음. 스크린샷에서 견본의 `L`이 `I`처럼 보였으나 글자 범위를 재니 두 줄 38px·34px로 썸네일
안쪽(76px) 여유 안 — 하니스가 Anton 대신 Impact로 대체 렌더한 것이고 잘림은 없다.

**범위 밖 의존**: 계획서 「없음」 — 백로그 후보 없음.

**문서 갱신(메인 루프)**: `apps/web/CLAUDE.md` 테스트 표에 web-dev가 비고로 낸 3행을 넣고(검증에서 나온 돌연변이 근거를 덧붙임),
머리말을 「현재 30개 파일, 49 suite, 198개 테스트」로 갱신(`find src -name "*.test.mjs" | wc -l` = 30 실측).

**배포 확인 원장**: `docs/release-checks.md`에 FEAT-59 절 6줄 등재(배치·넘침, 선택 전후, 세그먼트 조작, 썸네일, 클립 상한(BUG-17 뒤),
설정 미리보기 회귀). 전부 로그인 뒤 web 화면이라 `〔auto〕` 태그 없음.

## 배포 (2026-10-01, 소유자 승인)

소유자의 「웹 배포」 지시로 `dev`→`main` PR #128을 만들었다(FEAT-58·BUG-16·BUG-17·FEAT-59, 32커밋). 합류 직전 `dev`에서 web·admin
`build` 둘 다 EXIT 0을 직접 확인했다(이 합류가 `@repo/db` 생성 클라이언트를 바꾸므로 admin도). FEAT-58의 DB → 백엔드 → 웹 순서는
마이그레이션 적용(같은 날)과 Modal v31로 앞 두 단계가 끝나 있었다.

main 저장소 규칙(`require_last_push_approval`)이 같은 계정의 푸시·합류를 막아(`gh pr merge --merge` → 「base branch policy prohibits
the merge」) 우회 합류는 소유자에게 물었다. 소유자가 「admin으로 합쳐」로 답해 `gh pr merge 128 --merge --admin` → `78cffe1`
(21:58 KST). Vercel 배포는 합류 약 400초 뒤 프로덕션 CSP 응답이 바뀐 것으로 판정했다.

**배포 확인(원장)**: 프로덕션 `/dashboard`를 로그인 브라우저로 열고 파일을 **선택만** 했다(업로드 없음 — `upload_file_selected`
계측이 3건 남았다). 원장 줄 닫음과 근거는 `docs/release-checks.md` BUG-17·FEAT-59 절에 있다.
- 닫은 줄: 배치·넘침(1280px 2열 `152px 766px`, 390px 1열 넘침 없음), 클립 상한(87.6초 → `3`·`4` 비활성·4→2 보정·안내, 2초 → 차단),
  설정 미리보기 회귀(한국어 130/3/1.3, 영어 122/5/1.1).
- 열어 둔 줄과 이유: 「선택 전후」(Replace 클릭 교체는 확인, 끌어다 놓기 교체는 미확인), 「세그먼트 조작」(값 상태는 확인, 방향키·마우스
  전환을 프로덕션에서 직접 누르지 않았다), 「썸네일」(소유자 설정이 한국어 Default·여백 0이라 Noto Sans KR 견본만 봤다 — 영어 Anton·여백 띠는
  미확인).
