# FEAT-58: 영상 상하 동일 검은 여백 설정

agent: main-loop

작성일: 2026-09-30. 분류: STANDARD — 웹·DB·Modal 요청 계약·영상 합성이 함께 바뀐다.
요구사항 원천: `TASK_BACKLOG.md` FEAT-58(2026-09-30 소유자와의 대화에서 확정한 결정). REQ-FRAMING-009(업로드 폼 라벨)는
같은 날 계획 검증 중 소유자가 추가로 정했다(`docs/agents/main-loop/FEAT-58.md` 라운드 1).
작업 상태는 `PROJECT_BOARD.md`에서 관리한다. 구현·마이그레이션 적용·배포는 게이트②(`구현승인`) 뒤이며, DB 적용과 배포는 그와 별도로 소유자 승인을 받는다.

## 현재 동작

아래는 **Observed**다. 코드 조사 기준은 `dev` `701c17d`다(이후 커밋 `0c3f4b9`·`e94a642`는 보드·백로그·계획서만 바꿨다).
루트의 추적되지 않는 `nul`은 사용자 소유 파일이라 변경하지 않는다.

| 영역 | 코드 근거와 현재 동작 |
| --- | --- |
| 설정 화면 | `apps/web/src/fsd/pages/settings/ui/index.tsx:228`의 `Video style` 카드에는 `:262`의 `CaptionStyleEditor`가 있다. `:238`의 `Right now you can style the captions. Framing and background will`은 향후 프레이밍 기능을 예고하며 현재 여백 입력은 없다. |
| 설정 언어 | 같은 파일 `:58`의 `const [captionStyles, setCaptionStyles] = useState(initialCaptionStyles);`와 `:246`의 `SUPPORTED_LANGUAGES.map`은 영어·한국어 자막 설정을 편집한다. `:43-46`의 props에는 여백 값이 없다. |
| 저장과 인증 | `apps/web/src/fsd/features/settings/api/index.ts:43`의 `const authResult = await requireAuth();`는 자막 저장의 사용자 인증을 강제한다. `:61`의 `updateUserDefaultCaptionStyle`과 `:65`의 `revalidatePath("/dashboard/settings")`로 저장한다. `apps/web/src/fsd/shared/api/auth-guard.ts:22`는 인증 실패에 `failure("Unauthorized")`를 반환한다. |
| 사용자 기본값 | `packages/db/prisma/schema.prisma:63-64`의 `defaultCaptionStyleEnglish  Json?`·`defaultCaptionStyleKorean   Json?`가 언어별 기본값이다. `apps/web/src/fsd/entities/user/api/index.ts:167-174`의 조회도 이 두 필드를 선택한다. |
| 업로드 시 고정 | `apps/web/src/fsd/features/upload/api/index.ts:243`의 `const defaults = await getUserDefaultCaptionStyle(authResult.data.userId);`와 `:258`의 `captionStyle: captionStyleSnapshot`이 `prepareUpload`에서 초안 생성 전에 기본값을 읽어 고정한다. 파일 전송 완료 시점에 읽는 구조가 아니다. |
| 업로드 폼 라벨 | `apps/web/src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx:299`의 `<p className="mt-1.5 text-sm font-medium">Video style:</p>` 옆에 `:302`의 `{captionStyleLabel(`가 업로드 언어 쪽 자막 프리셋 라벨만 그린다. 값은 `apps/web/src/app/dashboard/page.tsx:42`의 `getUserDefaultCaptionStyle(session.user.id),`가 읽고 `apps/web/src/fsd/pages/dashboard/ui/index.tsx:131`의 `defaultCaptionStyles={defaultCaptionStyles}`를 거쳐 내려온다. 여백 값은 이 경로에 없다. |
| 업로드 저장 | `apps/web/src/fsd/entities/uploaded-file/api/index.ts:105`의 `createUploadDraft`가 `:115`의 `db.uploadedFile.create`로 저장한다. `packages/db/prisma/schema.prisma:105`의 `captionStyle          Json?`가 업로드별 스냅샷이다. |
| 작업 컨텍스트 | `apps/web/src/fsd/entities/uploaded-file/api/index.ts:504`의 `findCurrentProcessingAttemptContext`는 업로드와 현재 attempt를 조회한다. `:517`의 `captionStyle: true`를 읽고 사용자 관계에서는 `:520`의 `credits: true`만 읽는다. |
| 자동·검토 후 생성 | `apps/web/src/inngest/functions.ts:373`의 `mode: shouldRenderSelectedMoments ? "render" : "auto"`와 `:376`의 `caption_style: requestCaptionStyle(`는 두 생성 경로가 같은 요청 본문을 사용함을 보여 준다. 분석 요청 본문은 별도 `:811`의 `body: JSON.stringify({`에서 조립한다. |
| 출력 크기 | `apps/backend/main.py:212-213`의 `target_width = 1080`·`target_height = 1920`과 `:250`의 `resize = (target_width, target_height)`가 출력 크기를 고정한다. |
| 화자 프레이밍 | 같은 파일 `:240`의 `max_score_face = max(current_faces, key=lambda face: face['score']) if current_faces else None`과 `:242-243`의 음수 점수 제외 뒤, `:253-256`에서 `crop` 또는 `resize`를 선택한다. `:279`의 `scale = target_height / img.shape[0]`과 `:283`의 `center_x = int(max_score_face['x'] * scale if max_score_face else frame_width // 2)`가 세로 전체 높이에 맞춘 수평 화자 추적을 수행한다. |
| 화자 없는 프레임 | `apps/backend/main.py:267`의 `cv2.GaussianBlur(blurred_background, (121, 121), 0)`와 `:275`의 `blurred_background[center_y:center_y + resized_height, :] = resized_image`로 블러 배경과 원본을 합성한다. |
| 자막 단계 | `apps/backend/main.py:815`의 `create_vertical_video(...)` 뒤 `:838`의 `create_subtitles_with_ffmpeg(...)` 또는 `:853`의 `create_korean_subtitles_with_ffmpeg(...)`를 호출한다. `:201-202`의 `alignment`·`marginv` 해석과 `:384`·`:387`의 ASS 스타일 적용에 여백 개념은 없다. |
| 요청 전달 | `apps/backend/main.py:74`의 `caption_style: dict | None = None`, `:1254`·`:1270`의 `request_caption_style=request.caption_style`, `:1166`의 `caption_style=select_caption_style(request_caption_style)`가 HTTP → spawn/remote → 클립의 전달 경로다. |

**Contracted — 저장소 규칙:** [README.md](README.md)는 `docs/plans/<항목ID>.md`를 현재 계획의 단일 위치로 정한다. [template.md](template.md)의 일곱 최상위 절을 유지한다. `apps/web/CLAUDE.md`의 FSD 경계에 따라 공통 검증·기하 계산은 `shared`에 두고 사용자 DB 접근은 `entities/user/server.ts`로 공개한다. `apps/backend/CLAUDE.md`에 따라 계산 모듈은 stdlib 전용으로 만들고 Modal 이미지에도 등록한다.

**Inferred:** 여백은 영어·한국어 공통 값이므로 기존 언어별 `CaptionStyle` JSON에 넣으면 의미와 소유 범위가 어긋난다. 별도 정수 필드가 가장 작은 변경이다.

## 문제

사용자는 현재 영상이 채우는 9:16 출력 안에 동일한 높이의 검은 상하 여백을 선택하려 한다. 현재 설정·저장·요청·렌더 경로에는 그 값이 없어 지원되지 않는다. 요구의 원천은 `TASK_BACKLOG.md` FEAT-58이고, 아래 여덟은 그 대화의 결정, 아홉째는 계획 검증 중 소유자 결정이다.

### 확정 요구사항 — Contracted

- REQ-FRAMING-001: WHEN 사용자가 `/dashboard/settings`의 `Video style`을 연다, THEN 시스템은 상하 각각의 여백을 0~25%, 1% 단위로 조절하는 슬라이더와 현재 값을 표시해야 한다. 최초 기본값은 0%여야 한다.
- REQ-FRAMING-002: WHEN 인증된 사용자가 유효한 여백 값을 저장한다, THEN 시스템은 해당 사용자의 영어·한국어 공통 기본값을 저장하고 재진입 시 그 값을 표시해야 한다.
- REQ-FRAMING-003: WHEN `prepareUpload`가 새 업로드 초안을 만든다, THEN 시스템은 그 시점의 저장된 사용자 여백 값을 업로드에 고정해야 한다.
- REQ-FRAMING-004: WHEN 업로드에서 클립을 자동 생성하거나 검토 후 생성하거나 재시도한다, THEN 시스템은 해당 업로드에 고정된 여백 값으로 모든 클립을 생성해야 한다.
- REQ-FRAMING-005: WHERE 고정된 여백 값이 0보다 크다, 시스템은 최종 1080×1920 캔버스 안에 동일 높이의 검은 상하 배경을 만들고 중앙 영역에 영상 비율과 화자 추적을 유지하며 영상을 배치해야 한다.
- REQ-FRAMING-006: WHEN 여백 값이 달라진다, THEN 시스템은 자막의 기존 상단·중앙·하단 위치를 전체 9:16 화면 기준으로 유지해야 한다.
- REQ-FRAMING-007: WHERE 여백 값이 0이거나 기존 업로드·이전 클라이언트·캐시된 컨텍스트에 값이 없다, 시스템은 0%로 해석하고 기존 영상 생성 동작을 유지해야 한다.
- REQ-FRAMING-008: IF 설정 저장 입력이 0~25 범위의 정수가 아니거나 인증이 실패한다, THEN 시스템은 사용자 기본값을 변경하지 않고 실패를 알려야 한다. IF 저장 I/O가 실패한다, THEN 시스템은 저장 성공을 표시하지 않아야 한다.
- REQ-FRAMING-009: WHEN 사용자가 대시보드 업로드 폼을 연다, THEN `Video style:` 라벨은 저장된 여백이 0보다 클 때 자막 프리셋 라벨 뒤에 ` · <N>% top & bottom`을 덧붙여야 한다(예: `Default · 10% top & bottom`). 여백이 0이면 지금 라벨과 한 글자도 다르지 않아야 한다.

