# ClipForge TikTok Data Service — Full Project Context

*Paste this entire document into a new Claude session to build the microservice.*

---

## What We're Building

A Python/FastAPI microservice that wraps the `davidteather/TikTok-Api` (unofficial) library. It runs as a Docker container on Daniel's Proxmox homelab and exposes REST endpoints that n8n workflows call via HTTP Request nodes. This replaces Nimble (paid per-request scraping) for all TikTok content data.

**This service does NOT handle TikTok Shop data** (products, sales, sellers). TikTok Shop data still comes from Nimble or the official TikTok Shop API. This service handles the content/creator side: trending videos, hashtag stats, creator profiles, video metadata.

---

## Infrastructure Context

**Daniel's homelab:**
- Proxmox-based Supermicro server
- Docker LXC containers for services
- n8n runs at `192.168.86.201:5678` (Docker container)
- PostgreSQL (ClipForge DB) on same Proxmox host
- Ubiquiti switch for internal networking
- OPNsense router on Protectli box

**This service will run at:** `192.168.86.XXX:8100` (new Docker container, internal only — NOT exposed to internet)

**Who calls it:** n8n workflows via HTTP Request nodes over the internal LAN. Later, the ClipForge Node.js backend will also call it.

---

## Tech Stack

- **Language:** Python 3.11+
- **Framework:** FastAPI (async — matches TikTokApi's async design)
- **TikTok library:** `TikTokApi` v7.3.x (`pip install TikTokApi`)
- **Browser engine:** Playwright (`python -m playwright install chromium`)
- **Proxy provider:** `proxyproviders` library — supports Webshare (recommended by library author) or Nimble residential proxies
- **Caching:** In-memory with TTL (1 hour for hashtag data, 6 hours for user profiles)
- **Rate limiting:** `slowapi` — internal rate limits to avoid hammering TikTok
- **Deployment:** Docker container on Proxmox LXC

---

## API Endpoints to Build

### GET /health
Health check. Returns session count and uptime.
```json
{"status": "ok", "sessions": 3, "uptime_seconds": 3600}
```

### GET /trending
Fetch trending videos from TikTok's For You page.
- Query: `count` (int, default 20, max 50), `region` (string, default "US")
- Returns: Array of video objects
- Cache: 1 hour TTL
- **n8n use:** Niche Discovery workflow — identify trending content themes

### GET /hashtag/{tag}
Fetch videos and metadata for a specific hashtag.
- Query: `count` (int, default 30, max 100)
- Returns: `{hashtag, video_count, view_count, videos: [...]}`
- Cache: 1 hour TTL
- **n8n use:** Niche Intelligence workflow — measure hashtag volume and creator density for saturation scoring. This is the most important endpoint.

### GET /user/{username}
Fetch a creator's profile info.
- Returns: `{username, display_name, followers, following, total_likes, video_count, bio, verified, avatar_url}`
- Cache: 6 hour TTL
- **n8n use:** Creator density analysis per niche

### GET /user/{username}/videos
Fetch a creator's recent videos.
- Query: `count` (int, default 30, max 100)
- Returns: Array of video objects with full metadata
- Cache: 1 hour TTL
- **n8n use:** Video Transcriber workflow — get video URLs for top creators, then send to Gemini for transcription

### GET /video/{video_id}
Fetch full metadata for a specific video.
- Returns: Single video object with all stats
- Cache: 6 hour TTL
- **n8n use:** Deep-dive on specific viral videos

### POST /search
Search TikTok for videos matching a query.
- Body: `{"query": "magnetic eyelashes", "count": 20}`
- Returns: Array of video objects
- Cache: 1 hour TTL
- **n8n use:** Cross-reference niche keywords against TikTok content volume

---

## Video Object Shape (standardized across all endpoints)

```json
{
  "id": "7312345678901234567",
  "description": "POV: you finally fixed your posture #posturecorrector #health",
  "create_time": 1711234567,
  "author": {
    "username": "healthcreator",
    "display_name": "Health Creator",
    "followers": 125000,
    "verified": false
  },
  "stats": {
    "views": 2400000,
    "likes": 185000,
    "comments": 3200,
    "shares": 12000
  },
  "hashtags": ["posturecorrector", "health", "wellness"],
  "music": {
    "title": "original sound",
    "author": "healthcreator"
  },
  "url": "https://www.tiktok.com/@healthcreator/video/7312345678901234567"
}
```

---

## Key Implementation Patterns

### Session Management (critical)
TikTokApi uses Playwright browser sessions. Create on startup, reuse, auto-recover on failure.

```python
from TikTokApi import TikTokApi
from contextlib import asynccontextmanager
import os

api = TikTokApi()

@asynccontextmanager
async def lifespan(app):
    await api.create_sessions(
        num_sessions=int(os.environ.get("NUM_SESSIONS", 3)),
        proxy_provider=get_proxy_provider(),
        headless=True,
        enable_session_recovery=True,
        allow_partial_sessions=True,
    )
    yield
    await api.__aexit__(None, None, None)

app = FastAPI(lifespan=lifespan)
```

### Proxy Configuration (required — TikTok blocks datacenter IPs)
```python
from proxyproviders import Webshare
from proxyproviders.algorithms import RoundRobin

def get_proxy_provider():
    provider_type = os.environ.get("PROXY_PROVIDER", "webshare")
    api_key = os.environ.get("PROXY_API_KEY")
    
    if provider_type == "webshare":
        return Webshare(api_key=api_key)
    # Add Nimble proxy support if their format is compatible
    # May need a custom ProxyProvider implementation
    raise ValueError(f"Unknown proxy provider: {provider_type}")
```

### Caching (in-memory with TTL)
```python
from datetime import datetime, timedelta

cache = {}

def get_cached(key, ttl_hours=1):
    if key in cache:
        entry = cache[key]
        if datetime.now() - entry["time"] < timedelta(hours=ttl_hours):
            return entry["data"]
    return None

def set_cached(key, data):
    cache[key] = {"data": data, "time": datetime.now()}
```

### Error Handling
The library throws `EmptyResponseException` when TikTok detects a bot. Handle gracefully:

```python
from TikTokApi.exceptions import EmptyResponseException

@app.get("/hashtag/{tag}")
async def get_hashtag(tag: str, count: int = 30):
    cached = get_cached(f"hashtag:{tag}:{count}")
    if cached:
        return cached
    
    try:
        hashtag = api.hashtag(name=tag)
        info = await hashtag.info()
        videos = []
        async for video in hashtag.videos(count=count):
            videos.append(normalize_video(video.as_dict))
        
        result = {
            "hashtag": tag,
            "video_count": info.get("stats", {}).get("videoCount", 0),
            "view_count": info.get("stats", {}).get("viewCount", 0),
            "count": len(videos),
            "videos": videos
        }
        set_cached(f"hashtag:{tag}:{count}", result)
        return result
    except EmptyResponseException:
        raise HTTPException(status_code=429, detail="TikTok rate limited — retry later")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Rate Limiting (internal)
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)

@app.get("/hashtag/{tag}")
@limiter.limit("10/minute")
async def get_hashtag(request: Request, tag: str, count: int = 30):
    ...
```

---

## Docker Setup

### Dockerfile
```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libxcomposite1 libxrandr2 libxdamage1 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m playwright install chromium

COPY . .

EXPOSE 8100
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
```

### requirements.txt
```
fastapi>=0.104.0
uvicorn>=0.24.0
TikTokApi>=7.3.0
proxyproviders>=1.0.0
slowapi>=0.1.9
```

### docker-compose.yml
```yaml
services:
  clipforge-tiktok:
    build: .
    container_name: clipforge-tiktok
    restart: unless-stopped
    ports:
      - "8100:8100"
    environment:
      - PROXY_PROVIDER=webshare
      - PROXY_API_KEY=${PROXY_API_KEY}
      - NUM_SESSIONS=3
    volumes:
      - clipforge-tiktok-data:/app/data
    networks:
      - homelab-net

volumes:
  clipforge-tiktok-data:
```

---

## n8n Workflow Integration

Once this service is running, swap these nodes in existing workflows:

**Niche Intelligence v1 (wOOLIdyeofjoES2o):**
- Old: `Scrape Hashtag Page (Nimble)` → POST to sdk.nimbleway.com
- New: `Get Hashtag Data` → GET http://192.168.86.XXX:8100/hashtag/{{hashtag}}?count=30

**Niche Discovery v1 (3A6EGhLMlwpT7Lqc):**
- Keep Nimble for Amazon Movers & Shakers scraping
- Keep Nimble for TikTok Shop search (this service doesn't cover Shop data)
- Could add a parallel TikTok trending call via GET /trending

**Video Transcriber v1 (ogYYOtjfdTZoQ7XI):**
- Old: Nimble downloads video page
- New: GET /user/{username}/videos → get video URLs → download video → send to Gemini

---

## Pre-Build Checklist

- [ ] Proxy provider account (Webshare ~$6/mo or verify Nimble proxy access)
- [ ] Decide Proxmox container: new LXC or add to existing Docker host
- [ ] Optional: get `msToken` from TikTok cookies for better reliability
- [ ] Verify container can reach internet through proxies

---

## Environment Variables

```env
PROXY_PROVIDER=webshare
PROXY_API_KEY=your-webshare-api-key
NUM_SESSIONS=3
TIKTOK_MS_TOKENS=token1,token2  # optional, comma-separated
```

---

## File Structure

```
clipforge-tiktok-service/
├── main.py              # FastAPI app, lifespan, routes
├── models.py            # Pydantic response models
├── cache.py             # In-memory cache with TTL
├── proxy.py             # Proxy provider factory
├── normalize.py         # Normalize TikTokApi responses to clean JSON
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── README.md
```
