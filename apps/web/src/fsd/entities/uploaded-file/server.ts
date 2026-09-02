import "server-only";

/**
 * 이 슬라이스의 **서버 전용** 공개 API.
 *
 * `./api`는 `server-only`라 클라이언트가 임포트하면 빌드가 깨진다. 이걸
 * `index.ts`가 재수출하던 동안에는 클라이언트 모듈 13개가 전부 barrel을 우회해
 * `model/*`·`ui/*`를 직접 임포트했고, 공개 API 경계가 사실상 없었다.
 * 런타임 기준으로 나눠서 양쪽 모두 슬라이스 루트를 쓸 수 있게 한다.
 */
export {
  claimNextProcessingAttempt,
  confirmUploadedFileSourceIfObjectExists,
  createUploadDraft,
  deleteUploadedFileRecord,
  ensureUploadedFileQueuedForDispatch,
  findStaleProcessingCandidate,
  findUploadedFileFailureState,
  findUploadedFileForScheduling,
  findUploadedFileReviewState,
  findUploadedFileSourceState,
  findUploadedFileForDeletion,
  findCurrentProcessingAttemptContext,
  findUploadedFileS3Key,
  getUploadedFileDetailsById,
  hasProcessingUploadForUser,
  isUploadedFileAttemptCurrent,
  isUploadedFileAttemptStillProcessing,
  listActiveProcessingCandidatesByUserId,
  listActiveUploadedFileQueueStateByUserId,
  listRecoverableUploadDraftsByUserId,
  listUploadedFileSummariesByUserId,
  markUploadedFileAttemptFailed,
  markUploadedFileAttemptNoCredits,
  markUploadedFileAttemptProcessed,
  markUploadedFileAttemptReviewPending,
  reconcileUploadDraftsForUser,
  startUploadedFileProcessingAttempt,
} from "./api";
export type { StaleProcessingCandidate } from "./api";
