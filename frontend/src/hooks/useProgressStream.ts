// src/hooks/useProgressStream.ts
// Subscribes to the Server-Sent Events endpoint for a specific document/job
// and returns the latest progress state.

import { useState, useEffect, useRef } from "react";
import { getProgressUrl } from "@/lib/api";
import type { ProgressEvent } from "@/types";

export interface ProgressState {
  event: string | null;
  stage: string | null;
  progress: number;
  isConnected: boolean;
  isTerminal: boolean;  // true when job_completed or job_failed
}

const TERMINAL_EVENTS = new Set(["job_completed", "job_failed"]);

export function useProgressStream(documentId: string | null): ProgressState {
  const [state, setState] = useState<ProgressState>({
    event: null,
    stage: null,
    progress: 0,
    isConnected: false,
    isTerminal: false,
  });

  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!documentId) return;

    // Clean up existing connection if any
    if (esRef.current) {
      esRef.current.close();
    }

    const url = getProgressUrl(documentId);
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setState((prev) => ({ ...prev, isConnected: true }));
    };

    es.onerror = () => {
      setState((prev) => ({ ...prev, isConnected: false }));
      es.close();
    };

    // Listen for all named events the backend publishes
    const events = [
      "job_started",
      "document_parsing_started",
      "document_parsing_completed",
      "field_extraction_started",
      "field_extraction_completed",
      "job_completed",
      "job_failed",
      "error",
    ];

    events.forEach((eventName) => {
      es.addEventListener(eventName, (e: MessageEvent) => {
        const payload: ProgressEvent["data"] = JSON.parse(e.data);
        const isTerminal = TERMINAL_EVENTS.has(eventName);

        setState({
          event: eventName,
          stage: payload.stage || eventName,
          progress: typeof payload.progress === "number" ? payload.progress : 0,
          isConnected: !isTerminal,
          isTerminal,
        });

        if (isTerminal) {
          es.close();
        }
      });
    });

    return () => {
      es.close();
    };
  }, [documentId]);

  return state;
}
