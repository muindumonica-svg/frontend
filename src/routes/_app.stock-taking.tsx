import { createFileRoute, redirect } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import {
  hasPermission,
  landingPathFor,
  loadSession,
  useActiveBranchId,
  useHasPermission,
  useSession,
  useSessionBranches,
} from "@/api/hooks/auth";
import { useCategoryList, useProductList } from "@/api/hooks/catalog";
import {
  useAcceptStockTakeCount,
  useApproveStockTake,
  usePostStockTake,
  useRejectStockTake,
  useRequestStockTakeRedo,
  useReverseStockTake,
  useReviewStockTake,
  useSetStockTakeCounts,
  useStartStockTake,
  useSubmitStockTakeRecount,
  useStockTake,
  useStockTakeList,
  useStockTakeJournal,
  useSubmitStockTake,
} from "@/api/hooks/stocktaking";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { ProductImage } from "@/components/product-image";
import { EmptyState, PageHeader, StatusPill } from "@/components/shared";
import { ApiError, fieldError } from "@/lib/api";
import { fmtDateTime, fmtKg, money, round3 } from "@/lib/money";
import type {
  BaseUnit,
  Branch,
  Category,
  Product,
  StockTake,
  StockTakeCountInput,
  StockTakeItem,
  StockTakeRecountInput,
  StockTakeVarianceInput,
  StockTakeVarianceSummary,
} from "@/types/api";

export const Route = createFileRoute("/_app/stock-taking")({
  beforeLoad: async () => {
    const session = await loadSession();
    if (!session) throw redirect({ to: "/staff/login" });
    if (!hasPermission(session, "stock_take")) throw redirect({ to: landingPathFor(session) });
  },
  component: StockTakingPage,
});

/** Radix `SelectItem` rejects an empty value, so "no filter" needs a sentinel. */
const ALL = "__all__";
const AUTOSAVE_DEBOUNCE_MS = 800;
const VARIANCE_EPSILON = 0.0005;
const POSITIVE_VARIANCE_REASONS = [
  ["UNRECORDED_RECEIPT", "Previous stock receiving was not recorded"],
  ["EXTRA_SUPPLIER_DELIVERY", "Supplier delivered additional quantity"],
  ["PREVIOUS_COUNT_ERROR", "Previous counting error"],
  ["UNRECORDED_TRANSFER_IN", "Stock transfer received but not recorded"],
  ["UNIT_CONVERSION", "Unit conversion discrepancy"],
  ["OTHER", "Other"],
] as const;
const NEGATIVE_VARIANCE_REASONS = [
  ["SPOILAGE", "Poultry spoilage"],
  ["DAMAGE", "Damaged stock"],
  ["PROCESSING_WASTE", "Cutting or processing wastage"],
  ["SALES_DEDUCTION_ERROR", "Incorrect previous sales deduction"],
  ["SUSPECTED_THEFT", "Theft or suspected loss"],
  ["UNRECORDED_TRANSFER_OUT", "Unrecorded stock transfer"],
  ["WEIGHT_LOSS", "Weight loss during storage or handling"],
  ["PREVIOUS_COUNT_ERROR", "Previous counting error"],
  ["OTHER", "Other"],
] as const;
const ALL_VARIANCE_REASONS = [
  ...POSITIVE_VARIANCE_REASONS,
  ...NEGATIVE_VARIANCE_REASONS.filter(
    ([value]) => !POSITIVE_VARIANCE_REASONS.some(([positive]) => positive === value),
  ),
];

const CODE_TITLES: Record<string, string> = {
  APPROVAL_REQUIRED: "Approval required",
  STOCK_TAKE_NOT_SUBMITTED: "Sheet not submitted",
};

function fmtQty(qty: number, unit: BaseUnit | undefined): string {
  if (unit === "KG") return fmtKg(qty);
  if (unit === "PIECE") return `${round3(qty)} pcs`;
  return String(round3(qty));
}

function labelOf(product: Product | undefined, productId: string, fallbackName?: string): string {
  if (product) return product.name;
  return fallbackName ?? productId;
}

function branchNameOf(branches: Branch[], branchId: string): string {
  return branches.find((branch) => branch.id === branchId)?.name ?? branchId;
}

function apiErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "The server rejected this action.";
}

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} className="h-24 rounded-xl" />
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

/** 422 state errors (`APPROVAL_REQUIRED`, `STOCK_TAKE_NOT_SUBMITTED`) keep the server message. */
function ApiErrorAlert({ error, fallbackTitle }: { error: ApiError; fallbackTitle: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{(error.code && CODE_TITLES[error.code]) ?? fallbackTitle}</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  );
}

