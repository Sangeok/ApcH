# FEAT-37 — 한국어 업로드 검토 화면에 「자막은 렌더 때 번역된다」 안내 (web-dev)

## 2026-09-09 구현

계획서 `docs/plans/FEAT-37.md`의 「고칠 파일」·「구현 스케치」 ①②③를 그대로 구현했다.
구현 전 「현재 동작」이 코드와 일치함을 확인했다 — `ui/index.tsx`의 프롭 타입
`:40 language: string`, 카드 전달 `:438 language={language}`, 헤더 크레딧 문단
`:271-277`, Fill/Clear 주석 `:278`, 임포트 블록 `:28-31`, `clipNoun`/`creditNoun`
`:231-232`, 그리고 `ClipDraftCard.tsx`의 `:53 language: string`, `:507 language={language}`,
previewText `:113`, 미리보기 `<p>` `:472-476`, boundary-snap 임포트 `:24`가 모두 스케치의
before와 정확히 일치했다.

### 고친 파일 (전수)

1. `apps/web/src/fsd/widgets/clip-draft-review/model/review-language-notice.ts` (신규)
   - 순수 함수 2개: `reviewLanguageNotice(language)` → `string | null`(nullish·공백·
     `"English"`는 null, 그 외는 값 이름이 박힌 골든 문구), `showsEnglishSourceForTranslation(language)`
     → `boolean`(`reviewLanguageNotice(x) !== null`). 스케치 전체를 그대로 옮겼다.
2. `apps/web/src/fsd/widgets/clip-draft-review/model/review-language-notice.test.mjs` (신규)
   - `subtitle-status.test.mjs` 형식 차용(`.ts` 확장자 임포트, `node:assert/strict` + `node:test`).
     7개 `it`: Korean 골든·English null·nullish null·공백 null·`" Korean "` trim·Spanish
     자동 커버·`showsEnglishSourceForTranslation` 대응(양쪽 켜짐/꺼짐 실밟기 포함).
3. `apps/web/src/fsd/widgets/clip-draft-review/ui/index.tsx`
   - 임포트 `import { reviewLanguageNotice } from "../model/review-language-notice";`
     (`../model/use-clip-draft-review` 블록 아래).
   - 파생값 `const languageNotice = reviewLanguageNotice(language);`
     (`clipNoun`/`creditNoun` 아래).
   - ① 헤더 크레딧 문단(`</p>`) 다음, Fill/Clear 주석 앞에 `{languageNotice && (...)}` 조건부
     한 줄(`text-foreground bg-muted mt-2 rounded-md px-3 py-2 text-xs`) 삽입.
4. `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx`
   - 임포트 `import { showsEnglishSourceForTranslation } from "../../model/review-language-notice";`
     (`../../model/boundary-snap` 임포트 아래).
   - 파생값 `const showsEnglishSource = showsEnglishSourceForTranslation(language);`
     (`previewText` 아래).
   - ② previewText 블록을 `<div className="mt-2">` 래퍼로 바꾸고, `showsEnglishSource`일 때만
     "English transcript" 라벨(`text-muted-foreground mb-1 text-[11px] font-medium`)을 앞에.
     본문 `<p>`에서 `mt-2`를 바깥 `<div>`로 옮긴 것 외 박스 스타일(`bg-muted line-clamp-3
     rounded p-2 text-xs`) 그대로.

③ `CaptionStyleEditor.tsx:310-311`의 기존 문구는 손대지 않았다(변경 파일 목록에 없음).
백엔드·`pages/upload-detail`·barrel `index.ts`도 미접촉.

### 스케치 대비 차이

없음. 분기 순서·조건(`language !== "English"` = 안내 존재)·리터럴 값·사용자에게 보이는
문구(①`Subtitles will be translated to Korean when you generate. This review shows the
English transcript.` ②`English transcript`) 모두 스케치와 동일. 테스트도 계획 「테스트」 절의
케이스를 하나도 빠뜨리지 않았다(골든 문자열·English/nullish/공백 null·`" Korean "` trim·
Spanish 자동 커버·`showsEnglishSourceForTranslation` 대응). 테스트 파일에서 `showsEnglishSourceForTranslation`
루프의 항진명제 통과를 막으려 `"Korean"→true`·`"English"→false` 명시 단언을 두 줄 더 넣은 것은
스케치가 요구한 "같은 조건으로 켜짐" 계약을 강화하는 것이라 분기·문구 변경이 아니다.

### 검증

- `npm run check -w apps/web` → EXIT 0 (verify:fsd:test 11/11, verify:fsd `FSD boundary
  check passed`, next lint `No ESLint warnings or errors`, tsc --noEmit 통과).
- `npm test -w apps/web` → 130 pass / 0 fail (31 suite). 시작 기준값 123/29에서 신규
  테스트 파일 1개(7 it, 2 describe)로 +7 tests / +2 suites. 기존 회귀 가드 전부 통과.
- `git diff --name-only` + untracked 확인: 변경/신규가 위 4파일 + 세션 시작 시점부터 있던
  `apps/web/.claude/settings.local.json`·`nul`뿐(둘 다 이번 작업 무관).

### 테스트로 못 덮은 범위 (배포 후 Korean 업로드 검토 화면 수동 확인)

계획서 「테스트」 절의 못 덮는 범위 그대로 — `npm test`는 Node 내장 러너(`tsx --test`)라
DOM·React 도구가 없어 JSX 조건부 마크업과 런타임 값 전달·레이아웃은 러너 밖이다.

1. Korean 업로드에서 헤더 크레딧 줄 아래에 안내 한 줄이 실제로 렌더되고 `bg-muted` 박스로
   주변 산문과 구분되는가. English 업로드에선 렌더되지 않는가.
2. 각 카드 previewText 위에 "English transcript" 라벨이 뜨는가(비영어만).
3. `language` 프롭이 page→section→card로 실제 값("Korean")으로 흘러 두 표시가 켜지는가
   (타입은 tsc가 묶지만 값 전달은 아님).
