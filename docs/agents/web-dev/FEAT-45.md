# FEAT-45 — 검토 화면 "transcript/source" 문구를 사용자 말로 풀어 씀

## 2026-09-15 — 구현 (web-dev)

계획서 `docs/plans/FEAT-45.md`(검증 클린 패스 판, 커밋 `36456dc` 이후 무변경)의 「고칠 파일」 넷·before/after 여섯 쌍을 그대로 구현했다. 게이트② 개방 커밋 `7211994`.

### 착수 전 확인 (B-3)

계획서 「현재 동작」이 현 코드와 일치함을 네 파일에서 확인:
- `review-language-notice.ts` — 반환문 `:19`, 판정 `:16-18`, 주석 `:10`(낡은 `CaptionStyleEditor.tsx:310-311` 인용), `showsEnglishSourceForTranslation :25-29` 모두 계획서 기술대로.
- `review-language-notice.test.mjs` — `KOREAN_NOTICE :10-11`, Spanish 단언 `:41-44` 그대로.
- `ClipDraftCard.tsx` — `English transcript`가 `:482`, `showsEnglishSource` 조건 `:480` 내부.
- `CaptionStyleEditor.tsx` — 라이브(else) 분기 `:318-323`, 마지막 문장 `the words here are the English source.`(`:321-322`), 샘플 분기 `:313-316`은 별개.

### 고친 파일 (수정 4 · 신규 0)

| 파일 | 변경 |
| --- | --- |
| `apps/web/src/fsd/widgets/clip-draft-review/model/review-language-notice.ts` | (1) 주석 `:10`의 `CaptionStyleEditor.tsx:310-311` 줄번호 인용 → `CaptionStyleEditor의 라이브 미리보기 안내` 내용 앵커. (2) 반환문 `:19`의 `This review shows the English transcript.` → `This review shows what's said in the video, in English.` |
| `apps/web/src/fsd/widgets/clip-draft-review/model/review-language-notice.test.mjs` | 골든 문자열 둘(`KOREAN_NOTICE`, Spanish 단언)의 꼬리 문장을 새 카피로 교체. 테스트 개수·구조 불변 |
| `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | 카드 라벨 `:482` `English transcript` → `What&apos;s said in the video (English)` (JSX 이스케이프) |
| `apps/web/src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx` | 라이브 분기 마지막 문장 `the words here are the English source.` → `the words shown here are what&apos;s said in the video, in English.` (앞 두 문장·className·em dash 불변) |

`ui/index.tsx` 주석은 계획서 「결정: 손대지 않음」대로 건드리지 않았다. 세 문구 모두 공통 어구 `what's said in the video, in English`를 공유한다.

### 스케치 대비 차이

없음. before/after 여섯 쌍을 문자 그대로 적용했다. 사용자에게 보이는 문구·분기 순서·조건·리터럴 값 변경 없음. prettier가 `CaptionStyleEditor.tsx` 줄바꿈을 스케치와 다르게 접을 수 있다는 계획서 단서대로 두었고, `npm run check`가 재포맷 없이 통과하여 현 줄바꿈이 80칼럼 기준을 만족함을 확인.

### 검증 (B-5)

```
npm run check -w apps/web   → verify:fsd:test 11/11, verify:fsd 통과, next lint "No ESLint warnings or errors", tsc --noEmit 통과. EXIT 0
npm test -w apps/web        → tests 154, suites 35, pass 154, fail 0. EXIT 0
```

테스트 기준선 154 불변(계획서 기대치와 일치).

### 테스트로 못 덮은 범위

- 카드 라벨(`ClipDraftCard.tsx`)·캡션 편집기 안내(`CaptionStyleEditor.tsx`)는 JSX 렌더 문자열이라 Node 내장 러너(DOM·React 도구 없음)로 확인 불가 — 실제 검토 화면 표시는 배포 후 육안 확인.
- 헤더 안내는 골든 테스트가 순수 함수 반환값을 잡지만, `ui/index.tsx:285-289`의 실제 렌더는 러너 밖.

### 인수 시 메인 루프 몫 (내 범위 밖 — 재확인용 기록)

계획서 「못 덮는 범위」가 지목한 후속 문서 갱신은 web-dev 범위 밖이라 손대지 않았다:
- `docs/release-checks.md` FEAT-37 절의 옛 헤더 문구·「English transcript」 라벨 인용 줄을 `대체(FEAT-45)`로 마감하고 새 카피 기준 확인 줄 등재.
- 같은 파일 FEAT-43 절의 「English transcript」 라벨 서술 갱신(여전히 영어이나 텍스트가 바뀜).
- `apps/web/CLAUDE.md` 테스트 표 `review-language-notice.test.mjs` 행의 「English transcript」 골든 문구 언급 갱신. (이 파일은 web-dev 읽기 전용 — 비고로 보고함.)

### 비고

- `apps/web/CLAUDE.md:83` 테스트 표의 `review-language-notice.test.mjs` 행이 옛 「English transcript」 라벨을 언급한다. 읽기 전용이라 직접 고치지 않았다. 새 라벨 `What's said in the video (English)`·새 헤더 카피 기준으로 갱신이 필요하다(메인 루프/문서 몫).
- 작업 트리에 FEAT-45와 무관한 기존 변경(`apps/web/.claude/settings.local.json` 수정, 루트 `nul` 미추적)이 있었다. 건드리지 않았다. 커밋·푸시는 메인 루프 몫.
