import { EventSchemas, Inngest } from "inngest";

type ProcessVideoBackendClip = {
  index: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
  s3Key?: string | null;
  scriptText?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  youtubeHashtags?: string[] | null;
};

type Events = {
  "process-video-events": {
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
};

export const inngest = new Inngest({
  id: "ai-podcast-clipper-frontend",
  schemas: new EventSchemas().fromRecord<Events>(),
});
