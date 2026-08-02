import { Instagram, MonitorPlay, Music2, Youtube } from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { PlatformOutcome } from "../model/types";

export const podcastToShortsPlatforms: PlatformOutcome[] = [
  {
    platform: "YouTube Shorts",
    spec: "1080x1920, up to 60s",
    description:
      "Vertical mp4 with burned-in captions ready for the YouTube Shorts shelf.",
    icon: Youtube,
  },
  {
    platform: "Instagram Reels",
    spec: "1080x1920 vertical",
    description:
      "Same export feeds Reels - no extra crop or caption pass needed.",
    icon: Instagram,
  },
  {
    platform: "TikTok",
    spec: "1080x1920 vertical",
    description:
      "Drop the file in directly. Captions are already burned in for sound-off viewers.",
    icon: Music2,
  },
  {
    platform: "Long-form recap",
    spec: "Same source, 1-4 clips",
    description:
      "Use the highlight clips as the cold open of a long-form video on any platform.",
    icon: MonitorPlay,
  },
];

export const podcastToShortsWorkflow = [
  {
    title: "Drop the long episode in",
    description:
      "Upload a podcast .mp4 up to 900 MB. No need to pre-edit or trim - the AI handles the cut.",
  },
  {
    title: "AI scores Q&A density",
    description:
      "Gemini 2.5 reads the transcript and ranks 40-60 second segments where a question lands a clear answer.",
  },
  {
    title: "Captions and 9:16 framing run together",
    description:
      "WhisperX timing and Columbia ASD face tracking happen in the same pass, not as separate exports.",
  },
  {
    title: "Review and download",
    description:
      "Each clip renders to S3 and is downloadable through a presigned URL inside the dashboard.",
  },
] as const;

export const podcastToShortsFaq: FaqItem[] = [
  {
    question: "Does this only work for YouTube Shorts?",
    answer:
      "No. The output is a 1080x1920 vertical mp4 with burned-in captions, which is the same shape Instagram Reels and TikTok expect. One run gives you a clip you can publish on all three platforms.",
  },
  {
    question: "Will the AI cut clips at the wrong place?",
    answer:
      "Highlights are scored on Q&A boundaries, not arbitrary timestamps. The pipeline preserves full sentence boundaries so the clip starts and ends on a natural beat.",
  },
  {
    question: "What happens to original audio quality?",
    answer:
      "Audio is preserved from the source mp4. Only captions and vertical framing are added on top - the underlying audio is not re-encoded beyond what the export step requires.",
  },
  {
    question: "Can I generate clips in Korean?",
    answer:
      "Yes. Choose Korean as the caption language for that processing run. The output is a Korean-captioned vertical mp4 styled with Noto Sans KR.",
  },
];
