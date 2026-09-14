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

## 계획서 수령 (2026-09-15)

web-dev 계획서 `88d9c06` — **①②만**(설정 캡션 섹션·업로드 스냅샷·드래프트 시드·auto 요청 페이로드), ③(검토 다이얼로그 인라인 저장·Reset 스냅샷화)은 분할해 「범위 밖 의존」으로 넘겼다. 수정 14 / 신규 5, 전부 `apps/web`.
보드 `계획지시` → `검토대기`를 같은 커밋으로 푸시했다. 인수 때 할 일: ③을 백로그에 등재, `schema.prisma:59·186` 주석 경로 드리프트 교정.

## 검증 필수 경로 확정 (2026-09-15, 카탈로그 `docs/plans/verification-paths.md`)

- **1 인용 전수 대조** — 모든 항목.
- **2 스케치 추출·실행** — 신규 5 + 수정 14. 실제 트리에 적용해 `npm run check -w apps/web`·`npm test -w apps/web`, 끝나면 원복.
- **3 before/after 기계 적용** — 기존 파일 수정 14.
- **4 전칭 여집합 열거** — "`defaultCaptionStyle` 읽기·쓰기 0건", "모든 드래프트가 `captionStyle: null`", `captionStyleSchema`·`createUploadDraft`·`findCurrentProcessingAttemptContext` 소비자 전수, "caption_style을 싣지 않는다".
  직렬화 모양·계약 층위(요청 단위 `caption_style` 키·모양이 백엔드 `ProcessVideoRequest`와 맞는지, undefined 키 생략)도 여기서 본다.
- **5 돌연변이 검사** — 순수 함수 `autoRequestCaptionStyle`·`firstSampleCueText` 신설.
- **7 음성 시험** — shared의 W2·W6 면제, W8(`Prisma` 값 임포트) 등 FSD 경계 주장에 기댄다.
- **8 실물 렌더** — 설정 화면 캡션 섹션, `CaptionPreviewPlayer` 정지 분기, `CaptionStyleEditor` 안내 분기.
- 6(외부 신호를 해석하지 않는다 — 요청을 보낼 뿐이고 그 계약은 4에서 본다)·9(schema·config·생성 파일 변경 없음) 트리거 없음.

## 1라운드 (2026-09-15, 메인 루프 — 결함 5건, 일괄 편집)

하니스는 스크래치패드 `feat42/`에 있다(`apply42.mjs`·`mutate42.mjs`·`neg42.mjs`·`render42.mjs`·`restore42.mjs`). 계획서 코드 블록 13개를 뽑아 실제 트리에 적용했다(신규 5, 수정 13).
산문·주석으로만 지시한 부분은 하니스가 조립했다. 설정 화면 캡션 카드 마크업, `/* :46-60 그대로 */` 자리, functions.ts (A)의 주석 코드, 임포트 병합이 그것이다.

- **경로 1 (인용)**: 인용 전부 다시 읽었다. 불일치는 `ui/CaptionPreviewPlayer.tsx:54` `if (!video) return;`(실제 `:53`) 하나다. 규모 서술 "수정 14"는 표(13행)와 어긋난다(**결함 E**).
- **경로 2 (스케치 실행)**: `npm run check -w apps/web` EXIT 0(verify:fsd 통과·ESLint 0), `npx tsc --noEmit` 0, `npm test -w apps/web` **154/154** = 145 + 명세 9.
  컴파일·린트는 통과했다. 결함은 아래 렌더·돌연변이에서 나왔다.
- **경로 3 (before/after)**: 기준 줄 앵커가 모두 트리에서 한 번씩만 일치했다.
  - `CaptionPreviewPlayer.tsx:49-55` · `CaptionStyleEditor.tsx:307-312` · `schemas.ts:46-60,62-73` · `uploaded-file/api:105-121` · `upload/api:240-247` · `functions.ts:921-936`
  - (A)는 주석 스케치라 기계 적용이 아니라 해석이 필요했다(**결함 E**에 포함).
