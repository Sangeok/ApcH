import { Loader2, Play } from "lucide-react";

interface ClipVideoPlayerProps {
  src: string | null;
  isLoading: boolean;
  error?: string | null;
  onPlay?: () => void;
}

export function ClipVideoPlayer({
  src,
  isLoading,
  error,
  onPlay,
}: ClipVideoPlayerProps) {
  if (isLoading) {
    return (
      <div className="bg-muted flex h-full w-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!src && error) {
    return (
      <div className="bg-muted flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground text-xs">Video unavailable</p>
      </div>
    );
  }

  if (!src) {
    return (
      <div className="bg-muted flex h-full w-full items-center justify-center">
        <Play className="text-muted-foreground h-10 w-10 opacity-50" />
      </div>
    );
  }

  return (
    <div className="bg-muted">
      <video
        src={src}
        controls
        preload="metadata"
        className="h-full w-full rounded-md object-cover"
        onPlay={onPlay}
      />
    </div>
  );
}
