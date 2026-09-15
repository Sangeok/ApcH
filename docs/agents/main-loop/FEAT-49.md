# FEAT-49 — 메인 루프 기록

## 게이트① (2026-09-15)

소유자 직접 발주(pm 미경유) — 세션 지시 "feat 49 수행하자". FEAT-46이 다른 세션에서 진행되는 동안 **FEAT-46과 겹치지 않고 병행할 수 있는 항목**을 소유자가 물었고, 메인 루프가 1순위로 제시한 항목이다. `계획지시`로 보드에 기록했다.
발주 시점 보드 미결은 1건이다 — FEAT-46 `검토대기`(다른 세션 소관, `26dae40`). `보류` FEAT-01은 제외. `dev` = `origin/dev`.

담당은 `web-dev`다 — area가 전부 `apps/web/src/fsd/features/caption-style` 안이다(백로그 「범위 밖 의존 없음」).

**병행 판정 근거 (FEAT-46과의 겹침)**
- 파일: FEAT-46 계획서의 고칠 파일은 `apps/backend/main.py`·`reference_translation.py`·`test_reference_translation.py`다(`docs/agents/main-loop/FEAT-46.md` 「계획서 수령」). 이 항목의 area와 교집합이 없다.
- 공유 작업 트리: 두 세션이 같은 체크아웃을 쓴다. 커밋은 경로 지정 스테이징으로만 하고, 보드는 서로 다른 행이다.
- 남은 결합은 BUG-14뿐이다 — Korean 큐 묶기를 바꾸면 이 항목의 전제(큐 타이밍)가 바뀐다. BUG-14는 소유자 실물 확인이 선행이라 지금은 움직이지 않는다.
- FEAT-50(검토 다이얼로그)과 FEAT-44(주석 앵커)는 인접 파일을 건드리므로 이 항목과 **동시에 돌리지 않는다.**

**발주 전 앵커 실측** — 백로그 인용 대부분이 FEAT-42·45 뒤 낡았다. 계획서는 현재 트리로 다시 확인해 적는다.
- 폰트 분기: 백로그 `CaptionPreviewPlayer.tsx:104` → 현재 `ui/CaptionPreviewPlayer.tsx:108` `    language === "Korean" ? "var(--font-noto-sans-kr)" : "var(--font-anton)";`.
- 대문자 CSS: 백로그 `:148` → 현재 `:155` `              textTransform: props.uppercase ? "uppercase" : "none",`.
- 그리는 텍스트: 백로그 `:155` `{activeText}` → 현재 `:162` `{displayText}`. **FEAT-42가 분기를 넣었다** — `:112` `const displayText = props.sample === true ? firstCueText(cues) : activeText;`. 영어 원문이 그려지는 곳은 `sample !== true`(라이브) 분기뿐이다.
- 줄당 단어 기본값: 백로그 `CaptionStyleEditor.tsx:41` → 현재 `ui/CaptionStyleEditor.tsx:43` `function languageDefaultMaxWords(language: string): number {`.
- 편집기 안내: 백로그 `:310-311` → FEAT-45가 풀어 써서 현재 라이브 분기 `:318-323`(`:321` `Korean clips are translated at render time — the words shown here are` · `:322` `what&apos;s said in the video, in English.`). 샘플 분기는 `:313-316`(설정 화면 전용).
- 큐 묶기: `model/caption-preview.ts:12` `export function buildCaptionCues(` — 일치. `uppercase`를 큐 텍스트에 직접 적용한다(`:35` `text: uppercase ? text.toUpperCase() : text,`).
- 실렌더 대문자: `apps/backend/main.py:584` `            # 한글에는 no-op, 줄에 섞인 영문만 대문자화된다.` — 일치.
- Korean 렌더 묶기: `main.py:410` `def create_korean_subtitles_with_ffmpeg(` → `:456` `        elif len(current_words) >= max_word:` → `:468` 잔여 flush. 영어 경로(`:341`·`:351-352`)와 같은 형태다.
- **샘플 상수는 이미 있다** (백로그 「자산 공유」의 "먼저 구현하는 쪽"은 FEAT-42였다): `model/sample-captions.ts:20` `const KR_WORDS = [`(9단어), `:36` `export function sampleCaptionWords(language: string): TranscriptWord[] {`, `:41` `firstCueText`, `:47` `firstSampleCueText`. 테스트 `model/sample-captions.test.mjs`.
- 편집기 소비자 둘: 검토 다이얼로그 `widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx:71` `<CaptionStyleEditor`(sample 미전달, `words`는 카드의 `wordsInRange` — `ClipDraftCard.tsx:525`), 설정 화면 `pages/settings/ui/index.tsx:229` `<CaptionStyleEditor`(sample).
- 교차 서술: `widgets/clip-draft-review/model/review-language-notice.ts:10` `문장 안의 언어명도 값("Korean")이 맞고, CaptionStyleEditor의 라이브 미리보기 안내와도` — 편집기 안내 문장을 바꾸면 이 서술의 참이 흔들린다(area 밖 파일).
- 기준선: `npm test -w apps/web` → tests 154 · suites 35 · pass 154 · fail 0.

