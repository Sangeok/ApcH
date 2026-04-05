"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "~/fsd/shared/api/result";

interface UsePlayUrlReturn {
  playUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

export function usePlayUrl(
  id: string,
  fetcher: (id: string) => Promise<ActionResult<{ url: string }>>,
): UsePlayUrlReturn {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    const fetchUrl = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetcherRef.current(id);
        if (cancelled) return;
        if (result.success) {
          setPlayUrl(result.data.url);
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchUrl();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { playUrl, isLoading, error };
}
