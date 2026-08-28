# BUG-08 — 메인 루프 기록 (게이트 결정·검증 라운드)

## 선정과 게이트① 개방 (2026-08-29)

pm이 미결 0건 상태에서 BUG-04와 함께 선정(`b493757`). 사용자가 세션에서 "둘 다 계획 지시"로 게이트① 개방 — 메인 루프가 보드를 편집했고 결정은 사용자의 것이다. 병렬 미결: BUG-04(같은 담당).

- 요구 원천: `TASK_BACKLOG.md`의 BUG-08 `source` — BUG-03 계획서(`docs/plans/BUG-03.md:279`)가 「범위 밖 의존」으로 남긴 것. 관측(뒤쪽 업로드 실패 시 앞쪽 클립이 리포트에서 사라지고 S3에 고아 객체만 남음)과 진단(에러 콜백 `clips: []` 하드코딩·웹 inngest 계약)이 분리돼 적혀 있다.

backend-dev에 디스패치한다. 메인 루프가 양쪽 코드를 읽고 잡은 핵심 판단 지점:

- **경계 사실(메인 루프 실측)**: `main.py:1198-1213` 포괄 except가 `"clips": []`를 보내고(`:1209`) 곧 `raise`(`:1213`), `clip_results`는 클립 하나가 끝까지 성공할 때만 append(`:1186`)라 실패 시점의 `clip_results`는 이미 "완전히 올라간 클립"만 담는다. 웹 쪽: 웹훅 `apps/web/src/app/api/webhooks/modal/route.ts:206-209`는 `clips`를 status와 무관하게 정규화하고 `:269-280`은 `clips.length > 0`이면 status가 `error`여도 `updateClipMetadataFromBackendClips`로 메타데이터를 반영한다. 반면 inngest `apps/web/src/inngest/functions.ts:478-486` `applyModalPayload`는 status가 성공이 아니면 `clips`를 읽지 않고 실패 메시지만 세운다. 따라서 **backend가 에러 페이로드에 부분 `clip_results`를 실어도 웹은 깨지지 않지만(계약 호환) 부분 성공이 사용자에게 "전달"되지는 않는다** — 그 절반은 web inngest 변경(담당 범위 밖)이다.
- **BUG-05와의 관계**: BUG-05(2026-08-05, 부분 생성 클립 전달)가 inngest에 S3 폴링(`wait-for-generated-clips`, `functions.ts:531`)을 넣었다. 콜백이 `error`여도 S3에 올라간 클립을 폴링이 집어 부분 전달이 이미 일어나는지 — 계획서가 **읽기 전용으로 추적**해 실제 사용자 영향(리포트 유실이 지금도 발생하는지, 어느 경로에서)을 「현재 동작」에 `파일:줄`로 세운다. 이것이 backend 절반의 가치를 정한다.
- **backend 절반의 형태**: 에러 콜백 페이로드에 `clips: clip_results`(실패 시점까지 완성된 것) + 실패 클립 식별(어느 index에서 실패했는지)을 싣는다. 페이로드 조립은 순수 함수(예 `build_error_callback(uploaded_file_id, attempt, mode, error, clip_results)`)로 빼 unittest로 덮고, `main.py`는 배선만. 필드 이름은 웹 `RawModalWebhookBody`(`route.ts:68-82`)와 맞춘다 — 이미 있는 `clips` 필드를 쓰면 웹 변경 없이 호환.
- **재시도 상호작용**: `raise`로 Modal이 `attempt`를 올려 재실행하면 전체 클립을 다시 렌더한다(S3 키는 index 기반이라 덮어씀). 웹은 `isUploadedFileAttemptCurrent`(`route.ts:264`)로 옛 attempt 콜백을 거른다 — 부분 클립을 실은 에러 콜백이 재시도와 어떻게 겹치는지 계획서가 적는다.
- **"S3 고아 객체"**: 관측의 절반. 정리(삭제)까지 이 항목이 맡을지, 웹이 부분 클립을 소비하면 고아가 아니게 되는지 — 범위를 계획서가 정한다(삭제는 파괴적이라 기본은 안 함).
- **web 절반은 별도 항목**: BUG-02 → FEAT-21 전례처럼 「범위 밖 의존」에 "web inngest가 `status: error` 페이로드의 `clips`를 소비해 부분 전달·크레딧 정산" 후보를 적어 두면 인수 시 메인 루프가 백로그 후보로 올린다.
- **테스트·검증**: stdlib `unittest`, `main.py` import 금지. `modal deploy`·실주행은 사용자 몫. 실제 콜백 왕복은 「못 덮는 범위」.
