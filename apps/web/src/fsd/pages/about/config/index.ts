import {
  CheckCircle2,
  Contact,
  FileVideo,
} from "lucide-react";
import type {
  ResourceCard,
} from "~/fsd/shared/ui/atoms/resource-card-grid";

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
