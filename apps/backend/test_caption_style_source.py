"""select_caption_style unittest (stdlib only).

계약(FEAT-51): 폴백의 소스 선택만 한다 — moment 스타일 우선, 없으면 요청 단위
스냅샷으로 폴백(auto·render 공통), 그래도 없으면 None(main.py의 resolve_caption_style이
언어 기본값으로 접는다). 키 병합은 없다. 빈 dict {}는 "존재하는 스타일"로 본다.
"""

import unittest

from caption_style_source import select_caption_style


class SelectCaptionStyleTest(unittest.TestCase):
    # 1. moment dict + request dict → moment 통째 반환, request 키가 새지 않음. 클립별 우선.
    def test_moment_style_wins_over_request(self):
        moment = {"fontSize": 90}  # color 없음
        request = {"fontSize": 200, "color": "#00FF00"}  # 겹치는+추가 키
        result = select_caption_style(moment, request)
        self.assertIs(result, moment)
        self.assertNotIn("color", result)  # request 키가 새지 않는다

    # 2. moment None + request dict → request 반환. 게이트 제거로 render/auto 구분 없이 폴백(핵심 신규).
    def test_moment_none_falls_back_to_request(self):
        request = {"color": "#FF0000"}
        self.assertIs(select_caption_style(None, request), request)

    # 3. 둘 다 None → None. 전이 구간 하위 호환(웹이 안 보내면 오늘과 동일 = 언어 기본값).
    def test_both_none_is_none(self):
        self.assertIsNone(select_caption_style(None, None))

    # 4. moment {} + request dict → {} 반환. 빈 dict는 "존재하는 스타일"이라 request로 안 떨어짐.
    def test_empty_dict_moment_is_kept(self):
        empty = {}
        self.assertIs(select_caption_style(empty, {"color": "#FF0000"}), empty)

    # 5. 비-dict moment(문자열·리스트) + request dict → request 반환. 비-dict는 없는 것으로 봄.
    def test_non_dict_moment_falls_back_to_request(self):
        request = {"color": "#FF0000"}
        for moment in ("not-a-dict", ["y"]):
            with self.subTest(moment=moment):
                self.assertIs(select_caption_style(moment, request), request)

    # 6. 둘 다 비-dict(문자열·리스트) → None.
    def test_both_non_dict_is_none(self):
        self.assertIsNone(select_caption_style("x", ["y"]))

    # 7. moment dict + request None → moment 반환. request 없이도 클립별이 이김.
    def test_moment_dict_request_none(self):
        moment = {"fontSize": 90}
        self.assertIs(select_caption_style(moment, None), moment)

    # 8. moment None + request {} → {} 반환. request 쪽 빈 dict도 "존재하는 스타일"(케이스 4와 대칭).
    def test_request_empty_dict_is_returned(self):
        empty = {}
        self.assertIs(select_caption_style(None, empty), empty)


if __name__ == "__main__":
    unittest.main()
