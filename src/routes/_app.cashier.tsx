import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { landingPathFor, useActiveBranchId, usePermissions, useSession } from "@/api/hooks/auth";
import { QueryKeys } from "@/api/hooks/keys";
import { useUserList } from "@/api/hooks/directory";
import { useSaleList } from "@/api/hooks/sales";
import { CashierOnlineOrderQueue } from "@/components/online-orders/cashier-online-order-queue";
import {
  useAddShiftMovement,
  useCloseShift,
  useCurrentShift,
  useOpenShift,
  useReviewShift,
  useShiftList,
} from "@/api/hooks/shifts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader, StatusPill } from "@/components/shared";
import { ApiError, fieldError } from "@/lib/api";
import { fmtDateTime, posMoney as money } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/types/api";
import type {
  CashierShift,
  CashMovementType,
  SaleListFilters,
  ShiftListFilters,
} from "@/types/api";

export const Route = createFileRoute("/_app/cashier")({
  component: CashierPage,
});

function CashierPage() {
  const navigate = useNavigate();
  const session = useSession();
  const permissions = usePermissions();
  const branchId = useActiveBranchId();
  const userId = session.data?.user.id ?? null;

  const [openDlg, setOpenDlg] = useState(false);
  const [moveDlg, setMoveDlg] = useState(false);
  const [closingShift, setClosingShift] = useState<CashierShift | null>(null);
  const [reviewingShift, setReviewingShift] = useState<CashierShift | null>(null);

  // The nav already hides Cashier, but a direct URL needs the session's own grant.
  useEffect(() => {
    if (!session.isSuccess || permissions.includes("cashier")) return;
    const target = landingPathFor(session.data);
    if (target !== "/cashier") navigate({ to: target, replace: true });
  }, [session.isSuccess, session.data, permissions, navigate]);

  const currentShift = useCurrentShift(userId, branchId ? { branchId } : {});
  const shift = currentShift.data ?? null;

  // Managers/admins (they hold `reports`) see the whole branch; everyone else is scoped to
  // their own shifts. The API scopes per user anyway, so the `userId` is belt-and-braces.
  const seesAllShifts = permissions.includes("reports");
  const canReview = permissions.includes("pos_void");
  const canManageOthers = permissions.includes("users");
  const historyFilters = useMemo<ShiftListFilters>(() => {
    const filters: ShiftListFilters = {};
    if (branchId) filters.branchId = branchId;
    if (!seesAllShifts && userId) filters.userId = userId;
    return filters;
  }, [branchId, seesAllShifts, userId]);
  const history = useShiftList(historyFilters);

  return (
    <div className="pb-10">
      <PageHeader
        title="Cashier Shifts"
        subtitle="Open and close shifts, record cash movements, reconcile"
        actions={
          currentShift.isPending ? (
            <Skeleton className="h-9 w-28" />
          ) : shift ? (
            <>
              <Button variant="outline" onClick={() => setMoveDlg(true)}>
                Cash Movement
              </Button>
              <Button variant="destructive" onClick={() => setClosingShift(shift)}>
                Close Shift
              </Button>
            </>
          ) : (
            <Button disabled={!branchId} onClick={() => setOpenDlg(true)}>
              Open Shift
            </Button>
          )
        }
      />

      <div className="space-y-4 px-4 py-5 md:px-6">
        {permissions.includes("pos") && <CashierOnlineOrderQueue branchId={branchId} />}
        {!branchId && session.isSuccess && (
          <p className="rounded-lg border border-brand/40 bg-brand-soft px-3 py-2 text-xs font-semibold text-brand-deep">
            No branch is active for this session — choose one in the sidebar before opening a shift.
          </p>
        )}

        {currentShift.isError ? (
          <RetryPanel
            message="Your current shift did not load."
            detail={currentShift.error.message}
            retrying={currentShift.isFetching}
            onRetry={() => void currentShift.refetch()}
          />
        ) : currentShift.isPending ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : shift ? (
          <OpenShiftCard shift={shift} />
        ) : null}

        <ShiftHistory
          loading={history.isPending}
          failed={history.isError}
          error={history.error}
          retrying={history.isFetching}
          onRetry={() => void history.refetch()}
          shifts={history.data ?? []}
          canReview={canReview}
          canManageOthers={canManageOthers}
          userId={userId}
          onReview={setReviewingShift}
          onClose={setClosingShift}
        />
        {userId && <CashierSales userId={userId} />}
      </div>

      {openDlg && (
        <OpenDialog
          branchId={branchId}
          branchName={session.data?.branches.find((branch) => branch.id === branchId)?.name ?? ""}
          canAssign={permissions.includes("users")}
          onClose={() => setOpenDlg(false)}
        />
      )}
      {moveDlg && shift && <MoveDialog shift={shift} onClose={() => setMoveDlg(false)} />}
      {closingShift && <CloseDialog shift={closingShift} onClose={() => setClosingShift(null)} />}
      {reviewingShift && (
        <ReviewDialog shift={reviewingShift} onClose={() => setReviewingShift(null)} />
      )}
    </div>
  );
}

