# FEAT-43: 클립 후보의 hook·payoff를 업로드 언어로 생성

agent: backend-dev

## 현재 동작

- `identify_moments`는 언어를 받지 않는다 — `main.py:936` `def identify_moments(self, transcript: list, target_count: int = 6) -> str:`. 시그니처에 `language`가 없다.
- 프롬프트 본문은 `main.py:937-1005`의 삼중따옴표 리터럴 `prompt_template`이다. 출력 필드 정의에 언어 지시가 없다 — `main.py:992` `"type": <"qa" | "insight">,`, `:993` `"hook": <one sentence: why the first 5 seconds hook viewers>,`, `:994` `"payoff": <one sentence: what value the viewer gets at the end>`. 입력 전사가 영어이므로 두 문장이 영어로 나온다.
- 프롬프트 조립은 `main.py:1006-1009` — `prompt = (prompt_template.replace("TARGET_COUNT", str(target_count)) + json.dumps(transcript, ensure_ascii=False))`. 이어서 `:1010-1015`가 Gemini `gemini-2.5-flash`를 호출하고 `:1017`이 `response.text`를 반환한다.
- 언어 값은 워커까지 이미 온다 — `main.py:1021` `def _do_process_video(self, s3_key: str, language: str, clip_count: int, ...`. 두 호출부가 그 `language`를 `identify_moments`에 넘기지 않을 뿐이다. 호출부는 정확히 둘이다(전수 grep 확인): analyze 경로 `main.py:1082` `identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2)`, auto 경로 `main.py:1149` `identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2)`. 둘 다 `_do_process_video` 본문 안이라 `language`가 스코프에 있다.
- render 모드는 `identify_moments`를 호출하지 않는다 — `main.py:1130-1145`가 웹이 돌려준 `moments`의 `m.get("hook")`·`m.get("payoff")`를 그대로 쓴다(`:1138-1139`). 최종 클립에도 복사된다 — `main.py:1189-1191` `clip_result["clipType"] = moment.get("type")` / `["hook"]` / `["payoff"]`. analyze 페이로드도 같은 값을 실어 보낸다 — `main.py:1111-1113`.
- 언어 조건부 프롬프트 선례가 같은 파일에 있다 — `generate_youtube_metadata`가 `main.py:643` `- If language is Korean, generate all content in Korean`을 본문에 두고 `:650` `if language == "Korean":`로 한국어 전용 지침을 뒤에 덧붙인다.
- 순수 모듈 선례 넷과 그 import는 `main.py:27-43`(`s3_upload_policy`·`translation_fallback`·`temp_cleanup_policy`·`error_callback`). 각 `test_*.py`는 `main.py`를 import하지 않고 모듈만 import한다(`test_translation_fallback.py:8`).

## 문제

백로그 FEAT-43 `source`가 지목한 문제: Korean으로 업로드한 사용자가 `review_pending` 검토 화면에서 구간을 고를 때 hook·payoff가 영어로만 보여 "내용 이해"라는 검토의 첫 번째 일(구간 고르기)이 막힌다. 원인은 `identify_moments`의 프롬프트(`main.py:937-1005`)에 언어 지시가 없어 영어 전사로부터 영어 두 문장이 생성되고, 그 값이 검토 카드 제목·설명(`ClipDraftCard.tsx:307,311`)과 완성 클립 카드(`ClipCard.tsx:45`)까지 그대로 흐르기 때문이다.

