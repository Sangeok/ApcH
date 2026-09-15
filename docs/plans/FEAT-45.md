# FEAT-45: 검토 화면의 "transcript/source" 표현을 사용자 말로 풀어 쓴다 — 카드 라벨·헤더 안내·캡션 편집기 안내 문구

agent: web-dev

## 현재 동작

검토 화면은 비영어 업로드(예: Korean)일 때 "영상에서 들리는 말은 영어 전사이고, 자막은 렌더 때 번역된다"는 사실을 세 곳에서 알린다. 세 곳 모두 "transcript" 또는 "source"라는 만드는 사람의 용어에 기댄다.

- **헤더 안내** — `widgets/clip-draft-review/model/review-language-notice.ts:19`이 순수 함수 `reviewLanguageNotice`의 반환 문자열로
  `` `Subtitles will be translated to ${trimmed} when you generate. This review shows the English transcript.` `` 을 만든다. 판정은 `:16-18`: `language == null`이면 null, `trim()` 후 빈 문자열이거나 `"English"`면 null, 그 외(비영어)에만 문구를 낸다. 위젯은 `ui/index.tsx:234` `const languageNotice = reviewLanguageNotice(language);`로 받아 `:285-289`에서 `bg-muted` 박스로 렌더한다(English/null이면 `languageNotice === null`이라 렌더 안 됨).
- **카드 라벨** — `widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx:482` `English transcript`. 조건은 `:115` `const showsEnglishSource = showsEnglishSourceForTranslation(language);` → `:480` `{showsEnglishSource && (` 안에서만 렌더되고, 바로 아래 `:485-487`이 영어 원문(`previewText`)을 `bg-muted line-clamp-3` 박스로 보여준다. `showsEnglishSourceForTranslation`은 `review-language-notice.ts:25-29`에서 `reviewLanguageNotice(language) !== null`로 정의돼, 헤더 안내와 카드 라벨이 **반드시 같은 조건**으로 켜진다.
- **캡션 편집기 라이브 안내** — `features/caption-style/ui/CaptionStyleEditor.tsx:318-323`의 else 분기(`sample` 아님 = 검토 다이얼로그)가
  `Live preview on your video — the whole frame is shown here. The final clip crops to follow whoever is speaking, so framing will differ. Korean clips are translated at render time — the words here are the English source.`
  를 렌더한다. 이 중 "transcript/source" 표현은 마지막 문장 `:321-322` `the words here are the English source.` 뿐이다. 같은 삼항의 샘플 분기 `:313-316`(설정 화면 전용, `sample` prop)은 FEAT-42가 넣은 문구로 "transcript/source"를 쓰지 않는다.

골든 문자열 테스트 `widgets/clip-draft-review/model/review-language-notice.test.mjs`가 이 카피를 계약으로 고정한다 — `:10-11` `KOREAN_NOTICE`, `:42-44` Spanish 문구. 현재 `npm test -w apps/web` 기준선은 **154**.

**여집합 확인(범위 밖으로 남기는 것)** — `apps/web/src` 전체에서 이 세 문구 외에 "transcript/source" 사용자 문구는 없다(`English transcript|English source|This review shows|the words here are|translated at render time` grep = 위 세 파일뿐). 다음은 문자열이 겹쳐 보이지만 FEAT-45 대상이 아니다:
- `ui/index.tsx:432` `Source video. Each clip is cropped to vertical (9:16) and follows whoever is speaking.` — "Source"를 쓰지만 소스 영상 플레이어를 설명하는 라벨이지 전사가 아니다. 백로그 요구 ①은 세 문구를 이름으로 지목했고 이 라벨은 그 셋이 아니다.
- `ui/_component/AddCustomClipPanel.tsx:90` `Transcript unavailable — custom clips are disabled.` · `model/use-clip-draft-review.ts:319` `"Transcript unavailable"` — 데이터 로드 실패 오류 메시지지 "지금 보이는 글이 무엇인가"를 설명하는 문구가 아니다.

## 문제

