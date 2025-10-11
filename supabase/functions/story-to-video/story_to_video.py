#!/usr/bin/env python3
"""
AI Video Story Builder (Runware + ElevenLabs)
---------------------------------------------

What it does
============
- Splits your story text on a blank line (`\n\n`) into SCENES
- Parses dialogue lines with the pattern:  `Character: text`
  - If a line lacks "Name:", it's treated as Narrator
- Generates per-line audio with ElevenLabs, merges into per-scene audio
- Generates per-scene video with Runware using the scene text as the prompt
- Auto-aligns each video clip’s length to its scene audio (via ffprobe duration)
- Overlays audio onto video; concatenates all scenes into `final_story.mp4`
- Optionally renders hard-burned subtitles from your scene text

Requirements
============
- Python 3.9+
- `pip install requests`
- FFmpeg and FFprobe installed and available in PATH

Configuration
=============
1) Set environment variables (recommended) or edit the placeholders below:
   - ELEVENLABS_API_KEY
   - RUNWARE_API_KEY

2) Fill `VOICE_MAP` with your ElevenLabs voice IDs:
   e.g., "Andy": "VOICE_ID_1", "Bella": "VOICE_ID_2", "Narrator": "VOICE_ID_3"

3) Adjust RUNWARE endpoints if needed. This script supports two common patterns:
   A) Direct binary response (returns MP4 bytes)
   B) JSON {task_id} with a status polling endpoint that returns a download URL

Usage
=====
python story_to_video.py --input story.txt \
    --output final_story.mp4 \
    --subtitles \
    --default_duration 6 \
    --model_name "runware/video-cinematic"

Story Format Notes
==================
- Scenes are separated by a blank line (exactly "\\n\\n").
- Dialogue lines start with `Name: text` (colon required). Anything else is Narrator.

Author: ChatGPT (GPT-5 Thinking)
Date: 2025-10-11
"""

import os
import re
import sys
import json
import time
import shlex
import argparse
import tempfile
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import requests

# ----------------------
# Configuration Defaults
# ----------------------

# Read from environment if present, else leave as placeholder strings.
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "YOUR_11LABS_API_KEY")
RUNWARE_API_KEY = os.getenv("RUNWARE_API_KEY", "YOUR_RUNWARE_API_KEY")

# ElevenLabs model (safe default; you can change to another model if desired)
ELEVENLABS_TTS_MODEL = "eleven_multilingual_v2"

# Voice map: Fill with your real ElevenLabs voice IDs.
VOICE_MAP: Dict[str, str] = {
    # Example voice IDs (replace with your actual ones)
    "Narrator": "VOICE_ID_NARRATOR",
    "Andy": "VOICE_ID_ANDY",
    "Bella": "VOICE_ID_BELLA",
    "Sammy": "VOICE_ID_SAMMY",
}

# If True, we’ll try ElevenLabs streaming endpoint to speed up TTS.
USE_ELEVEN_STREAM = True

# -------- Runware Endpoint Config (ADJUST as needed) --------
# This script supports two patterns:
# 1) Direct binary (video) generation endpoint (returns MP4 bytes in the response)
# 2) Async job endpoint that returns JSON with a task/job ID, and a polling endpoint
#
# Choose ONE style and comment out the other with your actual URLs from Runware docs.

# Style 1: Direct binary generation endpoint (Synchronous)
RUNWARE_VIDEO_ENDPOINT = os.getenv("RUNWARE_VIDEO_ENDPOINT", "https://api.runware.ai/v1/generate/video")

# Style 2: Async job (Uncomment and set if your account uses task-based generation)
# RUNWARE_VIDEO_SUBMIT_ENDPOINT = "https://api.runware.ai/v1/jobs/video"
# RUNWARE_VIDEO_STATUS_ENDPOINT = "https://api.runware.ai/v1/jobs/{task_id}"  # {task_id} placeholder in URL

