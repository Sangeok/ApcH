import type { FaqItem } from "~/fsd/shared/lib/seo";

export interface GuideSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface GuidePageData {
  slug: string;
  title: string;
  description: string;
  primaryIntent: string;
  updatedAt: string;
  readingTime: string;
  sections: GuideSection[];
  checklist: string[];
  faq: FaqItem[];
  relatedPaths: Array<{
    label: string;
    href: string;
  }>;
}
