import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Package, RefreshCw, Scissors, Sliders, Trash2 } from "lucide-react";
import { useAdjustStock, useConvertStock, useReceiveTransfer, useRecordWastage, useReceiveStock, useTransferStock, useTransfers } from "@/api/hooks/inventory";
import { useCategoryList, useInventoryBalances, useInventoryMovements, useProductList } from "@/api/hooks/catalog";
import { useWastageReport } from "@/api/hooks/reports";
import { useSupplierList } from "@/api/hooks/purchasing";
import { useSettings } from "@/api/hooks/directory";
import { QueryKeys } from "@/api/hooks/keys";
import { hasPermission, landingPathFor, loadSession, useActiveBranchId, useHasPermission, useSessionBranches, useUser } from "@/api/hooks/auth";
import { ApiError, fieldError } from "@/lib/api";
import { fmtDateTime, fmtKg, money, round3 } from "@/lib/money";
import { MOVEMENT_LABELS, type BaseUnit, type Branch, type Conversion, type InventoryBalance, type Movement, type MovementType, type Product, type WastageReason } from "@/types/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, StatusPill } from "@/components/shared";
import { ProductImage } from "@/components/product-image";

export const Route = createFileRoute("/_app/inventory")({
  beforeLoad: async () => {
    const session = await loadSession();
    if (!session) throw redirect({ to: "/staff/login" });
    if (!hasPermission(session, "inventory")) throw redirect({ to: landingPathFor(session) });
  },
  component: InventoryPage,
});

/** Radix `SelectItem` rejects an empty value, so "no filter" needs a sentinel. */
const ALL = "__all__";
const MOVEMENT_TYPES = Object.keys(MOVEMENT_LABELS) as MovementType[];
const WASTAGE_REASONS: WastageReason[] = ["Spoilage", "Damage", "Expired", "Other"];
const MOVEMENT_LIMITS = [100, 200, 500];
const LEDGER_LIMIT = 500;
const WASTAGE_LOOKBACK_DAYS = 30;

type ModalKind = "receive" | "wastage" | "transfer" | "adjust" | "convert";

function fmtQty(qty: number, unit: BaseUnit | undefined): string {
  if (unit === "KG") return fmtKg(qty);
  if (unit === "PIECE") return `${round3(qty)} pcs`;
  return String(round3(qty));
}

