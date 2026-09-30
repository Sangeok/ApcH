# FEAT-58: 영상 상하 동일 검은 여백 설정

agent: main-loop

작성일: 2026-09-30. 분류: STANDARD — 웹·DB·Modal 요청 계약·영상 합성이 함께 바뀐다.
요구사항 원천: 이 대화에서 사용자가 확정한 여섯 결정과 문서 작성 지시.
현재 승인 범위는 이 계획서 작성이며, 구현·마이그레이션 적용·배포는 포함하지 않는다.
작업 상태는 `PROJECT_BOARD.md`에서 관리한다. 이 문서 작성으로 보드 상태를 전이하지 않는다.

## 현재 동작

아래는 **Observed**다. 조사 기준은 `dev`, HEAD `701c17d4c0e5262031fbc466c5455c867b77da6d`다.
작성 전 `git status --short`는 `?? nul` 한 줄이었다. 해당 사용자 소유 파일은 변경하지 않는다.
저장소 안과 상위 경로에서 적용할 `AGENTS.md`는 발견되지 않았다.

| 영역 | 코드 근거와 현재 동작 |
| --- | --- |
| 설정 화면 | `apps/web/src/fsd/pages/settings/ui/index.tsx:228`의 `Video style` 카드에는 `:262`의 `CaptionStyleEditor`가 있다. `:238`의 `Right now you can style the captions. Framing and background will`은 향후 프레이밍 기능을 예고하며 현재 여백 입력은 없다. |
| 설정 언어 | 같은 파일 `:58`의 `const [captionStyles, setCaptionStyles] = useState(initialCaptionStyles);`와 `:246`의 `SUPPORTED_LANGUAGES.map`은 영어·한국어 자막 설정을 편집한다. `:43-46`의 props에는 여백 값이 없다. |
| 저장과 인증 | `apps/web/src/fsd/features/settings/api/index.ts:43`의 `const authResult = await requireAuth();`는 자막 저장의 사용자 인증을 강제한다. `:61`의 `updateUserDefaultCaptionStyle`과 `:65`의 `revalidatePath("/dashboard/settings")`로 저장한다. `apps/web/src/fsd/shared/api/auth-guard.ts:22`는 인증 실패에 `failure("Unauthorized")`를 반환한다. |
| 사용자 기본값 | `packages/db/prisma/schema.prisma:63-64`의 `defaultCaptionStyleEnglish  Json?`·`defaultCaptionStyleKorean   Json?`가 언어별 기본값이다. `apps/web/src/fsd/entities/user/api/index.ts:167-174`의 조회도 이 두 필드를 선택한다. |
| 업로드 시 고정 | `apps/web/src/fsd/features/upload/api/index.ts:243`의 `const defaults = await getUserDefaultCaptionStyle(authResult.data.userId);`와 `:258`의 `captionStyle: captionStyleSnapshot`이 `prepareUpload`에서 초안 생성 전에 기본값을 읽어 고정한다. 파일 전송 완료 시점에 읽는 구조가 아니다. |
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

사용자는 현재 영상이 채우는 9:16 출력 안에 동일한 높이의 검은 상하 여백을 선택하려 한다. 현재 설정·저장·요청·렌더 경로에는 그 값이 없어 지원되지 않는다. 백로그에 이 요구를 담은 `FEAT-58` 항목은 아직 없으므로, 아래 요구사항은 사용자 대화가 직접 원천이며 공식 파이프라인 편입 때 그 원천을 백로그에 연결해야 한다.

### 확정 요구사항 — Contracted

