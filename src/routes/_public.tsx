import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, ShoppingBag, X } from "lucide-react";
import { useCustomerSession } from "@/api/hooks/public";
import { Button } from "@/components/ui/button";
import { ConsentBanner, MarketingTags } from "@/components/marketing/consent";
import { CartProvider, useCart } from "@/lib/cart";
import { resetConsent } from "@/lib/marketing";

export const Route = createFileRoute("/_public")({
  component: StorefrontLayout,
});

function StorefrontLayout() {
  return (
    <CartProvider>
      <div className="flex min-h-dvh flex-col bg-background">
        <StorefrontHeader />
        <main className="flex-1">
          <Outlet />
        </main>
        <StorefrontFooter />
        <ConsentBanner />
        <MarketingTags />
      </div>
    </CartProvider>
  );
}

function StorefrontHeader() {
  const session = useCustomerSession();
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const account = session.data ?? null;

  const links = (
    <>
      <Link
        to="/"
        onClick={() => setOpen(false)}
        activeOptions={{ exact: true }}
        activeProps={{ className: "text-foreground" }}
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Home
      </Link>
      <Link
        to="/shop"
        onClick={() => setOpen(false)}
        activeProps={{ className: "text-foreground" }}
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Shop
      </Link>
      <Link
        to="/locations"
        onClick={() => setOpen(false)}
        activeProps={{ className: "text-foreground" }}
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Locations
      </Link>
      <Link
        to="/faq"
        onClick={() => setOpen(false)}
        activeProps={{ className: "text-foreground" }}
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        FAQ
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-brand text-xl shadow-elegant">🐔</span>
          <span className="font-display text-base font-bold tracking-wide">BRATHAMATU</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-0.5 sm:flex">{links}</nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/cart"
            aria-label={`Bag with ${cart.count} item${cart.count === 1 ? "" : "s"}`}
            className="relative rounded-lg px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ShoppingBag className="h-5 w-5" />
            {cart.count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {cart.count}
              </span>
            )}
          </Link>
          {account ? (
            <Link
              to="/account"
              className="hidden max-w-40 truncate rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-accent sm:inline"
            >
              {account.name.split(" ")[0]}
            </Link>
          ) : (
            <Link
              to="/login"
              className="hidden rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-accent sm:inline"
            >
              Sign in
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <nav className="border-t bg-background px-4 py-3 sm:hidden">
          <div className="flex flex-col gap-1">
            {links}
            <Link
              to="/cart"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Bag{cart.count > 0 ? ` (${cart.count})` : ""}
            </Link>
            <Link
              to={account ? "/account" : "/login"}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {account ? "My account" : "Sign in"}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

function StorefrontFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">🐔</span>
            <span className="font-display text-sm font-bold tracking-wide">BRATHAMATU</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Fresh poultry, honestly priced.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Link to="/shop" className="hover:text-foreground">Shop</Link>
          <Link to="/locations" className="hover:text-foreground">Locations</Link>
          <Link to="/faq" className="hover:text-foreground">FAQ</Link>
          <Link to="/account" className="hover:text-foreground">My account</Link>
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => {
              resetConsent();
              window.location.reload();
            }}
          >
            Analytics choices
          </button>
          <span>© {new Date().getFullYear()} BrathaMatu</span>
        </div>
      </div>
    </footer>
  );
}
