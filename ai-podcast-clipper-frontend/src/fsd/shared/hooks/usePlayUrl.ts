"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "~/fsd/shared/api/result";

interface UsePlayUrlOptions {
  enabled?: boolean;
}

interface UsePlayUrlReturn {
  playUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

export function usePlayUrl(
  id: string,
  fetcher: (id: string) => Promise<ActionResult<{ url: string }>>,
  options?: UsePlayUrlOptions,
): UsePlayUrlReturn {
  const enabled = options?.enabled ?? true;
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchUrl = async () => {
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
  }, [id, enabled]);

  return { playUrl, isLoading, error };
}
