import { inngest } from "./client";
import { reconcileVideoReservations } from "~/fsd/features/upload/server";
export const reconcileVideoCreditReservations = inngest.createFunction(
  { id: "reconcile-video-credit-reservations", retries: 1, concurrency: 1 },
  { cron: "* * * * *" },
  async ({ step }) => {
    await step.run(
      "recover-video-reservations-globally",
      reconcileVideoReservations,
    );
  },
);
