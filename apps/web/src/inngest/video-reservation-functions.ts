import { reconcileVideoReservations } from "~/fsd/features/upload/server";
import type { DrainStep } from "./maintenance-schedule";
export async function drainVideoReservations({ step }: { step: DrainStep }) {
  await step.run(
    "recover-video-reservations-globally",
    reconcileVideoReservations,
  );
}
