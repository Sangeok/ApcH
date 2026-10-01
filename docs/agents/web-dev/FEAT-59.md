# FEAT-59 — 업로드 폼 옵션 영역 개편 (카드 안 2열 격자·세그먼트·Video style 9:16 썸네일)

## 2026-10-01 구현 (구현승인 → 완료)

### 계약 확인
- 계획서 `docs/plans/FEAT-59.md`를 파일에서 다시 읽고 구현했다(기억 아님).
- 「현재 동작」을 코드와 대조해 전부 일치함을 확인하고 착수했다:
  - `UploadPodcast.tsx` 상태 4·핸들러 3·`trackOptionsChanged`·`getMaxFeasibleClipCount`(`:166`)·자동 보정(`:118`)·렌더(`<div>`→`<Card>`+카드 밖 `mt-4` 옵션 줄, 드롭다운 넷)이 계획서 기술과 일치.
  - `CaptionStyleEditor.tsx:39-55` `languageDefault*` 헬퍼 셋, `:79-90` 인라인 유효 스타일 7필드 일치.
  - `caption-preview.ts` `getPreviewVerticalInset`(top/bottom/middle 세 분기), `clip-count-budget.ts` `getMaxFeasibleClipCount`(미상→4·30초미만→0) 일치.
  - `shared/ui/atoms/`에 `segmented-control.tsx` 부재 확인, 기존 atom이 `import { Dialog as DialogPrimitive } from "radix-ui"` 형태(`dialog.tsx:5`) 사용 확인.
- 설치 확인: `radix-ui` 1.4.3이 `RadioGroup.Root`/`.Item`/`.Indicator`를 노출(`node -e` 로 `Object.keys(require('radix-ui').RadioGroup)` 확인), `globals.css:1` `@import "tailwindcss"`(v4 — `@container`·`@[600px]:` 내장) 확인. `npm install` 불필요.
- 계획서가 코드와 어긋나지 않아 그대로 구현했다.

### 고친 파일 (전수, 11개 = 계획 「고칠 파일」과 1:1)
수정 3:
| 파일 | 변경 |
| --- | --- |
| `pages/dashboard/ui/_component/UploadPodcast.tsx` | import 교체(DropdownMenu* 제거, SegmentedControl·FileVideo·CaptionStyleThumbnail·clipCountNotice·uploadButtonLabel·generationModeHint 추가), 렌더 전체 교체(`<div>`→`<Card>`, 드롭존 파일 선택 뒤 한 줄 접힘, `@container` 2열 격자+세그먼트 3개, Video style 썸네일 행, 하단 업로드 버튼). 상태·핸들러·계측·`upload()` 인자·Dropzone 설정·상한 계산·자동 보정 불변 |
| `features/caption-style/ui/CaptionStyleEditor.tsx` | `resolveEffectiveCaptionStyle` import 추가, `languageDefault*` 헬퍼 셋 제거(`:39-56`), 인라인 유효 스타일 7필드(`:79-90`)를 구조분해 호출로 교체(동작 무변경) |
| `features/caption-style/index.ts` | `CaptionStyleThumbnail` 공개 한 줄 추가 |

신규 8:
| 파일 | 내용 |
| --- | --- |
| `features/caption-style/model/effective-caption-style.ts` | `resolveEffectiveCaptionStyle` — 저장값+언어 기본값 유효 스타일(에디터·썸네일 단일 원천) |
| `features/caption-style/model/effective-caption-style.test.mjs` | 위 6 테스트 |
| `features/caption-style/ui/CaptionStyleThumbnail.tsx` | 9:16 썸네일(여백 실비율·캡션 견본, 글자 크기 비축척) |
| `shared/ui/atoms/segmented-control.tsx` | radix `RadioGroup` 기반 세그먼트 atom |
| `pages/dashboard/model/clip-count-notice.ts` | 클립 수 세그먼트 옆 안내 문구 |
| `pages/dashboard/model/clip-count-notice.test.mjs` | 위 6 테스트 |
| `pages/dashboard/model/upload-options-copy.ts` | 업로드 버튼·생성 방식 문구 |
| `pages/dashboard/model/upload-options-copy.test.mjs` | 위 4 테스트 |

`git status --porcelain` = 위 11개 그대로(수정 3 `M`, 신규 8 `??`). 「고칠 파일」 밖 편집 0. (`?? nul`은 세션 시작 시점 트리에 이미 있던 Windows 널 디바이스 잔재로 내가 만든 것이 아니며 손대지 않았다.)

### 스케치 대비 차이
분기 순서·조건·리터럴 값·사용자 대면 문구가 달라진 곳 **없음**. 「구현 스케치」의 코드 블록(함수 5개 + 에디터 before/after + barrel + 렌더)을 바이트 그대로 옮겼다.
- 포맷 차이(승인 네 범주 밖): import 묶음 배치만 house 스타일로 정렬했다 — `captionStyleLabel, CaptionStyleThumbnail` 임포트를 prettier 관례대로 여러 줄로 폈고, `clipCountNotice`·`upload-options-copy` 임포트를 기존 `pages/dashboard/model` 임포트 사이에 넣었다. 스케치가 "추가"라고만 하고 위치를 못박지 않은 자리다. 의미·식별자·순서 영향 없음.
- 사용자 대면 문구는 모두 스케치/백로그 요구 (b)~(f)와 일치: 안내 `Pre-filled from your settings. Changes here apply to this upload only.`, 라벨 `Subtitle language`/`Number of clips`/`Generation`/`Video style`+`From settings`, 세그먼트 `English`/`한국어`·`1~4`·`Auto`/`Review first`, `Captions`/`Framing`(null→`None`)/`Caption style follows the subtitle language.`/`Change in settings`, 버튼 `Upload and generate clips`·`Upload and review clips`·`Uploading...`, 짧은 소스 destructive 문구 원문 유지. 썸네일 견본 `the real reason`/`진짜 이유는`은 스케치가 지정한 비기능 견본(게이트②에서 소유자 승인본) 그대로.

