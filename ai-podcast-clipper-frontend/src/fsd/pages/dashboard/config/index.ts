export const STATUS_CONFIG = {
  pending_enqueue: { label: "Pending Queue", variant: "outline" },
  queued: { label: "Queued", variant: "outline" },
  processing: { label: "Processing", variant: "outline" },
  processed: { label: "Processed", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
  "no credits": { label: "No Credits", variant: "destructive" },
} as const;
