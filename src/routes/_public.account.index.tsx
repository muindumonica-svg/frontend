import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { LogOut, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import {
  loadCustomerSession,
  useCreateAddress,
  useCustomerAddresses,
  useCustomerChangePassword,
  useCustomerFinancialHistory,
  useCustomerFinancialSummary,
  useCustomerLogout,
  useCustomerSession,
  useDeleteAddress,
  useUpdateAddress,
} from "@/api/hooks/public";
import { fieldError } from "@/lib/api";
import { fmtDate, fmtDateTime, money } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerAddress, CustomerAddressInput } from "@/types/api";

export const Route = createFileRoute("/_public/account/")({
  beforeLoad: async () => {
    const session = await loadCustomerSession();
    if (!session) throw redirect({ to: "/login", replace: true });
  },
  component: AccountPage,
});

const EMPTY_ADDRESS: CustomerAddressInput = {
  label: "",
  recipientName: "",
  phone: "",
  addressLine: "",
  town: "",
  notes: "",
};

function AccountPage() {
  const navigate = useNavigate();
  const session = useCustomerSession();
  const account = session.data ?? null;
  const addresses = useCustomerAddresses(Boolean(account));
  const financialSummary = useCustomerFinancialSummary(account?.id ?? null);
  const [financialPage, setFinancialPage] = useState(1);
  const financialHistory = useCustomerFinancialHistory(account?.id ?? null, financialPage);
  const logout = useCustomerLogout();

  const [editing, setEditing] = useState<CustomerAddress | "new" | null>(null);

  if (session.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!account) {
    // The guard already redirected; this covers a session that expired mid-page.
    return (
      <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        Your session ended.{" "}
        <button className="font-semibold underline" onClick={() => navigate({ to: "/login" })}>
          Sign in again
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">My account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your details, orders, and delivery addresses.</p>
        </div>
        <Button
          variant="outline"
          disabled={logout.isPending}
          onClick={() =>
            logout.mutate(undefined, {
              onSettled: () => navigate({ to: "/", replace: true }),
            })
          }
        >
          <LogOut className="mr-1 h-4 w-4" /> Sign out
        </Button>
      </div>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-bold">{account.name}</p>
            <p className="text-xs text-muted-foreground">Customer no. {account.customerNo}</p>
            <p className="text-sm text-muted-foreground">{account.email ?? "No email on file"}</p>
            <p className="text-sm text-muted-foreground">{account.phone ?? "No phone on file"}</p>
          </div>
          <p className="text-xs text-muted-foreground">Member since {fmtDate(account.createdAt)}</p>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5 shadow-sm">
        <div>
          <h2 className="font-display text-base font-bold">Orders</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Track reservations, collection, and payment for the items you ordered online.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/account/orders">View my orders</Link>
        </Button>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="font-display text-base font-bold">Financial history</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Purchases and payment records linked to your customer account.
          </p>
        </div>
        <div className="space-y-4 p-5">
          {financialSummary.isPending && <Skeleton className="h-24 rounded-lg" />}
          {financialSummary.isError && (
            <div className="rounded-lg border border-dashed px-4 py-6 text-sm">
              <p className="font-medium">Financial summary did not load.</p>
              <p className="mt-1 text-muted-foreground">{financialSummary.error.message}</p>
              <Button variant="outline" className="mt-3" onClick={() => void financialSummary.refetch()}>Try again</Button>
            </div>
          )}
          {financialSummary.isSuccess && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FinancialStat label="Purchases" value={money(financialSummary.data.netPurchases)} />
              <FinancialStat label="Recorded paid" value={money(financialSummary.data.netRecordedReceipts)} />
              <FinancialStat label="Outstanding" value={money(financialSummary.data.outstandingBalance)} />
              <FinancialStat label="Pending payments" value={money(financialSummary.data.pendingPaymentAmount)} />
            </div>
          )}

          {financialSummary.data?.electronicRefundsAwaitingVerification ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
              Electronic refunds totaling {money(financialSummary.data.electronicRefundsAwaitingVerification)} are recorded but are not provider-verified in this account history.
            </p>
          ) : null}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Recent activity</h3>
            {financialHistory.isPending && <Skeleton className="h-28 rounded-lg" />}
            {financialHistory.isError && (
              <div className="rounded-lg border border-dashed px-4 py-6 text-sm">
                <p className="font-medium">Financial activity did not load.</p>
                <p className="mt-1 text-muted-foreground">{financialHistory.error.message}</p>
                <Button variant="outline" className="mt-3" onClick={() => void financialHistory.refetch()}>Try again</Button>
              </div>
            )}
            {financialHistory.isSuccess && financialHistory.data.items.length === 0 && (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No financial activity is linked to this account yet.
              </p>
            )}
            {financialHistory.isSuccess && financialHistory.data.items.length > 0 && (
              <>
                <ul className="divide-y rounded-lg border">
                {financialHistory.data.items.map((event) => (
                  <li key={`${event.type}-${event.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{event.type === "PAYMENT" ? `${event.method ?? "Payment"} payment` : event.type === "REFUND" ? `${event.method ?? "Payment"} refund` : event.type === "ORDER" ? "Online order" : "Sale"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {event.reference ?? event.saleReceiptNo ?? event.saleId} · {fmtDateTime(event.occurredAt)}
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
                      <p className="text-xs text-muted-foreground">{event.status.replaceAll("_", " ")}</p>
                    </div>
                  </li>
                ))}
                </ul>
                {(financialPage > 1 || financialHistory.data.meta.totalCount > financialPage * financialHistory.data.meta.perPage) && (
                  <div className="flex justify-between">
                    <Button size="sm" variant="outline" disabled={financialPage <= 1 || financialHistory.isFetching} onClick={() => setFinancialPage((page) => page - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="outline" disabled={financialHistory.isFetching || financialHistory.data.meta.totalCount <= financialPage * financialHistory.data.meta.perPage} onClick={() => setFinancialPage((page) => page + 1)}>
                      {financialHistory.isFetching ? "Loading…" : "Next"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          <div>
            <h2 className="font-display text-base font-bold">Delivery addresses</h2>
            <p className="text-xs text-muted-foreground">
              Saved for delivery details. Orders are currently collected and paid at your branch.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> Add address
          </Button>
        </div>

        <div className="p-5">
          {addresses.isPending && <Skeleton className="h-24 rounded-lg" />}
          {addresses.isError && (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              <p className="font-medium">Addresses did not load.</p>
              <p className="mt-1 text-muted-foreground">{addresses.error.message}</p>
              <Button variant="outline" className="mt-3" onClick={() => void addresses.refetch()}>Try again</Button>
            </div>
          )}
          {addresses.isSuccess && addresses.data.length === 0 && (
            <div className="flex flex-col items-center rounded-lg border border-dashed px-4 py-10 text-center">
              <MapPin className="h-7 w-7 text-muted-foreground" />
              <p className="mt-2 font-semibold">No addresses yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Add the place you would like deliveries sent.</p>
            </div>
          )}
          {addresses.isSuccess && addresses.data.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {addresses.data.map((address) => (
                <li key={address.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {address.label || address.recipientName}
                        {address.isDefault && <Badge className="ml-2 align-middle">Default</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">{address.recipientName} · {address.phone}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Edit address" onClick={() => setEditing(address)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <DeleteAddressButton address={address} />
                    </div>
                  </div>
                  <p className="mt-2 text-sm">{address.addressLine}</p>
                  <p className="text-sm text-muted-foreground">{address.town}</p>
                  {address.notes && <p className="mt-1 text-xs text-muted-foreground">{address.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <ChangePasswordCard />

      {editing && (
        <AddressDialog
          address={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function FinancialStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-bold">{value}</p>
    </div>
  );
}

function DeleteAddressButton({ address }: { address: CustomerAddress }) {
  const remove = useDeleteAddress();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Delete address">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this address?</AlertDialogTitle>
          <AlertDialogDescription>
            {address.addressLine}, {address.town} will be removed from your account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            onClick={() => remove.mutate(address.id, { onSuccess: () => toast.success("Address deleted") })}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AddressDialog({ address, onClose }: { address: CustomerAddress | null; onClose: () => void }) {
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const mutation = address ? update : create;

  const [form, setForm] = useState<CustomerAddressInput>(
    address
      ? {
          label: address.label ?? "",
          recipientName: address.recipientName,
          phone: address.phone,
          addressLine: address.addressLine,
          town: address.town,
          notes: address.notes ?? "",
          isDefault: address.isDefault,
        }
      : EMPTY_ADDRESS,
  );

  const set = (key: keyof CustomerAddressInput) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  function save(event: FormEvent) {
    event.preventDefault();
    const payload: CustomerAddressInput = {
      ...form,
      label: form.label?.trim() || null,
      notes: form.notes?.trim() || null,
    };

    if (address) {
      update.mutate(
        { addressId: address.id, patch: payload },
        { onSuccess: () => { toast.success("Address updated"); onClose(); } },
      );
      return;
    }
    create.mutate(payload, { onSuccess: () => { toast.success("Address saved"); onClose(); } });
  }

  const error = mutation.error;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{address ? "Edit address" : "Add address"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error.message}
            </p>
          )}
          <Field label="Label (optional)" id="address-label" value={form.label ?? ""} onChange={set("label")} placeholder="Home, Shop, Office" error={fieldError(error, "label")} />
          <Field label="Recipient name" id="address-recipient" value={form.recipientName} onChange={set("recipientName")} error={fieldError(error, "recipientName")} />
          <Field label="Phone" id="address-phone" value={form.phone} onChange={set("phone")} autoComplete="tel" error={fieldError(error, "phone")} />
          <Field label="Address" id="address-line" value={form.addressLine} onChange={set("addressLine")} error={fieldError(error, "addressLine")} />
          <Field label="Town" id="address-town" value={form.town} onChange={set("town")} error={fieldError(error, "town")} />
          <div className="space-y-1.5">
            <Label htmlFor="address-notes">Delivery notes (optional)</Label>
            <Textarea
              id="address-notes"
              value={form.notes ?? ""}
              onChange={(event) => set("notes")(event.target.value)}
              rows={2}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault === true}
              onChange={(event) => setForm((previous) => ({ ...previous, isDefault: event.target.checked }))}
              className="h-4 w-4 rounded border-input"
            />
            Make this my default address
          </label>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : address ? "Save" : "Add address"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  error,
  placeholder,
  autoComplete,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
      />
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function ChangePasswordCard() {
  const change = useCustomerChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    change.mutate(
      { currentPassword: current, password: next, password_confirmation: confirm },
      {
        onSuccess: () => {
          toast.success("Password updated");
          setCurrent("");
          setNext("");
          setConfirm("");
        },
      },
    );
  }

  const error = change.error;

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="font-display text-base font-bold">Password</h2>
      <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-3" noValidate>
        {error && !fieldError(error, "currentPassword") && !fieldError(error, "password") && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:col-span-3">
            {error.message}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            aria-invalid={Boolean(fieldError(error, "currentPassword"))}
          />
          <FieldError text={fieldError(error, "currentPassword")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="next-password">New password</Label>
          <Input
            id="next-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            aria-invalid={Boolean(fieldError(error, "password"))}
          />
          <FieldError text={fieldError(error, "password")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>
        <div className="sm:col-span-3">
          <Button type="submit" variant="outline" disabled={change.isPending}>
            {change.isPending ? "Updating…" : "Update password"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function FieldError({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return <p className="text-xs font-medium text-destructive">{text}</p>;
}