### 보존(바뀌면 안 되는 것) — 확인
- 상태 4·핸들러 3·`upload()` 인자: `:79-164` 손대지 않음. 세그먼트 `onValueChange`가 기존 `handleLanguageChange`/`handleClipCountChange`/`handleReviewModeChange`를 부른다(클립은 `Number(v)`, 생성은 `v === "review"` 어댑터).
- 계측 `upload_file_selected`·`upload_options_changed` 페이로드: `handleFileDrop`·`trackOptionsChanged` 불변.
- 상한 계산·자동 보정: `getMaxFeasibleClipCount`·`setClipCount((prev)=>...)` 불변. 클립 세그먼트 disable 규칙(`hasClipCountCap`·`option.value > maxFeasibleClips`) 동일.
- Dropzone `maxSize`·`accept`·`maxFiles`·`disabled` 불변. 파일 선택 전 옵션 숨김 유지. 업로드 버튼은 files 가드 밖이라 선택 전에도 비활성 렌더, `disabled` 식 동일.
- `videoFramingSummary` 골든 문구는 `framingSummary` 그대로 표시하고 `null`에만 `None`.

### 알려진 동작 차이 (계획 「알려진 동작 차이」, 게이트②에서 소유자 승인본)
`upload_options_changed`의 발생 횟수만 바뀌고 페이로드 모양은 불변: (1) 같은 값 재선택은 이벤트 무발화(radix `RadioGroup`은 값이 바뀔 때만 `onValueChange`), (2) 방향키 이동은 한 칸마다 발화. 최종 값은 두 경우 모두 사용자가 고른 값과 동일. 승인된 계획에 명시된 대로이며 임의 변경 아님.

### 검증 (명령·결과, 저장소 루트 실행)
- `npm run check -w apps/web` → EXIT 0. verify:fsd:test 11/11, verify:fsd "FSD boundary check passed.", next lint **"No ESLint warnings or errors"**(경고 0 — `consistent-type-imports`·`no-unused-vars` 포함), tsc --noEmit 무출력·EXIT 0.
- `npm test -w apps/web` → tests **198** / suites **49** / pass 198 / fail 0, EXIT 0. 기준선 182/45에서 +16 테스트·+4 suite(새 테스트 3파일: effective-caption-style 6, clip-count-notice 6, upload-options-copy 4 = 16; describe 4개).
- lint 경고 0 조건 충족: `CaptionStyleEditor`에서 유일 소비자가 사라진 `languageDefault*` 헬퍼 셋을 함께 제거(`no-unused-vars` 경고 예방), `CAPTION_STYLE_OPTIONS`·`CAPTION_STYLE_PRESETS`는 계속 쓰여 유지.

### 테스트로 못 덮은 범위 (배포 후 실물·렌더 확인)
Node 러너(DOM·React 테스트 도구 없음)로 덮을 수 없는 것: 2열↔1열 `@container` 전환, 모바일 가로 스크롤 해소, 세그먼트 키보드 조작, `RadioGroup` `onValueChange` 발화 조건(같은 값 무발화·방향키 한 칸마다 발화), 썸네일 렌더(서체·외곽선·여백/위치 픽셀), 드롭존으로의 파일 교체. 순수 함수 3종(유효 스타일·클립 안내·버튼 문구)은 테스트로 고정했다. 프로덕션에서 클립 상한 표시가 실제로 보이려면 BUG-17(CSP `blob:`, 2026-10-01 완료·배포 대기)이 먼저 반영돼야 한다.

### 비고
- `apps/web/CLAUDE.md`는 읽기 전용이라 직접 못 고친다. 테스트 표에 추가할 행 3개(메인 루프/소유자가 반영):
  - `features/caption-style/model/effective-caption-style.test.mjs` | 저장값+언어 기본값 유효 스타일. 설정 미리보기(CaptionStyleEditor)와 업로드 폼 썸네일이 **같은 계산**을 쓰는 단일 원천 — 각 필드의 언어별 기본값 폴백과 `uppercase` 기본 `false`, 저장된 외곽선 `0` 보존(`??`→`||` 회귀)을 고정한다
  - `pages/dashboard/model/clip-count-notice.test.mjs` | 클립 수 세그먼트 옆 안내 문구. 길이를 알고 상한<4면 구체 안내(단수/복수), 그 외 일반 안내, 30초 미만은 `null`(그 안내는 파일 줄 destructive). 골든 문구가 계약
  - `pages/dashboard/model/upload-options-copy.test.mjs` | 업로드 버튼·생성 방식 문구의 생성 방식별 골든 문구
- 작업 중 발견한 문제 없음. 계획 「범위 밖 의존」은 "없음"이었고 실제로도 `apps/web/src/**` 안에서 완결됐다.
- 커밋·푸시는 하지 않았다.
