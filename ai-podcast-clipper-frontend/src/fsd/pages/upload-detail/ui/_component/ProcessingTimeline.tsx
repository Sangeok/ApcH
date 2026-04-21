"use client";

import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import type { ProcessingStatus } from "~/fsd/entities/uploaded-file";
import { cn } from "~/fsd/shared/lib/utils";

type StepKey = "queued" | "processing" | "processed";

interface ProcessingTimelineProps {
  status: ProcessingStatus;
  createdAt: Date;
  processingStartedAt: Date | null;
  updatedAt: Date;
}

const STEPS: { key: StepKey; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "processing", label: "Processing" },
  { key: "processed", label: "Processed" },
];

function isStepCompleted(step: StepKey, status: ProcessingStatus): boolean {
  switch (status) {
    case "queued":
      return step === "queued";
    case "processing":
      return step === "queued" || step === "processing";
    case "processed":
      return true;
    case "failed":
      return step === "queued" || step === "processing";
    case "no credits":
      return step === "queued";
  }
}

export default function ProcessingTimeline({
  status,
  createdAt,
  processingStartedAt,
  updatedAt,
}: ProcessingTimelineProps) {
  return (
    <ol className="space-y-4">
      {STEPS.map(({ key, label }) => {
        const completed = isStepCompleted(key, status);
        const timestamp =
          key === "queued"
            ? createdAt
            : key === "processing"
              ? (processingStartedAt ?? updatedAt)
              : updatedAt;

        return (
          <li key={key} className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border",
                completed ? "border-primary bg-primary/10" : "border-muted",
              )}
            >
              {completed ? (
                <CheckCircle2 className="text-primary h-4 w-4" />
              ) : (
                <Clock className="text-muted-foreground h-4 w-4" />
              )}
            </div>
            <div className="flex-1">
              <p className="font-medium">{label}</p>
              <p className="text-muted-foreground text-sm">
                {timestamp.toLocaleString()}
              </p>
              {key === "processing" && status === "failed" && (
                <p className="text-destructive mt-1 flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  Failed
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