### 불변식과 구현 제약

- INV-FRAMING-001: 여백 값은 **한쪽의 높이 비율**이다. 10은 상단 10%와 하단 10%를 뜻하며 합계 10%가 아니다. 영속 값은 정수 0~25다.
- INV-FRAMING-002: 픽셀 계산은 `paddingPx = floor((1920 * percent + 50) / 100)`, 중앙 높이는 `1920 - 2 * paddingPx`다. 두 여백에 같은 정수를 쓰며 중앙 높이는 양수·짝수다. 캔버스 배경은 RGB `(0, 0, 0)`이다.
- INV-FRAMING-003: `UploadedFile.videoPaddingPercent`는 초안 생성 후 기본값 변경·확인·enqueue·분석·검토·재시도에 의해 갱신되지 않는다. 사용자 기본값과 연결된 라이브 참조가 아니다.
- INV-FRAMING-004: 블러 배경도 중앙 영역 내부에만 존재한다. 자막은 그 뒤 전체 캔버스에 합성하므로 자막 글자가 검은 여백에 겹칠 수 있다. 자막 영역까지 항상 검은 픽셀이어야 한다는 조건은 없다.
- CON-FRAMING-001: 이번 작업은 여백·중앙 프레이밍·그 저장/전달만 다룬다. 자막 계약·글꼴·번역·큐 타이밍·화자 점수 선택·크레딧·attempt/cancel 규칙·클립별 편집은 바꾸지 않는다.
- CON-FRAMING-002: 웹 공통 모듈은 클라이언트 안전한 `shared/config`, DB 함수는 `entities/user` 서버 공개 표면을 사용한다. 새 의존성·이미지 자산·마이그레이션 외 기존 데이터 삭제는 추가하지 않는다.
- CON-FRAMING-003: 새 Python 계산 모듈은 stdlib만 import하고 `add_local_python_source`에도 등록한다. HTTP의 잘못된 새 값은 거부하고, 오래된 내부 작업의 누락 값은 0으로 해석한다.
- CON-FRAMING-004: 코드 변경은 게이트②(`구현승인`) 뒤다. 운영 DB 적용·유료 GPU 실행·배포는 각각 별도 소유자 승인을 받으며, 그 증거를 문서 검증 결과로 대체하지 않는다.

### 계산 예와 상태 전이

| 한쪽 비율 | 상단 px | 중앙 크기 | 하단 px |
| --- | --- | --- | --- |
| 0% | 0 | 1080×1920 | 0 |
| 1% | 19 | 1080×1882 | 19 |
| 3% | 58 | 1080×1804 | 58 |
| 10% | 192 | 1080×1536 | 192 |
| 25% | 480 | 1080×960 | 480 |

- EX-FRAMING-001A: Given 사용자 기본값이 10이고 업로드 A의 초안이 생성되었다. When 사용자가 기본값을 25로 저장한 뒤 A를 검토 후 생성하거나 재시도하고 새 업로드 B를 만든다. Then A는 10, B는 25로 생성된다. 기존 업로드 C는 마이그레이션 기본값 0을 유지한다. 이는 REQ-FRAMING-003·REQ-FRAMING-004·REQ-FRAMING-007과 INV-FRAMING-003을 구체화한다.

슬라이더 조작은 로컬 편집이고 저장 버튼이 DB 변경 경계다. 저장 중에는 기존 `isSaving`을 공유해 여백 슬라이더·Save framing·Reset framing을 비활성화한다. 자막 편집 언어 토글은 지금처럼 활성으로 둔다(여백은 두 언어 공통이라 토글과 무관하고, 토글 동작 변경은 CON-FRAMING-001 밖이다). 실패하면 편집값을 유지해 재시도할 수 있고 성공 토스트는 내보내지 않는다. 새로 페이지를 열면 서버 저장값을 읽는다. 서로 다른 탭에서 저장하면 DB에 마지막으로 완료된 저장이 다음 업로드의 기본값이며, 이미 생성된 초안은 바뀌지 않는다. 저장과 업로드 준비가 동시에 실행되면 초안은 기본값 조회 시점에 커밋된 값 하나를 복사한다. 분석 단계는 픽셀을 생성하지 않으며 검토 뒤 `render`가 업로드 스냅샷을 사용한다.

## 고칠 파일

아래는 **Proposed** 구현 허용 집합이다. 새 경로는 `(신규)`로 구분한다. 이 집합 밖의 변경이 필요하면 계획을 갱신해 범위를 명확히 한 뒤 진행한다.

| 파일 | 변경 | 담당 경계 |
| --- | --- | --- |
| `packages/db/prisma/schema.prisma` | User의 공통 기본값, UploadedFile의 고정값 정수 필드 추가 | main-loop |
| `packages/db/prisma/migrations/20260930000000_video_padding_percent/migration.sql` `(신규)` | 두 컬럼에 NOT NULL·DEFAULT 0·0~25 CHECK 추가 | main-loop |
| `packages/db/generated/prisma/` | `prisma generate`가 두 새 필드 때문에 변경한 추적 파일만 반영. 엔진·무관한 포맷 변동 제외 | main-loop |
| `apps/web/src/fsd/shared/config/video-framing.ts` `(신규)` | 비율 범위·엄격 입력 검사·기존 데이터 해석·픽셀 계산·업로드 라벨 요약 | web |
| `apps/web/src/fsd/shared/config/video-framing.test.mjs` `(신규)` | 타입·경계·전체 비율 픽셀 계약·라벨 요약 골든 | web |
| `apps/web/src/fsd/entities/user/api/index.ts` | 여백 기본값 조회·갱신 함수 추가 | web |
| `apps/web/src/fsd/entities/user/server.ts` | 두 서버 함수 공개 | web |
| `apps/web/src/fsd/features/settings/api/index.ts` | 인증·입력 검증·별도 여백 저장 액션 | web |
| `apps/web/src/app/dashboard/settings/page.tsx` | 저장된 공통 값을 조회해 props 전달 | web |
| `apps/web/src/fsd/pages/settings/ui/index.tsx` | 언어 토글 밖에 Framing 입력·저장·초기화 추가, 낡은 예고 문구 교체 | web |
| `apps/web/src/app/dashboard/page.tsx` | 여백 기본값을 함께 읽어 `DashboardView`에 전달(REQ-FRAMING-009) | web |
| `apps/web/src/fsd/pages/dashboard/ui/index.tsx` | 여백 prop을 받아 `UploadPodcast`에 전달 | web |
| `apps/web/src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx` | `Video style:` 라벨에 여백 요약 덧붙임 | web |
| `apps/web/src/fsd/features/upload/api/index.ts` | `prepareUpload`에서 공통 기본값을 읽어 초안에 고정 | web |
| `apps/web/src/fsd/entities/uploaded-file/api/index.ts` | 초안 입력에 필수 스냅샷 필드 추가, 처리 컨텍스트 select에 포함 | web |
| `apps/web/src/inngest/video-framing-request.ts` `(신규)` | 업로드 스냅샷 → Modal 요청 키 변환 | web |
| `apps/web/src/inngest/video-framing-request.test.mjs` `(신규)` | 새 스냅샷과 필드 없는 오래된 컨텍스트의 직렬화 계약 | web |
| `apps/web/src/inngest/functions.ts` | auto·render 공통 요청 본문에 여백 스냅샷 전달 | web |
| `apps/backend/video_framing.py` `(신규)` | 엄격 입력 검사·누락 폴백·픽셀·cover/contain 계산 | backend |
| `apps/backend/test_video_framing.py` `(신규)` | stdlib unittest로 경계·대칭·크롭·원본 비율 계산 검증 | backend |
| `apps/backend/test_video_framing_wiring.py` `(신규)` | main.py AST로 spawn/remote→worker→clip→렌더 전달과 0 분기 검증 | backend |
| `apps/backend/main.py` | HTTP 입력·인자 배선·Modal 모듈 등록·양수 여백의 중앙 합성 추가 | backend |
| `apps/web/CLAUDE.md` | 테스트 수 줄과 테스트 표 두 행(신규 테스트 파일 둘) | main-loop |
| `apps/backend/CLAUDE.md` | Stage 3 `Vertical Video`에 여백 분기·순수 모듈·배선 테스트 | main-loop |

기존 `test_modal_image_sources.py`는 수정하지 않고 새 모듈 등록 누락을 검출하는 방어선으로 사용한다(음성 시험으로 실측 — 등록을 빼면 실패한다). 자막 편집기·자막 JSON 스키마·업로드 폼의 클라이언트 요청 스키마·콜백 데이터·이벤트 이름·`asd/`·`requirements.txt`는 변경 대상이 아니다. 운영 기록은 파이프라인 규칙대로 남긴다 — 구현 보고는 `docs/agents/main-loop/FEAT-58.md`, 보드는 자기 행의 `결과`, 완료 시 백로그 항목 제거.

