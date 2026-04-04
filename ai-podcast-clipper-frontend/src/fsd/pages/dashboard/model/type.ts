import { STATUS_CONFIG } from "../constants";

export type StatusKey = keyof typeof STATUS_CONFIG;

export const hasStatusConfig = (status: string): status is StatusKey =>
  status in STATUS_CONFIG;

export interface UploadedFile {
  id: string;
  fileName: string;
  status: string;
  createdAt: Date;
  clipsCount: number;
}
