import {
  CheckCircle2,
  Download,
  Languages,
  ScanFace,
  Scissors,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { TourOutcome, TourStep } from "../model/types";

export const productTourSteps: TourStep[] = [
  {
    index: 1,
    title: "Upload a podcast video",
    description:
      "Drag and drop a long-form podcast .mp4 (up to 900 MB). The file lands on a per-user S3 prefix and is never public.",
    icon: UploadCloud,
  },
  {
    index: 2,
    title: "AI selects Q&A highlights",
    description:
      "Gemini 2.5 reads the WhisperX transcript and picks 1-4 question-and-answer moments at 40-60 seconds each.",
    icon: Sparkles,
  },
  {
    index: 3,
    title: "Captions and vertical framing",
    description:
      "Word-level subtitles are styled and burned in, while Columbia ASD face tracks drive the 1080x1920 crop.",
    icon: Scissors,
  },
  {
    index: 4,
    title: "Review, download, publish",
    description:
      "Open the dashboard, watch each clip, download what you want to keep, and delete the rest. No re-uploads.",
    icon: CheckCircle2,
  },
];

export const productTourOutcomes: TourOutcome[] = [
  {
    title: "Vertical 1080x1920 mp4",
    description:
      "Ready for YouTube Shorts, Instagram Reels, and TikTok with no extra editing pass.",
    icon: ScanFace,
  },
  {
    title: "English or Korean captions",
    description:
      "WhisperX for English word timing, Gemini-translated Korean styled with Noto Sans KR.",
    icon: Languages,
  },
  {
    title: "Per-clip download links",
    description:
      "Each clip ships through a presigned S3 URL that expires in 1 hour, so links stay private.",
    icon: Download,
  },
];

export const productTourFaq: FaqItem[] = [
  {
    question: "Do I need an account to see the product tour?",
    answer:
      "No. The product tour walks through every step without login. You only need an account to upload your own podcast and generate clips.",
  },
  {
    question: "What does the free trial include?",
    answer:
      "New accounts start with 3 free credits. Credits are deducted after a successful processing run, one credit per generated clip in that completed run, so a completed 3-clip result uses the full trial balance.",
  },
  {
    question: "How long does processing take?",
    answer:
      "Most uploads finish within minutes. Actual time depends on file size, queue load, and GPU availability on the processing backend.",
  },
  {
    question: "Which video formats are supported?",
    answer:
      "AI Podcast Clipper accepts .mp4 podcast videos up to 900 MB. The output is also .mp4 in vertical 1080x1920 with burned-in captions.",
  },
];
