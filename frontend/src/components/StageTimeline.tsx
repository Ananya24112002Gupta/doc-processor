"use client";
// src/components/StageTimeline.tsx
// Shows the ordered processing stages with visual indicators

interface Props {
  currentStage: string | null;
  status: string;
}

const STAGES = [
  { key: "queued",                     label: "Queued" },
  { key: "job_started",                label: "Job Started" },
  { key: "document_parsing_started",   label: "Parsing Started" },
  { key: "document_parsing_completed", label: "Parsing Completed" },
  { key: "field_extraction_started",   label: "Extraction Started" },
  { key: "field_extraction_completed", label: "Extraction Completed" },
  { key: "job_completed",              label: "Completed" },
];

export default function StageTimeline({ currentStage, status }: Props) {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);
  const isFailed = status === "failed";

  return (
    <div className="stage-list">
      {STAGES.map((stage, idx) => {
        let dotClass = "";
        let labelClass = "";

        if (isFailed && idx === currentIdx) {
          dotClass = "failed";
          labelClass = "";
        } else if (idx < currentIdx || status === "completed" || status === "finalized") {
          dotClass = "done";
          labelClass = "done";
        } else if (idx === currentIdx) {
          dotClass = "active";
          labelClass = "active";
        }

        return (
          <div key={stage.key} className="stage-item">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0,
              }}
            >
              <div className={`stage-dot ${dotClass}`} />
              {idx < STAGES.length - 1 && (
                <div
                  style={{
                    width: 1,
                    flex: 1,
                    minHeight: 16,
                    background:
                      idx < currentIdx ? "var(--green)" : "var(--border)",
                    margin: "1px 0",
                  }}
                />
              )}
            </div>
            <span className={`stage-label ${labelClass}`}>{stage.label}</span>
          </div>
        );
      })}

      {isFailed && (
        <div className="stage-item">
          <div className="stage-dot failed" />
          <span className="stage-label" style={{ color: "var(--red)" }}>
            Failed
          </span>
        </div>
      )}
    </div>
  );
}