### 계획 단계에서 반드시 다룰 것

- **적용 범위는 라이브 분기다.** 설정 화면 샘플 분기는 이미 Korean이면 `KR_WORDS`를 그린다. 이 항목이 설정 화면을 바꾸는지(요구 ②의 Uppercase 표기는 편집기 공통이라 두 화면 모두에 나올 수 있다) 소비자별로 before/after를 적는다.
- **샘플 텍스트를 무엇으로 채우는지 정한다.** 요구 ①은 "큐 타이밍·개수 그대로, 텍스트만 한국어 샘플 문장 배열에서 순환"이다.
  - 기존 `KR_WORDS`(단어 토큰)를 재사용할지, 문장 배열을 새로 둘지 판정한다. 백로그는 "두 벌을 만들지 않는다"고 했다 — 새로 둔다면 같은 파일 안에서 기존 상수와의 관계를 정리한다.
  - 실렌더에서 한 큐의 한국어는 "영어 `max_word`단어의 번역"이다. 샘플 한 줄의 길이를 무엇에 비례시킬지(고정 문장 · Words per line에 따라 변화) 정하고 근사임을 「못 덮는 범위」에 적는다.
  - 판정 로직(Korean 여부·큐 인덱스 → 샘플 텍스트)은 순수 함수와 테스트로 둔다. `buildCaptionCues` 계약과 `caption-preview.test.mjs`는 **불변**이다.
- **언어 판정.** 기존 편집기·플레이어는 `language === "Korean"`으로 판정한다. 같은 판정을 쓰는지 근거와 함께 정한다.
- **Uppercase(요구 ②).** 비활성화와 "한글에는 효과 없음" 표기 중 택일하고 근거를 적는다. 실렌더는 줄에 섞인 영문을 대문자화하므로(`main.py:584`) "완전 무효"가 아니다 — 비활성화하면 저장된 `uppercase: true` 값의 표시·해제 경로가 어떻게 되는지도 다룬다(프리셋 `matchPresetId`가 `uppercase`를 비교하는지 확인).
- **Words per line(요구 ③).** Korean에서의 의미("영어 원문 N단어씩 끊어 번역")를 드러낼지 정한다.
- **안내 문장(요구 ④).** 라이브 분기 `:321-322`를 새 동작에 맞게 고친다. 사용자에게 보이는 문자열은 계획서에 글자 그대로 적는다(앱 UI는 영어). `review-language-notice.ts:10`의 교차 서술이 새 문장 뒤에도 참인지 판정한다 — 거짓이 되면 area 밖 한 줄 수정이 필요한지 적는다.
- **샘플임을 화면에 밝힌다(요구 ①).** 영상은 사용자 것인데 글자는 샘플이다 — 오독 방지 문구의 위치를 정한다.
- **다른 항목과의 결합.** BUG-14가 Korean 묶기를 바꾸면 따라간다는 사실을 적는다. FEAT-44가 이 폴더의 `main.py:\d+` 주석을 앵커로 바꾼다 — 이 항목은 그 주석을 고치지 않는다(범위를 섞지 않는다). 줄이 밀리는 것은 FEAT-44의 앵커 방식이 흡수한다.
- **못 덮는 범위.** 실제 Korean 업로드 검토 화면에서 샘플의 크기·줄 길이가 실제 렌더 클립과 대략 비슷해 보이는지는 배포 후 육안이다.
- **메인 루프 몫(인수 때).** 테스트 수가 늘면 `apps/web/CLAUDE.md`의 테스트 개수·표를 갱신한다. 계획서는 늘어나는 테스트 수만 적는다.

