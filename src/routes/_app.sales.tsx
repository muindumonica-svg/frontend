import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { landingPathFor, usePermissions, useSession, useSessionBranches } from "@/api/hooks/auth";
import { useSaleList } from "@/api/hooks/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, StatusPill } from "@/components/shared";
import { fmtDateTime, money } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/types/api";
import type { SaleListFilters, SaleStatus } from "@/types/api";

export const Route = createFileRoute("/_app/sales")({
  component: SalesPage,
});

const PER_PAGE = 25;
const SALE_STATUSES: SaleStatus[] = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PAID",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];

function isSaleStatus(value: string): value is SaleStatus {
  return SALE_STATUSES.some((status) => status === value);
}

function SalesPage() {
  const navigate = useNavigate();
  const session = useSession();
  const permissions = usePermissions();
  const branches = useSessionBranches();
  const [branchId, setBranchId] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | SaleStatus>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!session.isSuccess || permissions.includes("reports")) return;
    navigate({ to: landingPathFor(session.data), replace: true });
  }, [session.isSuccess, session.data, permissions, navigate]);

  const filters = useMemo<SaleListFilters>(() => {
    const next: SaleListFilters = { perPage: PER_PAGE, page };
    if (status !== "ALL") next.status = status;
    if (branchId !== "ALL") next.branchId = branchId;
    if (from) next.from = from;
    if (to) next.to = to;
    if (search.trim()) next.q = search.trim();
    return next;
  }, [branchId, status, from, to, search, page]);
  const sales = useSaleList(filters);
  const meta = sales.data?.meta;
  const pageCount = meta ? Math.max(1, Math.ceil(meta.totalCount / PER_PAGE)) : 1;
  const pageTotal = sales.data?.items.reduce((sum, sale) => sum + sale.total, 0) ?? 0;

  return (
    <div className="pb-10">
      <PageHeader title="Sales" subtitle="Sales transactions and payment breakdowns" />
      <div className="space-y-4 px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-48">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Branch</span>
            <Select value={branchId} onValueChange={(value) => { setBranchId(value); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All branches</SelectItem>
                {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="w-48">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
            <Select
              value={status}
              onValueChange={(value) => {
                if (value === "ALL" || isSaleStatus(value)) {
                  setStatus(value);
                  setPage(1);
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {SALE_STATUSES.map((saleStatus) => (
                  <SelectItem key={saleStatus} value={saleStatus}>
                    {saleStatus.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">From</span>
            <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="h-10" />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">To</span>
            <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="h-10" />
          </label>
          <Input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search receipt or customer"
            className="h-10 w-full sm:w-64"
          />
        </div>

        <div className="min-w-0 rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current page sales</p>
          <p className="mt-1 min-w-0 font-display text-xl font-bold [overflow-wrap:anywhere]">{sales.isPending ? "—" : money(pageTotal)}</p>
        </div>

        {sales.isPending && <SalesSkeleton />}
        {sales.isError && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{sales.error.message}</p>}
        {sales.isSuccess && sales.data.items.length === 0 && (
          <EmptyState icon="🧾" title="No sales found" body="Try changing the status, date, branch, or search filters." />
        )}
        {sales.isSuccess && sales.data.items.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="p-3">Sale / Receipt</th><th className="p-3">Date</th><th className="p-3">Cashier</th><th className="p-3 text-right">Items</th><th className="p-3">Payments</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th></tr>
                </thead>
                <tbody>
                  {sales.data.items.map((sale) => (
                    <tr key={sale.id} className="border-t">
                      <td className="p-3">
                        <p className="font-semibold">{sale.receiptNo ?? "No receipt yet"}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{sale.id}</p>
                      </td>
                      <td className="p-3 text-muted-foreground">{fmtDateTime(sale.completedAt ?? sale.createdAt)}</td>
                      <td className="p-3">{sale.userName ?? "—"}</td>
                      <td className="p-3 text-right">{sale.items.length}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {sale.payments.filter((payment) => payment.status === "SUCCESS").map((payment) => (
                            <span key={payment.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                              {PAYMENT_METHOD_LABELS[payment.method]} {money(payment.amount)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3"><StatusPill status={sale.status} /></td>
                      <td className="p-3 text-right font-semibold">{money(sale.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Page {meta?.page ?? 1} of {pageCount} · {meta?.totalCount ?? sales.data.items.length} sales</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || sales.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= pageCount || sales.isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SalesSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full rounded-lg" />)}</div>;
}
