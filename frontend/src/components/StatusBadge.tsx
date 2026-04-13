"use client";
// src/components/StatusBadge.tsx
import { statusLabel } from "@/lib/utils";
import type { JobStatus } from "@/types";

interface Props {
  status: JobStatus | string;
}

const dotColors: Record<string, string> = {
  queued:     "var(--yellow)",
  processing: "var(--accent)",
  completed:  "var(--green)",
  failed:     "var(--red)",
  finalized:  "var(--purple)",
};

export default function StatusBadge({ status }: Props) {
  return (
    <span className={`badge badge-${status}`}>
      <span
        className="badge-dot"
        style={{
          background: dotColors[status] ?? "var(--text-muted)",
          // Pulsing animation for active processing
          animation: status === "processing" ? "pulse 1.5s ease-in-out infinite" : undefined,
        }}
      />
      {statusLabel(status)}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </span>
  );
}