- REQ-FRAMING-001: WHEN 사용자가 `/dashboard/settings`의 `Video style`을 연다, THEN 시스템은 상하 각각의 여백을 0~25%, 1% 단위로 조절하는 슬라이더와 현재 값을 표시해야 한다. 최초 기본값은 0%여야 한다.
- REQ-FRAMING-002: WHEN 인증된 사용자가 유효한 여백 값을 저장한다, THEN 시스템은 해당 사용자의 영어·한국어 공통 기본값을 저장하고 재진입 시 그 값을 표시해야 한다.
- REQ-FRAMING-003: WHEN `prepareUpload`가 새 업로드 초안을 만든다, THEN 시스템은 그 시점의 저장된 사용자 여백 값을 업로드에 고정해야 한다.
- REQ-FRAMING-004: WHEN 업로드에서 클립을 자동 생성하거나 검토 후 생성하거나 재시도한다, THEN 시스템은 해당 업로드에 고정된 여백 값으로 모든 클립을 생성해야 한다.
- REQ-FRAMING-005: WHERE 고정된 여백 값이 0보다 크다, 시스템은 최종 1080×1920 캔버스 안에 동일 높이의 검은 상하 배경을 만들고 중앙 영역에 영상 비율과 화자 추적을 유지하며 영상을 배치해야 한다.
- REQ-FRAMING-006: WHEN 여백 값이 달라진다, THEN 시스템은 자막의 기존 상단·중앙·하단 위치를 전체 9:16 화면 기준으로 유지해야 한다.
- REQ-FRAMING-007: WHERE 여백 값이 0이거나 기존 업로드·이전 클라이언트·캐시된 컨텍스트에 값이 없다, 시스템은 0%로 해석하고 기존 영상 생성 동작을 유지해야 한다.
- REQ-FRAMING-008: IF 설정 저장 입력이 0~25 범위의 정수가 아니거나 인증이 실패한다, THEN 시스템은 사용자 기본값을 변경하지 않고 실패를 알려야 한다. IF 저장 I/O가 실패한다, THEN 시스템은 저장 성공을 표시하지 않아야 한다.

### 불변식과 구현 제약

- INV-FRAMING-001: 여백 값은 **한쪽의 높이 비율**이다. 10은 상단 10%와 하단 10%를 뜻하며 합계 10%가 아니다. 영속 값은 정수 0~25다.
- INV-FRAMING-002: 픽셀 계산은 `paddingPx = floor((1920 * percent + 50) / 100)`, 중앙 높이는 `1920 - 2 * paddingPx`다. 두 여백에 같은 정수를 쓰며 중앙 높이는 양수·짝수다. 캔버스 배경은 RGB `(0, 0, 0)`이다.
- INV-FRAMING-003: `UploadedFile.videoPaddingPercent`는 초안 생성 후 기본값 변경·확인·enqueue·분석·검토·재시도에 의해 갱신되지 않는다. 사용자 기본값과 연결된 라이브 참조가 아니다.
- INV-FRAMING-004: 블러 배경도 중앙 영역 내부에만 존재한다. 자막은 그 뒤 전체 캔버스에 합성하므로 자막 글자가 검은 여백에 겹칠 수 있다. 자막 영역까지 항상 검은 픽셀이어야 한다는 조건은 없다.
- CON-FRAMING-001: 이번 작업은 여백·중앙 프레이밍·그 저장/전달만 다룬다. 자막 계약·글꼴·번역·큐 타이밍·화자 점수 선택·크레딧·attempt/cancel 규칙·클립별 편집은 바꾸지 않는다.
- CON-FRAMING-002: 웹 공통 모듈은 클라이언트 안전한 `shared/config`, DB 함수는 `entities/user` 서버 공개 표면을 사용한다. 새 의존성·이미지 자산·마이그레이션 외 기존 데이터 삭제는 추가하지 않는다.
- CON-FRAMING-003: 새 Python 계산 모듈은 stdlib만 import하고 `add_local_python_source`에도 등록한다. HTTP의 잘못된 새 값은 거부하고, 오래된 내부 작업의 누락 값은 0으로 해석한다.
- CON-FRAMING-004: 현재 작업은 문서만 작성한다. 구현 단계 진입은 사용자 구현 지시와 파이프라인의 필요한 상태 연결 후이며, 운영 DB 적용·유료 GPU 실행·배포 증거를 문서 검증 결과로 대체하지 않는다.

### 계산 예와 상태 전이

| 한쪽 비율 | 상단 px | 중앙 크기 | 하단 px |
| --- | --- | --- | --- |
| 0% | 0 | 1080×1920 | 0 |
| 1% | 19 | 1080×1882 | 19 |
| 3% | 58 | 1080×1804 | 58 |
| 10% | 192 | 1080×1536 | 192 |
| 25% | 480 | 1080×960 | 480 |

