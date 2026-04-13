"""
app/api/documents.py

All HTTP route handlers for the document resource.
Routes are thin – they delegate all work to the service layer.
"""
import asyncio
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import async_redis_client, get_job_channel
from app.models.document import JobStatus
from app.schemas.document import (
    DocumentDetailOut,
    DocumentListParams,
    DocumentOut,
    FinalizeRequest,
    ReviewUpdateRequest,
)
from app.services import document_service as svc
from app.worker.tasks import process_document

router = APIRouter(prefix="/api/documents", tags=["documents"])


# ─────────────────────────────────────────────────────────────────────────────
# Upload  –  POST /api/documents/upload
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload", status_code=201)
async def upload_documents(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Accept one or more files and create a background processing job for each.
    Returns a list of created job/document records.
    """
    results = []

    for file in files:
        stored_filename, upload_path, file_type, file_size = await svc.save_upload_file(file)

        doc, job = await svc.create_document_with_job(
            db=db,
            original_filename=file.filename or stored_filename,
            stored_filename=stored_filename,
            upload_path=upload_path,
            file_type=file_type,
            file_size=file_size,
        )

        # Dispatch the Celery task AFTER the DB row is committed
        # (commit happens when db dependency exits)
        await db.flush()
        process_document.apply_async(
            args=[str(job.id), str(doc.id)],
            task_id=None,  # Celery generates a UUID
        )

        results.append({
            "document_id": str(doc.id),
            "job_id": str(job.id),
            "filename": doc.original_filename,
            "status": job.status.value,
        })

    return {"uploaded": len(results), "documents": results}


# ─────────────────────────────────────────────────────────────────────────────
# List  –  GET /api/documents
# ─────────────────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def list_documents(
    search: Optional[str] = Query(None),
    status: Optional[JobStatus] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    params = DocumentListParams(
        search=search,
        status=status,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )
    documents, total = await svc.list_documents(db, params)

    # Serialize documents and attach latest_job
    items = []
    for doc in documents:
        latest = sorted(doc.jobs, key=lambda j: j.created_at, reverse=True)[0] if doc.jobs else None
        d = DocumentOut.model_validate(doc)
        if latest:
            from app.schemas.document import JobOut
            d.latest_job = JobOut.model_validate(latest)
        items.append(d.model_dump(mode="json"))

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Detail  –  GET /api/documents/{id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{doc_id}", response_model=DocumentDetailOut)
async def get_document(doc_id: UUID, db: AsyncSession = Depends(get_db)):
    doc = await svc.get_document(db, str(doc_id))
    return DocumentDetailOut.model_validate(doc)


# ─────────────────────────────────────────────────────────────────────────────
# SSE Progress stream  –  GET /api/documents/{id}/progress
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{doc_id}/progress")
async def stream_progress(doc_id: UUID, request: Request):
    """
    Server-Sent Events endpoint.
    Subscribes to the Redis Pub/Sub channel for the latest job of this document
    and streams events to the client until the job completes/fails or the
    client disconnects.
    """
    job_id: Optional[str] = None

    async def event_stream():
        nonlocal job_id

        # Identify the latest job for this document from DB
        from sqlalchemy.ext.asyncio import AsyncSession
        from app.core.database import AsyncSessionLocal
        from sqlalchemy import select
        from app.models.document import Document, ProcessingJob
        from sqlalchemy.orm import selectinload

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Document)
                .options(selectinload(Document.jobs))
                .where(Document.id == str(doc_id))
            )
            doc = result.scalar_one_or_none()
            if not doc or not doc.jobs:
                yield _sse("error", {"message": "No job found for this document"})
                return

            latest_job = sorted(doc.jobs, key=lambda j: j.created_at, reverse=True)[0]
            job_id = str(latest_job.id)

            # If already done, emit a single event and close
            if latest_job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.FINALIZED):
                yield _sse(
                    f"job_{latest_job.status.value}",
                    {
                        "job_id": job_id,
                        "stage": latest_job.current_stage,
                        "progress": latest_job.progress_pct,
                    },
                )
                return

        # Subscribe to Redis channel and stream events
        pubsub = async_redis_client.pubsub()
        channel = get_job_channel(job_id)
        await pubsub.subscribe(channel)

        try:
            async for message in pubsub.listen():
                if await request.is_disconnected():
                    break
                if message["type"] != "message":
                    continue

                payload = json.loads(message["data"])
                yield _sse(payload["event"], payload["data"])

                # Stop streaming once the job reaches a terminal state
                if payload["event"] in ("job_completed", "job_failed"):
                    break
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def _sse(event: str, data: dict) -> str:
    """Format a Server-Sent Event string."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ─────────────────────────────────────────────────────────────────────────────
# Retry  –  POST /api/documents/{id}/retry
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{doc_id}/retry", status_code=202)
async def retry_job(doc_id: UUID, db: AsyncSession = Depends(get_db)):
    doc, new_job = await svc.reset_job_for_retry(db, str(doc_id))

    await db.flush()
    process_document.apply_async(args=[str(new_job.id), str(doc.id)])

    return {
        "message": "Job re-queued",
        "job_id": str(new_job.id),
        "retry_count": new_job.retry_count,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Update review  –  PUT /api/documents/{id}/review
# ─────────────────────────────────────────────────────────────────────────────

@router.put("/{doc_id}/review", response_model=DocumentDetailOut)
async def update_review(
    doc_id: UUID,
    payload: ReviewUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    doc = await svc.update_reviewed_output(db, str(doc_id), payload)
    return DocumentDetailOut.model_validate(doc)


# ─────────────────────────────────────────────────────────────────────────────
# Finalize  –  POST /api/documents/{id}/finalize
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{doc_id}/finalize", response_model=DocumentDetailOut)
async def finalize_document(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    doc = await svc.finalize_document(db, str(doc_id))
    return DocumentDetailOut.model_validate(doc)


# ─────────────────────────────────────────────────────────────────────────────
# Export  –  GET /api/documents/{id}/export?format=json|csv
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{doc_id}/export")
async def export_document(
    doc_id: UUID,
    format: str = Query("json", pattern="^(json|csv)$"),
    db: AsyncSession = Depends(get_db),
):
    doc = await svc.get_document(db, str(doc_id))

    if not doc.is_finalized:
        return JSONResponse(
            status_code=400,
            content={"detail": "Document must be finalized before exporting."},
        )

    output = doc.reviewed_output or {}
    export_data = {
        "document_id":     str(doc.id),
        "original_file":   doc.original_filename,
        "file_type":       doc.file_type,
        "file_size_bytes": doc.file_size,
        "title":           output.get("title") or doc.extracted_title,
        "category":        output.get("category") or doc.extracted_category,
        "summary":         output.get("summary") or doc.extracted_summary,
        "keywords":        output.get("keywords") or doc.extracted_keywords or [],
        "extra":           output.get("extra") or {},
        "finalized_at":    doc.finalized_at.isoformat() if doc.finalized_at else None,
    }

    if format == "json":
        return JSONResponse(
            content=export_data,
            headers={
                "Content-Disposition": f'attachment; filename="{doc_id}_export.json"'
            },
        )

    # CSV export
    import csv, io
    buf = io.StringIO()
    flat = {
        "document_id":     export_data["document_id"],
        "original_file":   export_data["original_file"],
        "file_type":       export_data["file_type"],
        "file_size_bytes": export_data["file_size_bytes"],
        "title":           export_data["title"],
        "category":        export_data["category"],
        "summary":         export_data["summary"],
        "keywords":        "; ".join(export_data["keywords"]),
        "finalized_at":    export_data["finalized_at"],
    }
    writer = csv.DictWriter(buf, fieldnames=list(flat.keys()))
    writer.writeheader()
    writer.writerow(flat)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{doc_id}_export.csv"'
        },
    )
