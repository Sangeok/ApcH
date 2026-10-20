import { queryOptions } from "@tanstack/react-query";
import { creditBalanceKeys, type CreditBalance } from "~/fsd/entities/user";
import { getCreditBalance } from "../api";

export function creditBalanceQueryOptions(
  authUserId: string,
  initialData?: CreditBalance,
) {
  return queryOptions({
    queryKey: creditBalanceKeys.user(authUserId),
    queryFn: async (): Promise<CreditBalance> => {
      const result = await getCreditBalance();
      if (!result.success) throw new Error(result.error);
      if (result.data.authUserId !== authUserId)
        throw new Error("Unauthorized");
      return result.data.creditBalance;
    },
    initialData,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.error?.message === "Unauthorized" ? false : 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: (count, error) => error.message !== "Unauthorized" && count < 2,
  });
}
