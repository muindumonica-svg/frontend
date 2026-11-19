import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  loadCustomerSession,
  useCustomerAddresses,
  useCustomerSession,
  usePlaceOrder,
  usePublicCatalog,
} from "@/api/hooks/public";
import { ApiError, fieldError } from "@/lib/api";
import { useCart, type CartLine } from "@/lib/cart";
import { clearUtm, hasMarketingConsent, readUtm, trackEvent } from "@/lib/marketing";
import { money } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Fulfillment, PlaceOrderLine } from "@/types/api";

export const Route = createFileRoute("/_public/checkout")({
  beforeLoad: async () => {
    const session = await loadCustomerSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: "/checkout" }, replace: true });
    }
  },
  component: CheckoutPage,
});

function orderLine(line: CartLine): PlaceOrderLine {
  if (line.mode === "amount") {
    return { productId: line.productId, mode: line.mode, amount: line.amount ?? 0 };
  }
  return { productId: line.productId, mode: line.mode, qtyKg: line.qtyKg ?? 0 };
}

function CheckoutPage() {
  const navigate = useNavigate();
  const cart = useCart();
  const session = useCustomerSession();
  const account = session.data ?? null;
  const catalog = usePublicCatalog(cart.branchId ? { branchId: cart.branchId } : {});
  const addresses = useCustomerAddresses(Boolean(account));
  const placeOrder = usePlaceOrder();
  const [note, setNote] = useState("");
  const [fulfillment, setFulfillment] = useState<Fulfillment>("COLLECTION");
  const [addressId, setAddressId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const checkoutTracked = useRef(false);

  useEffect(() => {
    if (addressId || !addresses.data?.length) return;
    const preferred = addresses.data.find((address) => address.isDefault) ?? addresses.data[0];
    if (preferred) setAddressId(preferred.id);
  }, [addressId, addresses.data]);

  useEffect(() => {
    if (checkoutTracked.current || cart.lines.length === 0) return;
    checkoutTracked.current = true;

    void trackEvent({
      name: "begin_checkout",
      path: "/checkout",
      value: cart.subtotal,
      currency: catalog.data?.currency ?? "KES",
      utm: readUtm() ?? undefined,
    });
  }, [cart.lines.length, cart.subtotal, catalog.data?.currency]);

  const zones = catalog.data?.deliveryZones ?? [];
  const zone = zones.find((item) => item.id === zoneId) ?? null;
  const deliveryFee =
    zone === null
      ? 0
      : zone.freeDeliveryThreshold !== null && cart.subtotal >= zone.freeDeliveryThreshold
        ? 0
        : zone.fee;
  const belowMinimum = zone !== null && cart.subtotal < zone.minimumOrderTotal;
  const deliveryReady = zone !== null && addressId !== "" && !belowMinimum;
  const total = cart.subtotal + (fulfillment === "DELIVERY" ? deliveryFee : 0);

  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Nothing to check out</h1>
        <p className="mt-1 text-sm text-muted-foreground">Add a few items to your bag first.</p>
        <Button asChild className="mt-6">
          <Link to="/shop">Go to the shop</Link>
        </Button>
      </div>
    );
  }

  const online = catalog.data?.onlineOrdering;
  const holdMinutes = online?.reservationMinutes ?? 60;
  const disabled =
    online?.enabled === false || placeOrder.isPending || (fulfillment === "DELIVERY" && !deliveryReady);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!cart.branchId) return;
    if (fulfillment === "DELIVERY" && !deliveryReady) return;

    const utm = readUtm();

    placeOrder.mutate(
      {
        branchId: cart.branchId,
        items: cart.lines.map(orderLine),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(fulfillment === "DELIVERY" ? { deliveryZoneId: zoneId, addressId } : {}),
        ...(utm ? { utm } : {}),
        marketingConsent: hasMarketingConsent(),
      },
      {
        onSuccess: (order) => {
          clearUtm();
          cart.clear();
          void navigate({ to: "/account/orders/$orderId", params: { orderId: order.id } });
        },
      },
    );
  }

  const banner =
    placeOrder.error instanceof ApiError
      ? placeOrder.error.message
      : placeOrder.error
        ? "The order could not be placed. Try again."
        : null;

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Checkout</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {account ? `Signed in as ${account.email ?? account.name}. ` : ""}Pay at{" "}
        {cart.branchName ?? "your branch"} when you collect or receive your order.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-[1fr_20rem]">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="font-display text-base font-bold">Order summary</h2>
          <ul className="mt-3 divide-y">
            {cart.lines.map((line) => (
              <li key={line.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <ProductImage
                    name={line.name}
                    productId={line.productId}
                    slug={line.slug}
                    sku={line.sku}
                    categoryName={line.categoryName}
                    className="h-9 w-9 shrink-0 rounded-md"
                  />
                  <div>
                  <p className="font-medium">
                    {line.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {line.qtyLabel} · {line.unitPriceLabel}
                  </p>
                  </div>
                </div>
                <span className="whitespace-nowrap font-semibold">{money(line.total)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1.5 border-t pt-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium">{money(cart.subtotal)}</dd>
            </div>
            {fulfillment === "DELIVERY" && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="font-medium">{zone === null ? "Choose a zone" : money(deliveryFee)}</dd>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <dt className="font-medium text-muted-foreground">Total</dt>
              <dd className="font-display text-xl font-bold">{money(total)}</dd>
            </div>
          </dl>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label>How would you like your order?</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={fulfillment === "COLLECTION" ? "default" : "outline"}
                  onClick={() => setFulfillment("COLLECTION")}
                >
                  Collect at branch
                </Button>
                <Button
                  type="button"
                  variant={fulfillment === "DELIVERY" ? "default" : "outline"}
                  onClick={() => setFulfillment("DELIVERY")}
                  disabled={zones.length === 0}
                >
                  Deliver to me
                </Button>
              </div>
              {zones.length === 0 && (
                <p className="text-xs text-muted-foreground">Delivery is not available at this branch yet.</p>
              )}
            </div>

            {fulfillment === "DELIVERY" && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="delivery-zone">Delivery area</Label>
                  <Select value={zoneId} onValueChange={setZoneId}>
                    <SelectTrigger id="delivery-zone">
                      <SelectValue placeholder="Choose a delivery area" />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} · {money(item.fee)}
                          {item.freeDeliveryThreshold !== null
                            ? ` (free over ${money(item.freeDeliveryThreshold)})`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {zone?.etaMinutes !== null && zone?.etaMinutes !== undefined && (
                    <p className="text-xs text-muted-foreground">Usually about {zone.etaMinutes} minutes.</p>
                  )}
                  {zone?.instructions && <p className="text-xs text-muted-foreground">{zone.instructions}</p>}
                  {belowMinimum && zone && (
                    <p className="text-xs font-medium text-destructive">
                      Minimum order for this area is {money(zone.minimumOrderTotal)}.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="delivery-address">Delivery address</Label>
                  {addresses.data && addresses.data.length > 0 ? (
                    <Select value={addressId} onValueChange={setAddressId}>
                      <SelectTrigger id="delivery-address">
                        <SelectValue placeholder="Choose an address" />
                      </SelectTrigger>
                      <SelectContent>
                        {addresses.data.map((address) => (
                          <SelectItem key={address.id} value={address.id}>
                            {address.label || address.recipientName} · {address.addressLine}, {address.town}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Add a delivery address in{" "}
                      <Link to="/account" className="font-medium text-foreground underline">
                        your account
                      </Link>{" "}
                      first.
                    </p>
                  )}
                  {addresses.data && addresses.data.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      The rider will call the phone number saved on this address.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="order-note">Note for the branch (optional)</Label>
              <Textarea
                id="order-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Preferred collection time, preparation instructions…"
              />
              {fieldError(placeOrder.error, "note") && (
                <p className="text-xs font-medium text-destructive">{fieldError(placeOrder.error, "note")}</p>
              )}
            </div>

            {banner && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {banner}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={disabled}>
              {placeOrder.isPending ? "Placing order…" : "Place order"}
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/cart">Back to bag</Link>
            </Button>
          </form>
        </section>

        <aside className="h-fit rounded-xl border bg-muted/30 p-5 text-sm">
          <h2 className="font-display text-base font-bold">Payment &amp; fulfilment</h2>
          <p className="mt-2 text-muted-foreground">
            This order takes no online payment. Pay at {cart.branchName ?? "the branch"} when you collect it or when
            the rider arrives.
          </p>
          <p className="mt-3 text-muted-foreground">
            Stock is reserved for <span className="font-semibold text-foreground">{holdMinutes} minutes</span> after
            you place the order. If it is not paid within that window, the hold is released and the order is
            cancelled automatically.
          </p>
          {fulfillment === "DELIVERY" && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-muted-foreground">
              <Badge variant="secondary">Delivery</Badge>
              A rider is assigned after the branch confirms payment. You can follow the status from your orders.
            </p>
          )}
          <p className="mt-3 text-muted-foreground">
            You can cancel an unpaid order from your account before it is prepared.
          </p>
        </aside>
      </div>
    </div>
  );
}
