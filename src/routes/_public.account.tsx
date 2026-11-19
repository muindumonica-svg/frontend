import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_public/account")({
  component: AccountLayout,
});

function AccountLayout() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <Outlet />
    </div>
  );
}
