import { env } from "~/env";
import { inngest } from "~/inngest/client";

// 프로젝트 내 다른 API 라우트와 일관성 유지 (R12)
export const maxDuration = 10;

export async function POST(req: Request) {
  // R24 수정: optional()일 경우 undefined 가능 → 명시적 가드 필수
  // 미설정 시 "Bearer undefined" 비교로 모든 정상 요청이 거부되는 무음 실패 방지
  if (!env.MODAL_WEBHOOK_SECRET) {
    console.error("[Webhook] MODAL_WEBHOOK_SECRET not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.MODAL_WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // R11 수정: 전체 핸들러를 try-catch로 감쌈
  // req.json() 파싱 실패 및 inngest.send() 실패(R6) 모두 처리
  // 500 반환하여 Modal 측 재시도 가능성 확보
  try {
    const payload = (await req.json()) as {
      status?: string;
      uploaded_file_id?: string; // snake_case — Python 백엔드 컨벤션 (R26 수정)
      clips?: Array<Record<string, unknown>>;
      error?: string | null;
    };

    // 통합 패턴: 성공/실패 모두 같은 이벤트명으로 발행, data.status로 구분
    await inngest.send({
      name: "modal/processing.done",
      data: {
        uploadedFileId: payload.uploaded_file_id ?? "",
        status: payload.status === "error" ? "error" : "ok",
        clips: payload.clips ?? [],
        error: payload.error ?? null,
      },
    });

    return new Response("ok");
  } catch (error) {
    console.error("[Webhook] Failed to process Modal callback:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
