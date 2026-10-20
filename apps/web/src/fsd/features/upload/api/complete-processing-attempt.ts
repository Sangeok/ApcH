import "server-only";
import { settleProcessingAttempt } from "./settle-processing-attempt";

/** A caller-supplied count never determines the charge. */
export async function completeUploadedFileProcessingAttempt(args: {
  uploadedFileId: string;
  attempt: number;
  userId: string;
  clipsFound: number;
  noteCode?: string | null;
  now?: Date;
}): Promise<{ completed: boolean }> {
  return settleProcessingAttempt(args);
}
