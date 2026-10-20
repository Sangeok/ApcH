"""caption_position 순수 모듈 테스트 — stdlib unittest, main.py를 import하지 않는다.

FEAT-61: 캡션 세로 위치를 프리셋 셋이 아니라 사용자 marginV로 렌더.
"""

import unittest

from caption_position import (
    CAPTION_POSITION_ALIGNMENT,
    CAPTION_POSITION_MARGINV,
    normalize_position,
    parse_marginv,
    resolve_position,
)


class NormalizePositionTests(unittest.TestCase):
    def test_valid_positions_pass_through(self):
        self.assertEqual(normalize_position("top"), "top")
        self.assertEqual(normalize_position("middle"), "middle")
        self.assertEqual(normalize_position("bottom"), "bottom")

    def test_invalid_or_missing_falls_back_to_middle(self):
        self.assertEqual(normalize_position("left"), "middle")
        self.assertEqual(normalize_position(None), "middle")
        self.assertEqual(normalize_position(123), "middle")
        self.assertEqual(normalize_position(""), "middle")


class ParseMarginvTests(unittest.TestCase):
    def test_valid_integers_in_range(self):
        self.assertEqual(parse_marginv(0), 0)
        self.assertEqual(parse_marginv(500), 500)
        self.assertEqual(parse_marginv(960), 960)

    def test_out_of_range_is_none(self):
        self.assertIsNone(parse_marginv(-1))
        self.assertIsNone(parse_marginv(961))

    def test_bool_is_none_not_one(self):
        # isinstance(True, int)는 참이지만 type(True) is int는 거짓 — 1로 새면 안 된다.
        self.assertIsNone(parse_marginv(True))
        self.assertIsNone(parse_marginv(False))

    def test_float_str_none_are_none(self):
        self.assertIsNone(parse_marginv(200.0))
        self.assertIsNone(parse_marginv(1.5))
        self.assertIsNone(parse_marginv("200"))
        self.assertIsNone(parse_marginv(None))


class ResolveMiddleTests(unittest.TestCase):
    def test_middle_variants_use_default_marginv(self):
        for style in ({"position": "middle"}, {"position": "left"}, {}):
            resolved = resolve_position(style, default_marginv=165)
            self.assertEqual(resolved["alignment"], 5)
            self.assertEqual(resolved["marginv"], 165)

    def test_middle_ignores_user_marginv(self):
        resolved = resolve_position(
            {"position": "middle", "marginV": 300}, default_marginv=165
        )
        self.assertEqual(resolved["alignment"], 5)
        self.assertEqual(resolved["marginv"], 165)

    def test_middle_honors_each_language_default(self):
        # 영어(165)·한국어(155) 둘 다 그대로 흘러야 한다 — 165 하드코딩이면 155 케이스가 깨진다.
        self.assertEqual(
            resolve_position({"position": "middle"}, default_marginv=155)["marginv"],
            155,
        )
        self.assertEqual(
            resolve_position({"position": "middle"}, default_marginv=165)["marginv"],
            165,
        )


class ResolveTopBottomValidTests(unittest.TestCase):
    def test_top_with_valid_marginv(self):
        for value in (0, 500, 960):
            resolved = resolve_position(
                {"position": "top", "marginV": value}, default_marginv=165
            )
            self.assertEqual(resolved["alignment"], 8)
            self.assertEqual(resolved["marginv"], value)

    def test_bottom_with_valid_marginv(self):
        for value in (0, 500, 960):
            resolved = resolve_position(
                {"position": "bottom", "marginV": value}, default_marginv=155
            )
            self.assertEqual(resolved["alignment"], 2)
            self.assertEqual(resolved["marginv"], value)


class ResolveTopBottomFallbackTests(unittest.TestCase):
    def test_top_invalid_or_missing_marginv_falls_back(self):
        for style in (
            {"position": "top"},
            {"position": "top", "marginV": None},
            {"position": "top", "marginV": 961},
            {"position": "top", "marginV": True},
            {"position": "top", "marginV": 120.0},
        ):
            resolved = resolve_position(style, default_marginv=165)
            self.assertEqual(resolved["alignment"], 8)
            self.assertEqual(resolved["marginv"], CAPTION_POSITION_MARGINV["top"])
            self.assertEqual(resolved["marginv"], 200)

    def test_bottom_invalid_or_missing_marginv_falls_back(self):
        for style in (
            {"position": "bottom"},
            {"position": "bottom", "marginV": None},
            {"position": "bottom", "marginV": 961},
            {"position": "bottom", "marginV": True},
            {"position": "bottom", "marginV": 120.0},
        ):
            resolved = resolve_position(style, default_marginv=155)
            self.assertEqual(resolved["alignment"], 2)
            self.assertEqual(resolved["marginv"], CAPTION_POSITION_MARGINV["bottom"])
            self.assertEqual(resolved["marginv"], 260)

    def test_top_bool_true_is_not_one(self):
        resolved = resolve_position(
            {"position": "top", "marginV": True}, default_marginv=165
        )
        self.assertNotEqual(resolved["marginv"], 1)
        self.assertEqual(resolved["marginv"], 200)


class BackwardCompatTests(unittest.TestCase):
    def test_legacy_snapshots_without_marginv_match_old_behavior(self):
        # marginV 키 자체가 없던 기존 저장값·스냅샷의 동작은 지금과 동일해야 한다.
        top = resolve_position({"position": "top"}, default_marginv=165)
        self.assertEqual(top["alignment"], 8)
        self.assertEqual(top["marginv"], 200)

        bottom = resolve_position({"position": "bottom"}, default_marginv=155)
        self.assertEqual(bottom["alignment"], 2)
        self.assertEqual(bottom["marginv"], 260)

        empty = resolve_position({}, default_marginv=165)
        self.assertEqual(empty["alignment"], CAPTION_POSITION_ALIGNMENT["middle"])
        self.assertEqual(empty["marginv"], 165)


if __name__ == "__main__":
    unittest.main()