## 구현 스케치

**규칙.** 기존 파일의 편집 지점은 전부 before/after로 싣는다. before는 현재 트리에서 **정확히 1회** 나오고, 생략 부호를 쓰지 않는다.
저장소(HEAD blob)는 전부 LF다. 작업 트리의 `main.py`·`inngest/functions.ts`·`entities/user/server.ts`는 `core.autocrlf=true` 체크아웃이라 CRLF로 보이므로, before 대조는 줄바꿈을 정규화해서 한다.
신규 파일은 전문을 싣고, 파일 끝에 덧붙이는 추가는 before 없이 「파일 끝에 빈 줄 하나를 두고 덧붙인다」로 적는다.

### 데이터 흐름과 저장 계약

```text
Settings slider → saveDefaultVideoPaddingPercent → User.defaultVideoPaddingPercent
prepareUpload → getUserDefaultVideoPaddingPercent → UploadedFile.videoPaddingPercent
findCurrentProcessingAttemptContext → requestVideoFraming → video_padding_percent
process_video(spawn / remote) → _do_process_video → process_clip → create_vertical_video
1080×1920 검은 캔버스 + 중앙 영상 → 기존 전체 화면 ASS 자막 합성 → 기존 S3 업로드
Dashboard page → getUserDefaultVideoPaddingPercent → DashboardView → UploadPodcast 라벨(표시 전용)
```

스냅샷을 새 클립 JSON이나 언어별 자막 스타일에 중복하지 않는다. 새 업로드에만 적용되며 과거 업로드를 사용자 최신값으로 backfill하지 않는다.

**schema before — 현재 :58:**

```prisma
    defaultReviewBeforeGenerate Boolean?
```

**after:**

```prisma
    defaultReviewBeforeGenerate Boolean?
    defaultVideoPaddingPercent  Int @default(0)
```

**schema before — 현재 :105:**

```prisma
    captionStyle          Json?
```

**after:**

```prisma
    captionStyle          Json?
    videoPaddingPercent   Int @default(0)
```

**신규 migration.sql — 전체:**

```sql
ALTER TABLE "User"
ADD COLUMN "defaultVideoPaddingPercent" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "User_defaultVideoPaddingPercent_check"
CHECK ("defaultVideoPaddingPercent" BETWEEN 0 AND 25);

ALTER TABLE "UploadedFile"
ADD COLUMN "videoPaddingPercent" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "UploadedFile_videoPaddingPercent_check"
CHECK ("videoPaddingPercent" BETWEEN 0 AND 25);
```

스키마 생성은 구현 중에 `npm run db:generate:client -w @repo/db`로 돌린다. 운영 적용(루트의 `npm run db:migrate`)은 별도 소유자 승인 뒤에만 돌린다(순서는 BLK-FRAMING-02). 생성물은 필드 타입과 scalar field enum이 두 모델에만 추가되는지 확인하고, 무관한 런타임·바이너리 변경이 섞이면 멈춘다.

### 웹 공통 계산 — 신규 video-framing.ts 전체

```typescript
export const VIDEO_PADDING_PERCENT_RANGE = {
  MIN: 0,
  MAX: 25,
  STEP: 1,
  DEFAULT: 0,
} as const;

export const VIDEO_FRAME_SIZE = { WIDTH: 1080, HEIGHT: 1920 } as const;

export function parseVideoPaddingPercent(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= VIDEO_PADDING_PERCENT_RANGE.MIN &&
    value <= VIDEO_PADDING_PERCENT_RANGE.MAX
    ? value
    : null;
}

export function resolveVideoPaddingPercent(value: unknown): number {
  return parseVideoPaddingPercent(value) ?? VIDEO_PADDING_PERCENT_RANGE.DEFAULT;
}

export function getVideoFrameLayout(value: unknown) {
  const percent = resolveVideoPaddingPercent(value);
  const paddingPx = Math.floor((VIDEO_FRAME_SIZE.HEIGHT * percent + 50) / 100);
  return {
    width: VIDEO_FRAME_SIZE.WIDTH,
    height: VIDEO_FRAME_SIZE.HEIGHT,
    paddingPx,
    contentHeight: VIDEO_FRAME_SIZE.HEIGHT - 2 * paddingPx,
  };
}

export function videoFramingSummary(value: unknown): string | null {
  const percent = resolveVideoPaddingPercent(value);
  return percent === 0 ? null : `${percent}% top & bottom`;
}
```

설정 저장에는 `parse`를 쓰고, 오래된 작업 컨텍스트의 읽기에는 `resolve`를 쓴다. `videoFramingSummary`는 업로드 폼 라벨의 덧붙임 문구다(REQ-FRAMING-009) — 0이면 `null`이라 라벨이 지금과 같다. 입력 `"10"`·`true`·`null`·`undefined`·소수·NaN·Infinity·-1·26을 숫자로 강제 변환해 저장하지 않는다.

### 사용자 DB 접근과 저장 액션

`entities/user/api/index.ts` 파일 끝에 빈 줄 하나를 두고 아래 두 함수를 덧붙이고, `server.ts`에서 재수출한다. 기존 자막 조회 함수를 늘려 무관한 소비자에게 필드를 전파하지 않는다.

```typescript
export async function getUserDefaultVideoPaddingPercent(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { defaultVideoPaddingPercent: true },
  });
}

export async function updateUserDefaultVideoPaddingPercent(
  userId: string,
  percent: number,
) {
  return db.user.update({
    where: { id: userId },
    data: { defaultVideoPaddingPercent: percent },
  });
}
```

**`entities/user/server.ts` before:**

```typescript
  getUserDefaultCaptionStyle,
  getUserPolarCustomerId,
```

**after:**

```typescript
  getUserDefaultCaptionStyle,
  getUserDefaultVideoPaddingPercent,
  getUserPolarCustomerId,
```

**같은 파일 before:**

```typescript
  updateUserDefaultCaptionStyle,
  updateUserPolarCustomerId,
```

**after:**

```typescript
  updateUserDefaultCaptionStyle,
  updateUserDefaultVideoPaddingPercent,
  updateUserPolarCustomerId,
```

**`features/settings/api/index.ts` 임포트 before:**

```typescript
import {
  updateUserDefaultCaptionStyle,
  updateUserUploadDefaults,
} from "~/fsd/entities/user/server";
```

**after:**

```typescript
import {
  updateUserDefaultCaptionStyle,
  updateUserDefaultVideoPaddingPercent,
  updateUserUploadDefaults,
} from "~/fsd/entities/user/server";
```

**같은 파일 before:**

```typescript
import { captionStyleSchema } from "~/fsd/shared/config/caption-style-schema";
```

**after:**

```typescript
import { captionStyleSchema } from "~/fsd/shared/config/caption-style-schema";
import { parseVideoPaddingPercent } from "~/fsd/shared/config/video-framing";
```

같은 파일 끝에 빈 줄 하나를 두고 덧붙일 액션 전체다. 기존 `requireAuth`·`ActionResult`·`failure`·`success`·`revalidatePath` 패턴과 새 parser/DB 함수를 사용한다. 기존 두 액션과 달리 DB 오류를 잡아 실패로 돌려준다(REQ-FRAMING-008 「저장 성공을 표시하지 않는다」).

```typescript
export async function saveDefaultVideoPaddingPercent(
  input: unknown,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const percent = parseVideoPaddingPercent(input);
  if (percent === null) return failure("Invalid video padding percent");

  try {
    await updateUserDefaultVideoPaddingPercent(authResult.data.userId, percent);
  } catch (error) {
    console.error("Failed to save video framing", error);
    return failure("Could not save video framing. Try again.");
  }
  revalidatePath("/dashboard/settings");
  return success();
}
```

auth 결과의 userId만 사용하며 클라이언트에 userId 입력을 받지 않는다. 기존 자막 저장/초기화는 여백 컬럼을 건드리지 않고, 새 여백 저장/초기화는 자막 컬럼을 건드리지 않는다. 새 계측 이벤트나 기존 preset 메타데이터의 의미 변경은 하지 않는다.

### 설정 페이지와 입력

**page.tsx before — 현재 :18-19:**

```typescript
  const stored = await getUserUploadDefaults(session.user.id);
  const captionStyles = await getUserDefaultCaptionStyle(session.user.id);
```

**after:**

```typescript
  const stored = await getUserUploadDefaults(session.user.id);
  const captionStyles = await getUserDefaultCaptionStyle(session.user.id);
  const framing = await getUserDefaultVideoPaddingPercent(session.user.id);
```

**page.tsx 임포트 before:**

```typescript
import {
  getUserDefaultCaptionStyle,
  getUserUploadDefaults,
} from "~/fsd/entities/user/server";
```

**after:**

```typescript
import {
  getUserDefaultCaptionStyle,
  getUserDefaultVideoPaddingPercent,
  getUserUploadDefaults,
} from "~/fsd/entities/user/server";
```

**page.tsx JSX before:**

```tsx
        korean: captionStyles.defaultCaptionStyleKorean as CaptionStyle | null,
      }}
    />
```

**after:**

```tsx
        korean: captionStyles.defaultCaptionStyleKorean as CaptionStyle | null,
      }}
      initialVideoPaddingPercent={framing.defaultVideoPaddingPercent}
    />
```

