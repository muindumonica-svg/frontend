import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { landingPathFor, usePermissions, useSession, useSessionBranches } from "@/api/hooks/auth";
import {
  useInventoryReport,
  usePaymentsReport,
  useProductsReport,
  useReportExportUrl,
  useSalesReport,
  useVarianceReport,
  useWastageReport,
} from "@/api/hooks/reports";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader } from "@/components/shared";
import { businessYmd, shiftYmd } from "@/lib/dates";
import { money, moneyPlain } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/types/api";
import type { ReportFilters, ReportType } from "@/types/api";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

type RangeKey = "today" | "yesterday" | "week" | "month";

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
];

/** Preset ranges become `from`/`to` server filters — nothing is sliced client-side. */
function rangeToDates(range: RangeKey): { from: string; to: string } {
  const today = businessYmd();
  if (range === "yesterday") {
    const yesterday = shiftYmd(today, -1);
    return { from: yesterday, to: yesterday };
  }
  const back = range === "month" ? 29 : range === "week" ? 6 : 0;
  return { from: shiftYmd(today, -back), to: today };
}

function ReportsPage() {
  const navigate = useNavigate();
  const session = useSession();
  const permissions = usePermissions();
  const branches = useSessionBranches();
  const [range, setRange] = useState<RangeKey>("week");
  const [branchValue, setBranchValue] = useState("ALL");
  const [tab, setTab] = useState<ReportType>("sales");

  useEffect(() => {
    if (!session.isSuccess || permissions.includes("reports")) return;
    navigate({ to: landingPathFor(session.data), replace: true });
  }, [session.isSuccess, session.data, permissions, navigate]);

  const filters = useMemo<ReportFilters>(() => {
    const { from, to } = rangeToDates(range);
    const next: ReportFilters = { from, to };
    if (branchValue !== "ALL") next.branchId = branchValue;
    return next;
  }, [range, branchValue]);

  // Filters are part of every query key, so switching range/branch refetches
  // from the server instead of re-slicing a local dataset.
  const sales = useSalesReport(filters);
  const products = useProductsReport(filters);
  const inventory = useInventoryReport(filters);
  const payments = usePaymentsReport(filters);
  const waste = useWastageReport(filters);
  const variances = useVarianceReport(filters);

  const exportUrl = useReportExportUrl(tab, filters);
  const totals = sales.data?.totals;

  return (
    <div className="pb-10">
      <PageHeader
        title="Reports"
        subtitle="Sales, products, inventory, payments, wastage and stock variance"
        actions={
          <Button variant="outline" size="sm" className="h-9" asChild>
            <a href={exportUrl} target="_blank" rel="noreferrer">
              Export {tab} CSV
            </a>
          </Button>
        }
      />
      <div className="px-4 py-5 md:px-6">
        {/* Controls feed the query keys. */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <Label>Range</Label>
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="mt-1 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Branch</Label>
            <Select value={branchValue} onValueChange={setBranchValue}>
              <SelectTrigger className="mt-1 w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary KPIs — straight from the `/reports/sales` totals. */}
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard label="Total Sales" loading={sales.isPending} value={totals ? money(totals.revenue) : "—"} />
          <SummaryCard label="Profit" loading={sales.isPending} value={totals ? money(totals.profit) : "—"} tone="success" />
          <SummaryCard label="Transactions" loading={sales.isPending} value={totals ? String(totals.transactions) : "—"} />
          <SummaryCard label="Items Sold" loading={sales.isPending} value={totals ? String(totals.items) : "—"} />
          <SummaryCard label="Discounts" loading={sales.isPending} value={totals ? money(totals.discounts) : "—"} />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as ReportType)}>
          <TabsList className="mb-4">
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="wastage">Wastage</TabsTrigger>
            <TabsTrigger value="variance">Variance</TabsTrigger>
          </TabsList>

          <TabsContent value="sales">
            <PanelState query={sales}>{(data) =>
              data.days.length === 0 ? (
                <EmptyState icon="📊" title="No sales in this range" />
              ) : (
                <div className="rounded-xl border p-4">
                  <p className="mb-3 font-semibold">Daily Sales</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.days}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v: number) => moneyPlain(v)} width={70} />
                        <Tooltip formatter={(v: number | string) => money(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)" }} />
                        <Bar dataKey="sales" fill="var(--color-brand)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )
            }</PanelState>
          </TabsContent>

          <TabsContent value="products">
            <PanelState query={products}>{(data) =>
              data.rows.length === 0 ? (
                <EmptyState icon="📦" title="No product data" />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr><th className="p-3">Product</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Revenue</th><th className="p-3 text-right">Cost</th><th className="p-3 text-right">Profit</th><th className="p-3 text-right">Txns</th></tr>
                    </thead>
                    <tbody>
                      {data.rows.map((p) => (
                        <tr key={p.productId} className="border-t">
                          <td className="p-3">
                            <span className="flex items-center gap-2 font-medium">
                              <ProductImage name={p.productName} productId={p.productId} className="h-8 w-8 rounded-md" />
                              {p.productName}
                            </span>
                          </td>
                          <td className="p-3 text-right">{p.units}</td>
                          <td className="p-3 text-right">{money(p.revenue)}</td>
                          <td className="p-3 text-right text-muted-foreground">{money(p.cost)}</td>
                          <td className="p-3 text-right font-semibold text-success">{money(p.profit)}</td>
                          <td className="p-3 text-right">{p.saleCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }</PanelState>
          </TabsContent>

          <TabsContent value="inventory">
            <PanelState query={inventory}>{(data) =>
              data.rows.length === 0 ? (
                <EmptyState icon="🏷️" title="No inventory in this branch" />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr><th className="p-3">Product</th><th className="p-3 text-right">On hand</th><th className="p-3 text-right">Reserved</th><th className="p-3 text-right">Reorder</th><th className="p-3">Status</th><th className="p-3 text-right">Value</th></tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <tr key={r.productId} className="border-t">
                          <td className="p-3 font-medium">{r.productName}</td>
                          <td className="p-3 text-right">{r.onHand} {r.baseUnit === "KG" ? "kg" : "pcs"}</td>
                          <td className="p-3 text-right text-muted-foreground">{r.reserved}</td>
                          <td className="p-3 text-right text-muted-foreground">{r.reorderLevel}</td>
                          <td className={`p-3 font-medium ${r.status === "out" ? "text-destructive" : r.status === "low" ? "text-brand-deep" : "text-muted-foreground"}`}>{r.status}</td>
                          <td className="p-3 text-right font-semibold">{money(r.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }</PanelState>
          </TabsContent>

          <TabsContent value="payments">
            <PanelState query={payments}>{(data) =>
              data.rows.length === 0 ? (
                <EmptyState icon="💳" title="No payment data" />
              ) : (
                <div className="space-y-2">
                  {data.rows.map((p) => (
                    <div key={p.method} className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
                      <span className="font-medium">{PAYMENT_METHOD_LABELS[p.method]}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground">{p.count} txns</span>
                        <span className="text-xs text-muted-foreground">{p.pending} pending · {p.failed} failed</span>
                        <span className="font-display font-bold">{money(p.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }</PanelState>
          </TabsContent>

          <TabsContent value="wastage">
            <PanelState query={waste}>{(data) =>
              data.rows.length === 0 ? (
                <EmptyState icon="🗑️" title="No wastage in this range" />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr><th className="p-3">Product</th><th className="p-3 text-right">Qty</th><th className="p-3">Reason</th><th className="p-3 text-right">Value</th></tr>
                    </thead>
                    <tbody>
                      {data.rows.map((w) => (
                        <tr key={`${w.productId}-${w.reason}-${w.qty}`} className="border-t">
                          <td className="p-3 font-medium">{w.productName}</td>
                          <td className="p-3 text-right">{w.qty}</td>
                          <td className="p-3">{w.reason}</td>
                          <td className="p-3 text-right font-semibold text-destructive">{money(w.costValue)}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-muted/30">
                        <td className="p-3 font-semibold" colSpan={3}>Total</td>
                        <td className="p-3 text-right font-semibold text-destructive">{money(data.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            }</PanelState>
          </TabsContent>

          <TabsContent value="variance">
            <PanelState query={variances}>{(data) =>
              data.rows.length === 0 ? (
                <EmptyState icon="✅" title="No stock variances recorded" />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr><th className="p-3">Ref</th><th className="p-3">Product</th><th className="p-3 text-right">System</th><th className="p-3 text-right">Counted</th><th className="p-3 text-right">Diff</th><th className="p-3 text-right">Value</th></tr>
                    </thead>
                    <tbody>
                      {data.rows.map((v) => (
                        <tr key={`${v.stockTakeRef}-${v.productName}`} className="border-t">
                          <td className="p-3">{v.stockTakeRef}</td>
                          <td className="p-3 font-medium">{v.productName}</td>
                          <td className="p-3 text-right">{v.systemQty}</td>
                          <td className="p-3 text-right">{v.countedQty}</td>
                          <td className={`p-3 text-right font-semibold ${v.variance < 0 ? "text-destructive" : "text-success"}`}>{v.variance > 0 ? "+" : ""}{v.variance}</td>
                          <td className="p-3 text-right">{money(v.value)}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-muted/30">
                        <td className="p-3 font-semibold" colSpan={5}>Total</td>
                        <td className="p-3 text-right font-semibold">{money(data.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            }</PanelState>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Renders one report tab: a skeleton while loading, a retryable panel on error,
 * and the server payload untouched on success (no local re-aggregation).
 * `children` is a function so the payload is only dereferenced once it exists.
 */
function PanelState<TData>({
  query,
  children,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    isFetching: boolean;
    refetch: () => Promise<unknown>;
    data?: TData | undefined;
  };
  children: (data: TData) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
        <span className="text-4xl">⚠️</span>
        <p className="mt-3 font-semibold">This report did not load.</p>
        {query.error && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{query.error.message}</p>}
        <Button variant="outline" className="mt-3" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return <>{children(query.data as TData)}</>;
}

function SummaryCard({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value: string;
  loading: boolean;
  tone?: "success";
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-24" />
      ) : (
        <p className={`font-display text-xl font-bold ${tone === "success" ? "text-success" : ""}`}>{value}</p>
      )}
    </div>
  );
}
