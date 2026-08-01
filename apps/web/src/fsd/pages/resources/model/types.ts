import type { LucideIcon } from "lucide-react";

export interface ResourceCard {
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface ProcessStep {
  title: string;
  description: string;
}

export interface ChangelogEntry {
  date: string;
  title: string;
  changes: string[];
}
