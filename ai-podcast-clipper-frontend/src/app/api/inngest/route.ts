import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  processVideo,
  processingDispatchSweep,
  staleProcessingSweep,
  uploadDraftSweep,
} from "~/inngest/functions";

export const maxDuration = 10;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processVideo,
    processingDispatchSweep,
    uploadDraftSweep,
    staleProcessingSweep,
  ],
});
