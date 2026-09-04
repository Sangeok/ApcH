"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import {
  UPLOADED_FILE_FAILURE_LABELS,
  type ProcessingStatus,
  type UploadedFileOutcome,
} from "~/fsd/entities/uploaded-file";
import { formatDateTime } from "~/fsd/shared/lib/format-date";
import { cn } from "~/fsd/shared/lib/utils";

type TimelineEventKey =
  | "pendingEnqueue"
  | "queued"
  | "processing"
  | "review"
  | "processed"
  | "failed"
  | "noCredits";

type TimelineVisualState = "completed" | "current" | "error";

interface ProcessingTimelineProps {
  status: ProcessingStatus;
  enqueueRequestedAt: Date | null;
  queuedAt: Date | null;
  processingStartedAt: Date | null;
  terminalStatusAt: Date | null;
  reviewReadyAt: Date | null;
  outcome: UploadedFileOutcome;
}

const EVENT_LABELS: Record<TimelineEventKey, string> = {
  pendingEnqueue: "Scheduling",
  queued: "Waiting",
  processing: "Processing",
  review: "Review",
  processed: "Processed",
  failed: "Failed",
  noCredits: "No Credits",
};

function getTimelineEvents({
  status,
  queuedAt,
  processingStartedAt,
}: Pick<
  ProcessingTimelineProps,
  "status" | "queuedAt" | "processingStartedAt"
>): TimelineEventKey[] {
  switch (status) {
    case "upload_pending":
      return [];
    case "pending_enqueue":
      return ["pendingEnqueue"];
    case "queued":
      return ["pendingEnqueue", "queued"];
    case "processing":
      return ["pendingEnqueue", "queued", "processing"];
    case "review_pending":
      return ["pendingEnqueue", "queued", "processing", "review"];
    case "processed":
      return ["pendingEnqueue", "queued", "processing", "processed"];
    case "no credits":
      return ["pendingEnqueue", "queued", "noCredits"];
    case "failed":
      if (processingStartedAt) {
        return ["pendingEnqueue", "queued", "processing", "failed"];
      }

      if (queuedAt) {
        return ["pendingEnqueue", "queued", "failed"];
      }

      return ["pendingEnqueue", "failed"];
  }
}

function getEventTimestamp(
  event: TimelineEventKey,
  props: ProcessingTimelineProps,
): Date | null {
  switch (event) {
    case "pendingEnqueue":
      return props.enqueueRequestedAt;
    case "queued":
      return props.queuedAt;
    case "processing":
      return props.processingStartedAt;
    case "review":
      return props.reviewReadyAt;
    case "processed":
    case "failed":
    case "noCredits":
      return props.terminalStatusAt;
  }
}

function getVisualState(
  event: TimelineEventKey,
  index: number,
  events: TimelineEventKey[],
): TimelineVisualState {
  const isLastEvent = index === events.length - 1;

  if (isLastEvent && (event === "failed" || event === "noCredits")) {
    return "error";
  }

  return isLastEvent ? "current" : "completed";
}

export default function ProcessingTimeline(props: ProcessingTimelineProps) {
  const events = getTimelineEvents(props);

  if (events.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        This upload is still hidden until processing is requested.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {events.map((event, index) => {
        const visualState = getVisualState(event, index, events);
        const timestamp = getEventTimestamp(event, props);
        // `outcome`이 이미 판별돼 있으므로 라벨 조회는 전부 함수다 —
        // 이전의 switch처럼 생산자 없는 case가 끼어들 자리가 없다.
        const failureLabel =
          event === "failed" && props.outcome.kind === "failure"
            ? UPLOADED_FILE_FAILURE_LABELS[props.outcome.failureCode]
            : null;

        return (
          <li key={event} className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border",
                visualState === "completed" &&
                  "border-primary bg-primary/10 text-primary",
                visualState === "current" &&
                  "border-primary/40 bg-background text-primary",
                visualState === "error" &&
                  "border-destructive bg-destructive/10 text-destructive",
              )}
            >
              {visualState === "completed" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : visualState === "error" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1">
              <p className="font-medium">{EVENT_LABELS[event]}</p>
              <p className="text-muted-foreground text-sm">
                {timestamp ? formatDateTime(timestamp) : "Waiting..."}
              </p>
              {failureLabel && (
                <p className="text-muted-foreground mt-1 text-sm">
                  {failureLabel}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
