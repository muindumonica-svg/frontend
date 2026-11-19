import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { landingPathFor, usePermissions, useSession } from "@/api/hooks/auth";
import {
  isPaymentSettled,
  PAYMENT_POLL_MAX_TRIES,
  useExpirePayment,
  useMatchPaybillInbox,
  usePayment,
  usePaymentReconciliation,
  usePaybillInbox,
  usePayments,
} from "@/api/hooks/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, StatusPill } from "@/components/shared";
import { fmtDateTime, money } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/types/api";
import type {
  Payment,
  PaymentListFilters,
  PaymentMethod,
  PaymentStatus,
  PaybillInboxItem,
} from "@/types/api";

export const Route = createFileRoute("/_app/payments")({
  component: PaymentsPage,
});

const PER_PAGE = 25;
const METHOD_OPTIONS: (PaymentMethod | "ALL")[] = [
  "ALL",
  "CASH",
  "STK",
  "PAYBILL",
  "CARD",
  "LOYALTY",
];
const STATUS_OPTIONS: (PaymentStatus | "ALL")[] = ["ALL", "PENDING", "SUCCESS", "FAILED", "EXPIRED"];

function providerDetail(payment: Payment): string {
  if (payment.providerResultDesc === null) return "—";
  return payment.providerResultCode === null
    ? payment.providerResultDesc
    : `${payment.providerResultCode}: ${payment.providerResultDesc}`;
}

function paymentDetail(payment: Payment): string {
  return payment.mpesaRef ?? payment.providerRef ?? payment.paybillAccount ?? payment.phone ?? "—";
}

