from pydantic import BaseModel
from typing import Optional


class VideoAuthor(BaseModel):
    username: str
    display_name: str
    followers: int
    verified: bool


class VideoStats(BaseModel):
    views: int
    likes: int
    comments: int
    shares: int


class VideoMusic(BaseModel):
    title: str
    author: str


class Video(BaseModel):
    id: str
    description: str
    create_time: int
    author: VideoAuthor
    stats: VideoStats
    hashtags: list[str]
    music: VideoMusic
    url: str


class HashtagResponse(BaseModel):
    hashtag: str
    video_count: int
    view_count: int
    count: int
    videos: list[Video]


class UserProfile(BaseModel):
    username: str
    display_name: str
    followers: int
    following: int
    total_likes: int
    video_count: int
    bio: str
    verified: bool
    avatar_url: str


class HealthResponse(BaseModel):
    status: str
    sessions: int
    uptime_seconds: float


class SearchRequest(BaseModel):
    query: str
    count: int = 20
