import { useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateCustomer,
  useCustomerList,
  useCustomerLoyalty,
  useSettings,
} from "@/api/hooks/directory";
import {
  useRemoveSaleItem,
  useUpdateSaleDraft,
  useUpdateSaleItem,
} from "@/api/hooks/sales";
import { ApiError } from "@/lib/api";
import { fmtKg, posMoney as money, posUnitPriceLabel, round3 } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductImage } from "@/components/product-image";
import type { HistoricalSellingMode, Sale, SaleItem } from "@/types/api";

const MODE_LABEL: Record<HistoricalSellingMode, string> = {
  weight: "WEIGHT",
  piece: "PIECE",
  amount: "AMOUNT",
};

interface CartProps {
  sale: Sale | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  canDiscount: boolean;
  heldCount: number;
  onCheckout: () => void;
  onOpenHeld: () => void;
  onOpenReturns: () => void;
}

/** The server owns the line and sale money columns; the cart only renders them. */
export function Cart({
  sale,
  collapsed,
  onToggleCollapsed,
  canDiscount,
  heldCount,
  onCheckout,
  onOpenHeld,
  onOpenReturns,
}: CartProps) {
  const [discountOpen, setDiscountOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const customers = useCustomerList();
  const settings = useSettings();
  const loyalty = useCustomerLoyalty(
    sale?.customerId ?? null,
    settings.data?.loyalty.enabled ?? false,
  );
  const customerName = sale?.customerId
    ? customers.data?.find((c) => c.id === sale.customerId)?.name
    : undefined;

  const items = sale?.items ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-y-2 border-b border-pos-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold">CURRENT SALE</h2>
          <p className="text-[11px] text-pos-muted-foreground">
            {sale ? (customerName ?? "Walk-in customer") : "No items yet"}
          </p>
          {settings.data?.loyalty.enabled && loyalty.data && (
            <p className="text-[11px] font-medium text-brand-deep">
              {loyalty.data.balance.toLocaleString()} loyalty points available
            </p>
          )}
          {settings.data?.loyalty.enabled && loyalty.isPending && sale?.customerId && (
            <p className="text-[11px] text-pos-muted-foreground">Loading loyalty balance…</p>
          )}
          {settings.data?.loyalty.enabled && loyalty.isError && (
            <p className="text-[11px] text-destructive">
              Loyalty balance could not load: {loyalty.error.message}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs lg:hidden"
            aria-label={collapsed ? "Expand current sale" : "Collapse current sale"}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
            {collapsed ? "Expand" : "Collapse"}
          </Button>
          {heldCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-pos-muted-foreground hover:text-pos-foreground"
              onClick={onOpenHeld}
            >
              Held {heldCount}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-pos-muted-foreground hover:text-pos-foreground"
            aria-label="Return a completed sale"
            onClick={onOpenReturns}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-pos-muted-foreground hover:text-pos-foreground"
            disabled={!sale}
            onClick={() => sale && setCustomerOpen(true)}
          >
            Customer
          </Button>
        </div>
      </div>

      <div className={`${collapsed ? "hidden lg:flex" : "flex"} min-h-0 flex-1 flex-col space-y-2 overflow-y-auto px-3 py-3`}>
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <span className="text-4xl">🛒</span>
            <p className="mt-3 text-sm font-semibold text-pos-foreground">Cart is empty</p>
            <p className="mt-1 text-xs text-pos-muted-foreground">Tap a product to start the sale</p>
          </div>
        ) : (
          items.map((item) => <CartRow key={item.id} saleId={sale!.id} item={item} />)
        )}
      </div>

      <div className={`${collapsed ? "hidden lg:block" : "block"} border-t border-pos-border px-4 py-3`}>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-pos-muted-foreground">
            <span>Subtotal</span>
            <span>{money(sale?.subtotal ?? 0)}</span>
          </div>
          <div className="flex justify-between text-pos-muted-foreground">
            <button
              className="underline decoration-dotted underline-offset-2 hover:text-pos-foreground disabled:no-underline"
              disabled={!sale}
              onClick={() => sale && setDiscountOpen(true)}
            >
              Discount {canDiscount ? "" : "(manager only)"}
            </button>
            <span>−{money(sale?.discount ?? 0)}</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-pos-border pt-2">
            <span className="font-display text-sm font-bold uppercase tracking-wider">Total</span>
            <span className="font-display text-3xl font-extrabold text-brand">{money(sale?.total ?? 0)}</span>
          </div>
        </div>
        <Button
          className="mt-2 h-14 w-full font-display text-lg font-bold tracking-wide"
          disabled={!sale || items.length === 0}
          onClick={onCheckout}
        >
          CHECKOUT →
        </Button>
      </div>
      {collapsed && (
        <div className="flex items-center justify-between gap-3 border-t border-pos-border px-4 py-3 lg:hidden">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-pos-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"} · Total
            </p>
            <p className="font-display text-xl font-extrabold text-brand [overflow-wrap:anywhere]">{money(sale?.total ?? 0)}</p>
          </div>
          <Button
            className="h-12 shrink-0 font-display font-bold"
            disabled={!sale || items.length === 0}
            onClick={onCheckout}
          >
            CHECKOUT →
          </Button>
        </div>
      )}

      {sale && discountOpen && (
        <DiscountDialog
          saleId={sale.id}
          discount={sale.discount}
          subtotal={sale.subtotal}
          total={sale.total}
          canDiscount={canDiscount}
          onClose={() => setDiscountOpen(false)}
        />
      )}
      {sale && customerOpen && (
        <CustomerDialog
          saleId={sale.id}
          currentCustomerId={sale.customerId}
          onClose={() => setCustomerOpen(false)}
        />
      )}
    </div>
  );
}

function CartRow({ saleId, item }: { saleId: string; item: SaleItem }) {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const updateItem = useUpdateSaleItem(saleId);
  const removeItem = useRemoveSaleItem(saleId);

  function step(delta: number) {
    const patch =
      item.mode === "piece"
        ? { pieces: Math.max(1, (item.pieces ?? 1) + delta) }
        : { qtyKg: round3(Math.max(0.01, (item.qtyKg ?? 0) + delta / 1000)) };

    updateItem.mutate(
      { itemId: item.id, ...patch },
      {
        onError: (error) => toastLocalError(error, "Could not update that line"),
        onSuccess: (result) => warnIfShort(result.availableQty, result.item),
      },
    );
  }

  return (
    <div className={`rounded-xl bg-pos-surface p-3 transition-opacity ${updateItem.isPending ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <ProductImage
              name={item.productName}
              productId={item.productId}
              className="h-9 w-9 shrink-0 rounded-md"
            />
            <p className="truncate text-sm font-semibold">{item.productName}</p>
          </div>
          <p className="mt-0.5 text-[11px] font-bold tracking-wider text-brand">{MODE_LABEL[item.mode]}</p>
          <p className="text-xs text-pos-muted-foreground">{item.qtyLabel} · {posUnitPriceLabel(item.unitPriceLabel)}</p>
          {item.note && <p className="mt-1 text-[11px] italic text-pos-muted-foreground">“{item.note}”</p>}
        </div>
        <div className="text-right">
          <p className="font-display text-base font-bold">{money(item.total)}</p>
          <div className="mt-1 flex items-center justify-end gap-1">
            {confirming ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 px-2 text-[11px]"
                  disabled={removeItem.isPending}
                  onClick={() =>
                    removeItem.mutate(item.id, {
                      onError: (error) => toastLocalError(error, "Could not remove that line"),
                    })
                  }
                >
                  Remove?
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-pos-muted-foreground" onClick={() => setConfirming(false)}>
                  No
                </Button>
              </>
            ) : (
              <button
                className="rounded-md p-1.5 text-pos-muted-foreground transition-colors hover:bg-pos-surface-2 hover:text-destructive"
                aria-label={`Remove ${item.productName}`}
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      {item.mode !== "piece" && (
        <div className="mt-2 flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-10 w-10 rounded-lg border border-pos-border text-pos-foreground"
            onClick={() => step(-1)}
            aria-label="Decrease"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-10 flex-1 rounded-lg border border-pos-border text-xs text-pos-foreground"
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-10 w-10 rounded-lg border border-pos-border text-pos-foreground"
            onClick={() => step(1)}
            aria-label="Increase"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {editing && item.mode !== "piece" && (
        <EditItemDialog saleId={saleId} item={item} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

function EditItemDialog({ saleId, item, onClose }: { saleId: string; item: SaleItem; onClose: () => void }) {
  const updateItem = useUpdateSaleItem(saleId);
  const isPiece = item.mode === "piece";
  const [value, setValue] = useState(isPiece ? String(item.pieces ?? 1) : String(round3((item.qtyKg ?? 0) * 1000)));
  const [note, setNote] = useState(item.note ?? "");

  function save() {
    const patch = isPiece
      ? { pieces: Math.max(1, parseInt(value) || 1) }
      : { qtyKg: round3((parseFloat(value) || 0) / 1000) };
    updateItem.mutate(
      { itemId: item.id, ...patch, note: note.trim() || null },
      {
        onError: (error) => toastLocalError(error, "Could not update that line"),
        onSuccess: (result) => {
          warnIfShort(result.availableQty, result.item);
          onClose();
        },
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-card p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-base font-bold">{item.productName}</p>
        <p className="mb-3 text-xs text-muted-foreground">{posUnitPriceLabel(item.unitPriceLabel)}</p>
        <Input
          autoFocus
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-14 text-center font-display text-2xl font-bold"
          aria-label={isPiece ? "Pieces" : "Weight in grams"}
        />
        <p className="mt-1 text-center text-xs text-muted-foreground">{isPiece ? "pieces" : "grams"}</p>
        <div className="mt-3">
          <Input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="text-sm"
          />
        </div>
        <Button className="mt-4 h-12 w-full font-bold" disabled={updateItem.isPending} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}

function DiscountDialog({
  saleId,
  discount,
  subtotal,
  total,
  canDiscount,
  onClose,
}: {
  saleId: string;
  discount: number;
  subtotal: number;
  total: number;
  canDiscount: boolean;
  onClose: () => void;
}) {
  const updateDraft = useUpdateSaleDraft(saleId);
  const [value, setValue] = useState(discount ? String(discount) : "");

  function apply() {
    if (!canDiscount) return;
    updateDraft.mutate(
      { discount: Math.max(0, parseFloat(value) || 0) },
      {
        onError: (error) => toastLocalError(error, "Could not apply that discount"),
        onSuccess: () => onClose(),
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-card p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-base font-bold">Discount</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Subtotal {money(subtotal)} · Till total after discount {money(total)}
        </p>
        {!canDiscount ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Only managers can apply discounts.</p>
        ) : (
          <Input
            autoFocus
            type="number"
            inputMode="decimal"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-14 text-center font-display text-2xl font-bold"
            aria-label="Discount amount in KSh"
          />
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12" onClick={onClose}>Cancel</Button>
          <Button className="h-12 font-bold" disabled={!canDiscount || updateDraft.isPending} onClick={apply}>Apply</Button>
        </div>
      </div>
    </div>
  );
}

function CustomerDialog({
  saleId,
  currentCustomerId,
  onClose,
}: {
  saleId: string;
  currentCustomerId: string | null;
  onClose: () => void;
}) {
  const customers = useCustomerList();
  const updateDraft = useUpdateSaleDraft(saleId);
  const createCustomer = useCreateCustomer();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  function pick(customerId: string | null) {
    updateDraft.mutate(
      { customerId },
      {
        onError: (error) => toastLocalError(error, "Could not set the customer"),
        onSuccess: onClose,
      },
    );
  }

  function createAndPick() {
    if (!name.trim()) return;
    createCustomer.mutate(
      { name: name.trim(), phone: phone.trim() || null },
      {
        onError: (error) => toastLocalError(error, "Could not add that customer"),
        onSuccess: (customer) => pick(customer.id),
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-card p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-base font-bold">Customer</p>
        <Button variant="outline" className="mt-2 h-11 w-full justify-start" disabled={updateDraft.isPending} onClick={() => pick(null)}>
          🚶 Walk-in customer
        </Button>
        <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Registered</p>
        <div className="space-y-1.5">
          {customers.isPending && <p className="text-sm text-muted-foreground">Loading customers…</p>}
          {customers.isError && (
            <button
              className="text-sm font-semibold text-destructive hover:underline"
              onClick={() => void customers.refetch()}
            >
              Could not load customers — retry
            </button>
          )}
          {customers.isSuccess && customers.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No registered customers yet.</p>
          )}
          {customers.data?.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${currentCustomerId === c.id ? "border-brand bg-brand-soft" : ""}`}
            >
              <span className="font-semibold">{c.name}</span>
              <span className="block text-xs text-muted-foreground">{c.phone}</span>
            </button>
          ))}
        </div>
        <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick add</p>
        <div className="flex gap-2">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="text-sm" aria-label="Customer name" />
          <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="text-sm" aria-label="Customer phone" />
        </div>
        <Button className="mt-2 h-11 w-full" disabled={!name.trim() || createCustomer.isPending} onClick={createAndPick}>
          Add customer
        </Button>
      </div>
    </div>
  );
}

/** `ApiError` text reaches the cashier through the global mutation toast, which already names the available quantity. */
function toastLocalError(error: unknown, fallback: string): void {
  if (error instanceof ApiError) return;
  toast.error(error instanceof Error ? error.message : fallback);
}

/** `meta.availableQty` on an item write is the soft warning; stock binds at completion. */
export function warnIfShort(availableQty: number | null, item: SaleItem): void {
  if (availableQty === null) return;
  const needed = item.qtyKg ?? item.pieces ?? 0;
  if (needed <= availableQty + 1e-9) return;
  const available = item.qtyKg !== null ? fmtKg(availableQty) : `${round3(availableQty)} pcs`;
  toast.warning(`${item.productName} — only ${available} in stock. Completing this sale will put stock below zero.`);
}
