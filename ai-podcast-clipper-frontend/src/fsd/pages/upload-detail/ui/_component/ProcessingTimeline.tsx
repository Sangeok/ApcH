"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { ProcessingStatus } from "~/fsd/entities/uploaded-file/model/processing-status";
import { cn } from "~/fsd/shared/lib/utils";

type TimelineEventKey =
  | "pendingEnqueue"
  | "queued"
  | "processing"
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
  failureCode: string | null;
}

const EVENT_LABELS: Record<TimelineEventKey, string> = {
  pendingEnqueue: "Pending Queue",
  queued: "Queued",
  processing: "Processing",
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
    case "processed":
    case "failed":
    case "noCredits":
      return props.terminalStatusAt;
  }
}

function getFailureLabel(failureCode: string | null): string | null {
  switch (failureCode) {
    case "dispatch_failed":
      return "Processing could not start";
    case "dispatch_timeout":
      return "Processing request timed out";
    case "dispatch_dead_letter":
      return "Dispatch retries exhausted";
    case "callback_timeout":
      return "Processing result timed out";
    case "missing_source_object":
      return "Original upload is missing";
    case "worker_timeout":
      return "Worker timed out";
    case "queued_worker_not_started":
      return "Worker did not start";
    case "backend_failed":
      return "Backend processing failed";
    case "no_clips_generated":
      return "No clips were generated";
    case "incomplete_clips_generated":
      return "Only some requested clips were generated";
    default:
      return null;
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
        const failureLabel =
          event === "failed" ? getFailureLabel(props.failureCode) : null;

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
                {timestamp ? timestamp.toLocaleString() : "Waiting..."}
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
