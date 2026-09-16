# FEAT-50 — 검토 화면에서 캡션 기본값 캡처

## 2026-09-16 구현 (web-dev)

계획서 `docs/plans/FEAT-50.md`(검증 완료 — 독립 무편집 4사이클 결함 0)를 파일에서 다시 읽고 그대로 구현했다.
「현재 동작」을 착수 전 코드와 대조했고 전부 일치했다(다이얼로그 푸터 넷·`working === null` 이중 가드·
`toCaptionStyle` 지역 함수 `:32-50`·두 select에 `captionStyle` 부재·`createCustomClipDraft` 스냅샷 미전달).

### 고친 파일 (신규 2 + 수정 9 = 11, 전부 `apps/web/src`)

신규:
- `widgets/clip-draft-review/model/caption-style-from-json.ts` — `ClipDraftCard`의 지역 `toCaptionStyle`을
  export 순수 함수로 추출. 판정 본문은 원본과 동일(가드·`??` 채움·`as Partial<CaptionStyle>`), `export`와
  두 입력(드래프트·스냅샷)을 가리키는 주석만 다름. 입력 타입은 `ClipDraft["captionStyle"]` 하나로 둠(스냅샷도
  같은 `JsonValue | null`, §1의 no-duplicate-type-constituents 회피).