## 계획서 수령 (2026-09-15)

web-dev 계획서 `docs/plans/FEAT-49.md` — 수정 5(`sample-captions.ts`·`CaptionPreviewPlayer.tsx`·`CaptionStyleEditor.tsx`·`review-language-notice.ts` 주석·`sample-captions.test.mjs`), 신규 0. 기존 `KR_WORDS`를 재사용해 큐마다 영어 단어 수만큼 순환 치환(`koreanSampleCues`), `buildCaptionCues` 계약 불변. Uppercase는 비활성화 대신 Korean 힌트 표기(프리셋 `matchPresetId`가 `uppercase`를 비교하고 저장값이 갇히는 문제 회피), 라이브 안내는 Korean/English 분기. 예상 test 154→159. 보드 `계획지시` → `검토대기`를 계획서와 같은 커밋(`b082bd5`)으로 푸시했다.

## 검증 필수 경로 (카탈로그 대조)

1 인용 전수(모든 항목) · 2 스케치 추출·실행(코드 블록 15) · 3 before/after 기계 적용(기존 파일 수정 5) · 4 전칭 여집합(「영어 원문이 그려지는 유일한 지점」·「여기 없는 파일은 고치지 않는다」·「props만 넘기므로」) · 5 돌연변이(순수 함수 신설) · 7 음성 시험(`buildCaptionCues` 계약 불변에 기댐) · 8 실물 렌더(화면 변경). 6(외부 신호 해석)·9(schema·config·생성 파일) 해당 없음.

## 검증 1라운드 (2026-09-15) — 편집 라운드

**격리**: 다른 세션이 같은 체크아웃에서 FEAT-46을 진행 중이라 실제 트리에 적용하지 않았다. `git worktree add --detach scratchpad/wt49 b082bd5` + `node_modules` 정션 둘(루트·`apps/web`)로 격리 사본을 만들고 거기에만 적용했다. 하니스는 스크래치패드 `feat49/`(`apply49.mjs`·`mutate49.mjs`·`render49.mjs`·`stub-hooks49.mjs`·`register49.mjs`·`tsconfig49.json`·`planedit49.mjs`). `stub-hooks`는 FEAT-42 것을 경로만 바꿔 복제했다. 하니스 자체 결함 둘은 계획서와 무관하다 — 삽입 앵커가 개행으로 끝나 닫는 `</div>` 탐색이 한 글자 늦게 시작함, tsx가 `jsx: preserve`를 classic 런타임으로 컴파일해 `React is not defined`(렌더 전용 `tsconfig49.json`에 `jsx: react-jsx`). 둘 다 하니스만 고쳐 재실행했다.

