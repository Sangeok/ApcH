# 카드뉴스 출시 검증 기록 — 2026-10-20

검증 기준은 `origin/feat/card-news`의 `72bde11`에 최신 운영 main `67e9a13`을 병합한 구현과 이 문서에 기록한 수정이다. 운영 전환 기록은 실제 실행 후 보강한다. 이 문서는 미실행 항목을 통과로 간주하지 않는다.

## 검토와 수정

Frontend Clean Code Orchestrator의 응집도·결합도·예측 가능성·가독성·TypeScript 5개 독립 lens가 handwritten frontend 114개 파일 전체를 읽었고 중립 gate가 2회 검토했다. **Full applicable-lens review**이며 unavailable/skipped/N/A는 없다. 다음 5개 Must를 수용하고 수정했다.

| ID | 수정 | 기여 lens |
| --- | --- | --- |
| CN001 | 종료된 업로드 화면의 카드 생성도 공용 live 잔액을 사용 | 5개 전체 |
| CN002 | 부모 업로드가 없는 Clip도 S3 삭제 후 DB 정리를 완료 | 결합도, TypeScript |
| CN003 | 편집 충돌 복구가 서버를 다시 조회하고 조회 실패 시 입력을 보존 | 예측 가능성, 가독성 |
| CN004 | 해시태그 구분자를 입력 중 보존하고 저장 시 정규화 | 가독성, TypeScript |
| CN005 | 저장 성공 후 서버의 canonical 원고·revision·provenance 채택, 저장 중 새 입력 보존 | TypeScript |

분석 이벤트는 검증된 anonymous/session 문맥을 job과 revision별 outbox에 저장하고 입력 수정 field count를 기록한다. 유효하지 않은 분석 문맥은 제품 동작을 실패시키지 않는다. 삭제 hook은 cleanup receipt를 반환하고 사용자별 카드뉴스·정리 목록 cache를 갱신한다. Windows checkout의 OFL license 줄바꿈을 고정하고 실제 Modal image mount 순서와 원격 import 경로도 수정했다.

## 실행한 검증

- web FSD/lint/TypeScript 검사 통과, web unit 359개 및 별도 client 회귀 6개 통과. 최종 web production build 통과. 사전 gate의 main 병합 후 설정 중복은 최종 TypeScript 검사로 발견해 제거했다.
- admin FSD/lint/TypeScript 검사와 unit 337개 통과.
- backend 전체 162개와 Python 문법 검사 통과.
- 독립 PostgreSQL 16.15에서 새 migration SQL 및 credit concurrency/lifecycle/video compatibility의 3개 실제 PrismaNeon CLI 통과. 운영 DB를 테스트에 사용하지 않았다.
- DB 통합 검사는 parentless Clip 정리, 분석 outbox 쓰기 실패의 transaction rollback·재시도·중복 방지, 서로 다른 revision의 분석 문맥·edited field count도 포함한다.
- 실제 hook/module 회귀는 충돌 조회 실패, 두 해시태그 입력, canonical 원고, 저장 중 입력, 삭제 receipt와 사용자 cache 분리, terminal 업로드 live 잔액을 검사한다. 별도 runtime 4개와 surface 검사 통과.

## 실제 CPU·모델 검증

Modal workspace `sangeok`, environment `main`의 별도 임시 앱으로 실행했다. 기존 GPU 앱을 배포하거나 변경한 검증이 아니다.

- fixture 앱 `ap-PIE1CFeglo79KGVIebIPIv`: Python 3.12.10, FFmpeg 5.1.9, pinned package·font SHA 검사. 한국어/영어 10개, JPG 48개(1080×1350), ZIP 10개, glyph/overflow 거부 3개 통과.
- fixture artifact: `C:/Users/hamso/AppData/Local/Temp/card-news-qualification-e1p17hcp`.
- 실제 모델 앱 `ap-UPjKajEigdyMm13awb4q6G`: 10개 원문, 총 11회 호출, schema·실제 render 모두 통과. 영어 회의 사례 highlight 오류를 1회 수정했다.
- 모델 artifact: `C:/Users/hamso/AppData/Local/Temp/card-news-model-qualification-6b94usn8`.
- 원문과 모델 원고의 필수 사실·수치·금지 주장을 대조했다. 일부 일반적 효율·생산성 표현이 남아 있으므로 이 표본을 모든 입력의 사실성 보증으로 해석하지 않는다.

fixture 한국어 표지·영어 본문과 393px preview를 직접 열어 glyph와 clipping을 확인했다. 실제 사용자 미디어·브라우저 acceptance·Instagram 업로드 검증을 대체하지 않는다.

## 운영 사전 확인과 남은 항목

Vercel 로그인 갱신 후 `apc-h`와 `apch-admin` 접근을 확인했다. 운영 DB를 읽기 전용 transaction으로 조회한 시점에 활성 업로드는 0개, 기존 sent dispatch는 43개, 음수 잔액은 0개였다. 카드뉴스 additive migration은 아직 적용하지 않았다. Modal 기존 GPU method의 backlog와 runner는 모두 0이었다. Inngest 운영 앱의 최근 24시간 실행은 영상·watch·정기 정리 모두 완료 상태이며 RUNNING/QUEUED/PAUSED 조회는 0건이었다. API가 반환한 시간 범위가 최근 24시간이므로 이것만으로 과거 전체의 producer 종료를 증명하지 않는다.

