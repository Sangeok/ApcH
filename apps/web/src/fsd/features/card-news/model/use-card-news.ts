"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { cardNewsKeys, type CardNewsDetail } from "~/fsd/entities/card-news";
import { cardNewsDetailQueryOptions } from "./query-options";
import { creditBalanceKeys } from "~/fsd/entities/user";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file";
import {
  createCardNews,
  deleteCardNews,
  exportCardNews,
  regenerateCardNews,
  retryCardNews,
  saveCardNews,
} from "../api";
import type { ActionResult } from "~/fsd/shared/api/result";

export function unwrapCardNewsResult<T>(result: ActionResult<T>): T {
  if (!result.success) throw new Error(result.error);
  return result.data;
}

export function useLiveCardNewsDetail(userId: string, initial: CardNewsDetail) {
  const query = useQuery(
    cardNewsDetailQueryOptions(userId, initial.id, initial),
  );
  const client = useQueryClient();
  const previousActive = useRef(Boolean(initial.activeJob));
  const active = Boolean(query.data?.activeJob);
  useEffect(() => {
    if (previousActive.current && !active) {
      void client.invalidateQueries({
        queryKey: creditBalanceKeys.user(userId),
      });
      void client.invalidateQueries({
        queryKey: uploadedFileKeys.currentUserList(userId),
      });
      void client.invalidateQueries({ queryKey: cardNewsKeys.list(userId) });
    }
    previousActive.current = active;
  }, [active, client, userId]);
  return query;
}

export function useCardNewsMutations(userId: string) {
  const client = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: cardNewsKeys.user(userId) }),
      client.invalidateQueries({ queryKey: creditBalanceKeys.user(userId) }),
      client.invalidateQueries({
        queryKey: uploadedFileKeys.currentUserList(userId),
      }),
    ]);
  };
  return {
    create: useMutation({
      mutationFn: async (input: Parameters<typeof createCardNews>[0]) =>
        unwrapCardNewsResult(await createCardNews(input)),
      onSuccess: invalidate,
    }),
    regenerate: useMutation({
      mutationFn: async (input: Parameters<typeof regenerateCardNews>[0]) =>
        unwrapCardNewsResult(await regenerateCardNews(input)),
      onSuccess: invalidate,
    }),
    save: useMutation({
      mutationFn: async (input: Parameters<typeof saveCardNews>[0]) =>
        unwrapCardNewsResult(await saveCardNews(input)),
      onSuccess: invalidate,
    }),
    retry: useMutation({
      mutationFn: async (input: Parameters<typeof retryCardNews>[0]) =>
        unwrapCardNewsResult(await retryCardNews(input)),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (input: Parameters<typeof deleteCardNews>[0]) =>
        unwrapCardNewsResult(await deleteCardNews(input)),
      onSuccess: invalidate,
    }),
    export: useMutation({
      mutationFn: async (input: Parameters<typeof exportCardNews>[0]) =>
        unwrapCardNewsResult(await exportCardNews(input)),
    }),
  };
}
