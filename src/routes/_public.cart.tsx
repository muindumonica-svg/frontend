import { Link, createFileRoute } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { useCart, type CartLine } from "@/lib/cart";
import { money } from "@/lib/money";

export const Route = createFileRoute("/_public/cart")({
  component: CartPage,
});

function stepFor(line: CartLine): number {
  if (line.mode === "amount") return 50;
  return 0.25;
}

function rawValue(line: CartLine): number {
  if (line.mode === "amount") return line.amount ?? 0;
  return line.qtyKg ?? 0;
}

function CartPage() {
  const cart = useCart();

  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <ShoppingBag className="h-7 w-7 text-muted-foreground" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold">Your bag is empty</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse today&apos;s stock and add what you need. Stock is only held once you check out.
        </p>
        <Button asChild className="mt-6">
          <Link to="/shop">Go to the shop</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Your bag</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Collecting from {cart.branchName ?? "your branch"}. Payment is made at the branch.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link to="/shop">Keep shopping</Link>
        </Button>
      </div>

      <ul className="mt-6 divide-y rounded-xl border bg-card shadow-sm">
        {cart.lines.map((line) => {
          const step = stepFor(line);
          const raw = rawValue(line);
          return (
            <li key={line.id} className="flex gap-2.5 p-3 sm:gap-3 sm:p-4">
              <ProductImage
                name={line.name}
                productId={line.productId}
                slug={line.slug}
                sku={line.sku}
                categoryName={line.categoryName}
                imageKey={line.imageKey}
                className="h-14 w-14 shrink-0 rounded-xl"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{line.name}</p>
                    <p className="text-xs text-muted-foreground">{line.unitPriceLabel}</p>
                  </div>
                  <p className="whitespace-nowrap font-display font-bold">{money(line.total)}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Reduce ${line.name}`}
                      disabled={raw <= step}
                      onClick={() => cart.updateLine(line.id, Math.max(step, raw - step))}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="min-w-16 text-center text-sm font-semibold sm:min-w-24">
                      {line.qtyLabel}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Add more ${line.name}`}
                      onClick={() => cart.updateLine(line.id, raw + step)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => cart.removeLine(line.id)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Remove
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between rounded-xl border bg-card px-4 py-3 shadow-sm">
        <span className="text-sm font-medium text-muted-foreground">Subtotal</span>
        <span className="font-display text-xl font-bold">{money(cart.subtotal)}</span>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button asChild size="lg" className="sm:min-w-56">
          <Link to="/checkout">Checkout</Link>
        </Button>
      </div>
      <p className="mt-2 text-right text-xs text-muted-foreground">
        You will be asked to sign in if you are not already. The total is confirmed at checkout.
      </p>
    </div>
  );
}
