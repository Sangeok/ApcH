# FEAT-45 — 메인 루프 기록

## 게이트① (2026-09-15)

소유자 직접 발주(pm 미경유) — 세션 지시 "feat 45 수행하자". FEAT-42 인수 직후 메인 루프가 다음 작업 1순위로 제안한 항목이다. `계획지시`로 보드에 기록했다.
발주 시점 보드 미결은 0건이다(`보류` FEAT-01 제외). `dev` = `origin/dev`.

담당은 `web-dev`다 — area가 전부 `apps/web` 안이다(백로그 「범위 밖 의존 없음」). 선행이 없고, FEAT-48(참고 번역 블록)·FEAT-49(Korean 샘플 미리보기)의 선행이다.

**발주 전 앵커 실측** — 백로그 인용 일부는 FEAT-42 뒤 낡았다. 계획서는 현재 트리로 다시 확인해 적는다.
- 헤더 안내: `widgets/clip-draft-review/model/review-language-notice.ts:19` `` return `Subtitles will be translated to ${trimmed} when you generate. This review shows the English transcript.`; `` — 일치.
- 카드 라벨: `widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx:482` `English transcript` — 일치. 조건은 `:118` `showsEnglishSourceForTranslation(language)`.
- 캡션 편집기 안내: 백로그는 `CaptionStyleEditor.tsx:310-311`이라 했지만, **FEAT-42가 이 문장을 `sample ? … : …` 삼항의 else 분기로 옮겨 지금은 `features/caption-style/ui/CaptionStyleEditor.tsx:318-323`**이다
  (`:321` `Korean clips are translated at render time — the words here are the` · `:322` `English source.`). 같은 삼항의 샘플 분기(`:313-316`, 설정 화면 전용)는 FEAT-42가 넣은 문구다.
- 골든 테스트: `review-language-notice.test.mjs:10-11` `KOREAN_NOTICE`, `:43` Spanish 문구 — 일치.
- 교차 인용 주석: `review-language-notice.ts:10`이 `CaptionStyleEditor.tsx:310-311의 기존 문구와도 일관된다`고 적는다 — 줄 번호가 이미 낡았고, 이번 항목이 그 문구 자체를 바꾼다.
  `widgets/clip-draft-review/ui/index.tsx:281`·`:425` 주석도 편집기 안내를 언급한다.
- 옛 문구를 인용하는 메인 루프 소유 문서(인수 때 메인 루프가 갱신):
  - `apps/web/CLAUDE.md:83` — 테스트 표 `review-language-notice.test.mjs` 행의 「English transcript」
  - `docs/release-checks.md:108` — FEAT-43 절의 열린 줄. 「English transcript」 라벨이 영어 그대로인 게 정상이라고 인용한다
  - `docs/release-checks.md:120`·`:121` — FEAT-37 절의 열린 줄. 옛 헤더 안내 골든 문구와 라벨을 인용한다

### 계획 단계에서 반드시 다룰 것

- **최종 카피 세 개를 정확히 정한다.** 헤더 안내, 카드 라벨, 캡션 편집기 라이브 안내 문장. 뜻은 "영상에서 실제로 들리는 말(영어)"이다 — 소유자가 "transcript가 의미하는 게 뭐냐"고 물었던 것이 발단이다.
  앱 UI는 영어이므로 문구도 영어로 쓴다(`widgets/clip-display/model/subtitle-status.ts` 머리 주석). 헤더 안내는 지금처럼 언어 값(`Korean`)을 문장에 넣는지 정한다. 사용자에게 보이는 문자열은 계획서에 글자 그대로 적는다.
- **표시 조건·레이아웃은 바꾸지 않는다.** `reviewLanguageNotice`의 판정(English·nullish·공백은 null, trim, "English 아님" 판정)과 `showsEnglishSourceForTranslation ≡ reviewLanguageNotice !== null` 계약은 그대로다.
  문구만 바뀐다는 것을 before/after로 보인다.
- **골든 테스트 갱신.** `KOREAN_NOTICE`와 Spanish 문구를 새 카피로 바꾼다. 기존 테스트가 지키던 것(trim 돌연변이를 문구로 잡는 것 등)이 새 문구에서도 성립하는지 확인한다.
  테스트 수는 그대로여야 한다(기준선 `npm test -w apps/web` **154**).
