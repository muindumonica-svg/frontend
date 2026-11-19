import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Clock, MapPin, Receipt, Truck } from "lucide-react";
import { useState } from "react";
import {
  loadCustomerSession,
  useCancelOrder,
  usePublicCustomerLoyalty,
  usePublicOrder,
  usePublicOrderReceipt,
  useRequestPublicLoyaltyPayment,
} from "@/api/hooks/public";
import { StatusPill } from "@/components/shared";
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
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateTime, money } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, DELIVERY_STATUS_LABELS } from "@/types/api";
import type { PublicOrder, Receipt as ReceiptPayload } from "@/types/api";

export const Route = createFileRoute("/_public/account/orders/$orderId")({
  beforeLoad: async ({ params }) => {
    const session = await loadCustomerSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: `/account/orders/${params.orderId}` },
        replace: true,
      });
    }
  },
  component: CustomerOrderDetail,
});

function CustomerOrderDetail() {
  const { orderId } = Route.useParams();
  const order = usePublicOrder(orderId);

  if (order.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (order.isError) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm">
        <p className="font-medium">This order could not be loaded.</p>
        <p className="mt-1 text-muted-foreground">{order.error.message}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/account/orders">Back to my orders</Link>
        </Button>
      </div>
    );
  }

  return <OrderDetail order={order.data} />;
}

