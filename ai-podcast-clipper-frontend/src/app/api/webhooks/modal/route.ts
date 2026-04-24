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

interface RawModalWebhookClip {
  index?: number;
  startSeconds?: number | null;
  start_seconds?: number | null;
  endSeconds?: number | null;
  end_seconds?: number | null;
  s3Key?: string | null;
  s3_key?: string | null;
  scriptText?: string | null;
  script_text?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtube_title?: string | null;
  youtubeDescription?: string | null;
  youtube_description?: string | null;
  youtubeHashtags?: string[] | null;
  youtube_hashtags?: string[] | null;
}

interface RawModalWebhookBody {
  uploadedFileId?: string;
  uploaded_file_id?: string;
  attempt?: number | string;
  status?: string;
  clips?: RawModalWebhookClip[];
  error?: unknown;
}

interface NormalizedModalWebhookBody {
  uploadedFileId: string;
  attempt: number;
  status: string;
  clips?: ModalWebhookClip[];
  error?: string;
}

function toWebhookErrorMessage(error: unknown): string | undefined {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error == null) {
    return undefined;
  }

  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown modal webhook error";
  }
}

function normalizeClip(rawClip: RawModalWebhookClip): ModalWebhookClip | null {
  if (typeof rawClip.index !== "number") {
    return null;
  }

  return {
    index: rawClip.index,
    startSeconds: rawClip.startSeconds ?? rawClip.start_seconds ?? null,
    endSeconds: rawClip.endSeconds ?? rawClip.end_seconds ?? null,
    s3Key: rawClip.s3Key ?? rawClip.s3_key ?? null,
    scriptText: rawClip.scriptText ?? rawClip.script_text ?? null,
    language: rawClip.language ?? null,
    youtubeTitle: rawClip.youtubeTitle ?? rawClip.youtube_title ?? null,
    youtubeDescription:
      rawClip.youtubeDescription ?? rawClip.youtube_description ?? null,
    youtubeHashtags:
      rawClip.youtubeHashtags ?? rawClip.youtube_hashtags ?? null,
  };
}

function normalizeBody(rawBody: RawModalWebhookBody): NormalizedModalWebhookBody | null {
  const uploadedFileId = rawBody.uploadedFileId ?? rawBody.uploaded_file_id;
  const attempt =
    typeof rawBody.attempt === "number"
      ? rawBody.attempt
      : Number.parseInt(String(rawBody.attempt ?? ""), 10);

  if (
    typeof uploadedFileId !== "string" ||
    uploadedFileId.length === 0 ||
    !Number.isInteger(attempt) ||
    typeof rawBody.status !== "string" ||
    rawBody.status.length === 0
  ) {
    return null;
  }

  return {
    uploadedFileId,
    attempt,
    status: rawBody.status,
    clips: Array.isArray(rawBody.clips)
      ? rawBody.clips
          .map(normalizeClip)
          .filter((clip): clip is ModalWebhookClip => clip !== null)
      : undefined,
    error: toWebhookErrorMessage(rawBody.error),
  };
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${env.MODAL_WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rawBody = (await req.json()) as RawModalWebhookBody;
  const body = normalizeBody(rawBody);

  if (!body) {
    return new Response("Bad Request", { status: 400 });
  }

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