function CashierSales({ userId }: { userId: string }) {
  const perPage = 50;
  const [page, setPage] = useState(1);
  const filters = useMemo<SaleListFilters>(() => ({ userId, page, perPage }), [userId, page]);
  const sales = useSaleList(filters);
  const meta = sales.data?.meta;
  const pageCount = meta ? Math.max(1, Math.ceil(meta.totalCount / perPage)) : 1;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-bold">My Sales</h2>
        <p className="text-sm text-muted-foreground">
          All sales you recorded, including drafts, pending payments, completed, cancelled and
          refunded transactions.
        </p>
      </div>
      {sales.isPending && <Skeleton className="h-40 w-full rounded-xl" />}
      {sales.isError && (
        <RetryPanel
          message="Your sales did not load."
          detail={sales.error.message}
          retrying={sales.isFetching}
          onRetry={() => void sales.refetch()}
        />
      )}
      {sales.isSuccess && sales.data.items.length === 0 && (
        <EmptyState icon="🧾" title="No sales yet" body="Sales you record will appear here." />
      )}
      {sales.isSuccess && sales.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Sale / Receipt</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Items</th>
                  <th className="p-3">Payments</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.data.items.map((sale) => (
                  <tr key={sale.id} className="border-t">
                    <td className="p-3">
                      <p className="font-semibold">{sale.receiptNo ?? "No receipt yet"}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{sale.id}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {fmtDateTime(sale.completedAt ?? sale.createdAt)}
                    </td>
                    <td className="p-3">{sale.items.length}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {sale.payments
                          .filter((payment) => payment.status === "SUCCESS")
                          .map((payment) => (
                            <span
                              key={payment.id}
                              className="rounded-full bg-muted px-2 py-0.5 text-xs"
                            >
                              {PAYMENT_METHOD_LABELS[payment.method]} {money(payment.amount)}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <StatusPill status={sale.status} />
                    </td>
                    <td className="p-3 text-right font-semibold">{money(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {meta?.page ?? page} of {pageCount} ·{" "}
              {meta?.totalCount ?? sales.data.items.length} sales
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || sales.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount || sales.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/** The open-shift drawer summary. Expected cash is only known at close, server-side. */
function OpenShiftCard({ shift }: { shift: CashierShift }) {
  const movements = shift.cashMovements;
  const netMoved = movements.reduce(
    (sum, movement) => sum + (movement.type === "IN" ? movement.amount : -movement.amount),
    0,
  );

  return (
    <div className="rounded-xl border-2 border-brand/40 bg-brand-soft p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-lg font-bold">Shift Open — {shift.ref}</p>
          <p className="text-sm text-muted-foreground">
            Opened {fmtDateTime(shift.openedAt)} · Float {money(shift.openingFloat)}
          </p>
        </div>
        <StatusPill status="OPEN" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Opening float</p>
          <p className="font-display text-xl font-bold">{money(shift.openingFloat)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Cash movements</p>
          <p className="font-display text-xl font-bold">{movements.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Net moved (in − out)</p>
          <p className="font-display text-xl font-bold">{money(netMoved)}</p>
        </div>
      </div>

      {movements.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-brand/30 pt-3">
          {movements.map((movement) => (
            <div key={movement.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                {movement.type === "IN" ? "⬇ Cash in" : "⬆ Cash out"} · {movement.reason}
              </span>
              <span
                className={`font-semibold ${movement.type === "IN" ? "text-foreground" : "text-destructive"}`}
              >
                {movement.type === "IN" ? "+" : "−"}
                {money(movement.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftHistory({
  loading,
  failed,
  error,
  retrying,
  onRetry,
  shifts,
  canReview,
  canManageOthers,
  userId,
  onReview,
  onClose,
}: {
  loading: boolean;
  failed: boolean;
  error: Error | null;
  retrying: boolean;
  onRetry: () => void;
  shifts: CashierShift[];
  canReview: boolean;
  canManageOthers: boolean;
  userId: string | null;
  onReview: (shift: CashierShift) => void;
  onClose: (shift: CashierShift) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (failed) {
    return (
      <RetryPanel
        message="The shift history did not load."
        detail={error?.message}
        retrying={retrying}
        onRetry={onRetry}
      />
    );
  }

  if (shifts.length === 0) {
    return (
      <EmptyState icon="💰" title="No shifts yet" body="Open your first shift to start selling." />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="p-3">Ref</th>
            <th className="p-3">Assigned operator</th>
            <th className="p-3">Opened by</th>
            <th className="p-3">Opened</th>
            <th className="p-3">Closed</th>
            <th className="p-3 text-right">Float</th>
            <th className="p-3 text-right">Expected</th>
            <th className="p-3 text-right">Actual</th>
            <th className="p-3 text-right">Variance</th>
            <th className="p-3">Status</th>
            {(canReview || canManageOthers) && <th className="p-3" />}
          </tr>
        </thead>
        <tbody>
          {[...shifts].reverse().map((row) => (
            <tr key={row.id} className="border-t">
              <td className="p-3 font-medium">{row.ref}</td>
              <td className="p-3">{row.userName ?? "—"}</td>
              <td className="p-3">{row.openedByName ?? "—"}</td>
              <td className="p-3 text-muted-foreground">{fmtDateTime(row.openedAt)}</td>
              <td className="p-3 text-muted-foreground">
                {row.closedAt ? fmtDateTime(row.closedAt) : "—"}
              </td>
              <td className="p-3 text-right">{money(row.openingFloat)}</td>
              <td className="p-3 text-right">
                {row.expectedCash === null ? "—" : money(row.expectedCash)}
              </td>
              <td className="p-3 text-right">
                {row.actualCash === null ? "—" : money(row.actualCash)}
              </td>
              <td
                className={`p-3 text-right font-semibold ${
                  row.variance !== null && Math.abs(row.variance) > 0.01 ? "text-destructive" : ""
                }`}
              >
                {row.variance === null ? "—" : money(row.variance)}
              </td>
              <td className="p-3">
                <StatusPill status={row.status} />
              </td>
              {(canReview || canManageOthers) && (
                <td className="p-3 text-right">
                  {row.status === "OPEN" && (canManageOthers || row.userId === userId) && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="mr-2 h-8"
                      onClick={() => onClose(row)}
                    >
                      Close
                    </Button>
                  )}
                  {row.status === "UNDER_REVIEW" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => onReview(row)}
                    >
                      Review
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
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

function OpenDialog({
  branchId,
  branchName,
  canAssign,
  onClose,
}: {
  branchId: string | null;
  branchName: string;
  canAssign: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const openShift = useOpenShift();
  const [float, setFloat] = useState("0");
  const [shiftName, setShiftName] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [openedAt] = useState(() =>
    new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }),
  );
  const [conflict, setConflict] = useState(false);

  // `409 SHIFT_ALREADY_OPEN` is a state, not a crash: show a calm notice and
  // re-read the shift list so the open shift itself appears on the page.
  function submit() {
    if (!branchId) return;
    openShift.mutate(
      {
        branchId,
        openingFloat: parseFloat(float) || 0,
        ...(assignedUserId ? { assignedUserId } : {}),
        ...(shiftName.trim() ? { shiftName: shiftName.trim() } : {}),
      },
      {
        onError: (error) => {
          if (error instanceof ApiError && error.code === "SHIFT_ALREADY_OPEN") {
            setConflict(true);
            client.invalidateQueries({ queryKey: QueryKeys.shiftsRoot });
          }
        },
        onSuccess: (created) => {
          // The hooks refresh shifts; the dashboard's open-shift counter is a report.
          client.invalidateQueries({ queryKey: QueryKeys.reportsRoot });
          toast.success(`Shift ${created.ref} opened.`);
          onClose();
        },
      },
    );
  }

  const floatField = fieldError(openShift.error, "openingFloat");

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Open Cashier Shift</DialogTitle>
        </DialogHeader>

        {conflict ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-brand/40 bg-brand-soft px-3 py-2 text-sm font-medium text-brand-deep">
              You already have an open shift — close it before opening a new one. It is shown on
              this page so you can go straight to it.
            </p>
            <Button className="w-full" onClick={onClose}>
              Got it
            </Button>
          </div>
        ) : (
          <>
            <div>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="shift-branch">Branch</Label>
                  <Input
                    id="shift-branch"
                    value={branchName || "Choose a branch in the sidebar"}
                    readOnly
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="shift-name">Shift name (optional)</Label>
                  <Input
                    id="shift-name"
                    value={shiftName}
                    onChange={(event) => setShiftName(event.target.value)}
                    className="mt-1"
                    placeholder="General Shift"
                  />
                </div>
                {canAssign && branchId && (
                  <OperatorChooser
                    branchId={branchId}
                    assignedUserId={assignedUserId}
                    onChange={setAssignedUserId}
                  />
                )}
                <div>
                  <Label htmlFor="shift-opened-at">Opening date and time (Africa/Nairobi)</Label>
                  <Input id="shift-opened-at" value={openedAt} readOnly className="mt-1" />
                </div>
              </div>
              <div className="mt-4">
                <Label htmlFor="opening-float">Opening Float (KSh)</Label>
                <Input
                  id="opening-float"
                  autoFocus
                  type="number"
                  min={0}
                  value={float}
                  onChange={(event) => setFloat(event.target.value)}
                  className="mt-1 h-14 text-center font-display text-2xl font-bold"
                />
                {floatField && (
                  <p className="mt-1 text-xs font-medium text-destructive">{floatField}</p>
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={openShift.isPending || !branchId} onClick={submit}>
                Open Shift
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OperatorChooser({
  branchId,
  assignedUserId,
  onChange,
}: {
  branchId: string;
  assignedUserId: string;
  onChange: (userId: string) => void;
}) {
  const users = useUserList({ role: "cashier", active: true });
  const branchCashiers = (users.data ?? []).filter((user) => user.branchId === branchId);

  return (
    <div>
      <Label>Assigned operator</Label>
      <Select
        value={assignedUserId || "self"}
        onValueChange={(value) => onChange(value === "self" ? "" : value)}
      >
        <SelectTrigger className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="self">Me</SelectItem>
          {branchCashiers.map((cashier) => (
            <SelectItem key={cashier.id} value={cashier.id}>
              {cashier.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {users.isError && (
        <p className="mt-1 text-xs text-destructive">
          Cashier list did not load: {users.error.message}
        </p>
      )}
      {!users.isPending && !users.isError && branchCashiers.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          No active cashiers are assigned to this branch.
        </p>
      )}
    </div>
  );
}

function MoveDialog({ shift, onClose }: { shift: CashierShift; onClose: () => void }) {
  const addMovement = useAddShiftMovement(shift.id);
  const [type, setType] = useState<CashMovementType>("OUT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  function submit() {
    addMovement.mutate(
      { type, amount: parseFloat(amount) || 0, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success("Cash movement recorded.");
          onClose();
        },
      },
    );
  }

  const amountField = fieldError(addMovement.error, "amount");
  const reasonField = fieldError(addMovement.error, "reason");

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cash Movement — {shift.ref}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(value) => setType(value as CashMovementType)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN">Cash In (add)</SelectItem>
                <SelectItem value="OUT">Cash Out (remove)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="movement-amount">Amount (KSh)</Label>
            <Input
              id="movement-amount"
              type="number"
              min={0}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1"
            />
            {amountField && (
              <p className="mt-1 text-xs font-medium text-destructive">{amountField}</p>
            )}
          </div>
          <div>
            <Label htmlFor="movement-reason">Reason</Label>
            <Input
              id="movement-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1"
              placeholder="e.g. Petty cash, banking"
            />
            {reasonField && (
              <p className="mt-1 text-xs font-medium text-destructive">{reasonField}</p>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={addMovement.isPending || !amount || !reason.trim()} onClick={submit}>
            Record
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Counting the drawer. The server returns `expectedCash`, `variance` and the final
 * `status` — the till never computes them; `UNDER_REVIEW` means the variance broke tolerance.
 */
function CloseDialog({ shift, onClose }: { shift: CashierShift; onClose: () => void }) {
  const client = useQueryClient();
  const closeShift = useCloseShift(shift.id);
  const [actual, setActual] = useState("");
  const [reason, setReason] = useState("");

  const result = closeShift.data ?? null;
  const actualField = fieldError(closeShift.error, "actualCash");

  function submit() {
    closeShift.mutate(
      { actualCash: parseFloat(actual) || 0, reason: reason.trim() || undefined },
      {
        onSuccess: (closed) => {
          // The hook already refreshes shifts + payments; the dashboard's shift
          // counters are the one key it does not touch.
          client.invalidateQueries({ queryKey: QueryKeys.reportsRoot });
          toast.success(
            closed.status === "UNDER_REVIEW"
              ? `Shift ${closed.ref} closed — variance under review.`
              : `Shift ${closed.ref} closed.`,
          );
        },
      },
    );
  }

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{result ? "Shift closed" : `Close Shift — ${shift.ref}`}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <ResultRow label="Expected cash" value={money(result.expectedCash ?? 0)} />
              <ResultRow label="Actual cash" value={money(result.actualCash ?? 0)} />
              <ResultRow
                label="Variance"
                value={money(result.variance ?? 0)}
                tone={
                  result.variance !== null && Math.abs(result.variance) > 0.01 ? "danger" : "ok"
                }
              />
            </div>
            {result.status === "UNDER_REVIEW" && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                The variance is outside the allowed tolerance, so a manager must sign this shift off
                before it is finally closed.
              </p>
            )}
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <Label htmlFor="actual-cash">Actual Cash (KSh)</Label>
                <Input
                  id="actual-cash"
                  autoFocus
                  type="number"
                  min={0}
                  value={actual}
                  onChange={(event) => setActual(event.target.value)}
                  className="mt-1 h-14 text-center font-display text-2xl font-bold"
                />
                {actualField && (
                  <p className="mt-1 text-xs font-medium text-destructive">{actualField}</p>
                )}
              </div>
              <div>
                <Label htmlFor="close-reason">Reason (if adjusting the drawer)</Label>
                <Input
                  id="close-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-1"
                  placeholder="Optional note for the manager"
                />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={closeShift.isPending} onClick={submit}>
                {closeShift.isPending ? "Closing…" : "Close Shift"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-bold ${tone === "danger" ? "text-destructive" : tone === "ok" ? "text-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

/** Manager sign-off of a shift the server held `UNDER_REVIEW`. */
function ReviewDialog({ shift, onClose }: { shift: CashierShift; onClose: () => void }) {
  const review = useReviewShift(shift.id);
  const [note, setNote] = useState("");

  function decide(approved: boolean) {
    review.mutate(
      { approved, note: note.trim() || undefined },
      {
        onSuccess: (updated) => {
          toast.success(`${updated.ref} ${approved ? "approved" : "rejected"}.`);
          onClose();
        },
      },
    );
  }

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Review Shift — {shift.ref}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <ResultRow label="Expected cash" value={money(shift.expectedCash ?? 0)} />
            <ResultRow label="Actual cash" value={money(shift.actualCash ?? 0)} />
            <ResultRow
              label="Variance"
              value={money(shift.variance ?? 0)}
              tone={shift.variance !== null && Math.abs(shift.variance) > 0.01 ? "danger" : "ok"}
            />
            {shift.reason && (
              <p className="mt-1 text-xs text-muted-foreground">Note: {shift.reason}</p>
            )}
          </div>
          <div>
            <Label htmlFor="review-note">Manager note</Label>
            <Input
              id="review-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1"
              placeholder="Why this variance is accepted"
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="text-destructive"
            disabled={review.isPending}
            onClick={() => decide(false)}
          >
            Reject
          </Button>
          <Button disabled={review.isPending} onClick={() => decide(true)}>
            Approve
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
