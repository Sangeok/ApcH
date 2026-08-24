import glob
import json
import pathlib
import pickle
import shutil
import subprocess
import time
import uuid
import modal
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import os
import boto3
import whisperx
import numpy as np
from tqdm import tqdm
import ffmpegcv
import cv2
import pysubs2
import re

from google import genai

from botocore.exceptions import BotoCoreError, ClientError
from boto3.exceptions import S3UploadFailedError
from s3_upload_policy import (
    is_retriable_error,
    should_retry,
    next_backoff,
    format_upload_error,
)

# 요청 바디 모델: 처리 대상 동영상의 S3 객체 키를 받음
class ProcessVideoRequest(BaseModel):
    s3_key: str
    language: str = "Korean"
    clip_count: int
    # auto: 기존 단일 파이프라인 / analyze: 전사+후보 추출만 / render: 전달받은 구간만 렌더링
    mode: str = "auto"
    # render 모드 전용: [{"index": int, "start": float, "end": float, "type": str|None,
    #   "hook": str|None, "payoff": str|None,
    #   "caption_style": {"position": str, "fontSize": int|None, "color": str|None, "maxWordsPerLine": int|None} | None}]
    moments: list[dict] | None = None
    # render 모드 전용: 분석 단계에서 저장한 전사 JSON의 S3 키 (없거나 로드 실패 시 재전사)
    transcript_s3_key: str | None = None
    attempt: int | None = None
    output_prefix: str | None = None
    callback_url: str | None = None
    uploaded_file_id: str | None = None

# Modal 컨테이너 이미지: CUDA 12.4 + Python 3.12, 비디오/딥러닝 런타임 준비
image = (modal.Image.from_registry("nvidia/cuda:12.4.0-devel-ubuntu22.04", add_python="3.12")
    .apt_install("ffmpeg", "libgl1-mesa-glx", "wget", "libcudnn8", "libcudnn8-dev", "fontconfig")
    .pip_install_from_requirements("requirements.txt")
    .env({"MPLBACKEND": "Agg"})
    .run_commands([
        "mkdir -p /usr/share/fonts/truetype/custom",
        "wget -O /usr/share/fonts/truetype/custom/Anton-Regular.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
        # 구 경로(fonts.gstatic.com/ea/notosanskr/v2/...)는 2026-08 기준 404다.
        # 공식 noto-cjk 저장소의 같은 파일로 바꿨다 — 패밀리명 "Noto Sans KR",
        # 굵기 Bold로 동일하므로 렌더 결과는 그대로다(아래 fontname과 맞물린다).
        "wget -O /usr/share/fonts/truetype/custom/NotoSansKR-Bold.otf https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/KR/NotoSansKR-Bold.otf",
        "fc-cache -f -v"
    ])
    .add_local_dir("asd", "/asd", copy=True)
    .add_local_python_source("s3_upload_policy"))

# Modal 앱 정의(이름/이미지 지정)
app = modal.App("ai-podcast-clipper", image=image)

# 모델/가중치 다운로드 캐시 공유를 위한 볼륨(재시작 시 재다운로드 방지)
volume = modal.Volume.from_name("ai-podcast-clipper-model-cache", create_if_missing=True)

# 볼륨을 마운트할 PyTorch 캐시 경로
mount_path = "/root/.cache/torch"

# FastAPI의 HTTP Bearer 인증 스킴(토큰 의존성 주입)
auth_scheme = HTTPBearer()

