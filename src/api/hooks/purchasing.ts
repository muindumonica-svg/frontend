import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch, apiMessage } from "@/lib/api";
import type {
  GoodsReceipt,
  GoodsReceiptFilters,
  PurchaseOrder,
  PurchaseOrderFilters,
  PurchaseOrderInput,
  ReceiveGoodsInput,
  Supplier,
  SupplierInput,
} from "@/types/api";
import { QueryKeys } from "./keys";

// --------------------------------------------------------------- suppliers

export function useSupplierList() {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.suppliersRoot,
      queryFn: ({ signal }) => apiFetch<Supplier[]>("/suppliers", { signal }),
    }),
  );
}

export function useSupplier(supplierId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.supplier(supplierId ?? ""),
      queryFn: ({ signal }) => apiFetch<Supplier>(`/suppliers/${supplierId}`, { signal }),
      enabled: Boolean(supplierId),
    }),
  );
}

function invalidateSuppliers(client: QueryClient): void {
  client.invalidateQueries({ queryKey: QueryKeys.suppliersRoot });
  // Purchase-order rows denormalise the supplier name.
  client.invalidateQueries({ queryKey: QueryKeys.purchaseOrdersRoot });
}

export function useCreateSupplier() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: SupplierInput) => apiFetch<Supplier>("/suppliers", { method: "POST", body: input }),
    onSettled: () => invalidateSuppliers(client),
  });
}

export function useUpdateSupplier() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { supplierId: string; patch: Partial<SupplierInput> }) =>
      apiFetch<Supplier>(`/suppliers/${input.supplierId}`, { method: "PUT", body: input.patch }),
    onSettled: () => invalidateSuppliers(client),
  });
}

/** Refused with `409` while the supplier still has purchase orders. */
export function useDeleteSupplier() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (supplierId: string) => apiMessage(`/suppliers/${supplierId}`, { method: "DELETE" }),
    onSettled: () => invalidateSuppliers(client),
  });
}

// ---------------------------------------------------------- purchase orders

export function usePurchaseOrderList(filters: PurchaseOrderFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.purchaseOrders(filters),
      queryFn: ({ signal }) => apiFetch<PurchaseOrder[]>("/purchase-orders", { query: filters, signal }),
    }),
  );
}

export function usePurchaseOrder(poId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.purchaseOrder(poId ?? ""),
      queryFn: ({ signal }) => apiFetch<PurchaseOrder>(`/purchase-orders/${poId}`, { signal }),
      enabled: Boolean(poId),
    }),
  );
}

function invalidateOrderReads(client: QueryClient, poId: string): void {
  client.invalidateQueries({ queryKey: QueryKeys.purchaseOrder(poId) });
  client.invalidateQueries({ queryKey: QueryKeys.purchaseOrdersRoot });
  client.invalidateQueries({ queryKey: QueryKeys.goodsReceiptsRoot });
}

export function useCreatePurchaseOrder() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: PurchaseOrderInput) =>
      apiFetch<PurchaseOrder>("/purchase-orders", { method: "POST", body: input }),
    onSuccess: (order) => client.setQueryData(QueryKeys.purchaseOrder(order.id), order),
    onSettled: () => client.invalidateQueries({ queryKey: QueryKeys.purchaseOrdersRoot }),
  });
}

export function useUpdatePurchaseOrder() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { poId: string; patch: Partial<PurchaseOrderInput> }) =>
      apiFetch<PurchaseOrder>(`/purchase-orders/${input.poId}`, { method: "PUT", body: input.patch }),
    onSuccess: (order) => client.setQueryData(QueryKeys.purchaseOrder(order.id), order),
    onSettled: (_order, _error, input) => invalidateOrderReads(client, input.poId),
  });
}

/** `DRAFT → ORDERED`. */
export function useOrderPurchaseOrder() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (poId: string) => apiFetch<PurchaseOrder>(`/purchase-orders/${poId}/order`, { method: "POST" }),
    onSettled: (_order, _error, poId) => invalidateOrderReads(client, poId),
  });
}

export function useCancelPurchaseOrder() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (poId: string) => apiFetch<PurchaseOrder>(`/purchase-orders/${poId}/cancel`, { method: "POST" }),
    onSettled: (_order, _error, poId) => invalidateOrderReads(client, poId),
  });
}

/** Goods receipt + `PURCHASE_RECEIVED` movements; moves the PO to `PARTIALLY_RECEIVED`/`RECEIVED`. */
export function useReceivePurchaseOrder() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { poId: string } & ReceiveGoodsInput) => {
      const { poId, ...body } = input;
      return apiFetch<GoodsReceipt>(`/purchase-orders/${poId}/receive`, { method: "POST", body });
    },
    onSettled: (_receipt, _error, input) => {
      invalidateOrderReads(client, input.poId);
      client.invalidateQueries({ queryKey: QueryKeys.inventoryRoot });
      client.invalidateQueries({ queryKey: QueryKeys.productsRoot });
    },
  });
}

export function useGoodsReceiptList(filters: GoodsReceiptFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.goodsReceipts(filters),
      queryFn: ({ signal }) => apiFetch<GoodsReceipt[]>("/goods-receipts", { query: filters, signal }),
    }),
  );
}
