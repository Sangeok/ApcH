import type { FaqItem } from "~/fsd/shared/lib/seo";

export interface CompareRow {
  criterion: string;
  manual: string;
  aiAssisted: string;
}

export interface ComparePageData {
  slug: string;
  title: string;
  description: string;
  href: string;
  rows: CompareRow[];
  faq: FaqItem[];
}
