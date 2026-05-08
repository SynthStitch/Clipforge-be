import os
import tempfile
import subprocess
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from openai import OpenAI

app = FastAPI(title="ClipForge Instagram Transcriber")
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


class TranscribeRequest(BaseModel):
    urls: List[str]


class TranscriptResult(BaseModel):
    url: str
    transcript: str


class TranscribeResponse(BaseModel):
    data: List[TranscriptResult]


@app.post("/transcribe", response_model=TranscribeResponse)
def transcribe(req: TranscribeRequest):
    if not req.urls:
        raise HTTPException(status_code=400, detail="No URLs provided")
    if len(req.urls) > 10:
        raise HTTPException(status_code=400, detail="Max 10 URLs per request")

    results = []

    with tempfile.TemporaryDirectory() as tmpdir:
        for url in req.urls:
            try:
                output_template = str(Path(tmpdir) / "%(id)s.%(ext)s")
                cmd = [
                    "yt-dlp",
                    "-x",
                    "--audio-format", "mp3",
                    "--audio-quality", "5",
                    "-o", output_template,
                    "--print", "after_move:filepath",
                    "--no-playlist",
                ]
                cookies_file = os.environ.get("INSTAGRAM_COOKIES_FILE", "")
                if cookies_file and os.path.exists(cookies_file):
                    cmd += ["--cookies", cookies_file]
                cmd.append(url)

                dl = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=300,
                )

                if dl.returncode != 0:
                    results.append(TranscriptResult(url=url, transcript=f"[Download failed: {dl.stderr[:300]}]"))
                    continue

                filepath = dl.stdout.strip()
                if not filepath or not Path(filepath).exists():
                    results.append(TranscriptResult(url=url, transcript="[Download failed: file not found]"))
                    continue

                with open(filepath, "rb") as audio_file:
                    whisper = client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file,
                    )

                results.append(TranscriptResult(url=url, transcript=whisper.text))

            except subprocess.TimeoutExpired:
                results.append(TranscriptResult(url=url, transcript="[Timed out after 5 minutes]"))
            except Exception as e:
                results.append(TranscriptResult(url=url, transcript=f"[Error: {str(e)[:300]}]"))

    return TranscribeResponse(data=results)


@app.get("/health")
def health():
    return {"status": "ok"}
