# BUG-02: 한국어 번역 API 실패 시 영어로 조용히 폴백됨 (사용자에게 알림 없음)

agent: backend-dev

## 현재 동작

한국어 자막은 `create_korean_subtitles_with_ffmpeg()`(`main.py:392`)가 만든다. 이 함수는
클립 범위 단어를 묶어 `english_subtitles`를 만들고(`main.py:414-450`), 영어 텍스트를
`english_texts`로 뽑은 뒤(`main.py:458`), Gemini에 일괄 번역을 요청한다(`main.py:497-504`).

번역 실패 시 **세 갈래로 영어 폴백**이 일어나는데, 세 갈래 모두 서버 `print`만 남기고
결과물에는 아무 표시가 없다.

1. **응답 파싱 → 맵 구성**(`main.py:516-524`): `translation_payload`가 list이고 각 항목이
   `{index:int, translation:str}`일 때만 `translations_map`에 담는다. 모델이
   `{"error":"cannot-translate"}`(프롬프트가 지시한 실패 신호, `main.py:477`)나 비-list를
   돌려주면 `translations_map`은 `{}`로 남는다.
2. **줄 단위 폴백**(`main.py:526-532`): 각 index에 번역이 없거나(`translations_map.get(idx)`가
   falsy) 빈 문자열이면 `Warning: Missing translation for index {idx}, using English text
   fallback.`를 print하고(`main.py:530`) `english_texts[idx]`를 그대로 쓴다(`main.py:531`).
   위 1의 빈 맵이면 **모든 줄**이 이 경로로 영어가 된다.
3. **전량 폴백**(`main.py:534-536`): API 호출·파싱 중 어떤 예외든 잡아
   `Translation error: {e}. Using original English text.`를 print하고(`main.py:535`)
   `korean_texts = english_texts`로 전부 영어로 되돌린다(`main.py:536`).

폴백 여부와 무관하게 `korean_texts`로 한글 스타일 자막을 렌더하고(`main.py:538-583`),
함수는 **`script_text`만 반환한다**(`main.py:592-593`). 즉 "이 클립의 실제 자막이 영어로
떨어졌다"는 사실은 이 반환 경계에서 소멸한다.

이 함수의 유일한 호출부는 `process_clip()`의 Korean 분기다(`main.py:839`). 반환값을
`script_text`에 받고, 클립 결과 dict를 만든다(`main.py:859-869`) — 그 dict에는 `scriptText`,
`language: selected_language`(값은 `"Korean"`)가 실리지만 **폴백을 기록하는 필드는 없다.**

`_do_process_video()`(`main.py:1019`)는 클립 결과를 `clip_results`에 누적하고(`main.py:1189`),
성공 콜백을 POST한다(`main.py:1192-1199`) — `status: "ok"`, `clips: clip_results`. 따라서
번역이 실패해 영어로 렌더된 클립도 `language: "Korean"` · `status: "ok"`로, 정상 한국어
클립과 **구분 불가능하게** 나간다.

**폴백 사실이 유실되는 전달 사슬**(어디까지 전달되지 않는지):

- 반환 경계 `main.py:592-593`에서 소멸(`script_text`만 반환) →
- 클립 결과 dict에 없음(`main.py:859-869`) →
- 콜백 페이로드에 없음(`main.py:1198`) →
- 웹 수신부 정규화 `normalizeClip`(`apps/web/src/app/api/webhooks/modal/route.ts:131-154`)은
  **알려진 키만 골라 담고 미지 키는 버린다**(엄격 스키마 아님, 읽기만 확인) — 백엔드가
  필드를 실어도 웹이 그 키를 추가하기 전까지는 그대로 버려진다.
- 유일한 흔적은 Modal 로그로 가는 서버 `print`뿐(`main.py:530`·`535`) — 사용자는 못 본다.

BUG-03이 이미 이식한 순수 모듈 선례가 있다: 상단 import 블록(`main.py:25-32`)이
`s3_upload_policy`를 import하고, Modal 이미지 체인 끝(`main.py:66-67`)이
`.add_local_dir(...).add_local_python_source("s3_upload_policy")`로 사이드 모듈을 번들한다.

## 문제

