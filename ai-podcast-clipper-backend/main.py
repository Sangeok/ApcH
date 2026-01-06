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

# 요청 바디 모델: 처리 대상 동영상의 S3 객체 키를 받음
class ProcessVideoRequest(BaseModel):
    s3_key: str
    language: str = "Korean"

# Modal 컨테이너 이미지: CUDA 12.4 + Python 3.12, 비디오/딥러닝 런타임 준비
image = (modal.Image.from_registry("nvidia/cuda:12.4.0-devel-ubuntu22.04", add_python="3.12")
    .apt_install("ffmpeg", "libgl1-mesa-glx", "wget", "libcudnn8", "libcudnn8-dev", "fontconfig")
    .pip_install_from_requirements("requirements.txt")
    .env({"MPLBACKEND": "Agg"})
    .run_commands([
        "mkdir -p /usr/share/fonts/truetype/custom",
        "wget -O /usr/share/fonts/truetype/custom/Anton-Regular.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
        "wget -O /usr/share/fonts/truetype/custom/NotoSansKR-Bold.otf https://fonts.gstatic.com/ea/notosanskr/v2/NotoSansKR-Bold.otf",
        "fc-cache -f -v"
    ])
    .add_local_dir("asd", "/asd", copy=True))

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

def create_subtitles_with_ffmpeg(transcript_segments: list, clip_start: float, clip_end: float, clip_video_path: str, output_path: str, max_word: int = 5):
    temp_dir = os.path.dirname(output_path)
    subtitle_path = os.path.join(temp_dir, "temp_subtitles.ass")

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
    new_style.fontsize = 122
    new_style.primary_color = pysubs2.Color(255, 255, 255)
    new_style.border_style = 1
    new_style.outline = 1.1
    new_style.shadow = 6.5
    new_style.shadowcolor = pysubs2.Color(12, 12, 12, 210)
    new_style.alignment = 5
    new_style.marginl = 44
    new_style.marginr = 44
    new_style.marginv = 165
    new_style.spacing = 1.8

    subs.styles[style_name] = new_style

    # Add subtitles to the file(extract start and end time to ssa time object)
    for i, (start,end,text) in enumerate(subtitles):
        # create ssa time object for start and end time
        start_time = pysubs2.make_time(s=start)
        end_time = pysubs2.make_time(s=end)
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

def create_korean_subtitles_with_ffmpeg(transcript_segments: list, clip_start: float, clip_end: float, clip_video_path: str, output_path: str, gemini_client, max_word: int = 3):
    temp_dir = os.path.dirname(output_path)
    subtitle_path = os.path.join(temp_dir, "temp_korean_subtitles.ass")

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
    korean_style.fontsize = 130
    korean_style.primary_color = pysubs2.Color(255, 255, 255)
    korean_style.border_style = 1
    korean_style.outline = 1.3
    korean_style.shadow = 6.5
    korean_style.shadowcolor = pysubs2.Color(8, 8, 8, 210)
    korean_style.alignment = 5  # 하단 중앙
    korean_style.marginl = 48
    korean_style.marginr = 48
    korean_style.marginv = 155
    korean_style.spacing = 1.2

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

