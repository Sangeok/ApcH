"""후보 추출(identify_moments) 프롬프트 조립 — 순수 로직 (stdlib만).

identify_moments의 얇은 Gemini 래퍼가 build_moment_prompt를 호출해
"어떤 프롬프트 문자열을 Gemini에 보낼지"를 결정한다.
google.genai·network·GPU·파일에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

import json

# main.py:937-1004의 prompt_template을 바이트 그대로 옮긴 것.
# 이 상수가 원본과 같다는 것은 test_moment_prompt.py의 frozen 테스트가 지킨다.
MOMENT_PROMPT_TEMPLATE = """You are a viral short-form video editor specializing in podcast content.

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

# 언어 지시를 끼워 넣는 유일 앵커. 템플릿 끝에 딱 한 번 등장한다("transcript"(소문자)는
# 본문에도 있으나 "Transcript:\n"(대문자+콜론+개행)은 마지막 한 곳뿐).
_TRANSCRIPT_ANCHOR = "Transcript:\n"


def moment_language_directive(language):
    """hook·payoff만 업로드 언어로 쓰게 하는 지시문. 영어/빈/미지 값은 빈 문자열."""
    if language == "Korean":
        return (
            "# Output Language\n"
            "- Write the \"hook\" and \"payoff\" field values in Korean.\n"
            "- Keep \"type\" exactly \"qa\" or \"insight\"; do not translate it.\n"
            "- Keep \"start\" and \"end\" as numeric seconds from the transcript.\n"
            "\n"
        )
    return ""


def build_moment_prompt(transcript, target_count, language="English"):
    """identify_moments가 Gemini에 보낼 최종 프롬프트 문자열.

    - 영어/빈/미지 언어: 현재 main.py 조립(라인 1006-1009)과 바이트 동일.
    - Korean: hook·payoff만 한국어로 쓰라는 지시를 Transcript 앵커 앞에 삽입.
    """
    prompt = MOMENT_PROMPT_TEMPLATE.replace("TARGET_COUNT", str(target_count))
    directive = moment_language_directive(language)
    if directive:
        prompt = prompt.replace(_TRANSCRIPT_ANCHOR, directive + _TRANSCRIPT_ANCHOR, 1)
    prompt += json.dumps(transcript, ensure_ascii=False)
    return prompt
