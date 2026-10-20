import { z } from "zod";
import {
  CARD_NEWS_LIMITS,
  countCardNewsTextCodePoints,
} from "~/fsd/entities/card-news";

const withinLength = (max: number) => (value: string) =>
  countCardNewsTextCodePoints(value) <= max;

export const editorCardSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9_-]+$/),
    role: z.enum(["cover", "body", "summary"]),
    title: z
      .string()
      .trim()
      .min(1)
      .refine(withinLength(CARD_NEWS_LIMITS.title)),
    body: z.string().trim().refine(withinLength(CARD_NEWS_LIMITS.body)),
    highlight: z
      .string()
      .refine(withinLength(CARD_NEWS_LIMITS.highlight))
      .nullable(),
    sourceSentenceIds: z.array(z.number().int().nonnegative()).max(10000),
    provenance: z.enum(["ai", "user-edited"]),
  })
  .strict();

export const editorDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    language: z.enum(["English", "Korean"]),
    cards: z
      .array(editorCardSchema)
      .min(CARD_NEWS_LIMITS.minCards)
      .max(CARD_NEWS_LIMITS.maxCards),
    theme: z.enum(["light", "dark"]),
    accentColor: z.enum(["#2563EB", "#7C3AED", "#059669", "#EA580C"]),
    coverCandidateId: z.enum(["cover-25", "cover-50", "cover-75"]),
    caption: z
      .string()
      .trim()
      .min(1)
      .refine(withinLength(CARD_NEWS_LIMITS.caption)),
    hashtags: z
      .array(
        z
          .string()
          .min(2)
          .regex(/^#[^\s#]+$/)
          .refine(withinLength(CARD_NEWS_LIMITS.hashtagLength)),
      )
      .max(CARD_NEWS_LIMITS.hashtagCount),
  })
  .strict()
  .superRefine((draft, context) => {
    if (new Set(draft.cards.map((card) => card.id)).size !== draft.cards.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Card IDs must be unique",
        path: ["cards"],
      });
    draft.cards.forEach((card, index) => {
      const role =
        index === 0
          ? "cover"
          : index === draft.cards.length - 1
            ? "summary"
            : "body";
      if (card.role !== role)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Keep cover first and summary last",
          path: ["cards", index, "role"],
        });
      if (card.highlight && !card.body.includes(card.highlight))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Highlight must occur in this card's body. Update or clear it.",
          path: ["cards", index, "highlight"],
        });
    });
  });

export type EditorDraft = z.infer<typeof editorDraftSchema>;

export function countEditedCardNewsFields(
  previous: EditorDraft,
  next: EditorDraft,
): number {
  let count = 0;
  for (const card of next.cards) {
    const old = previous.cards.find((candidate) => candidate.id === card.id);
    if (!old) continue;
    count +=
      Number(old.title !== card.title) +
      Number(old.body !== card.body) +
      Number(old.highlight !== card.highlight);
  }
  for (const key of [
    "caption",
    "theme",
    "accentColor",
    "coverCandidateId",
  ] as const)
    count += Number(previous[key] !== next[key]);
  count += Number(
    JSON.stringify(previous.hashtags) !== JSON.stringify(next.hashtags),
  );
  const bodyOrder = (draft: EditorDraft) =>
    draft.cards
      .filter((card) => card.role === "body")
      .map((card) => card.id)
      .join(",");
  return count + Number(bodyOrder(previous) !== bodyOrder(next));
}

export function markEditedCards(
  previous: EditorDraft,
  next: EditorDraft,
): EditorDraft {
  return {
    ...next,
    cards: next.cards.map((card) => {
      const old = previous.cards.find((candidate) => candidate.id === card.id);
      return old &&
        old.title === card.title &&
        old.body === card.body &&
        old.highlight === card.highlight
        ? {
            ...card,
            provenance: old.provenance,
            sourceSentenceIds: old.sourceSentenceIds,
          }
        : { ...card, provenance: "user-edited", sourceSentenceIds: [] };
    }),
  };
}
