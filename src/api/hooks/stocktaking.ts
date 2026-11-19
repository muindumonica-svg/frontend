import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiWithMeta } from "@/lib/api";
import type {
  StockTake,
  StockTakeCountInput,
  StockTakeFilters,
  JournalEntry,
  StockTakeRecountInput,
  StockTakeVarianceInput,
  StockTakeVarianceSummary,
} from "@/types/api";
import { QueryKeys } from "./keys";

export function useStockTakeList(filters: StockTakeFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.stockTakes(filters),
      queryFn: ({ signal }) => apiFetch<StockTake[]>("/stock-takes", { query: filters, signal }),
    }),
  );
}

export function useStockTake(stockTakeId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.stockTake(stockTakeId ?? ""),
      queryFn: ({ signal }) => apiFetch<StockTake>(`/stock-takes/${stockTakeId}`, { signal }),
      enabled: Boolean(stockTakeId),
    }),
  );
}

export function useStockTakeJournal(stockTakeId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: ["stockTakeJournal", stockTakeId],
      queryFn: ({ signal }) =>
        apiFetch<JournalEntry>(`/stock-takes/${stockTakeId}/journal`, { signal }),
      enabled: Boolean(stockTakeId),
    }),
  );
}

function invalidateStockTakes(client: QueryClient, stockTakeId: string): void {
  client.invalidateQueries({ queryKey: QueryKeys.stockTake(stockTakeId) });
  client.invalidateQueries({ queryKey: QueryKeys.stockTakesRoot });
}

/** Snapshots `systemQty` for every product holding a balance at that branch. */
export function useStartStockTake() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      branchId: string;
      note?: string;
      mode?: "FULL" | "CATEGORY" | "SELECTED" | "SCHEDULED" | "SURPRISE";
      categoryId?: string;
      productIds?: string[];
      blindCount?: boolean;
    }) => apiFetch<StockTake>("/stock-takes", { method: "POST", body: input }),
    onSuccess: (take) => client.setQueryData(QueryKeys.stockTake(take.id), take),
    onSettled: () => client.invalidateQueries({ queryKey: QueryKeys.stockTakesRoot }),
  });
}

export function useAcceptStockTakeCount(stockTakeId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, details }: { productId: string; details: StockTakeVarianceInput }) =>
      apiFetch<StockTake>(`/stock-takes/${stockTakeId}/items/${productId}/accept`, {
        method: "POST",
        body: details,
      }),
    onSuccess: (take) => client.setQueryData(QueryKeys.stockTake(take.id), take),
    onSettled: () => invalidateStockTakes(client, stockTakeId),
  });
}

export function useRequestStockTakeRedo(stockTakeId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, reason }: { productId: string; reason: string }) =>
      apiFetch<StockTake>(`/stock-takes/${stockTakeId}/items/${productId}/redo`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: (take) => client.setQueryData(QueryKeys.stockTake(take.id), take),
    onSettled: () => invalidateStockTakes(client, stockTakeId),
  });
}

export function useSubmitStockTakeRecount(stockTakeId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: StockTakeRecountInput }) =>
      apiFetch<StockTake>(`/stock-takes/${stockTakeId}/items/${productId}/recount`, {
        method: "POST",
        body: input,
      }),
    onSuccess: (take) => client.setQueryData(QueryKeys.stockTake(take.id), take),
    onSettled: () => invalidateStockTakes(client, stockTakeId),
  });
}

/** Bulk count entry — `IN_PROGRESS` only, so the sheet is saved in one write. */
export function useSetStockTakeCounts(stockTakeId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (items: StockTakeCountInput[]) =>
      apiFetch<StockTake>(`/stock-takes/${stockTakeId}/counts`, {
        method: "PATCH",
        body: { items },
      }),
    onSuccess: (take) => client.setQueryData(QueryKeys.stockTake(take.id), take),
    onSettled: () => invalidateStockTakes(client, stockTakeId),
  });
}

export function useSubmitStockTake(stockTakeId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch<StockTake>(`/stock-takes/${stockTakeId}/submit`, { method: "POST" }),
    onSettled: () => invalidateStockTakes(client, stockTakeId),
  });
}

/** Moves a submitted sheet into `UNDER_REVIEW` for sign-off. */
export function useReviewStockTake(stockTakeId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch<StockTake>(`/stock-takes/${stockTakeId}/review`, { method: "POST" }),
    onSettled: () => invalidateStockTakes(client, stockTakeId),
  });
}

/**
 * Writes one `STOCK_TAKE` movement per variance and returns the variance
 * summary the approver signs for.
 */
export function useApproveStockTake(stockTakeId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiWithMeta<StockTake, StockTakeVarianceSummary>(`/stock-takes/${stockTakeId}/approve`, {
        method: "POST",
      }),
    onSettled: () => {
      invalidateStockTakes(client, stockTakeId);
      client.invalidateQueries({ queryKey: QueryKeys.inventoryRoot });
      client.invalidateQueries({ queryKey: QueryKeys.productsRoot });
    },
  });
}

export function useRejectStockTake(stockTakeId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (notes: string) =>
      apiFetch<StockTake>(`/stock-takes/${stockTakeId}/reject`, {
        method: "POST",
        body: { notes },
      }),
    onSettled: () => invalidateStockTakes(client, stockTakeId),
  });
}

export function usePostStockTake(stockTakeId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiWithMeta<
        StockTake,
        { movements: Array<{ productId: string; qtyChange: number }>; journalRef: string | null }
      >(`/stock-takes/${stockTakeId}/post`, { method: "POST" }),
    onSettled: () => {
      invalidateStockTakes(client, stockTakeId);
      client.invalidateQueries({ queryKey: ["stockTakeJournal", stockTakeId] });
      client.invalidateQueries({ queryKey: QueryKeys.inventoryRoot });
      client.invalidateQueries({ queryKey: QueryKeys.productsRoot });
      client.invalidateQueries({ queryKey: QueryKeys.reportsRoot });
    },
  });
}

export function useReverseStockTake(stockTakeId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (reason: string) =>
      apiWithMeta<
        StockTake,
        {
          reversalRef: string;
          journalRef: string | null;
          movements: Array<{ productId: string; qtyChange: number }>;
        }
      >(`/stock-takes/${stockTakeId}/reverse`, {
        method: "POST",
        body: { reason },
      }),
    onSettled: () => {
      invalidateStockTakes(client, stockTakeId);
      client.invalidateQueries({ queryKey: ["stockTakeJournal", stockTakeId] });
      client.invalidateQueries({ queryKey: QueryKeys.inventoryRoot });
      client.invalidateQueries({ queryKey: QueryKeys.productsRoot });
      client.invalidateQueries({ queryKey: QueryKeys.reportsRoot });
    },
  });
}
