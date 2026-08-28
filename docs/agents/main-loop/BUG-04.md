# BUG-04 — 메인 루프 기록 (게이트 결정·검증 라운드)

## 선정과 게이트① 개방 (2026-08-29)

pm이 미결 0건 상태에서 BUG-08과 함께 선정(`b493757`). 사용자가 세션에서 "둘 다 계획 지시"로 게이트① 개방 — 메인 루프가 보드를 편집했고 결정은 사용자의 것이다. 병렬 미결: BUG-08(같은 담당 backend-dev, 계획 단계는 여러 건 동시 가능).

- 요구 원천: `TASK_BACKLOG.md`의 BUG-04 `source` = "README Known Issues" — 원문은 `README.md:352` "Temporary directory cleanup regardless of success" **한 줄**이다. 관측도 진단도 없다. 계획서가 「문제」에서 실패 모드를 증거로 세워야 하고, 백로그가 지목한 것과 코드가 어긋나면 그 사실을 적는다(템플릿 규칙).

backend-dev에 디스패치한다. 메인 루프가 코드를 읽고 잡은 핵심 판단 지점:

- **무엇이 문제인가부터**: `main.py:1023` `base_dir = /tmp/<run_id>`(실행마다 고유), `:1215-1218` `finally: shutil.rmtree(base_dir, ignore_errors=True)`. 성공·실패 무관 정리는 그 자체로는 결함이 아니다(Modal 컨테이너가 warm 재사용될 때 `/tmp` 누적을 막는다). README가 "limitation"으로 적은 이유를 계획서가 특정해야 한다 — 후보: (a) 실패 시 중간 산출물(다운로드 원본·전사·크롭 출력)이 사라져 진단 불가, (b) 재시도(`attempt`) 시 원본 재다운로드 비용, (c) 정리 실패가 조용히 삼켜짐(`ignore_errors=True`). 근거 없이 하나를 고르지 말고, 코드·README·BUG-03/05 기록에서 뒷받침되는 것만 문제로 세운다. **현재 동작이 옳다는 결론도 유효한 결과다** — 그러면 코드 변경 0에 README 항목 정리(루트 파일 = 메인 루프 handoff)로 끝나며 그것을 「고칠 파일」·「범위 밖 의존」에 그대로 적는다.
- **Modal 실행 모델**: 컨테이너는 임시라 실패 후 보존해도 사람이 열어볼 경로가 없다 — 보존이 가치를 가지려면 S3로 진단 번들을 올리거나(범위 확장·과금) `modal run` 로컬 디버그 플래그(`KEEP_TEMP_ON_FAILURE` 환경변수)로 한정해야 한다. 어느 쪽이든 정책은 순수 함수(`should_cleanup(succeeded, keep_on_failure)` 류)로 빼고 `main.py`엔 배선만 남긴다(`backend-dev.md` 순수 모듈 규칙, `s3_upload_policy.py`·`translation_fallback.py`가 원형).
- **`analyze`/`render` 두 모드**(`:1045`·`:1059`·`:1123`): analyze는 전사를 S3에 올리고 끝나 정리해도 손실이 없고, render는 원본을 다시 받는다 — 모드별로 정리 정책이 달라야 하는지 계획서가 답한다.
- **재시도와 디스크**: 정리를 미루면 warm 컨테이너에서 실패가 반복될 때 `/tmp`가 찬다(디스크 한도는 Modal 이미지 설정). "보존"을 택하면 상한·만료 규칙이 필요하다.
- **테스트**: stdlib `unittest`(`python -m unittest discover -s apps/backend -p "test_*.py"`)로 정책 함수만 덮고, 실제 `rmtree`·컨테이너 동작은 「못 덮는 범위」. `main.py` import 금지(torch).
- **범위 밖**: `modal deploy`·`modal run`은 사용자 몫(`backend-dev.md:81`). README 수정은 backend-dev 쓰기 범위 밖 — 메인 루프 handoff.

## 필수 검증 경로 확정 · 검증 1라운드 (2026-08-29, 메인 루프)

경로: 1 인용 전수 · 2 스케치 추출·실행(순수 모듈 + `main.py` before/after 적용 → `unittest`·`py_compile`) · 3 before/after 기계 적용 · 4 여집합(앵커 유일성·"translation_fallback이 마지막 순수 import"·재시도 시 새 uuid) · 5 돌연변이 · 7 음성(`KEEP_TEMP_ON_FAILURE` 미설정 → 성공·실패 모두 정리 = 현 동작 불변) · 9 구조(AST — `succeeded = True`가 try 본문 마지막 문장, `finally`가 정책 함수 호출). 6(외부 신호 없음)·8(화면 없음) 트리거 없음.

하니스: 스크래치패드 `bugs/`(python 펜스의 `# before`/`# after` 분리 적용기, 명세→unittest, 돌연변이, 인용 덤프, AST 검사). 결과 — 인용 17+4 전부 내용 일치 · before 5쌍 + 신규 1 = 6/6 · 단독 적용 `unittest` **47 OK**(40+7)·`py_compile` OK·순수 모듈 torch 없이 import OK · AST: try 본문 마지막 = `succeeded = True`, `finally`가 `should_cleanup_temp_dir(succeeded, keep_temp_on_failure)` 호출 · 돌연변이 5/5 사멸(truthy `on` 제거·strip 제거·isinstance 가드 제거·실패 정책 반전·성공 시 보존) · **BUG-08과 합본 적용**(`:73` 앵커를 두 모듈 포함으로 합침) `unittest` 47 OK·`py_compile` OK·AST 양쪽 조건 동시 만족 — 두 계획이 공존한다(계획서의 "나중 구현 시 재독" 주석대로). 트리 복원 확인.

**결함 0건.** 판정: 메인 루프 라운드 무소득 → `plan-verifier` 디스패치 자격.
