import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from TikTokApi import TikTokApi
from TikTokApi.exceptions import EmptyResponseException

from cache import get_cached, set_cached
from models import HashtagResponse, HealthResponse, SearchRequest, UserProfile, Video
from normalize import normalize_user, normalize_video
from proxy import get_proxy_provider

START_TIME = time.time()
api = TikTokApi()
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ms_tokens = os.environ.get("TIKTOK_MS_TOKENS", "")
    tokens = [t.strip() for t in ms_tokens.split(",") if t.strip()] or None

    await api.create_sessions(
        num_sessions=int(os.environ.get("NUM_SESSIONS", 3)),
        proxy_provider=get_proxy_provider(),
        ms_tokens=tokens,
        headless=True,
        enable_session_recovery=True,
        allow_partial_sessions=True,
    )
    yield
    await api.__aexit__(None, None, None)


app = FastAPI(title="ClipForge TikTok Service", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.get("/health", response_model=HealthResponse)
async def health():
    return {
        "status": "ok",
        "sessions": int(os.environ.get("NUM_SESSIONS", 3)),
        "uptime_seconds": time.time() - START_TIME,
    }


@app.get("/hashtag/{tag}", response_model=HashtagResponse)
@limiter.limit("10/minute")
async def get_hashtag(request: Request, tag: str, count: int = 30):
    cache_key = f"hashtag:{tag}:{count}"
    cached = get_cached(cache_key, ttl_hours=1)
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
            "videos": videos,
        }
        set_cached(cache_key, result)
        return result
    except EmptyResponseException:
        raise HTTPException(status_code=429, detail="TikTok rate limited — retry later")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/user/{username}", response_model=UserProfile)
@limiter.limit("10/minute")
async def get_user(request: Request, username: str):
    cache_key = f"user:{username}"
    cached = get_cached(cache_key, ttl_hours=6)
    if cached:
        return cached

    try:
        user = api.user(username=username)
        info = await user.info()
        result = normalize_user(info)
        set_cached(cache_key, result)
        return result
    except EmptyResponseException:
        raise HTTPException(status_code=429, detail="TikTok rate limited — retry later")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/user/{username}/videos", response_model=list[Video])
@limiter.limit("10/minute")
async def get_user_videos(request: Request, username: str, count: int = 30):
    cache_key = f"user_videos:{username}:{count}"
    cached = get_cached(cache_key, ttl_hours=1)
    if cached:
        return cached

    try:
        user = api.user(username=username)
        videos = []
        async for video in user.videos(count=count):
            videos.append(normalize_video(video.as_dict))
        set_cached(cache_key, videos)
        return videos
    except EmptyResponseException:
        raise HTTPException(status_code=429, detail="TikTok rate limited — retry later")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/video/{video_id}", response_model=Video)
@limiter.limit("10/minute")
async def get_video(request: Request, video_id: str):
    cache_key = f"video:{video_id}"
    cached = get_cached(cache_key, ttl_hours=6)
    if cached:
        return cached

    try:
        video = api.video(id=video_id)
        info = await video.info()
        result = normalize_video(info)
        set_cached(cache_key, result)
        return result
    except EmptyResponseException:
        raise HTTPException(status_code=429, detail="TikTok rate limited — retry later")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/trending", response_model=list[Video])
@limiter.limit("5/minute")
async def get_trending(request: Request, count: int = 20, region: str = "US"):
    cache_key = f"trending:{region}:{count}"
    cached = get_cached(cache_key, ttl_hours=1)
    if cached:
        return cached

    try:
        videos = []
        async for video in api.trending.videos(count=count, region=region):
            videos.append(normalize_video(video.as_dict))
        set_cached(cache_key, videos)
        return videos
    except EmptyResponseException:
        raise HTTPException(status_code=429, detail="TikTok rate limited — retry later")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search", response_model=list[Video])
@limiter.limit("10/minute")
async def search_videos(request: Request, body: SearchRequest):
    cache_key = f"search:{body.query}:{body.count}"
    cached = get_cached(cache_key, ttl_hours=1)
    if cached:
        return cached

    try:
        videos = []
        async for video in api.search.videos(body.query, count=body.count):
            videos.append(normalize_video(video.as_dict))
        set_cached(cache_key, videos)
        return videos
    except EmptyResponseException:
        raise HTTPException(status_code=429, detail="TikTok rate limited — retry later")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
