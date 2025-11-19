# 한글 자막 기능 구현 계획서

**작성일**: 2025-11-17
**버전**: 1.0
**작성자**: AI Podcast Clipper Development Team

---

## 📋 목차
1. [개요](#개요)
2. [요구사항 분석](#요구사항-분석)
3. [현재 시스템 분석](#현재-시스템-분석)
4. [구현 계획](#구현-계획)
5. [파일 변경 사항](#파일-변경-사항)
6. [상세 구현 설계](#상세-구현-설계)
7. [테스트 계획](#테스트-계획)
8. [배포 계획](#배포-계획)
9. [리스크 및 대응 방안](#리스크-및-대응-방안)

---

## 개요

### 목적
AI Podcast Clipper 백엔드에 한글 자막 생성 기능을 추가하여, 영어 팟캐스트 클립에 한글 번역 자막을 제공합니다.

### 범위
- 영어 자막과 한글 자막 영상을 각각 생성
- 기존 영어 자막 로직은 유지하고 새로운 한글 자막 함수 추가
- Gemini API를 활용한 자연스러운 한글 번역
- Noto Sans KR Bold 폰트를 사용한 가독성 높은 한글 자막

### 주요 목표
✅ 영어/한글 두 버전의 자막 영상 생성
✅ 기존 코드 구조 유지 (새 함수 추가 방식)
✅ 자막 타이밍 동기화
✅ 자연스러운 한글 번역

---

## 요구사항 분석

### 기능 요구사항
1. **이중 언어 출력**
   - 각 클립마다 영어 자막 영상(`clip_X_en.mp4`)과 한글 자막 영상(`clip_X_kr.mp4`) 생성
   - 동일한 S3 디렉토리에 업로드

2. **한글 폰트 지원**
   - Noto Sans KR Bold 폰트 사용
   - 기존 Anton 폰트는 영어 자막용으로 유지

3. **자막 스타일**
   - 한 줄에 최대 3단어 (한글 특성 고려)
   - 영어 자막과 동일한 타이밍 사용
   - 폰트 크기: 140px (영어와 동일)
   - 하단 정렬, 여백 50px

4. **번역 품질**
   - Gemini API를 통한 자연스러운 구어체 번역
   - 맥락을 고려한 문장 단위 번역
   - 팟캐스트 특성에 맞는 자연스러운 한국어

### 비기능 요구사항
1. **성능**
   - 한글 자막 추가로 인한 전체 처리 시간 증가 < 30%
   - Gemini API 호출 최적화 (배치 번역)

2. **안정성**
   - 번역 실패 시에도 영어 자막 영상은 정상 생성
   - 에러 로깅 및 모니터링

3. **유지보수성**
   - 기존 코드 구조 최대한 유지
   - 명확한 함수 분리 및 주석

---

## 현재 시스템 분석

### 기존 자막 생성 프로세스
```
1. transcribe_video()
   └─> WhisperX로 영어 음성을 텍스트로 변환
   └─> 단어별 start/end 타임스탬프 생성
   └─> JSON 형식: [{"start": float, "end": float, "word": str}, ...]

2. identify_moments()
   └─> Gemini로 Q&A 구간 식별
   └─> 클립 타임스탬프 반환: [{"start": seconds, "end": seconds}, ...]

3. process_clip() (각 클립마다)
   └─> FFmpeg로 비디오 세그먼트 추출
   └─> Columbia ASD로 화자 감지
   └─> create_vertical_video()로 세로 영상 생성
   └─> create_subtitles_with_ffmpeg()로 자막 오버레이 ⬅️ 여기 수정 필요
   └─> S3 업로드
```

### 기존 자막 함수 분석 (create_subtitles_with_ffmpeg)
**위치**: main.py:142-237

**주요 로직**:
1. 클립 범위 내 세그먼트 필터링
2. 단어를 max_word(5개)씩 그룹핑
3. 타임스탬프를 clip_start 기준으로 상대화
4. ASS 파일 생성 (Anton 폰트, 140px)
5. FFmpeg로 비디오에 자막 오버레이

**재사용 가능 부분**:
- ✅ 세그먼트 필터링 로직
- ✅ 타임스탬프 상대화 로직
- ✅ ASS 파일 생성 구조
- ✅ FFmpeg 자막 오버레이 명령어

**변경 필요 부분**:
- ❌ 폰트 이름 (Anton → Noto Sans KR)
- ❌ max_word 기본값 (5 → 3)
- ➕ 번역 레이어 추가

---

## 구현 계획

### 개발 단계
```
Phase 1: 환경 설정 (30분)
  ├─ Noto Sans KR 폰트 추가
  └─ Modal 이미지 재빌드 테스트

Phase 2: 번역 함수 개발 (1시간)
  ├─ translate_to_korean() 메서드 추가
  ├─ Gemini API 프롬프트 최적화
  └─ 단위 테스트 (번역 품질 확인)

Phase 3: 한글 자막 함수 개발 (1.5시간)
  ├─ create_korean_subtitles_with_ffmpeg() 함수 추가
  ├─ 기존 로직 재사용 및 번역 통합
  └─ ASS 스타일 한글 최적화

Phase 4: 통합 및 테스트 (1시간)
  ├─ process_clip() 수정
  ├─ S3 업로드 로직 수정
  └─ 전체 파이프라인 테스트

Phase 5: 배포 및 모니터링 (30분)
  ├─ Modal 배포
  └─ 실제 클립으로 검증
```

**총 예상 시간**: 4.5시간

---

## 파일 변경 사항

### main.py 수정 내역

#### 1. Modal 이미지 설정 (Line 34-38)
**변경 전**:
```python
.run_commands([
    "mkdir -p /usr/share/fonts/truetype/custom",
    "wget -O /usr/share/fonts/truetype/custom/Anton-Regular.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
    "fc-cache -f -v"
])
```

**변경 후**:
```python
.run_commands([
    "mkdir -p /usr/share/fonts/truetype/custom",
    "wget -O /usr/share/fonts/truetype/custom/Anton-Regular.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
    "wget -O /usr/share/fonts/truetype/custom/NotoSansKR-Bold.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR-Bold.ttf",
    "fc-cache -f -v"
])
```

#### 2. 새 함수 추가 (Line 240 이후)
- `create_korean_subtitles_with_ffmpeg()` - 약 120줄
- 위치: 기존 `create_subtitles_with_ffmpeg()` 함수 바로 다음

#### 3. 새 메서드 추가 (AiPodcastClipper 클래스 내부, Line 418 이후)
- `translate_to_korean()` - 약 35줄
- 위치: `identify_moments()` 메서드 바로 다음

#### 4. process_clip() 함수 수정 (Line 241-315)
**변경 위치**: Line 302-314

**변경 전**:
```python
create_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, subtitle_output_path, max_word=5)

# S3 업로드
s3_client.upload_file(str(subtitle_output_path), "ai-podcast-clipper-hamsoo", output_s3_key)
```

**변경 후**:
```python
# 영어 자막 영상 생성
english_output_path = clip_dir / "pyavi" / "video_with_english_subtitles.mp4"
create_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, english_output_path, max_word=5)

# 한글 자막 영상 생성
korean_output_path = clip_dir / "pyavi" / "video_with_korean_subtitles.mp4"
create_korean_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, korean_output_path, gemini_client, max_word=3)

# S3 업로드 (영어/한글 각각)
english_s3_key = f"{s3_key_dir}/{clip_name}_en.mp4"
korean_s3_key = f"{s3_key_dir}/{clip_name}_kr.mp4"
s3_client.upload_file(str(english_output_path), "ai-podcast-clipper-hamsoo", english_s3_key)
s3_client.upload_file(str(korean_output_path), "ai-podcast-clipper-hamsoo", korean_s3_key)
```

**Note**: `gemini_client`는 `self.gemini_client`로 접근 가능 (AiPodcastClipper 인스턴스에서)

#### 5. process_clip() 함수 시그니처 수정 필요
**위치**: Line 241

**변경 전**:
```python
def process_clip(base_dir: str, original_video_path: str, s3_key: str, start_time: float, end_time: float, clip_index: int, transcript_segments: list):
```

**변경 후**:
```python
def process_clip(base_dir: str, original_video_path: str, s3_key: str, start_time: float, end_time: float, clip_index: int, transcript_segments: list, gemini_client):
```

#### 6. process_clip() 호출부 수정 필요
**위치**: Line 485

**변경 전**:
```python
process_clip(base_dir, video_path, s3_key, moment["start"], moment["end"], index, transcript_segments)
```

**변경 후**:
```python
process_clip(base_dir, video_path, s3_key, moment["start"], moment["end"], index, transcript_segments, self.gemini_client)
```

---

## 상세 구현 설계

### 1. translate_to_korean() 메서드

**목적**: 영어 자막 텍스트 리스트를 한글로 일괄 번역

**위치**: AiPodcastClipper 클래스 내부 (identify_moments 메서드 다음)

**시그니처**:
```python
def translate_to_korean(self, subtitle_texts: list[str]) -> list[str]:
    """
    영어 자막 텍스트를 한글로 번역

    Args:
        subtitle_texts: 영어 자막 텍스트 리스트

    Returns:
        한글 번역 텍스트 리스트 (입력과 동일한 개수)
    """
```

**구현 세부사항**:

1. **프롬프트 설계**:
```python
prompt = f"""
당신은 전문 팟캐스트 번역가입니다. 아래 영어 자막을 자연스러운 한국어로 번역해주세요.

번역 규칙:
1. 팟캐스트 특성상 구어체로 번역하세요
2. 각 줄은 짧고 읽기 쉽게 유지하세요
3. 입력된 줄 수와 동일한 수의 번역을 반환하세요
4. 문맥을 고려하여 자연스럽게 번역하세요
5. 전문 용어는 이해하기 쉬운 한국어로 풀어서 설명하세요

입력 (영어 자막):
{json.dumps(subtitle_texts, ensure_ascii=False)}

출력 형식: JSON 배열로 반환
["번역1", "번역2", "번역3", ...]
"""
```

2. **API 호출**:
```python
response = self.gemini_client.models.generate_content(
    model="gemini-2.5-flash",
    contents=prompt,
    config=genai.types.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=0.3,  # 일관성을 위해 낮은 temperature
    )
)
```

3. **응답 파싱 및 검증**:
```python
translated = json.loads(response.text)

# 검증: 입력과 출력 개수가 일치하는지 확인
if len(translated) != len(subtitle_texts):
    print(f"Warning: Translation count mismatch. Expected {len(subtitle_texts)}, got {len(translated)}")
    # 부족한 경우 원문 추가, 초과한 경우 자르기
    while len(translated) < len(subtitle_texts):
        translated.append(subtitle_texts[len(translated)])
    translated = translated[:len(subtitle_texts)]

return translated
```

4. **에러 처리**:
```python
try:
    # ... 번역 로직 ...
except Exception as e:
    print(f"Translation error: {e}")
    # 번역 실패 시 원문 반환
    return subtitle_texts
```

### 2. create_korean_subtitles_with_ffmpeg() 함수

**목적**: 한글 자막이 포함된 비디오 생성

**위치**: create_subtitles_with_ffmpeg 함수 바로 다음

**시그니처**:
```python
def create_korean_subtitles_with_ffmpeg(
    transcript_segments: list,
    clip_start: float,
    clip_end: float,
    clip_video_path: str,
    output_path: str,
    gemini_client,
    max_word: int = 3
):
    """
    한글 자막이 포함된 비디오 생성

    Args:
        transcript_segments: WhisperX 전사 결과 (단어 단위)
        clip_start: 클립 시작 시간 (초)
        clip_end: 클립 종료 시간 (초)
        clip_video_path: 입력 비디오 경로
        output_path: 출력 비디오 경로
        gemini_client: Gemini API 클라이언트
        max_word: 한 줄에 들어갈 최대 단어 수 (기본값: 3)
    """
```

**구현 로직**:

```python
def create_korean_subtitles_with_ffmpeg(transcript_segments, clip_start, clip_end, clip_video_path, output_path, gemini_client, max_word=3):
    temp_dir = os.path.dirname(output_path)
    subtitle_path = os.path.join(temp_dir, "temp_korean_subtitles.ass")

    # Step 1: 클립 범위 내 세그먼트 필터링 (기존 로직 재사용)
    clip_segments = [segment for segment in transcript_segments
                    if segment.get("start") is not None
                    and segment.get("end") is not None
                    and segment.get("start") < clip_end
                    and segment.get("end") > clip_start]

    # Step 2: 단어를 max_word씩 그룹핑하고 영어 텍스트 수집
    english_subtitles = []  # [(start, end, english_text), ...]
    current_words = []
    current_start = None
    current_end = None

    for segment in clip_segments:
        word = segment.get("word", "").strip()
        seg_start = segment.get("start")
        seg_end = segment.get("end")

        if not word or seg_start is None or seg_end is None:
            continue

        # 상대 시간으로 변환
        start_rel = max(0.0, seg_start - clip_start)
        end_rel = max(0.0, seg_end - clip_start)

        if end_rel <= 0:
            continue

        if not current_words:
            current_start = start_rel
            current_end = end_rel
            current_words = [word]
        elif len(current_words) >= max_word:
            # 현재 그룹 완성
            english_subtitles.append((current_start, current_end, ' '.join(current_words)))
            current_words = [word]
            current_start = start_rel
            current_end = end_rel
        else:
            current_words.append(word)
            current_end = end_rel

    # 마지막 그룹 추가
    if current_words:
        english_subtitles.append((current_start, current_end, ' '.join(current_words)))

    # Step 3: 영어 텍스트만 추출
    english_texts = [text for _, _, text in english_subtitles]

    # Step 4: Gemini로 일괄 번역
    # NOTE: gemini_client는 AiPodcastClipper 인스턴스에서 전달받음
    # 하지만 이 함수는 전역 함수이므로, AiPodcastClipper의 메서드를 직접 호출할 수 없음
    # 해결 방법: 번역 함수도 전역 함수로 만들거나, gemini_client를 직접 사용

    # 번역 프롬프트
    prompt = f"""
당신은 전문 팟캐스트 번역가입니다. 아래 영어 자막을 자연스러운 한국어로 번역해주세요.

번역 규칙:
1. 팟캐스트 특성상 구어체로 번역하세요
2. 각 줄은 짧고 읽기 쉽게 유지하세요
3. 입력된 줄 수와 동일한 수의 번역을 반환하세요
4. 문맥을 고려하여 자연스럽게 번역하세요
5. 전문 용어는 이해하기 쉬운 한국어로 풀어서 설명하세요

입력 (영어 자막):
{json.dumps(english_texts, ensure_ascii=False)}

출력 형식: JSON 배열로 반환
["번역1", "번역2", "번역3", ...]
"""

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            )
        )

        korean_texts = json.loads(response.text)

        # 검증
        if len(korean_texts) != len(english_texts):
            print(f"Warning: Translation count mismatch. Expected {len(english_texts)}, got {len(korean_texts)}")
            while len(korean_texts) < len(english_texts):
                korean_texts.append(english_texts[len(korean_texts)])
            korean_texts = korean_texts[:len(english_texts)]

    except Exception as e:
        print(f"Translation error: {e}. Using original English text.")
        korean_texts = english_texts

    # Step 5: 한글 자막과 타이밍 매핑
    korean_subtitles = []
    for i, (start, end, _) in enumerate(english_subtitles):
        korean_subtitles.append((start, end, korean_texts[i]))

    # Step 6: ASS 파일 생성 (한글 폰트 사용)
    subs = pysubs2.SSAFile()

    subs.info["WrapStyle"] = 0
    subs.info["ScaledBorderAndShadow"] = "yes"
    subs.info["PlayResX"] = 1080
    subs.info["PlayResY"] = 1920
    subs.info["ScriptType"] = "v4.00+"

    # 한글 스타일 설정
    style_name = "Korean"
    korean_style = pysubs2.SSAStyle()
    korean_style.fontname = "Noto Sans KR"  # 한글 폰트
    korean_style.fontsize = 140
    korean_style.primary_color = pysubs2.Color(255, 255, 255)
    korean_style.border_style = 1
    korean_style.outline = 2.0
    korean_style.shadow = 2.0
    korean_style.shadowcolor = pysubs2.Color(0, 0, 0, 128)
    korean_style.alignment = 2  # 하단 중앙
    korean_style.marginl = 50
    korean_style.marginr = 50
    korean_style.marginv = 50
    korean_style.spacing = 0.0

    subs.styles[style_name] = korean_style

    # 자막 이벤트 추가
    for start, end, text in korean_subtitles:
        start_time = pysubs2.make_time(s=start)
        end_time = pysubs2.make_time(s=end)
        line = pysubs2.SSAEvent(start=start_time, end=end_time, style=style_name, text=text)
        subs.events.append(line)

    # ASS 파일 저장
    subs.save(subtitle_path)

    # Step 7: FFmpeg로 자막 오버레이
    ffmpeg_cmd = (f"ffmpeg -y -i {clip_video_path} -vf \"ass={subtitle_path}\" "
                  f"-c:v h264 -preset fast -crf 23 {output_path}")

    subprocess.run(ffmpeg_cmd, shell=True, check=True)
```

### 3. process_clip() 함수 수정

**변경 사항**:

1. **함수 시그니처 수정** (gemini_client 추가):
```python
def process_clip(base_dir: str, original_video_path: str, s3_key: str, start_time: float, end_time: float, clip_index: int, transcript_segments: list, gemini_client):
```

2. **경로 변수 수정**:
```python
# 기존
subtitle_output_path = clip_dir / "pyavi" / "video_with_subtitles.mp4"

# 변경 후
english_output_path = clip_dir / "pyavi" / "video_with_english_subtitles.mp4"
korean_output_path = clip_dir / "pyavi" / "video_with_korean_subtitles.mp4"
```

3. **자막 생성 로직 수정**:
```python
# 영어 자막 생성
create_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, english_output_path, max_word=5)

# 한글 자막 생성
create_korean_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, korean_output_path, gemini_client, max_word=3)
```

4. **S3 업로드 로직 수정**:
```python
# S3 키 생성
english_s3_key = f"{s3_key_dir}/{clip_name}_en.mp4"
korean_s3_key = f"{s3_key_dir}/{clip_name}_kr.mp4"

# 업로드
s3_client.upload_file(str(english_output_path), "ai-podcast-clipper-hamsoo", english_s3_key)
s3_client.upload_file(str(korean_output_path), "ai-podcast-clipper-hamsoo", korean_s3_key)

print(f"Uploaded English subtitle video: {english_s3_key}")
print(f"Uploaded Korean subtitle video: {korean_s3_key}")
```

### 4. process_video() 메서드 수정

**변경 위치**: Line 485 (process_clip 호출부)

**변경 전**:
```python
process_clip(base_dir, video_path, s3_key, moment["start"], moment["end"], index, transcript_segments)
```

**변경 후**:
```python
process_clip(base_dir, video_path, s3_key, moment["start"], moment["end"], index, transcript_segments, self.gemini_client)
```

---

## 테스트 계획

### 1. 단위 테스트

#### 1.1 폰트 설치 테스트
**목적**: Noto Sans KR 폰트가 정상적으로 설치되었는지 확인

**방법**:
```bash
# Modal 컨테이너 내부에서 실행
fc-list | grep "Noto Sans KR"
```

**예상 결과**:
```
/usr/share/fonts/truetype/custom/NotoSansKR-Bold.ttf: Noto Sans KR:style=Bold
```

#### 1.2 번역 함수 테스트
**목적**: Gemini API 번역이 정상 작동하는지 확인

**테스트 케이스**:
```python
test_texts = [
    "Hello, how are you today?",
    "This is a podcast about technology.",
    "Let me explain the concept in detail."
]

# 예상 출력
expected = [
    "안녕하세요, 오늘 어떠세요?",
    "이것은 기술에 관한 팟캐스트입니다.",
    "개념을 자세히 설명해드릴게요."
]
```

**검증 항목**:
- ✅ 입력과 출력 개수 일치
- ✅ 한글로 번역되었는지 확인
- ✅ 자연스러운 구어체인지 확인

#### 1.3 한글 자막 함수 테스트
**목적**: 한글 자막 ASS 파일이 정상 생성되는지 확인

**테스트 데이터**:
```python
test_segments = [
    {"start": 0.0, "end": 0.5, "word": "Hello"},
    {"start": 0.5, "end": 1.0, "word": "how"},
    {"start": 1.0, "end": 1.5, "word": "are"},
    {"start": 1.5, "end": 2.0, "word": "you"},
]
```

**검증 항목**:
- ✅ ASS 파일 생성 확인
- ✅ Noto Sans KR 폰트 사용 확인
- ✅ 타이밍이 정확한지 확인
- ✅ 한글 텍스트가 포함되어 있는지 확인

### 2. 통합 테스트

#### 2.1 전체 파이프라인 테스트
**목적**: 영어/한글 자막 영상이 모두 정상 생성되는지 확인

**테스트 시나리오**:
1. 테스트 비디오 S3 업로드 (`test3/sample.mp4`)
2. API 호출: `{"s3_key": "test3/sample.mp4"}`
3. 결과 확인:
   - `test3/clip_0_en.mp4` 생성 확인
   - `test3/clip_0_kr.mp4` 생성 확인
   - `test3/clip_1_en.mp4` 생성 확인
   - `test3/clip_1_kr.mp4` 생성 확인

**검증 항목**:
- ✅ S3에 모든 파일 업로드 완료
- ✅ 영어 자막 영상 재생 가능
- ✅ 한글 자막 영상 재생 가능
- ✅ 자막 타이밍 동기화
- ✅ 한글 폰트 렌더링 정상

#### 2.2 에러 케이스 테스트

**테스트 케이스 1: 번역 API 실패**
- Gemini API 타임아웃 시뮬레이션
- 예상 동작: 영어 원문 자막 사용, 경고 로그 출력

**테스트 케이스 2: 폰트 로딩 실패**
- 폰트 파일 손상 시뮬레이션
- 예상 동작: 기본 폰트 사용 또는 에러 로그

### 3. 성능 테스트

#### 3.1 처리 시간 측정
**목적**: 한글 자막 추가로 인한 성능 영향 측정

**측정 항목**:
- 기존 (영어만): 클립 1개당 평균 처리 시간
- 변경 후 (영어+한글): 클립 1개당 평균 처리 시간
- 증가율: < 30% 목표

**예상 결과**:
```
기존: ~180초/클립
번역 추가: ~15초 (Gemini API)
자막 생성 추가: ~10초
총 예상: ~205초/클립 (13.8% 증가)
```

#### 3.2 Gemini API 성능
**측정 항목**:
- 자막 10개 일괄 번역 소요 시간
- API 응답 시간 변동성

**목표**:
- 평균 < 15초
- P95 < 25초

### 4. 품질 테스트

#### 4.1 번역 품질 평가
**방법**: 샘플 클립 3개 수동 검토

**평가 기준**:
- 문맥 이해도: 상/중/하
- 자연스러움: 상/중/하
- 전문 용어 처리: 적절/부적절

#### 4.2 자막 가독성 평가
**방법**: 실제 디바이스에서 재생

**평가 항목**:
- 폰트 크기 적절성
- 배경과의 대비
- 자막 지속 시간
- 줄바꿈 위치

---

## 배포 계획

### 1. 배포 전 체크리스트
- [ ] 모든 단위 테스트 통과
- [ ] 통합 테스트 통과
- [ ] 성능 테스트 통과
- [ ] 코드 리뷰 완료
- [ ] 문서 업데이트 (CLAUDE.md)

### 2. 배포 단계

#### Stage 1: 개발 환경 배포
```bash
# Modal 배포
modal deploy main.py

# 테스트 클립 생성
modal run main.py
```

**검증**:
- Modal 앱 정상 배포 확인
- 테스트 API 호출 성공
- S3에 파일 업로드 확인

#### Stage 2: 프로덕션 배포
```bash
# 프로덕션 시크릿 확인
modal secret list

# 프로덕션 배포
modal deploy main.py --env production
```

### 3. 롤백 계획

**문제 발생 시**:
1. 이전 버전 코드로 즉시 롤백
2. Modal 앱 재배포
3. 문제 원인 분석 및 수정

**롤백 명령**:
```bash
git revert HEAD
modal deploy main.py
```

---

## 리스크 및 대응 방안

### 1. 기술적 리스크

#### 리스크 1: Gemini API 비용 증가
**영향**: 클립당 번역 API 호출로 비용 증가

**대응 방안**:
- API 호출 최적화 (배치 번역)
- 캐싱 전략 검토
- 비용 모니터링 설정

**예상 비용**:
- Gemini 2.5 Flash: $0.000075/1K characters (input), $0.0003/1K characters (output)
- 자막 10개 × 평균 50 characters = 500 characters input
- 한글 번역 500 characters output
- 클립당 비용: ~$0.0005 (매우 저렴)

#### 리스크 2: 처리 시간 증가
**영향**: 전체 파이프라인 처리 시간 증가

**대응 방안**:
- Gemini API 병렬 호출 검토
- 타임아웃 설정 (현재 900초 유지)
- 필요시 GPU 업그레이드

#### 리스크 3: 폰트 렌더링 이슈
**영향**: 한글 자막이 깨지거나 표시되지 않음

**대응 방안**:
- Modal 이미지 빌드 시 폰트 설치 검증
- FFmpeg 로그 모니터링
- 대체 폰트 준비 (Nanum Gothic)

### 2. 운영 리스크

#### 리스크 4: S3 스토리지 증가
**영향**: 클립 2배 생성으로 스토리지 비용 2배

**대응 방안**:
- S3 Lifecycle 정책 설정 (30일 후 삭제 등)
- 불필요한 클립 자동 정리
- 스토리지 사용량 모니터링

#### 리스크 5: 번역 품질 문제
**영향**: 부정확한 번역으로 사용자 경험 저하

**대응 방안**:
- 프롬프트 엔지니어링 지속 개선
- 사용자 피드백 수집
- 필요시 수동 번역 옵션 제공

### 3. 모니터링 계획

**모니터링 지표**:
1. 클립 생성 성공률 (영어/한글 각각)
2. 평균 처리 시간
3. Gemini API 응답 시간
4. 번역 실패율
5. S3 스토리지 사용량

**알림 설정**:
- 처리 실패율 > 5%
- 평균 처리 시간 > 250초
- Gemini API 실패율 > 10%

---

## 부록

### A. 관련 문서
- [CLAUDE.md](../CLAUDE.md) - 프로젝트 개발 가이드
- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [pysubs2 Documentation](https://pysubs2.readthedocs.io/)

### B. 참고 자료
- [Noto Sans KR 폰트](https://fonts.google.com/noto/specimen/Noto+Sans+KR)
- [FFmpeg ASS Subtitle Guide](https://trac.ffmpeg.org/wiki/HowToBurnSubtitlesIntoVideo)

### C. 용어 정리
- **ASS**: Advanced SubStation Alpha (자막 파일 형식)
- **Gemini**: Google의 대규모 언어 모델
- **WhisperX**: 단어 단위 타임스탬프를 제공하는 음성 인식 모델
- **Modal**: 서버리스 GPU 플랫폼

---

**문서 종료**