백로그(`TASK_BACKLOG.md` BUG-02, source: README Known Issues "한국어 번역 API 실패 시 영어로
조용히 폴백됨 (사용자에게 알림 없음)")가 지목한 대로, 사용자가 한국어 자막을 요청했는데
번역이 실패하면 영어로 렌더된 영상이 나가고 **아무도 알리지 않는다.** 코드에서 확인한
바(위 「현재 동작」)와 백로그 관측은 일치한다 — 폴백 사실은 `create_korean_subtitles_with_ffmpeg`의
반환 경계(`main.py:592-593`)에서 이미 소멸하므로, 콜백 페이로드에도 웹에도 도달할 방법이 없다.

이 계획은 **백엔드 절반**만 다룬다: 폴백 사실을 순수 모듈로 판정해
`create_korean_subtitles_with_ffmpeg` → `process_clip` 반환 → 콜백 페이로드까지 실어
**백엔드에서의 조용한 유실을 멈춘다.** 사용자에게 실제로 보이는 알림은 그 필드를 소비하는
웹 표시 계약(`apps/web`)이 있어야 완성되며, 이는 담당 범위 밖이라 여기서 하지 않고
「범위 밖 의존」에 경계를 긋는다(BUG-03의 `clips: []` 처리 방식과 동일).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/translation_fallback.py` `(신규)` | 번역 응답 파싱·영어 폴백 조립·폴백 상태 분류를 stdlib만으로 계산하는 순수 함수 |
| `apps/backend/test_translation_fallback.py` `(신규)` | 위 순수 함수의 `unittest` 케이스 |
| `apps/backend/main.py` | 순수 모듈 import + `create_korean_subtitles_with_ffmpeg`의 인라인 파싱·조립(`516-536`)을 순수 함수로 교체하고 `subtitle_status` 계산·반환(`592-593`) + `process_clip`의 Korean 분기 언패킹(`839`)·`subtitle_status` 초기화(`818`)·반환 dict에 `subtitleStatus` 추가(`859-869`) + 이미지 체인에 `translation_fallback` 번들(`67`) |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다.

## 구현 스케치

### 1. 새 순수 모듈 `apps/backend/translation_fallback.py` (본문 전체)

판단(어떤 텍스트를 쓸지·어느 줄이 폴백됐는지·전체 상태가 무엇인지)은 전부 이 모듈이 한다.
`google.genai`·network·GPU·파일에 닿지 않는다.

```python
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
```

### 2. `main.py` — 순수 모듈 import (상단 import 블록)

BUG-03이 추가한 `s3_upload_policy` import 블록(`main.py:27-32`) 바로 아래에 붙인다.

```python
from translation_fallback import (
    parse_translations,
    assemble_korean_texts,
    classify_translation,
    TRANSLATION_OK,
)
```

### 3. `main.py` — `create_korean_subtitles_with_ffmpeg` 파싱·조립·상태 (before/after)

`main.py:514-536` (파싱·줄 단위 폴백·except):

```python
# before
        translation_payload = json.loads(response_text)

        translations_map = {}
        if isinstance(translation_payload, list):
            for item in translation_payload:
                if not isinstance(item, dict):
                    continue
                idx = item.get("index")
                text = item.get("translation")
                if isinstance(idx, int) and isinstance(text, str):
                    translations_map[idx] = text.strip()

        korean_texts = []
        for idx in range(len(english_texts)):
            translation = translations_map.get(idx)
            if not translation:
                print(f"Warning: Missing translation for index {idx}, using English text fallback.")
                translation = english_texts[idx]
            korean_texts.append(translation)

    except Exception as e:
        print(f"Translation error: {e}. Using original English text.")
        korean_texts = english_texts
# after
        translation_payload = json.loads(response_text)

        translations_map = parse_translations(translation_payload)
        korean_texts, missing_indices = assemble_korean_texts(english_texts, translations_map)
        if missing_indices:
            print(f"Warning: {len(missing_indices)} of {len(english_texts)} line(s) missing translation, using English fallback for indices {missing_indices}.")
        subtitle_status = classify_translation(len(english_texts), missing_indices)

    except Exception as e:
        print(f"Translation error: {e}. Using original English text.")
        korean_texts = english_texts
        subtitle_status = classify_translation(len(english_texts), [], hard_failure=True)
```

`main.py:592-593` (반환):

```python
# before
    script_text = "\n".join(text for _, _, text in korean_subtitles if text)
    return script_text
# after
    script_text = "\n".join(text for _, _, text in korean_subtitles if text)
    return script_text, subtitle_status
```

주의: `subtitle_status`는 try·except 두 경로 모두에서 대입되며, 반환 전 `korean_texts`와 함께
항상 정의된다. 영어 함수 `create_subtitles_with_ffmpeg`(`main.py:389-390`)의 반환(`str`)은
바꾸지 않는다 — 번역 단계가 없으므로 그 경로의 상태는 항상 `TRANSLATION_OK`(아래 4에서 초기값).

### 4. `main.py` — `process_clip` 언패킹·초기화·반환 필드 (before/after)

`main.py:818-819` (초기화):

```python
# before
    script_text = ""
    uploaded_clip_s3_key = None
# after
    script_text = ""
    subtitle_status = TRANSLATION_OK
    uploaded_clip_s3_key = None
```

`main.py:839` (Korean 분기 호출 — 튜플 언패킹):

```python
# before
        script_text = create_korean_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, korean_output_path, gemini_client, max_word=3, caption_style=caption_style)