def get_video_duration_seconds(video_path: pathlib.Path) -> float:
    """Return the duration of a video file in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(result.stdout.strip())


# 클립 길이 제한: analyze/render/auto 모든 경로가 공유
MAX_CLIP_DURATION = 90
MIN_CLIP_DURATION = 30


def validate_moments(clip_moments, video_duration: float | None = None) -> list:
    """30~90초 범위(및 옵션으로 영상 길이 범위)를 벗어난 구간을 걸러낸다."""
    validated = []
    for moment in clip_moments:
        start = moment.get("start")
        end = moment.get("end")
        if start is None or end is None:
            continue
        duration = end - start
        if duration < MIN_CLIP_DURATION or duration > MAX_CLIP_DURATION:
            print(f"Skipping moment ({duration:.1f}s): outside [{MIN_CLIP_DURATION}, {MAX_CLIP_DURATION}]s range")
            continue
        if video_duration is not None and (start < 0 or end > video_duration):
            print(f"Skipping moment ({start:.1f}-{end:.1f}s): outside video duration {video_duration:.1f}s")
            continue
        validated.append(moment)
    return validated


# 캡션 위치 → ASS alignment (numpad 표기). "middle"(5)이 기존 하드코딩 값.
CAPTION_POSITION_ALIGNMENT = {
    "top": 8,
    "middle": 5,
    "bottom": 2,
}

# top/bottom 선택 시 사용할 세로 마진 초기값. 시각 튜닝 대상 (Open Questions 참고).
CAPTION_POSITION_MARGINV = {
    "top": 200,
    "bottom": 260,
}


def parse_hex_color(value):
    """'#RRGGBB' 문자열을 pysubs2.Color로 변환. 형식이 아니면 None."""
    if not isinstance(value, str):
        return None
    m = re.fullmatch(r"#?([0-9a-fA-F]{6})", value.strip())
    if not m:
        return None
    r, g, b = (int(m.group(1)[i:i + 2], 16) for i in (0, 2, 4))
    return pysubs2.Color(r, g, b)


def resolve_caption_style(caption_style, *, default_fontsize: int, default_max_word: int, default_marginv: int, default_outline: float) -> dict:
    """사용자 캡션 스타일을 언어별 기본값 위에 얹어 ASS 스타일 파라미터로 해석한다.

    잘못된/누락된 값은 조용히 기본값으로 대체한다 (렌더 실패보다 기본 스타일 출력이 낫다).
    """
    style = caption_style if isinstance(caption_style, dict) else {}

    position = style.get("position")
    if position not in CAPTION_POSITION_ALIGNMENT:
        position = "middle"

    fontsize = style.get("fontSize")
    if not isinstance(fontsize, (int, float)) or not (60 <= fontsize <= 200):
        fontsize = default_fontsize

    max_word = style.get("maxWordsPerLine")
    if not isinstance(max_word, int) or not (1 <= max_word <= 8):
        max_word = default_max_word

    primary_color = parse_hex_color(style.get("color")) or pysubs2.Color(255, 255, 255)

    # isinstance(True, int)가 참이므로 bool을 먼저 걸러야 True가 두께 1로 새지 않는다.
    outline_width = style.get("outlineWidth")
    if isinstance(outline_width, bool) or not isinstance(outline_width, (int, float)) or not (0 <= outline_width <= 6):
        outline_width = default_outline

    outline_color = parse_hex_color(style.get("outlineColor")) or pysubs2.Color(0, 0, 0)

    uppercase = style.get("uppercase") is True

    return {
        "alignment": CAPTION_POSITION_ALIGNMENT[position],
        "marginv": default_marginv if position == "middle" else CAPTION_POSITION_MARGINV[position],
        "fontsize": int(fontsize),
        "max_word": max_word,
        "primary_color": primary_color,
        "outline": float(outline_width),
        "outline_color": outline_color,
        "uppercase": uppercase,
    }

def create_vertical_video(tracks, scores, pyframes_path, pyavi_path, audio_path, output_path, framerate=25):
    target_width = 1080
    target_height = 1920

    flist = glob.glob(os.path.join(pyframes_path, "*.jpg"))
    flist.sort()

    faces = [[] for _ in range(len(flist))]

    for tidx, track in enumerate(tracks):
        score_array = scores[tidx]
        for fidx, frame in enumerate(track['track']['frame'].tolist()):
            slice_start = max(fidx - 30, 0)
            slice_end = min(fidx + 30, len(score_array))
            score_slice = score_array[slice_start:slice_end]
            avg_score = float(np.mean(score_slice)) if len(score_slice) > 0 else 0

            faces[frame].append({'track':tidx, 'score':avg_score, 's':track['proc_track']['s'][fidx], 'x':track['proc_track']['x'][fidx], 'y':track['proc_track']['y'][fidx]})

    temp_video_path = os.path.join(pyavi_path, "video_only.mp4")

    vout = None
    for fidx, fname in tqdm(enumerate(flist), total=len(flist), desc="Creating vertical video"):
        img = cv2.imread(fname)
        if img is None:
            continue

        current_faces = faces[fidx]

        max_score_face = max(current_faces, key=lambda face: face['score']) if current_faces else None

        if max_score_face and max_score_face['score'] < 0:
            max_score_face = None

        if vout is None:
            vout = ffmpegcv.VideoWriterNV(
                file = temp_video_path,
                codec = None,
                fps = framerate,
                resize = (target_width, target_height),
            )
        
        if max_score_face:
            mode = "crop"
        else :
            mode = "resize"
        
        if mode == "resize":
            scale = target_width / img.shape[1]
            resized_height = int(img.shape[0] * scale)
            resized_image = cv2.resize(img, (target_width, resized_height), interpolation=cv2.INTER_AREA)

            scale_for_bg = max(target_width / img.shape[1], target_height / img.shape[0])
            bg_width = int(img.shape[1] * scale_for_bg)
            bg_height = int(img.shape[0] * scale_for_bg)
            blurred_background = cv2.resize(img, (bg_width, bg_height))
            blurred_background = cv2.GaussianBlur(blurred_background, (121, 121), 0)

            crop_x = (bg_width - target_width) // 2
            crop_y = (bg_height - target_height) // 2

            blurred_background = blurred_background[crop_y:crop_y+target_height, crop_x:crop_x+target_width]

            center_y = (target_height - resized_height) // 2
            blurred_background[center_y:center_y + resized_height, :] = resized_image

            vout.write(blurred_background)
        elif mode == "crop":
            scale = target_height / img.shape[0]
            resized_image = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            frame_width = resized_image.shape[1]

            center_x = int(max_score_face['x'] * scale if max_score_face else frame_width // 2)
            top_x = max(min(center_x - target_width // 2, frame_width - target_width), 0)

            image_cropped = resized_image[0:target_height, top_x:top_x+target_width]

            vout.write(image_cropped)

    if vout:
        vout.release()

    ffmpeg_command = (
        f"ffmpeg -y -i {temp_video_path} -i {audio_path} "
        f"-c:v h264 -preset fast -crf 23 -c:a aac -b:a 128K "
        f"{output_path}"
    )
    subprocess.run(ffmpeg_command, shell=True, check=True, text=True)

def create_subtitles_with_ffmpeg(transcript_segments: list, clip_start: float, clip_end: float, clip_video_path: str, output_path: str, max_word: int = 5, caption_style: dict | None = None):
    temp_dir = os.path.dirname(output_path)
    subtitle_path = os.path.join(temp_dir, "temp_subtitles.ass")

    resolved = resolve_caption_style(
        caption_style,
        default_fontsize=122,
        default_max_word=max_word,
        default_marginv=165,
        default_outline=1.1,
    )
    max_word = resolved["max_word"]

    clip_segments = [segment for segment in transcript_segments
                    if segment.get("start") is not None
                    and segment.get("end") is not None
                    and segment.get("start") >= clip_start
                    and segment.get("end") <= clip_end
                    ]

    subtitles = []
    current_words = []
    current_start = None
    current_end = None

    for segment in clip_segments:
        word = segment.get("word", "").strip()
        seg_start = segment.get("start")
        seg_end = segment.get("end")

        if not word or seg_start is None or seg_end is None:
            continue

        # Calculate relative start and end time
        start_rel = max(0.0, seg_start - clip_start)
        end_rel = max(0.0, seg_end - clip_start)

        # If end time is less than or equal to 0, skip the segment
        if end_rel <= 0:
            continue

        # If current words is empty, set current start and end time to the relative start and end time
        if not current_words:
            current_start = start_rel
            current_end = end_rel
            current_words = [word]
        # If current words is not empty and the number of words is greater than or equal to max_word, add the current words to the subtitles and reset the current words
        elif len(current_words) >= max_word:
            subtitles.append((current_start, current_end, ' '.join(current_words)))
            current_words = [word]
            current_start = start_rel
            current_end = end_rel
        # If current words is not empty and the number of words is less than max_word, add the word to the current words
        else:
            current_words.append(word)
            current_end = end_rel

    if current_words:
        subtitles.append((current_start, current_end, ' '.join(current_words)))

    # Create subtitles file
    subs = pysubs2.SSAFile()

    # Set subtitles file info
    subs.info["WrapStyle"] = 0
    subs.info["ScaledBorderAndShadow"] = "yes"
    subs.info["PlayResX"] = 1080
    subs.info["PlayResY"] = 1920
    subs.info["ScriptType"] = "v4.00+"

    # Set subtitles style
    style_name = "Default"
    new_style = pysubs2.SSAStyle()
    new_style.fontname = "Anton"
    new_style.fontsize = resolved["fontsize"]
    # pysubs2 SSAStyle은 dataclass라 없는 속성 대입이 조용히 무시된다.
    # 속성명에 밑줄이 없다(primarycolor/borderstyle/outlinecolor/backcolor) —
    # 밑줄로 적으면 에러 없이 해당 스타일이 전부 기본값으로 렌더된다.
    new_style.primarycolor = resolved["primary_color"]
    new_style.borderstyle = 1
    new_style.outline = resolved["outline"]
    new_style.outlinecolor = resolved["outline_color"]
    new_style.shadow = 6.5
    new_style.backcolor = pysubs2.Color(12, 12, 12, 210)
    new_style.alignment = resolved["alignment"]
    new_style.marginl = 44
    new_style.marginr = 44
    new_style.marginv = resolved["marginv"]
    new_style.spacing = 1.8

    subs.styles[style_name] = new_style

    # Add subtitles to the file(extract start and end time to ssa time object)
    for i, (start,end,text) in enumerate(subtitles):
        # create ssa time object for start and end time
        start_time = pysubs2.make_time(s=start)
        end_time = pysubs2.make_time(s=end)
        if resolved["uppercase"]:
            text = text.upper()
        line = pysubs2.SSAEvent(start=start_time, end=end_time, style=style_name, text=text)
        subs.events.append(line)
    
    # Save subtitles file to ass/ass file
    subs.save(subtitle_path)


    ffmpeg_cmd = (f"ffmpeg -y -i {clip_video_path} -vf \"ass={subtitle_path}\" "
                    f"-c:v h264 -preset fast -crf 23 {output_path}")
    
    # Run ffmpeg command to add subtitles to the video
    subprocess.run(ffmpeg_cmd, shell=True, check=True)

    # Return the script text
    script_text = "\n".join(text for _, _, text in subtitles if text)
    return script_text

def create_korean_subtitles_with_ffmpeg(transcript_segments: list, clip_start: float, clip_end: float, clip_video_path: str, output_path: str, gemini_client, max_word: int = 3, caption_style: dict | None = None):
    temp_dir = os.path.dirname(output_path)
    subtitle_path = os.path.join(temp_dir, "temp_korean_subtitles.ass")

    resolved = resolve_caption_style(
        caption_style,
        default_fontsize=130,
        default_max_word=max_word,
        default_marginv=155,
        default_outline=1.3,
    )
    max_word = resolved["max_word"]

    # Step 1: 클립 범위 내 세그먼트 필터링
    clip_segments = [segment for segment in transcript_segments
                    if segment.get("start") is not None
                    and segment.get("end") is not None
                    and segment.get("start") >= clip_start
                    and segment.get("end") <= clip_end
                    ]

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
    # 번역 프롬프트에 사용할 페이로드: 각 자막에 index를 부여해 모델이 동일 길이를 유지하도록 강제
    english_payload = [
        {"index": idx, "text": text}
        for idx, (_, _, text) in enumerate(english_subtitles)
    ]
    english_texts = [entry["text"] for entry in english_payload]

    # Step 4: Gemini로 일괄 번역
    subtitle_count = len(english_texts)
    prompt = f"""
        You are a professional podcast translator. Please translate the English subtitles below into natural Korean.

        # Translation rules:
        1. Because this is a podcast, use a conversational tone.
        2. Keep each line short and easy to read.
        3. Return the same number of translated lines as the input.
        4. Consider the context to make the translation sound natural.
        5. Paraphrase technical terms into easy-to-understand Korean.

        Number of input lines: {subtitle_count}

        # Output rules:
        - Return only a JSON array.
        - The array length must be {subtitle_count}.
        - If you cannot meet the above conditions, return the JSON object {{"error":"cannot-translate"}}.
        - Never include code fences like ``` or any additional explanations.

        # Input (English subtitles):
        {json.dumps(english_payload, ensure_ascii=False)}

        # Output rules (JSON only):
        - Return a JSON array of length {subtitle_count}.
        - Each element must be an object: {{"index": <int>, "translation": "<string>"}}
        - Every index value must exactly match the input index.
        - Do not skip or duplicate indices. If unsure about a line, repeat the English text as the translation.

        # Output example (when there are 2 input lines):
        [
            {{"index": 0, "translation": "번역문1"}},
            {{"index": 1, "translation": "번역문2"}}
        ]
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

        response_text = response.text.strip()
        if response_text.startswith("```"):
            response_text = response_text[3:].strip()
            if response_text.lower().startswith("json"):
                response_text = response_text[4:].lstrip()
        if response_text.endswith("```"):
            response_text = response_text[:-3].strip()

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
    korean_style.fontsize = resolved["fontsize"]
    # 속성명 밑줄 금지 — 위 create_subtitles_with_ffmpeg의 주석 참고.
    korean_style.primarycolor = resolved["primary_color"]
    korean_style.borderstyle = 1
    korean_style.outline = resolved["outline"]
    korean_style.outlinecolor = resolved["outline_color"]
    korean_style.shadow = 6.5
    korean_style.backcolor = pysubs2.Color(8, 8, 8, 210)
    korean_style.alignment = resolved["alignment"]
    korean_style.marginl = 48
    korean_style.marginr = 48
    korean_style.marginv = resolved["marginv"]
    korean_style.spacing = 1.2

    subs.styles[style_name] = korean_style

    # 자막 이벤트 추가
    for start, end, text in korean_subtitles:
        start_time = pysubs2.make_time(s=start)
        end_time = pysubs2.make_time(s=end)
        if resolved["uppercase"]:
            # 한글에는 no-op, 줄에 섞인 영문만 대문자화된다.
            text = text.upper()
        line = pysubs2.SSAEvent(start=start_time, end=end_time, style=style_name, text=text)
        subs.events.append(line)

    # ASS 파일 저장
    subs.save(subtitle_path)

    # Step 7: FFmpeg로 자막 오버레이
    ffmpeg_cmd = (f"ffmpeg -y -i {clip_video_path} -vf \"ass={subtitle_path}\" "
                  f"-c:v h264 -preset fast -crf 23 {output_path}")

    subprocess.run(ffmpeg_cmd, shell=True, check=True)

    # Return the script text
    script_text = "\n".join(text for _, _, text in korean_subtitles if text)
    return script_text

