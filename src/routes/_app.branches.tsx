import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { usePermissions, useActiveBranchId } from "@/api/hooks/auth";
import { useBranchList, useCreateBranch, useDeleteBranch, useUpdateBranch } from "@/api/hooks/catalog";
import { useInventoryBalances } from "@/api/hooks/catalog";
import { ApiError, fieldError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader } from "@/components/shared";
import type { Branch, BranchInput } from "@/types/api";

export const Route = createFileRoute("/_app/branches")({
  component: BranchesPage,
});

function BranchesPage() {
  const permissions = usePermissions();
  const canManage = permissions.includes("branches");
  const activeBranchId = useActiveBranchId();
  const branches = useBranchList();
  const [editing, setEditing] = useState<Branch | "new" | null>(null);

  return (
    <div className="pb-10">
      <PageHeader
        title="Branches"
        subtitle={branches.isSuccess ? `${branches.data.length} locations` : "Locations"}
        actions={
          canManage ? (
            <Button onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" /> New Branch</Button>
          ) : undefined
        }
      />
      <div className="grid gap-3 p-4 sm:grid-cols-2 md:px-6">
        {branches.isPending && (
          <>
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
          </>
        )}
        {branches.isError && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="mt-3 font-semibold">Branches did not load.</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{branches.error.message}</p>
            <Button variant="outline" className="mt-3" disabled={branches.isFetching} onClick={() => void branches.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {branches.isSuccess && branches.data.length === 0 && (
          <div className="col-span-full">
            <EmptyState icon="🏬" title="No branches yet" body="Create the first till location." />
          </div>
        )}
        {branches.isSuccess &&
          branches.data.map((b) => (
            <BranchCard
              key={b.id}
              branch={b}
              canManage={canManage}
              isActive={b.id === activeBranchId}
              onEdit={() => setEditing(b)}
            />
          ))}
      </div>

      {editing && <BranchDialog branch={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BranchCard({
  branch,
  canManage,
  isActive,
  onEdit,
}: {
  branch: Branch;
  canManage: boolean;
  isActive: boolean;
  onEdit: () => void;
}) {
  const permissions = usePermissions();
  const deleteBranch = useDeleteBranch();

  function remove() {
    deleteBranch.mutate(branch.id, {
      onSuccess: () => toast.success(`${branch.name} deleted`),
      onError: (error) => {
        if (error instanceof ApiError && error.code === "BRANCH_IN_USE") {
          toast.error("This branch still holds stock or sales and cannot be deleted.");
        } else {
          toast.error(error.message);
        }
      },
    });
  }

  return (
    <div className="rounded-xl border p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-2xl"><Building2 className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold">{branch.name}</p>
          <p className="truncate text-sm text-muted-foreground">{branch.location}</p>
        </div>
        {isActive && <Badge>this till</Badge>}
      </div>
      {permissions.includes("inventory") && <BranchStockStats branchId={branch.id} />}
      {canManage && (
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}><Pencil className="mr-1 h-3 w-3" /> Edit</Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={deleteBranch.isPending}
            onClick={remove}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Stock tiles mirror the old layout but read real balances; the endpoint needs
 * the `inventory` permission, so cashiers simply get no tiles.
 */
function BranchStockStats({ branchId }: { branchId: string }) {
  const balances = useInventoryBalances({ branchId });

  if (balances.isPending) return <Skeleton className="mt-4 h-16 rounded-lg" />;
  if (balances.isError) {
    return (
      <p className="mt-4 text-xs text-destructive">
        Stock figures did not load: {balances.error.message}
      </p>
    );
  }

  const rows = balances.data;
  const inStock = rows.filter((b) => b.qty > 0).length;

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="text-xs text-muted-foreground">Products in stock</p>
        <p className="font-display text-lg font-bold">{inStock}</p>
      </div>
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="text-xs text-muted-foreground">Total SKUs</p>
        <p className="font-display text-lg font-bold">{rows.length}</p>
      </div>
    </div>
  );
}

function BranchDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const mutation = branch ? update : create;

  const [name, setName] = useState(branch?.name ?? "");
  const [location, setLocation] = useState(branch?.location ?? "");

  function save() {
    const input: BranchInput = { name: name.trim(), location: location.trim() };
    const callbacks = {
      onSuccess: () => {
        toast.success(branch ? "Branch updated" : "Branch created");
        onClose();
      },
      onError: (error: Error) => {
        if (branch && error instanceof ApiError && error.code === "BRANCH_IN_USE") {
          toast.error("This branch still holds stock or sales and cannot be removed.");
        }
      },
    };
    if (branch) update.mutate({ branchId: branch.id, patch: input }, callbacks);
    else create.mutate(input, callbacks);
  }

  const error = mutation.error;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{branch ? "Edit Branch" : "New Branch"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {error && <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error.message}</p>}
          <div>
            <Label htmlFor="b-name">Name</Label>
            <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="e.g. Ruaka" />
            <FieldMsg text={fieldError(error, "name")} />
          </div>
          <div>
            <Label htmlFor="b-location">Location</Label>
            <Input id="b-location" value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1" placeholder="e.g. Kiambu" />
            <FieldMsg text={fieldError(error, "location")} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!name.trim() || !location.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving…" : branch ? "Save" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldMsg({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="mt-1 text-xs font-medium text-destructive">{text}</p>;
}
