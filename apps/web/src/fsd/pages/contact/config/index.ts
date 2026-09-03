import {
  Mail,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type {
  ResourceCard,
} from "~/fsd/shared/ui/atoms/resource-card-grid";

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