# ----------------------
# Utility Functions
# ----------------------

def run(cmd: List[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a subprocess and return CompletedProcess, raising on error if check=True."""
    print(">>", " ".join(shlex.quote(c) for c in cmd))
    return subprocess.run(cmd, check=check, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

def ffprobe_duration(path: Path) -> Optional[float]:
    """Return media duration in seconds using ffprobe, or None if unavailable."""
    try:
        cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=nw=1:nk=1", str(path)
        ]
        proc = run(cmd, check=False)
        val = proc.stdout.strip()
        return float(val) if val else None
    except Exception as e:
        print(f"[WARN] Could not get duration via ffprobe for {path}: {e}")
        return None

def ensure_tools():
    """Ensure ffmpeg and ffprobe exist."""
    for tool in ("ffmpeg", "ffprobe"):
        try:
            run([tool, "-version"], check=False)
        except FileNotFoundError:
            print(f"[FATAL] Required tool '{tool}' not found in PATH.")
            sys.exit(1)

def sanitize_filename(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", name).strip("_")

# ----------------------
# Text Parsing
# ----------------------

DIALOGUE_RE = re.compile(r"^\s*([A-Za-z][\w\- ]{0,48})\s*:\s*(.+?)\s*$")

def split_scenes(story: str) -> List[str]:
    return [s.strip() for s in story.split("\n\n") if s.strip()]

def parse_scene_lines(scene_text: str) -> List[Tuple[str, str]]:
    """
    Returns list of (speaker, text) pairs. Lines with "Name: text" set the speaker.
    Lines without a leading "Name:" become ("Narrator", line_text).
    """
    pairs: List[Tuple[str, str]] = []
    for line in scene_text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = DIALOGUE_RE.match(line)
        if m:
            speaker = m.group(1).strip()
            text = m.group(2).strip()
        else:
            speaker = "Narrator"
            text = line
        pairs.append((speaker, text))
    return pairs

# ----------------------
# ElevenLabs (TTS)
# ----------------------

def elevenlabs_tts(text: str, voice_id: str, out_path: Path) -> None:
    """
    Generate speech audio with ElevenLabs and write to out_path (.mp3 recommended).
    Uses streaming endpoint if USE_ELEVEN_STREAM.
    """
    assert ELEVENLABS_API_KEY and ELEVENLABS_API_KEY != "YOUR_11LABS_API_KEY", (
        "Set ELEVENLABS_API_KEY env var or edit the script with your key."
    )

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
    }

    payload = {
        "text": text,
        "model_id": ELEVENLABS_TTS_MODEL,
        # Optional: add voice_settings here if you wish (stability, similarity, etc.)
    }

    # Endpoint selection
    if USE_ELEVEN_STREAM:
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
    else:
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

    print(f"[TTS] {voice_id} -> {out_path.name}")
    with requests.post(url, headers=headers, json=payload, stream=True) as r:
        r.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

# ----------------------
# Runware (Video)
# ----------------------

def runware_generate_video(prompt: str, duration_s: int, model_name: str, out_path: Path) -> None:
    """
    Generate a video clip with Runware for the given prompt & duration.
    Writes binary MP4 to out_path.
    This function supports a direct-binary endpoint (synchronous). If your
    account uses async jobs, comment this out and use the async function below.
    """
    assert RUNWARE_API_KEY and RUNWARE_API_KEY != "YOUR_RUNWARE_API_KEY", (
        "Set RUNWARE_API_KEY env var or edit the script with your key."
    )

    headers = {
        "Authorization": f"Bearer {RUNWARE_API_KEY}",
        # Some Runware endpoints require this; adjust as needed:
        "Content-Type": "application/json",
        "Accept": "application/octet-stream,video/mp4,application/json",
    }

    payload = {
        "prompt": prompt[:800],   # Prompt length guard
        "duration": duration_s,   # seconds
        "model": model_name,      # e.g., "runware/video-cinematic"
        # Add other params as supported by your Runware plan (seed, guidance, fps, etc.)
    }

    print(f"[Runware] Requesting video: {duration_s}s, model={model_name}, prompt_len={len(payload['prompt'])}")
    r = requests.post(RUNWARE_VIDEO_ENDPOINT, headers=headers, json=payload, stream=True)
    r.raise_for_status()

    # Some deployments return JSON instead of binary. Try to detect content-type.
    ctype = r.headers.get("Content-Type", "")
    if "application/json" in ctype:
        data = r.json()
        # Try common JSON shapes:
        # - Direct URL:
        url = data.get("download_url") or data.get("url")
        # - Async job:
        task_id = data.get("task_id") or data.get("id")
        if url:
            _download_file(url, out_path)
            return
        elif task_id:
            print(f"[Runware] Received task_id={task_id}. Please switch to async polling function or set STATUS endpoint.")
            raise RuntimeError("Runware endpoint returned task_id; configure async polling endpoints.")
        else:
            raise RuntimeError(f"Unexpected Runware JSON response: {data}")
    else:
        # Assume binary MP4
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

def _download_file(url: str, out_path: Path) -> None:
    print(f"[Download] {url} -> {out_path.name}")
    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

# ----------------------
# Media Assembly
# ----------------------

def merge_audio_lines_to_scene(line_audio_paths: List[Path], scene_audio_path: Path) -> None:
    """
    Merge multiple MP3 line files into one scene audio via ffmpeg concat demuxer.
    """
    if len(line_audio_paths) == 1:
        # Single line — just copy
        scene_audio_path.write_bytes(line_audio_paths[0].read_bytes())
        return

    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as tf:
        for p in line_audio_paths:
            tf.write(f"file '{p.as_posix()}'\n")
        concat_list = tf.name

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", concat_list,
        "-c", "copy",
        str(scene_audio_path)
    ]
    run(cmd)

def overlay_audio_on_video(video_path: Path, audio_path: Path, out_path: Path) -> None:
    """
    Overlay audio onto the video, trimming the video to the audio duration if needed.
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(audio_path),
        "-c:v", "copy",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        str(out_path)
    ]
    run(cmd)

def burn_subtitles_from_text(video_in: Path, text: str, out_path: Path) -> None:
    """
    Generate a temporary SRT from scene text (simple one-block) and burn into video.
    """
    # Create a simple SRT covering entire clip (0 -> end)
    srt_content = "1\n00:00:00,000 --> 99:59:59,000\n" + text.replace("\n", " ") + "\n"
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".srt") as tf:
        tf.write(srt_content)
        srt_path = Path(tf.name)

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_in),
        "-vf", f"subtitles={srt_path.as_posix()}",
        "-c:a", "copy",
        str(out_path)
    ]
    run(cmd)

