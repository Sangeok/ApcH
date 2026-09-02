# FEAT-29 — 메인 루프 기록 (게이트 결정·검증 라운드)

## 선정과 게이트① 개방 (2026-09-02)

pm이 미결 0건 상태에서 FEAT-28과 함께 선정(`c36f48c`). 사용자가 FEAT-28 사이클 완료 후 "feat 29 승인"으로 게이트① 개방 — 메인 루프가 보드를 편집했고 결정은 사용자의 것이다. 계획서가 없는 시점이라 열 수 있는 게이트는 `계획지시` 하나뿐이라 지시 대상이 모호하지 않다. 미결은 이 항목 하나.

- 요구 원천: `TASK_BACKLOG.md`의 FEAT-29 `source` — 사용자 관측(Neon 비용이 1인 사용 대비 과다)에서 출발해 메인 루프가 코드로 진단·등재했다. 관측(15분 cron이 24시간 내내 DB를 깨움)과 진단(`processing` 쓰기가 한 곳뿐이라 건별 감시자로 대체 가능)이 분리돼 있고 수정 방향·삭제 대상까지 `파일:줄`로 적혀 있다.

계획 단계가 확인해야 할 지점(메인 루프가 등재 시 실측한 것 — 계획서가 직접 재확인할 대상):

- **깨움 산정**: `monitorPipelineHealth`(`functions.ts:1053`)의 `*/15 * * * *`와 Neon autosuspend(5분)가 겹쳐 하루 ≈96회. 비용이 storage가 아니라 compute인 근거는 스키마상 바이너리(영상·전사·클립)가 전부 S3 키라는 것.
- **대체 가능성의 근거**: `status: "processing"` 쓰기는 `startUploadedFileProcessingAttempt`(`api/index.ts:690-700`) 한 곳뿐이고(나머지 다섯은 `where` 절), 호출은 `processVideo`·`analyzeVideo`의 `claim-processing-attempt`(`functions.ts:396`·`:833`) 둘뿐. 전수 스캔 없이 건별 감시자로 옮길 수 있다는 전칭이 여기 걸린다 — 계획서가 여집합으로 다시 세울 것.
- **재사용 가능한 기존 장치**: 단건 확인 `isUploadedFileAttemptStillProcessing`(`api/index.ts:773`), 취소 이벤트 `process-video-events/cancel`(`api/index.ts:170-175`, matchKey 동봉).
- **함정(등재 시 명시)**: 감시자에 `concurrency`를 주면 안 된다 — account·userId 슬롯을 자는 감시자가 점유하면 유저당 1건 직렬화(`functions.ts:298-304`)가 막힌다.
- **딸려 오는 삭제**: `stuckAlertMaxAgeMs`(`stale-policy.ts:22`)는 "cron 2회 누락까지 견딘다"가 근거라 cron이 없어지면 근거가 소멸한다. 그 전제 주석(`stale-policy.ts:18-22`·`functions.ts:1058-1059`)도 함께.
- **범위 밖**: Neon 콘솔 설정(scale-to-zero·0.25 CU 최소·불필요 브랜치)과 로컬 `.env`가 프로덕션 엔드포인트를 공유하는 문제는 코드 밖 사용자 작업이다.

## 필수 검증 경로 확정 (2026-09-02)

| 경로 | 필수 여부 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | 필수 | 모든 항목 (명명 인용 25건 + bare 6건) |
| 2 스케치 추출·실행 | 필수 | ts 블록 5개, 수정 6파일 + 신규 2파일 |
| 3 before/after 기계 적용 | 필수 | 기존 파일 6개 수정(삽입 2·삭제 4) |
| 4 전칭 여집합 열거 | 필수 | "한 곳뿐" · "둘뿐" · "다른 사용처 없다(web src 전수)" · "범위 밖 의존 없음" |
| 5 돌연변이 검사 | 필수 | 순수 함수 `stuckAlertElapsedMinutes` 신설 |
| 6 실제 사건 재생 | 필수 | 정체 사건 해석이 cron 스캔에서 이벤트 기반으로 통째로 바뀐다 |
| 7 음성 시험 | 필수 | 새 명세(6분기)가 불변식에 물려 있는지 |
| 9 구조적 아티팩트 | 필수 | `client.ts` Events 스키마·`route.ts` 등록 목록이 구조 계약 |
| 8 실물 렌더 | 미해당 | 화면 변경 없고 UI에 기대는 논거도 없음 |

하니스: 스크래치패드 `feat29-harness/`.

## 검증 1라운드 (2026-09-02, 메인 루프 — 무편집)

