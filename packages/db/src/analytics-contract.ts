// web(쓰기)과 admin(읽기)이 공유하는 analytics 계약.
//
// 이 파일이 한 곳에 있어야 하는 이유: 아래 ANALYTICS_FUNNELS의
// `satisfies Record<FunnelId, readonly AnalyticsEventName[]>` 절이
// "퍼널 단계는 실제 존재하는 이벤트 이름이어야 한다"를 컴파일 타임에 강제한다.
// 이 파일을 복사해 두 벌로 만들면 한쪽에서 이벤트를 rename해도 다른 쪽은
// 그대로 통과하고, 대시보드가 에러 없이 0을 보여준다.

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
  "clip_review_caption_style_edited",
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

export type AnalyticsDateRangeKey = "7d" | "30d" | "90d";
export type FunnelId = "acquisition" | "activation" | "billing" | "review";

export type AnalyticsDateRangeInput = {
  range: AnalyticsDateRangeKey;
};

export type RecordAnalyticsEventInput = {
  name: AnalyticsEventName;
  anonymousId: string;
  sessionId: string;
  path: string;
  referrer?: string | null;
  metadata?: Record<string, unknown>;
  userId?: string | null;
};

export type FunnelReportInput = AnalyticsDateRangeInput & {
  funnel: FunnelId;
};

export type FunnelStepReport = {
  step: AnalyticsEventName;
  visitors: number;
  conversionFromPrevious: number | null;
  dropOffFromPrevious: number | null;
  dropOffRateFromPrevious: number | null;
};

export type DropOffReportRow = {
  eventName: AnalyticsEventName;
  path: string;
  sessions: number;
  share: number;
};

export type RecentFailureEventRow = {
  eventName: AnalyticsEventName;
  path: string;
  count: number;
  lastSeenAt: Date;
};

export type AnalyticsOverview = {
  uniqueVisitors: number;
  loggedInUsers: number;
  totalEvents: number;
  dashboardConversionRate: number | null;
};

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
