# FEAT-40 — 캡션 편집기를 `features/caption-style` 슬라이스로 이동

## 2026-09-14 구현 (web-dev, B단계)

승인된 계획: `docs/plans/FEAT-40.md` (검증 클린 패스 후 게이트② 개방). 파일에서 다시 읽고 그대로 구현.

### 고친 파일

**메인 루프가 `git mv`로 선행한 rename 6건** (blob 그대로, 경로만 스테이징 — 커밋 안 함):
- `widgets/clip-draft-review/ui/_component/CaptionStyleEditor.tsx` → `features/caption-style/ui/CaptionStyleEditor.tsx`
- `widgets/clip-draft-review/ui/_component/CaptionPreviewPlayer.tsx` → `features/caption-style/ui/CaptionPreviewPlayer.tsx`
- `widgets/clip-draft-review/model/caption-preview.ts` → `features/caption-style/model/caption-preview.ts`
- `widgets/clip-draft-review/model/caption-presets.ts` → `features/caption-style/model/caption-presets.ts`
- `widgets/clip-draft-review/model/caption-preview.test.mjs` → `features/caption-style/model/caption-preview.test.mjs`
- `widgets/clip-draft-review/model/caption-presets.test.mjs` → `features/caption-style/model/caption-presets.test.mjs`
(`git diff --cached -M --name-status`에서 6건 전부 `R100`.)

**web-dev 신규 2건**:
- `apps/web/src/fsd/shared/lib/transcript.ts` — `TranscriptWord` 3필드 인터페이스를 shared로 내림(스케치 그대로).
- `apps/web/src/fsd/features/caption-style/index.ts` — 슬라이스 public entry. `CaptionStyleEditor`(default 재수출)·`matchPresetId`만 공개. `CaptionPreviewPlayer`·`buildCaptionCues`는 비공개(YAGNI, FEAT-42가 필요 시 추가).

**web-dev 임포트 편집 6건**:
- `features/clip-review/model/transcript.ts` — 인터페이스 선언(`:1-5`)을 `import type … "~/fsd/shared/lib/transcript"` + `export type { TranscriptWord };`로 교체. `parseTranscriptWords` 본문·에러 문구 무변경. `features/clip-review/index.ts:8` 재수출 경로 유지되어 clip-review 소비자 전부 무영향.
- `features/caption-style/model/caption-preview.ts` — `:1` `TranscriptWord` 임포트를 clip-review→shared/lib로. `CAPTION_RENDER` 등 절대경로 무변경.
- `features/caption-style/ui/CaptionPreviewPlayer.tsx` — `:4` 임포트 clip-review→shared/lib, `:14` `../../model/caption-preview`→`../model/caption-preview`(ui/_component→ui로 한 계단 얕아짐).
- `features/caption-style/ui/CaptionStyleEditor.tsx` — `:3` 임포트 clip-review→shared/lib, `:11` `../../model/caption-presets`→`../model/caption-presets`. `:12` `./CaptionPreviewPlayer` 무변경(함께 이동).
- `widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx` — `:16` default `./CaptionStyleEditor` → named `{ CaptionStyleEditor } from "~/fsd/features/caption-style"`. 호출부 무변경.
- `widgets/clip-draft-review/model/use-clip-draft-review.ts` — `:19` `./caption-presets` → `~/fsd/features/caption-style`. `:15` `TranscriptWord`·`:21` 재수출은 clip-review barrel 경유라 무변경.

옮겨진 `caption-presets.ts`·두 테스트(`caption-preview.test.mjs`·`caption-presets.test.mjs`)는 열지 않음.

### 스케치 대비 차이

없음. 「구현 스케치」의 임포트 교체·신규 파일 내용을 그대로 반영. 분기·조건·리터럴·사용자 문구 변경 없음(순수 파일 이동+재배선).

### 검증

- 기계적 인수(바이트 불변): `git rev-parse` blob id — 옮긴 두 테스트와 `caption-presets.ts` 모두 HEAD(옛 경로) == index(새 경로) 동일. `caption-preview.test.mjs`=`6bfb255`, `caption-presets.test.mjs`=`c78f479`, `caption-presets.ts`=`4ecc5e7`. 세 파일 `git diff --quiet`(워킹≡인덱스) 전부 종료코드 0.
- 편집한 세 이동 파일(`caption-preview.ts`·`CaptionPreviewPlayer.tsx`·`CaptionStyleEditor.tsx`)의 `git diff -M --ignore-cr-at-eol HEAD` diff가 스케치의 임포트 줄뿐 — `main.py:NNN` 주석 등 그 외 줄 변화 없음.
- 옛 6개 경로 `ls` 부재 확인(rename 완료).
- `npm run check -w apps/web` — 통과(typecheck + verify:fsd "FSD boundary check passed" + lint "No ESLint warnings or errors"). 새 슬라이스 경계 W2/W6/W7 기계 검증 통과.
- `npm test -w apps/web` — 131 tests / 131 pass / 0 fail (기준선 131 유지, 개수 불변).

### 테스트로 못 덮은 범위

편집기·미리보기의 실제 DOM 렌더는 Node 내장 러너(DOM·React 테스트 도구 없음)로 확인 불가. 이 항목은 렌더 로직 무변경·파일 위치만 이동이라 시각 동일성은 check·test 통과와 순수 모델 blob 불변으로 뒷받침. 설정 화면 실사용은 FEAT-42의 몫.

### 인수 시 메인 루프 처리 대상(계획서 「범위 밖 의존」)

문서 인용 5건(`apps/web/CLAUDE.md` 테스트 목록 표 2행·FSD `features` 행·테스트 개수 문장, `TASK_BACKLOG.md` FEAT-42/44·FEAT-38 source 옛 경로)은 web-dev 쓰기 범위 밖(CLAUDE.md 읽기 전용, 백로그는 자기 항목 제거만). 계획서에 목록화됨 — 메인 루프 인수 갱신.
