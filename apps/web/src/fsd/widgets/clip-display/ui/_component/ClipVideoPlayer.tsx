import { Loader2, Play } from "lucide-react";
import type { PlayUrlState } from "~/fsd/shared/lib/use-play-url";

interface ClipVideoPlayerProps {
  state: PlayUrlState;
  onPlay?: () => void;
}

export function ClipVideoPlayer({ state, onPlay }: ClipVideoPlayerProps) {
  switch (state.status) {
    case "loading":
      return (
        <div className="bg-muted flex h-full w-full items-center justify-center">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      );
    case "error":
      return (
        <div className="bg-muted flex h-full w-full items-center justify-center">
          <p className="text-muted-foreground text-xs">Video unavailable</p>
        </div>
      );
    case "idle":
      return (
        <div className="bg-muted flex h-full w-full items-center justify-center">
          <Play className="text-muted-foreground h-10 w-10 opacity-50" />
        </div>
      );
    case "ready":
      return (
        <div className="bg-muted">
          <video
            src={state.url}
            controls
            preload="metadata"
            className="h-full w-full rounded-md object-cover"
            onPlay={onPlay}
          />
        </div>
      );
    default: {
      // variant를 추가하고 여기를 잊으면 컴파일이 멈춘다.
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
