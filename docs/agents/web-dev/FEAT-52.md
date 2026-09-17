# FEAT-52 — 캡션 스타일을 검토 화면에서 제거하고 설정 전용으로

## 2026-09-17 — 구현 (web-dev)

`docs/plans/FEAT-52.md`(파일에서 재독)대로 구현했다. 계획서 「현재 동작」은 지금 코드와 일치했다.

### 게이트 결과 (증거)

- `npm run check -w apps/web` — **EXIT 0**. `verify:fsd:test`(tests 11/11) → `verify:fsd`(passed) → `next lint` → `tsc --noEmit` 전부 통과. `next lint`는 경고 1건만 냈다: `ClipDraftCard.tsx:54 'playUrl' is defined but never used`(warning, error 아님 — 아래 참조).
- `npm test -w apps/web` — **EXIT 0**, `tests 178 / suites 42 / pass 178 / fail 0`. 테스트 파일 **25개**.
  - 기준선(착수 전 실측): `tests 183 / suites 42 / pass 183`, 파일 26개.
  - 변동: from-json −7(파일·suite 삭제) · caption-style-request 3→2(−1) · captionStyleLabel +3(+1 suite). 183 − 7 − 1 + 3 = 178, suite 42 − 1 + 1 = 42, 파일 26 − 1 = 25. **계획서 기대값과 정확히 일치.**

### 고친 파일 (전수 — 계획 「고칠 파일」 표 그대로)

**삭제 (3)**
- `src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx`
- `src/fsd/widgets/clip-draft-review/model/caption-style-from-json.ts`
- `src/fsd/widgets/clip-draft-review/model/caption-style-from-json.test.mjs`

**수정 — 검토 화면 위젯 (요구 ①)**
- `ClipDraftCard.tsx` — `CaptionStyleDialog` 렌더·import·`Caption style` 버튼·`toCaptionStyle` import·`isStyleDialogOpen` state·`handleApplyStyle` 제거. props(`onApplyToAll`·`isApplyingToAll`·`uploadCaptionStyle`·`onSaveAsDefault`·`isSavingDefault`) 제거. 두 `runSave`의 `captionStyle: undefined` 제거. `type CaptionStyle`·`type UploadedFile` import 제거.
- `ui/index.tsx` — `uploadCaptionStyle` prop·`UploadedFile` import 제거, 훅 구조분해에서 `applyStyleToAll`·`isApplyingToAll`·`saveCaptionStyleAsDefault`·`isSavingDefault` 제거, 카드 5 props 제거.
- `model/use-clip-draft-review.ts` — `applyStyleMutation`·`saveDefaultMutation`·`trackCaptionStyleEdited`·`saveMutation.onSuccess`(캡션 계측) 제거, `SaveDraftInput.captionStyle` 제거, 반환값 4개 제거, import `saveDefaultCaptionStyle`·`matchPresetId`·`CaptionStyleInput` 제거.
- `pages/upload-detail/ui/index.tsx` — `captionStyle: uploadCaptionStyle` 구조분해·`uploadCaptionStyle` prop 전달 제거.

**수정 — 저장·시드·페이로드 (요구 ②③)**
- `features/clip-review/api/index.ts` — `saveClipDraftEdit` 입력·구조분해·`updateClipDraftEdit` 인자·`addCustomClipDraft` 시드에서 `captionStyle` 제거, `type CaptionStyleInput` import 제거.
- `features/clip-review/model/schemas.ts` — `updateClipDraftSchema`의 `captionStyle` 제거. `captionStyleSchema`·`CaptionStyleInput` 재수출 유지(caption-presets.test.mjs가 이 경로로 임포트).
- `entities/clip-draft/api/index.ts` — `updateClipDraftEdit`의 `captionStyle` 파라미터·`Prisma.JsonNull` 분기 제거, `getSelectedRenderMomentsForAttempt`의 `caption_style` 매핑 제거, `createCustomClipDraft`의 `captionStyle` 인자·시드 제거, `type CaptionStyle` import 제거, `import { Prisma }`→`import type { Prisma }`(값 용례 소멸, 상단 주석 삭제).
- `inngest/functions.ts` — 디스패치 `caption_style`를 `requestCaptionStyle(snapshot)`로(bool 인자 제거), `persist-clip-drafts`의 `snapshotStyle`·시드 스프레드 제거, import·주석 갱신. `CaptionStyle` import는 디스패치 캐스트가 계속 쓰므로 유지.
- `inngest/caption-style-request.ts` — 전체 교체: `requestCaptionStyle(snapshot)`(render 게이트 제거, `isRenderMode` 파라미터 삭제), 독스트링 재작성.
- `inngest/caption-style-request.test.mjs` — `requestCaptionStyle` 2 케이스로 교체.
- `inngest/client.ts` — `RenderMoment.caption_style`·`RenderCaptionStyle` 타입·미사용 `CaptionStyle` import 제거.
- `shared/config/constants.ts` — `CaptionStyle` 독주석의 `RenderCaptionStyle` 참조를 요청 단위 `caption_style` 페이로드(`caption-style-request.ts`)로 정정. 코드·타입 무변경.

