"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "~/fsd/shared/api/result";

interface UsePlayUrlOptions {
  enabled?: boolean;
}

/**
 * presign 요청의 상태. 이전 반환값 `{ playUrl, isLoading, error }`는 세 필드가
 * 서로 독립이라 `{ url, isLoading: true, error }` 같은 불가능한 조합을 타입이
 * 허용했고, 소비자 넷이 각자 다른 방식으로 상태를 재유도했다 — 그중 하나는
 * `error`를 아예 읽지 않아 presign 실패 시 빈 검은 상자를 영원히 그렸다.
 */
export type PlayUrlState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

export function usePlayUrl(
  id: string,
  fetcher: (id: string) => Promise<ActionResult<{ url: string }>>,
  options?: UsePlayUrlOptions,
): PlayUrlState {
  const enabled = options?.enabled ?? true;
  const [state, setState] = useState<PlayUrlState>(
    enabled ? { status: "loading" } : { status: "idle" },
  );
  const fetcherRef = useRef(fetcher);

  // 렌더 중에 쓰면 React 19 동시 렌더링에서 불순한 렌더다. 이 effect가 아래
  // fetch effect보다 먼저 선언돼 있어야 같은 커밋에서 최신 fetcher가 보인다.
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    const fetchUrl = async () => {
      try {
        const result = await fetcherRef.current(id);
        if (cancelled) return;
        setState(
          result.success
            ? { status: "ready", url: result.data.url }
            : { status: "error", message: result.error },
        );
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void fetchUrl();

    return () => {
      cancelled = true;
    };
  }, [id, enabled]);

  return state;
}
