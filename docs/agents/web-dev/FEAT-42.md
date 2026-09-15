# FEAT-42 — 캡션 스타일 기본값 본체 (앞 절반 ①②)

## 2026-09-15 구현 (web-dev)

계획서 `docs/plans/FEAT-42.md`(검증 클린 패스 `50aef78`)의 「고칠 파일」·「구현 스케치」대로
구현. 「현재 동작」의 0건·null 주장은 착수 전 코드와 일치함을 확인(schemas.ts:13, CaptionPreviewPlayer
early-return, createUploadDraft 무 captionStyle, findCurrentProcessingAttemptContext 셀렉트 무 captionStyle,
auto/render·analyze 본문 무 caption_style, entities/user `import type { Prisma }`).

### 고친 파일 (신규 5 · 수정 13)

신규:
- `apps/web/src/fsd/shared/config/caption-style-schema.ts` — `captionStyleSchema`·`type CaptionStyleInput`
  이관(z.object 본문·satisfies 그대로, 임포트는 `CAPTION_STYLE_OPTIONS`·`CaptionStyle`).
- `apps/web/src/fsd/features/caption-style/model/sample-captions.ts` — `SAMPLE_CAPTION_CLIP_END=10`,
  `sampleCaptionWords`(영/한 각 9단어), `firstCueText`, `firstSampleCueText`.
- `apps/web/src/fsd/features/caption-style/model/sample-captions.test.mjs` — 6 테스트(영 maxWords5·대문자,
  한 maxWords3·8, 한글 존재, maxWords8이 8단어 full line).
- `apps/web/src/inngest/caption-style-request.ts` — `autoRequestCaptionStyle`(render→undefined,
  auto+스냅샷→스냅샷, auto+null→undefined).
- `apps/web/src/inngest/caption-style-request.test.mjs` — 3 테스트(위 세 계약).

수정:
- `features/clip-review/model/schemas.ts` — `captionStyleSchema` 로컬 정의 삭제, shared에서 임포트+재수출
  (`export { captionStyleSchema }` + `export type { CaptionStyleInput }`). `updateClipDraftSchema`·
  `addCustomClipDraftSchema` 불변. 배럴·`caption-presets.test.mjs:7` 딥 임포트 재수출로 무변경 통과.
- `shared/config/constants.ts` — CaptionStyle JSDoc 주석의 스키마 위치를 `shared/config/caption-style-schema.ts`로 갱신(주석 전용).
- `features/caption-style/index.ts` — 배럴에 `sampleCaptionWords`·`SAMPLE_CAPTION_CLIP_END` 수출.
- `features/caption-style/ui/CaptionPreviewPlayer.tsx` — `sample?: boolean` prop, `firstCueText` 임포트,
  `displayText = sample ? firstCueText(cues) : activeText`(렌더 중 계산), 렌더의 `activeText`→`displayText`.
  이펙트 두 개 무변경.
- `features/caption-style/ui/CaptionStyleEditor.tsx` — `sample?: boolean`(기본 false) prop, 플레이어로 전달,
  미리보기 밑 안내를 sample/live로 분기. 라이브 `<p>` 문구 바이트 불변(FEAT-45 몫).
- `entities/user/api/index.ts` — `import type { Prisma }`→값 임포트, `import type { CaptionStyle }` 추가,
  `getUserDefaultCaptionStyle`·`updateUserDefaultCaptionStyle`(null→`Prisma.JsonNull`) 추가.
- `entities/user/server.ts` — 위 두 함수 재수출 추가.
- `features/settings/api/index.ts` — `saveDefaultCaptionStyle` 서버 액션(shared `captionStyleSchema`
  write-time 검증, 파싱 결과 저장, null=비우기, `revalidatePath("/dashboard/settings")`).