**실행한 경로와 결과**
- **1 인용 전수**: 계획서 `파일:줄` 인용 40여 개를 현재 트리에서 내용까지 대조. 어긋남 2 — (B2) §1 새 함수 주석의 `apps/backend/main.py:837·:840 create_korean_subtitles_with_ffmpeg` — 실제 `:837`은 `lambda: s3_client.upload_file(...)`, `:840`은 `)`이고 분기·호출은 `:844` `    elif selected_language == "Korean":`·`:847`이다. 게다가 FEAT-44 결정(교차 파일 줄번호 인용을 새로 만들지 않는다)과 어긋난다. (B3) §4 before 인용 `review-language-notice.ts:9-11` — 블록 내용은 실제 `:10-12`다(`:9`는 `// 문장에 넣는다 — 앱 UI가 영어라…`).
- **2·3 적용**: 코드 블록 15개 추출. 「현재 동작」 인용 2개가 현재 트리와 바이트 일치, before/after 5쌍이 각 1회 일치해 손 개입 없이 적용. 산문이 위치만 지시한 조각 3개(함수 파일 끝 추가, 힌트 두 곳)와 산문 테스트 명세의 실행본(5케이스)은 하니스가 조립. 변경 파일 5개 = 「고칠 파일」 표. `SKIP_ENV_VALIDATION=1 npm run check -w apps/web` → **EXIT 0**(verify:fsd:test 11/11 · verify:fsd 통과 · next lint 경고 0 · tsc). 테스트 **159/159**(계획서 예상과 일치).
- **4 여집합**: `CaptionPreviewPlayer` 소비자 = `CaptionStyleEditor` 하나, `CaptionStyleEditor` 소비자 = `CaptionStyleDialog.tsx:71`·`pages/settings/ui/index.tsx:229` 둘, `buildCaptionCues` 소비자 = 플레이어·`sample-captions.ts` 둘(`apps/web/src` 전역 grep). `widgets/clip-draft-review/ui/index.tsx`에는 캡션 오버레이가 없다(주석 둘뿐). 편집기 props는 늘지 않아 두 소비자는 무수정이 맞다.
- **5 돌연변이**(전체 테스트 러너, 12개): `koreanSampleCues` K1 cursor 리셋·K2 wrap 제거·K3 start 버림·K4 치환 안 함·K6 단어 수 고정·K7 공백 없는 결합 → 전부 사멸. **생존 4** — K5 빈 텍스트 가드 제거(동치: `buildCaptionCues`는 빈 단어를 건너뛰고 `current`가 비어 있지 않을 때만 flush하므로 빈 텍스트 큐가 생기지 않는다 — 결함 아님), **P1 언어 조건 제거(English 라이브까지 치환)·P3 치환 영구 비활성 → 생존**, P2 sample 가드 제거 → 생존(아래 8에서 동치 확인).
- **7 음성**: NEG1 `buildCaptionCues` 대문자 적용 제거 → fail 2, NEG2 잔여 flush 제거 → fail 6. 계획서가 기대는 계약 가드는 장식이 아니다.
- **8 렌더**(`renderToStaticMarkup`, 14/14): Korean 라이브 = 프레임 안내 + 한국어 샘플 꼬리, 옛 「in English.」 없음 · English 라이브 = 프레임 안내만 · 샘플 분기 안내(FEAT-42) 두 언어 불변 · 힌트 둘은 Korean(라이브·샘플)에만, 위치는 Words per line 뒤·Letter case 앞 / Uppercase 뒤·미리보기 안내 앞 · 설정 화면 첫 큐 `지금 자막 스타일을`·`Style your captions the way` 기존 동작 유지 · **라이브 정적 렌더엔 캡션 텍스트가 없다**(`<video>` `timeupdate`가 채우는 state). P2 동치: 설정 화면 입력 `sampleCaptionWords("Korean")`에서 줄당 단어 1–8 × 대문자 켬/끔 16조합 모두 치환 전후 동일.

**결함 3 — 통합 편집 1회(`planedit49.mjs`, 16치환)**
- **B1 (구현 영향 — 테스트 명세 구멍)**: 치환 판정 `language === "Korean" && props.sample !== true`가 플레이어 `useMemo` 안 삼항이라 English 회귀(P1)와 치환 누락(P3)을 어떤 테스트도, 정적 렌더도 잡지 못한다 — 이 항목의 핵심 스위치가 무방비다. 게이트① 기록 「판정 로직(Korean 여부·큐 인덱스 → 샘플 텍스트)은 순수 함수와 테스트로 둔다」와도 어긋난다. → 순수 함수 `previewCaptionCues(cues, language, sample)`를 `sample-captions.ts`에 두고 플레이어는 그 함수에 통과만, 테스트 describe 하나(Korean·라이브 치환 / English·라이브 그대로 / Korean·샘플 그대로) 추가. 예상 수 154→**162**, suites 35→**37**. 표·§1·§2·테스트·못 덮는 범위(배선은 러너 밖)·대안에 전파.
- **B2 (위생·소유자 결정 위반)**: 새 주석을 `apps/backend/main.py create_korean_subtitles_with_ffmpeg`(함수명 앵커)로, 결합 주의 산문도 같이.
- **B3 (위생)**: `:9-11` → `:10-12`.
- 결함 아님(기록만): K5 동치, P2 동치(가드는 의도 표기로 유지).

편집 커밋 `ddb0ef6`. 편집이 있었으므로 2라운드 무편집 재실행.

## 검증 2라운드 (2026-09-15) — 무편집, 무소득

편집한 계획서(`ddb0ef6`)를 처음부터 다시 읽고(전문 재독), wt49를 `git checkout -- .`로 `b082bd5`에 되돌린 뒤 같은 하니스로 다시 적용·실행했다. 하니스의 테스트 명세 실행본은 편집된 「테스트」 절(describe 2 · it 8)로, 돌연변이 P1–P3 앵커는 `previewCaptionCues`로 옮겼고 배선 돌연변이 W1·W2를 더했다. 계획서는 고치지 않았다.

