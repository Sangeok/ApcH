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

## 필수 검증 경로 확정 · 검증 1라운드 (2026-08-29, 메인 루프 — 편집 라운드)

경로: 1 인용 전수 · 2 스케치 추출·실행 · 3 before/after · 4 여집합(앵커 유일성·"끝까지 성공한 클립만 append"·"경로 A는 status 무관"·"성공 콜백과 같은 객체 모양") · 5 돌연변이 · 6 실제 사건 재생(외부 신호 = 웹훅 소비 계약 — 실제 `process_clip` 반환 dict·`normalizeClip`·`updateMany`·inngest 순서를 코드로 재생) · 9 구조(AST). 7·8 트리거 없음.

하니스 `bugs/`(BUG-04와 공용). 인용 44건 일치 · before 3쌍+신규 1 · 단독 적용 `unittest` 47 OK·`py_compile`·import OK · AST: except가 `build_error_callback_payload(…clip_results=clip_results)` 호출·`"clips": []` 소멸·`raise` 유지 · 합본(BUG-04와 `:73` 앵커 합침) 공존 확인 · 돌연변이 6/6.

**결함 1건(구현 오류 유발급 — 거짓 동작 주장)**: 계획서는 "backend 한 줄 변경으로 웹 변경 없이 경로 A가 부분 클립 메타데이터를 반영한다"를 핵심 가치로 세웠다. 경로 6에서 inngest 순서를 재생하니 **실패 흐름에서 Clip 행은 루프가 `failed`로 끊긴 뒤 `persist-generated-clips`(`functions.ts:629-641`)에서만 생성**되고, 에러 웹훅의 인라인 경로 A(`route.ts:269-275`)는 그보다 먼저 돌아 `updateMany`(where uploadedFileId+processingAttempt+s3Key, 행 미생성) **0건**이 된다 — 경로 A는 "S3 완료 감지 후 늦게 오는 메타데이터"(`:550-566` 유예)용 장치다. 즉 backend 절반만으로는 사용자 가시 효과가 없고, web 절반(inngest가 error에서도 `clips` 소비 → persist가 메타데이터 행 생성)이 **필수 후속**이다. 부수 확인: `process_clip` 반환(`main.py:855-863`)에 `index`가 있어 `normalizeClip`(`route.ts:133-157`)이 걸러내지 않는다(호환 주장은 참). 계획서 정정: 「현재 동작 › 순서」 절 추가, 「문제」의 가치 서술을 "계약 준비·원천 제거·순수 함수 잠금 + 필수 후속"으로, 「테스트 › 못 덮는 범위」·「범위 밖 의존」·「대안」 정합. backend 변경 자체(부분 `clip_results`를 실음)는 그대로 — 여전히 옳은 전제 절반이다. 내 편집의 인용 2건(빈 줄 시작 `:628`·`:204`)을 `:629-641`·`:203-219`로 정정.

## 검증 2라운드 — 무편집 최종 패스 (2026-08-29, 메인 루프)

최신 저장본 재독 후 원본 트리에서 재실행: 인용 32(명명)+19(bare) 전부 일치 · before 4/4 · `unittest` 47 OK · `py_compile`·import OK · AST 세 조건 · 돌연변이 **7/7**(순서 뒤집기 추가) · 복원 청결. **결함 0건.** 판정: 메인 루프 라운드 무소득 → `plan-verifier` 디스패치 자격.

## 검증 3라운드 — `plan-verifier` 독립 무편집 패스 (2026-08-29, 1사이클째)

중립 브리핑. 검증자가 detached worktree(`ba64e07`)로 조립하고 제거 — 메인 루프 검산: 저장소 무변경·worktree 잔존 없음. 투명성 노트: 커밋 제목이 노출됐으나 판단 정보로 쓰지 않았다고 명시.

**결함 0건.** 경로별: ① 인용 전부 내용 일치(main.py 8곳·route.ts 6곳·functions.ts 10곳·clip api·outcome.ts·BUG-03:279) ② 조립 `unittest` **49 OK**(40+9)·`py_compile`·순수 import에 torch/boto3/modal 미로드 ③ before 3/3 정확 1회(성공 콜백 블록과 비충돌) ④ 여집합: Clip 행 생성은 `createClipsBulk`(`clip.createMany`) 호출처 `functions.ts:249` 단 하나, `updateMany`는 구조적으로 행 생성 불가, 원소 모양 동일(`main.py:855-866`+`1182-1184`), `normalizeBody`의 clips 정규화가 status 분기 밖 ⑤ 돌연변이 6/6 ⑥ 재생: `process_clip` 키 집합 ⊂ `RawModalWebhookClip`, `index` 통과, `isSuccessfulModalStatus`(`functions.ts:99-106`)가 "error"를 거짓으로 → early return → 행 부재 시점 `updateMany` 0건 — 계획서 「순서」 진술 구조적 성립 ⑨ AST: 순수 함수 1회 호출·`clip_results=clip_results`·`raise` 유지·`{"clips": []}` 0건·`add_local_python_source` 포함.

