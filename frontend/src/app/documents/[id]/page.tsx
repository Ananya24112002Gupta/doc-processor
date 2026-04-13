"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, CheckCircle, RefreshCcw, Download } from "lucide-react";
import Link from "next/link";
import {
  getDocument,
  updateReview,
  finalizeDocument,
  retryJob,
  getExportUrl,
} from "@/lib/api";
import { useProgressStream } from "@/hooks/useProgressStream";
import type { DocumentDetail, ReviewUpdatePayload, JobStatus } from "@/types";
import { formatBytes, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import StageTimeline from "@/components/StageTimeline";
import ProgressBar from "@/components/ProgressBar";
import { useToast } from "@/components/Toast";

export default function DocumentDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { toast } = useToast();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // SSE Real-time progress hook
  const progressState = useProgressStream(id);

  // Form states
  const [editMode, setEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState("");
  const [keywordsStr, setKeywordsStr] = useState("");

  const fetchDoc = useCallback(async () => {
    try {
      const data = await getDocument(id);
      setDoc(data);
      
      // Init form states
      const out = data.reviewed_output;
      setTitle(out?.title ?? data.extracted_title ?? "");
      setCategory(out?.category ?? data.extracted_category ?? "");
      setSummary(out?.summary ?? data.extracted_summary ?? "");
      const kw = out?.keywords ?? data.extracted_keywords ?? [];
      setKeywordsStr(kw.join(", "));
    } catch (err) {
      toast("Failed to load document.", "error");
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }, [id, router, toast]);

  // Initial load
  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  // If SSE says job is done/failed, refetch to get final data from DB
  useEffect(() => {
    if (progressState.isTerminal && !loading) {
      fetchDoc();
    }
  }, [progressState.isTerminal, fetchDoc, loading]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const kws = keywordsStr.split(",").map(k => k.trim()).filter(Boolean);
      
      const payload: ReviewUpdatePayload = {
        title,
        category,
        summary,
        keywords: kws,
      };
      
      const updated = await updateReview(id, payload);
      setDoc(updated);
      setEditMode(false);
      toast("Changes saved successfully.", "success");
    } catch (err) {
      toast("Failed to save changes.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!confirm("Are you sure you want to finalize this document? Once finalized, it cannot be edited.")) return;
    
    try {
      setIsFinalizing(true);
      const updated = await finalizeDocument(id);
      setDoc(updated);
      setEditMode(false);
      toast("Document finalized successfully.", "success");
    } catch (err) {
      toast("Failed to finalize.", "error");
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleRetry = async () => {
    try {
      await retryJob(id);
      toast("Job queued for retry.", "info");
      // Refetch after a small delay to allow backend to persist job creation
      setTimeout(fetchDoc, 500);
    } catch (err) {
      toast("Failed to retry job.", "error");
    }
  };

  if (loading || !doc) {
    return <div className="flex justify-center items-center" style={{ height: "50vh" }}><div className="spinner" /></div>;
  }

  // Derive latest job state. Prefer SSE if available and active, else use DB state
  const latestJob = [...doc.jobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  
  let currentStage = latestJob?.current_stage ?? null;
  let currentProgress = latestJob?.progress_pct ?? 0;
  let jobStatus: string = doc.is_finalized ? "finalized" : (latestJob?.status || "queued");

  // Override with live SSE data if it's not a terminal state from DB already
  if (jobStatus !== "completed" && jobStatus !== "failed" && jobStatus !== "finalized") {
    if (progressState.event) {
      currentStage = progressState.stage;
      currentProgress = progressState.progress;
      if (progressState.event === "job_failed") jobStatus = "failed";
      else if (progressState.event === "job_completed") jobStatus = "completed";
      else jobStatus = "processing";
    }
  }

  const isCompleted = jobStatus === "completed";
  const isFinalized = jobStatus === "finalized";
  const isFailed = jobStatus === "failed";
  const isProcessing = jobStatus === "processing" || jobStatus === "queued";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Link href="/dashboard" className="btn btn-secondary btn-sm mb-4" style={{ display: "inline-flex" }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div className="page-header flex justify-between items-start flex-wrap gap-4">
        <div>
          <h2>{doc.original_filename}</h2>
          <p>Uploaded {formatDate(doc.created_at)}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={jobStatus} />
          {isFailed && (
            <button className="btn btn-primary" onClick={handleRetry}>
              <RefreshCcw size={16} /> Retry Job
            </button>
          )}
          {isFinalized && (
             <>
               <a href={getExportUrl(id, "json")} className="btn btn-secondary flex items-center gap-2" download>
                 <Download size={16} /> JSON
               </a>
               <a href={getExportUrl(id, "csv")} className="btn btn-secondary flex items-center gap-2" download>
                 <Download size={16} /> CSV
               </a>
             </>
          )}
        </div>
      </div>

      <div className="detail-grid">
        {/* Left Column: Data Review */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {isProcessing ? (
             <div className="card empty-state" style={{ padding: "64px 32px" }}>
               <div className="spinner mx-auto mb-4" />
               <h3>Extracting Data</h3>
               <p>Document is currently being processed. Please wait...</p>
             </div>
          ) : isFailed ? (
             <div className="card" style={{ borderLeft: "4px solid var(--red)" }}>
               <h3 style={{ color: "var(--red)", marginBottom: 8 }}>Processing Failed</h3>
               <p className="font-mono text-sm">{latestJob?.error_message || "Unknown error occurred during processing."}</p>
             </div>
          ) : (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>Extracted Data Review</h3>
                {!isFinalized && (
                  <div className="flex gap-2">
                    {editMode ? (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(false)}>
                          Cancel
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={isSaving}>
                          {isSaving ? "Saving..." : <><Save size={14} /> Save</>}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(true)}>
                          Edit Fields
                        </button>
                        <button className="btn btn-success btn-sm" onClick={handleFinalize} disabled={isFinalizing}>
                          {isFinalizing ? "Finalizing..." : <><CheckCircle size={14} /> Finalize</>}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {editMode ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label className="input-label">Title</label>
                    <input type="text" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Category</label>
                    <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="General">General</option>
                      <option value="Technical">Technical</option>
                      <option value="Finance">Finance</option>
                      <option value="Legal">Legal</option>
                      <option value="Medical">Medical</option>
                      <option value="Research">Research</option>
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Summary</label>
                    <textarea className="input" value={summary} onChange={(e) => setSummary(e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Keywords (comma separated)</label>
                    <input type="text" className="input" value={keywordsStr} onChange={(e) => setKeywordsStr(e.target.value)} />
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="extracted-field">
                    <div className="extracted-field-label">Title</div>
                    <div className="extracted-field-value">{title || "—"}</div>
                  </div>
                  <div className="extracted-field">
                    <div className="extracted-field-label">Category</div>
                    <div className="extracted-field-value">{category || "—"}</div>
                  </div>
                  <div className="extracted-field">
                    <div className="extracted-field-label">Summary</div>
                    <div className="extracted-field-value" style={{ whiteSpace: "pre-wrap" }}>
                      {summary || "—"}
                    </div>
                  </div>
                  <div className="extracted-field">
                    <div className="extracted-field-label">Keywords</div>
                    <div className="keywords-list mt-2">
                       {keywordsStr ? keywordsStr.split(",").map(k => k.trim()).map(k => (
                         <span key={k} className="keyword-tag">{k}</span>
                       )) : "—"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {doc.extracted_raw_text && (
            <div className="card">
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Raw Text Excerpt</h3>
              <div 
                style={{ 
                  maxHeight: 400, overflowY: "auto", 
                  background: "var(--bg-elevated)", padding: 16, 
                  borderRadius: "var(--radius-sm)", fontSize: 13,
                  whiteSpace: "pre-wrap", color: "var(--text-secondary)"
                }}
              >
                {doc.extracted_raw_text}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Metadata & Processing Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Progress Card */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
              Processing Status
            </h3>
            
            <div className="mb-4">
               <ProgressBar pct={currentProgress} status={jobStatus} />
            </div>

            <StageTimeline currentStage={currentStage} status={jobStatus} />
            
            {progressState.isConnected && (
               <div className="mt-4 text-xs flex gap-2 items-center text-accent">
                 <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                 Live Connection Active
               </div>
            )}
          </div>

          {/* Document Meta Card */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
              File Details
            </h3>
            <div className="job-meta">
              <div className="job-meta-row">
                <span className="job-meta-label">Type</span>
                <span className="job-meta-value uppercase">{doc.file_type}</span>
              </div>
              <div className="job-meta-row">
                <span className="job-meta-label">Size</span>
                <span className="job-meta-value">{formatBytes(doc.file_size)}</span>
              </div>
              <div className="job-meta-row">
                <span className="job-meta-label">Upload Date</span>
                <span className="job-meta-value">{formatDate(doc.created_at)}</span>
              </div>
              {doc.finalized_at && (
                <div className="job-meta-row" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                   <span className="job-meta-label text-purple">Finalized On</span>
                   <span className="job-meta-value">{formatDate(doc.finalized_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
