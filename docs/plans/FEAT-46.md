# FEAT-46: Korean 분석(analyze)에서 후보마다 참고 번역을 만들어 콜백에 싣는다

agent: backend-dev

## 현재 동작

- analyze 모드는 `main.py:1001` `if mode == "analyze":` 안에서 돈다. 후보를 `main.py:1017` `identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2, language)`로 뽑고, 코드 펜스 제거(`main.py:1019-1025`)·JSON 파싱(`:1027-1035`) 뒤 `main.py:1037` `validated_moments = validate_moments(clip_moments)`로 30~90초 범위를 거른다. `validate_moments`는 원본 moment dict를 그대로 통과시킨다(`main.py:135` `validated.append(moment)`; `start`/`end` 존재는 `:124-127`에서 보장).
- 콜백에 싣는 moment 필드는 여섯뿐이다 — `main.py:1043-1048` `"index"` / `"startSeconds": float(m["start"])` / `"endSeconds": float(m["end"])` / `"clipType": m.get("type")` / `"hook": m.get("hook")` / `"payoff": m.get("payoff")`. **번역 필드는 없다.** 이 `analyze_payload`(`main.py:1039`)를 프로덕션 콜백(`main.py:1054-1061`, `**analyze_payload`)과 로컬 동기 응답(`main.py:1166-1171`, `**(analyze_payload or {"moments": []})`)이 그대로 스프레드해 내보낸다.
- 전사는 원본 음성 받아쓰기다. `main.py:896` `def transcribe_video(self, base_dir, video_path) -> str:`가 단어마다 `{"start", "end", "word"}`를 만들고(`:930`), 시각·텍스트가 없는 단어는 버린다(`:928`·`:937`). 정렬 모델은 영어 고정(`main.py:889` `whisperx.load_align_model(language_code="en", ...)`). analyze 브랜치가 쓰는 `transcript_segments`는 이 리스트의 파싱본이다(`main.py:997`).
- 한국어는 렌더 때만 생긴다. `create_korean_subtitles_with_ffmpeg`가 영어 단어를 묶어 줄 단위로 번역하고(`main.py:481` `You are a professional podcast translator. Please translate the English subtitles below into natural Korean.`), 코드 펜스 제거(`:525-530`) 뒤 `translation_fallback.parse_translations`(`:534`)로 파싱해 영어 줄 시각에 올린다(`:547-548`). 이 렌더 경로는 이 항목에서 건드리지 않는다.
- 후보 식별 프롬프트는 `moment_prompt.build_moment_prompt`가 조립한다(`main.py:944`). `language == "Korean"`일 때만 hook·payoff 지시문을 더하고(`moment_prompt.py:91` `if language == "Korean":`), `start`·`end`·`type`은 절대 번역하지 않는다. `identify_moments`에 `language`가 넘어간다(`main.py:1017`).
- 실패 격리: analyze는 `main.py:982` `try:` 안이다. 예외가 새면 `main.py:1142` `except Exception as e:`가 에러 콜백을 보내고(`:1146-1153`) `main.py:1156` `raise`한다 — 즉 analyze 단계에서 잡지 못한 예외는 곧 `status: error` 콜백이다.
- 로컬 순수 모듈은 전부 `main.py:85` `.add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy", "error_callback", "moment_prompt", "caption_style_source"))`에 등록돼야 한다. `test_modal_image_sources.py`가 `main.py`의 import와 이 목록을 대조한다.
- 검토 카드의 영어 본문은 AI 구간 안 단어를 이어 붙인 것이다 — `apps/web` `ClipDraftCard.tsx:108-109` `word.start >= startSeconds && word.end <= endSeconds`, `:114` `wordsInRange.map((word) => word.word).join(" ")`. `startSeconds`/`endSeconds`는 콜백의 `startSeconds`/`endSeconds`(= `float(m["start"])`/`float(m["end"])`)다.
- Gemini I/O 호출 셋(`main.py:515`·`:669`·`:945`)에는 타임아웃이 없다.

## 문제

