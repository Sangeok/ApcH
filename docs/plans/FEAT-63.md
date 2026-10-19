# FEAT-63: Instagram 카드뉴스 — `feat/card-news`(`72bde11`)의 미검토 구현을 dev에 합류

agent: main-loop

> **담당이 main-loop인 이유**: `packages/db`(스키마·마이그레이션)는 어느 dev도 쓰지 못하고, 변경이 backend·web·db를
> 한 덩어리로 가로지른다. 2026-10-19 소유자가 게이트①에서 「쪼개지 않고 main-loop 하나」 권고를 받아들였다
> (`docs/agents/main-loop/FEAT-63.md` 「게이트①」, FEAT-54 전례).
>
> **이 계획서의 특이점 — 코드는 이미 있다.** 구현 본체는 커밋 `72bde11`(158파일)이고, 이 계획서는 그것을
> **그대로 병합하는 단계**와 그 위에 얹는 **보정 delta**(아래 「구현 스케치」 2단계)를 정한다. 본체의 계약은
> 내용 주소(`72bde11`의 트리)라서 바이트 단위로 고정돼 있다 — 인수 조건 2(diff ↔ 스케치)는 「병합 커밋이
> `72bde11`의 diff를 그대로 싣는가」와 「보정 커밋이 아래 블록과 같은가」 두 번의 기계 대조가 된다.
>
> **줄 번호 기준**: `D/`는 현재 dev(`9b8c022`), 표시가 없는 경로는 **병합 후 트리**(= `72bde11`의 내용에
> dev 변경 2파일이 합쳐진 것 — 아래 「현재 동작」 표 3행)다. 보정 delta가 닿는 파일은 전부 dev와 겹치지 않으므로
> 병합 후 내용 = `72bde11`의 내용이다.

## 현재 동작

### dev — 카드뉴스 없음, 영상 과금은 완료 시 즉시 차감

| 관심사 | 근거 |
| --- | --- |
| 영상 차감 | `D/apps/web/src/fsd/features/upload/api/complete-processing-attempt.ts:23` `return db.$transaction(async (tx) => {` 안에서 `:38` `await decrementUserCreditsFloorZero(args.userId, args.clipsFound, { tx });` — 생성 클립 수만큼, 바닥 0 |
| 영상 삭제 | `D/apps/web/src/fsd/features/upload/api/index.ts:587-588` `await deleteUploadedFileS3Assets(uploadedFile.s3Key);` → `await deleteUploadedFileRecord(uploadedFileId, authResult.data.userId);` — 요청 안에서 동기 삭제. 클립도 `D/apps/web/src/fsd/features/clip/api/index.ts:43-44` `await deleteS3Object(clip.s3Key);` → `await deleteClipRecord(clip.id);` |
| 헤더 잔액 | `D/apps/web/src/fsd/widgets/dashboard-header/ui/index.tsx:45` `{credits} Credits` — 서버 렌더 숫자 |
| 운영 DB | 읽기 전용 `migrate status`(2026-10-19, 대상 Neon `neondb` `ep-wild-pine-a4avujag…`): 14개 중 미적용은 `20261011000000_card_news_credit_reservations` **하나뿐** |

### `72bde11` — 카드뉴스 + 공통 크레딧 예약 (브랜치 `feat/card-news`, `origin`에 백업)

- 2026-10-11 다른 세션 작성, 근거 문서 `docs/proposals/active/instagram-card-news-generation.md`(REQ-CN-001~014), 운영 절차
  `docs/card-news-runbook.md`. 파일 분포: backend 20 · web 123 · packages/db 12 · `.env.example` · docs 2(+40755/−7048, 그중
  `packages/db/generated/prisma/index.d.ts`가 +20618/−6338).
- **예약 → 정산**: 영상은 claim 때 예약하고(`apps/web/src/fsd/features/upload/api/claim-processing-attempt.ts`) 완료 때 S3에서 찾은
  클립 수로 정산한다(`settle-processing-attempt.ts`). 잔액은 `credits - reservedCredits`
  (`apps/web/src/fsd/entities/user/model/credit-balance.ts`). 마이그레이션이 `User_credit_balance_check`
  `CHECK ("credits" >= 0 AND "reservedCredits" >= 0 AND "reservedCredits" <= "credits")`를 더한다
  (`packages/db/prisma/migrations/20261011000000_card_news_credit_reservations/migration.sql:4-5`).
- **영상 게이트 기본값이 닫힘**: `apps/web/src/env.js:52-59` `VIDEO_GENERATION_ADMISSION_ENABLED`·`VIDEO_WORKER_START_ENABLED`가
  `.default("false")`. 닫혀 있으면 `apps/web/src/fsd/features/upload/api/index.ts:77-78`·`:267-268`
  `return failure("Video generation is temporarily unavailable");`.
- **삭제가 비동기**: `deletedAt`만 찍고 `AssetCleanupJob`을 만든다. 실제 삭제는 매분 cron이 하며, 모든 producer의 **종료 증거**가
  있어야 지운다(`apps/web/src/fsd/features/card-news/api/cleanup.ts:364-367`
  `throw new Error("Waiting for producer termination evidence");`). 영상 producer의 종료 조회는 카드뉴스 CPU 앱의 `/status`를
  쓴다(`apps/web/src/fsd/features/upload/api/video-runtime-dependencies.ts:16-19` — `CARD_NEWS_ENDPOINT`가 없으면 throw).
  **즉 카드뉴스를 꺼 둬도 CPU 앱은 배포돼 있어야 영상 삭제가 끝난다.**
- 카드뉴스 생성 허용: `apps/web/src/fsd/shared/config/card-news.ts:49-60` `canAcceptCardNews` — 플래그/allowlist + endpoint·auth·
  webhook secret·HTTPS site URL 전부.

### 시험 병합 (2026-10-19, 스크래치패드 worktree `wt63`)

| 항목 | 결과 |
| --- | --- |
| `git merge --no-commit --no-ff 72bde11` on `9b8c022` | **충돌 0**, 158파일 |
| 양쪽이 고친 파일 | 둘뿐 — `entities/user/api/index.ts`(dev: BUG-18 `updateUserVideoStyle` / 카드뉴스: `getUserCreditBalance`·`lockUserForCredits` 등), `entities/user/server.ts`(재수출). 자동 병합본이 **양쪽 변경을 다 담았다**(diff 대조) |
| web `check` | EXIT 0 (FSD·lint 경고 0·tsc) |
| web `test` | **348/0**, 56 suite (dev 227 + 카드뉴스 121), 테스트 파일 32 → 41 |
| web `next build` | EXIT 0 — `/dashboard/card-news`·`/dashboard/card-news/[cardNewsId]`·`/api/webhooks/card-news` 생성 |
| admin `check`·`test`·`verify:fsd:final` | EXIT 0 · **337/0** · EXIT 0 |
| backend `unittest` | **161 중 실패 1** — `test_font_hashes_license_and_pins_are_exact` (아래 결함 B3) |
| `prisma validate` | valid |
| 실 PostgreSQL 통합 CLI 3종(`verify-card-news-local-db.mts`, 10-11 바이너리) | **EXIT 0** — 크레딧 경쟁·수명주기·영상 호환. 기준 스키마 `b20722b` = dev 스키마(`git diff b20722b dev -- packages/db/prisma/` 0줄) |

### 시험 병합본에서 확인한 결함 (독립 리뷰 넷 → 메인 루프 직접 재현)

리뷰 원문과 판정 근거는 `docs/agents/main-loop/FEAT-63.md` 「계획 작성 — 리뷰」. 여기에는 **이 계획이 고치는 것**만 적는다.

**기존 영상 기능을 깨는 것**

- **V1 — 성공한 영상이 클립 0개로 정산된다.** `settle-processing-attempt.ts:81-85`
  `// GPU upload_file uses S3's application/octet-stream default for existing MP4s.` /
  `["video/mp4", "application/octet-stream"].includes(`. GPU는 `D/apps/backend/main.py:879`
  `lambda: s3_client.upload_file(str(english_output_path), "ai-podcast-clipper-hamsoo", english_s3_key),`(`:894` Korean 동일)로
  ContentType 없이 올리고, s3transfer는 Content-Type을 추측하지 않는다(venv `s3transfer`·`boto3/s3/transfer.py`에 `mimetypes` 0건).
  S3의 기본값은 `binary/octet-stream`이라 허용 목록에 없다 → 모든 키가 `null` → `clipsFound === 0` → 실패·해제, 그리고 같은
  트랜잭션의 orphan 정리가 24시간 뒤 그 클립들을 지운다. 통합 CLI는 가짜 S3가 주석의 값을 돌려줘 통과했다.
