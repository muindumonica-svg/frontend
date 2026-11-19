import { useEffect } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch, apiPage } from "@/lib/api";
import { TILL_STALE_TIME_MS } from "@/lib/query";
import type {
  CardPaymentInput,
  CashPaymentInput,
  Payment,
  PaymentListFilters,
  PaymentReconciliation,
  PaymentStatus,
  PaybillInboxItem,
  Sale,
  StkPaymentInput,
} from "@/types/api";
import { QueryKeys } from "./keys";
import { invalidateSaleReads } from "./sales";

// ----------------------------------------------------------------- polling

/** Contract: the SPA polls every 3s, 60 tries, then offers to expire. */
export const PAYMENT_POLL_INTERVAL_MS = 3_000;
export const PAYMENT_POLL_MAX_TRIES = 60;

export function isPaymentSettled(status: PaymentStatus | undefined): boolean {
  return status !== undefined && status !== "PENDING";
}

export function paymentQueryOptions(paymentId: string) {
  return queryOptions({
    queryKey: QueryKeys.payment(paymentId),
    queryFn: ({ signal }) => apiFetch<Payment>(`/payments/${paymentId}`, { signal }),
    staleTime: TILL_STALE_TIME_MS,
    refetchInterval: (query) => {
      const payment = query.state.data;
      if (!payment || isPaymentSettled(payment.status)) return false;
      return query.state.dataUpdateCount >= PAYMENT_POLL_MAX_TRIES ? false : PAYMENT_POLL_INTERVAL_MS;
    },
  });
}

/**
 * Polls one payment until it leaves `PENDING`. When it settles, a signed Daraja
 * callback may already have completed the sale, so the cached draft is
 * invalidated too — pass `saleId` to get that for free.
 */
export function usePayment(paymentId: string | null, options: { saleId?: string | null } = {}) {
  const client = useQueryClient();
  const saleId = options.saleId ?? null;
  const result = useQuery({
    ...paymentQueryOptions(paymentId ?? ""),
    enabled: Boolean(paymentId),
  });
  const status = result.data?.status;

  useEffect(() => {
    if (!saleId || !isPaymentSettled(status)) return;
    invalidatePaymentReads(client, saleId);
  }, [client, saleId, status]);

  return result;
}

function invalidatePaymentReads(client: QueryClient, saleId?: string | null): void {
  client.invalidateQueries({ queryKey: QueryKeys.paymentsRoot });
  client.invalidateQueries({ queryKey: QueryKeys.paybillInboxRoot });
  if (!saleId) return;

  const sale = client.getQueryData<Sale>(QueryKeys.sale(saleId));
  invalidateSaleReads(client, saleId);
  client.invalidateQueries({ queryKey: QueryKeys.movementsRoot });
  client.invalidateQueries({ queryKey: QueryKeys.accountingRoot });
  client.invalidateQueries({ queryKey: QueryKeys.reportsRoot });
  if (sale?.customerId) {
    client.invalidateQueries({ queryKey: QueryKeys.customer(sale.customerId) });
    client.invalidateQueries({
      queryKey: QueryKeys.customerFinancialSummary(sale.customerId),
    });
    client.invalidateQueries({
      queryKey: ["customers", "financial-history", sale.customerId],
    });
    client.invalidateQueries({
      queryKey: QueryKeys.customerLoyalty(sale.customerId),
    });
  }
}

// ------------------------------------------------------------------- reads

export function usePayments(filters: PaymentListFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.payments(filters),
      queryFn: ({ signal }) => apiPage<Payment>("/payments", { query: filters, signal }),
    }),
  );
}

export function usePaymentReconciliation(filters: { date?: string; branchId?: string } = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.paymentReconciliation(filters),
      queryFn: ({ signal }) =>
        apiFetch<PaymentReconciliation>("/payments/reconciliation", { query: filters, signal }),
    }),
  );
}

export function usePaybillInbox(filters: { status?: string; page?: number; perPage?: number } = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.paybillInbox(filters),
      queryFn: ({ signal }) => apiPage<PaybillInboxItem>("/paybill-inbox", { query: filters, signal }),
    }),
  );
}

export function useMatchPaybillInbox() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { inboxId: string; paymentId: string; reason: string }) =>
      apiFetch<Payment>(`/paybill-inbox/${input.inboxId}/match`, {
        method: "POST",
        body: { paymentId: input.paymentId, reason: input.reason },
      }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: QueryKeys.paymentsRoot });
      client.invalidateQueries({ queryKey: QueryKeys.paybillInboxRoot });
      client.invalidateQueries({ queryKey: QueryKeys.salesRoot });
    },
  });
}

// --------------------------------------------------------------- mutations

/** Cash sale: the response is the updated `Sale`, including `change`. */
export function useCashPayment(saleId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CashPaymentInput) =>
      apiFetch<Sale>(`/sales/${saleId}/payments/cash`, { method: "POST", body: input }),
    onSuccess: (sale) => client.setQueryData(QueryKeys.sale(sale.id), sale),
    onSettled: () => invalidatePaymentReads(client, saleId),
  });
}

/** PayBill is recorded at checkout; C2B callbacks are optional reconciliation only. */
export function usePaybillPayment(saleId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { amount: number }) =>
      apiFetch<Sale>(`/sales/${saleId}/payments/paybill`, { method: "POST", body: input }),
    onSuccess: (sale) => client.setQueryData(QueryKeys.sale(sale.id), sale),
    onSettled: () => invalidatePaymentReads(client, saleId),
  });
}

/** Gateway-confirmed only; `503 CARD_NOT_CONFIGURED` when the gateway is off. */
export function useCardPayment(saleId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CardPaymentInput) =>
      apiFetch<Sale>(`/sales/${saleId}/payments/card`, { method: "POST", body: input }),
    onSuccess: (sale) => client.setQueryData(QueryKeys.sale(sale.id), sale),
    onSettled: () => invalidatePaymentReads(client, saleId),
  });
}

/** Loyalty points are recorded as their own tender and never as cash revenue. */
export function useLoyaltyPayment(saleId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { points: number }) =>
      apiFetch<Sale>(`/sales/${saleId}/payments/loyalty`, { method: "POST", body: input }),
    onSuccess: (sale) => client.setQueryData(QueryKeys.sale(sale.id), sale),
    onSettled: (sale) => {
      invalidatePaymentReads(client, saleId);
      client.invalidateQueries({ queryKey: QueryKeys.customerLoyaltyRoot });
      client.invalidateQueries({ queryKey: QueryKeys.loyaltyDashboard });
      if (sale?.customerId) {
        client.invalidateQueries({
          queryKey: QueryKeys.customerFinancialSummary(sale.customerId),
        });
        client.invalidateQueries({
          queryKey: ["customers", "financial-history", sale.customerId],
        });
      }
    },
  });
}

/** Real STK push — returns a `PENDING` payment to hand to `usePayment`. */
export function useStkPayment(saleId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: StkPaymentInput) =>
      apiFetch<Payment>(`/sales/${saleId}/payments/stk`, { method: "POST", body: input }),
    onSettled: () => invalidatePaymentReads(client, saleId),
  });
}

/** Cashier gives up on a stuck prompt. Available once polling has run out. */
export function useExpirePayment() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { paymentId: string; saleId?: string }) =>
      apiFetch<Payment>(`/payments/${input.paymentId}/expire`, { method: "POST" }),
    onSuccess: (payment) => client.setQueryData(QueryKeys.payment(payment.id), payment),
    onSettled: (_payment, _error, input) => invalidatePaymentReads(client, input.saleId),
  });
}