- **경로 4 (여집합·계약)**
  - `createUploadDraft` 호출부는 `upload/api/index.ts:240` 하나, `findCurrentProcessingAttemptContext` 소비자는 `functions.ts:237,705` 둘이다. 셀렉트 한 줄 추가가 안전하다.
  - `captionStyleSchema`는 정의 1곳과 `clip-review` 배럴 재수출, `caption-presets.test.mjs:7` 딥 임포트로만 쓰인다(재수출 유지로 무변경).
  - `defaultCaptionStyle` 참조 0, `createClipDraftsBulk` 호출부 하나(`:921`).
  - 요청 계약: 백엔드 `main.py:68` `caption_style: dict | None = None`, `caption_style_source.py` `select_caption_style`은 auto에서만 dict 요청 스타일을 쓴다. 키 이름과 camelCase 필드가 render moment 스타일과 같다.
  - **여집합에서 드러난 결함**: `playUrl === null`은 설정 화면만의 신호가 아니다. 검토 화면 `widgets/clip-draft-review/ui/index.tsx:100-101`이 원본 URL 로딩·실패 동안 null을 넘기고, `:458` → `ClipDraftCard.tsx:522` → `CaptionStyleDialog.tsx:74`로 편집기까지 간다(**결함 A**).
  - 저장 선례: `saveClipDraftEdit`은 `validated.data`를 쓴다(`clip-review/api/index.ts:68-69`). 계획서 `saveDefaultCaptionStyle`은 `safeParse` 뒤 원본 `input`을 써서, 조작된 요청의 여분 키가 저장·스냅샷·Modal 페이로드로 흘러간다(**결함 C**). 「대안」의 "write-time 검증이 이미 방어" 논거도 이 때문에 성립하지 않았다.
- **경로 5 (돌연변이)**: 명세 9케이스에 12종을 심었다.
  - `autoRequestCaptionStyle` A1~A4 전부 사멸. 샘플 S1~S4·S6·S7 사멸.
  - S5(KR 샘플 9→8단어) 생존 — 명세가 "≥8"이라 의도대로다.
  - **P1(플레이어 정지 분기를 `cues[1]`로) 생존** — `firstSampleCueText`는 테스트만 쓰는 사본이고, 실제로 그리는 플레이어의 `cues[0]?.text`는 어떤 테스트도 지키지 않는다(**결함 B**).
- **경로 7 (음성)**: 모두 exit 1로 검출됐고, 대조군(계획서 경로 그대로)은 exit 0이다.
  - W2 — `features/settings/api`가 `clip-review/model/schemas`를 임포트 → `[W2]`·`[W6]`
  - W6 — `pages/settings`가 `caption-style/model/sample-captions`를 직접 임포트
  - W6 — `features/upload/api`가 `entities/user/api`를 직접 임포트
- **경로 8 (렌더)** — `renderToStaticMarkup`, 서버 전용·Next 런타임·드롭다운만 스텁.
  - 설정 화면 문구: "Default caption style"·설명·"Save caption style"·"Reset to language default"·프리셋·"This is a sample." 모두 나왔다. 라이브 안내는 없다. 저장된 Bold Yellow 초기값이 프리셋 활성으로 보인다.
  - **정지 미리보기의 첫 큐 텍스트("Style your captions the way"·"지금 자막 스타일을")가 정적 HTML에 없다** — 이펙트의 setState로 그리기 때문이다. 첫 페인트가 빈 미리보기이고 경로 8로 확인할 수 없다(**결함 B**와 한 묶음).
  - **검토 다이얼로그 편집기를 `playUrl=null`(로딩)로 렌더하니 "This is a sample." 안내가 나오고 라이브 안내가 사라졌다** — 게이트① "기존 검토 화면 미리보기의 동작은 바뀌지 않아야 한다" 위반이다(**결함 A** 실측). URL이 준비된 경우는 라이브 안내 그대로다.
- **경로 8·2의 검증 가능성**: 캡션 카드 마크업이 주석으로만 적혀 독립 검증자가 렌더할 대상이 없다(FEAT-39 1사이클 무판정과 같은 모양)(**결함 D**).

