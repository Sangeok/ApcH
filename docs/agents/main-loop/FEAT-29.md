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
