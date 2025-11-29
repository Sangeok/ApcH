"use client";

import type { Clip } from "generated/prisma";
import { useOptimistic } from "react";
import ClipCard from "./_component/ClipCard";

interface ClipDisplayProps {
  clips: Clip[];
}

export default function ClipDisplay({ clips }: ClipDisplayProps) {
  const [optimisticClips, removeClipOptimistic] = useOptimistic(
    clips,
    (state, clipId: string) => state.filter((clip) => clip.id !== clipId),
  );

  if (clips.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-center">No clips found</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {optimisticClips.map((clip) => {
        return (
          <ClipCard
            key={clip.id}
            clip={clip}
            onDeleted={removeClipOptimistic}
          />
        );
      })}
    </div>
  );
}
