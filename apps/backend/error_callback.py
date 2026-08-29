"""에러 콜백 페이로드 조립 — 순수 로직 (stdlib만).

_do_process_video의 포괄 except가 이 함수를 호출해 실패 콜백 본문을 만든다.
network·boto3·GPU·파일에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

ERROR_STATUS = "error"


def build_error_callback_payload(uploaded_file_id, attempt, mode, error, clip_results):
    """실패 콜백 본문. status/error/phase는 그대로 두고, clips에는 실패 시점까지
    '끝까지 완성된' 클립(main.py의 clip_results)을 싣는다.

    clip_results는 process_clip이 세로 영상·자막·S3 업로드까지 마친 클립만 append한
    리스트(main.py의 clip_results.append)라, 그대로 실으면 이미 S3에 올라간 부분 성공
    클립이 리포트에 남는다. None이거나 비어 있으면 [] (기존 하드코딩 동작과 동치 —
    클립 루프 진입 전 실패 시).

    필드 이름은 웹 RawModalWebhookBody(route.ts)와 맞춘다 — 이미 있는 clips 필드라
    웹 변경 없이 호환. clips의 각 원소는 성공 콜백이 보내는 것과 동일 모양이다.

    반환 clips는 clip_results의 얕은 복사(list(...))라, 반환 후 clip_results를 바꿔도 안전하다.
    """
    return {
        "uploadedFileId": uploaded_file_id,
        "attempt": attempt,
        "status": ERROR_STATUS,
        "phase": mode,
        "error": error,
        "clips": list(clip_results) if clip_results else [],
    }
