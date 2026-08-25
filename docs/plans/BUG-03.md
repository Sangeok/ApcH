# BUG-03: S3 업로드 실패에 대한 에러 핸들링 부재

agent: backend-dev

## 현재 동작

파이프라인은 S3에 세 번 **업로드**한다. 세 곳 모두 호출을 감싸는 try/except·재시도가 없다.

- `main.py:773` — 영어 클립: `s3_client.upload_file(str(english_output_path), "ai-podcast-clipper-hamsoo", english_s3_key)`.
- `main.py:784` — 한글 클립: `s3_client.upload_file(str(korean_output_path), "ai-podcast-clipper-hamsoo", korean_s3_key)`.
- `main.py:1002-1007` — analyze 모드 전사 저장: `s3_client.put_object(Bucket="ai-podcast-clipper-hamsoo", Key=transcript_key, Body=transcript_segments_json.encode("utf-8"), ContentType="application/json")`.

호출 경로:

- `process_clip()`은 클립마다 `main.py:1104`의 루프 안에서 호출된다. 각 클립은 성공하면 `clip_results`에 누적된다(`main.py:1122`).
- 이 루프와 세 업로드는 모두 바깥 `try`(`main.py:980`) 안에 있다.
- 업로드가 예외를 던지면 그 예외는 `process_clip` → 클립 루프 → 바깥 try를 빠져나가 `main.py:1134`의 **포괄 `except Exception`**에서 잡힌다.
- 그 포괄 처리(`main.py:1134-1149`)는 (1) `str(e)`를 print하고, (2) 콜백이 있으면 에러 콜백을 보내는데 그 페이로드의 `clips`는 **하드코딩된 `[]`**다(`main.py:1145`) — 이미 누적된 `clip_results`를 버린다, (3) 예외를 그대로 re-raise한다(`main.py:1149`).
- `finally`(`main.py:1151-1154`)가 `shutil.rmtree(base_dir, ...)`로 임시 디렉터리를 지운다. 이건 BUG-04의 대상이며 이 계획의 범위 밖이다.

즉 지금은 업로드 **고유의** 처리가 없다. 업로드가 실패하면 곧바로 배치 전체가 포괄 catch로 떨어지고, 원본 boto 예외의 `str(e)`가 어느 키·어느 단계였는지 맥락 없이 그대로 콜백에 실린다.

Modal 이미지 정의(`main.py:44-57`)는 `.add_local_dir("asd", "/asd", copy=True)`만 로컬 자산으로 명시 포함하고, 사이드 Python 모듈에 대한 명시적 포함(`add_local_python_source`)은 없다.

## 문제

백로그(`TASK_BACKLOG.md` BUG-03, source: README Known Issues "No error handling for failed S3 uploads")가 지목한 대로, S3 업로드 호출(`main.py:773`·`784`·`1002`) 어디에도 재시도나 맥락 있는 실패 처리가 없다. 그 결과 **일시적** 업로드 실패(네트워크 순단, `SlowDown`/`503` 스로틀, 연결 타임아웃)가 즉시 배치 전체를 중단시킨다 — 재시도 한 번 없이. 게다가 여러 클립 중 뒤쪽 업로드가 실패하면 앞서 S3에 이미 올라간 클립들이 리포트에서 `clips: []`로 사라지고(고아 객체만 S3에 남음), 실패 원인은 불투명한 raw boto 문자열로만 전달된다.

