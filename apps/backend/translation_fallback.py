"""한국어 자막 번역 폴백 판정 — 순수 로직 (stdlib만).

create_korean_subtitles_with_ffmpeg의 얇은 I/O 래퍼가 이 함수들을 호출해
"각 줄에 어떤 텍스트를 쓸지 / 어느 줄이 영어로 폴백됐는지 / 콜백에 실을 상태"를 결정한다.
google.genai·network·GPU·파일에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

# 클립 결과 dict의 subtitleStatus 필드에 실리는 값 (그대로 콜백 페이로드로 나간다).
TRANSLATION_OK = "ok"                              # 모든 줄이 번역됨(또는 자막 줄이 없음)
TRANSLATION_PARTIAL_FALLBACK = "partial-fallback"  # 일부 줄이 영어로 폴백
TRANSLATION_FULL_FALLBACK = "full-fallback"        # 전부 영어로 폴백(예외·빈 응답·전량 누락)


def parse_translations(payload):
    """Gemini 응답(파싱된 JSON)에서 index→translation 맵을 만든다.

    payload가 list가 아니면(예: {"error":"cannot-translate"}) 빈 맵.
    각 항목은 dict, index는 int, translation은 strip 후 비어 있지 않은 str이어야 한다.
    (기존 main.py:516-524와 동치 — 단, 빈 문자열은 맵에 넣지 않고 아래 조립에서
    폴백으로 흘려보낸다. 렌더 결과는 기존과 동일하고, 누락 집계에만 포함된다.)
    """
    result = {}
    if not isinstance(payload, list):
        return result
    for item in payload:
        if not isinstance(item, dict):
            continue
        idx = item.get("index")
        text = item.get("translation")
        if isinstance(idx, int) and isinstance(text, str):
            stripped = text.strip()
            if stripped:
                result[idx] = stripped
    return result


def assemble_korean_texts(english_texts, translations_map):
    """각 index에 번역이 있으면 그 값, 없으면 영어로 폴백.

    반환: (korean_texts, missing_indices)
    - korean_texts: 자막에 실제로 쓸 텍스트 리스트(길이 == len(english_texts))
    - missing_indices: 번역이 없어 영어로 폴백된 index 리스트(오름차순)
    (기존 main.py:526-532의 줄 단위 폴백과 동치 — 폴백된 index만 추가로 모은다.)
    """
    korean_texts = []
    missing_indices = []
    for idx in range(len(english_texts)):
        translation = translations_map.get(idx)
        if not translation:
            missing_indices.append(idx)
            translation = english_texts[idx]
        korean_texts.append(translation)
    return korean_texts, missing_indices


def classify_translation(total_lines, missing_indices, hard_failure=False):
    """번역 결과를 subtitleStatus 문자열로 분류.

    - total_lines == 0 → OK (자막 줄이 없음 — 폴백 아님; hard_failure여도 OK)
    - hard_failure(예외로 전량 영어 폴백) → FULL_FALLBACK
    - 누락 없음 → OK
    - 전부 누락 → FULL_FALLBACK
    - 일부 누락 → PARTIAL_FALLBACK
    """
    if total_lines == 0:
        return TRANSLATION_OK
    if hard_failure:
        return TRANSLATION_FULL_FALLBACK
    missing = len(missing_indices)
    if missing == 0:
        return TRANSLATION_OK
    if missing >= total_lines:
        return TRANSLATION_FULL_FALLBACK
    return TRANSLATION_PARTIAL_FALLBACK


def is_fallback(status):
    """상태가 폴백(부분/전량)인가 — 배선이 bool 하나만 원할 때."""
    return status in (TRANSLATION_PARTIAL_FALLBACK, TRANSLATION_FULL_FALLBACK)
