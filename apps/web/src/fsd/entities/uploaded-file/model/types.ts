import type { Clip, ClipDraft } from "generated/prisma";
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
  failureCode: string | null;
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
  clips: Clip[];
  clipDrafts: ClipDraft[];
}

export interface UploadLifecycleState {
  status: ProcessingStatus;
  uploaded: boolean;
  currentAttempt: number;
}
