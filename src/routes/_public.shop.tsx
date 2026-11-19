import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { usePublicCatalog, usePublicProduct } from "@/api/hooks/public";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { makeCartLine, useCart } from "@/lib/cart";
import { money } from "@/lib/money";
import { priceLines } from "@/lib/storefront";
import type { PublicProduct, SellingMode } from "@/types/api";

export const Route = createFileRoute("/_public/shop")({
  component: ShopPage,
});

function ShopPage() {
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [appliedQ, setAppliedQ] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<PublicProduct | null>(null);

  const catalog = usePublicCatalog({ branchId, categoryId, q: appliedQ });
  const data = catalog.data;
  const effectiveBranchId = branchId ?? data?.selectedBranchId ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Shop</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Availability reflects the selected branch. Choose another branch to check stock there.
          </p>
        </div>
        {data && data.branches.length > 0 && (
          <label className="text-sm">
            <span className="mr-2 font-medium">Branch</span>
            <select
              value={effectiveBranchId ?? ""}
              onChange={(event) => {
                setSelected(null);
                setBranchId(event.target.value || undefined);
              }}
              className="rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {data.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} · {branch.location}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <form
        className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedQ(search.trim() || undefined);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products or SKU"
            className="pl-9"
            aria-label="Search products"
          />
        </div>
        <Button type="submit" variant="outline" className="sm:w-auto">
          Search
        </Button>
        {(appliedQ || categoryId) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setAppliedQ(undefined);
              setCategoryId(undefined);
            }}
          >
            Clear
          </Button>
        )}
      </form>

      {data && (
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
          <CategoryChip active={!categoryId} onClick={() => setCategoryId(undefined)} label="All" productName="Chicken" />
          {data.categories.map((category) => (
            <CategoryChip
              key={category.id}
              active={categoryId === category.id}
              onClick={() => setCategoryId(category.id)}
              label={category.name}
              productName={category.name}
            />
          ))}
        </div>
      )}

      {catalog.isPending && (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      )}

      {catalog.isError && (
        <div className="mt-8 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-semibold">The catalog did not load</p>
          <p className="mt-1 text-sm text-muted-foreground">{catalog.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void catalog.refetch()}>Try again</Button>
        </div>
      )}

      {catalog.isSuccess && data && data.products.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          Nothing matches this filter. Try another category or clear the search.
        </p>
      )}

      {catalog.isSuccess && data && data.products.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {data.products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => setSelected(product)}
              className="min-w-0 rounded-xl border bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-elegant sm:p-4"
            >
              <ProductImage
                name={product.name}
                productId={product.id}
                slug={product.slug}
                sku={product.sku}
                categoryName={product.categoryName}
                imageKey={product.imageKey}
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
            </button>
          ))}
        </div>
      )}

      <ProductDialog
        product={selected}
        branchId={effectiveBranchId}
        branchName={data?.branches.find((branch) => branch.id === effectiveBranchId)?.name ?? null}
        currency={data?.currency ?? "KES"}
        onlineEnabled={data?.onlineOrdering.enabled ?? false}
        reservationMinutes={data?.onlineOrdering.reservationMinutes ?? 60}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function CategoryChip({
  label,
  productName,
  active,
  onClick,
}: {
  label: string;
  productName: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? "border-transparent bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent"
      }`}
    >
      <ProductImage name={productName} className="mr-1 inline-flex h-4 w-4 rounded-sm" />
      {label}
    </button>
  );
}

function ProductDialog({
  product,
  branchId,
  branchName,
  currency,
  onlineEnabled,
  reservationMinutes,
  onClose,
}: {
  product: PublicProduct | null;
  branchId: string | null;
  branchName: string | null;
  currency: string;
  onlineEnabled: boolean;
  reservationMinutes: number;
  onClose: () => void;
}) {
  const detail = usePublicProduct(product?.id ?? null, branchId);
  const item = detail.data ?? product;
  const cart = useCart();

  const modes = useMemo<{ value: SellingMode; label: string; step: number; suffix: string }[]>(() => {
    if (!item) return [];
    const available: { value: SellingMode; label: string; step: number; suffix: string }[] = [];
    if (item.sellingModes.includes("weight") && item.pricePerKg !== null) {
      available.push({ value: "weight", label: "By weight", step: 0.25, suffix: "kg" });
    }
    if (item.sellingModes.includes("amount") && item.pricePerKg !== null) {
      available.push({ value: "amount", label: "By amount", step: 50, suffix: "KSh" });
    }
    return available;
  }, [item]);

  const [mode, setMode] = useState<SellingMode>("weight");
  const [qty, setQty] = useState("1");

  useEffect(() => {
    if (!product) return;
    const first = modes[0]?.value ?? "weight";
    setMode(first);
    setQty(first === "amount" ? String(product.pricePerKg ?? 500) : "1");
    // Reset the selection whenever a different product is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  useEffect(() => {
    if (!modes.some((entry) => entry.value === mode) && modes[0]) setMode(modes[0].value);
  }, [modes, mode]);

  const selectedMode = modes.find((entry) => entry.value === mode) ?? modes[0];
  const value = Number(qty);
  const validValue = Number.isFinite(value) && value > 0;
  const preview =
    item && branchId && validValue
      ? makeCartLine(item, mode, value, { id: branchId, name: branchName ?? "Branch" })
      : null;

  function addToBag() {
    if (!item || !branchId) {
      toast.error("Choose a branch first.");
      return;
    }
    if (!selectedMode || !validValue) {
      toast.error("Enter a quantity above zero.");
      return;
    }
    if (cart.lines.length > 0 && cart.branchId !== branchId) {
      if (!window.confirm("Your bag has items from another branch. Start a new bag here?")) return;
    }

    cart.addLine(makeCartLine(item, mode, value, { id: branchId, name: branchName ?? "Branch" }));
    toast.success(`${item.name} added to your bag`);
    onClose();
  }

  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {item && (
              <ProductImage
                name={item.name}
                productId={item.id}
                slug={item.slug}
                sku={item.sku}
                categoryName={item.categoryName}
                className="h-10 w-10 rounded-lg"
              />
            )}
            {item?.name ?? "Product"}
          </DialogTitle>
        </DialogHeader>

        {detail.isError && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {detail.error.message}
          </p>
        )}

        {item && (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{item.categoryName ?? "Poultry"}</p>
              <div className="mt-1 space-y-1">
                {priceLines(currency, item).map((line) => (
                  <p key={line} className="font-display text-lg font-bold">{line}</p>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold">Availability</p>
              <ul className="mt-2 space-y-1.5">
                {(item.availability ?? []).map((row) => (
                  <li key={row.branchId} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span>{row.branchName}</span>
                    <Badge variant={row.inStock ? "default" : "secondary"}>
                      {row.inStock ? "In stock" : "Out of stock"}
                    </Badge>
                  </li>
                ))}
                {!item.availability && (
                  <li className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
                    <Badge variant={item.inStock ? "default" : "secondary"}>
                      {item.inStock ? "In stock at your branch" : "Out of stock at your branch"}
                    </Badge>
                  </li>
                )}
              </ul>
            </div>

            {onlineEnabled && branchId && selectedMode ? (
              <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {modes.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      onClick={() => {
                        setMode(entry.value);
                        setQty(entry.value === "amount" ? String(item.pricePerKg ?? 500) : "1");
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        mode === entry.value
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent"
                      }`}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Quantity</span>
                  <Input
                    type="number"
                    min={selectedMode.step < 1 ? 0.001 : 1}
                    step={selectedMode.step}
                    value={qty}
                    onChange={(event) => setQty(event.target.value)}
                    className="h-9 w-28"
                    aria-label="Quantity"
                  />
                  <span className="text-muted-foreground">{selectedMode.suffix}</span>
                </label>

                {preview && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">{preview.qtyLabel} · </span>
                    <span className="font-display font-bold">{money(preview.total)}</span>
                  </p>
                )}

                <Button className="w-full" onClick={addToBag} disabled={!validValue || !item.inStock}>
                  {item.inStock ? "Add to bag" : "Out of stock at this branch"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Stock is held for {reservationMinutes} minutes after checkout. Payment is made at{" "}
                  {branchName ?? "the branch"} on collection — no online payment is taken.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {onlineEnabled
                  ? "Choose a branch above to order online."
                  : "Online ordering is currently unavailable. Visit the branch to buy today's stock."}
              </p>
            )}

            {preview && !item.inStock && (
              <p className="text-xs text-destructive">
                This product is out of stock at the selected branch. Switch branch to check elsewhere.
              </p>
            )}

            <Link
              to="/products/$productId"
              params={{ productId: item.slug ?? item.id }}
              onClick={onClose}
              className="inline-block text-sm font-semibold text-brand-deep hover:underline"
            >
              View full product page
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