- `widgets/clip-draft-review/model/caption-style-from-json.test.mjs` — 7 케이스: null·undefined→null,
  부분 객체 키 채움+DEFAULT_POSITION("middle"), 완전 객체 통과, 저장된 position 유지, **falsy 보존
  `{uppercase:false}`·`{outlineWidth:0}**(계획이 지목한 `||` 돌연변이 생존 케이스).

수정:
- `widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` — 지역 `toCaptionStyle`·그 주석·`CAPTION_STYLE_OPTIONS`
  임포트 제거(이 파일 유일 사용처였음), 모델 임포트 추가, `@repo/db`에서 `UploadedFile` 추가. props에
  `uploadCaptionStyle`·`onSaveAsDefault`·`isSavingDefault` 추가, 다이얼로그에 `snapshotValue={toCaptionStyle(uploadCaptionStyle)}`
  등 세 값 전달.
- `widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx` — props에 `snapshotValue`·`onSaveAsDefault`·
  `isSavingDefault` 추가. Reset을 `setWorking(snapshotValue)`로. 좌측을 2버튼 그룹(Reset·「Save as my default」)으로.
  Save 버튼은 `disabled={isSavingDefault || working === null}` + `if (working === null) return;` 이중 가드
  (Apply to all clips와 동형) — null을 `saveDefaultCaptionStyle`에 보내 기본값을 지우는 것을 막음.
- `widgets/clip-draft-review/model/use-clip-draft-review.ts` — `saveDefaultCaptionStyle` 임포트(features/settings/api
  public entry), `saveDefaultMutation` 추가(서버 액션 + `settings_defaults_saved` 계측 `source: "review_dialog"` +
  토스트 "Saved as your default caption style"), 반환에 `saveCaptionStyleAsDefault`·`isSavingDefault` 노출.
- `widgets/clip-draft-review/ui/index.tsx` — `UploadedFile` 임포트, props `uploadCaptionStyle` 추가, 훅에서
  `saveCaptionStyleAsDefault`·`isSavingDefault` 구조분해, 카드에 세 값 전달.
- `pages/upload-detail/ui/index.tsx` — `liveUploadedFileData`에서 `captionStyle: uploadCaptionStyle` 구조분해,
  위젯에 전달.
- `entities/uploaded-file/model/types.ts` — `UploadedFile` 임포트, `UploadedFileDetail`에 `captionStyle` 필드.
- `entities/uploaded-file/api/index.ts` — `getUploadedFileDetailsById`·`findUploadedFileReviewState` 두 select에
  `captionStyle: true`(함수명으로 열어 각 함수 고유 필드 블록에 삽입, 8개 동형 select 중 두 대상만).
- `entities/clip-draft/api/index.ts` — `createCustomClipDraft` args에 `captionStyle?: CaptionStyle | null` 추가,
  `args.captionStyle != null`이면 시드(AI persist와 동형). P2002 동시성 리스크 주석 보존.
- `features/clip-review/api/index.ts` — `addCustomClipDraft`가 `file.captionStyle as CaptionStyleInput | null`을
  `createCustomClipDraft`에 전달(③). 임포트 미추가 — 기존 `CaptionStyleInput`(:20) 재사용(§9).

### 스케치 대비 차이

- 분기 순서·조건·리터럴 값·사용자 문구는 스케치와 동일. 버튼 라벨("Save as my default"·"Reset style"),
  토스트("Saved as your default caption style"·"Failed to save default"), 계측 키(`source: "review_dialog"`)
  전부 스케치 그대로.
- 코드 주석 한 곳만 표현 조정: 훅 `saveDefaultMutation` 경고 주석에서 스케치의 "호출부(§5)가"를
  "호출부(CaptionStyleDialog)가"로 바꿈 — 계획서 절번호는 코드에 남기지 않는 게 맞아 실제 대상 이름으로.
  동작·사용자 노출 없음.
- 반환값 배치: `saveCaptionStyleAsDefault`는 함수 그룹(`applyStyleToAll` 뒤), `isSavingDefault`는 플래그
  그룹(`isApplyingToAll` 뒤)에 나눠 넣음 — 스케치의 "isApplyingToAll 근처"를 파일의 기존 그룹 구조에 맞춤.

### 검증

- `npm run check -w apps/web` → EXIT 0. verify:fsd:test 11/11, verify:fsd PASS, `✔ No ESLint warnings or errors`
  (§1의 CAPTION_STYLE_OPTIONS 미사용 경고 없음 = 임포트 제거 반영 확인), tsc 통과.
- `npm test -w apps/web` → EXIT 0. tests 183 / pass 183 / fail 0 (176→183, +7 신규 테스트). suites 41→42.
- `git status --short -- apps/web/src` → 변경 파일 11개가 계획 「고칠 파일」과 정확히 일치, 범위 밖 파일 0.

### 테스트로 못 덮는 범위 (배포 후 육안 — 계획 §테스트 그대로)

- 다이얼로그 렌더·다섯 버튼 배치, Reset 클릭이 `working`을 스냅샷으로 세팅하는지 (DOM 없음)
- `saveDefaultCaptionStyle` 서버 액션·`User.defaultCaptionStyle` 쓰기, 저장값이 설정 화면·다음 업로드에
  반영되는지 (DB 없음)
- `settings_defaults_saved`(`source: "review_dialog"`) 계측이 admin 분석에 기록되는지 (fire-and-forget I/O)
- 스냅샷이 DTO→위젯→카드→다이얼로그로 흐르는지 (렌더 배선)
- 커스텀 클립이 스냅샷으로 시드돼 렌더되는지 (DB write + 렌더)

### 남은 일 / 비고

- `apps/web/CLAUDE.md` 테스트 목록 표에 신규 파일 행이 필요하다(그 파일은 읽기 전용 — 보드/출력으로 보고).
  추가할 행:
  `| widgets/clip-draft-review/model/caption-style-from-json.test.mjs | toCaptionStyle의 JsonValue→CaptionStyle 강제 변환 — null/undefined→null, 누락 신규 키 채움+DEFAULT_POSITION, 완전 객체 통과, 저장 position 유지. falsy 보존(uppercase:false·outlineWidth:0)이 요점 — `??`를 `||`로 바꾼 구현은 프리셋(clean-white/mint-pop uppercase:false)·아웃라인 「−」로 0에 닿은 값을 null로 갈아치우고 나머지 케이스는 전부 통과한다(계획 검증 실측) |`
- ③ 커스텀 클립 시드는 FEAT-41/42의 "render는 드래프트 스타일만" 결정을 뒤집는 것이라 §8 주석·계획 「대안」에
  드러냈다(백로그 ③이 재판정 요구). 소유자 검토에서 이미 승인된 계획대로 시드하는 쪽으로 구현.