이 항목은 그중 **hook·payoff의 언어화만** 고친다(대화에서 확정된 ①). 전사 본문·`start`/`end`(오디오·단어 타이밍이 영어)와 `type` enum은 무변경이다. 코드에서 확인한 사실과 백로그가 지목한 문제는 어긋나지 않는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/moment_prompt.py` `(신규)` | `prompt_template` 본문을 상수 `MOMENT_PROMPT_TEMPLATE`로 바이트 그대로 옮기고, 언어→지시문 조립을 순수 함수 `moment_language_directive` · `build_moment_prompt`로 제공. stdlib(`json`)만 import |
| `apps/backend/test_moment_prompt.py` `(신규)` | 위 모듈의 unittest. English·빈·미지 값 바이트 불변 단언 + 템플릿 frozen 단언 + Korean 지시문 삽입/가산성/`type` 불간섭 단언 |
| `apps/backend/main.py` | ① 상단 import에 `from moment_prompt import build_moment_prompt` 추가(`:43` 인접). ② `identify_moments` 시그니처에 `language` 추가, 본문의 `prompt_template` 리터럴(`:937-1005`)과 조립(`:1006-1009`)을 `build_moment_prompt(transcript, target_count, language)` 호출로 교체. ③ 호출부 둘(`:1082`, `:1149`)이 `language`를 넘기게 인자 추가 |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다. 웹은 무변경(백로그 확인 — hook·payoff는 웹 전 소비처에서 불투명 문자열).

## 구현 스케치

### `apps/backend/moment_prompt.py` (신규)

```python
"""후보 추출(identify_moments) 프롬프트 조립 — 순수 로직 (stdlib만).

identify_moments의 얇은 Gemini 래퍼가 build_moment_prompt를 호출해
"어떤 프롬프트 문자열을 Gemini에 보낼지"를 결정한다.
google.genai·network·GPU·파일에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

import json

# main.py:937-1005의 prompt_template을 바이트 그대로 옮긴 것.
# 이 상수가 원본과 같다는 것은 test_moment_prompt.py의 frozen 테스트가 지킨다.
MOMENT_PROMPT_TEMPLATE = """You are a viral short-form video editor specializing in podcast content.
... (main.py:937-1005의 리터럴 본문을 한 글자도 바꾸지 않고 그대로. 라인 980의
     curly apostrophe(Let’s)와 :981-983의 straight quote 포함, 마지막이 'Transcript:\\n') ...
Transcript:
"""

# 언어 지시를 끼워 넣는 유일 앵커. 템플릿 끝에 딱 한 번 등장한다("transcript"(소문자)는 :939에도
# 있으나 "Transcript:\n"(대문자+콜론+개행)은 마지막 한 곳뿐).
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
```

Korean일 때 삽입 결과(앵커 앞부분):

```
No explanations.

# Output Language
- Write the "hook" and "payoff" field values in Korean.
- Keep "type" exactly "qa" or "insight"; do not translate it.
- Keep "start" and "end" as numeric seconds from the transcript.

Transcript:
```

**바이트 불변 근거**: English/빈/미지에서 `directive == ""`라 `if directive:`가 거짓 → 앵커 교체가 일어나지 않고 `prompt = MOMENT_PROMPT_TEMPLATE.replace("TARGET_COUNT", str(target_count)) + json.dumps(transcript, ensure_ascii=False)`가 되어 현재 `main.py:1006-1009`와 완전히 같다. 단, 이것이 성립하려면 `MOMENT_PROMPT_TEMPLATE`이 `prompt_template`과 바이트 동일해야 한다 — 구현 시 리터럴을 잘라 붙이는 이동(cut-paste)으로 하고, `git diff`가 main.py에서 제거된 리터럴과 moment_prompt.py에 추가된 상수가 같은 바이트임을 보이는 것이 그 증거다. 이후 드리프트는 frozen 테스트가 막는다.

### `apps/backend/main.py`

상단 import(선례 `:43` `from error_callback import build_error_callback_payload` 인접):

```python
from moment_prompt import build_moment_prompt
```

`identify_moments` — before(`:936`):

```python
    def identify_moments(self, transcript: list, target_count: int = 6) -> str:
        prompt_template = """You are a viral short-form video editor specializing in podcast content.