def generate_youtube_metadata(script_text: str, language: str, gemini_client) -> dict:
    default_metadata = {
        "title": "",
        "description": "",
        "hashtags": []
    }

    if not script_text or not script_text.strip():
        print("Warning: Empty script text, skipping metadata generation")
        return default_metadata

    # Prompt for Gemini AI to generate optimized metadata for a short-form podcast clip.
    prompt = f"""You are a YouTube SEO expert specializing in podcast content. Generate optimized metadata for a short-form podcast clip.

# Input Script:
{script_text}

# Target Language: {language}

# Requirements:

## Title (100 characters max, 60 recommended):
- Hook the viewer in first 3 words
- Include 1-2 relevant keywords
- Create curiosity or urgency
- Avoid clickbait that doesn't deliver
- Use power words: "How", "Why", "Secret", "Truth"

## Description (500 characters max):
- First 150 characters are critical (shown in search results)
- Summarize the key insight or story
- Include a call-to-action (subscribe, comment, share)
- Use relevant keywords naturally

## Hashtags (5-7 tags):
- Mix broad and niche hashtags
- Include: 1 trending tag, 2-3 topic tags, 2-3 niche tags
- Include #Shorts for short-form content

# Output Format (JSON only):
{{
    "title": "Your engaging title here",
    "description": "Your SEO-optimized description here",
    "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5"]
}}

# Rules:
- Return ONLY valid JSON, no code fences or explanations
- If language is Korean, generate all content in Korean
- If language is English, generate all content in English
- Ensure title fits within YouTube's 100-character limit
- Hashtags should be single words or short phrases without spaces
"""

    # 한국어 추가 지침
    if language == "Korean":
        prompt += """

# Korean-Specific Guidelines:
- Use natural Korean expressions, not direct translations
- Consider Korean search trends and vocabulary
- Use Hangul hashtags primarily, mix with English trending tags
- Title should be punchy in Korean style (rhetorical questions work well)
- Description should use formal-polite register (합니다체)
"""

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.7,  # 창의적인 제목을 위해 높은 temperature
            )
        )

        response_text = response.text.strip()

        # 마크다운 코드 펜스 제거
        if response_text.startswith("```"):
            response_text = response_text[3:].strip()
            if response_text.lower().startswith("json"):
                response_text = response_text[4:].lstrip()
        if response_text.endswith("```"):
            response_text = response_text[:-3].strip()

        metadata = json.loads(response_text)

        # 검증 및 정제
        return {
            "title": str(metadata.get("title", ""))[:100],  # YouTube 제한
            "description": str(metadata.get("description", ""))[:5000],
            "hashtags": [
                str(tag) for tag in metadata.get("hashtags", [])
                if isinstance(tag, str)
            ][:15]  # YouTube 최대 15개 해시태그
        }

    except json.JSONDecodeError as e:
        print(f"Metadata JSON parse error: {e}")
        return default_metadata
    except Exception as e:
        print(f"Metadata generation error: {e}")
        return default_metadata

