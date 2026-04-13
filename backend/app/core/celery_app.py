from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "docflow",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Retry configuration defaults
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Soft time limit: worker gets SIGALRM at 5 min; hard kill at 10 min
    task_soft_time_limit=300,
    task_time_limit=600,
    worker_prefetch_multiplier=1,  # One task at a time per worker for fair distribution
)