해당 값은 DB NOT NULL·CHECK가 보장하는 0~25 정수다.

**SettingsView props before — 현재 :43-46:**

```typescript
interface SettingsViewProps {
  initialDefaults: ResolvedUploadDefaults;
  initialCaptionStyles: CaptionStyleDefaults;
}
```

**after:**

```typescript
interface SettingsViewProps {
  initialDefaults: ResolvedUploadDefaults;
  initialCaptionStyles: CaptionStyleDefaults;
  initialVideoPaddingPercent: number;
}
```

**구조 분해 before:**

```typescript
  initialDefaults,
  initialCaptionStyles,
}: SettingsViewProps) {
```

**after:**

```typescript
  initialDefaults,
  initialCaptionStyles,
  initialVideoPaddingPercent,
}: SettingsViewProps) {
```

**임포트 before:**

```typescript
import {
  saveDefaultCaptionStyle,
  saveUploadDefaults,
} from "~/fsd/features/settings/api";
```

**after:**

```typescript
import {
  saveDefaultCaptionStyle,
  saveDefaultVideoPaddingPercent,
  saveUploadDefaults,
} from "~/fsd/features/settings/api";
```

**같은 파일 before:**

```typescript
  type CaptionStyleDefaults,
} from "~/fsd/shared/config/constants";
```

**after:**

```typescript
  type CaptionStyleDefaults,
} from "~/fsd/shared/config/constants";
import {
  getVideoFrameLayout,
  VIDEO_PADDING_PERCENT_RANGE,
} from "~/fsd/shared/config/video-framing";
```

공통 편집 상태와 저장 handler는 기존 `isSaving` 선언 바로 뒤에 둔다. 기존 `isSaving`을 공유하므로 저장 중에는 여백 슬라이더·Save framing·Reset framing이 비활성이다. 자막 편집 언어 토글은 건드리지 않는다.

**handler before:**

```typescript
  const [isSaving, startSaving] = useTransition();
```

**after:**

```typescript
  const [isSaving, startSaving] = useTransition();
  const [videoPaddingPercent, setVideoPaddingPercent] = useState(
    initialVideoPaddingPercent,
  );
  const framing = getVideoFrameLayout(videoPaddingPercent);

  const persistVideoPadding = (percent: number) =>
    startSaving(async () => {
      try {
        const result = await saveDefaultVideoPaddingPercent(percent);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        setVideoPaddingPercent(percent);
        toast.success("Video framing saved");
        router.refresh();
      } catch {
        toast.error("Could not save video framing. Try again.");
      }
    });
```

Framing 그룹은 `Video style` 카드 `CardContent`의 **첫 자식**으로, 기존 `Captions` 소제목 묶음 **앞**에 둔다 — 카드 설명(「업로드 시점에 고정된다」)이 두 부분을 함께 덮는다. 마크업은 같은 카드의 `space-y-4`, `text-sm font-medium`, 설명·Button 패턴을 따른다. native range를 사용해 새 UI 패키지를 설치하지 않는다.

**Framing 삽입 before:**

```tsx
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Captions</p>
```

**after:**

```tsx
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium">Framing</p>
            <label htmlFor="video-padding-percent" className="text-sm">
              Top and bottom black space
            </label>
            <input
              id="video-padding-percent"
              type="range"
              min={VIDEO_PADDING_PERCENT_RANGE.MIN}
              max={VIDEO_PADDING_PERCENT_RANGE.MAX}
              step={VIDEO_PADDING_PERCENT_RANGE.STEP}
              value={videoPaddingPercent}
              disabled={isSaving}
              aria-describedby="video-padding-help"
              aria-valuetext={`${videoPaddingPercent}% on each side`}
              onChange={(event) => setVideoPaddingPercent(Number(event.currentTarget.value))}
              className="w-full"
            />
            <p id="video-padding-help" className="text-muted-foreground text-xs">
              {videoPaddingPercent}% on each side ({framing.paddingPx}px).
              Video area: {framing.width} × {framing.contentHeight}px.
              Captions keep their current position. Applies to both languages.
            </p>
            <div className="flex gap-x-2">
              <Button onClick={() => persistVideoPadding(videoPaddingPercent)} disabled={isSaving}>
                Save framing
              </Button>
              <Button variant="outline" onClick={() => persistVideoPadding(0)} disabled={isSaving}>
                Reset framing
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Captions</p>
```

미저장 값은 설명과 슬라이더에만 반영된다. Reset framing은 0을 저장하고, 성공했을 때만 로컬 값도 0으로 바꾼다.

**자막 설명 before — 현재 :238-239:**

```tsx
              Right now you can style the captions. Framing and background will
              live here too.
```

**after:**

```tsx
              Caption styles are saved separately for each language.
```

별도의 영상·실렌더 미리보기는 요구되지 않았다. 현재 검은 배경의 자막 샘플은 그대로 유지하고 여백 픽셀·중앙 크기를 수치로 확인한다. 실제 영상 미리보기를 추가하는 작업은 이 범위에 포함하지 않는다.

### 업로드 고정과 처리 컨텍스트

**prepareUpload before — 현재 :243:**

```typescript
    const defaults = await getUserDefaultCaptionStyle(authResult.data.userId);
```

**after:**

```typescript
    const defaults = await getUserDefaultCaptionStyle(authResult.data.userId);
    const framingDefaults = await getUserDefaultVideoPaddingPercent(
      authResult.data.userId,
    );
```

**createUploadDraft 호출 before — 현재 :258:**

```typescript
      captionStyle: captionStyleSnapshot, // 업로드 시점·업로드 언어 기준 스냅샷
```

**after:**

```typescript
      captionStyle: captionStyleSnapshot, // 업로드 시점·업로드 언어 기준 스냅샷
      videoPaddingPercent: framingDefaults.defaultVideoPaddingPercent,
```

**upload api 임포트 before:**

```typescript
import { getUserDefaultCaptionStyle } from "~/fsd/entities/user/server";
```

**after:**

```typescript
import {
  getUserDefaultCaptionStyle,
  getUserDefaultVideoPaddingPercent,
} from "~/fsd/entities/user/server";
```

**`entities/uploaded-file/api/index.ts` `createUploadDraft` 입력 타입 before:**

```typescript
  captionStyle?: Prisma.JsonValue; // User.defaultCaptionStyleEnglish·Korean 중 업로드 언어 쪽의 스냅샷 (없으면 null 컬럼)
}) {
```

**after:**

```typescript
  captionStyle?: Prisma.JsonValue; // User.defaultCaptionStyleEnglish·Korean 중 업로드 언어 쪽의 스냅샷 (없으면 null 컬럼)
  videoPaddingPercent: number; // User.defaultVideoPaddingPercent의 업로드 시점 스냅샷 (FEAT-58)
}) {
```

필수 필드라 호출부가 빠뜨리면 `tsc`가 잡는다. 기존 `const { captionStyle, ...rest } = data;`와 `...rest` 저장이 이 scalar를 그대로 보존한다. 생성자 호출은 현재 `prepareUpload` 하나이며 구현 검증에서 전수 검색을 다시 한다. 업로드 폼 요청에 이 필드를 받지 않으므로 악의적인 클라이언트가 서버 기본값을 덮어쓸 수 없다.

**컨텍스트 select before — 현재 :517:**

```typescript
      captionStyle: true, // auto·render 요청 스냅샷이 읽는다
```

**after:**

```typescript
      captionStyle: true, // auto·render 요청 스냅샷이 읽는다
      videoPaddingPercent: true,
```

신규 `inngest/video-framing-request.ts`의 전체다.

```typescript
import { resolveVideoPaddingPercent } from "~/fsd/shared/config/video-framing";

export function requestVideoFraming(snapshot: unknown) {
  return { video_padding_percent: resolveVideoPaddingPercent(snapshot) };
}
```

**auto·render 본문 before — functions.ts 현재 :379:**

```typescript
            transcript_s3_key: transcriptS3Key ?? undefined,
```

**after:**

```typescript
            ...requestVideoFraming(context.videoPaddingPercent),
            transcript_s3_key: transcriptS3Key ?? undefined,
```

**functions.ts 임포트 before:**

```typescript
import { requestCaptionStyle } from "./caption-style-request";
```

**after:**

```typescript
import { requestCaptionStyle } from "./caption-style-request";
import { requestVideoFraming } from "./video-framing-request";
```

Inngest가 이전 step의 컨텍스트를 재생해 새 필드가 `undefined`여도 요청은 명시적인 0을 보낸다. `analyzeVideo` 본문은 변경하지 않는다. 분석 직후 기본값이 바뀌어도 이후 생성은 업로드 컨텍스트에서 다시 스냅샷을 읽는다. 별도 이벤트 스키마·dispatch payload·callback에 여백을 복제하지 않는다.

### 업로드 폼 라벨 — REQ-FRAMING-009

대시보드가 이미 자막 기본값을 읽어 업로드 폼까지 내려보내는 길(`app/dashboard/page.tsx` → `DashboardView` → `UploadPodcast`)에 여백 값 하나를 더 싣는다. 라벨의 덧붙임 문구는 `videoFramingSummary`가 정하고, 0이면 `null`이라 라벨이 지금과 같다.

**`app/dashboard/page.tsx` 임포트 before:**

```typescript
import {
  getUserDefaultCaptionStyle,
  getUserUploadDefaults,
} from "~/fsd/entities/user/server";
```

**after:**