- `pages/settings/ui/index.tsx` — `initialCaptionStyle` prop, `captionStyle` state, `handleSaveCaption`·
  `handleResetCaption`(계측 `settings_defaults_saved` + `preset: matchPresetId(...)`), 반환을
  `<div className="space-y-6">`로 감싸 기존 Upload defaults Card + 새 캡션 Card 두 자식.
- `app/dashboard/settings/page.tsx` — `getUserDefaultCaptionStyle` 읽어 `initialCaptionStyle` 전달.
- `features/upload/api/index.ts` — `getUserDefaultCaptionStyle` 임포트, `prepareUpload`가 서버에서 스냅샷
  읽어 `createUploadDraft`에 `captionStyle`로 전달(검증 표면 불변).
- `entities/uploaded-file/api/index.ts` — `createUploadDraft`에 `captionStyle?: Prisma.JsonValue` 인자
  (null/미지정이면 필드 생략), `findCurrentProcessingAttemptContext` 셀렉트에 `captionStyle: true`.
- `inngest/functions.ts` — `autoRequestCaptionStyle`·`CaptionStyle` 임포트, auto/render 본문에
  `caption_style: autoRequestCaptionStyle(shouldRenderSelectedMoments, context.captionStyle as ...)`,
  analyze persist-clip-drafts에 `snapshotStyle` 시드(null이면 필드 생략).

### 스케치 대비 차이

분기 순서·조건·리터럴 값·사용자 문구는 스케치와 동일. 유일한 형식 차이:
- `pages/settings/ui/index.tsx`에서 기존 Upload defaults `<Card>` 블록을 감싼 `<div>` 안으로 옮기되
  계획 지시("한 글자도 바꾸지 않고")대로 내부 들여쓰기를 4-space 원본 그대로 두었다(6-space로 재정렬하지 않음).
  공백 차이일 뿐 동작·문구 변화 없음. `check`는 prettier를 돌리지 않으므로(=verify:fsd:test+verify:fsd+lint+tsc)
  게이트에 영향 없음.

### 검증

- `npm run check -w apps/web` → EXIT 0 (verify:fsd:test 11/11, verify:fsd 통과, next lint 무경고, tsc --noEmit 0).
  Prisma `ClipDraftCreateManyInput.captionStyle`에 `CaptionStyle` 객체 직접 대입이 타입 통과(캐스트 불필요).
- `npm test -w apps/web` → tests 154 / pass 154 / fail 0 (기준선 145 + 신규 9). 계획 기대치 154와 일치.

### 테스트로 못 덮은 범위 (계획 「못 덮는 범위」와 동일)

- 설정 화면 캡션 섹션 렌더·정지 미리보기 시각 정합·언어 토글 동시 변화 — 육안(Node 러너 DOM 없음).
- `saveDefaultCaptionStyle`·`prepareUpload` 스냅샷·`createClipDraftsBulk` 시드의 DB 왕복 — 서버 액션·Prisma.
- E2E(배포 후): 설정 저장→새 업로드→`UploadedFile.captionStyle` 스냅샷→auto 렌더 요청 단위 `caption_style`.
  `docs/release-checks.md` FEAT-41 절 :68·:69가 FEAT-42 배포 뒤 닫힌다.
- 드래프트 시드가 검토 다이얼로그 초기값 프리필 — 배포 후 검토 화면 육안.
- 플레이어가 `firstCueText`를 실제로 부르는지 — 러너가 렌더를 못 보므로 배포 후 육안.

### 범위 밖 (미착수 — 인수 시 백로그 등재 후보)

- ③ 검토 화면 인라인 저장(CaptionStyleDialog "내 기본으로 저장", Reset을 스냅샷으로, 스냅샷을 검토 UI로
  흘리는 새 데이터 흐름) — 이 계획 밖. CaptionStyleDialog.tsx·createCustomClipDraft 무변경 확인.
- `packages/db` schema.prisma:59·:186 주석이 옛 스키마 경로 인용(재수출로 경로는 안 깨짐) — web-dev 쓰기 범위 밖.