- EX-FRAMING-001A: Given 사용자 기본값이 10이고 업로드 A의 초안이 생성되었다. When 사용자가 기본값을 25로 저장한 뒤 A를 검토 후 생성하거나 재시도하고 새 업로드 B를 만든다. Then A는 10, B는 25로 생성된다. 기존 업로드 C는 마이그레이션 기본값 0을 유지한다. 이는 REQ-FRAMING-003·REQ-FRAMING-004·REQ-FRAMING-007과 INV-FRAMING-003을 구체화한다.

슬라이더 조작은 로컬 편집이고 저장 버튼이 DB 변경 경계다. 저장 중 여백 조작·저장·초기화·언어 토글을 비활성화한다. 실패하면 편집값을 유지해 재시도할 수 있고 성공 토스트는 내보내지 않는다. 새로 페이지를 열면 서버 저장값을 읽는다. 서로 다른 탭에서 저장하면 DB에 마지막으로 완료된 저장이 다음 업로드의 기본값이며, 이미 생성된 초안은 바뀌지 않는다. 저장과 업로드 준비가 동시에 실행되면 초안은 기본값 조회 시점에 커밋된 값 하나를 복사한다. 분석 단계는 픽셀을 생성하지 않으며 검토 뒤 `render`가 업로드 스냅샷을 사용한다.

## 고칠 파일

아래는 **Proposed** 구현 허용 집합이다. 현재 턴에서 실제로 쓰는 파일은 이 계획서 하나다. 새 경로는 `(신규)`로 구분한다. 이 집합 밖의 변경이 필요하면 계획을 갱신해 범위를 명확히 한 뒤 진행한다.

| 파일 | 변경 | 담당 경계 |
| --- | --- | --- |
| `packages/db/prisma/schema.prisma` | User의 공통 기본값, UploadedFile의 고정값 정수 필드 추가 | main-loop |
| `packages/db/prisma/migrations/20260930000000_video_padding_percent/migration.sql` `(신규)` | 두 컬럼에 NOT NULL·DEFAULT 0·0~25 CHECK 추가 | main-loop |
| `packages/db/generated/prisma/` | `prisma generate`가 두 새 필드 때문에 변경한 추적 파일만 반영. 엔진·무관한 포맷 변동 제외 | main-loop |
| `apps/web/src/fsd/shared/config/video-framing.ts` `(신규)` | 비율 범위·엄격 입력 검사·기존 데이터 해석·픽셀 계산 | web |
| `apps/web/src/fsd/shared/config/video-framing.test.mjs` `(신규)` | 타입·경계·전체 비율 픽셀 계약 | web |
| `apps/web/src/fsd/entities/user/api/index.ts` | 여백 기본값 조회·갱신 함수 추가 | web |
| `apps/web/src/fsd/entities/user/server.ts` | 두 서버 함수 공개 | web |
| `apps/web/src/fsd/features/settings/api/index.ts` | 인증·입력 검증·별도 여백 저장 액션 | web |
| `apps/web/src/app/dashboard/settings/page.tsx` | 저장된 공통 값을 조회해 props 전달 | web |
| `apps/web/src/fsd/pages/settings/ui/index.tsx` | 언어 토글 밖에 Framing 입력·저장·초기화 추가, 낡은 예고 문구 교체 | web |
| `apps/web/src/fsd/features/upload/api/index.ts` | `prepareUpload`에서 공통 기본값을 읽어 초안에 고정 | web |
| `apps/web/src/fsd/entities/uploaded-file/api/index.ts` | 초안 입력에 필수 스냅샷 필드 추가, 처리 컨텍스트 select에 포함 | web |
| `apps/web/src/inngest/video-framing-request.ts` `(신규)` | 업로드 스냅샷 → Modal 요청 키 변환 | web |
| `apps/web/src/inngest/video-framing-request.test.mjs` `(신규)` | 새 스냅샷과 필드 없는 오래된 컨텍스트의 직렬화 계약 | web |
| `apps/web/src/inngest/functions.ts` | auto·render 공통 요청 본문에 여백 스냅샷 전달 | web |
| `apps/backend/video_framing.py` `(신규)` | 엄격 입력 검사·누락 폴백·픽셀·cover/contain 계산 | backend |
| `apps/backend/test_video_framing.py` `(신규)` | stdlib unittest로 경계·대칭·크롭·원본 비율 계산 검증 | backend |
| `apps/backend/test_video_framing_wiring.py` `(신규)` | main.py AST로 spawn/remote→worker→clip→렌더 전달과 0 분기 검증 | backend |
| `apps/backend/main.py` | HTTP 입력·인자 배선·Modal 모듈 등록·양수 여백의 중앙 합성 추가 | backend |

