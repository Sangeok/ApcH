"""select_caption_style unittest (stdlib only).

계약(FEAT-55): 폴백의 소스 선택만 한다 — request_style이 dict면 그것(업로드 시점
요청 스냅샷), 아니면 None(main.py의 resolve_caption_style이 언어 기본값으로 접는다).
키 병합은 없다. 빈 dict {}는 "존재하는 스타일"로 본다. 클립별 스타일 경로(moment_style
우선순위)는 FEAT-52 배포로 사라져 FEAT-55에서 제거했다 — 소스는 요청 스냅샷 하나뿐이다.
"""

import unittest

from caption_style_source import select_caption_style


class SelectCaptionStyleTest(unittest.TestCase):
    # 1. request dict → 통째 반환. 요청 스냅샷을 그대로 쓴다.
    def test_dict_request_is_returned(self):
        request = {"fontSize": 200, "color": "#00FF00"}
        self.assertIs(select_caption_style(request), request)

    # 2. request None → None. 웹이 안 보내면 언어 기본값(하위 호환).
    def test_none_is_none(self):
        self.assertIsNone(select_caption_style(None))

    # 3. request {} → {} 반환. 빈 dict는 "존재하는 스타일"이라 None으로 안 떨어짐.
    def test_empty_dict_is_returned(self):
        empty = {}
        self.assertIs(select_caption_style(empty), empty)

    # 4. request 비-dict(문자열·리스트) → None. dict가 아니면 없는 것으로 봄.
    def test_non_dict_is_none(self):
        for request in ("not-a-dict", ["y"]):
            with self.subTest(request=request):
                self.assertIsNone(select_caption_style(request))


if __name__ == "__main__":
    unittest.main()
