# FEAT-36 — 캡션 스타일 미리보기를 실제 영상 위 타이밍 오버레이로

## 2026-09-08 — 구현 (web-dev)

### 결과 요약

계획서 `docs/plans/FEAT-36.md`(승인본, 검증 4라운드 반영)를 그대로 구현했다. 캡션 스타일
편집기의 정적 그라데이션 상자 미리보기를, 원본 영상 위에 자막 큐를 타이밍대로 재생하는
9:16 오버레이 플레이어로 교체했다. 새 렌더·서버 호출·백엔드 변경 없이 `apps/web` 안에서
닫힌다. `npm run check` EXIT 0, `npm test` 107 pass / 0 fail(88→107, +19).

### 고친 파일 (전수)

수정 6:
- `apps/web/src/fsd/shared/config/constants.ts` — `CAPTION_STYLE_OPTIONS` 아래에 백엔드·폰트
  동기 상수 `CAPTION_RENDER`(PLAY_RES_Y·MARGINV·SHADOW·EM_SCALE) 추가. EM_SCALE은
  libass REAL_DIM 보정 분모(Anton 3550 / Noto 1448)를 리터럴로 박고 근거 주석 포함.
- `apps/web/src/app/layout.tsx` — `next/font/google`에서 `Anton`(400)·`Noto_Sans_KR`(700,
  latin 서브셋·preload false) 로드, `<html>` className에 `--font-anton`·`--font-noto-sans-kr`
  CSS 변수 추가.
- `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleEditor.tsx` —
  `previewWords: string[]` props를 `playUrl·clipStart·clipEnd·words`로 교체(+`TranscriptWord`
  type-import), 로컬 환산 상수·함수 제거(`PREVIEW_HEIGHT_PX`·`ASS_PLAY_RES_Y`·
  `POSITION_JUSTIFY_CLASS`·`previewText`·`previewScale`·`previewFontPx`·`previewStrokePx`·
  `justifyClass`), 그라데이션 상자 미리보기 컬럼을 `CaptionPreviewPlayer` + 못 닫는
  근사(크롭·한국어) 안내 문구로 교체.
- `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx` —
  `previewWords` props를 `playUrl·clipStart·clipEnd·words`로 교체·전달(+`TranscriptWord`
  type-import).
- `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` — props에
  `playUrl: string | null` 수신(구조분해 포함), `CaptionStyleDialog` 호출의
  `previewWords={...}`를 `playUrl·clipStart={startSeconds}·clipEnd={endSeconds}·
  words={wordsInRange}`로 교체. 새 import 불필요(`TranscriptWord` 이미 존재). **FEAT-35
  겹침 파일이나 줄이 서로소** — props 인터페이스·구조분해·다이얼로그 호출만 건드렸고,
  구현 시점 트리에 FEAT-35 변경은 나타나지 않았다(아래 워킹트리 스냅숏).
- `apps/web/src/fsd/widgets/clip-draft-review/ui/index.tsx` — `ClipDraftCard` 호출에
  `playUrl={readyPlayUrl}` 한 줄 추가. (source 예측 "무변경"과 어긋나는 지점 — 계획서가
  명시한 대로.)

신규 3:
- `apps/web/src/fsd/widgets/clip-draft-review/model/caption-preview.ts` — 순수 모듈.
  `buildCaptionCues`(main.py:287-345 묶기 이식)·`pickActiveCue`·`getPreviewFontPx`(REAL_DIM
  보정)·`getPreviewStrokePx`·`getPreviewShadowPx`·`getPreviewVerticalInset`. `TranscriptWord`는
  `~/fsd/features/clip-review`에서 type-only import(tsx 런타임 미방출 → `.test.mjs`가
  `"use server"` 액션을 끌어오지 않음).
- `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/CaptionPreviewPlayer.tsx` — 신규
  클라이언트 컴포넌트. 9:16 프레임·음소거 루프 `<video>`(object-cover 중앙 크롭)·큐 오버레이.
  큐는 ref로 읽어 재생 이펙트를 URL·구간에만 묶는다(스타일 변경 시 재생이 클립 시작으로
  되돌아가지 않게).
- `apps/web/src/fsd/widgets/clip-draft-review/model/caption-preview.test.mjs` — 순수 함수
  커버(6 describe / 19 it).

### 스케치 대비 차이

분기 순서·조건·리터럴 값·사용자에게 보이는 문구 모두 계획서 「구현 스케치」와 일치. 차이 없음.
테스트는 「테스트」 절의 "덮는 것"을 모두 구현했고, 검증 라운드가 요구한 두 추가 단언
(① 두 번째 큐 start == 4번째 단어 start_rel, ③ end === clipEnd 단어 포함)도 포함했다.
부동소수 함정을 피해 기대값은 clipStart를 뺀 뒤에도 정확히 표현되는 수만 썼고
(0.5·1.5·2.5·67.9 등, `167.9 - 100 === 67.9` 실측 확인), px 환산 단언은 함수와 동일한
연산 순서의 리터럴 식으로 비트 동일 비교했다.

### 검증

- `npm run check -w apps/web` → EXIT 0 (verify:fsd:test 11/11 · verify:fsd 통과 · next lint 무경고 · tsc --noEmit 무오류)
- `npm test -w apps/web` → EXIT 0, tests 107 / pass 107 / fail 0 (88→107, +19). caption-preview 6 suite 전부 ok.

### 못 덮은 범위 (배포 후 수동 확인)

`npm test`는 Node 내장 러너(`tsx --test`)라 DOM·React 도구가 없다. 다음은 러너 밖 —
검토 화면에서 실제 클립으로 수동 확인 대상:
- `CaptionPreviewPlayer`의 `<video>` 로드·seek·루프·timeupdate 큐 전환
- `object-fit: cover` 중앙 크롭, DOM 오버레이 위치·`WebkitTextStroke`
- `next/font` 로딩(`--font-anton`·`--font-noto-sans-kr` 적용), 다이얼로그 렌더
- **특히 폰트 크기 환산(EM_SCALE)이 실렌더와 맞는지 EN/KR 각각 1회씩 대조** — REAL_DIM
  보정 분모가 실렌더 픽셀과 일치하는지는 실물로만 확인 가능.

### 워킹트리 스냅숏 (다른 세션 FEAT-35와 공유)

- 시작 시점: `M apps/web/.claude/settings.local.json`, `?? nul` (둘 다 이 세션 이전부터 존재, 내 것 아님)
- 종료 시점: 위 둘 + 내 수정 6 + 신규 3. FEAT-35 파일(`format-duration.ts` 등)·다른 세션
  변경은 나타나지 않음. ClipDraftCard.tsx 변경은 전부 내(FEAT-36) 것이며 계획서가 명시한
  서로소 줄에 한정된다.

### 비고 (보고용 — 파일은 건드리지 않음)

`apps/web/CLAUDE.md`의 테스트 목록 표와 개수 줄이 낡았다. CLAUDE.md는 읽기 전용이라 직접
고치지 않고 여기에 남긴다:
- 개수 줄(69행) "현재 15개 파일, 19 suite, 88개 테스트" → "16개 파일, 25 suite, 107개 테스트"
- 표에 추가할 행:
  `| widgets/clip-draft-review/model/caption-preview.test.mjs | 캡션 미리보기 큐 묶기(main.py:287-345 이식)·활성 큐 선택·px 환산(libass REAL_DIM 보정). **묶기·범위 필터·EM_SCALE 분모는 백엔드 자막과 묶인 계약이라 어긋나면 미리보기가 실렌더와 달라진다** — 타입이 못 잡는 회귀를 이 테스트가 막는다 |`
