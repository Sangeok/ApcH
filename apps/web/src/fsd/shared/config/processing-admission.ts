import "server-only";
import { env } from "~/env";

export function isVideoGenerationAdmissionEnabled(): boolean {
  return env.VIDEO_GENERATION_ADMISSION_ENABLED;
}

export function isVideoWorkerStartEnabled(): boolean {
  return env.VIDEO_WORKER_START_ENABLED;
}