- **V3 — 전역 복구 cron이 정상 정산을 가로챈다.** `reconcile-video-reservations.ts:43-75`는 producer `ended`를 처음 본 틱에 곧바로
  `failureCode: "worker_timeout"`으로 `settleProcessingAttempt`를 부른다. GPU 함수는 콜백을 보낸 직후 끝나므로 `ended` 관측이
  웹훅 → Inngest 정산보다 앞선다. 그 틈에 cron이 돌면 analyze는 **성공했는데 failed**(`settle-processing-attempt.ts:111-120` 분기),
  영상은 `backendClips` 없이 정산돼 제목·설명이 영구히 빈다(`reconcile-published-metadata.ts:18`
  `if (!hint || hint.reservation?.status !== "settled") return;`가 웹훅 시점엔 아직 held라 건너뜀). `CARD_NEWS_ENDPOINT`가 설정되고
  `modalCallId`가 기록되면 매 작업에 걸린다.
- **V4 — Modal이 HTTP 오류로 거절하면 재시도 없이 약 1시간 대기.** `apps/web/src/inngest/functions.ts:294-300`(analyze `:699-705`)이
  catch에서 `markProcessingSpawnUnknown`(`sending` → `unknown`) 뒤 다시 던지고, Inngest 재시도 때 `beginProcessingSpawn`이
  `modalSpawnState !== "not_sent"`라 `false`(`claim-processing-attempt.ts:183-186`) → `:244-250`
  `return { status: "accepted", call_id: existing?.modalCallId ?? null }`로 **POST 없이** 콜백을 기다린다. dev는 같은 step 재시도가
  다시 POST했다.

**카드뉴스 CPU 앱이 배포·기동하지 못하는 것** (이 앱의 `/status`가 영상 삭제·복구에도 쓰이므로 기존 기능에도 걸린다)

- **B1 — `modal deploy`가 이미지 단계에서 실패.** `apps/backend/card_news_app.py:18-22`가 `.add_local_python_source`·`.add_local_dir`
  **뒤에** `.env({...})`를 둔다. Modal 1.2.1 `env()`는 `_from_args(base_images={"base": self}, …)`(venv `modal/image.py:2346-2349`)이고
  `_load`가 `_do_assert_no_mount_layers`(기본 True)일 때 base의 `_assert_no_mount_layers()`(`:524-527`)를 불러 `InvalidError`
  「An image tried to run a build step after using `image.add_local_*`…」를 던진다(`:458-475`). import는 통과하고(로컬 실측
  `import OK`) 배포 때만 터진다. 기존 `D/apps/backend/main.py:90-101`은 `.env` → `add_local_dir(copy=True)` →
  `add_local_python_source` 순서라 규칙을 지킨다.
- **B2 — 컨테이너 기동 시 `IndexError`.** `card_news_app.py:13-14` `ROOT = Path(__file__).resolve().parent` /
  `CONTRACTS = ROOT.parents[1] / "packages/db/contracts"`. Modal은 진입 파일을 `/root/card_news_app.py`에 두므로 `ROOT=/root`,
  `PurePosixPath('/root').parents` = `[PurePosixPath('/')]` → `parents[1]`은 `IndexError: 1`(로컬 실측). 모듈 최상단이라 함수 전부가 못 뜬다.
- **B3 — 폰트 라이선스 해시 불일치.** 이 저장소는 `core.autocrlf=true`이고 `.gitattributes`에 `OFL.txt` 규칙이 없다. 체크아웃본은 CRLF
  (`sha256` `e35ffdeb…`), 커밋 blob과 manifest는 LF(`1c05c68c…`). `apps/backend/card_news/render.py:24`
  `if hashlib.sha256((ASSETS / "OFL.txt").read_bytes()).hexdigest() != manifest["licenseSha256"]:` → `RuntimeError("font license checksum mismatch")`.
  `add_local_dir`는 작업 트리 바이트를 올리므로 이 PC에서 배포하면 모든 작업이 죽는다. 이 검사는 `card_news_app.py:47`(등록 콜백
  전)이라 실패 콜백도 가지 않는다. 같은 부류는 다른 파일에 없다(TTF는 바이너리, JSON들은 파싱만 함 — 리뷰 3 전수).
- **B4 — Gemini API 오류가 실패 콜백을 잃는다.** `card_news_app.py:187` `failure = getattr(error, "code", "cpu_job_failed")`.
  google-genai `APIError`는 `self.code`가 정수(HTTP 상태, venv `google/genai/errors.py:64`)라 콜백 `failureCode`가 숫자가 되고,
  웹 계약 `apps/web/src/fsd/entities/card-news/model/contract.ts:13-17` `const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/)`
  (`:297` `failureCode: id.nullable()`)이 거부 → `:194-195` `except Exception: pass`가 삼킴 → 웹은 15분 마감까지 기다린다.

**카드뉴스 쪽**

- **C1 — 플래그가 꺼져도 진입점이 보인다.** `apps/web/src/fsd/widgets/dashboard-header/ui/index.tsx:43-48`(데스크톱 링크)·`:80-82`
  (드롭다운), `apps/web/src/fsd/pages/dashboard/ui/index.tsx:128-130`(탭 행) 셋 다 조건 없이 `/dashboard/card-news`. 반면 생성 버튼은
  `apps/web/src/fsd/widgets/clip-display/ui/_component/ClipActions.tsx:102` `{cardNewsContext?.enabled && (`로 숨는다 → 모든
  사용자에게 쓸 수 없는 기능으로 가는 막다른 링크.
- **C2 — CPU 접수 POST가 함수 시간 한도를 넘는다.** `apps/web/src/app/api/inngest/route.ts:18` `export const maxDuration = 10;`인데
  `apps/web/src/fsd/features/card-news/api/runtime-dependencies.ts:49` `signal: AbortSignal.timeout(15_000),`. 10초에 Vercel이 step을
  죽이면 `call-generation-cpu` step이 재시도되며 다시 POST한다(가드는 앞 step인 `prepareCardNewsCpuSpawn`에만 있음,
  `apps/web/src/inngest/card-news-functions.ts:30-37`). 자체 abort면 `callCardNewsCpu`가 잡아 `{ modalCallId: null }`을 돌려주고
  (`job-lifecycle.ts:455-476`) `recordCardNewsCpuSpawn`이 `unknown`으로 기록한다(`:478-`) — 그게 설계 의도다. `/status` 조회도 `:65`·`video-runtime-dependencies.ts:27`
  `signal: AbortSignal.timeout(10_000),`로 한도와 같다.

**삭제 화면**

- **A2 — 「Deletion completed」가 영구히 남는다.** `apps/web/src/fsd/entities/card-news/api/index.ts:325-334`
  `listUserAssetCleanupJobs`가 `where: { userId }`로 완료 job까지 최신 20건을 가져오고, 지우는 코드가 없다. 한 번이라도 삭제한
  사용자의 대시보드에 `apps/web/src/fsd/features/card-news/ui/asset-cleanup-status.tsx:52-53`
  `"Deletion completed"` 블록이 상주한다(D/에 없던 화면). 또 kind 필터가 `take(20)` **뒤**(`features/card-news/api/index.ts:331`)라
  영상마다 생기는 `orphan` job이 창을 채우면 삭제 job이 밀려난다. 두 삭제 hook(`features/clip/model/use-delete-clip.ts:46-53`,
  `features/upload/model/use-delete-uploaded-file.ts:38-43`)은 이 패널 캐시(`asset-cleanup-status.tsx:8` `["asset-cleanup", userId]`)와
  카드뉴스 캐시를 무효화하지 않는다.
- **B3' — 헤더 잔액이 일시 오류에 사라진다.** `apps/web/src/fsd/features/credit-balance/ui/index.tsx:37`
  `if (query.isError || !query.data) {` — TanStack Query는 refetch 실패 뒤에도 이전 `data`를 유지하는데, 그 위에 「Balance unavailable」을
  덮는다(10초 polling, `model/query-options.ts:20-24`). D/는 서버 렌더 숫자라 없던 일.

