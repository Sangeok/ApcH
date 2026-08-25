"""translation_fallback 순수 함수 단위 테스트 (stdlib unittest, torch·boto3·google.genai 불필요).

main.py는 import하지 않는다 — whisperx→torch 의존 때문에 맨 파이썬으로 돌지 않는다.
"""

import unittest

from translation_fallback import (
    TRANSLATION_OK,
    TRANSLATION_PARTIAL_FALLBACK,
    TRANSLATION_FULL_FALLBACK,
    parse_translations,
    assemble_korean_texts,
    classify_translation,
    is_fallback,
)


class ParseTranslationsTests(unittest.TestCase):
    def test_valid_list_builds_index_map(self):
        payload = [
            {"index": 0, "translation": "안녕"},
            {"index": 1, "translation": "세계"},
        ]
        self.assertEqual(parse_translations(payload), {0: "안녕", 1: "세계"})

    def test_translation_is_stripped(self):
        payload = [{"index": 0, "translation": "  안녕  "}]
        self.assertEqual(parse_translations(payload), {0: "안녕"})

    def test_non_list_error_object_returns_empty_map(self):
        self.assertEqual(parse_translations({"error": "cannot-translate"}), {})

    def test_none_returns_empty_map(self):
        self.assertEqual(parse_translations(None), {})

    def test_string_returns_empty_map(self):
        self.assertEqual(parse_translations("nope"), {})

    def test_non_dict_items_are_skipped(self):
        payload = ["str", 42, None, {"index": 0, "translation": "값"}]
        self.assertEqual(parse_translations(payload), {0: "값"})

    def test_non_int_index_excluded(self):
        payload = [{"index": "0", "translation": "값"}]
        self.assertEqual(parse_translations(payload), {})

    def test_non_str_translation_excluded(self):
        payload = [{"index": 0, "translation": 123}]
        self.assertEqual(parse_translations(payload), {})

    def test_whitespace_only_translation_excluded(self):
        payload = [{"index": 0, "translation": "   "}]
        self.assertEqual(parse_translations(payload), {})

    def test_empty_string_translation_excluded(self):
        payload = [{"index": 0, "translation": ""}]
        self.assertEqual(parse_translations(payload), {})


class AssembleKoreanTextsTests(unittest.TestCase):
    def test_all_present(self):
        english = ["a", "b"]
        korean, missing = assemble_korean_texts(english, {0: "가", 1: "나"})
        self.assertEqual(korean, ["가", "나"])
        self.assertEqual(missing, [])

    def test_some_missing_falls_back_to_english_ascending(self):
        english = ["a", "b", "c"]
        korean, missing = assemble_korean_texts(english, {1: "나"})
        self.assertEqual(korean, ["a", "나", "c"])
        self.assertEqual(missing, [0, 2])

    def test_empty_map_all_english(self):
        english = ["a", "b"]
        korean, missing = assemble_korean_texts(english, {})
        self.assertEqual(korean, ["a", "b"])
        self.assertEqual(missing, [0, 1])

    def test_empty_english_texts(self):
        korean, missing = assemble_korean_texts([], {})
        self.assertEqual(korean, [])
        self.assertEqual(missing, [])

    def test_falsy_empty_string_in_map_triggers_fallback(self):
        # parse가 걸러도, 조립의 falsy 가드가 독립적으로 빈 문자열을 폴백으로 흘려보낸다.
        english = ["a"]
        korean, missing = assemble_korean_texts(english, {0: ""})
        self.assertEqual(korean, ["a"])
        self.assertEqual(missing, [0])


class ClassifyTranslationTests(unittest.TestCase):
    def test_zero_lines_is_ok(self):
        self.assertEqual(classify_translation(0, []), TRANSLATION_OK)

    def test_zero_lines_ok_even_on_hard_failure(self):
        self.assertEqual(
            classify_translation(0, [], hard_failure=True), TRANSLATION_OK
        )

    def test_no_missing_is_ok(self):
        self.assertEqual(classify_translation(3, []), TRANSLATION_OK)

    def test_all_missing_is_full_fallback(self):
        self.assertEqual(
            classify_translation(3, [0, 1, 2]), TRANSLATION_FULL_FALLBACK
        )

    def test_some_missing_is_partial_fallback(self):
        self.assertEqual(
            classify_translation(3, [1]), TRANSLATION_PARTIAL_FALLBACK
        )

    def test_hard_failure_with_lines_is_full_fallback(self):
        self.assertEqual(
            classify_translation(3, [], hard_failure=True),
            TRANSLATION_FULL_FALLBACK,
        )


class IsFallbackTests(unittest.TestCase):
    def test_ok_is_not_fallback(self):
        self.assertFalse(is_fallback(TRANSLATION_OK))

    def test_partial_is_fallback(self):
        self.assertTrue(is_fallback(TRANSLATION_PARTIAL_FALLBACK))

    def test_full_is_fallback(self):
        self.assertTrue(is_fallback(TRANSLATION_FULL_FALLBACK))


class StatusConstantTests(unittest.TestCase):
    def test_status_literals_are_frozen(self):
        # 콜백/DB에 실리는 리터럴이라 회귀 가드로 못박는다.
        self.assertEqual(TRANSLATION_OK, "ok")
        self.assertEqual(TRANSLATION_PARTIAL_FALLBACK, "partial-fallback")
        self.assertEqual(TRANSLATION_FULL_FALLBACK, "full-fallback")


if __name__ == "__main__":
    unittest.main()