- **캡션 편집기 문장은 라이브 분기만 고친다.** 샘플 분기(`:313-316`)는 FEAT-42 설정 화면 문구다 — 바꿀 필요가 있는지 따로 판정하고 근거를 적는다(현재 "transcript/source" 표현을 쓰지 않는다).
  검토 다이얼로그 외의 편집기 소비자(설정 화면)가 영향받지 않음을 보인다.
- **다른 백로그 항목과의 결합.** FEAT-48이 카드 라벨 바로 아래에 "참고 번역" 블록을 붙인다 — 새 원문 라벨이 그 번역 라벨과 짝이 되게 정한다(두 라벨을 한 번에 맞추는 것이 FEAT-45가 먼저인 이유다).
  FEAT-49는 같은 편집기 문장을 이 항목 뒤에 동작에 맞게 다시 고친다 — 이 항목은 표현만 바꾸고 동작 서술을 늘리지 않는다.
- **교차 인용 주석.** `review-language-notice.ts:10`의 낡은 줄 번호 인용과 "기존 문구와도 일관" 서술을, 바뀐 문구 기준으로 고칠지 정한다.
  줄 번호 대신 내용 앵커로 쓴다(FEAT-44 결정: 교차 파일 줄번호 인용은 곧 낡는다). `ui/index.tsx:281`·`:425` 주석도 옛 문구를 인용하는지 확인한다.
- **못 덮는 범위.** 실제 검토 화면에서 새 문구가 보이는지는 배포 후 확인이다.
- (정정 — 발주 기록 자체의 위생) 위 앵커의 카드 라벨 조건 `ClipDraftCard.tsx:118`은 실제 `:115` `const showsEnglishSource = showsEnglishSourceForTranslation(language);`다. 계획서는 바르게 인용했다.

## 계획서 수령 (2026-09-15)

web-dev 계획서 `8947bcf` — 수정 4, 신규 0. 새 문구 셋이 어구 "what's said in the video, in English"를 공유한다. 보드 `계획지시` → `검토대기`를 같은 커밋으로 푸시했다.

## 검증 필수 경로 확정 (2026-09-15, 카탈로그 `docs/plans/verification-paths.md`)

- **1 인용 전수 대조** — 모든 항목.
- **2 스케치 추출·실행** — before/after 여섯 쌍을 실제 트리에 적용해 `npm run check -w apps/web`·`npm test -w apps/web`, 끝나면 원복.
- **3 before/after 기계 적용** — 수정 4파일.
- **4 전칭 여집합 열거** — "이 세 문구 외에 transcript/source 사용자 문구는 없다", "`ui/index.tsx` 주석은 바뀌는 문구를 인용하지 않는다".
- **5 돌연변이 검사** — 순수 함수 `reviewLanguageNotice`의 반환 문구가 바뀐다. 계획서가 "trim 제거 돌연변이가 새 문구에서도 잡힌다"고 주장한다.
- **7 음성 시험** — "ESLint `react/no-unescaped-entities`가 JSX 텍스트의 raw `'`를 막아 `&apos;`가 필요하다"에 기댄다.
- **8 실물 렌더** — 카드 라벨·편집기 안내 화면 문구 변경.
- 6(외부 신호 없음)·9(schema·config·생성 파일 없음) 트리거 없음.

## 1라운드 (2026-09-15, 메인 루프 — 위생 결함 2건, 편집)

하니스는 스크래치패드 `feat45/`에 있다(`apply45.mjs`·`mutate45.mjs`·`neg45.mjs`·`render45.mjs`·`restore45.mjs`). 계획서 코드 블록 12개(before/after 여섯 쌍)를 바이트 그대로 적용했고 하니스 작성분은 0이다.

- **경로 1**: 인용을 전부 다시 읽었다.
  - `review-language-notice.ts:3,10-11,16-18,19,25-29`, `review-language-notice.test.mjs:10-11,18-30,32-37,36,39-45,42-44,48-72`
  - `ClipDraftCard.tsx:115,480,482,485-487`, `CaptionStyleEditor.tsx:313-316,315,318-323,319-320,321-322`
  - `ui/index.tsx:234,281,285-289,425,432`, `release-checks.md:108,120,121`, `apps/web/CLAUDE.md:83`

  불일치 하나: 계획서는 `ui/index.tsx:281`·`:425` 둘 다 편집기를 "줄번호로" 참조한다고 했지만, 줄번호가 있는 것은 `:281-282`(`CaptionStyleEditor\n:310-311`)뿐이고 `:425`는 이름만 쓴다(**위생 결함 H2**).
