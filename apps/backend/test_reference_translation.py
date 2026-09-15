"""reference_translation.py 순수 함수 unittest — main.py를 import하지 않는다.

torch/whisperx 없이 맨 파이썬으로 돈다:
    python -m unittest discover -s apps/backend -p "test_*.py"
"""

import json
import unittest

from reference_translation import (
    should_translate_references,
    build_reference_sources,
    build_reference_translation_prompt,
    strip_code_fences,
    assemble_reference_translations,
    attach_reference_translations,
)


def _mainpy_inline_strip(text):
    """main.py:1019-1025 analyze 인라인 코드 펜스 제거의 재현식(골든 비교용)."""
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw[len("```"):].strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].lstrip()
    if raw.endswith("```"):
        raw = raw[:-3].strip()
    return raw


class ShouldTranslateReferencesTest(unittest.TestCase):
    def test_korean_true(self):
        self.assertTrue(should_translate_references("Korean"))

    def test_english_false(self):
        self.assertFalse(should_translate_references("English"))

    def test_empty_false(self):
        self.assertFalse(should_translate_references(""))

    def test_lowercase_false(self):
        self.assertFalse(should_translate_references("korean"))

    def test_uppercase_false(self):
        self.assertFalse(should_translate_references("KOREAN"))

    def test_padded_false(self):
        self.assertFalse(should_translate_references(" Korean "))

    def test_spanish_false(self):
        self.assertFalse(should_translate_references("Spanish"))

    def test_none_false(self):
        self.assertFalse(should_translate_references(None))


class BuildReferenceSourcesTest(unittest.TestCase):
    def test_boundary_inclusive(self):
        # w.start == start, w.end == end 는 포함 (ClipDraftCard.tsx: >= / <=).
        moments = [{"start": 10.0, "end": 20.0}]
        words = [
            {"start": 10.0, "end": 12.0, "word": "start"},
            {"start": 18.0, "end": 20.0, "word": "end"},
        ]
        self.assertEqual(
            build_reference_sources(moments, words),
            [{"index": 0, "text": "start end"}],
        )

    def test_overflow_front_excluded(self):
        # w.start < start 인 단어는 제외.
        moments = [{"start": 10.0, "end": 20.0}]
        words = [
            {"start": 9.5, "end": 11.0, "word": "before"},
            {"start": 11.0, "end": 12.0, "word": "inside"},
        ]
        self.assertEqual(
            build_reference_sources(moments, words),
            [{"index": 0, "text": "inside"}],
        )

    def test_overflow_back_excluded(self):
        # w.end > end 인 단어는 제외.
        moments = [{"start": 10.0, "end": 20.0}]
        words = [
            {"start": 18.0, "end": 19.0, "word": "inside"},
            {"start": 19.5, "end": 20.5, "word": "after"},
        ]
        self.assertEqual(
            build_reference_sources(moments, words),
            [{"index": 0, "text": "inside"}],
        )

    def test_join_space(self):
        moments = [{"start": 0.0, "end": 30.0}]
        words = [
            {"start": 1.0, "end": 2.0, "word": "one"},
            {"start": 2.0, "end": 3.0, "word": "two"},
            {"start": 3.0, "end": 4.0, "word": "three"},
        ]
        self.assertEqual(build_reference_sources(moments, words)[0]["text"], "one two three")

    def test_index_matches_position(self):
        moments = [
            {"start": 0.0, "end": 30.0},
            {"start": 40.0, "end": 70.0},
        ]
        words = [
            {"start": 1.0, "end": 2.0, "word": "a"},
            {"start": 41.0, "end": 42.0, "word": "b"},
        ]
        result = build_reference_sources(moments, words)
        self.assertEqual([r["index"] for r in result], [0, 1])
        self.assertEqual(result[0]["text"], "a")
        self.assertEqual(result[1]["text"], "b")

    def test_empty_range_empty_text(self):
        moments = [{"start": 100.0, "end": 130.0}]
        words = [{"start": 1.0, "end": 2.0, "word": "elsewhere"}]
        self.assertEqual(
            build_reference_sources(moments, words),
            [{"index": 0, "text": ""}],
        )

    def test_int_start_end(self):
        # start/end 가 int 여도 float() 처리.
        moments = [{"start": 10, "end": 20}]
        words = [{"start": 12, "end": 14, "word": "x"}]
        self.assertEqual(
            build_reference_sources(moments, words),
            [{"index": 0, "text": "x"}],
        )

    def test_skip_wordless(self):
        # 시각·텍스트 없는 단어는 건너뛴다.
        moments = [{"start": 0.0, "end": 30.0}]
        words = [
            {"start": None, "end": 2.0, "word": "no-start"},
            {"start": 1.0, "end": None, "word": "no-end"},
            {"start": 1.0, "end": 2.0, "word": ""},
            {"start": 1.0, "end": 2.0, "word": "keep"},
        ]
        self.assertEqual(
            build_reference_sources(moments, words)[0]["text"], "keep"
        )

    def test_length_matches_moments(self):
        moments = [
            {"start": 0.0, "end": 30.0},
            {"start": 40.0, "end": 70.0},
            {"start": 80.0, "end": 110.0},
        ]
        words = []
        self.assertEqual(len(build_reference_sources(moments, words)), 3)


