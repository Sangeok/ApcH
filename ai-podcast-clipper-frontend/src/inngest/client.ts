import { EventSchemas, Inngest } from "inngest";

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
  "modal/processing.done": {
    data: {
      uploadedFileId: string;
      status: "ok" | "error";
      clips?: Array<Record<string, unknown>>;
      error?: string | null;
    };
  };
};

// Create a client to send and receive events
export const inngest = new Inngest({
  id: "ai-podcast-clipper-frontend",
  schemas: new EventSchemas().fromRecord<Events>(),
});
