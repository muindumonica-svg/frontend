import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Power } from "lucide-react";
import { useActiveBranchId, usePermissions } from "@/api/hooks/auth";
import {
  useCategoryList,
  useCreateCategory,
  useCreateProduct,
  useDeleteCategory,
  useProductList,
  useUpdateCategory,
  useUpdateProduct,
} from "@/api/hooks/catalog";
import { fieldError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader } from "@/components/shared";
import { ProductImage } from "@/components/product-image";
import { fmtKg, money } from "@/lib/money";
import {
  PRODUCT_IMAGE_OPTIONS,
  resolveProductImage,
  type ProductImageKey,
} from "@/lib/product-images";
import type { Category, Product, ProductFilters, ProductInput, SellingMode } from "@/types/api";

export const Route = createFileRoute("/_app/products")({
  component: ProductsPage,
});

function ProductsPage() {
  const permissions = usePermissions();
  const branchId = useActiveBranchId();
  /** Catalog writes are `inventory` per the contract; reads belong to every session. */
  const canWrite = permissions.includes("inventory");

  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [catOpen, setCatOpen] = useState(false);

  // Debounce keystrokes so typing does not fire one GET per character.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const categories = useCategoryList();

  // `branchId` from the session makes each row's `balance` the real branch stock.
  const filters = useMemo<ProductFilters>(() => {
    const next: ProductFilters = {};
    if (branchId) next.branchId = branchId;
    if (categoryId !== "all") next.categoryId = categoryId;
    if (q) next.q = q;
    if (activeOnly) next.activeOnly = true;
    return next;
  }, [branchId, categoryId, q, activeOnly]);

  const products = useProductList(filters);
  const updateProduct = useUpdateProduct();

  const categoryName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? "—";

  function toggleActive(product: Product) {
    updateProduct.mutate(
      { productId: product.id, patch: { active: !product.active } },
      {
        onSuccess: () =>
          toast.success(`${product.name} ${product.active ? "disabled" : "enabled"}`),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Products"
        subtitle={
          products.isSuccess
            ? `${products.data.length} products${categories.data ? ` · ${categories.data.length} categories` : ""}`
            : "Catalog"
        }
        actions={
          canWrite ? (
            <>
              <Button variant="outline" onClick={() => setCatOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Category
              </Button>
              <Button onClick={() => setEditing("new")}>
                <Plus className="mr-1 h-4 w-4" /> New Product
              </Button>
            </>
          ) : undefined
        }
      />
      <div className="space-y-3 px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="max-w-sm flex-1">
            <Input
              placeholder="Search by name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <ProductImage name={c.name} className="h-6 w-6 rounded" />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2.5 text-sm">
            <Checkbox checked={activeOnly} onCheckedChange={(v) => setActiveOnly(v === true)} />
            Active only
          </label>
        </div>

        {products.isPending && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        )}
        {products.isError && (
          <RetryPanel
            message="The product list did not load."
            detail={products.error.message}
            retrying={products.isFetching}
            onRetry={() => void products.refetch()}
          />
        )}
        {products.isSuccess && products.data.length === 0 && (
          <EmptyState
            icon="📦"
            title="No products found"
            body={
              q || categoryId !== "all" || activeOnly
                ? "No products match these filters."
                : "Create your first product."
            }
          />
        )}
        {products.isSuccess && products.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.data.map((p) => {
              const bal = p.balance ?? 0;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 ${!p.active ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <ProductImage
                        name={p.name}
                        productId={p.id}
                        sku={p.sku}
                        categoryName={categoryName(p.categoryId)}
                        imageKey={p.imageKey}
                        className="h-12 w-12 shrink-0 rounded-lg"
                      />
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {categoryName(p.categoryId)} · {p.sku}
                        </p>
                      </div>
                    </div>
                    <Badge variant={p.active ? "default" : "secondary"}>
                      {p.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Base unit</span>
                      <span className="font-medium">{p.baseUnit}</span>
                    </div>
                    {p.pricePerKg ? (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Price / KG</span>
                        <span className="font-medium">{money(p.pricePerKg)}</span>
                      </div>
                    ) : null}
                    {p.pricePerPiece ? (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Price / piece</span>
                        <span className="font-medium">{money(p.pricePerPiece)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stock</span>
                      <span className="font-medium">
                        {p.baseUnit === "KG" ? fmtKg(bal) : `${bal} pcs`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reorder at</span>
                      <span className="font-medium">
                        {p.reorderLevel} {p.baseUnit === "KG" ? "kg" : "pcs"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.sellingModes.map((m) => (
                      <Badge key={m} variant="secondary" className="text-[10px]">
                        {m === "weight" ? "⚖️ Weight" : m === "piece" ? "Piece" : "💰 Amount"}
                      </Badge>
                    ))}
                  </div>
                  {canWrite && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setEditing(p)}
                      >
                        <Pencil className="mr-1 h-3 w-3" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={updateProduct.isPending}
                        title={p.active ? "Deactivate" : "Reactivate"}
                        onClick={() => toggleActive(p)}
                      >
                        <Power className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <ProductDialog
          product={editing === "new" ? null : editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      {catOpen && <CategoriesDialog onClose={() => setCatOpen(false)} />}
    </div>
  );
}

function imageLabel(key: ProductImageKey): string {
  return key
    .split("-")
    .map((word) => (word === "kienyeji" ? "Kienyeji" : word === "broiler" ? "Broiler" : word))
    .join(" ")
    .replace(/\bchicken\b/i, "Chicken")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** Blank numeric field → `null` so the API clears the value instead of seeing 0. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function ProductDialog({
  product,
  categories,
  onClose,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
}) {
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const mutation = product ? update : create;

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? "");
  const [modes, setModes] = useState<SellingMode[]>(
    product?.sellingModes.length ? product.sellingModes : ["weight"],
  );
  const [pricePerKg, setPricePerKg] = useState(String(product?.pricePerKg ?? ""));
  const [pricePerPiece, setPricePerPiece] = useState(String(product?.pricePerPiece ?? ""));
  const [pieceWeightKg, setPieceWeightKg] = useState(String(product?.pieceWeightKg ?? ""));
  const [costPerKg, setCostPerKg] = useState(String(product?.costPerKg ?? ""));
  const [reorderLevel, setReorderLevel] = useState(String(product?.reorderLevel ?? "0"));
  const [imageKey, setImageKey] = useState<ProductImageKey | null>(product?.imageKey ?? null);
  const selectedCategoryName = categories.find((category) => category.id === categoryId)?.name;
  const automaticImageKey = resolveProductImage({
    productId: product?.id,
    name,
    sku,
    categoryName: selectedCategoryName,
  });
  const displayedImageKey = imageKey ?? automaticImageKey;

  function toggleMode(m: SellingMode) {
    setModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  // Pricing rules (weight needs a per-KG price, etc.) are enforced by the API;
  // 422 `errors` land inline below the offending field.
  function save() {
    const input: ProductInput = {
      name: name.trim(),
      sku: sku.trim(),
      categoryId,
      imageKey,
      baseUnit: "KG",
      sellingModes: modes,
      pricePerKg: toNumber(pricePerKg),
      pricePerPiece: toNumber(pricePerPiece),
      pieceWeightKg: toNumber(pieceWeightKg),
      costPerKg: toNumber(costPerKg),
      reorderLevel: toNumber(reorderLevel) ?? 0,
      active: product?.active ?? true,
    };
    const callbacks = {
      onSuccess: () => {
        toast.success(product ? "Product updated" : "Product created");
        onClose();
      },
    };
    if (product) update.mutate({ productId: product.id, patch: input }, callbacks);
    else create.mutate(input, callbacks);
  }

  const error = mutation.error;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "New Product"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error.message}
            </p>
          )}
          <div className="flex items-end gap-3">
            {name.trim() && (
              <ProductImage
                name={name}
                productId={product?.id}
                sku={sku}
                categoryName={selectedCategoryName}
                imageKey={displayedImageKey}
                className="h-12 w-12 shrink-0 rounded-lg"
              />
            )}
            <div className="flex-1">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                placeholder="e.g. Drumsticks"
              />
              <FieldMsg text={fieldError(error, "name")} />
            </div>
          </div>
          <div>
            <Label htmlFor="product-image">Product image</Label>
            <Select
              value={imageKey ?? "automatic"}
              onValueChange={(value) => {
                if (value === "automatic") {
                  setImageKey(null);
                } else {
                  const selectedImage = PRODUCT_IMAGE_OPTIONS.find((key) => key === value);
                  if (selectedImage) setImageKey(selectedImage);
                }
              }}
            >
              <SelectTrigger id="product-image" className="mt-1">
                <span className="flex min-w-0 items-center gap-2">
                  <ProductImage
                    imageKey={displayedImageKey}
                    loading="eager"
                    className="h-10 w-10 shrink-0 rounded"
                  />
                  <span className="truncate">
                    {imageKey
                      ? imageLabel(imageKey)
                      : automaticImageKey
                        ? `Automatic — ${imageLabel(automaticImageKey)}`
                        : "Automatic — neutral placeholder"}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent
                position="item-aligned"
                className="max-h-[60vh] min-w-[var(--radix-select-trigger-width)]"
              >
                <SelectItem value="automatic">
                  <span className="flex items-center gap-2">
                    <ProductImage
                      imageKey={automaticImageKey}
                      loading="eager"
                      className="h-10 w-10 shrink-0 rounded"
                    />
                    Automatic
                  </span>
                </SelectItem>
                {PRODUCT_IMAGE_OPTIONS.map((key) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <ProductImage
                        imageKey={key}
                        loading="eager"
                        className="h-10 w-10 shrink-0 rounded"
                      />
                      {imageLabel(key)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="mt-1"
              />
              <FieldMsg text={fieldError(error, "sku")} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <ProductImage name={c.name} className="h-6 w-6 rounded" />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldMsg text={fieldError(error, "categoryId")} />
            </div>
          </div>
          {product?.baseUnit === "PIECE" && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
              This legacy PIECE product cannot be edited or sold. Reconcile its stock into kilograms
              and create a replacement product.
            </p>
          )}
          <div>
            <Label>Selling Modes</Label>
            <div className="mt-1 flex flex-wrap gap-4">
              {(["weight", "piece", "amount"] as SellingMode[]).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={modes.includes(m)} onCheckedChange={() => toggleMode(m)} />
                  {m === "weight"
                    ? "⚖️ Weight (KG/grams)"
                    : m === "piece"
                      ? "Configured piece"
                      : "💰 Customer Amount"}
                </label>
              ))}
            </div>
            <FieldMsg text={fieldError(error, "sellingModes")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {modes.includes("weight") && (
              <div>
                <Label htmlFor="pkg">Price / KG</Label>
                <Input
                  id="pkg"
                  type="number"
                  value={pricePerKg}
                  onChange={(e) => setPricePerKg(e.target.value)}
                  className="mt-1"
                />
                <FieldMsg text={fieldError(error, "pricePerKg")} />
              </div>
            )}
            {modes.includes("piece") && (
              <>
                <div>
                  <Label htmlFor="piece-price">Price / piece</Label>
                  <Input
                    id="piece-price"
                    type="number"
                    value={pricePerPiece}
                    onChange={(e) => setPricePerPiece(e.target.value)}
                    className="mt-1"
                  />
                  <FieldMsg text={fieldError(error, "pricePerPiece")} />
                </div>
                <div>
                  <Label htmlFor="piece-weight">Configured weight / piece (KG)</Label>
                  <Input
                    id="piece-weight"
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={pieceWeightKg}
                    onChange={(e) => setPieceWeightKg(e.target.value)}
                    className="mt-1"
                  />
                  <FieldMsg text={fieldError(error, "pieceWeightKg")} />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="ckg">Cost / KG</Label>
              <Input
                id="ckg"
                type="number"
                value={costPerKg}
                onChange={(e) => setCostPerKg(e.target.value)}
                className="mt-1"
              />
              <FieldMsg text={fieldError(error, "costPerKg")} />
            </div>
            <div>
              <Label htmlFor="rl">Reorder level</Label>
              <Input
                id="rl"
                type="number"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                className="mt-1"
              />
              <FieldMsg text={fieldError(error, "reorderLevel")} />
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={mutation.isPending || product?.baseUnit === "PIECE"}>
            {mutation.isPending ? "Saving…" : product ? "Save Changes" : "Create Product"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const categories = useCategoryList();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const mutation = editingId ? updateCategory : createCategory;

  function save() {
    if (!name.trim()) return;
    const input = { name: name.trim() };
    if (editingId) {
      updateCategory.mutate(
        { categoryId: editingId, patch: input },
        {
          onSuccess: () => {
            toast.success("Category updated");
            resetForm();
          },
        },
      );
    } else {
      createCategory.mutate(input, {
        onSuccess: () => {
          toast.success("Category created");
          resetForm();
        },
      });
    }
  }

  function resetForm() {
    setEditingId(null);
    setName("");
  }

  function edit(category: Category) {
    setEditingId(category.id);
    setName(category.name);
  }

  function remove(category: Category) {
    deleteCategory.mutate(category.id, {
      // In-use failures (products still attached) come back as API errors — show them.
      onSuccess: () => toast.success(`${category.name} deleted`),
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="cn">Name</Label>
            <Input
              id="cn"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              placeholder={editingId ? "Rename category" : "New category name"}
            />
          </div>
          {mutation.error && (
            <div className="text-sm">
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
                {mutation.error.message}
              </p>
              <FieldMsg text={fieldError(mutation.error, "name")} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={resetForm}>
              {editingId ? "Cancel edit" : "Clear"}
            </Button>
            <Button onClick={save} disabled={!name.trim() || mutation.isPending}>
              {mutation.isPending ? "Saving…" : editingId ? "Save Changes" : "Create"}
            </Button>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Existing
            </p>
            {categories.isPending && <Skeleton className="h-10 w-full rounded-lg" />}
            {categories.isError && (
              <p className="text-sm text-destructive">
                Categories did not load: {categories.error.message}
              </p>
            )}
            {categories.isSuccess && categories.data.length === 0 && (
              <p className="text-sm text-muted-foreground">No categories yet.</p>
            )}
            {categories.isSuccess && categories.data.length > 0 && (
              <div className="space-y-1.5">
                {categories.data.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <ProductImage name={c.name} className="h-7 w-7 rounded" />
                      {c.name}
                    </span>
                    <span className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => edit(c)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive"
                        disabled={deleteCategory.isPending}
                        onClick={() => remove(c)}
                      >
                        Delete
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldMsg({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return <p className="mt-1 text-xs font-medium text-destructive">{text}</p>;
}

function RetryPanel({
  message,
  detail,
  retrying,
  onRetry,
}: {
  message: string;
  detail?: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      <span className="text-4xl">⚠️</span>
      <p className="mt-3 font-semibold">{message}</p>
      {detail && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>}
      <Button variant="outline" className="mt-3" disabled={retrying} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
