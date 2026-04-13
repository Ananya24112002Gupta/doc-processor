from uuid import UUID
from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, ConfigDict
from app.models.document import JobStatus


# ─────────────────────────────────────────────
# Job schemas
# ─────────────────────────────────────────────

class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    celery_task_id: Optional[str]
    status: JobStatus
    current_stage: Optional[str]
    progress_pct: int
    error_message: Optional[str]
    retry_count: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


# ─────────────────────────────────────────────
# Document schemas
# ─────────────────────────────────────────────

class DocumentOut(BaseModel):
    """Minimal representation returned in list views."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    original_filename: str
    file_type: str
    file_size: int
    is_finalized: bool
    created_at: datetime
    updated_at: datetime

    # Latest job info, joined by service layer
    latest_job: Optional[JobOut] = None


class DocumentDetailOut(DocumentOut):
    """Full document representation returned in detail view."""
    extracted_title: Optional[str]
    extracted_category: Optional[str]
    extracted_summary: Optional[str]
    extracted_keywords: Optional[List[str]]
    extracted_raw_text: Optional[str]
    extracted_metadata: Optional[Dict[str, Any]]
    reviewed_output: Optional[Dict[str, Any]]
    finalized_at: Optional[datetime]
    jobs: List[JobOut] = []


# ─────────────────────────────────────────────
# Request schemas
# ─────────────────────────────────────────────

class ReviewUpdateRequest(BaseModel):
    """Payload sent by the frontend to update the reviewed output fields."""
    title: Optional[str] = None
    category: Optional[str] = None
    summary: Optional[str] = None
    keywords: Optional[List[str]] = None
    extra: Optional[Dict[str, Any]] = None


class FinalizeRequest(BaseModel):
    """Optional confirmation payload; frontend may omit body."""
    confirm: bool = True


# ─────────────────────────────────────────────
# Progress event schema (SSE payload)
# ─────────────────────────────────────────────

class ProgressEvent(BaseModel):
    event: str
    data: Dict[str, Any]


# ─────────────────────────────────────────────
# List query params
# ─────────────────────────────────────────────

class DocumentListParams(BaseModel):
    search: Optional[str] = None
    status: Optional[JobStatus] = None
    sort_by: str = "created_at"
    sort_order: str = "desc"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
