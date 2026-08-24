# BUG-03 — S3 업로드 실패 에러 핸들링 (구현)

## 2026-08-25 — 구현 (게이트②, 보드 커밋 70c5f5b에서 `구현승인` 확정)

계획서(`docs/plans/BUG-03.md`, 검증 클린 패스: 메인 루프 2라운드 + plan-verifier 독립 무편집 1라운드)를 파일에서 재독하고 스케치를 그대로 이식했다. 착수 전 「현재 동작」이 코드와 일치함을 실측 확인했다 — 업로드 3곳(`main.py:773`·`784`·`1002-1007`), 이미지 체인 `.add_local_dir("asd", "/asd", copy=True))`(:57), 포괄 `except`(:1134)·`clips: []`(:1145)·`finally shutil.rmtree`(:1151-1154)가 계획서 기술과 어긋남 없음. `import time`(:7)·`import boto3`(:14)도 존재 확인.

### 변경 파일 (계획서 「고칠 파일」 표와 1:1)

| 파일 | 변경 | 상태 |
| --- | --- | --- |
| `apps/backend/s3_upload_policy.py` | 순수 판단 모듈 신규 (stdlib-only) | 신규 |
| `apps/backend/test_s3_upload_policy.py` | 위 모듈 unittest 신규 | 신규 |
| `apps/backend/main.py` | import 블록 + 헬퍼 2개 + 업로드 3곳 래핑 + 이미지 체인 `add_local_python_source` | 수정 |

표 밖 파일은 건드리지 않았다. `asd/`·`requirements.txt` 무변경. `modal deploy`/`modal run` 미실행.

### main.py 편집 지점 (5곳)

1. **import 블록** — `from google import genai` 아래에 `botocore.exceptions`(BotoCoreError, ClientError) + `boto3.exceptions`(S3UploadFailedError) + `s3_upload_policy`의 순수 함수 4개를 그룹 import로 추가.
2. **이미지 체인** — `.add_local_dir("asd", "/asd", copy=True)` 뒤에 `.add_local_python_source("s3_upload_policy")` 이어 붙이고 닫는 괄호 이동.
3. **헬퍼 `_classify_s3_exception`** — `process_clip` 정의 직전에 배치. S3UploadFailedError 원인 사슬(`__cause__ or __context__`)을 풀어 (error_code, transport_error)로 변환.
4. **헬퍼 `_s3_call_with_retry`** — 헬퍼 3 바로 뒤. 재시도 루프·`time.sleep`·최종 실패 시 `format_upload_error`로 맥락 담아 `RuntimeError(...) from exc`.
5. **업로드 3곳 래핑** — 영어(`upload`, english_s3_key)·한글(`upload`, korean_s3_key)·전사(`put_object`, transcript_key)를 각각 `_s3_call_with_retry(lambda: ..., operation=..., s3_key=...)`로 감쌈.

### 스케치 대비 차이

없음. 분기·조건·리터럴 값·사용자에게 보이는 문구(재시도 로그 `f"S3 {operation} failed (attempt {attempt}, key {s3_key}): {exc}; retrying in {wait:.1f}s"`, 최종 메시지 `format_upload_error` 반환값)를 스케치대로 바이트 이식했다. §2 분류기의 원인 사슬 `exc.__cause__ or exc.__context__`, RETRIABLE_ERROR_CODES 집합, 백오프 지수 클램프(`min(attempt - 1, 30)`)까지 그대로. 순수 모듈 본문·헬퍼 두 개·래핑 세 개 모두 계획서 코드와 일치.

테스트 파일만 스케치가 코드를 주지 않아 「테스트」 절 명세대로 자작했다 — 명세가 지목한 단언을 전부 포함(transport_error 항상 재시도·알려진 일시코드·영구코드 False·None+False → False / should_retry 소진·초과·비재시도 / next_backoff 1·2·4·cap 클램프·**attempt=5000 OverflowError 방어**·비양수 0 / format_upload_error 4필드 포함). 돌연변이 M5가 살아남았던 구멍(attempt=5000 클램프)을 `test_huge_attempt_does_not_overflow`로 명시적으로 밟는다.

### 검증 (저장소 루트에서 직접 실행)

```
$ python -m unittest discover -s apps/backend -p "test_*.py"
...............
----------------------------------------------------------------------
Ran 15 tests in 0.001s

OK

$ python -m py_compile apps/backend/main.py
(exit 0)
```

`Ran 15 tests ... OK` — N=15(0 아님). 15 = 신규 test_s3_upload_policy.py의 테스트 메서드 수(IsRetriableError 4 + ShouldRetry 5 + NextBackoff 4 + FormatUploadError 1 + RetriableSetSanity 1). apps/backend에 다른 test_*.py 없음(discovery가 이 파일만 수집). 계획서 「테스트」 절이 약속한 "약 15개"를 충족. `py_compile` exit 0 — main.py 문법 정상.

### 못 덮는 범위 (stdlib 러너 불가 — `modal run`으로 사용자 확인 필요)

계획서 「못 덮는 범위」·「범위 밖 의존」 그대로 남는다:

- 실제 `upload_file`/`put_object` I/O와 재시도 후 실제 성공/실패, `_s3_call_with_retry`의 루프·`time.sleep`·`_classify_s3_exception`의 실제 boto/botocore 예외 타입 매핑(ClientError.response 구조·BotoCoreError 하위 타입·**S3UploadFailedError 원인 사슬 풀기**). 순수 모듈은 (코드, transport) 평문 입력만 받으므로 이 추출 배선은 러너로 덮이지 않는다. 분류 로직 자체는 검증 라운드에서 설치된 boto3 1.43.62로 재생 확인됨(upload_file+SlowDown → 재시도 판정).
- Modal 이미지에 `s3_upload_policy`가 실제로 번들돼 컨테이너에서 import되는지(`add_local_python_source` 효과) — `ModuleNotFoundError` 여부는 컨테이너 실행으로만 확정.
- `clips: []` 부분 성공 유실(`main.py:1145`)은 이 계획 범위 밖(웹 inngest 콜백 계약, `apps/web` 담당 — 별도 항목).

배포·실제 실행 검증은 사용자가 `modal run`으로 수행한다.
