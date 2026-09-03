import { CaptionsIcon, Clock, RectangleVertical, Youtube } from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { ShortsSpec } from "../model/types";

export const shortsSpecs: ShortsSpec[] = [
  {
    label: "Aspect ratio",
    value: "1080 x 1920",
    description:
      "Vertical 9:16 mp4 - the canonical YouTube Shorts shape, no extra crop required.",
    icon: RectangleVertical,
  },
  {
    label: "Clip length",
    value: "40 - 60 seconds",
    description:
      "Each clip lands inside the YouTube Shorts duration limit while still giving the joke or insight room.",
    icon: Clock,
  },
  {
    label: "Captions",
    value: "Word-level burn-in",
    description:
      "WhisperX word timing is rendered into the frame so the clip reads even with sound off.",
    icon: CaptionsIcon,
  },
  {
    label: "Source",
    value: "Long-form podcasts",
    description:
      "Built around long conversational footage. The AI highlights Q&A beats, not generic moments.",
    icon: Youtube,
  },
];

export const shortsCaptionTrack = [
  {
    title: "English captions",
    description:
      "Driven directly from WhisperX word timings with an Anton-styled emphasis treatment.",
  },
  {
    title: "Korean captions",
    description:
      "Translated by Gemini and styled with Noto Sans KR when Korean is selected for the processing run.",
  },
] as const;

export const shortsReviewLoop = [
  "Each clip plays back inside the dashboard before download.",
  "Per-clip download via short-lived presigned S3 URLs (1 hour).",
  "Per-clip delete to keep the dashboard tight after export.",
] as const;

export const shortsFaq: FaqItem[] = [
  {
    question: "Are the outputs actually YouTube Shorts compatible?",
    answer:
      "Yes. The export is a 1080x1920 vertical mp4 between 30 and 90 seconds with burned-in captions. You upload it to YouTube as you would any Short.",
  },
  {
    question: "Does it support Korean Shorts?",
    answer:
      "Yes. Choose Korean before upload and processing to produce Korean-captioned Shorts styled with Noto Sans KR. Choose English before upload and processing for English-captioned output.",
  },
  {
    question: "Will the AI keep the speaker in frame?",
    answer:
      "The pipeline uses Columbia ASD active speaker detection to drive the 9:16 crop. When the active speaker is uncertain, it falls back to a blurred backdrop so faces are not awkwardly cut off.",
  },
  {
    question: "Do I need to upload to YouTube myself?",
    answer:
      "Yes. The current product produces and stores the clip. You download from the dashboard and publish it to YouTube manually.",
  },
];
