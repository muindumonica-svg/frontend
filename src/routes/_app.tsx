import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  UserCog,
  UserRound,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { loadSession, useLogout, useSession, useSetActiveBranch } from "@/api/hooks/auth";
import { ApiError } from "@/lib/api";
import { ROLE_LABELS, type Permission } from "@/types/api";
import { Button } from "@/components/ui/button";

/** Literal route paths so `Link`/`useMatchRoute` keep their strict `to` typing. */
type NavPath =
  | "/dashboard"
  | "/pos"
  | "/cashier"
  | "/products"
  | "/inventory"
  | "/purchasing"
  | "/stock-taking"
  | "/customers"
  | "/payments"
  | "/sales"
  | "/expenses"
  | "/delivery"
  | "/reports"
  | "/accounting"
  | "/operations-audit"
  | "/users"
  | "/branches"
  | "/settings"
  | "/seo";

interface NavItem {
  to: NavPath;
  label: string;
  icon: LucideIcon;
  /** Server permission — the nav only offers what the API will accept. */
  perm: Permission;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operations",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "reports" },
      { to: "/pos", label: "POS", icon: ShoppingCart, perm: "pos" },
      { to: "/cashier", label: "Cashier", icon: Banknote, perm: "cashier" },
      { to: "/delivery", label: "Delivery", icon: Truck, perm: "delivery" },
    ],
  },
  {
    title: "Sales & Stock",
    items: [
      { to: "/products", label: "Products", icon: Package, perm: "inventory" },
      { to: "/inventory", label: "Inventory", icon: Warehouse, perm: "inventory" },
      { to: "/purchasing", label: "Purchasing", icon: Truck, perm: "purchasing" },
      { to: "/stock-taking", label: "Stock Taking", icon: ClipboardCheck, perm: "stock_take" },
      { to: "/customers", label: "Customers", icon: UserRound, perm: "customers" },
      { to: "/sales", label: "Sales", icon: Banknote, perm: "reports" },
      { to: "/expenses", label: "Expenses", icon: CreditCard, perm: "expenses" },
      { to: "/payments", label: "Payments", icon: CreditCard, perm: "reports" },
    ],
  },
  {
    title: "Administration",
    items: [
      { to: "/accounting", label: "Accounting", icon: BookOpen, perm: "accounting" },
      {
        to: "/operations-audit",
        label: "Operations Audit",
        icon: ShieldCheck,
        perm: "operations_audit",
      },
      { to: "/reports", label: "Reports", icon: BarChart3, perm: "reports" },
      { to: "/users", label: "Users & Roles", icon: UserCog, perm: "users" },
      { to: "/branches", label: "Branches", icon: Building2, perm: "branches" },
      { to: "/seo", label: "SEO & Discoverability", icon: Search, perm: "seo" },
      { to: "/settings", label: "Settings", icon: Settings, perm: "settings" },
    ],
  },
];

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    // A 401 from `GET /auth/me` resolves to `null`; any other failure throws so
    // the router shows a real error instead of bouncing the user to /staff/login.
    const session = await loadSession();
    if (!session) throw redirect({ to: "/staff/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const matchRoute = useMatchRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  const sessionQuery = useSession();
  const session = sessionQuery.data;
  const sessionExpired =
    sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401;
  const logout = useLogout();
  const setActiveBranch = useSetActiveBranch();

  useEffect(() => {
    if (!sessionExpired) return;

    queryClient.removeQueries();
    void navigate({ to: "/staff/login", replace: true });
  }, [sessionExpired, queryClient, navigate]);

  if (sessionExpired) {
    return (
      <div className="pos-theme flex min-h-dvh items-center justify-center">
        <p className="text-sm text-pos-muted-foreground">Session expired. Returning to sign in…</p>
      </div>
    );
  }

  // `beforeLoad` already filled the cache, so this renders for one frame at most.
  if (!session) {
    return (
      <div className="pos-theme flex min-h-dvh items-center justify-center">
        <p className="text-sm text-pos-muted-foreground">Loading…</p>
      </div>
    );
  }

  const { user, permissions, branches, activeBranchId } = session;

  const nav = (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-brand text-xl shadow-elegant">
            🐔
          </span>
          <div>
            <p className="font-display text-base font-bold leading-tight tracking-wide">
              BRATHAMATU
            </p>
            <p className="text-[11px] text-muted-foreground">Kuku POS</p>
          </div>
        </div>
        {branches.length > 1 && (
          <label className="mt-3 block">
            <span className="sr-only">Active branch</span>
            <select
              value={activeBranchId ?? ""}
              disabled={setActiveBranch.isPending}
              onChange={(event) => setActiveBranch.mutate(event.target.value)}
              className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-ring"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} · {branch.location}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => permissions.includes(i.perm));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = !!matchRoute({ to: item.to, fuzzy: true });
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground/80 hover:bg-accent"
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-muted/60 p-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {user.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Sign out"
            disabled={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, {
                // Settled, not success: a 401 here means the session is already
                // gone, and either way the shell hands over to the storefront home.
                onSettled: () => navigate({ to: "/", replace: true }),
              })
            }
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r bg-sidebar lg:block">
        {nav}
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(18rem,88vw)] bg-sidebar pb-[env(safe-area-inset-bottom)] shadow-xl">
            <button
              className="absolute right-3 top-4 rounded-md p-1.5 hover:bg-accent"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {nav}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-background/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold tracking-wide">BRATHAMATU</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {user.name} · {ROLE_LABELS[user.role]}
            </p>
          </div>
        </header>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
