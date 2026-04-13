"""
app/models/__init__.py
Re-export all models so that Alembic can discover them via target_metadata.
"""
from app.models.document import Document, ProcessingJob, JobStatus

__all__ = ["Document", "ProcessingJob", "JobStatus"]
