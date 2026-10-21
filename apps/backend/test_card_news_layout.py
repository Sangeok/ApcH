import unittest

from card_news.layout import LayoutError, candidate_times, wrap_text


class CardNewsLayoutTests(unittest.TestCase):
    def test_cjk_newlines_and_long_latin_words_preserve_all_characters(self):
        for text in ("가나다라마바사아", "Interoperability", "first\nsecond"):
            result = wrap_text(text, 5, 100, len, 10, "body")
            self.assertEqual("".join(result.lines), text.replace("\n", ""))
            self.assertTrue(all(len(line) <= 5 for line in result.lines))

    def test_overflow_is_a_field_error_without_font_shrink_or_truncation(self):
        with self.assertRaises(LayoutError) as failure:
            wrap_text("0123456789012345", 5, 20, len, 10, "cards[1].body")
        self.assertEqual(failure.exception.field, "cards[1].body")
        self.assertEqual(failure.exception.code, "text_overflow")

    def test_candidate_times_bind_to_actual_source_duration(self):
        self.assertEqual(candidate_times(10, 30, 40), (("cover-25", 15), ("cover-50", 20), ("cover-75", 25)))
        for start, end, duration in ((-1, 3, 4), (1, 5, 4), (float("nan"), 3, 4), (0, 0, 4)):
            with self.assertRaises(ValueError):
                candidate_times(start, end, duration)


if __name__ == "__main__":
    unittest.main()