백로그 `source`가 지목한 문제: Korean 업로드 검토 화면에서 hook·payoff는 한국어(FEAT-43)인데 카드 본문(전사)은 영어라, 소유자가 구간을 영어만 보고 골라야 한다. 웹은 스스로 번역을 못 만든다(`apps/web/src/env.js`에 LLM 키 0건 — `GEMINI`·`OPENAI`·`ANTHROPIC` grep 0). 그래서 백엔드 analyze가 후보마다 **참고 번역**을 만들어 콜백에 실어야, 웹이 영어 원문 옆에 한국어 뜻을 보여줄 수 있다.

위 「현재 동작」에서 확인한 결함: `analyze_payload`(`main.py:1043-1048`)에 번역 필드가 없고, analyze는 원문을 뽑을 재료(전사 단어·AI 구간)를 이미 손에 쥐고 있는데도 번역을 만들지 않는다.

백로그가 못박은 제약 — ① 영어 전사는 바꾸지 않고 **옆에 번역을 더한다**(경계 넛지가 영어 단어 시각에 스냅하고 재생 소리도 영어라 원문을 대체하면 자르는 판단 근거가 사라진다). ② 렌더 번역과 별개인 **참고 번역**이며 렌더는 이 값을 재사용하지 않는다 — 그래서 3단어 조각이 아니라 **문장 단위**로 읽기 좋게 번역한다. ③ 번역 실패가 analyze를 실패시키면 안 된다. ④ `identify_moments` 프롬프트에 섞지 않고 **별도 호출**로 구간 선택을 흔들지 않는다.

백로그 지목과 코드 확인이 어긋나는 점: 없음.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/reference_translation.py` `(신규)` | 참고 번역의 순수 판단 전부 — 언어 판정·원문 조립·프롬프트 조립·코드펜스 제거·인덱스 매칭·필드 부착 |
| `apps/backend/test_reference_translation.py` `(신규)` | 위 순수 함수 `unittest` |
| `apps/backend/main.py` | ① import 블록 추가(`:45` 아래) ② `main.py:85` 등록 목록에 `"reference_translation"` 추가 ③ 모듈 레벨 I/O 래퍼 `build_reference_translations` 신설(Gemini 호출·타임아웃) ④ analyze 페이로드(`:1039-1052`)를 `base_moments` + `attach_reference_translations`로 교체 |

여기 없는 파일(렌더 경로 `create_korean_subtitles_with_ffmpeg`, `translation_fallback.py`, web·db)은 고치지 않는다.

## 구현 스케치

### 신규 순수 모듈 `apps/backend/reference_translation.py` (본문 전체)

```python
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
```

**필드명·null 의미**: 필드명은 `referenceTranslation`(camelCase — 기존 moment 필드 `index`·`startSeconds`·`clipType`·`hook`·`payoff`와 같은 규약). FEAT-47 컬럼·FEAT-48 표시가 이 이름을 그대로 쓴다. null 의미 = "번역 없음": English 업로드(키 자체 없음), 번역 실패·타임아웃, 응답 누락 인덱스, 빈 원문. Korean 경로는 키를 항상 싣고 값이 str 또는 null; English 경로는 키를 아예 넣지 않는다.

### `main.py` 변경

**① import 블록** — `main.py:45` `from caption_style_source import select_caption_style` 아래에 추가:

```python
from reference_translation import (
    should_translate_references,
    build_reference_sources,
    build_reference_translation_prompt,
    strip_code_fences,
    assemble_reference_translations,
    attach_reference_translations,
)
```

**② Modal 등록** (`main.py:85`) before/after:

```python
# before
    .add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy", "error_callback", "moment_prompt", "caption_style_source"))
# after
    .add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy", "error_callback", "moment_prompt", "caption_style_source", "reference_translation"))