- **1 인용 전수**: 편집으로 바뀐 인용은 `before(\`:10-12\`)`와 새 주석의 함수명 앵커 `apps/backend/main.py create_korean_subtitles_with_ffmpeg`(`main.py:410` `def create_korean_subtitles_with_ffmpeg(`) — 일치. 나머지 인용은 1라운드 대조 그대로다(계획서 산문의 해당 줄 불변). 계획서 안 `main.py:\d+`는 산문 `:583-585`뿐이고 코드 블록 안에는 없다.
- **2·3 적용**: 코드 블록 15개, 「현재 동작」 인용 2 · before/after 5쌍 각 1회 바이트 일치. 변경 5파일 = 표. `SKIP_ENV_VALIDATION=1 npm run check -w apps/web` **EXIT 0**(verify:fsd:test 11/11 · verify:fsd · ESLint 0 · tsc). 테스트 **162 · suites 37 · fail 0** — 계획서 예상(154→162, 35→37)과 일치.
- **4 여집합**: 편집으로 새 전칭 없음. 1라운드 소비자 열거 그대로(편집기 props 불변).
- **5 돌연변이**(14개): K1·K2·K3·K4·K6·K7 사멸, **P1 English 회귀·P2 sample 가드 제거·P3 치환 비활성 → 전부 사멸**. 생존 3 — K5(동치, 1라운드 근거), W1 플레이어가 `sample`을 늘 false로 넘김(라이브는 원래 false, 설정 화면은 P2 동치 16/16 → 행동 동치), W2 플레이어가 `language` 대신 English 고정(계획서 「못 덮는 범위」가 배선을 러너 밖으로 명시 — 인수 때 diff ↔ 스케치 대조 몫).
- **7 음성**: NEG1 fail 2, NEG2 fail 6.
- **8 렌더**: 14/14, P2 동치 16조합 차이 0.

실제 트리 `git status`: 무관한 `apps/web/.claude/settings.local.json`·`nul`뿐 — 하니스는 실제 트리를 건드리지 않았다. → `plan-verifier` 1사이클 디스패치(브리핑은 항목ID, 계획서 경로, 필수 경로 1·2·3·4·5·7·8만).

## plan-verifier 1사이클 (2026-09-15) — 결함 0건, 실행하지 못한 경로 없음 → 클린 패스

- **브리핑**: 항목ID, 계획서 경로, 필수 경로 1·2·3·4·5·7·8만 전달했다. 검증자가 계약 준수를 확인했다. 검증자는 grep 중 이 기록 파일이 부수적으로 보였다고 밝혔고, 브리핑에 실린 것이 아니며 조준 안내로 쓰지 않고 계획서 전체에 경로를 독립 실행했다고 적었다 — 계약 위반이 아니다(브리핑은 셋뿐이었다).
- **경로별 증거 실질**
  - 1: 계획서 인용 전수 재독 — 플레이어 `:15/40/45-49/108/112/155/162`, `caption-preview.ts:12/35`, 편집기 `:43-47/239-276/278-290/312-316/317-324`, `sample-captions.ts:2/7-8/20-30/36-38/41`, 소비자 `CaptionStyleDialog.tsx:71`·`ClipDraftCard.tsx:114/525`·설정 `:229/232/236`, `caption-presets.ts:13-24`, `constants.ts:145/157/169/181`, `main.py:583-585`, `review-language-notice.ts:10-12/19` — 낡은 줄번호·틀린 인용 0.
  - 2: 스케치 `sample-captions.ts`(두 함수 + 주석)를 바이트 그대로 추출해 저장소 tsconfig(strict·noUncheckedIndexedAccess·verbatimModuleSyntax·isolatedModules)로 `tsc --noEmit` 0 에러, typescript-eslint 계층 복제 flat config로 eslint 0.
  - 3: before 5블록(`sample-captions.ts:7-8`·플레이어 `:15`·`:45-49`·편집기 `:317-324`·`review-language-notice.ts:10-12`) 바이트 일치.
  - 4: `KR_WORDS` 파일 밖 소비자 0(두 소비자 주장 성립), 편집기 소비자 2·플레이어 소비자 1, 새 함수명 충돌 없음, 플레이어의 `cues` 판독처(`:53·55·58·112`)가 전부 useMemo 하류.
  - 5: 명세 실행본(describe 2·it 8)에 돌연변이 — `koreanSampleCues` 6/6 사멸, `previewCaptionCues` 언어 가드 제거·치환 비활성·항상 치환 사멸. 생존 둘은 동치(빈 텍스트 가드, `!sample` 가드 — 계획서가 계약으로 명시).
  - 7: 가드 제거 시 English 라이브 테스트·Korean 라이브 테스트가 각각 실제로 실패.
  - 8: 안내·힌트 JSX를 `renderToStaticMarkup`으로 language×sample 4조합 렌더 — 조합별 기대 분기 전부 일치.