def concat_videos(video_paths: List[Path], out_path: Path) -> None:
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as tf:
        for p in video_paths:
            tf.write(f"file '{p.as_posix()}'\n")
        list_path = tf.name
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", list_path,
        "-c", "copy",
        str(out_path)
    ]
    run(cmd)

# ----------------------
# Orchestration
# ----------------------

def process_scene(
    scene_index: int,
    scene_text: str,
    voices: Dict[str, str],
    default_duration: int,
    model_name: str,
    tmpdir: Path,
    burn_subs: bool
) -> Path:
    """
    Process one scene: generate TTS for each line, merge to scene audio,
    generate Runware video, then mux audio over video. Returns final scene path.
    """
    # 1) Parse lines into (speaker, text)
    pairs = parse_scene_lines(scene_text)
    if not pairs:
        pairs = [("Narrator", scene_text)]

    # 2) Generate line audios
    line_audio_files: List[Path] = []
    for i, (speaker, text) in enumerate(pairs, 1):
        voice_id = voices.get(speaker) or voices.get("Narrator")
        if not voice_id:
            raise RuntimeError(f"No voice ID for speaker '{speaker}', and no Narrator voice configured.")
        line_audio = tmpdir / f"scene{scene_index:02d}_line{i:02d}_{sanitize_filename(speaker)}.mp3"
        elevenlabs_tts(text, voice_id, line_audio)
        line_audio_files.append(line_audio)

    # 3) Merge lines -> scene audio
    scene_audio = tmpdir / f"scene{scene_index:02d}_audio.mp3"
    merge_audio_lines_to_scene(line_audio_files, scene_audio)

    # 4) Determine target video duration (match audio length if possible)
    audio_len = ffprobe_duration(scene_audio)
    duration_s = int(round(audio_len)) if audio_len else default_duration

    # 5) Generate video from Runware
    scene_video_raw = tmpdir / f"scene{scene_index:02d}_raw.mp4"
    runware_generate_video(scene_text, max(duration_s, 2), model_name, scene_video_raw)

    # 6) Overlay audio on video
    scene_final = tmpdir / f"scene{scene_index:02d}_final.mp4"
    overlay_audio_on_video(scene_video_raw, scene_audio, scene_final)

    # 7) Optional: burn subtitles
    if burn_subs:
        scene_subbed = tmpdir / f"scene{scene_index:02d}_subs.mp4"
        burn_subtitles_from_text(scene_final, scene_text, scene_subbed)
        return scene_subbed

    return scene_final

