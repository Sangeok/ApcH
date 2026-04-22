import { env } from "~/env";
import { getProcessingMatchKey } from "~/fsd/entities/uploaded-file";
import { inngest } from "~/inngest/client";

interface ModalWebhookClip {
  index: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
  s3Key?: string | null;
  scriptText?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  youtubeHashtags?: string[] | null;
}

interface ModalWebhookBody {
  uploadedFileId: string;
  attempt: number;
  status: string;
  clips?: ModalWebhookClip[];
  error?: string;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${env.MODAL_WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await req.json()) as ModalWebhookBody;

  await inngest.send({
    name: "modal/video.processed",
    data: {
      uploadedFileId: body.uploadedFileId,
      attempt: body.attempt,
      matchKey: getProcessingMatchKey(body.uploadedFileId, body.attempt),
      status: body.status,
      clips: body.clips,
      error: body.error,
    },
  });

  return new Response("OK", { status: 200 });
}
