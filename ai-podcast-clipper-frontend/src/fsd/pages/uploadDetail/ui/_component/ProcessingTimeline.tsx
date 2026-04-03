"use client";

import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "~/fsd/shared/lib/utils";
import type { ProcessingStatus } from "../../model/type";

interface ProcessingTimelineProps {
  status: ProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}

const statusOrder: ProcessingStatus[] = [
  "queued",
  "processing",
  "processed",
];

const statusLabel: Record<ProcessingStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  processed: "Processed",
  failed: "Failed",
  "no credits": "No Credits",
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