`TASK_BACKLOG.md`의 FEAT-45 `source`가 지목한 문제: 소유자가 Korean 검토 화면의 영어 전사를 보고 "문제 같다"고 했고, 설명을 들은 뒤에도 "transcript가 의미하는 게 뭐냐"고 물었다. 즉 "transcript/source"는 만드는 사람의 용어라, 소유자조차 위 세 문구를 "영상에서 실제로 들리는 말"로 읽지 못했다. 세 문구를 그 뜻을 그대로 풀어 쓴 평이한 영어로 바꾸고, 표시 조건·레이아웃은 그대로 둔다. FEAT-48이 카드 라벨 바로 아래에 "참고 번역" 블록을 붙이므로(백로그 FEAT-48 요구 ②) 원문 라벨을 먼저 "원문 vs 번역"이 대비되게 정해 두는 것이 이 항목이 FEAT-48보다 먼저인 이유다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/widgets/clip-draft-review/model/review-language-notice.ts` | 헤더 안내 반환 문자열(`:19`)의 "This review shows the English transcript." 부분을 평이한 표현으로 교체. 함수 시그니처·판정 로직·`showsEnglishSourceForTranslation`는 불변. 아울러 주석 `:10`의 낡은 교차 파일 줄번호 인용(`CaptionStyleEditor.tsx:310-311`)을 내용 앵커로 교체 |
| `src/fsd/widgets/clip-draft-review/model/review-language-notice.test.mjs` | 골든 문자열 두 개(`KOREAN_NOTICE` `:11`, Spanish `:43`)를 새 카피로 교체. 테스트 개수·구조 불변 |
| `src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | 카드 라벨 `English transcript`(`:482`)를 평이한 표현으로 교체 |
| `src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx` | 라이브(else) 분기의 마지막 문장 `the words here are the English source.`(`:321-322`)만 평이한 표현으로 교체. 샘플 분기(`:313-316`)와 앞 두 문장(`:319-320`)은 불변 |

여기 없는 파일은 고치지 않는다. 특히 `ui/index.tsx`(주석의 `CaptionStyleEditor :310-311` 줄번호는 낡았으나 바뀌는 문구를 **인용하지 않으므로** FEAT-45 「문구만」 범위 밖 — 아래 「구현 스케치」 말미의 결정 참조), `apps/web/CLAUDE.md`·`docs/release-checks.md`(메인 루프 인수 몫, 읽기 전용).

## 구현 스케치

새 카피 세 개(세 문구가 같은 어구 "what's said in the video, in English"를 공유해 사용자가 한 번 배우면 세 곳에서 같은 뜻으로 읽힌다):

- **헤더 안내**: `Subtitles will be translated to ${trimmed} when you generate. This review shows what's said in the video, in English.`
- **카드 라벨**: `What's said in the video (English)` (JSX 텍스트라 실제 소스는 `What&apos;s …` — 아래 참조)
- **캡션 편집기 라이브 안내(마지막 문장)**: `Korean clips are translated at render time — the words shown here are what's said in the video, in English.`

### `review-language-notice.ts`

반환 문자열(`:19`) — before/after:

before:
```
  return `Subtitles will be translated to ${trimmed} when you generate. This review shows the English transcript.`;
```
after:
```
  return `Subtitles will be translated to ${trimmed} when you generate. This review shows what's said in the video, in English.`;
```
(템플릿 리터럴이라 `'`는 그대로 쓴다. `${trimmed}` 삽입은 불변 — 언어값을 문장에 넣는 계약과 trim 돌연변이 방어를 유지한다.)

주석 `:10-11` — 낡은 줄번호 인용 교체(FEAT-44 결정: 교차 파일 줄번호 인용은 곧 낡는다). before/after:

before:
```
// 문장 안의 언어명도 값("Korean")이 맞고, CaptionStyleEditor.tsx:310-311의 기존 문구와도
// 일관된다. English·nullish/공백은 안내 없음(null) — 영어 전사가 곧 최종 자막이라
```
after:
```
// 문장 안의 언어명도 값("Korean")이 맞고, CaptionStyleEditor의 라이브 미리보기 안내와도
// 일관된다. English·nullish/공백은 안내 없음(null) — 영어 전사가 곧 최종 자막이라
```
(줄번호만 함수/내용 앵커로 바꾼다. "일관된다" 서술은 참으로 남는다 — 두 문구가 새로 같은 어구 "what's said in the video, in English"를 공유한다. 같은 파일 `:3`의 `apps/backend/main.py:837` 인용은 FEAT-44 몫이라 손대지 않는다.)

