"""moment_prompt 순수 함수 단위 테스트 (stdlib unittest, torch·google.genai 불필요).

main.py는 import하지 않는다 — whisperx→torch 의존 때문에 맨 파이썬으로 돌지 않는다.

EXPECTED_TEMPLATE는 main.py identify_moments의 prompt_template을 바이트 그대로 복사한 독립 사본이다
(모듈 상수와 별개로 둔다 — 모듈이 바뀌어도 이 사본은 안 바뀌어야 frozen 단언이 드리프트를 잡는다).
"""

import json
import unittest

from moment_prompt import (
    MOMENT_PROMPT_TEMPLATE,
    build_moment_prompt,
    moment_language_directive,
)

EXPECTED_TEMPLATE = """You are a viral short-form video editor specializing in podcast content.

You will receive a word-level podcast transcript with timestamps.
Identify the MOST ENGAGING moments suitable for a short-form clip.

# What Makes a Great Clip

A great clip must have ALL of the following:
1. STRONG HOOK (first 5 seconds): Starts with a surprising claim,
   a compelling question, a counterintuitive statement, or a story
   already in progress. Do NOT start with small talk, filler words,
   or topic transitions.
2. COMPLETE PAYOFF: Ends at a natural conclusion — a full answer
   delivered, an insight fully stated, a story arc completed.
   The viewer must feel satisfied, not cut off.
3. HIGH CONTENT DENSITY: Every second contains value.
   Avoid long pauses, filler phrases ("um", "like", "you know"),
   or tangential side-comments that dilute the core message.

# Eligible Moment Types

Find moments from EITHER of these categories:
- Q&A: A sharp question followed by a compelling, complete answer.
  Include a few sentences of context before the question if needed.
- Insight or Revelation: A speaker delivers a counterintuitive point,
  surprising fact, contrarian opinion, or "the real reason is..."
  moment. The moment must be fully stated with context and conclusion.

# Duration Rules

- Minimum: 30 seconds
- Target: 50 to 90 seconds
- Maximum: 90 seconds
- If a compelling moment runs slightly over 90 seconds, skip it.
  Do NOT trim mid-sentence.

# Hard Constraints

- Clips must NOT overlap with each other.
- Only use timestamps that exist verbatim in the input. Do not invent
  or interpolate timestamps.
- Do NOT start a clip with greetings ("Hello", "Hi", "Welcome"),
  filler words used as connectors ("Um", "So", "Anyway", "Like"),
  or topic transitions ("Moving on", "Next", "Let’s talk about").
- Do NOT end a clip mid-sentence. The clip must end at the last word
  of a complete sentence.
- Do NOT include the first word of the next sentence after the ending.

# Output Format

Return a JSON array ordered from MOST ENGAGING to LEAST ENGAGING.
Each element:
{
  "start": <number, seconds from transcript>,
  "end": <number, seconds from transcript>,
  "type": <"qa" | "insight">,
  "hook": <one sentence: why the first 5 seconds hook viewers>,
  "payoff": <one sentence: what value the viewer gets at the end>
}

Return exactly TARGET_COUNT moments if possible.
If fewer genuine moments exist, return only valid ones.
Return [] if no suitable moments exist.

Output must be valid JSON parseable by Python json.loads().
No code fences. No markdown. No explanations.

Transcript:
"""

EXPECTED_KOREAN_DIRECTIVE = (
    "# Output Language\n"
    "- Write the \"hook\" and \"payoff\" field values in Korean.\n"
    "- Keep \"type\" exactly \"qa\" or \"insight\"; do not translate it.\n"
    "- Keep \"start\" and \"end\" as numeric seconds from the transcript.\n"
    "\n"
)

SAMPLE_TRANSCRIPT = [
    {"start": 0.0, "end": 1.2, "word": "Hello"},
    {"start": 1.2, "end": 2.4, "word": "world"},
]


def current_formula(transcript, target_count):
    """구현 전 main.py identify_moments 호출부의 조립식 재현 (영어 기준값)."""
    return (
        EXPECTED_TEMPLATE.replace("TARGET_COUNT", str(target_count))
        + json.dumps(transcript, ensure_ascii=False)
    )


class BuildMomentPromptTests(unittest.TestCase):
    def test_english_matches_current_formula(self):
        got = build_moment_prompt(SAMPLE_TRANSCRIPT, 6, "English")
        expected = (
            MOMENT_PROMPT_TEMPLATE.replace("TARGET_COUNT", "6")
            + json.dumps(SAMPLE_TRANSCRIPT, ensure_ascii=False)
        )
        self.assertEqual(got, expected)

    def test_empty_language_matches_english(self):
        self.assertEqual(
            build_moment_prompt(SAMPLE_TRANSCRIPT, 6, ""),
            build_moment_prompt(SAMPLE_TRANSCRIPT, 6, "English"),
        )

    def test_unknown_language_matches_english(self):
        english = build_moment_prompt(SAMPLE_TRANSCRIPT, 6, "English")
        for unknown in ("Spanish", "Japanese", "français", "korean"):
            self.assertEqual(
                build_moment_prompt(SAMPLE_TRANSCRIPT, 6, unknown),
                english,
                msg=f"{unknown!r} should fall through to English formatting",
            )

    def test_template_frozen(self):
        self.assertEqual(MOMENT_PROMPT_TEMPLATE, EXPECTED_TEMPLATE)

    def test_directive_empty_for_english_nonempty_for_korean(self):
        self.assertEqual(moment_language_directive("English"), "")
        self.assertNotEqual(moment_language_directive("Korean"), "")

    def test_korean_inserts_directive_before_transcript(self):
        prompt = build_moment_prompt(SAMPLE_TRANSCRIPT, 6, "Korean")
        directive = moment_language_directive("Korean")
        self.assertIn(directive + "Transcript:\n", prompt)

    def test_korean_is_english_plus_directive(self):
        english = build_moment_prompt(SAMPLE_TRANSCRIPT, 6, "English")
        korean = build_moment_prompt(SAMPLE_TRANSCRIPT, 6, "Korean")
        directive = moment_language_directive("Korean")
        # 지시문을 한 번 제거하면 영어 프롬프트와 완전히 같아야 한다 (순수 가산성).
        self.assertEqual(korean.replace(directive, "", 1), english)

    def test_korean_keeps_field_definition_lines(self):
        prompt = build_moment_prompt(SAMPLE_TRANSCRIPT, 6, "Korean")
        self.assertIn('"type": <"qa" | "insight">,', prompt)
        self.assertIn('"hook":', prompt)
        self.assertIn('"payoff":', prompt)

    def test_target_count_substituted(self):
        for language in ("English", "Korean"):
            prompt = build_moment_prompt(SAMPLE_TRANSCRIPT, 8, language)
            self.assertNotIn("TARGET_COUNT", prompt)
            self.assertIn("Return exactly 8 moments if possible.", prompt)

    def test_transcript_json_ensure_ascii_false(self):
        transcript = [{"start": 0.0, "end": 1.0, "word": "안녕하세요"}]
        prompt = build_moment_prompt(transcript, 6, "Korean")
        self.assertIn("안녕하세요", prompt)
        self.assertNotIn("\\uc548", prompt)

    def test_korean_directive_golden(self):
        self.assertEqual(moment_language_directive("Korean"), EXPECTED_KOREAN_DIRECTIVE)


if __name__ == "__main__":
    unittest.main()
