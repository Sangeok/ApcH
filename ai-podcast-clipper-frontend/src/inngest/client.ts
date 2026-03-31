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
    };
  };
  "process-video-events/cancel": {
    data: {
      uploadedFileId: string;
    };
  };
  "modal/video.processed": {
    data: {
      uploadedFileId: string;
      status: string;
      clips?: ProcessVideoBackendClip[];
      error?: string;
    };
  };
};

// Create a client to send and receive events
export const inngest = new Inngest({
  id: "ai-podcast-clipper-frontend",
  schemas: new EventSchemas().fromRecord<Events>(),
});
