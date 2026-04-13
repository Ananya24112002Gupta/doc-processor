"use client";
// src/components/ProgressBar.tsx

interface Props {
  pct: number;
  status?: string;
}

export default function ProgressBar({ pct, status }: Props) {
  const fillClass =
    status === "completed" || status === "finalized"
      ? "complete"
      : status === "failed"
      ? "failed"
      : "";

  return (
    <div style={{ width: "100%" }}>
      <div className="progress-bar-wrap">
        <div
          className={`progress-bar-fill ${fillClass}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 4,
          fontSize: 11,
          color: "var(--text-muted)",
          fontWeight: 600,
        }}
      >
        {pct}%
      </div>
    </div>
  );
}