기존 `test_modal_image_sources.py`는 수정하지 않고 새 모듈 등록 누락을 검출하는 방어선으로 사용한다. 자막 편집기·자막 JSON 스키마·업로드 폼의 클라이언트 요청 스키마·콜백 데이터·이벤트 이름·`asd/`·`requirements.txt`는 변경 대상이 아니다. 운영 기록은 실제 구현과 검증이 진행될 때 담당 범위에 맞춰 작성하며 이번 문서 작성에서는 백로그·보드·보고서를 수정하지 않는다.

## 구현 스케치

### 데이터 흐름과 저장 계약

```text
Settings slider → saveDefaultVideoPaddingPercent → User.defaultVideoPaddingPercent
prepareUpload → getUserDefaultVideoPaddingPercent → UploadedFile.videoPaddingPercent
findCurrentProcessingAttemptContext → requestVideoFraming → video_padding_percent
process_video(spawn / remote) → _do_process_video → process_clip → create_vertical_video
1080×1920 검은 캔버스 + 중앙 영상 → 기존 전체 화면 ASS 자막 합성 → 기존 S3 업로드
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

스키마 생성은 `npm run db:generate:client -w @repo/db`를 사용한다. 운영 적용 명령은 루트의 `npm run db:migrate`다. 이 문서 작성에서는 둘 다 실행하지 않는다. 생성물은 필드 타입과 scalar field enum이 두 모델에만 추가되는지 확인하고, 무관한 런타임·바이너리 변경이 섞이면 멈춘다.

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
```

설정 저장에는 `parse`를 쓰고, 오래된 작업 컨텍스트의 읽기에는 `resolve`를 쓴다. 입력 `"10"`·`true`·`null`·`undefined`·소수·NaN·Infinity·-1·26을 숫자로 강제 변환해 저장하지 않는다.

### 사용자 DB 접근과 저장 액션

`entities/user/api/index.ts` 끝에 아래 두 함수를 추가하고 `server.ts`에서 재수출한다. 기존 자막 조회 함수를 늘려 무관한 소비자에게 필드를 전파하지 않는다.

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

`features/settings/api/index.ts`에 추가할 액션 전체다. 기존 `requireAuth`·`ActionResult`·`failure`·`success`·`revalidatePath` 패턴과 새 parser/DB 함수를 사용한다.

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

`SettingsView`에 `initialVideoPaddingPercent={framing.defaultVideoPaddingPercent}`를 추가한다. 해당 값은 DB CHECK가 보장하는 정수다.

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

props 구조 분해에도 필드를 넣고 `useState(initialVideoPaddingPercent)`로 공통 편집 상태를 만든다. 기존 `isSaving`을 공유하고 저장 중 여백 슬라이더와 언어 토글까지 disable한다. 아래 신규 handler를 추가한다.

```typescript
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

`Video style`의 `CardContent` 첫 부분, 영어/한국어 편집 버튼 **앞**에 Framing 그룹을 넣는다. 마크업은 같은 카드의 `space-y-4`, `text-sm font-medium`, 설명·Button 패턴을 따른다. native range를 사용해 새 UI 패키지를 설치하지 않는다.

```tsx
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

`entities/uploaded-file/api/index.ts`의 `createUploadDraft` 입력 타입에 `videoPaddingPercent: number;`를 필수로 추가한다. 기존 `const { captionStyle, ...rest } = data;`와 `...rest` 저장이 이 scalar를 그대로 보존한다. 생성자 호출은 현재 `prepareUpload` 하나이며 구현 검증에서 전수 검색을 다시 한다. 업로드 폼 요청에 이 필드를 받지 않으므로 악의적인 클라이언트가 서버 기본값을 덮어쓸 수 없다.

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

Inngest가 이전 step의 컨텍스트를 재생해 새 필드가 `undefined`여도 요청은 명시적인 0을 보낸다. `analyzeVideo` 본문은 변경하지 않는다. 분석 직후 기본값이 바뀌어도 이후 생성은 업로드 컨텍스트에서 다시 스냅샷을 읽는다. 별도 이벤트 스키마·dispatch payload·callback에 여백을 복제하지 않는다.

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

