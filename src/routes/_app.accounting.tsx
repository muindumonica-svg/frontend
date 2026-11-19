import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { hasPermission, landingPathFor, loadSession } from "@/api/hooks/auth";
import { useAccountingRegister } from "@/api/hooks/accounting";
import { EmptyState, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/money";

export const Route = createFileRoute("/_app/accounting")({
  beforeLoad: async () => {
    const session = await loadSession();
    if (!session) throw redirect({ to: "/staff/login" });
    if (!hasPermission(session, "accounting")) throw redirect({ to: landingPathFor(session) });
  },
  component: AccountingPage,
});

function AccountingPage() {
  const [page, setPage] = useState(1);
  const [salesPage, setSalesPage] = useState(1);
  const register = useAccountingRegister(page, 25, salesPage, 25);
  const data = register.data;
  const completed = data?.salesByStatus.find((row) => row.status === "COMPLETED");
  const drafts = data?.salesByStatus.find((row) => row.status === "DRAFT");
  const pendingPayment = data?.salesByStatus.find((row) =>
    ["PENDING_PAYMENT", "PARTIALLY_PAID", "PAID"].includes(row.status),
  );
  const otherStatuses = data?.salesByStatus.filter(
    (row) =>
      !["COMPLETED", "DRAFT", "PENDING_PAYMENT", "PARTIALLY_PAID", "PAID"].includes(row.status),
  );

  return (
    <div className="pb-10">
      <PageHeader
        title="Accounting"
        subtitle="Posted stock-taking adjustment journals and account balances"
      />
      <div className="space-y-5 px-4 py-5 md:px-6">
        <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          Sales are shown as source transactions, including drafts. Only completed sales are
          recognized in the completed-sales total; draft totals are separate. Posted journal entries
          below currently include stock-taking adjustments and reversals only.
        </p>

        {register.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
          >
            {register.error.message}
          </p>
        )}
        {register.isPending && (
          <div className="rounded-xl border p-6 text-sm text-muted-foreground">
            Loading accounting register…
          </div>
        )}
        {data && (
          <>
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold">Sales activity</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="All sales" value={String(data.salesMeta.totalCount)} />
                <SummaryCard label="Completed revenue" value={money(completed?.total ?? 0)} />
                <SummaryCard
                  label="Completed sales"
                  value={`${completed?.count ?? 0} · ${money(completed?.total ?? 0)}`}
                />
                <SummaryCard
                  label="Drafts"
                  value={`${drafts?.count ?? 0} · ${money(drafts?.total ?? 0)}`}
                />
              </div>
              {pendingPayment && pendingPayment.count > 0 && (
                <div className="rounded-lg border p-3 text-sm">
                  Pending / partially paid sales: {pendingPayment.count} ·{" "}
                  {money(pendingPayment.total)}
                </div>
              )}
              {otherStatuses && otherStatuses.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {otherStatuses.map((row) => (
                    <span key={row.status} className="rounded-md border px-3 py-1.5 text-xs">
                      {row.status.replaceAll("_", " ")}: {row.count} · {money(row.total)}
                    </span>
                  ))}
                </div>
              )}

              {data.sales.length === 0 ? (
                <EmptyState
                  icon="🧾"
                  title="No sales transactions"
                  body="Sales and saved drafts will appear here."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="p-3">Created</th>
                        <th className="p-3">Receipt / Draft</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Channel</th>
                        <th className="p-3">Cashier</th>
                        <th className="p-3 text-right">Total</th>
                        <th className="p-3 text-right">Paid</th>
                        <th className="p-3 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sales.map((sale) => (
                        <tr key={sale.id} className="border-t">
                          <td className="whitespace-nowrap p-3 text-muted-foreground">
                            {new Date(sale.createdAt).toLocaleString()}
                          </td>
                          <td className="p-3 font-mono">{sale.receiptNo ?? "Draft"}</td>
                          <td className="p-3">{sale.status.replaceAll("_", " ")}</td>
                          <td className="p-3">{sale.channel}</td>
                          <td className="p-3">{sale.userName ?? "—"}</td>
                          <td className="p-3 text-right tabular-nums">{money(sale.total)}</td>
                          <td className="p-3 text-right tabular-nums">{money(sale.paidAmount)}</td>
                          <td className="p-3 text-right tabular-nums">{money(sale.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.salesMeta.lastPage > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Page {data.salesMeta.page} of {data.salesMeta.lastPage} ·{" "}
                    {data.salesMeta.totalCount} sales
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={salesPage <= 1 || register.isFetching}
                      onClick={() => setSalesPage((value) => Math.max(1, value - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={salesPage >= data.salesMeta.lastPage || register.isFetching}
                      onClick={() => setSalesPage((value) => value + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold">Account balances</h2>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-3">Code</th>
                      <th className="p-3">Account</th>
                      <th className="p-3">Type</th>
                      <th className="p-3 text-right">Debits</th>
                      <th className="p-3 text-right">Credits</th>
                      <th className="p-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.map((account) => (
                      <tr key={account.code} className="border-t">
                        <td className="p-3 font-mono">{account.code}</td>
                        <td className="p-3 font-medium">{account.name}</td>
                        <td className="p-3 text-muted-foreground">{account.type}</td>
                        <td className="p-3 text-right tabular-nums">{money(account.debitTotal)}</td>
                        <td className="p-3 text-right tabular-nums">
                          {money(account.creditTotal)}
                        </td>
                        <td className="p-3 text-right font-semibold tabular-nums">
                          {money(account.balance)} {account.balanceSide}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold">Posted journal register</h2>
              {data.entries.length === 0 ? (
                <EmptyState
                  icon="📒"
                  title="No posted journals yet"
                  body="Approved stock-taking adjustments will appear here after posting."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="p-3">Posted</th>
                        <th className="p-3">Reference</th>
                        <th className="p-3">Source</th>
                        <th className="p-3">Description</th>
                        <th className="p-3 text-right">Debit</th>
                        <th className="p-3 text-right">Credit</th>
                        <th className="p-3">Lines</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map((entry) => (
                        <tr key={entry.id} className="border-t align-top">
                          <td className="whitespace-nowrap p-3 text-muted-foreground">
                            {new Date(entry.postedAt).toLocaleString()}
                          </td>
                          <td className="p-3 font-mono">{entry.ref}</td>
                          <td className="p-3">{entry.sourceType.replaceAll("_", " ")}</td>
                          <td className="p-3">{entry.description}</td>
                          <td className="p-3 text-right tabular-nums">{money(entry.debitTotal)}</td>
                          <td className="p-3 text-right tabular-nums">
                            {money(entry.creditTotal)}
                          </td>
                          <td className="p-3">
                            <details>
                              <summary className="cursor-pointer text-primary">
                                View {entry.lines.length} lines
                              </summary>
                              <div className="mt-2 min-w-[18rem] space-y-2">
                                {entry.lines.map((line, index) => (
                                  <div
                                    key={`${entry.id}-${line.accountCode}-${index}`}
                                    className="grid grid-cols-[1fr_auto_auto] gap-3 border-t pt-2 text-xs"
                                  >
                                    <span>
                                      {line.accountCode} · {line.accountName}
                                    </span>
                                    <span>Dr {money(line.debit)}</span>
                                    <span>Cr {money(line.credit)}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.meta.lastPage > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Page {data.meta.page} of {data.meta.lastPage} · {data.meta.totalCount} journals
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || register.isFetching}
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= data.meta.lastPage || register.isFetching}
                      onClick={() => setPage((value) => value + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-lg font-bold">{value}</p>
    </div>
  );
}