function PaymentsPage() {
  const navigate = useNavigate();
  const session = useSession();
  const permissions = usePermissions();

  useEffect(() => {
    if (!session.isSuccess || permissions.includes("reports")) return;
    navigate({ to: landingPathFor(session.data), replace: true });
  }, [session.isSuccess, session.data, permissions, navigate]);

  return (
    <div className="pb-10">
      <PageHeader title="Payments" subtitle="Transactions and pending M-Pesa STK payments" />
      <div className="px-4 py-5 md:px-6">
        <Tabs defaultValue="transactions">
          <TabsList className="mb-4">
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="pending">Pending M-Pesa</TabsTrigger>
            {permissions.includes("users") && <TabsTrigger value="reconciliation">PayBill reconciliation</TabsTrigger>}
          </TabsList>
          <TabsContent value="transactions">
            <TransactionsTab />
          </TabsContent>
          <TabsContent value="pending">
            <PendingTab />
          </TabsContent>
          {permissions.includes("users") && (
            <TabsContent value="reconciliation">
              <PaybillReconciliationTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

function TransactionsTab() {
  const [method, setMethod] = useState<PaymentMethod | "ALL">("ALL");
  const [status, setStatus] = useState<PaymentStatus | "ALL">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const filters = useMemo<PaymentListFilters>(() => {
    const next: PaymentListFilters = { page, perPage: PER_PAGE };
    if (method !== "ALL") next.method = method;
    if (status !== "ALL") next.status = status;
    if (from) next.from = from;
    if (to) next.to = to;
    return next;
  }, [method, status, from, to, page]);

  const payments = usePayments(filters);
  const meta = payments.data?.meta;
  const totalPages = meta ? Math.max(1, Math.ceil(meta.totalCount / PER_PAGE)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Method"
          value={method}
          options={METHOD_OPTIONS}
          labelOf={(value) => value === "ALL" ? "All methods" : PAYMENT_METHOD_LABELS[value]}
          onChange={(value) => {
            setMethod(value as PaymentMethod | "ALL");
            setPage(1);
          }}
        />
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          labelOf={(value) => value === "ALL" ? "All statuses" : value}
          onChange={(value) => {
            setStatus(value as PaymentStatus | "ALL");
            setPage(1);
          }}
        />
        <DateFilter label="From" value={from} onChange={(value) => { setFrom(value); setPage(1); }} />
        <DateFilter label="To" value={to} onChange={(value) => { setTo(value); setPage(1); }} />
      </div>

      {payments.isPending && <RowsSkeleton />}
      {payments.isError && (
        <RetryPanel
          message="The transaction list did not load."
          detail={payments.error.message}
          retrying={payments.isFetching}
          onRetry={() => void payments.refetch()}
        />
      )}
      {payments.isSuccess && payments.data.items.length === 0 && (
        <EmptyState icon="💳" title="No payments found" body="No transactions match these filters yet." />
      )}
      {payments.isSuccess && payments.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Ref</th><th className="p-3">Method</th><th className="p-3">Sale</th>
                  <th className="p-3 text-right">Amount</th><th className="p-3">Status</th>
                  <th className="p-3">M-Pesa</th><th className="p-3">Provider</th><th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.data.items.map((payment) => (
                  <tr key={payment.id} className="border-t">
                    <td className="p-3 font-medium">{payment.ref}</td>
                    <td className="p-3">{PAYMENT_METHOD_LABELS[payment.method]}</td>
                    <td className="p-3 text-muted-foreground">{payment.saleReceiptNo ?? "—"}</td>
                    <td className="p-3 text-right font-semibold">{money(payment.amount)}</td>
                    <td className="p-3"><StatusPill status={payment.status} /></td>
                    <td className="p-3 text-muted-foreground">{payment.method === "STK" ? paymentDetail(payment) : "—"}</td>
                    <td className="p-3 text-muted-foreground">{payment.method === "STK" ? providerDetail(payment) : "—"}</td>
                    <td className="p-3 text-muted-foreground">{fmtDateTime(payment.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {meta?.page ?? 1} of {totalPages} · {meta?.totalCount ?? payments.data.items.length} transactions</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8" disabled={page <= 1 || payments.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
              <Button variant="outline" size="sm" className="h-8" disabled={page >= totalPages || payments.isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PendingTab() {
  const stk = usePayments({ method: "STK", status: "PENDING", perPage: 100 });
  const paybill = usePayments({ method: "PAYBILL", status: "PENDING", perPage: 100 });
  const rows = [...(stk.data?.items ?? []), ...(paybill.data?.items ?? [])]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  if (stk.isPending || paybill.isPending) return <RowsSkeleton />;
  if (stk.isError || paybill.isError) {
    const error = stk.error ?? paybill.error;
    return <RetryPanel message="Pending M-Pesa payments did not load." detail={error?.message} retrying={stk.isFetching || paybill.isFetching} onRetry={() => { void stk.refetch(); void paybill.refetch(); }} />;
  }
  if (rows.length === 0) {
    return <EmptyState icon="✅" title="No pending M-Pesa" body="Every STK and PayBill payment request has settled." />;
  }
  return <div className="space-y-2">{rows.map((payment) => <PendingPaymentRow key={payment.id} payment={payment} />)}</div>;
}

function PaybillReconciliationTab() {
  const summary = usePaymentReconciliation();
  const inbox = usePaybillInbox({ perPage: 100 });
  const pending = usePayments({ method: "PAYBILL", status: "PENDING", perPage: 100 });
  const successful = usePayments({ method: "PAYBILL", status: "SUCCESS", perPage: 100 });
  const unlinkedPayments = [
    ...(pending.data?.items ?? []),
    ...(successful.data?.items ?? []).filter((payment) => !payment.providerRef),
  ];

  if (summary.isPending || inbox.isPending || pending.isPending || successful.isPending) return <RowsSkeleton />;
  if (summary.isError || inbox.isError || pending.isError || successful.isError) {
    const error = summary.error ?? inbox.error ?? pending.error ?? successful.error;
    return (
      <RetryPanel
        message="PayBill reconciliation did not load."
        detail={error?.message}
        retrying={summary.isFetching || inbox.isFetching || pending.isFetching || successful.isFetching}
        onRetry={() => { void summary.refetch(); void inbox.refetch(); void pending.refetch(); void successful.refetch(); }}
      />
    );
  }

  const unmatched = inbox.data.items.filter((item) => item.status === "UNMATCHED" || item.status === "DUPLICATE");

  return (
    <div className="space-y-5">
      <section className="rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Internal payment totals · {summary.data.date}</h2>
            <p className="text-xs text-muted-foreground">
              Provider confirmation is not inferred from these totals; unmatched transfers require review.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={summary.isFetching} onClick={() => void summary.refetch()}>
            {summary.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <SummaryTile label="Confirmed internal payments" value={money(summary.data.expectedTotal)} />
          <SummaryTile label="Pending" value={money(summary.data.pendingTotal)} />
          <SummaryTile label="Unmatched / duplicate C2B" value={String(summary.data.unmatchedInboxCount)} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {summary.data.rows.map((row) => (
            <div key={row.method} className="rounded-lg bg-muted/40 p-3 text-sm">
              <p className="font-semibold">{PAYMENT_METHOD_LABELS[row.method]}</p>
              <p className="mt-1 text-xs text-muted-foreground">Confirmed {money(row.successfulTotal)}</p>
              <p className="text-xs text-muted-foreground">Pending {money(row.pendingTotal)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Provider C2B transactions needing review</h2>
          <p className="text-xs text-muted-foreground">
            Manual matching requires an exact amount and a reason. Original provider references remain unchanged.
          </p>
        </div>
        {unmatched.length === 0 ? (
          <EmptyState icon="✅" title="No unresolved C2B transactions" body="Unmatched and duplicate provider events will appear here." />
        ) : (
          <div className="space-y-3">
            {unmatched.map((item) => (
              <PaybillInboxRow
                key={item.id}
                item={item}
                pendingPayments={unlinkedPayments}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PaybillInboxRow({
  item,
  pendingPayments,
}: {
  item: PaybillInboxItem;
  pendingPayments: Payment[];
}) {
  const [paymentId, setPaymentId] = useState("");
  const [reason, setReason] = useState("");
  const match = useMatchPaybillInbox();
  const candidates = pendingPayments.filter((payment) => Math.abs(payment.amount - item.amount) < 0.01);

  function submit() {
    if (!paymentId || reason.trim().length < 5) return;
    match.mutate(
      { inboxId: item.id, paymentId, reason: reason.trim() },
      {
        onSuccess: () => toast.success(`${item.providerRef ?? item.mpesaRef} matched and recorded.`),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{item.providerRef ?? item.mpesaRef ?? "Provider reference unavailable"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {money(item.amount)} · Account {item.account} · Business {item.paybillNumber} · {fmtDateTime(item.at)}
          </p>
          {item.phone && <p className="text-xs text-muted-foreground">Phone {item.phone}</p>}
        </div>
        <StatusPill status={item.status} />
      </div>
      {item.status === "UNMATCHED" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Select value={paymentId} onValueChange={setPaymentId}>
            <SelectTrigger><SelectValue placeholder="Select equal-amount PayBill payment" /></SelectTrigger>
            <SelectContent>
              {candidates.map((payment) => (
                <SelectItem key={payment.id} value={payment.id}>
                  {payment.ref} · {payment.saleReceiptNo ?? payment.saleId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for manual match"
            maxLength={500}
          />
          <Button
            disabled={!paymentId || reason.trim().length < 5 || match.isPending}
            onClick={submit}
          >
            {match.isPending ? "Matching…" : "Match"}
          </Button>
          {candidates.length === 0 && (
            <p className="text-xs text-muted-foreground sm:col-span-3">No unlinked PayBill payment has this exact amount.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-bold">{value}</p>
    </div>
  );
}

function PendingPaymentRow({ payment }: { payment: Payment }) {
  const live = usePayment(payment.id, { saleId: payment.saleId });
  const expire = useExpirePayment();
  const current = live.data ?? payment;
  if (isPaymentSettled(current.status)) return null;

  function giveUp() {
    expire.mutate(
      { paymentId: current.id, saleId: current.saleId },
      {
        onSuccess: () => toast.success(`${current.ref} expired.`),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <div className="rounded-lg border px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{current.ref} — {PAYMENT_METHOD_LABELS[current.method]}</p>
        <StatusPill status={current.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {money(current.amount)} · Phone {current.phone ?? "—"}{current.saleReceiptNo ? ` · Sale ${current.saleReceiptNo}` : ""}
      </p>
      {current.method === "PAYBILL" && current.paybillAccount && (
        <p className="mt-1 text-xs text-muted-foreground">
          PayBill {current.paybillNumber ?? "—"} · Account {current.paybillAccount}
        </p>
      )}
      <p className="mt-0.5 text-xs text-muted-foreground">
        Initiated {fmtDateTime(current.createdAt)} · polling every 3s up to {PAYMENT_POLL_MAX_TRIES} checks
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 text-destructive" disabled={expire.isPending} onClick={giveUp}>
          {expire.isPending ? "Expiring…" : "Expire"}
        </Button>
        <Button size="sm" variant="ghost" className="h-8" disabled={live.isFetching} onClick={() => void live.refetch()}>
          {live.isFetching ? "Checking…" : "Check now"}
        </Button>
        {current.providerResultDesc && <span className="text-xs text-muted-foreground">{providerDetail(current)}</span>}
      </div>
    </div>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  labelOf,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  labelOf: (value: T) => string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="w-40">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{labelOf(option)}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <Input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="h-9" />
    </div>
  );
}

function RowsSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-12 w-full rounded-lg" />)}</div>;
}

function RetryPanel({ message, detail, retrying, onRetry }: { message: string; detail?: string; retrying: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      <span className="text-4xl">⚠️</span>
      <p className="mt-3 font-semibold">{message}</p>
      {detail && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>}
      <Button variant="outline" className="mt-3" disabled={retrying} onClick={onRetry}>Try again</Button>
    </div>
  );
}