`video_framing`의 parser·resolver·frame_layout·cover_crop_geometry·contain_size를 import한다. `add_local_python_source`의 기존 인자 목록 끝에 `"video_framing"`을 추가한다.

**ProcessVideoRequest before — 현재 :74:**

```python
    caption_style: dict | None = None
```

**after:**

```python
    caption_style: dict | None = None
    video_padding_percent: StrictInt = 0
```

StrictInt는 문자열·bool·float의 자동 정수 변환을 막는다. 누락만 0이며 명시적인 `null`은 HTTP 유효 값이 아니다. 인증 성공 뒤, 기존 `clipper = AiPodcastClipper()` 전에 아래 범위 검사를 추가한다.

```python
    if parse_video_padding_percent(request.video_padding_percent) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid video padding percent",
        )
```

새 인자는 기존 위치 인자를 바꾸지 않고 끝에 붙인다.

| 경계 | before의 실제 anchor | after의 변경 |
| --- | --- | --- |
| `_do_process_video` 시그니처 | main.py :998의 `request_caption_style: dict | None = None):` | 끝을 `request_caption_style: dict | None = None, video_padding_percent: int = 0):`로 변경 |
| `process_clip` 시그니처 | :758의 `caption_style: dict | None = None):` | 끝을 `caption_style: dict | None = None, video_padding_percent: int = 0):`로 변경 |
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

