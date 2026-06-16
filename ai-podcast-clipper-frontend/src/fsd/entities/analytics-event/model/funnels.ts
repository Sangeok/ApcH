import type { AnalyticsEventName } from "~/fsd/shared/analytics/event-catalog";
import type { FunnelId } from "./types";

export const ANALYTICS_FUNNELS = {
  acquisition: [
    "landing_view",
    "cta_clicked",
    "login_view",
    "login_started",
    "dashboard_viewed",
  ],
  activation: [
    "dashboard_viewed",
    "upload_file_selected",
    "upload_started",
    "upload_s3_completed",
    "processing_scheduled",
    "clip_viewed",
  ],
  billing: [
    "billing_viewed",
    "billing_cta_clicked",
    "checkout_started",
    "checkout_returned_success",
  ],
} as const satisfies Record<FunnelId, readonly AnalyticsEventName[]>;

export const FUNNEL_LABELS = {
  acquisition: "Acquisition",
  activation: "Upload Activation",
  billing: "Billing",
} as const satisfies Record<FunnelId, string>;
