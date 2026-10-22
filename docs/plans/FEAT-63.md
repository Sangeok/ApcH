# FEAT-63: Instagram 카드뉴스 — 계획 검증 없이 배포된 구현(`d836dc7`)의 사후 인수

agent: main-loop

> **담당이 main-loop인 이유**: 변경이 backend·web·docs를 한 덩어리로 가로지르고 `packages/db`에는 담당 dev가 없다.
> 2026-10-19 게이트①에서 소유자가 「쪼개지 않고 main-loop 하나」를 받아들였다(`docs/agents/main-loop/FEAT-63.md` 「게이트①」).
>
> **재범위(2026-10-22)**: 이 계획서는 통합 계획(커밋 `1c819fd` 시점, `git show 1c819fd:docs/plans/FEAT-63.md` — 이하 「옛 계획」)을
> 대체한다. `72bde11`의 구현은 `fix/card-news-*` 브랜치 수정과 함께 PR #134(`75797b4`)·#135(`54d74df`)·#136(`d836dc7`)으로
> 운영에 배포됐고, 2026-10-22 `745439f`로 dev에 들어왔다. 되돌리지 않는다. 이 계획서가 정하는 것은 셋이다 —
> ① 옛 계획이 찾은 결함·보정 35개가 배포본에서 어떻게 됐는지, ② 남은 것 중 무엇을 이 항목에서 고치는지, ③ 운영 실물을 무엇으로 확인하는지.
>
> **줄 번호 기준**: 표시가 없는 경로는 현재 dev(`6bb23a4`) 워킹트리다. 코드는 `d836dc7`과 바이트 동일하다
> (`git diff --stat d836dc7 6bb23a4 -- apps packages .env.example .gitattributes` 0줄 — 차이는 보드·백로그·계획 문서뿐).
>
> **BUG-19와의 경계**: 매분 cron 4개의 **스케줄**(`apps/web/src/inngest/card-news-functions.ts`·`video-reservation-functions.ts`·
> `apps/web/src/app/api/inngest/route.ts`)은 BUG-19가 맡는다. 이 계획은 그 세 파일을 고치지 않는다. cron이 부르는 복구 함수의
> **의미**만 인수한다 — 그중 영상 복구(`reconcileVideoReservations`)는 아래 V3에서 고친다(「범위 밖 의존」 2).

## 현재 동작

### 운영 상태 — ⚠️ **운영 영상 생성이 멈춰 있을 가능성이 높다**

**문서·로컬 기록상 운영의 영상 게이트 둘은 마지막으로 `false`였다. 이후 다시 연 기록은 없다.** 게이트가 닫혀 있으면 2026-10-20부터
모든 신규 업로드가 실패한다.

| 관심사 | 근거 |
| --- | --- |
| 코드 기본값 = 닫힘 | `apps/web/src/env.js:52-59` `VIDEO_GENERATION_ADMISSION_ENABLED`·`VIDEO_WORKER_START_ENABLED` 둘 다 `.default("false")`. `.env.example:43-44`도 `=false` |
| 닫힌 admission | `apps/web/src/fsd/features/upload/api/index.ts:77-78`(scheduling)·`:267-268`(`prepareUpload`) `return failure("Video generation is temporarily unavailable");` — 업로드 준비 단계에서 거절 |
| 닫힌 worker | `apps/web/src/fsd/features/upload/api/claim-processing-attempt.ts:106-107` `if (!videoProcessingRuntime().workerStartEnabled())` → `return { status: "not_claimable" };` → `apps/web/src/inngest/functions.ts:217-219` `return { skipped: true };` |
| 마지막 기록 | `docs/card-news-release-verification-20261020.md:46` 「ingress 차단 배포 … worker 시작 차단 재배포 … 두 운영 설정을 개별 조회해 false를 대조한 뒤」. 이 문서는 이후 `:48` 마이그레이션 → `:50` CPU 앱 배포 → `:54` PR #135 배포 → `:62` PR #136 원인 분석 순으로 진행한다. **게이트를 연 기록은 없다** |
| 런북의 요구 | `docs/card-news-runbook.md:88` 「**기존 영상도 두 gate를 명시적으로 활성화하기 전 새 생성을 시작하지 않는다.**」, `:95` 「6. 영상 검증 사용자에게 두 영상 gate를 열어 …」 — 이 6단계의 실행 기록이 없다 |
| 로컬 흔적(저장소 밖, 보조 증거) | `C:/Users/hamso/AppData/Local/Temp/apch-card-news-vercel-ops.mjs`(10-20 16:31)에 `open-video` 모드(두 값 `"true"`)가 있다. 그 실행 로그는 없다. 같은 폴더의 `apch-card-news-legacy-drain-apply-20261020.log`(10-20 16:23)에는 `"applied":true`·`"targetCount":43`이 있다 — 문서(`:48`)에는 dry-run만 적혔다 |

**이 계획과의 관계**: 게이트를 지금 열면 아래 V1이 바로 살아난다. 성공한 영상이 클립 0개로 정산되고, 그 클립이 24시간 뒤 지워진다.
그래서 **영상 게이트는 이 항목의 V1·V3·V4 수정을 배포한 뒤에 연다**(「범위 밖 의존」 1). 반대로 게이트가 이미 열려 있다면
V1이 운영에서 지금 일어나고 있다는 뜻이다 — 그때는 이 항목보다 그 확인이 먼저다.

그 밖에 문서가 확인한 운영 사실(`docs/card-news-release-verification-20261020.md`):