- **[실행하지 못한 경로]**: 없음.
- **범위 메모(판정 근거의 투명성)**: 검증자의 경로 2는 `sample-captions.ts` 스케치를 컴파일했고 플레이어·편집기 after는 경로 3(before 바이트 일치)·8(JSX 조각 렌더)로 다뤘다. 전체 5파일 적용 후 `check`(tsc·lint·FSD)와 전체 컴포넌트 렌더는 메인 루프 1·2라운드가 wt49에서 실측했다(EXIT 0, 14/14). 검증자 보고가 필수 경로를 전부 실행했고 미실행 경로가 없으므로 무소득 보고로 판정한다(FEAT-45 전례와 같은 판단).
- **트리 청결 직접 확인**(`git status`): `apps`·`docs`·`packages`·보드·백로그 변경 0. 남은 것은 무관한 `settings.local.json`·`nul`.
- **판정**: 독립 무편집 무소득 패스 1회 → **클린 패스**. 보드에 `검증:` 줄을 기록하고 status는 `검토대기` 그대로다(게이트② `구현승인`은 소유자만 연다).
- **반영된 결함 분류**: 구현 영향 1(B1 판정 순수 함수화), 위생 2(B2 낡은 `main.py` 줄번호·FEAT-44 결정 위반, B3 인용 범위).

**인수 때 메인 루프 몫**
- `apps/web/CLAUDE.md` 테스트 개수(154→162, suites 35→37)와 `sample-captions.test.mjs` 행 갱신.
- 「못 덮는 범위」의 배선(플레이어가 `previewCaptionCues`에 실제 `language`·`sample === true`를 넘기는지)은 diff ↔ 스케치 대조로 확인한다 — 러너·정적 렌더가 못 잡는다(돌연변이 W2 생존). 격리 worktree `scratchpad/wt49`와 `apply49.mjs`를 대조 기준으로 남겨 둔다.
- 배포 확인 원장 등재 후보: Korean 업로드 검토 다이얼로그에서 재생 중 한국어 샘플이 큐 시각에 맞춰 바뀌는지, 샘플 크기·줄 길이가 실렌더와 대략 비슷한지, English 검토 다이얼로그는 영어 원문 그대로인지(육안).

## 게이트② (2026-09-15)

소유자 세션 지시 "Feat 49 구현 승인" — `검토대기` → `구현승인`. 승인 대상은 클린 패스를 받은 계획서 `ddb0ef6`판(이후 계획서 무변경). web-dev에 구현을 디스패치한다. 다른 세션이 같은 체크아웃에서 FEAT-46(backend)을 진행 중이라, 구현 범위는 계획서 「고칠 파일」 5개로 한정하고 커밋·푸시는 메인 루프가 경로 지정으로 한다.

## 인수 (2026-09-15)

web-dev 구현 보고 `docs/agents/web-dev/FEAT-49.md`, 보드 `결과` 기록. 인수 조건 다섯을 직접 재현했다.

