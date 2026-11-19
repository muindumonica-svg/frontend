import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { loadCustomerSession, usePublicOrders } from "@/api/hooks/public";
import { EmptyState, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateTime, money } from "@/lib/money";

export const Route = createFileRoute("/_public/account/orders/")({
  beforeLoad: async () => {
    const session = await loadCustomerSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: "/account/orders" }, replace: true });
    }
  },
  component: CustomerOrders,
});

function CustomerOrders() {
  const orders = usePublicOrders();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">My orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reserve items online, then collect and pay at your branch.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/shop">Continue shopping</Link>
        </Button>
      </div>

      {orders.isPending && (
        <div className="space-y-2">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      )}

      {orders.isError && (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm">
          <p className="font-medium">Orders did not load.</p>
          <p className="mt-1 text-muted-foreground">{orders.error.message}</p>
          <Button variant="outline" className="mt-3" onClick={() => void orders.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {orders.isSuccess && orders.data.items.length === 0 && (
        <EmptyState
          icon="🧺"
          title="No orders yet"
          body="Items you reserve from the shop will show up here with their collection and payment status."
        />
      )}

      {orders.isSuccess && orders.data.items.length > 0 && (
        <ul className="space-y-3">
          {orders.data.items.map((order) => (
            <li key={order.id}>
              <Link
                to="/account/orders/$orderId"
                params={{ orderId: order.id }}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm transition hover:border-brand/50 hover:bg-accent/40"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-sm font-bold">{order.orderNo ?? "Order"}</p>
                    <StatusPill status={order.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtDateTime(order.createdAt)} · {order.branchName ?? "Branch"} · {order.items.length} item
                    {order.items.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold">{money(order.total)}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
