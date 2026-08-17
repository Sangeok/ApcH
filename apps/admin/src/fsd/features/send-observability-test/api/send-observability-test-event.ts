"use server";

import { type ActionResult, failure, success } from "~/fsd/shared/api/result";
import {
  flushReports,
  reportPipelineFailure,
  setReportUser,
  withIsolatedReportScope,
} from "~/fsd/shared/observability";
import { requireAdmin } from "~/server/auth/guard";

/**
 * DSN·네트워크·flush·environment 태그가 전부 통하는지
 * 실제 실패를 기다리지 않고 확인하는 용도.
 *
 * ⚠️ 반환 타입이 모든 결과를 담지 않는다. 비관리자 호출은 `requireAdmin()`이
 * `redirect()`/`notFound()`를 던지므로 이 함수는 **resolve하지 않고 reject**한다
 * (Next 제어 흐름 예외). `ActionResult`는 **인가를 통과한 뒤**의 성공/실패만 표현한다.
 * requireAdmin을 try 밖에 두는 건 의도적이다 — 안에 넣으면 catch가
 * NEXT_REDIRECT를 삼켜 리다이렉트가 깨진다.
 *
 * setReportUser는 isolation scope에 쓰므로 warm 인스턴스에서 관리자 태그가
 * 이후 요청에 남지 않도록 withIsolatedReportScope 안에서만 호출한다.
 */
export async function sendObservabilityTestEvent(): Promise<ActionResult<void>> {
  // 목적지 인가. 레이아웃 가드에 기대지 않는다.
  const admin = await requireAdmin();

  return withIsolatedReportScope(async () => {
    try {
      setReportUser(admin.userId);

      reportPipelineFailure({
        kind: "stuck-processing",
        uploadedFileId: "observability-test",
        processingStartedAt: new Date().toISOString(),
        elapsedMinutes: 0,
      });

      await flushReports();

      return success();
    } catch (error) {
      console.error("Failed to send observability test event", error);
      return failure("Failed to send test event");
    }
  });
}