기존 writer 생성 뒤, **기존 `if max_score_face:` 모드 선택(:253) 앞**에 아래 블록을 삽입한다. 0%는 이 블록에 들어가지 않아 기존 :253-288의 crop/resize 계산과 write를 그대로 사용한다. 최종 writer 크기는 계속 1080×1920이다.

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
```

0%의 기존 세로 source 처리 문제를 이 변경과 함께 고치지 않는다. 양수 여백 경로는 cover/contain으로 배열 크기를 보장한다. 자막은 기존 함수가 `video_out_vertical.mp4` 전체에 나중에 그리므로 자막 위치 계산에 `padding_px`를 더하거나 빼지 않는다. 자막 글자가 여백에 걸려도 잘라내지 않는다.

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
- 구현 위치: `video_framing.py`, `main.py`, 두 신규 unittest 파일.
- 검증 위치: V-GEOMETRY·V-WIRING·V-RENDER와 기존 `test_modal_image_sources.py`.
- 정지 조건: 0% 기존 분기가 달라짐, 화자 점수·자막 좌표 변경 필요, 새 의존성 필요, 실렌더가 중앙 크기를 보장하지 못함.

### Phase WEB: 설정 저장과 업로드 스냅샷

- status: Proposed
- satisfies: REQ-FRAMING-001, REQ-FRAMING-002, REQ-FRAMING-003, REQ-FRAMING-004, REQ-FRAMING-007, REQ-FRAMING-008
- preserves: INV-FRAMING-001, INV-FRAMING-003
- governed-by: CON-FRAMING-001, CON-FRAMING-002, CON-FRAMING-004
- verifies: REQ-FRAMING-001, REQ-FRAMING-002, REQ-FRAMING-003, REQ-FRAMING-004, REQ-FRAMING-007, REQ-FRAMING-008
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
- 구현 위치: upload API, uploaded-file API, request helper/test, functions.ts.
- 검증 위치: V-PAYLOAD·V-SNAPSHOT·V-STATIC.
- 정지 조건: 크레딧/attempt 규칙 변경 필요, 다른 생성자 발견으로 허용 파일 확장 필요, 처리 시 사용자 최신 기본값을 읽는 경로가 생김.

## 테스트

아래 verifier는 **Planned**다. 현재 제품 코드를 바꾸지 않았으므로 구현 테스트 통과로 기록하지 않는다.

### V-INPUT — 새 설정 입력과 픽셀 계산

- verifies: REQ-FRAMING-001, REQ-FRAMING-007, REQ-FRAMING-008
- 위치: `shared/config/video-framing.test.mjs`; `npm test -w apps/web`.
- 덮는 것: 모든 정수 0~25 승인, -1/26/0.5/문자열/bool/null/undefined/NaN/Infinity 거부, `resolve`의 0 폴백, 예시 픽셀 값, 26개 값 모두 상하 대칭·합계 1920·중앙 짝수·최소 960 확인.
- 돌연변이: 범위 상한 변경·소수 허용·0을 falsy 처리·percent를 총합 비율로 해석·반올림 대신 floor를 쓰는 변이는 실패해야 한다.

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
- 한계: 코드 생성 성공·문서의 SQL 문법 확인은 운영 DB 적용 증거가 아니다. 운영 적용과 검증 DB 실행은 현재 미실행.

### V-STATIC — 저장소 게이트

- verifies: REQ-FRAMING-001, REQ-FRAMING-002, REQ-FRAMING-003, REQ-FRAMING-004
- 명령: `npm run check -w apps/web`, `npm test -w apps/web`, `npm run build -w apps/web`, `python -m unittest discover -s apps/backend -p "test_*.py"`, `python -m py_compile apps/backend/main.py apps/backend/video_framing.py`.
- 덮는 것: FSD boundary/self-test·lint·타입·생성 필드 사용·공개 API 임포트·빌드, 기존 테스트 회귀, Python 문법. unittest 출력의 실제 테스트 수가 0이면 통과로 보지 않는다.
- 한계: 이 게이트만으로 UI 조작·인증 저장·DB I/O·최종 프레임을 증명하지 않는다.

### V-SETTINGS — 배포 후 UI·인증·저장

- verifies: REQ-FRAMING-001, REQ-FRAMING-002, REQ-FRAMING-008
- 방법: desktop/모바일에서 0/10/25·키보드 방향키/포커스·표시 px·언어 토글·독립 자막 저장/초기화 확인. 저장 후 재진입해 같은 값, Reset framing 성공 후 0 확인. 저장 요청 실패 시 성공 토스트 없음·편집값 유지, 세션 만료 시 기본값 미변경 확인. action 직접 호출로 범위 밖/타입 오류도 거부되는지 확인한다.
- 못 덮는 범위: 현재 Node 러너는 DOM/실제 session/DB가 없으므로 이 프로토콜을 수동 증거로 남긴다.

### V-SNAPSHOT — 업로드·대기·재시도 실경로

- verifies: REQ-FRAMING-003, REQ-FRAMING-004, REQ-FRAMING-007
- 방법: EX-FRAMING-001A를 자동/Review first·영어/한국어에서 재현한다. User=25 이후에도 UploadedFile A=10, 신규 B=25, 기존 C=0인지 DB 읽기와 실제 Modal 요청/최종 결과를 연결해 확인한다. 초안 생성 후 S3 전송 중 설정 변경도 스냅샷을 바꾸지 않아야 한다.
- 못 덮는 범위: S3·Inngest·DB·GPU를 사용하는 외부 통합이다. 보유한 승인된 실물/검증 환경에서 실행하며 현재 문서 작성에서는 실행하지 않는다. 취소·중복 enqueue·재시도 소유권은 기존 메커니즘을 유지하며 새 값이 immutable임을 함께 확인한다.

### V-RENDER — 최종 MP4와 자막

- verifies: REQ-FRAMING-004, REQ-FRAMING-005, REQ-FRAMING-006, REQ-FRAMING-007
- 방법: 0/1/3/10/25%, 화자 있음/없음, 가로/세로/정사각 source를 확인한다. `ffprobe`로 1080×1920·기존 fps/audio 유지, 디코딩한 자막 없는 프레임에서 두 검은 배경 높이와 중앙 배열 크기를 확인한다. lossy H.264의 경계 압축 오차는 원본 합성 프레임의 `(0,0,0)` 계약과 구분한다.
- 자막은 top/middle/bottom 각각을 같은 입력·스타일의 0%/양수 출력에서 비교해 전체 캔버스 좌표가 유지됨을 확인한다. 글자가 여백에 겹쳐도 허용하고 잘리지 않아야 한다. 화자 이동을 따라가는 x와 무화자 프레임의 중앙 블러 배경을 확인한다. 0%는 새 분기에 진입하지 않았다는 실행 증거와 기존 결과의 동작을 비교하며 인코딩 파일 바이트 동일성을 요구하지 않는다.
- 못 덮는 범위: GPU 인코더·cv2/ffmpegcv/ASS·실제 화자 추적 결과는 stdlib 러너가 덮지 못한다. 실패하면 양수 설정 UI를 노출하지 않는다.

### 계획서 검증과 실행 증거

| 상태 | 검사 | 증거/한계 |
| --- | --- | --- |
| Executed | 파일·시그니처·데이터 경로 read-only 조사 | 위 HEAD에서 현재 동작 인용과 manifest/scripts 확인. 제품·테스트·DB 변경 없음. |
| Executed | SDD traceability strict 검사 | `python C:/Users/hamso/.codex/skills/write-sdd-spec/scripts/validate_sdd_traceability.py --strict docs/plans/FEAT-58.md` → PASS. REQ 8·INV 4·CON 4·EX 1·TASK 4·BLK 2, Phase/Task 및 verifier coverage 각각 8/8. 의미·구현 결과를 보증하지 않는다. |
| Executed | before 조각·문서 형태 대조 | `%TEMP%/apch-feat58-sdd-audit/audit.py` → PASS. before 13개를 현재 소스와 줄바꿈 정규화 후 내용·들여쓰기 대조, 필수 최상위 절 7개와 상대 링크 존재 확인. 다른 운영 계획 카탈로그 검사를 대체하지 않는다. |
| Executed | 순수 Python 스케치 실행 | 같은 audit.py가 문서의 순수 모듈을 그대로 추출/실행 → PASS. 26개 비율·9개 무효 입력·125개 source/viewport 조합·각 조합의 화자 x 네 경우 확인. scratch는 `%TEMP%/apch-feat58-sdd-audit`이며 제품 파일을 수정하지 않았다. |
| Executed | 순수 TypeScript 스케치 타입·실행 | `node.exe node_modules/typescript/bin/tsc --project C:/Users/hamso/AppData/Local/Temp/apch-feat58-sdd-audit/tsconfig.json` → EXIT 0. 실제 web tsconfig를 extends하고 scratch alias만 매핑해 신규 순수 모듈 둘을 검사. `node.exe node_modules/tsx/dist/cli.mjs --tsconfig C:/Users/hamso/AppData/Local/Temp/apch-feat58-sdd-audit/tsconfig.json C:/Users/hamso/AppData/Local/Temp/apch-feat58-sdd-audit/verify.mjs` → PASS. Python과 26개 픽셀 값 일치·10개 무효 값·JSON 요청 키/값 확인. UI/action/DB/worker 전체 조립은 아직 아니다. |
| Executed | 제안한 HTTP 타입의 로컬 검증 | `C:/Users/hamso/venvs/apch-backend/Scripts/python.exe C:/Users/hamso/AppData/Local/Temp/apch-feat58-sdd-audit/model_audit.py` → PASS. 설치된 Pydantic 2.13.4로 현재 요청 모델에 제안 필드를 추가한 scratch만 실행: 누락=0, 정수 26개 승인, bool/string/float/null 다섯 타입 거부. 범위 검사와 실제 HTTP/Modal 배선은 별도다. |
| Planned | 저장소 계획 검증 카탈로그 | 경로 1·2·3·4·5·7·8·9가 해당한다. 외부 응답 의미 해석을 새로 만들지 않으므로 경로 6은 해당 없음. 경로 2 프로젝트 조립·5 돌연변이·8 실제 렌더·9 DB rehearsal 등은 아직 미실행이며 공식 클린 패스를 주장하지 않는다. |
| Not executed | 제품 테스트·DB 적용·Modal 실행·배포 | 현재 권한과 변경 범위는 문서 작성이다. 이 표 위의 V-* 전체는 구현 후 실행할 계획이다. |

## 범위 밖 의존

### BLK-FRAMING-01: 정식 파이프라인 연결

- classification: downstream — 문서 작성은 막지 않으며 구현 진입 전에 적용된다.
- evidence: 현재 TASK_BACKLOG.md/PROJECT_BOARD.md에 FEAT-58이 없다. 루트 런북과 plans template는 백로그 원천·보드 항목·사용자 게이트를 사용한다.
- affects: 모든 구현 Phase와 CON-FRAMING-004.
- required resolution: 사용자 대화 요구를 백로그 source로 연결하고 교차 워크스페이스 담당 main-loop로 보드/계획 경로를 연결한다. 문서 작성 승인을 구현 승인으로 기록하지 않는다.
- stop condition: 연결·담당·구현 지시가 명확하지 않은 채 파이프라인 구현 상태로 전이하려는 경우.

### BLK-FRAMING-02: 배포 순서와 실물 증거

- classification: downstream — 코드 작성은 가능하지만 양수 여백 기능의 운영 노출 전에 닫아야 한다.
- evidence: 기존 ProcessVideoRequest(:56-74)는 여백 필드가 없고 기존 create_vertical_video(:211-288)는 전체 캔버스를 사용한다. 새 웹만 먼저 배포하면 구 백엔드가 새 키를 무시해 설정과 결과가 다를 수 있다.
- affects: Phase WEB 배포, REQ-FRAMING-004·REQ-FRAMING-005·REQ-FRAMING-007.
- required resolution: 운영 순서는 **DB 추가 적용 → 새 백엔드 배포 및 0/양수 실렌더 확인 → 새 웹 배포 → V-SETTINGS/V-SNAPSHOT**이다. 이전 웹은 DB 컬럼 기본값 0을 받아 계속 동작하고 새 백엔드는 여백 키 누락을 0으로 받는다. API 타입 검증과 실제 MP4 확인은 담당 운영 실행 증거로 남긴다.
- stop condition: DB 필드가 실제로 없거나 새 백엔드가 양수 값을 반영하는 증거 없이 슬라이더를 운영에 노출하려는 경우.

단일 web-dev 또는 backend-dev에게 이 전체 계획을 넘기면 `packages/db`와 상대 워크스페이스는 그 담당의 쓰기 범위 밖이다. 여기서는 `agent: main-loop`로 교차 경계를 명시하고 위 Task별로 범위를 나눈다. 담당별 계획이 필요해지면 새 작업 ID를 별도로 연결하며 이 기능 요구사항을 중복 정의하지 않는다.

**현재 문서 단계:** 요구사항·저장 계약·기하 계산·구현 위치는 명확하다. **구현 준비 판정: CONDITIONALLY READY** — 위 downstream 조건과 공식 계획 검증을 구현/운영 노출 경계에서 충족해야 한다. strict 구조 검사만 통과해도 정식 구현승인 또는 배포승인으로 해석하지 않는다. 현재 미해결 제품 요구 결정은 없다.

**복구:** 양수 스냅샷이 아직 만들어지지 않았다면 구 웹으로 복귀할 수 있고 추가 컬럼은 0 기본값으로 남겨 둔다. 양수 스냅샷이 생긴 뒤에는 구 웹 worker나 구 백엔드로 일괄 복귀하면 기존 업로드의 값을 잃으므로 하지 않는다. 문제 시 새 업로드/여백 편집을 제한하는 수정 배포를 하고, 기존 스냅샷 전달·해석 경로는 유지한 채 원인을 수정한다. 운영 데이터/새 컬럼을 삭제하거나 기존 스냅샷을 0으로 덮어쓰는 복구는 이 범위 밖이다.

## 대안

- **언어별 CaptionStyle JSON에 여백 필드 추가:** 공통 구도 설정을 두 언어에 중복 저장하게 되고 caption schema/preset/구 렌더 계약까지 넓혀야 하므로 선택하지 않는다.
- **생성 직전에 User 기본값을 조회:** 검토·대기 중 기본값 변경이 이미 업로드한 영상에 영향을 주어 INV-FRAMING-003을 깨므로 선택하지 않는다.
- **전체 영상 위에 검은 띠를 덮기:** 사용자가 선택한 중앙 영역에 맞춘 재배치와 달리 화면 일부를 가리므로 선택하지 않는다.
- **완성된 9:16 클립을 축소해서 넣기:** 가로도 함께 줄이면 좌우 공간이 생기고 가로 고정으로 세로만 줄이면 비율을 왜곡한다. source에서 중앙 viewport에 맞춰 재합성한다.
- **0%도 새 geometry로 일괄 리팩터:** 기존 프레이밍까지 바꾸어 회귀 범위를 넓히므로 0%는 기존 분기를 유지한다. 새 양수 경로에서만 cover/contain을 적용한다.
- **슬라이더에 px 입력이나 프리셋을 추가:** 비율 슬라이더 하나를 택한 사용자 결정 밖이다. 현재 값의 px 환산과 중앙 크기만 설명으로 제공한다.
