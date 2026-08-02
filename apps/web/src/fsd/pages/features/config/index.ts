import {
  AudioWaveform,
  Languages,
  Layers,
  Scissors,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { ComparisonRow, FeatureCard } from "../model/types";

export const detailedFeatures: FeatureCard[] = [
  {
    title: "AI Q&A Clipping",
    badge: "LLM planning",
    icon: Sparkles,
    description:
      "Gemini 2.5 reads word-level transcripts and plans 40-60 second question-and-answer clips that keep full sentence boundaries.",
    details: [
      "1 to 4 clips per upload, controlled at submit time.",
      "Highlights are scored on conversational tension, not pure keyword density.",
      "Sentence boundaries respected so playback never feels abrupt.",
    ],
  },
  {
    title: "WhisperX Word Subtitles",
    badge: "Word-level",
    icon: AudioWaveform,
    description:
      "WhisperX large-v2 transcribes English audio and aligns every word to precise start and end timings.",
    details: [
      "Word JSON makes downstream recuts and syncing painless.",
      "Caption timing matches actual speech, not paragraph guesses.",
      "Foundation for English captions or Korean translation, depending on the selected run language.",
    ],
  },
  {
    title: "Auto Vertical Framing",
    badge: "Face-aware",
    icon: Scissors,
    description:
      "Columbia ASD face tracks steer 1080x1920 crops or blurred backgrounds, rendered with NVENC at 25 fps.",
    details: [
      "Active speaker detection per frame so the camera follows the right person.",
      "Falls back to blurred backdrop when the face track is uncertain.",
      "Output is publish-ready for YouTube Shorts, Reels, and TikTok.",
    ],
  },
  {
    title: "English or Korean Captions",
    badge: "Caption language",
    icon: Languages,
    description:
      "Each processing run uses one selected caption language. English captions are sourced from WhisperX; Korean captions come from Gemini translation.",
    details: [
      "Anton style for English emphasis lines.",
      "Noto Sans KR style for Korean lines.",
      "Choose English or Korean before starting the run.",
    ],
  },
  {
    title: "Secure S3 Storage",
    badge: "Signed URLs",
    icon: ShieldCheck,
    description:
      "Originals and clips live in a dedicated S3 bucket. The app fetches them only through AWS presigned URLs.",
    details: [
      "Per-user prefixes keep uploads isolated.",
      "Presigned URLs expire in 1 hour by default.",
      "Cleanup routines remove abandoned drafts.",
    ],
  },
  {
    title: "Dashboard Review Loop",
    badge: "Dashboard",
    icon: Layers,
    description:
      "Upload, request processing, review the clip list, play, download, and delete clips from a single view.",
    details: [
      "Status moves from queued to processing to processed without page reloads.",
      "Per-clip download and delete actions.",
      "Recoverable upload drafts in case the tab closes mid-flow.",
    ],
  },
];

export const featureComparison: ComparisonRow[] = [
  {
    capability: "Find highlight moments",
    manual: "Scrub through hours of audio and timestamp by hand.",
    automated: "Gemini 2.5 picks 1-4 Q&A moments per upload.",
  },
  {
    capability: "Add word-level captions",
    manual: "Hand-time captions or use a generic auto-captioner.",
    automated: "WhisperX word timings burned into the clip automatically.",
  },
  {
    capability: "Convert horizontal to vertical",
    manual: "Manually crop and reposition every cut.",
    automated:
      "Face-aware Columbia ASD crop with blurred backdrop fallback.",
  },
  {
    capability: "Choose caption language",
    manual: "Re-cut or re-caption manually when changing language.",
    automated:
      "English or Korean captions are selected per processing run.",
  },
];

export const featuresFaq: FaqItem[] = [
  {
    question: "How many clips does each run produce?",
    answer:
      "You choose 1, 2, 3, or 4 clips per upload. The AI selects the strongest Q&A moments and produces that many vertical clips.",
  },
  {
    question: "Is Korean captioning the same quality as English?",
    answer:
      "English captions come directly from WhisperX with word-level timing. Korean captions are produced by Gemini translation styled with Noto Sans KR. Both are usable for publishing, but English will track speech more tightly.",
  },
  {
    question: "Where are uploads and clips stored?",
    answer:
      "All originals and generated clips live in a dedicated AWS S3 bucket under per-user prefixes. The app only ever exposes them through short-lived presigned URLs.",
  },
  {
    question: "What is the file size limit?",
    answer:
      "Uploads are capped at 900 MB per .mp4. Long episodes still work, but very large files should be exported at a moderate bitrate before upload.",
  },
];