- **경로 2·3**: 여섯 before 전부 트리와 바이트 일치 1회. `npm run check -w apps/web` **EXIT 0**(verify:fsd 통과, ESLint 0, tsc 0), `npm test -w apps/web` **154/154**(수 불변).
- **경로 4**
  - 계획서의 grep 범위(검토 화면 설명 문구)는 세 파일뿐으로 성립한다.
  - 그러나 서술이 "`apps/web/src` 전체에서 … 없다"로 넓다. 여집합 열거로 공개 마케팅·정책 페이지의 `transcript` 카피(`how-it-works`·`guides`·`podcast-to-shorts`·`product-tour`·`product-copy`·`privacy` `Transcript text`)와 전사 로드 실패 서버 메시지(`features/clip-review/api/index.ts:40,47`)가 나왔다(**위생 결함 H1** — 전칭 과대).
  - 실패 서버 메시지는 `transcriptErrorMessage`가 `AddCustomClipPanel.tsx:85`의 `!== null` 판정에만 쓰여 화면에 나오지 않음을 확인했다. 범위 판단(세 문구만)은 옳고 서술만 넓다.
  - 교차 줄번호 인용 주석은 `review-language-notice.ts:10`(계획서가 고침)과 `ui/index.tsx:281-282`(계획서가 범위 밖으로 남김)뿐이다.
- **경로 5**: 새 문구 트리에 돌연변이 6종 — trim 제거, 언어값 삽입 제거, English 제외 제거, 옛 문구 복귀, 새 어구 한 글자 변경, `showsEnglishSource` 항상 true. **6/6 사멸** → 계획서의 trim 주장이 성립한다.
- **경로 7**: JSX 텍스트를 raw `'`로 되돌리니 두 파일 모두 `react/no-unescaped-entities` error로 exit 1(`ClipDraftCard.tsx:482:19`·`CaptionStyleEditor.tsx:322:17`). 대조군 `&apos;`는 exit 0.
- **경로 8**: `renderToStaticMarkup`(FEAT-42 스텁 훅 재사용).
  - 카드 Korean → 새 라벨 `What's said in the video (English)` 바로 뒤에 영어 원문 본문. English → 라벨 없음(조건 불변).
  - 편집기 라이브 → 앞 두 문장 불변 + 새 마지막 문장, 옛 `English source` 없음. 샘플 분기(FEAT-42 설정 화면) 문구 불변.
  - 헤더 안내는 `reviewLanguageNotice("Korean")`이 새 문구, English → null, `ui/index.tsx`가 `{languageNotice}`로 그대로 렌더 — 위젯 정적 렌더는 react-query·재생 URL 훅에 묶여 생략하고 이 대조로 대신했다.
  - 11/11.

**편집** (구현 영향 0, 위생 2):
- H1: 여집합 서술을 "검토 화면·캡션 편집기의 설명 문구는 이 셋뿐"으로 좁히고, 마케팅·정책 페이지와 실패 서버 메시지를 제외 근거와 함께 열거.
- H2: `ui/index.tsx` 주석 서술을 "줄번호는 `:281-282`만, `:425`는 이름만"으로 정정.

원복 후 `apps/web/src` 변경 0. 편집이 있었으므로 2라운드 무편집 재실행.

## 2라운드 (2026-09-15, 메인 루프 — 무편집, 무소득)

편집한 계획서(`36456dc`)를 같은 하니스로 처음부터 다시 적용·실행했다. 계획서는 고치지 않았다(1라운드 편집은 산문뿐이라 코드 블록 12개가 같다).

- **경로 1**: 편집으로 새로 들어간 인용 — `pages/how-it-works/config/index.ts:20,30`·`pages/guides/config/index.ts:145,165,209,211`·`pages/podcast-to-shorts/config/index.ts:45`·`pages/product-tour/config/index.ts:25`·`shared/config/product-copy.ts:28`·`app/(public-marketing)/how-it-works/page.tsx:16`·`privacy/page.tsx:106,245`·`features/clip-review/api/index.ts:40,47`·`use-clip-draft-review.ts:316-320`·`AddCustomClipPanel.tsx:85,90`·`ui/index.tsx:281-282,425` — 1라운드 여집합 열거 출력과 대조해 전부 일치.
- **경로 2·3**: 여섯 before 바이트 일치 1회씩. `npm run check -w apps/web` **EXIT 0**, `npm test -w apps/web` **154/154**.
- **경로 4**: 좁힌 전칭("검토 화면·캡션 편집기의 설명 문구는 이 셋뿐")이 1라운드 열거로 성립한다. 새 전칭은 없다.
- **경로 5**: 돌연변이 6/6 사멸.
- **경로 7**: raw `'` → 두 파일 `react/no-unescaped-entities` exit 1, 대조군 exit 0.
- **경로 8**: 렌더 실패 0(11/11).

