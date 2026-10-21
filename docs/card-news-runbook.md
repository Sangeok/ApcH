# 카드뉴스 구현·검증·운영 전환

구현 근거는 [제안서](proposals/active/instagram-card-news-generation.md)다. 완성된 숏폼 1개에서 카드뉴스 1세트를 만들며, 최초 생성·AI 재생성은 각각 1크레딧이다. 수동 편집·이미지 재렌더링·다운로드는 무료다. Instagram 게시에는 사용자가 JPG와 게시글을 직접 사용한다.

## 구현 경로

| 범위 | 경로 |
| --- | --- |
| 스키마·제약조건·예약 | `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/20261011000000_card_news_credit_reservations/`, `apps/web/src/fsd/entities/credit-reservation/` |
| 공유 wire 계약 | `packages/db/contracts/card-news-v1.schema.json`, `card-news-v1.fixtures.json` |
| 유료 생성·무료 편집·콜백·복구·삭제 | `apps/web/src/fsd/features/card-news/` |
| 기존 영상 예약·정산·종료 근거 | `apps/web/src/fsd/features/upload/api/claim-processing-attempt.ts`, `settle-processing-attempt.ts`, `reconcile-video-reservations.ts`, `record-legacy-producer-drain.ts` |
| 목록·편집 화면 | `apps/web/src/app/dashboard/card-news/`, `apps/web/src/fsd/widgets/card-news-editor/` |
| 작업 등록·webhook | `apps/web/src/inngest/card-news-functions.ts`, `video-reservation-functions.ts`, `apps/web/src/app/api/webhooks/card-news/route.ts` |
| 독립 CPU 앱·폰트·실물 렌더 검증 | `apps/backend/card_news_app.py`, `apps/backend/card_news/README.md` |

영상과 카드뉴스는 `User.credits`와 `reservedCredits`를 공유한다. 작업 수락 시 예약하고, 검증된 결과를 게시하는 트랜잭션에서 차감한다. 실패 시 예약을 해제한다. 영상의 부분 성공은 실제 정상 MP4 수만 정산한다. 완료·실패 재진입은 terminal CAS로 중복 차감을 막는다. 크레딧 구매는 보유 잔액을 늘리며 진행 중 예약을 지우지 않는다.

수동 편집은 불변 revision을 저장하고 무료 render를 예약한다. 실행 중 편집은 최신 revision으로 병합하되 각 revision의 문구는 보존한다. 내보내기는 요청한 완성 revision의 파일·caption·해시태그를 반환한다. 생성자 종료를 확증하지 못한 자산은 삭제를 보류하며 대시보드에서 삭제 상태와 재시도를 확인할 수 있다.

## 로컬 검사

저장소 루트에서 실행한다. 실제 운영 DB migration이나 유료 외부 호출은 포함하지 않는다.

```powershell
npm.cmd run check -w apps/web
npm.cmd test -w apps/web
npm.cmd run build -w apps/web
npm.cmd run check -w apps/admin
python -m unittest discover -s apps/backend -p 'test_*.py'
```

다음은 `apps/web` 디렉터리에서 실행한다.

```powershell
node --conditions=react-server --import tsx scripts/verify-card-news-surfaces.mts
```

### 별도 PostgreSQL에서 실제 DB 통합 검사

`verify-card-news-local-db.mts`는 제공한 PostgreSQL 바이너리로 **새 임시 클러스터**를 만들고 loopback으로만 실행한다. 임의 포트·임의 비밀번호·새 DB를 사용한다. 운영 URL을 재사용하지 않는다. 구현 전 commit `b20722b194f4a5014423e7790dfa188cb9cca367`의 Prisma schema로 baseline을 복원하고, schema에 표현되지 않는 기존 영상 동시 처리 partial unique index·padding CHECK 2개 및 이번 카드뉴스 migration SQL을 실제 적용한 뒤 아래 3개 검사를 차례로 실행한다. 완료 또는 실패 후 서버와 WebSocket proxy를 종료한다. 검사 로그·DB 파일의 임시 경로만 출력하며 비밀번호를 출력하지 않는다.

기존 14개 migration을 빈 DB에 그대로 적용하는 첫 시도는 `20260916000000_clip_draft_reference_translation`에서 `ClipDraft` 테이블 부재로 실패했다. 기존 기록에는 현재 schema의 모든 생성 이력이 들어 있지 않다. 이번 runner는 그 이력을 고쳐 쓰거나 migration이 모두 통과했다고 주장하지 않는다. 실제 운영 schema drift는 배포 전 별도 확인해야 하며, 새 SQL의 rehearsal 기준은 위의 고정 schema다.

