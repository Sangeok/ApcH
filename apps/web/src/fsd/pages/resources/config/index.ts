import {
  Captions,
  CheckCircle2,
  Contact,
  Database,
  Download,
  FileVideo,
  LockKeyhole,
  Mail,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { ChangelogEntry, ProcessStep, ResourceCard } from "../model/types";

export const supportEmail = "hamsoo159@gmail.com";

export const aboutCards: ResourceCard[] = [
  {
    title: "Built for podcast conversations",
    description:
      "The product focuses on long-form dialogue, Q&A moments, speaker framing, and captions rather than generic clip generation.",
    icon: FileVideo,
  },
  {
    title: "Operated as a focused SaaS",
    description:
      "AI Podcast Clipper is maintained by SangEok and shipped as a narrow workflow for turning podcast uploads into reviewable clips.",
    icon: Contact,
  },
  {
    title: "Transparent about limits",
    description:
      "The public pages describe supported formats, clip counts, caption languages, and review requirements without promising fully automatic publishing.",
    icon: CheckCircle2,
  },
];

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

export const securityCards: ResourceCard[] = [
  {
    title: "Private upload path",
    description:
      "Uploads are written to user-specific S3 prefixes and are not exposed as public bucket objects by default.",
    icon: LockKeyhole,
  },
  {
    title: "Signed access links",
    description:
      "The app uses presigned URLs for upload and playback/download access rather than permanent public file URLs.",
    icon: ShieldCheck,
  },
  {
    title: "External processors are scoped",
    description:
      "Processing services receive only the media references needed to generate clips, captions, and framing output.",
    icon: Database,
  },
  {
    title: "Creator-controlled cleanup",
    description:
      "The dashboard supports deleting uploaded files and generated clips when creators no longer need them.",
    icon: Trash2,
  },
];

export const contactCards: ResourceCard[] = [
  {
    title: "Product support",
    description:
      "Use email for account, upload, processing, and clip review questions. Include the account email and upload time when relevant.",
    icon: Mail,
  },
  {
    title: "Bug reports",
    description:
      "Share the route, expected behavior, actual behavior, browser, and whether the issue affects upload, processing, billing, or playback.",
    icon: RefreshCw,
  },
  {
    title: "Security questions",
    description:
      "For file access, deletion, signed URLs, or processor questions, include enough context to reproduce the concern without sharing secrets.",
    icon: ShieldCheck,
  },
];

export const productCapabilities: ResourceCard[] = [
  {
    title: "Upload",
    description: "Accepts podcast-style .mp4 files up to 900 MB per upload.",
    icon: UploadCloud,
  },
  {
    title: "Highlight selection",
    description:
      "Scores transcript segments and selects 1-4 clips per upload based on the requested run settings.",
    icon: Sparkles,
  },
  {
    title: "Captions",
    description:
      "Supports English or Korean captions selected per processing run.",
    icon: Captions,
  },
  {
    title: "Vertical output",
    description:
      "Exports 1080x1920 .mp4 clips for YouTube Shorts, Instagram Reels, and TikTok review workflows.",
    icon: ScanFace,
  },
  {
    title: "Download",
    description:
      "Generated clips are played and downloaded from the authenticated dashboard through signed URLs.",
    icon: Download,
  },
];

export const securityFaq: FaqItem[] = [
  {
    question: "Are uploaded videos public?",
    answer:
      "No. Uploaded files are stored for authenticated processing and are not exposed as public bucket objects by default.",
  },
  {
    question: "How are files accessed by the app?",
    answer:
      "The app uses signed URLs for upload, playback, and download operations so access can expire instead of relying on permanent public links.",
  },
  {
    question: "Should creators review clips before publishing?",
    answer:
      "Yes. Creators should confirm rights, context, caption accuracy, and brand fit before publishing any generated clip.",
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

export const changelogEntries: ChangelogEntry[] = [
  {
    date: "2026-06-15",
    title: "Public trust and SEO resource pages",
    changes: [
      "Added public guide, comparison, about, contact, security, how-it-works, and changelog pages.",
      "Removed public media pages until first-party or fully licensed footage is available.",
      "Kept sitemap entries and internal links focused on rights-safe public pages.",
    ],
  },
  {
    date: "2026-06-14",
    title: "Search visibility plan",
    changes: [
      "Documented the public content and authority growth plan.",
      "Confirmed the primary issue is small crawlable surface and weak authority signals rather than a search blocking bug.",
    ],
  },
  {
    date: "2026-05-10",
    title: "Public marketing foundation",
    changes: [
      "Published core product, feature, pricing, and solution pages.",
      "Added sitemap and robots configuration for the canonical domain.",
    ],
  },
];
