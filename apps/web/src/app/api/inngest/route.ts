import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  generateCardNews,
  renderCardNews,
} from "~/inngest/card-news-functions";
import { maintenanceDrain } from "~/inngest/maintenance-functions";
import {
  analyzeVideo,
  cleanupAnalyticsEvents,
  watchProcessingAttempt,
  processVideo,
} from "~/inngest/functions";

// Each durable step can perform bounded database, S3 and producer-status I/O.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processVideo,
    analyzeVideo,
    cleanupAnalyticsEvents,
    watchProcessingAttempt,
    generateCardNews,
    renderCardNews,
    maintenanceDrain,
  ],
});