**일괄 편집 1회** (계획서):
- A: 정지 샘플 모드를 `playUrl === null`에서 추론하지 않고 명시 `sample` prop으로. 편집기 기본 false, 검토 다이얼로그 무변경. 「현재 동작」에 검토 화면 null 경로, 「대안」에 기각 근거.
- B: 플레이어 이펙트는 손대지 않고 렌더 중 `firstCueText(cues)`로 첫 큐를 계산. `firstSampleCueText`가 같은 함수를 거치게 해 테스트가 그려지는 경로를 지킨다. 「테스트」에 근거와 기대 수 154.
- C: 서버 액션이 `parsed.data`를 저장.
- D: 설정 화면 반환 구조(기존 카드를 `space-y-6` 래퍼 첫 자식으로)와 캡션 카드 JSX 전체.
- E: 인용 `:54`→`:53`, "수정 14"→13, functions.ts (A)를 주석이 아닌 before/after 코드로.

원복은 `restore42.mjs`. 원복 후 `apps/web/src` 변경 0.

## 2라운드 (2026-09-15, 메인 루프 — 무편집, 무소득)

편집한 계획서(`50aef78`)를 다시 적용·실행했다. 이번에는 편집 뒤 모양에 맞춘 하니스를 썼고, 계획서는 고치지 않았다.
하니스 자체 결함 두 번은 계획서와 무관하다 — pair 파서가 `(A) … — before (:371-372)` 표지를 못 읽음, 돌연변이 S3·S4 앵커가 새 들여쓰기와 어긋남. 둘 다 하니스만 고쳐 재실행했다.

- **경로 1**: 편집으로 새로 생긴 인용을 대조했고 전부 일치했다.
  - `widgets/clip-draft-review/ui/index.tsx:100-101`·`:458`, `ClipDraftCard.tsx:522`, `CaptionStyleDialog.tsx:71-79`·`:74`
  - `CaptionPreviewPlayer.tsx:7-14`·`:19-33`·`:47-97`·`:105`·`:141`·`:155`
  - `CaptionStyleEditor.tsx:14-24`·`:65-73`·`:291-304`·`:305-312`
  - `pages/settings/ui/index.tsx:73-82`·`:85-169` — 하니스가 `:85-169`이 `<Card>`로 시작하고 `</Card>`로 끝나는지도 가드한다.
- **경로 2·3**: 신규 5, 수정 13을 적용했다.
  - before 조각 넷은 트리와 **바이트 일치**: 플레이어 `:141`·`:155`, 편집기 `:307-312`, functions.ts `:371-372`.
  - `npm run check -w apps/web` **EXIT 0**(verify:fsd 통과, ESLint 0), `npx tsc --noEmit` **0**, `npm test -w apps/web` **154/154**(계획서 기대 수와 일치).
- **경로 4**: 편집이 새 전칭을 들이지 않았다. A는 "검토 다이얼로그는 `sample`을 넘기지 않는다"다. 편집기 소비자는 `CaptionStyleDialog.tsx:71`과 새 설정 화면 둘뿐이다(1라운드 소비자 열거).
- **경로 5**: 돌연변이 12종.
  - A1~A4, S1~S4, S6~S8 사멸. S8 = `firstSampleCueText`가 `firstCueText`를 거치지 않고 둘째 큐.
  - 생존은 S5 하나(KR 샘플 9→8단어) — 명세 "≥8"대로 의도된 생존이다.
- **경로 7**: W2(settings→clip-review 스키마)·W6(pages→caption-style 내부)·W6(upload→entities/user/api)는 exit 1로 검출됐고, 대조군은 exit 0이다.
- **경로 8**:
  - 설정 화면 정적 렌더에 첫 큐 `Style your captions the way`(English, Anton)가 보인다. 저장값 Korean·maxWordsPerLine 3이면 `지금 자막 스타일을`(Noto Sans KR), 저장 색 `#FFE45E`가 적용된다.
  - 검토 다이얼로그 편집기 `playUrl=null`(로딩) → 샘플 안내 없음, 라이브 안내 그대로, 클립 단어 고정 표시 없음(기존과 같다).
  - URL 준비됨 → 라이브 안내.

원복 후 `apps/web/src` 변경 0(남은 것은 무관한 `settings.local.json`·`nul`). → `plan-verifier` 1사이클 디스패치(브리핑은 항목ID, 계획서 경로, 필수 경로 목록만).

