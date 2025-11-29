import type { LucideIcon } from "lucide-react";

export type FeatureCard = {
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  footnote: string;
};

export type WorkflowStep = {
  title: string;
  description: string;
  icon: LucideIcon;
  detail: string;
};

export type heroHighlight = {
  label: string;
  value: string;
  footnote: string;
};
