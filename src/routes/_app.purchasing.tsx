import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Pencil, Plus, RefreshCw, Trash2, Truck, Package } from "lucide-react";
import {
  hasPermission,
  landingPathFor,
  loadSession,
  useActiveBranchId,
  useHasPermission,
  useSessionBranches,
} from "@/api/hooks/auth";
import { useProductList } from "@/api/hooks/catalog";
import { QueryKeys } from "@/api/hooks/keys";
import {
  useCancelPurchaseOrder,
  useCreatePurchaseOrder,
  useCreateSupplier,
  useDeleteSupplier,
  useGoodsReceiptList,
  useOrderPurchaseOrder,
  usePurchaseOrder,
  usePurchaseOrderList,
  useReceivePurchaseOrder,
  useSupplierList,
  useUpdatePurchaseOrder,
  useUpdateSupplier,
} from "@/api/hooks/purchasing";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ProductImage } from "@/components/product-image";
import { EmptyState, PageHeader, StatusPill } from "@/components/shared";
import { ApiError, fieldError, type ApiErrorCode } from "@/lib/api";
import { fmtDateTime, fmtKg, money, round3 } from "@/lib/money";
import type {
  BaseUnit,
  Branch,
  GoodsReceipt,
  POStatus,
  Product,
  PurchaseOrder,
  PurchaseOrderInput,
  PurchaseOrderLineInput,
  ReceiveGoodsInput,
  Supplier,
  SupplierInput,
} from "@/types/api";

export const Route = createFileRoute("/_app/purchasing")({
  beforeLoad: async () => {
    const session = await loadSession();
    if (!session) throw redirect({ to: "/staff/login" });
    if (!hasPermission(session, "purchasing")) throw redirect({ to: landingPathFor(session) });
  },
  component: PurchasingPage,
});

/** Radix `SelectItem` rejects an empty value, so "no filter" needs a sentinel. */
const ALL = "__all__";
const PO_STATUSES: POStatus[] = ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];

const CODE_TITLES: Partial<Record<ApiErrorCode, string>> = {
  INSUFFICIENT_STOCK: "Not enough stock",
};

function fmtQty(qty: number, unit: BaseUnit): string {
  return unit === "KG" ? fmtKg(qty) : `${round3(qty)} pcs`;
}

function labelOf(productById: Map<string, Product>, productId: string): string {
  const product = productById.get(productId);
  return product?.name ?? productId;
}

function unitOf(productById: Map<string, Product>, productId: string): BaseUnit {
  return productById.get(productId)?.baseUnit ?? "KG";
}

function branchNameOf(branches: Branch[], branchId: string): string {
  return branches.find((branch) => branch.id === branchId)?.name ?? branchId;
}

function apiErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "The server rejected this action.";
}

function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}

