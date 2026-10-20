import { createHash } from "node:crypto";
import { z } from "zod";
import { countCardNewsTextCodePoints } from "./text-length";
import {
  CARD_NEWS_ACCENT_COLORS,
  CARD_NEWS_COVER_IDS,
  CARD_NEWS_LIMITS,
  CARD_NEWS_STAGES,
  CARD_NEWS_THEMES,
} from "./types";

const version = z.literal(1);
const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
const versionName = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_.-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
function codePointLimitedString(schema: z.ZodString, maximum: number) {
  return schema.superRefine((value, ctx) => {
    if (countCardNewsTextCodePoints(value) > maximum) {
      ctx.addIssue({
        code: "too_big",
        type: "string",
        maximum,
        inclusive: true,
        exact: false,
      });
    }
  });
}
const nullableText = codePointLimitedString(z.string(), 2000).nullable();
const language = z.enum(["English", "Korean"]);
const boundedText = (max: number) =>
  codePointLimitedString(z.string(), max).refine(
    (value) => value.trim().length > 0,
    "Text must not be blank",
  );
const key = codePointLimitedString(z.string().min(1), 1024).refine(
  (value) =>
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value
      .split("/")
      .some((segment) => segment === "." || segment === ".." || segment === ""),
  "Unsafe object key",
);
const prefix = z
  .string()
  .regex(
    /^card-news\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/e[1-9][0-9]*\/$/,
  );
const timestamp = z.string().datetime({ offset: true });
const finiteTime = z
  .number()
  .finite()
  .min(0)
  .max(86400 * 365);
const hashtags = z
  .array(
    codePointLimitedString(
      z
        .string()
        .min(2)
        .regex(/^#[^\s#]+$/),
      CARD_NEWS_LIMITS.hashtagLength,
    ),
  )
  .max(CARD_NEWS_LIMITS.hashtagCount)
  .refine(
    (values) => new Set(values).size === values.length,
    "Duplicate hashtags",
  );

export function splitSourceSentences(scriptText: string): string[] {
  return scriptText
    .split(/(?<=[.!?。！？])\s+|\r?\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

export const cardNewsSourceSchema = z
  .object({
    schemaVersion: version,
    clipId: id,
    processingAttempt: z.number().int().positive(),
    uploadedFileId: id,
    s3Key: key,
    clipS3Key: key,
    startSeconds: finiteTime,
    endSeconds: finiteTime,
    scriptText: boundedText(100000),
    hook: nullableText,
    payoff: nullableText,
    language,
    subtitleStatus: codePointLimitedString(z.string(), 80).nullable(),
    sourceSentenceCount: z.number().int().positive().max(10000),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (source.endSeconds <= source.startSeconds)
      ctx.addIssue({
        code: "custom",
        path: ["endSeconds"],
        message: "Invalid source interval",
      });
    if (
      splitSourceSentences(source.scriptText).length !==
      source.sourceSentenceCount
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceSentenceCount"],
        message: "Source sentence count mismatch",
      });
    }
  });

const cardSchema = z
  .object({
    id,
    role: z.enum(["cover", "body", "summary"]),
    title: boundedText(CARD_NEWS_LIMITS.title),
    body: codePointLimitedString(z.string(), CARD_NEWS_LIMITS.body),
    highlight: codePointLimitedString(
      z.string(),
      CARD_NEWS_LIMITS.highlight,
    ).nullable(),
    sourceSentenceIds: z.array(z.number().int().min(0)).max(10000),
    provenance: z.enum(["ai", "user-edited"]),
  })
  .strict();

export const cardNewsDraftSchema = z
  .object({
    schemaVersion: version,
    language,
    cards: z
      .array(cardSchema)
      .min(CARD_NEWS_LIMITS.minCards)
      .max(CARD_NEWS_LIMITS.maxCards),
    theme: z.enum(CARD_NEWS_THEMES),
    accentColor: z.enum(CARD_NEWS_ACCENT_COLORS),
    coverCandidateId: z.enum(CARD_NEWS_COVER_IDS),
    caption: boundedText(CARD_NEWS_LIMITS.caption),
    hashtags,
  })
  .strict()
  .superRefine((draft, ctx) => {
    if (
      new Set(draft.cards.map((card) => card.id)).size !== draft.cards.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cards"],
        message: "Duplicate card IDs",
      });
    }
    draft.cards.forEach((card, index) => {
      const expectedRole =
        index === 0
          ? "cover"
          : index === draft.cards.length - 1
            ? "summary"
            : "body";
      if (card.role !== expectedRole)
        ctx.addIssue({
          code: "custom",
          path: ["cards", index, "role"],
          message: "Invalid card role order",
        });
      if (
        new Set(card.sourceSentenceIds).size !==
          card.sourceSentenceIds.length ||
        (card.provenance === "ai" && card.sourceSentenceIds.length === 0)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["cards", index, "sourceSentenceIds"],
          message: "Invalid source evidence",
        });
      }
    });
  });

