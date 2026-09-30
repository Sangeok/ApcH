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
