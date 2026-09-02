import type { FaqItem } from "~/fsd/shared/lib/seo";
import type {
  ProcessStep,
} from "~/fsd/shared/ui/atoms/resource-card-grid";

export const howItWorksSteps: ProcessStep[] = [
  {
    title: "Upload a podcast .mp4",
    description:
      "The creator uploads an .mp4 file up to 900 MB. The upload is stored under a per-user S3 prefix so it can be processed without becoming public.",
  },
  {
    title: "Transcribe the conversation",
    description:
      "WhisperX creates word-level timing data. The timing is used later to keep captions aligned with the rendered clip.",
  },
  {
    title: "Select highlight candidates",
    description:
      "Gemini evaluates the transcript for self-contained Q&A or discussion moments that can survive as short-form clips.",
  },
  {
    title: "Frame the active speaker",
    description:
      "Active speaker detection and face-aware framing guide the 1080x1920 vertical crop or background treatment.",
  },
  {
    title: "Burn in captions",
    description:
      "English captions use transcript timing. Korean captions are generated for the selected run and rendered into the video.",
  },
  {
    title: "Review and download",
    description:
      "Generated clips appear in the dashboard so the creator can play, download, keep, delete, or rerun the result.",
  },
];

export const howItWorksFaq: FaqItem[] = [
  {
    question: "Does AI Podcast Clipper publish clips automatically?",
    answer:
      "No. The app generates clips for review and download. Creators decide what to publish and where to publish it.",
  },
  {
    question: "What kind of source material works best?",
    answer:
      "Conversation-heavy podcast footage with clear speakers, usable audio, and self-contained discussion moments works best.",
  },
  {
    question: "Can I choose the caption language?",
    answer:
      "Yes. The processing run can use English or Korean captions depending on the selected setting.",
  },
];
