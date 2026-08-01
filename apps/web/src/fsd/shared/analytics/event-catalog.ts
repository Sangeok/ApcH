export const ANALYTICS_EVENT_NAMES = [
  "landing_view",
  "marketing_page_view",
  "login_view",
  "cta_clicked",
  "login_started",
  "dashboard_viewed",
  "upload_file_selected",
  "upload_options_changed",
  "upload_started",
  "upload_prepare_failed",
  "upload_s3_completed",
  "upload_s3_failed",
  "upload_confirmed",
  "upload_confirmation_failed",
  "processing_scheduled",
  "processing_schedule_failed",
  "upload_detail_viewed",
  "clip_review_opened",
  "clip_review_selection_changed",
  "clip_review_custom_clip_added",
  "clip_review_generate_blocked",
  "clip_review_confirmed",
  "clip_viewed",
  "billing_viewed",
  "billing_cta_clicked",
  "checkout_started",
  "checkout_returned_success",
  "page_exited",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export { ANALYTICS_METADATA_KEYS_BY_EVENT } from "./lib/metadata";
