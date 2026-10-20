"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CARD_NEWS_LIMITS,
  type CardNewsDetail,
} from "~/fsd/entities/card-news";
import type { CreditBalance } from "~/fsd/entities/user";
import { creditBalanceQueryOptions } from "~/fsd/features/credit-balance";
import { useQuery } from "@tanstack/react-query";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { useCardNewsEditor } from "../model/use-card-news-editor";

export default function CardNewsEditor({
  userId,
  initialDetail,
  generationEnabled,
  initialCreditBalance,
}: {
  userId: string;
  initialDetail: CardNewsDetail;
  generationEnabled: boolean;
  initialCreditBalance: CreditBalance;
}) {
  const {
    detail,
    draft,
    setDraft,
    hashtagText,
    setHashtagText,
    dirty,
    save,
    loadLatest,
    query,
    mutations,
  } = useCardNewsEditor(userId, initialDetail);
  const router = useRouter();
  const balanceQuery = useQuery(
    creditBalanceQueryOptions(userId, initialCreditBalance),
  );
  const balance = balanceQuery.data ?? initialCreditBalance;
  const paidGenerationBlocked =
    !generationEnabled || balance.available < 1 || Boolean(balanceQuery.error);
  const [selectedRevision, setSelectedRevision] = useState(
    initialDetail.publishedRevision,
  );
  const [error, setError] = useState<string | null>(null);
  const run = async (operation: () => Promise<unknown>) => {
    try {
      setError(null);
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Request failed");
    }
  };
  const editable = detail.status === "ready" && Boolean(draft) && !query.error;
  const failedRender = detail.jobs.find(
    (job) =>
      job.kind === "render" &&
      job.revision === detail.draftRevision &&
      job.status === "failed",
  );
  const fieldFailure = failedRender?.failureCode?.match(
    /^(text_overflow|unsupported_glyph|highlight_not_in_body)_cards_([0-6])_(title|body|highlight)$/,
  );
  const latestReady =
    detail.draftRevision === detail.publishedRevision &&
    detail.publishedRevision > 0;
  const revision =
    selectedRevision > 0 ? selectedRevision : detail.publishedRevision;
  const downloadReady =
    detail.completedRevisions.includes(revision) &&
    (revision !== detail.draftRevision || latestReady) &&
    detail.status !== "deleting";
  const exportRevision = () =>
    mutations.export.mutateAsync({ setId: detail.id, revision });
  const move = (index: number, direction: -1 | 1) => {
    if (
      !draft ||
      index <= 0 ||
      index >= draft.cards.length - 1 ||
      index + direction <= 0 ||
      index + direction >= draft.cards.length - 1
    )
      return;
    const cards = [...draft.cards];
    const card = cards[index]!;
    cards[index] = cards[index + direction]!;
    cards[index + direction] = card;
    setDraft({ ...draft, cards });
  };
  if (detail.status === "deleting")
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Deleting card news</h1>
        <p>
          Original video and clip remain available. This set is no longer
          accessible.
        </p>
        <p role="status">{detail.cleanup?.status ?? "Deletion accepted"}</p>
        {detail.cleanup?.lastError && (
          <p role="alert">Cleanup will retry: {detail.cleanup.lastError}</p>
        )}
        <Link href="/dashboard/card-news">Back to card news</Link>
      </section>
    );
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-muted-foreground text-sm"
            href="/dashboard/card-news"
          >
            Card news
          </Link>
          <h1 className="text-2xl font-semibold">Instagram card news</h1>
          <p className="text-muted-foreground text-sm">
            {detail.language} · Saved v{detail.draftRevision} · Completed v
            {detail.publishedRevision}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={
              paidGenerationBlocked ||
              Boolean(detail.activeJob) ||
              mutations.regenerate.isPending
            }
            onClick={() =>
              void run(async () => {
                if (
                  dirty &&
                  !window.confirm(
                    "Regenerating leaves this editor. Discard your unsaved changes?",
                  )
                )
                  return;
                if (
                  !window.confirm(
                    "Create a new AI card news set for 1 credit? Your current set will be preserved.",
                  )
                )
                  return;
                const result = await mutations.regenerate.mutateAsync({
                  clipId: detail.clipId,
                  regeneratedFromId: detail.id,
                  requestId: crypto.randomUUID(),
                  theme: draft?.theme ?? "light",
                });
                router.push(`/dashboard/card-news/${result.setId}`);
              })
            }
          >
            AI regenerate · 1 credit
          </Button>
          <span className="text-muted-foreground self-center text-xs">
            {generationEnabled
              ? `${balance.available} available · ${balance.reserved} reserved`
              : "New AI generation is currently unavailable"}
          </span>
          <Button
            variant="outline"
            disabled={Boolean(detail.activeJob) || mutations.remove.isPending}
            onClick={() =>
              void run(async () => {
                if (
                  !window.confirm(
                    dirty
                      ? "Delete this card news set, its images and your unsaved edits? Your original clip and other paid sets will remain."
                      : "Delete this card news set and all of its saved images? Your original clip and other paid sets will remain.",
                  )
                )
                  return;
                await mutations.remove.mutateAsync({ setId: detail.id });
                toast.success(
                  "Deletion accepted. Asset cleanup is in progress.",
                );
                await query.refetch();
              })
            }
          >
            Delete set
          </Button>
        </div>
      </header>
      {(error !== null || query.error !== null) && (
        <div role="alert" className="rounded border border-red-400 p-3">
          {error ?? query.error?.message}
          {error?.startsWith("revision_conflict") && (
            <Button
              className="ml-3"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void run(loadLatest)}
            >
              Load latest saved version
            </Button>
          )}
        </div>
      )}
      {dirty && (
        <p role="status" className="text-amber-700">
          Unsaved changes. Save before leaving this page.
        </p>
      )}
      {detail.activeJob && (
        <p role="status" className="rounded border p-4">
          {detail.activeJob.kind === "generate"
            ? "Generating card news"
            : `Rendering v${detail.activeJob.revision}`}{" "}
          · {detail.activeJob.stage}. You can leave and return; progress is
          saved.
        </p>
      )}
      {detail.status === "failed" && (
        <p role="alert">
          Generation failed. The reserved credit was released.{" "}
          {detail.jobs[0]?.failureCode}.
        </p>
      )}
      {failedRender && (
        <p role="alert" className="rounded border border-amber-400 p-3">
          Rendering v{failedRender.revision} failed:{" "}
          {fieldFailure
            ? `Card ${Number(fieldFailure[2]) + 1}, ${fieldFailure[3]}: ${fieldFailure[1]?.replaceAll("_", " ")}. Update this field and save again.`
            : failedRender.failureCode}
          . Previous completed versions remain available.
        </p>
      )}
      {detail.subtitleStatus && detail.subtitleStatus !== "ok" && (
        <p className="text-muted-foreground text-sm">
          Original subtitle status: {detail.subtitleStatus}. Card news uses the{" "}
          {detail.language} target language.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <label className="text-sm">
          Completed version{" "}
          <select
            className="ml-2 rounded border px-2 py-1"
            value={revision}
            onChange={(event) =>
              setSelectedRevision(Number(event.target.value))
            }
          >
            <option value={detail.draftRevision}>
              Latest v{detail.draftRevision}
              {!latestReady ? " (render pending)" : ""}
            </option>
            {detail.completedRevisions
              .filter((candidate) => candidate !== detail.draftRevision)
              .map((candidate) => (
                <option key={candidate} value={candidate}>
                  Previous completed v{candidate}
                </option>
              ))}
          </select>
        </label>
        <Button
          disabled={!downloadReady || mutations.export.isPending}
          onClick={() =>
            void run(async () => {
              const result = await exportRevision();
              window.location.assign(result.zipUrl);
            })
          }
        >
          Download ZIP
        </Button>
        <Button
          variant="outline"
          disabled={!downloadReady || mutations.export.isPending}
          onClick={() =>
            void run(async () => {
              const result = await exportRevision();
              await navigator.clipboard.writeText(
                `${result.caption}\n\n${result.hashtags.join(" ")}`,
              );
              toast.success(
                `Copied caption and hashtags for v${result.revision}`,
              );
            })
          }
        >
          Copy caption + hashtags
        </Button>
      </div>
      {detail.previewImages.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold">
            Rendered JPG preview · v{detail.publishedRevision}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {detail.previewImages.map((image, index) => (
              <div key={image.id}>
                <Image
                  unoptimized
                  width={1080}
                  height={1350}
                  className="aspect-[4/5] w-full rounded border object-contain"
                  src={image.url}
                  alt={`Completed card ${index + 1}`}
                />
                <Button
                  variant="link"
                  size="sm"
                  onClick={() =>
                    void run(async () => {
                      const result = await mutations.export.mutateAsync({
                        setId: detail.id,
                        revision: detail.publishedRevision,
                      });
                      const item = result.images[index];
                      if (item) window.location.assign(item.url);
                    })
                  }
                >
                  Download JPG {String(index + 1).padStart(2, "0")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      {draft && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <h2 className="font-semibold">Edit saved text</h2>
            {draft.cards.map((card, index) => (
              <fieldset
                key={card.id}
                disabled={!editable}
                className="space-y-3 rounded border p-4"
              >
                <legend className="px-1 text-sm">
                  {index + 1}. {card.role} ·{" "}
                  {card.provenance === "ai" ? "AI source based" : "User edited"}
                </legend>
                <label className="block text-sm">
                  Title
                  <input
                    className="bg-background mt-1 block w-full rounded border p-2"
                    maxLength={2 * CARD_NEWS_LIMITS.title}
                    value={card.title}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        cards: draft.cards.map((item) =>
                          item.id === card.id
                            ? { ...item, title: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Body
                  <textarea
                    className="bg-background mt-1 block min-h-24 w-full rounded border p-2"
                    maxLength={2 * CARD_NEWS_LIMITS.body}
                    value={card.body}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        cards: draft.cards.map((item) =>
                          item.id === card.id
                            ? { ...item, body: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Highlight
                  <input
                    className="bg-background mt-1 block w-full rounded border p-2"
                    maxLength={2 * CARD_NEWS_LIMITS.highlight}
                    value={card.highlight ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        cards: draft.cards.map((item) =>
                          item.id === card.id
                            ? { ...item, highlight: event.target.value || null }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                {card.role === "body" && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => move(index, -1)}
                      disabled={index === 1}
                    >
                      Move earlier
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => move(index, 1)}
                      disabled={index === draft.cards.length - 2}
                    >
                      Move later
                    </Button>
                  </div>
                )}
                {card.sourceSentenceIds.length > 0 && (
                  <details className="text-muted-foreground text-xs">
                    <summary>Original source evidence</summary>
                    {card.sourceSentenceIds.map((sentence) => (
                      <p key={sentence} className="mt-2">
                        {sentence + 1}. {detail.sourceSentences[sentence]}
                      </p>
                    ))}
                  </details>
                )}
              </fieldset>
            ))}
          </div>
          <div className="space-y-4">
            <fieldset
              disabled={!editable}
              className="space-y-3 rounded border p-4"
            >
              <legend>Appearance</legend>
              <label className="block text-sm">
                Theme
                <select
                  className="bg-background ml-2 rounded border p-1"
                  value={draft.theme}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      theme: event.target.value as "light" | "dark",
                    })
                  }
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="block text-sm">
                Accent
                <select
                  className="bg-background ml-2 rounded border p-1"
                  value={draft.accentColor}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      accentColor: event.target
                        .value as typeof draft.accentColor,
                    })
                  }
                >
                  {["#2563EB", "#7C3AED", "#059669", "#EA580C"].map((color) => (
                    <option key={color}>{color}</option>
                  ))}
                </select>
              </label>
              <p className="text-sm">Cover scene</p>
              {detail.coverCandidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name={`cover-${detail.id}`}
                    checked={draft.coverCandidateId === candidate.id}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        coverCandidateId:
                          candidate.id as typeof draft.coverCandidateId,
                      })
                    }
                  />
                  <Image
                    unoptimized
                    width={144}
                    height={96}
                    className="h-16 w-24 object-cover"
                    src={candidate.url}
                    alt={candidate.id}
                  />
                  {candidate.id}
                </label>
              ))}
            </fieldset>
            <label className="block text-sm">
              Caption
              <textarea
                disabled={!editable}
                className="bg-background mt-1 block min-h-36 w-full rounded border p-2"
                maxLength={2 * CARD_NEWS_LIMITS.caption}
                value={draft.caption}
                onChange={(event) =>
                  setDraft({ ...draft, caption: event.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              Hashtags
              <input
                disabled={!editable}
                className="bg-background mt-1 block w-full rounded border p-2"
                value={hashtagText}
                onChange={(event) => setHashtagText(event.target.value)}
              />
            </label>
            <Button
              className="w-full"
              disabled={!editable || !dirty || mutations.save.isPending}
              onClick={() => void run(save)}
            >
              Save + render · Free
            </Button>
            {!detail.activeJob &&
              detail.draftRevision !== detail.publishedRevision && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() =>
                    void run(() =>
                      mutations.retry.mutateAsync({
                        setId: detail.id,
                        revision: detail.draftRevision,
                      }),
                    )
                  }
                >
                  Retry rendering · Free
                </Button>
              )}
            <p className="text-muted-foreground text-xs">
              Manual edits use no AI or credits. Preview images update after
              rendering completes.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