### `review-language-notice.test.mjs`

`KOREAN_NOTICE`(`:10-11`) — before/after:

before:
```
const KOREAN_NOTICE =
  "Subtitles will be translated to Korean when you generate. This review shows the English transcript.";
```
after:
```
const KOREAN_NOTICE =
  "Subtitles will be translated to Korean when you generate. This review shows what's said in the video, in English.";
```

Spanish 단언(`:42-44`) — before/after:

before:
```
    assert.equal(
      reviewLanguageNotice("Spanish"),
      "Subtitles will be translated to Spanish when you generate. This review shows the English transcript.",
    );
```
after:
```
    assert.equal(
      reviewLanguageNotice("Spanish"),
      "Subtitles will be translated to Spanish when you generate. This review shows what's said in the video, in English.",
    );
```
(`:36`의 `" Korean "` trim 테스트는 `KOREAN_NOTICE` 상수를 그대로 참조하므로 자동 반영된다. 새 문구도 `${trimmed}`를 삽입하므로 trim 제거 돌연변이 시 `" Korean "` → 공백이 박힌 문구가 되어 골든과 어긋나 여전히 잡힌다.)

### `ClipDraftCard.tsx`

라벨(`:482`, `<p>` JSX 텍스트) — before/after:

before:
```
              English transcript
```
after:
```
              What&apos;s said in the video (English)
```
(ESLint `react/no-unescaped-entities`가 JSX 텍스트의 raw `'`를 막는다 — 같은 저장소가 `CaptionStyleEditor.tsx:315`에서 `you&apos;re`로 이스케이프한다. 렌더 결과는 `What's said in the video (English)`. FEAT-48의 번역 블록이 이 라벨 아래에 붙을 때 "원문(English) vs 참고 번역"으로 짝이 되도록 "(English)"를 명시했다.)

### `CaptionStyleEditor.tsx`

라이브(else) 분기 `<p>`(`:318-323`) — 마지막 문장만 교체. before/after:

before:
```
          <p className="text-center text-[11px] text-muted-foreground">
            Live preview on your video — the whole frame is shown here. The final
            clip crops to follow whoever is speaking, so framing will differ.
            Korean clips are translated at render time — the words here are the
            English source.
          </p>
```
after:
```
          <p className="text-center text-[11px] text-muted-foreground">
            Live preview on your video — the whole frame is shown here. The final
            clip crops to follow whoever is speaking, so framing will differ.
            Korean clips are translated at render time — the words shown here are
            what&apos;s said in the video, in English.
          </p>
```
(앞 두 문장·`className`·em dash `—`는 불변. `what's`는 JSX라 `what&apos;s`. prettier가 80칼럼 기준으로 줄바꿈 위치를 위와 다르게 접을 수 있으나 **텍스트 내용은 위와 같다** — 렌더 결과: `… so framing will differ. Korean clips are translated at render time — the words shown here are what's said in the video, in English.` 동작 서술은 늘리지 않는다: "translated at render time"는 그대로 두고 "English source"만 푼다. FEAT-49가 이 문장을 뒤에 동작(Korean 샘플 미리보기)에 맞게 다시 고친다.)

### `ui/index.tsx` 주석 — 결정: 손대지 않음

`ui/index.tsx:281`이 `유일한 기존 안내(CaptionStyleEditor :310-311)는 …`, `:425`가 `최종 산출물이 세로 영상이라는 사실은 지금까지 CaptionStyleEditor 안에만 있었는데 …`로 편집기를 **줄번호로** 참조한다(둘 다 이제 낡음 — 라이브 안내는 `:318-323`). 그러나 두 주석 모두 **바뀌는 사용자 문구를 인용하지 않고** 줄번호로만 가리킨다. FEAT-45는 「문구만」 바꾸는 항목이고, 교차 파일 줄번호 인용의 전면 정리는 FEAT-44의 성격이다(다만 이 두 줄은 `main.py` 인용이 아니라 FEAT-44 열거 목록에도 없다). 범위 규율상 여기서는 손대지 않고, 이 관측을 「비고」로 남겨 FEAT-44/메인 루프가 판단하게 한다. (`review-language-notice.ts:10`만 예외로 고치는 이유: FEAT-45가 편집하는 파일 안이고, 그 인용이 가리키는 **문구 자체가 이번에 바뀌며**, 메인 루프 게이트① 기록이 명시적으로 이 줄의 처리를 지시했다.)

