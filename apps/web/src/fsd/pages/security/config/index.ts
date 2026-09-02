import {
  Database,
  LockKeyhole,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type {
  ResourceCard,
} from "~/fsd/shared/ui/atoms/resource-card-grid";

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
