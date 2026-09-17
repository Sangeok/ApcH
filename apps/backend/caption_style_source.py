"""클립에 적용할 caption_style 소스 선택 — 순수 로직 (stdlib만).

_do_process_video의 클립 루프(auto·render 공통)가 이 함수로 "어느 caption_style
객체를 process_clip에 넘길지"를 고른다. 언어 기본값 단계는 여기서 다루지 않는다 —
None을 반환하면 main.py의 resolve_caption_style(None)이 언어 기본값으로 접는다.
network·GPU·파일·pysubs2에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""


def select_caption_style(moment_style, request_style):
    """클립에 넘길 caption_style 객체를 **통째(객체 단위)**로 고른다. 키 병합은 하지 않는다.

    - moment_style이 dict면 그것 — 클립별 스타일이 우선이다.
    - 아니면 request_style이 dict면 그것 — 업로드 시점 요청 스냅샷으로 폴백한다.
      auto·render 모두 같다(FEAT-51: render의 auto-only 게이트 제거).
    - 둘 다 dict가 아니면 None → resolve_caption_style이 언어 기본값으로 접는다.

    빈 dict {}는 "존재하는 스타일"로 보아 그대로 반환한다(요청으로 떨어지지 않는다).

    render도 request 스냅샷으로 폴백하는 이유(2026-09-16 소유자 재판정): 앞선 2026-09-14
    결정("render는 요청 스냅샷을 안 쓴다 — 미리보기≠실렌더 방지")의 전제는 "검토 화면이
    클립별 스타일을 미리보기로 보여준다"였다. FEAT-52가 그 미리보기와 클립별 스타일을
    없애므로 어긋날 대상이 사라진다 — 전제가 죽으면 결정도 죽는다.

    moment_style 인자는 FEAT-52 배포 전까지 웹이 여전히 보내는 클립별 스타일을 존중하기
    위해 남긴다(전이 구간 회귀 0). FEAT-52 뒤에는 moment_style이 항상 None이 되어
    사실상 request 폴백만 남으므로, 그때 인자·우선순위 정리는 후속 항목이 맡는다.
    """
    if isinstance(moment_style, dict):
        return moment_style
    if isinstance(request_style, dict):
        return request_style
    return None
