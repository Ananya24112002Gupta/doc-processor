// src/lib/api.ts
// Axios-based API client. All backend calls go through this file.

import axios from "axios";
import type {
  DocumentListResponse,
  DocumentDetail,
  UploadResponse,
  ReviewUpdatePayload,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// ─── Documents ───────────────────────────────────────────────────────────────

export interface ListParams {
  search?: string;
  status?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export async function uploadDocuments(files: File[]): Promise<UploadResponse> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const { data } = await api.post<UploadResponse>("/api/documents/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listDocuments(params: ListParams = {}): Promise<DocumentListResponse> {
  const { data } = await api.get<DocumentListResponse>("/api/documents", { params });
  return data;
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  const { data } = await api.get<DocumentDetail>(`/api/documents/${id}`);
  return data;
}

export async function retryJob(id: string): Promise<void> {
  await api.post(`/api/documents/${id}/retry`);
}

export async function updateReview(id: string, payload: ReviewUpdatePayload): Promise<DocumentDetail> {
  const { data } = await api.put<DocumentDetail>(`/api/documents/${id}/review`, payload);
  return data;
}

export async function finalizeDocument(id: string): Promise<DocumentDetail> {
  const { data } = await api.post<DocumentDetail>(`/api/documents/${id}/finalize`);
  return data;
}

export function getExportUrl(id: string, format: "json" | "csv"): string {
  return `${BASE_URL}/api/documents/${id}/export?format=${format}`;
}

// SSE progress stream URL (used directly with EventSource in browser)
export function getProgressUrl(id: string): string {
  return `${BASE_URL}/api/documents/${id}/progress`;
}
