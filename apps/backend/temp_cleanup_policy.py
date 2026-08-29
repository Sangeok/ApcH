"""임시 디렉터리 정리 정책 — 순수 판단 로직 (stdlib만).

_do_process_video의 finally 절이 이 함수들을 호출해 "실행 후 base_dir을 지울지"를
결정한다. 파일·network·GPU에 닿지 않는다 — 실제 rmtree는 main.py의 얇은 껍데기가 한다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

# KEEP_TEMP_ON_FAILURE 환경변수가 이 값들(대소문자·앞뒤공백 무시) 중 하나면 "보존 켜짐".
_TRUTHY = frozenset({"1", "true", "yes", "on"})


def parse_keep_on_failure(env_value):
    """KEEP_TEMP_ON_FAILURE 환경변수 값을 bool로. None·비문자열·미지값·빈 문자열 → False.

    프로덕션(Modal)에서는 이 변수를 설정하지 않으므로 항상 False → 기존 '항상 정리' 동작.
    로컬 `modal run` 디버그에서만 켜서 실패 시 중간 산출물(원본·전사·크롭)을 남긴다.
    """
    if not isinstance(env_value, str):
        return False
    return env_value.strip().lower() in _TRUTHY


def should_cleanup_temp_dir(succeeded, keep_on_failure):
    """실행 후 base_dir을 rmtree할지.

    - succeeded=True  → 항상 정리(True). warm 컨테이너 재사용 시 /tmp 누적을 막는다.
    - succeeded=False → keep_on_failure가 켜졌으면 보존(False), 아니면 정리(True).
    """
    if succeeded:
        return True
    return not keep_on_failure
