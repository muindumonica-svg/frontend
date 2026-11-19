import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { landingPathFor, useActiveBranchId, usePermissions, useSession } from "@/api/hooks/auth";
import { QueryKeys } from "@/api/hooks/keys";
import { useDashboardReport } from "@/api/hooks/reports";
import { businessYmd } from "@/lib/dates";
import { fmtDateTime, money, moneyPlain } from "@/lib/money";
import type { DashboardReport, ReportFilters } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductImage } from "@/components/product-image";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader, StatCard, StatusPill } from "@/components/shared";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

/** Today's date as `YYYY-MM-DD` on the business calendar, matching the API filter format. */
function todayYmd(): string {
  return businessYmd();
}

function Dashboard() {
  const navigate = useNavigate();
  const session = useSession();
  const permissions = usePermissions();
  const branchId = useActiveBranchId();
  const client = useQueryClient();

  // Managers/admins (they hold `reports`) own the overview; every other grant
  // bounces to the first screen it can use. An unrecognised grant stays here
  // rather than looping through the same redirect.
  useEffect(() => {
    if (!session.isSuccess || permissions.includes("reports")) return;
    const target = landingPathFor(session.data);
    if (target !== "/dashboard") navigate({ to: target, replace: true });
  }, [session.isSuccess, session.data, permissions, navigate]);

  const filters = useMemo<ReportFilters>(() => {
    const today = todayYmd();
    const next: ReportFilters = { from: today, to: today };
    if (branchId) next.branchId = branchId;
    return next;
  }, [branchId]);

  const dashboard = useDashboardReport(filters);

  return (
    <div className="pb-10">
      <PageHeader
        title="Dashboard"
        subtitle="Today at a glance — live from the server"
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={dashboard.isFetching}
            onClick={() =>
              // Pull-to-refresh: drop the cached aggregate so the same filters refetch server-side.
              client.invalidateQueries({ queryKey: QueryKeys.report("dashboard", filters) })
            }
          >
            {dashboard.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="space-y-5 px-4 py-5 md:px-6">
        {dashboard.isError ? (
          <RetryPanel
            message="The dashboard did not load."
            detail={dashboard.error.message}
            retrying={dashboard.isFetching}
            onRetry={() => void dashboard.refetch()}
          />
        ) : dashboard.isPending ? (
          <DashboardSkeleton />
        ) : (
          <DashboardBody report={dashboard.data} />
        )}
      </div>
    </div>
  );
}

/**
 * Every figure here is exactly what `/api/reports/dashboard` returned — no
 * client-side re-aggregation, so a partial page can never skew a KPI.
 */
function DashboardBody({ report }: { report: DashboardReport }) {
  const {
    revenueToday,
    salesToday,
    avgBasket,
    itemsSoldToday,
    grossProfitToday,
    revenueYesterday,
    revenue7d,
    cashVsMpesa,
    openShifts,
    lowStockCount,
    salesTrend,
    topProducts,
    recentSales,
  } = report;

  const dayDelta = revenueToday - revenueYesterday;
  const noSales = salesToday === 0 && revenueToday === 0;

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Today's Sales"
          value={money(revenueToday)}
          sub={revenueYesterday > 0 ? `Yesterday ${money(revenueYesterday)}` : undefined}
          tone="brand"
          icon="💰"
        />
        <StatCard
          label="Gross Profit"
          value={money(grossProfitToday)}
          sub="Server cost snapshot"
          icon="📈"
        />
        <StatCard
          label="Transactions"
          value={String(salesToday)}
          sub="Completed sales today"
          icon="🧾"
        />
        <StatCard
          label="Items Sold"
          value={String(itemsSoldToday)}
          sub="Line items today"
          icon="📊"
        />
        <StatCard label="Avg Basket" value={money(avgBasket)} sub="Revenue ÷ sales" icon="🧺" />
        <StatCard
          label="Revenue · 7 days"
          value={money(revenue7d)}
          sub={
            revenueYesterday > 0
              ? `Today ${dayDelta >= 0 ? "+" : "−"}${money(Math.abs(dayDelta))} vs yesterday`
              : undefined
          }
          icon="🗓️"
        />
      </div>

      {/* Trend + payments */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sales trend — last 7 days</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {salesTrend.length === 0 ? (
              <EmptyState icon="📊" title="No sales yet" body="Completed sales will plot here." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrend} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v: number) => moneyPlain(v)} width={70} />
                  <Tooltip formatter={(v: number | string) => money(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)" }} />
                  <Area type="monotone" dataKey="sales" stroke="var(--color-brand-deep)" strokeWidth={2.5} fill="url(#salesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cash vs M-Pesa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">Cash</span>
              <span className="font-display font-bold">{money(cashVsMpesa.cash)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">M-Pesa</span>
              <span className="font-display font-bold">{money(cashVsMpesa.mpesa)}</span>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Needs attention</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li className="flex justify-between">
                  <span>Open shifts</span>
                  <span className="font-semibold">{openShifts}</span>
                </li>
                <li className="flex justify-between">
                  <span>Low stock items</span>
                  <span className={`font-semibold ${lowStockCount > 0 ? "text-destructive" : ""}`}>{lowStockCount}</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Best sellers + low stock */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top products — 7 days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topProducts.length === 0 ? (
              <EmptyState icon="📊" title="No sales yet" body="Completed sales will show here." />
            ) : (
              topProducts.map((p) => (
                <div key={p.productId} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <ProductImage
                      name={p.productName}
                      productId={p.productId}
                      className="h-8 w-8 shrink-0 rounded-md"
                    />
                    <span className="truncate font-medium">{p.productName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.units} sold</span>
                  </span>
                  <span className="shrink-0 font-display font-bold">{money(p.revenue)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Low stock alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {noSales ? (
              <EmptyState icon="📊" title="Nothing to show yet" body="Make your first sale in the POS to populate the dashboard." />
            ) : lowStockCount === 0 ? (
              <EmptyState icon="✅" title="Stock levels healthy" />
            ) : (
              <div className="rounded-lg border border-brand/40 bg-brand-soft px-3 py-2 text-sm">
                <span className="font-medium">{lowStockCount} item{lowStockCount === 1 ? "" : "s"} at or below reorder level</span>
              </div>
            )}
            <Link to="/inventory" className="inline-block text-sm font-medium text-brand-deep underline-offset-2 hover:underline">
              Open inventory →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent sales */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent sales</CardTitle>
        </CardHeader>
        <CardContent>
          {recentSales.length === 0 ? (
            <EmptyState icon="🧾" title="No completed sales yet" body="Make your first sale in the POS." />
          ) : (
            <div className="space-y-2">
              {recentSales.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="font-medium">{s.receiptNo ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {s.items.length} item{s.items.length === 1 ? "" : "s"} · {fmtDateTime(s.completedAt ?? s.createdAt)}
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusPill status={s.status} />
                    <span className="font-display font-bold">{money(s.total)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </>
  );
}

function RetryPanel({
  message,
  detail,
  retrying,
  onRetry,
}: {
  message: string;
  detail?: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      <span className="text-4xl">⚠️</span>
      <p className="mt-3 font-semibold">{message}</p>
      {detail && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>}
      <Button variant="outline" className="mt-3" disabled={retrying} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
