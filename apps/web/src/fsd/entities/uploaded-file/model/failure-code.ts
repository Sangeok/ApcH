import {
  isPartialClipResultCode,
  type PartialClipResultCode,
} from "./clip-generation-outcome";
import type { ProcessingStatus } from "./processing-status";

/**
 * `UploadedFile.failureCode` 컬럼의 실패 어휘 — 생산자와 소비자를 묶는 단일 카탈로그.
 *
 * 이전에는 생산자가 `src/` 전역에 흩어진 bare 문자열이었고 소비자는
 * `ProcessingTimeline`의 switch 하나뿐이라, 둘을 잇는 것이 grep밖에 없었다.
 * 실제로 드리프트가 나 있었다 — switch의 `dispatch_dead_letter`와
 * `incomplete_clips_generated`는 생산자가 없는 고아 case였고, 새 실패 경로를
 * 추가해도 라벨 없이 배포되는 것을 컴파일러가 막지 못했다.
 *
 * 여기 키를 추가하지 않은 코드는 `markUploadedFileAttemptFailed`에 넘길 수 없다.
 */
export const UPLOADED_FILE_FAILURE_LABELS = {
  dispatch_failed: "Processing could not start",
  dispatch_timeout: "Processing request timed out",
  callback_timeout: "Processing result timed out",
  missing_source_object: "Original upload is missing",
  worker_timeout: "Worker timed out",
  queued_worker_not_started: "Worker did not start",
  backend_failed: "Backend processing failed",
  analysis_failed: "Analysis failed",
  analysis_timeout: "Analysis timed out",
  no_moments_found: "No suitable moments were found",
  no_clips_generated: "No clips were generated",
} as const;

export type UploadedFileFailureCode = keyof typeof UPLOADED_FILE_FAILURE_LABELS;

export function isUploadedFileFailureCode(
  code: string | null | undefined,
): code is UploadedFileFailureCode {
  return typeof code === "string" && code in UPLOADED_FILE_FAILURE_LABELS;
}

/**
 * `failureCode` 컬럼 하나가 서로 다른 두 가지를 담는다 — 실패 이유와,
 * `processed` 성공에 붙는 부분 생성 노트. 이전에는 두 UI가 같은
 * `string | null`을 각자 다른 뜻으로 읽었고, 어느 쪽 뜻인지는 `status`를
 * 함께 봐야만 알 수 있었다. DTO 경계에서 한 번 판별해 그 지식을 가둔다.
 */
export type UploadedFileOutcome =
  | { kind: "none" }
  | { kind: "failure"; failureCode: UploadedFileFailureCode }
  | { kind: "partial-success"; noteCode: PartialClipResultCode };

/**
 * 저장된 컬럼 값을 판별 union으로. 미지의 값(옛 행, 손으로 쓴 값)은 뜻을
 * 지어내지 않고 `none`이 된다 — 이전에도 라벨이 붙지 않았으므로 동작은 같다.
 */
export function toUploadedFileOutcome(
  status: ProcessingStatus,
  failureCode: string | null,
): UploadedFileOutcome {
  if (status === "processed") {
    return isPartialClipResultCode(failureCode)
      ? { kind: "partial-success", noteCode: failureCode }
      : { kind: "none" };
  }

  return isUploadedFileFailureCode(failureCode)
    ? { kind: "failure", failureCode }
    : { kind: "none" };
}
