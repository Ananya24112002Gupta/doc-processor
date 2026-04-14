import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Integer, BigInteger, DateTime,
    Enum as SAEnum, JSON, ForeignKey, Boolean,
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base


class JobStatus(str, enum.Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"
    finalized = "finalized"


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)      # e.g. "pdf", "txt", "docx"
    file_size = Column(BigInteger, nullable=False)       # in bytes
    upload_path = Column(Text, nullable=False)

    # Processing output (stored as JSON after extraction)
    extracted_title = Column(Text, nullable=True)
    extracted_category = Column(String(100), nullable=True)
    extracted_summary = Column(Text, nullable=True)
    extracted_keywords = Column(JSON, nullable=True)    # list[str]
    extracted_raw_text = Column(Text, nullable=True)
    extracted_metadata = Column(JSON, nullable=True)    # dict of extra fields

    # Review / finalization
    reviewed_output = Column(JSON, nullable=True)       # user-edited JSON
    is_finalized = Column(Boolean, default=False, nullable=False)
    finalized_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationship to processing jobs
    jobs = relationship("ProcessingJob", back_populates="document", cascade="all, delete-orphan")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    celery_task_id = Column(String(255), nullable=True)  # set after task is dispatched
    status = Column(SAEnum(JobStatus), default=JobStatus.queued, nullable=False)
    current_stage = Column(String(100), nullable=True)   # human-readable stage name
    progress_pct = Column(Integer, default=0, nullable=False)  # 0–100
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)

    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    document = relationship("Document", back_populates="jobs")