- `:42` 전환 직전 활성 업로드 0, 기존 sent dispatch 43, 음수 잔액 0
- `:48` 마이그레이션 `20261011000000_card_news_credit_reservations` 적용. 계정 8개의 `credits`는 그대로이고 `reservedCredits`는 전부 0. legacy receipt dry-run SHA `fd9307b8…`
- `:50` CPU 앱 `apch-card-news` 배포, 별도 secret `apch-card-news-auth`. 일반 flag `false`, allowlist에는 합성 검증 계정만
- `:54` PR #135 배포 READY, Inngest worker 10개 sync
- `:62` 무료 v2 자동 렌더가 대기 상태에서 멈췄다(`maxDuration=10` 상속 → 504). 수정(PR #136) 뒤 재배포·복구 결과는 「추가 기록한다」고만 적혀 있고, **기록되지 않았다**
- 2026-10-21 소유자가 Inngest 대시보드에서 매분 cron 4개를 일시정지했다(BUG-19 source 관측 3). 그 뒤로는 카드뉴스 배차·복구·정리와 영상 예약 복구가 돌지 않는다

### 배포본의 코드 이력 — `72bde11` 이후

`72bde11`은 `d836dc7`의 조상이다(`git merge-base --is-ancestor`). 카드뉴스 쪽 변경은 다음 다섯 커밋과 병합 둘이다.
`01332b2`(= `72bde11` + main `67e9a13`, 자동 병합 — `git show --remerge-diff` 0줄)를 기준으로 `git diff --stat 01332b2 d836dc7`은 41파일 +1486/−283이다.

| 커밋 | 내용 |
| --- | --- |
| `b711e2c`(PR #134) | 예약 전 코드에 영상 게이트 둘 추가(사전 배포). 미설정이면 열림(`docs/video-cutover-gates.md:3`) |
| `7a91665` | #134를 카드뉴스 브랜치에 병합. **충돌 해소**: `functions.ts`·`upload/api/index.ts`에서 `72bde11` 쪽을 택했다(`git show --remerge-diff 7a91665`). worker 게이트 검사는 `claimProcessingAttempt` 안의 것(`claim-processing-attempt.ts:106`)만 남았다 |
| `ddef38c` | 5-lens 리뷰 수정 CN001~005, 분석 문맥 outbox, 삭제 hook 캐시, OFL LF, Modal 이미지 층 순서·컨테이너 경로 |
| `c7c0c7d` | 병합 뒤 `env.js` 중복 정의 제거 — 기본값 `false` 유지 |
| `e811641` | legacy drain 트랜잭션에 `{ maxWait: 10_000, timeout: 120_000 }`(`record-legacy-producer-drain.ts`) — 로직 무변경 |
| `4859d2e`(PR #136) | `route.ts` `maxDuration` 10 → 300, 매분 cron 본문을 **작업별 durable step**으로 분해, Gemini thinking 토큰 합산 |
| `packages/db` | `git diff --stat 72bde11 d836dc7 -- packages/db` 0줄 — 운영에 적용된 마이그레이션은 `72bde11`의 것 그대로 |

### 계획 단계 게이트 재실행 (2026-10-22, 현재 dev, 읽기 전용)

| 게이트 | 결과 |
| --- | --- |
| web `npm run check -w apps/web` | **EXIT 0** (FSD·lint 경고 0·tsc) |
| web `npm test -w apps/web` | **359/0**, 56 suite, 테스트 파일 44 |
| admin `check`·`test`·`verify:fsd:final` | EXIT 0 · **337/0** · EXIT 0 |
| backend `python -m unittest discover -s apps/backend -p "test_*.py"` | **162 OK**(옛 계획 시험 병합의 실패 1 `test_font_hashes_license_and_pins_are_exact`는 `.gitattributes:25-26`로 해소). `py_compile` `main.py`·`card_news_app.py` OK |
| 실 PostgreSQL 통합 CLI 3종 | **EXIT 0** — concurrency·lifecycle·video compatibility 각각 「passed」. 바이너리는 `C:/Users/hamso/AppData/Local/Temp/apch-card-news-postgres-20261020/pgsql/bin`(옛 계획의 `…-20261011` 경로는 이제 없다). 로그에 찍힌 `23514` CHECK 위반 3건은 「DB CHECK 거부」 단언의 기대 오류다 |
| `scripts/card-news-client-regressions.test.mjs` | **6/0** (`node --import tsx --test`) |
| `scripts/verify-card-news-surfaces.mts` | EXIT 0 (`SKIP_ENV_VALIDATION=1`로 실행) |
| `next build` | 계획 단계에서는 돌리지 않았다(`.next` 산출물을 쓴다) — 구현 단계 게이트 |

검사가 모두 통과하는데도 아래 결함이 남는 이유는 옛 계획과 같다. V1은 가짜 S3의 클립 기본 타입이 `video/mp4`라서
(`apps/web/scripts/verify-card-news-video-compatibility.mts:143`) 실제 S3 기본값을 한 번도 거치지 않는다. V3은 그 검사가
「`ended`를 처음 본 틱에 곧바로 정산」을 단언한다(`:543-545`).

### 옛 계획 대조 — 결함

판정: **고쳐짐** = 배포본에서 해소, **남음** = 옛 계획이 본 그대로, **바뀜** = 다른 형태로 일부 또는 전부 해소.

| 결함 | 판정 | 배포본 근거 |
| --- | --- | --- |
| **V1** 성공한 영상이 클립 0개로 정산 | **남음** | `apps/web/src/fsd/features/upload/api/settle-processing-attempt.ts:81-85` `// GPU upload_file uses S3's application/octet-stream default for existing MP4s.` / `["video/mp4", "application/octet-stream"].includes(`. GPU는 여전히 ContentType 없이 올린다 — `apps/backend/main.py:879` `lambda: s3_client.upload_file(str(english_output_path), "ai-podcast-clipper-hamsoo", english_s3_key),`(`:894` Korean 동일). `headS3Object`는 `contentType: result.ContentType ?? "",`(`apps/web/src/fsd/shared/api/s3.ts:169`)이고, S3 기본값 `binary/octet-stream`은 목록에 없다. 0개 정산 뒤에는 같은 트랜잭션이 orphan 정리를 `notBefore: new Date(now.getTime() + 24 * 60 * 60_000),`(`settle-processing-attempt.ts:219`)·`retainedReferences: keys,`(`:207`, 빈 배열)로 잡는다 |
| **V3** 전역 복구가 정상 정산을 가로챔 | **남음** | `apps/web/src/fsd/features/upload/api/reconcile-video-reservations.ts:43-67` — 옛 계획의 before 블록과 diff 0줄. `ended`를 처음 관측한 틱에 `failureCode: "worker_timeout"`(`:73`)으로 정산한다. 메타데이터 소실 경로 `reconcile-published-metadata.ts:18` `if (!hint \|\| hint.reservation?.status !== "settled") return;`도 그대로다 |
| **V4** Modal HTTP 거절 뒤 재시도 없이 대기 | **남음** | `apps/web/src/inngest/functions.ts:294-300`(auto/render)·`:699-705`(analyze) catch → `markProcessingSpawnUnknown`. 재시도 때 `beginProcessingSpawn`이 `current.modalSpawnState !== "not_sent"`(`claim-processing-attempt.ts:184`)라 `false`를 돌려주고, `functions.ts:237-251`이 POST 없이 `status: "accepted",`를 돌려준다. 이번에 달라진 것은 fetch에 붙은 `signal: AbortSignal.timeout(30_000),`(`:261`·`:673`)뿐이다 — 시간초과가 `unknown`으로 가는 것은 맞는 쪽이다 |
| **B1** `modal deploy` 이미지 단계 실패 | **고쳐짐** | `apps/backend/card_news_app.py:19` `.env({...})`가 `:20` `.add_local_python_source("card_news")` 앞. 테스트 `apps/backend/test_card_news_wiring.py:51-57`이 「첫 `add_local_*` 뒤는 전부 `add_local_*`」를 단언(`"Modal disallows image build steps after local mounts"`). 운영 배포 성공 — 릴리스 기록 `:50` |
| **B2** 컨테이너 기동 `IndexError` | **바뀜(해소)** | `card_news_app.py:14-15` `CONTRACTS = (ROOT.parents[1] / "packages/db/contracts" if modal.is_local()` / `else Path("/root/card-news-contracts"))`. 테스트 `test_card_news_wiring.py:59-67`(`__file__`=`/root/card_news_app.py`, `is_local=False`) |
| **B3** 폰트 라이선스 해시 불일치 | **고쳐짐** | `.gitattributes:25-26` `apps/backend/card_news/assets/OFL.txt text eol=lf`. 작업 트리 `sha256` `1c05c68c…` = `dependency-manifest.json:28` `licenseSha256`. `git ls-files --eol` → `i/lf w/lf` |
| **B4** Gemini API 오류가 실패 콜백을 잃음 | **남음** | `card_news_app.py:190` `failure = getattr(error, "code", "cpu_job_failed")` → 웹 계약 `apps/web/src/fsd/entities/card-news/model/contract.ts:13-17` `const id = z` … `.regex(/^[A-Za-z0-9_-]+$/);`(`:297` `failureCode: id.nullable(),`)가 정수를 거부한다 → `card_news_app.py:197-198`(`except Exception:` · `pass`)가 삼킨다. `card_news/policy.py`에 `callback_failure_code`가 없다 |
| **C1** 플래그가 꺼져도 진입점이 보임 | **남음** | `apps/web/src/fsd/widgets/dashboard-header/ui/index.tsx:43-48`(데스크톱)·`:80-83`(드롭다운), `apps/web/src/fsd/pages/dashboard/ui/index.tsx:128-130`(탭) — 셋 다 조건 없이 `/dashboard/card-news`. 생성 버튼은 `apps/web/src/fsd/widgets/clip-display/ui/_component/ClipActions.tsx:105` `{cardNewsContext?.enabled && (`로 숨는다. **운영에서 지금 모든 사용자에게 보인다**(일반 flag `false`) |
| **C2** CPU 접수 POST가 함수 시간 한도를 넘음 | **바뀜(해소)** | `apps/web/src/app/api/inngest/route.ts:19` `export const maxDuration = 300;`(4859d2e). CPU 접수 `runtime-dependencies.ts:49` `AbortSignal.timeout(15_000)`·status `:65`·`video-runtime-dependencies.ts:27` `10_000`이 모두 한도 아래다. 옛 보정 14·15(8초)는 필요 없다 |
| **A2** 「Deletion completed」 상주, `take(20)` 뒤 kind 필터 | **남음**(목록) | `apps/web/src/fsd/entities/card-news/api/index.ts:325-334` `where: { userId },` — 완료 job과 orphan까지 최신 20건. 필터는 `take` 뒤 `apps/web/src/fsd/features/card-news/api/index.ts:338-339` `.filter((job) => ["set", "clip", "uploaded-file"].includes(job.kind))`. 패널 `apps/web/src/fsd/features/card-news/ui/asset-cleanup-status.tsx:52-53` `"Deletion completed"` |
| **A2'** 삭제 hook이 정리·카드뉴스 캐시를 무효화하지 않음 | **바뀜(해소)** | `apps/web/src/fsd/features/clip/model/use-delete-clip.ts:60-61` `queryClient.invalidateQueries({ queryKey: cardNewsKeys.user(userId) }),` / `queryClient.invalidateQueries({ queryKey: ["asset-cleanup", userId] }),`, `features/upload/model/use-delete-uploaded-file.ts:44-45` 같은 두 줄(ddef38c). 옛 보정 20~24(키 팩토리)는 위생으로만 남는다 — 이 계획에서 하지 않는다 |
| **B3'** 헤더 잔액이 일시 오류에 사라짐 | **남음** | `apps/web/src/fsd/features/credit-balance/ui/index.tsx:37` `if (query.isError \|\| !query.data) {` |
| **공개 문구** 「when enabled」 단서 없이 약속 | **남음** | `apps/web/src/fsd/pages/pricing/config/index.ts:13` `value: "1 credit per clip or card-news set",`·`:19` `value: "Video or carousel files",`·`:21`, `apps/web/src/app/(public-marketing)/pricing/page.tsx:16`, `apps/web/src/app/(public-marketing)/terms/page.tsx:89-91` |

### 옛 계획 대조 — 보정 35개

| 옛 # | 대상 | 판정 | 이 계획 # |
| --- | --- | --- | --- |
| 1 | `.gitattributes` | 고쳐짐(B3) | — |
| 2 | `card_news_app.py` | B1·B2 고쳐짐 / B4 남음 | 1 |
| 3 | `card_news/policy.py` | 남음(B4) | 2 |
| 4 | `test_card_news_wiring.py` | 층 순서·경로 테스트는 바뀜(기존 `:35-57`·`:59-67`) / 실패 코드 테스트는 남음 | 3 |
| 5·6·7 | `stored-clip-object` · 테스트 · `settle-processing-attempt.ts` | 남음(V1) | 4·5·6 |
| 8·9·10 | `recovery-settle-policy` · 테스트 · `reconcile-video-reservations.ts` | 남음(V3) | 7·8·9 |
| 11·12·13 | `claim-processing-attempt.ts` · `upload/server.ts` · `functions.ts` | 남음(V4) | 10·11·12 |
| 14·15 | CPU·status 타임아웃 8초 | 바뀜(해소, C2) — 하지 않는다 | — |
| 16·17 | `card-news/api/access.ts` · `server.ts` | 남음(C1) | 13·14 |
| 18 | `card-news/api/index.ts` | 남음(C1 판정 한 곳·A2 필터 이동) | 15 |
| 19 | `entities/card-news/api/index.ts` | 남음(A2) | 16 |
| 20·21·22 | `assetCleanupKeys` | 바뀜 — hook이 리터럴 키로 무효화한다. 하지 않는다 | — |
| 23·24 | 삭제 hook 무효화 | 고쳐짐(A2') | — |
| 25·26·27·28 | 헤더 · layout · 대시보드 탭 · page | 남음(C1) | 17·18·19·20 |
| 29 | `credit-balance/ui` | 남음(B3') | 21 |
| 30·30b·31 | 공개 문구 | 남음 | 22·23·24 |
| 32 | `apps/web/CLAUDE.md` 테스트 표 | 남음 — 표에 없는 테스트 파일이 12개로 늘었다 | 25 |
| 33 | `apps/backend/CLAUDE.md` 카드뉴스 절 | 남음(형태 바뀜: 상세는 `apps/backend/card_news/README.md`에 생겼고, CLAUDE.md에는 포인터가 없다) | 26 |
| 34 | 제안서 10-14 대조본으로 교체 | 고쳐짐 — 배포본(980줄, `bbd71dd5…`)이 10-14 대조본(974줄, `aa53bb66…`)을 포함한 상위본. 줄바꿈을 정규화한 diff는 머리말 1줄 + BLK-CN-03 2줄 + 「2026-10-20 후속 구현과 실제 검증」 절 추가뿐이다. **교체하면 후퇴한다** | — |
| 35 | `verify-card-news-video-compatibility.mts` | 남음(V1·V3 단언) | 27 |

집계: 결함 13건 중 고쳐짐 2 · 바뀜(해소) 3 · 남음 8(V1·V3·V4·B4·C1·A2 목록·B3'·공개 문구). 보정 36행(1~35 + 30b) 중 고쳐짐 4(1·23·24·34) · 바뀜 5(14·15·20·21·22) · 남음 27(그중 2·4는 일부만 남음).

### 옛 계획이 보지 못한 차이 — `01332b2..d836dc7` 리뷰

위험 순서대로 봤다(크레딧·정산 → 인가 → 실패 경로 → 화면).

- **크레딧·정산**: `features/upload/api` 아래 바뀐 것은 `record-legacy-producer-drain.ts`(트랜잭션 옵션만 — 잠금 순서·scope 대조·`--apply` 조건 무변경)와
  `index.ts`(import 줄 이동)뿐이다. 예약·차감·해제 경로(`claim`·`settle`·`reconcile`)는 `72bde11` 그대로다 — 옛 계획의 before 블록 세 개와
  diff 0줄(`settle :78-89`·`reconcile :43-67`·`claim :249-278`).
- **카드뉴스 유료 요청 멱등**: `createPaidCardNews`가 `analyticsContext`를 떼고 해시한다(`features/card-news/api/job-lifecycle.ts:133` `const { analyticsContext: rawContext, ...productPayload } = payload;` → `:135` `const requestHash = stableHash(productPayload);`). 분석 문맥이 달라도 같은 요청은 같은 해시다 — 맞다.
  분석 문맥은 `sanitizeCardNewsAnalyticsContext`(`features/card-news/model/analytics-context.ts`)를 거쳐서만 저장된다(`queueAnalytics`, `analytics.ts:65`). 컬럼 `analyticsContext Json?`(`packages/db/prisma/schema.prisma:341`)은 운영 마이그레이션에 이미 있다(`migration.sql:77`).
- **인가**: 업로드 상세 페이지가 `requireAuth()` → 실패 시 `redirect("/login")`을 먼저 한다(`apps/web/src/app/dashboard/uploads/[uploadedFileId]/page.tsx:15-16`). 강화이고 결함은 없다.
- **정리**: 부모 업로드가 없는 clip 정리를 허용한다(`features/card-news/api/cleanup.ts:406-407` `(typeof scope.uploadedFileId !== "string" &&` / `!(job.kind === "clip" && scope.uploadedFileId === null))`). 그 경우 사용자 잠금만 잡고 clip 잠금은 전부 개별로 잡는다. 옛 계획 후속 후보 「`Clip.uploadedFileId` null 클립의 정리 스코프」가 해소됐다.
- **cron 본문**(4859d2e — 스케줄은 BUG-19 범위): 세 cron이 헬퍼(`dispatchPendingCardNewsJobs`·`recoverCardNewsJobs`·`cleanupPendingCardNewsAssets`)를 한 step에서 부르던 것을, 목록 step 1개 + **작업별 step**으로 바꿨다(`inngest/card-news-functions.ts:110-155`). 이유는 한 step이 최대 100건을 순차로 처리하다 요청 한도를 넘어 504가 난 것이다(릴리스 기록 `:62`). 의미는 헬퍼와 같다 — 같은 목록 함수, 같은 작업 함수. 다른 점 둘: `cardNewsRuntime().now()` 대신 `new Date()`(운영에서는 같은 값), 배차 직후의 `flushCardNewsAnalytics(job.id)`가 analytics 목록 순회로 옮겨진 것. 헬퍼 셋은 이제 테스트(`card-news-functions.test.mjs:40-46`)와 `verify-card-news-surfaces.mts:22-24`에서만 불린다.
- **새로 찾은 것 — N1(낮음, 문서↔코드)**: `docs/video-cutover-gates.md:5` 「닫힌 gate에서 새 claim은 실패로 반환되어 기존 retry 규칙이 적용되며」. 그런데 `7a91665`의 충돌 해소 뒤 코드는 `not_claimable` → `{ skipped: true }`(`functions.ts:217-219`)로, 재시도 없이 런을 끝낸다. 그 사이 `queued`로 남은 업로드는 사용자가 대시보드를 방문할 때 stale 규칙(`reconcile-stale-processing.ts:208` `reconcileStaleUploadedFilesForUser`)이 실패로 바꾼다. 테스트도 skip을 단언한다(`inngest/processing-admission.test.mjs:55` `assert.equal(closed.skipped, true);`). admission을 먼저 닫는 런북 순서(`card-news-runbook.md:91`)에서는 해가 없다 — 후속 후보로 넘긴다.
- **새로 찾은 것 — N2(BUG-19에 영향)**: BUG-19 백로그 요구 ①은 「처리 본체는 기존 헬퍼를 그대로 부른다」이다. 그런데 배포본의 cron은 위처럼 헬퍼를 부르지 않는다. 헬퍼를 한 step에서 부르면 4859d2e가 고친 「배치 전체가 한 요청 예산을 공유」가 돌아온다. 이 계획에서는 고치지 않는다(「범위 밖 의존」 2).
- **화면**: CN001(종료된 업로드 화면의 카드 생성이 live 잔액을 씀 — `pages/upload-detail/ui/index.tsx:214` `creditBalance: liveCreditBalance,`), CN003~005(편집 충돌·해시태그·canonical 저장), 업로드 폼 서식 정리. 크레딧 판정은 서버 쪽(`createPaidCardNews`의 예약)이 하고, 화면 값은 표시용이다. 결함은 찾지 못했다 — DOM 검사는 「못 덮는 범위」.

## 문제

재범위 요구 ①이 지목한 것은 「계획 검증 없이 배포된 구현을 사후에 인수한다」이다. 위 「현재 동작」으로 다시 세우면:

1. 옛 계획이 찾은 결함 13건 중 5건은 배포본에서 해소됐다. **8건은 그대로 운영에 있다.** 그중 V1·V3·V4는 영상 게이트가 열리는 순간
   기존 영상 기능을 깬다. V1은 과금 0과 클립 삭제를 부른다. C1·B3'·공개 문구는 **지금 모든 사용자에게** 보인다.
2. 운영 영상 게이트는 마지막 기록상 닫혀 있다. 열어도 된다는 조건(V1·V3·V4 해소)은 아직 충족되지 않았다.
3. 운영 실물 확인 중 문서에 남지 않은 것이 있다 — PR #136 배포 결과, legacy receipt `--apply`(로컬 로그에만 있음), 멈춘 무료 렌더 job의 복구, 현재 게이트 값.

백로그와 어긋나는 점: 백로그 재범위는 「남은 결함은 이 항목에서 고칠지 백로그로 나눌지 계획에서 정한다」였다. 이 계획은 **남은 8건을 전부 여기서 고친다** —
판단 근거는 「대안」 2. 새로 찾은 N1은 후속 후보로, N2는 BUG-19 쪽 의존으로 넘긴다.

## 고칠 파일

아래 행 전부. 이 밖은 고치지 않는다. 특히 `inngest/card-news-functions.ts`·`inngest/video-reservation-functions.ts`·`app/api/inngest/route.ts`(BUG-19)와
`packages/db/**`는 건드리지 않는다.

| # | 파일 | 변경 | 결함 |
| --- | --- | --- | --- |
| 1 | `apps/backend/card_news_app.py` | 실패 코드를 `callback_failure_code`로 | B4 |
| 2 | `apps/backend/card_news/policy.py` | `callback_failure_code` 순수 함수 추가(stdlib) | B4 |
| 3 | `apps/backend/test_card_news_wiring.py` | import·orchestration namespace 주입·실패 코드 테스트 1건 | B4 |
| 4 | `apps/web/src/fsd/features/upload/model/stored-clip-object.ts` `(신규)` | 정산 대상 클립 객체 판정 순수 함수 | V1 |
| 5 | `apps/web/src/fsd/features/upload/model/stored-clip-object.test.mjs` `(신규)` | 위 테스트 | V1 |
| 6 | `apps/web/src/fsd/features/upload/api/settle-processing-attempt.ts` | HEAD 판정을 4번으로 교체 | V1 |
| 7 | `apps/web/src/fsd/features/upload/model/recovery-settle-policy.ts` `(신규)` | 복구 정산 허용 판정·종료 시각 추출 순수 함수 | V3 |
| 8 | `apps/web/src/fsd/features/upload/model/recovery-settle-policy.test.mjs` `(신규)` | 위 테스트 | V3 |
| 9 | `apps/web/src/fsd/features/upload/api/reconcile-video-reservations.ts` | 7번으로 유예 적용 | V3 |
| 10 | `apps/web/src/fsd/features/upload/api/claim-processing-attempt.ts` | `resetRejectedProcessingSpawn` 추가(공통 헬퍼로 `markProcessingSpawnUnknown`과 묶음) | V4 |
| 11 | `apps/web/src/fsd/features/upload/server.ts` | 10번 재수출 | V4 |
| 12 | `apps/web/src/inngest/functions.ts` | HTTP 거절과 모호한 실패를 구분해 spawn 상태 기록(auto·analyze 두 곳) | V4 |
| 13 | `apps/web/src/fsd/features/card-news/api/access.ts` `(신규)` | `canUserAccessCardNews(userId)` — 생성 버튼과 같은 판정 | C1 |
| 14 | `apps/web/src/fsd/features/card-news/server.ts` | 13번 재수출 | C1 |
| 15 | `apps/web/src/fsd/features/card-news/api/index.ts` | `getCardNewsCreationContext`가 13번을 쓰게, kind 필터 제거(16번으로 이동) | C1·A2 |
| 16 | `apps/web/src/fsd/entities/card-news/api/index.ts` | `listUserAssetCleanupJobs`가 사용자용 kind·미완료만 조회 | A2 |
| 17 | `apps/web/src/fsd/widgets/dashboard-header/ui/index.tsx` | `showCardNews` prop으로 링크 둘 가림 | C1 |
| 18 | `apps/web/src/app/dashboard/layout.tsx` | `showCardNews` 전달 | C1 |
| 19 | `apps/web/src/fsd/pages/dashboard/ui/index.tsx` | `showCardNews` prop으로 탭 링크 가림 | C1 |
| 20 | `apps/web/src/app/dashboard/page.tsx` | `showCardNews` 전달 | C1 |
| 21 | `apps/web/src/fsd/features/credit-balance/ui/index.tsx` | data가 있으면 오류여도 잔액 표시 | B3' |
| 22 | `apps/web/src/fsd/pages/pricing/config/index.ts` | 헤드라인 2개를 카드뉴스 이전 문구로, 설명 1개에 「When enabled for your account」 | 문구 |
| 23 | `apps/web/src/app/(public-marketing)/pricing/page.tsx` | openGraph 설명에 같은 단서 | 문구 |
| 24 | `apps/web/src/app/(public-marketing)/terms/page.tsx` | §3 카드뉴스 가격 불릿에 같은 단서 | 문구 |
| 25 | `apps/web/CLAUDE.md` | 테스트 표 — 수치, 새 행 14개 | 문서 |
| 26 | `apps/backend/CLAUDE.md` | 카드뉴스 CPU 앱 절(별도 앱·secret·`/status` 결합·배포 명령, 상세는 README로) | 문서 |
| 27 | `apps/web/scripts/verify-card-news-video-compatibility.mts` | 가짜 클립 기본 Content-Type을 S3 기본값으로, `ended` 즉시 정산 단언을 유예 단언으로 | V1·V3 |

## 구현 스케치

옛 계획(`1c819fd`)에서 클린 패스를 받은 스케치를 재사용한다. before 쪽은 모두 현재 dev에서 다시 읽었다. 옛 계획과 줄이 다른 곳은 적어 둔다.

### 순서

1. 1~27번을 한 커밋으로. 병합·CRLF 정리 단계는 없다(이미 배포본).
2. 「테스트」의 게이트 전부.
3. 배포와 운영 확인은 「범위 밖 의존」 1의 순서대로. 단계마다 소유자 승인을 받는다.

### 1) `apps/backend/card_news_app.py`

```python
# before (:42)
    from card_news.policy import model_timeout_ms
# after
    from card_news.policy import callback_failure_code, model_timeout_ms
```

```python
# before (:190)
        failure = getattr(error, "code", "cpu_job_failed")
# after
        failure = callback_failure_code(error)
```

(`:191-193` `LayoutError` 접미사는 그대로 둔다. `LayoutError.code`는 문자열이라(`card_news/layout.py:7-9`) 기존 코드 값이 바뀌지 않는다. 옛 계획 `:40`·`:187` → 지금 `:42`·`:190`.)

### 2) `apps/backend/card_news/policy.py`

```python
# before (:2-3)
from datetime import datetime
import time
# after
from datetime import datetime
import re
import time
```

끝에 추가:

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

### 3) `apps/backend/test_card_news_wiring.py`

```python
# before (:15)
from card_news.policy import Deadline, model_timeout_ms, timestamp
# after
from card_news.policy import Deadline, callback_failure_code, model_timeout_ms, timestamp
```

`test_actual_orchestration_stages_repair_budget_and_free_render`는 `process_card_news` 본문을 `namespace` dict로 이름을 주입해 실행한다.
새 이름을 넣지 않으면 실패 분기 시나리오가 `NameError`로 죽는다(옛 계획 검증 라운드 1 실측):

```python
# before (:194)
                    "Deadline": Deadline, "timestamp": timestamp, "model_timeout_ms": model_timeout_ms,
# after
                    "Deadline": Deadline, "timestamp": timestamp, "model_timeout_ms": model_timeout_ms,
                    "callback_failure_code": callback_failure_code,
```

`CardNewsWiringTests`에 추가(옛 계획의 층 순서·컨테이너 경로 테스트 둘은 기존 `:35-57`·`:59-67`이 덮으므로 넣지 않는다):

```python
    def test_callback_failure_code_accepts_only_contract_ids(self):
        self.assertEqual(callback_failure_code(ContractError("source_too_short")), "source_too_short")
        self.assertEqual(callback_failure_code(LayoutError("cards.1.title", "unsupported_glyph")), "unsupported_glyph")
        for bad in (429, None, "", "bad code", "x" * 161):
            self.assertEqual(callback_failure_code(SimpleNamespace(code=bad)), "cpu_job_failed", bad)
        self.assertEqual(callback_failure_code(RuntimeError("no code")), "cpu_job_failed")
```

(`ContractError`·`LayoutError`·`SimpleNamespace`는 이미 import돼 있다 — `:11`·`:13`·`:14`.)

### 4) `apps/web/src/fsd/features/upload/model/stored-clip-object.ts` (신규)

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

### 6) `settle-processing-attempt.ts`

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

임포트는 `:30` `import { videoProcessingRuntime } from "./video-runtime-dependencies";` 다음 줄에 `import { isStoredClipObject } from "../model/stored-clip-object";`.

### 7) `apps/web/src/fsd/features/upload/model/recovery-settle-policy.ts` (신규)

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

(`confirmedAt`은 legacy receipt 증거가 쓰는 필드다 — `record-legacy-producer-drain.ts:131` `confirmedAt: receipt.confirmedAt,`. 운영의 기존 dispatch 43건은 이 증거를 가지므로 오래전 종료로 읽혀 유예와 무관하다.)

### 9) `reconcile-video-reservations.ts`

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

임포트는 `:13` `import { settleProcessingAttempt } from "./settle-processing-attempt";` 다음에:

```ts
import {
  canRecoverySettleVideoAttempt,
  producerEndObservedAt,
} from "../model/recovery-settle-policy";
```

(`:68` `if (dispatch.uploadedFile.status !== "processing") return;` 이하는 바꾸지 않는다. 처음 관측한 틱은 `producerEndedAt = now`라
유예 안에 있다. 기록된 증거의 `observedAt` 기준으로 5분 뒤 틱이 정산한다 — 그 「뒤 틱」을 누가 깨우는지는 BUG-19의 몫이다(「범위 밖 의존」 2).)

### 10) `claim-processing-attempt.ts`

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

### 11) `features/upload/server.ts`

```ts
// before (:13)
  markProcessingSpawnUnknown,
// after
  markProcessingSpawnUnknown,
  resetRejectedProcessingSpawn,
```

### 12) `inngest/functions.ts`

```ts
// before (:10)
  markProcessingSpawnUnknown,
// after
  markProcessingSpawnUnknown,
  resetRejectedProcessingSpawn,
```

모듈 스코프 — `:57` `type ProcessingSkipReason = "already_processing" | "attempt_no_longer_active";` 바로 위에:

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

(`response.json()`의 파싱 실패와 `AbortSignal.timeout(30_000)`(`:261`·`:673`)의 시간초과는 `ModalDispatchRejectedError`가 아니라 `unknown` 쪽이다 —
2xx로 받았거나 응답 전에 끊겼으면 spawn됐을 수 있다.)

### 13) `apps/web/src/fsd/features/card-news/api/access.ts` (신규)

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

(`canAcceptCardNews(settings, userId)` 시그니처는 `apps/web/src/fsd/shared/config/card-news.ts:49-52` 그대로.)

### 14) `features/card-news/server.ts` — 끝에 추가

```ts
export { canUserAccessCardNews } from "./api/access";
```

### 15) `features/card-news/api/index.ts`

```ts
// before (:21-22)
import { env } from "~/env";
import { canAcceptCardNews } from "~/fsd/shared/config/card-news";
// after
import { canUserAccessCardNews } from "./access";
```

```ts
// before (:318-328)
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

(이 파일에서 `env.`·`canAcceptCardNews`가 나오는 곳은 임포트 `:21`·`:22`와 `:318-328`뿐이다 — `grep -n "\benv\.\|canAcceptCardNews"` 전수. 옛 계획 `:310-320` → 지금 `:318-328`.)

```ts
// before (:338-346)
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

### 16) `entities/card-news/api/index.ts`

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

(호출처는 `features/card-news/api/index.ts:338` 하나뿐이다 — `grep -rn listUserAssetCleanupJobs apps/web/src` 전수. 완료되면 목록에서 빠진다. 패널은
`asset-cleanup-status.tsx:33` `if (!query.data?.length && !query.error) return null;`로 빈 목록이면 사라진다. polling은 `:18-22`(미완료가 있을 때만 5초)이라
마지막 job이 끝난 다음 조회에서 멈춘다. `:52-53`의 「Deletion completed」 분기는 도달하지 않게 되지만 지우지 않는다.)

### 17)·18) 헤더

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
// before (app/dashboard/layout.tsx:4)
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

### 19)·20) 대시보드 탭

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

### 21) `credit-balance/ui/index.tsx`

```tsx
// before (:37)
  if (query.isError || !query.data) {
// after
  // TanStack keeps the last data when a refetch fails; show it instead of hiding a valid balance.
  if (!query.data) {
```

### 22)·23)·24) 공개 문구 (사용자에게 보이는 영어 그대로)

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

(헤드라인 둘의 after는 카드뉴스 이전 원문이다 — `git show b2b5504:apps/web/src/fsd/pages/pricing/config/index.ts`의 같은 자리 `value: "1 credit per clip",`·`value: "Vertical mp4 + captions",`. `:49`는 이미 「Card news, when enabled for your account」라 바꾸지 않는다.)

```tsx
// before (pricing/page.tsx:16)
      "3-credit trial with shared available and reserved balances for video clips and complete card-news sets.",
// after
      "3-credit trial with shared available and reserved balances for video clips and, when enabled, complete card-news sets.",
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

### 25) `apps/web/CLAUDE.md` 테스트 표

- 수치 줄 `:69` `현재 32개 파일, 56 suite, 227개 테스트.` → 구현 후 실측값. 지금 44개 파일·56 suite·359개이고, 신규 둘로 46개 파일이 된다. 숫자는 `npm test` 출력에서 옮긴다.
- 행 추가 14개. 지금 표에 없는 12개(`src` 아래 `*.test.mjs` 44개와 표의 경로를 대조한 결과)와 신규 2개다:
  `entities/card-news/model/contract.test.mjs` · `revision-policy.test.mjs` · `text-length.test.mjs` ·
  `entities/credit-reservation/model/reservation-policy.test.mjs` · `entities/user/model/credit-balance.test.mjs` ·
  `features/card-news/model/editor-schema.test.mjs` · `features/card-news/model/analytics-context.test.mjs` · `shared/api/s3-policy.test.mjs` ·
  `shared/config/card-news.test.mjs` · `inngest/card-news-contract.test.mjs` · `inngest/card-news-functions.test.mjs` · `inngest/processing-admission.test.mjs` ·
  `features/upload/model/stored-clip-object.test.mjs` · `features/upload/model/recovery-settle-policy.test.mjs`.
  각 행은 그 파일의 `describe`/`test` 이름을 읽고 「무엇을 지키는가」를 한두 문장으로 쓴다(기존 행 형식). 마지막 둘은 V1(`binary/octet-stream`
  포함이 요점)과 V3(유예 경계 5분 정확값이 요점)를 적는다.

### 26) `apps/backend/CLAUDE.md` — 끝에 절 추가

```markdown
## Card-news CPU app (FEAT-63)

`card_news_app.py` is a **separate Modal app** (`apch-card-news`, CPU only) with its own `requirements-card-news.txt`; it never imports `main.py`. Deploy from `apps/backend` with `PYTHONUTF8=1 modal deploy card_news_app.py` (same cp949 crash as the GPU app). It reads `ai-podcast-clipper-secret` (Gemini, AWS) plus its own `apch-card-news-auth` (card-news bearer secrets); it never overwrites the GPU secret. Details, pinned dependencies and image qualification live in `card_news/README.md`.

- Its `/status` endpoint is also the **video** producer-termination lookup: video deletions and global recovery in the web app wait on it (`CARD_NEWS_ENDPOINT` in the web env). Keep it deployed even while card news is disabled.
- Image build steps (`.env`, `pip_install…`) must come **before** every `add_local_*` call — Modal raises `InvalidError` only at deploy time. `test_card_news_wiring.py` checks the order.
- `card_news/assets/OFL.txt` is hashed at runtime against `dependency-manifest.json`; `.gitattributes` pins it to LF because this repo checks out with `core.autocrlf=true`.
- A failed callback's `failureCode` must match the web contract `^[A-Za-z0-9_-]{1,160}$`; `card_news.policy.callback_failure_code` maps SDK errors (integer HTTP codes) to `cpu_job_failed`.
```

(secret 이름의 근거는 `apps/backend/card_news/README.md:9`과 `card_news_app.py:25-26`.)

### 27) `apps/web/scripts/verify-card-news-video-compatibility.mts`

이 검사는 「`ended`를 처음 본 틱에 곧바로 정산」을 단언한다(`:543-545`). V3이 고치는 바로 그 동작이라, 보정만 적용하면 실패한다(옛 계획 검증 라운드 1 실측 `0 !== 1`).

```ts
// before (:143)
  function object(key: string, contentLength = 100, contentType = "video/mp4") {
// after
  // GPU upload_file sends no ContentType, so real clip objects carry S3's
  // default; the settlement must accept it (FEAT-63).
  function object(
    key: string,
    contentLength = 100,
    contentType = "binary/octet-stream",
  ) {
```

```ts
// before (:543-553)
  producerStatus = "ended";
  assert.equal((await video.reconcileVideoReservations()).settled, 1);
  await balance(confirmed.userId, 1, 0);
  assert.equal(
    (
      await runtime.db.processingDispatch.findUniqueOrThrow({
        where: { id: confirmed.dispatch.id },
      })
    ).modalSpawnState,
    "ended",
  );
// after
  producerStatus = "ended";
  // The first observation only records the end; the webhook's own settlement
  // gets PRODUCER_END_SETTLE_GRACE_MS before recovery takes over (FEAT-63).
  assert.equal((await video.reconcileVideoReservations()).settled, 0);
  await balance(confirmed.userId, 1, 1);
  assert.equal(
    (
      await runtime.db.processingDispatch.findUniqueOrThrow({
        where: { id: confirmed.dispatch.id },
      })
    ).modalSpawnState,
    "ended",
  );
  now = new Date(now.getTime() + 5 * 60_000);
  assert.equal((await video.reconcileVideoReservations()).settled, 1);
  await balance(confirmed.userId, 1, 0);
```

(`reconcileVideoReservations`를 부르는 곳은 이 파일의 `:519`·`:544` 둘이다. `:519`는 마감 경과(`:518` `now = new Date(now.getTime() + 66 * 60_000);`)라 유예와 무관하다.
`confirmed`는 그 뒤 `:533-542`에서 새로 claim하므로 마감이 65분 남는다. 시계는 `:60` `let now = new Date();` / `:65` `now: () => now,`. 타입을 넘기는
`object(...)` 호출은 `:194` `"text/plain"`(거부 시험) 하나뿐이다.)

## 테스트

**덮는 것** (구현 후 전부 실행. EXIT 0·실패 0이어야 한다)

- web: `npm run check -w apps/web` · `npm test -w apps/web`(359 + 신규 두 파일) · `npm run build -w apps/web`
- admin: `npm run check -w apps/admin` · `npm test -w apps/admin` · `npm run verify:fsd:final -w apps/admin` — admin 코드는 바뀌지 않는다. 공유 패키지 회귀 대조용이다
- backend: `python -m unittest discover -s apps/backend -p "test_*.py"`(162 + 1, `Ran N tests`의 N을 눈으로 확인) · `py_compile` `main.py`·`card_news_app.py`
- 실 PostgreSQL 통합 CLI 3종 — `apps/web`에서 `DATABASE_URL`·`DATABASE_URL_UNPOOLED`를 뺀 환경으로
  `CARD_NEWS_TEST_POSTGRES_BIN=C:/Users/hamso/AppData/Local/Temp/apch-card-news-postgres-20261020/pgsql/bin node --conditions=react-server --import tsx scripts/verify-card-news-local-db.mts`
  (러너가 두 변수를 스스로 지우기도 한다 — `verify-card-news-local-db.mts:35-36`). 보정 뒤 27번 단언으로 V1·V3을 실 DB로 덮는다. 바이너리가 지워졌으면 런북 `docs/card-news-runbook.md:45`대로 PostgreSQL 16 ZIP을 다시 받는다
- `node --import tsx --test scripts/card-news-client-regressions.test.mjs`(6) · `node --conditions=react-server --import tsx scripts/verify-card-news-surfaces.mts`
- `stored-clip-object.test.mjs`: 참 — `video/mp4` · **`binary/octet-stream`** · `application/octet-stream`, `video/mp4; codecs=avc1` 매개변수,
  `video/mp4 ; codecs=avc1`(세미콜론 앞 공백 — 없으면 `trim` 제거 돌연변이가 생존한다, 옛 계획 검증 실측), `Video/MP4` 대소문자. 거짓 — `text/html` · 빈 문자열 · `contentLength` 0
- `recovery-settle-policy.test.mjs`: 참 — 마감 경과(`deadlineAt <= now`, 같은 시각 포함). 거짓 — 마감 전 + 종료 없음, 방금 종료(0ms), 4:59.999.
  **정확히 5:00은 참**. 마감 null + 오래된 종료는 참. **마감 null + 종료 없음, 마감 null + 방금 종료는 거짓**(마이그레이션 전 dispatch는 `deadlineAt`이 null이다 —
  이 둘이 없으면 「null = 마감 경과」 돌연변이가 생존한다). `producerEndObservedAt`: `observedAt` · `confirmedAt` · 둘 다면 `observedAt` · 잘못된 날짜 문자열 · `null` · 비객체 → epoch
- backend 신규 1건: 실패 코드 — 문자열 계약 id는 통과, 정수 429·`None`·빈 문자열·공백 포함·161자·코드 없음은 `cpu_job_failed`

**못 덮는 범위** — 배포 확인 원장(`docs/release-checks.md`) 등재 대상

- **운영 영상 게이트 값**과, 게이트를 연 뒤 첫 영상: 정산된 클립 수 = 생성 수(V1의 전제 — 실제 S3 HEAD의 ContentType), 제목·설명 존재(V3), 24시간 뒤 클립이 남아 있는지(V1의 orphan 정리)
- V3 유예의 실효: 웹훅이 정산한 영상에 메타데이터가 붙는지, analyze가 `review_pending`으로 가는지
- V4: Modal 거절 응답 뒤 step 재시도가 실제로 다시 POST하는지는 Inngest 실행 기록으로만 보인다. DB CLI는 `resetRejectedProcessingSpawn` 경로를 부르지 않는다 — 함수 본문은 `markProcessingSpawnUnknown`과 잠금·조건이 같고 목표 상태만 다르다
- B4: 실제 Gemini 오류가 실패 콜백으로 도착하는지 — CPU 앱 재배포 뒤에만 보인다
- 화면(C1·A2·B3'·문구): 러너에 DOM이 없다. 계획 검증의 실물 렌더(카탈로그 경로 8)와 배포 뒤 화면 확인으로 본다. 렌더 확인 방법은 옛 계획 「테스트」의
  `renderToStaticMarkup` 하니스를 따른다(`git show 1c819fd:docs/plans/FEAT-63.md`의 「못 덮는 범위」 화면 항목). 다른 점은 하나다 — 병합 후 사본이 필요 없으므로
  **현재 dev 트리의 사본**(`git worktree add --detach <스크래치패드>/… dev` 뒤 보정 블록 적용, 또는 `git archive` 추출본)에서 렌더한다.
  기대: 헤더 `showCardNews=false` → `href="/dashboard/card-news"` 0개, `true` → 1개(드롭다운은 닫힌 상태라 SSR 마크업에 없다 — 그 분기는 tsc·코드로만).
  잔액 배지 「갱신 실패 + 이전 data」 → 보정 전 `Balance unavailable`, 보정 후 `3 available · 2 reserved`(owned 5·reserved 2)
- **실물 재생 재현**(V1·B4의 근거 — 옛 계획 「테스트」의 boto3 가짜 S3 캡처 스크립트와 google-genai 1.49.0 wheel 확인을 그대로 쓴다. 네트워크는 PyPI 다운로드뿐이고 운영과 무관하다)
- PR #136(`maxDuration = 300`) 배포의 READY와 Inngest sync, 멈췄던 무료 v2 렌더 job의 종결 — BUG-19 배포 전까지 cron이 일시정지라 자동 복구되지 않는다

## 범위 밖 의존

**배포와 운영 확인은 이 계획의 승인 밖이다.** 게이트②가 여는 것은 1~27번 커밋과 로컬 검증까지다. 아래는 그 뒤에 막히는 지점과 순서다. 단계마다 소유자 승인을 따로 받는다.

1. **운영 확인과 배포 순서**
   1. **현재 영상 게이트 값 확인(소유자)** — Vercel 프로젝트 `apc-h` → Settings → Environment Variables의 Production 값, 또는 운영 `/dashboard`에서
      업로드를 시도해 `Video generation is temporarily unavailable`이 뜨는지 본다. **열려 있으면** V1이 지금 운영에서 일어나고 있다. 그때는 게이트를 닫는 것부터
      소유자가 정한다. 그 사이 정산된 영상의 클립은 orphan 정리가 24시간 뒤 지운다. 다만 정리 cron이 2026-10-21부터 일시정지라 아직 지워지지 않았을 수 있다.
   2. **운영 DB 읽기(SELECT만)** — 이전 세션의 자동 모드가 운영 데이터 읽기를 거부한 적이 있다(2026-10-19). 소유자가 `!` 명령으로 실행하거나 권한을 준다.
      확인할 것: legacy receipt 적용(`ProcessingDispatch`에서 `producerEndEvidence->>'kind' = 'legacy-drain'`인 행이 43개 — 로컬 로그 `applied:true`의 대조),
      `UploadedFile.status IN ('pending_enqueue','queued','processing')` 행 수, 활성 `CardNewsJob`(멈춘 무료 렌더), `AssetCleanupJob` 미완료 행 수.
      `migrate status`로 미적용 0도 확인한다(`packages/db`에서 `node --env-file=../../.env ../../node_modules/prisma/build/index.js migrate status` — FEAT-47 실측 형태).
   3. **web 배포** — 이 항목 커밋을 main에 합류한다(PR). Vercel이 배포한다.
   4. **CPU 앱 재배포(B4)** — `apps/backend`에서 `PYTHONUTF8=1 modal deploy card_news_app.py`. 메모리 「배포 직후 Modal 탐침」대로 컨테이너를 확인한 뒤 탐침한다.
   5. **영상 게이트 열기** — Vercel Production env `VIDEO_GENERATION_ADMISSION_ENABLED=true`·`VIDEO_WORKER_START_ENABLED=true` → 재배포. 전제는 3이 READY이고
      2의 legacy receipt가 확인된 것이다(receipt 없이는 기존 영상 43건의 삭제 정리가 영구 보류된다 — `cleanup.ts`의 producer 종료 대기).
      실사용자가 0이면 런북 6단계(`card-news-runbook.md:95`)의 「영상 검증 사용자」는 소유자 계정 하나로 갈음한다.
   6. **확인** — 짧은 영상 1개로 클립 수 = 정산 크레딧(V1), 제목·설명 존재(V3)를 본다. 영상 하나를 삭제하면 정리 패널이 사라져야 한다(A2).
      그다음 allowlist의 소유자 계정으로 카드뉴스 1세트를 만든다(B4는 실패 유도가 어려우므로 원장에 남긴다).
      정리·복구가 실제로 도는 것은 cron(현재 일시정지)이나 BUG-19의 대체가 있어야 보인다.
2. **BUG-19(web-dev, 계획 중)와의 결합**
   - 이 계획은 `inngest/card-news-functions.ts`·`inngest/video-reservation-functions.ts`·`app/api/inngest/route.ts`를 고치지 않는다. 두 항목이 함께
     고치는 파일은 없다. 다만 9번(`reconcile-video-reservations.ts`)은 BUG-19가 부를 함수의 본문이다.
   - **V3 유예가 새 기한을 만든다**: producer `ended` 관측 시각 + `PRODUCER_END_SETTLE_GRACE_MS`(5분). BUG-19의 다음 기한 계산이 영상 후보에 `deadlineAt`만 쓰면,
     웹훅 정산이 실패한 영상은 마감(claim + 65분, `claim-processing-attempt.ts:151`)까지 정산되지 않는다. 틀리지는 않고 늦을 뿐이다. BUG-19 계획에
     이 기한을 넣을지는 그 계획이 정한다 — 이 계획은 상수를 export한다.
   - **N2**: BUG-19 백로그 요구 ①의 「기존 헬퍼를 그대로 부른다」는 배포본과 맞지 않는다. 배포본 cron은 작업별 step이다(4859d2e, `card-news-functions.ts:110-155`).
     헬퍼를 한 step에서 부르면 504가 돌아온다(릴리스 기록 `:62`). BUG-19 계획 검증 때 메인 루프가 대조할 사항이다.
   - 구현 순서: 둘 다 `apps/web`을 고치므로 web-dev 규칙(구현은 하나씩)과 같은 이유로 **한 번에 하나**만 구현한다. 먼저 끝난 쪽 위에서 다른 쪽이 게이트를 다시 돌린다.
3. **`packages/db`** — 이 계획은 스키마·마이그레이션을 바꾸지 않는다.

**후속 후보 (백로그 제시용, 이 계획에서 고치지 않음)** — 옛 계획 목록을 배포본에 다시 대조한 결과다.

- N1 `docs/video-cutover-gates.md:5`의 「닫힌 worker gate → 실패·retry」 서술이 코드(`skipped`)와 다르다 — 문서 정정 또는 검증된 동작으로 서술 교체
- `dispatchCardNewsJob`의 `nextDispatchAt` +60초(`job-lifecycle.ts:356-358`·`:373-375`)와 `listRecoverableCardNewsJobs`의 `nextDispatchAt <= now` 조건 — 런이 살아 있어도 heartbeat가 90초 넘게 끊기면 매분 재배차한다. BUG-19의 기한 계산과 함께 볼 것
- 정리 재시도 60초 고정(`cleanup.ts:492`) — BUG-19 요구 ⑥이 이미 다룬다
- 정산 HEAD 예외의 키별 처리(`settle-processing-attempt.ts:78-89` — 키 하나의 HEAD 실패가 `Promise.all` 전체를 던진다)
- 예약도 스냅샷도 없는 legacy processing 행의 자동 종료 · 죽은 코드 `decrementUserCreditsFloorZero`(`entities/user/api/index.ts:217` — 재수출 `entities/user/server.ts:5` 말고는 런타임 호출처 0, `verify-card-news-surfaces.mts:91-93`은 `functions.ts`에 없음을 단언할 뿐)
- 삭제 실패 원문 노출 · 토스트 「Asset cleanup」 용어 · 삭제 다이얼로그의 카드뉴스 문구(플래그 무관 노출) · 카드뉴스 목록 빈 문구 · 중첩 `<main>`·내부 코드 노출
- `executionEpoch` 고정값 대 문서의 「epoch fencing」 · Python/JS 공백 분할 차이 · callback URL 호스트 허용 목록 · `/status` 인증의 비ASCII 헤더 500
- (해소되어 목록에서 뺀 것: BLK-CN-03 수정 필드 계측·analytics context — ddef38c `countEditedCardNewsFields`·`sanitizeCardNewsAnalyticsContext`.
  `Clip.uploadedFileId` null 정리 스코프 — `cleanup.ts:406-407`. 카드뉴스 복구 cron의 job별 격리 — 4859d2e가 작업별 step으로 나눴다)

## 대안

1. **되돌리기(revert)** — 소유자가 기각했다(재범위 「되돌리지 않는다」). 운영 DB에 additive 마이그레이션이 적용됐고 예약 과금이 전제가 됐다. 런북도
   역마이그레이션 대신 보존을 정한다(`card-news-runbook.md:118`).
2. **남은 결함을 백로그로 나누고 배포본을 그대로 인수** — 기각. V1·V3·V4는 영상 게이트를 여는 조건이라 이 항목이 끝나도 영상 생성을 재개할 수 없다.
   C1·B3'·문구는 지금 모든 사용자에게 보인다. 8건 모두 클린 패스를 받은 스케치가 있어 다시 설계할 것이 없다. 나누면 같은 검증을 항목마다 반복한다.
3. **옛 계획의 보정 35개를 그대로 적용** — 기각. B1·B2·B3·C2·A2'·제안서는 배포본이 이미 고쳤다. 다시 적용하면 B2(`modal.is_local()`)와 충돌하고,
   C2의 8초 타임아웃은 `maxDuration = 300`에서 필요 없다. 제안서 교체는 10-20 기록을 지워 후퇴한다.
4. **V3을 「analyze는 마감으로만 실패」로 좁히기** — 옛 계획과 같은 이유로 기각. 영상 메타데이터 소실도 같은 틈에서 생기므로 종류를 가리지 않는 유예 하나가 더 단순하다.
5. **영상 게이트 기본값을 `true`로** — 기각. 게이트는 운영 env로 명시해 관리하고(`docs/video-cutover-gates.md:7` 「운영 전환 후 … 두 설정을 명시적으로 관리해야 한다」),
   legacy drain writer는 게이트가 닫혀 있기를 요구한다(`record-legacy-producer-drain.ts:58-59`). 대신 「범위 밖 의존」 1-5에 여는 조건과 순서를 못 박는다.
