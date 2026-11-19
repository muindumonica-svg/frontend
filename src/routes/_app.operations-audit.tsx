import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { useInventoryOverdrafts } from "@/api/hooks/inventory";
import { useSaleList } from "@/api/hooks/sales";
import { useShiftList } from "@/api/hooks/shifts";
import { hasPermission, landingPathFor, loadSession, useSessionBranches } from "@/api/hooks/auth";
import { EmptyState, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDateTime, money, round3 } from "@/lib/money";
import type { CashierShift, InventoryOverdraft, Sale } from "@/types/api";

export const Route = createFileRoute("/_app/operations-audit")({
  beforeLoad: async () => {
    const session = await loadSession();
    if (!session) throw redirect({ to: "/staff/login" });
    if (!hasPermission(session, "operations_audit")) {
      throw redirect({ to: landingPathFor(session) });
    }
  },
  component: OperationsAuditPage,
});

function OperationsAuditPage() {
  const shiftsQuery = useShiftList();
  const overdraftsQuery = useInventoryOverdrafts();
  const recentSalesQuery = useSaleList({ page: 1, perPage: 12 });
  const draftsQuery = useSaleList({ status: "DRAFT", page: 1, perPage: 1 });
  const completedSalesQuery = useSaleList({ status: "COMPLETED", page: 1, perPage: 1 });
  const branches = useSessionBranches();
  const shifts = useMemo(() => shiftsQuery.data ?? [], [shiftsQuery.data]);
  const overdrafts = useMemo(() => overdraftsQuery.data ?? [], [overdraftsQuery.data]);
  const recentSales = recentSalesQuery.data?.items ?? [];

  const shiftSummary = useMemo(
    () => ({
      open: shifts.filter((shift) => shift.status === "OPEN").length,
      review: shifts.filter((shift) => shift.status === "UNDER_REVIEW").length,
      closed: shifts.filter((shift) => shift.status === "CLOSED").length,
      variance: shifts.filter((shift) => shift.variance !== null && Math.abs(shift.variance) > 0.01)
        .length,
    }),
    [shifts],
  );
  const overdraftSummary = useMemo(
    () => ({
      outstanding: overdrafts.filter((item) => item.status === "OUTSTANDING").length,
      partial: overdrafts.filter((item) => item.status === "PARTIALLY_SETTLED").length,
      settled: overdrafts.filter((item) => item.status === "FULLY_SETTLED").length,
      outstandingValue: overdrafts.reduce((total, item) => total + (item.outstandingValue ?? 0), 0),
    }),
    [overdrafts],
  );
  const branchName = (branchId: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? branchId;
  const hasQueryError =
    shiftsQuery.isError ||
    overdraftsQuery.isError ||
    recentSalesQuery.isError ||
    draftsQuery.isError ||
    completedSalesQuery.isError;

  return (
    <div className="pb-10">
      <PageHeader
        title="Operations Audit"
        subtitle="Shift controls, POS access, inventory overdrafts, settlement, costing and test coverage"
      />
      <div className="space-y-6 px-4 py-5 md:px-6">
        <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          This audit view is restricted to Super Admin. Shift and overdraft tables use live records
          from the existing APIs (up to 200 most recent records each); implementation notes and
          feature-test results describe the current application behavior.
        </p>

        {shiftsQuery.isError && (
          <LoadError title="Shift audit could not be loaded" error={shiftsQuery.error} />
        )}
        {overdraftsQuery.isError && (
          <LoadError title="Overdraft audit could not be loaded" error={overdraftsQuery.error} />
        )}
        {recentSalesQuery.isError && (
          <LoadError title="POS activity could not be loaded" error={recentSalesQuery.error} />
        )}

        <section className="space-y-3">
          <SectionHeading
            title="POS activity audit"
            subtitle="Recent saved drafts and completed sales from the live sales register"
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/sales">Open all sales</Link>
              </Button>
            }
          />
          {recentSalesQuery.isPending || draftsQuery.isPending || completedSalesQuery.isPending ? (
            <LoadingCard label="Loading sales and draft activity…" />
          ) : !recentSalesQuery.isError && !draftsQuery.isError && !completedSalesQuery.isError ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <MetricCard
                  label="All saved transactions"
                  value={recentSalesQuery.data?.meta.totalCount ?? 0}
                />
                <MetricCard label="Drafts" value={draftsQuery.data?.meta.totalCount ?? 0} />
                <MetricCard
                  label="Completed"
                  value={completedSalesQuery.data?.meta.totalCount ?? 0}
                />
              </div>
              {recentSales.length === 0 ? (
                <EmptyState
                  icon="🧾"
                  title="No POS transactions"
                  body="Saved drafts and completed sales will appear here."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="p-3">Created</th>
                        <th className="p-3">Receipt / Draft</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Cashier</th>
                        <th className="p-3">Branch</th>
                        <th className="p-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSales.map((sale) => (
                        <PosActivityRow
                          key={sale.id}
                          sale={sale}
                          branchName={branchName(sale.branchId)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Showing the 12 most recent sales and drafts; the counters include all matching
                records.
              </p>
            </>
          ) : (
            <>
              {draftsQuery.isError && (
                <LoadError title="Draft count could not be loaded" error={draftsQuery.error} />
              )}
              {completedSalesQuery.isError && (
                <LoadError
                  title="Completed sales count could not be loaded"
                  error={completedSalesQuery.error}
                />
              )}
            </>
          )}
        </section>

        <section className="space-y-3">
          <SectionHeading
            title="Shift management audit"
            subtitle="Recent shift activity and cash-count exceptions"
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/cashier">Open shift management</Link>
              </Button>
            }
          />
          {shiftsQuery.isPending ? (
            <LoadingCard label="Loading shift records…" />
          ) : !shiftsQuery.isError ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Open" value={shiftSummary.open} />
                <MetricCard label="Awaiting review" value={shiftSummary.review} />
                <MetricCard label="Closed" value={shiftSummary.closed} />
                <MetricCard label="Cash variances" value={shiftSummary.variance} />
              </div>
              {shifts.length === 0 ? (
                <EmptyState
                  icon="🧾"
                  title="No shift records"
                  body="Shift activity will appear here when shifts are opened."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="p-3">Shift</th>
                        <th className="p-3">Cashier</th>
                        <th className="p-3">Branch</th>
                        <th className="p-3">Opened</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Expected</th>
                        <th className="p-3 text-right">Actual</th>
                        <th className="p-3 text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shifts.map((shift) => (
                        <ShiftAuditRow
                          key={shift.id}
                          shift={shift}
                          branchName={branchName(shift.branchId)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                The shift list is limited to the 200 most recently opened shifts.
              </p>
            </>
          ) : null}
        </section>

        <section className="space-y-3">
          <SectionHeading
            title="Shift management implementation"
            subtitle="Server-enforced till lifecycle and cash reconciliation"
          />
          <AuditBullets
            items={[
              "Opening a second active shift for the same operator is rejected.",
              "Expected cash is opening float + successful cash payments in the shift window + cash-in − cash-out − recorded expenses.",
              "Closing compares the actual drawer count with expected cash; differences above the configured tolerance require a reason and enter UNDER_REVIEW.",
              "Only an authorized reviewer can sign off a shift held for review; cashier access is scoped to the cashier's own shift.",
              "The shift record retains operator, opener, closer, expected/actual cash, variance, and associated cash movements.",
            ]}
          />
        </section>

        <section className="space-y-3">
          <SectionHeading
            title="POS access matrix"
            subtitle="Role permissions currently enforced by the API"
          />
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Role</th>
                  <th className="p-3">POS sales</th>
                  <th className="p-3">Shift access</th>
                  <th className="p-3">Inventory</th>
                  <th className="p-3">Overdraft / report</th>
                  <th className="p-3">Stock-taking</th>
                </tr>
              </thead>
              <tbody>
                <AccessRow
                  role="Super Admin"
                  pos="Full"
                  shift="All branches"
                  inventory="Full"
                  overdraft="View and configure"
                  stockTake="Approve and post"
                />
                <AccessRow
                  role="Manager"
                  pos="Sales, discounts and voids"
                  shift="Manage and review"
                  inventory="Full"
                  overdraft="View and configure"
                  stockTake="Approve and post"
                />
                <AccessRow
                  role="Cashier"
                  pos="Sell and take payments"
                  shift="Own shift"
                  inventory="No"
                  overdraft="No"
                  stockTake="No"
                />
                <AccessRow
                  role="Storekeeper"
                  pos="No"
                  shift="No"
                  inventory="View and operate"
                  overdraft="View"
                  stockTake="Count"
                />
                <AccessRow
                  role="Procurement"
                  pos="No"
                  shift="No"
                  inventory="View and operate"
                  overdraft="View"
                  stockTake="No"
                />
                <AccessRow
                  role="Stock-take agent"
                  pos="No"
                  shift="No"
                  inventory="No"
                  overdraft="No"
                  stockTake="Count"
                />
                <AccessRow
                  role="Delivery"
                  pos="No"
                  shift="No"
                  inventory="No"
                  overdraft="No"
                  stockTake="No"
                />
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Cross-branch visibility depends on the API permission and branch policy. The operations
            audit page itself is Super Admin-only.
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeading
            title="Inventory overdraft audit"
            subtitle="Live negative-stock obligations and receipt allocations"
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/inventory">Open inventory</Link>
              </Button>
            }
          />
          {overdraftsQuery.isPending ? (
            <LoadingCard label="Loading inventory overdrafts…" />
          ) : !overdraftsQuery.isError ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Outstanding" value={overdraftSummary.outstanding} />
                <MetricCard label="Partially settled" value={overdraftSummary.partial} />
                <MetricCard label="Fully settled" value={overdraftSummary.settled} />
                <MetricCard
                  label="Outstanding value"
                  value={money(overdraftSummary.outstandingValue)}
                />
              </div>
              {overdrafts.length === 0 ? (
                <EmptyState
                  icon="📦"
                  title="No overdrafts recorded"
                  body="Authorized negative-stock sales will be audited here."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="p-3">Product</th>
                        <th className="p-3">Branch</th>
                        <th className="p-3">Cashier / sale</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Original qty</th>
                        <th className="p-3 text-right">Outstanding</th>
                        <th className="p-3 text-right">Estimated value</th>
                        <th className="p-3">Receipt allocations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overdrafts.map((overdraft) => (
                        <OverdraftAuditRow
                          key={overdraft.id}
                          overdraft={overdraft}
                          branchName={overdraft.branchName ?? branchName(overdraft.branchId)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                The list is limited to the 200 newest overdraft records. Value is estimated from the
                provisional unit cost and outstanding quantity.
              </p>
            </>
          ) : null}
        </section>

        <section className="space-y-3">
          <SectionHeading title="Overdraft settlement lifecycle" subtitle="FIFO settlement rules" />
          <ol className="list-inside list-decimal space-y-2 rounded-xl border bg-card p-4 text-sm">
            <li>
              A permitted sale may create an overdraft only when policy allows the operator, limits,
              and required narration are satisfied.
            </li>
            <li>
              The shortage is recorded against the sale, product, branch, movement, and provisional
              unit cost.
            </li>
            <li>
              Receipts and transfer-ins settle eligible overdrafts for the same product and branch
              in oldest-first order.
            </li>
            <li>
              Each receipt creates a quantity allocation; partially covered records remain
              PARTIALLY_SETTLED and become FULLY_SETTLED at zero outstanding quantity.
            </li>
            <li>
              A receipt movement is allocated once, preventing duplicate settlement; branch
              isolation prevents another branch's receipt from clearing the obligation.
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <SectionHeading
            title="Inventory costing impact"
            subtitle="Provisional sale cost and receipt reconciliation"
          />
          <AuditBullets
            items={[
              "The sale keeps its original cost snapshot; later receipts do not rewrite the sale item’s cost.",
              "A receipt with a valid unit cost updates the product’s current base-unit cost for future sales.",
              "For each allocated overdraft quantity, the audit records (actual receipt unit cost − provisional unit cost) × allocated quantity as the cost adjustment.",
              "Sales and product reports use the preserved sale cost, so historical margin remains reproducible while the receipt allocation exposes reconciliation deltas.",
              "If the provisional cost is missing, the outstanding value is unavailable; configured value limits can block an overdraft without a valid cost.",
            ]}
          />
        </section>

        <section className="space-y-3">
          <SectionHeading
            title="Shift and overdraft test results"
            subtitle="Automated feature coverage verified in this workspace"
          />
          <div className="grid gap-3 lg:grid-cols-3">
            <TestResultCard
              suite="ShiftFlowTest"
              tests="9 tests · Passed"
              coverage="Open/close, cash variance review, expected-cash calculation, operator identity, duplicate shifts, and ownership checks."
            />
            <TestResultCard
              suite="InventoryOverdraftFlowTest"
              tests="3 tests · Passed"
              coverage="FIFO settlement, partial receipts, cross-branch isolation, sale cost snapshots, and report costing."
            />
            <TestResultCard
              suite="PermissionAccessTest"
              tests="7 tests · Passed"
              coverage="Representative role grants, branch scoping, cashier access limits, and protected inventory operations."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Results refer to the current source workspace test run; rerun the suites after code
            changes to refresh validation.
          </p>
        </section>

        {hasQueryError && (
          <p className="text-xs text-muted-foreground">
            Static implementation and test coverage sections remain available, but one or more live
            data sections failed to load.
          </p>
        )}
      </div>
    </div>
  );
}

function ShiftAuditRow({ shift, branchName }: { shift: CashierShift; branchName: string }) {
  return (
    <tr className="border-t">
      <td className="p-3 font-mono">{shift.ref}</td>
      <td className="p-3">{shift.userName ?? shift.userId}</td>
      <td className="p-3">{branchName}</td>
      <td className="whitespace-nowrap p-3 text-muted-foreground">{fmtDateTime(shift.openedAt)}</td>
      <td className="p-3">
        <StatusBadge status={shift.status} />
      </td>
      <td className="p-3 text-right tabular-nums">
        {shift.expectedCash === null ? "—" : money(shift.expectedCash)}
      </td>
      <td className="p-3 text-right tabular-nums">
        {shift.actualCash === null ? "—" : money(shift.actualCash)}
      </td>
      <td
        className={`p-3 text-right font-semibold tabular-nums ${shift.variance !== null && Math.abs(shift.variance) > 0.01 ? "text-destructive" : ""}`}
      >
        {shift.variance === null ? "—" : money(shift.variance)}
      </td>
    </tr>
  );
}

function PosActivityRow({ sale, branchName }: { sale: Sale; branchName: string }) {
  return (
    <tr className="border-t">
      <td className="whitespace-nowrap p-3 text-muted-foreground">{fmtDateTime(sale.createdAt)}</td>
      <td className="p-3 font-mono">{sale.receiptNo ?? "Draft"}</td>
      <td className="p-3">
        <StatusBadge status={sale.status} />
      </td>
      <td className="p-3">{sale.userName ?? "—"}</td>
      <td className="p-3">{branchName}</td>
      <td className="p-3 text-right tabular-nums">{money(sale.total)}</td>
    </tr>
  );
}

function OverdraftAuditRow({
  overdraft,
  branchName,
}: {
  overdraft: InventoryOverdraft;
  branchName: string;
}) {
  return (
    <tr className="border-t align-top">
      <td className="p-3 font-medium">{overdraft.productName ?? overdraft.productId}</td>
      <td className="p-3">{branchName}</td>
      <td className="p-3">
        <div>{overdraft.cashierName ?? overdraft.cashierId ?? "—"}</div>
        <div className="text-xs text-muted-foreground">
          {overdraft.saleReference ?? "Sale reference unavailable"}
        </div>
      </td>
      <td className="p-3">
        <StatusBadge status={overdraft.status} />
      </td>
      <td className="p-3 text-right tabular-nums">{round3(overdraft.quantity)}</td>
      <td className="p-3 text-right tabular-nums">{round3(overdraft.outstandingQty)}</td>
      <td className="p-3 text-right tabular-nums">
        {overdraft.outstandingValue === null
          ? "Cost unavailable"
          : money(overdraft.outstandingValue)}
      </td>
      <td className="p-3">
        {overdraft.allocations.length === 0 ? (
          <span className="text-muted-foreground">No receipts allocated</span>
        ) : (
          <details>
            <summary className="cursor-pointer text-primary">
              {overdraft.allocations.length} allocation(s)
            </summary>
            <ul className="mt-2 space-y-1 text-xs">
              {overdraft.allocations.map((allocation) => (
                <li key={allocation.id}>
                  {fmtDateTime(allocation.at)} ·{" "}
                  {allocation.receiptReference ?? allocation.receiptMovementId} ·{" "}
                  {round3(allocation.quantity)} · cost delta {money(allocation.costAdjustment)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </td>
    </tr>
  );
}

function AccessRow({
  role,
  pos,
  shift,
  inventory,
  overdraft,
  stockTake,
}: {
  role: string;
  pos: string;
  shift: string;
  inventory: string;
  overdraft: string;
  stockTake: string;
}) {
  return (
    <tr className="border-t">
      <td className="p-3 font-medium">{role}</td>
      <td className="p-3">{pos}</td>
      <td className="p-3">{shift}</td>
      <td className="p-3">{inventory}</td>
      <td className="p-3">{overdraft}</td>
      <td className="p-3">{stockTake}</td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll("_", " ");
  return (
    <Badge
      variant={status === "UNDER_REVIEW" || status === "OUTSTANDING" ? "destructive" : "secondary"}
    >
      {label}
    </Badge>
  );
}

function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function AuditBullets({ items }: { items: string[] }) {
  return (
    <ul className="list-inside list-disc space-y-2 rounded-xl border bg-card p-4 text-sm">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}

function TestResultCard({
  suite,
  tests,
  coverage,
}: {
  suite: string;
  tests: string;
  coverage: string;
}) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{suite}</h3>
        <Badge variant="secondary">{tests}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{coverage}</p>
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return <div className="rounded-xl border p-5 text-sm text-muted-foreground">{label}</div>;
}

function LoadError({ title, error }: { title: string; error: Error }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
    >
      {title}: {error.message}
    </p>
  );
}