def _classify_s3_exception(exc):
    """boto/botocore 예외를 순수 정책이 이해하는 (error_code, transport_error)로 변환.

    주의 — upload_file은 ClientError를 그대로 던지지 않는다: 설치된 boto3(1.43.62 실측,
    S3Transfer.upload_file 소스)가 ClientError를 잡아 S3UploadFailedError로 다시 던진다
    (`from` 절 없이 — 원인은 __cause__가 아니라 __context__에만 남는다). 그래서
    S3UploadFailedError는 원인 사슬(__cause__ 우선, 없으면 __context__)을 풀어 원인
    기준으로 분류해야 클립 업로드 두 곳(주 경로)의 일시 오류가 재시도된다.
    __cause__/__context__를 둘 다 보는 이유: requirements.txt의 boto3는 핀이 없어
    `from e`로 던지는 판으로 바뀌어도 동작해야 한다.
    """
    if isinstance(exc, S3UploadFailedError):
        cause = exc.__cause__ or exc.__context__
        if isinstance(cause, ClientError):
            return cause.response.get("Error", {}).get("Code"), False
        if isinstance(cause, BotoCoreError):
            return None, True
        return None, False  # 원인 불명 — 재시도 안 함, 즉시 맥락 raise
    if isinstance(exc, ClientError):
        code = exc.response.get("Error", {}).get("Code")
        return code, False
    if isinstance(exc, BotoCoreError):
        # EndpointConnectionError·ConnectTimeoutError·ReadTimeoutError 등 응답 코드 없는 전송 실패
        return None, True
    # 그 밖의 비-boto 예외는 이 래퍼가 잡지 않으므로 여기 오지 않는다
    return None, False


