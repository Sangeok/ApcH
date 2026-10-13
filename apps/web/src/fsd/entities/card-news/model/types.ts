export const CARD_NEWS_THEMES = ["light", "dark"] as const;
export const CARD_NEWS_ACCENT_COLORS = [
  "#2563EB",
  "#7C3AED",
  "#059669",
  "#EA580C",
] as const;
export const CARD_NEWS_COVER_IDS = [
  "cover-25",
  "cover-50",
  "cover-75",
] as const;
export const CARD_NEWS_STAGES = [
  "accepted",
  "generating-text",
  "extracting-cover",
  "rendering",
  "packaging",
  "completed",
  "failed",
] as const;
export const CARD_NEWS_LIMITS = {
  minCards: 3,
  maxCards: 7,
  title: 80,
  body: 500,
  highlight: 80,
  caption: 2200,
  hashtagCount: 30,
  hashtagLength: 80,
} as const;
export type CardNewsLanguage = "English" | "Korean";
export type CardNewsStage = (typeof CARD_NEWS_STAGES)[number];
export type DraftCard = {
  id: string;
  role: "cover" | "body" | "summary";
  title: string;
  body: string;
  highlight: string | null;
  sourceSentenceIds: number[];
  provenance: "ai" | "user-edited";
};
export type DraftDocument = {
  schemaVersion: 1;
  language: CardNewsLanguage;
  cards: DraftCard[];
  theme: (typeof CARD_NEWS_THEMES)[number];
  accentColor: (typeof CARD_NEWS_ACCENT_COLORS)[number];
  coverCandidateId: (typeof CARD_NEWS_COVER_IDS)[number];
  caption: string;
  hashtags: string[];
};
export type CardNewsJobSummary = {
  id: string;
  kind: "generate" | "render";
  revision: number;
  status: "pending" | "running" | "completed" | "failed" | "superseded";
  stage: CardNewsStage;
  failureCode: string | null;
  createdAt: string;
};
export type CardNewsSummary = {
  id: string;
  clipId: string;
  uploadedFileId: string;
  language: CardNewsLanguage;
  status: "generating" | "ready" | "failed" | "deleting";
  draftRevision: number;
  publishedRevision: number;
  cardCount: number;
  activeJob: CardNewsJobSummary | null;
  createdAt: string;
  regeneratedFromId: string | null;
};
export type CardNewsDetail = CardNewsSummary & {
  draftDocument: DraftDocument | null;
  sourceSentences: string[];
  subtitleStatus: string | null;
  completedRevisions: number[];
  jobs: CardNewsJobSummary[];
  coverCandidates: { id: string; url: string }[];
  previewImages: { id: string; url: string }[];
  cleanup: { id: string; status: string; lastError: string | null } | null;
};
export type CardNewsExport = {
  revision: number;
  images: { id: string; filename: string; url: string }[];
  zipUrl: string;
  caption: string;
  hashtags: string[];
};