const assetFields = {
  key,
  sha256: hash,
  contentType: z.literal("image/jpeg"),
  sizeBytes: z.number().int().positive(),
};
const candidateSchema = z
  .object({
    id: z.enum(CARD_NEWS_COVER_IDS),
    ...assetFields,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export const cardNewsInputSchema = z
  .object({
    schemaVersion: version,
    mode: z.enum(["generate", "render"]),
    jobId: id,
    setId: id,
    userId: id,
    executionEpoch: z.number().int().positive(),
    revision: z.number().int().positive(),
    sourceHash: hash,
    source: cardNewsSourceSchema,
    draft: cardNewsDraftSchema.nullable(),
    coverCandidates: z.array(candidateSchema),
    initialTheme: z.enum(CARD_NEWS_THEMES),
    cardCount: z.number().int().min(3).max(7),
    outputPrefix: prefix,
    callbackUrl: codePointLimitedString(z.string().url(), 2048).refine(
      (value) => new URL(value).protocol === "https:",
      "HTTPS callback required",
    ),
    writeDeadlineAt: timestamp,
    templateVersion: versionName,
    fontVersion: versionName,
    promptVersion: versionName,
    modelVersion: codePointLimitedString(z.string().min(1), 160),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.outputPrefix !==
      `card-news/${input.userId}/${input.setId}/${input.jobId}/e${input.executionEpoch}/`
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["outputPrefix"],
        message: "Output prefix binding mismatch",
      });
    }
    if (canonicalSourceHash(input.source) !== input.sourceHash)
      ctx.addIssue({
        code: "custom",
        path: ["sourceHash"],
        message: "Source hash mismatch",
      });
    if (
      input.mode === "generate" &&
      (input.draft !== null ||
        input.coverCandidates.length !== 0 ||
        input.revision !== 1)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["draft"],
        message: "Invalid generate snapshot",
      });
    }
    if (
      input.mode === "render" &&
      (!input.draft || input.coverCandidates.length !== 3)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["draft"],
        message: "Render requires approved draft and cover candidates",
      });
    }
    if (input.draft) validateDraftEvidence(input.draft, input.source, ctx);
    if (
      new Set(input.coverCandidates.map((candidate) => candidate.id)).size !==
      input.coverCandidates.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["coverCandidates"],
        message: "Duplicate cover candidate IDs",
      });
    }
  });

