import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { PricingHighlight } from "../model/types";

export const pricingHighlights: PricingHighlight[] = [
  {
    label: "Free trial",
    value: "3 credits",
    footnote:
      "Every new account starts with 3 credits. Credits are deducted after a successful processing run.",
  },
  {
    label: "How usage is counted",
    value: "1 credit per clip",
    footnote:
      "One credit is deducted per generated clip in a successfully completed run.",
  },
  {
    label: "Output per credit",
    value: "Vertical mp4 + captions",
    footnote:
      "Each clip ships as a 1080x1920 mp4 with burned-in captions and a presigned download URL.",
  },
];

export const pricingIncluded = [
  "AI Q&A highlight detection (1-4 clips per upload).",
  "WhisperX word-level subtitles.",
  "Auto vertical framing with face-aware cropping.",
  "English or Korean captions selected per processing run.",
  "Secure S3 storage with per-user prefixes and signed URLs.",
  "Dashboard review with per-clip download and delete.",
] as const;

export const pricingLimits = [
  "Per-upload size limit: 900 MB .mp4.",
  "Per-run clip count: 1, 2, 3, or 4.",
  "Concurrency: one active processing run per user.",
  "Processing starts only when the account has a positive credit balance.",
  "Presigned download URLs expire after 1 hour.",
] as const;

export const pricingFaq: FaqItem[] = [
  {
    question: "How does the free trial work?",
    answer:
      "Every new account is provisioned with 3 free credits. Credits are deducted after a successful processing run, one credit per generated clip in that completed run. If a run fails or only partially completes, no credit is consumed.",
  },
  {
    question: "When are credits deducted?",
    answer:
      "Credits are deducted only after the requested clips are successfully processed and stored. Uploads that fail, produce no clip, or do not complete the requested clip count do not affect your credit balance.",
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
