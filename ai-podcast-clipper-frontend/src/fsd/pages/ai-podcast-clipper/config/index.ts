import { Briefcase, Mic, Users, Youtube } from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { AudienceCard, CapabilityRow } from "../model/types";

export const clipperAudiences: AudienceCard[] = [
  {
    audience: "Podcast hosts",
    description:
      "Need short-form clips to promote each episode without hiring a dedicated editor.",
    icon: Mic,
  },
  {
    audience: "YouTube creators",
    description:
      "Run long-form interview shows and want Shorts that actually pull from real moments, not template snippets.",
    icon: Youtube,
  },
  {
    audience: "Content teams",
    description:
      "Manage a backlog of episodes and want a predictable pipeline instead of per-clip manual editing.",
    icon: Users,
  },
  {
    audience: "Agencies",
    description:
      "Service multiple creator clients and need a tool that handles cropping, captioning, and selected-language output in one pass.",
    icon: Briefcase,
  },
];

export const clipperCapabilities: CapabilityRow[] = [
  {
    capability: "Highlight detection",
    description:
      "Gemini 2.5 picks Q&A moments at 40-60 seconds, not arbitrary clip lengths.",
  },
  {
    capability: "Word-level transcription",
    description:
      "WhisperX produces aligned word timings used for both captions and edit boundaries.",
  },
  {
    capability: "Active-speaker vertical framing",
    description:
      "Columbia ASD drives 1080x1920 cropping with a blurred-backdrop fallback.",
  },
  {
    capability: "Selectable caption language",
    description:
      "Each processing run exports clips with English or Korean captions based on the selected language.",
  },
  {
    capability: "Per-user S3 storage",
    description:
      "Originals and clips live in scoped prefixes accessed only via presigned URLs.",
  },
  {
    capability: "Dashboard review",
    description:
      "Status moves from queued to processing to processed without manual polling.",
  },
];

export const clipperFaq: FaqItem[] = [
  {
    question: "What is an AI podcast clipper?",
    answer:
      "An AI podcast clipper takes a long-form podcast video, uses AI to identify the strongest highlight moments, and produces short-form clips with captions and the right aspect ratio for platforms like YouTube Shorts.",
  },
  {
    question: "How is this different from a generic AI video editor?",
    answer:
      "AI Podcast Clipper is shaped for long-form conversation. The highlight model is tuned for Q&A density rather than action cues, and the cropping uses active-speaker detection so the host or guest stays in frame as conversation moves.",
  },
  {
    question: "Can I use it for non-podcast video?",
    answer:
      "Technically the pipeline accepts any .mp4 up to 900 MB. Quality of highlight selection drops on non-conversational content because the model is trained to surface dialogue beats.",
  },
  {
    question: "Does it replace a human editor?",
    answer:
      "It removes the repetitive parts - finding moments, cropping, captioning, and translating - so a human editor can focus on selection, thumbnail, and platform-specific copy.",
  },
];