class BuildReferenceTranslationPromptTest(unittest.TestCase):
    def test_count_literal(self):
        sources = [{"index": 0, "text": "a"}, {"index": 2, "text": "b"}]
        prompt = build_reference_translation_prompt(sources)
        self.assertIn("Number of input excerpts: 2", prompt)
        self.assertIn("JSON array of length 2", prompt)

    def test_includes_source_text(self):
        sources = [{"index": 0, "text": "hello world"}]
        prompt = build_reference_translation_prompt(sources)
        self.assertIn("hello world", prompt)

    def test_ensure_ascii_false(self):
        # 비-ASCII 원문이 \uXXXX 로 이스케이프되지 않는다.
        sources = [{"index": 0, "text": "café résumé"}]
        prompt = build_reference_translation_prompt(sources)
        self.assertIn("café résumé", prompt)
        self.assertNotIn("caf\\u00e9", prompt)

    def test_index_directive(self):
        prompt = build_reference_translation_prompt([{"index": 0, "text": "x"}])
        self.assertIn("index", prompt)
        self.assertIn("must exactly match", prompt)

    def test_translation_key_directive(self):
        prompt = build_reference_translation_prompt([{"index": 0, "text": "x"}])
        self.assertIn('"translation"', prompt)


class StripCodeFencesTest(unittest.TestCase):
    def test_plain_json_unchanged(self):
        self.assertEqual(strip_code_fences('[{"index": 0}]'), '[{"index": 0}]')

    def test_json_fence(self):
        text = '```json\n[{"index": 0}]\n```'
        self.assertEqual(strip_code_fences(text), '[{"index": 0}]')

    def test_bare_fence(self):
        text = '```\n[{"index": 0}]\n```'
        self.assertEqual(strip_code_fences(text), '[{"index": 0}]')

    def test_surrounding_whitespace(self):
        text = '   \n```json\n[1, 2]\n```\n   '
        self.assertEqual(strip_code_fences(text), '[1, 2]')

    def test_matches_mainpy_inline_golden(self):
        # main.py:1019-1025 인라인 복제와 동일 동작.
        for sample in (
            '[{"index": 0}]',
            '```json\n[{"index": 0}]\n```',
            '```\n[{"index": 0}]\n```',
            '   ```JSON\n[1]\n```   ',
            'no fences here',
        ):
            self.assertEqual(
                strip_code_fences(sample),
                _mainpy_inline_strip(sample),
                msg=f"diverged on {sample!r}",
            )


class AssembleReferenceTranslationsTest(unittest.TestCase):
    def test_full_map(self):
        sources = [{"index": 0, "text": "a"}, {"index": 1, "text": "b"}]
        payload = [
            {"index": 0, "translation": "가"},
            {"index": 1, "translation": "나"},
        ]
        self.assertEqual(assemble_reference_translations(sources, payload), ["가", "나"])

    def test_partial_missing_none(self):
        sources = [{"index": 0, "text": "a"}, {"index": 1, "text": "b"}]
        payload = [{"index": 0, "translation": "가"}]
        self.assertEqual(assemble_reference_translations(sources, payload), ["가", None])

    def test_non_list_all_none(self):
        sources = [{"index": 0, "text": "a"}, {"index": 1, "text": "b"}]
        payload = {"error": "cannot-translate"}
        self.assertEqual(assemble_reference_translations(sources, payload), [None, None])

    def test_empty_list_all_none(self):
        sources = [{"index": 0, "text": "a"}]
        self.assertEqual(assemble_reference_translations(sources, []), [None])

    def test_empty_source_none_despite_map(self):
        # 빈 원문 moment 는 맵에 그 인덱스가 있어도 None.
        sources = [{"index": 0, "text": ""}, {"index": 1, "text": "b"}]
        payload = [
            {"index": 0, "translation": "있음"},
            {"index": 1, "translation": "나"},
        ]
        self.assertEqual(assemble_reference_translations(sources, payload), [None, "나"])

    def test_length_matches_sources(self):
        sources = [{"index": i, "text": "t"} for i in range(4)]
        payload = [{"index": 0, "translation": "가"}]
        result = assemble_reference_translations(sources, payload)
        self.assertEqual(len(result), 4)


class AttachReferenceTranslationsTest(unittest.TestCase):
    def _base_moments(self):
        return [
            {"index": 0, "startSeconds": 1.0, "endSeconds": 30.0, "clipType": "qa"},
            {"index": 1, "startSeconds": 40.0, "endSeconds": 70.0, "clipType": "insight"},
        ]

    def test_none_returns_same_list(self):
        moments = self._base_moments()
        self.assertIs(attach_reference_translations(moments, None), moments)

    def test_none_no_field_added(self):
        # English 불변 — 요구 ①: 어떤 dict 에도 referenceTranslation 키가 없다.
        moments = self._base_moments()
        result = attach_reference_translations(moments, None)
        for m in result:
            self.assertNotIn("referenceTranslation", m)

    def test_list_adds_field(self):
        moments = self._base_moments()
        result = attach_reference_translations(moments, ["가", None])
        self.assertEqual(result[0]["referenceTranslation"], "가")
        self.assertIsNone(result[1]["referenceTranslation"])

    def test_list_preserves_originals(self):
        # 원본 dict 는 변형하지 않는다(키 없음 유지).
        moments = self._base_moments()
        attach_reference_translations(moments, ["가", "나"])
        for m in moments:
            self.assertNotIn("referenceTranslation", m)

    def test_list_length_preserved(self):
        moments = self._base_moments()
        result = attach_reference_translations(moments, ["가", "나"])
        self.assertEqual(len(result), 2)
        # 기존 필드도 보존된다.
        self.assertEqual(result[0]["clipType"], "qa")
        self.assertEqual(result[1]["startSeconds"], 40.0)


if __name__ == "__main__":
    unittest.main()
