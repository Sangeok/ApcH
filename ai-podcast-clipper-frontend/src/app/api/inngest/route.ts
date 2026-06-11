import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { processVideo } from "~/inngest/functions";

export const maxDuration = 10;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processVideo],
});