...
Transcript:
"""
        prompt = (
            prompt_template.replace("TARGET_COUNT", str(target_count))
            + json.dumps(transcript, ensure_ascii=False)
        )
        response = self.gemini_client.models.generate_content(
```

after (리터럴 `:937-1005`와 조립 `:1006-1009` 삭제, `language` 인자 추가):

```python
    def identify_moments(self, transcript: list, target_count: int = 6, language: str = "English") -> str:
        prompt = build_moment_prompt(transcript, target_count, language)
        response = self.gemini_client.models.generate_content(
```

`:1010-1017`(Gemini 호출·print·return)은 그대로 둔다.

analyze 호출부 — before(`:1082`):

```python
                identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2)
```

after:

```python
                identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2, language)
```

auto 호출부 — before(`:1149`):

```python
                    identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2)
```

after:

```python
                    identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2, language)
```

## 테스트

`apps/backend/test_moment_prompt.py` — `main.py`를 import하지 않고 `moment_prompt`만 import(선례 `test_translation_fallback.py:8`). 테스트는 원본 템플릿의 frozen 사본 `EXPECTED_TEMPLATE`(main.py:937-1005에서 바이트 그대로 복사)를 상단에 둔다 — 이것이 "현재 프롬프트와 완전 일치" 단언의 기준이다.

- **덮는 것** (`unittest.TestCase`, 약 10 케이스):
  1. `test_english_matches_current_formula` — `build_moment_prompt(t, n, "English") == MOMENT_PROMPT_TEMPLATE.replace("TARGET_COUNT", str(n)) + json.dumps(t, ensure_ascii=False)`. 영어는 지시문을 더하지 않고 현재 조립식과 동일.
  2. `test_empty_language_matches_english` — `build_moment_prompt(t, n, "")` == English 결과.
  3. `test_unknown_language_matches_english` — `"Spanish"`·`"Japanese"` 등 미지 값 == English 결과.
  4. `test_template_frozen` — `MOMENT_PROMPT_TEMPLATE == EXPECTED_TEMPLATE`. 템플릿 본문 바이트 불변(회귀 방어의 본체).
  5. `test_directive_empty_for_english_nonempty_for_korean` — `moment_language_directive("English") == ""`, `moment_language_directive("Korean") != ""`.
  6. `test_korean_inserts_directive_before_transcript` — Korean 프롬프트에서 지시문이 `"Transcript:\n"` 바로 앞에 위치.
  7. `test_korean_is_english_plus_directive` — Korean 프롬프트에서 지시문 부분을 제거하면 English 프롬프트와 동일(순수 가산성 — 기존 지시가 지워지거나 변형되지 않음).
  8. `test_korean_keeps_type_enum_lines` — Korean 프롬프트에 `'"type": <"qa" | "insight">,'`·`'"hook":'`·`'"payoff":'` 필드 정의 줄이 그대로 존재. 지시문 문자열은 `type` 번역을 지시하지 않음(오히려 "do not translate").
  9. `test_target_count_substituted` — 두 언어 모두 출력에 `"TARGET_COUNT"` 부재, `str(n)` 존재.
  10. `test_transcript_json_ensure_ascii_false` — 비ASCII 단어(예: 한글)를 포함한 transcript가 유니코드 그대로 프롬프트에 실림(escape 안 됨).

- **못 덮는 범위**: 아래 「범위 밖 의존」 없음과 별개로, 이 러너로 확인할 수 없는 것 — (a) Gemini가 실제로 hook·payoff를 한국어로 쓰는지, 한국어 문장 품질. (b) 같은 영상을 English/Korean으로 분석해 고른 구간이 크게 달라지지 않는지(구간 선택 품질). (c) `main.py`의 호출부 두 곳이 `language`를 실제로 넘기는 배선 — `main.py`는 whisperx→torch를 import해 unittest 러너로 안 돈다. (a)(b)는 배포 후 수동 대조로 `docs/release-checks.md` 등재 대상, (c)는 `py_compile` + `git diff`로만 확인. 이미 분석된 업로드의 hook/payoff는 영어로 남는다(백필 없음).

## 범위 밖 의존

없음. `apps/backend` 안에서 닫힌다 — 신규 순수 모듈 + `main.py` 배선 + 테스트뿐이고, 웹은 무변경이다(hook·payoff는 웹 전 소비처에서 불투명 문자열로만 다뤄져 영어를 가정하는 로직이 없다). `asd/`·`requirements.txt`에 닿지 않는다.

배포 검증은 사용자 몫이다 — `modal run`/`modal deploy`는 GPU·프로덕션 S3·Gemini를 쓰므로 이 에이전트가 실행하지 않는다. 배포 시 `PYTHONUTF8=1` 필요(이 머신에서 `modal deploy`가 cp949로 크래시).

## 대안

- **검토 단계 전사 선번역**: 렌더 번역이 `max_word` 단어 조각 단위로 돌아(`main.py:449,465`) 미리 번역한 문단이 최종 자막과 다른 문장이 되고, 경계 조정 시 낡으며, 렌더 안 할 후보(`clip_count * 2`)까지 번역 비용이 든다. 기각.
- **렌더 후 한국어 자막 검토·수정**: GPU 재렌더가 따르는 큰 기능이라 번역 폴백(`subtitleStatus`)이 잦다는 증거가 생길 때까지 보류.
- **스타일 미리보기 한국어 샘플 문장**: 샘플이 실제 번역과 길이가 달라 정확도 이득이 없어 하지 않음.
- **프롬프트 지시를 `generate_youtube_metadata`처럼 프롬프트 끝에 append**: 여기선 transcript JSON이 프롬프트 맨 끝에 붙으므로(`:1008`) append하면 지시가 transcript 뒤로 밀린다. 그래서 `"Transcript:\n"` 앵커 앞에 삽입하는 방식을 택했다 — 지시가 필드 정의 뒤·전사 앞에 놓인다.
- **`language`를 pydantic 요청 필드로 새로 받기**: 불필요 — `language`는 `_do_process_video`에 이미 파라미터로 있고 두 호출부가 스코프에서 접근 가능하다.