## plan-verifier 1사이클 (2026-09-15) — 결함 0건, 실행하지 못한 경로 없음 → 클린 패스

- **브리핑**: 항목ID, 계획서 경로, 필수 경로 1·2·3·4·5·7·8만 전달했다. 검증자가 계약 준수를 확인했다.
- **경로별 증거 실질**
  - 1: 인용 전수 일치. 검토 UI 경로(`index.tsx:100-101,458`·`ClipDraftCard.tsx:521-522`·`CaptionStyleDialog.tsx:71-79,74,87`)와 낡을 주석(`schema.prisma:59,186`) 포함.
  - 2: 실제 `buildCaptionCues`로 계획서 리터럴 4종, `autoRequestCaptionStyle` 계약 3가지 통과. 스키마 이관 문구가 `z` 임포트를 명시하지 않는 점은 "본문 변경 없이 옮긴다"가 함의하고 check가 즉시 잡는다고 보아 결함으로 분류하지 않았다.
  - 3: before 앵커 전부 바이트 일치(`functions.ts:371-372`, 플레이어 `:141`·`:155`, 편집기 `:307-312` 등).
  - 4: `defaultCaptionStyle` 0건, `uploadedFile.create(` 한 곳, `clipDraft.create(Many)?(` 두 곳(둘 다 현재 시드 없음), `schema.prisma`의 `clip-review` 참조 `:59·:186`뿐 → 「범위 밖 의존」 열거 완전.
  - 5: 돌연변이 8종 전부 사멸. `firstCueText` 둘째·마지막 큐, `buildCaptionCues` 경계·대문자, 샘플 축소 포함.
  - 7: W2·W6 규칙 로직으로 shared 이관 근거 확인. `sanitizeAnalyticsMetadata` 음성 시험 — `preset`은 허용 키 목록에서 빼면 떨어지고, 실제 목록(`metadata.ts:63`)에 있다.
  - 8: sample 분기를 `renderToStaticMarkup`으로 렌더. sample=true면 첫 큐가 정적 마크업에 나오고, sample=false·playUrl=null이면 캡션이 없다(기존 동작 유지). 안내 분기도 정확히 갈린다. 7/7.
  - 보강: `ClipDraftCreateManyInput.captionStyle` 타입을 파싱해 `CaptionStyle` 무캐스트 대입 통과를 확인했다.
- **[실행하지 못한 경로]**: 없음.
- **트리 청결 직접 확인**(`git status`): `apps/web/src`·`docs`·`packages` 변경 0. 남은 것은 무관한 `settings.local.json`·`nul`.
- **판정**: 독립 무편집 무소득 패스 1회 → **클린 패스**. 보드에 `검증:` 줄을 기록했고 status는 `검토대기` 그대로다(게이트② `구현승인`은 소유자만 연다).
- **반영된 결함 분류**
  - 구현 영향 3: A 검토 다이얼로그 동작 변경, B 그려지는 첫 큐 미검증·첫 페인트 공백, C 원본 input 저장.
  - 검증 가능성 1: D 캡션 카드 마크업 명시.
  - 위생 1: E 인용·수·표기.

**인수 때 메인 루프 몫**
- 백로그 등재: ③ 검토 다이얼로그 "내 기본으로 저장"·Reset을 스냅샷으로·스냅샷 데이터 흐름·커스텀 클립 시드 재판정.
- `apps/web/CLAUDE.md`: 테스트 표에 `inngest/caption-style-request.test.mjs`·`features/caption-style/model/sample-captions.test.mjs` 두 행, 테스트 수 145 → 154 예상.
- `packages/db/prisma/schema.prisma:59·186` 주석의 `captionStyleSchema` 경로는 다음 스키마 변경 항목(FEAT-47)과 함께 교정한다. 백로그 FEAT-47 요구 ③에 덧붙인다.
- `docs/release-checks.md`: FEAT-42 절 등재. FEAT-41 절 `:68`·`:69`는 FEAT-42 배포 뒤 마감.
- 보드 area에 남은 `CaptionStyleDialog.tsx`는 분할로 이 계획이 건드리지 않는다. 인수 때 변경 파일 대조의 기준은 계획서 「고칠 파일」이다.
