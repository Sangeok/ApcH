"""클립에 적용할 caption_style 소스 선택 — 순수 로직 (stdlib만).

_do_process_video의 클립 루프가 이 함수로 "어느 caption_style 객체를
process_clip에 넘길지"를 고른다. 언어 기본값 단계는 여기서 다루지 않는다 —
None을 반환하면 main.py의 resolve_caption_style(None)이 언어 기본값으로 접는다.
network·GPU·파일·pysubs2에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

# 요청 단위 스타일(업로드 시점 스냅샷)로 폴백하는 유일한 모드.
REQUEST_STYLE_FALLBACK_MODE = "auto"


def select_caption_style(moment_style, request_style, mode):
    """클립에 넘길 caption_style 객체를 **통째(객체 단위)**로 고른다. 키 병합은 하지 않는다.

    - moment_style이 dict면 그것 — 모드와 무관하게 클립별 스타일이 우선이다.
    - 아니면 mode가 "auto"이고 request_style이 dict일 때만 request_style.
      auto는 Gemini가 moment를 만들어 클립별 스타일이 없으므로 요청 단위 스냅샷이 유일한 입력이다.
    - 그 밖(render에서 moment 스타일 부재, 둘 다 dict 아님, 그 밖의 mode)은 None
      → resolve_caption_style이 언어 기본값으로 접는다.

    render에서 moment 스타일 부재는 "언어 기본값"을 뜻한다 — 커스텀 클립은 스타일 없이
    만들어지고 「Reset style」은 null을 저장하며, 웹 검토 미리보기도 그 클립을 언어 기본값으로
    그린다. 여기서 요청 스냅샷으로 떨어뜨리면 미리보기≠실렌더가 된다(2026-09-14 소유자 결정).
    빈 dict {}는 "존재하는 스타일"로 보아 그대로 반환한다(요청으로 떨어지지 않는다).
    """
    if isinstance(moment_style, dict):
        return moment_style
    if mode == REQUEST_STYLE_FALLBACK_MODE and isinstance(request_style, dict):
        return request_style
    return None