## 테스트

- **덮는 것**: `review-language-notice.test.mjs`의 골든 문자열 두 개를 새 카피로 교체(위 before/after). 순수 함수 `reviewLanguageNotice`가 지키던 모든 계약이 새 문구에서도 성립한다 — 비영어에만 문구/영어·nullish·공백은 null(`:18-30`), trim 후 판정+삽입(`:32-37`), 허용목록이 아니라 "English 아님" 판정으로 언어 자동 커버(`:39-45`), `showsEnglishSourceForTranslation ≡ reviewLanguageNotice !== null`(`:48-72`). 테스트 개수는 그대로 — 문자열 리터럴만 바뀌므로 `npm test -w apps/web` 기준선 **154** 유지.
- **못 덮는 범위**:
  - 카드 라벨(`ClipDraftCard.tsx:482`)과 캡션 편집기 안내(`CaptionStyleEditor.tsx`)는 JSX 렌더 문자열이라 Node 내장 러너(DOM·React 테스트 도구 없음)로 확인할 수 없다. 새 문구가 실제 검토 화면에 보이는지는 배포 후 육안 확인이다.
  - 헤더 안내는 골든 테스트가 순수 함수 반환값을 잡지만, `ui/index.tsx:285-289`이 그 값을 실제로 렌더하는지는 러너 밖(렌더) 몫이다.
  - **인수 시 메인 루프 대응(문서 갱신 — 내 범위 밖, 여기 기록):** `docs/release-checks.md`의 FEAT-37 절 `:120`(헤더 안내 골든 문구 인용)·`:121`(「English transcript」 카드 라벨 인용)은 옛 문구를 인용하므로 인수 때 `대체(FEAT-45)`로 마감하고 새 카피 기준 확인 줄을 등재해야 한다. 같은 파일 FEAT-43 절 `:108`의 "전사 본문과 … 「English transcript」 라벨은 영어 그대로가 정상이다" 서술은 라벨 문구가 바뀌었으므로(여전히 영어이나 텍스트가 다름) 갱신이 필요하다. `apps/web/CLAUDE.md:83` 테스트 표의 `review-language-notice.test.mjs` 행이 「English transcript」 골든 문구를 언급하므로 새 카피로 갱신해야 한다.

## 범위 밖 의존

없음 — 고칠 파일 넷이 전부 `apps/web/src` 안이다(스키마·백엔드·다른 워크스페이스 변경 없음). 위 「못 덮는 범위」에 적은 `docs/release-checks.md`·`apps/web/CLAUDE.md` 갱신은 나를 막는 의존이 아니라 백로그가 이미 메인 루프 인수 몫으로 지정한 후속 문서 작업이다.

## 대안

- **카피 문구 대안**: 백로그 예시 라벨은 `What's said in the video (English)`였고 이를 카드 라벨로 채택했다. 헤더·편집기 안내도 같은 핵심 어구 "what's said in the video, in English"를 재사용해 세 문구를 한 어휘로 통일한다 — 서로 다른 표현("spoken words", "original audio" 등)을 쓰면 사용자가 세 번 학습해야 하고 FEAT-48 번역 블록 라벨과의 짝맞춤도 흐려진다.
- **헤더 안내에서 언어명(`${trimmed}`) 제거 대안**: "translated to your chosen language"처럼 언어명을 빼는 안을 검토했으나, 기존 계약(값을 문장에 삽입 → trim 돌연변이를 골든 테스트가 잡음)과 소유자가 어느 언어로 번역되는지 보는 정보 가치를 유지하기 위해 `${trimmed}` 삽입을 그대로 둔다.
