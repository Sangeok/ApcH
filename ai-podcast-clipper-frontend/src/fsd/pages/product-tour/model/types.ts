import type { LucideIcon } from "lucide-react";

export type TourStep = {
  index: number;
  title: string;
  description: string;
  icon: LucideIcon;
};

export type TourOutcome = {
  title: string;
  description: string;
  icon: LucideIcon;
};