**공개 문구** — 카드뉴스는 처음엔 allowlist(소유자)만 켠다. `apps/web/src/fsd/pages/pricing/config/index.ts:13`
`value: "1 credit per clip or card-news set",`·`:19` `value: "Video or carousel files",`·`:21` 설명, `apps/web/src/app/(public-marketing)/terms/page.tsx:89`
`Card-news generation costs one credit per set, settled only when`은 「when enabled」 단서 없이 아직 못 쓰는 기능을 약속한다
(다른 카드뉴스 문구는 전부 단서가 있다 — 리뷰 4 C 분류표).

## 문제

백로그 `source`가 지목한 것은 「코드는 있으나 dev 밖이고, 계획 검증·인수를 거친 적이 없으며, 그대로 배포하면 영상 생성이 멈춘다」이다.
위 「현재 동작」으로 다시 세우면:

1. 구현(`72bde11`)은 dev 위에 **충돌 없이** 얹히고 자동 검사도 통과하지만, 검사가 덮지 못한 자리에서 **기존 영상 기능을 깨는 결함
   셋(V1·V3·V4)**과 **카드뉴스 CPU 앱이 배포·기동하지 못하는 결함 넷(B1~B4)**이 있다. CPU 앱의 `/status`가 영상 삭제·복구에도 쓰이므로
   B1~B3은 카드뉴스를 꺼 둬도 기존 기능에 걸린다.