운영 전환은 [runbook](card-news-runbook.md)의 사전 gate 배포 → ingress 차단·기존 작업 drain → worker start 차단 → migration·frozen legacy receipt → CPU·web 배포 → 제한 사용자 검증 순서다. 아직 실제 S3/callback·presigned 다운로드 bytes·인증 화면·전환 후 영상 호환성·Instagram 수동 업로드·최종 비용 검증은 완료하지 않았다. 완료되지 않은 동안 일반 카드뉴스 활성화는 보류한다.

사전 전환 PR #134를 사용자 승인에 따라 관리자 권한으로 main `75797b4`에 병합했다. ingress 차단 배포 `dpl_8kuZJEVUixjzhDRm27YPMJJ1TFpV`, worker 시작 차단 재배포 `dpl_J5NguD41UThiVf1uJBJo8nicr4Gj`가 READY인 것을 확인했다. 두 운영 설정을 개별 조회해 false를 대조한 뒤 DB/Inngest/Modal 활성 작업 0건을 재확인했다.

운영에서 additive migration `20261011000000_card_news_credit_reservations`를 적용했다. 기존 8개 계정의 credits 값은 그대로이며 reservedCredits는 모두 0이었다. 기존 dispatch 43건의 frozen 목록과 잔액은 비공개 임시 artifact에 저장했다. receipt dry-run의 43건 잠금이 기본 5초 transaction 제한을 넘겨, 이 운영 명령만 maxWait 10초·timeout 120초로 제한했다. 같은 frozen scope의 dry-run은 통과했으며 receipt SHA는 `fd9307b8e704af885072a79420d9f9d04738d4faf73338fc75b8d899d84f14de`다.

CPU 앱 `apch-card-news`를 `https://sangeok--apch-card-news-api.us-east.modal.run`에 배포했다. 기존 GPU secret을 유지하고 별도 `apch-card-news-auth`를 추가했다. 실제 HTTPS에서 무인증 401, 잘못된 input/status 422, 존재하지 않는 producer의 `unknown` 응답을 확인했다. 일반 flag는 false이고 합성 검증 계정만 allowlist에 두었다.

## 운영 생성·편집 검증과 후속 수정

PR #135를 main `54d74df`에 병합하고 운영 배포 `dpl_FRXofw6wgoTHjfShLUyAmvwie3Er`의 READY 및 Inngest worker 10개 sync 성공을 확인했다. 검증 계정과 합성 MP4·클립을 별도로 만들었고 실제 사용자 데이터·잔액은 변경하지 않았다.

- 최초 생성: 3 owned/0 reserved → 3 owned/1 reserved → 완료 후 2 owned/0 reserved. 실제 S3·CPU·Gemini·callback·manifest 검증·게시·정산 경로를 통과했다.
- 브라우저 ZIP/JPG 다운로드: ZIP SHA 및 표지 SHA가 운영 완료 manifest와 일치했다. ZIP의 5개 entry 순서·전체 이미지 hash·1080×1350 RGB JPEG decode를 확인했다. 다운로드한 표지도 열어 glyph·clipping을 확인했다.
- 복사 문구: 완료 v1의 caption/hashtags와 일치했다. Windows clipboard의 CRLF를 LF로 정규화해 비교했다.
- 무료 저장: 제목·caption·두 hashtag를 수정했다. 입력 중 구분자를 보존했고 저장 완료 후 앞뒤 공백 제거·user-edited·빈 sourceSentenceIds를 UI/DB에서 확인했다. 잔액은 2/0을 유지했다.
- 기존 버전: 무료 v2를 저장한 뒤 v1 ZIP을 다시 내려받았고 수정 전과 SHA가 같았다. 비로그인 직접 URL은 307 로그인 이동을 확인했다. 393px 생성 진행 화면의 수평 overflow는 없었다.

무료 v2의 자동 렌더는 대기 상태에서 멈췄다. 운영 Inngest trace에서 배차·복구 실행의 HTTP 504 `FUNCTION_INVOCATION_TIMEOUT`과 개별 요청 약 10초 종료를 확인했다. 기존 `/api/inngest`의 `maxDuration=10`을 그대로 상속한 것이 원인이며, 최대 100개 작업을 한 step에서 순차 처리하는 구조도 있었다. 이 후속 수정은 해당 route를 300초로 설정하고 배차·분석 outbox·복구·cleanup을 작업별 durable step으로 나눠 배치 전체가 한 요청 예산을 공유하지 않도록 한다. 실제 handler를 가짜 플랫폼의 요청 예산·step memoization으로 실행하는 회귀 3개가 전 작업 도달을 검증한다. 수정 후 실제 재배포·만료 job 복구·무료 재시도 결과는 추가 기록한다.

비용 검증 중 Gemini thinking 토큰 누락도 확인했다. 후속 CPU 코드는 출력 사용량에 candidate와 thought 토큰을 합산하고 실제 orchestration의 1회·수정 2회·무료 render 경로로 검증했다. 최초 생성의 과거 output token 기록은 thinking을 제외한 1294였으므로 그 숫자를 전체 과금 토큰이나 최종 비용 증거로 취급하지 않는다. 과거 불변 manifest는 추정값으로 덮어쓰지 않는다.