function OrderDetail({ order }: { order: PublicOrder }) {
  const [pointsRaw, setPointsRaw] = useState("");
  const completed = ["COMPLETED", "PAID"].includes(order.status);
  const receipt = usePublicOrderReceipt(order.id, completed);
  const loyalty = usePublicCustomerLoyalty(order.channel === "ONLINE" && order.balance > 0);
  const requestLoyaltyPayment = useRequestPublicLoyaltyPayment();
  const points = Number(pointsRaw) || 0;
  const pointValue = loyalty.data?.pointValue ?? 0;
  const redemptionAmount = points * pointValue;
  const canRequestLoyalty = Boolean(
    loyalty.data?.redemptionEnabled,
  );

  function requestPayWithPoints() {
    if (
      !Number.isInteger(points) ||
      points < 1 ||
      points > (loyalty.data?.availablePoints ?? 0)
    ) {
      toast.error("Enter a valid point amount within your available balance.");
      return;
    }

    requestLoyaltyPayment.mutate(
      { orderId: order.id, points },
      {
        onSuccess: () => {
          setPointsRaw("");
          toast.success("Points applied. They will be deducted when the order is fully paid.");
        },
        onError: (error) => toast.error(`Could not request Pay with Points: ${error.message}`),
      },
    );
  }

  return (
    <>
    <div className="space-y-6 print:hidden">
      <div>
        <Link
          to="/account/orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All orders
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {order.orderNo ?? "Order"}
              </h1>
              <StatusPill status={order.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Placed {fmtDateTime(order.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {completed && (
              <Button
                variant="outline"
                disabled={!receipt.data}
                onClick={() => window.print()}
              >
                {receipt.isPending ? "Loading receipt…" : "Print receipt"}
              </Button>
            )}
            {order.canCancel && <CancelOrderButton order={order} />}
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_18rem]">
        <section className="rounded-xl border bg-card shadow-sm">
          <h2 className="border-b px-5 py-4 font-display text-base font-bold">Items</h2>
          <ul className="divide-y px-5">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <ProductImage
                    name={item.productName}
                    productId={item.productId}
                    className="h-10 w-10 shrink-0 rounded-md"
                  />
                  <div className="min-w-0">
                  <p className="font-medium">
                    {item.productName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.qtyLabel} · {item.unitPriceLabel}
                  </p>
                  {item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
                  </div>
                </div>
                <span className="whitespace-nowrap font-semibold">{money(item.total)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-2 border-t px-5 py-4 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium">{money(order.subtotal)}</dd>
            </div>
            {order.fulfillment === "DELIVERY" && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">
                  Delivery{order.deliveryZone ? ` · ${order.deliveryZone.name}` : ""}
                </dt>
                <dd className="font-medium">{money(order.deliveryFee)}</dd>
              </div>
            )}
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-display text-lg font-bold">{money(order.total)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="font-medium">{money(order.paidAmount)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Balance</dt>
              <dd className={order.balance > 0 ? "font-semibold text-destructive" : "font-medium"}>
                {money(order.balance)}
              </dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-3">
          <section className="rounded-xl border bg-muted/30 p-4 text-sm">
            <h2 className="font-display text-sm font-bold">
              {order.fulfillment === "DELIVERY" ? "Delivery" : "Collection"}
            </h2>
            {order.fulfillment === "DELIVERY" ? (
              <>
                <p className="mt-2 flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    {order.deliveryAddress?.addressLine ??
                      order.deliveryZone?.name ??
                      "Delivery address"}
                    <span className="block text-xs text-muted-foreground">
                      {[
                        order.deliveryAddress?.town,
                        order.deliveryAddress?.recipientName,
                        order.deliveryAddress?.phone,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </p>
                {order.deliveryStatus && (
                  <p className="mt-3 flex items-start gap-2 text-xs">
                    <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      Delivery status:{" "}
                      <span className="font-semibold text-foreground">
                        {DELIVERY_STATUS_LABELS[order.deliveryStatus]}
                      </span>
                      {order.deliveredAt && ` · ${fmtDateTime(order.deliveredAt)}`}
                    </span>
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Pay at {order.branchName ?? "the branch"}; a rider is assigned after payment is
                  confirmed.
                </p>
              </>
            ) : (
              <p className="mt-2 flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  {order.branchName ?? "Your branch"}
                  <span className="block text-xs text-muted-foreground">
                    Pay here when you collect.
                  </span>
                </span>
              </p>
            )}
            {order.reservationExpiresAt && order.status === "PENDING_PAYMENT" && (
              <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Items are held until{" "}
                  <span className="font-semibold text-foreground">
                    {fmtDateTime(order.reservationExpiresAt)}
                  </span>
                  . Unpaid orders are cancelled automatically and the hold is released.
                </span>
              </p>
            )}
            {order.status === "COMPLETED" && order.completedAt && (
              <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Receipt className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Completed {fmtDateTime(order.completedAt)}. Thank you!</span>
              </p>
            )}
            {order.status === "CANCELLED" && (
              <p className="mt-3 text-xs text-muted-foreground">
                This order was cancelled and its stock hold released.
              </p>
            )}
            {order.note && (
              <div className="mt-3 border-t pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Note
                </p>
                <p className="mt-1">{order.note}</p>
              </div>
            )}
          </section>

          {order.payments.length > 0 && (
            <section className="rounded-xl border bg-card p-4 text-sm shadow-sm">
              <h2 className="font-display text-sm font-bold">Payments</h2>
              <ul className="mt-2 space-y-2">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="rounded-lg border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{PAYMENT_METHOD_LABELS[payment.method]}</span>
                      <StatusPill status={payment.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {money(payment.amount)} · {fmtDateTime(payment.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {order.channel === "ONLINE" && order.balance > 0 && canRequestLoyalty && (
            <section className="space-y-3 rounded-xl border bg-card p-4 text-sm shadow-sm">
              <div>
                <h2 className="font-display text-sm font-bold">Pay with Points</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Available {loyalty.data?.availablePoints.toLocaleString()} points ·{" "}
                  {money(loyalty.data?.redeemableValue ?? 0)}
                </p>
              </div>
              <label className="block text-xs font-medium">
                Points to redeem
                <Input
                  className="mt-1"
                  type="number"
                  min={1}
                  max={loyalty.data?.availablePoints ?? 0}
                  step="1"
                  value={pointsRaw}
                  onChange={(event) => setPointsRaw(event.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Value {money(redemptionAmount)} · order balance {money(order.balance)}. Points are
                deducted when the order is fully paid.
              </p>
              <Button
                className="w-full"
                disabled={
                  requestLoyaltyPayment.isPending ||
                  !Number.isInteger(points) ||
                  points < 1 ||
                  points > (loyalty.data?.availablePoints ?? 0) ||
                  redemptionAmount <= 0 ||
                  redemptionAmount > order.balance
                }
                onClick={requestPayWithPoints}
              >
                {requestLoyaltyPayment.isPending ? "Applying…" : "Apply Points"}
              </Button>
              {requestLoyaltyPayment.isError && (
                <p role="alert" className="text-xs text-destructive">
                  {requestLoyaltyPayment.error.message}
                </p>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
    {receipt.data && <OnlineOrderReceipt payload={receipt.data} />}
    </>
  );
}

function OnlineOrderReceipt({ payload }: { payload: ReceiptPayload }) {
  const payments = Object.entries(payload.payments) as [keyof typeof payload.payments, number][];

  return (
    <article className="hidden bg-white p-8 text-black print:block">
      <header className="border-b border-dashed pb-4 text-center">
        <h1 className="text-xl font-bold">{payload.businessName}</h1>
        <p className="mt-2 text-sm">Receipt {payload.receiptNo}</p>
        <p className="text-xs">
          {payload.completedAt ? new Date(payload.completedAt).toLocaleString("en-GB") : ""}
        </p>
      </header>
      <ul className="divide-y divide-dashed">
        {payload.items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex justify-between gap-4 py-2 text-sm">
            <span>
              {item.name}
              <span className="block text-xs">
                {item.qtyLabel} @ {item.unitPriceLabel}
              </span>
            </span>
            <span>{money(item.total)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 border-t border-dashed py-3 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{money(payload.subtotal)}</dd>
        </div>
        {payload.discount > 0 && (
          <div className="flex justify-between">
            <dt>Discount</dt>
            <dd>{money(payload.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between font-bold">
          <dt>Total</dt>
          <dd>{money(payload.total)}</dd>
        </div>
        {payments.map(([method, amount]) => (
          <div key={method} className="flex justify-between">
            <dt>{PAYMENT_METHOD_LABELS[method]}</dt>
            <dd>{money(amount)}</dd>
          </div>
        ))}
      </dl>
      <section className="border-y border-dashed py-3 text-sm">
        <h2 className="font-bold">LOYALTY</h2>
        <p className="flex justify-between">
          <span>Points earned this sale</span>
          <span>{payload.loyaltyPointsEarned.toLocaleString()} pts</span>
        </p>
        {payload.loyaltyPointsBalance !== null && (
          <p className="flex justify-between">
            <span>Total accumulated points</span>
            <span>{payload.loyaltyPointsBalance.toLocaleString()} pts</span>
          </p>
        )}
      </section>
      <footer className="pt-4 text-center text-xs">{payload.footer}</footer>
    </article>
  );
}

function CancelOrderButton({ order }: { order: PublicOrder }) {
  const cancel = useCancelOrder();

  return (
    <div className="flex flex-col items-end gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="text-destructive" disabled={cancel.isPending}>
            {cancel.isPending ? "Cancelling…" : "Cancel order"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {order.orderNo ?? "this order"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The reserved items will be released and the order will close. You can order again from
              the shop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(order.id, {
                  onSuccess: () => toast.success("Order cancelled"),
                })
              }
            >
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {cancel.error && (
        <p role="alert" className="max-w-64 text-right text-xs font-medium text-destructive">
          {cancel.error.message}
        </p>
      )}
    </div>
  );
}