2. 플래그가 꺼진 기본 상태에서도 사용자 화면이 바뀐다(C1 막다른 링크, A2 상주 패널, B3' 잔액 소실, 공개 문구).
3. 배포는 마이그레이션·환경변수·Modal secret·legacy drain을 순서대로 거쳐야 하고, 그중 운영 DB 읽기가 필요한 단계는 이 세션의
   자동 모드가 막았다(「범위 밖 의존」).

백로그와 어긋나는 점: 백로그는 「위험의 중심은 공통 크레딧 예약·영상 정산 전환」이라고 추정했다 — **맞았다**(V1·V3·V4). 다만 CPU 앱이
영상 삭제의 종료 증거 경로라는 결합(B1~B3이 기존 기능에 걸림)은 백로그가 보지 못했다.

## 고칠 파일

**1단계 — 병합**: `git merge --no-ff 72bde11` 한 번. 158파일 전부, 내용은 `git diff --name-status b2b5504 72bde11`이 정본이다
(이 표에 옮기지 않는다 — 내용 주소가 더 정확하다). 충돌 해소 0.

**2단계 — 보정 커밋** (아래 행 전부, 이 밖은 고치지 않는다):

| # | 파일 | 변경 |
| --- | --- | --- |
| 1 | `.gitattributes` | `apps/backend/card_news/assets/OFL.txt text eol=lf` (B3) |
| 2 | `apps/backend/card_news_app.py` | `.env()`를 `add_local_*` 앞으로(B1), `CONTRACTS`를 조부모 없는 경로에서도 안전하게(B2), 실패 코드를 `callback_failure_code`로(B4) |
| 3 | `apps/backend/card_news/policy.py` | `callback_failure_code` 순수 함수 추가(B4) |
| 4 | `apps/backend/test_card_news_wiring.py` | 이미지 층 순서·컨테이너 경로·실패 코드 테스트 3건 |
| 5 | `apps/web/src/fsd/features/upload/model/stored-clip-object.ts` `(신규)` | 정산 대상 클립 객체 판정 순수 함수(V1) |
| 6 | `apps/web/src/fsd/features/upload/model/stored-clip-object.test.mjs` `(신규)` | 위 테스트 |
| 7 | `apps/web/src/fsd/features/upload/api/settle-processing-attempt.ts` | HEAD 판정을 5번으로 교체(V1) |
| 8 | `apps/web/src/fsd/features/upload/model/recovery-settle-policy.ts` `(신규)` | 복구 cron 정산 허용 판정·종료 시각 추출 순수 함수(V3) |
| 9 | `apps/web/src/fsd/features/upload/model/recovery-settle-policy.test.mjs` `(신규)` | 위 테스트 |
| 10 | `apps/web/src/fsd/features/upload/api/reconcile-video-reservations.ts` | 8번으로 유예 적용(V3) |
| 11 | `apps/web/src/fsd/features/upload/api/claim-processing-attempt.ts` | `resetRejectedProcessingSpawn` 추가(공통 헬퍼로 `markProcessingSpawnUnknown`과 묶음)(V4) |
| 12 | `apps/web/src/fsd/features/upload/server.ts` | 11번 재수출 |
| 13 | `apps/web/src/inngest/functions.ts` | HTTP 거절과 모호한 실패를 구분해 spawn 상태 기록(V4, auto·analyze 두 곳) |
| 14 | `apps/web/src/fsd/features/card-news/api/runtime-dependencies.ts` | CPU 접수·status 타임아웃 8초(C2) |
| 15 | `apps/web/src/fsd/features/upload/api/video-runtime-dependencies.ts` | status 타임아웃 8초(C2) |
| 16 | `apps/web/src/fsd/features/card-news/api/access.ts` `(신규)` | `canUserAccessCardNews(userId)` — 생성 버튼과 같은 판정(C1) |
| 17 | `apps/web/src/fsd/features/card-news/server.ts` | 16번 재수출 |
| 18 | `apps/web/src/fsd/features/card-news/api/index.ts` | `getCardNewsCreationContext`가 16번을 쓰게(판정 한 곳), kind 필터 제거(A2 — 19번으로 이동) |
| 19 | `apps/web/src/fsd/entities/card-news/api/index.ts` | `listUserAssetCleanupJobs`가 사용자용 kind·미완료만 조회(A2) |
| 20 | `apps/web/src/fsd/entities/card-news/model/query-keys.ts` | `assetCleanupKeys` 추가(A2) |
| 21 | `apps/web/src/fsd/entities/card-news/index.ts` | 20번 재수출 |
| 22 | `apps/web/src/fsd/features/card-news/ui/asset-cleanup-status.tsx` | 20번 키 사용 |
| 23 | `apps/web/src/fsd/features/clip/model/use-delete-clip.ts` | 정리 패널·카드뉴스 캐시 무효화(A2) |
| 24 | `apps/web/src/fsd/features/upload/model/use-delete-uploaded-file.ts` | 같음(A2) |
| 25 | `apps/web/src/fsd/widgets/dashboard-header/ui/index.tsx` | `showCardNews` prop으로 링크 둘 가림(C1) |
| 26 | `apps/web/src/app/dashboard/layout.tsx` | `showCardNews` 전달(C1) |
| 27 | `apps/web/src/fsd/pages/dashboard/ui/index.tsx` | `showCardNews` prop으로 탭 링크 가림(C1) |
| 28 | `apps/web/src/app/dashboard/page.tsx` | `showCardNews` 전달(C1) |
| 29 | `apps/web/src/fsd/features/credit-balance/ui/index.tsx` | data가 있으면 오류여도 잔액 표시(B3') |
| 30 | `apps/web/src/fsd/pages/pricing/config/index.ts` | 헤드라인 2개 dev 문구로, 설명 1개에 「When enabled for your account」 |
| 31 | `apps/web/src/app/(public-marketing)/terms/page.tsx` | §3 카드뉴스 가격 불릿에 같은 단서 |
| 32 | `apps/web/CLAUDE.md` | 테스트 표 — 수치, 새 테스트 파일 11개 행 |
| 33 | `apps/backend/CLAUDE.md` | 카드뉴스 CPU 앱 절(배포 명령·secret 키·이미지 층 순서·CRLF) |
| 34 | `docs/proposals/active/instagram-card-news-generation.md` | 2026-10-14 대조본으로 교체(다른 세션의 미커밋 편집, 사본 sha256 `1072b776…`) |

## 구현 스케치

### 순서

1. **병합 커밋** — dev에서 `git merge --no-ff 72bde11 -m "Merge feat/card-news (72bde11) into dev — FEAT-63 카드뉴스 구현 합류"`.
   충돌이 나면 멈추고 보고한다(시험 병합은 0).
2. **CRLF 정리** — `.gitattributes`(1번)를 고친 뒤 작업 트리 사본만 다시 쓴다: 파일을 지우고
   `git checkout -- apps/backend/card_news/assets/OFL.txt`. 결과 `sha256`이 `1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9`여야 한다.
   blob은 이미 LF라 인덱스는 바뀌지 않는다 — `git status`에 OFL이 뜨면 안 된다.
3. **보정 커밋** — 아래 2~34번을 한 커밋으로. 그 뒤 검증 명령(「테스트」) 전부.

### 1) `.gitattributes` — 끝에 추가

```gitattributes
packages/db/generated/**/*.wasm  binary

# 카드뉴스 CPU 앱은 폰트 라이선스의 SHA256을 런타임에 대조한다(apps/backend/card_news/render.py).
# autocrlf=true에서 CRLF로 체크아웃되면 해시가 깨져 모든 카드 렌더가 실패한다 — 작업 트리도 LF로 고정한다.
apps/backend/card_news/assets/OFL.txt text eol=lf
```

### 2) `apps/backend/card_news_app.py`

```python
# before (:13-22)
ROOT = Path(__file__).resolve().parent
CONTRACTS = ROOT.parents[1] / "packages/db/contracts"
image = (modal.Image.debian_slim(python_version="3.12")
         .apt_install("ffmpeg")
         .pip_install_from_requirements(str(ROOT / "requirements-card-news.txt"))
         .add_local_python_source("card_news")
         .add_local_dir(str(ROOT / "card_news/assets"), "/root/card-news-assets")
         .add_local_dir(str(ROOT / "card_news/fixtures"), "/root/card-news-fixtures")
         .add_local_dir(str(CONTRACTS), "/root/card-news-contracts")
         .env({"CARD_NEWS_ASSET_PATH": "/root/card-news-assets", "CARD_NEWS_FIXTURE_PATH": "/root/card-news-fixtures"}))
# after
ROOT = Path(__file__).resolve().parent
# The image definition is re-evaluated on container import, where this file is /root/card_news_app.py
# and has no grandparent. The contracts path only matters for the local build.
CONTRACTS = (ROOT.parents[1] if len(ROOT.parents) > 1 else ROOT) / "packages/db/contracts"
image = (modal.Image.debian_slim(python_version="3.12")
         .apt_install("ffmpeg")
         .pip_install_from_requirements(str(ROOT / "requirements-card-news.txt"))
         # env() is a build step; Modal rejects build steps after add_local_* at deploy time.
         .env({"CARD_NEWS_ASSET_PATH": "/root/card-news-assets", "CARD_NEWS_FIXTURE_PATH": "/root/card-news-fixtures"})
         .add_local_python_source("card_news")
         .add_local_dir(str(ROOT / "card_news/assets"), "/root/card-news-assets")
         .add_local_dir(str(ROOT / "card_news/fixtures"), "/root/card-news-fixtures")
         .add_local_dir(str(CONTRACTS), "/root/card-news-contracts"))
```

```python
# before (:40)
    from card_news.policy import model_timeout_ms
# after
    from card_news.policy import callback_failure_code, model_timeout_ms
```

```python
# before (:187)
        failure = getattr(error, "code", "cpu_job_failed")
# after
        failure = callback_failure_code(error)
```

(`:188-190`의 `LayoutError` 접미사는 그대로 — `LayoutError.code`는 문자열이라 기존 코드 값이 바뀌지 않는다.)

### 3) `apps/backend/card_news/policy.py` — 끝에 추가 (stdlib만)

```python
# before (:2)
from datetime import datetime
# after
from datetime import datetime
import re
```

```python
def callback_failure_code(error):
    """failureCode for a failed callback.

    The web contract accepts only ^[A-Za-z0-9_-]{1,160}$ strings and rejects the whole callback
    otherwise. SDK errors carry non-string codes (google-genai APIError.code is the HTTP status
    int), and a rejected failed callback leaves the job waiting for its 15-minute deadline.
    """
    code = getattr(error, "code", None)
    if isinstance(code, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,160}", code):
        return code
    return "cpu_job_failed"
```

### 4) `apps/backend/test_card_news_wiring.py` — `CardNewsWiringTests`에 추가

임포트: `from card_news.policy import Deadline, model_timeout_ms, timestamp` → `from card_news.policy import Deadline, callback_failure_code, model_timeout_ms, timestamp`,
그리고 `from pathlib import Path` 다음 줄에 `from pathlib import PurePosixPath`.

```python
    def test_image_env_precedes_local_mounts(self):
        # Modal rejects a build step (env) after add_local_* only at deploy time; import succeeds.
        source = (ROOT / "card_news_app.py").read_text(encoding="utf-8")
        self.assertLess(source.index(".env({"), source.index(".add_local_python_source("))
        self.assertLess(source.index(".env({"), source.index(".add_local_dir("))

    def test_contracts_path_survives_container_root(self):
        # In the container the entry file is /root/card_news_app.py: ROOT=/root has no grandparent.
        tree = ast.parse((ROOT / "card_news_app.py").read_text(encoding="utf-8"))
        assignment = next(node for node in tree.body if isinstance(node, ast.Assign)
                          and any(isinstance(t, ast.Name) and t.id == "CONTRACTS" for t in node.targets))
        expression = compile(ast.Expression(assignment.value), "CONTRACTS", "eval")
        local = eval(expression, {"ROOT": PurePosixPath("/repo/apps/backend"), "len": len})
        self.assertEqual(local, PurePosixPath("/repo/packages/db/contracts"))
        eval(expression, {"ROOT": PurePosixPath("/root"), "len": len})

    def test_callback_failure_code_accepts_only_contract_ids(self):
        self.assertEqual(callback_failure_code(ContractError("source_too_short")), "source_too_short")
        self.assertEqual(callback_failure_code(LayoutError("cards.1.title", "unsupported_glyph")), "unsupported_glyph")
        for bad in (429, None, "", "bad code", "x" * 161):
            self.assertEqual(callback_failure_code(SimpleNamespace(code=bad)), "cpu_job_failed", bad)
        self.assertEqual(callback_failure_code(RuntimeError("no code")), "cpu_job_failed")
```

### 5) `apps/web/src/fsd/features/upload/model/stored-clip-object.ts` (신규)

```ts
/**
 * Content types a stored clip MP4 may carry. GPU `upload_file` (apps/backend/main.py) sends no
 * ContentType, so S3 stores its default `binary/octet-stream` — rejecting it settled every
 * successful video as zero clips and queued the clips for orphan deletion (FEAT-63).
 */
export const STORED_CLIP_CONTENT_TYPES = [
  "video/mp4",
  "binary/octet-stream",
  "application/octet-stream",
] as const;

/** Whether a discovered clip object is a non-empty stored MP4 the settlement may charge for. */
export function isStoredClipObject(head: {
  contentLength: number;
  contentType: string;
}): boolean {
  const mediaType = head.contentType.split(";")[0]!.trim().toLowerCase();
  return (
    head.contentLength > 0 &&
    (STORED_CLIP_CONTENT_TYPES as readonly string[]).includes(mediaType)
  );
}
```

### 7) `settle-processing-attempt.ts`

```ts
// before (:78-89)
  const verified = await Promise.all(
    discovered.map(async (key) => {
      const head = await videoProcessingRuntime().headObject(key);
      // GPU upload_file uses S3's application/octet-stream default for existing MP4s.
      return head.contentLength > 0 &&
        ["video/mp4", "application/octet-stream"].includes(
          head.contentType.split(";")[0]!.trim(),
        )
        ? key
        : null;
    }),
  );
// after
  const verified = await Promise.all(
    discovered.map(async (key) =>
      isStoredClipObject(await videoProcessingRuntime().headObject(key))
        ? key
        : null,
    ),
  );
```

임포트는 `videoProcessingRuntime` 임포트 줄 다음에 `import { isStoredClipObject } from "../model/stored-clip-object";`.

### 8) `apps/web/src/fsd/features/upload/model/recovery-settle-policy.ts` (신규)

```ts
/**
 * How long global recovery leaves an ended producer to the normal webhook → Inngest settlement.
 * The GPU function returns right after posting its callback, so `ended` is observed before the
 * webhook's run settles with clip metadata (or marks an analyze review_pending) — FEAT-63.
 */
export const PRODUCER_END_SETTLE_GRACE_MS = 5 * 60_000;

/** Whether global recovery may settle (or fail) a video attempt now. */
export function canRecoverySettleVideoAttempt(input: {
  now: Date;
  deadlineAt: Date | null;
  producerEndedAt: Date | null;
}): boolean {
  if (input.deadlineAt !== null && input.deadlineAt <= input.now) return true;
  return (
    input.producerEndedAt !== null &&
    input.now.getTime() - input.producerEndedAt.getTime() >=
      PRODUCER_END_SETTLE_GRACE_MS
  );
}

/**
 * When the stored end evidence was observed: `observedAt` (modal-status) or `confirmedAt`
 * (legacy-drain, synchronous-response). Unreadable evidence still proves an end, so it counts
 * as long past rather than blocking recovery.
 */
export function producerEndObservedAt(evidence: unknown): Date {
  if (evidence && typeof evidence === "object") {
    const record = evidence as { observedAt?: unknown; confirmedAt?: unknown };
    const value =
      typeof record.observedAt === "string"
        ? record.observedAt
        : typeof record.confirmedAt === "string"
          ? record.confirmedAt
          : null;
    const time = value === null ? Number.NaN : Date.parse(value);
    if (Number.isFinite(time)) return new Date(time);
  }
  return new Date(0);
}
```

### 10) `reconcile-video-reservations.ts`

```ts
// before (:43-67)
      let ended =
        dispatch.modalSpawnState === "ended" &&
        dispatch.producerEndEvidence !== null;
      if (!ended && dispatch.modalCallId) {
        try {
          const result = await videoProcessingRuntime().producerStatus({
            schemaVersion: 1,
            kind: "video",
            referenceId: dispatch.id,
            modalCallId: dispatch.modalCallId,
          });
          if (parseProducerStatusResponse(result).status === "ended") {
            ended = true;
            await recordVideoProducerEnd(dispatch.id, {
              kind: "modal-status",
              observedAt: now.toISOString(),
            });
          }
        } catch {
          /* Unknown producer state never authorizes storage deletion. */
        }
      }
      const expired =
        dispatch.deadlineAt !== null && dispatch.deadlineAt <= now;
      if (!ended && !expired) return;
// after
      let producerEndedAt =
        dispatch.modalSpawnState === "ended" &&
        dispatch.producerEndEvidence !== null
          ? producerEndObservedAt(dispatch.producerEndEvidence)
          : null;
      if (producerEndedAt === null && dispatch.modalCallId) {
        try {
          const result = await videoProcessingRuntime().producerStatus({
            schemaVersion: 1,
            kind: "video",
            referenceId: dispatch.id,
            modalCallId: dispatch.modalCallId,
          });
          if (parseProducerStatusResponse(result).status === "ended") {
            producerEndedAt = now;
            await recordVideoProducerEnd(dispatch.id, {
              kind: "modal-status",
              observedAt: now.toISOString(),
            });
          }
        } catch {
          /* Unknown producer state never authorizes storage deletion. */
        }
      }
      if (
        !canRecoverySettleVideoAttempt({
          now,
          deadlineAt: dispatch.deadlineAt,
          producerEndedAt,
        })
      )
        return;
```

임포트는 `import { settleProcessingAttempt } from "./settle-processing-attempt";` 다음에:

```ts
import {
  canRecoverySettleVideoAttempt,
  producerEndObservedAt,
} from "../model/recovery-settle-policy";
```

(`:68` `if (dispatch.uploadedFile.status !== "processing") return;` 이하 무변경. 처음 관측한 틱은 `producerEndedAt = now`라 유예
안이고, 기록된 증거의 `observedAt`으로 5분 뒤 틱이 정산한다.)

### 11) `claim-processing-attempt.ts`

```ts
// before (:249-278)
export async function markProcessingSpawnUnknown(args: {
  uploadedFileId: string;
  attempt: number;
  workerRunId: string;
}): Promise<void> {
  const hint = await findProcessingDispatchForAttempt(
    args.uploadedFileId,
    args.attempt,
  );
  if (!hint) return;
  await db.$transaction(async (tx) => {
    await lockUserForCredits(hint.uploadedFile.userId, tx);
    await lockUploadedFileForProcessing(args.uploadedFileId, tx);
    await lockProcessingDispatch(hint.id, tx);
    const current = await findProcessingDispatchForAttempt(
      args.uploadedFileId,
      args.attempt,
      tx,
    );
    if (
      current?.workerRunId === args.workerRunId &&
      current.modalSpawnState === "sending"
    )
      await updateProcessingDispatch(
        current.id,
        { modalSpawnState: "unknown" },
        tx,
      );
  });
}
// after
type ProcessingSpawnOwner = {
  uploadedFileId: string;
  attempt: number;
  workerRunId: string;
};

async function leaveSendingProcessingSpawn(
  args: ProcessingSpawnOwner,
  modalSpawnState: "unknown" | "not_sent",
): Promise<void> {
  const hint = await findProcessingDispatchForAttempt(
    args.uploadedFileId,
    args.attempt,
  );
  if (!hint) return;
  await db.$transaction(async (tx) => {
    await lockUserForCredits(hint.uploadedFile.userId, tx);
    await lockUploadedFileForProcessing(args.uploadedFileId, tx);
    await lockProcessingDispatch(hint.id, tx);
    const current = await findProcessingDispatchForAttempt(
      args.uploadedFileId,
      args.attempt,
      tx,
    );
    if (
      current?.workerRunId === args.workerRunId &&
      current.modalSpawnState === "sending"
    )
      await updateProcessingDispatch(current.id, { modalSpawnState }, tx);
  });
}

/** The POST may have reached Modal (timeout, network error): never POST again for this attempt. */
export async function markProcessingSpawnUnknown(
  args: ProcessingSpawnOwner,
): Promise<void> {
  await leaveSendingProcessingSpawn(args, "unknown");
}

/** Modal answered with a non-2xx response, so nothing was spawned: the step retry may POST again. */
export async function resetRejectedProcessingSpawn(
  args: ProcessingSpawnOwner,
): Promise<void> {
  await leaveSendingProcessingSpawn(args, "not_sent");
}
```

### 12) `features/upload/server.ts`

```ts
// before (:13)
  markProcessingSpawnUnknown,
// after
  markProcessingSpawnUnknown,
  resetRejectedProcessingSpawn,
```

### 13) `inngest/functions.ts`

임포트(`:6-12`의 블록):

```ts
// before (:10)
  markProcessingSpawnUnknown,
// after
  markProcessingSpawnUnknown,
  resetRejectedProcessingSpawn,
```

모듈 스코프 — `type ProcessingSkipReason = "already_processing" | "attempt_no_longer_active";`(`:57`) 바로 위에:

```ts
/** Modal이 HTTP 응답으로 거절했다 — 응답이 왔으니 spawn은 일어나지 않았다(FEAT-63). */
class ModalDispatchRejectedError extends Error {}

/**
 * send-to-modal이 실패한 뒤의 spawn 상태. 거절(응답 있음)은 not_sent로 되돌려 step 재시도가 다시 POST하게
 * 하고(예약 도입 전 동작), 타임아웃·네트워크 오류는 Modal이 이미 받았을 수 있어 unknown으로 둔다 — 재시도해도
 * POST하지 않고 콜백을 기다린다.
 */
async function recordFailedProcessingSpawn(
  error: unknown,
  owner: { uploadedFileId: string; attempt: number; workerRunId: string },
): Promise<void> {
  if (error instanceof ModalDispatchRejectedError)
    await resetRejectedProcessingSpawn(owner);
  else await markProcessingSpawnUnknown(owner);
}

```

auto/render — `send-to-modal`:

```ts
// before (:286-300)
            const text = await response.text().catch(() => "");
            throw new Error(
              `Modal dispatch failed (${response.status}): ${text.slice(0, 500)}`,
            );
          }

          const result = (await response.json()) as Record<string, unknown>;
          return result;
        } catch (error) {
          await markProcessingSpawnUnknown({
            uploadedFileId,
            attempt,
            workerRunId: runId,
          });
          throw error;
// after
            const text = await response.text().catch(() => "");
            throw new ModalDispatchRejectedError(
              `Modal dispatch failed (${response.status}): ${text.slice(0, 500)}`,
            );
          }

          const result = (await response.json()) as Record<string, unknown>;
          return result;
        } catch (error) {
          await recordFailedProcessingSpawn(error, {
            uploadedFileId,
            attempt,
            workerRunId: runId,
          });
          throw error;
```

analyze — `send-analyze-to-modal`:

```ts
// before (:691-705)
              const text = await response.text().catch(() => "");
              throw new Error(
                `Modal analyze dispatch failed (${response.status}): ${text.slice(0, 500)}`,
              );
            }

            const result = (await response.json()) as Record<string, unknown>;
            return result;
          } catch (error) {
            await markProcessingSpawnUnknown({
              uploadedFileId,
              attempt,
              workerRunId: runId,
            });
            throw error;
// after
              const text = await response.text().catch(() => "");
              throw new ModalDispatchRejectedError(
                `Modal analyze dispatch failed (${response.status}): ${text.slice(0, 500)}`,
              );
            }

            const result = (await response.json()) as Record<string, unknown>;
            return result;
          } catch (error) {
            await recordFailedProcessingSpawn(error, {
              uploadedFileId,
              attempt,
              workerRunId: runId,
            });
            throw error;
```

(`response.json()`의 파싱 실패는 `ModalDispatchRejectedError`가 아니라 `unknown` 쪽이다 — 2xx로 받았으면 spawn됐을 수 있다.)

### 14)·15) 타임아웃

```ts
// before (runtime-dependencies.ts:49)
      signal: AbortSignal.timeout(15_000),
// after
      // Abort before the Inngest route's maxDuration (10s, app/api/inngest/route.ts) so the
      // ambiguous result is recorded as unknown instead of Vercel killing the step and the
      // retry POSTing a second invocation.
      signal: AbortSignal.timeout(8_000),
```

```ts
// before (runtime-dependencies.ts:65, video-runtime-dependencies.ts:27 — 같은 줄, 각 파일에 1회)
        signal: AbortSignal.timeout(10_000),
// after
        signal: AbortSignal.timeout(8_000), // under the 10s route maxDuration
```

### 16) `apps/web/src/fsd/features/card-news/api/access.ts` (신규)

```ts
import "server-only";
import { env } from "~/env";
import { canAcceptCardNews } from "~/fsd/shared/config/card-news";

/**
 * Whether this user can use card news at all. Entry points (dashboard header, dashboard tab)
 * use the same admission as the clip's "Create card news" button, so a disabled flag never
 * leaves a link to a feature the user cannot reach (FEAT-63).
 */
export function canUserAccessCardNews(userId: string): boolean {
  return canAcceptCardNews(
    {
      enabled: env.CARD_NEWS_ENABLED,
      allowedUserIds: env.CARD_NEWS_ALLOWED_USER_IDS,
      endpoint: env.CARD_NEWS_ENDPOINT,
      endpointAuth: env.CARD_NEWS_ENDPOINT_AUTH,
      webhookSecret: env.CARD_NEWS_WEBHOOK_SECRET,
      siteUrl: env.NEXT_PUBLIC_SITE_URL,
    },
    userId,
  );
}
```

### 17) `features/card-news/server.ts` — 끝에 추가

```ts
export { canUserAccessCardNews } from "./api/access";
```

### 18) `features/card-news/api/index.ts`

```ts
// before (:21-22)
import { env } from "~/env";
import { canAcceptCardNews } from "~/fsd/shared/config/card-news";
// after
import { canUserAccessCardNews } from "./access";
```

```ts
// before (:310-320)
    enabled: canAcceptCardNews(
      {
        enabled: env.CARD_NEWS_ENABLED,
        allowedUserIds: env.CARD_NEWS_ALLOWED_USER_IDS,
        endpoint: env.CARD_NEWS_ENDPOINT,
        endpointAuth: env.CARD_NEWS_ENDPOINT_AUTH,
        webhookSecret: env.CARD_NEWS_WEBHOOK_SECRET,
        siteUrl: env.NEXT_PUBLIC_SITE_URL,
      },
      userId,
    ),
// after
    enabled: canUserAccessCardNews(userId),
```

(`env`·`canAcceptCardNews`의 이 파일 안 다른 사용은 0건 — `:22`·`:310-317`뿐.)

```ts
// before (:330-338)
    cleanups: (await listUserAssetCleanupJobs(userId, 20))
      .filter((job) => ["set", "clip", "uploaded-file"].includes(job.kind))
      .map((job) => ({
        id: job.id,
        kind: job.kind,
        status: job.status,
        lastError: job.lastError,
        createdAt: job.createdAt.toISOString(),
      })),
// after
    cleanups: (await listUserAssetCleanupJobs(userId, 20)).map((job) => ({
      id: job.id,
      kind: job.kind,
      status: job.status,
      lastError: job.lastError,
      createdAt: job.createdAt.toISOString(),
    })),
```

### 19) `entities/card-news/api/index.ts`

```ts
// before (:325-334)
export async function listUserAssetCleanupJobs(
  userId: string,
  limit = 20,
): Promise<AssetCleanupJob[]> {
  return db.assetCleanupJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
// after
/** Deletions the user started that are still in progress. Completed and internal orphan/retention jobs stay hidden. */
export async function listUserAssetCleanupJobs(
  userId: string,
  limit = 20,
): Promise<AssetCleanupJob[]> {
  return db.assetCleanupJob.findMany({
    where: {
      userId,
      kind: { in: ["set", "clip", "uploaded-file"] },
      status: { not: "completed" },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
```

(호출처는 `features/card-news/api/index.ts:330` 하나뿐 — 병합 후 트리 grep. 완료되면 목록에서 빠지므로 패널은 진행 중일 때만
보이고, 끝나면 5초 polling(`asset-cleanup-status.tsx:18-22`)의 다음 조회에서 사라진다. `:52-53`의 「Deletion completed」 분기는 도달하지
않게 되지만 지우지 않는다 — 표시 문구는 이 계획의 범위 밖.)

### 20)·21)·22) 키

```ts
// query-keys.ts 끝에 추가
export const assetCleanupKeys = {
  all: ["asset-cleanup"] as const,
  user: (userId: string) => ["asset-cleanup", userId] as const,
};
```

```ts
// before (entities/card-news/index.ts:18)
export { cardNewsKeys } from "./model/query-keys";
// after
export { assetCleanupKeys, cardNewsKeys } from "./model/query-keys";
```

```tsx
// before (asset-cleanup-status.tsx:3-4)
import { listAssetCleanupStatuses, retryAssetCleanup } from "../api";
import { Button } from "~/fsd/shared/ui/atoms/button";
// after
import { assetCleanupKeys } from "~/fsd/entities/card-news";
import { listAssetCleanupStatuses, retryAssetCleanup } from "../api";
import { Button } from "~/fsd/shared/ui/atoms/button";
```

```tsx
// before (asset-cleanup-status.tsx:8)
  const queryKey = ["asset-cleanup", userId] as const;
// after
  const queryKey = assetCleanupKeys.user(userId);
```

### 23)·24) 삭제 hook

```ts
// before (use-delete-clip.ts:8)
import { deleteClip } from "../api";
// after
import { assetCleanupKeys, cardNewsKeys } from "~/fsd/entities/card-news";
import { deleteClip } from "../api";
```

```ts
// before (use-delete-clip.ts:52-53)
        queryClient.invalidateQueries({ queryKey: uploadedFileKeys.lists() }),
      ]);
// after
        queryClient.invalidateQueries({ queryKey: uploadedFileKeys.lists() }),
        // 삭제는 이제 접수(deleting)다 — 정리 상태 패널과 파생 카드뉴스 목록도 다시 읽는다(FEAT-63).
        queryClient.invalidateQueries({ queryKey: assetCleanupKeys.all }),
        queryClient.invalidateQueries({ queryKey: cardNewsKeys.all }),
      ]);
```

```ts
// before (use-delete-uploaded-file.ts:8)
import { deleteUploadedFile } from "../api";
// after
import { assetCleanupKeys, cardNewsKeys } from "~/fsd/entities/card-news";
import { deleteUploadedFile } from "../api";
```

```ts
// before (use-delete-uploaded-file.ts:40-43)
        queryClient.invalidateQueries({
          queryKey: uploadedFileKeys.activeQueues(),
        }),
      ]);
// after
        queryClient.invalidateQueries({
          queryKey: uploadedFileKeys.activeQueues(),
        }),
        // 삭제는 이제 접수(deleting)다 — 정리 상태 패널과 파생 카드뉴스 목록도 다시 읽는다(FEAT-63).
        queryClient.invalidateQueries({ queryKey: assetCleanupKeys.all }),
        queryClient.invalidateQueries({ queryKey: cardNewsKeys.all }),
      ]);
```

### 25)·26) 헤더

```tsx
// before (dashboard-header/ui/index.tsx:21-31)
interface DashboardHeaderProps {
  creditBalanceSlot: React.ReactNode;
  email: string;
  image?: string | null;
}

export default function DashboardHeader({
  creditBalanceSlot,
  email,
  image,
}: DashboardHeaderProps) {
// after
interface DashboardHeaderProps {
  creditBalanceSlot: React.ReactNode;
  email: string;
  image?: string | null;
  /** 카드뉴스 진입점 노출 — 클립의 생성 버튼과 같은 판정(canUserAccessCardNews) */
  showCardNews: boolean;
}

export default function DashboardHeader({
  creditBalanceSlot,
  email,
  image,
  showCardNews,
}: DashboardHeaderProps) {
```

```tsx
// before (:43-48)
          <Link
            href="/dashboard/card-news"
            className="hidden text-sm font-medium md:block"
          >
            Card news
          </Link>
// after
          {showCardNews && (
            <Link
              href="/dashboard/card-news"
              className="hidden text-sm font-medium md:block"
            >
              Card news
            </Link>
          )}
```

```tsx
// before (:80-83)
              <DropdownMenuItem asChild>
                <Link href="/dashboard/card-news">Card news</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
// after
              {showCardNews && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/card-news">Card news</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
```

```tsx
// before (layout.tsx:4)
import { CreditBalance } from "~/fsd/features/credit-balance";
// after
import { CreditBalance } from "~/fsd/features/credit-balance";
import { canUserAccessCardNews } from "~/fsd/features/card-news/server";
```

```tsx
// before (layout.tsx:31-32)
      <DashboardHeader
        email={user.email}
// after
      <DashboardHeader
        email={user.email}
        showCardNews={canUserAccessCardNews(session.user.id)}
```

### 27)·28) 대시보드 탭

```tsx
// before (pages/dashboard/ui/index.tsx:48-49)
  defaultVideoPaddingPercent: number;
}
// after
  defaultVideoPaddingPercent: number;
  /** 카드뉴스 탭 링크 노출 — 헤더와 같은 판정(canUserAccessCardNews) */
  showCardNews: boolean;
}
```

```tsx
// before (:58-59)
  defaultVideoPaddingPercent,
}: DashboardViewProps) {
// after
  defaultVideoPaddingPercent,
  showCardNews,
}: DashboardViewProps) {
```

```tsx
// before (:128-130)
          <Link className="px-3 text-sm" href="/dashboard/card-news">
            Card news
          </Link>
// after
          {showCardNews && (
            <Link className="px-3 text-sm" href="/dashboard/card-news">
              Card news
            </Link>
          )}
```

```tsx
// before (app/dashboard/page.tsx:15)
import { reconcileStaleUploadedFilesForUser } from "~/fsd/features/upload/api/reconcile-stale-processing";
// after
import { reconcileStaleUploadedFilesForUser } from "~/fsd/features/upload/api/reconcile-stale-processing";
import { canUserAccessCardNews } from "~/fsd/features/card-news/server";
```

```tsx
// before (:59)
      defaultVideoPaddingPercent={framing.defaultVideoPaddingPercent}
// after
      defaultVideoPaddingPercent={framing.defaultVideoPaddingPercent}
      showCardNews={canUserAccessCardNews(session.user.id)}
```

### 29) `credit-balance/ui/index.tsx`

```tsx
// before (:37)
  if (query.isError || !query.data) {
// after
  // A failed refetch keeps the last balance; Unauthorized clears the cache above, so data is gone then.
  if (!query.data) {
```

### 30)·31) 공개 문구 (사용자에게 보이는 영어 그대로)

```ts
// before (pricing/config/index.ts:13)
    value: "1 credit per clip or card-news set",
// after
    value: "1 credit per clip",
```

```ts
// before (:19)
    value: "Video or carousel files",
// after
    value: "Vertical mp4 + captions",
```

```ts
// before (:21)
      "Video ships as a 1080x1920 mp4. A separate card-news generation creates 1080x1350 JPGs, ZIP and Instagram copy from one completed clip.",
// after
      "Video ships as a 1080x1920 mp4. When enabled for your account, a separate card-news generation creates 1080x1350 JPGs, ZIP and Instagram copy from one completed clip.",
```

```tsx
// before (terms/page.tsx:89-91)
              Card-news generation costs one credit per set, settled only when
              the entire image set, ZIP and copy are ready. A final failure
              releases the reservation. Technical retries do not add a charge.
// after
              When enabled for your account, card-news generation costs one
              credit per set, settled only when the entire image set, ZIP and
              copy are ready. A final failure releases the reservation.
              Technical retries do not add a charge.
```

(헤드라인 둘의 after는 dev의 원문 그대로다 — `D/apps/web/src/fsd/pages/pricing/config/index.ts`의 같은 자리.)

### 32) `apps/web/CLAUDE.md` 테스트 표

- 수치 줄 `현재 32개 파일, 56 suite, 227개 테스트.` → 구현 후 실측값(예상 43개 파일). 숫자는 `npm test` 출력에서 그대로 옮긴다.
- 행 추가 11개: `entities/card-news/model/contract.test.mjs` · `revision-policy.test.mjs` · `text-length.test.mjs` ·
  `entities/credit-reservation/model/reservation-policy.test.mjs` · `entities/user/model/credit-balance.test.mjs` ·
  `features/card-news/model/editor-schema.test.mjs` · `shared/api/s3-policy.test.mjs` · `shared/config/card-news.test.mjs` ·
  `inngest/card-news-contract.test.mjs` · `features/upload/model/stored-clip-object.test.mjs` · `features/upload/model/recovery-settle-policy.test.mjs`.
  각 행은 그 파일의 `describe`/`test` 이름을 읽고 「무엇을 지키는가」 한두 문장으로 쓴다(기존 행 형식). 뒤 둘은 V1(`binary/octet-stream`
  포함이 요점)·V3(유예 경계 5분 정확값이 요점)를 적는다.

### 33) `apps/backend/CLAUDE.md` — 끝에 절 추가

```markdown
## Card-news CPU app (FEAT-63)

`card_news_app.py` is a **separate Modal app** (`apch-card-news`, CPU only) with its own `requirements-card-news.txt`; it never imports `main.py`. Deploy from `apps/backend` with `PYTHONUTF8=1` (same cp949 crash as the GPU app). It reads the same Modal secret `ai-podcast-clipper-secret`, which must also hold `CARD_NEWS_ENDPOINT_AUTH` and `CARD_NEWS_WEBHOOK_SECRET`.

- Its `/status` endpoint is also the **video** producer-termination lookup: video deletions and global recovery in the web app wait on it. Deploy it even while card news is disabled.
- Image build steps (`.env`, `pip_install…`) must come **before** every `add_local_*` call — Modal raises `InvalidError` only at deploy time. `test_card_news_wiring.py` checks the order.
- `card_news/assets/OFL.txt` is hashed at runtime against `dependency-manifest.json`; `.gitattributes` pins it to LF because this repo checks out with `core.autocrlf=true`.
```

### 34) 제안서

`docs/proposals/active/instagram-card-news-generation.md`를 스크래치패드 사본
`…/scratchpad/preserve63/proposal-reconciled-20261014.md`(974줄, sha256 `1072b7767f607500…`, 원본은 다른 세션의 임시 worktree
`apch-card-news-reconciliation-20261014`의 미커밋 편집, 마지막 수정 2026-10-14 21:33)로 바이트 그대로 교체한다. 내용 수정 없음.

## 테스트

**덮는 것** (구현 후 전부 실행, EXIT 0·실패 0이어야 한다)

- web: `npm run check -w apps/web`(FSD·lint·tsc) · `npm test -w apps/web`(348 + 신규 두 파일) · `next build`
- admin: `npm run check -w apps/admin` · `npm test -w apps/admin` · `npm run verify:fsd:final -w apps/admin`
- backend: `python -m unittest discover -s apps/backend -p "test_*.py"`(161 + 3, **실패 0** — `test_font_hashes_license_and_pins_are_exact`가
  CRLF 정리로 통과로 바뀌는 것이 B3의 음성 대조) · `py_compile` `main.py`·`card_news_app.py`
- 실 PostgreSQL 통합 CLI 3종(`apps/web/scripts/verify-card-news-local-db.mts`) — 보정 뒤 재실행
- `stored-clip-object.test.mjs`: `video/mp4` · **`binary/octet-stream`** · `application/octet-stream` 참, `video/mp4; codecs=avc1` 매개변수 ·
  `Video/MP4` 대소문자 참, `text/html` · 빈 문자열 거짓, `contentLength` 0 거짓
- `recovery-settle-policy.test.mjs`: 마감 경과(`deadlineAt <= now`, 같은 시각 포함) 참 · 마감 전 + 종료 없음 거짓 · 방금 종료(0ms) 거짓 ·
  4:59.999 거짓 · **정확히 5:00 참** · 마감 null + 오래된 종료 참. `producerEndObservedAt`: `observedAt` · `confirmedAt` · 둘 다면 `observedAt` ·
  잘못된 날짜 문자열 · `null` · 비객체 → epoch
- backend 신규 3건: 이미지 층 순서, 컨테이너 경로(`/root`) 평가, 실패 코드(정수 429·빈 문자열·공백·161자·코드 없음 → `cpu_job_failed`)

**못 덮는 범위** — 배포 확인 원장(`docs/release-checks.md`) 등재 대상

- Modal CPU 이미지 빌드·컨테이너 기동(B1·B2 수정의 실증), Gemini 실출력·원고 의미, 한국어 폰트 렌더 품질, 인증 사용자 다운로드
- 실제 S3에서 GPU가 올린 클립의 HEAD `ContentType`(V1의 전제 — 배포 뒤 첫 영상으로 정산된 클립 수 = 생성 수인지로 판정)
- V3 유예의 실효(웹훅이 정산한 영상에 제목·설명이 붙는지, analyze가 review_pending으로 가는지)
- V4: Modal 거절 응답 뒤 step 재시도가 실제로 다시 POST하는지는 Inngest 실행 기록으로만 보인다(DB CLI는 `resetRejectedProcessingSpawn`
  경로를 부르지 않는다 — 함수 본문은 `markProcessingSpawnUnknown`과 같은 잠금·조건이고 목표 상태만 다르다)
- 화면(C1·A2·B3'·문구): 러너에 DOM이 없다 — 계획 검증의 실물 렌더(카탈로그 경로 8)와 배포 뒤 화면 확인
- 영상 삭제 정리 완결(CPU `/status` + legacy drain receipt 전제)

## 범위 밖 의존

**배포는 이 계획의 승인 밖이다** — 게이트②가 여는 것은 병합·보정 커밋·로컬 검증까지다. 배포는 단계마다 소유자 승인을 따로 받는다.
아래는 배포 때 막히는 지점과 순서다.

1. **운영 DB 읽기(소유자)** — 이 세션의 자동 모드가 운영 데이터 읽기를 거부했다(2026-10-19). 적용 전에 확인할 것: `User.credits < 0` 행 수
   (= 0이어야 `User_credit_balance_check`가 걸린다), `UploadedFile.status IN ('pending_enqueue','queued','processing')` 행 수(= 0이어야
   legacy 진행 중 행이 영구 정체되지 않는다 — 리뷰 1의 V5), 실사용자·최근 활동(전환 절차 선택 — 아래 5). 소유자가 `!` 명령으로 실행하거나
   권한을 준다. 질의는 `SELECT`만이다.
2. **Modal secret** — `ai-podcast-clipper-secret`에 `CARD_NEWS_ENDPOINT_AUTH`·`CARD_NEWS_WEBHOOK_SECRET` 추가(새 임의 값).
3. **CPU 앱 배포** — `apps/backend`에서 `PYTHONUTF8=1 modal deploy card_news_app.py`(메모리 「배포 직후 Modal 탐침」대로 컨테이너 확인 후 탐침).
4. **운영 마이그레이션 적용** — `packages/db`에서 `node --env-file=../../.env ../../node_modules/prisma/build/index.js migrate deploy`
   (FEAT-47 실측 형태), 직전 `migrate status`로 미적용이 이 하나뿐인지 재확인. 추가형이라 기존 코드가 먼저 돌아도 안전하다.
5. **web 배포(main 합류)와 영상 게이트** — Vercel env: `CARD_NEWS_ENDPOINT`·`CARD_NEWS_ENDPOINT_AUTH`·`CARD_NEWS_WEBHOOK_SECRET`,
   `CARD_NEWS_ENABLED=false`, `CARD_NEWS_ALLOWED_USER_IDS=<소유자 userId>`. 영상 게이트 둘은 legacy drain writer가 **둘 다 닫혀 있어야**
   돈다(`record-legacy-producer-drain.ts`의 admission/worker 검사) → 닫힌 채 배포 → receipt 적용 → `VIDEO_GENERATION_ADMISSION_ENABLED=true`·
   `VIDEO_WORKER_START_ENABLED=true` → 재배포. **게이트를 열지 않은 상태로 두면 새 영상 생성이 전부 멈춘다.** 실사용자가 0이고 1번의 진행 중
   행이 0이면 런북 7단계(`docs/card-news-runbook.md:90-96`)의 drain 확인은 「1번 계수 = 0」으로 갈음한다. 사용자가 있으면 런북 그대로.
6. **legacy drain receipt** — 기존 dispatch는 `modalSpawnState='unknown'`·call id 없음이라, receipt 없이는 **기존 영상의 삭제 정리가 영원히
   보류**된다(`cleanup.ts:232-255`). 대상 목록은 운영 DB 읽기라 1번과 같은 승인이 필요하다. dry-run 뒤 `--apply`.
7. **확인** — 짧은 영상 1개: 클립 수 = 정산 크레딧(V1), 제목·설명 존재(V3), 영상 하나 삭제 → 정리 패널이 사라짐(A2·6). 그다음 allowlist의
   소유자 계정으로 카드뉴스 1세트(B1~B4).

**후속 후보 (백로그 제시용, 이 계획에서 고치지 않음)** — 근거는 `docs/agents/main-loop/FEAT-63.md` 「계획 작성 — 리뷰」.
카드뉴스 복구 cron의 job별 예외 격리 · `dispatchCardNewsJob`의 `nextDispatchAt` 무시(침묵 구간 run 증식) · 10-14 대조의 BLK-CN-03 나머지
(수정 필드 계측·analytics context) · 정산 HEAD 예외의 키별 처리 · 예약도 스냅샷도 없는 legacy processing 행 자동 종료 · 죽은 코드
`decrementUserCreditsFloorZero` · 삭제 실패 원문 노출·토스트 「Asset cleanup」 용어·삭제 다이얼로그의 카드뉴스 문구(플래그 무관 노출) ·
카드뉴스 목록 빈 문구 · 중첩 `<main>`·내부 코드 노출 · `Clip.uploadedFileId` null 클립의 정리 스코프 · `executionEpoch` 고정값 대비 문서의
「epoch fencing」 · Python/JS 공백 분할 차이 · callback URL 호스트 허용 목록 · `/status` 인증의 비ASCII 헤더 500.

## 대안

- **셋으로 쪼개기**((a) 예약·영상 정산·마이그레이션 (b) CPU 앱 (c) 화면) — 게이트①에서 기각. 이미 함께 짜인 코드라 경계(예: CPU `/status`가
  영상 삭제의 종료 증거)가 나뉘면 보이지 않는다. 이번 결함 B1~B3이 정확히 그 경계에 있었다.
- **squash·cherry-pick** — 기각. 병합 커밋이면 `72bde11`이 그대로 조상이 되어 인수 조건 2의 1단계가 `git diff 72bde11^1 72bde11` 대
  병합 커밋 diff의 기계 대조가 된다. squash는 그 대조를 158파일 손 비교로 바꾼다.
- **브랜치에서 고친 뒤 병합** — 기각. 같은 결과지만 보정이 `72bde11`과 섞여, 「작성된 것」과 「검증이 고친 것」의 경계가 이력에서 사라진다.
- **영상 예약 전환을 빼고 카드뉴스만** — 기각. 두 종류가 같은 잔액을 쓰므로 예약 없이는 마지막 1크레딧 경쟁을 막을 수 없다(제안서 Current
  State 「잔액 보호」). 되돌릴 경우 `72bde11`의 정산·삭제·복구 설계 전부를 다시 써야 한다.
- **V3을 「analyze는 마감으로만 실패」로 좁히기**(리뷰 1 제안) — 기각. 영상 메타데이터 소실도 같은 틈에서 생기므로, 종류를 가리지 않는 유예
  하나가 더 단순하다.
- **영상 게이트 기본값을 `true`로** — 기각. drain writer가 게이트가 닫혀 있기를 요구하고, 기본값이 열려 있으면 배포 순간 구버전·신버전
  과금이 겹칠 수 있다. 대신 배포 절차 5에 「열지 않으면 멈춘다」를 못 박는다.
