import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { PricingHighlight } from "../model/types";

export const pricingHighlights: PricingHighlight[] = [
  {
    label: "Free trial",
    value: "3 credits",
    footnote:
      "Every new account starts with 3 credits. Accepted generation jobs reserve credits; validated results settle usage.",
  },
  {
    label: "How usage is counted",
    value: "1 credit per clip or card-news set",
    footnote:
      "Video uses one credit per stored clip, including partial results. Card news, when enabled, uses one credit only after the whole set is ready.",
  },
  {
    label: "Output per credit",
    value: "Video or carousel files",
    footnote:
      "Video ships as a 1080x1920 mp4. A separate card-news generation creates 1080x1350 JPGs, ZIP and Instagram copy from one completed clip.",
  },
];

export const pricingIncluded = [
  "AI Q&A highlight detection (1-4 clips per upload).",
  "WhisperX word-level subtitles.",
  "Auto vertical framing with face-aware cropping.",
  "English or Korean captions selected per processing run.",
  "Secure S3 storage with per-user prefixes and signed URLs.",
  "Dashboard review with per-clip download and delete.",
  "Card news, when enabled for your account: text cards with a source-video cover, JPG/ZIP and caption/hashtags.",
  "Free manual card-news edits and downloads; each requested AI regeneration is another one-credit generation.",
] as const;

export const pricingLimits = [
  "Per-upload size limit: 900 MB .mp4.",
  "Per-run clip count: 1, 2, 3, or 4.",
  "Concurrency: one running processing job per user. Additional requests wait in queue.",
  "Processing requires enough available credits (owned minus active reservations) for the requested output.",
  "One active paid card-news generation per user and one free render per set.",
  "Presigned download URLs expire after 1 hour.",
] as const;

export const pricingFaq: FaqItem[] = [
  {
    question: "How does the free trial work?",
    answer:
      "Every new account starts with 3 free credits. Video costs one credit per successfully stored clip, including partial results; zero clips cost zero credits. Card news, when enabled for your account, is a separate one-credit generation from a completed clip. A video clip and its card-news set together use two credits.",
  },
  {
    question: "When are credits deducted?",
    answer:
      "Accepted jobs reserve credits, reducing the available balance without deducting the owned balance. Video settles one credit per successfully stored clip, even if the run ends with partial results. Card news settles one credit only when all images, ZIP and copy are ready. Failed card-news generation releases its reservation, and automatic technical retries do not reserve or charge again.",
  },
  {
    question: "Do card-news edits or AI regeneration cost credits?",
    answer:
      "Manual changes to wording, body-card order, theme, cover, caption and hashtags are free, including their image rerender and download. Each user-requested AI regeneration is a new one-credit set and preserves earlier sets. Automatic retries after a technical error are free. The app provides files and copy for you to post; it does not publish to Instagram.",
  },
  {
    question: "Can I refund credits or unused subscription time?",
    answer:
      "Credits and subscription fees are non-refundable unless required by law or expressly approved. Subscription benefits remain available until the end of the paid period.",
  },
  {
    question: "Where is payment handled?",
    answer:
      "Payments, when enabled, are handled from the authenticated billing dashboard and processed by Polar. AI Podcast Clipper does not store full payment card information.",
  },
];