```

**③ 모듈 레벨 I/O 래퍼** — `process_clip`(`main.py:752`)의 끝(`main.py:878` `    }`) 뒤, 클래스 정의 주석(`main.py:880` `# GPU/타임아웃/시크릿/볼륨 설정이 적용된 서비스 클래스`) 앞에 신설한다. 그 주석과 `main.py:881` `@app.cls(...)`는 붙어 있어야 하므로 둘 사이에 넣지 않는다. 모듈 레벨 Gemini 헬퍼 `create_korean_subtitles_with_ffmpeg`(`main.py:410`)·`generate_youtube_metadata`(`main.py:602`)와 같은 층이고, 쓰는 이름 `json`(`main.py:2`)·`genai`(`main.py:23` `from google import genai`)는 이미 모듈 레벨에서 import돼 있다:

```python
REFERENCE_TRANSLATION_TIMEOUT_MS = 120000  # 120s. 참고 번역은 best-effort — 멈춘 호출이 analyze를
                                           # web 한도(ANALYSIS_RESULT_TIMEOUT 60m)까지 끌고 가면 안 된다.


def build_reference_translations(validated_moments, transcript_words, language, gemini_client):
    """Korean analyze 후보마다 AI 구간 원문의 참고 번역을 만든다.

    - 비-Korean: None (필드 미추가, 호출 없음 — 요구 ①).
    - 원문이 하나도 없으면 Gemini를 부르지 않고 전부 None.
    - 번역 호출·JSON 파싱·인덱스 매칭의 모든 예외·타임아웃을 여기서 잡아 전부 None으로 돌린다 —
      analyze 자체는 실패시키지 않는다(요구 ③). 개별 누락 인덱스도 None(부분 성공).
    """
    if not should_translate_references(language):
        return None
    sources = build_reference_sources(validated_moments, transcript_words)
    translatable = [s for s in sources if s["text"].strip()]
    if not translatable:
        return [None for _ in sources]
    try:
        prompt = build_reference_translation_prompt(translatable)
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
                http_options=genai.types.HttpOptions(timeout=REFERENCE_TRANSLATION_TIMEOUT_MS),
            ),
        )
        translation_payload = json.loads(strip_code_fences(response.text))
        return assemble_reference_translations(sources, translation_payload)
    except Exception as e:
        print(f"Reference translation error: {e}. Leaving reference translations null.")
        return [None for _ in sources]
```

- **타임아웃 방법·값**: google-genai의 `GenerateContentConfig(http_options=HttpOptions(timeout=...))`, 단위는 **밀리초**. 값 `120000`(120s). 로컬 venv(`C:\Users\hamso\venvs\apch-backend`) 설치본 `google-genai` **2.16.0**에서 확인했다 — `HttpOptions.timeout`은 `Optional[int]`("Timeout for the request in milliseconds.")이고, `GenerateContentConfig`에 `http_options` 필드가 있으며, `Models.generate_content`가 `parameter_model.config.http_options`를 요청에 넘기고(`google/genai/models.py`), `_api_client.py`가 `timeout / 1000.0`초로 바꾼다. 재시도 옵션이 없으면 1회만 시도한다(`tenacity.stop_after_attempt(1)`) — 타임아웃이 곱해지지 않는다. `google-genai`는 `requirements.txt:35`에서 버전 미고정이라 배포 이미지는 빌드 시점 최신본을 쓴다. 그 버전이 이 필드를 받지 않으면 `GenerateContentConfig`(pydantic, `extra="forbid"`) 생성이 `ValidationError`를 내지만 `try` 안이라 전부 None으로 떨어지고 analyze는 안전하다(다만 필드가 조용히 안 채워진다 — 「테스트」 「못 덮는 범위」에 확인 항목으로 둔다).
- 렌더 번역(temp 0.3)과 같은 온도. 렌더처럼 "줄 수 맞추기" 제약은 프롬프트에 넣지 않는다(요구 ②).

**④ analyze 페이로드 교체** (`main.py:1039-1052`) before/after:

```python
# before
                analyze_payload = {
                    "transcript_s3_key": transcript_key,
                    "moments": [
                        {
                            "index": idx,
                            "startSeconds": float(m["start"]),
                            "endSeconds": float(m["end"]),
                            "clipType": m.get("type"),
                            "hook": m.get("hook"),
                            "payoff": m.get("payoff"),
                        }
                        for idx, m in enumerate(validated_moments)
                    ],
                }
# after
                base_moments = [
                    {
                        "index": idx,
                        "startSeconds": float(m["start"]),
                        "endSeconds": float(m["end"]),
                        "clipType": m.get("type"),
                        "hook": m.get("hook"),
                        "payoff": m.get("payoff"),
                    }
                    for idx, m in enumerate(validated_moments)
                ]
                reference_translations = build_reference_translations(
                    validated_moments, transcript_segments, language, self.gemini_client
                )
                analyze_payload = {
                    "transcript_s3_key": transcript_key,
                    "moments": attach_reference_translations(base_moments, reference_translations),
                }
```

English에서 `reference_translations is None` → `attach_reference_translations`가 `base_moments`를 그대로 반환 → 페이로드가 before와 바이트 동일. Korean에서만 각 moment에 `referenceTranslation`이 붙는다. 콜백(`:1054-1061`)과 동기 응답(`:1166-1171`)은 `**analyze_payload`를 그대로 스프레드하므로 추가 수정이 없다.

### CLAUDE.md 인용 줄 밀림

이 구현은 import 블록·모듈 레벨 함수·페이로드 수정으로 `main.py` 하단 줄번호를 아래로 민다. `apps/backend/CLAUDE.md`가 인용하는 analyze 소비 위치(`main.py:1046-1048`)·이미지 등록 줄(`main.py:85`)과 web 쪽 `main.py:\d+` 인용이 밀린다 — **인수 때 메인 루프가 갱신**한다(dev 쓰기 범위 밖 문서는 `.claude/`·`docs/`에 걸쳐 있음). 계획서는 밀림 여부만 명시한다.

## 테스트

`apps/backend/test_reference_translation.py` (`unittest.TestCase`, `main.py` import 안 함 — `from reference_translation import ...`):

- **덮는 것** — 아래 케이스를 테스트 메서드 **20개 이상**으로 쓴다(B-5 확인 기준: 기존 79 + 신규 ≥ 20 → `Ran N tests`의 N ≥ 99):
  - `should_translate_references`: `"Korean"`만 True; `"English"`·`""`·`"korean"`·`"KOREAN"`·`" Korean "`·`"Spanish"`·`None`은 False (moment_prompt와 같은 정확 일치).
  - `build_reference_sources`: 경계 포함(`w.start == start`·`w.end == end` 포함), 앞으로 넘친 단어(`w.start < start`)·뒤로 넘친 단어(`w.end > end`) 제외 — `ClipDraftCard.tsx:108-109` 규칙과 동일; `" "` join; `index == 위치`; 빈 구간 → `text == ""`; `start`/`end`가 int인 moment도 `float()`로 처리; 시각·텍스트 없는 단어 skip; 반환 길이 == moment 수.
  - `build_reference_translation_prompt`: `count` 리터럴 삽입, 각 원문 텍스트 포함, `ensure_ascii=False`(비-ASCII 원문이 이스케이프 안 됨), 인덱스 유지 지시 문구 존재, `"translation"` 키 지시 존재.
  - `strip_code_fences`: 순수 JSON 무변경; ```` ```json ... ``` ````·```` ``` ... ``` ```` 제거; 앞뒤 공백; `main.py:1019-1025` 인라인 복제 재현식과 골든 비교.
  - `assemble_reference_translations`: 완전 맵→전부 번역; 일부 인덱스 누락→그 자리 None·나머지 번역(부분); 비-list payload(`{"error": "cannot-translate"}`)·빈 리스트→전부 None; 빈 원문 moment→맵에 그 인덱스가 있어도 None; 반환 길이 == sources 길이.
  - `attach_reference_translations`: None→같은 리스트 그대로 반환(`assertIs`)이며 어떤 dict에도 `referenceTranslation` 키 없음(**English 불변 — 요구 ①**); 리스트→각 moment에 aligned 값(str·null) 부착, 원본 dict 미변형(키 없음 유지), 길이 보존.
