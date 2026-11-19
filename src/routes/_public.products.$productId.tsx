import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { usePublicCatalog, usePublicProduct } from "@/api/hooks/public";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { makeCartLine, useCart } from "@/lib/cart";
import { money } from "@/lib/money";
import { priceLines } from "@/lib/storefront";
import type { SellingMode } from "@/types/api";

export const Route = createFileRoute("/_public/products/$productId")({
  component: ProductPage,
});

function ProductPage() {
  const { productId } = Route.useParams();
  const catalog = usePublicCatalog();
  const [branchId, setBranchId] = useState<string | null>(null);
  const effectiveBranchId = branchId ?? catalog.data?.selectedBranchId ?? null;
  const detail = usePublicProduct(productId, effectiveBranchId);
  const product = detail.data;
  const cart = useCart();

  const modes = useMemo<{ value: SellingMode; label: string; step: number; suffix: string }[]>(() => {
    if (!product) return [];
    const available: { value: SellingMode; label: string; step: number; suffix: string }[] = [];
    if (product.sellingModes.includes("weight") && product.pricePerKg !== null) {
      available.push({ value: "weight", label: "By weight", step: 0.25, suffix: "kg" });
    }
    if (product.sellingModes.includes("amount") && product.pricePerKg !== null) {
      available.push({ value: "amount", label: "By amount", step: 50, suffix: "KSh" });
    }
    return available;
  }, [product]);

  const [mode, setMode] = useState<SellingMode>("weight");
  const [qty, setQty] = useState("1");

  useEffect(() => {
    if (modes.length === 0) return;
    const firstMode = modes[0]?.value ?? "weight";
    setMode(firstMode);
    setQty(firstMode === "amount" ? String(product?.pricePerKg ?? 500) : "1");
  }, [product?.id, modes.length]);

  const branch = catalog.data?.branches.find((item) => item.id === effectiveBranchId) ?? null;
  const selectedMode = modes.find((entry) => entry.value === mode) ?? modes[0];
  const value = Number(qty);
  const validValue = Number.isFinite(value) && value > 0;
  const preview =
    product && branch && selectedMode && validValue
      ? makeCartLine(product, mode, value, { id: branch.id, name: branch.name })
      : null;
  const inStock = branch
    ? (product?.availability?.find((row) => row.branchId === branch.id)?.inStock ?? product?.inStock ?? false)
    : Boolean(product?.inStock);

  function addToBag() {
    if (!product || !branch) {
      toast.error("Choose a branch first.");
      return;
    }
    if (!selectedMode || !validValue) {
      toast.error("Enter a quantity above zero.");
      return;
    }
    if (cart.lines.length > 0 && cart.branchId !== branch.id) {
      if (!window.confirm("Your bag has items from another branch. Start a new bag here?")) return;
    }

    cart.addLine(makeCartLine(product, mode, value, { id: branch.id, name: branch.name }));
    toast.success(`${product.name} added to your bag`);
  }

  if (detail.isPending) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (detail.isError || !product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Product not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This product may have been removed or is no longer listed.
        </p>
        <Button asChild className="mt-5">
          <Link to="/shop">Browse the shop</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/shop" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to shop
      </Link>

      <div className="mt-5 grid gap-8 md:grid-cols-[280px_1fr]">
        <ProductImage
          name={product.name}
          productId={product.id}
          slug={product.slug}
          sku={product.sku}
          categoryName={product.categoryName}
          className="h-56 w-full rounded-2xl border bg-muted/40 md:h-72"
        />

        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {product.categoryName ?? "Poultry"}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">{product.name}</h1>
          <div className="mt-3 space-y-1">
            {priceLines(catalog.data?.currency ?? "KES", product).map((line) => (
              <p key={line} className="font-display text-lg font-bold">{line}</p>
            ))}
          </div>

          <div className="mt-5 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Availability</p>
              {catalog.data && catalog.data.branches.length > 0 && (
                <label className="text-sm">
                  <span className="mr-2 text-muted-foreground">Branch</span>
                  <select
                    value={effectiveBranchId ?? ""}
                    onChange={(event) => setBranchId(event.target.value || null)}
                    className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {catalog.data.branches.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.location}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <ul className="mt-3 space-y-1.5">
              {(product.availability ?? []).map((row) => (
                <li key={row.branchId} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span>{row.branchName}</span>
                  <Badge variant={row.inStock ? "default" : "secondary"}>
                    {row.inStock ? "In stock" : "Out of stock"}
                  </Badge>
                </li>
              ))}
              {(product.availability ?? []).length === 0 && (
                <li className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
                  <Badge variant={inStock ? "default" : "secondary"}>
                    {inStock ? "In stock at your branch" : "Out of stock at your branch"}
                  </Badge>
                </li>
              )}
            </ul>
          </div>

          {branch && selectedMode && (
            <div className="mt-5 space-y-3 rounded-xl border bg-muted/30 p-4">
              <div className="flex flex-wrap gap-1.5">
                {modes.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => {
                      setMode(entry.value);
                      setQty(entry.value === "amount" ? String(product.pricePerKg ?? 500) : "1");
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

              <Button className="w-full" onClick={addToBag} disabled={!validValue || !inStock}>
                <ShoppingBag className="mr-1 h-4 w-4" />
                {inStock ? "Add to bag" : "Out of stock at this branch"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Payment is made at the branch on collection. Stock is held briefly after checkout.
              </p>
            </div>
          )}

          {!branch && (
            <p className="mt-4 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              Choose a branch above to see quantities and add this product to your bag.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
