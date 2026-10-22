import { EventSchemas, Inngest } from "inngest";
import type { CardNewsEvents } from "./card-news-contract";
// wire 계약의 정본은 ./modal-contract 하나다. 여기서 다시 선언하지 않는다.
import type { AnalyzedMoment, ProcessVideoBackendClip } from "./modal-contract";

export type { AnalyzedMoment } from "./modal-contract";

type RenderMoment = {
  index: number;
  start: number;
  end: number;
  type?: string | null;
  hook?: string | null;
  payoff?: string | null;
};

type Events = CardNewsEvents & {
  "process-video-events": {
    data: {
      uploadedFileId: string;
      userId: string;
      language: string;
      clipCount: number;
      attempt: number;
      outputPrefix: string;
      matchKey: string;
      // render dispatch만 설정. 있으면 Modal에 mode="render"로 전달된다.
      moments?: RenderMoment[];
      transcriptS3Key?: string | null;
    };
  };
  "analyze-video-events": {
    data: {
      uploadedFileId: string;
      userId: string;
      language: string;
      clipCount: number;
      attempt: number;
      outputPrefix: string;
      matchKey: string;
    };
  };
  "process-video-events/cancel": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
    };
  };
  "processing/attempt.claimed": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
      // claim 직후 ISO. stuck 리포트의 processingStartedAt·elapsedMinutes 산정에 쓴다.
      claimedAt: string;
    };
  };
  "modal/video.processed": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
      status: string;
      clips?: ProcessVideoBackendClip[];
      error?: string;
    };
  };
  "modal/video.analyzed": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
      status: string;
      moments?: AnalyzedMoment[];
      transcriptS3Key?: string | null;
      error?: string;
    };
  };
  "maintenance/drain.requested": {
    // reason: 어느 경로가 깨웠는지(관측용). pastDueStreak: 이어달리기 킥만 싣는 연속 기한 경과 횟수.
    data: { reason?: string; pastDueStreak?: number };
  };
};

export const inngest = new Inngest({
  id: "ai-podcast-clipper-frontend",
  schemas: new EventSchemas().fromRecord<Events>(),
});