export const cardNewsCallbackSchema = z
  .object({
    schemaVersion: version,
    jobId: id,
    executionEpoch: z.number().int().positive(),
    revision: z.number().int().positive(),
    invocationId: z.string().uuid(),
    outcome: z.enum(["started", "progress", "completed", "failed"]),
    modalCallId: codePointLimitedString(z.string().min(1), 256).nullable(),
    sequence: z.number().int().min(0),
    stage: z.enum(CARD_NEWS_STAGES),
    manifestKey: key.nullable(),
    failureCode: id.nullable(),
  })
  .strict()
  .superRefine((callback, ctx) => {
    if (callback.outcome === "started" && !callback.modalCallId)
      ctx.addIssue({
        code: "custom",
        path: ["modalCallId"],
        message: "Started requires a call ID",
      });
    if (
      callback.outcome === "completed" &&
      (!callback.manifestKey ||
        callback.failureCode !== null ||
        callback.stage !== "completed")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid completion notification",
      });
    }
    if (
      callback.outcome === "failed" &&
      (!callback.failureCode ||
        callback.manifestKey !== null ||
        callback.stage !== "failed")
    ) {
      ctx.addIssue({ code: "custom", message: "Invalid failure notification" });
    }
    if (
      ["started", "progress"].includes(callback.outcome) &&
      (callback.manifestKey !== null || callback.failureCode !== null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Unexpected notification output",
      });
    }
  });

export const cardNewsManifestSchema = z
  .object({
    schemaVersion: version,
    jobId: id,
    executionEpoch: z.number().int().positive(),
    revision: z.number().int().positive(),
    invocationId: z.string().uuid(),
    sourceHash: hash,
    templateVersion: versionName,
    fontVersion: versionName,
    promptVersion: versionName,
    modelVersion: codePointLimitedString(z.string().min(1), 160),
    draftDocument: cardNewsDraftSchema,
    cards: z
      .array(
        z
          .object({
            id,
            ...assetFields,
            width: z.literal(1080),
            height: z.literal(1350),
          })
          .strict(),
      )
      .min(3)
      .max(7),
    coverCandidates: z.array(candidateSchema).length(3),
    zip: z
      .object({
        key,
        sha256: hash,
        contentType: z.literal("application/zip"),
        sizeBytes: z.number().int().positive(),
      })
      .strict(),
    caption: boundedText(CARD_NEWS_LIMITS.caption),
    hashtags,
    validation: z
      .object({
        imagesDecoded: z.literal(true),
        zipVerified: z.literal(true),
        textFits: z.literal(true),
      })
      .strict(),
    usageMetrics: z
      .object({
        modelInputTokens: z.number().int().min(0),
        modelOutputTokens: z.number().int().min(0),
        cpuMilliseconds: z.number().finite().min(0),
        storageBytes: z.number().int().min(0),
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (
      manifest.cards.length !== manifest.draftDocument.cards.length ||
      manifest.cards.some(
        (card, index) => card.id !== manifest.draftDocument.cards[index]?.id,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cards"],
        message: "Image order does not match draft",
      });
    }
    const keys = [
      ...manifest.cards,
      ...manifest.coverCandidates,
      manifest.zip,
    ].map((asset) => asset.key);
    if (
      new Set(keys).size !== keys.length ||
      new Set(manifest.coverCandidates.map((candidate) => candidate.id))
        .size !== 3
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Duplicate output key or cover candidate ID",
      });
    }
    if (
      manifest.caption !== manifest.draftDocument.caption ||
      canonicalJson(manifest.hashtags) !==
        canonicalJson(manifest.draftDocument.hashtags)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Export copy differs from rendered draft",
      });
    }
  });

export const producerStatusRequestSchema = z
  .object({
    schemaVersion: version,
    kind: z.enum(["card-news", "video"]),
    referenceId: id,
    modalCallId: codePointLimitedString(z.string().min(1), 256),
  })
  .strict();
export const producerStatusResponseSchema = z
  .object({
    schemaVersion: version,
    status: z.enum(["pending", "ended", "unknown"]),
  })
  .strict();

export type CardNewsSource = z.infer<typeof cardNewsSourceSchema>;
export type CardNewsInput = z.infer<typeof cardNewsInputSchema>;
export type CardNewsCallback = z.infer<typeof cardNewsCallbackSchema>;
export type CardNewsManifest = z.infer<typeof cardNewsManifestSchema>;
export type ProducerStatusRequest = z.infer<typeof producerStatusRequestSchema>;
export type ProducerStatusResponse = z.infer<
  typeof producerStatusResponseSchema
