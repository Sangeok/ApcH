"""캡션 세로 위치·마진 해석 — 순수 로직 (stdlib만).

main.py의 resolve_caption_style가 "position enum을 ASS alignment로, 그리고
사용자 marginV(세로 여백)를 기준 가장자리에서의 마진 픽셀로" 바꾸는 판단을 여기서 한다.
색 해석(pysubs2.Color)은 resolve_caption_style에 남는다 — 이 모듈은 숫자 판단만 한다.

좌표계: ASS PlayResY=1920. position이 기준 가장자리를 정한다.
  top(alignment 8)    → 위 가장자리에서 블록 위쪽까지의 marginV
  bottom(alignment 2) → 아래 가장자리에서 블록 아래쪽까지의 marginV
  middle(alignment 5) → marginV 무시, 언어 기본값 그대로 (FEAT-61이 바꾸지 않는 경로)

marginV 계약(FEAT-61 ↔ 웹 FEAT-62 공유): 정수(0~960) 또는 null. null·누락·범위 밖·
정수 아님·bool이면 CAPTION_POSITION_MARGINV 상수로 폴백한다 (렌더 실패보다 기본 위치가
낫다는 resolve_caption_style 방침 그대로).

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

# 캡션 위치 → ASS alignment (numpad 표기). "middle"(5)이 기존 하드코딩 값.
CAPTION_POSITION_ALIGNMENT = {
    "top": 8,
    "middle": 5,
    "bottom": 2,
}

# top/bottom에서 사용자 marginV가 없을 때의 폴백 마진(px, PlayResY 1920 기준).
CAPTION_POSITION_MARGINV = {
    "top": 200,
    "bottom": 260,
}

# 사용자 marginV 허용 범위(양끝 포함). 웹 zod와 동기 계약 — 0 ~ PlayResY/2.
MARGINV_MIN = 0
MARGINV_MAX = 960


def normalize_position(value):
    """position enum을 유효값으로 정규화. 유효하지 않거나 없으면 'middle'."""
    if value in CAPTION_POSITION_ALIGNMENT:
        return value
    return "middle"


def parse_marginv(value):
    """사용자 marginV를 유효 정수로 파싱. 아니면 None.

    type(value) is int라 bool은 자동 배제된다(type(True) is int → False) — isinstance(True, int)는
    참임에 주의. float·str·None도 None으로 떨어진다. video_framing.parse_video_padding_percent와 같은 꼴.
    """
    if type(value) is int and MARGINV_MIN <= value <= MARGINV_MAX:
        return value
    return None


def resolve_position(style, *, default_marginv):
    """style dict에서 ASS alignment와 marginv를 해석한다.

    - middle: alignment 5, marginv = default_marginv (사용자 marginV 무시)
    - top/bottom: alignment 8/2, marginv = 유효한 사용자 marginV면 그 값,
      아니면 CAPTION_POSITION_MARGINV[position] 폴백

    style은 dict여야 한다(resolve_caption_style가 이미 dict로 보장해 넘긴다).
    """
    position = normalize_position(style.get("position"))
    if position == "middle":
        marginv = default_marginv
    else:
        parsed = parse_marginv(style.get("marginV"))
        marginv = CAPTION_POSITION_MARGINV[position] if parsed is None else parsed
    return {
        "alignment": CAPTION_POSITION_ALIGNMENT[position],
        "marginv": marginv,
    }
