"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listAssetCleanupStatuses, retryAssetCleanup } from "../api";
import { Button } from "~/fsd/shared/ui/atoms/button";

export function AssetCleanupStatus({ userId }: { userId: string }) {
  const client = useQueryClient();
  const queryKey = ["asset-cleanup", userId] as const;
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await listAssetCleanupStatuses();
      if (!result.success) throw new Error(result.error);
      if (result.data.authUserId !== userId) throw new Error("Unauthorized");
      return result.data.cleanups;
    },
    staleTime: 0,
    refetchInterval: (state) =>
      state.state.error?.message !== "Unauthorized" &&
      state.state.data?.some((job) => job.status !== "completed")
        ? 5000
        : false,
    refetchOnWindowFocus: "always",
    retry: (count, error) => error.message !== "Unauthorized" && count < 2,
  });
  const retry = useMutation({
    mutationFn: async (cleanupId: string) => {
      const result = await retryAssetCleanup({ cleanupId });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  if (!query.data?.length && !query.error) return null;
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Asset deletion status</h2>
      {query.error && <p role="alert">{query.error.message}</p>}
      {retry.error && <p role="alert">{retry.error.message}</p>}
      {query.data?.map((job) => (
        <div
          key={job.id}
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <div>
            <p>
              {job.kind === "uploaded-file"
                ? "Original video and derived results"
                : job.kind === "clip"
                  ? "Clip and derived card news"
                  : "Card news set"}{" "}
              ·{" "}
              {job.status === "completed"
                ? "Deletion completed"
                : "Deletion in progress"}
            </p>
            {job.lastError && (
              <p className="text-muted-foreground">{job.lastError}</p>
            )}
          </div>
          {job.status === "retryable_failed" && (
            <Button
              size="sm"
              variant="outline"
              disabled={retry.isPending}
              onClick={() => retry.mutate(job.id)}
            >
              Retry cleanup
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
