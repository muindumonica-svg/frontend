import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { landingPathFor, useActiveBranchId, usePermissions, useSession } from "@/api/hooks/auth";
import { useCategoryList, useProductList } from "@/api/hooks/catalog";
import {
  useCustomer,
  useCustomerLoyalty,
  useCustomerSearch,
  useSettings,
} from "@/api/hooks/directory";
import { QueryKeys } from "@/api/hooks/keys";
import { useCurrentShift } from "@/api/hooks/shifts";
import {
  PAYMENT_POLL_INTERVAL_MS,
  PAYMENT_POLL_MAX_TRIES,
  useCardPayment,
  useCashPayment,
  useExpirePayment,
  useLoyaltyPayment,
  usePayment,
  usePaybillPayment,
  useStkPayment,
} from "@/api/hooks/payments";
import {
  useAddSaleItem,
  useCancelSale,
  useCreateReturn,
  useCreateSaleDraft,
  useDeleteSaleDraft,
  useApproveInventoryOverdraft,
  useCreateAndAttachCustomer,
  useReceipt,
  useSale,
  useSaleList,
  useUpdateSaleDraft,
} from "@/api/hooks/sales";
import { Cart, warnIfShort } from "@/components/pos/cart";
import { SellModeDialog } from "@/components/pos/sell-mode-dialog";
import { ProductImage } from "@/components/product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { fmtDateTime, fmtKg, posMoney as money, posUnitPriceLabel, round2 } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/types/api";
import type {
  AddSaleItemInput,
  Customer,
  Payment,
  PaymentMethod,
  Product,
  RefundPaymentMethod,
  Sale,
  SaleReturnInput,
} from "@/types/api";

export const Route = createFileRoute("/_app/pos")({
  component: PosScreen,
});

