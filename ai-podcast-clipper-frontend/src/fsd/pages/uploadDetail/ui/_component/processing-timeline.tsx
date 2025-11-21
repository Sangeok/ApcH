// src/app/dashboard/uploads/[uploadedFileId]/processing-timeline.tsx
"use client";

import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "~/fsd/shared/lib/utils";

interface TimelineLog {
  id: string;
  label: string;
  createdAt: Date;
  description?: string | null;
  status: "queued" | "processing" | "processed" | "failed";
}

interface ProcessingTimelineProps {
  status: "queued" | "processing" | "processed" | "failed";
  createdAt: Date;
  updatedAt: Date;
  logs?: TimelineLog[];
}

const statusOrder: ProcessingTimelineProps["status"][] = [
  "queued",
  "processing",
  "processed",
];

const statusLabel: Record<ProcessingTimelineProps["status"], string> = {
  queued: "Queued",
  processing: "Processing",
  processed: "Processed",
  failed: "Failed",
};

export default function ProcessingTimeline({
  status,
  createdAt,
  updatedAt,
}: ProcessingTimelineProps) {
  return (
    <div className="space-y-6">
      <ol className="space-y-4">
        {statusOrder.map((step) => {
          const isCompleted =
            status === "failed"
              ? step === "queued" || step === "processing"
              : statusOrder.indexOf(step) <= statusOrder.indexOf(status);
          const isCurrent = status === step;

          return (
            <li key={step} className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border",
                  isCompleted ? "border-primary bg-primary/10" : "border-muted",
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="text-primary h-4 w-4" />
                ) : (
                  <Clock className="text-muted-foreground h-4 w-4" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">{statusLabel[step]}</p>
                <p className="text-muted-foreground text-sm">
                  {step === "queued"
                    ? new Date(createdAt).toLocaleString()
                    : new Date(updatedAt).toLocaleString()}
                </p>
                {isCurrent && status === "failed" && (
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
    </div>
  );
}