| # | 조건 | 재현 |
| --- | --- | --- |
| 1 | 변경 파일 ↔ 「고칠 파일」 | `git status`: web 5파일 M(= 표) + 보고 신규 + 보드·백로그. 같은 트리의 `apps/backend/main.py`·`reference_translation.py`·`test_reference_translation.py`·`docs/agents/backend-dev/FEAT-46.md`와 보드 FEAT-46 행·백로그 FEAT-46 항목은 다른 세션의 미커밋 FEAT-46 몫이라 이 인수 커밋에서 뺐다 |
| 2 | diff ↔ 스케치 | **기계 대조**: 검증 때 계획서를 바이트 그대로 적용해 둔 `scratchpad/wt49`의 5파일과 구현을 `git diff --no-index -w --ignore-blank-lines`로 비교. 소스 4파일(`sample-captions.ts`·`CaptionPreviewPlayer.tsx`·`CaptionStyleEditor.tsx`·`review-language-notice.ts`) **차이 0** — 플레이어 배선(`previewCaptionCues(…, language, props.sample === true)`)도 스케치와 같다. 러너·렌더가 못 잡던 배선 돌연변이 W2를 이 대조로 닫는다. 테스트 파일은 하니스 실행본과 `it` 제목·변수명·주석·줄바꿈만 다르고 케이스 8개·입력·기대값은 「테스트」 절 그대로다(예외 하나는 아래 위생 메모) |
| 3 | 검증 명령 재실행 | 실제 트리에서 `npm run check -w apps/web` **EXIT 0**(verify:fsd:test 11/11 · verify:fsd · ESLint 0 · tsc), `npm test -w apps/web` **tests 162 · suites 37 · fail 0** |
| 4 | 백로그 제거 | `**FEAT-49**` 항목 헤더 0건. 남은 `FEAT-49` 문자열은 다른 항목의 교차 참조다 |
| 5 | 상세 기록 실재 | `docs/agents/web-dev/FEAT-49.md` 실재 — 변경 5·스케치와의 차이(힌트 들여쓰기만)·게이트·못 덮는 범위 |

**위생 메모 (인수 거부 사유 아님)**: 구현 테스트 파일을 wt49에 복사해 판정 돌연변이를 다시 심었다 — English 회귀(P1)·치환 비활성(P3)은 fail 1로 사멸, **`!sample` 가드 제거(P2)는 생존**(pass 14 · fail 0). "Korean 설정 화면 샘플 그대로" 케이스의 입력이 한글 `"지금 자막 스타일을"`이라 `koreanSampleCues`가 `KR_WORDS` 앞 세 토큰을 같은 순서로 다시 채워도 입력과 같아지기 때문이다. 계획서가 이 가드를 "설정 화면 실입력에선 치환 결과가 같다(16조합)"며 의도 표기용 계약으로 뒀으므로 행동 영향은 없고, 「테스트」 절이 입력을 지정하지 않아 스케치 위반도 아니다. 계약을 테스트로 고정하려면 그 케이스 입력을 영어로 바꾸면 된다 — 기록만 남긴다.

**문서 갱신 (메인 루프 몫)**
- `apps/web/CLAUDE.md` — 테스트 개수 154/35 → 162/37, `sample-captions.test.mjs` 행에 `koreanSampleCues`·`previewCaptionCues`가 지키는 것과 P2 동치 생존을 덧붙임.
- `docs/release-checks.md` — FEAT-49 절 등재(열린 줄 4, `〔auto〕` 없음 — 로그인 뒤 화면). FEAT-45 절 셋째 줄(다이얼로그 안내 마지막 문장)에 "FEAT-49 배포 뒤엔 Korean 안내가 바뀐다" 메모 — FEAT-49가 배포되기 전까지는 그 줄이 여전히 유효해 `대체`로 닫지 않았다.

**보드 `결과` 길이 교정**: web-dev가 쓴 `결과`가 157자로 보드 규칙(150자 이내 — 대시보드가 넘치면 보인다)을 넘었다. 스테이징 가드가 잡았고, 뜻은 그대로 두고 145자로 줄였다(「Uppercase·Words per line·안내에 Korean 힌트/분리」 → 「Uppercase·Words per line 힌트·안내 언어별 분리」, `fail0` 생략 — 162/37이 곧 전부 통과).

**범위 밖 의존**: 계획서 「범위 밖 의존」 없음 → 백로그 후보 없음.

**커밋 방식**: 공유 트리라 보드·백로그·`apps/web/CLAUDE.md`·`docs/release-checks.md`가 한때 다른 세션의 미커밋 FEAT-46 변경과 섞여 있었다. HEAD에 FEAT-49 몫만 얹은 블롭을 인덱스에 넣는 가드 스크립트(`scratchpad/feat49/stage49b.mjs`)를 준비했으나, 실행 직전 다른 세션이 FEAT-46 몫을 자기 커밋(`227cb7f`·`8ae9701`)으로 먼저 가져갔다. 그 뒤 네 파일의 HEAD 대비 차이가 FEAT-49 hunk뿐임을 `git diff -U0`로 확인하고 경로 지정 `git add`로 커밋했다. 가드는 두 번 발동해 아무것도 스테이징하지 않았다(`결과` 150자 초과 1회 · HEAD 이동 1회).