- **못 덮는 범위** (torch/whisperx로 `main.py` import 불가라 unittest 밖):
  - I/O 래퍼 `build_reference_translations`의 배선(언어 게이트→sources→translatable 필터→Gemini 호출→타임아웃→펜스 제거→assemble)과 페이로드 부착 호출부 — `py_compile`로 문법만, 동작은 `modal run`으로 사용자 확인.
  - Gemini 실출력의 번역 품질·인덱스 준수·문장 단위 자연스러움, Korean analyze 지연 증가량(입력 = 후보 수 × 구간당 단어 수(30~90s, 대략 80~250단어). 후보 수는 `identify_moments`에 `clip_count * 2`개를 요청한 결과다(`main.py:1017`; web `CLIP_COUNT_OPTIONS` 1~4 → 요청 최대 8). 다만 코드는 개수 상한을 강제하지 않는다 — `validate_moments`(`main.py:120-136`)는 길이만 거르고 개수를 자르지 않아, Gemini가 더 돌려주면 그만큼 입력이 는다. flash 1회 호출이라 web 60m 한도에 비해 미미) — 배포 후 실제 Korean 업로드로만 확인.
  - 배포 이미지의 `google-genai`(미고정 최신)가 `http_options=HttpOptions(timeout=...)`를 여전히 받는지(로컬 2.16.0은 받음 — 위 ③), `referenceTranslation`이 실제로 채워지는지 — 배포 뒤 Korean 업로드의 Modal 로그·콜백 본문으로 확인(받지 않으면 try/except가 전부 null로 조용히 강등하고 로그에 `Reference translation error:`가 남는다).
  - 이 필드는 FEAT-47(컬럼)·FEAT-48(표시) 전까지 화면에 안 나온다 — 배포 확인은 Modal 로그·콜백 본문으로만.

## 범위 밖 의존

없음. 이 항목은 전부 `apps/backend` 안이다(신규 순수 모듈 2 + `main.py`). FEAT-47(`ClipDraft` 컬럼)·FEAT-48(검토 카드 표시)은 이 필드(`referenceTranslation`)의 **하위 소비자**이지 이 항목의 선행이 아니다 — 이름만 맞추면 된다.

배포 순서 제약도 없다: web의 웹훅 정규화기 `normalizeAnalyzedMoment`는 명시 필드만 복사해 모르는 필드를 버리고(main-loop 게이트① 실측: `modal-contract.ts:173-201`), 로컬 동기 모드도 드래프트 저장(`functions.ts:930-946`)이 필드를 하나씩 매핑해 새 필드가 DB에 닿지 않는다. 그래서 이 항목만 먼저 배포돼도 web은 무변화다.

## 대안

- **렌더 번역 경로 재사용**(`create_korean_subtitles_with_ffmpeg` / `main.py:481` 프롬프트) — 기각. 그건 3단어 묶음을 줄 수 맞춰 번역하는 렌더용이라 조각나고, 백로그가 참고 번역은 렌더 값을 재사용하지 않는 문장 단위여야 한다고 못박았다(요구 ②).
- **`identify_moments` 프롬프트에 번역을 섞어 한 호출로** — 기각. FEAT-43 원장 확인 항목 「같은 영상을 English·Korean으로 분석했을 때 고른 구간이 크게 다르지 않은가」가 지키는 구간 선택 안정성을 흔든다. 별도 호출로 분리한다(요구 ④).
- **English 경로에도 `referenceTranslation: null`을 싣기** — 기각. 요구 ①은 English에 호출도 필드도 더하지 않는다. 페이로드를 바이트 그대로 두면 English 회귀 위험이 없고, FEAT-48 정규화기가 "키 없음 == null"을 균일하게 처리한다.
- **`assemble_korean_texts` 재사용** — 기각. 그건 누락 인덱스를 영어로 폴백하는데, 여기서는 null이 요구다. 파싱 원시(`parse_translations`)만 재사용하고 조립은 새로 쓴다.
