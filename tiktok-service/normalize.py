def normalize_video(raw: dict) -> dict:
    author = raw.get("author", {})
    stats = raw.get("stats", {})
    music = raw.get("music", {})
    challenges = raw.get("challenges", [])

    return {
        "id": str(raw.get("id", "")),
        "description": raw.get("desc", ""),
        "create_time": raw.get("createTime", 0),
        "author": {
            "username": author.get("uniqueId", ""),
            "display_name": author.get("nickname", ""),
            "followers": raw.get("authorStats", {}).get("followerCount", 0),
            "verified": author.get("verified", False),
        },
        "stats": {
            "views": stats.get("playCount", 0),
            "likes": stats.get("diggCount", 0),
            "comments": stats.get("commentCount", 0),
            "shares": stats.get("shareCount", 0),
        },
        "hashtags": [c.get("title", "") for c in challenges if c.get("title")],
        "music": {
            "title": music.get("title", ""),
            "author": music.get("authorName", ""),
        },
        "url": f"https://www.tiktok.com/@{author.get('uniqueId', '')}/video/{raw.get('id', '')}",
    }


def normalize_user(raw: dict) -> dict:
    user = raw.get("user", {})
    stats = raw.get("stats", {})
    return {
        "username": user.get("uniqueId", ""),
        "display_name": user.get("nickname", ""),
        "followers": stats.get("followerCount", 0),
        "following": stats.get("followingCount", 0),
        "total_likes": stats.get("heartCount", 0),
        "video_count": stats.get("videoCount", 0),
        "bio": user.get("signature", ""),
        "verified": user.get("verified", False),
        "avatar_url": user.get("avatarLarger", ""),
    }
