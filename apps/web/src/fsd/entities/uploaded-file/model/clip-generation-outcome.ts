export const PARTIAL_CLIPS_INSUFFICIENT = "partial_clips_insufficient";
export const PARTIAL_CLIPS_AFTER_BACKEND_ERROR =
  "partial_clips_after_backend_error";

export type PartialClipResultCode =
  | typeof PARTIAL_CLIPS_INSUFFICIENT
  | typeof PARTIAL_CLIPS_AFTER_BACKEND_ERROR;

export function isPartialClipResultCode(
  code: string | null | undefined,
): code is PartialClipResultCode {
  return (
    code === PARTIAL_CLIPS_INSUFFICIENT ||
    code === PARTIAL_CLIPS_AFTER_BACKEND_ERROR
  );
}

export function resolvePartialClipNoteCode(args: {
  clipsFound: number;
  expectedClipCount: number;
  backendFailureMessage: string | null;
}): PartialClipResultCode | null {
  const { clipsFound, expectedClipCount, backendFailureMessage } = args;

  if (clipsFound <= 0 || clipsFound >= expectedClipCount) {
    return null;
  }

  return backendFailureMessage
    ? PARTIAL_CLIPS_AFTER_BACKEND_ERROR
    : PARTIAL_CLIPS_INSUFFICIENT;
}

export type ModalPollAction = "continue" | "detected" | "settle" | "failed";

export function resolveModalPollAction(args: {
  generatedClipCount: number;
  clipCount: number;
  modalCallbackReceived: boolean;
  hasBackendFailure: boolean;
  backendClipCount: number | null;
}): ModalPollAction {
  const {
    generatedClipCount,
    clipCount,
    modalCallbackReceived,
    hasBackendFailure,
    backendClipCount,
  } = args;

  if (generatedClipCount >= clipCount) {
    return "detected";
  }

  if (
    modalCallbackReceived &&
    !hasBackendFailure &&
    backendClipCount !== null &&
    backendClipCount >= 1 &&
    backendClipCount < clipCount
  ) {
    return generatedClipCount >= backendClipCount ? "detected" : "settle";
  }

  if (hasBackendFailure) {
    return "failed";
  }

  return "continue";
}