```typescript
import {
  getUserDefaultCaptionStyle,
  getUserDefaultVideoPaddingPercent,
  getUserUploadDefaults,
} from "~/fsd/entities/user/server";
```

**같은 파일 before:**

```typescript
    userDefaults,
    captionStyles,
  ] = await Promise.all([
```

**after:**

```typescript
    userDefaults,
    captionStyles,
    framing,
  ] = await Promise.all([
```

**같은 파일 before:**

```typescript
    getUserDefaultCaptionStyle(session.user.id),
  ]);
```

**after:**

```typescript
    getUserDefaultCaptionStyle(session.user.id),
    getUserDefaultVideoPaddingPercent(session.user.id),
  ]);
```

**같은 파일 before:**

```tsx
        korean: captionStyles.defaultCaptionStyleKorean as CaptionStyle | null,
      }}
    />
```

**after:**

```tsx
        korean: captionStyles.defaultCaptionStyleKorean as CaptionStyle | null,
      }}
      defaultVideoPaddingPercent={framing.defaultVideoPaddingPercent}
    />
```

**`pages/dashboard/ui/index.tsx` before:**

```typescript
  defaultCaptionStyles: CaptionStyleDefaults;
}
```

**after:**

```typescript
  defaultCaptionStyles: CaptionStyleDefaults;
  defaultVideoPaddingPercent: number;
}
```

**같은 파일 before:**

```typescript
  defaultCaptionStyles,
}: DashboardViewProps) {
```

**after:**

```typescript
  defaultCaptionStyles,
  defaultVideoPaddingPercent,
}: DashboardViewProps) {
```

**같은 파일 before:**

```tsx
            defaultCaptionStyles={defaultCaptionStyles}
          />
```

**after:**

```tsx
            defaultCaptionStyles={defaultCaptionStyles}
            defaultVideoPaddingPercent={defaultVideoPaddingPercent}
          />
```

**`pages/dashboard/ui/_component/UploadPodcast.tsx` 임포트 before:**

```typescript
  type CaptionStyleDefaults,
} from "~/fsd/shared/config/constants";
```

**after:**

```typescript
  type CaptionStyleDefaults,
} from "~/fsd/shared/config/constants";
import { videoFramingSummary } from "~/fsd/shared/config/video-framing";
```

**같은 파일 before:**

```typescript
  defaultCaptionStyles: CaptionStyleDefaults;
}
```

**after:**

```typescript
  defaultCaptionStyles: CaptionStyleDefaults;
  defaultVideoPaddingPercent: number;
}
```

**같은 파일 before:**

```typescript
  defaultCaptionStyles,
}: UploadPodcastProps) {
```

**after:**

```typescript
  defaultCaptionStyles,
  defaultVideoPaddingPercent,
}: UploadPodcastProps) {
```

**같은 파일 before:**

```typescript
  const [clipCount, setClipCount] = useState<number>(defaults.clipCount);
```

**after:**

```typescript
  const [clipCount, setClipCount] = useState<number>(defaults.clipCount);
  const framingSummary = videoFramingSummary(defaultVideoPaddingPercent);
```

**같은 파일 라벨 before:**

```tsx
                          : defaultCaptionStyles.english,
                      )}
                    </span>
```

**after:**

```tsx
                          : defaultCaptionStyles.english,
                      )}
                      {framingSummary && ` · ${framingSummary}`}
                    </span>
```

업로드 폼의 언어 드롭다운을 바꾸면 자막 라벨은 언어를 따라 바뀌고, 여백 덧붙임은 두 언어 공통이라 그대로다. 여백 값은 업로드 폼의 요청으로 보내지 않는다 — 스냅샷은 여전히 서버의 `prepareUpload`가 읽는다(이 라벨은 표시 전용이다).

### 백엔드 순수 계산 — 신규 video_framing.py 전체

```python
import math

FRAME_WIDTH = 1080
FRAME_HEIGHT = 1920


def parse_video_padding_percent(value):
    if type(value) is int and 0 <= value <= 25:
        return value
    return None


def resolve_video_padding_percent(value):
    parsed = parse_video_padding_percent(value)
    return 0 if parsed is None else parsed


def frame_layout(value):
    percent = resolve_video_padding_percent(value)
    padding_px = (FRAME_HEIGHT * percent + 50) // 100
    return padding_px, FRAME_HEIGHT - 2 * padding_px


def cover_crop_geometry(source_width, source_height, width, height, center_x=None):
    if min(source_width, source_height, width, height) <= 0:
        raise ValueError("Frame dimensions must be positive")
    scale = max(width / source_width, height / source_height)
    resized_width = max(width, math.ceil(source_width * scale))
    resized_height = max(height, math.ceil(source_height * scale))
    if center_x is None:
        crop_x = (resized_width - width) // 2
    else:
        scaled_center_x = int(center_x * resized_width / source_width)
        crop_x = max(0, min(scaled_center_x - width // 2, resized_width - width))
    crop_y = (resized_height - height) // 2
    return resized_width, resized_height, crop_x, crop_y


def contain_size(source_width, source_height, width, height):
    if min(source_width, source_height, width, height) <= 0:
        raise ValueError("Frame dimensions must be positive")
    scale = min(width / source_width, height / source_height)
    resized_width = min(width, max(1, math.floor(source_width * scale + 0.5)))
    resized_height = min(height, max(1, math.floor(source_height * scale + 0.5)))
    return resized_width, resized_height
```

cover는 중앙 영역을 채우고 source의 가로 화자 좌표를 추적한다. 세로는 중앙 정렬한다. source가 세로/정사각형이어도 viewport보다 작은 배열을 만들지 않는다. contain은 원본을 비율 유지로 중앙 블러 배경에 올린다. 리사이즈의 정수 픽셀 반올림 오차 이외의 비율 왜곡은 허용하지 않는다. 화자 점수 판정과 선택은 기존 코드 그대로다.

### HTTP → worker → 클립 전달

**main.py import before — 현재 :12:**

```python
from pydantic import BaseModel
```

**after:**

```python
from pydantic import BaseModel, StrictInt
```

**모듈 임포트 before:**

```python
from caption_style_source import select_caption_style
```

**after:**

```python
from caption_style_source import select_caption_style
from video_framing import (
    parse_video_padding_percent,
    resolve_video_padding_percent,
    frame_layout,
    cover_crop_geometry,
    contain_size,
)
```

**Modal 이미지 등록 before:**

```python
    .add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy", "error_callback", "moment_prompt", "caption_style_source", "reference_translation"))
```

**after:**

```python
    .add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy", "error_callback", "moment_prompt", "caption_style_source", "reference_translation", "video_framing"))
```

**ProcessVideoRequest before — 현재 :74:**

```python
    caption_style: dict | None = None
```

**after:**

```python
    caption_style: dict | None = None
    video_padding_percent: StrictInt = 0
```

StrictInt는 문자열·bool·float의 자동 정수 변환을 막는다. 누락만 0이며 명시적인 `null`은 HTTP 유효 값이 아니다. 범위 검사는 인증 성공 뒤, 기존 `clipper = AiPodcastClipper()` 앞에 둔다.

**범위 검사 before:**

```python
            headers={"WWW-Authenticate": "Bearer"},
        )

    clipper = AiPodcastClipper()
```

**after:**

```python
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 범위(0~25)는 video_framing 한 곳이 정한다. 타입은 StrictInt가 이미 걸렀다.
    # 상태 코드는 리터럴 422다 — starlette의 HTTP_422_UNPROCESSABLE_ENTITY는 사용 중단 경고를 내고,
    # 새 이름 HTTP_422_UNPROCESSABLE_CONTENT는 캐시된 이미지 레이어의 옛 starlette에 없을 수 있다.
    if parse_video_padding_percent(request.video_padding_percent) is None:
        raise HTTPException(status_code=422, detail="Invalid video padding percent")

    clipper = AiPodcastClipper()
```

`fastapi[standard]`는 `requirements.txt`에 버전 고정이 없다. 로컬 venv(Starlette 1.3.1)에서 옛 상수 이름은 `StarletteDeprecationWarning`을 낸다(계획 검증 실측).

새 인자는 기존 위치 인자를 바꾸지 않고 끝에 붙인다.

| 경계 | before의 실제 anchor | after의 변경 |
| --- | --- | --- |
| `_do_process_video` 시그니처 | main.py :998의 `request_caption_style: dict | None = None):` | 끝을 `request_caption_style: dict | None = None, video_padding_percent: int = 0):`로 변경 |
| `process_clip` 시그니처 | :758의 `output_prefix: str | None = None, caption_style: dict | None = None):` (앞의 `output_prefix` 조각까지 써야 유일하다 — `caption_style: dict | None = None):`만으로는 자막 함수 둘까지 3곳이 걸린다) | 끝을 `output_prefix: str | None = None, caption_style: dict | None = None, video_padding_percent: int = 0):`로 변경 |
| `.spawn` 호출 | :1254의 `request_caption_style=request.caption_style,` | 다음 줄에 `video_padding_percent=request.video_padding_percent,` 추가 |
| `.remote` 호출 | :1270의 같은 keyword | 다음 줄에 같은 여백 keyword 추가 |
| worker의 클립 호출 | :1166의 `caption_style=select_caption_style(request_caption_style),` | 다음 줄에 `video_padding_percent=resolve_video_padding_percent(video_padding_percent),` 추가 |

**process_clip의 렌더 호출 before — 현재 :815:**

```python
    create_vertical_video(tracks, scores, pyframes_path, pyavi_path, audio_path, vertical_mp4_path)
```