function PosScreen() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const session = useSession();
  const permissions = usePermissions();
  const branchId = useActiveBranchId();
  const activeShift = useCurrentShift(session.data?.user.id ?? null, branchId ? { branchId } : {});

  const [draftId, setDraftId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [selected, setSelected] = useState<Product | null>(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [collectId, setCollectId] = useState<string | null>(null);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [cartCollapsed, setCartCollapsed] = useState(
    () =>
      typeof window !== "undefined" && Boolean(window.matchMedia?.("(max-width: 1023px)").matches),
  );

  // The nav already hides the POS, but a direct URL needs the session's own grant.
  useEffect(() => {
    if (!session.isSuccess || session.data.permissions.includes("pos")) return;
    const target = landingPathFor(session.data);
    if (target !== "/pos") navigate({ to: target, replace: true });
  }, [session.isSuccess, session.data, navigate]);

  const draft = useSale(draftId);
  const sale = draft.data ?? null;
  // Strict optional props: a filter is absent, never explicitly `undefined`.
  const products = useProductList(branchId ? { branchId, activeOnly: true } : { activeOnly: true });
  const categories = useCategoryList();
  const drafts = useSaleList(branchId ? { status: "DRAFT", branchId } : { status: "DRAFT" });
  // A cash part-payment moves the sale out of `DRAFT`, so the held list needs both.
  const partPaid = useSaleList(
    branchId ? { status: "PARTIALLY_PAID", branchId } : { status: "PARTIALLY_PAID" },
  );
  const onlineOrders = useSaleList(
    branchId
      ? { status: "PENDING_PAYMENT", channel: "ONLINE", branchId }
      : { status: "PENDING_PAYMENT", channel: "ONLINE" },
  );
  const heldList = useMemo(
    () => [
      ...(drafts.data?.items ?? []),
      ...(partPaid.data?.items ?? []),
      ...(onlineOrders.data?.items ?? []),
    ],
    [drafts.data, partPaid.data, onlineOrders.data],
  );
  const heldBusy = drafts.isPending || partPaid.isPending || onlineOrders.isPending;
  const heldFailed = drafts.isError || partPaid.isError || onlineOrders.isError;

  const createDraft = useCreateSaleDraft();
  const addItem = useAddSaleItem(draftId ?? "");
  const deleteDraft = useDeleteSaleDraft();

  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (products.data ?? []).filter(
      (product) =>
        product.baseUnit === "KG" &&
        product.sellingModes.length > 0 &&
        (activeCat === "all" || product.categoryId === activeCat) &&
        (term === "" ||
          product.name.toLowerCase().includes(term) ||
          product.sku.toLowerCase().includes(term)),
    );
  }, [products.data, query, activeCat]);

  /**
   * The first tap of a sale creates the draft *and* its line in one request, so
   * there is never a moment where the till holds an id that only exists locally.
   */
  function addLine(input: AddSaleItemInput) {
    if (!branchId) {
      toast.error("Pick a branch in the sidebar before selling.");
      return;
    }

    if (createDraft.isPending || addItem.isPending) {
      toast.info("The till is writing the previous line — add that one again.");
      return;
    }

    if (!draftId) {
      createDraft.mutate(
        { branchId, items: [input] },
        { onSuccess: (created) => setDraftId(created.id) },
      );
      return;
    }

    addItem.mutate(input, {
      onSuccess: (result) => warnIfShort(result.availableQty, result.item),
    });
  }

  /** A held sale is an ordinary server draft: the till only stops editing it. */
  const finish = useCallback(
    (completedSaleId: string) => {
      setDraftId(null);
      setCheckoutOpen(false);
      setCollectId(null);
      setCompletedId(completedSaleId);
      // Sale writes invalidate balances, not the product grid the tiles read.
      client.invalidateQueries({ queryKey: QueryKeys.productsRoot });
    },
    [client],
  );

  if (completedId) {
    return <ReceiptPanel saleId={completedId} onNewSale={() => setCompletedId(null)} />;
  }

  if (session.isSuccess && permissions.includes("pos")) {
    if (activeShift.isPending) {
      return (
        <div className="p-6">
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      );
    }

    if (activeShift.isError || !branchId || !activeShift.data) {
      const canOpenShift = permissions.includes("cashier");
      return (
        <div className="flex min-h-dvh items-center justify-center bg-background px-5">
          <div className="w-full max-w-md rounded-xl border p-6 text-center">
            <p className="font-display text-xl font-bold">POS ACCESS REQUIRED</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {activeShift.isError
                ? `Shift access could not be verified: ${activeShift.error.message}`
                : !branchId
                  ? "Select your assigned branch before starting a POS session."
                  : "No active shift is assigned to your account. Contact your administrator or open an authorized shift."}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              {canOpenShift && branchId && (
                <Button onClick={() => navigate({ to: "/cashier" })}>Open shift</Button>
              )}
              <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
                Return to dashboard
              </Button>
              {activeShift.isError && (
                <Button variant="outline" onClick={() => void activeShift.refetch()}>
                  Retry
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }
  }

  if (collectId) {
    return <Checkout saleId={collectId} onClose={() => setCollectId(null)} onCompleted={finish} />;
  }

  if (checkoutOpen && sale) {
    return (
      <Checkout saleId={sale.id} onClose={() => setCheckoutOpen(false)} onCompleted={finish} />
    );
  }

  return (
    <div className="pos-theme pos-screen flex h-[calc(100dvh-3.75rem)] min-h-0 flex-col overflow-hidden lg:h-dvh lg:flex-row">
      {/* LEFT — categories */}
      <aside className="hidden w-48 shrink-0 flex-col border-r border-pos-border bg-pos-surface lg:flex">
        <div className="border-b border-pos-border px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-pos-muted-foreground">
            Categories
          </p>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          <CategoryButton
            label="All"
            productName="Chicken"
            active={activeCat === "all"}
            onClick={() => setActiveCat("all")}
          />
          {categories.isPending && <Skeleton className="h-9 w-full rounded-lg" />}
          {categories.data?.map((category) => (
            <CategoryButton
              key={category.id}
              label={category.name}
              productName={category.name}
              active={activeCat === category.id}
              onClick={() => setActiveCat(category.id)}
            />
          ))}
        </div>
      </aside>

      {/* CENTER — product grid */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-b border-pos-border px-4 py-3">
          {!branchId && (
            <p className="mb-2 rounded-lg border border-brand/40 bg-brand-soft px-3 py-2 text-xs font-semibold text-brand-deep">
              No branch is active for this session — choose one in the sidebar to start selling.
            </p>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pos-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search products by name or SKU…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-12 border-pos-border bg-pos-surface pl-10 text-pos-foreground placeholder:text-pos-muted-foreground"
            />
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar lg:hidden">
            <CatChip
              label="All"
              productName="Chicken"
              active={activeCat === "all"}
              onClick={() => setActiveCat("all")}
            />
            {categories.data?.map((category) => (
              <CatChip
                key={category.id}
                label={category.name}
                productName={category.name}
                active={activeCat === category.id}
                onClick={() => setActiveCat(category.id)}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {products.isPending && (
            <div className="pos-product-grid grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 10 }, (_, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-pos-border bg-pos-surface p-3"
                >
                  <Skeleton className="h-20 w-full rounded-xl bg-pos-surface-2" />
                  <Skeleton className="mt-2 h-4 w-3/4 bg-pos-surface-2" />
                  <Skeleton className="mt-2 h-3 w-1/2 bg-pos-surface-2" />
                </div>
              ))}
            </div>
          )}

          {products.isError && (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <span className="text-4xl">⚠️</span>
              <p className="mt-3 text-sm font-semibold text-pos-foreground">
                The product list did not load
              </p>
              <p className="mt-1 max-w-xs text-xs text-pos-muted-foreground">
                {products.error.message}
              </p>
              <Button
                variant="outline"
                className="mt-3 h-10 border-pos-border text-pos-foreground hover:bg-pos-surface-2"
                disabled={products.isFetching}
                onClick={() => void products.refetch()}
              >
                Try again
              </Button>
            </div>
          )}

          {products.isSuccess && visibleProducts.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="text-4xl">🔍</span>
              <p className="mt-3 text-sm font-semibold text-pos-foreground">No products found</p>
              <p className="mt-1 text-xs text-pos-muted-foreground">
                {products.data?.length
                  ? "Try another search or category."
                  : "This branch has no active products yet."}
              </p>
            </div>
          )}

          {products.isSuccess && visibleProducts.length > 0 && (
            <div className="pos-product-grid grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleProducts.map((product) => {
                const stock = Math.max(0, product.balance ?? 0);
                const out = stock <= 0;
                const kgPrice = product.pricePerKg ?? 0;
                return (
                  <button
                    key={product.id}
                    onClick={() => setSelected(product)}
                    className={`group flex flex-col rounded-2xl border bg-pos-surface p-3 text-left transition-all hover:border-brand hover:shadow-elegant active:scale-[0.97] ${out ? "border-destructive/40" : ""}`}
                  >
                    <ProductImage
                      name={product.name}
                      productId={product.id}
                      sku={product.sku}
                      categoryName={
                        categories.data?.find((category) => category.id === product.categoryId)
                          ?.name
                      }
                      imageKey={product.imageKey}
                      className="h-20 w-full rounded-xl bg-pos-surface-2"
                    />
                    <p className="mt-2 truncate text-sm font-bold text-pos-foreground">
                      {product.name}
                    </p>
                    <p className="text-[11px] text-pos-muted-foreground">
                      {kgPrice > 0 && `${money(kgPrice)}/KG`}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span
                        className={`text-[11px] font-semibold ${out ? "text-destructive" : "text-pos-muted-foreground"}`}
                      >
                        {out
                          ? "Out of stock"
                          : product.baseUnit === "KG"
                            ? fmtKg(stock)
                            : `${round2(stock)} pcs`}
                      </span>
                      <span className="flex gap-1">
                        {product.sellingModes.includes("weight") && (
                          <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                            KG
                          </Badge>
                        )}
                        {product.sellingModes.includes("amount") && (
                          <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                            KSh
                          </Badge>
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — cart */}
      <div
        className={`pos-cart-panel w-full shrink-0 border-t border-pos-border bg-pos-surface pb-[env(safe-area-inset-bottom)] ${
          cartCollapsed ? "h-auto" : "h-[48dvh] max-h-[28rem]"
        } lg:h-full lg:w-96 lg:border-l lg:border-t-0 lg:pb-0`}
      >
        <Cart
          sale={sale}
          collapsed={cartCollapsed}
          onToggleCollapsed={() => setCartCollapsed((value) => !value)}
          canDiscount={permissions.includes("pos_discount")}
          heldCount={heldList.length}
          onCheckout={() => setCheckoutOpen(true)}
          onOpenHeld={() => setHeldOpen(true)}
          onOpenReturns={() => setReturnsOpen(true)}
        />
      </div>

      <SellModeDialog
        product={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        onAdd={addLine}
      />

      {heldOpen && (
        <HeldDialog
          sales={heldList}
          loading={heldBusy}
          failed={heldFailed}
          currentId={draftId}
          onResume={(id) => {
            setDraftId(id);
            setHeldOpen(false);
          }}
          onCollect={(id) => {
            setHeldOpen(false);
            setCollectId(id);
          }}
          onDiscard={(id) => deleteDraft.mutate(id)}
          onRetry={() => {
            void drafts.refetch();
            void partPaid.refetch();
            void onlineOrders.refetch();
          }}
          onClose={() => setHeldOpen(false)}
        />
      )}

      {returnsOpen && branchId && (
        <ReturnsDialog
          branchId={branchId}
          canVoid={permissions.includes("pos_void")}
          onClose={() => setReturnsOpen(false)}
        />
      )}
    </div>
  );
}

function CategoryButton({
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
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-brand text-pos-foreground"
          : "text-pos-muted-foreground hover:bg-pos-surface-2 hover:text-pos-foreground"
      }`}
    >
      <ProductImage name={productName} className="h-7 w-7 shrink-0 rounded-md bg-pos-surface-2" />
      {label}
    </button>
  );
}

function CatChip({
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
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-brand bg-brand text-pos-foreground"
          : "border-pos-border bg-pos-surface text-pos-muted-foreground"
      }`}
    >
      <ProductImage name={productName} className="mr-1 inline-flex h-4 w-4 rounded-sm bg-pos-surface-2" />
      {label}
    </button>
  );
}

// ===================== HELD (SUSPENDED) SALES =====================

function HeldDialog({
  sales,
  loading,
  failed,
  currentId,
  onResume,
  onCollect,
  onDiscard,
  onRetry,
  onClose,
}: {
  sales: Sale[];
  loading: boolean;
  failed: boolean;
  currentId: string | null;
  onResume: (saleId: string) => void;
  onCollect: (saleId: string) => void;
  onDiscard: (saleId: string) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card text-foreground"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-display text-lg font-bold">Held sales &amp; online orders</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {loading && <Skeleton className="h-16 w-full rounded-xl" />}
          {failed && (
            <Button variant="outline" className="h-11 w-full" onClick={onRetry}>
              Could not load held sales — try again
            </Button>
          )}
          {!loading && !failed && sales.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing on hold.</p>
          )}
          {sales.map((draft) => (
            <HeldRow
              key={draft.id}
              sale={draft}
              active={draft.id === currentId}
              onResume={() => onResume(draft.id)}
              onCollect={() => onCollect(draft.id)}
              onDiscard={() => onDiscard(draft.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function HeldRow({
  sale,
  active,
  onResume,
  onCollect,
  onDiscard,
}: {
  sale: Sale;
  active: boolean;
  onResume: () => void;
  onCollect: () => void;
  onDiscard: () => void;
}) {
  const online = sale.channel === "ONLINE";

  return (
    <div
      className={`rounded-xl border p-3 ${active ? "border-brand bg-brand-soft" : "border-border"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{sale.receiptNo ?? "Draft"}</p>
            {online && (
              <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                ONLINE
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {sale.items.length} {sale.items.length === 1 ? "line" : "lines"} · {money(sale.total)} ·{" "}
            {fmtDateTime(sale.createdAt)}
          </p>
        </div>
        <p className="font-display text-sm font-bold">{money(sale.total)}</p>
      </div>
      {online ? (
        <Button size="sm" className="mt-2 h-9 w-full" onClick={onCollect}>
          Collect payment
        </Button>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button size="sm" className="h-9" disabled={active} onClick={onResume}>
            {active ? "On the till" : "Resume"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-destructive"
            onClick={() => window.confirm("Discard this held sale?") && onDiscard()}
          >
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}

// ===================== RETURNS =====================

function ReturnsDialog({
  branchId,
  canVoid,
  onClose,
}: {
  branchId: string;
  canVoid: boolean;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const term = search.trim();
  const sales = useSaleList(
    term ? { status: "COMPLETED", branchId, q: term } : { status: "COMPLETED", branchId },
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card text-foreground"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-display text-lg font-bold">
            {pickedId ? "Return items" : "Returns"}
          </h2>
          <button
            onClick={() => (pickedId ? setPickedId(null) : onClose())}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          >
            {pickedId ? "←" : "✕"}
          </button>
        </div>

        {pickedId ? (
          <ReturnPanel saleId={pickedId} canVoid={canVoid} onDone={onClose} />
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <Input
              autoFocus
              placeholder="Search receipt no, customer name or phone…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11"
            />
            <div className="mt-3 space-y-2">
              {sales.isPending && <Skeleton className="h-14 w-full rounded-xl" />}
              {sales.isError && (
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  disabled={sales.isFetching}
                  onClick={() => void sales.refetch()}
                >
                  Could not load completed sales — try again
                </Button>
              )}
              {sales.isSuccess && sales.data.items.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No completed sales match that search.
                </p>
              )}
              {sales.data?.items.map((sale) => (
                <button
                  key={sale.id}
                  onClick={() => setPickedId(sale.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {sale.receiptNo ?? sale.id}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {fmtDateTime(sale.completedAt ?? sale.createdAt)} · {sale.items.length} lines
                    </span>
                  </span>
                  <span className="font-display text-sm font-bold">{money(sale.total)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReturnPanel({
  saleId,
  canVoid,
  onDone,
}: {
  saleId: string;
  canVoid: boolean;
  onDone: () => void;
}) {
  const sale = useSale(saleId);

  if (!sale.data) {
    return (
      <div className="p-4">
        {sale.isError ? (
          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={sale.isFetching}
            onClick={() => void sale.refetch()}
          >
            Could not load that sale — try again
          </Button>
        ) : (
          <Skeleton className="h-40 w-full rounded-xl" />
        )}
      </div>
    );
  }

  return <ReturnForm sale={sale.data} canVoid={canVoid} onDone={onDone} />;
}

function ReturnForm({
  sale,
  canVoid,
  onDone,
}: {
  sale: Sale;
  canVoid: boolean;
  onDone: () => void;
}) {
  const createReturn = useCreateReturn();
  const voidSale = useCancelSale();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<RefundPaymentMethod>("CASH");

  const lines = sale.items
    .filter((item) => (parseFloat(quantities[item.id] ?? "") || 0) > 0)
    .map((item) => ({ item, qty: parseFloat(quantities[item.id] ?? "") }));
  // The till prices the refund; this is only the cashier's preview.
  const estimatedRefund = round2(
    lines.reduce((sum, { item, qty }) => sum + qty * item.unitPrice, 0),
  );

  function submit() {
    if (lines.length === 0) return;
    const trimmed = reason.trim();
    const input: SaleReturnInput = {
      refundMethod,
      items: lines.map(({ item, qty }) => ({
        productId: item.productId,
        reason: trimmed,
        ...(item.mode === "piece" ? { pieces: Math.round(qty) } : { qtyKg: round2(qty) }),
      })),
    };
    createReturn.mutate(
      { saleId: sale.id, ...input },
      {
        onSuccess: (returned) => {
          toast.success(`${returned.ref} recorded — ${money(returned.total)} refunded.`);
          onDone();
        },
      },
    );
  }

  function voidWholeSale() {
    if (!window.confirm(`Void ${sale.receiptNo ?? "this sale"} entirely? Stock is restocked.`))
      return;
    voidSale.mutate(sale.id, {
      onSuccess: (voided) => {
        toast.success(`${voided.receiptNo ?? "Sale"} voided.`);
        onDone();
      },
    });
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      <p className="text-xs text-muted-foreground">
        {sale.receiptNo ?? sale.id} · {money(sale.total)} · {sale.userName ?? "Cashier"}
      </p>

      {sale.items.map((item) => {
        const isPiece = item.mode === "piece";
        const max = isPiece ? (item.pieces ?? 0) : (item.qtyKg ?? 0);
        return (
          <div key={item.id} className="flex items-center gap-2 rounded-xl border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <ProductImage
                    name={item.productName}
                    productId={item.productId}
                    className="h-8 w-8 shrink-0 rounded-md"
                  />
                  {item.productName}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {item.qtyLabel} @ {posUnitPriceLabel(item.unitPriceLabel)} · up to{" "}
                {isPiece ? `${max} pcs` : fmtKg(max)}
              </p>
            </div>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={quantities[item.id] ?? ""}
              onChange={(event) =>
                setQuantities((previous) => ({ ...previous, [item.id]: event.target.value }))
              }
              className="h-10 w-24 text-center text-sm"
              aria-label={`Quantity to return for ${item.productName}`}
            />
          </div>
        );
      })}

      <Input
        placeholder="Reason for the return"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="h-11"
      />

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Refund method
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["CASH", "STK", "CARD"] as RefundPaymentMethod[]).map((method) => (
            <Button
              key={method}
              variant={refundMethod === method ? "default" : "outline"}
              size="sm"
              className="h-10"
              onClick={() => setRefundMethod(method)}
            >
              {PAYMENT_METHOD_LABELS[method]}
            </Button>
          ))}
        </div>
      </div>

      <Button
        className="h-12 w-full font-bold"
        disabled={lines.length === 0 || createReturn.isPending}
        onClick={submit}
      >
        {lines.length === 0
          ? "Enter a quantity to return"
          : `RETURN (est. ${money(estimatedRefund)})`}
      </Button>

      {canVoid && (
        <Button
          variant="outline"
          className="h-11 w-full text-destructive"
          disabled={voidSale.isPending}
          onClick={voidWholeSale}
        >
          Void the whole sale instead
        </Button>
      )}
    </div>
  );
}

// ===================== CHECKOUT =====================

interface CheckoutProps {
  saleId: string;
  onClose: () => void;
  onCompleted: (saleId: string) => void;
}

function Checkout({ saleId, onClose, onCompleted }: CheckoutProps) {
  const sale = useSale(saleId).data;
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [splitCashRaw, setSplitCashRaw] = useState("");
  const [splitCashTenderedRaw, setSplitCashTenderedRaw] = useState("");
  const [splitCardRaw, setSplitCardRaw] = useState("");
  const [splitCardLast4, setSplitCardLast4] = useState("");
  const [splitStkRaw, setSplitStkRaw] = useState("");
  const [splitPaybillRaw, setSplitPaybillRaw] = useState("");
  const [splitLoyaltyPointsRaw, setSplitLoyaltyPointsRaw] = useState("");
  const [splitPhone, setSplitPhone] = useState("");
  const [partRaw, setPartRaw] = useState("");
  const [loyaltyPointsRaw, setLoyaltyPointsRaw] = useState("");
  const [tendered, setTendered] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [phone, setPhone] = useState("");
  const [promptId, setPromptId] = useState<string | null>(null);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [cardUnavailable, setCardUnavailable] = useState(false);
  const [mpesaUnavailable, setMpesaUnavailable] = useState(false);
  const [stockBlocked, setStockBlocked] = useState<string | null>(null);
  const [overdraftApprovalRequired, setOverdraftApprovalRequired] = useState(false);
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [registerCustomer, setRegisterCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  const cash = useCashPayment(saleId);
  const paybill = usePaybillPayment(saleId);
  const card = useCardPayment(saleId);
  const stk = useStkPayment(saleId);
  const loyaltyPayment = useLoyaltyPayment(saleId);
  const expire = useExpirePayment();
  const updateDraft = useUpdateSaleDraft(saleId);
  const approveOverdraft = useApproveInventoryOverdraft(saleId);
  const createCustomer = useCreateAndAttachCustomer(saleId);
  const customerMatches = useCustomerSearch(customerSearch);
  const selectedCustomer = useCustomer(sale?.customerId ?? null);
  const settings = useSettings();
  const customerLoyalty = useCustomerLoyalty(
    sale?.customerId ?? null,
    Boolean(settings.data?.loyalty.redemptionEnabled),
  );
  const prompt = usePayment(promptId, { saleId });

  const total = sale?.total ?? 0;
  const paid = sale?.paidAmount ?? 0;
  const balance = sale?.balance ?? 0;
  const pendingAmount = round2(
    (sale?.payments ?? [])
      .filter((payment) => payment.status === "PENDING" && payment.method !== "LOYALTY")
      .reduce((sum, payment) => sum + payment.amount, 0),
  );
  const pendingLoyaltyAmount = round2(
    (sale?.payments ?? [])
      .filter((payment) => payment.status === "PENDING" && payment.method === "LOYALTY")
      .reduce((sum, payment) => sum + payment.amount, 0),
  );
  const loyaltyConfig = settings.data?.loyalty;
  const pointValue = loyaltyConfig?.pointValue ?? 0;
  const loyaltyBalance =
    customerLoyalty.data?.availablePoints ?? customerLoyalty.data?.balance ?? 0;
  const loyaltyPoints = Number(loyaltyPointsRaw) || 0;
  const loyaltyAmount = round2(loyaltyPoints * pointValue);
  const splitLoyaltyPoints = Number(splitLoyaltyPointsRaw) || 0;
  const splitLoyaltyAmount = round2(splitLoyaltyPoints * pointValue);
  const splitAllocated = round2(
    (parseFloat(splitCashRaw) || 0) +
      (parseFloat(splitCardRaw) || 0) +
      (parseFloat(splitStkRaw) || 0) +
      (parseFloat(splitPaybillRaw) || 0) +
      splitLoyaltyAmount,
  );
  /** Empty field means "whatever is still owing" — the default for a single payment. */
  const part = partRaw.trim() === "" ? balance : round2(parseFloat(partRaw) || 0);
  const received = round2(parseFloat(tendered) || 0);
  const estimatedChange = received >= part ? round2(received - part) : 0;

  // Re-renders come from the 3s poll, so elapsed time is the only available read of
  // how many tries `usePayment` has left before it stops on its own.
  const tries =
    pollStartedAt === null
      ? 0
      : Math.min(
          PAYMENT_POLL_MAX_TRIES,
          Math.floor((Date.now() - pollStartedAt) / PAYMENT_POLL_INTERVAL_MS),
        );
  const exhausted = prompt.data?.status === "PENDING" && tries >= PAYMENT_POLL_MAX_TRIES;
  const busy =
    cash.isPending ||
    paybill.isPending ||
    card.isPending ||
    stk.isPending ||
    loyaltyPayment.isPending ||
    approveOverdraft.isPending ||
    expire.isPending;

  useEffect(() => {
    if (sale?.status === "COMPLETED") onCompleted(sale.id);
  }, [sale?.status, sale?.id, onCompleted]);

  useEffect(() => {
    const payment = prompt.data;
    if (!payment || payment.status === "PENDING") return;
    setPromptId(null);
    setPollStartedAt(null);
    setMethod(null);
    if (payment.status === "FAILED") {
      toast.error(payment.providerResultDesc ?? "The payment request failed at the provider.");
    }
    if (payment.status === "EXPIRED") toast.warning(`${payment.ref} expired without a response.`);
  }, [prompt.data]);

  if (!sale) return null;

  /** `AMOUNT_EXCEEDS_BALANCE` is a server rejection; the till refuses the keystroke first. */
  function amountAllowed(): boolean {
    if (part <= 0) {
      toast.error("Enter an amount above zero.");
      return false;
    }
    if (sale?.channel === "POS" && !Number.isInteger(part)) {
      toast.error("Staff POS payment amounts must be whole KSh values.");
      return false;
    }
    if (part > balance + 0.01) {
      toast.error(`Only ${money(balance)} is still owing.`);
      return false;
    }
    return true;
  }

  /** Server-side normalisation is authoritative; this only saves a wasted 422. */
  function sendPrompt() {
    if (!amountAllowed()) return;
    const onSent = (payment: Payment) => {
      setPromptId(payment.id);
      setPollStartedAt(Date.now());
    };

    const digits = phone.replace(/\D/g, "");
    if (!/^(?:254|0)?[17]\d{8}$/.test(digits)) {
      toast.error("Enter a valid Kenyan number, e.g. 0712 345 678");
      return;
    }
    stk.mutate(
      { phone: digits, amount: part },
      {
        onError: (error) => {
          if (error instanceof ApiError && error.code === "MPESA_NOT_CONFIGURED")
            setMpesaUnavailable(true);
          else noteStockBlock(error);
        },
        onSuccess: onSent,
      },
    );
  }

  function payCash() {
    if (!amountAllowed() || received < part) return;
    if (sale?.channel === "POS" && !Number.isInteger(received)) {
      toast.error("Cash received must be a whole KSh value.");
      return;
    }
    cash.mutate(
      { amount: part, tendered: received },
      {
        onError: (error) => noteStockBlock(error),
        onSuccess: () => {
          setMethod(null);
          setPartRaw("");
          setTendered("");
        },
      },
    );
  }

  function payCard() {
    if (cardLast4.length !== 4 || !amountAllowed()) return;
    card.mutate(
      { amount: part, last4: cardLast4 },
      {
        onError: (error) => {
          // The gateway is a server switch — the till reflects it instead of faking approval.
          if (error instanceof ApiError && error.code === "CARD_NOT_CONFIGURED")
            setCardUnavailable(true);
          else noteStockBlock(error);
        },
        onSuccess: () => {
          setMethod(null);
          setPartRaw("");
          setCardLast4("");
        },
      },
    );
  }

  function payPaybill() {
    if (!amountAllowed()) return;
    paybill.mutate(
      { amount: part },
      {
        onError: (error) => noteStockBlock(error),
        onSuccess: () => {
          toast.success("PayBill payment recorded and applied to the sale.");
          setMethod(null);
          setPartRaw("");
        },
      },
    );
  }

  function payLoyalty() {
    if (
      !sale?.customerId ||
      !loyaltyConfig?.redemptionEnabled ||
      pointValue <= 0
    ) {
      toast.error("Select a registered customer and enable Pay with Points first.");
      return;
    }
    if (!Number.isInteger(loyaltyPoints) || loyaltyPoints < 1 || loyaltyPoints > loyaltyBalance) {
      toast.error(`Enter between 1 and ${loyaltyBalance} points.`);
      return;
    }
    if (!Number.isInteger(loyaltyAmount)) {
      toast.error("Choose a point amount that converts to a whole KSh value.");
      return;
    }
    if (loyaltyAmount > balance + 0.01) {
      toast.error(`The sale balance is only ${money(balance)}.`);
      return;
    }
    loyaltyPayment.mutate(
      { points: loyaltyPoints },
      {
        onError: (error) => noteStockBlock(error),
        onSuccess: () => {
          toast.success("Points applied. They will be deducted when the sale is fully paid.");
          setMethod(null);
          setLoyaltyPointsRaw("");
        },
      },
    );
  }

  async function submitSplit() {
    const cashAmount = round2(parseFloat(splitCashRaw) || 0);
    const cardAmount = round2(parseFloat(splitCardRaw) || 0);
    const stkAmount = round2(parseFloat(splitStkRaw) || 0);
    const paybillAmount = round2(parseFloat(splitPaybillRaw) || 0);
    const loyaltyAmount = splitLoyaltyAmount;
    const totalParts = round2(cashAmount + cardAmount + stkAmount + paybillAmount + loyaltyAmount);
    if (
      [cashAmount, cardAmount, stkAmount, paybillAmount].some((value) => !Number.isInteger(value))
    ) {
      toast.error("Each checkout portion must be a whole KSh value.");
      return;
    }
    if (
      cashAmount < 0 ||
      cardAmount < 0 ||
      stkAmount < 0 ||
      paybillAmount < 0 ||
      loyaltyAmount < 0 ||
      totalParts <= 0 ||
      totalParts > balance + 0.01
    ) {
      toast.error(
        `Allocate a positive amount no greater than the remaining balance of ${money(balance)}.`,
      );
      return;
    }
    if (splitLoyaltyPoints > 0) {
      if (
        !sale?.customerId ||
        !loyaltyConfig?.redemptionEnabled ||
        pointValue <= 0
      ) {
        toast.error("Select a registered customer and enable Pay with Points first.");
        return;
      }
      if (
        !Number.isInteger(splitLoyaltyPoints) ||
        splitLoyaltyPoints < 1 ||
        splitLoyaltyPoints > loyaltyBalance
      ) {
        toast.error(`Enter between 1 and ${loyaltyBalance} points.`);
        return;
      }
      if (!Number.isInteger(loyaltyAmount)) {
        toast.error("Choose a point amount that converts to a whole KSh value.");
        return;
      }
    }
    const cashTender = round2(parseFloat(splitCashTenderedRaw) || cashAmount);
    if (cashAmount > 0 && cashTender < cashAmount) {
      toast.error("Cash received must cover the cash portion.");
      return;
    }
    if (cashAmount > 0 && !Number.isInteger(cashTender)) {
      toast.error("Cash received must be a whole KSh value.");
      return;
    }
    if (cardAmount > 0 && splitCardLast4.length !== 4) {
      toast.error("Enter the last four digits for the card portion.");
      return;
    }
    if (cardAmount > 0 && cardUnavailable) {
      toast.error("Card payments are not enabled. Remove the card portion or use another method.");
      return;
    }
    const digits = splitPhone.replace(/\D/g, "");
    if (stkAmount > 0 && !/^(?:254|0)?[17]\d{8}$/.test(digits)) {
      toast.error("Enter a valid Kenyan number for the M-Pesa portion.");
      return;
    }
    if (stkAmount > 0 && mpesaUnavailable) {
      toast.error("M-Pesa is not configured. Remove the M-Pesa portion or use another method.");
      return;
    }

    try {
      if (cashAmount > 0) {
        await cash.mutateAsync({ amount: cashAmount, tendered: cashTender });
        setSplitCashRaw("");
        setSplitCashTenderedRaw("");
      }
      if (cardAmount > 0) {
        await card.mutateAsync({ amount: cardAmount, last4: splitCardLast4 });
        setSplitCardRaw("");
        setSplitCardLast4("");
      }
      if (paybillAmount > 0) {
        await paybill.mutateAsync({ amount: paybillAmount });
        setSplitPaybillRaw("");
      }
      if (splitLoyaltyPoints > 0) {
        await loyaltyPayment.mutateAsync({ points: splitLoyaltyPoints });
        setSplitLoyaltyPointsRaw("");
      }
      if (stkAmount > 0) {
        const payment = await stk.mutateAsync({ phone: digits, amount: stkAmount });
        setSplitStkRaw("");
        setSplitPhone("");
        setSplitMode(false);
        setMethod("STK");
        setPartRaw(String(stkAmount));
        setPromptId(payment.id);
        setPollStartedAt(Date.now());
      } else {
        setSplitMode(false);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "MPESA_NOT_CONFIGURED")
        setMpesaUnavailable(true);
      else if (error instanceof ApiError && error.code === "CARD_NOT_CONFIGURED")
        setCardUnavailable(true);
      else noteStockBlock(error);
      toast.error(
        error instanceof Error ? error.message : "The split payment could not be completed.",
      );
    }
  }

  /** A fully tendered sale can still be refused when the stock commit runs. */
  function noteStockBlock(error: unknown): void {
    if (error instanceof ApiError && error.code === "INSUFFICIENT_STOCK") {
      setStockBlocked(error.message);
    } else if (error instanceof ApiError && error.code === "OVERDRAFT_APPROVAL_REQUIRED") {
      setStockBlocked(error.message);
      setOverdraftApprovalRequired(true);
    }
  }

  function submitOverdraftApproval(): void {
    if (!managerEmail.trim() || !managerPassword || approvalReason.trim().length < 5) {
      toast.error("Enter the manager’s email, password, and an approval reason.");
      return;
    }
    approveOverdraft.mutate(
      {
        managerEmail: managerEmail.trim(),
        managerPassword,
        reason: approvalReason.trim(),
      },
      {
        onSuccess: (approval) => {
          setManagerPassword("");
          setOverdraftApprovalRequired(false);
          setStockBlocked(
            `Manager approval recorded for ${money(approval.approvedValue)} of overdraft. Retry payment.`,
          );
          toast.success("Inventory overdraft approved.");
        },
        onError: (error) => {
          setManagerPassword("");
          toast.error(error.message);
        },
      },
    );
  }

  function expirePrompt() {
    if (!promptId) return;
    // On failure the poll's own status wins, so the panel stays where it is.
    expire.mutate({ paymentId: promptId, saleId }, { onSuccess: () => setPromptId(null) });
  }

  function attachCustomer(customerId: string | null): void {
    updateDraft.mutate(
      { customerId },
      {
        onError: (error) => toast.error(error.message),
        onSuccess: () => setCustomerSearch(""),
      },
    );
  }

  function createAndAttachCustomer(): void {
    const name = newCustomerName.trim();
    if (!name) {
      toast.error("Enter the customer name.");
      return;
    }

    createCustomer.mutate(
      { name, phone: newCustomerPhone.trim() || null },
      {
        onError: (error) => toast.error(error.message),
        onSuccess: (customer: Customer) => {
          setRegisterCustomer(false);
          setNewCustomerName("");
          setNewCustomerPhone("");
          setCustomerSearch("");
          toast.success(`${customer.name} added to this sale.`);
        },
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card text-foreground"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-display text-lg font-bold">Checkout</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          >
            ✕
          </button>
        </div>

        <div className="border-b bg-muted/50 px-4 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sale Total
          </p>
          <p className="font-display text-3xl font-extrabold text-brand-deep">{money(total)}</p>
          {paid > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Paid {money(paid)} · Balance {money(balance)}
            </p>
          )}
          {pendingAmount > 0 && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              Awaiting provider confirmation {money(pendingAmount)} · not included in paid
            </p>
          )}
          {pendingLoyaltyAmount > 0 && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              Pay with Points reserved {money(pendingLoyaltyAmount)} · points are deducted when the
              sale is fully paid
            </p>
          )}
          {sale.status === "PARTIALLY_PAID" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Split payment in progress — take the rest below.
            </p>
          )}
          {sale.change > 0 && (
            <p className="mt-1 text-sm font-semibold text-brand-deep">
              Change to return — {money(sale.change)} (confirmed by the till)
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <section className="mb-3 rounded-xl border p-2.5">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold"
              aria-expanded={customerDetailsOpen}
              aria-controls="checkout-customer-details"
              onClick={() => setCustomerDetailsOpen((open) => !open)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <UserRound className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {sale.customerId
                    ? (selectedCustomer.data?.data?.name ?? "Linked customer")
                    : "Add customer"}
                </span>
                {!sale.customerId &&
                  loyaltyConfig?.redemptionEnabled && (
                    <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
                      needed for points
                    </span>
                  )}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                  customerDetailsOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            <div id="checkout-customer-details" hidden={!customerDetailsOpen} className="pt-2">
              {sale.customerId ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {selectedCustomer.data?.data?.name ?? "Linked customer"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedCustomer.data?.data?.customerNo ?? sale.customerId}
                      {selectedCustomer.data?.data?.phone
                        ? ` · ${selectedCustomer.data.data.phone}`
                        : ""}
                    </p>
                    {selectedCustomer.data?.meta && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Outstanding {money(selectedCustomer.data.meta.outstandingBalance)} · pending{" "}
                        {money(selectedCustomer.data.meta.pendingPaymentAmount)}
                      </p>
                    )}
                    {loyaltyConfig?.redemptionEnabled &&
                      customerLoyalty.isPending && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Loading loyalty points…
                        </p>
                      )}
                    {loyaltyConfig?.redemptionEnabled &&
                      customerLoyalty.isSuccess && (
                        <p className="mt-1 text-xs font-medium text-brand-deep">
                          Available loyalty balance {loyaltyBalance.toLocaleString()} pts ·{" "}
                          {money(round2(loyaltyBalance * pointValue))} value
                        </p>
                      )}
                    {loyaltyConfig?.redemptionEnabled &&
                      customerLoyalty.isError && (
                        <p className="mt-1 text-xs text-destructive">
                          Loyalty balance could not load: {customerLoyalty.error.message}
                        </p>
                      )}
                    {selectedCustomer.isError && (
                      <p className="mt-1 text-xs text-destructive">
                        {selectedCustomer.error.message}
                      </p>
                    )}
                  </div>
                  {sale.status === "DRAFT" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={updateDraft.isPending}
                      onClick={() => attachCustomer(null)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ) : sale.status === "DRAFT" ? (
                <>
                  <label
                    className="mt-2 block text-xs text-muted-foreground"
                    htmlFor="pos-customer-search"
                  >
                    Search by name, phone, email, or customer number
                  </label>
                  <Input
                    id="pos-customer-search"
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="Type at least 2 characters"
                    className="mt-1"
                  />
                  {customerMatches.isError && (
                    <p className="mt-2 text-xs text-destructive">{customerMatches.error.message}</p>
                  )}
                  {customerSearch.trim().length >= 2 && customerMatches.isSuccess && (
                    <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border">
                      {customerMatches.data.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          No matching customers found.
                        </p>
                      ) : (
                        customerMatches.data.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            disabled={updateDraft.isPending || !customer.active}
                            onClick={() => attachCustomer(customer.id)}
                            className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted disabled:opacity-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{customer.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {customer.customerNo} · {customer.phone ?? "No phone"}
                              </span>
                            </span>
                            <span className="text-xs">
                              {customer.active ? "Select" : "Inactive"}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => setRegisterCustomer((open) => !open)}
                  >
                    {registerCustomer ? "Cancel new customer" : "Register new customer"}
                  </Button>
                  {registerCustomer && (
                    <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-3">
                      <Input
                        value={newCustomerName}
                        onChange={(event) => setNewCustomerName(event.target.value)}
                        placeholder="Customer name"
                      />
                      <Input
                        type="tel"
                        value={newCustomerPhone}
                        onChange={(event) => setNewCustomerPhone(event.target.value)}
                        placeholder="Phone (optional)"
                      />
                      <p className="text-xs text-muted-foreground">
                        Check the search matches before creating a new record; similar names are not
                        merged automatically.
                      </p>
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={createCustomer.isPending || updateDraft.isPending}
                        onClick={createAndAttachCustomer}
                      >
                        {createCustomer.isPending || updateDraft.isPending
                          ? "Saving…"
                          : "Create and link customer"}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  This sale has no linked customer. Customer association is locked after checkout
                  starts.
                </p>
              )}
            </div>
          </section>

          {stockBlocked && (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              <p>{stockBlocked}</p>
              {overdraftApprovalRequired && (
                <div className="mt-3 space-y-2 rounded-lg border border-border bg-background p-3 text-foreground">
                  <p className="text-sm font-semibold">Manager approval required</p>
                  <p className="text-xs text-muted-foreground">
                    A different Super Admin or Manager must authorize this overdraft. The manager’s
                    password is checked by the server and is not saved.
                  </p>
                  <Input
                    type="email"
                    autoComplete="username"
                    placeholder="Manager email"
                    value={managerEmail}
                    onChange={(event) => setManagerEmail(event.target.value)}
                    aria-label="Manager email"
                  />
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Manager password"
                    value={managerPassword}
                    onChange={(event) => setManagerPassword(event.target.value)}
                    aria-label="Manager password"
                  />
                  <Input
                    placeholder="Reason for approving this overdraft"
                    value={approvalReason}
                    onChange={(event) => setApprovalReason(event.target.value)}
                    aria-label="Overdraft approval reason"
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={approveOverdraft.isPending}
                    onClick={submitOverdraftApproval}
                  >
                    {approveOverdraft.isPending ? "Verifying…" : "Approve and continue"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {!splitMode && (
            <div className="mb-3">
              <label
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="part-amount"
              >
                This payment
              </label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  id="part-amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  placeholder={String(balance)}
                  value={partRaw}
                  onChange={(event) => setPartRaw(event.target.value)}
                  className="h-10 text-center font-display text-lg font-bold"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 shrink-0"
                  onClick={() => setPartRaw(String(balance))}
                >
                  Full balance
                </Button>
              </div>
            </div>
          )}

          {!method && !splitMode && (
            <div className="mb-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={() => setSplitMode(true)}
              >
                Split payment
              </Button>
            </div>
          )}

          {!method && splitMode && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-bold">Split this balance</p>
                <Button variant="ghost" size="sm" onClick={() => setSplitMode(false)}>
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter one amount per method. You may collect a partial amount; the unpaid balance
                remains due. STK counts only after provider confirmation; PayBill is recorded at
                checkout.
              </p>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Cash portion</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={splitCashRaw}
                  onChange={(event) => setSplitCashRaw(event.target.value)}
                />
              </label>
              {Number(splitCashRaw) > 0 && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Cash received</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={splitCashTenderedRaw}
                    placeholder={splitCashRaw}
                    onChange={(event) => setSplitCashTenderedRaw(event.target.value)}
                  />
                </label>
              )}
              <label className="block text-sm">
                <span className="mb-1 block font-medium">M-Pesa STK portion</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={splitStkRaw}
                  onChange={(event) => setSplitStkRaw(event.target.value)}
                />
              </label>
              {Number(splitStkRaw) > 0 && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Customer phone</span>
                  <Input
                    type="tel"
                    placeholder="0712 345 678"
                    value={splitPhone}
                    onChange={(event) => setSplitPhone(event.target.value)}
                  />
                </label>
              )}
              {mpesaUnavailable && (
                <p className="text-xs text-destructive">M-Pesa STK is not configured.</p>
              )}
              <label className="block text-sm">
                <span className="mb-1 block font-medium">M-Pesa PayBill portion</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={splitPaybillRaw}
                  onChange={(event) => setSplitPaybillRaw(event.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Card portion</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={splitCardRaw}
                  onChange={(event) => setSplitCardRaw(event.target.value)}
                />
              </label>
              {Number(splitCardRaw) > 0 && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Card last four digits</span>
                  <Input
                    inputMode="numeric"
                    maxLength={4}
                    value={splitCardLast4}
                    onChange={(event) => setSplitCardLast4(event.target.value.replace(/\D/g, ""))}
                  />
                </label>
              )}
              {cardUnavailable && (
                <p className="text-xs text-destructive">Card payments are not configured.</p>
              )}
              {loyaltyConfig?.redemptionEnabled &&
                (sale.customerId ? (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">
                      Loyalty points to redeem · available {loyaltyBalance.toLocaleString()} pts
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={splitLoyaltyPointsRaw}
                      onChange={(event) => setSplitLoyaltyPointsRaw(event.target.value)}
                    />
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Value: {money(splitLoyaltyAmount)} · deducted when the sale is fully paid.
                    </span>
                  </label>
                ) : (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    CUSTOMER REQUIRED — link a registered customer to use Pay with Points.
                  </p>
                ))}
              <div className="rounded-lg border bg-background p-3 text-sm">
                <div className="flex justify-between">
                  <span>Sale total</span>
                  <strong>{money(total)}</strong>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Confirmed</span>
                  <span>{money(paid)}</span>
                </div>
                <div className="mt-1 flex justify-between text-amber-700">
                  <span>Pending</span>
                  <span>{money(pendingAmount)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Remaining balance</span>
                  <span>{money(balance)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>New allocations</span>
                  <strong>{money(splitAllocated)}</strong>
                </div>
                <div className="mt-1 flex justify-between text-muted-foreground">
                  <span>Remaining after these allocations</span>
                  <span>{money(round2(Math.max(0, balance - splitAllocated)))}</span>
                </div>
                {splitAllocated > balance && (
                  <p className="mt-2 text-xs font-semibold text-destructive">
                    Overpayment by {money(splitAllocated - balance)}. Reduce the allocation.
                  </p>
                )}
              </div>
              <Button
                className="h-12 w-full font-bold"
                disabled={busy || balance <= 0 || splitAllocated <= 0 || splitAllocated > balance}
                onClick={() => void submitSplit()}
              >
                TAKE SPLIT PAYMENT
              </Button>
            </div>
          )}

          {!method && !splitMode && (
            <div className="grid grid-cols-2 gap-3">
              {(["CASH", "STK", "PAYBILL", "CARD", "LOYALTY"] as PaymentMethod[])
                .filter(
                  (methodOption) =>
                    methodOption !== "LOYALTY" ||
                    loyaltyConfig?.redemptionEnabled,
                )
                .map((methodOption) => (
                  <button
                    key={methodOption}
                    onClick={() => setMethod(methodOption)}
                    disabled={
                      methodOption === "LOYALTY" &&
                      (!sale.customerId ||
                        customerLoyalty.isPending ||
                        customerLoyalty.isError ||
                        loyaltyBalance <= 0)
                    }
                    className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-border bg-muted/30 p-3 transition-colors hover:border-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="text-2xl">
                      {methodOption === "CASH"
                        ? "💵"
                        : methodOption === "STK"
                          ? "📱"
                          : methodOption === "PAYBILL"
                            ? "🏦"
                            : methodOption === "CARD"
                              ? "💳"
                              : "🎁"}
                    </span>
                    <span className="font-display text-sm font-bold">
                      {PAYMENT_METHOD_LABELS[methodOption]}
                    </span>
                  </button>
                ))}
              {loyaltyConfig?.redemptionEnabled &&
                !sale.customerId && (
                  <p className="col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    CUSTOMER REQUIRED — link a registered customer before selecting Pay with Points.
                  </p>
                )}
            </div>
          )}

          {method === "CASH" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold" htmlFor="cash-received">
                  Amount Received
                </label>
                <Input
                  id="cash-received"
                  autoFocus
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  placeholder={String(part)}
                  value={tendered}
                  onChange={(event) => setTendered(event.target.value)}
                  className="mt-1 h-14 text-center font-display text-2xl font-bold"
                />
              </div>
              {received > 0 && (
                <div className="rounded-xl border bg-muted/40 p-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Change to give (estimate)
                  </p>
                  <p className="font-display text-2xl font-bold text-brand-deep">
                    {money(estimatedChange)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    The receipt prints the change the till confirms.
                  </p>
                </div>
              )}
              <Button
                className="h-14 w-full text-base font-bold"
                disabled={busy || received < part || part <= 0}
                onClick={payCash}
              >
                TAKE {money(part)} CASH
              </Button>
            </div>
          )}

          {method === "CARD" &&
            (cardUnavailable ? (
              <NotEnabledPanel
                icon="💳"
                title="Card payments are not enabled"
                detail="The till cannot confirm a card without the gateway. Take cash or M-Pesa instead."
                onBack={() => setMethod(null)}
              />
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold" htmlFor="card-last4">
                    Card Last 4 Digits
                  </label>
                  <Input
                    id="card-last4"
                    autoFocus
                    type="text"
                    maxLength={4}
                    placeholder="1234"
                    value={cardLast4}
                    onChange={(event) => setCardLast4(event.target.value.replace(/\D/g, ""))}
                    className="mt-1 h-14 text-center font-display text-2xl font-bold tracking-[0.3em]"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The payment is only booked once the card gateway approves it.
                </p>
                <Button
                  className="h-14 w-full text-base font-bold"
                  disabled={busy || cardLast4.length !== 4 || part <= 0}
                  onClick={payCard}
                >
                  PAY {money(part)} BY CARD
                </Button>
              </div>
            ))}

          {method === "PAYBILL" && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/40 p-4 text-sm">
                PayBill is recorded against this sale at checkout. C2B verification is not required
                to complete the sale.
              </div>
              <Button
                className="h-12 w-full font-bold"
                disabled={busy || part <= 0}
                onClick={payPaybill}
              >
                RECORD PAYBILL · {money(part)}
              </Button>
              <Button variant="outline" className="h-11 w-full" onClick={() => setMethod(null)}>
                Choose another method
              </Button>
            </div>
          )}

          {method === "LOYALTY" && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/40 p-4">
                <p className="text-sm font-semibold">Pay with Points</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Available: {loyaltyBalance.toLocaleString()} points ·{" "}
                  {money(round2(loyaltyBalance * pointValue))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Points are deducted only after the sale is fully paid.
                </p>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Points to redeem</span>
                <Input
                  autoFocus
                  type="number"
                  min={1}
                  max={loyaltyBalance}
                  step="1"
                  value={loyaltyPointsRaw}
                  onChange={(event) => setLoyaltyPointsRaw(event.target.value)}
                />
              </label>
              <div className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span>Payment value</span>
                  <strong>{money(loyaltyAmount)}</strong>
                </div>
                <div className="mt-1 flex justify-between text-muted-foreground">
                  <span>Sale balance</span>
                  <span>{money(balance)}</span>
                </div>
              </div>
              <Button
                className="h-12 w-full font-bold"
                disabled={
                  busy ||
                  !sale.customerId ||
                  !loyaltyConfig?.redemptionEnabled ||
                  loyaltyPoints < 1 ||
                  loyaltyPoints > loyaltyBalance ||
                  loyaltyAmount <= 0 ||
                  loyaltyAmount > balance
                }
                onClick={payLoyalty}
              >
                USE {loyaltyPoints.toLocaleString()} POINTS · {money(loyaltyAmount)}
              </Button>
              <Button variant="outline" className="h-11 w-full" onClick={() => setMethod(null)}>
                Choose another method
              </Button>
            </div>
          )}

          {method === "STK" &&
            !promptId &&
            (mpesaUnavailable ? (
              <NotEnabledPanel
                icon="📱"
                title="M-Pesa is not configured"
                detail="Safaricom has not approved this till's Daraja access, so no push can be sent. Take cash or card instead."
                onBack={() => setMethod(null)}
              />
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold" htmlFor="stk-phone">
                    Customer Phone Number
                  </label>
                  <Input
                    id="stk-phone"
                    autoFocus
                    type="tel"
                    placeholder="0712 345 678"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="mt-1 h-14 text-center font-display text-xl font-bold"
                  />
                </div>
                <Button
                  className="h-14 w-full text-base font-bold"
                  disabled={busy || part <= 0}
                  onClick={sendPrompt}
                >
                  SEND STK PUSH — {money(part)}
                </Button>
              </div>
            ))}

          {promptId && !prompt.data && (
            <p className="py-6 text-center text-sm text-muted-foreground">Sending the request…</p>
          )}

          {promptId && prompt.data && (
            <div className="space-y-3 text-center">
              <div className="rounded-xl border bg-muted/40 p-6">
                <p className="text-3xl">📲</p>
                <p className="mt-2 font-display text-base font-bold">Waiting for the customer</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ask them to enter their M-Pesa PIN on their phone.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Ref: {prompt.data.ref}</p>
              </div>

              {prompt.data.status === "PENDING" && !exhausted && (
                <div className="rounded-xl border bg-brand-soft p-4">
                  <p className="text-2xl">⏳</p>
                  <p className="mt-1 font-display text-sm font-bold">Payment still pending</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Checked {tries} of {PAYMENT_POLL_MAX_TRIES} times, every{" "}
                    {PAYMENT_POLL_INTERVAL_MS / 1000}s.
                  </p>
                </div>
              )}

              {exhausted && (
                <div className="space-y-2">
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <p className="font-display text-sm font-bold">No response yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Safaricom has not answered this prompt. Expire it before sending a new one, so
                      the customer is not charged twice.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="h-12"
                      disabled={busy}
                      onClick={() => {
                        setPollStartedAt(Date.now());
                        void prompt.refetch();
                      }}
                    >
                      Keep waiting
                    </Button>
                    <Button
                      variant="destructive"
                      className="h-12 font-semibold"
                      disabled={busy}
                      onClick={expirePrompt}
                    >
                      Expire request
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {method && !promptId && (
          <div className="border-t px-5 py-3">
            <button
              onClick={() => {
                setMethod(null);
                setStockBlocked(null);
              }}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              ← Back to payment methods
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A `503 *_NOT_CONFIGURED` is a server switch, so the till stops offering the method. */
function NotEnabledPanel({
  icon,
  title,
  detail,
  onBack,
}: {
  icon: string;
  title: string;
  detail: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/40 p-4 text-center">
        <p className="text-3xl">{icon}</p>
        <p className="mt-2 font-display text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Button variant="outline" className="h-12 w-full" onClick={onBack}>
        Choose another method
      </Button>
    </div>
  );
}

// ===================== RECEIPT =====================
function ReceiptPanel({ saleId, onNewSale }: { saleId: string; onNewSale: () => void }) {
  const receipt = useReceipt(saleId);
  const payload = receipt.data;

  if (!payload) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
        {receipt.isError ? (
          <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center text-foreground shadow-elegant">
            <p className="font-display text-base font-bold">The receipt did not load</p>
            <p className="mt-1 text-xs text-muted-foreground">{receipt.error.message}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" onClick={onNewSale}>
                Back to till
              </Button>
              <Button
                className="h-12 font-bold"
                disabled={receipt.isFetching}
                onClick={() => void receipt.refetch()}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : (
          <Skeleton className="h-64 w-full max-w-sm rounded-2xl" />
        )}
      </div>
    );
  }

  const methods = (
    Object.entries(payload.payments) as [PaymentMethod, number | undefined][]
  ).filter((entry): entry is [PaymentMethod, number] => entry[1] !== undefined);
  const otherPaymentTotal = methods
    .filter(([method]) => method !== "LOYALTY")
    .reduce((sum, [, amount]) => sum + amount, 0);
  const hasLoyaltySummary =
    payload.loyaltyPointsRedeemed > 0 ||
    payload.loyaltyPointsEarned > 0 ||
    payload.loyaltyPointsBalance !== null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border bg-card p-6 text-foreground shadow-elegant">
          <div className="text-center">
            <div className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-xl gradient-brand text-2xl">
              🐔
            </div>
            <p className="font-display text-xl font-bold tracking-wide">{payload.businessName}</p>
            <p className="text-xs text-muted-foreground">{payload.cashier ?? "Cashier"}</p>
            <div className="my-3 border-t border-dashed" />
            <p className="text-xs text-muted-foreground">Receipt</p>
            <p className="font-display text-base font-bold">{payload.receiptNo}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {payload.completedAt ? new Date(payload.completedAt).toLocaleString("en-GB") : ""}
            </p>
          </div>
          <div className="my-3 border-t border-dashed" />
          <div className="space-y-2">
            {payload.items.map((line, index) => (
              <div key={`${line.name}-${index}`} className="flex justify-between gap-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <ProductImage name={line.name} className="h-7 w-7 shrink-0 rounded-sm" />
                  <div className="min-w-0">
                  <p className="truncate font-semibold">{line.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {line.qtyLabel} @ {posUnitPriceLabel(line.unitPriceLabel)}
                  </p>
                  </div>
                </div>
                <p className="font-display font-bold">{money(line.total)}</p>
              </div>
            ))}
          </div>
          <div className="my-3 border-t border-dashed" />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{money(payload.subtotal)}</span>
            </div>
            {payload.discount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span>−{money(payload.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-display text-lg font-extrabold">
              <span>TOTAL</span>
              <span>{money(payload.total)}</span>
            </div>
          </div>
          <div className="my-3 border-t border-dashed" />
          <div className="space-y-1 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Payments
            </p>
            {methods.map(([method, amount]) => (
              <div key={method} className="flex justify-between">
                <span>{PAYMENT_METHOD_LABELS[method]}</span>
                <span className="font-semibold">{money(amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-muted-foreground">
              <span>Paid ({payload.currency})</span>
              <span className="font-semibold">{money(payload.paidAmount)}</span>
            </div>
            {payload.change > 0 && (
              <div className="flex justify-between font-semibold">
                <span>Change</span>
                <span>{money(payload.change)}</span>
              </div>
            )}
          </div>
          <div className="my-3 border-t border-dashed" />
          {hasLoyaltySummary && (
            <>
              <div className="space-y-1 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Loyalty
                </p>
                {payload.loyaltyPointsRedeemed > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span>Points redeemed</span>
                      <span>{payload.loyaltyPointsRedeemed.toLocaleString()} pts</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Value redeemed</span>
                      <span>{money(payload.loyaltyValueRedeemed)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Paid using other methods</span>
                      <span>{money(otherPaymentTotal)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span>Points earned this sale</span>
                  <span>{payload.loyaltyPointsEarned.toLocaleString()} pts</span>
                </div>
                {payload.loyaltyPointsBalance !== null && (
                  <div className="flex justify-between">
                    <span>Total accumulated points</span>
                    <span>{payload.loyaltyPointsBalance.toLocaleString()} pts</span>
                  </div>
                )}
              </div>
              <div className="my-3 border-t border-dashed" />
            </>
          )}
          <div className="text-center">
            <p className="font-display text-sm font-bold">PAID</p>
            <p className="font-display text-xl font-extrabold text-brand-deep">
              {money(payload.paidAmount)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{payload.footer}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12" onClick={() => window.print()}>
            Print
          </Button>
          <Button className="h-12 font-bold" onClick={onNewSale}>
            New Sale
          </Button>
        </div>
      </div>
    </div>
  );
}
