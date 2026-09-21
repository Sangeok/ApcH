"""클립에 적용할 caption_style 소스 선택 — 순수 로직 (stdlib만).

_do_process_video의 클립 루프(auto·render 공통)가 이 함수로 "어느 caption_style
객체를 process_clip에 넘길지"를 고른다. FEAT-55 이후 소스는 요청 단위 스냅샷
하나뿐이다 — 클립별 스타일 경로는 FEAT-52 배포로 사라졌다(웹이 더는 보내지 않고
ClipDraft.captionStyle 컬럼도 FEAT-53이 제거). 언어 기본값 단계는 여기서 다루지
않는다 — None을 반환하면 main.py의 resolve_caption_style(None)이 언어 기본값으로
접는다. network·GPU·파일·pysubs2에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""


def select_caption_style(request_style):
    """클립에 넘길 caption_style 객체를 고른다.

    - request_style이 dict면 그것 — 업로드 시점 요청 스냅샷을 그대로 쓴다.
      빈 dict {}도 "존재하는 스타일"로 보아 반환한다.
    - dict가 아니면(None·문자열·리스트 등) None → resolve_caption_style이
      언어 기본값으로 접는다.

    auto·render 모두 같다. 과거 클립별 우선순위(moment_style)는 FEAT-55에서
    제거했다 — FEAT-52 배포로 웹이 클립별 스타일을 더는 보내지 않는다.
    """
    if isinstance(request_style, dict):
        return request_style
    return None
