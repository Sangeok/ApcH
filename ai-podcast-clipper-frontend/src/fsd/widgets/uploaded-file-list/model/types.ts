import type { ProcessingStatus } from "~/fsd/shared/types/processing-status";

export interface UploadedFileSummary {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  createdAt: Date;
  clipsCount: number;
}