def _s3_call_with_retry(do_call, *, operation, s3_key):
    """업로드성 S3 호출을 재시도 정책에 따라 수행. 최종 실패는 맥락을 담아 raise."""
    attempt = 0
    while True:
        attempt += 1
        try:
            return do_call()
        except (BotoCoreError, ClientError, S3UploadFailedError) as exc:
            code, transport = _classify_s3_exception(exc)
            if should_retry(attempt, is_retriable_error(code, transport)):
                wait = next_backoff(attempt)
                print(f"S3 {operation} failed (attempt {attempt}, key {s3_key}): {exc}; retrying in {wait:.1f}s")
                time.sleep(wait)
                continue
            raise RuntimeError(format_upload_error(operation, s3_key, attempt, exc)) from exc


def process_clip(base_dir: str, original_video_path: str, s3_key: str, start_time: float, end_time: float, clip_index: int, transcript_segments: list, gemini_client, selected_language: str, output_prefix: str | None = None, caption_style: dict | None = None):
    clip_name = f"clip_{clip_index}"
    s3_key_dir = (output_prefix or os.path.dirname(s3_key)).strip("/")
    print(f"Processing clip: {clip_name}")

    clip_dir = base_dir / clip_name
    clip_dir.mkdir(parents=True, exist_ok=True)

    # Segment Path : Original clip from start to end
    clip_segment_path = clip_dir / f"{clip_name}_segment.mp4"
    vertical_mp4_path = clip_dir / "pyavi" / "video_out_vertical.mp4"
    english_output_path = clip_dir / "pyavi" / "video_with_english_subtitles.mp4"
    korean_output_path = clip_dir / "pyavi" / "video_with_korean_subtitles.mp4"

    (clip_dir / "pywork").mkdir(exist_ok=True)
    pyframes_path = clip_dir / "pyframes"
    pyavi_path = clip_dir / "pyavi"

    pyframes_path.mkdir(exist_ok=True)
    pyavi_path.mkdir(exist_ok=True)

    duration = end_time - start_time
    cut_command = (f"ffmpeg -i {original_video_path} -ss {start_time} -t {duration} {clip_segment_path}")
    subprocess.run(cut_command, shell=True, check=True, capture_output=True, text=True)

    # Columbia는 시작 시 clip_dir을 삭제 후 재생성하므로, 별도 위치(base_dir)에 세그먼트를 복사해 사용
    segment_for_columbia = base_dir / f"{clip_name}.mp4"
    shutil.copy(clip_segment_path, segment_for_columbia)

    columbia_commands = (
        "python Columbia_test.py "
        f"--videoName {clip_name} "
        f"--videoFolder {str(base_dir)} "
        f"--pretrainModel weight/finetuning_TalkSet.model"
    )
    columbia_start_time = time.time()
    subprocess.run(columbia_commands, cwd="/asd", shell=True)
    columbia_end_time = time.time()
    print(f"Columbia script completed in {columbia_end_time - columbia_start_time:.2f} seconds")

    tracks_path = clip_dir / "pywork" / "tracks.pckl"
    scores_path = clip_dir / "pywork" / "scores.pckl"
    if not tracks_path.exists() or not scores_path.exists():
        raise FileNotFoundError("Tracks or scores file not found for clip")

    with open(tracks_path, "rb") as f:
        tracks = pickle.load(f)
    with open(scores_path, "rb") as f:
        scores = pickle.load(f)

    # Columbia가 생성한 오디오(clip_dir/pyavi/audio.wav)를 사용. 없으면 세그먼트에서 추출.
    audio_path = pyavi_path / "audio.wav"
    if not audio_path.exists():
        extract_cmd = f"ffmpeg -i {segment_for_columbia} -vn -acodec pcm_s16le -ar 16000 -ac 1 {audio_path}"
        subprocess.run(extract_cmd, shell=True, check=True, capture_output=True, text=True)

    cvv_start_time = time.time()
    create_vertical_video(tracks, scores, pyframes_path, pyavi_path, audio_path, vertical_mp4_path)
    cvv_end_time = time.time()
    print(f"Clip {clip_index} vertical video created in {cvv_end_time - cvv_start_time:.2f} seconds")

    # S3 업로드 (영어/한글 각각)
    aws_id = os.getenv("AWS_ACCESS_KEY_ID")
    aws_secret = os.getenv("AWS_SECRET_ACCESS_KEY")
    region = os.getenv("AWS_DEFAULT_REGION", "ap-southeast-2")

    s3_client = boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=aws_id,
        aws_secret_access_key=aws_secret,
    )

    script_text = ""
    uploaded_clip_s3_key = None

    if selected_language == "English":
        # 영어 자막 영상 생성
        print(f"Creating English subtitles for clip {clip_index}...")
        script_text = create_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, english_output_path, max_word=5, caption_style=caption_style)
    
        # 영어 자막 영상 업로드
        english_s3_key = f"{s3_key_dir}/{clip_name}_en.mp4"
        _s3_call_with_retry(
            lambda: s3_client.upload_file(str(english_output_path), "ai-podcast-clipper-hamsoo", english_s3_key),
            operation="upload",
            s3_key=english_s3_key,
        )
        
        uploaded_clip_s3_key = english_s3_key
        print(f"Uploaded English subtitle video: {english_s3_key}")
    elif selected_language == "Korean":
        # 한글 자막 영상 생성
        print(f"Creating Korean subtitles for clip {clip_index}...")
        script_text = create_korean_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, korean_output_path, gemini_client, max_word=3, caption_style=caption_style)

        # 한글 자막 영상 업로드
        korean_s3_key = f"{s3_key_dir}/{clip_name}_kr.mp4"
        _s3_call_with_retry(
            lambda: s3_client.upload_file(str(korean_output_path), "ai-podcast-clipper-hamsoo", korean_s3_key),
            operation="upload",
            s3_key=korean_s3_key,
        )
        
        uploaded_clip_s3_key = korean_s3_key
        print(f"Uploaded Korean subtitle video: {korean_s3_key}")

    else:
        raise ValueError(f"Invalid language: {selected_language}")

    youtube_metadata = generate_youtube_metadata(script_text, selected_language, gemini_client)

    print(f"Created YouTube metadata for clip {clip_index}: {youtube_metadata}")

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

