"""video_framing unittest (stdlib only).

계약(FEAT-58): 여백은 한쪽 비율(정수 0~25)이고, 픽셀은 (1920*p+50)//100이다.
웹 shared/config/video-framing.ts의 getVideoFrameLayout과 같은 골든값이라 한쪽만
바꾸면 설정 화면의 px와 실렌더가 어긋난다. 양수 여백의 중앙 영역은 cover(화자 추적
크롭) 또는 contain(블러 배경 위 원본 비율)으로 채운다.
"""

import unittest

from video_framing import (
    contain_size,
    cover_crop_geometry,
    frame_layout,
    parse_video_padding_percent,
    resolve_video_padding_percent,
)

# 10.0은 float라 거부한다(웹은 JSON 정수만 보낸다). bool은 int의 하위형이라 따로 막는다.
INVALID = [-1, 26, 0.5, 10.0, "10", True, False, None, float("nan"), float("inf")]
GOLDEN = {0: (0, 1920), 1: (19, 1882), 3: (58, 1804), 10: (192, 1536), 25: (480, 960)}


class ParseTest(unittest.TestCase):
    def test_accepts_every_integer_0_to_25(self):
        for percent in range(26):
            self.assertEqual(parse_video_padding_percent(percent), percent)

    def test_rejects_invalid_and_resolves_to_zero(self):
        for value in INVALID:
            with self.subTest(value=value):
                self.assertIsNone(parse_video_padding_percent(value))
                self.assertEqual(resolve_video_padding_percent(value), 0)


class FrameLayoutTest(unittest.TestCase):
    def test_golden_values(self):
        for percent, expected in GOLDEN.items():
            self.assertEqual(frame_layout(percent), expected)

    def test_symmetric_even_center_for_all_values(self):
        for percent in range(26):
            padding_px, content_height = frame_layout(percent)
            self.assertEqual(2 * padding_px + content_height, 1920)
            self.assertEqual(content_height % 2, 0)
            self.assertGreaterEqual(content_height, 960)


class CoverCropTest(unittest.TestCase):
    SOURCES = [(1920, 1080), (1080, 1920), (1000, 1000), (400, 2000)]

    # 어떤 source여도 viewport보다 작은 배열을 만들지 않고, 세로는 중앙 정렬한다.
    def test_never_smaller_than_viewport(self):
        for source_width, source_height in self.SOURCES:
            for percent in (1, 10, 25):
                _, content_height = frame_layout(percent)
                with self.subTest(source=(source_width, source_height), percent=percent):
                    width, height, crop_x, crop_y = cover_crop_geometry(
                        source_width, source_height, 1080, content_height,
                    )
                    self.assertGreaterEqual(width, 1080)
                    self.assertGreaterEqual(height, content_height)
                    self.assertEqual(crop_x, (width - 1080) // 2)
                    self.assertEqual(crop_y, (height - content_height) // 2)

    # 정확값이 있어야 cover의 max→min 같은 스케일 변이가 잡힌다(불변식만으로는 clamp에 가려진다).
    def test_exact_geometry(self):
        self.assertEqual(cover_crop_geometry(1920, 1080, 1080, 1536), (2731, 1536, 825, 0))
        self.assertEqual(cover_crop_geometry(1080, 1920, 1080, 1536), (1080, 1920, 0, 192))
        self.assertEqual(cover_crop_geometry(1000, 1000, 1080, 960), (1080, 1080, 0, 60))

    def test_follows_speaker_x_and_clamps_at_edges(self):
        _, _, crop_x, _ = cover_crop_geometry(1920, 1080, 1080, 1536, center_x=1200)
        self.assertEqual(crop_x, int(1200 * 2731 / 1920) - 540)
        _, _, left, _ = cover_crop_geometry(1920, 1080, 1080, 1536, center_x=5)
        self.assertEqual(left, 0)
        width, _, right, _ = cover_crop_geometry(1920, 1080, 1080, 1536, center_x=1915)
        self.assertEqual(right, width - 1080)


class ContainTest(unittest.TestCase):
    def test_fits_inside_and_keeps_ratio(self):
        self.assertEqual(contain_size(1920, 1080, 1080, 1536), (1080, 608))
        self.assertEqual(contain_size(1080, 1920, 1080, 1536), (864, 1536))
        self.assertEqual(contain_size(1000, 1000, 1080, 960), (960, 960))
        self.assertEqual(contain_size(400, 2000, 1080, 960), (192, 960))


class DimensionGuardTest(unittest.TestCase):
    def test_rejects_non_positive_dimensions(self):
        for args in [(0, 1080, 1080, 960), (1920, 0, 1080, 960), (1920, 1080, 0, 960), (1920, 1080, 1080, -1)]:
            with self.subTest(args=args):
                with self.assertRaises(ValueError):
                    cover_crop_geometry(*args)
                with self.assertRaises(ValueError):
                    contain_size(*args)


if __name__ == "__main__":
    unittest.main()