원복 후 `apps/web/src` 변경 0. → `plan-verifier` 1사이클 디스패치(브리핑은 항목ID, 계획서 경로, 필수 경로 목록만).

## plan-verifier 1사이클 (2026-09-15) — 결함 0건, 실행하지 못한 경로 없음 → 클린 패스

- **브리핑**: 항목ID, 계획서 경로, 필수 경로 1·2·3·4·5·7·8만 전달했다. 검증자가 계약 준수를 확인했다.
- **경로별 증거 실질**
  - 1: 인용 전수 일치 — 여집합 인용(마케팅 config·전사 실패 메시지)과 인수 메모 인용(`release-checks.md:108,120,121`·`apps/web/CLAUDE.md:83`) 포함. `ui/index.tsx:281-282`의 낡은 `:310-311` 참조와 실제 `:318-323`을 대조했다.
  - 2: 변경 전 전체 스위트 154/35/0. after 모듈과 테스트를 조립해 7/0(테스트 수 불변).
  - 3: TS·MJS before 네 블록(`:19`·`:10-11`·`KOREAN_NOTICE`·Spanish) 바이트 일치 1회씩.
  - 4: 계획서 grep 범위의 "이 셋뿐" 성립, 여집합이 검토 화면 밖 문맥임을 확인.
  - 5: 변이 5종 전부 사멸(trim 제거·English 대소문자·length 가드·`${trimmed}` 하드코딩·`!==`→`===`).
  - 7: 새 카피를 드리프트시키면 골든 3 fail(골든이 새 문구를 실제로 고정). JSX raw `'`는 `react/no-unescaped-entities` 발화, `&apos;`본은 0.
  - 8: after JSX 두 조각(카드 라벨·편집기 문장)을 `renderToStaticMarkup`으로 렌더 — 표시 `What's said in the video (English)`·em dash 정상.
- **[실행하지 못한 경로]**: 없음.
- **범위 메모(판정 근거의 투명성)**
  - 검증자의 경로 3은 TS·MJS 네 블록을 기계 적용했고, JSX 두 블록(카드 라벨·편집기 문장)은 경로 7·8에서 조각으로 다뤘다.
  - 경로 8은 컴포넌트 전체가 아니라 after JSX 조각을 렌더했다.
  - 두 JSX before의 바이트 일치와 전체 컴포넌트 렌더(카드 Korean/English 분기, 편집기 샘플 분기 불변)는 메인 루프 1·2라운드가 실측했다. 검증자 보고가 필수 경로를 전부 실행했다고 적고 미실행 경로가 없으므로 무소득 보고로 판정한다.
- **트리 청결 직접 확인**(`git status`): `apps/web/src`·`docs`·`packages` 변경 0. 남은 것은 무관한 `settings.local.json`·`nul`.
- **판정**: 독립 무편집 무소득 패스 1회 → **클린 패스**. 보드에 `검증:` 줄을 기록했고 status는 `검토대기` 그대로다(게이트② `구현승인`은 소유자만 연다).
- **반영된 결함 분류**: 위생 2(H1 전칭 과대, H2 줄번호 인용 서술). 구현 영향 0.

**인수 때 메인 루프 몫**
- `apps/web/CLAUDE.md:83` 테스트 표 `review-language-notice.test.mjs` 행의 「English transcript」를 새 카피로 갱신한다(테스트 수 154 불변).
- `docs/release-checks.md`
  - FEAT-37 절 `:120`·`:121`을 `대체(FEAT-45)`로 마감한다.
  - FEAT-43 절 `:108`의 라벨 인용을 갱신한다.
  - FEAT-45 절에 새 카피 기준 확인 줄을 등재한다.
- 범위 밖으로 남긴 관측: `ui/index.tsx:281-282` 주석의 낡은 `CaptionStyleEditor :310-311` 인용 — 백로그 후보로 제시할지는 인수 때 판단한다. 원장 FEAT-37 절의 옛 문구 인용 줄(`:120`·`:121`)은 인수 때 `대체(FEAT-45)`로 마감하고 새 문구 기준 확인 줄을 등재한다 — 계획서 「못 덮는 범위」에 그 대응을 적는다.
