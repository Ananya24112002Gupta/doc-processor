"use client";
import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, File, X, CheckCircle } from "lucide-react";
import { uploadDocuments } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { useToast } from "@/components/Toast";

export default function UploadPage() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles: File[]) => {
    // Check sizes
    const invalid = newFiles.filter(f => f.size > 50 * 1024 * 1024);
    if (invalid.length > 0) {
      toast(`${invalid.length} file(s) exceed the 50MB limit.`, "error");
    }
    
    const valid = newFiles.filter(f => f.size <= 50 * 1024 * 1024);
    setFiles(prev => [...prev, ...valid]);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (files.length === 0) return;
    
    try {
      setIsUploading(true);
      await uploadDocuments(files);
      toast(`Successfully started processing ${files.length} document(s).`, "success");
      router.push("/dashboard");
    } catch (err) {
      toast("Failed to upload documents. Please try again.", "error");
      setIsUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div className="page-header">
        <h2>Upload Documents</h2>
        <p>Supported formats: PDF, TXT, DOCX, CSV, JSON, MD, HTML (Max 50MB)</p>
      </div>

      <div className="card">
        <div
          className={`dropzone ${isDragging ? "dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud size={48} className="dropzone-icon mx-auto" />
          <h3>Drag & drop files here</h3>
          <p>or click to browse from your computer</p>
          <input
            type="file"
            multiple
            className="hidden"
            style={{ display: "none" }}
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".pdf,.txt,.docx,.doc,.csv,.json,.md,.html"
          />
        </div>

        {files.length > 0 && (
          <>
            <div className="divider" />
            <div className="flex justify-between items-center mb-4">
              <h4 style={{ fontWeight: 600 }}>Queued for upload ({files.length})</h4>
              <button className="btn btn-primary" onClick={submit} disabled={isUploading}>
                {isUploading ? <><div className="spinner"/> Uploading...</> : <><CheckCircle size={16}/> Start Processing</>}
              </button>
            </div>
            
            <div className="file-list">
              {files.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="file-item">
                  <File size={18} className="file-item-icon" />
                  <div className="file-item-info">
                    <div className="file-item-name">{file.name}</div>
                    <div className="file-item-size">{formatBytes(file.size)}</div>
                  </div>
                  <button className="btn-icon file-item-remove" onClick={() => removeFile(idx)} disabled={isUploading}>
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
