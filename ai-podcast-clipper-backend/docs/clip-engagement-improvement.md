# 클립 참여도 개선 계획

## 문제 정의

생성된 클립이 시청자의 흥미를 충분히 이끌지 못하는 두 가지 주요 증상:
1. 중요한 내용을 이야기하다 갑자기 끊김
2. 뒷내용이 더 궁금한 상황에서 너무 짧게 마무리됨

---

## 근본 원인 분석

### 원인 1: 60초 초과 클립 전체 스킵 (`main.py:753`)

```python
# 현재 프롬프트 규칙:
# "If the answer continues past 60 seconds, skip that candidate clip instead of trimming"
```

답변이 65초만 되어도 해당 Q&A 전체가 결과에서 사라짐.
핵심 내용이 담긴 구간이 아무 경고 없이 누락됨.

### 원인 2: Q&A 형식만 허용

현재 프롬프트는 "질문 + 답변" 구조만 식별함.
팟캐스트 콘텐츠의 상당 부분을 차지하는 **핵심 인사이트, 반직관적 주장, 통찰 구간**이 모두 누락됨.

### 원인 3: 훅(Hook) / 페이오프(Payoff) 기준 없음

Gemini는 구조적으로 올바른 구간을 선택하지만, 시청자 관점의 "흥미도"는 고려하지 않음:
- 클립이 지루한 도입부나 전환 문장으로 시작하는 경우 발생
- 결말이 완결된 인사이트가 아닌 미완성 문장으로 끝나는 경우 발생

---

## 개선 방향

### 변경 사항 요약

| 항목 | 기존 | 개선 후 |
|------|------|---------|
| 콘텐츠 유형 | Q&A만 | Q&A + 인사이트/통찰 |
| 최대 클립 길이 | 60초 (초과 시 스킵) | 90초 (초과 시 스킵) |
| 목표 길이 | 40~60초 | 50~90초 |
| 훅 기준 | 없음 | 첫 5초 강제 검증 |
| 결말 기준 | 문장 경계만 | 완결된 페이오프 필수 |
| 참여도 정렬 | 없음 | 높은 순으로 정렬, 상위 N개 선택 |
| 후보 클립 수 | `clip_count`개 요청 | `clip_count * 2`개 요청 후 상위 선택 |
| hook/payoff 메타데이터 | 없음 | 응답에 포함 |

---

## 구현 상세

### 1. `identify_moments()` 프롬프트 전체 교체

**파일**: `main.py` line 737~764

기존 프롬프트를 아래로 교체한다.

```
You are a viral short-form video editor specializing in podcast content.

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
  or topic transitions ("Moving on", "Next", "Let's talk about").
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
```

> ⚠️ **주의**: 프롬프트에 `TARGET_COUNT`라는 리터럴 문자열 플레이스홀더를 사용한다.
> 아래 구현 (섹션 2)에서 실제 숫자로 치환한다.
> Python f-string이나 `.format()`은 transcript JSON 내의 `{}`와 충돌하므로 절대 사용 금지.
> 반드시 `str.replace()`로 치환해야 한다.

### 2. `identify_moments()` 시그니처 및 프롬프트 조립 변경

**파일**: `main.py` line 736~773

```python
# 기존
def identify_moments(self, transcript: list) -> str:

# 변경
def identify_moments(self, transcript: list, target_count: int = 6) -> str:
```

프롬프트 조립 시 `TARGET_COUNT`를 `str.replace()`로 치환한 뒤 transcript를 이어 붙인다.
f-string이나 `.format()`을 사용하면 transcript JSON 안의 `{`, `}` 문자를 Python이
포매팅 토큰으로 오인해 `KeyError`가 발생한다.

```python
def identify_moments(self, transcript: list, target_count: int = 6) -> str:
    prompt_template = """...(위의 새 프롬프트 전체)...\n\nTranscript:\n"""

    # ✅ 올바른 방법: str.replace()로 플레이스홀더 치환 후 JSON 이어 붙이기
    prompt = (
        prompt_template.replace("TARGET_COUNT", str(target_count))
        + json.dumps(transcript, ensure_ascii=False)
    )

    response = self.gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=genai.types.GenerateContentConfig(
            response_mime_type="application/json",
        )
    )
    print(f"Identified moments response: ${response.text}")
    return response.text
```

### 3. `identify_moments()` 호출부 수정

**파일**: `main.py` line 831

```python
# 기존
identified_moments_raws = self.identify_moments(transcript_segments)

# 변경: clip_count * 2개 후보 요청 후 상위 clip_count개 처리
identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2)
```

### 4. 클립 길이 검증 로직 추가

