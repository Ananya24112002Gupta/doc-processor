import redis.asyncio as aioredis
import redis as sync_redis
from app.core.config import settings

# Async Redis client – used in FastAPI routes for SSE / pub-sub subscribe
async_redis_client: aioredis.Redis = aioredis.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True,
)

# Sync Redis client – used inside Celery workers (Celery runs in a regular thread)
sync_redis_client: sync_redis.Redis = sync_redis.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True,
)


def get_job_channel(job_id: str) -> str:
    """Returns the Redis Pub/Sub channel name for a given job."""
    return f"job:{job_id}"


async def publish_progress(job_id: str, event: str, data: dict) -> None:
    """
    Publish a progress event to the job's Redis Pub/Sub channel.
    Called from FastAPI routes if needed, or from sync workers via the sync client.
    """
    import json
    payload = json.dumps({"event": event, "data": data})
    await async_redis_client.publish(get_job_channel(job_id), payload)


def publish_progress_sync(job_id: str, event: str, data: dict) -> None:
    """
    Synchronous version of publish_progress.
    Used inside Celery tasks which run in a synchronous context.
    """
    import json
    payload = json.dumps({"event": event, "data": data})
    sync_redis_client.publish(get_job_channel(job_id), payload)