def build_story_video(
    story_text: str,
    out_path: Path,
    voices: Dict[str, str],
    model_name: str,
    default_duration: int = 6,
    burn_subs: bool = False
) -> None:
    ensure_tools()
    scenes = split_scenes(story_text)
    if not scenes:
        raise ValueError("No scenes found. Ensure your text uses blank lines (\\n\\n) to separate scenes.")

    with tempfile.TemporaryDirectory() as td:
        tmpdir = Path(td)
        print(f"[INFO] Working dir: {tmpdir}")
        scene_outputs: List[Path] = []

        for idx, scene_text in enumerate(scenes, 1):
            print(f"\n===== Processing Scene {idx}/{len(scenes)} =====")
            scene_out = process_scene(
                scene_index=idx,
                scene_text=scene_text,
                voices=voices,
                default_duration=default_duration,
                model_name=model_name,
                tmpdir=tmpdir,
                burn_subs=burn_subs
            )
            scene_outputs.append(scene_out)

        # Concatenate scenes
        concat_videos(scene_outputs, out_path)
        print(f"\n[SUCCESS] Final video written to: {out_path}")

# ----------------------
# CLI
# ----------------------

def main():
    ap = argparse.ArgumentParser(description="AI Video Story from text using Runware + ElevenLabs")
    ap.add_argument("--input", required=True, help="Path to a UTF-8 text file with your story.")
    ap.add_argument("--output", default="final_story.mp4", help="Output MP4 filename.")
    ap.add_argument("--model_name", default="runware/video-cinematic", help="Runware model name.")
    ap.add_argument("--default_duration", type=int, default=6, help="Fallback seconds per scene if audio length unknown.")
    ap.add_argument("--subtitles", action="store_true", help="Burn scene text as subtitles on each clip.")
    args = ap.parse_args()

    story_path = Path(args.input)
    out_path = Path(args.output)

    if not story_path.exists():
        print(f"[FATAL] Input file not found: {story_path}")
        sys.exit(1)

    # Load story text
    story_text = story_path.read_text(encoding="utf-8")

    # Validate voices
    if "Narrator" not in VOICE_MAP:
        print("[FATAL] VOICE_MAP must include a 'Narrator' voice_id.")
        sys.exit(1)

    build_story_video(
        story_text=story_text,
        out_path=out_path,
        voices=VOICE_MAP,
        model_name=args.model_name,
        default_duration=args.default_duration,
        burn_subs=args.subtitles
    )

if __name__ == "__main__":
    main()