def process_clip(base_dir: str, original_video_path: str, s3_key: str, start_time: float, end_time: float, clip_index: int, transcript_segments: list, gemini_client, selected_language: str):
    clip_name = f"clip_{clip_index}"
    s3_key_dir = os.path.dirname(s3_key)
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
        script_text = create_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, english_output_path, max_word=5)
    
        # 영어 자막 영상 업로드
        english_s3_key = f"{s3_key_dir}/{clip_name}_en.mp4"
        s3_client.upload_file(str(english_output_path), "ai-podcast-clipper-hamsoo", english_s3_key)
        
        uploaded_clip_s3_key = english_s3_key
        print(f"Uploaded English subtitle video: {english_s3_key}")
    elif selected_language == "Korean":
        # 한글 자막 영상 생성
        print(f"Creating Korean subtitles for clip {clip_index}...")
        script_text = create_korean_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, korean_output_path, gemini_client, max_word=3)

        # 한글 자막 영상 업로드
        korean_s3_key = f"{s3_key_dir}/{clip_name}_kr.mp4"
        s3_client.upload_file(str(korean_output_path), "ai-podcast-clipper-hamsoo", korean_s3_key)
        
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
@app.cls(gpu="L40S", timeout=900, retries=0, scaledown_window=20, secrets=[modal.Secret.from_name("ai-podcast-clipper-secret")],  volumes={mount_path: volume})
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

    def identify_moments(self, transcript: list) -> str:
        prompt = ("""
        This is a podcast video transcript consisting of word, along with each words's start and end time. I am looking to create clips between a minimum of 30 and maximum of 60 seconds long. The clip should never exceed 60 seconds.

        Your task is to find and extract stories, or question and their corresponding answers from the transcript.
        Each clip should begin with the question and conclude with the answer.
        It is acceptable for the clip to include a few additional sentences before a question if it aids in contextualizing the question.

        # Please adhere to the following rules:
        - Ensure that clips do not overlap with one another.
        - Start and end timestamps of the clips should align perfectly with the sentence boundaries in the transcript.
        - Only use the start and end timestamps provided in the input. modifying timestamps is not allowed.
        - Format the output as a list of JSON objects, each representing a clip with 'start' and 'end' timestamps: [{"start": seconds, "end": seconds}, ...clip2, clip3]. The output should always be readable by the python json.loads function.
        - Aim to generate longer clips between 40-60 seconds, and ensure to include as much content from the context as viable.
        - Do not end a clip in the middle of a speaker’s sentence. Extend the end timestamp to include the full sentence, even if that means using the next available word boundary.
        - End each clip exactly at the conclusion of the answer sentence. Do not include the first words of the next sentence or the next speaker.
        - Treat the first punctuation mark that ends the answer ('.', '?', '!', etc.) or a clear pause marker as the point where the clip must stop; do not move past it.
        - If the answer continues past 60 seconds, skip that candidate clip instead of trimming the speaker mid-sentence.
        - Before finalizing each clip, re-check that the final word belongs to the same speaker and that the sentence is complete (ends with natural punctuation or a clear pause). Confirm that the very next word after the end timestamp begins a new sentence or a different speaker. If not, adjust the end time backward to exclude the continuation.

        # Avoid including:
        - Moments of greeting, thanking, or saying goodbye.
        - Non-question and answer interactions.

        If there are no valid clips to extract, the output should be an empty list [], in JSON format. Also readable by json.loads() in Python.
        """
        + "Transcript:\n"
        + json.dumps(transcript, ensure_ascii=False)
        )
        response = self.gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
                # 필요 시 temperature, top_p, max_output_tokens 등 추가
        ))
        print(f"Identified moments response: ${response.text}")
        return response.text

    # Modal에 배포된 FastAPI 엔드포인트로, Inngest 워커가 s3_key를 담아 POST 요청을 보내면 해당 영상을 클립으로 가공하고 결과를 S3에 업로드합니다.
    @modal.fastapi_endpoint(method="POST")
    def process_video(self, request: ProcessVideoRequest, token: HTTPAuthorizationCredentials = Depends(auth_scheme)):
        s3_key = request.s3_key
        selected_language = request.language

        print(f"Processing video language: {selected_language}")

        if token.credentials != os.environ["AUTH_TOKEN"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # create temporary directory folder for the video processing
        run_id = str(uuid.uuid4())
        base_dir = pathlib.Path("/tmp") / run_id
        base_dir.mkdir(parents=True, exist_ok=True)

        # download video file
        video_path = base_dir / "input.mp4"

        # check AWS credentials and region
        aws_id = os.getenv("AWS_ACCESS_KEY_ID")
        aws_secret = os.getenv("AWS_SECRET_ACCESS_KEY")
        region = os.getenv("AWS_DEFAULT_REGION", "ap-southeast-2")
        if not aws_id or not aws_secret:
            raise HTTPException(
                status_code=500,
                detail="AWS credentials are missing (check Modal secret).",
            )

        # S3 client (used for downloading original video)
        s3_client = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=aws_id,
            aws_secret_access_key=aws_secret,
        )

        clip_moments = []
        clip_results = []

        try:
            # download video file from S3(path : /tmp/<run_id>/input.mp4)
            s3_client.download_file("ai-podcast-clipper-hamsoo", s3_key, str(video_path))

            # 1. transcription
            transcript_segments_json = self.transcribe_video(base_dir, video_path)
            transcript_segments = json.loads(transcript_segments_json)

            # 2. Identify moments for clips
            print("Identifying moments for clips...")
            identified_moments_raws = self.identify_moments(transcript_segments)

            raw = identified_moments_raws.strip()

            # remove code fences and markdown
            if raw.startswith("```"):
                raw = raw[len("```"):].strip()
                # remove language tag like ```json
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

            # 3. Process clips
            for index, moment in enumerate(clip_moments[:1]):
                if "start" in moment and "end" in moment:
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
                    clip_results.append(clip_result)

        finally:
            # 정리
            if base_dir.exists():
                print(f"Cleaning up temp dir after {base_dir}")
                shutil.rmtree(base_dir, ignore_errors=True)

        return {
            "status": "ok",
            "clips_planned": min(3, len(clip_moments)),
            "s3_prefix": os.path.dirname(s3_key),
            "language": selected_language,
            "clips": clip_results,
        }

# 로컬에서 원격 엔드포인트를 호출해 동작을 검증하는 엔트리포인트
@app.local_entrypoint()
def main():
    import requests

    # 원격 클래스 핸들 초기화
    ai_podcast_clipper = AiPodcastClipper()

    # 배포된 FastAPI 엔드포인트의 임시 URL 획득
    url = ai_podcast_clipper.process_video.get_web_url()

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