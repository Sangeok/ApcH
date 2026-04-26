import { env } from "~/env";
import { updateClipMetadataFromBackendClips } from "~/fsd/entities/clip";
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
  index?: number | string;
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

function toStrictNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();

    if (!/^\d+$/.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}

function toStrictPositiveInteger(value: unknown): number | null {
  const parsed = toStrictNonNegativeInteger(value);

  return parsed !== null && parsed > 0 ? parsed : null;
}

function normalizeClip(rawClip: RawModalWebhookClip): ModalWebhookClip | null {
  const index = toStrictNonNegativeInteger(rawClip.index);

  if (index === null) {
    return null;
  }

  return {
    index,
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

function normalizeBody(
  rawBody: RawModalWebhookBody,
): NormalizedModalWebhookBody | null {
  const uploadedFileId = rawBody.uploadedFileId ?? rawBody.uploaded_file_id;
  const attempt = toStrictPositiveInteger(rawBody.attempt);

  if (
    typeof uploadedFileId !== "string" ||
    uploadedFileId.length === 0 ||
    attempt === null ||
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

  if (body.clips && body.clips.length > 0) {
    try {
      await updateClipMetadataFromBackendClips({
        uploadedFileId: body.uploadedFileId,
        processingAttempt: body.attempt,
        clips: body.clips,
      });
    } catch (error) {
      console.error("Failed to reconcile modal clip metadata", error);
    }
  }

  return new Response("OK", { status: 200 });
}