# GPU/타임아웃/시크릿/볼륨 설정이 적용된 서비스 클래스
@app.cls(gpu="L40S", timeout=3600, retries=0, scaledown_window=20, secrets=[modal.Secret.from_name("ai-podcast-clipper-secret")],  volumes={mount_path: volume})
class AiPodcastClipper:
    # 컨테이너가 시작될 때 1회 실행되는 초기화 훅(모델/가중치 로드 위치)
    @modal.enter()
    def load_model(self):
        print("Loading model...")
        self.whisperx_model = whisperx.load_model("large-v2", device="cuda", compute_type="float16")

        self.alignment_model, self.metadata = whisperx.load_align_model(language_code="en", device="cuda")

        print("Transcription model loaded...")

        self.gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


    def transcribe_video(self, base_dir: str, video_path: str) -> str:
        audio_path = base_dir / "audio.wav"
        extract_cmd = f"ffmpeg -i {video_path} -vn -acodec pcm_s16le -ar 16000 -ac 1 {audio_path}"
        subprocess.run(extract_cmd, shell=True, check=True, capture_output=True)

        print("Starting transcription with WhisperX...")
        start_time = time.time()

        audio = whisperx.load_audio(str(audio_path))
        result = self.whisperx_model.transcribe(audio, batch_size=16)

        result = whisperx.align(
            result["segments"], 
            self.alignment_model, 
            self.metadata, 
            audio, 
            device="cuda",
            return_char_alignments=False
        )

        duration = time.time() - start_time
        print("Transcription and alignment took " + str(duration) + " seconds")

        # transcribe_video 내부, segments 생성 부분 교체
        segments = []

        word_segments = result.get("word_segments") or []
        if isinstance(word_segments, list) and word_segments:
            for w in word_segments:
                start = w.get("start")
                end = w.get("end")
                text = w.get("word") or w.get("text")
                if start is None or end is None or not text:
                    continue
                segments.append({"start": float(start), "end": float(end), "word": text})
        else:
            for seg in result.get("segments", []):
                for w in seg.get("words", []):
                    start = w.get("start")
                    end = w.get("end")
                    text = w.get("word") or w.get("text")
                    if start is None or end is None or not text:
                        continue
                    segments.append({"start": float(start), "end": float(end), "word": text})

        return json.dumps(segments)

    def identify_moments(self, transcript: list, target_count: int = 6) -> str:
        prompt_template = """You are a viral short-form video editor specializing in podcast content.

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
        prompt = (
            prompt_template.replace("TARGET_COUNT", str(target_count))
            + json.dumps(transcript, ensure_ascii=False)
        )
        response = self.gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
        ))
        print(f"Identified moments response: ${response.text}")
        return response.text

    # 실제 영상 처리 (비동기 실행, 완료/실패 시 callback)
    @modal.method()
    def _do_process_video(self, s3_key: str, language: str, clip_count: int, callback_url: str | None, uploaded_file_id: str | None, attempt: int | None = None, output_prefix: str | None = None, mode: str = "auto", moments: list | None = None, transcript_s3_key: str | None = None):
        import requests as req

        clip_results = []
        analyze_payload = None

        run_id = str(uuid.uuid4())
        base_dir = pathlib.Path("/tmp") / run_id
        base_dir.mkdir(parents=True, exist_ok=True)
        video_path = base_dir / "input.mp4"

        aws_id = os.getenv("AWS_ACCESS_KEY_ID")
        aws_secret = os.getenv("AWS_SECRET_ACCESS_KEY")
        region = os.getenv("AWS_DEFAULT_REGION", "ap-southeast-2")
        if not aws_id or not aws_secret:
            raise RuntimeError("AWS credentials are missing (check Modal secret).")

        s3_client = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=aws_id,
            aws_secret_access_key=aws_secret,
        )

        try:
            s3_client.download_file("ai-podcast-clipper-hamsoo", s3_key, str(video_path))

            # 1. transcription — render 모드는 저장된 전사를 재사용, 실패 시 재전사
            transcript_segments = None
            if mode == "render" and transcript_s3_key:
                try:
                    obj = s3_client.get_object(Bucket="ai-podcast-clipper-hamsoo", Key=transcript_s3_key)
                    transcript_segments = json.loads(obj["Body"].read())
                    print(f"Reusing stored transcript: {transcript_s3_key}")
                except Exception as e:
                    print(f"Failed to load stored transcript ({e}); falling back to transcription")

            if transcript_segments is None:
                transcript_segments_json = self.transcribe_video(base_dir, video_path)
                transcript_segments = json.loads(transcript_segments_json)
            else:
                transcript_segments_json = json.dumps(transcript_segments)

            if mode == "analyze":
                # 전사 JSON을 업로드 prefix에 저장해 렌더 단계와 편집 UI에서 재사용
                transcript_key = f"{os.path.dirname(s3_key)}/transcript.json"
                _s3_call_with_retry(
                    lambda: s3_client.put_object(
                        Bucket="ai-podcast-clipper-hamsoo",
                        Key=transcript_key,
                        Body=transcript_segments_json.encode("utf-8"),
                        ContentType="application/json",
                    ),
                    operation="put_object",
                    s3_key=transcript_key,
                )

                # 후보 추출 (기존 auto 경로의 파싱 로직과 동일)
                print("Identifying moments for clips...")
                identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2)

                raw = identified_moments_raws.strip()
                if raw.startswith("```"):
                    raw = raw[len("```"):].strip()
                    if raw.lower().startswith("json"):
                        raw = raw[4:].lstrip()
                if raw.endswith("```"):
                    raw = raw[:-3].strip()

                try:
                    clip_moments = json.loads(raw)
                except json.JSONDecodeError:
                    print("Error: Identified moments is not valid JSON")
                    clip_moments = []

                if not clip_moments or not isinstance(clip_moments, list):
                    print("Error: Identified moments is not a list")
                    clip_moments = []

                validated_moments = validate_moments(clip_moments)

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

                if callback_url and uploaded_file_id:
                    req.post(callback_url, json={
                        "uploadedFileId": uploaded_file_id,
                        "attempt": attempt,
                        "status": "ok",
                        "phase": "analyze",
                        **analyze_payload,
                    }, headers={"Authorization": f"Bearer {os.environ.get('MODAL_WEBHOOK_SECRET', '')}"}, timeout=30)

            else:
                # auto: Gemini가 구간 결정 / render: 전달받은 구간 사용
                if mode == "render":
                    video_duration = get_video_duration_seconds(video_path)
                    validated_moments = validate_moments(
                        [
                            {
                                "start": m.get("start"),
                                "end": m.get("end"),
                                "type": m.get("type"),
                                "hook": m.get("hook"),
                                "payoff": m.get("payoff"),
                                "caption_style": m.get("caption_style"),
                            }
                            for m in (moments or [])
                        ],
                        video_duration,
                    )
                else:
                    # 2. Identify moments for clips (기존 auto 경로와 동일)
                    print("Identifying moments for clips...")
                    identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2)

                    raw = identified_moments_raws.strip()
                    if raw.startswith("```"):
                        raw = raw[len("```"):].strip()
                        if raw.lower().startswith("json"):
                            raw = raw[4:].lstrip()
                    if raw.endswith("```"):
                        raw = raw[:-3].strip()

                    try:
                        clip_moments = json.loads(raw)
                    except json.JSONDecodeError:
                        print("Error: Identified moments is not valid JSON")
                        clip_moments = []

                    if not clip_moments or not isinstance(clip_moments, list):
                        print("Error: Identified moments is not a list")
                        clip_moments = []

                    print(f"Final identified moments: {clip_moments}")
                    validated_moments = validate_moments(clip_moments)

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
                        language,
                        output_prefix,
                        caption_style=moment.get("caption_style"),
                    )

                    clip_result["clipType"] = moment.get("type")
                    clip_result["hook"] = moment.get("hook")
                    clip_result["payoff"] = moment.get("payoff")

                    clip_results.append(clip_result)

                # 성공 콜백 (기존과 동일 + phase 필드 추가)
                if callback_url and uploaded_file_id:
                    req.post(callback_url, json={
                        "uploadedFileId": uploaded_file_id,
                        "attempt": attempt,
                        "status": "ok",
                        "phase": mode,
                        "clips": clip_results,
                    }, headers={"Authorization": f"Bearer {os.environ.get('MODAL_WEBHOOK_SECRET', '')}"}, timeout=30)

        except Exception as e:
            print(f"Error processing video: {e}")
            # 실패 시에도 콜백 발송 (phase를 포함해 프론트가 분석/렌더 실패를 구분)
            if callback_url and uploaded_file_id:
                try:
                    req.post(callback_url, json={
                        "uploadedFileId": uploaded_file_id,
                        "attempt": attempt,
                        "status": "error",
                        "phase": mode,
                        "error": str(e),
                        "clips": [],
                    }, headers={"Authorization": f"Bearer {os.environ.get('MODAL_WEBHOOK_SECRET', '')}"}, timeout=30)
                except Exception as cb_err:
                    print(f"Failed to send error callback: {cb_err}")
            raise

        finally:
            if base_dir.exists():
                print(f"Cleaning up temp dir after {base_dir}")
                shutil.rmtree(base_dir, ignore_errors=True)

        if mode == "analyze":
            return {
                "status": "ok",
                "phase": "analyze",
                **(analyze_payload or {"moments": []}),
            }

        return {
            "status": "ok",
            "phase": mode,
            "clips_processed": len(clip_results),
            "s3_prefix": output_prefix or os.path.dirname(s3_key),
            "language": language,
            "clips": clip_results,
        }

# 가벼운 디스패처 (GPU 없음, 모델 로딩 없음 → Cold Start 밀리초 단위)
# AiPodcastClipper 클래스 밖에서 실행되므로 GPU 할당/WhisperX 로딩을 기다리지 않음
@app.function(secrets=[modal.Secret.from_name("ai-podcast-clipper-secret")], min_containers=1)
@modal.fastapi_endpoint(method="POST")
def process_video(request: ProcessVideoRequest, token: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    if token.credentials != os.environ["AUTH_TOKEN"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clipper = AiPodcastClipper()

    if request.callback_url:
        # 비동기 모드: .spawn()으로 즉시 반환, 완료 후 callback_url로 결과 전송
        call = clipper._do_process_video.spawn(
            s3_key=request.s3_key,
            language=request.language,
            clip_count=int(request.clip_count),
            callback_url=request.callback_url,
            uploaded_file_id=request.uploaded_file_id,
            attempt=request.attempt,
            output_prefix=request.output_prefix,
            mode=request.mode,
            moments=request.moments,
            transcript_s3_key=request.transcript_s3_key,
        )
        return {"status": "accepted", "call_id": call.object_id}
    else:
        # 동기 모드 (로컬 개발): Modal 워커에서 동기 실행, 결과 직접 반환
        return clipper._do_process_video.remote(
            s3_key=request.s3_key,
            language=request.language,
            clip_count=int(request.clip_count),
            callback_url=None,
            uploaded_file_id=request.uploaded_file_id,
            attempt=request.attempt,
            output_prefix=request.output_prefix,
            mode=request.mode,
            moments=request.moments,
            transcript_s3_key=request.transcript_s3_key,
        )


# 로컬에서 원격 엔드포인트를 호출해 동작을 검증하는 엔트리포인트
@app.local_entrypoint()
def main():
    import requests

    # 배포된 FastAPI 엔드포인트의 URL 획득
    url = process_video.get_web_url()

    payload = {
        "s3_key": "test2/testmin30.mp4"
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer 123123"
    }

    # 엔드포인트 호출 및 응답 확인
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    result = response.json()
    print(result)
