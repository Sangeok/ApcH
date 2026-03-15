import { STATUS_CONFIG } from "../constants";
import type { StatusKey } from "../types";

export const hasStatusConfig = (status: string): status is StatusKey =>
  status in STATUS_CONFIG;