**after:**

```python
    create_vertical_video(
        tracks, scores, pyframes_path, pyavi_path, audio_path, vertical_mp4_path,
        video_padding_percent=video_padding_percent,
    )
```

기존 callback/S3/자막 인자는 바꾸지 않는다. 내부 worker를 직접 호출하는 오래된 코드도 기본 인자 0으로 처리한다.

### 영상 합성의 양수 여백 분기

**before — main.py 현재 :211-213:**

```python
def create_vertical_video(tracks, scores, pyframes_path, pyavi_path, audio_path, output_path, framerate=25):
    target_width = 1080
    target_height = 1920
```

**after:**

```python
def create_vertical_video(tracks, scores, pyframes_path, pyavi_path, audio_path, output_path, framerate=25, video_padding_percent=0):
    target_width = 1080
    target_height = 1920
    padding_percent = resolve_video_padding_percent(video_padding_percent)
    padding_px, content_height = frame_layout(padding_percent)
```

기존 writer 생성 뒤, **기존 `if max_score_face:` 모드 선택(:253) 앞**에 아래 블록을 삽입한다. 0%는 이 블록에 들어가지 않아 기존 :253-288의 crop/resize 계산과 write를 그대로 사용한다. 최종 writer 크기는 계속 1080×1920이다. 삽입점 앞의 공백만 있는 줄(`:252`)은 건드리지 않는다.

**삽입 before:**

```python
        if max_score_face:
            mode = "crop"
```

**after (끝의 두 줄은 before 그대로):**

```python
        if padding_percent > 0:
            source_height, source_width = img.shape[:2]
            if max_score_face:
                resized_width, resized_height, crop_x, crop_y = cover_crop_geometry(
                    source_width, source_height, target_width, content_height,
                    center_x=max_score_face['x'],
                )
                resized_image = cv2.resize(
                    img, (resized_width, resized_height), interpolation=cv2.INTER_AREA,
                )
                content = resized_image[
                    crop_y:crop_y + content_height,
                    crop_x:crop_x + target_width,
                ]
            else:
                bg_width, bg_height, crop_x, crop_y = cover_crop_geometry(
                    source_width, source_height, target_width, content_height,
                )
                background = cv2.resize(img, (bg_width, bg_height))
                background = cv2.GaussianBlur(background, (121, 121), 0)
                content = background[
                    crop_y:crop_y + content_height,
                    crop_x:crop_x + target_width,
                ].copy()
                foreground_width, foreground_height = contain_size(
                    source_width, source_height, target_width, content_height,
                )
                foreground = cv2.resize(
                    img, (foreground_width, foreground_height),
                    interpolation=cv2.INTER_AREA,
                )
                left = (target_width - foreground_width) // 2
                top = (content_height - foreground_height) // 2
                content[top:top + foreground_height, left:left + foreground_width] = foreground

            canvas = np.zeros((target_height, target_width, 3), dtype=img.dtype)
            canvas[padding_px:padding_px + content_height, :] = content
            vout.write(canvas)
            continue

        if max_score_face:
            mode = "crop"
```

0%의 기존 세로 source 처리 문제를 이 변경과 함께 고치지 않는다. 양수 여백 경로는 cover/contain으로 배열 크기를 보장한다. 자막은 기존 함수가 `video_out_vertical.mp4` 전체에 나중에 그리므로 자막 위치 계산에 `padding_px`를 더하거나 빼지 않는다. 자막 글자가 여백에 걸려도 잘라내지 않는다.

### 작업 문서 — 두 CLAUDE.md

**`apps/web/CLAUDE.md` before:**

```markdown
현재 25개 파일, 40 suite, 170개 테스트. 퍼널 집계 테스트(`reporting.test.mjs`)는 로직과 함께 `apps/admin`으로 갔다.
```

**after — suite·테스트 수는 구현 뒤 `npm test -w apps/web` 출력의 `# suites`·`# tests` 실측값을 쓴다:**

```markdown
현재 27개 파일, <실측 suite> suite, <실측 tests>개 테스트. 퍼널 집계 테스트(`reporting.test.mjs`)는 로직과 함께 `apps/admin`으로 갔다.
```

같은 파일 테스트 표에서 `` | `inngest/modal-contract.test.mjs` | ``로 시작하는 줄(1회) 바로 앞에 아래 두 행을 넣는다.

```markdown
| `shared/config/video-framing.test.mjs` | 여백 비율의 입력 검사·폴백·픽셀 계산·업로드 라벨 요약(FEAT-58). `parseVideoPaddingPercent`는 정수 0~25만 받고 문자열·bool·소수·`NaN`을 **강제 변환 없이** 거부한다 — 설정 저장 액션의 유일한 검증이다. 픽셀식 `floor((1920·p+50)/100)`은 백엔드 `video_framing.py` `frame_layout`과 **같은 골든값**(1%→19, 3%→58, 10%→192, 25%→480)으로 묶인 계약이라, 한쪽만 바꾸면 설정 화면이 보여 주는 px와 실렌더가 어긋난다. `Math.round`로 바꾸는 변이는 1920×정수%에 .5 동점이 없어 등가라 테스트하지 않는다. `videoFramingSummary`의 골든 문구(`10% top & bottom`, 0이면 `null`)는 업로드 폼 라벨에 그대로 나가는 카피다 |
| `inngest/video-framing-request.test.mjs` | Modal 요청의 `video_padding_percent` 키와 값 — auto·render 공통(FEAT-58). **스냅샷이 `undefined`여도 키를 생략하지 않고 0을 보낸다**(배포 전에 시작된 Inngest run이 옛 컨텍스트를 재생하는 경우). 백엔드 `ProcessVideoRequest.video_padding_percent: StrictInt = 0`과 묶인 wire 계약이라, 키 이름이 어긋나면 pydantic이 모르는 키를 버려 **조용히 0으로 렌더된다** |
```

**`apps/backend/CLAUDE.md` before:**

```markdown
   - 1080x1920 output with GPU-accelerated encoding
```

**after:**

```markdown
   - 1080x1920 output with GPU-accelerated encoding
   - Optional top/bottom black framing (FEAT-58): `ProcessVideoRequest.video_padding_percent` (`StrictInt`, 0–25, default 0; out-of-range → 422) is the upload-time snapshot, forwarded `spawn`/`remote` → `_do_process_video` → `process_clip` → `create_vertical_video`. **0 takes the original crop/resize path unchanged.** A positive value draws equal black bands of `frame_layout(p)` px (`(1920·p+50)//100`) and re-composes the frame into the center `1080×(1920−2·pad)` viewport — cover crop following the speaker's x, or contain over a blurred background when no speaker scores. Subtitles are burned afterwards over the full 9:16 canvas, so their positions do not move. The geometry lives in the stdlib-pure `video_framing.py` (`test_video_framing.py`); `test_video_framing_wiring.py` checks the forwarding with `ast` because `main.py` cannot be imported
