import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Activity, Lock, Pencil, Plus } from "lucide-react";
import { usePermissions, useSession, useSessionBranches } from "@/api/hooks/auth";
import {
  useCreateUser,
  useUpdateUser,
  useUpdateUserStatus,
  useUserList,
  useUserStatusHistory,
} from "@/api/hooks/directory";
import { useShiftList } from "@/api/hooks/shifts";
import { useSaleList } from "@/api/hooks/sales";
import { usePayments } from "@/api/hooks/payments";
import { ApiError, fieldError } from "@/lib/api";
import { fmtDateTime, money } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, StatusPill } from "@/components/shared";
import { ROLE_LABELS, STAFF_STATUS_LABELS } from "@/types/api";
import type { Role, StaffStatus, UserInput, UserProfile, UserUpdateInput } from "@/types/api";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

/** The six contract roles, in management order. */
const ROLES: Role[] = [
  "super_admin",
  "manager",
  "cashier",
  "storekeeper",
  "procurement",
  "stock_take_agent",
];

/** Branch assignment uses the session's branch list — the API scopes it too. */
const NO_BRANCH = "none";

function UsersPage() {
  const session = useSession();
  const permissions = usePermissions();
  const branches = useSessionBranches();
  const [editing, setEditing] = useState<UserProfile | "new" | null>(null);
  const [statusTarget, setStatusTarget] = useState<UserProfile | null>(null);
  const [activityTarget, setActivityTarget] = useState<UserProfile | null>(null);

  const users = useUserList();

  const branchName = (branchId: string | null) => {
    if (!branchId) return "All branches";
    return branches.find((b) => b.id === branchId)?.name ?? "—";
  };

  // A missing `users` permission — client-side or a 403 on the list — is a
  // locked page, never a crash.
  if (session.isSuccess && !permissions.includes("users")) {
    return (
      <div className="pb-10">
        <PageHeader title="Users & Roles" />
        <div className="px-4 py-5 md:px-6">
          <LockedPanel body="Only accounts with the users permission can manage staff." />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Users & Roles"
        subtitle={users.isSuccess ? `${users.data.length} users` : "Staff accounts"}
        actions={
          permissions.includes("users") ? (
            <Button onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" /> New User</Button>
          ) : undefined
        }
      />
      <div className="space-y-3 px-4 py-5 md:px-6">
        {users.isPending && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        )}
        {users.isError &&
          (users.error instanceof ApiError && users.error.status === 403 ? (
            <LockedPanel />
          ) : (
            <RetryPanel
              message="Users did not load."
              detail={users.error.message}
              retrying={users.isFetching}
              onRetry={() => void users.refetch()}
            />
          ))}
        {users.isSuccess && users.data.length === 0 && (
          <EmptyState icon="👥" title="No users yet" body="Create the first staff account." />
        )}
        {users.isSuccess && users.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {users.data.map((u) => (
              <div key={u.id} className={`rounded-xl border p-4 ${!u.active ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {u.name.split(" ").map((n) => n[0]).join("")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  <Badge variant={u.role === "super_admin" ? "default" : "secondary"}>{ROLE_LABELS[u.role]}</Badge>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <p className="text-muted-foreground">{u.phone ?? "—"}</p>
                  <p className="text-muted-foreground">{branchName(u.branchId)}</p>
                  <div className="pt-1"><StatusPill status={u.status} /></div>
                </div>
                {permissions.includes("users") && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setStatusTarget(u)}>
                      Status
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setActivityTarget(u)}>
                      <Activity className="mr-1 h-3 w-3" /> Activity
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && <UserDialog user={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {statusTarget && <StatusDialog user={statusTarget} onClose={() => setStatusTarget(null)} />}
      {activityTarget && <ActivityDialog user={activityTarget} onClose={() => setActivityTarget(null)} />}
    </div>
  );
}

function UserDialog({ user, onClose }: { user: UserProfile | null; onClose: () => void }) {
  const branches = useSessionBranches();
  const create = useCreateUser();
  const update = useUpdateUser(user?.id ?? "");
  const mutation = user ? update : create;

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "cashier");
  const [branchId, setBranchId] = useState<string>(user?.branchId ?? NO_BRANCH);
  const [password, setPassword] = useState("");

  function save() {
    // The API never returns a password and this form never prefills one.
    if (user) {
      const patch: UserUpdateInput = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        role,
        branchId: branchId === NO_BRANCH ? null : branchId,
      };
      if (password) patch.password = password;
      update.mutate(patch, {
        onSuccess: () => {
          toast.success("User updated");
          onClose();
        },
      });
      return;
    }
    const input: UserInput = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      role,
      branchId: branchId === NO_BRANCH ? null : branchId,
      password,
    };
    create.mutate(input, {
      onSuccess: () => {
        toast.success("User created");
        onClose();
      },
    });
  }

  const error = mutation.error;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader><DialogTitle>{user ? "Edit User" : "New User"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {error && <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error.message}</p>}
          <div>
            <Label htmlFor="u-name">Name</Label>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            <FieldMsg text={fieldError(error, "name")} />
          </div>
          <div>
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
            <FieldMsg text={fieldError(error, "email")} />
          </div>
          <div>
            <Label htmlFor="u-phone">Phone</Label>
            <Input id="u-phone" value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
            <FieldMsg text={fieldError(error, "phone")} />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldMsg text={fieldError(error, "role")} />
          </div>
          <div>
            <Label>Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BRANCH}>All branches</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} · {b.location}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldMsg text={fieldError(error, "branchId")} />
          </div>
          <div>
            <Label htmlFor="u-password">{user ? "Reset password (leave blank to keep)" : "Password"}</Label>
            <Input
              id="u-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
              placeholder={user ? "Only set to change it" : "Minimum 8 characters"}
            />
            <FieldMsg text={fieldError(error, "password")} />
          </div>
          {user && (
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span className="text-muted-foreground">Status</span>
              <StatusPill status={user.status} />
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : user ? "Save" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({ user, onClose }: { user: UserProfile; onClose: () => void }) {
  const update = useUpdateUserStatus(user.id);
  const history = useUserStatusHistory(user.id);
  const [status, setStatus] = useState<StaffStatus | "">("");
  const [reason, setReason] = useState("");

  const needsReason = status !== "" && status !== "ACTIVE";
  const reasonMissing = needsReason && reason.trim() === "";

  function save() {
    if (!status) return;
    update.mutate(
      { status, reason: status === "ACTIVE" ? null : reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Status set to ${STAFF_STATUS_LABELS[status]}`);
          onClose();
        },
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader><DialogTitle>Staff Status · {user.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {update.error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {update.error.message}
            </p>
          )}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Current</span>
            <StatusPill status={user.status} />
          </div>
          <div>
            <Label>New status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StaffStatus)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a status" /></SelectTrigger>
              <SelectContent>
                {(["ACTIVE", "INACTIVE", "SUSPENDED"] as StaffStatus[])
                  .filter((s) => s !== user.status)
                  .map((s) => <SelectItem key={s} value={s}>{STAFF_STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="status-reason">
              Reason{needsReason ? " (required)" : " (optional)"}
            </Label>
            <Input
              id="status-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1"
              placeholder={needsReason ? "Why is this account changing?" : "Optional note"}
            />
            {reasonMissing && (
              <p className="mt-1 text-xs font-medium text-destructive">
                A reason is required to deactivate or suspend an account.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={!status || reasonMissing || update.isPending}>
              {update.isPending ? "Saving…" : "Apply"}
            </Button>
          </div>
          <div className="border-t pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</p>
            {history.isPending && <Skeleton className="mt-2 h-12 rounded-lg" />}
            {history.isError && <p className="mt-2 text-sm text-destructive">{history.error.message}</p>}
            {history.isSuccess && history.data.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">No status changes recorded yet.</p>
            )}
            {history.isSuccess && history.data.length > 0 && (
              <ul className="mt-2 space-y-2">
                {history.data.map((h) => (
                  <li key={h.id} className="rounded-lg border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      {h.from ? <StatusPill status={h.from} /> : <span className="text-xs text-muted-foreground">New</span>}
                      <span className="text-muted-foreground">→</span>
                      <StatusPill status={h.to} />
                      <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(h.at)}</span>
                    </div>
                    {h.reason && <p className="mt-1 text-muted-foreground">{h.reason}</p>}
                    {h.changedByName && <p className="mt-0.5 text-xs text-muted-foreground">by {h.changedByName}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Cashier-style drill-down: shifts, sales and payments attributed to one account. */
function ActivityDialog({ user, onClose }: { user: UserProfile; onClose: () => void }) {
  const shifts = useShiftList({ userId: user.id });
  const sales = useSaleList({ userId: user.id, page: 1 });
  const payments = usePayments({ userId: user.id, page: 1 });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Activity · {user.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Shifts" value={shifts.data ? String(shifts.data.length) : "—"} />
            <Stat label="Sales" value={sales.data ? String(sales.data.meta.totalCount) : "—"} />
            <Stat label="Payments" value={payments.data ? String(payments.data.meta.totalCount) : "—"} />
          </div>

          <ActivitySection
            title="Recent shifts"
            loading={shifts.isPending}
            error={shifts.isError ? shifts.error.message : null}
            empty={shifts.isSuccess && shifts.data.length === 0}
            emptyText="No shifts recorded."
          >
            {shifts.data?.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.ref}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(s.openedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={s.status} />
                  {s.variance !== null && (
                    <span className={`text-xs font-semibold ${s.variance === 0 ? "text-muted-foreground" : "text-destructive"}`}>
                      {money(s.variance)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ActivitySection>

          <ActivitySection
            title="Recent sales"
            loading={sales.isPending}
            error={sales.isError ? sales.error.message : null}
            empty={sales.isSuccess && sales.data.items.length === 0}
            emptyText="No sales recorded."
          >
            {sales.data?.items.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.receiptNo ?? "Draft sale"}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(s.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={s.status} />
                  <span className="text-sm font-semibold">{money(s.total)}</span>
                </div>
              </li>
            ))}
          </ActivitySection>

          <ActivitySection
            title="Recent payments"
            loading={payments.isPending}
            error={payments.isError ? payments.error.message : null}
            empty={payments.isSuccess && payments.data.items.length === 0}
            emptyText="No payments recorded."
          >
            {payments.data?.items.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {p.method} · {p.saleReceiptNo ?? p.ref}
                  </p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(p.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={p.status} />
                  <span className="text-sm font-semibold">{money(p.amount)}</span>
                </div>
              </li>
            ))}
          </ActivitySection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-2 py-2 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ActivitySection({
  title,
  loading,
  error,
  empty,
  emptyText,
  children,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {loading && <Skeleton className="h-12 rounded-lg" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {empty && <p className="text-sm text-muted-foreground">{emptyText}</p>}
      <ul className="space-y-2">{children}</ul>
    </div>
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
      <p className="mt-3 font-semibold">User management is locked</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {body ?? "Your account does not have the users permission."}
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
