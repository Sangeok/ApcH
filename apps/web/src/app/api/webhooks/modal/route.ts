import { env } from "~/env";
import { updateClipMetadataFromBackendClips } from "~/fsd/entities/clip";
import {
  getProcessingMatchKey,
  isUploadedFileAttemptCurrent,
} from "~/fsd/entities/uploaded-file";
import { inngest } from "~/inngest/client";
import type { AnalyzedMoment } from "~/inngest/client";

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
  clipType?: string | null;
  hook?: string | null;
  payoff?: string | null;
  subtitleStatus?: string | null;
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
  clipType?: string | null;
  clip_type?: string | null;
  hook?: string | null;
  payoff?: string | null;
  subtitleStatus?: string | null;
}

interface RawAnalyzedMoment {
  index?: number | string;
  startSeconds?: number | null;
  start_seconds?: number | null;
  endSeconds?: number | null;
  end_seconds?: number | null;
  clipType?: string | null;
  clip_type?: string | null;
  hook?: string | null;
  payoff?: string | null;
}

interface RawModalWebhookBody {
  uploadedFileId?: string;
  uploaded_file_id?: string;
  attempt?: number | string;
  status?: string;
  phase?: string;
  clips?: RawModalWebhookClip[];
  moments?: RawAnalyzedMoment[];
  transcript_s3_key?: string;
  transcriptS3Key?: string;
  error?: unknown;
}

interface NormalizedModalWebhookBody {
  uploadedFileId: string;
  attempt: number;
  status: string;
  // normalizeBody가 실제로 생산하는 두 값만 모델링한다. 백엔드 phase "auto"와
  // phase 없는 구버전 콜백은 모두 "render"(기존 처리 경로)로 접힌다.
  phase: "analyze" | "render";
  clips?: ModalWebhookClip[];
  moments?: AnalyzedMoment[];
  transcriptS3Key?: string | null;
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
    clipType: rawClip.clipType ?? rawClip.clip_type ?? null,
    hook: rawClip.hook ?? null,
    payoff: rawClip.payoff ?? null,
    subtitleStatus: rawClip.subtitleStatus ?? null,
  };
}

function normalizeAnalyzedMoment(
  raw: RawAnalyzedMoment,
): AnalyzedMoment | null {
  const index = toStrictNonNegativeInteger(raw.index);
  const startSeconds = raw.startSeconds ?? raw.start_seconds;
  const endSeconds = raw.endSeconds ?? raw.end_seconds;

  if (
    index === null ||
    typeof startSeconds !== "number" ||
    typeof endSeconds !== "number"
  ) {
    return null;
  }

  return {
    index,
    startSeconds,
    endSeconds,
    clipType: raw.clipType ?? raw.clip_type ?? null,
    hook: raw.hook ?? null,
    payoff: raw.payoff ?? null,
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
    // phase가 없으면 구버전 백엔드 콜백이므로 렌더(기존 경로)로 간주한다.
    phase: rawBody.phase === "analyze" ? "analyze" : "render",
    clips: Array.isArray(rawBody.clips)
      ? rawBody.clips
          .map(normalizeClip)
          .filter((clip): clip is ModalWebhookClip => clip !== null)
      : undefined,
    moments: Array.isArray(rawBody.moments)
      ? rawBody.moments
          .map(normalizeAnalyzedMoment)
          .filter((moment): moment is AnalyzedMoment => moment !== null)
      : undefined,
    transcriptS3Key: rawBody.transcript_s3_key ?? rawBody.transcriptS3Key ?? null,
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

  if (body.phase === "analyze") {
    await inngest.send({
      name: "modal/video.analyzed",
      data: {
        uploadedFileId: body.uploadedFileId,
        attempt: body.attempt,
        matchKey: getProcessingMatchKey(body.uploadedFileId, body.attempt),
        status: body.status,
        moments: body.moments,
        transcriptS3Key: body.transcriptS3Key,
        error: body.error,
      },
    });

    return new Response("OK", { status: 200 });
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

  const isCurrentAttempt = await isUploadedFileAttemptCurrent(
    body.uploadedFileId,
    body.attempt,
  );

  if (isCurrentAttempt && body.clips && body.clips.length > 0) {
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
