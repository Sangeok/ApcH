import {
  AudioWaveform,
  Languages,
  Layers,
  Scissors,
  Share2,
  ShieldCheck,
  Sparkles,
  TimerReset,
} from "lucide-react";
import type { FeatureCard, heroHighlight, WorkflowStep } from "../model/type";

export const heroHighlights: heroHighlight[] = [
  {
    label: "Automatic clip count",
    value: "Up to 2 per run",
    footnote: "Gemini maps the top Q&A pairs with 40–60s durations.",
  },
  {
    label: "Caption languages",
    value: "English & Korean",
    footnote: "WhisperX transcripts plus Gemini-powered translation.",
  },
  {
    label: "Storage security",
    value: "Signed S3 URLs",
    footnote: "Per-user prefixes keep clips private until you share.",
  },
] as const;

export const coreFeatures: FeatureCard[] = [
  {
    title: "AI Q&A Clipping",
    description:
      "Gemini 2.5 scans word-level timestamps and plans 40–60 second question-and-answer clips automatically.",
    icon: Sparkles,
    badge: "LLM planning",
    footnote: "Keeps full sentence boundaries so playback never feels abrupt.",
  },
  {
    title: "WhisperX Word Subtitles",
    description:
      "WhisperX large-v2 transcribes English audio and aligns every word to precise start/end timings.",
    icon: AudioWaveform,
    badge: "Word-level",
    footnote: "Word JSON makes downstream recuts and syncing painless.",
  },
  {
    title: "Auto Vertical Framing",
    description:
      "Columbia face tracks steer 1080×1920 crops or blurred backgrounds, rendered via NVENC at 25 fps.",
    icon: Scissors,
    badge: "Face-aware",
    footnote: "Chooses crop vs. resize per frame for the best composition.",
  },
  {
    title: "English & Korean Captions",
    description:
      "English captions come from WhisperX, Korean captions from Gemini translation, each exported as its own clip.",
    icon: Languages,
    badge: "Dual captions",
    footnote:
      "Ships with Anton and Noto Sans KR styles plus immediate S3 uploads.",
  },
  {
    title: "Secure S3 Storage",
    description:
      "Every clip lands in a dedicated bucket, and the app fetches it only through AWS presigned URLs.",
    icon: ShieldCheck,
    badge: "Signed URLs",
    footnote: "Per-user prefixes and cleanup routines keep data tidy.",
  },
  {
    title: "Dashboard Review Loop",
    description:
      "Upload, request processing, review the clip list, play or download, and delete—all from a single view.",
    icon: Layers,
    badge: "Dashboard",
    footnote: "Next.js UI stays in sync with the database in real time.",
  },
];

export const workflowSteps: WorkflowStep[] = [
  {
    title: "Upload once",
    description: "Drag and drop your long-form video.",
    icon: AudioWaveform,
    detail: "Automatic transcription",
  },
  {
    title: "AI curates highlights",
    description:
      "Narrative scoring, filler removal, and subtitle styling happen simultaneously.",
    icon: TimerReset,
    detail: "Priority queue keeps latency under 6 minutes per hour of content.",
  },
  {
    title: "Review & publish",
    description:
      "Accept, tweak, or regenerate. Export vertical, square, and landscape ratios.",
    icon: Share2,
    detail: "Check your clips in the dashboard",
  },
];
