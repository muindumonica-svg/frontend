import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiPage, apiWithMeta } from "@/lib/api";
import { TILL_STALE_TIME_MS } from "@/lib/query";
import { fmtKg, money, round2, round3 } from "@/lib/money";
import type {
  AddSaleItemInput,
  CreateSaleDraftInput,
  Customer,
  CustomerInput,
  Product,
  Receipt,
  Sale,
  SaleItem,
  SaleListFilters,
  SaleReturn,
  SaleReturnInput,
  SellingMode,
  UpdateSaleDraftInput,
  UpdateSaleItemInput,
} from "@/types/api";
import { QueryKeys } from "./keys";

// ------------------------------------------------------------------- reads

export function saleQueryOptions(saleId: string) {
  return queryOptions({
    queryKey: QueryKeys.sale(saleId),
    queryFn: ({ signal }) => apiFetch<Sale>(`/sales/${saleId}`, { signal }),
    // The cached draft *is* the cart, so it must never be served stale.
    staleTime: TILL_STALE_TIME_MS,
  });
}

/** The live draft. Pass `null` while the till is between sales. */
export function useSale(saleId: string | null) {
  return useQuery({
    ...saleQueryOptions(saleId ?? ""),
    enabled: Boolean(saleId),
    refetchInterval: (query) =>
      query.state.data?.payments.some(
        (payment) => payment.method === "LOYALTY" && payment.status === "PENDING",
      )
        ? 3000
        : false,
  });
}

export function useApproveInventoryOverdraft(saleId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { managerEmail: string; managerPassword: string; reason: string }) =>
      apiFetch<{ saleId: string; approvedValue: number; approvedAt: string }>(
        `/sales/${requireDraftId(saleId)}/inventory-overdraft-approval`,
        { method: "POST", body: input },
      ),
    onSettled: () => invalidateSaleReads(client, saleId),
  });
}

export function useSaleList(filters: SaleListFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.sales(filters),
      queryFn: ({ signal }) => apiPage<Sale>("/sales", { query: filters, signal }),
      refetchInterval: 15_000,
      refetchOnWindowFocus: "always",
    }),
  );
}

export function useReceipt(saleId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.receipt(saleId ?? ""),
      queryFn: ({ signal }) => apiFetch<Receipt>(`/sales/${saleId}/receipt`, { signal }),
      enabled: Boolean(saleId),
    }),
  );
}

// -------------------------------------------------- optimistic cart plumbing

/** `meta` of the item-write endpoints: soft stock warning, never a blocker. */
interface SaleItemMeta {
  availableQty: number | null;
}

export interface SaleItemWriteResult {
  item: SaleItem;
  availableQty: number | null;
}

interface DraftSnapshot {
  previous: Sale | undefined;
}

function cachedSale(client: QueryClient, saleId: string): Sale | undefined {
  return client.getQueryData<Sale>(QueryKeys.sale(saleId));
}

/** Recomputes the money columns the server owns so the till stays truthful mid-flight. */
function withTotals(sale: Sale): Sale {
  const subtotal = round2(sale.items.reduce((sum, item) => sum + item.total, 0));
  const rawTotal = Math.max(0, subtotal - sale.discount) + sale.deliveryFee;
  const total = sale.channel === "POS" ? Math.round(rawTotal) : round2(rawTotal);
  const paidAmount = round2(
    sale.payments
      .filter((payment) => payment.status === "SUCCESS")
      .reduce((sum, payment) => sum + payment.amount, 0),
  );

  return {
    ...sale,
    subtotal,
    total,
    paidAmount,
    balance: round2(Math.max(0, total - paidAmount)),
    change: round2(Math.max(0, paidAmount - total)),
  };
}

function findCachedProduct(client: QueryClient, productId: string): Product | undefined {
  for (const [, products] of client.getQueriesData<Product[]>({
    queryKey: QueryKeys.productsRoot,
  })) {
    const match = products?.find((product) => product.id === productId);
    if (match) return match;
  }
  return undefined;
}

function unitPriceOf(product: Product | undefined, mode: SellingMode, requested?: number): number {
  if (requested !== undefined) return round2(requested);
  return round2(product?.pricePerKg ?? 0);
}

function qtyLabelFor(qtyKg: number | null): string {
  return fmtKg(qtyKg ?? 0);
}

/**
 * Mirrors `SaleService::calculateItem` well enough for the couple of keystrokes
 * a cashier can wait for; the server row replaces these numbers on settle.
 */
