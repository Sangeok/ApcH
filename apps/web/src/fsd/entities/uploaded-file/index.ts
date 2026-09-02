/**
 * 이 슬라이스의 **클라이언트 안전** 공개 API. 서버 전용 DB 접근은 `./server`.
 * 여기에 `./api`를 재수출하면 이 barrel을 임포트하는 모든 클라이언트 모듈의
 * 빌드가 깨진다(`api/index.ts`는 `server-only`).
 */
export {
  getAttemptOutputPrefix,
  getProcessingMatchKey,
  getUploadedFilePrefix,
} from "./model/attempt-prefix";
export {
  PARTIAL_CLIPS_AFTER_BACKEND_ERROR,
  PARTIAL_CLIPS_INSUFFICIENT,
  isPartialClipResultCode,
  resolveModalPollAction,
  resolvePartialClipNoteCode,
} from "./model/clip-generation-outcome";
export type {
  ModalPollAction,
  PartialClipResultCode,
} from "./model/clip-generation-outcome";
export {
  createOptimisticUploadId,
  isOptimisticUploadId,
} from "./model/optimistic-id";
export { ACTIVE_UPLOAD_POLLING_INTERVAL_MS } from "./model/polling";
export {
  ACTIVE_PROCESSING_STATUSES,
  isActiveProcessingStatus,
  isProcessingStatus,
  toProcessingStatus,
} from "./model/processing-status";
export type {
  ActiveProcessingStatus,
  ProcessingStatus,
} from "./model/processing-status";
export { uploadedFileKeys } from "./model/query-keys";
export type {
  ActiveUploadedFileQueueState,
  RecoverableUploadDraftSummary,
  UploadedFileDetail,
  UploadedFileSummary,
  UploadLifecycleState,
} from "./model/types";
export { UploadedFileStatusBadge } from "./ui/UploadedFileStatusBadge";