**파일**: `main.py`, `clip_moments` 파싱 직후 (line ~855 앞)

기존 `clip_moments[:clip_count]` 루프를 아래로 교체한다.
기존의 `if "start" in moment and "end" in moment:` 가드는 제거한다
(검증 루프에서 이미 None 체크 후 필터링하므로 중복임).

```python
MAX_CLIP_DURATION = 90  # 초
MIN_CLIP_DURATION = 30

validated_moments = []
for moment in clip_moments:
    start = moment.get("start")
    end = moment.get("end")
    if start is None or end is None:
        continue
    duration = end - start
    if MIN_CLIP_DURATION <= duration <= MAX_CLIP_DURATION:
        validated_moments.append(moment)
    else:
        print(f"Skipping moment ({duration:.1f}s): outside [{MIN_CLIP_DURATION}, {MAX_CLIP_DURATION}]s range")

# validated_moments는 이미 engagement 순 정렬 상태
for index, moment in enumerate(validated_moments[:clip_count]):
    print(f"Processing clip {index} from {moment['start']} to {moment['end']}")

    clip_result = process_clip(
        base_dir,
        video_path,
        s3_key,
        moment["start"],
        moment["end"],
        index,
        transcript_segments,
        self.gemini_client,
        selected_language,
    )

    # Gemini가 생성한 참여도 메타데이터를 결과에 병합
    clip_result["clipType"] = moment.get("type")
    clip_result["hook"] = moment.get("hook")
    clip_result["payoff"] = moment.get("payoff")

    clip_results.append(clip_result)
```

> **왜 `process_clip()` 시그니처를 변경하지 않는가**:
> `process_clip()`은 비디오 처리(FFmpeg, Columbia ASD, S3 업로드)만 담당한다.
> Gemini 메타데이터(hook/payoff)는 처리 결과와 무관한 선택 근거 정보이므로,
> `process_clip()` 호출 후 호출부(`process_video()`)에서 dict에 병합하는 것이 책임 분리 원칙에 맞다.

### 5. 응답 필드명 변경 (`clips_planned` → `clips_processed`)

**파일**: `main.py` line 882

```python
# 기존 (하드코딩된 min(3, ...) 잔재이자 의미 불일치)
"clips_planned": min(3, len(clip_moments)),

# 변경: 실제 처리 완료된 클립 수를 정확히 반영
"clips_processed": len(clip_results),
```

> **왜 필드명도 변경하는가**:
> 기존 `clips_planned`는 "처리 예정 수"를 의미하지만, 변경 후 값은
> 실제 성공적으로 처리된 수(`len(clip_results)`)이므로 필드명도 함께 수정한다.
> 프론트엔드에서 이 필드를 사용 중이라면 동일하게 수정 필요.

---

## 변경 파일 및 위치 요약

| # | 파일 | 위치 | 변경 내용 |
|---|------|------|-----------|
| 1 | `main.py` | line 737~764 | `identify_moments()` 프롬프트 교체 |
| 2 | `main.py` | line 736 | `identify_moments()` 시그니처 + 조립 로직 변경 |
| 3 | `main.py` | line 831 | 호출부 `clip_count * 2` 전달 |
| 4 | `main.py` | line ~855 | 검증 루프 추가 + `clip_result`에 메타데이터 병합 |
| 5 | `main.py` | line 882 | `clips_planned` → `clips_processed` |

---

## 기대 효과

| 문제 | 기존 | 개선 후 |
|------|------|---------|
| 60초 초과 구간 전체 스킵 | 중요한 답변 손실 | 90초로 확장 → 대부분 포함 가능 |
| Q&A만 허용 | 핵심 인사이트 누락 | 인사이트 유형 추가로 후보 2배 이상 증가 |
| 훅 없이 시작 | 도입부가 지루함 | 훅 필수 기준으로 약한 시작 제거 |
| 중간에 끊김 | 페이오프 없는 클립 생성 | 완결 페이오프 필수 기준으로 해결 |
| 임의 순서 선택 | 품질 보장 없음 | engagement 순 정렬 후 상위 N개 선택 |

---

## 검증 방법

1. `modal run main.py` 로 기존 테스트 영상 처리
2. 반환된 `clips[].hook` / `clips[].payoff` 필드가 응답에 포함되는지 확인
3. `clips[].scriptText` 가 완전한 문장으로 끝나는지 확인
4. 각 클립 duration (`endSeconds - startSeconds`) 이 30~90초 범위인지 확인
5. S3 업로드된 영상을 실제 재생하여 첫 5초 훅 품질 및 결말 완결성 체감 확인
6. 프론트엔드에서 `clips_planned` → `clips_processed` 필드명 변경 반영 여부 확인
