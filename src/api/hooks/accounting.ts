import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { AccountingRegister } from "@/types/api";
import { QueryKeys } from "./keys";

export function useAccountingRegister(page = 1, perPage = 25, salesPage = 1, salesPerPage = 25) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.accounting(page, perPage, salesPage, salesPerPage),
      queryFn: ({ signal }) =>
        apiFetch<AccountingRegister>("/accounting", {
          query: { page, perPage, salesPage, salesPerPage },
          signal,
        }),
      refetchInterval: 15_000,
      refetchOnWindowFocus: "always",
    }),
  );
}
