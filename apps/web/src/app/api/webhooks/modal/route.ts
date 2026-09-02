import { env } from "~/env";
import { updateClipMetadataFromBackendClips } from "~/fsd/entities/clip/server";
import { getProcessingMatchKey } from "~/fsd/entities/uploaded-file";
import { isUploadedFileAttemptCurrent } from "~/fsd/entities/uploaded-file/server";
import { inngest } from "~/inngest/client";
// clip/moment의 형태와 정규화는 ~/inngest/modal-contract 한 곳이 소유한다.
// 이 파일에는 HTTP 봉투(RawModalWebhookBody)만 남긴다.
import {
  normalizeAnalyzedMoment,
  normalizeBackendClip,
  toModalErrorMessage,
  toStrictPositiveInteger,
  type AnalyzedMoment,
  type ProcessVideoBackendClip,
  type RawAnalyzedMoment,
  type RawProcessVideoBackendClip,
} from "~/inngest/modal-contract";

interface RawModalWebhookBody {
  uploadedFileId?: string;
  uploaded_file_id?: string;
  attempt?: number | string;
  status?: string;
  phase?: string;
  clips?: RawProcessVideoBackendClip[];
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
  clips?: ProcessVideoBackendClip[];
  moments?: AnalyzedMoment[];
  transcriptS3Key?: string | null;
  error?: string;
}

// 오류 값의 문자열화는 계약 모듈이 소유한다. 다만 이 라우트는 "오류 없음"을
// undefined로 구분해야 하므로(NormalizedModalWebhookBody.error가 선택 필드)
// nullish 처리만 여기서 한다.
function toWebhookErrorMessage(error: unknown): string | undefined {
  if (error == null) {
    return undefined;
  }

  return toModalErrorMessage(error, "Unknown modal webhook error");
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
          .map(normalizeBackendClip)
          .filter((clip): clip is ProcessVideoBackendClip => clip !== null)
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

  // 잘못된 JSON에 500(+Sentry)이 아니라 400을 준다.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const body = normalizeBody(rawBody as RawModalWebhookBody);

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
