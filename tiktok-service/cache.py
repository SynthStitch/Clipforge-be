from datetime import datetime, timedelta
from typing import Any

_cache: dict[str, dict] = {}


def get_cached(key: str, ttl_hours: float = 1) -> Any | None:
    entry = _cache.get(key)
    if entry and datetime.now() - entry["time"] < timedelta(hours=ttl_hours):
        return entry["data"]
    return None


def set_cached(key: str, data: Any) -> None:
    _cache[key] = {"data": data, "time": datetime.now()}


def clear_cache() -> None:
    _cache.clear()