# after
        script_text, subtitle_status = create_korean_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, korean_output_path, gemini_client, max_word=3, caption_style=caption_style)
```

`main.py:859-869` (반환 dict — `language` 아래에 `subtitleStatus` 추가):

```python
# before
    return {
        "index": clip_index,
        "startSeconds": float(start_time),
        "endSeconds": float(end_time),
        "s3Key": uploaded_clip_s3_key,
        "scriptText": script_text,
        "language": selected_language,
        "youtubeTitle": youtube_metadata["title"],
        "youtubeDescription": youtube_metadata["description"],
        "youtubeHashtags": youtube_metadata["hashtags"],
    }
# after
    return {
        "index": clip_index,
        "startSeconds": float(start_time),
        "endSeconds": float(end_time),
        "s3Key": uploaded_clip_s3_key,
        "scriptText": script_text,
        "language": selected_language,
        "subtitleStatus": subtitle_status,
        "youtubeTitle": youtube_metadata["title"],
        "youtubeDescription": youtube_metadata["description"],
        "youtubeHashtags": youtube_metadata["hashtags"],
    }
```

이 필드는 `clip_results`에 그대로 누적되어(`main.py:1189`) 성공 콜백 `clips`
배열(`main.py:1198`)로 나간다 — 별도 콜백 코드 변경 없이 자동 전달된다.

### 5. `main.py` — 이미지 체인에 순수 모듈 번들 (before/after)

`main.py:66-67`. Modal 1.x는 사이드 로컬 Python 모듈을 자동 포함하지 않으므로 명시한다.
`add_local_python_source`는 가변 인자를 받는다(BUG-03이 단일 인자 형태로 이미 동작을 확인).

```python
# before
    .add_local_dir("asd", "/asd", copy=True)
    .add_local_python_source("s3_upload_policy"))
# after
    .add_local_dir("asd", "/asd", copy=True)
    .add_local_python_source("s3_upload_policy", "translation_fallback"))
