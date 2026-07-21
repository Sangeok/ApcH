import type { ComponentProps } from "react";
import type { ProcessingStatus } from "../model/processing-status";
import { Badge } from "~/fsd/shared/ui/atoms/badge";

type StatusBadgeConfig = {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
};

const STATUS_BADGE_CONFIG = {
  upload_pending: { label: "Upload Pending", variant: "outline" },
  pending_enqueue: { label: "Scheduling", variant: "outline" },
  queued: { label: "Waiting", variant: "outline" },
  processing: { label: "Processing", variant: "outline" },
  review_pending: { label: "Review Needed", variant: "default" },
  processed: { label: "Processed", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
  "no credits": { label: "No Credits", variant: "destructive" },
} as const satisfies Record<ProcessingStatus, StatusBadgeConfig>;

interface UploadedFileStatusBadgeProps
  extends Omit<ComponentProps<typeof Badge>, "children"> {
  status: ProcessingStatus;
}

export function UploadedFileStatusBadge({
  status,
  ...badgeProps
}: UploadedFileStatusBadgeProps) {
  const config = STATUS_BADGE_CONFIG[status];

  return (
    <Badge variant={config.variant} {...badgeProps}>
      {config.label}
    </Badge>
  );
}
