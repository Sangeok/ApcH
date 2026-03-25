import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { processVideo } from "~/inngest/functions";

export const maxDuration = 10; // Hobby 플랜 최대값. Pro 전환 시 300으로 상향 권장

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processVideo],
});
