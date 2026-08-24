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