**경로 1** — 명명 인용 25건을 스크립트로 파일·줄에 해석해 내용까지 대조, 전부 일치. FEAT-28 구현이 `functions.ts`를 4줄 밀었는데(`monitorPipelineHealth` `:1053`→`:1057`) 계획서는 **이동 후 트리 기준으로 정확히** 인용한다. 반대로 `TASK_BACKLOG.md`의 FEAT-29 `source`(FEAT-28 이전에 내가 쓴 것)는 `:1053`·`:396`·`:833`으로 낡았다 — 계획서가 원천을 그대로 베끼지 않고 코드로 재확인했다는 증거다.

**경로 3** — 삽입 앵커 둘과 삭제 범위 넷을 실측 대조. `processVideo` 앵커(`:419-423` `if (claimResult.status !== "started") { return { skipped: true }; }` + 빈 줄 + `try {`)와 `analyzeVideo` 앵커(`:847-855` 다른 반환 형태 + `:857` `try {`)가 서로 다른 모양인데 계획서가 각각 정확히 인용했다. 삭제 범위 `functions.ts:1053-1114`는 주석 2줄 + `STUCK_SCAN_LIMIT` + `monitorPipelineHealth` 전체와 정확히 일치. `api/index.ts` 함수 끝은 `:1343`(계획서 `:1304-1343` 일치).

**경로 4** — `listStuckProcessingUploadedFiles`·`StuckProcessingUploadedFile`·`stuckAlertMaxAgeMs`·`STUCK_SCAN_LIMIT`·`monitorPipelineHealth`의 **모든 출현을 grep으로 열거**한 결과 12곳 전부가 계획서 「고칠 파일」 표에 있다 — 여집합이 비었다. 계획서가 재확인한 핵심 전칭(`status: "processing"` **쓰기**는 `api/index.ts:697-700` 한 곳뿐, 나머지 출현은 `where`/`in`/인메모리 비교)도 독립 재현. 취소 이벤트 발신처는 reconcile 두 곳(`api/index.ts:1019`·`:1092`)뿐이고 둘 다 `markUploadedFileAttemptFailed` 성공 후라, 감시자의 `cancelOn`이 "이미 처리된 정체"만 조용히 끝낸다.

**경로 2** — 스케치 5블록을 실제 트리에 조립(8곳 전부 앵커 1회 일치, 자동 적용). `next lint` **경고·오류 0**, `tsc --noEmit` **종료코드 0**, `npm test -w apps/web` **66/66**(60 + 신규 6). 조립 후 복원, `git status` 청결 확인. 계획서가 삭제하는 배럴 재수출·타입까지 포함해 타입 검사가 통과한다는 것은 삭제 목록이 완전하다는 기계적 증거다.

**경로 5·7** — 신규 순수 함수에 돌연변이 4종 주입(음수 가드 제거 · `round`→`floor` · NaN 가드 제거 · 단위 `60_000`→`1000`). **4종 전부 사멸**했고 각각을 죽인 케이스가 서로 달라(미래 시각 / 반올림 up / parse 불가·빈 문자열·공백 / 경과 3건) 계획서가 열거한 6분기가 **모두 하중을 받는다**. 장식 분기 없음.

**경로 6** — 같은 정체 사건(10:00 claim, 12:05 현재)에 옛 cron 경로와 새 감시자 경로를 각각 통과시켜 알림 페이로드를 비교: `{kind, uploadedFileId, processingStartedAt: "2026-09-02T10:00:00.000Z", elapsedMinutes: 125}` **완전 동일**. 감시자 기상 시각도 claim+90m으로 `stuckAlertMs`와 일치. `flushReports`가 never-throw(`report-error.ts:128-136` try/catch)라 `retries: 1`에서도 중복 보고가 없다 — 계획서가 주장한 것보다 강한 보장이다.

**경로 9** — 구조 파싱으로 확인: `client.ts` Events 키 6개에 `processing/attempt.claimed` 등록됨. 함수 트리거·`cancelOn`·`step.sendEvent` 대상 이벤트가 **전부 스키마에 존재**. `route.ts` 등록 목록 = import 목록 = `functions.ts`의 `export const … inngest.createFunction` 집합 **3자 일치**. 남은 `cron`은 계획서가 유지 대상으로 명시한 `cleanupAnalyticsEvents` 하나뿐.

**결함(구현 오류 유발급) 0건 · 편집 0건.**

**비차단 위험 1건(구현 아닌 배포 시점 사안)**: 배포 순간 이미 `processing`인 attempt는 `processing/attempt.claimed` 이벤트를 받은 적이 없어 감시자가 없고, 그것을 잡던 cron은 삭제된다 — 그 attempt는 정체돼도 알림이 없다. 계획서 「문제」의 "커버리지도 동률이다"는 *어느 status를 보는가*(processing vs queued)에 관한 진술이라 문장 자체가 거짓은 아니지만, 전환 구간의 이 공백은 어디에도 안 적혀 있다. 구현 코드는 어느 쪽이든 동일하고, 사용자 가시 영향은 없다(그 업로드는 조회 시점 `reconcileStaleUploadedFileForUser`가 여전히 강제 실패시킨다 — 잃는 것은 Sentry 알림 1회뿐). 계획 수정 없이 **배포 확인 원장에 등재**해 닫는다: "배포 시 처리 중 업로드가 없는지 확인, 있으면 그 건은 알림 없이 지나갈 수 있음."

