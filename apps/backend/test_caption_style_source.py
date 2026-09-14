"""select_caption_style unittest (stdlib only).

계약: 폴백의 소스 선택만 한다 — moment 스타일 우선, 요청 단위 스타일은 auto 전용,
그 밖은 None(main.py의 resolve_caption_style이 언어 기본값으로 접는다). 키 병합은 없다.
"""

import unittest

from caption_style_source import select_caption_style


class SelectCaptionStyleTest(unittest.TestCase):
    # 1. moment이 dict면 moment 반환 — render
    def test_moment_style_wins_render(self):
        moment = {"fontSize": 90}
        self.assertIs(
            select_caption_style(moment, {"fontSize": 200}, "render"),
            moment,
        )

    # 2. moment이 dict면 moment 반환 — auto (클립별 스타일 우선은 모드 무관)
    def test_moment_style_wins_auto(self):
        moment = {"fontSize": 90}
        self.assertIs(
            select_caption_style(moment, {"fontSize": 200}, "auto"),
            moment,
        )

    # 3. auto: moment None · request dict → request 반환 (auto 스냅샷 경로)
    def test_auto_falls_back_to_request(self):
        request = {"color": "#FF0000"}
        self.assertIs(
            select_caption_style(None, request, "auto"),
            request,
        )

    # 4. render: moment None · request dict → None (render는 요청 스타일을 쓰지 않는다)
    def test_render_ignores_request(self):
        self.assertIsNone(
            select_caption_style(None, {"color": "#FF0000"}, "render"),
        )

    # 5. 둘 다 None → None (배포 순서 불변: 웹이 안 보낼 때 오늘과 동일) — 두 모드 모두
    def test_both_none_is_none_auto(self):
        self.assertIsNone(select_caption_style(None, None, "auto"))

    def test_both_none_is_none_render(self):
        self.assertIsNone(select_caption_style(None, None, "render"))

    # 6. moment dict + request dict (auto) → request 무시, moment 통째 반환 (키 병합 안 함)
    def test_no_key_merge_auto(self):
        moment = {"fontSize": 90}  # color 없음
        request = {"fontSize": 200, "color": "#00FF00"}  # 겹치는+추가 키
        result = select_caption_style(moment, request, "auto")
        self.assertIs(result, moment)
        self.assertNotIn("color", result)  # request 키가 새지 않는다

    # 7. moment이 빈 {} → {} 반환 (auto에서도 request로 안 떨어짐)
    def test_empty_dict_moment_is_kept(self):
        empty = {}
        self.assertIs(
            select_caption_style(empty, {"color": "#FF0000"}, "auto"),
            empty,
        )

    # 8. 비-dict moment(문자열) + request dict: auto → request, render → None
    def test_non_dict_moment_string_auto(self):
        request = {"color": "#FF0000"}
        self.assertIs(
            select_caption_style("not-a-dict", request, "auto"),
            request,
        )

    def test_non_dict_moment_string_render(self):
        self.assertIsNone(
            select_caption_style("not-a-dict", {"color": "#FF0000"}, "render"),
        )

    # 9. 둘 다 비-dict(문자열·리스트) → None
    def test_both_non_dict_is_none(self):
        self.assertIsNone(select_caption_style("x", ["y"], "auto"))

    # 10. 그 밖의 mode + moment None + request dict → None (요청 폴백은 auto 전용)
    def test_other_modes_do_not_fall_back(self):
        request = {"color": "#FF0000"}
        for mode in ("analyze", "", None):
            with self.subTest(mode=mode):
                self.assertIsNone(select_caption_style(None, request, mode))


if __name__ == "__main__":
    unittest.main()
