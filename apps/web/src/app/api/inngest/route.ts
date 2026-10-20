import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  generateCardNews,
  renderCardNews,
  dispatchPendingCardNews,
  reconcileCardNewsJobs,
  cleanupCardNewsAssets,
} from "~/inngest/card-news-functions";
import { reconcileVideoCreditReservations } from "~/inngest/video-reservation-functions";
import {
  analyzeVideo,
  cleanupAnalyticsEvents,
  watchProcessingAttempt,
  processVideo,
} from "~/inngest/functions";

export const maxDuration = 10;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processVideo,
    analyzeVideo,
    cleanupAnalyticsEvents,
    watchProcessingAttempt,
    generateCardNews,
    renderCardNews,
    dispatchPendingCardNews,
    reconcileCardNewsJobs,
    cleanupCardNewsAssets,
    reconcileVideoCreditReservations,
  ],
});
