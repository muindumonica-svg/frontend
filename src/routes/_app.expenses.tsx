import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  landingPathFor,
  useActiveBranchId,
  usePermissions,
  useSession,
  useSessionBranches,
} from "@/api/hooks/auth";
import { useExpenses, useRecordExpense } from "@/api/hooks/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader } from "@/components/shared";
import { fmtDateTime, money } from "@/lib/money";
import type { ExpenseListFilters } from "@/types/api";
import { businessYmd, shiftYmd } from "@/lib/dates";

export const Route = createFileRoute("/_app/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  const navigate = useNavigate();
  const session = useSession();
  const permissions = usePermissions();
  const isCashier = session.data?.user.role === "cashier";
  const branches = useSessionBranches();
  const activeBranchId = useActiveBranchId();
  const [branchId, setBranchId] = useState(activeBranchId ?? "ALL");
  const [from, setFrom] = useState(shiftYmd(businessYmd(), -29));
  const [to, setTo] = useState(businessYmd());
  const [page, setPage] = useState(1);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptReference, setReceiptReference] = useState("");
  const recordExpense = useRecordExpense();

  useEffect(() => {
    if (!session.isSuccess || permissions.includes("expenses")) return;
    navigate({ to: landingPathFor(session.data), replace: true });
  }, [session.isSuccess, session.data, permissions, navigate]);

  const filters = useMemo<ExpenseListFilters>(() => {
    const next: ExpenseListFilters = { from, to, page, perPage: 25 };
    if (branchId !== "ALL") next.branchId = branchId;
    return next;
  }, [branchId, from, to, page]);
  const expenses = useExpenses(filters);
  const payload = expenses.data;
  const summary = payload?.summary;
  const canCreate = branchId !== "ALL" && Boolean(branchId) && Number(amount) > 0;

  function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) {
      toast.error("Choose a branch and enter a positive amount.");
      return;
    }
    if (Number(amount) > (summary?.availableCash ?? 0)) {
      toast.error(
        `Expense exceeds available cash-sale proceeds (${money(summary?.availableCash ?? 0)}).`,
      );
      return;
    }
    recordExpense.mutate(
      {
        branchId,
        category: "OTHER",
        description: description.trim(),
        amount: Number(amount),
        receiptReference: receiptReference.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Expense recorded.");
          setDescription("");
          setAmount("");
          setReceiptReference("");
          setPage(1);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Expenses"
        subtitle={
          isCashier
            ? "Record and review branch expenses"
            : "Cash-sale-funded expenses and profit & loss"
        }
      />
      <div className="space-y-4 px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-48">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Branch
            </span>
            <Select
              value={branchId}
              onValueChange={(value) => {
                setBranchId(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              From
            </span>
            <Input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
              className="h-10"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              To
            </span>
            <Input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
              className="h-10"
            />
          </label>
        </div>

        {expenses.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
          >
            {expenses.error.message}
          </p>
        )}
        {!isCashier && summary && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="Revenue" value={money(summary.revenue)} />
              <SummaryCard label="Cost of goods" value={money(summary.costOfGoods)} />
              <SummaryCard label="Gross profit" value={money(summary.grossProfit)} />
              <SummaryCard label="Expenses" value={money(summary.expenses)} />
              <SummaryCard label="Net profit" value={money(summary.netProfit)} strong />
            </div>
            <div className="rounded-xl border border-brand/30 bg-brand-soft p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Available cash-sale proceeds
              </p>
              <p className="mt-1 min-w-0 font-display text-xl font-bold sm:text-2xl [overflow-wrap:anywhere]">
                {money(summary.availableCash)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                All-time successful cash sales, less cash refunds and recorded expenses. M-Pesa,
                card, and opening float are excluded.
              </p>
            </div>
          </>
        )}
        {isCashier && summary && (
          <div className="rounded-xl border border-brand/30 bg-brand-soft p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Available cash
            </p>
            <p className="mt-1 min-w-0 font-display text-xl font-bold sm:text-2xl [overflow-wrap:anywhere]">
              {money(summary.availableCash)}
            </p>
          </div>
        )}

        <form
          onSubmit={submitExpense}
          className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2"
        >
          <h2 className="font-display font-bold md:col-span-2">Record an expense</h2>
          {branchId === "ALL" && (
            <p className="text-sm text-muted-foreground md:col-span-2">
              Select a specific branch above before recording an expense.
            </p>
          )}
          <label className="text-sm">
            <span className="mb-1 block font-medium">Amount (KSh)</span>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block font-medium">Description</span>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Receipt/reference (optional)</span>
            <Input
              value={receiptReference}
              onChange={(event) => setReceiptReference(event.target.value)}
              maxLength={120}
            />
          </label>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!canCreate || recordExpense.isPending || expenses.isPending}
            >
              {recordExpense.isPending ? "Recording…" : "Record expense"}
            </Button>
          </div>
        </form>

        {expenses.isPending && (
          <div className="rounded-xl border p-6 text-sm text-muted-foreground">
            Loading expense records…
          </div>
        )}
        {expenses.isSuccess && expenses.data.items.length === 0 && (
          <EmptyState
            icon="🧾"
            title="No expenses in this period"
            body="Record an expense above or adjust the filters."
          />
        )}
        {expenses.isSuccess && expenses.data.items.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Branch</th>
                    <th className="p-3">Receipt/ref</th>
                    <th className="p-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.data.items.map((expense) => (
                    <tr key={expense.id} className="border-t">
                      <td className="p-3 text-muted-foreground">{fmtDateTime(expense.spentAt)}</td>
                      <td className="p-3">{expense.description}</td>
                      <td className="p-3">{expense.branchName ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {expense.receiptReference ?? "—"}
                      </td>
                      <td className="p-3 text-right font-semibold">{money(expense.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {expenses.data.meta.page} · {expenses.data.meta.totalCount} expenses
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || expenses.isFetching}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    page >= Math.max(1, Math.ceil(expenses.data.meta.totalCount / 25)) ||
                    expenses.isFetching
                  }
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-xl border bg-card p-4 ${strong ? "border-brand/50" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 min-w-0 font-display text-lg font-bold sm:text-xl [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}