```

## 테스트

`apps/backend/test_translation_fallback.py` — `translation_fallback`만 import(stdlib-only,
torch·boto3·google.genai 불필요). `main.py`는 import하지 않는다. BUG-03의
`test_s3_upload_policy.py`와 같은 형태(`unittest.TestCase`).

**덮는 것** (약 20개 이상 단언):

- `parse_translations`:
  - 유효한 list → `{index: translation}` 맵(index는 int, translation은 strip됨)
  - 비-list(`{"error":"cannot-translate"}`·`None`·`"str"`) → `{}`
  - 비-dict 항목은 건너뜀 / index가 int 아님·translation이 str 아님 → 제외
  - 공백만 있는 translation(`"   "`)·빈 문자열 → 맵에서 제외
  - 앞뒤 공백이 있는 translation → strip되어 저장
- `assemble_korean_texts`:
  - 전부 존재 → korean == 번역값, missing == `[]`
  - 일부 index 누락(맵에 없음) → 그 줄은 영어, missing == 누락 index(오름차순)
  - 빈 맵 → 전부 영어, missing == 전체 index
  - `english_texts == []` → `([], [])`
  - 맵에 빈 문자열이 있어도(`{0: ""}`) 폴백 처리 — parse와 독립적으로 조립의 falsy 가드 확인
- `classify_translation`:
  - `total_lines == 0` → OK (그리고 `hard_failure=True`여도 OK — 0 검사가 먼저)
  - 누락 없음(`missing == []`) → OK
  - 전량 누락(`missing >= total`) → FULL_FALLBACK
  - 일부 누락 → PARTIAL_FALLBACK
  - `hard_failure=True` + 줄 있음 → FULL_FALLBACK
- `is_fallback`:
  - OK → False / PARTIAL·FULL → True
- 상태 상수 값 고정: `TRANSLATION_OK == "ok"`, `TRANSLATION_PARTIAL_FALLBACK ==
  "partial-fallback"`, `TRANSLATION_FULL_FALLBACK == "full-fallback"` (콜백/DB에 실리는
  리터럴이라 회귀 가드로 못박는다)

**못 덮는 범위** (stdlib 러너로 확인 불가 — `modal run`으로 사용자 확인 필요):

- `create_korean_subtitles_with_ffmpeg`의 실제 Gemini 호출·응답·예외 발생과, 튜플 반환이
  `process_clip`에서 올바로 언패킹되는 배선(`main.py:839`). 순수 모듈은 **파싱된 payload와
  평문 리스트**만 받으므로, 실제 API 실패→except 진입 배선은 이 러너로 덮이지 않는다.
- `subtitleStatus`가 클립 결과 dict를 거쳐 실제 콜백 페이로드(`main.py:1198`)로 나가는지.
- Modal 이미지에 `translation_fallback` 모듈이 실제로 번들되어 컨테이너에서 import되는지
  (`add_local_python_source` 효과).

## 범위 밖 의존

**이 계획은 백엔드에서의 조용한 유실을 멈추고 `subtitleStatus`를 콜백 페이로드에 실을 뿐,
사용자에게 보이는 알림 자체는 완성하지 않는다.** 알림은 아래가 있어야 사용자에게 닿는다 —
전부 담당 범위 밖이므로 여기서 하지 않는다.

- **웹 수신·표시 계약**(`apps/web`): 웹 웹훅 정규화 `normalizeClip`
  (`apps/web/src/app/api/webhooks/modal/route.ts:131-154`)은 알려진 키만 골라 담고 미지 키를
  버린다(읽기만 확인). 백엔드가 `subtitleStatus`를 실어도 웹이 그 키를
  `ModalWebhookClip`/`RawModalWebhookClip`/`normalizeClip`에 추가하고, 이어서 Clip 엔티티·
  화면(예: 클립 카드의 "번역 실패 — 영어 자막으로 대체" 안내)까지 잇기 전까지는 그대로 버려진다.
  값을 영구 저장하려면 `packages/db` 스키마에 컬럼이 필요할 수도 있다(더 바깥). **추가되는
  필드는 순증분이라 웹을 깨지 않는다**(정규화가 미지 키를 무시) — 그러나 알림을 실제로 띄우는
  일은 `apps/web`(+경우에 따라 `packages/db`)의 작업이다. 별도 항목으로 다뤄야 한다.
- **`modal deploy`·`modal run` 검증**: 배포와 실제 실행 검증은 사용자만 한다. 이 계획의
  구현은 stdlib `unittest` + `py_compile`까지만 자체 검증할 수 있고, 컨테이너에서의 실제
  번역 실패→상태 전달·이미지 번들링은 `modal run`으로 사용자가 확인해야 한다.

## 대안

- **콜백 페이로드를 건드리지 않고 서버 로깅만 개선**: 담당 범위 안이지만, 폴백 사실이 여전히
  백엔드 밖으로 나가지 못해 유실 문제(반환 경계 소멸)를 풀지 못한다 — 백로그가 지목한
  "전달되지 않음"의 핵심을 그대로 둔다. 기각.
- **`subtitleStatus`를 bool(`translationFallback: true`)로만 전달**: 더 단순하나, 부분 폴백과
  전량 폴백을 구분하지 못한다. 세 상태(`ok`/`partial-fallback`/`full-fallback`)가 웹이 나중에
  더 정확한 안내("일부 줄이 영어" vs "전부 영어")를 만들 여지를 남기고, 순수 함수로
  검증 가능한 분류 로직도 확보한다. 셋 중 하나로 확정.
- **번역 실패 시 예외를 던져 클립 전체를 실패 처리**: 사용자가 "영어라도 받는" 현재의
  graceful degradation을 잃는다(자막 없는 실패보다 영어 자막이 낫다). 백로그는 폴백을
  없애라는 게 아니라 **알리라는** 것이므로, 폴백은 유지하고 사실만 실어 보낸다. 기각.
