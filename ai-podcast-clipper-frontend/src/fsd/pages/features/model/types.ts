import type { LucideIcon } from "lucide-react";

export type FeatureCard = {
  title: string;
  badge: string;
  description: string;
  details: string[];
  icon: LucideIcon;
};

export type ComparisonRow = {
  capability: string;
  manual: string;
  automated: string;
};
