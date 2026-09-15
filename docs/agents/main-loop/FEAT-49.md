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
