import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_public/account/orders")({
  component: OrdersLayout,
});

function OrdersLayout() {
  return <Outlet />;
}
