import type { AnalyticsEventName } from "@repo/db";

type SafeMetadataValue = string | number | boolean;

export const ANALYTICS_METADATA_KEYS_BY_EVENT = {
  landing_view: [],
  marketing_page_view: [],
  login_view: [],
  cta_clicked: ["location", "cta"],
  login_started: ["provider"],
  dashboard_viewed: [],
  upload_file_selected: ["fileType", "fileSizeMb", "language", "clipCount"],
  upload_options_changed: [
    "fileType",
    "fileSizeMb",
    "language",
    "clipCount",
    "reviewBeforeGenerate",
  ],
  // reviewBeforeGenerate는 getSafeUploadMetadata가 이미 싣고 있었으나 허용
  // 목록에 없어 조용히 버려지고 있었다. 검토 단계를 켜는 비율이 clip_review_*
  // 퍼널의 분모이므로 여기서 기록한다.
  upload_started: [
    "fileType",
    "fileSizeMb",
    "language",
    "clipCount",
    "reviewBeforeGenerate",
  ],
  upload_prepare_failed: ["stage"],
  upload_s3_completed: ["fileType", "fileSizeMb"],
  upload_s3_failed: ["stage"],
  upload_confirmed: ["uploadedFileId"],
  upload_confirmation_failed: ["uploadedFileId", "stage"],
  processing_scheduled: ["uploadedFileId", "recoveredByReconciliation"],
  processing_schedule_failed: ["uploadedFileId", "stage"],
  upload_detail_viewed: ["uploadedFileId", "status", "visibleClipsCount"],
  clip_review_opened: [
    "uploadedFileId",
    "draftCount",
    "budgetLimit",
    "credits",
  ],
  clip_review_selection_changed: ["uploadedFileId", "selectedCount", "isFull"],
  clip_review_custom_clip_added: ["uploadedFileId"],
  // reason은 getGenerateBlockReason의 kind와 동일한 값이다.
  // 이 이벤트가 "어디서 막히는가"에 직접 답한다.
  clip_review_generate_blocked: ["uploadedFileId", "reason", "selectedCount"],
  clip_review_confirmed: ["uploadedFileId", "selectedCount", "budgetLimit"],
  clip_viewed: ["clipId", "uploadedFileId"],
  card_news_requested: [
    "setId",
    "jobId",
    "revision",
    "cardCount",
    "durationMs",
    "failureCode",
    "billingStatus",
    "editedFieldCount",
  ],
  card_news_completed: [
    "setId",
    "jobId",
    "revision",
    "cardCount",
    "durationMs",
    "failureCode",
    "billingStatus",
    "editedFieldCount",
  ],
  card_news_failed: [
    "setId",
    "jobId",
    "revision",
    "cardCount",
    "durationMs",
    "failureCode",
    "billingStatus",
    "editedFieldCount",
  ],
  card_news_edited: [
    "setId",
    "jobId",
    "revision",
    "cardCount",
    "durationMs",
    "failureCode",
    "billingStatus",
    "editedFieldCount",
  ],
  card_news_regenerated: [
    "setId",
    "jobId",
    "revision",
    "cardCount",
    "durationMs",
    "failureCode",
    "billingStatus",
    "editedFieldCount",
  ],
  card_news_downloaded: [
    "setId",
    "jobId",
    "revision",
    "cardCount",
    "durationMs",
    "failureCode",
    "billingStatus",
    "editedFieldCount",
  ],
  billing_viewed: [],
  billing_cta_clicked: ["tier", "billingInterval"],
  checkout_started: ["tier", "billingInterval"],
  checkout_returned_success: [],
  settings_viewed: [],
  // source는 "settings_page"(검토 다이얼로그 진입점은 FEAT-52에서 폐지).
  // preset은 matchPresetId의 결과(프리셋 id | "custom" | "default").
  settings_defaults_saved: ["source", "preset"],
  page_exited: ["dwellTimeMs"],
} as const satisfies Record<AnalyticsEventName, readonly string[]>;

function isSafeMetadataValue(value: unknown): value is SafeMetadataValue {
  if (typeof value === "string") {
    return value.length <= 512;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return typeof value === "boolean";
}

const CARD_NEWS_FAILURE_CODES = new Set([
  "insufficient_content",
  "invalid_source",
  "source_unavailable",
  "source_head_failed",
  "generation_failed",
  "model_timeout",
  "model_unavailable",
  "invalid_provider_output",
  "schema_validation_failed",
  "text_overflow",
  "unsupported_glyph",
  "highlight_not_in_body",
  "render_failed",
  "cover_extraction_failed",
  "media_process_failed",
  "manifest_validation_failed",
  "dispatch_timeout",
  "job_timeout",
  "cpu_timeout",
  "storage_failed",
  "callback_failed",
  "write_deadline_exceeded",
  "source_too_large",
  "source_checksum_mismatch",
  "internal_error",
]);

function isSafeCardNewsValue(
  key: string,
  value: unknown,
): value is string | number {
  if (key === "setId" || key === "jobId")
    return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
  if (key === "billingStatus")
    return (
      typeof value === "string" &&
      ["held", "settled", "released", "free"].includes(value)
    );
  if (key === "failureCode")
    return typeof value === "string" && CARD_NEWS_FAILURE_CODES.has(value);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return false;
  if (key === "durationMs") return value <= 86400000;
  if (!Number.isSafeInteger(value)) return false;
  if (key === "revision") return value >= 1 && value <= 1000000000;
  if (key === "cardCount") return value >= 3 && value <= 7;
  return key === "editedFieldCount" && value <= 1000;
}

export function sanitizeAnalyticsMetadata(
  eventName: AnalyticsEventName,
  metadata: unknown,
): Record<string, SafeMetadataValue> | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  // `satisfies`가 계약(@repo/db의 AnalyticsEventName)과 이 맵을 묶으므로
  // 이벤트를 개명하면 캐스트 대신 컴파일 오류가 난다.
  const allowedKeys = ANALYTICS_METADATA_KEYS_BY_EVENT[eventName];

  if (allowedKeys.length === 0) {
    return undefined;
  }

  const input = metadata as Record<string, unknown>;
  const output: Record<string, SafeMetadataValue> = {};

  for (const key of allowedKeys) {
    const value = input[key];

    if (eventName.startsWith("card_news_")) {
      if (isSafeCardNewsValue(key, value)) output[key] = value;
    } else if (isSafeMetadataValue(value)) {
      output[key] = value;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}