Windows 바이너리는 [PostgreSQL 공식 Windows 안내](https://www.postgresql.org/download/windows/)가 연결하는 [EDB 바이너리 배포](https://www.enterprisedb.com/download-postgresql-binaries)에서 받는다. 이번 검증에는 PostgreSQL 16.15 ZIP을 사용했다. 설치된 PostgreSQL 서비스와 운영 DB를 중지하거나 변경할 필요가 없다.

`apps/web`에서 실행한다.

```powershell
$env:CARD_NEWS_TEST_POSTGRES_BIN = '임시로 압축 해제한 PostgreSQL의 bin 절대 경로'
node --conditions=react-server --import tsx scripts/verify-card-news-local-db.mts
```

검사 항목:

1. `verify-card-news-credit-concurrency.mts`: 같은 요청의 20회 경쟁, 요청 충돌, 20회 완료·실패 재진입, 예약 집계와 정확히 한 번 차감·해제.
2. `verify-card-news-lifecycle.mts`: 실제 Action 인증, 불변·병합 revision, 과거 revision 내보내기, webhook 인증, tombstone과 producer 종료 확인 후 정리.
3. `verify-card-news-video-compatibility.mts`: 실제 영상 부분 성공·0개 실패·analyze, 마지막 1크레딧의 영상/카드 경쟁, 예약 중 구매, 오래된 callback/삭제 fencing, spawn identity, 전역 복구, legacy receipt exact scope, DB CHECK 거부, cleanup 재시도 공정성.

테스트는 실제 PostgreSQL 및 서비스의 **동일 PrismaNeon 어댑터**를 사용한다. loopback WebSocket proxy는 PostgreSQL TCP 바이트만 전달한다. S3·Modal·Inngest·인증 세션은 private test runtime에서 대체하며 일반 외부 fetch는 차단한다. 외부 서비스 실제 I/O 검증과 구분한다.

2026-10-11 실제 로컬 실행: 위 3개 CLI 및 전체 runner **EXIT 0**. paid/free의 만료 callback·복구·선택 결과물 보존도 통과했다. artifact는 `C:/Users/hamso/AppData/Local/Temp/apch-card-news-db-3uc0dK`, PostgreSQL 및 proxy 종료 완료. 바이너리 archive SHA256은 `25e6fcdfb8caec38691bf461125e7564508760666f7b8e5dc6a5f0818f58f81e`로 기록한다(다운로드한 파일의 식별값이며 배포자의 서명 검증을 대체하지 않는다).

이미 마련한 별도 Neon 테스트 DB를 쓸 경우 해당 DB에 모든 migration을 먼저 적용하고 아래 환경변수로 개별 CLI를 실행할 수 있다. 현재 운영 URL과 같은 DB는 거부한다. URL·비밀번호를 대화나 문서에 적지 않는다.

```powershell
# 분리 테스트 DB URL은 로컬 실행 환경에서 설정한다.
$env:CARD_NEWS_TEST_DATABASE_CONFIRMED = 'true'
node --conditions=react-server --import tsx scripts/verify-card-news-credit-concurrency.mts
node --conditions=react-server --import tsx scripts/verify-card-news-lifecycle.mts
node --conditions=react-server --import tsx scripts/verify-card-news-video-compatibility.mts
```

## 설정과 배포 순서

새 환경에서는 다음 기본값으로 시작한다. 실제 endpoint와 secret은 배포 환경에만 저장한다.

| 설정 | 기본값/의미 |
| --- | --- |
| `CARD_NEWS_ENABLED` | `false`; 일반 유료 생성 비활성 |
| `CARD_NEWS_ALLOWED_USER_IDS` | 빈 문자열; 쉼표로 구분한 검증 사용자 ID만 허용 가능 |
| `CARD_NEWS_ENDPOINT` | CPU HTTPS endpoint |
| `CARD_NEWS_ENDPOINT_AUTH` | web → CPU Bearer secret |
| `CARD_NEWS_WEBHOOK_SECRET` | CPU → web Bearer secret |
| `VIDEO_GENERATION_ADMISSION_ENABLED` | `false`; 새 영상 scheduling 차단 |
| `VIDEO_WORKER_START_ENABLED` | `false`; 새로운 영상 worker claim 차단 |

**기존 영상도 두 gate를 명시적으로 활성화하기 전 새 생성을 시작하지 않는다.** 이미 예약·수락된 작업의 완료·복구는 동작한다. 이 기본값은 migration 및 legacy producer drain 확인 전 새 과금과 이전 worker가 겹치는 것을 막는다. 단일 배포로 기존 worker를 갑자기 바꾸지 말고 아래 순서를 따른다.

1. 기존 worker semantics를 유지한 사전 배포에서 ingress/worker 시작 gate를 먼저 준비한다. 카드뉴스는 비활성으로 둔다.
2. ingress만 닫고 기존 queued·retry·callback·dispatch·Modal 작업을 처리한다. 실제 DB/Inngest/Modal에서 모두 종료됐음을 확인한 뒤 worker 시작도 닫는다. 두 gate를 먼저 함께 닫으면 queued drain이 막힐 수 있다.
3. additive migration을 적용한다. 기존 `credits`는 재계산하지 않는다. 기존 call ID 없는 dispatch의 `modalSpawnState`는 `unknown`을 유지한다.
4. 독립적으로 확인한 frozen legacy producer 목록의 receipt를 dry-run 후 apply한다. 스키마 검증이 운영 종료의 진실성을 증명하는 것은 아니다.
5. CPU 앱·공통 producer status 조회를 배포하고 기존 GPU와 같은 Modal workspace/environment에서 조회가 되는지 확인한다. 공유 예약·정산·잔액 UI 및 Inngest worker를 전환한다.
6. 영상 검증 사용자에게 두 영상 gate를 열어 부분 성공·실패·복구를 확인한다. 카드뉴스는 allowlist 사용자로 최초 생성·무료 편집·AI 재생성·삭제를 확인한다.
7. 실제 CPU image·모델·다운로드·인증 브라우저·S3/callback/정리 증거와 비용 검증 후 일반 카드뉴스를 활성화한다.

### Legacy 종료 receipt

JSON의 필수 구조는 `schemaVersion: 1`, `cutoff`, `confirmedAt`, `workspaceId`, `environmentId`, `deployments: {web, inngest, gpu}`, `evidence: {reference, modalActive: 0, inngestActive: 0, queued: 0, retries: 0, callbacks: 0, dispatches: 0}`, `targets: [{dispatchId, uploadedFileId, attempt, outputPrefix}]`다. 시간은 ISO 형식이고 대상 목록은 해당 cutoff의 DB frozen universe와 정확히 일치해야 한다.

운영 DB 환경과 `apps/web` 디렉터리에서 수행한다. 기본은 dry-run이고 `--apply`만 종료 근거를 저장한다. 잔액·Clip·영상 상태를 변경하는 복구 명령은 아니다.

```powershell
node --conditions=react-server --import tsx scripts/record-card-news-legacy-drain.mts --receipt-path '독립 검토된 receipt의 절대 경로'
node --conditions=react-server --import tsx scripts/record-card-news-legacy-drain.mts --receipt-path '독립 검토된 receipt의 절대 경로' --apply
```

## 남은 실물 검증과 롤백

CPU 로컬 실물 검증·정확한 pinned dependency/font SHA·Modal image qualification 명령은 [CPU 실행 문서](../apps/backend/card_news/README.md)에 있다. 로컬 한국어·영어 JPEG/ZIP 검사는 실제 Modal image qualification이나 Gemini 의미 평가를 대체하지 않는다. 다음 증거를 확보해야 일반 출시할 수 있다.

- Modal Python 3.12/Debian FFmpeg image에서 pinned package/font 검사와 한국어·영어 렌더.
- 실제 Gemini 가용성·원문 사실성·수정 호출 상한·가격, 실제 S3/callback·producer 종료와 실패 복구.
- 두 로그인 사용자의 직접 URL·다른 기기 재접속·편집 충돌·무료 render·다운로드 bytes·Instagram 수동 업로드.
- 기존 영상 legacy drain 및 전환 뒤 예약/부분 성공/실패와 Header/billing 잔액 표시.

장애 시 카드뉴스 신규 유료 수락부터 닫고 완료·복구·예약 해제·cleanup worker는 유지한다. 미종결 producer를 `ended`로 추정하거나 예약을 일괄 해제하지 않는다. DB 모델을 제거하는 역 migration 대신 additive schema를 보존한다. 예약이 남은 상태로 예약을 모르는 구버전 잔액 소비자에 롤백하지 않는다.
