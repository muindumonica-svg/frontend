import {
  useOnlineDeliveryOptions,
  useOnlineOrderAction,
  useOnlineOrders,
} from "@/api/hooks/online-orders";
import { useAssignDelivery } from "@/api/hooks/delivery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDateTime, money } from "@/lib/money";
import type { OnlineOrderStatus, Sale } from "@/types/api";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_LABELS: Record<OnlineOrderStatus, string> = {
  AWAITING_PROCESSING: "Awaiting processing",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function CashierOnlineOrderQueue({ branchId }: { branchId: string | null }) {
  const orders = useOnlineOrders(branchId);
  const action = useOnlineOrderAction();

  function run(order: Sale, next: "accept" | "prepare" | "ready" | "complete") {
    action.mutate(
      { saleId: order.id, action: next },
      {
        onError: (error) => toast.error(error.message),
        onSuccess: () => toast.success(`Order ${order.receiptNo ?? ""} updated`),
      },
    );
  }

  return (
    <section className="space-y-3 rounded-xl border-2 border-brand/30 bg-brand-soft/30 p-4">
      <div>
        <h2 className="font-display text-xl font-bold">Online Orders</h2>
        <p className="text-sm text-muted-foreground">
          Review and prepare customer orders independently of POS shift access.
        </p>
      </div>
      {orders.isPending && <Skeleton className="h-28 w-full rounded-lg" />}
      {orders.isError && (
        <div className="rounded-lg border border-destructive/40 bg-background p-3 text-sm text-destructive">
          Online orders could not be loaded: {orders.error.message}
          <Button
            className="ml-2"
            size="sm"
            variant="outline"
            onClick={() => void orders.refetch()}
          >
            Retry
          </Button>
        </div>
      )}
      {orders.isSuccess && (
        <>
          <p className="text-sm font-bold">
            NEW ONLINE ORDERS —{" "}
            {
              orders.data.items.filter((order) => order.onlineStatus === "AWAITING_PROCESSING")
                .length
            }
          </p>
          {orders.data.items.length === 0 ? (
            <p className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
              No online orders are waiting.
            </p>
          ) : (
            <div className="space-y-3">
              {orders.data.items.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  busy={action.isPending}
                  onAction={(next) => run(order, next)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function OrderCard({
  order,
  busy,
  onAction,
}: {
  order: Sale;
  busy: boolean;
  onAction: (action: "accept" | "prepare" | "ready" | "complete") => void;
}) {
  const status = order.onlineStatus ?? "AWAITING_PROCESSING";
  const [personnelId, setPersonnelId] = useState("");
  const needsDelivery = status === "READY" && order.fulfillment === "DELIVERY";
  const deliveryOptions = useOnlineDeliveryOptions(order.id, needsDelivery);
  const assignDelivery = useAssignDelivery();
  const canAccept = status === "AWAITING_PROCESSING" && order.status === "COMPLETED";
  const waitingMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000),
  );

  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{order.receiptNo ?? "Online order"}</p>
          <p className="text-sm">
            {order.customerName ?? "Customer"} · {order.customerPhone ?? "No phone"}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={order.status === "COMPLETED" ? "default" : "secondary"}>
            {order.status === "COMPLETED" ? "Paid" : order.status.replaceAll("_", " ")}
          </Badge>
          <Badge variant="outline">{STATUS_LABELS[status]}</Badge>
        </div>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span>Ordered: {fmtDateTime(order.createdAt)}</span>
        <span>Waiting: {waitingMinutes} minutes</span>
        <span>{order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}</span>
        <span>
          {order.items.length} items · {money(order.total)}
        </span>
        {order.processingAssigneeName && <span>Assigned to: {order.processingAssigneeName}</span>}
      </div>
      {order.items.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
              <ProductImage
                name={item.productName}
                productId={item.productId}
                className="h-6 w-6 rounded-sm"
              />
              {item.productName} ({item.qtyLabel})
            </li>
          ))}
        </ul>
      )}
      {order.deliveryAddress && (
        <p className="mt-1 text-sm text-muted-foreground">
          Deliver to: {order.deliveryAddress.addressLine}, {order.deliveryAddress.town} ·{" "}
          {order.deliveryAddress.phone}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {canAccept && (
          <Button size="sm" disabled={busy} onClick={() => onAction("accept")}>
            Accept Order
          </Button>
        )}
        {status === "AWAITING_PROCESSING" && order.status !== "COMPLETED" && (
          <span className="self-center text-sm font-medium text-amber-700">
            Payment confirmation required
          </span>
        )}
        {status === "ACCEPTED" && (
          <Button size="sm" disabled={busy} onClick={() => onAction("prepare")}>
            Start Preparation
          </Button>
        )}
        {status === "PREPARING" && (
          <Button size="sm" disabled={busy} onClick={() => onAction("ready")}>
            Mark Ready
          </Button>
        )}
        {status === "READY" && order.fulfillment === "COLLECTION" && (
          <Button size="sm" disabled={busy} onClick={() => onAction("complete")}>
            Complete Pickup
          </Button>
        )}
        {status === "READY" && order.fulfillment === "DELIVERY" && (
          <>
            <Select value={personnelId} onValueChange={setPersonnelId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Choose delivery person" />
              </SelectTrigger>
              <SelectContent>
                {(deliveryOptions.data ?? []).map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name ?? person.phone ?? "Delivery person"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!personnelId || assignDelivery.isPending || deliveryOptions.isPending}
              onClick={() =>
                assignDelivery.mutate(
                  { saleId: order.id, personnelId },
                  {
                    onSuccess: () => toast.success("Delivery assigned"),
                    onError: (error) => toast.error(error.message),
                  },
                )
              }
            >
              Assign delivery
            </Button>
            {deliveryOptions.isError && (
              <span className="self-center text-xs text-destructive">
                {deliveryOptions.error.message}
              </span>
            )}
            {deliveryOptions.isSuccess && deliveryOptions.data.length === 0 && (
              <span className="self-center text-xs text-muted-foreground">
                No approved delivery person for this zone
              </span>
            )}
          </>
        )}
      </div>
    </article>
  );
}
