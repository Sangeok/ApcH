# FEAT-56 — FEAT-52·53이 남긴 죽은 코드 여섯 정리

## 2026-09-21 구현 (web-dev)

계획서 `docs/plans/FEAT-56.md`를 파일에서 다시 읽고, 「현재 동작」 여섯 관측을 코드와 대조해 전부 일치함을 확인한 뒤 「고칠 파일」·「구현 스케치」대로 구현했다. 전부 삭제·주석 정정이며 새 순수 함수는 없다.

### 고친 파일 (전수 11개 — 계획 「고칠 파일」과 정확히 일치)

1. `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` — ① `playUrl: string | null;` props 타입·구조분해 `playUrl,` 제거.
2. `apps/web/src/fsd/widgets/clip-draft-review/ui/index.tsx` — ① `<ClipDraftCard>`의 `playUrl={readyPlayUrl}` 전달 제거. `readyPlayUrl` 선언(:100-101)·의존성 사용(:228)·본체 `playUrlState`(:403)는 유지.
3. `apps/web/src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts` — ② 죽은 주석 3곳: `setQueryData` 객체 안 `captionStyle` 3줄 주석 제거, `applyStyleMutation`을 가리키던 주석 2개를 스케치대로 재작성.
4. `apps/web/src/fsd/features/clip-review/index.ts` — ③ `export type { CaptionStyleInput } from "./model/schemas";` 배럴 재수출 제거.
5. `apps/web/src/fsd/features/clip-review/model/schemas.ts` — ③ 고아 상류 재수출 `export type { CaptionStyleInput } from "~/fsd/shared/config/caption-style-schema";` 제거. `captionStyleSchema` 재수출과 그 주석은 유지(딥 임포트 소비자 `caption-presets.test.mjs` 있음).
6. `apps/web/src/fsd/shared/config/constants.ts` — ④ `CaptionStyle` doc의 `렌더 디스패처의 JSON 캐스팅, 검토 UI가 전부 이 타입 하나를 참조한다.` → `렌더 디스패처의 JSON 캐스팅이 전부 이 타입 하나를 참조한다.`
7. `apps/web/src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx` — ⑤ 3분기 삼항(`sample ? / language==="Korean" ? / else`)을 도달하는 `sample` 안내 `<p>` 하나로 축약, 주석도 스케치대로 교체. `sample`·`language` prop은 다른 곳에서 계속 쓰여 유지.
8. `apps/web/src/fsd/features/caption-style/model/sample-captions.ts` — ⑤ `koreanSampleCues`·`previewCaptionCues` 함수 통째 제거, `KR_WORDS` 주석을 "두 소비자 공유" → "설정 화면 정지 샘플 어휘"로 갱신. `firstCueText`·`firstSampleCueText`·`sampleCaptionWords`·`SAMPLE_CAPTION_CLIP_END`·`KR_WORDS`·`CaptionCue` 타입은 유지(전부 소비자 있음).
9. `apps/web/src/fsd/features/caption-style/ui/CaptionPreviewPlayer.tsx` — ⑤ import를 `firstCueText`만 남김, `useMemo`를 `previewCaptionCues(...)` 래핑 없이 `buildCaptionCues(...)` 직접 반환으로 축약(`sample=true`에서 항등이었으므로 동치). deps에서 `language`·`props.sample` 제거. `language`(폰트·글꼴군)·`props.sample`(`:125` displayText)은 다른 곳에서 계속 쓰여 유지.
10. `apps/web/src/fsd/features/caption-style/model/sample-captions.test.mjs` — ⑤ import를 `firstSampleCueText`만 남김, `koreanSampleCues`·`previewCaptionCues` describe(8 `it`) 제거. `firstSampleCueText` describe(6 `it`)는 유지.
11. `apps/web/src/fsd/shared/config/caption-style-schema.ts` — ⑥ 검증기 주석 "세 컬럼"→"두 컬럼", `ClipDraft.captionStyle` 인용 제거.

### 스케치 대비 차이

없음. 분기 순서·조건·리터럴 값·사용자에게 보이는 문구가 모두 스케치와 동일하다. 사용자 대면 문구는 남은 정지 샘플 안내(`This is a sample. Your clips use your own video and words — here you're setting the size, color, position, and words per line.`) 하나이며 원문 그대로다.

### 검증 (둘 다 실제 출력 확인)

- `npm run check -w apps/web` — EXIT 0. 체인 `verify:fsd:test && verify:fsd && next lint && tsc --noEmit` 전부 통과. `✔ No ESLint warnings or errors`(요구 ②a: 기존 `playUrl` 경고 1건 소멸 확인). FSD boundary check passed.
- `npm test -w apps/web` — EXIT 0. `tests 170 / suites 40 / pass 170 / fail 0`. 착수 기준선 178/42에서 예측대로 `-8 it`(tests 178→170), `-2 describe`(suites 42→40). 테스트 파일은 `sample-captions.test.mjs`가 `firstSampleCueText`로 남아 25개 불변.
- `git diff --name-only` — 위 11파일과 정확히 일치, 범위 밖 변경 0.

### 잔재 소멸 재확인

- `grep previewCaptionCues|koreanSampleCues|CaptionStyleInput apps/web/src` → 유일 잔여는 `shared/config/caption-style-schema.ts:44`의 `CaptionStyleInput` **정의**(계획이 유지 대상으로 명시). 두 함수는 완전 제거.
- `grep playUrl ClipDraftCard.tsx` → 0건.

### 요구 ②b (sample=false 경로 0) — 러너 밖, 정적 열거로 충족

이 항목 적용 후 `features/caption-style`에서 `sample`에 의존하는 코드는 넷(`CaptionStyleEditor.tsx:77` 기본값·`:331` 전달, `CaptionPreviewPlayer.tsx` prop 타입·`:125` displayText)이며 앞 셋은 분기가 아니다. 넷째 `:125`의 `: activeText` 갈래만 도달 불가로 남는데, 이는 유지하기로 한 `playUrl` machinery와의 접합부라 계획 「대안」이 (B)로 분리해 남긴 것이다.

### 못 덮은 범위 (배포 후 육안 / 후속 후보)

- Node 러너에 DOM·React 렌더가 없어, 검토 카드·설정 화면·미리보기 플레이어의 실제 렌더 마크업 무변경은 배포 후 육안 확인 몫.
- `CaptionPreviewPlayer`의 `playUrl` 기반 `<video>` 재생 machinery와 `:125`의 `: activeText` 잔여 갈래는 현재 유일 소비자가 `playUrl={null}`이라 도달 불가지만, 계획 「대안」(B)·(FEAT-54 영역 접촉)로 이 항목 범위 밖. 둘은 한 덩어리라 후속 정리 후보로 남긴다.