function buildOptimisticItem(
  input: AddSaleItemInput,
  product: Product | undefined,
  id: string,
): SaleItem {
  const unitPrice = unitPriceOf(product, input.mode, input.unitPrice);
  let qtyKg: number | null;
  const pieces: number | null = null;

  const requestedQty = input.qtyKg ?? 0;
  qtyKg =
    input.mode === "amount" && requestedQty <= 0 && unitPrice > 0
      ? round3((input.amount ?? 0) / unitPrice)
      : round3(requestedQty);
  const total = round2(qtyKg * unitPrice);

  return {
    id,
    productId: input.productId,
    productName: product?.name ?? "",
    emoji: product?.emoji ?? "",
    mode: input.mode,
    qtyKg,
    pieces,
    unitPrice,
    unitPriceLabel: `${money(unitPrice)} / KG`,
    qtyLabel: qtyLabelFor(qtyKg),
    total,
    costTotal: null,
    note: input.note ?? null,
  };
}

async function snapshotDraft(client: QueryClient, saleId: string): Promise<DraftSnapshot> {
  await client.cancelQueries({ queryKey: QueryKeys.sale(saleId) });
  return { previous: cachedSale(client, saleId) };
}

function restoreDraft(
  client: QueryClient,
  saleId: string,
  snapshot: DraftSnapshot | undefined,
): void {
  if (snapshot?.previous) client.setQueryData(QueryKeys.sale(saleId), snapshot.previous);
}

/** Shared by the payment hooks: a write on one side of the till changes both lists. */
export function invalidateSaleReads(client: QueryClient, saleId: string): void {
  if (!saleId) return;
  client.invalidateQueries({ queryKey: QueryKeys.sale(saleId) });
  client.invalidateQueries({ queryKey: QueryKeys.salesRoot });
  client.invalidateQueries({ queryKey: QueryKeys.accountingRoot });
  client.invalidateQueries({ queryKey: QueryKeys.reportsRoot });
  // Item writes move the soft availability warning.
  client.invalidateQueries({ queryKey: QueryKeys.balancesRoot });
}

function requireDraftId(saleId: string): string {
  if (!saleId) throw new Error("No open draft — create one before writing items.");
  return saleId;
}

// -------------------------------------------------------------- mutations

/**
 * Server-side drafts replace the localStorage cart: posting no items returns an
 * empty `DRAFT` whose id the till then writes into.
 */
export function useCreateSaleDraft() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSaleDraftInput) =>
      apiFetch<Sale>("/sales", { method: "POST", body: input }),
    onSuccess: (sale) => {
      client.setQueryData(QueryKeys.sale(sale.id), sale);
      invalidateSaleReads(client, sale.id);
    },
  });
}

/** Customer, discount and note on a draft — optimistic like the item rows. */
export function useUpdateSaleDraft(saleId: string) {
  const client = useQueryClient();

  return useMutation<Sale, Error, UpdateSaleDraftInput, DraftSnapshot>({
    mutationFn: (patch) =>
      apiFetch<Sale>(`/sales/${requireDraftId(saleId)}`, { method: "PATCH", body: patch }),
    onMutate: async (patch) => {
      const snapshot = await snapshotDraft(client, saleId);
      const current = snapshot.previous;
      if (!current) return snapshot;

      client.setQueryData(
        QueryKeys.sale(saleId),
        withTotals({
          ...current,
          customerId: patch.customerId === undefined ? current.customerId : patch.customerId,
          discount: patch.discount === undefined ? current.discount : round2(patch.discount),
          note: patch.note === undefined ? current.note : patch.note,
        }),
      );

      return snapshot;
    },
    onError: (_error, _patch, snapshot) => restoreDraft(client, saleId, snapshot),
    onSuccess: (sale) => client.setQueryData(QueryKeys.sale(saleId), sale),
    onSettled: () => invalidateSaleReads(client, saleId),
  });
}

/** Create a checkout customer and associate it with the draft in one server transaction. */
export function useCreateAndAttachCustomer(saleId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CustomerInput) =>
      apiFetch<Customer>(`/sales/${requireDraftId(saleId)}/customer`, {
        method: "POST",
        body: input,
      }),
    onSuccess: (customer) => {
      client.setQueryData(QueryKeys.customer(customer.id), customer);
      client.invalidateQueries({ queryKey: QueryKeys.customersRoot });
    },
    onSettled: () => invalidateSaleReads(client, saleId),
  });
}

/**
 * Optimistic add: a temp-id row lands immediately and the server row replaces it
 * on settle. Stock is only hard-checked at completion, so `availableQty` here is
 * a warning, not a rejection.
 */
