"use client";

import type { Clip } from "@repo/db";
import { useOptimistic } from "react";
import ClipCard from "./_component/ClipCard";
import type { CardNewsSummary } from "~/fsd/entities/card-news";

interface ClipDisplayProps {
  clips: Clip[];
  cardNewsContext?: {
    userId: string;
    enabled: boolean;
    creditBalance: { owned: number; reserved: number; available: number };
    sets: CardNewsSummary[];
  };
}

export default function ClipDisplay({
  clips,
  cardNewsContext,
}: ClipDisplayProps) {
  const [optimisticClips, removeClipOptimistic] = useOptimistic(
    clips,
    (state, clipId: string) => state.filter((clip) => clip.id !== clipId),
  );

  if (optimisticClips.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-center">No clips found</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {optimisticClips.map((clip) => (
        <ClipCard
          key={clip.id}
          clip={clip}
          onOptimisticRemove={removeClipOptimistic}
          cardNewsContext={cardNewsContext}
        />
      ))}
    </div>
  );
}