>;

export function canonicalJson(value: unknown): string {
  function normalize(item: unknown): unknown {
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return item.map(normalize);
    if (typeof item === "object" && item !== null)
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([name, child]) => [name, normalize(child)]),
      );
    throw new Error("Non-JSON contract value");
  }
  return JSON.stringify(normalize(value));
}

export function canonicalSourceHash(source: CardNewsSource): string {
  return createHash("sha256")
    .update(canonicalJson(source), "utf8")
    .digest("hex");
}

function validateDraftEvidence(
  draft: z.infer<typeof cardNewsDraftSchema>,
  source: CardNewsSource,
  ctx: z.RefinementCtx,
): void {
  if (draft.language !== source.language)
    ctx.addIssue({
      code: "custom",
      path: ["draft", "language"],
      message: "Draft language mismatch",
    });
  if (
    draft.cards.some((card) =>
      card.sourceSentenceIds.some(
        (sentenceId) => sentenceId >= source.sourceSentenceCount,
      ),
    )
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["draft", "cards"],
      message: "Unknown source sentence ID",
    });
  }
}

export function parseCardNewsSource(value: unknown): CardNewsSource {
  return cardNewsSourceSchema.parse(value);
}
export function parseCardNewsInput(value: unknown): CardNewsInput {
  return cardNewsInputSchema.parse(value);
}
export function parseCardNewsDraft(
  value: unknown,
): z.infer<typeof cardNewsDraftSchema> {
  return cardNewsDraftSchema.parse(value);
}
export function parseCardNewsCallback(value: unknown): CardNewsCallback {
  return cardNewsCallbackSchema.parse(value);
}
export function parseCardNewsManifest(value: unknown): CardNewsManifest {
  return cardNewsManifestSchema.parse(value);
}
export function parseProducerStatusRequest(
  value: unknown,
): ProducerStatusRequest {
  return producerStatusRequestSchema.parse(value);
}
export function parseProducerStatusResponse(
  value: unknown,
): ProducerStatusResponse {
  return producerStatusResponseSchema.parse(value);
}

export function validateManifestBinding(
  manifest: CardNewsManifest,
  input: CardNewsInput,
): void {
  if (
    manifest.jobId !== input.jobId ||
    manifest.executionEpoch !== input.executionEpoch ||
    manifest.revision !== input.revision ||
    manifest.sourceHash !== input.sourceHash ||
    manifest.templateVersion !== input.templateVersion ||
    manifest.fontVersion !== input.fontVersion ||
    manifest.promptVersion !== input.promptVersion ||
    manifest.modelVersion !== input.modelVersion
  ) {
    throw new Error("Manifest input binding mismatch");
  }
  const invocationPrefix = `${input.outputPrefix}${manifest.invocationId}/`;
  if (
    ![...manifest.cards, manifest.zip].every((asset) =>
      asset.key.startsWith(invocationPrefix),
    )
  )
    throw new Error("Manifest output prefix mismatch");
  if (input.mode === "generate") {
    if (
      !manifest.coverCandidates.every((asset) =>
        asset.key.startsWith(invocationPrefix),
      )
    )
      throw new Error("Manifest cover prefix mismatch");
    if (
      manifest.draftDocument.theme !== input.initialTheme ||
      manifest.draftDocument.cards.some((card) => card.provenance !== "ai")
    )
      throw new Error("Invalid generated draft");
  } else if (
    canonicalJson(manifest.draftDocument) !== canonicalJson(input.draft) ||
    canonicalJson(manifest.coverCandidates) !==
      canonicalJson(input.coverCandidates)
  )
    throw new Error("Rendered snapshot changed");
  parseCardNewsInput({
    ...input,
    mode: "render",
    draft: manifest.draftDocument,
    coverCandidates: manifest.coverCandidates,
  });
}
