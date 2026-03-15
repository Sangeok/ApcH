import { Loader2, Play } from "lucide-react";

interface ClipVideoPlayerProps {
  src: string | null;
  isLoading: boolean;
}

export function ClipVideoPlayer({ src, isLoading }: ClipVideoPlayerProps) {
  return (
    <div className="bg-muted">
      {isLoading && (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      )}
      {!isLoading && src && (
        <video
          src={src}
          controls
          preload="metadata"
          className="h-full w-full rounded-md object-cover"
        />
      )}
      {!isLoading && !src && (
        <div className="flex h-full w-full items-center justify-center">
          <Play className="text-muted-foreground h-10 w-10 opacity-50" />
        </div>
      )}
    </div>
  );
}