function DialogShell({
  title,
  error,
  pending,
  canSubmit,
  submitLabel,
  destructive = false,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  error: unknown;
  pending: boolean;
  canSubmit: boolean;
  submitLabel: string;
  destructive?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const apiError = error instanceof ApiError ? error : null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {children}
          {apiError && <ApiErrorAlert error={apiError} fallbackTitle="Not recorded" />}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onSubmit}
            disabled={!canSubmit || pending}
          >
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StockTakingPage() {
  const branches = useSessionBranches();
  const activeBranchId = useActiveBranchId();
  const session = useSession();
  const currentUserId = session.data?.user.id ?? null;
  const canApprove = useHasPermission("stock_take_approve");

  const [branchChoice, setBranchChoice] = useState<string>(ALL);
  const [statusChoice, setStatusChoice] = useState<string>(ALL);
  const [categoryChoice, setCategoryChoice] = useState<string>(ALL);
  const [productChoice, setProductChoice] = useState<string>(ALL);
  const [varianceChoice, setVarianceChoice] = useState<string>(ALL);
  const [startOpen, setStartOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [journalId, setJournalId] = useState<string | null>(null);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [variances, setVariances] = useState<StockTakeVarianceSummary | null>(null);

  const productsQuery = useProductList();
  const categoriesQuery = useCategoryList();
  const categories = categoriesQuery.data ?? [];
  const productById = useMemo(
    () => new Map((productsQuery.data ?? []).map((product) => [product.id, product])),
    [productsQuery.data],
  );

  const branchId = branchChoice === ALL ? undefined : branchChoice;
  const takesQuery = useStockTakeList({
    ...(branchId ? { branchId } : {}),
    ...(statusChoice !== ALL ? { status: statusChoice as StockTake["status"] } : {}),
    ...(categoryChoice !== ALL ? { categoryId: categoryChoice } : {}),
    ...(productChoice !== ALL ? { productId: productChoice } : {}),
    ...(varianceChoice !== ALL
      ? { varianceType: varianceChoice as "POSITIVE" | "NEGATIVE" | "ZERO" }
      : {}),
  });
  const takes = useMemo(
    () =>
      [...(takesQuery.data ?? [])].sort((left, right) =>
        right.startedAt.localeCompare(left.startedAt),
      ),
    [takesQuery.data],
  );

  return (
    <div className="pb-10">
      <PageHeader
        title="Stock Taking"
        subtitle="Sessions, counting, variances and approval workflow"
        actions={<Button onClick={() => setStartOpen(true)}>New Stock Take</Button>}
      />
      <div className="space-y-4 px-4 py-5 md:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {branches.length > 1 && (
            <div>
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
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusChoice} onValueChange={setStatusChoice}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {[
                  "IN_PROGRESS",
                  "RECOUNT_REQUIRED",
                  "SUBMITTED",
                  "UNDER_REVIEW",
                  "APPROVED",
                  "POSTED",
                  "REJECTED",
                ].map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={categoryChoice} onValueChange={setCategoryChoice}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Product</Label>
            <Select value={productChoice} onValueChange={setProductChoice}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All products</SelectItem>
                {(productsQuery.data ?? []).map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Variance</Label>
            <Select value={varianceChoice} onValueChange={setVarianceChoice}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All variances</SelectItem>
                <SelectItem value="POSITIVE">Positive</SelectItem>
                <SelectItem value="NEGATIVE">Negative</SelectItem>
                <SelectItem value="ZERO">Matched</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {takesQuery.isError ? (
          <QueryFailed
            error={takesQuery.error}
            retrying={takesQuery.isFetching}
            onRetry={() => void takesQuery.refetch()}
          />
        ) : takesQuery.isPending ? (
          <CardSkeleton rows={3} />
        ) : takes.length === 0 ? (
          <EmptyState
            icon="🔎"
            title="No stock takes yet"
            body="Start a session to snapshot system quantities and count physical stock."
          />
        ) : (
          takes.map((take) => (
            <StockTakeCard
              key={take.id}
              take={take}
              branches={branches}
              canApprove={canApprove}
              currentUserId={currentUserId}
              onOpen={setOpenId}
              onReject={setRejectId}
              onJournal={setJournalId}
              onReverse={setReverseId}
              onApproved={(summary) => setVariances(summary)}
            />
          ))
        )}
      </div>

      {openId && (
        <CountSheet
          key={openId}
          stockTakeId={openId}
          branches={branches}
          categories={categories}
          productById={productById}
          canApprove={canApprove}
          currentUserId={currentUserId}
          onApproved={(summary) => {
            setOpenId(null);
            setVariances(summary);
          }}
          onRequestReject={(stockTakeId) => {
            setOpenId(null);
            setRejectId(stockTakeId);
          }}
          onClose={() => setOpenId(null)}
        />
      )}
      {startOpen && (
        <StartDialog
          branches={branches}
          activeBranchId={activeBranchId}
          products={productsQuery.data ?? []}
          onClose={() => setStartOpen(false)}
          onStarted={(take) => {
            setStartOpen(false);
            setOpenId(take.id);
          }}
        />
      )}
      {rejectId && <RejectDialog stockTakeId={rejectId} onClose={() => setRejectId(null)} />}
      {journalId && (
        <StockTakeJournalDialog stockTakeId={journalId} onClose={() => setJournalId(null)} />
      )}
      {reverseId && (
        <ReverseStockTakeDialog stockTakeId={reverseId} onClose={() => setReverseId(null)} />
      )}
      {variances && (
        <VarianceDialog
          summary={variances}
          productById={productById}
          onClose={() => setVariances(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the list

function StockTakeCard({
  take,
  branches,
  canApprove,
  currentUserId,
  onOpen,
  onReject,
  onJournal,
  onReverse,
  onApproved,
}: {
  take: StockTake;
  branches: Branch[];
  canApprove: boolean;
  currentUserId: string | null;
  onOpen: (stockTakeId: string) => void;
  onReject: (stockTakeId: string) => void;
  onJournal: (stockTakeId: string) => void;
  onReverse: (stockTakeId: string) => void;
  onApproved: (summary: StockTakeVarianceSummary) => void;
}) {
  const submit = useSubmitStockTake(take.id);
  const review = useReviewStockTake(take.id);
  const approve = useApproveStockTake(take.id);
  const isCounter = take.agentId === currentUserId || take.assignedTo === currentUserId;

  // Variance counts come from the server-computed `variance` on each item, never client math.
  const varianceCount = take.items.filter(
    (item) => item.variance !== null && Math.abs(item.variance) > VARIANCE_EPSILON,
  ).length;
  const unresolvedCount = take.items.filter((item) => item.action !== "OK").length;
  const busy = submit.isPending || review.isPending || approve.isPending;
  const actionError = submit.error ?? review.error ?? approve.error;

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-base font-bold">{take.ref}</p>
          <p className="text-sm text-muted-foreground">
            {branchNameOf(branches, take.branchId)} · Started {fmtDateTime(take.startedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={take.status} />
          {varianceCount > 0 && <Badge variant="secondary">{varianceCount} variance(s)</Badge>}
          {take.summary.awaitingRecount > 0 && (
            <Badge variant="destructive">{take.summary.awaitingRecount} recount(s) required</Badge>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {["IN_PROGRESS", "RECOUNT_REQUIRED"].includes(take.status) ? (
          <>
            <Button size="sm" onClick={() => onOpen(take.id)}>
              {take.status === "RECOUNT_REQUIRED" ? "Complete recount" : "Count Stock"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || unresolvedCount > 0}
              onClick={() =>
                submit.mutate(undefined, {
                  onSuccess: () => toast.success("Stock take submitted for review"),
                  onError: (error) => toast.error(apiErrorMessage(error)),
                })
              }
            >
              {unresolvedCount > 0 ? `Resolve ${unresolvedCount} item(s)` : "Submit"}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onOpen(take.id)}>
            View Sheet
          </Button>
        )}
        {take.status === "SUBMITTED" && canApprove && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              review.mutate(undefined, {
                onSuccess: () => {
                  toast.success(`${take.ref} moved to review`);
                  onOpen(take.id);
                },
                onError: (error) => toast.error(apiErrorMessage(error)),
              })
            }
          >
            Review
          </Button>
        )}
        {take.status === "UNDER_REVIEW" && canApprove && !isCounter && (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                approve.mutate(undefined, {
                  onSuccess: ({ meta }) => {
                    toast.success(`Approved — ${meta.varianceCount} variance(s) awaiting posting`);
                    onApproved(meta);
                  },
                  onError: (error) => toast.error(apiErrorMessage(error)),
                })
              }
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => onReject(take.id)}
            >
              Reject
            </Button>
          </>
        )}
        {take.status === "UNDER_REVIEW" && canApprove && isCounter && (
          <span className="self-center text-xs text-muted-foreground">
            A different reviewer must approve this count.
          </span>
        )}
        {take.status === "APPROVED" && canApprove && <PostStockTakeButton take={take} />}
        {take.status === "POSTED" && take.journalRef && (
          <Button size="sm" variant="outline" onClick={() => onJournal(take.id)}>
            View journal
          </Button>
        )}
        {take.status === "POSTED" && canApprove && !take.reversedAt && (
          <Button size="sm" variant="destructive" onClick={() => onReverse(take.id)}>
            Reverse posted adjustment
          </Button>
        )}
      </div>

      {["APPROVED", "POSTED"].includes(take.status) && (
        <div className="mt-3 grid gap-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-3">
          <span>Positive inventory value: {money(take.summary.positiveValue)}</span>
          <span>Negative inventory value: {money(take.summary.negativeValue)}</span>
          <span>
            Net inventory movement: {money(take.summary.netInventoryValue)}
            {take.status === "POSTED" && " · Posted"}
          </span>
          <p className="sm:col-span-3 text-muted-foreground">
            Negative adjustment is a potential stock-loss expense, not sales revenue or net profit.
          </p>
        </div>
      )}
      {take.reversalRef && (
        <p className="mt-2 text-xs text-muted-foreground">
          Reversed as {take.reversalRef} · {fmtDateTime(take.reversedAt)}
        </p>
      )}

      {actionError instanceof ApiError && (
        <p className="mt-2 text-xs text-destructive">{apiErrorMessage(actionError)}</p>
      )}
    </div>
  );
}

function PostStockTakeButton({ take }: { take: StockTake }) {
  const post = usePostStockTake(take.id);

  return (
    <Button
      size="sm"
      disabled={post.isPending}
      onClick={() =>
        post.mutate(undefined, {
          onSuccess: ({ meta }) =>
            toast.success(
              `${take.ref} posted — ${meta.movements.length} inventory movement(s) created${meta.journalRef ? `; journal ${meta.journalRef}` : ""}`,
            ),
          onError: (error) => toast.error(apiErrorMessage(error)),
        })
      }
    >
      {post.isPending ? "Posting…" : "Post approved adjustments"}
    </Button>
  );
}

function StockTakeJournalDialog({
  stockTakeId,
  onClose,
}: {
  stockTakeId: string;
  onClose: () => void;
}) {
  const journalQuery = useStockTakeJournal(stockTakeId);
  const journal = journalQuery.data;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Stock adjustment journal</DialogTitle>
        </DialogHeader>
        {journalQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Loading journal…</p>
        ) : journalQuery.isError ? (
          <p className="text-sm text-destructive">{apiErrorMessage(journalQuery.error)}</p>
        ) : journal ? (
          <div className="space-y-4">
            <div className="grid gap-1 text-sm sm:grid-cols-2">
              <span>Reference: {journal.ref}</span>
              <span>Source: {journal.sourceRef}</span>
              <span>Posted: {fmtDateTime(journal.postedAt)}</span>
              <span>Status: {journal.status}</span>
            </div>
            <p className="text-sm text-muted-foreground">{journal.description}</p>
            {[journal, ...(journal.reversal ? [journal.reversal] : [])].map((entry) => (
              <JournalLines key={entry.ref} entry={entry} />
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function JournalLines({
  entry,
}: {
  entry: {
    ref: string;
    description: string;
    postedAt: string;
    lines: Array<{
      accountCode: string | null;
      accountName: string | null;
      description: string;
      debit: number;
      credit: number;
    }>;
    debitTotal: number;
    creditTotal: number;
  };
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold">{entry.ref}</p>
        <p className="text-xs text-muted-foreground">
          {entry.description} · {fmtDateTime(entry.postedAt)}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Account</th>
              <th className="p-2">Description</th>
              <th className="p-2 text-right">Debit</th>
              <th className="p-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((line, index) => (
              <tr className="border-t" key={`${line.accountCode}-${index}`}>
                <td className="p-2">
                  {line.accountCode} · {line.accountName}
                </td>
                <td className="p-2">{line.description}</td>
                <td className="p-2 text-right">{line.debit ? money(line.debit) : "—"}</td>
                <td className="p-2 text-right">{line.credit ? money(line.credit) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/50 font-semibold">
            <tr>
              <td className="p-2" colSpan={2}>
                Balanced totals
              </td>
              <td className="p-2 text-right">{money(entry.debitTotal)}</td>
              <td className="p-2 text-right">{money(entry.creditTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ReverseStockTakeDialog({
  stockTakeId,
  onClose,
}: {
  stockTakeId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const reverse = useReverseStockTake(stockTakeId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse posted stock adjustment</DialogTitle>
        </DialogHeader>
        <Alert>
          <AlertTitle>Auditable reversal</AlertTitle>
          <AlertDescription>
            This creates compensating inventory movements and a reversing journal. The posted
            session and its original counts remain unchanged.
          </AlertDescription>
        </Alert>
        <div className="space-y-2">
          <Label htmlFor="stock-take-reversal-reason">Reason (required)</Label>
          <Textarea
            id="stock-take-reversal-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            maxLength={2000}
          />
        </div>
        {reverse.error && (
          <p className="text-sm text-destructive">{apiErrorMessage(reverse.error)}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reverse.isPending || reason.trim().length < 10}
            onClick={() =>
              reverse.mutate(reason.trim(), {
                onSuccess: ({ data, meta }) => {
                  toast.success(
                    `${data.ref} reversed as ${meta.reversalRef}${meta.journalRef ? `; journal ${meta.journalRef}` : ""}`,
                  );
                  onClose();
                },
                onError: (error) => toast.error(apiErrorMessage(error)),
              })
            }
          >
            {reverse.isPending ? "Reversing…" : "Confirm reversal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------- start sheet

function StartDialog({
  branches,
  activeBranchId,
  products,
  onClose,
  onStarted,
}: {
  branches: Branch[];
  activeBranchId: string | null;
  products: Product[];
  onClose: () => void;
  onStarted: (take: StockTake) => void;
}) {
  const [branchChoice, setBranchChoice] = useState(activeBranchId ?? branches[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<StockTake["mode"]>("FULL");
  const [categoryId, setCategoryId] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [blindCount, setBlindCount] = useState(false);
  const start = useStartStockTake();
  const categoriesQuery = useCategoryList();
  const categories = categoriesQuery.data ?? [];
  const canSubmit =
    branchChoice.length > 0 &&
    (mode !== "CATEGORY" || categoryId.length > 0) &&
    (mode !== "SELECTED" || productIds.length > 0);

  function save() {
    const input = {
      branchId: branchChoice,
      mode,
      blindCount,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(mode === "CATEGORY" && categoryId ? { categoryId } : {}),
      ...(mode === "SELECTED" && productIds.length > 0 ? { productIds } : {}),
    };
    start.mutate(input, {
      onSuccess: (take) => {
        toast.success(`Stock take started — ${take.ref}`);
        onStarted(take);
      },
    });
  }

  return (
    <DialogShell
      title="Start Stock Take"
      error={start.error}
      pending={start.isPending}
      canSubmit={canSubmit}
      submitLabel="Start"
      onClose={onClose}
      onSubmit={save}
    >
      <div>
        <Label>Branch</Label>
        <Select value={branchChoice} onValueChange={setBranchChoice}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select branch" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldFailure error={start.error} field="branchId" />
      </div>
      <div>
        <Label>Counting mode</Label>
        <Select value={mode} onValueChange={(value) => setMode(value as StockTake["mode"])}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FULL">Full stock count</SelectItem>
            <SelectItem value="CATEGORY">Category-specific</SelectItem>
            <SelectItem value="SELECTED">Selected products</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled stock count</SelectItem>
            <SelectItem value="SURPRISE">Surprise stock count</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mode === "CATEGORY" && (
        <div>
          <Label>Stock category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {(categoriesQuery.data ?? []).map((category: Category) => (
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
      )}
      {mode === "SELECTED" && (
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border p-3">
          {products.map((product) => (
            <label key={product.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={productIds.includes(product.id)}
                onChange={(event) =>
                  setProductIds((current) =>
                    event.target.checked
                      ? [...current, product.id]
                      : current.filter((productId) => productId !== product.id),
                  )
                }
              />
              <span className="flex items-center gap-2">
                <ProductImage name={product.name} productId={product.id} sku={product.sku} className="h-8 w-8 rounded" />
                {product.name} <span className="text-muted-foreground">({product.sku})</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={blindCount}
          onChange={(event) => setBlindCount(event.target.checked)}
        />
        Blind count (hide system quantities from the assigned counter)
      </label>
      <div>
        <Label>Note (optional)</Label>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-1" />
        <FieldFailure error={start.error} field="note" />
      </div>
      <p className="text-xs text-muted-foreground">
        Counts are recorded in each product&apos;s inventory base unit. This branch is the stock
        location.
      </p>
    </DialogShell>
  );
}

// ------------------------------------------------------------ count sheet

function CountSheet({
  stockTakeId,
  branches,
  categories,
  productById,
  canApprove,
  currentUserId,
  onApproved,
  onRequestReject,
  onClose,
}: {
  stockTakeId: string;
  branches: Branch[];
  categories: Category[];
  productById: Map<string, Product>;
  canApprove: boolean;
  currentUserId: string | null;
  onApproved: (summary: StockTakeVarianceSummary) => void;
  onRequestReject: (stockTakeId: string) => void;
  onClose: () => void;
}) {
  const takeQuery = useStockTake(stockTakeId);
  const counts = useSetStockTakeCounts(stockTakeId);
  const submit = useSubmitStockTake(stockTakeId);
  const review = useReviewStockTake(stockTakeId);
  const approve = useApproveStockTake(stockTakeId);
  const accept = useAcceptStockTakeCount(stockTakeId);
  const requestRedo = useRequestStockTakeRedo(stockTakeId);
  const recount = useSubmitStockTakeRecount(stockTakeId);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [details, setDetails] = useState<Record<string, StockTakeVarianceInput>>({});
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [redoProductId, setRedoProductId] = useState<string | null>(null);
  const [redoReason, setRedoReason] = useState("");
  const [recountQty, setRecountQty] = useState("");
  const [recountReason, setRecountReason] = useState("");
  const [recountDetails, setRecountDetails] = useState<StockTakeVarianceInput>({});
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const seededForRef = useRef<string | null>(null);

  const take = takeQuery.data;
  const editable = take?.status === "IN_PROGRESS" || take?.status === "RECOUNT_REQUIRED";
  const canRequestRedo = take?.status === "UNDER_REVIEW" || editable;
  const unresolvedCount = take?.items.filter((item) => item.action !== "OK").length ?? 0;
  const isCounter = Boolean(
    take && (take.agentId === currentUserId || take.assignedTo === currentUserId),
  );

  useEffect(() => {
    if (!take || seededForRef.current === take.id) return;
    seededForRef.current = take.id;
    setDrafts(
      Object.fromEntries(
        take.items.map((item) => [
          item.productId,
          item.action === "OK" && item.finalQty !== null
            ? String(item.finalQty)
            : item.countedQty === null
              ? ""
              : String(item.countedQty),
        ]),
      ),
    );
  }, [take]);

  const pendingLines = useMemo(() => {
    if (!take) return [];
    const lines: StockTakeCountInput[] = [];
    for (const item of take.items) {
      const raw = drafts[item.productId];
      if (raw === undefined || raw.trim() === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) continue;
      const counted = round3(value);
      if (item.countedQty !== null && Math.abs(item.countedQty - counted) < VARIANCE_EPSILON)
        continue;
      lines.push({ productId: item.productId, countedQty: counted });
    }
    return lines;
  }, [take, drafts]);

  const signature = JSON.stringify(pendingLines);
  const unsaved = pendingLines.length > 0 && signature !== savedSignature;

  // A till tablet can lose power mid-count, so counts autosave ~800ms after the last keystroke.
  useEffect(() => {
    if (!editable || !unsaved) return;
    const timer = window.setTimeout(() => {
      counts.mutate(pendingLines, {
        onSuccess: () => {
          setSavedSignature(signature);
          setSavedAt(
            new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          );
        },
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [editable, unsaved, pendingLines, signature, counts]);

  function retrySave() {
    counts.mutate(pendingLines, {
      onSuccess: () => {
        setSavedSignature(signature);
        setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      },
    });
  }

  const saveState = counts.isError
    ? "error"
    : counts.isPending
      ? "saving"
      : unsaved
        ? "pending"
        : savedAt
          ? "saved"
          : "idle";
  const searchTerm = search.trim().toLowerCase();
  const visibleItems =
    take?.items.filter(
      (item) =>
        !searchTerm ||
        item.productName?.toLowerCase().includes(searchTerm) ||
        item.sku?.toLowerCase().includes(searchTerm) ||
        item.categoryName?.toLowerCase().includes(searchTerm) ||
        categories
          .find((category) => category.id === item.categoryId)
          ?.name.toLowerCase()
          .includes(searchTerm),
    ) ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{take ? `Count Stock — ${take.ref}` : "Count Stock"}</DialogTitle>
        </DialogHeader>

        {takeQuery.isError ? (
          <QueryFailed
            error={takeQuery.error}
            retrying={takeQuery.isFetching}
            onRetry={() => void takeQuery.refetch()}
          />
        ) : takeQuery.isPending || !take ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, row) => (
              <Skeleton key={row} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {branchNameOf(branches, take.branchId)} · <StatusPill status={take.status} />
              </span>
              {editable && (
                <span className="flex items-center gap-2 text-xs" role="status" aria-live="polite">
                  {saveState === "saving" && "Saving…"}
                  {saveState === "pending" && "Unsaved changes"}
                  {saveState === "saved" && `Saved ${savedAt}`}
                  {saveState === "error" && (
                    <>
                      <span className="text-destructive">Counts not saved</span>
                      <Button size="sm" variant="outline" onClick={retrySave}>
                        Retry
                      </Button>
                    </>
                  )}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-5">
              <span>Products: {take.items.length}</span>
              <span>Accepted: {take.items.filter((item) => item.action === "OK").length}</span>
              <span>
                Matched:{" "}
                {
                  take.items.filter(
                    (item) =>
                      item.action === "OK" && Math.abs(item.variance ?? 0) < VARIANCE_EPSILON,
                  ).length
                }
              </span>
              <span>
                Variances:{" "}
                {
                  take.items.filter(
                    (item) =>
                      item.action === "OK" && Math.abs(item.variance ?? 0) >= VARIANCE_EPSILON,
                  ).length
                }
              </span>
              <span>Recount: {take.items.filter((item) => item.action === "REDO").length}</span>
            </div>
            {take.status === "RECOUNT_REQUIRED" && (
              <Alert>
                <AlertTitle>Recount required</AlertTitle>
                <AlertDescription>
                  Complete each row marked R before submitting the sheet for review again.
                </AlertDescription>
              </Alert>
            )}

            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, SKU, or category"
              aria-label="Search products in stock-taking sheet"
            />

            <div
              className="max-h-[55vh] overflow-auto rounded-lg border"
              aria-label="Stock count table"
            >
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground shadow-sm">
                  <tr>
                    <th scope="col" className="border-b px-3 py-2 text-left">
                      Product
                    </th>
                    <th scope="col" className="border-b px-3 py-2 text-right">
                      Head Count
                    </th>
                    <th scope="col" className="border-b px-3 py-2 text-right">
                      System
                    </th>
                    <th scope="col" className="border-b px-3 py-2 text-right">
                      Difference
                    </th>
                    <th scope="col" className="border-b px-3 py-2 text-left">
                      Approval / Reject
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const product = productById.get(item.productId);
                    const unit = product?.baseUnit ?? item.baseUnit;
                    const categoryName =
                      item.categoryName ??
                      categories.find((category) => category.id === item.categoryId)?.name ??
                      "Uncategorised";
                    const raw = drafts[item.productId] ?? "";
                    const parsed = raw.trim() === "" ? null : Number(raw);
                    const typed = parsed !== null && Number.isFinite(parsed) ? parsed : null;
                    const shownQty = item.action === "OK" ? item.finalQty : typed;
                    const comparisonQty = item.comparisonQty ?? item.systemQty;
                    const previewVariance =
                      shownQty === null || comparisonQty === null
                        ? null
                        : round3(shownQty - comparisonQty);
                    const hasVariance =
                      previewVariance !== null && Math.abs(previewVariance) >= VARIANCE_EPSILON;
                    const rowDetails = details[item.productId] ?? {
                      reasonCategory: "",
                      narration: "",
                      causeClassification: "VERIFIED" as const,
                    };
                    const recountPreview =
                      recountQty.trim() === "" ||
                      !Number.isFinite(Number(recountQty)) ||
                      comparisonQty === null
                        ? null
                        : round3(Number(recountQty) - comparisonQty);
                    const varianceReasons =
                      (previewVariance ?? 0) < 0
                        ? NEGATIVE_VARIANCE_REASONS
                        : (previewVariance ?? 0) > 0
                          ? POSITIVE_VARIANCE_REASONS
                          : ALL_VARIANCE_REASONS;
                    const investigationAvailable =
                      hasVariance ||
                      (take.blindCount && shownQty !== null) ||
                      Boolean(item.narration) ||
                      (item.recounts?.length ?? 0) > 0 ||
                      item.action === "REDO";
                    const investigationOpen = expandedProductId === item.productId;
                    const recountOpen = redoProductId === item.productId && item.action === "OK";
                    const showVarianceFields =
                      hasVariance || (take.blindCount && shownQty !== null);

                    return (
                      <Fragment key={item.productId}>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="border-r px-3 py-2">
                            <div className="font-medium">
                              {labelOf(product, item.productId, item.productName)}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {categoryName}
                              {item.sku ? ` · ${item.sku}` : ""}
                            </div>
                          </td>
                          <td className="border-r px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Input
                                type="number"
                                step="0.001"
                                min="0"
                                placeholder="Count"
                                aria-label={`Head count for ${item.productName ?? item.productId}`}
                                value={raw}
                                disabled={!editable || item.action !== "PENDING"}
                                onChange={(event) =>
                                  setDrafts((state) => ({
                                    ...state,
                                    [item.productId]: event.target.value,
                                  }))
                                }
                                className="h-9 w-28 text-right tabular-nums"
                              />
                              <span className="min-w-8 text-left text-xs text-muted-foreground">
                                {unit ?? "—"}
                              </span>
                            </div>
                          </td>
                          <td className="border-r px-3 py-2 text-right tabular-nums">
                            {item.systemQty === null || comparisonQty === null ? (
                              <span className="text-muted-foreground">Hidden</span>
                            ) : (
                              fmtQty(comparisonQty, unit)
                            )}
                          </td>
                          <td className="border-r px-3 py-2 text-right">
                            {previewVariance === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : Math.abs(previewVariance) < VARIANCE_EPSILON ? (
                              <Badge variant="outline">Match</Badge>
                            ) : (
                              <span
                                className={`font-semibold tabular-nums ${previewVariance < 0 ? "text-destructive" : "text-success"}`}
                              >
                                {previewVariance > 0 ? "+" : ""}
                                {fmtQty(previewVariance, unit)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex min-w-[15rem] flex-wrap items-center gap-1.5">
                              {item.action === "OK" ? (
                                <Badge variant="outline">Count accepted</Badge>
                              ) : item.action === "REDO" ? (
                                <Badge variant="secondary">Recount required</Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  disabled={
                                    !editable ||
                                    shownQty === null ||
                                    unsaved ||
                                    counts.isPending ||
                                    accept.isPending
                                  }
                                  onClick={() =>
                                    accept.mutate(
                                      { productId: item.productId, details: rowDetails },
                                      {
                                        onSuccess: () =>
                                          toast.success(
                                            `${item.productName ?? "Product"} accepted`,
                                          ),
                                        onError: (error) => toast.error(apiErrorMessage(error)),
                                      },
                                    )
                                  }
                                >
                                  Approve count
                                </Button>
                              )}
                              {item.action === "OK" && canRequestRedo && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setExpandedProductId(item.productId);
                                    setRedoProductId(item.productId);
                                    setRedoReason("");
                                  }}
                                >
                                  Request redo
                                </Button>
                              )}
                              {item.action === "REDO" && (
                                <Badge variant="secondary">R · Recount required</Badge>
                              )}
                              {investigationAvailable && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-expanded={investigationOpen}
                                  onClick={() =>
                                    setExpandedProductId(investigationOpen ? null : item.productId)
                                  }
                                >
                                  {investigationOpen ? "Close details" : "Investigate"}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {item.action === "REDO" && (
                          <RecountTableRow
                            item={item}
                            productLabel={labelOf(product, item.productId, item.productName)}
                            unit={unit}
                            comparisonQty={comparisonQty}
                            blindCount={take.blindCount}
                            editable={editable}
                            pending={recount.isPending}
                            onSubmit={(input) =>
                              recount.mutate(
                                { productId: item.productId, input },
                                {
                                  onSuccess: () => {
                                    setDrafts((current) => ({
                                      ...current,
                                      [item.productId]: String(input.countedQty),
                                    }));
                                    setRedoProductId(null);
                                    toast.success("Recount saved as final verified quantity");
                                  },
                                  onError: (error) => toast.error(apiErrorMessage(error)),
                                },
                              )
                            }
                          />
                        )}
                        {investigationOpen && (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="grid gap-4 lg:grid-cols-2">
                                <section className="space-y-2">
                                  <h3 className="text-sm font-semibold">Variance investigation</h3>
                                  {showVarianceFields ? (
                                    <>
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        <select
                                          className="h-10 rounded-md border bg-background px-3 text-sm"
                                          aria-label="Variance reason"
                                          value={rowDetails.reasonCategory ?? ""}
                                          disabled={!editable || item.action === "OK"}
                                          onChange={(event) =>
                                            setDetails((state) => ({
                                              ...state,
                                              [item.productId]: {
                                                ...rowDetails,
                                                reasonCategory: event.target.value,
                                              },
                                            }))
                                          }
                                        >
                                          <option value="">Select variance reason</option>
                                          {varianceReasons.map(([value, label]) => (
                                            <option key={value} value={value}>
                                              {label}
                                            </option>
                                          ))}
                                        </select>
                                        <select
                                          className="h-10 rounded-md border bg-background px-3 text-sm"
                                          aria-label="Cause confidence"
                                          value={rowDetails.causeClassification ?? "VERIFIED"}
                                          disabled={!editable || item.action === "OK"}
                                          onChange={(event) =>
                                            setDetails((state) => ({
                                              ...state,
                                              [item.productId]: {
                                                ...rowDetails,
                                                causeClassification: event.target.value as
                                                  "VERIFIED" | "SUSPECTED",
                                              },
                                            }))
                                          }
                                        >
                                          <option value="VERIFIED">Verified cause</option>
                                          <option value="SUSPECTED">Suspected cause</option>
                                        </select>
                                      </div>
                                      <Textarea
                                        placeholder="Explain the variance and investigation evidence"
                                        value={rowDetails.narration ?? ""}
                                        disabled={!editable || item.action === "OK"}
                                        onChange={(event) =>
                                          setDetails((state) => ({
                                            ...state,
                                            [item.productId]: {
                                              ...rowDetails,
                                              narration: event.target.value,
                                            },
                                          }))
                                        }
                                      />
                                    </>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">
                                      No variance investigation is required for this matching count.
                                    </p>
                                  )}
                                  {item.narration && (
                                    <p className="text-xs text-muted-foreground">
                                      Recorded{" "}
                                      {item.causeClassification === "SUSPECTED"
                                        ? "(suspected): "
                                        : "(verified): "}
                                      {item.reasonCategory
                                        ? `${item.reasonCategory.replaceAll("_", " ")} · `
                                        : ""}
                                      {item.narration}
                                    </p>
                                  )}
                                  {item.varianceValue !== null &&
                                    item.varianceValue !== undefined && (
                                      <p className="text-xs text-muted-foreground">
                                        Approved inventory cost impact: {money(item.varianceValue)}
                                        {item.approvedUnitCost !== null &&
                                        item.approvedUnitCost !== undefined
                                          ? ` at ${money(item.approvedUnitCost)} per ${unit}`
                                          : ""}
                                      </p>
                                    )}
                                </section>

                                <section className="space-y-2">
                                  {(item.recounts?.length ?? 0) > 0 && (
                                    <div className="space-y-1 text-xs text-muted-foreground">
                                      <p className="font-semibold text-foreground">
                                        Original count: {fmtQty(item.firstCountQty ?? 0, unit)}
                                      </p>
                                      {item.recounts.map((entry, index) => (
                                        <p key={`${item.productId}-recount-${index}`}>
                                          Recount {index + 1}: {fmtQty(entry.qty, unit)} ·{" "}
                                          {entry.reason} · {fmtDateTime(entry.countedAt)}
                                        </p>
                                      ))}
                                      <p>
                                        Final agreed count:{" "}
                                        {item.finalQty === null ? "—" : fmtQty(item.finalQty, unit)}
                                      </p>
                                    </div>
                                  )}

                                  {recountOpen && (
                                    <div className="rounded-md border bg-background p-3">
                                      <h3 className="text-sm font-semibold">
                                        {item.action === "OK"
                                          ? "Reject count and request recount"
                                          : "Submit recount"}
                                      </h3>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        System quantity:{" "}
                                        {item.systemQty === null
                                          ? "Hidden"
                                          : fmtQty(item.systemQty, unit)}
                                        {" · "}First count:{" "}
                                        {fmtQty(item.firstCountQty ?? item.countedQty ?? 0, unit)}
                                        {item.redoReason ? ` · Request: ${item.redoReason}` : ""}
                                      </p>
                                      {item.action === "OK" ? (
                                        <>
                                          <Textarea
                                            className="mt-2"
                                            placeholder="Reason for rejecting this count / recount request"
                                            value={redoReason}
                                            onChange={(event) => setRedoReason(event.target.value)}
                                          />
                                          <Button
                                            className="mt-2"
                                            size="sm"
                                            variant="destructive"
                                            disabled={
                                              !canRequestRedo ||
                                              !redoReason.trim() ||
                                              requestRedo.isPending
                                            }
                                            onClick={() =>
                                              requestRedo.mutate(
                                                {
                                                  productId: item.productId,
                                                  reason: redoReason.trim(),
                                                },
                                                {
                                                  onSuccess: () => {
                                                    setRecountReason(redoReason.trim());
                                                    setRedoReason("");
                                                    toast.success(
                                                      "Count rejected; recount requested",
                                                    );
                                                  },
                                                  onError: (error) =>
                                                    toast.error(apiErrorMessage(error)),
                                                },
                                              )
                                            }
                                          >
                                            Confirm redo request
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <Input
                                            className="mt-2"
                                            type="number"
                                            step="0.001"
                                            min="0"
                                            placeholder="Recount quantity"
                                            value={recountQty}
                                            onChange={(event) => setRecountQty(event.target.value)}
                                          />
                                          <Textarea
                                            className="mt-2"
                                            placeholder="Recount notes / reason"
                                            value={recountReason}
                                            onChange={(event) =>
                                              setRecountReason(event.target.value)
                                            }
                                          />
                                          {((recountPreview !== null &&
                                            Math.abs(recountPreview) >= VARIANCE_EPSILON) ||
                                            (take.blindCount &&
                                              Number.isFinite(Number(recountQty)))) && (
                                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                              <select
                                                className="h-10 rounded-md border bg-background px-3 text-sm"
                                                aria-label="Recount variance reason"
                                                value={recountDetails.reasonCategory ?? ""}
                                                onChange={(event) =>
                                                  setRecountDetails((state) => ({
                                                    ...state,
                                                    reasonCategory: event.target.value,
                                                  }))
                                                }
                                              >
                                                <option value="">Select variance reason</option>
                                                {(recountPreview === null
                                                  ? ALL_VARIANCE_REASONS
                                                  : recountPreview < 0
                                                    ? NEGATIVE_VARIANCE_REASONS
                                                    : POSITIVE_VARIANCE_REASONS
                                                ).map(([value, label]) => (
                                                  <option key={value} value={value}>
                                                    {label}
                                                  </option>
                                                ))}
                                              </select>
                                              <select
                                                className="h-10 rounded-md border bg-background px-3 text-sm"
                                                aria-label="Recount cause confidence"
                                                value={
                                                  recountDetails.causeClassification ?? "VERIFIED"
                                                }
                                                onChange={(event) =>
                                                  setRecountDetails((state) => ({
                                                    ...state,
                                                    causeClassification: event.target.value as
                                                      "VERIFIED" | "SUSPECTED",
                                                  }))
                                                }
                                              >
                                                <option value="VERIFIED">Verified cause</option>
                                                <option value="SUSPECTED">Suspected cause</option>
                                              </select>
                                              <Textarea
                                                className="sm:col-span-2"
                                                placeholder="Detailed variance explanation and evidence"
                                                value={recountDetails.narration ?? ""}
                                                onChange={(event) =>
                                                  setRecountDetails((state) => ({
                                                    ...state,
                                                    narration: event.target.value,
                                                  }))
                                                }
                                              />
                                            </div>
                                          )}
                                          <Button
                                            className="mt-2"
                                            size="sm"
                                            disabled={
                                              !editable ||
                                              recountQty.trim() === "" ||
                                              !Number.isFinite(Number(recountQty)) ||
                                              !recountReason.trim() ||
                                              recount.isPending
                                            }
                                            onClick={() => {
                                              const input: StockTakeRecountInput = {
                                                ...recountDetails,
                                                countedQty: Number(recountQty),
                                                recountReason: recountReason.trim(),
                                              };
                                              recount.mutate(
                                                { productId: item.productId, input },
                                                {
                                                  onSuccess: () => {
                                                    setRedoProductId(null);
                                                    setRecountReason("");
                                                    setRecountDetails({});
                                                    toast.success(
                                                      "Recount saved as final verified quantity",
                                                    );
                                                  },
                                                  onError: (error) =>
                                                    toast.error(apiErrorMessage(error)),
                                                },
                                              );
                                            }}
                                          >
                                            Submit final recount
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </section>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {visibleItems.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-8 text-center text-sm text-muted-foreground"
                      >
                        No products match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {submit.error instanceof ApiError && (
              <div className="mt-3">
                <ApiErrorAlert error={submit.error} fallbackTitle="Not submitted" />
              </div>
            )}

            <div
              className={`mt-4 grid gap-2 ${
                take.status === "UNDER_REVIEW" && canApprove
                  ? "grid-cols-1 sm:grid-cols-3"
                  : "grid-cols-2"
              }`}
            >
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {take.status === "SUBMITTED" && canApprove && (
                <Button
                  disabled={review.isPending}
                  onClick={() =>
                    review.mutate(undefined, {
                      onSuccess: () => toast.success("Review started"),
                      onError: (error) => toast.error(apiErrorMessage(error)),
                    })
                  }
                >
                  {review.isPending ? "Opening review…" : "Start review"}
                </Button>
              )}
              {take.status === "UNDER_REVIEW" && canApprove && (
                <>
                  <Button
                    variant="destructive"
                    disabled={approve.isPending}
                    onClick={() => onRequestReject(take.id)}
                  >
                    Reject sheet
                  </Button>
                  <Button
                    disabled={isCounter || unresolvedCount > 0 || approve.isPending}
                    onClick={() =>
                      approve.mutate(undefined, {
                        onSuccess: ({ meta }) => {
                          toast.success(
                            `Approved — ${meta.varianceCount} variance(s) awaiting posting`,
                          );
                          onApproved(meta);
                        },
                        onError: (error) => toast.error(apiErrorMessage(error)),
                      })
                    }
                  >
                    {approve.isPending ? "Approving…" : "Approve adjustments"}
                  </Button>
                </>
              )}
              {editable && (
                <Button
                  disabled={unresolvedCount > 0 || unsaved || counts.isPending || submit.isPending}
                  onClick={() =>
                    submit.mutate(undefined, {
                      onSuccess: () => toast.success("Submitted for review"),
                    })
                  }
                >
                  {submit.isPending
                    ? "Submitting…"
                    : unresolvedCount > 0
                      ? `Resolve ${unresolvedCount} item(s) first`
                      : "Submit for Review"}
                </Button>
              )}
            </div>
            {take.status === "UNDER_REVIEW" && canApprove && isCounter && (
              <p className="mt-2 text-xs text-muted-foreground">
                You counted or were assigned this stock take. A different authorized reviewer must
                approve it.
              </p>
            )}
            {editable && unsaved && (
              <p className="mt-2 text-xs text-muted-foreground">
                Accept each count after its draft autosaves. Submit unlocks when every item is OK.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------- reject & variance

function RecountTableRow({
  item,
  productLabel,
  unit,
  comparisonQty,
  blindCount,
  editable,
  pending,
  onSubmit,
}: {
  item: StockTakeItem;
  productLabel: string;
  unit: BaseUnit | undefined;
  comparisonQty: number | null;
  blindCount: boolean;
  editable: boolean;
  pending: boolean;
  onSubmit: (input: StockTakeRecountInput) => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState(item.redoReason ?? "");
  const [details, setDetails] = useState<StockTakeVarianceInput>({
    causeClassification: "VERIFIED",
  });

  const parsedQuantity = quantity.trim() === "" ? null : Number(quantity);
  const countedQuantity =
    parsedQuantity !== null && Number.isFinite(parsedQuantity) ? round3(parsedQuantity) : null;
  const difference =
    countedQuantity === null || comparisonQty === null
      ? null
      : round3(countedQuantity - comparisonQty);
  const hasVariance = difference !== null && Math.abs(difference) >= VARIANCE_EPSILON;
  const varianceReasons =
    difference === null
      ? ALL_VARIANCE_REASONS
      : difference < 0
        ? NEGATIVE_VARIANCE_REASONS
        : difference > 0
          ? POSITIVE_VARIANCE_REASONS
          : ALL_VARIANCE_REASONS;
  const availableVarianceReasons =
    blindCount && comparisonQty === null
      ? varianceReasons.filter(([value]) => value === "OTHER")
      : varianceReasons;
  const requiresVarianceDetails = hasVariance || (blindCount && countedQuantity !== null);
  const narration = details.narration?.trim() ?? "";
  const hasValidVarianceDetails =
    !requiresVarianceDetails ||
    (Boolean(details.reasonCategory) &&
      Boolean(narration) &&
      (details.reasonCategory !== "OTHER" || narration.length >= 10));

  function submitRecount() {
    if (countedQuantity === null || countedQuantity < 0 || !reason.trim()) return;
    onSubmit({
      ...details,
      countedQty: countedQuantity,
      recountReason: reason.trim(),
    });
  }

  return (
    <>
      <tr className="border-b bg-primary/5">
        <td className="border-r px-3 py-2">
          <div className="flex items-center gap-2 font-medium">
            <Badge variant="secondary">R</Badge>
            <span>Recount · {productLabel}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.redoReason ?? "Repeat physical count"}
          </p>
        </td>
        <td className="border-r px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-2">
            <Input
              type="number"
              step="0.001"
              min="0"
              placeholder="Recount"
              aria-label={`Repeat head count for ${item.productName ?? item.productId}`}
              value={quantity}
              disabled={!editable}
              onChange={(event) => setQuantity(event.target.value)}
              className="h-9 w-28 text-right tabular-nums"
            />
            <span className="min-w-8 text-left text-xs text-muted-foreground">{unit ?? "—"}</span>
          </div>
        </td>
        <td className="border-r px-3 py-2 text-right tabular-nums">
          {blindCount || comparisonQty === null ? (
            <span className="text-muted-foreground">Hidden</span>
          ) : (
            fmtQty(comparisonQty, unit)
          )}
        </td>
        <td className="border-r px-3 py-2 text-right">
          {difference === null ? (
            <span className="text-muted-foreground">—</span>
          ) : Math.abs(difference) < VARIANCE_EPSILON ? (
            <Badge variant="outline">Match</Badge>
          ) : (
            <span
              className={`font-semibold tabular-nums ${difference < 0 ? "text-destructive" : "text-success"}`}
            >
              {difference > 0 ? "+" : ""}
              {fmtQty(difference, unit)}
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="space-y-2">
            <Input
              value={reason}
              disabled={!editable}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Recount reason / notes"
              aria-label={`Recount reason for ${item.productName ?? item.productId}`}
            />
            {(hasVariance || (blindCount && countedQuantity !== null)) && (
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className="h-9 rounded-md border bg-background px-2 text-xs"
                  aria-label="Recount variance reason"
                  value={details.reasonCategory ?? ""}
                  disabled={!editable}
                  onChange={(event) =>
                    setDetails((state) => ({ ...state, reasonCategory: event.target.value }))
                  }
                >
                  <option value="">Select variance reason</option>
                  {availableVarianceReasons.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-xs"
                  aria-label="Recount cause confidence"
                  value={details.causeClassification ?? "VERIFIED"}
                  disabled={!editable}
                  onChange={(event) =>
                    setDetails((state) => ({
                      ...state,
                      causeClassification: event.target.value as "VERIFIED" | "SUSPECTED",
                    }))
                  }
                >
                  <option value="VERIFIED">Verified cause</option>
                  <option value="SUSPECTED">Suspected cause</option>
                </select>
                <Textarea
                  className="sm:col-span-2"
                  value={details.narration ?? ""}
                  disabled={!editable}
                  onChange={(event) =>
                    setDetails((state) => ({ ...state, narration: event.target.value }))
                  }
                  placeholder="Explain the recount difference and evidence"
                  aria-label="Recount variance explanation and evidence"
                />
                {blindCount && comparisonQty === null && (
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    The system variance is hidden for this blind recount. Choose “Other” and provide
                    at least 10 characters of explanation; the server validates the variance against
                    its fresh stock snapshot.
                  </p>
                )}
              </div>
            )}
            <Button
              size="sm"
              disabled={
                !editable ||
                countedQuantity === null ||
                !reason.trim() ||
                !hasValidVarianceDetails ||
                pending
              }
              onClick={submitRecount}
            >
              {pending ? "Saving recount…" : "Submit recount"}
            </Button>
          </div>
        </td>
      </tr>
    </>
  );
}

function RejectDialog({ stockTakeId, onClose }: { stockTakeId: string; onClose: () => void }) {
  const [notes, setNotes] = useState("");
  const reject = useRejectStockTake(stockTakeId);
  const canSubmit = notes.trim().length > 0;

  function save() {
    reject.mutate(notes.trim(), {
      onSuccess: () => {
        toast.success("Stock take rejected");
        onClose();
      },
    });
  }

  return (
    <DialogShell
      title="Reject Stock Take"
      error={reject.error}
      pending={reject.isPending}
      canSubmit={canSubmit}
      submitLabel="Reject"
      destructive
      onClose={onClose}
      onSubmit={save}
    >
      <div>
        <Label>Reason</Label>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="mt-1"
        />
        <FieldFailure error={reject.error} field="notes" />
      </div>
    </DialogShell>
  );
}

function VarianceDialog({
  summary,
  productById,
  onClose,
}: {
  summary: StockTakeVarianceSummary;
  productById: Map<string, Product>;
  onClose: () => void;
}) {
  const positiveValue = summary.variances.reduce(
    (sum, row) => sum + (row.variance > 0 ? row.value : 0),
    0,
  );
  const negativeValue = summary.variances.reduce(
    (sum, row) => sum + (row.variance < 0 ? row.value : 0),
    0,
  );
  const netValue = positiveValue - negativeValue;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Variances approved — {summary.varianceCount}</DialogTitle>
        </DialogHeader>
        {summary.variances.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Count matched the system quantities — nothing was adjusted.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3 text-right">System</th>
                  <th className="p-3 text-right">Counted</th>
                  <th className="p-3 text-right">Variance</th>
                  <th className="p-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {summary.variances.map((row, index) => {
                  const product = [...productById.values()].find(
                    (item) => item.name === row.productName,
                  );
                  return (
                    <tr key={`${row.productName}:${index}`} className="border-t">
                      <td className="p-3 font-medium">
                        <span className="flex items-center gap-2">
                          <ProductImage
                            name={product?.name ?? row.productName}
                            productId={product?.id}
                            sku={product?.sku}
                            className="h-8 w-8 rounded-md"
                          />
                          {product?.name ?? row.productName}
                        </span>
                      </td>
                      <td className="p-3 text-right">{fmtQty(row.systemQty, product?.baseUnit)}</td>
                      <td className="p-3 text-right">
                        {fmtQty(row.countedQty, product?.baseUnit)}
                      </td>
                      <td
                        className={`p-3 text-right font-semibold ${row.variance < 0 ? "text-destructive" : "text-success"}`}
                      >
                        {row.variance > 0 ? "+" : ""}
                        {fmtQty(row.variance, product?.baseUnit)}
                      </td>
                      <td className="p-3 text-right">{money(row.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 grid gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm sm:grid-cols-3">
          <div className="flex items-center justify-between gap-2">
            <span>Positive inventory value</span>
            <strong>{money(positiveValue)}</strong>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Negative inventory value</span>
            <strong>{money(negativeValue)}</strong>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Net inventory movement</span>
            <strong className={netValue < 0 ? "text-destructive" : ""}>{money(netValue)}</strong>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Values use the product&apos;s configured inventory cost. Posting updates the inventory
          ledger; this project has no accounting journal subsystem to create a general-ledger entry.
        </p>
        <div className="mt-4">
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
