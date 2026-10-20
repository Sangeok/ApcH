import { queryOptions } from "@tanstack/react-query";
import {
  cardNewsKeys,
  type CardNewsDetail,
  type CardNewsSummary,
} from "~/fsd/entities/card-news";
import { getCardNewsDetail, listCardNews } from "../api";

export function cardNewsListQueryOptions(
  userId: string,
  initialData?: CardNewsSummary[],
  clipId?: string,
) {
  return queryOptions({
    queryKey: cardNewsKeys.list(userId, clipId),
    queryFn: async () => {
      const result = await listCardNews(clipId ? { clipId } : {});
      if (!result.success) throw new Error(result.error);
      if (result.data.authUserId !== userId) throw new Error("Unauthorized");
      return result.data.sets;
    },
    initialData,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.error?.message !== "Unauthorized" &&
      query.state.data?.some(
        (set) => set.activeJob !== null || set.status === "deleting",
      )
        ? 5000
        : false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchIntervalInBackground: false,
    retry: (count, error) => error.message !== "Unauthorized" && count < 2,
  });
}

export function cardNewsDetailQueryOptions(
  userId: string,
  setId: string,
  initialData?: CardNewsDetail,
) {
  return queryOptions({
    queryKey: cardNewsKeys.detail(userId, setId),
    queryFn: async () => {
      const result = await getCardNewsDetail({ setId });
      if (!result.success) throw new Error(result.error);
      if (result.data.authUserId !== userId) throw new Error("Unauthorized");
      return result.data.detail;
    },
    initialData,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.error?.message !== "Unauthorized" &&
      (Boolean(query.state.data?.activeJob) ||
        query.state.data?.status === "deleting")
        ? 5000
        : false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchIntervalInBackground: false,
    retry: (count, error) => error.message !== "Unauthorized" && count < 2,
  });
}