**비차단(문서 정확도) 1건**: 「구현 스케치」 §8이 `stale-policy.ts:18-22`를 "주석 3줄 + `stuckAlertMaxAgeMs`"로 적었으나 실제로는 주석 **4줄** + 상수(총 5줄)다. 줄 범위(`:18-22`)와 삭제 후 상태("`stuckAlertMs: 90 * 60 * 1000,` 뒤 `} as const;`로 끝난다")가 둘 다 정확해 구현이 틀릴 수 없다 — 계획 수정 없이 기록만 남긴다.

판정: 메인 루프 라운드 무소득 → `plan-verifier` 디스패치 자격.

## 검증 2라운드 — 독립 패스 (2026-09-02, `plan-verifier`) · **결함 1건 → 편집**

독립 패스가 **결함 1건**을 보고했다: 「구현 스케치」 §8의 `stale-policy.ts:18-22` 서술이 "주석 3줄"인데 실제는 4줄. 메인 루프 1라운드도 같은 것을 잡아 "비차단(문서 정확도)"로 분류하고 넘겼는데, 독립 패스가 이를 결함으로 세웠다. **판단을 바꾼다** — 두 패스가 독립적으로 같은 지점을 지적했고 고치지 않으면 다음 패스도 같은 소득을 낼 것이므로 수렴하지 않는다. 한 낱말 정정으로 닫는다.

독립 패스가 추가로 확인해 준 것(메인 루프 라운드에 없던 것):
- `PROCESSING_STALE_POLICY`는 `api/index.ts:131`·`:144`·`:153`·`:1164`·`:1167`에서 계속 쓰여, `listStuckProcessingUploadedFiles` 삭제 후에도 import 고아화(unused-var lint)가 생기지 않는다.
- 돌연변이를 6종으로 늘려 5종 사멸, 1종(`<= 0` → `< 0`) 생존하나 **증명 가능한 등가 돌연변이**(`elapsedMs === 0`이면 else 분기도 `Math.round(0/60_000) === 0`이라 어떤 입력으로도 구별 불가). 명세에 실질 구멍 없음.
- 컷오버 공백(배포 시점 in-flight 행)을 독립적으로 관측하고 같은 결론(비차단·롤아웃 사안)에 도달했다.

### 브리핑 결함(메인 루프 책임)

브리핑이 "스케치를 트리에 조립해 `npm run check`/`npm test` 후 복원"을 지시했으나, `plan-verifier`는 정의상 `Write`/`Edit`가 없고 저장소 쓰기가 금지된 에이전트다 — **구조적으로 불가능한 작업을 요구했다.** 검증자는 이를 정직하게 [실행하지 못한 경로]에 적고 신규 순수 모듈의 격리 컴파일 + 타입정의 정적 대조로 대체했다. 경로 2의 통합 형태는 메인 루프 1라운드가 실행했다(FEAT-28과 같은 분담). 재디스패치 브리핑에서는 이 요구를 뺀다. 이 제약 자체는 FEAT-27(검증 하니스)이 다룰 대상이다 — 검증자가 **쓰기 없이 돌릴 수 있는 조립 검사 도구**가 있어야 이 분담이 사라진다.

### 편집 (메인 루프)

1. §8 `stale-policy.ts` 서술: "주석 3줄" → "주석 4줄"(실측 `:18-21` 주석 4줄 + `:22` 상수). 줄 범위와 삭제 후 상태 서술은 원래도 정확했다.
2. 「테스트 > 못 덮는 범위」에 **전환 구간 공백** 항목 추가. 두 패스가 독립적으로 관측했고 어디에도 안 적혀 있어, 계획서에 박아 배포 확인 원장이 원천을 갖게 한다. 코드로 메우지 않는다는 결정(일회성 백필은 범위 밖·남길 코드 아님)과 완화(처리 중 업로드 없을 때 배포)를 함께 적었다.

편집 후 무편집 확인: 새로 인용한 `api/index.ts:954`가 `reconcileStaleUploadedFileForUser` 정의와 일치. ts 스케치 5블록은 손대지 않았고(sha1 대조) 템플릿 7절 구조 유지 — 앞선 경로 2·3·5·6·9의 기계 결과가 그대로 유효하다. 편집이 있었으므로 이 라운드는 클린 패스가 아니다. 재디스패치한다.
