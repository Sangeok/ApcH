# FEAT-49 — 구현 보고 (web-dev)

## 2026-09-15 구현

계획서 `docs/plans/FEAT-49.md`(검증 클린 패스본)를 파일에서 다시 읽고 그대로 구현했다. 착수 전
「현재 동작」의 `파일:줄` 인용을 현재 코드와 대조 — 전부 일치(sample-captions.ts 7-8/20-30/36-38/41-43/47,
CaptionPreviewPlayer.tsx 15/40/45-49/112/155, CaptionStyleEditor.tsx 239-276/278-290/317-324,
review-language-notice.ts 10-12). 어긋남 없음.

### 변경 파일 (계획 「고칠 파일」 5개, 그 밖 없음)

1. `apps/web/src/fsd/features/caption-style/model/sample-captions.ts`
   - `KR_WORDS` 위 주석(값 앞 블록)에 두 소비자 명시 문구 추가(값 불변).
   - 파일 끝 `firstSampleCueText` 아래에 순수 함수 둘 신규:
     - `koreanSampleCues(cues)` — 큐 타이밍·개수 보존, 큐별 영어 단어 수만큼 `KR_WORDS`를 cursor
       순환해 텍스트만 치환. `noUncheckedIndexedAccess` 때문에 `?? ""`.
     - `previewCaptionCues(cues, language, sample)` — `language === "Korean" && !sample`일 때만
       `koreanSampleCues`, 그 외 입력 그대로. 치환 판정을 컴포넌트 밖 순수 함수로 격리.
2. `apps/web/src/fsd/features/caption-style/ui/CaptionPreviewPlayer.tsx`
   - import에 `previewCaptionCues` 추가.
   - `cues` useMemo가 `buildCaptionCues` 결과를 `previewCaptionCues(..., language, props.sample === true)`
     에 통과. 의존성 배열에 `language`·`props.sample` 추가. `buildCaptionCues`·아래 렌더 코드 불변.
3. `apps/web/src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx`
   - 라이브 안내(`sample` else 분기)를 `language === "Korean"` 중첩 삼항으로 분리(요구 ①·④):
     Korean은 "샘플·번역" 문구, English는 프레임 안내만. 샘플 분기 불변.
   - Words per line 블록 끝에 Korean 전용 힌트(요구 ③): "counts English source words per line before
     translation."
   - Letter case 블록의 Uppercase 버튼 아래 Korean 전용 힌트(요구 ②): "Korean text isn't affected —
     only English words mixed into a line are uppercased." 버튼 비활성화·저장·프리셋 경로 불변.
4. `apps/web/src/fsd/widgets/clip-draft-review/model/review-language-notice.ts`
   - 교차 서술 주석 한 곳만 갱신(반환 문구·`showsEnglishSourceForTranslation` 불변). 그래서
     `review-language-notice.test.mjs`도 불변.
5. `apps/web/src/fsd/features/caption-style/model/sample-captions.test.mjs`
   - import에 `koreanSampleCues`·`previewCaptionCues` 추가.
   - `describe("koreanSampleCues")` 5 케이스: 빈 큐→[], start/end 보존, 큐당 토큰수·cursor 연속,
     9단어 소진 후 wrap, 한글만(영어 누출 없음).
   - `describe("previewCaptionCues")` 3 케이스: Korean 라이브 치환(치환 누락 방지), English 라이브
     그대로(회귀 방지), Korean 샘플 그대로(설정 화면 큐 계약).

### 스케치와의 차이

- 사용자 문구·분기 순서·조건·리터럴 값: 스케치 그대로. 차이 없음.
- 편집기 두 힌트 JSX의 들여쓰기는 스케치의 12/14 스페이스 대신 파일의 실제 컨텍스트(10/12 스페이스,
  블록 자식 레벨)에 맞췄다 — prettier(`npm run check`의 lint)가 정규화하는 비-의미 차이이며 문구·구조
  불변.
- 테스트 케이스의 `it` 제목·구조는 계획 「테스트」 절의 "덮는 것"을 그대로 옮긴 것(제목 문구는 스케치가
  지정하지 않아 서술형으로 명명). 단언 값(입력 큐·기대 텍스트·타이밍)은 스케치 예시 그대로.

### 게이트

- `npm run check -w apps/web` → EXIT 0. verify:fsd 통과(FSD boundary check passed), typecheck 통과,
  ESLint "No ESLint warnings or errors".
- `npm test -w apps/web` → tests 162 · suites 37 · pass 162 · fail 0. 계획 예상(154→162 +8, 35→37 +2)
  정확 일치.
- `git status --short`: 의도한 5개 파일만 M. `apps/web/.claude/settings.local.json`·루트 `nul`·
  `apps/backend/reference_translation.py`(타 세션 FEAT-46)는 기존/범위 밖이라 미변경.

### 테스트로 못 덮는 범위 (계획 「못 덮는 범위」 인용)

- 실제 Korean 업로드 검토 화면에서 샘플 문장의 크기·줄 길이가 실렌더와 유사한지는 배포 후 육안 대조
  (DOM 렌더·재생 타이밍은 Node 러너 밖).
- "영어 N단어 = 한국어 N토큰" 근사라 실제 번역 길이와 다르다(화면 차지는 근사값).
- 실렌더의 줄 내 영문 대문자화(`main.py:583-585`)는 순수 한글 샘플에 나타나지 않는다 — 미리보기가 그
  부분 효과까지 재현하지 않는다.
- 플레이어가 `previewCaptionCues`에 실제 `language`·`sample`을 넘기는 배선과 재생 중 큐 시각별 텍스트
  전환은 `<video>` 재생 state라 러너·정적 렌더로 못 덮는다 — 인수 diff↔스케치 대조와 배포 후 육안 몫.
  안내·힌트 문구가 옳은 소비자에 뜨는지는 정적 렌더로 확인 가능(별도 테스트는 계획 범위 밖).
