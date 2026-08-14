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
  // preset은 matchPresetId의 결과다(프리셋 id | "custom" | "default").
  // 프리셋이 실제로 쓰이는지, 아니면 손으로 만지는지를 이 값이 답한다.
  clip_review_caption_style_edited: ["uploadedFileId", "preset", "appliedToAll"],
  // reason은 getGenerateBlockReason의 kind와 동일한 값이다.
  // 이 이벤트가 "어디서 막히는가"에 직접 답한다.
  clip_review_generate_blocked: ["uploadedFileId", "reason", "selectedCount"],
  clip_review_confirmed: ["uploadedFileId", "selectedCount", "budgetLimit"],
  clip_viewed: ["clipId", "uploadedFileId"],
  billing_viewed: [],
  billing_cta_clicked: ["tier", "billingInterval"],
  checkout_started: ["tier", "billingInterval"],
  checkout_returned_success: [],
  page_exited: ["dwellTimeMs"],
} as const;

function isSafeMetadataValue(value: unknown): value is SafeMetadataValue {
  if (typeof value === "string") {
    return value.length <= 512;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return typeof value === "boolean";
}

export function sanitizeAnalyticsMetadata(
  eventName: string,
  metadata: unknown,
): Record<string, SafeMetadataValue> | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const allowedKeys =
    ANALYTICS_METADATA_KEYS_BY_EVENT[
      eventName as keyof typeof ANALYTICS_METADATA_KEYS_BY_EVENT
    ] ?? [];

  if (allowedKeys.length === 0) {
    return undefined;
  }

  const input = metadata as Record<string, unknown>;
  const output: Record<string, SafeMetadataValue> = {};

  for (const key of allowedKeys) {
    const value = input[key];

    if (isSafeMetadataValue(value)) {
      output[key] = value;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}
