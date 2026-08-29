# BUG-04 — 임시 디렉토리 정리가 파이프라인 성공/실패 여부와 무관하게 항상 실행됨

## 2026-08-29 구현 (backend-dev)

계획서: `docs/plans/BUG-04.md` (구현승인, 클린 패스 2026-08-29 — plan-verifier 3사이클째).
파일에서 다시 읽어 승인 계약대로 구현. B-3 「현재 동작」 앵커 전부 코드와 일치 확인(어긋남 없음).

### 고친 파일 (전수)

| 파일 | 변경 |
| --- | --- |
| `apps/backend/temp_cleanup_policy.py` (신규) | 정리 여부·환경변수 파싱을 stdlib만으로 판정하는 순수 함수 2개(`parse_keep_on_failure`, `should_cleanup_temp_dir`). backend-purity-contract 준수(torch/boto3/cv2/pysubs2/modal 무접촉, 파일·network·GPU 무접촉) |
| `apps/backend/test_temp_cleanup_policy.py` (신규) | 위 순수 함수의 `unittest.TestCase` 2클래스·6 test 메서드·18 단언. `main.py` 무접촉 |
| `apps/backend/main.py` | 6지점 편집(아래) |

`main.py` 편집 6지점 (계획서 스케치 2~6 그대로):

1. import 추가 — `translation_fallback` import 블록 아래에 `from temp_cleanup_policy import (parse_keep_on_failure, should_cleanup_temp_dir)` (스케치 2)
2. 이미지 체인 — `add_local_python_source("s3_upload_policy", "translation_fallback")` → 끝에 `"temp_cleanup_policy"` 추가 (스케치 3, `main.py:73` 원본 확인 후 적용 — BUG-08 미구현이라 원본 그대로)
3. `_do_process_video` 진입부 — `analyze_payload = None` 아래에 `succeeded = False` / `keep_temp_on_failure = parse_keep_on_failure(os.getenv("KEEP_TEMP_ON_FAILURE"))` 배선 (스케치 4)
4. try 본문 끝 — 성공 콜백(`"clips": clip_results` … `timeout=30)`) 뒤, `except` 앞 12칸에 `succeeded = True` 삽입 (스케치 5). if/else(analyze·auto/render) 밖 12칸이라 두 성공 경로 모두에서 True, 예외 시 False 유지 확인
5. `finally` — `should_cleanup_temp_dir(succeeded, keep_temp_on_failure)`가 True면 기존대로 `shutil.rmtree`, False면 `Preserving temp dir for debugging after failure:` 출력하고 보존 (스케치 6)

### 스케치 대비 차이

없음. 분기 순서·조건·리터럴 값·출력 문구 전부 스케치와 바이트 일치. 순수 함수 본문도 스케치 그대로.
기본값(`KEEP_TEMP_ON_FAILURE` 미설정 → `keep_temp_on_failure=False`)에서 성공·실패 모두 `should_cleanup_temp_dir`이 True → **프로덕션 동작은 지금과 동일**.

### 검증 (실제 출력)

```
$ python -m unittest discover -s apps/backend -p "test_*.py"
..............................................
----------------------------------------------------------------------
Ran 46 tests in 0.001s

OK
```
기존 40 + 신규 6 test 메서드(= 18 단언) = 46. 전부 통과, N≠0.

```
$ python -m py_compile apps/backend/main.py
py_compile EXIT 0
```

### 못 덮은 범위 (stdlib 러너로 확인 불가 — `modal run`으로 사용자 확인 필요)

- `finally`의 실제 `shutil.rmtree`·`base_dir.exists()` I/O와 보존 시 실제로 디렉터리가 남는지.
- `succeeded` 플래그가 try 본문 끝에서만 True가 되는 제어흐름(예외 시 False 유지) — 순수 함수 밖 `main.py` 배선.
- `os.getenv("KEEP_TEMP_ON_FAILURE")`가 컨테이너 환경에서 읽히는지, 이미지에 `temp_cleanup_policy`가 번들돼 import되는지(`add_local_python_source` 효과).
- `modal deploy`·`modal run`은 backend-dev가 실행하지 않음(사용자 몫).

### handoff (메인 루프 인수 시 처리 — backend-dev 쓰기 범위 밖)

"성공/실패 무관 정리"를 주장하는 문서 표면 3곳. 구현 후 셋 다 더는 무조건이 아니므로(로컬 디버그에서 `KEEP_TEMP_ON_FAILURE`로 보존 가능) 메인 루프가 갱신/제거한다. 구현 단계에서 세 파일 무접촉(2026-08-29 grep으로 줄 재확인):

- `README.md:352` — `- Temporary directory cleanup regardless of success` (`:349` "Known Issues & Limitations" 절). 루트 문서 → FEAT-19 전례로 메인 루프.
- `README.ko.md:345` — `- 성공/실패와 무관하게 임시 디렉토리 정리가 수행됨` (`:342` "알려진 이슈 & 제한사항" 절). 루트 문서 → 메인 루프.
- `apps/backend/CLAUDE.md:217` — `- Temporary directories cleaned up regardless of processing success` (`:214` "Current Known Issues" 절). backend-dev 정의(`.claude/agents/backend-dev.md`)가 "직접 고치지 말고 비고로 보고"로 지정한 읽기 전용 파일.