**수정 — select 경계 (요구 ②)**
- `entities/uploaded-file/api/index.ts` — `getUploadedFileDetailsById`·`findUploadedFileReviewState`의 `captionStyle: true` 제거. `findCurrentProcessingAttemptContext`의 것은 유지(주석 → `// auto·render 요청 스냅샷이 읽는다`). `createUploadDraft`의 쓰기 파라미터 유지.
- `entities/uploaded-file/model/types.ts` — `UploadedFileDetail.captionStyle`·미사용 `UploadedFile` import 제거.

**수정 — 설정 화면·편집기 (요구 ⑤⑥⑦)**
- `features/caption-style/ui/CaptionStyleEditor.tsx` — `onChange` 타입을 `(style: CaptionStyle | null) => void`로 확대, 프리셋 칩 맨 앞에 `Default` 칩 추가(`onClick={() => onChange(null)}`, `activePreset === "default"`일 때 켜짐).
- `pages/settings/ui/index.tsx` — 카드 제목 `Default caption style`→`Video style`·설명 갱신·`Captions` 섹션 헤더 추가, `previewLanguage` state + 미리보기 언어 토글 추가, 편집기 `language`/`words`를 `previewLanguage`로.

**수정 — 계측 (요구 ④)**
- `shared/analytics/lib/metadata.ts` — `settings_defaults_saved` 주석에서 `"review_dialog"` 제거. `clip_review_caption_style_edited` 키는 유지(제거 시 `satisfies Record<AnalyticsEventName>` 붕괴 — 「범위 밖 의존」).
- `shared/analytics/lib/metadata.test.mjs` — `settings_defaults_saved` 케이스 `source: "review_dialog"`→`"settings_page"`.

**수정 — 업로드 폼 발견 경로 (요구 ⑧)**
- `features/caption-style/model/caption-presets.ts` — `captionStyleLabel(style)` 순수 함수 추가(단순화안: `custom` 분기 없이 `?? "Custom"`).
- `features/caption-style/model/caption-presets.test.mjs` — `captionStyleLabel` describe 3 케이스 추가.
- `features/caption-style/index.ts` — `captionStyleLabel` 배럴 재수출.
- `app/dashboard/page.tsx` — `getUserDefaultCaptionStyle`를 `Promise.all`에 추가, `DashboardView`에 `defaultCaptionStyle as CaptionStyle | null` 전달.
- `pages/dashboard/ui/index.tsx` — `DashboardViewProps.defaultCaptionStyle` 추가, `UploadPodcast`로 전달.
- `pages/dashboard/ui/_component/UploadPodcast.tsx` — `defaultCaptionStyle` prop 추가, 옵션 블록에 읽기 전용 `Video style: <라벨>` + 설정 링크 한 줄 추가. 새 import 3개: `Link`(next/link)·`captionStyleLabel`·`type CaptionStyle`.

### 스케치 대비 차이

분기 순서·조건·리터럴 값·사용자 문구는 스케치 그대로다. 표기상의 차이만 있다:
- `caption-presets.ts`의 `captionStyleLabel` return 문을 prettier 폭 때문에 여러 줄로 폈다(로직 동일).
- `app/dashboard/page.tsx`의 `Promise.all` 구조분해를 스케치가 산문으로만 지시(`… 추가 → defaultCaptionStyle as CaptionStyle | null`)했으므로, 5번째 튜플 원소를 `{ defaultCaptionStyle }`로 인라인 구조분해했다(설정 페이지 `getUserDefaultCaptionStyle` 소비 패턴과 동형).
- `settings/ui/index.tsx`의 `previewLanguage` state를 `initialDefaults.language`로 초기화(스케치 그대로. `language` state와 같은 시드).

