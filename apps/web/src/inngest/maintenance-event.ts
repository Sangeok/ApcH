import "server-only";
import { inngest } from "./client";

export const MAINTENANCE_DRAIN_EVENT = "maintenance/drain.requested" as const;

// 정비 드레인을 깨우는 best-effort 킥. 발송 실패가 호출자(삭제·방문)를 실패시키지 않는다 —
// 떨어진 킥은 이후 아무 트리거 이벤트나 방문이 전체를 훑어 메운다(채택안 (c)).
export async function kickMaintenanceDrain(reason: string): Promise<void> {
  try {
    await inngest.send({ name: MAINTENANCE_DRAIN_EVENT, data: { reason } });
  } catch {
    /* best-effort */
  }
}