**판정**: 독립 무편집 클린 패스 1회 → 보드 정지 규칙 충족. `검증:` 줄 기록. **게이트②(구현승인) 대기.** 구현 순서 주의: BUG-04와 `main.py:73`을 공유 — 먼저 구현되는 쪽이 줄을 바꾸고 나중 쪽은 재독해 맞춘다(두 계획서 모두 명시, 합본 공존은 메인 루프가 실측).

## 게이트② 개방 (2026-08-29)

사용자가 세션에서 "둘 다 구현 승인"으로 개방. 계획서는 클린 패스 시점 그대로 — 사용자 편집 없음. backend-dev 정의 규칙(구현은 한 번에 하나 — `main.py` 공유)대로 두 항목을 순차 구현한다: 먼저 구현되는 쪽이 `main.py:73`(`add_local_python_source`)을 바꾸고, 나중 쪽은 계획서 §3 주석대로 현재 코드를 재독해 두 모듈을 함께 포함한다(합본 공존은 메인 루프가 검증 라운드에서 실측). `modal deploy`는 사용자 몫.

## 구현 인수 (2026-08-29, 메인 루프)

**인수 다섯 조건 — 직접 재현**(`bugs/accept.sh`): 1. 변경 파일 = 신규 2(`error_callback.py`·`test_error_callback.py`) + `main.py` + 보드·백로그·보고서 **정확히 일치**. 2. 에러 콜백 after 블록 `main.py`에 포함·`"clips": []` 소멸; import·이미지 체인은 계획서 §3 주석이 예고한 합본 차이(import는 `temp_cleanup_policy` 블록 뒤, `:78` `add_local_python_source(…, "temp_cleanup_policy", "error_callback")`) — `from error_callback import build_error_callback_payload` 실재 확인. 3. `unittest` **55 OK**(46+9)·`py_compile` 0·순수 모듈 stdlib import. 4. 백로그 `-4줄`만, 인접(FEAT-01·FEAT-27·절 제목·비고) 잔존 열거 확인. 5. `docs/agents/backend-dev/BUG-08.md` 5.6KB 실재, 보드 `결과` 136자. 추가: 합본 AST — try 마지막 `succeeded = True`·except가 `build_error_callback_payload(clip_results=clip_results)`·`raise` 유지·`finally`가 정책 호출 — BUG-04·BUG-08 공존.

「범위 밖 의존」 → **백로그 후보 1건(사용자 제시)**: web inngest `applyModalPayload`(`functions.ts:479-486`)가 `status: error`에서도 `clips`를 읽어 `persistGeneratedClips`가 메타데이터 붙은 행을 만들게 하는 것 — BUG-02→FEAT-21 전례. 등재 안 되면 BUG-08의 backend 절반은 사용자 가시 효과 없이 남는다. 「못 덮는 범위」 → 원장 BUG-08 절 4줄(배포 대기).

## 배포 (2026-08-29 11:25 KST, 메인 루프 — 사용자 승인 "modal deploy해")

`cd apps/backend && PYTHONUTF8=1 modal deploy main.py`(venv `C:\Users\hamso\venvs\apch-backend`, modal 1.2.1) → `App deployed in 6.437s`, mount `PythonPackage:s3_upload_policy, translation_fallback, temp_cleanup_policy, error_callback`, web function `process_video` 재등록(`https://sangeok--ai-podcast-clipper-process-video.modal.run`). BUG-04·BUG-08 묶어 1회. 원장 절 머리말 "배포 완료", 번들 줄에 실측 기재 — 컨테이너 import·실동작은 다음 실사용 실행에서(BUG-03 전례).

## 후속 백로그 등재 (2026-08-29, 메인 루프)

BUG-08 인수 시 「범위 밖 의존」으로 남긴 web 절반을 **FEAT-28**로 `TASK_BACKLOG.md`에 등재(관측/진단(코드 확정)/수정 방향(추정)/범위 밖 의존 분리). area `apps/web/src/inngest + apps/web/src/fsd/entities/clip`, source에 인수 기록 참조. 이로써 BUG-08의 backend 절반이 "clip_results를 보내지만 아무도 안 쓰는" 상태로 증발하지 않는다(BUG-02 웹 절반이 등재 누락으로 한때 그랬던 실측 사례의 반복 방지).
