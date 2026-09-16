import type { Clip, ClipDraft, UploadedFile } from "@repo/db";
import type { UploadedFileOutcome } from "./failure-code";
import type { ProcessingStatus } from "./processing-status";

export interface ActiveUploadedFileQueueState {
  queueFiles: UploadedFileSummary[];
  activeUploadedFileIds: string[];
}

export interface UploadedFileSummary {
  id: string;
  fileName: string;
  status: Exclude<ProcessingStatus, "upload_pending">;
  createdAt: Date;
  visibleClipsCount: number;
}

export interface RecoverableUploadDraftSummary {
  id: string;
  fileName: string;
  language: string;
  targetClipCount: number;
  createdAt: Date;
  sourceUploadedAt: Date | null;
}

export interface UploadedFileDetail {
  id: string;
  displayName: string | null;
  createdAt: Date;
  status: Exclude<ProcessingStatus, "upload_pending">;
  language: string;
  targetClipCount: number;
  /** raw `failureCode` 컬럼을 뜻으로 판별한 값. 컬럼 자체는 DTO에 싣지 않는다 */
  outcome: UploadedFileOutcome;
  enqueueRequestedAt: Date | null;
  queuedAt: Date | null;
  processingStartedAt: Date | null;
  terminalStatusAt: Date | null;
  currentAttempt: number;
  lastSuccessfulAttempt: number;
  reviewBeforeGenerate: boolean;
  reviewAttempt: number | null;
  reviewReadyAt: Date | null;
  currentUserCredits: number;
  /** 업로드 시점 User.defaultCaptionStyle 스냅샷. 검토 Reset이 이 값으로 되돌린다(FEAT-50). */
  captionStyle: UploadedFile["captionStyle"];
  clips: Clip[];
  clipDrafts: ClipDraft[];
}

export interface UploadLifecycleState {
  status: ProcessingStatus;
  uploaded: boolean;
  currentAttempt: number;
}
