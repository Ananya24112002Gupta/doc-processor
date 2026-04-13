"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, RefreshCw, FileText } from "lucide-react";
import { listDocuments } from "@/lib/api";
import type { Document, DocumentListResponse, JobStatus } from "@/types";
import { formatBytes, formatRelative } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import ProgressBar from "@/components/ProgressBar";
import { useToast } from "@/components/Toast";

export default function DashboardPage() {
  const [data, setData] = useState<DocumentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<JobStatus | "">("");
  const { toast } = useToast();

  const fetchDocs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listDocuments({ search, status: status || undefined });
      setData(res);
    } catch (err) {
      toast("Failed to load documents", "error");
    } finally {
      setLoading(false);
    }
  }, [search, status, toast]);

  useEffect(() => {
    fetchDocs();
    const interval = setInterval(fetchDocs, 10000); // Poll every 10s for slow jobs if SSE disconnected
    return () => clearInterval(interval);
  }, [fetchDocs]);

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h2>Dashboard</h2>
          <p>Overview of all uploaded documents and their processing status</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchDocs} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spinner" : ""} />
          Refresh
        </button>
      </div>

      <div className="filters">
        <div style={{ position: "relative", flex: 1, minWidth: 250, maxWidth: 400 }}>
          <Search size={18} style={{ position: "absolute", left: 12, top: 11, color: "var(--text-muted)" }} />
          <input
            type="text"
            className="input"
            placeholder="Search documents by filename..."
            style={{ paddingLeft: 40 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchDocs()}
          />
        </div>
        <select
          className="input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as JobStatus | "");
            // Trigger immediately instead of waiting for enter
          }}
        >
          <option value="">All Statuses</option>
          <option value="queued">Queued</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="finalized">Finalized</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading && !data ? (
          <div className="flex justify-center items-center" style={{ height: 300 }}>
            <div className="spinner" />
          </div>
        ) : data?.items.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} className="empty-state-icon" />
            <h3>No documents found</h3>
            <p>Upload some documents or change your filters to see results here.</p>
            <Link href="/upload" className="btn btn-primary">
              Upload Documents
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Size / Type</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((doc) => {
                  const job = doc.latest_job;
                  const st = doc.is_finalized ? "finalized" : (job?.status || "queued");
                  return (
                    <tr key={doc.id}>
                      <td>
                        <div className="font-mono truncate" style={{ maxWidth: 200 }} title={doc.original_filename}>
                          {doc.original_filename}
                        </div>
                      </td>
                      <td>
                        <span className="text-muted text-sm">{formatBytes(doc.file_size)} · {doc.file_type.toUpperCase()}</span>
                      </td>
                      <td>
                        <span className="text-sm" title={doc.created_at}>{formatRelative(doc.created_at)}</span>
                      </td>
                      <td>
                        <StatusBadge status={st} />
                      </td>
                      <td style={{ width: 140 }}>
                        <ProgressBar pct={job?.progress_pct || 0} status={st} />
                        <div className="text-sm text-muted" style={{ marginTop: 2, fontSize: 11 }}>
                           {job?.current_stage || "Queued"}
                        </div>
                      </td>
                      <td>
                        <Link href={`/documents/${doc.id}`} className="btn btn-secondary btn-sm">
                          {doc.is_finalized ? "View" : job?.status === "completed" ? "Review" : "Details"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Basic Pagination Header */}
      {data && data.total > data.page_size && (
        <div className="flex justify-between items-center text-sm text-muted mt-4">
            <span>Showing {data.items.length} of {data.total}</span>
            <span>Pagination controls would go here</span>
        </div>
      )}
    </div>
  );
}