function QueryFailed({
  error,
  retrying,
  onRetry,
}: {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}) {
  const message = error instanceof ApiError ? error.message : "This data could not be loaded.";
  return (
    <Alert variant="destructive">
      <AlertTitle>Load failed</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
          <RefreshCw className="mr-1 h-3 w-3" />
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function FieldFailure({ error, field }: { error: unknown; field: string }) {
  const message = fieldError(error, field);
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function DialogShell({
  title,
  error,
  pending,
  canSubmit,
  submitLabel,
  onClose,
  onSubmit,
  wide = false,
  children,
}: {
  title: string;
  error: unknown;
  pending: boolean;
  canSubmit: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const apiError = error instanceof ApiError ? error : null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={wide ? "max-h-[90vh] overflow-y-auto sm:max-w-md" : "sm:max-w-sm"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {children}
          {apiError && (
            <Alert variant="destructive">
              <AlertTitle>
                {(apiError.code && CODE_TITLES[apiError.code]) ?? "Not recorded"}
              </AlertTitle>
              <AlertDescription>{apiError.message}</AlertDescription>
            </Alert>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!canSubmit || pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BranchPicker({
  label,
  branches,
  value,
  onChange,
}: {
  label: string;
  branches: Branch[];
  value: string;
  onChange: (branchId: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1">
          <SelectValue placeholder="Select branch" />
        </SelectTrigger>
        <SelectContent>
          {branches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No branch available</p>
          ) : (
            branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>
                {branch.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function PurchasingPage() {
  const branches = useSessionBranches();
  const activeBranchId = useActiveBranchId();
  const canReceive = useHasPermission("inventory");

  const [supplierDraft, setSupplierDraft] = useState<Supplier | "new" | null>(null);
  const [poDraft, setPoDraft] = useState<{ po: PurchaseOrder | null } | null>(null);
  const [receivePoId, setReceivePoId] = useState<string | null>(null);

  const suppliersQuery = useSupplierList();
  const suppliers = useMemo(() => suppliersQuery.data ?? [], [suppliersQuery.data]);
  const productsQuery = useProductList();
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const deleteSupplier = useDeleteSupplier();

  function removeSupplier(supplier: Supplier) {
    if (!window.confirm(`Remove supplier ${supplier.name}?`)) return;
    deleteSupplier.mutate(supplier.id, {
      onSuccess: () => toast.success("Supplier removed"),
      onError: (error) => toast.error(apiErrorMessage(error)),
    });
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Purchasing"
        subtitle="Suppliers, purchase orders and goods receiving"
        actions={
          <>
            <Button variant="outline" onClick={() => setSupplierDraft("new")}>
              <Plus className="mr-1 h-4 w-4" /> Supplier
            </Button>
            <Button onClick={() => setPoDraft({ po: null })}>
              <Plus className="mr-1 h-4 w-4" /> Purchase Order
            </Button>
          </>
        }
      />
      <div className="px-4 py-5 md:px-6">
        <Tabs defaultValue="suppliers">
          <TabsList className="mb-4">
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
            <TabsTrigger value="receipts">Goods Receipts</TabsTrigger>
          </TabsList>

          <TabsContent value="suppliers">
            {suppliersQuery.isError ? (
              <QueryFailed
                error={suppliersQuery.error}
                retrying={suppliersQuery.isFetching}
                onRetry={() => void suppliersQuery.refetch()}
              />
            ) : suppliersQuery.isPending ? (
              <TableSkeleton rows={3} />
            ) : suppliers.length === 0 ? (
              <EmptyState
                icon="🚚"
                title="No suppliers yet"
                body="Add a supplier to start raising purchase orders."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suppliers.map((supplier) => (
                  <div key={supplier.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-lg">
                          <Truck className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="font-semibold">{supplier.name}</p>
                          <p className="text-xs text-muted-foreground">{supplier.location}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${supplier.name}`}
                          onClick={() => setSupplierDraft(supplier)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${supplier.name}`}
                          disabled={deleteSupplier.isPending}
                          onClick={() => removeSupplier(supplier)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      <p className="text-muted-foreground">{supplier.phone}</p>
                      <p className="text-muted-foreground">{supplier.email}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {supplier.productsSupplied.map((productId) => (
                          <Badge key={productId} variant="secondary" className="text-[10px]">
                            {productById.get(productId)?.name ?? productId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders">
            <OrdersTab
              suppliers={suppliers}
              suppliersLoading={suppliersQuery.isPending}
              productById={productById}
              canReceive={canReceive}
              onEdit={(po) => setPoDraft({ po })}
              onReceive={(poId) => setReceivePoId(poId)}
            />
          </TabsContent>

          <TabsContent value="receipts">
            <ReceiptsTab branches={branches} productById={productById} />
          </TabsContent>
        </Tabs>
      </div>

      {supplierDraft && (
        <SupplierDialog
          supplier={supplierDraft === "new" ? null : supplierDraft}
          products={products}
          onClose={() => setSupplierDraft(null)}
        />
      )}
      {poDraft && (
        <PoDialog
          po={poDraft.po}
          suppliers={suppliers}
          products={products}
          onClose={() => setPoDraft(null)}
        />
      )}
      {receivePoId && (
        <ReceiveDialog
          poId={receivePoId}
          branches={branches}
          activeBranchId={activeBranchId}
          productById={productById}
          onClose={() => setReceivePoId(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- orders

function OrdersTab({
  suppliers,
  suppliersLoading,
  productById,
  canReceive,
  onEdit,
  onReceive,
}: {
  suppliers: Supplier[];
  suppliersLoading: boolean;
  productById: Map<string, Product>;
  canReceive: boolean;
  onEdit: (po: PurchaseOrder) => void;
  onReceive: (poId: string) => void;
}) {
  const [statusChoice, setStatusChoice] = useState<string>(ALL);
  const [supplierChoice, setSupplierChoice] = useState<string>(ALL);

  const ordersQuery = usePurchaseOrderList({
    status: statusChoice === ALL ? undefined : (statusChoice as POStatus),
    supplierId: supplierChoice === ALL ? undefined : supplierChoice,
  });
  const orders = useMemo(
    () =>
      [...(ordersQuery.data ?? [])].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    [ordersQuery.data],
  );
  const filtered = statusChoice !== ALL || supplierChoice !== ALL;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-44">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusChoice} onValueChange={setStatusChoice}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {PO_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-44">
          <Label className="text-xs text-muted-foreground">Supplier</Label>
          <Select value={supplierChoice} onValueChange={setSupplierChoice}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={suppliersLoading ? "Loading suppliers…" : undefined} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All suppliers</SelectItem>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {ordersQuery.isError ? (
        <QueryFailed
          error={ordersQuery.error}
          retrying={ordersQuery.isFetching}
          onRetry={() => void ordersQuery.refetch()}
        />
      ) : ordersQuery.isPending ? (
        <TableSkeleton rows={4} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon="📋"
          title={filtered ? "No purchase orders match these filters" : "No purchase orders"}
          body={
            filtered
              ? "Widen the status or supplier filter."
              : "Raise a purchase order to order from a supplier."
          }
        />
      ) : (
        <div className="space-y-2">
          {orders.map((po) => (
            <PoCard
              key={po.id}
              po={po}
              suppliers={suppliers}
              productById={productById}
              canReceive={canReceive}
              onEdit={onEdit}
              onReceive={onReceive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PoCard({
  po,
  suppliers,
  productById,
  canReceive,
  onEdit,
  onReceive,
}: {
  po: PurchaseOrder;
  suppliers: Supplier[];
  productById: Map<string, Product>;
  canReceive: boolean;
  onEdit: (po: PurchaseOrder) => void;
  onReceive: (poId: string) => void;
}) {
  const orderPo = useOrderPurchaseOrder();
  const cancelPo = useCancelPurchaseOrder();
  const supplierName =
    po.supplierName ?? suppliers.find((s) => s.id === po.supplierId)?.name ?? "Supplier";
  const busy = orderPo.isPending || cancelPo.isPending;
  const actionError = orderPo.error ?? cancelPo.error;

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">
            {po.ref} — {supplierName}
          </p>
          <p className="text-xs text-muted-foreground">
            {fmtDateTime(po.createdAt)} · {money(po.totalCost)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={po.status} />
          {po.status === "DRAFT" && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onEdit(po)}>
                Edit
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  orderPo.mutate(po.id, {
                    onSuccess: () => toast.success(`${po.ref} sent`),
                    onError: (error) => toast.error(apiErrorMessage(error)),
                  })
                }
              >
                Send
              </Button>
            </>
          )}
          {(po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED") && canReceive && (
            <Button size="sm" variant="outline" onClick={() => onReceive(po.id)}>
              <Package className="mr-1 h-3 w-3" /> Receive
            </Button>
          )}
          {(po.status === "DRAFT" || po.status === "ORDERED") && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(`Cancel ${po.ref}?`)) return;
                cancelPo.mutate(po.id, {
                  onSuccess: () => toast.success(`${po.ref} cancelled`),
                  onError: (error) => toast.error(apiErrorMessage(error)),
                });
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
      <div className="mt-2 text-sm text-muted-foreground">
        {po.items.map((line, index) => (
          <span key={line.productId}>
            {labelOf(productById, line.productId)} {fmtQty(line.receivedQty, line.unit)}/
            {fmtQty(line.qty, line.unit)} @ {money(line.unitCost)}
            {index < po.items.length - 1 ? " · " : ""}
          </span>
        ))}
      </div>
      {po.notes && <p className="mt-2 text-sm text-muted-foreground">{po.notes}</p>}
      {actionError && (
        <p className="mt-2 text-xs text-destructive">{apiErrorMessage(actionError)}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- receipts

function ReceiptsTab({
  branches,
  productById,
}: {
  branches: Branch[];
  productById: Map<string, Product>;
}) {
  const [branchChoice, setBranchChoice] = useState<string>(ALL);
  const branchId = branchChoice === ALL ? undefined : branchChoice;

  const receiptsQuery = useGoodsReceiptList(branchId ? { branchId } : {});
  const receipts = useMemo(
    () => [...(receiptsQuery.data ?? [])].sort((left, right) => right.at.localeCompare(left.at)),
    [receiptsQuery.data],
  );

  return (
    <div className="space-y-4">
      {branches.length > 1 && (
        <div className="min-w-44">
          <Label className="text-xs text-muted-foreground">Branch</Label>
          <Select value={branchChoice} onValueChange={setBranchChoice}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All branches</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {receiptsQuery.isError ? (
        <QueryFailed
          error={receiptsQuery.error}
          retrying={receiptsQuery.isFetching}
          onRetry={() => void receiptsQuery.refetch()}
        />
      ) : receiptsQuery.isPending ? (
        <TableSkeleton rows={4} />
      ) : receipts.length === 0 ? (
        <EmptyState
          icon="📥"
          title="No goods receipts"
          body="Receiving against a purchase order books stock here."
        />
      ) : (
        <div className="space-y-2">
          {receipts.map((receipt) => (
            <ReceiptCard
              key={receipt.id}
              receipt={receipt}
              branches={branches}
              productById={productById}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReceiptCard({
  receipt,
  branches,
  productById,
}: {
  receipt: GoodsReceipt;
  branches: Branch[];
  productById: Map<string, Product>;
}) {
  return (
    <div className="rounded-lg border px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{receipt.ref}</p>
        <p className="text-xs text-muted-foreground">
          {receipt.items.length} item(s) · {branchNameOf(branches, receipt.branchId)} ·{" "}
          {fmtDateTime(receipt.at)}
        </p>
      </div>
      <p className="mt-2 text-muted-foreground">
        {receipt.items
          .map(
            (line) =>
              `${labelOf(productById, line.productId)} ${fmtQty(line.receivedQty ?? 0, unitOf(productById, line.productId))}`,
          )
          .join(" · ") || "—"}
      </p>
      {receipt.items.some((line) => line.reason) && (
        <p className="mt-1 text-xs text-muted-foreground">
          Shortages:{" "}
          {receipt.items
            .filter((line) => line.reason)
            .map((line) => `${labelOf(productById, line.productId)} — ${line.reason}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- dialogs

function SupplierDialog({
  supplier,
  products,
  onClose,
}: {
  supplier: Supplier | null;
  products: Product[];
  onClose: () => void;
}) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [location, setLocation] = useState(supplier?.location ?? "");
  const [productsSupplied, setProductsSupplied] = useState<string[]>(
    supplier?.productsSupplied ?? [],
  );

  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const canSubmit = name.trim().length > 0;

  function save() {
    const input: SupplierInput = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      location: location.trim(),
      productsSupplied,
    };
    if (supplier) {
      update.mutate(
        { supplierId: supplier.id, patch: input },
        {
          onSuccess: () => {
            toast.success("Supplier updated");
            onClose();
          },
        },
      );
      return;
    }
    create.mutate(input, {
      onSuccess: () => {
        toast.success("Supplier created");
        onClose();
      },
    });
  }

  return (
    <DialogShell
      title={supplier ? `Edit ${supplier.name}` : "New Supplier"}
      error={error}
      pending={pending}
      canSubmit={canSubmit}
      submitLabel={supplier ? "Save" : "Create"}
      onClose={onClose}
      onSubmit={save}
    >
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(event) => setName(event.target.value)} className="mt-1" />
        <FieldFailure error={error} field="name" />
      </div>
      <div>
        <Label>Phone</Label>
        <Input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1" />
        <FieldFailure error={error} field="phone" />
      </div>
      <div>
        <Label>Email</Label>
        <Input value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1" />
        <FieldFailure error={error} field="email" />
      </div>
      <div>
        <Label>Location</Label>
        <Input
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="mt-1"
        />
        <FieldFailure error={error} field="location" />
      </div>
      <div>
        <Label>Products supplied (optional)</Label>
        {products.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Products are unavailable. You can create the supplier without selecting products.
          </p>
        ) : (
          <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
            {products.map((product) => (
              <label key={product.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={productsSupplied.includes(product.id)}
                  onCheckedChange={(checked) => {
                    setProductsSupplied((current) =>
                      checked
                        ? current.includes(product.id)
                          ? current
                          : [...current, product.id]
                        : current.filter((productId) => productId !== product.id),
                    );
                  }}
                />
                <span>{product.name}</span>
              </label>
            ))}
          </div>
        )}
        <FieldFailure error={error} field="productsSupplied" />
      </div>
    </DialogShell>
  );
}

function PoDialog({
  po,
  suppliers,
  products,
  onClose,
}: {
  po: PurchaseOrder | null;
  suppliers: Supplier[];
  products: Product[];
  onClose: () => void;
}) {
  const [supplierId, setSupplierId] = useState(po?.supplierId ?? "");
  const [rows, setRows] = useState<Record<string, { qty: string; cost: string }>>(() =>
    Object.fromEntries(
      (po?.items ?? []).map((line) => [
        line.productId,
        { qty: String(line.qty), cost: String(line.unitCost) },
      ]),
    ),
  );
  const [notes, setNotes] = useState(po?.notes ?? "");

  const create = useCreatePurchaseOrder();
  const update = useUpdatePurchaseOrder();
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const lines: PurchaseOrderLineInput[] = [];
  for (const product of products) {
    const row = rows[product.id];
    if (!row) continue;
    const qty = Number(row.qty);
    const cost = Number(row.cost);
    if (qty > 0 && cost > 0) {
      lines.push({ productId: product.id, qty, unit: product.baseUnit, unitCost: cost });
    }
  }
  const canSubmit = supplierId.length > 0 && lines.length > 0;

  function save() {
    const input: PurchaseOrderInput = {
      supplierId,
      items: lines,
      notes: notes.trim() || undefined,
    };
    if (po) {
      update.mutate(
        { poId: po.id, patch: input },
        {
          onSuccess: (order) => {
            toast.success(`${order.ref} updated`);
            onClose();
          },
        },
      );
      return;
    }
    create.mutate(input, {
      onSuccess: (order) => {
        toast.success(`Purchase order created — ${order.ref}`);
        onClose();
      },
    });
  }

  return (
    <DialogShell
      title={po ? `Edit ${po.ref}` : "New Purchase Order"}
      error={error}
      pending={pending}
      canSubmit={canSubmit}
      submitLabel={po ? "Save" : "Create PO"}
      onClose={onClose}
      onSubmit={save}
      wide
    >
      <div>
        <Label>Supplier</Label>
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select supplier" />
          </SelectTrigger>
          <SelectContent>
            {suppliers.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No suppliers yet</p>
            ) : (
              suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <FieldFailure error={error} field="supplierId" />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Items
        </p>
        {products.length === 0 && <p className="text-sm text-muted-foreground">No products yet</p>}
        {products.map((product) => (
          <div key={product.id} className="flex items-center gap-2">
            <span className="flex flex-1 items-center gap-2 text-sm">
              <ProductImage
                name={product.name}
                productId={product.id}
                sku={product.sku}
                className="h-8 w-8 rounded"
              />
              {product.name}
            </span>
            <Input
              type="number"
              step="0.001"
              min="0"
              placeholder="Qty"
              value={rows[product.id]?.qty ?? ""}
              onChange={(event) =>
                setRows((state) => ({
                  ...state,
                  [product.id]: { qty: event.target.value, cost: state[product.id]?.cost ?? "" },
                }))
              }
              className="w-20"
            />
            <Input
              type="number"
              min="0"
              placeholder="Cost"
              value={rows[product.id]?.cost ?? ""}
              onChange={(event) =>
                setRows((state) => ({
                  ...state,
                  [product.id]: { qty: state[product.id]?.qty ?? "", cost: event.target.value },
                }))
              }
              className="w-24"
            />
            <span className="w-10 text-xs text-muted-foreground">
              {product.baseUnit === "KG" ? "kg" : "pcs"}
            </span>
          </div>
        ))}
      </div>
      <FieldFailure error={error} field="items" />
      <div>
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="mt-1"
        />
        <FieldFailure error={error} field="notes" />
      </div>
    </DialogShell>
  );
}

function ReceiveDialog({
  poId,
  branches,
  activeBranchId,
  productById,
  onClose,
}: {
  poId: string;
  branches: Branch[];
  activeBranchId: string | null;
  productById: Map<string, Product>;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const poQuery = usePurchaseOrder(poId);
  const [branchChoice, setBranchChoice] = useState(activeBranchId ?? branches[0]?.id ?? "");
  const [receivedNow, setReceivedNow] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const receive = useReceivePurchaseOrder();

  const po = poQuery.data;

  const lines: ReceiveGoodsInput["items"] = [];
  for (const line of po?.items ?? []) {
    const raw = receivedNow[line.productId] ?? "";
    const qty = raw.trim() === "" ? null : Number(raw);
    const reason = reasons[line.productId]?.trim() || undefined;
    if (qty !== null && Number.isFinite(qty) && qty > 0) {
      lines.push({ productId: line.productId, receivedQty: qty, reason });
    } else if (reason) {
      lines.push({ productId: line.productId, receivedQty: 0, reason });
    }
  }
  const canSubmit = Boolean(po && branchChoice) && lines.some((line) => line.receivedQty > 0);

  function save() {
    if (!po) return;
    receive.mutate(
      { poId: po.id, branchId: branchChoice, items: lines },
      {
        onSuccess: (receipt) => {
          // Receiving moves stock, so dashboard and inventory reports must refresh too.
          client.invalidateQueries({ queryKey: QueryKeys.reportsRoot });
          toast.success(`Goods received — ${receipt.ref}`);
          onClose();
        },
      },
    );
  }

  return (
    <DialogShell
      title={po ? `Receive Goods — ${po.ref}` : "Receive Goods"}
      error={receive.error}
      pending={receive.isPending}
      canSubmit={canSubmit}
      submitLabel="Confirm Receipt"
      onClose={onClose}
      onSubmit={save}
      wide
    >
      {poQuery.isError ? (
        <QueryFailed
          error={poQuery.error}
          retrying={poQuery.isFetching}
          onRetry={() => void poQuery.refetch()}
        />
      ) : poQuery.isPending ? (
        <TableSkeleton rows={3} />
      ) : (
        <>
          {branches.length > 1 && (
            <BranchPicker
              label="Receive into"
              branches={branches}
              value={branchChoice}
              onChange={setBranchChoice}
            />
          )}
          {po?.items.map((line) => {
            const remaining = round3(line.qty - line.receivedQty);
            return (
              <div key={line.productId} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{labelOf(productById, line.productId)}</p>
                <p className="text-xs text-muted-foreground">
                  Ordered {fmtQty(line.qty, line.unit)} · Received{" "}
                  {fmtQty(line.receivedQty, line.unit)} · Remaining {fmtQty(remaining, line.unit)}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Receiving now</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      value={receivedNow[line.productId] ?? ""}
                      onChange={(event) =>
                        setReceivedNow((state) => ({
                          ...state,
                          [line.productId]: event.target.value,
                        }))
                      }
                      className="mt-1"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Reason (if short)</Label>
                    <Input
                      value={reasons[line.productId] ?? ""}
                      onChange={(event) =>
                        setReasons((state) => ({ ...state, [line.productId]: event.target.value }))
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <FieldFailure error={receive.error} field="items" />
        </>
      )}
    </DialogShell>
  );
}
