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
  // "Review first"로 업로드한 경우에만 밟는 경로다(reviewBeforeGenerate는
  // @default(false)). activation에 섞으면 auto 모드 사용자가 첫 검토 스텝에서
  // 걸려 그 뒤 clip_viewed가 영구히 0이 된다 — buildFunnelReportFromEvents가
  // 엄격 순차 매처이기 때문(reporting.ts).
  review: ["clip_review_opened", "clip_review_confirmed", "clip_viewed"],
} as const satisfies Record<FunnelId, readonly AnalyticsEventName[]>;

export const FUNNEL_LABELS = {
  acquisition: "Acquisition",
  activation: "Upload Activation",
  billing: "Billing",
  review: "Clip Review",
} as const satisfies Record<FunnelId, string>;