export function useAddSaleItem(saleId: string) {
  const client = useQueryClient();

  return useMutation<SaleItemWriteResult, Error, AddSaleItemInput, DraftSnapshot>({
    mutationFn: async (input) => {
      const envelope = await apiWithMeta<SaleItem, SaleItemMeta>(
        `/sales/${requireDraftId(saleId)}/items`,
        {
          method: "POST",
          body: input,
        },
      );
      return { item: envelope.data, availableQty: envelope.meta.availableQty ?? null };
    },
    onMutate: async (input) => {
      const snapshot = await snapshotDraft(client, saleId);
      const current = snapshot.previous;
      if (!current) return snapshot;

      const item = buildOptimisticItem(
        input,
        findCachedProduct(client, input.productId),
        `temp-${crypto.randomUUID()}`,
      );
      client.setQueryData(
        QueryKeys.sale(saleId),
        withTotals({ ...current, items: [...current.items, item] }),
      );

      return snapshot;
    },
    onError: (_error, _input, snapshot) => restoreDraft(client, saleId, snapshot),
    onSettled: () => invalidateSaleReads(client, saleId),
  });
}

export function useUpdateSaleItem(saleId: string) {
  const client = useQueryClient();

  return useMutation<
    SaleItemWriteResult,
    Error,
    { itemId: string } & UpdateSaleItemInput,
    DraftSnapshot
  >({
    mutationFn: async ({ itemId, ...fields }) => {
      const envelope = await apiWithMeta<SaleItem, SaleItemMeta>(
        `/sales/${requireDraftId(saleId)}/items/${itemId}`,
        { method: "PUT", body: fields },
      );
      return { item: envelope.data, availableQty: envelope.meta.availableQty ?? null };
    },
    onMutate: async ({ itemId, ...fields }) => {
      const snapshot = await snapshotDraft(client, saleId);
      const current = snapshot.previous;
      if (!current) return snapshot;

      const existing = current.items.find((item) => item.id === itemId);
      if (!existing) return snapshot;
      const mode = fields.mode ?? existing.mode;
      if (mode === "piece") return snapshot;

      const input: AddSaleItemInput = {
        productId: fields.productId ?? existing.productId,
        mode,
        qtyKg: fields.qtyKg,
        pieces: fields.pieces,
        unitPrice: fields.unitPrice,
        amount: fields.amount,
        note: fields.note ?? existing.note,
      };
      const patched = buildOptimisticItem(
        input,
        findCachedProduct(client, input.productId),
        itemId,
      );

      client.setQueryData(
        QueryKeys.sale(saleId),
        withTotals({
          ...current,
          items: current.items.map((item) => (item.id === itemId ? patched : item)),
        }),
      );

      return snapshot;
    },
    onError: (_error, _variables, snapshot) => restoreDraft(client, saleId, snapshot),
    onSettled: () => invalidateSaleReads(client, saleId),
  });
}

export function useRemoveSaleItem(saleId: string) {
  const client = useQueryClient();

  return useMutation<Sale, Error, string, DraftSnapshot>({
    mutationFn: (itemId) =>
      apiFetch<Sale>(`/sales/${requireDraftId(saleId)}/items/${itemId}`, { method: "DELETE" }),
    onMutate: async (itemId) => {
      const snapshot = await snapshotDraft(client, saleId);
      const current = snapshot.previous;
      if (!current) return snapshot;

      client.setQueryData(
        QueryKeys.sale(saleId),
        withTotals({ ...current, items: current.items.filter((item) => item.id !== itemId) }),
      );

      return snapshot;
    },
    onError: (_error, _itemId, snapshot) => restoreDraft(client, saleId, snapshot),
    onSuccess: (sale) => client.setQueryData(QueryKeys.sale(saleId), sale),
    onSettled: () => invalidateSaleReads(client, saleId),
  });
}

/** `POST /api/sales/{id}/cancel` — void a completed sale, restocks when committed. Needs `pos_void`. */
export function useCancelSale() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (saleId: string) => apiFetch<Sale>(`/sales/${saleId}/cancel`, { method: "POST" }),
    onSuccess: (sale) => client.setQueryData(QueryKeys.sale(sale.id), sale),
    onSettled: (_sale, _error, saleId) => {
      invalidateSaleReads(client, saleId);
      client.invalidateQueries({ queryKey: QueryKeys.paymentsRoot });
    },
  });
}

/** Abandon a draft; nothing was committed, so no stock is released. */
export function useDeleteSaleDraft() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (saleId: string) => apiFetch<Sale>(`/sales/${saleId}`, { method: "DELETE" }),
    onSuccess: (sale) => {
      client.setQueryData(QueryKeys.sale(sale.id), sale);
      client.invalidateQueries({ queryKey: QueryKeys.salesRoot });
    },
  });
}

/** Completed sales only; restocks and books a negative CASH refund payment. */
export function useCreateReturn() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { saleId: string } & SaleReturnInput) => {
      const { saleId, ...body } = input;
      return apiFetch<SaleReturn>(`/sales/${saleId}/returns`, { method: "POST", body });
    },
    onSettled: (_record, _error, input) => {
      invalidateSaleReads(client, input.saleId);
      client.invalidateQueries({ queryKey: QueryKeys.paymentsRoot });
    },
  });
}
