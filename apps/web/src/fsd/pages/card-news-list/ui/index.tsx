"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { CardNewsSummary } from "~/fsd/entities/card-news";
import { cardNewsListQueryOptions } from "~/fsd/features/card-news";

export default function CardNewsListPage({
  userId,
  initialSets,
  clipId,
}: {
  userId: string;
  initialSets: CardNewsSummary[];
  clipId?: string;
}) {
  const query = useQuery(cardNewsListQueryOptions(userId, initialSets, clipId));
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Card news</h1>
        <p className="text-muted-foreground mt-1">
          Instagram carousels from your completed clips. Manual edits and
          downloads are free.
        </p>
      </header>
      {query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {query.data?.map((set) => (
            <Link
              className="hover:bg-muted rounded-lg border p-5"
              key={set.id}
              href={`/dashboard/card-news/${set.id}`}
            >
              <h2 className="font-semibold">
                {set.language} card news · {set.cardCount || "Generating"} cards
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">
                {set.status} · Saved v{set.draftRevision} · Completed v
                {set.publishedRevision}
              </p>
              {set.activeJob && (
                <p className="mt-2 text-sm" role="status">
                  {set.activeJob.stage}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
      {!query.error && !query.data?.length && (
        <p>Create your first card news set from a completed clip.</p>
      )}
      <Link className="text-sm underline" href="/dashboard">
        Back to clips
      </Link>
    </main>
  );
}
