# BUG-18 — 설정 `Video style` 저장 버튼 둘을 하나로 합치고 미저장 변경을 표시

## 2026-10-15 구현 (web-dev, 게이트② 2026-10-15 개방)

계획서 `docs/plans/BUG-18.md`를 파일에서 다시 읽고 그대로 구현했다. 「현재 동작」 절의 모든
줄번호·인용을 구현 전 실제 코드와 대조해 일치함을 확인한 뒤 착수했다(어긋남 0).

### 고친 파일 (수정 4 / 신규 2 — 계획 「고칠 파일」과 동일)

1. `apps/web/src/fsd/pages/settings/model/video-style-dirty.ts` (신규)
   - `VideoStyleSnapshot` 인터페이스 + `hasUnsavedVideoStyle` 순수 비교 함수.
   - `CAPTION_STYLE_FIELDS: Record<keyof CaptionStyle, true>`로 여덟 필드를 tsc에 묶고,
     `captionStyleEquals`가 null/undefined를 합쳐 필드별 비교. 스케치와 바이트 수준 동일.
2. `apps/web/src/fsd/pages/settings/model/video-style-dirty.test.mjs` (신규)
   - 11개 `it`(계획 「테스트」 1~11). 11번은 여덟 필드 각각을 하나씩 바꾼 표를 한 `it`에서 전수.
3. `apps/web/src/fsd/entities/user/api/index.ts`
   - `updateUserDefaultCaptionStyle`·`updateUserDefaultVideoPaddingPercent` 삭제,
     세 컬럼을 한 `db.user.update`로 쓰는 `updateUserVideoStyle` 신설.
   - 리더 `getUserDefaultCaptionStyle`·`getUserDefaultVideoPaddingPercent`는 보존(route가 읽음).
4. `apps/web/src/fsd/entities/user/server.ts`
   - barrel에서 두 옛 쓰기 제거, `updateUserVideoStyle` 추가(알파벳 순).
5. `apps/web/src/fsd/features/settings/api/index.ts`
   - import에서 두 옛 쓰기 제거·`updateUserVideoStyle` 추가(`updateUserUploadDefaults` 유지).
   - `saveDefaultCaptionStyle`·`saveDefaultVideoPaddingPercent` 삭제, 합친 `saveVideoStyle` 신설
     (여백 파싱 + 두 언어 write-time 검증 → `updateUserVideoStyle` 한 번, DB 오류 try/catch).
     `saveUploadDefaults`는 그대로.
6. `apps/web/src/fsd/pages/settings/ui/index.tsx`
   - import: `useEffect` 추가, `saveVideoStyle`로 교체, `hasUnsavedVideoStyle` 추가.
   - `savedVideoStyle` baseline state + `videoStyleDirty` 계산 추가.
   - `persistVideoPadding`·`handleSaveCaption`·`handleResetCaption` 삭제 →
     `handleSaveVideoStyle`(합친 저장 + baseline 갱신 + `settings_defaults_saved` 계측),
     `handleResetFraming`·`handleResetCaptions`(로컬만), `beforeunload` 경고 `useEffect`.
   - framing 블록: "Save framing" 제거, "Reset framing"만 로컬 리셋으로.
   - 캡션 안내 문구 "Caption styles are saved separately for each language." →
     "Each language has its own caption style."
   - 카드 하단: 저장 버튼 하나(`Save video style`, `isSaving || !videoStyleDirty`일 때 비활성) +
     `Reset both languages`(로컬) + `videoStyleDirty`일 때 "Unsaved changes".
   - framing 도움말 "Captions keep their current position. Applies to both languages."는 보존.

### 스케치 대비 차이

없음. 분기 순서·조건·리터럴 값·사용자 문구 모두 계획서 「구현 스케치」와 동일하게 구현했다.
삭제 대상이 아닌 `getUserDefaultVideoPaddingPercent` 리더를 `updateUserVideoStyle` 앞으로
이동 배치했는데(스케치가 명시한 "삭제" 범위 밖의 재배치), 동작·시그니처 불변이다.

### 검증

- `npm run check -w apps/web` → EXIT 0 (`verify:fsd:test` 11/0 · `verify:fsd` 통과 ·
  `next lint` 경고 0 · `tsc --noEmit` 통과).
- `npm test -w apps/web` → EXIT 0, 227/0 (56 suite). 직전 216/55에서 +11 테스트·+1 suite —
  신규 `video-style-dirty.test.mjs`(`hasUnsavedVideoStyle` 11 케이스) 전부 통과.
- 삭제 함수 전수 grep(`saveDefaultCaptionStyle`·`saveDefaultVideoPaddingPercent`·
  `updateUserDefaultCaptionStyle`·`updateUserDefaultVideoPaddingPercent`·`persistVideoPadding`·
  `handleSaveCaption`·`handleResetCaption`): 잔존 참조 0(남은 것은 `saveVideoStyle` 주석의
  설명용 언급과 새 `handleResetCaptions` 핸들러뿐).

### 테스트로 못 덮은 범위 (러너에 DOM/외부 I/O 없음 — `보류` 사유 아님)

- 저장 버튼 활성/비활성, `beforeunload` 경고, 토스트, 실제 DB 반영, `updateUserVideoStyle`의
  원자성, `revalidatePath`, 분석 이벤트 전송. 전부 러너 밖(DOM·외부 I/O)이라 순수 함수만 덮었다.
- 배포 후 수동 확인 후보는 계획서 「테스트 > 못 덮는 범위」의 ①~④ 그대로. 배포 원장 영향
  (대체 마감 `release-checks.md:79`, 재앵커 `:53`·`:325`)은 메인 루프 인수 몫.

### 비고(메인 루프 반영 필요 — web-dev 읽기 전용 파일)

1. `apps/web/CLAUDE.md` 테스트 목록 표에 아래 행 추가 필요:
   `| pages/settings/model/video-style-dirty.test.mjs | 설정 Video style 카드의 미저장 판정
   (hasUnsavedVideoStyle). 여백·두 언어 캡션을 한 스냅샷으로 비교하고, CaptionStyle 여덟 필드를
   Record<keyof>로 tsc에 묶어 필드 누락 시 저장 버튼이 안 켜지는 회귀를 막는다(필드 전수 케이스).
   옛 저장값의 marginV 키 부재(undefined)를 null과 합쳐 불러오자마자 뜨는 거짓 미저장을 막는다 |`
   또한 머리말 "현재 31개 파일, 55 suite, 216개 테스트"를 "32개 파일, 56 suite, 227개 테스트"로 갱신.
2. `features/caption-style/ui/CaptionStyleEditor.tsx:33` 주석 꼬리표 "(요구 ⑤)"는 이 항목 뒤
   낡은 참조가 된다(계획서 「비고」). 주석 본문은 참이라 이 항목에서 손대지 않음 — 문서 위생.
