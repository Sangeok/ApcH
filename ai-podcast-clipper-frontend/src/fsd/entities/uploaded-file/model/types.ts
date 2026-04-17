import type { ProcessingStatus } from "./processing-status";

export interface UploadedFileSummary {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  createdAt: Date;
  clipsCount: number;
}
