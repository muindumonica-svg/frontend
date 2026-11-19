import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Coins, History, Lock, Pencil, Plus, UserRound } from "lucide-react";
import { usePermissions, useSession } from "@/api/hooks/auth";
import {
  useCreateCustomer,
  useCustomer,
  useCustomerFinancialHistory,
  useCustomerList,
  useCustomerLoyalty,
  useDeleteCustomer,
  useAdjustLoyalty,
  useApproveLoyaltyRedemption,
  useLoyaltyDashboard,
  useLoyaltyRedemptionRequests,
  useRejectLoyaltyRedemption,
  useUpdateCustomer,
} from "@/api/hooks/directory";
import { ApiError, fieldError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader } from "@/components/shared";
import { fmtDateTime, money } from "@/lib/money";
import type {
  Customer,
  CustomerInput,
  LoyaltyRedemptionRequest,
  LoyaltyRedemptionStatus,
} from "@/types/api";

export const Route = createFileRoute("/_app/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const session = useSession();
  const permissions = usePermissions();
  const canManage = permissions.includes("customers");
  const canEdit = canManage && session.data?.user.role !== "cashier";
  const canDelete = permissions.includes("users");
  const canManageLoyalty = permissions.includes("settings");
  const canApproveLoyalty = permissions.includes("loyalty");

  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo(() => (q ? { q } : {}), [q]);
  const customers = useCustomerList(filters);
  const loyaltyDashboard = useLoyaltyDashboard(canManageLoyalty);

  // Server-side search is the source of truth; no local filtering of the list.
  if (session.isSuccess && !canManage) {
    return (
      <div className="pb-10">
        <PageHeader title="Customers" />
        <div className="px-4 py-5 md:px-6">
          <LockedPanel body="Your role does not include the customers permission." />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Customers"
        subtitle={
          customers.isSuccess
            ? `${customers.data.length} registered customers`
            : "Customer directory"
        }
        actions={
          canManage ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="mr-1 h-4 w-4" /> New Customer
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4 px-4 py-5 md:px-6">
        {canManageLoyalty && <LoyaltyDashboardPanel dashboard={loyaltyDashboard} />}
        {canApproveLoyalty && <LoyaltyRedemptionQueue />}
        <Input
          placeholder="Search by name, phone, email, or customer number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        {customers.isPending && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        )}
        {customers.isError &&
          (customers.error instanceof ApiError && customers.error.status === 403 ? (
            <LockedPanel />
          ) : (
            <RetryPanel
              message="Customers did not load."
              detail={customers.error.message}
              retrying={customers.isFetching}
              onRetry={() => void customers.refetch()}
            />
          ))}
        {customers.isSuccess && customers.data.length === 0 && (
          <EmptyState
            icon="👤"
            title="No customers found"
            body={
              q
                ? "No customers match this search."
                : "Walk-in customers don't need to be registered."
            }
          />
        )}
        {customers.isSuccess && customers.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customers.data.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                canManage={canManage}
                canEdit={canEdit}
                canDelete={canDelete}
                canManageLoyalty={canManageLoyalty}
                onEdit={() => setEditing(c)}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <CustomerDialog
          customer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Lifetime stats come from `GET /customers/{id}` meta (`CustomerSummary`) —
 * they are no longer computable from a local ledger.
 */
function CustomerCard({
  customer,
  canManage,
  canEdit,
  canDelete,
  canManageLoyalty,
  onEdit,
}: {
  customer: Customer;
  canManage: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageLoyalty: boolean;
  onEdit: () => void;
}) {
  const [financialOpen, setFinancialOpen] = useState(false);
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const detail = useCustomer(customer.id);
  // `queryFn` resolves to `{ data, meta }`, so the summary sits on `data.meta`.
  const summary = detail.data?.meta;
  const del = useDeleteCustomer();

  function remove() {
    del.mutate(customer.id, {
      // The API refuses deletes while sales history exists (409) — show its message.
      onSuccess: () => toast.success("Customer deleted"),
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <UserRound className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{customer.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {customer.customerNo} · {customer.phone ?? "—"}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Sales</span>
          <span className="font-medium">{summary ? summary.salesCount : "…"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total spent</span>
          <span className="font-medium">{summary ? money(summary.totalSpent) : "…"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Outstanding</span>
          <span className="font-medium">{summary ? money(summary.outstandingBalance) : "…"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Account</span>
          <span className="font-medium">{customer.accountStatus}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Since</span>
          <span className="font-medium">{fmtDateTime(customer.createdAt)}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => setFinancialOpen(true)}
        >
          <History className="mr-1 h-3 w-3" /> Financial history
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setLoyaltyOpen(true)}>
          <Coins className="mr-1 h-3 w-3" /> Loyalty
        </Button>
      </div>
      {canManage && (canEdit || canDelete) && (
        <div className="mt-2 flex gap-2">
          {canEdit && (
            <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={del.isPending}
              onClick={remove}
            >
              Delete
            </Button>
          )}
        </div>
      )}
      {financialOpen && (
        <CustomerFinancialDialog customer={customer} onClose={() => setFinancialOpen(false)} />
      )}
      {loyaltyOpen && (
        <CustomerLoyaltyDialog
          customer={customer}
          canAdjust={canManageLoyalty}
          onClose={() => setLoyaltyOpen(false)}
        />
      )}
    </div>
  );
}

function LoyaltyRedemptionQueue() {
  const [status, setStatus] = useState<LoyaltyRedemptionStatus>("PENDING");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const requests = useLoyaltyRedemptionRequests(status);
  const approve = useApproveLoyaltyRedemption();
  const reject = useRejectLoyaltyRedemption();
  const pending = status === "PENDING";

  function approveRequest(request: LoyaltyRedemptionRequest) {
    approve.mutate(request, {
      onSuccess: () => toast.success("Loyalty redemption approved and reserved"),
      onError: (error) => toast.error(`Could not approve redemption: ${error.message}`),
    });
  }

  function rejectRequest(request: LoyaltyRedemptionRequest) {
    const reason = reasons[request.id]?.trim() ?? "";
    if (reason.length < 3) {
      toast.error("Enter a reason of at least three characters.");
      return;
    }
    reject.mutate(
      { request, reason },
      {
        onSuccess: () => toast.success("Loyalty redemption rejected"),
        onError: (error) => toast.error(`Could not reject redemption: ${error.message}`),
      },
    );
  }

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div>
        <h2 className="font-display text-base font-bold">Loyalty Redemption Requests</h2>
        <p className="text-xs text-muted-foreground">
          Approval reserves points for the sale. Points are consumed only when the sale completes.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          ["PENDING", "APPROVED", "APPLIED", "REJECTED", "CANCELLED"] as LoyaltyRedemptionStatus[]
        ).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={status === value ? "default" : "outline"}
            onClick={() => setStatus(value)}
          >
            {value === "PENDING" ? "Pending" : value[0] + value.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>
      {requests.isPending && <Skeleton className="h-20 rounded-lg" />}
      {requests.isError && (
        <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
          Redemption requests could not be loaded: {requests.error.message}
        </p>
      )}
      {requests.isSuccess && requests.data.items.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No {status.toLowerCase()} redemption requests.
        </p>
      )}
      <div className="space-y-2">
        {requests.data?.items.map((request) => (
          <article key={request.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {request.customerName ?? "Customer"} · {request.points.toLocaleString()} points ·{" "}
                  {money(request.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {request.saleReceiptNo ?? request.saleId} · {request.branchName ?? "Branch"} ·{" "}
                  {request.requestedByName ?? "Online customer"} ·{" "}
                  {request.requestedAt ? fmtDateTime(request.requestedAt) : "Time unavailable"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {request.status === "APPROVED"
                    ? "Points are reserved until this sale completes or is cancelled."
                    : "Points are not reserved until approval."}{" "}
                  Status: {request.status}
                  {request.authorizedByName ? ` · Authorized by ${request.authorizedByName}` : ""}
                  {request.rejectionReason ? ` · ${request.rejectionReason}` : ""}
                </p>
              </div>
              {pending && (
                <Button
                  size="sm"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() => approveRequest(request)}
                >
                  Approve and apply
                </Button>
              )}
            </div>
            {pending && (
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-52 flex-1"
                  placeholder="Reason required to reject"
                  value={reasons[request.id] ?? ""}
                  onChange={(event) =>
                    setReasons((previous) => ({ ...previous, [request.id]: event.target.value }))
                  }
                />
                <Button
                  variant="outline"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() => rejectRequest(request)}
                >
                  Reject
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function LoyaltyDashboardPanel({
  dashboard,
}: {
  dashboard: ReturnType<typeof useLoyaltyDashboard>;
}) {
  if (dashboard.isPending) return <Skeleton className="h-48 rounded-xl" />;
  if (dashboard.isError) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm">
        <p className="font-semibold">Loyalty dashboard did not load.</p>
        <p className="mt-1 text-muted-foreground">{dashboard.error.message}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={dashboard.isFetching}
          onClick={() => void dashboard.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  const data = dashboard.data;
  const topCustomers = data.topCustomers ?? [];
  const recentTransactions = data.recentTransactions ?? [];
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div>
        <h2 className="font-display text-base font-bold">Customer Loyalty &amp; Rewards</h2>
        <p className="text-xs text-muted-foreground">Programme balances and recent activity</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LoyaltyMetric
          label="Enrolled customers"
          value={(data.enrolledCustomers ?? 0).toLocaleString()}
        />
        <LoyaltyMetric
          label="Points issued"
          value={(data.totalPointsIssued ?? 0).toLocaleString()}
        />
        <LoyaltyMetric
          label="Points redeemed"
          value={(data.totalPointsRedeemed ?? 0).toLocaleString()}
        />
        <LoyaltyMetric
          label="Outstanding points liability"
          value={money(data.outstandingLiability ?? 0)}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Most loyal customers</h3>
          {topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No loyalty points have been earned yet.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {topCustomers.map((customer, index) => (
                <div
                  key={customer.customerId}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {index + 1}. {customer.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {customer.phone ?? "No phone"}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold">
                    {customer.balance.toLocaleString()} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Recent loyalty transactions</h3>
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No loyalty activity yet.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {recentTransactions.map((transaction) => (
                <div key={transaction.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {transaction.customerName ?? "Customer"} · {transaction.type}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {transaction.saleReceiptNo ?? transaction.reason ?? "Manual account activity"}
                      {" · "}
                      {fmtDateTime(transaction.createdAt)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold">
                    {transaction.points > 0 ? "+" : ""}
                    {transaction.points.toLocaleString()} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function LoyaltyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}

function CustomerLoyaltyDialog({
  customer,
  canAdjust,
  onClose,
}: {
  customer: Customer;
  canAdjust: boolean;
  onClose: () => void;
}) {
  const loyalty = useCustomerLoyalty(customer.id);
  const adjust = useAdjustLoyalty();
  const loyaltyBalance = loyalty.data?.balance ?? 0;
  const totalEarned = loyalty.data?.totalEarned ?? 0;
  const totalRedeemed = loyalty.data?.totalRedeemed ?? 0;
  const transactions = loyalty.data?.transactions ?? [];
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");

  function submitAdjustment() {
    const amount = Number(points);
    if (!Number.isInteger(amount) || amount === 0) {
      toast.error("Enter a non-zero whole number of points.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required for every manual adjustment.");
      return;
    }
    adjust.mutate(
      { customerId: customer.id, points: amount, reason: reason.trim() },
      {
        onSuccess: () => {
          setPoints("");
          setReason("");
          setAdjustOpen(false);
          toast.success("Loyalty points adjusted.");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer.name} · loyalty account</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {customer.customerNo} · {customer.phone ?? "No primary phone"}
        </p>
        {loyalty.isPending && <Skeleton className="h-24 rounded-lg" />}
        {loyalty.isError && (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm">
            <p className="font-medium">Loyalty account did not load.</p>
            <p className="mt-1 text-muted-foreground">{loyalty.error.message}</p>
            <Button
              variant="outline"
              className="mt-3"
              disabled={loyalty.isFetching}
              onClick={() => void loyalty.refetch()}
            >
              Try again
            </Button>
          </div>
        )}
        {loyalty.isSuccess && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <LoyaltyMetric label="Available points" value={loyaltyBalance.toLocaleString()} />
              <LoyaltyMetric label="Total earned" value={totalEarned.toLocaleString()} />
              <LoyaltyMetric label="Total redeemed" value={totalRedeemed.toLocaleString()} />
            </div>
            {canAdjust && (
              <div>
                <Button variant="outline" size="sm" onClick={() => setAdjustOpen((open) => !open)}>
                  {adjustOpen ? "Cancel adjustment" : "Adjust points"}
                </Button>
                {adjustOpen && (
                  <div className="mt-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_2fr_auto]">
                    <Input
                      type="number"
                      step={1}
                      placeholder="+/- points"
                      value={points}
                      onChange={(event) => setPoints(event.target.value)}
                      aria-label="Points adjustment"
                    />
                    <Input
                      placeholder="Mandatory adjustment reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      aria-label="Adjustment reason"
                    />
                    <Button disabled={adjust.isPending} onClick={submitAdjustment}>
                      {adjust.isPending ? "Saving…" : "Apply"}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Transaction history</h3>
              {transactions.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No loyalty transactions recorded.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Activity</th>
                        <th className="p-3">Reference / reason</th>
                        <th className="p-3 text-right">Points</th>
                        <th className="p-3 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="whitespace-nowrap p-3">
                            {fmtDateTime(transaction.createdAt)}
                          </td>
                          <td className="p-3">
                            {transaction.type}
                            {transaction.userName ? (
                              <span className="block text-xs text-muted-foreground">
                                by {transaction.userName}
                              </span>
                            ) : null}
                          </td>
                          <td className="max-w-56 truncate p-3">
                            {transaction.saleReceiptNo ?? transaction.reason ?? "—"}
                          </td>
                          <td className="p-3 text-right font-medium">
                            {transaction.points > 0 ? "+" : ""}
                            {transaction.points.toLocaleString()}
                          </td>
                          <td className="p-3 text-right">
                            {transaction.balanceAfter?.toLocaleString() ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CustomerFinancialDialog({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const history = useCustomerFinancialHistory(customer.id, page);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer.name} · financial history</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {customer.customerNo} · {customer.phone ?? "No primary phone"}
        </p>
        {history.isPending && <Skeleton className="h-28 rounded-lg" />}
        {history.isError && (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm">
            <p className="font-medium">Financial history did not load.</p>
            <p className="mt-1 text-muted-foreground">{history.error.message}</p>
            <Button variant="outline" className="mt-3" onClick={() => void history.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {history.isSuccess && history.data.items.length === 0 && (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No purchases or payments are linked to this customer.
          </p>
        )}
        {history.isSuccess && history.data.items.length > 0 && (
          <>
            <ul className="divide-y rounded-lg border">
              {history.data.items.map((event) => (
                <li
                  key={`${event.type}-${event.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {event.type === "PAYMENT"
                        ? `${event.method ?? "Payment"} payment`
                        : event.type === "REFUND"
                          ? `${event.method ?? "Payment"} refund`
                          : event.type === "ORDER"
                            ? "Online order"
                            : "Sale"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {event.reference ?? event.saleReceiptNo ?? event.saleId} ·{" "}
                      {fmtDateTime(event.occurredAt)}
                      {event.cashierName ? ` · ${event.cashierName}` : ""}
                    </p>
                    {event.items.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {event.items.map((item) => (
                          <li key={item.id} className="flex items-center gap-1.5">
                            <ProductImage
                              name={item.productName}
                              productId={item.productId}
                              className="h-5 w-5 shrink-0 rounded-sm"
                            />
                            {item.productName} · {item.qtyLabel} · {money(item.total)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{money(event.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.status.replaceAll("_", " ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-between">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || history.isFetching}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <span className="self-center text-xs text-muted-foreground">
                Page {history.data.meta.page} · {history.data.meta.totalCount} events
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  page * history.data.meta.perPage >= history.data.meta.totalCount ||
                  history.isFetching
                }
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CustomerDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer(customer?.id ?? "");
  const mutation = customer ? update : create;

  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [alternativePhone, setAlternativePhone] = useState(customer?.alternativePhone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [active, setActive] = useState(customer?.active ?? true);

  function save() {
    const input: CustomerInput = {
      name: name.trim(),
      phone: phone.trim() || null,
      alternativePhone: alternativePhone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      active,
    };
    (customer ? update.mutateAsync(input) : create.mutateAsync(input))
      .then(() => {
        toast.success(customer ? "Customer updated" : "Customer added");
        onClose();
      })
      .catch(() => {
        // 422 field errors render inline below.
      });
  }

  const error = mutation.error;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit Customer" : "New Customer"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error.message}
            </p>
          )}
          <div>
            <Label htmlFor="cust-name">Name</Label>
            <Input
              id="cust-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
            <FieldMsg text={fieldError(error, "name")} />
          </div>
          <div>
            <Label htmlFor="cust-phone">Phone</Label>
            <Input
              id="cust-phone"
              value={phone ?? ""}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1"
              placeholder="07XX XXX XXX"
            />
            <FieldMsg text={fieldError(error, "phone")} />
          </div>
          <div>
            <Label htmlFor="cust-alt-phone">Alternative phone</Label>
            <Input
              id="cust-alt-phone"
              value={alternativePhone}
              onChange={(e) => setAlternativePhone(e.target.value)}
              className="mt-1"
            />
            <FieldMsg text={fieldError(error, "alternativePhone")} />
          </div>
          <div>
            <Label htmlFor="cust-email">Email</Label>
            <Input
              id="cust-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
            <FieldMsg text={fieldError(error, "email")} />
          </div>
          <div>
            <Label htmlFor="cust-address">Address</Label>
            <Textarea
              id="cust-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1"
            />
            <FieldMsg text={fieldError(error, "address")} />
          </div>
          {customer && (
            <label className="flex items-center gap-2 text-sm">
              <Input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4"
              />
              Account active
            </label>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : customer ? "Save" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldMsg({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="mt-1 text-xs font-medium text-destructive">{text}</p>;
}

function LockedPanel({ body }: { body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      <Lock className="h-8 w-8 text-muted-foreground" />
      <p className="mt-3 font-semibold">Customers are not available for your role</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {body ?? "Ask a manager for the customers permission to view this page."}
      </p>
    </div>
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
