"""Korean 참고 번역(analyze) — 순수 로직 (stdlib만).

analyze 경로의 얇은 Gemini 래퍼(main.py build_reference_translations)가 이 함수들을 호출해
"어떤 후보의 어떤 원문을 / 어떤 프롬프트로 번역 요청하고 / 응답을 인덱스에 어떻게 되돌리고 /
어떤 필드로 페이로드에 부착하는지"를 결정한다. google.genai·network·GPU·파일에 닿지 않는다.

참고 번역은 검토 화면 표시용이다 — 렌더 자막(create_korean_subtitles_with_ffmpeg)과 별개이고
그 값을 재사용하지 않는다. 문장 단위로 읽기 좋게 번역하며, 렌더처럼 줄 수를 맞추는 제약이 없다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

import json

from translation_fallback import parse_translations


def should_translate_references(language):
    """참고 번역을 만들 언어인가. moment_prompt.moment_language_directive와 같은 판정 —
    정확히 "Korean"일 때만 True (대소문자·공백·다른 언어·None은 False)."""
    return language == "Korean"


def build_reference_sources(validated_moments, transcript_words):
    """각 후보(validated_moments)의 AI 구간 안 단어를 이어 붙인 원문 리스트.

    포함 규칙·join은 검토 카드 영어 본문과 동일하게 맞춘다
    (apps/web ClipDraftCard.tsx: word.start >= start && word.end <= end, join(" ")) —
    어긋나면 카드가 처음 보여 주는 영어와 번역이 다른 범위를 가리킨다.

    반환: [{"index": i, "text": "<원문>"}] (길이 == len(validated_moments), 순서 == payload 순서).
    구간 안 단어가 0개면 text == "".
    """
    sources = []
    for idx, moment in enumerate(validated_moments):
        start = float(moment["start"])
        end = float(moment["end"])
        words = []
        for w in transcript_words:
            w_start = w.get("start")
            w_end = w.get("end")
            text = w.get("word")
            if w_start is None or w_end is None or not text:
                continue
            if float(w_start) >= start and float(w_end) <= end:
                words.append(text)
        sources.append({"index": idx, "text": " ".join(words)})
    return sources


def build_reference_translation_prompt(sources):
    """번역 요청 프롬프트. sources는 원문이 있는 후보만(빈 원문 제외).
    문장 단위 자연 번역을 요청하고, 인덱스를 그대로 유지한 JSON 배열을 받는다."""
    count = len(sources)
    payload = json.dumps(sources, ensure_ascii=False)
    return f"""You are a professional podcast translator. Translate each English excerpt below into natural, fluent Korean.

# Translation rules:
1. Translate the meaning at the sentence level; do not translate word-by-word.
2. Use a conversational podcast tone.
3. Each excerpt is independent — translate each on its own, as complete sentences.
4. Paraphrase technical terms into easy-to-understand Korean.

Number of input excerpts: {count}

# Output rules (JSON only):
- Return only a JSON array of length {count}.
- Each element must be an object: {{"index": <int>, "translation": "<Korean string>"}}.
- Every index value must exactly match the input index. Do not skip or duplicate indices.
- Never include code fences like ``` or any additional explanation.

# Input (English excerpts):
{payload}
"""


def strip_code_fences(text):
    """Gemini 응답의 마크다운 코드 펜스 제거 — main.py analyze(:1019-1025)·렌더(:525-530)
    두 인라인 복제와 동일 동작."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped[3:].strip()
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].lstrip()
    if stripped.endswith("```"):
        stripped = stripped[:-3].strip()
    return stripped


def assemble_reference_translations(sources, translation_payload):
    """파싱된 응답을 후보 순서의 번역 리스트로 되돌린다 (길이 == len(sources)).

    - translation_fallback.parse_translations로 index→비어있지 않은 번역 맵을 만든다.
      (여기서는 영어 폴백이 아니라 null이 요구다 — assemble_korean_texts는 재사용하지 않는다.)
    - 원문이 비었으면(빈 구간) None. 응답에 없는 인덱스도 None. 실패(비-list payload)면 전부 None.
    """
    translations_map = parse_translations(translation_payload)
    results = []
    for s in sources:
        if not s["text"].strip():
            results.append(None)
            continue
        results.append(translations_map.get(s["index"]))
    return results


def attach_reference_translations(moments, reference_translations):
    """analyze payload moment 리스트에 referenceTranslation 필드를 더한다.

    - reference_translations is None (비-Korean): moments를 그대로 돌려준다 — 필드도 호출도 없다(요구 ①).
      English analyze payload는 바이트 그대로 유지된다.
    - 아니면 각 moment에 aligned 값(str|None)을 referenceTranslation으로 더한다(원본 dict는 안 바꾼다).
    """
    if reference_translations is None:
        return moments
    return [
        {**moment, "referenceTranslation": reference_translations[index]}
        for index, moment in enumerate(moments)
    ]
