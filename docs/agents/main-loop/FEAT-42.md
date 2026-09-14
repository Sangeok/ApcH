# FEAT-42 — 메인 루프 기록

## 게이트① (2026-09-15)

소유자 직접 발주(pm 미경유) — 세션 지시 "FEAt-42 수행". `계획지시`로 보드에 기록했다. 발주 시점 보드 미결은 0건이다(`보류` FEAT-01 제외).

**선행 재확인**(백로그 「선행: FEAT-38·39·40」, 「배포 순서: FEAT-41이 먼저」):
- FEAT-38 `완료`(프로덕션 마이그레이션 적용), FEAT-39 `완료`(PR #118로 `main` 합류·Vercel 프로덕션 배포), FEAT-40 `완료`.
- FEAT-41 Modal 배포 완료 — `docs/agents/main-loop/FEAT-41.md` 「배포 (2026-09-15)」 `✓ App deployed`, EXIT 0. 요청 단위 `caption_style`을 받는 백엔드가 이미 떠 있다.

담당은 `web-dev`다. 백로그 area가 전부 `apps/web` 안이다(「범위 밖 의존: 없음」). 보드 area에는 백로그 area에 `apps/web/src/fsd/features/caption-style`을 더했다. 요구 ①의 정지 미리보기와 샘플 단어 상수가 그 슬라이스에 들어가기 때문이다.

**발주 전 앵커 실측**(계획서가 다시 확인할 것 — 백로그 인용 일부가 이미 낡았다):
- `features/upload/api/index.ts:207` `export async function prepareUpload(fileInfo: {`
- `entities/clip-draft/api/index.ts:16` `export async function createClipDraftsBulk(`, 호출부 `inngest/functions.ts:921`
- 디스패치 요청 본문: `inngest/functions.ts:363` `const response = await fetch(env.PROCESS_VIDEO_ENDPOINT, {`(auto/render, `:372` `moments: shouldRenderSelectedMoments ? moments : undefined,`), `:803`(analyze), `features/upload/api/dispatch-processing.ts:162`
- 백로그의 `CaptionStyleDialog.tsx:104` Reset은 **지금 `:87`** `onClick={() => setWorking(null)}`이다(FEAT-40 이동 뒤 줄이 바뀜).
- `CaptionPreviewPlayer.tsx:53` `if (!video) return;` · `:63` `if (!video || playUrl === null) return;` — 백로그 관측 2 그대로.
- `defaultCaptionStyle`을 읽거나 쓰는 코드 0건, `settings_defaults_saved` 발신은 `pages/settings/ui/index.tsx:59` 하나(`source: "settings_page"`, `preset` 없음).

### 계획 단계에서 반드시 다룰 것

- **크기와 분할.** 백로그는 계획서가 과하게 커지면 ①②(기본값이 렌더까지 도달)와 ③(검토 화면에서 캡처)으로 쪼개라고 했다. 이 결정을 계획서 첫머리에서 근거와 함께 내린다.
  쪼갠다면 계획서는 앞쪽만 다루고 뒤쪽 범위를 「범위 밖 의존」에 정확히 적는다. 뒤쪽 백로그 등재는 메인 루프가 인수 때 한다(web-dev는 항목을 추가할 수 없다).
- **저장값 검증과 FSD 위치.** `User.defaultCaptionStyle`(Json)은 설정 화면(그리고 ③이면 검토 다이얼로그)에서 쓰이는 신뢰할 수 없는 입력이다. 서버 액션 최상단 인가, 서버 검증, `null` = 비우기(언어 기본값)를 정한다.
  `schema.prisma` 주석은 검증을 `captionStyleSchema`(`features/clip-review/model/schemas.ts`) 한 곳으로 둔다. 그런데 `features/settings`·`features/upload`에서 `features/clip-review`를 임포트하면 **peer 슬라이스 임포트(W2)** 다.
  검증 스키마를 어디서 어떻게 공유할지(하위 레이어로 옮기는지 등) 정하고, `verify:fsd`로 확인한다. 옮긴다면 기존 소비자와 테스트를 전수로 적는다.
- **읽기 시점의 방어.** DB의 Json은 스키마가 바뀐 뒤 옛 모양일 수 있다. 스냅샷 복사·드래프트 시드·디스패치·설정 화면 초기값이 무효한 저장값을 받으면 어떻게 되는지 정한다(FEAT-39 `resolveUploadDefaults`와 같은 문제).
- **스냅샷의 의미.** 스냅샷은 업로드 시점에 고정되고, 이후 기본값을 바꿔도 진행 중·기존 업로드에는 영향이 없어야 한다. `UploadedFile.captionStyle`이 null인 기존 행과 기본값 미설정 사용자의 동작이 지금과 같은지 적는다.
- **auto 디스패치 페이로드.** 요청 단위 `caption_style`을 auto 경로에만 싣는다. 백엔드는 render 모드에서 이를 쓰지 않는다(FEAT-41 소유자 결정 2026-09-14). 그래서 render는 드래프트 시드가 유일한 경로다.
  계약 타입(`inngest/client.ts`)과 백엔드 `ProcessVideoRequest.caption_style`의 키·모양이 맞는지, 스냅샷이 null일 때 키를 생략하는지 null을 보내는지 정한다.
- **드래프트 시드와 Reset.** `createClipDraftsBulk`가 스냅샷으로 `captionStyle`을 시드한다. 커스텀 클립(`createCustomClipDraft`)도 시드할지 정한다.
  Reset(`:87`)을 업로드 스냅샷으로 되돌리게 바꾸려면 검토 UI가 스냅샷을 알아야 한다 — 그 데이터 흐름을 적는다(③을 쪼개면 이 줄도 뒤쪽 몫이다).
- **설정 화면 캡션 섹션.** FEAT-40 편집기(`features/caption-style` 배럴)를 재사용하고, `playUrl === null`일 때 샘플 단어(영/한 각 1벌)로 `buildCaptionCues`의 **첫 큐를 고정**으로 그리는 정지 미리보기를 추가한다.
  미리보기 언어는 무엇을 따르는지(사용자 기본 언어 등)와, 언어에 따라 폰트·샘플·기본 크기가 함께 바뀌는지를 적는다. 기존 검토 화면 미리보기의 동작은 바뀌지 않아야 한다(`caption-preview.test.mjs` 계약).
  사용자에게 보이는 문구는 정확히 적는다(앱 UI는 영어).
- **다른 백로그 항목과의 결합.** FEAT-49가 이 샘플 단어 상수를 재사용한다 — 한 벌만 만들고 FEAT-49가 쓸 수 있는 이름·위치로 둔다.
  FEAT-45가 `CaptionStyleEditor.tsx`의 안내 문장("…the words here are the English source.")을 고칠 예정이니, 이 항목은 그 문장을 건드리지 않는다(필요하면 이유를 적는다).
- **계측.** `settings_defaults_saved`의 허용 키는 `["source", "preset"]`, `preset`은 `matchPresetId` 결과다(`metadata.ts` 주석). 캡션 기본값 저장은 `preset`을 싣는다.
  ③을 하면 `source: "review_dialog"`. 계측 실패가 저장을 막지 않게 한다.
- **테스트.** 판단 로직(저장값 검증·해석, 스냅샷→시드·페이로드 결정, Reset 대상, 정지 미리보기 첫 큐 선택)은 순수 함수로 빼 `*.test.mjs`로 덮는다.
  현재 기준선: `npm test -w apps/web` **145**. 새 테스트 파일의 `apps/web/CLAUDE.md` 표 행은 메인 루프가 인수 때 추가한다.
- **못 덮는 범위.** 정지 미리보기의 시각 정합, 설정 저장 → 새 업로드 → auto 렌더 자막이 기본값으로 나오는지, 검토 화면 시드는 배포 후 확인이다.
  `docs/release-checks.md` FEAT-41 절의 「auto가 요청 스냅샷으로 …」 줄이 FEAT-42 배포 뒤에야 닫힌다는 점을 계획서 「못 덮는 범위」와 연결한다.
