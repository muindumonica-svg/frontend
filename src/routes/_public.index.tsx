import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ShoppingBasket, Store, Weight } from "lucide-react";
import heroImg from "@/assets/brand-hero.jpg";
import { usePublicCatalog } from "@/api/hooks/public";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { Skeleton } from "@/components/ui/skeleton";
import { priceLines } from "@/lib/storefront";

export const Route = createFileRoute("/_public/")({
  component: StorefrontHome,
});

const VALUE_CARDS = [
  {
    icon: ShoppingBasket,
    title: "Today's cuts",
    body: "See the poultry we actually have on the shelf right now, branch by branch.",
  },
  {
    icon: Weight,
    title: "Buy by weight or piece",
    body: "Prices are listed per kilogram and per piece where both apply — no surprises.",
  },
  {
    icon: Store,
    title: "Your local branch",
    body: "Choose the branch nearest you and check availability before you travel.",
  },
];

function StorefrontHome() {
  const catalog = usePublicCatalog();
  const data = catalog.data;
  const featured = data?.products.slice(0, 4) ?? [];

  return (
    <div>
      <section className="relative overflow-hidden border-b">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-2 md:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand-soft px-3 py-1 text-xs font-semibold tracking-widest text-foreground">
              FRESH · LOCAL · HONEST
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Fresh kuku, priced clearly.
            </h1>
            <p className="mt-4 max-w-md text-base text-muted-foreground">
              Browse today&apos;s poultry, see what is in stock at your branch, and buy by weight or
              by the piece.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" className="font-semibold">
                <Link to="/shop">
                  Shop today&apos;s stock <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/account">My account</Link>
              </Button>
            </div>
            {data && (
              <p className="mt-5 text-xs text-muted-foreground">
                {data.branches.length} {data.branches.length === 1 ? "branch" : "branches"} ·{" "}
                {data.products.length} {data.products.length === 1 ? "product" : "products"} listed
              </p>
            )}
          </div>

          <div className="relative">
            <img
              src={heroImg}
              alt="Fresh poultry from BrathaMatu"
              className="aspect-[4/3] w-full rounded-2xl object-cover shadow-elegant"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 md:grid-cols-3">
          {VALUE_CARDS.map((card) => (
            <div key={card.title} className="rounded-xl border bg-card p-5 shadow-sm">
              <card.icon className="h-5 w-5 text-brand-deep" />
              <h2 className="mt-3 font-display text-base font-bold">{card.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">Today&apos;s picks</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Availability shown for {data?.branches.find((b) => b.id === data.selectedBranchId)?.name ?? "your branch"}.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/shop">View all</Link>
            </Button>
          </div>

          {catalog.isPending && (
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
            </div>
          )}

          {catalog.isError && (
            <p className="mt-6 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              The catalog did not load. Please try again shortly.
            </p>
          )}

          {catalog.isSuccess && featured.length === 0 && (
            <p className="mt-6 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No products are listed right now. Check back soon.
            </p>
          )}

          {featured.length > 0 && data && (
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {featured.map((product) => (
                <Link
                  key={product.id}
                  to="/products/$productId"
                  params={{ productId: product.slug ?? product.id }}
                  className="group rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-elegant"
                >
                  <ProductImage
                    name={product.name}
                    productId={product.id}
                    slug={product.slug}
                    sku={product.sku}
                    categoryName={product.categoryName}
                    className="h-16 w-16 rounded-xl"
                  />
                  <p className="mt-3 truncate font-semibold">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.categoryName ?? "Poultry"}</p>
                  <div className="mt-2 space-y-0.5">
                    {priceLines(data.currency, product).map((line) => (
                      <p key={line} className="text-sm font-semibold">{line}</p>
                    ))}
                  </div>
                  <p className={`mt-2 text-xs font-medium ${product.inStock ? "text-success" : "text-muted-foreground"}`}>
                    {product.inStock ? "In stock" : "Out of stock"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