이 계획은 **업로드 호출 자체의 처리 부재**만 다룬다 — 재시도(일시적 실패)와 최종 실패 시 맥락 있는 오류를 더한다. 부분 성공을 리포트에서 버리는 `clips: []`(`main.py:1145`) 문제는 웹 콜백 계약(`apps/web`의 inngest 핸들러가 소비)을 건드리므로 여기서 고치지 않고 「범위 밖 의존」에 기록한다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/s3_upload_policy.py` `(신규)` | 재시도 여부·백오프 초·오류 메시지를 stdlib만으로 계산하는 순수 함수 |
| `apps/backend/test_s3_upload_policy.py` `(신규)` | 위 순수 함수의 `unittest` 케이스 |
| `apps/backend/main.py` | 순수 모듈 import + 얇은 재시도 래퍼/예외 분류 헬퍼 추가 + 업로드 3곳(`773`·`784`·`1002`)을 래퍼로 감싸기 + 이미지 체인에 `add_local_python_source("s3_upload_policy")` |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다.

## 구현 스케치

### 1. 새 순수 모듈 `apps/backend/s3_upload_policy.py` (본문 전체)

판단(재시도할지·얼마나 기다릴지·최종 메시지)은 전부 이 모듈이 한다. boto3·네트워크·파일에 닿지 않는다.

```python
"""S3 업로드 재시도 정책 — 순수 판단 로직 (stdlib만).

main.py의 얇은 I/O 래퍼가 이 함수들을 호출해 "재시도할지 / 얼마나 기다릴지 /
최종 실패 메시지"를 결정한다. boto3·network·GPU·파일에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_BACKOFF_BASE = 1.0
DEFAULT_BACKOFF_CAP = 30.0

# 재시도할 가치가 있는(일시적) S3 오류 코드.
# 영구 오류(AccessDenied·NoSuchBucket·InvalidAccessKeyId 등)는 여기 없다 → 재시도 안 함.
RETRIABLE_ERROR_CODES = frozenset({
    "SlowDown",
    "RequestTimeout",
    "RequestTimeTooSkewed",
    "InternalError",
    "ServiceUnavailable",
    "ThrottlingException",
    "Throttling",
    "RequestLimitExceeded",
    "500", "502", "503", "504",
})


def is_retriable_error(error_code, transport_error=False):
    """이 업로드 실패가 재시도할 가치가 있는가.

    - transport_error(연결·타임아웃 등 응답 코드 없는 전송 실패)는 항상 재시도 대상.
    - 그 외에는 error_code가 알려진 일시적 코드일 때만.
    """
    if transport_error:
        return True
    if error_code is None:
        return False
    return error_code in RETRIABLE_ERROR_CODES


def should_retry(attempt, retriable, max_attempts=DEFAULT_MAX_ATTEMPTS):
    """attempt(1-기반)에서 재시도해야 하는가.

    재시도 가능하고(retriable), 아직 시도 횟수가 남아 있을 때만 True.
    attempt가 max_attempts에 도달하면 소진 → False.
    """
    return bool(retriable) and attempt < max_attempts


def next_backoff(attempt, base=DEFAULT_BACKOFF_BASE, cap=DEFAULT_BACKOFF_CAP):
    """attempt(1-기반) 실패 후 다음 재시도까지 기다릴 초. 지수 증가, cap으로 상한.

    attempt<=0 → 0.0. attempt=1 → base, 2 → 2*base, 3 → 4*base ...
    지수는 30으로 클램프해 OverflowError를 막는다(실사용 attempt는 max_attempts로 제한됨).
    """
    if attempt < 1:
        return 0.0
    exp = min(attempt - 1, 30)
    return min(cap, base * (2 ** exp))


def format_upload_error(operation, s3_key, attempts, last_error):
    """최종 실패 시 사람이 읽을 오류 메시지. 콜백의 str(e)가 이 문자열을 담는다."""
    return (
        f"S3 {operation} failed for key '{s3_key}' "
        f"after {attempts} attempt(s): {last_error}"
    )
```

### 2. `main.py` — 순수 모듈 import + 얇은 래퍼 (신규, 모듈 레벨)

`process_clip`(`main.py:690`) 바로 위에 아래 헬퍼와 import를 둔다. 이 래퍼는 boto 호출·`time.sleep`·예외 분류만 하는 **I/O 껍데기**다(테스트 불가 부분). 판단은 순수 모듈에 위임한다.

`main.py` 상단 import 블록(`main.py:1-23`)에 추가:

```python
from botocore.exceptions import BotoCoreError, ClientError
from boto3.exceptions import S3UploadFailedError
from s3_upload_policy import (
    is_retriable_error,
    should_retry,
    next_backoff,
    format_upload_error,
)
```

`process_clip` 정의 직전에 추가:

```python
def _classify_s3_exception(exc):
    """boto/botocore 예외를 순수 정책이 이해하는 (error_code, transport_error)로 변환.

    주의 — upload_file은 ClientError를 그대로 던지지 않는다: 설치된 boto3(1.43.62 실측,
    S3Transfer.upload_file 소스)가 ClientError를 잡아 S3UploadFailedError로 다시 던진다
    (`from` 절 없이 — 원인은 __cause__가 아니라 __context__에만 남는다). 그래서
    S3UploadFailedError는 원인 사슬(__cause__ 우선, 없으면 __context__)을 풀어 원인
    기준으로 분류해야 클립 업로드 두 곳(주 경로)의 일시 오류가 재시도된다.
    __cause__/__context__를 둘 다 보는 이유: requirements.txt의 boto3는 핀이 없어
    `from e`로 던지는 판으로 바뀌어도 동작해야 한다.
    """
    if isinstance(exc, S3UploadFailedError):
        cause = exc.__cause__ or exc.__context__
        if isinstance(cause, ClientError):
            return cause.response.get("Error", {}).get("Code"), False
        if isinstance(cause, BotoCoreError):
            return None, True
        return None, False  # 원인 불명 — 재시도 안 함, 즉시 맥락 raise
    if isinstance(exc, ClientError):
        code = exc.response.get("Error", {}).get("Code")
        return code, False
    if isinstance(exc, BotoCoreError):
        # EndpointConnectionError·ConnectTimeoutError·ReadTimeoutError 등 응답 코드 없는 전송 실패
        return None, True
    # 그 밖의 비-boto 예외는 이 래퍼가 잡지 않으므로 여기 오지 않는다
    return None, False


def _s3_call_with_retry(do_call, *, operation, s3_key):
    """업로드성 S3 호출을 재시도 정책에 따라 수행. 최종 실패는 맥락을 담아 raise."""
    attempt = 0
    while True:
        attempt += 1
        try:
            return do_call()
        except (BotoCoreError, ClientError, S3UploadFailedError) as exc:
            code, transport = _classify_s3_exception(exc)
            if should_retry(attempt, is_retriable_error(code, transport)):
                wait = next_backoff(attempt)
                print(f"S3 {operation} failed (attempt {attempt}, key {s3_key}): {exc}; retrying in {wait:.1f}s")
                time.sleep(wait)
                continue
            raise RuntimeError(format_upload_error(operation, s3_key, attempt, exc)) from exc
```

`time`·`boto3`는 이미 import돼 있다(`main.py:7`·`14`). `botocore`는 boto3의 의존이라 컨테이너에 항상 존재한다.

### 3. `main.py` — 업로드 3곳을 래퍼로 감싸기 (before/after)

`main.py:773` (영어 업로드):

```python
# before
        s3_client.upload_file(str(english_output_path), "ai-podcast-clipper-hamsoo", english_s3_key)
# after
        _s3_call_with_retry(
            lambda: s3_client.upload_file(str(english_output_path), "ai-podcast-clipper-hamsoo", english_s3_key),
            operation="upload",
            s3_key=english_s3_key,
        )
```

`main.py:784` (한글 업로드):

```python
# before
        s3_client.upload_file(str(korean_output_path), "ai-podcast-clipper-hamsoo", korean_s3_key)
# after
        _s3_call_with_retry(
            lambda: s3_client.upload_file(str(korean_output_path), "ai-podcast-clipper-hamsoo", korean_s3_key),
            operation="upload",
            s3_key=korean_s3_key,
        )
```

`main.py:1002-1007` (전사 저장, analyze 모드):

```python
# before
                s3_client.put_object(
                    Bucket="ai-podcast-clipper-hamsoo",
                    Key=transcript_key,
                    Body=transcript_segments_json.encode("utf-8"),
                    ContentType="application/json",
                )
# after
                _s3_call_with_retry(
                    lambda: s3_client.put_object(
                        Bucket="ai-podcast-clipper-hamsoo",
                        Key=transcript_key,
                        Body=transcript_segments_json.encode("utf-8"),
                        ContentType="application/json",
                    ),
                    operation="put_object",
                    s3_key=transcript_key,
                )
```

### 4. `main.py` — 이미지 체인에 순수 모듈 포함 (before/after)

Modal 1.x는 사이드 로컬 Python 모듈을 자동 포함하지 않는다(자동마운트 기본 비활성). 새 모듈이 컨테이너에서 `ModuleNotFoundError` 없이 import되도록 이미지 체인 끝(`main.py:57`)에 명시 포함한다.

```python
# before
    .add_local_dir("asd", "/asd", copy=True))
# after
    .add_local_dir("asd", "/asd", copy=True)
    .add_local_python_source("s3_upload_policy"))
```

## 테스트

`apps/backend/test_s3_upload_policy.py` — `s3_upload_policy`만 import(stdlib-only, torch·boto3 불필요). `main.py`는 import하지 않는다.

**덮는 것** (약 15개 단언):

- `is_retriable_error`:
  - `transport_error=True`이면 코드와 무관하게 True (예: 코드 None·"AccessDenied"에서도)
  - 코드가 `RETRIABLE_ERROR_CODES`에 있으면 True (`"SlowDown"`, `"503"`, `"ServiceUnavailable"`)
  - 코드가 없는 코드(`"AccessDenied"`·`"NoSuchBucket"`)면 False
  - `error_code=None`·`transport_error=False`면 False
- `should_retry`:
  - retriable=True·attempt<max → True (attempt=1, max=3)
  - retriable=True·attempt==max → False (소진)
  - retriable=True·attempt>max → False
  - retriable=False → attempt=1이어도 False
- `next_backoff`:
  - attempt=1 → 1.0, attempt=2 → 2.0, attempt=3 → 4.0
  - 큰 attempt(예: 100) → cap(30.0)으로 클램프
  - **아주 큰 attempt(예: 5000) → 30.0** — 지수 클램프의 존재 이유를 밟는 경계다. attempt=100은 `2**99`가 float로 표현돼 cap이 대신 막아주지만, 클램프를 빼면 `2**4999`의 float 변환이 OverflowError를 던진다(검증 돌연변이 M5가 100짜리 단언만으로 살아남은 구멍)
  - attempt<=0 → 0.0
- `format_upload_error`:
  - 반환 문자열에 operation·s3_key·attempts·last_error가 모두 포함됨

**못 덮는 범위** (stdlib 러너로 확인 불가 — `modal run`으로 사용자 확인 필요):

- 실제 `upload_file`/`put_object` I/O와 재시도 후 실제 성공/실패.
- `_s3_call_with_retry`의 루프·`time.sleep`·`_classify_s3_exception`의 실제 boto/botocore 예외 타입 매핑(`ClientError.response` 구조, `BotoCoreError` 하위 타입, **S3UploadFailedError 원인 사슬 풀기**). 순수 모듈은 (코드, transport) **평문 입력**만 받으므로 그 추출 배선은 이 러너로 덮이지 않는다. 분류 로직 자체는 검증 라운드에서 설치된 boto3 1.43.62로 재생 확인됐다(upload_file+SlowDown → 재시도 판정) — 남는 것은 main.py 배선과 컨테이너 실행이다.
- Modal 이미지에 `s3_upload_policy` 모듈이 실제로 번들돼 컨테이너에서 import되는지(`add_local_python_source` 효과).

## 범위 밖 의존

- **`clips: []` 부분 성공 유실**(`main.py:1145`): 여러 클립 중 뒤쪽 업로드가 실패하면 앞서 업로드된 클립들이 에러 콜백에서 버려진다. 이를 고치려면 에러 콜백 페이로드에 부분 `clip_results`를 실어야 하는데, 그 값을 소비하는 쪽은 `apps/web`의 inngest 콜백 핸들러다(담당 범위 밖). 계약 변경이므로 이 계획에서 하지 않는다 — 별도 항목으로 다뤄야 한다.
- **`modal deploy`·`modal run` 검증**: 배포와 실제 실행 검증은 사용자만 한다. 이 계획의 구현은 stdlib `unittest` + `py_compile`까지만 자체 검증할 수 있고, 컨테이너에서의 실제 업로드 재시도 동작·이미지 번들링은 `modal run`으로 사용자가 확인해야 한다.

## 대안

- **분류 없이 모든 실패를 무조건 재시도**: 더 단순하지만 영구 오류(`AccessDenied` 등)에서도 백오프를 낭비하고(약 7초), 재시도 가치 판단이라는 검증 가능한 순수 로직을 잃는다 — 순수 모듈 게이트의 취지에 어긋나 기각.
- **클립 루프 안에서 실패를 잡아 부분 성공으로 리포트**: 배치 회복력은 좋아지지만 콜백 계약(`apps/web`)을 건드려 범위를 넘는다. 기각(위 「범위 밖 의존」).
- **botocore 내장 재시도(`Config(retries=...)`)에만 의존**: boto3 클라이언트는 이미 일부 스로틀/5xx를 HTTP 계층에서 재시도한다. 그러나 그 계층은 (1) 검증 가능한 이음새를 주지 않고, (2) 최종 실패 시 어느 키·단계였는지 맥락 있는 오류를 만들어 주지 않는다. 이 계획의 앱-레벨 층의 주 산출물은 재시도 자체보다 **명시적·테스트 가능한 정책 + 진단 가능한 실패 메시지**다. 클라이언트 생성(`main.py:756`·`973`)은 건드리지 않아 변경을 최소화한다.