```

### Phase DATA: 영속 계약 확장

- status: Proposed
- satisfies: REQ-FRAMING-002, REQ-FRAMING-003, REQ-FRAMING-007
- preserves: INV-FRAMING-001, INV-FRAMING-003
- governed-by: CON-FRAMING-002, CON-FRAMING-004
- verifies: REQ-FRAMING-002, REQ-FRAMING-003, REQ-FRAMING-007
- 진입: 현재 스키마/작업 상태 재확인, main-loop의 교차 영역 작업으로 등록, 구현 범위 지시.
- 종료: 두 필드·생성물·마이그레이션 일치, 기존 행과 구버전 INSERT가 0을 얻는 것을 검증.

#### TASK-DATA-01: 두 정수 컬럼과 생성물

- satisfies: REQ-FRAMING-002, REQ-FRAMING-003, REQ-FRAMING-007
- preserves: INV-FRAMING-001, INV-FRAMING-003
- governed-by: CON-FRAMING-002, CON-FRAMING-004
- 구현 위치: 위 DB 세 경로. 생성물은 수동으로 타입을 덧붙이지 않는다.
- 검증 위치: 아래 V-SCHEMA와 기존 Prisma 생성 명령. 운영 DB 적용은 별도 실행 증거가 필요하다.
- 정지 조건: migration 디렉터리 충돌, 새로운 무관한 schema 변경, 비파괴 추가가 아닌 데이터 변환 필요.

### Phase BACKEND: 중앙 프레임 합성

- status: Proposed
- satisfies: REQ-FRAMING-004, REQ-FRAMING-005, REQ-FRAMING-006, REQ-FRAMING-007
- preserves: INV-FRAMING-001, INV-FRAMING-002, INV-FRAMING-004
- governed-by: CON-FRAMING-001, CON-FRAMING-003, CON-FRAMING-004
- verifies: REQ-FRAMING-004, REQ-FRAMING-005, REQ-FRAMING-006, REQ-FRAMING-007
- 진입: 여백 수식·HTTP 계약 고정. DB 작업과 코드 작성은 독립적이지만 양수 요청을 받는 백엔드 배포는 웹 노출보다 먼저다.
- 종료: pure/wiring/기존 이미지 등록 테스트, 0 경로 보존, 실제 MP4의 중앙 합성과 자막 좌표 확인.

#### TASK-BACKEND-01: 순수 geometry와 main.py 배선

- satisfies: REQ-FRAMING-004, REQ-FRAMING-005, REQ-FRAMING-006, REQ-FRAMING-007
- preserves: INV-FRAMING-001, INV-FRAMING-002, INV-FRAMING-004
- governed-by: CON-FRAMING-001, CON-FRAMING-003, CON-FRAMING-004
- 구현 위치: `video_framing.py`, `main.py`, 두 신규 unittest 파일, `apps/backend/CLAUDE.md`.
- 검증 위치: V-GEOMETRY·V-WIRING·V-RENDER와 기존 `test_modal_image_sources.py`.
- 정지 조건: 0% 기존 분기가 달라짐, 화자 점수·자막 좌표 변경 필요, 새 의존성 필요, 실렌더가 중앙 크기를 보장하지 못함.

### Phase WEB: 설정 저장과 업로드 스냅샷

- status: Proposed
- satisfies: REQ-FRAMING-001, REQ-FRAMING-002, REQ-FRAMING-003, REQ-FRAMING-004, REQ-FRAMING-007, REQ-FRAMING-008, REQ-FRAMING-009
- preserves: INV-FRAMING-001, INV-FRAMING-003
- governed-by: CON-FRAMING-001, CON-FRAMING-002, CON-FRAMING-004
- verifies: REQ-FRAMING-001, REQ-FRAMING-002, REQ-FRAMING-003, REQ-FRAMING-004, REQ-FRAMING-007, REQ-FRAMING-008, REQ-FRAMING-009
- 진입: 생성된 DB 필드 타입 사용 가능. 배포 진입은 DB 적용과 새 백엔드의 양수 요청 실렌더 증거 이후.
- 종료: UI·action·초안·컨텍스트·실제 요청 모두 연결, 재진입·두 언어·설정 변경 후 기존 업로드 유지 확인.

#### TASK-WEB-01: 공통 검증과 설정 UI/저장

- satisfies: REQ-FRAMING-001, REQ-FRAMING-002, REQ-FRAMING-008
- preserves: INV-FRAMING-001
- governed-by: CON-FRAMING-001, CON-FRAMING-002, CON-FRAMING-004
- 구현 위치: shared 계산·test, user API/server, settings action/page/UI.
- 검증 위치: V-INPUT·V-SETTINGS·V-STATIC.
- 정지 조건: 인증 경계 약화, 언어별로 다른 여백 상태 생성, caption 저장이 여백을 갱신하는 결합.

#### TASK-WEB-02: 업로드 고정과 auto/render 전달

- satisfies: REQ-FRAMING-003, REQ-FRAMING-004, REQ-FRAMING-007
- preserves: INV-FRAMING-003
- governed-by: CON-FRAMING-001, CON-FRAMING-002, CON-FRAMING-004
- 구현 위치: upload API, uploaded-file API, request helper/test, functions.ts, `apps/web/CLAUDE.md`(테스트 수·표 두 행 — 두 신규 테스트가 모두 들어온 뒤 한 번에).
- 검증 위치: V-PAYLOAD·V-SNAPSHOT·V-STATIC.
- 정지 조건: 크레딧/attempt 규칙 변경 필요, 다른 생성자 발견으로 허용 파일 확장 필요, 처리 시 사용자 최신 기본값을 읽는 경로가 생김.

#### TASK-WEB-03: 업로드 폼 라벨

- satisfies: REQ-FRAMING-009
- preserves: INV-FRAMING-003
- governed-by: CON-FRAMING-001, CON-FRAMING-002, CON-FRAMING-004
- 구현 위치: `app/dashboard/page.tsx`, `pages/dashboard/ui/index.tsx`, `UploadPodcast.tsx`, `shared/config/video-framing.ts`의 `videoFramingSummary`.
- 검증 위치: V-INPUT(라벨 요약 골든)·V-LABEL·V-STATIC.
- 정지 조건: 여백 0에서 라벨이 한 글자라도 달라짐, 업로드 폼 요청에 여백을 싣는 경로가 생김.

## 테스트

아래 verifier는 **Planned**다. 현재 제품 코드를 바꾸지 않았으므로 구현 테스트 통과로 기록하지 않는다.

### V-INPUT — 새 설정 입력과 픽셀 계산

- verifies: REQ-FRAMING-001, REQ-FRAMING-007, REQ-FRAMING-008, REQ-FRAMING-009
- 위치: `shared/config/video-framing.test.mjs`; `npm test -w apps/web`.
- 덮는 것: 모든 정수 0~25 승인, -1/26/0.5/문자열/bool/null/undefined/NaN/Infinity 거부, `resolve`의 0 폴백, 예시 픽셀 값, 26개 값 모두 상하 대칭·합계 1920·중앙 짝수·최소 960 확인. `videoFramingSummary`는 0·무효 값 → `null`, 10 → `"10% top & bottom"`, 25 → `"25% top & bottom"` 골든.
- 돌연변이: 범위 상한 변경·소수 허용·0을 falsy 처리·percent를 총합 비율로 해석·반올림 대신 floor를 쓰는 변이는 실패해야 한다. `Math.round`로 바꾸는 변이는 등가다(1920×정수%에 .5 동점 없음).

### V-PAYLOAD — 실제 직렬화할 요청 키

- verifies: REQ-FRAMING-004, REQ-FRAMING-007
- 위치: `inngest/video-framing-request.test.mjs`; `npm test -w apps/web`.
- 덮는 것: 0/10/25와 `undefined` 스냅샷을 JSON 직렬화/파싱하여 정확한 `video_padding_percent` 키·정수 값 확인. 새 helper를 auto/render 공통 body에 넣었는지 계획 검증의 소비자 전수 대조로 확인한다.
- 한계: helper 테스트만으로 `functions.ts`가 helper를 호출한다거나 DB select가 필드를 포함한다는 사실을 증명하지 않는다. V-SNAPSHOT에서 실제 경로를 확인한다.

### V-GEOMETRY — pure Python 계산

- verifies: REQ-FRAMING-005, REQ-FRAMING-007
- 위치: `test_video_framing.py`; `python -m unittest discover -s apps/backend -p "test_*.py"`.
- 덮는 것: 웹과 동일한 유효/무효 입력·26개 픽셀 값, 1920×1080/1080×1920/1000×1000/극단 세로 source의 cover/contain 계산, 좌/우 경계의 화자 x clamp, 중앙 y, target보다 작은 crop 없음, 0 이하 dimension의 ValueError.
- 돌연변이: cover의 max→min·clamp 제거·화자 x 대신 고정 중앙·contain의 min→max·한쪽 비율의 반감은 구별 가능한 fixture로 잡는다. 1920×정수%에서 half-pixel tie가 없으므로 Python bankers round 변이는 **등가**이며 사멸을 요구하지 않는다. 웹/Python 반올림식 일치와 26개 골든값으로 계약을 지킨다.

### V-WIRING — import 없이 전달 경로 확인

- verifies: REQ-FRAMING-004, REQ-FRAMING-007
- 위치: 신규 `test_video_framing_wiring.py`와 기존 `test_modal_image_sources.py`; 같은 unittest 명령.
- 덮는 것: `ast.parse`로 main.py를 읽어 두 spawn/remote 호출이 `request.video_padding_percent`를 전달하고, worker→process_clip→create_vertical_video가 여백 인자를 전달하는지 확인한다. `padding_percent > 0`의 `continue` 전 양수 합성, 그 밖의 기존 0 분기 보존은 AST/원문 대조로 확인한다. strict HTTP field와 모듈 등록도 확인한다.
- 음성 시험: 모듈 등록·각 전달 keyword를 한 곳씩 뺀 scratch copy에서 대응 검사가 실패해야 한다.
- 한계: AST는 실제 Pydantic/Modal 실행이나 이미지 배열의 픽셀을 증명하지 않는다.

### V-SCHEMA — DB와 생성 클라이언트

- verifies: REQ-FRAMING-002, REQ-FRAMING-003, REQ-FRAMING-007, REQ-FRAMING-008
- 위치: 제안한 두 scalar 정의·migration·생성물. 구현 단계 생성 명령 뒤 구조 대조 및 적용 승인된 검증 DB에서 SQL 확인.
- 덮는 것: 두 모델의 타입 Int/default 0, SQL NOT NULL/DEFAULT 0/CHECK 0~25와 같은 필드 이름, 기존 행 0, 구 INSERT 필드 생략 시 0, -1/26 UPDATE 거부. 특정 사용자의 기본값 변경이 UploadedFile의 기존 행을 바꾸지 않음.
- 한계: 코드 생성 성공은 운영 DB 적용 증거가 아니다. 계획 검증에서 이 SQL을 PGlite(Postgres 17)에 리허설해 실행·CHECK 거부·기존 행 0을 확인했지만(`docs/agents/main-loop/FEAT-58.md`), 운영 적용은 별도 승인 뒤다.

### V-STATIC — 저장소 게이트

- verifies: REQ-FRAMING-001, REQ-FRAMING-002, REQ-FRAMING-003, REQ-FRAMING-004
- 명령: `npm run check -w apps/web`, `npm test -w apps/web`, `npm run build -w apps/web`, `npm run check -w apps/admin`, `npm test -w apps/admin`, `python -m unittest discover -s apps/backend -p "test_*.py"`, `python -m py_compile apps/backend/main.py apps/backend/video_framing.py`.
- 덮는 것: FSD boundary/self-test·lint·타입·생성 필드 사용·빌드, 기존 테스트 회귀, Python 문법. **admin 두 줄이 있는 이유**: 생성 클라이언트(`packages/db/generated/prisma`)를 admin도 `@repo/db`로 쓴다 — 두 모델 타입에 필수 필드가 생기므로 admin 타입·테스트도 다시 돈다. unittest 출력의 실제 테스트 수가 0이면 통과로 보지 않는다.
- 한계: 이 게이트만으로 UI 조작·인증 저장·DB I/O·최종 프레임을 증명하지 않는다. **임포트 경로도 이 게이트가 다 지키지 않는다** — `verify:fsd`는 `src/fsd` 레이어 규칙만 보므로 `src/app` 라우트가 `entities/user/api`를 직접 임포트하거나 `"use client"` 화면이 `entities/user/server`를 임포트해도 통과한다(계획 검증 음성 시험 N8·N10에서 실측). 인수 때 diff의 임포트 줄을 이 스케치와 바이트 대조한다.

### V-LABEL — 업로드 폼 라벨

- verifies: REQ-FRAMING-009
- 방법: `renderToStaticMarkup`으로 `UploadPodcast`를 여백 0·10에서 렌더해 라벨 텍스트를 본다 — 0은 지금 라벨과 같고, 10은 `<프리셋 라벨> · 10% top & bottom`이다. 배포 뒤에는 설정에서 여백을 저장하고 대시보드 업로드 폼의 라벨과 언어 드롭다운 전환(자막 라벨만 바뀌고 덧붙임은 그대로)을 실물로 본다.
- 못 덮는 범위: 실물 확인은 배포 확인 원장 줄로 남긴다.

### V-SETTINGS — 배포 후 UI·인증·저장

- verifies: REQ-FRAMING-001, REQ-FRAMING-002, REQ-FRAMING-008
- 방법: desktop/모바일에서 0/10/25·키보드 방향키/포커스·표시 px·언어 토글·독립 자막 저장/초기화 확인. 저장 후 재진입해 같은 값, Reset framing 성공 후 0 확인. 저장 요청 실패 시 성공 토스트 없음·편집값 유지, 세션 만료 시 기본값 미변경 확인. action 직접 호출로 범위 밖/타입 오류도 거부되는지 확인한다.
- 못 덮는 범위: 현재 Node 러너는 DOM/실제 session/DB가 없으므로 이 프로토콜을 수동 증거로 남긴다.

### V-SNAPSHOT — 업로드·대기·재시도 실경로

- verifies: REQ-FRAMING-003, REQ-FRAMING-004, REQ-FRAMING-007
- 방법: EX-FRAMING-001A를 자동/Review first·영어/한국어에서 재현한다. User=25 이후에도 UploadedFile A=10, 신규 B=25, 기존 C=0인지 DB 읽기와 실제 Modal 요청/최종 결과를 연결해 확인한다. 초안 생성 후 S3 전송 중 설정 변경도 스냅샷을 바꾸지 않아야 한다.
- 못 덮는 범위: S3·Inngest·DB·GPU를 사용하는 외부 통합이다. 배포 뒤 승인된 실물 환경에서 실행한다. 취소·중복 enqueue·재시도 소유권은 기존 메커니즘을 유지하며 새 값이 immutable임을 함께 확인한다.

### V-RENDER — 최종 MP4와 자막

- verifies: REQ-FRAMING-004, REQ-FRAMING-005, REQ-FRAMING-006, REQ-FRAMING-007
- 방법: 0/1/3/10/25%, 화자 있음/없음, 가로/세로/정사각 source를 확인한다. `ffprobe`로 1080×1920·기존 fps/audio 유지, 디코딩한 자막 없는 프레임에서 두 검은 배경 높이와 중앙 배열 크기를 확인한다. lossy H.264의 경계 압축 오차는 원본 합성 프레임의 `(0,0,0)` 계약과 구분한다.
- 자막은 top/middle/bottom 각각을 같은 입력·스타일의 0%/양수 출력에서 비교해 전체 캔버스 좌표가 유지됨을 확인한다. 글자가 여백에 겹쳐도 허용하고 잘리지 않아야 한다. 화자 이동을 따라가는 x와 무화자 프레임의 중앙 블러 배경을 확인한다. 0%는 새 분기에 진입하지 않았다는 실행 증거와 기존 결과의 동작을 비교하며 인코딩 파일 바이트 동일성을 요구하지 않는다.
- 못 덮는 범위: GPU 인코더·cv2/ffmpegcv/ASS·실제 화자 추적 결과는 stdlib 러너가 덮지 못한다. 실패하면 양수 설정 UI를 노출하지 않는다.

### 계획서 검증과 실행 증거

계획서 검증(카탈로그 필수 경로·라운드·소득)은 이 문서가 아니라 `docs/agents/main-loop/FEAT-58.md`에 남는다. 이 계획서를 처음 쓴 세션의 자기 점검(SDD 추적성 스크립트·스크래치 하니스)은 그 기록의 라운드로 대체됐다. 통과 판정은 보드의 `검증:` 줄만이 진실이다.

## 범위 밖 의존

### BLK-FRAMING-01: 정식 파이프라인 연결

- classification: resolved — 2026-09-30 게이트① 커밋 `0c3f4b9`로 `TASK_BACKLOG.md`·`PROJECT_BOARD.md`에 FEAT-58이 올라갔고(담당 main-loop), `e94a642`에서 `검토대기`가 됐다.
- 남은 조건: 코드 변경은 게이트②(`구현승인`) 뒤다. 계획서 검증 통과를 구현 승인으로, 구현 승인을 DB 적용·배포 승인으로 읽지 않는다(CON-FRAMING-004).

### BLK-FRAMING-02: 배포 순서와 실물 증거

- classification: downstream — 코드 작성은 가능하지만 양수 여백 기능의 운영 노출 전에 닫아야 한다.
- evidence: 기존 ProcessVideoRequest(:56-74)는 여백 필드가 없고 기존 create_vertical_video(:211-288)는 전체 캔버스를 사용한다. 새 웹만 먼저 배포하면 구 백엔드가 새 키를 무시해 설정과 결과가 다를 수 있다.
- affects: Phase WEB 배포, REQ-FRAMING-004·REQ-FRAMING-005·REQ-FRAMING-007.
- required resolution: 운영 순서는 **DB 추가 적용 → 새 백엔드 배포 및 0/양수 실렌더 확인 → 새 웹 배포 → V-SETTINGS/V-SNAPSHOT**이다. 이전 웹은 DB 컬럼 기본값 0을 받아 계속 동작하고 새 백엔드는 여백 키 누락을 0으로 받는다. API 타입 검증과 실제 MP4 확인은 담당 운영 실행 증거로 남긴다.
- stop condition: DB 필드가 실제로 없거나 새 백엔드가 양수 값을 반영하는 증거 없이 슬라이더를 운영에 노출하려는 경우.

단일 web-dev 또는 backend-dev에게 이 전체 계획을 넘기면 `packages/db`와 상대 워크스페이스는 그 담당의 쓰기 범위 밖이다. 여기서는 `agent: main-loop`로 교차 경계를 명시하고 위 Task별로 범위를 나눈다. 담당별 계획이 필요해지면 새 작업 ID를 별도로 연결하며 이 기능 요구사항을 중복 정의하지 않는다.

**검증 상태:** 이 계획서는 스스로 준비 완료를 판정하지 않는다 — 보드 행의 `검증:` 줄(클린 패스)과 게이트②가 판정한다. 미해결 제품 결정은 없다(업로드 폼 라벨은 2026-09-30 소유자가 REQ-FRAMING-009로 정했다).

**복구:** 양수 스냅샷이 아직 만들어지지 않았다면 구 웹으로 복귀할 수 있고 추가 컬럼은 0 기본값으로 남겨 둔다. 양수 스냅샷이 생긴 뒤에는 구 웹 worker나 구 백엔드로 일괄 복귀하면 기존 업로드의 값을 잃으므로 하지 않는다. 문제 시 새 업로드/여백 편집을 제한하는 수정 배포를 하고, 기존 스냅샷 전달·해석 경로는 유지한 채 원인을 수정한다. 운영 데이터/새 컬럼을 삭제하거나 기존 스냅샷을 0으로 덮어쓰는 복구는 이 범위 밖이다.

## 대안

- **언어별 CaptionStyle JSON에 여백 필드 추가:** 공통 구도 설정을 두 언어에 중복 저장하게 되고 caption schema/preset/구 렌더 계약까지 넓혀야 하므로 선택하지 않는다.
- **생성 직전에 User 기본값을 조회:** 검토·대기 중 기본값 변경이 이미 업로드한 영상에 영향을 주어 INV-FRAMING-003을 깨므로 선택하지 않는다.
- **전체 영상 위에 검은 띠를 덮기:** 사용자가 선택한 중앙 영역에 맞춘 재배치와 달리 화면 일부를 가리므로 선택하지 않는다.
- **완성된 9:16 클립을 축소해서 넣기:** 가로도 함께 줄이면 좌우 공간이 생기고 가로 고정으로 세로만 줄이면 비율을 왜곡한다. source에서 중앙 viewport에 맞춰 재합성한다.
- **0%도 새 geometry로 일괄 리팩터:** 기존 프레이밍까지 바꾸어 회귀 범위를 넓히므로 0%는 기존 분기를 유지한다. 새 양수 경로에서만 cover/contain을 적용한다.
- **슬라이더에 px 입력이나 프리셋을 추가:** 비율 슬라이더 하나를 택한 사용자 결정 밖이다. 현재 값의 px 환산과 중앙 크기만 설명으로 제공한다.
