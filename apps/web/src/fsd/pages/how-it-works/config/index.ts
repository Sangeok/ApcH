import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { ProcessStep } from "~/fsd/shared/ui/atoms/resource-card-grid";

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
  {
    title: "Create card news from a completed clip",
    description:
      "When card news is enabled for your account, select one completed clip to generate a standalone carousel for one credit. The saved script guides the text, and a scene from the original video becomes the cover. Edit words, body-card order, theme and cover for free, then download JPG/ZIP and copy the Instagram caption and hashtags.",
  },
];

export const howItWorksFaq: FaqItem[] = [
  {
    question: "Does AI Podcast Clipper publish clips automatically?",
    answer:
      "No. The app provides video clips and, when enabled, card-news images, ZIP and caption/hashtags for review and download. Creators decide what to publish and upload it themselves.",
  },
  {
    question: "What happens when card-news generation fails?",
    answer:
      "The one-credit reservation is released if the full card-news result cannot be completed. Technical retries are free. A requested AI regeneration creates a separate paid set, while manual edits and their rerender are free. Previously completed versions remain usable during a new render or a failed regeneration.",
  },
  {
    question: "What happens when I delete a source or card-news set?",
    answer:
      "Deleting an uploaded video also removes its clips and all derived card-news sets. Deleting one clip removes only that clip and its derived sets, including AI regenerations. Deleting one card-news set preserves the clip and separate regenerated sets. Active work must finish before deletion; accepted deletion blocks new access while file cleanup completes.",
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