### 남긴 것 (의도)

- **`ClipDraftCard.tsx`의 `playUrl` prop** — 계획 「고칠 파일」이 이 prop을 제거 대상에 넣지 않았다(다이얼로그 삭제로 지금은 미사용). 계획에 없는 파일/prop은 건드리지 않는다는 규칙대로 유지했다. `@typescript-eslint/no-unused-vars`가 **`"warn"`**(eslint.config.js:27)이라 `next lint`는 경고만 내고 EXIT 0 — 게이트를 깨지 않는다.
- **stale 주석 3곳** — `use-clip-draft-review.ts`의 `onMutate`/`setQueryData` 주석과 `setSelectionMutation` 주석이 삭제된 `applyStyleMutation`·`captionStyle`을 언급한다. 계획 「고칠 파일」에 없어 코드 로직에 무관한 이 주석들은 손대지 않았다.
- **`features/clip-review/index.ts`의 `CaptionStyleInput` 재수출** — 이제 소비자 0이지만 계획 목록에 없어 유지(unused re-export, 오류 아님).
- **`metadata.ts`의 `clip_review_caption_style_edited` 키** — 「범위 밖 의존」: `@repo/db` `ANALYTICS_EVENT_NAMES`에서 이름을 빼야 완전 제거되는데 그건 web-dev 쓰기 범위 밖(packages/db). 죽은 등록으로 남긴다.

### 테스트로 못 덮은 범위 (배포 후 육안 — release-checks 등재 대상)

- 설정 카드 제목 `Video style`·설명·`Captions` 섹션 헤더 문구.
- `Default` 칩 노출·클릭 시 켜짐(null 선택)·컨트롤/미리보기가 언어 기본값을 그리는지.
- 미리보기 언어 토글이 미리보기만 바꾸고 `Save defaults`로 업로드 언어를 안 바꾸는지.
- 업로드 폼의 `Video style: <라벨>` 한 줄·설정 링크.
- 검토 화면에서 `Caption style` 버튼·다이얼로그 소멸.
- **render 실렌더가 업로드 스냅샷 스타일로 나오는지** — 실 `.mp4`로만(GPU·ffmpeg·pysubs2, 러너 밖). FEAT-51 배포 + 이 항목 배포 뒤.
- 현재 러너(`tsx --test`, DOM/React 도구 없음)로는 렌더링·DB 호출을 덮을 수 없다. 순수 로직(`requestCaptionStyle`·`captionStyleLabel`)은 `*.test.mjs`로 덮었다.

### 후속 (계획 「범위 밖 의존」 — 배포 순서 지킴)

- FEAT-53(`packages/db`, main-loop): `ClipDraft.captionStyle` 컬럼 drop. 이 항목 배포 뒤에 와야 한다(참조를 0으로 만든 것이 이 항목).
- FEAT-55(`apps/backend`, backend-dev): per-moment `caption_style` 소멸에 따른 죽은 코드 정리. 이 항목 + FEAT-53 뒤.
- 계측 이벤트 이름 완전 제거(`packages/db`): 백로그 후보(현재 미등재).
- 배포 순서: FEAT-51(배포됨) → **FEAT-52** → FEAT-53 → FEAT-55.

### 비고 (범위 밖 — 인수 시 메인 루프 갱신 대상)

`apps/web/CLAUDE.md`(읽기 전용)의 테스트 목록 표가 이 구현으로 낡는다:
- 헤더 문장 "현재 26개 파일, 42 suite, 183개 테스트" → **25개 파일, 42 suite, 178개 테스트**로 갱신 필요.
- `widgets/clip-draft-review/model/caption-style-from-json.test.mjs` 행(FEAT-50 toCaptionStyle) — 파일 삭제로 **행 제거** 필요.
- `inngest/caption-style-request.test.mjs` 행 — 내용이 `autoRequestCaptionStyle`(render는 undefined) 기준이라 **`requestCaptionStyle`(auto·render 공통, 스냅샷 or undefined)로 갱신** 필요.
- `features/caption-style/model/caption-presets.test.mjs` 행 — `matchPresetId`만 언급. `captionStyleLabel`(Default/프리셋 라벨/Custom, 잉여 분기 없는 폴백) describe가 추가됐음을 반영 필요.