function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 rounded-xl border p-3">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-3">
          {Array.from({ length: cols }, (__, col) => (
            <Skeleton key={col} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

function QueryFailed({ error, retrying, onRetry }: { error: unknown; retrying: boolean; onRetry: () => void }) {
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

/**
 * Inventory mutations invalidate stock reads but not `/reports`, so dashboard
 * counters would otherwise keep their pre-write numbers.
 */
function useStockWriteDone(): () => void {
  const client = useQueryClient();
  return useCallback(() => {
    client.invalidateQueries({ queryKey: QueryKeys.reportsRoot });
  }, [client]);
}

function labelOf(productById: Map<string, Product>, productId: string): string {
  const product = productById.get(productId);
  return product?.name ?? productId;
}

function unitOf(productById: Map<string, Product>, productId: string): BaseUnit | undefined {
  return productById.get(productId)?.baseUnit;
}

function branchNameOf(branches: Branch[], branchId: string | null): string {
  if (!branchId) return "—";
  return branches.find((branch) => branch.id === branchId)?.name ?? branchId;
}

function InventoryPage() {
  const branches = useSessionBranches();
  const activeBranchId = useActiveBranchId();
  const [branchChoice, setBranchChoice] = useState<string>(activeBranchId ?? ALL);
  const [modal, setModal] = useState<ModalKind | null>(null);

  const productsQuery = useProductList();
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const branchId = branchChoice === ALL ? null : branchChoice;

  const dialogs: Record<ModalKind, ReactNode> = {
    receive: <ReceiveDialog branches={branches} activeBranchId={activeBranchId} products={products} onClose={() => setModal(null)} />,
    wastage: <WastageDialog branches={branches} activeBranchId={activeBranchId} products={products} onClose={() => setModal(null)} />,
    transfer: <TransferDialog branches={branches} activeBranchId={activeBranchId} products={products} productById={productById} onClose={() => setModal(null)} />,
    adjust: <AdjustDialog branches={branches} activeBranchId={activeBranchId} products={products} onClose={() => setModal(null)} />,
    convert: <ConvertDialog branches={branches} activeBranchId={activeBranchId} products={products} onClose={() => setModal(null)} />,
  };

  return (
    <div className="pb-10">
      <PageHeader
        title="Inventory"
        subtitle="Stock overview, movements, transfers, wastage, adjustments and conversions"
        actions={
          <>
            <Button variant="outline" onClick={() => setModal("receive")}><Package className="mr-1 h-4 w-4" /> Receive</Button>
            <Button variant="outline" onClick={() => setModal("transfer")}><ArrowLeftRight className="mr-1 h-4 w-4" /> Transfer</Button>
            <Button variant="outline" onClick={() => setModal("wastage")}><Trash2 className="mr-1 h-4 w-4" /> Wastage</Button>
            <Button variant="outline" onClick={() => setModal("adjust")}><Sliders className="mr-1 h-4 w-4" /> Adjust</Button>
            <Button variant="outline" onClick={() => setModal("convert")}><Scissors className="mr-1 h-4 w-4" /> Convert</Button>
          </>
        }
      />
      <div className="px-4 py-5 md:px-6">
        {branches.length > 1 && (
          <div className="mb-4">
            <Label className="text-xs text-muted-foreground">Branch</Label>
            <Select value={branchChoice} onValueChange={setBranchChoice}>
              <SelectTrigger className="mt-1 w-full max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All branches</SelectItem>
                {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {productsQuery.isError && (
          <div className="mb-4">
            <QueryFailed error={productsQuery.error} retrying={productsQuery.isFetching} onRetry={() => void productsQuery.refetch()} />
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="movements">Movements</TabsTrigger>
            <TabsTrigger value="wastage">Wastage</TabsTrigger>
            <TabsTrigger value="transfers">Transfers</TabsTrigger>
            <TabsTrigger value="conversions">Conversions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab branchId={branchId} branches={branches} productById={productById} />
          </TabsContent>

          <TabsContent value="movements">
            <MovementsTab branchId={branchId} branches={branches} products={products} productById={productById} />
          </TabsContent>

          <TabsContent value="wastage">
            <WastageTab branchId={branchId} branches={branches} productById={productById} />
          </TabsContent>

          <TabsContent value="transfers">
            <TransfersTab branchId={branchId} branches={branches} productById={productById} activeBranchId={activeBranchId} />
          </TabsContent>

          <TabsContent value="conversions">
            <ConversionsTab branchId={branchId} productById={productById} />
          </TabsContent>
        </Tabs>
      </div>

      {modal ? dialogs[modal] : null}
    </div>
  );
}

// ------------------------------------------------------------------ overview

function OverviewTab({
  branchId,
  branches,
  productById,
}: {
  branchId: string | null;
  branches: Branch[];
  productById: Map<string, Product>;
}) {
  const [categoryChoice, setCategoryChoice] = useState<string>(ALL);
  const [lowOnly, setLowOnly] = useState(false);
  const categoriesQuery = useCategoryList();
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  const balancesQuery = useInventoryBalances({
    branchId: branchId ?? undefined,
    categoryId: categoryChoice === ALL ? undefined : categoryChoice,
    lowStockOnly: lowOnly ? true : undefined,
  });
  const balances = useMemo(() => balancesQuery.data ?? [], [balancesQuery.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select value={categoryChoice} onValueChange={setCategoryChoice}>
            <SelectTrigger className="mt-1 w-full min-w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  <span className="flex items-center gap-2">
                    <ProductImage name={category.name} className="h-6 w-6 rounded" />
                    {category.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant={lowOnly ? "secondary" : "outline"} size="sm" aria-pressed={lowOnly} onClick={() => setLowOnly((value) => !value)}>
          {lowOnly ? "Showing low stock" : "Low stock only"}
        </Button>
      </div>

      {balancesQuery.isError ? (
        <QueryFailed error={balancesQuery.error} retrying={balancesQuery.isFetching} onRetry={() => void balancesQuery.refetch()} />
      ) : balancesQuery.isPending ? (
        <TableSkeleton rows={8} cols={5} />
      ) : balances.length === 0 ? (
        <EmptyState
          icon="📦"
          title={lowOnly || categoryChoice !== ALL ? "No stock matches these filters" : "No stock data"}
          body={lowOnly || categoryChoice !== ALL ? "Widen the branch, category or low-stock filter." : "Receive stock to build up balances."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3">Product</th>
                {branchId === null && <th className="p-3">Branch</th>}
                <th className="p-3 text-right">Available</th>
                <th className="p-3 text-right">Reorder Level</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => {
                const product = productById.get(balance.productId);
                const low = product ? balance.qty <= product.reorderLevel : false;
                return (
                  <tr key={`${balance.branchId}:${balance.productId}`} className="border-t">
                    <td className="p-3">
                      <span className="flex items-center gap-2 font-medium">
                        <ProductImage
                          name={product?.name}
                          productId={product?.id}
                          sku={product?.sku}
                          className="h-8 w-8 rounded-md"
                        />
                        {labelOf(productById, balance.productId)}
                      </span>
                    </td>
                    {branchId === null && <td className="p-3 text-muted-foreground">{branchNameOf(branches, balance.branchId)}</td>}
                    <td className="p-3 text-right font-display font-bold">{fmtQty(balance.qty, product?.baseUnit)}</td>
                    <td className="p-3 text-right text-muted-foreground">{product ? fmtQty(product.reorderLevel, product.baseUnit) : "—"}</td>
                    <td className="p-3">{low ? <StatusPill status="LOW" /> : <StatusPill status="OK" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- movements

function MovementsTab({
  branchId,
  branches,
  products,
  productById,
}: {
  branchId: string | null;
  branches: Branch[];
  products: Product[];
  productById: Map<string, Product>;
}) {
  const [productChoice, setProductChoice] = useState<string>(ALL);
  const [typeChoice, setTypeChoice] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(100);

  const movementsQuery = useInventoryMovements({
    branchId: branchId ?? undefined,
    productId: productChoice === ALL ? undefined : productChoice,
    type: typeChoice === ALL ? undefined : (typeChoice as MovementType),
    from: from || undefined,
    to: to || undefined,
    limit,
  });
  const movements = useMemo(() => movementsQuery.data ?? [], [movementsQuery.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-44">
          <Label className="text-xs text-muted-foreground">Product</Label>
          <Select value={productChoice} onValueChange={setProductChoice}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All products</SelectItem>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  <span className="flex items-center gap-2">
                    <ProductImage name={product.name} productId={product.id} sku={product.sku} className="h-6 w-6 rounded" />
                    {product.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-44">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <Select value={typeChoice} onValueChange={setTypeChoice}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {MOVEMENT_TYPES.map((type) => <SelectItem key={type} value={type}>{MOVEMENT_LABELS[type]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1" />
        </div>
        <div className="min-w-32">
          <Label className="text-xs text-muted-foreground">Rows</Label>
          <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MOVEMENT_LIMITS.map((option) => <SelectItem key={option} value={String(option)}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {movementsQuery.isError ? (
        <QueryFailed error={movementsQuery.error} retrying={movementsQuery.isFetching} onRetry={() => void movementsQuery.refetch()} />
      ) : movementsQuery.isPending ? (
        <TableSkeleton rows={8} cols={7} />
      ) : movements.length === 0 ? (
        <EmptyState icon="📜" title="No movements yet" body="Every receive, sale, transfer, wastage, adjustment and conversion is booked here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3">Type</th>
                <th className="p-3">Product</th>
                {branchId === null && <th className="p-3">Branch</th>}
                <th className="p-3 text-right">Before</th>
                <th className="p-3 text-right">Change</th>
                <th className="p-3 text-right">After</th>
                <th className="p-3">Ref</th>
                <th className="p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => {
                const unit = productById.get(movement.productId)?.baseUnit;
                return (
                  <tr key={movement.id} className="border-t">
                    <td className="p-3"><Badge variant="secondary">{MOVEMENT_LABELS[movement.type]}</Badge></td>
                    <td className="p-3">
                      <span className="flex items-center gap-2 font-medium">
                        <ProductImage
                          name={productById.get(movement.productId)?.name}
                          productId={movement.productId}
                          sku={productById.get(movement.productId)?.sku}
                          className="h-8 w-8 rounded-md"
                        />
                        {labelOf(productById, movement.productId)}
                      </span>
                    </td>
                    {branchId === null && <td className="p-3 text-muted-foreground">{branchNameOf(branches, movement.branchId)}</td>}
                    <td className="p-3 text-right">{round3(movement.qtyBefore)}</td>
                    <td className={`p-3 text-right font-semibold ${movement.qtyChange > 0 ? "text-success" : "text-destructive"}`}>
                      {movement.qtyChange > 0 ? "+" : ""}{round3(movement.qtyChange)}
                    </td>
                    <td className="p-3 text-right">{fmtQty(movement.qtyAfter, unit)}</td>
                    <td className="p-3 text-muted-foreground">{movement.ref}</td>
                    <td className="p-3 text-muted-foreground">{fmtDateTime(movement.at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ wastage

function WastageTab({
  branchId,
  branches,
  productById,
}: {
  branchId: string | null;
  branches: Branch[];
  productById: Map<string, Product>;
}) {
  const canSeeCosts = useHasPermission("reports");
  return (
    <div className="space-y-5">
      <WastageLedger branchId={branchId} branches={branches} productById={productById} />
      {canSeeCosts && <WastageCost branchId={branchId} productById={productById} />}
    </div>
  );
}

function WastageLedger({
  branchId,
  branches,
  productById,
}: {
  branchId: string | null;
  branches: Branch[];
  productById: Map<string, Product>;
}) {
  const movementsQuery = useInventoryMovements({ branchId: branchId ?? undefined, type: "WASTAGE", limit: LEDGER_LIMIT });
  const rows = useMemo(() => movementsQuery.data ?? [], [movementsQuery.data]);

  return (
    <div className="space-y-2">
      {movementsQuery.isError ? (
        <QueryFailed error={movementsQuery.error} retrying={movementsQuery.isFetching} onRetry={() => void movementsQuery.refetch()} />
      ) : movementsQuery.isPending ? (
        <TableSkeleton rows={5} cols={3} />
      ) : rows.length === 0 ? (
        <EmptyState icon="🗑️" title="No wastage recorded" body="Nothing has been written off at this branch." />
      ) : (
        rows.map((movement) => (
          <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
            <span className="font-medium">
              {labelOf(productById, movement.productId)} — {fmtQty(Math.abs(movement.qtyChange), unitOf(productById, movement.productId))}
            </span>
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
              <Badge variant="secondary">{movement.ref}</Badge>
              {branchId === null && <span>{branchNameOf(branches, movement.branchId)}</span>}
              <span>{fmtDateTime(movement.at)}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** Reason and cost only exist on `/reports/wastage`, which needs the `reports` permission. */
function WastageCost({ branchId, productById }: { branchId: string | null; productById: Map<string, Product> }) {
  const reportQuery = useWastageReport({ branchId: branchId ?? undefined, days: WASTAGE_LOOKBACK_DAYS });
  const rows = useMemo(() => reportQuery.data?.rows ?? [], [reportQuery.data]);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Costed wastage, last {WASTAGE_LOOKBACK_DAYS} days
      </p>
      {reportQuery.isError ? (
        <QueryFailed error={reportQuery.error} retrying={reportQuery.isFetching} onRetry={() => void reportQuery.refetch()} />
      ) : reportQuery.isPending ? (
        <TableSkeleton rows={4} cols={3} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No wastage booked in this window.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3 text-right">Qty</th>
                  <th className="p-3 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.productId}:${row.reason}:${index}`} className="border-t">
                    <td className="p-3">
                      <span className="flex items-center gap-2 font-medium">
                        <ProductImage
                          name={productById.get(row.productId)?.name}
                          productId={row.productId}
                          sku={productById.get(row.productId)?.sku}
                          className="h-8 w-8 rounded-md"
                        />
                        {labelOf(productById, row.productId)}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{row.reason}</td>
                    <td className="p-3 text-right">{fmtQty(row.qty, unitOf(productById, row.productId))}</td>
                    <td className="p-3 text-right">{money(row.costValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm">
            <span className="font-semibold">Total cost of wastage</span>
            <span className="font-display font-bold">{money(reportQuery.data?.total ?? 0)}</span>
          </div>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------- ledger-derived grouping

interface ConversionGroup {
  ref: string;
  at: string;
  inputProductId: string | null;
  inputQty: number;
  lines: { productId: string; qty: number }[];
  wasteQty: number;
}

function groupConversions(inputs: Movement[], outputs: Movement[]): ConversionGroup[] {
  const drafts = new Map<string, { at: number; inputProductId: string | null; inputQty: number; qtyByProduct: Map<string, number> }>();

  const draftFor = (ref: string, movement: Movement) => {
    const draft = drafts.get(ref) ?? { at: 0, inputProductId: null, inputQty: 0, qtyByProduct: new Map() };
    draft.at = Math.max(draft.at, Date.parse(movement.at));
    return draft;
  };

  for (const movement of inputs) {
    const draft = draftFor(movement.ref, movement);
    draft.inputProductId = movement.productId;
    draft.inputQty += Math.abs(movement.qtyChange);
    drafts.set(movement.ref, draft);
  }
  for (const movement of outputs) {
    const draft = draftFor(movement.ref, movement);
    draft.qtyByProduct.set(movement.productId, (draft.qtyByProduct.get(movement.productId) ?? 0) + movement.qtyChange);
    drafts.set(movement.ref, draft);
  }

  return [...drafts.entries()]
    .map(([ref, draft]) => {
      const lines = [...draft.qtyByProduct.entries()].map(([productId, qty]) => ({ productId, qty }));
      const outputQty = lines.reduce((sum, line) => sum + line.qty, 0);
      return {
        ref,
        at: new Date(draft.at).toISOString(),
        inputProductId: draft.inputProductId,
        inputQty: draft.inputQty,
        lines,
        // The server rejects a conversion unless outputs + waste equals the input.
        wasteQty: round3(draft.inputQty - outputQty),
      };
    })
    .sort((left, right) => right.at.localeCompare(left.at));
}

// ----------------------------------------------------------------- transfers

function TransfersTab({
  branchId,
  branches,
  productById,
  activeBranchId,
}: {
  branchId: string | null;
  branches: Branch[];
  productById: Map<string, Product>;
  activeBranchId: string | null;
}) {
  const user = useUser();
  const crossBranch = user?.role === "super_admin" || user?.role === "manager";
  const transfersQuery = useTransfers({ branchId: branchId ?? undefined });
  const receive = useReceiveTransfer();
  const finishStockWrites = useStockWriteDone();
  const rows = transfersQuery.data ?? [];

  if (transfersQuery.isError) {
    return <QueryFailed error={transfersQuery.error} retrying={transfersQuery.isFetching} onRetry={() => void transfersQuery.refetch()} />;
  }
  if (transfersQuery.isPending) return <TableSkeleton rows={4} cols={4} />;
  if (rows.length === 0) return <EmptyState icon="🚚" title="No transfers yet" />;

  return (
    <div className="space-y-2">
      {rows.map((transfer) => {
        // Only the destination branch credits the stock; cross-branch roles may receive anywhere.
        const canReceive = transfer.status === "IN_TRANSIT" && (crossBranch || activeBranchId === transfer.toBranchId);
        return (
          <div key={transfer.id} className="rounded-lg border px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{transfer.ref}</span>
                <StatusPill status={transfer.status} />
                <span className="text-muted-foreground">{branchNameOf(branches, transfer.fromBranchId)} → {branchNameOf(branches, transfer.toBranchId)}</span>
              </div>
              <span className="text-xs text-muted-foreground">{transfer.items.length} item(s) · {fmtDateTime(transfer.at)}</span>
            </div>
            <p className="mt-2 text-muted-foreground">
              {transfer.items.map((line) => `${labelOf(productById, line.productId)} ${fmtQty(line.qty, productById.get(line.productId)?.baseUnit)}`).join(" · ")}
            </p>
            {transfer.note && <p className="mt-1 text-xs italic text-muted-foreground">{transfer.note}</p>}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {transfer.status === "COMPLETED" && transfer.receivedAt
                  ? `Received ${fmtDateTime(transfer.receivedAt)}`
                  : "In transit — the destination branch has not received it yet."}
              </span>
              {transfer.status === "IN_TRANSIT" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canReceive || receive.isPending}
                  onClick={() =>
                    receive.mutate(transfer.id, {
                      onSuccess: () => {
                        finishStockWrites();
                        toast.success(`Received — ${transfer.ref}`);
                      },
                      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not receive this transfer."),
                    })
                  }
                >
                  {receive.isPending ? "Receiving…" : "Receive"}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------- conversions

function ConversionsTab({ branchId, productById }: { branchId: string | null; productById: Map<string, Product> }) {
  const inputs = useInventoryMovements({ branchId: branchId ?? undefined, type: "CONVERSION_INPUT", limit: LEDGER_LIMIT });
  const outputs = useInventoryMovements({ branchId: branchId ?? undefined, type: "CONVERSION_OUTPUT", limit: LEDGER_LIMIT });
  const groups = useMemo(() => groupConversions(inputs.data ?? [], outputs.data ?? []), [inputs.data, outputs.data]);
  const failed = inputs.error instanceof ApiError || outputs.error instanceof ApiError ? (inputs.error ?? outputs.error) : null;

  const retry = () => {
    void inputs.refetch();
    void outputs.refetch();
  };

  if (failed) return <QueryFailed error={failed} retrying={inputs.isFetching || outputs.isFetching} onRetry={retry} />;
  if (inputs.isPending && outputs.isPending) return <TableSkeleton rows={4} cols={4} />;
  if (groups.length === 0) return <EmptyState icon="✂️" title="No conversions yet" body="Cut whole chicken into parts to book a conversion." />;

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const inputLabel = group.inputProductId ? labelOf(productById, group.inputProductId) : "Unknown product";
        const inputUnit = unitOf(productById, group.inputProductId ?? "");
        return (
          <div key={group.ref} className="rounded-lg border px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{group.ref}</span>
              <StatusPill status="COMPLETED" />
            </div>
            <div className="mt-2 text-muted-foreground">
              Input: {inputLabel} {fmtQty(group.inputQty, inputUnit)} → Outputs:{" "}
              {group.lines.map((line) => `${labelOf(productById, line.productId)} ${fmtQty(line.qty, unitOf(productById, line.productId))}`).join(", ") || "—"} · Waste:{" "}
              {fmtQty(group.wasteQty, inputUnit)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(group.at)}</p>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------- write dialogs

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
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {children}
          {apiError && (
            <Alert variant="destructive">
              <AlertTitle>{apiError.code === "INSUFFICIENT_STOCK" ? "Not enough stock" : "Not recorded"}</AlertTitle>
              <AlertDescription>{apiError.message} Nothing was moved — the ledger rolled back in full.</AlertDescription>
            </Alert>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSubmit} disabled={!canSubmit || pending}>{pending ? "Saving…" : submitLabel}</Button>
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
  excludeId,
}: {
  label: string;
  branches: Branch[];
  value: string;
  onChange: (branchId: string) => void;
  excludeId?: string;
}) {
  const options = branches.filter((branch) => branch.id !== excludeId);
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1"><SelectValue placeholder="Select branch" /></SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No other branch available</p>
          ) : (
            options.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function ProductPicker({
  label,
  products,
  value,
  onChange,
}: {
  label: string;
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1"><SelectValue placeholder="Select product" /></SelectTrigger>
        <SelectContent>
          {products.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No products yet</p>
          ) : (
            products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                <span className="flex items-center gap-2">
                  <ProductImage name={product.name} productId={product.id} sku={product.sku} className="h-6 w-6 rounded" />
                  {product.name}
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function QtyField({
  label,
  product,
  value,
  onChange,
}: {
  label: string;
  product: Product | undefined;
  value: string;
  onChange: (qty: string) => void;
}) {
  const unit = product?.baseUnit === "KG" ? "kg" : product?.baseUnit === "PIECE" ? "pcs" : "units";
  return (
    <div>
      <Label>{label} ({unit})</Label>
      <Input type="number" step="0.001" min="0" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1" />
    </div>
  );
}

/** Read-only ledger quantity; the server's `INSUFFICIENT_STOCK` answer stays the only gate. */
function AvailableNote({ branchId, product, balances }: { branchId: string; product: Product | undefined; balances: InventoryBalance[] | undefined }) {
  if (!product || !branchId) return null;
  const qty = balances?.find((balance) => balance.productId === product.id && balance.branchId === branchId)?.qty;
  if (qty === undefined) return null;
  return <p className="text-xs text-muted-foreground">On hand here: {fmtQty(qty, product.baseUnit)}</p>;
}

function useDialogBranch(branches: Branch[], activeBranchId: string | null) {
  const [branchChoice, setBranchChoice] = useState<string>(activeBranchId ?? (branches[0]?.id ?? ""));
  const select = (
    <BranchPicker label="Branch" branches={branches} value={branchChoice} onChange={setBranchChoice} />
  );
  return { branchId: branchChoice, select };
}

function ReceiveDialog({
  branches,
  activeBranchId,
  products,
  onClose,
}: {
  branches: Branch[];
  activeBranchId: string | null;
  products: Product[];
  onClose: () => void;
}) {
  const { branchId, select: branchSelect } = useDialogBranch(branches, activeBranchId);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplierChoice, setSupplierChoice] = useState(ALL);
  const product = products.find((item) => item.id === productId);
  // `/suppliers` is purchasing-scoped, so an inventory-only user must not fire it.
  const canLinkSupplier = useHasPermission("purchasing");
  const receive = useReceiveStock();
  const finishStockWrites = useStockWriteDone();

  const numQty = Number(qty);
  const canSubmit = Boolean(productId && branchId) && numQty > 0;

  function save() {
    receive.mutate(
      {
        productId,
        branchId,
        qty: numQty,
        unitCost: unitCost ? Number(unitCost) : undefined,
        supplierId: canLinkSupplier && supplierChoice !== ALL ? supplierChoice : undefined,
      },
      {
        onSuccess: (receipt) => {
          finishStockWrites();
          toast.success(`Stock received — ${receipt.ref}`);
          onClose();
        },
      },
    );
  }

  return (
    <DialogShell title="Receive Stock" error={receive.error} pending={receive.isPending} canSubmit={canSubmit} submitLabel="Receive" onClose={onClose} onSubmit={save}>
      {branchSelect}
      <ProductPicker label="Product" products={products} value={productId} onChange={setProductId} />
      <QtyField label="Quantity" product={product} value={qty} onChange={setQty} />
      <div>
        <Label>Unit Cost (KSh, optional)</Label>
        <Input type="number" step="0.01" min="0" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="mt-1" />
        <FieldFailure error={receive.error} field="unitCost" />
      </div>
      {canLinkSupplier && <SupplierPicker value={supplierChoice} onChange={setSupplierChoice} />}
      <FieldFailure error={receive.error} field="qty" />
    </DialogShell>
  );
}

function SupplierPicker({ value, onChange }: { value: string; onChange: (supplierId: string) => void }) {
  const suppliersQuery = useSupplierList();
  const suppliers = useMemo(() => suppliersQuery.data ?? [], [suppliersQuery.data]);
  return (
    <div>
      <Label>Supplier (optional)</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1"><SelectValue placeholder={suppliersQuery.isPending ? "Loading suppliers…" : "Not linked"} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Not linked</SelectItem>
          {suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function WastageDialog({
  branches,
  activeBranchId,
  products,
  onClose,
}: {
  branches: Branch[];
  activeBranchId: string | null;
  products: Product[];
  onClose: () => void;
}) {
  const { branchId, select: branchSelect } = useDialogBranch(branches, activeBranchId);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<WastageReason>("Spoilage");
  const [notes, setNotes] = useState("");
  const product = products.find((item) => item.id === productId);
  const balancesQuery = useInventoryBalances({ branchId: branchId || undefined });
  const wastage = useRecordWastage();
  const finishStockWrites = useStockWriteDone();

  const numQty = Number(qty);
  const canSubmit = Boolean(productId && branchId) && numQty > 0;

  function save() {
    wastage.mutate(
      { productId, branchId, qty: numQty, reason, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          finishStockWrites();
          toast.success("Wastage recorded");
          onClose();
        },
      },
    );
  }

  return (
    <DialogShell title="Record Wastage" error={wastage.error} pending={wastage.isPending} canSubmit={canSubmit} submitLabel="Record" onClose={onClose} onSubmit={save}>
      {branchSelect}
      <ProductPicker label="Product" products={products} value={productId} onChange={setProductId} />
      <QtyField label="Quantity" product={product} value={qty} onChange={setQty} />
      <AvailableNote branchId={branchId} product={product} balances={balancesQuery.data} />
      <div>
        <Label>Reason</Label>
        <Select value={reason} onValueChange={(value) => setReason(value as WastageReason)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WASTAGE_REASONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1" />
      </div>
      <FieldFailure error={wastage.error} field="qty" />
    </DialogShell>
  );
}

function TransferDialog({
  branches,
  activeBranchId,
  products,
  productById,
  onClose,
}: {
  branches: Branch[];
  activeBranchId: string | null;
  products: Product[];
  productById: Map<string, Product>;
  onClose: () => void;
}) {
  const [fromBranchId, setFromBranchId] = useState<string>(activeBranchId ?? (branches[0]?.id ?? ""));
  const [toBranchId, setToBranchId] = useState("");
  const [items, setItems] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const transfer = useTransferStock();
  const finishStockWrites = useStockWriteDone();
  const sourceBalancesQuery = useInventoryBalances({ branchId: fromBranchId || undefined });

  const lines = Object.entries(items)
    .map(([productId, value]) => ({ productId, qty: Number(value) }))
    .filter((line) => line.productId && line.qty > 0);
  const canSubmit = Boolean(fromBranchId && toBranchId) && fromBranchId !== toBranchId && lines.length > 0;

  function save() {
    transfer.mutate(
      { fromBranchId, toBranchId, items: lines, note: note.trim() || undefined },
      {
        onSuccess: (created) => {
          finishStockWrites();
          toast.success(`Transfer dispatched — ${created.ref}`);
          onClose();
        },
      },
    );
  }

  return (
    <DialogShell title="Stock Transfer" error={transfer.error} pending={transfer.isPending} canSubmit={canSubmit} submitLabel="Dispatch" onClose={onClose} onSubmit={save} wide>
      <div className="grid grid-cols-2 gap-3">
        <BranchPicker label="From" branches={branches} value={fromBranchId} onChange={setFromBranchId} excludeId={toBranchId} />
        <BranchPicker label="To" branches={branches} value={toBranchId} onChange={setToBranchId} excludeId={fromBranchId} />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
        {products.length === 0 && <p className="text-sm text-muted-foreground">No products yet</p>}
        {products.map((product) => {
          const available = fromBranchId ? sourceBalancesQuery.data?.find((balance) => balance.productId === product.id && balance.branchId === fromBranchId)?.qty : undefined;
          return (
            <div key={product.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm">
                {labelOf(productById, product.id)}
                {available !== undefined && <span className="ml-2 text-xs text-muted-foreground">{fmtQty(available, product.baseUnit)} on hand</span>}
              </span>
              <Input
                type="number"
                step="0.001"
                min="0"
                placeholder="0"
                value={items[product.id] ?? ""}
                onChange={(event) => setItems((state) => ({ ...state, [product.id]: event.target.value }))}
                className="w-24"
              />
              <span className="w-10 text-xs text-muted-foreground">{product.baseUnit === "KG" ? "kg" : "pcs"}</span>
            </div>
          );
        })}
      </div>
      <div>
        <Label>Note (optional)</Label>
        <Input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1" />
      </div>
      <p className="text-xs text-muted-foreground">Dispatching is all-or-nothing: if any line is short, the server rejects the whole batch. The destination branch then receives the stock to complete the transfer.</p>
    </DialogShell>
  );
}

function AdjustDialog({
  branches,
  activeBranchId,
  products,
  onClose,
}: {
  branches: Branch[];
  activeBranchId: string | null;
  products: Product[];
  onClose: () => void;
}) {
  const { branchId, select: branchSelect } = useDialogBranch(branches, activeBranchId);
  const [productId, setProductId] = useState("");
  const [qtyChange, setQtyChange] = useState("");
  const [reason, setReason] = useState("");
  const product = products.find((item) => item.id === productId);
  const balancesQuery = useInventoryBalances({ branchId: branchId || undefined });
  const adjust = useAdjustStock();
  const finishStockWrites = useStockWriteDone();

  const numQty = Number(qtyChange);
  const canSubmit = Boolean(productId && branchId) && !Number.isNaN(numQty) && numQty !== 0 && reason.trim().length > 0;

  function save() {
    adjust.mutate(
      { productId, branchId, qtyChange: numQty, reason: reason.trim() },
      {
        onSuccess: (record) => {
          finishStockWrites();
          toast.success(`Adjustment recorded — ${record.ref}`);
          onClose();
        },
      },
    );
  }

  return (
    <DialogShell title="Stock Adjustment" error={adjust.error} pending={adjust.isPending} canSubmit={canSubmit} submitLabel="Adjust" onClose={onClose} onSubmit={save}>
      {branchSelect}
      <ProductPicker label="Product" products={products} value={productId} onChange={setProductId} />
      <div>
        <Label>Quantity (+/-)</Label>
        <Input type="number" step="0.001" value={qtyChange} onChange={(event) => setQtyChange(event.target.value)} className="mt-1" placeholder="e.g. -2 or +5" />
      </div>
      <AvailableNote branchId={branchId} product={product} balances={balancesQuery.data} />
      <div>
        <Label>Reason</Label>
        <Input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1" />
        <FieldFailure error={adjust.error} field="reason" />
      </div>
      <FieldFailure error={adjust.error} field="qtyChange" />
    </DialogShell>
  );
}

function ConvertDialog({
  branches,
  activeBranchId,
  products,
  onClose,
}: {
  branches: Branch[];
  activeBranchId: string | null;
  products: Product[];
  onClose: () => void;
}) {
  const { branchId, select: branchSelect } = useDialogBranch(branches, activeBranchId);
  const [inputProductId, setInputProductId] = useState("");
  const [inputQty, setInputQty] = useState("");
  const [outputQuantities, setOutputQuantities] = useState<Record<string, string>>({});
  const [wasteQty, setWasteQty] = useState("0");
  const [note, setNote] = useState("");
  const [booked, setBooked] = useState<Conversion | null>(null);
  const kgProducts = useMemo(() => products.filter((product) => product.baseUnit === "KG"), [products]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const inputProduct = productById.get(inputProductId);
  const balancesQuery = useInventoryBalances({ branchId: branchId || undefined });
  const convert = useConvertStock();
  const finishStockWrites = useStockWriteDone();

  const numInput = round3(Number(inputQty));
  const lines = Object.entries(outputQuantities)
    .map(([productId, quantity]) => ({ productId, qty: round3(Number(quantity)) }))
    .filter((line) => line.qty > 0 && line.productId !== inputProductId);
  const outputTotal = round3(lines.reduce((total, line) => total + line.qty, 0));
  const numWaste = round3(Number(wasteQty));
  const remainder = round3(numInput - outputTotal - numWaste);
  const hasValidPrecision = [inputQty, wasteQty, ...Object.values(outputQuantities)]
    .filter((value) => value !== "")
    .every((value) => {
      const quantity = Number(value);
      return (
        Number.isFinite(quantity) &&
        quantity >= 0 &&
        Math.abs(quantity - round3(quantity)) < 0.000001
      );
    });
  const canSubmit =
    Boolean(inputProductId && branchId) &&
    numInput > 0 &&
    lines.length > 0 &&
    numWaste >= 0 &&
    hasValidPrecision &&
    Math.abs(remainder) < 0.0005;

  function save() {
    convert.mutate(
      {
        branchId,
        input: { productId: inputProductId, qty: numInput },
        outputs: lines,
        wasteQty: numWaste,
        note: note.trim() || undefined,
      },
      {
        onSuccess: (conversion) => {
          finishStockWrites();
          toast.success(`Conversion complete — ${conversion.ref}`);
          setBooked(conversion);
        },
      },
    );
  }

  return (
    <DialogShell title="Stock Conversion / Cutting" error={convert.error} pending={convert.isPending} canSubmit={canSubmit} submitLabel="Convert" onClose={onClose} onSubmit={save} wide>
      {branchSelect}
      <div>
        <Label>Input Product (whole chicken)</Label>
        <Select value={inputProductId} onValueChange={setInputProductId}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            {kgProducts.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                <span className="flex items-center gap-2">
                  <ProductImage name={product.name} productId={product.id} sku={product.sku} className="h-6 w-6 rounded" />
                  {product.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <QtyField label="Input Quantity" product={inputProduct} value={inputQty} onChange={setInputQty} />
      <AvailableNote branchId={branchId} product={inputProduct} balances={balancesQuery.data} />
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Output Products
        </p>
        {kgProducts.filter((product) => product.id !== inputProductId).map((product) => {
          const value = outputQuantities[product.id] ?? "";
          return (
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
                aria-label={`${product.name} output quantity (kg)`}
                type="number"
                min="0"
                step="0.001"
                value={value}
                onChange={(event) =>
                  setOutputQuantities((current) => ({
                    ...current,
                    [product.id]: event.target.value,
                  }))
                }
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">kg</span>
            </div>
          );
        })}
      </div>
      <div>
        <Label htmlFor="conversion-waste">Waste (kg)</Label>
        <Input
          id="conversion-waste"
          type="number"
          min="0"
          step="0.001"
          value={wasteQty}
          onChange={(event) => setWasteQty(event.target.value)}
          className="mt-1"
        />
      </div>
      <p className={`text-xs ${canSubmit ? "text-muted-foreground" : "text-destructive"}`}>
        Outputs + waste must equal the input quantity.
        {inputQty !== "" && Number.isFinite(remainder) && ` Difference: ${fmtKg(remainder)} kg`}
      </p>
      <div>
        <Label>Note (optional)</Label>
        <Input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1" />
      </div>
      <FieldFailure error={convert.error} field="wasteQty" />

      {booked && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{booked.ref}</span>
            <StatusPill status={booked.status} />
          </div>
          <p className="mt-2 text-muted-foreground">
            Booked input: {labelOf(productById, booked.input.productId)} {fmtQty(booked.input.qty, unitOf(productById, booked.input.productId))}
          </p>
          <p className="text-muted-foreground">
            Booked outputs: {booked.outputs.map((line) => `${labelOf(productById, line.productId)} ${fmtQty(line.qty, unitOf(productById, line.productId))}`).join(", ") || "—"} · Waste:{" "}
            {fmtQty(booked.wasteQty, unitOf(productById, booked.input.productId))}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setBooked(null);
                setOutputQuantities({});
                setInputQty("");
                setInputProductId("");
                setWasteQty("0");
              }}
            >
              Convert again
            </Button>
            <Button size="sm" onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </DialogShell>
  );
}
