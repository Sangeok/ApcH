import math

FRAME_WIDTH = 1080
FRAME_HEIGHT = 1920


def parse_video_padding_percent(value):
    if type(value) is int and 0 <= value <= 25:
        return value
    return None


def resolve_video_padding_percent(value):
    parsed = parse_video_padding_percent(value)
    return 0 if parsed is None else parsed


def frame_layout(value):
    percent = resolve_video_padding_percent(value)
    padding_px = (FRAME_HEIGHT * percent + 50) // 100
    return padding_px, FRAME_HEIGHT - 2 * padding_px


def cover_crop_geometry(source_width, source_height, width, height, center_x=None):
    if min(source_width, source_height, width, height) <= 0:
        raise ValueError("Frame dimensions must be positive")
    scale = max(width / source_width, height / source_height)
    resized_width = max(width, math.ceil(source_width * scale))
    resized_height = max(height, math.ceil(source_height * scale))
    if center_x is None:
        crop_x = (resized_width - width) // 2
    else:
        scaled_center_x = int(center_x * resized_width / source_width)
        crop_x = max(0, min(scaled_center_x - width // 2, resized_width - width))
    crop_y = (resized_height - height) // 2
    return resized_width, resized_height, crop_x, crop_y


def contain_size(source_width, source_height, width, height):
    if min(source_width, source_height, width, height) <= 0:
        raise ValueError("Frame dimensions must be positive")
    scale = min(width / source_width, height / source_height)
    resized_width = min(width, max(1, math.floor(source_width * scale + 0.5)))
    resized_height = min(height, max(1, math.floor(source_height * scale + 0.5)))
    return resized_width, resized_height


def needs_centered_composition(padding_percent, source_width, source_height):
    """cover/contain 중앙 합성 경로를 써야 하면 True.

    양수 여백이면 항상 True다. 여백 0%에서는 source가 target(9:16)보다 세로로 길 때만
    True다 — 기존 crop/resize 경로가 그때만 깨진다(화자 없음 → resize의 broadcast
    ValueError, 화자 있음 → crop이 폭 < 1080을 내고 writer가 가로로 늘림). 가로·정사각·
    정확히 9:16 이하인 source는 False라 기존 0% 경로가 바이트 그대로 유지된다.

    padding_percent는 main.py에서 resolve된 0~25 정수다.
    """
    if padding_percent > 0:
        return True
    return source_height * FRAME_WIDTH > source_width * FRAME_HEIGHT
