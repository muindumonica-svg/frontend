import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  Conversion,
  ConversionInput,
  GoodsReceipt,
  InventoryOverdraft,
  ReceiveStockInput,
  StockAdjustment,
  StockAdjustmentInput,
  StockTransfer,
  StockTransferFilters,
  StockTransferInput,
  WastageInput,
  WastageRecord,
} from "@/types/api";
import { QueryKeys } from "./keys";

/** Every inventory write moves balances and the movement ledger. */
function invalidateStockReads(client: QueryClient): void {
  client.invalidateQueries({ queryKey: QueryKeys.inventoryRoot });
  client.invalidateQueries({ queryKey: QueryKeys.productsRoot });
}

/** `POST /api/inventory/receive` — books `PURCHASE_RECEIVED` and updates cost. */
export function useReceiveStock() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ReceiveStockInput) =>
      apiFetch<GoodsReceipt>("/inventory/receive", { method: "POST", body: input }),
    onSettled: () => {
      invalidateStockReads(client);
      client.invalidateQueries({ queryKey: QueryKeys.goodsReceiptsRoot });
    },
  });
}

export function useRecordWastage() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: WastageInput) =>
      apiFetch<WastageRecord>("/inventory/wastage", { method: "POST", body: input }),
    onSettled: () => invalidateStockReads(client),
  });
}

/** In-transit transfers are awaiting the destination branch's receipt. */
export function useTransfers(filters: StockTransferFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.transfers(filters),
      queryFn: ({ signal }) =>
        apiFetch<StockTransfer[]>("/inventory/transfers", { query: filters, signal }),
    }),
  );
}

export function useInventoryOverdrafts(limit = 200) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.overdrafts(limit),
      queryFn: ({ signal }) =>
        apiFetch<InventoryOverdraft[]>("/inventory/overdrafts", {
          query: { limit },
          signal,
        }),
    }),
  );
}

/** Dispatches stock out of the source branch; the destination is credited later. */
export function useTransferStock() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: StockTransferInput) =>
      apiFetch<StockTransfer>("/inventory/transfers", { method: "POST", body: input }),
    onSettled: () => invalidateStockReads(client),
  });
}

/** Books the `TRANSFER_IN` leg; only the destination branch may receive. */
export function useReceiveTransfer() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (transferId: string) =>
      apiFetch<StockTransfer>(`/inventory/transfers/${transferId}/receive`, { method: "POST" }),
    onSettled: () => invalidateStockReads(client),
  });
}

export function useAdjustStock() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: StockAdjustmentInput) =>
      apiFetch<StockAdjustment>("/inventory/adjustments", { method: "POST", body: input }),
    onSettled: () => invalidateStockReads(client),
  });
}

/** Butchering: input stock out, output stock in, cost derived from input cost + yield. */
export function useConvertStock() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ConversionInput) =>
      apiFetch<Conversion>("/inventory/conversions", { method: "POST", body: input }),
    onSettled: () => invalidateStockReads(client),
  });
}
