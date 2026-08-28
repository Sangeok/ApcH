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

## 검증 2라운드 — `plan-verifier` 독립 패스 1사이클 (2026-08-29)

중립 브리핑(항목ID·계획서 경로·필수 경로 1·2·3·4·5·7·9, 6·8 트리거 없음). 검증자는 worktree add가 처음에 실패해(main 워크트리가 `dev`를 이미 체크아웃) 스크래치패드 하니스로 조립했고 저장소 무변경.

**결함 1건(문서 위생)**: 「테스트 › 덮는 것」 머리글 "약 12개 단언"이 열거 집합(truthy 6·falsy 5·비문자열 3 = 14, `should_cleanup_temp_dir` 4 → **18**)과 다름. 구현 지장 없음(구현자는 불릿을 따른다). → "18개 단언(14+4)"로 정정. 나머지 경로 무소득: 인용 전부 일치(HEAD 전진 `4c640dc→ba64e07`가 대상 파일 무변경임을 diff로 확인) · 순수 모듈 1429B 추출·명세 6메서드 OK·기존 40 OK·`py_compile` OK·import 0건 · before 5/5(CRLF 정규화 후) · 여집합 5건(uuid 재사용 경로 없음, `timeout=30)` 3곳 중 앵커 1곳, 순수 import 둘뿐, 재시도 새 uuid, keep=False 관측 불변) · 돌연변이 **8/8** · 음성 진리표 · AST 4조건.

정정 후 2사이클 재디스패치(브리핑 동일, 결함 정보 없음).

## 검증 3라운드 — `plan-verifier` 독립 패스 2사이클 (2026-08-29)

중립 브리핑(HEAD `e809772`, `--detach` worktree 안내). 트리 청결 검산 통과. 경로 무소득: 인용 전건 일치 · 조립 `unittest` **58 OK**(40+18) · `py_compile` · 순수 import · before 5/5 정확 1회(`"clips": clip_results` 2곳 중 4줄 앵커는 유일) · 여집합 6건 · 돌연변이 **8/8** · 음성 결정표(env 11값×성공/실패 — PRESERVE는 opt-in+실패에서만) · AST 5/5.

**결함 1건(문서 위생, 전파 불완전)**: "성공/실패 무관 정리"를 주장하는 문서 표면이 `README.md:352` 외에 `README.ko.md:345`·`apps/backend/CLAUDE.md:217`에도 있는데 계획서 「범위 밖 의존」이 하나만 handoff — FEAT-10 ⑳("handoff가 절반만 지시")과 같은 부류. 메인 루프가 여집합을 재열거(grep 전수, 정확히 셋)하고 세 표면 전부를 handoff로 적었다. 검증자는 backend CLAUDE.md가 backend-dev 쓰기 범위 안이라 봤으나 `backend-dev.md:33`이 읽기 전용("직접 고치지 말고 비고로")으로 정하므로 셋 다 메인 루프 몫 — 계획서에 그 근거까지 명시.

3사이클 재디스패치. 보드 정지 규칙: 3사이클 연속 결함이면 `보류` — 두 결함 모두 문서 위생(계획서 수정으로 풀리는 부류)이었다.

## 검증 4라운드 — `plan-verifier` 독립 무편집 패스 (2026-08-29, 3사이클째)

중립 브리핑(HEAD `0bd6d5d`). 트리 청결·worktree 잔존 없음 검산. **결함 0건.** 경로별: ① 인용 전부 일치(README 두 벌·backend CLAUDE.md·`backend-dev.md:33`·functions.ts:286 포함, after 블록이 쓰는 `os`·`uuid`·`pathlib`·`shutil` import 실재까지) ② 순수 모듈 추출 → `ast.parse`·import 노드 0·명세 18단언 6메서드 OK·기존 40 OK·`py_compile` ③ before 5/5 정확 1회 ④ 여집합 6건 — "정확히 셋"을 같은 grep + 광역 grep 여집합(추가 히트는 전부 제외 범주)으로 확증 ⑤ 돌연변이 **9/9** ⑦ 진리표(미설정·falsy 4값 → 성공·실패 CLEAN, 스위치 6값 → 실패만 PRESERVE), `else` 분기 도달 불가 → 기본값 바이트 동일 ⑨ AST 4/4.

**판정**: 독립 무편집 클린 패스 1회(3사이클째) → 보드 정지 규칙 충족. `검증:` 줄 기록. **게이트②(구현승인) 대기.** 두 사이클의 결함은 모두 문서 위생(단언 수·handoff 표면 누락)이었고 코드 스케치·테스트 명세는 1사이클부터 무결했다.
