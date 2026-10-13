"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  creditBalanceKeys,
  type CreditBalance as CreditBalanceValue,
} from "~/fsd/entities/user";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { creditBalanceQueryOptions } from "../model/query-options";

export type CreditBalanceProps = {
  authUserId: string;
  initialBalance: CreditBalanceValue;
  compact?: boolean;
};

export function CreditBalance({
  authUserId,
  initialBalance,
  compact = false,
}: CreditBalanceProps) {
  const query = useQuery(creditBalanceQueryOptions(authUserId, initialBalance));
  const client = useQueryClient();
  useEffect(() => {
    // RSC refresh may follow checkout. Refetch without overwriting a newer cache
    // with props captured before a concurrent reservation was accepted.
    void client.invalidateQueries({
      queryKey: creditBalanceKeys.user(authUserId),
    });
  }, [authUserId, initialBalance.owned, initialBalance.reserved, client]);
  useEffect(() => {
    if (query.error?.message === "Unauthorized")
      client.removeQueries({ queryKey: creditBalanceKeys.user(authUserId) });
  }, [query.error, authUserId, client]);

  if (query.isError || !query.data) {
    return (
      <span className="text-muted-foreground text-sm" role="status">
        Balance unavailable
      </span>
    );
  }
  const balance = query.data;
  if (compact) {
    return (
      <Badge
        variant="secondary"
        className="h-8 px-3 py-1.5 text-xs font-medium"
        aria-label={`${balance.available} credits available, ${balance.reserved} reserved, ${balance.owned} owned`}
      >
        {balance.available} available
        {balance.reserved > 0 ? ` · ${balance.reserved} reserved` : ""}
      </Badge>
    );
  }
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">Available credits</span>
        <span className="text-2xl font-bold">{balance.available}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Owned credits</span>
        <span>{balance.owned}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Reserved for active jobs</span>
        <span>{balance.reserved}</span>
      </div>
    </div>
  );
}
