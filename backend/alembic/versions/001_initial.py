"""Initial schema: documents and processing_jobs tables

Revision ID: 001_initial
Revises:
Create Date: 2026-04-13 00:00:00.000000
"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create jobstatus enum type
    op.execute("CREATE TYPE jobstatus AS ENUM ('queued', 'processing', 'completed', 'failed', 'finalized')")

    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("stored_filename", sa.String(255), nullable=False),
        sa.Column("file_type", sa.String(50), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("upload_path", sa.Text(), nullable=False),
        sa.Column("extracted_title", sa.Text(), nullable=True),
        sa.Column("extracted_category", sa.String(100), nullable=True),
        sa.Column("extracted_summary", sa.Text(), nullable=True),
        sa.Column("extracted_keywords", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("extracted_raw_text", sa.Text(), nullable=True),
        sa.Column("extracted_metadata", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("reviewed_output", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("is_finalized", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "processing_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("celery_task_id", sa.String(255), nullable=True),
        sa.Column("status", sa.Enum("queued", "processing", "completed", "failed", "finalized", name="jobstatus"),
                  nullable=False, server_default="queued"),
        sa.Column("current_stage", sa.String(100), nullable=True),
        sa.Column("progress_pct", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("ix_documents_created_at", "documents", ["created_at"])
    op.create_index("ix_processing_jobs_document_id", "processing_jobs", ["document_id"])
    op.create_index("ix_processing_jobs_status", "processing_jobs", ["status"])


def downgrade() -> None:
    op.drop_table("processing_jobs")
    op.drop_table("documents")
    op.execute("DROP TYPE jobstatus")
