import { inngest } from "~/inngest/client";
import { env } from "~/env";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.MODAL_WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();

  await inngest.send({
    name: "modal/video.processed",
    data: {
      uploadedFileId: body.uploadedFileId,
      status: body.status,
      clips: body.clips,
      error: body.error,
    },
  });

  return new Response("OK", { status: 200 });
}
