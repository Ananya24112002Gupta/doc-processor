"""
app/services/document_service.py

Business logic layer – all database reads/writes go through here.
FastAPI route handlers stay thin; they just call service functions.
"""
import os
import uuid
import aiofiles
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Tuple

from fastapi import UploadFile, HTTPException
from sqlalchemy import select, or_, desc, asc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.document import Document, ProcessingJob, JobStatus
from app.schemas.document import ReviewUpdateRequest, DocumentListParams


# ─────────────────────────────────────────────────────────────────────────────
# Upload helpers
# ─────────────────────────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {
    "pdf", "txt", "docx", "doc", "csv", "json", "md", "html",
}


def _get_extension(filename: str) -> str:
    return Path(filename).suffix.lstrip(".").lower()


async def save_upload_file(file: UploadFile) -> Tuple[str, str, str, int]:
    """
    Persist the uploaded file to disk and return
    (stored_filename, upload_path, file_type, file_size_bytes).
    """
    ext = _get_extension(file.filename or "unknown")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    stored_filename = f"{uuid.uuid4()}.{ext}"
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    upload_path = str(upload_dir / stored_filename)

    size = 0
    async with aiofiles.open(upload_path, "wb") as out_file:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            size += len(chunk)
            if size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
                await out_file.close()
                os.remove(upload_path)
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds {settings.MAX_FILE_SIZE_MB} MB limit.",
                )
            await out_file.write(chunk)

    return stored_filename, upload_path, ext, size


# ─────────────────────────────────────────────────────────────────────────────
# Create document + job
# ─────────────────────────────────────────────────────────────────────────────

async def create_document_with_job(
    db: AsyncSession,
    original_filename: str,
    stored_filename: str,
    upload_path: str,
    file_type: str,
    file_size: int,
) -> Tuple[Document, ProcessingJob]:
    """
    Persist Document and initial ProcessingJob records.
    Returns both ORM objects so the caller can dispatch the Celery task.
    """
    doc = Document(
        original_filename=original_filename,
        stored_filename=stored_filename,
        upload_path=upload_path,
        file_type=file_type,
        file_size=file_size,
    )
    db.add(doc)
    await db.flush()  # get doc.id without committing

    job = ProcessingJob(
        document_id=doc.id,
        status=JobStatus.QUEUED,
        current_stage="queued",
        progress_pct=0,
    )
    db.add(job)
    await db.flush()

    return doc, job


# ─────────────────────────────────────────────────────────────────────────────
# List documents
# ─────────────────────────────────────────────────────────────────────────────

async def list_documents(
    db: AsyncSession,
    params: DocumentListParams,
) -> Tuple[List[Document], int]:
    """
    Return paginated list of documents with optional search/filter/sort.
    Each document is loaded with its jobs.
    """
    query = select(Document).options(selectinload(Document.jobs))

    # Search by filename
    if params.search:
        query = query.where(
            Document.original_filename.ilike(f"%{params.search}%")
        )

    # Filter by job status – join to the latest job
    if params.status:
        subq = (
            select(ProcessingJob.document_id, func.max(ProcessingJob.created_at).label("max_created"))
            .group_by(ProcessingJob.document_id)
            .subquery()
        )
        latest_job = (
            select(ProcessingJob)
            .join(subq, (ProcessingJob.document_id == subq.c.document_id) &
                         (ProcessingJob.created_at == subq.c.max_created))
            .subquery()
        )
        query = query.where(
            Document.id.in_(select(latest_job.c.document_id).where(latest_job.c.status == params.status))
        )

    # Count total before pagination
    count_query = select(func.count()).select_from(query.subquery())
    total: int = (await db.execute(count_query)).scalar_one()

    # Sort
    sort_col = getattr(Document, params.sort_by, Document.created_at)
    order_fn = desc if params.sort_order == "desc" else asc
    query = query.order_by(order_fn(sort_col))

    # Paginate
    offset = (params.page - 1) * params.page_size
    query = query.offset(offset).limit(params.page_size)

    result = await db.execute(query)
    documents = list(result.scalars().all())
    return documents, total


# ─────────────────────────────────────────────────────────────────────────────
# Single document
# ─────────────────────────────────────────────────────────────────────────────

async def get_document(db: AsyncSession, doc_id: str) -> Document:
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.jobs))
        .where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


# ─────────────────────────────────────────────────────────────────────────────
# Update reviewed output
# ─────────────────────────────────────────────────────────────────────────────

async def update_reviewed_output(
    db: AsyncSession, doc_id: str, payload: ReviewUpdateRequest
) -> Document:
    doc = await get_document(db, doc_id)

    if doc.is_finalized:
        raise HTTPException(status_code=400, detail="Document is already finalized.")

    reviewed = {
        "title": payload.title or doc.extracted_title,
        "category": payload.category or doc.extracted_category,
        "summary": payload.summary or doc.extracted_summary,
        "keywords": payload.keywords or doc.extracted_keywords or [],
        "extra": payload.extra or {},
    }
    doc.reviewed_output = reviewed
    doc.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return doc


# ─────────────────────────────────────────────────────────────────────────────
# Finalize
# ─────────────────────────────────────────────────────────────────────────────

async def finalize_document(db: AsyncSession, doc_id: str) -> Document:
    doc = await get_document(db, doc_id)

    if doc.is_finalized:
        raise HTTPException(status_code=400, detail="Document is already finalized.")

    latest_job = _get_latest_job(doc)
    if not latest_job or latest_job.status != JobStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail="Document must be fully processed before finalization.",
        )

    # If no manual review was done, use extracted output as reviewed output
    if not doc.reviewed_output:
        doc.reviewed_output = {
            "title": doc.extracted_title,
            "category": doc.extracted_category,
            "summary": doc.extracted_summary,
            "keywords": doc.extracted_keywords or [],
            "extra": doc.extracted_metadata or {},
        }

    doc.is_finalized = True
    doc.finalized_at = datetime.now(timezone.utc)
    await db.flush()
    return doc


# ─────────────────────────────────────────────────────────────────────────────
# Retry failed job
# ─────────────────────────────────────────────────────────────────────────────

async def reset_job_for_retry(db: AsyncSession, doc_id: str) -> Tuple[Document, ProcessingJob]:
    doc = await get_document(db, doc_id)
    latest_job = _get_latest_job(doc)

    if not latest_job or latest_job.status != JobStatus.FAILED:
        raise HTTPException(status_code=400, detail="Only failed jobs can be retried.")

    new_job = ProcessingJob(
        document_id=doc.id,
        status=JobStatus.QUEUED,
        current_stage="queued",
        progress_pct=0,
        retry_count=latest_job.retry_count + 1,
    )
    db.add(new_job)
    await db.flush()
    return doc, new_job


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_latest_job(doc: Document) -> Optional[ProcessingJob]:
    if not doc.jobs:
        return None
    return sorted(doc.jobs, key=lambda j: j.created_at, reverse=True)[0]
