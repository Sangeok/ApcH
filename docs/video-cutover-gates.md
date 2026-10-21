# 영상 과금 전환의 사전 배포

`VIDEO_GENERATION_ADMISSION_ENABLED`는 신규 업로드 준비와 모든 영상 scheduling을 제어한다. `VIDEO_WORKER_START_ENABLED`는 Inngest의 새로운 processing claim만 제어한다. 이 사전 배포에서는 두 값이 미설정이면 모두 `true`이므로 기존 서비스와 과금 방식이 유지된다. 카드뉴스·새 예약 과금·DB migration은 포함하지 않는다.

전환 시 admission만 `false`로 배포하고 기존 queued/retry/callback/dispatch/Modal 작업을 끝낸다. DB, Inngest, Modal에서 종료를 대조한 다음 worker start를 `false`로 배포한다. worker start 검사는 기존 `claim-processing-attempt` step 안에 있으므로 이미 claim이 저장된 Inngest 실행은 완료 경로를 계속 진행한다. 닫힌 gate에서 새 claim은 실패로 반환되어 기존 retry 규칙이 적용되며, 처리 완료로 가장하지 않는다.

검증: web FSD/lint/TypeScript 검사와 기존 227개 + gate 회귀 4개 테스트. 두 영상 handler에서 신규 claim 차단과 저장된 claim의 재개, 업로드 준비·scheduling 차단을 실제 모듈로 검사한다. 운영 전환 후 카드뉴스 배포에서는 두 설정을 명시적으로 관리해야 한다.
