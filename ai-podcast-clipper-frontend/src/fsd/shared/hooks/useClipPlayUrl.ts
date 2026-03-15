"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getClipPlayUrl } from "~/fsd/features/clip/api";

interface UseClipPlayUrlReturn {
  playUrl: string | null;
  isLoading: boolean;
}

export function useClipPlayUrl(clipId: string): UseClipPlayUrlReturn {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchPlayUrl = async () => {
      setIsLoading(true);
      try {
        const result = await getClipPlayUrl(clipId);
        if (result.success) {
          setPlayUrl(result.data.url);
        } else {
          toast.error("Failed to get play url: " + result.error);
          console.error("Failed to get play url: " + result.error);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error("Failed to get play url: " + message);
        console.error("Failed to get play url: " + message);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchPlayUrl();
  }, [clipId]);

  return { playUrl, isLoading };
}
