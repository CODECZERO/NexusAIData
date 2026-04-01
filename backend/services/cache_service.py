"""
Lumina AI v4.0 — Cache Service
Multi-layer caching: DiskCache (default) → Redis (optional upgrade).
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

# orjson removed — incompatible with Python 3.14 (uses Rust/PyO3)
from diskcache import Cache
from loguru import logger

# Try Redis
try:
    import redis.asyncio as aioredis
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False


class CacheService:
    """
    Two-layer cache: Redis L1 (if available) + DiskCache L2.
    All methods are async-compatible.
    """

    def __init__(self, cache_dir: str = "./cache", redis_url: Optional[str] = None):
        self._disk = Cache(cache_dir)
        self._redis = None
        self._redis_url = redis_url

    async def initialize(self):
        """Connect to Redis if configured."""
        if HAS_REDIS and self._redis_url:
            try:
                self._redis = aioredis.from_url(
                    self._redis_url, 
                    decode_responses=False,
                    socket_connect_timeout=1,
                    socket_timeout=1
                )
                await self._redis.ping()
                logger.info("✅ Redis cache connected")
            except Exception as e:
                logger.warning(f"⚠️ Redis unavailable, using DiskCache only: {e}")
                self._redis = None

    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache (Redis first, then disk)."""
        # Try Redis L1
        if self._redis:
            try:
                val = await self._redis.get(key)
                if val is not None:
                    return json.loads(val)
            except Exception:
                pass

        # Try DiskCache L2
        val = self._disk.get(key)
        if val is not None:
            return val

        return None

    async def set(self, key: str, value: Any, ttl: int = 3600):
        """Store value in cache (both layers)."""
        # DiskCache L2
        self._disk.set(key, value, expire=ttl)

        # Redis L1
        if self._redis:
            try:
                serialized = json.dumps(value, default=str).encode()
                await self._redis.setex(key, ttl, serialized)
            except Exception:
                pass

    async def delete(self, key: str):
        """Remove key from both layers."""
        self._disk.delete(key)
        if self._redis:
            try:
                await self._redis.delete(key)
            except Exception:
                pass

    async def clear_session(self, session_id: str):
        """Remove all keys for a session."""
        # DiskCache: iterate and delete
        keys_to_delete = [k for k in self._disk if str(k).startswith(session_id)]
        for k in keys_to_delete:
            self._disk.delete(k)

        # Redis: scan and delete
        if self._redis:
            try:
                # Clear primary cache keys
                async for key in self._redis.scan_iter(f"{session_id}:*"):
                    await self._redis.delete(key)
                
                # Clear RAG context keys
                async for key in self._redis.scan_iter(f"rag:*:{session_id}"):
                    await self._redis.delete(key)
            except Exception:
                pass

    async def get_stats(self) -> dict:
        """Return cache statistics."""
        stats = {
            "disk_cache_size": len(self._disk),
            "disk_cache_volume_mb": round(self._disk.volume() / 1e6, 2),
            "redis_connected": self._redis is not None,
        }
        if self._redis:
            try:
                info = await self._redis.info("memory")
                stats["redis_memory_mb"] = round(
                    info.get("used_memory", 0) / 1e6, 2
                )
            except Exception:
                pass
        return stats

    async def close(self):
        """Cleanup connections."""
        self._disk.close()
        if self._redis:
            await self._redis.close()


# Global instance
cache_service = CacheService(
    cache_dir=os.getenv("CACHE_DIR", "./cache"),
    redis_url=os.getenv("REDIS_URL"),
)
