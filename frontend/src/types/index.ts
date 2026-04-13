// src/types/index.ts
// Central TypeScript type definitions mirroring backend Pydantic schemas

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "finalized";

export interface Job {
  id: string;
  document_id: string;
  celery_task_id: string | null;
  status: JobStatus;
  current_stage: string | null;
  progress_pct: number;
  error_message: string | null;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  is_finalized: boolean;
  created_at: string;
  updated_at: string;
  latest_job?: Job | null;
}

export interface DocumentDetail extends Document {
  extracted_title: string | null;
  extracted_category: string | null;
  extracted_summary: string | null;
  extracted_keywords: string[] | null;
  extracted_raw_text: string | null;
  extracted_metadata: Record<string, unknown> | null;
  reviewed_output: ReviewedOutput | null;
  finalized_at: string | null;
  jobs: Job[];
}

export interface ReviewedOutput {
  title: string | null;
  category: string | null;
  summary: string | null;
  keywords: string[];
  extra: Record<string, unknown>;
}

export interface ReviewUpdatePayload {
  title?: string;
  category?: string;
  summary?: string;
  keywords?: string[];
  extra?: Record<string, unknown>;
}

export interface UploadResponse {
  uploaded: number;
  documents: {
    document_id: string;
    job_id: string;
    filename: string;
    status: JobStatus;
  }[];
}

export interface DocumentListResponse {
  total: number;
  page: number;
  page_size: number;
  items: Document[];
}

export interface ProgressEvent {
  event: string;
  data: {
    job_id: string;
    stage?: string;
    progress?: number;
    reason?: string;
    [key: string]: unknown;
  };
}
