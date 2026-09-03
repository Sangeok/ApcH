import { failure, success } from "~/fsd/shared/api/result";
import type { ActionResult } from "~/fsd/shared/api/result";

// 앱 전역의 성공/실패 계약을 그대로 쓴다. 형태가 이미 같았으므로 별칭으로 묶어
// 호출부가 판별자를 다시 배우지 않게 한다.
export type ClipboardResult = ActionResult<void>;

export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return failure("Clipboard API not available");
  }

  try {
    await navigator.clipboard.writeText(text);
    return success();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure(message);
  }
}
