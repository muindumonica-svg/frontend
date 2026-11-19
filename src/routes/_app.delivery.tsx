import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Bike, MapPin, Pencil, Phone, Plus, Trash2, Truck } from "lucide-react";
import { useActiveBranchId, usePermissions, useSessionBranches } from "@/api/hooks/auth";
import {
  useAssignDelivery,
  useCancelDeliveryAssignment,
  useCreateDeliveryPersonnel,
  useCreateDeliveryZone,
  useDeleteDeliveryZone,
  useDeliveryAssignments,
  useDeliveryCandidates,
  useDeliveryPersonnel,
  useDeliveryZones,
  useReviewDeliveryPersonnel,
  useRiderAssignments,
  useRiderProfile,
  useRiderTransition,
  useSetDeliveryPersonnelZones,
  useUpdateDeliveryZone,
  type RiderAction,
} from "@/api/hooks/delivery";
import { useBranchList } from "@/api/hooks/catalog";
import { ApiError, fieldError } from "@/lib/api";
import { fmtDateTime, money } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader } from "@/components/shared";
import {
  DELIVERY_PERSONNEL_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  type DeliveryAssignment,
  type DeliveryPersonnel,
  type DeliveryZone,
  type DeliveryZoneInput,
} from "@/types/api";

export const Route = createFileRoute("/_app/delivery")({
  component: DeliveryPage,
});

function DeliveryPage() {
  const permissions = usePermissions();
  const isManager = permissions.includes("delivery_manage");

  return isManager ? <DispatchPage /> : <RiderPage />;
}

// ---------------------------------------------------------------- manager

function DispatchPage() {
  return (
    <div className="pb-10">
      <PageHeader
        title="Delivery"
        subtitle="Assign paid online orders, manage areas, and approve riders."
      />
      <div className="p-4 md:px-6">
        <Tabs defaultValue="dispatch">
          <TabsList>
            <TabsTrigger value="dispatch">Dispatch</TabsTrigger>
            <TabsTrigger value="zones">Areas &amp; fees</TabsTrigger>
            <TabsTrigger value="riders">Riders</TabsTrigger>
          </TabsList>
          <TabsContent value="dispatch" className="mt-4">
            <DispatchBoard />
          </TabsContent>
          <TabsContent value="zones" className="mt-4">
            <ZonesTab />
          </TabsContent>
          <TabsContent value="riders" className="mt-4">
            <RidersTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function DispatchBoard() {
  const candidates = useDeliveryCandidates();
  const assignments = useDeliveryAssignments({ perPage: 50 });
  const riders = useDeliveryPersonnel("APPROVED");
  const assign = useAssignDelivery();
  const cancel = useCancelDeliveryAssignment();
  const [riderFor, setRiderFor] = useState<Record<string, string>>({});

  const open = (assignments.data?.items ?? []).filter((row) =>
    ["ASSIGNED", "ACCEPTED", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(row.status),
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section>
        <h2 className="font-display text-base font-bold">Ready to assign</h2>
        <p className="text-xs text-muted-foreground">Paid delivery orders with no open run.</p>

        <div className="mt-3 space-y-2">
          {candidates.isPending && <Skeleton className="h-28 rounded-xl" />}
          {candidates.isError && (
            <ErrorBox message={candidates.error.message} onRetry={() => void candidates.refetch()} />
          )}
          {candidates.isSuccess && candidates.data.length === 0 && (
            <EmptyState icon="🛵" title="Nothing waiting" body="Paid delivery orders will appear here." />
          )}
          {candidates.data?.map((order) => (
            <article key={order.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-sm font-bold">{order.orderNo ?? order.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {order.customerName ?? "Customer"} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"} ·{" "}
                    {money(order.total)}
                  </p>
                </div>
                <Badge variant="secondary">{order.zoneName ?? "Delivery"}</Badge>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  {order.addressLine}
                  <span className="block text-xs text-muted-foreground">{order.town}</span>
                </span>
              </p>
              <div className="mt-3 flex gap-2">
                <Select
                  value={riderFor[order.id] ?? ""}
                  onValueChange={(value) => setRiderFor((current) => ({ ...current, [order.id]: value }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Choose a rider" />
                  </SelectTrigger>
                  <SelectContent>
                    {(riders.data ?? []).map((rider) => (
                      <SelectItem key={rider.id} value={rider.id}>
                        {rider.name ?? rider.email ?? rider.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!riderFor[order.id] || assign.isPending}
                  onClick={() =>
                    assign.mutate(
                      { saleId: order.id, personnelId: riderFor[order.id] },
                      {
                        onSuccess: () => toast.success("Rider assigned"),
                        onError: (error) => toast.error(error.message),
                      },
                    )
                  }
                >
                  Assign
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-base font-bold">Open runs</h2>
        <p className="text-xs text-muted-foreground">Orders currently with a rider.</p>

        <div className="mt-3 space-y-2">
          {assignments.isPending && <Skeleton className="h-24 rounded-xl" />}
          {assignments.isError && (
            <ErrorBox message={assignments.error.message} onRetry={() => void assignments.refetch()} />
          )}
          {assignments.isSuccess && open.length === 0 && (
            <EmptyState icon="📦" title="No open runs" body="Assigned deliveries show here until delivered." />
          )}
          {open.map((assignment) => (
            <article key={assignment.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-sm font-bold">{assignment.orderNo ?? assignment.saleId}</p>
                  <p className="text-xs text-muted-foreground">
                    {assignment.personnel?.name ?? "Rider"} · {assignment.zone?.name ?? "Delivery"}
                  </p>
                </div>
                <Badge variant="secondary">{DELIVERY_STATUS_LABELS[assignment.status]}</Badge>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  {assignment.deliveryAddress?.addressLine}
                  <span className="block text-xs text-muted-foreground">{assignment.deliveryAddress?.town}</span>
                </span>
              </p>
              {assignment.personnel?.phone && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> {assignment.personnel.phone}
                </p>
              )}
              {(assignment.status === "ASSIGNED" || assignment.status === "ACCEPTED") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  disabled={cancel.isPending}
                  onClick={() =>
                    cancel.mutate(
                      { assignmentId: assignment.id },
                      {
                        onSuccess: () => toast.success("Delivery cancelled"),
                        onError: (error) => toast.error(error.message),
                      },
                    )
                  }
                >
                  Cancel run
                </Button>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ZonesTab() {
  const branches = useSessionBranches();
  const allBranches = useBranchList();
  const [editing, setEditing] = useState<DeliveryZone | "new" | null>(null);
  const zones = useDeliveryZones({});
  const remove = useDeleteDeliveryZone();

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Fees and minimums are quoted at checkout per branch.</p>
        <Button size="sm" onClick={() => setEditing("new")} disabled={branches.length === 0}>
          <Plus className="mr-1 h-4 w-4" /> New area
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {zones.isPending && <Skeleton className="h-28 rounded-xl" />}
        {zones.isError && <ErrorBox message={zones.error.message} onRetry={() => void zones.refetch()} />}
        {zones.isSuccess && zones.data.length === 0 && (
          <div className="sm:col-span-2">
            <EmptyState icon="🗺️" title="No delivery areas" body="Add an area with a fee so customers can choose delivery." />
          </div>
        )}
        {zones.data?.map((zone) => (
          <article key={zone.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-sm font-bold">{zone.name}</p>
                <p className="text-xs text-muted-foreground">
                  {zone.branchName ?? allBranches.data?.find((branch) => branch.id === zone.branchId)?.name ?? "Branch"}
                </p>
              </div>
              <Badge variant={zone.active ? "secondary" : "outline"}>{zone.active ? "Active" : "Inactive"}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <div>Fee <span className="font-semibold text-foreground">{money(zone.fee)}</span></div>
              <div>Minimum <span className="font-semibold text-foreground">{money(zone.minimumOrderTotal)}</span></div>
              <div>
                Free over{" "}
                <span className="font-semibold text-foreground">
                  {zone.freeDeliveryThreshold === null ? "—" : money(zone.freeDeliveryThreshold)}
                </span>
              </div>
              <div>ETA <span className="font-semibold text-foreground">{zone.etaMinutes ?? "—"} min</span></div>
            </dl>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(zone)}>
                <Pencil className="mr-1 h-3 w-3" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(zone.id, {
                    onSuccess: () => toast.success("Area deleted"),
                    onError: (error) =>
                      toast.error(
                        error instanceof ApiError && error.code === "DELIVERY_ZONE_IN_USE"
                          ? "This area has orders — deactivate it instead."
                          : error.message,
                      ),
                  })
                }
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </article>
        ))}
      </div>

      {editing && <ZoneDialog zone={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ZoneDialog({ zone, onClose }: { zone: DeliveryZone | null; onClose: () => void }) {
  const branches = useSessionBranches();
  const activeBranchId = useActiveBranchId();
  const create = useCreateDeliveryZone();
  const update = useUpdateDeliveryZone(zone?.id ?? "");
  const [form, setForm] = useState({
    branchId: zone?.branchId ?? activeBranchId ?? branches[0]?.id ?? "",
    name: zone?.name ?? "",
    fee: zone ? String(zone.fee) : "0",
    minimumOrderTotal: zone ? String(zone.minimumOrderTotal) : "0",
    freeDeliveryThreshold: zone?.freeDeliveryThreshold === null ? "" : String(zone?.freeDeliveryThreshold ?? ""),
    etaMinutes: zone?.etaMinutes === null ? "" : String(zone?.etaMinutes ?? ""),
    instructions: zone?.instructions ?? "",
    active: zone?.active ?? true,
  });
  const saving = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  function submit(event: FormEvent) {
    event.preventDefault();
    const input: DeliveryZoneInput = {
      branchId: form.branchId,
      name: form.name.trim(),
      fee: Number(form.fee),
      minimumOrderTotal: Number(form.minimumOrderTotal || 0),
      freeDeliveryThreshold: form.freeDeliveryThreshold === "" ? null : Number(form.freeDeliveryThreshold),
      etaMinutes: form.etaMinutes === "" ? null : Number(form.etaMinutes),
      instructions: form.instructions.trim() || null,
      active: form.active,
    };

    const done = { onSuccess: () => { toast.success(zone ? "Area updated" : "Area created"); onClose(); } };
    if (zone) {
      const { branchId: _branchId, ...patch } = input;
      update.mutate(patch, done);
    } else {
      create.mutate(input, done);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{zone ? "Edit delivery area" : "New delivery area"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {!zone && (
            <div className="space-y-1.5">
              <Label htmlFor="zone-branch">Branch</Label>
              <Select value={form.branchId} onValueChange={(value) => setForm({ ...form, branchId: value })}>
                <SelectTrigger id="zone-branch"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="zone-name">Area name</Label>
            <Input id="zone-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} required />
            {fieldError(error, "name") && <p className="text-xs text-destructive">{fieldError(error, "name")}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="zone-fee" label="Delivery fee" value={form.fee} onChange={(fee) => setForm({ ...form, fee })} />
            <NumberField id="zone-min" label="Minimum order" value={form.minimumOrderTotal} onChange={(value) => setForm({ ...form, minimumOrderTotal: value })} />
            <NumberField id="zone-free" label="Free over (optional)" value={form.freeDeliveryThreshold} onChange={(value) => setForm({ ...form, freeDeliveryThreshold: value })} />
            <NumberField id="zone-eta" label="ETA minutes" value={form.etaMinutes} onChange={(value) => setForm({ ...form, etaMinutes: value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zone-instructions">Instructions for customers</Label>
            <Textarea id="zone-instructions" rows={2} maxLength={500} value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked === true })} />
            Available at checkout
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : "Save area"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={0} step="any" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function RidersTab() {
  const personnel = useDeliveryPersonnel();
  const zones = useDeliveryZones({});
  const [adding, setAdding] = useState(false);
  const [reviewing, setReviewing] = useState<DeliveryPersonnel | null>(null);
  const [managingZones, setManagingZones] = useState<DeliveryPersonnel | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Riders cannot see a run until their account is approved.</p>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add rider
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {personnel.isPending && <Skeleton className="h-32 rounded-xl" />}
        {personnel.isError && <ErrorBox message={personnel.error.message} onRetry={() => void personnel.refetch()} />}
        {personnel.isSuccess && personnel.data.length === 0 && (
          <div className="sm:col-span-2">
            <EmptyState icon="🛵" title="No riders yet" body="Create a rider account, then approve it before assigning runs." />
          </div>
        )}
        {personnel.data?.map((profile) => (
          <article key={profile.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-sm font-bold">{profile.name ?? profile.email}</p>
                <p className="text-xs text-muted-foreground">
                  {profile.phone ?? "No phone"} · {profile.vehicleType ?? "No vehicle"}
                  {profile.vehiclePlate ? ` · ${profile.vehiclePlate}` : ""}
                </p>
              </div>
              <Badge variant={profile.status === "APPROVED" ? "secondary" : "outline"}>
                {DELIVERY_PERSONNEL_STATUS_LABELS[profile.status]}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Areas: {profile.zones.length > 0 ? profile.zones.map((zone) => zone.name).join(", ") : "none"}
            </p>
            {profile.reviewNote && <p className="mt-1 text-xs text-muted-foreground">Note: {profile.reviewNote}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setManagingZones(profile)}>
                <MapPin className="mr-1 h-3 w-3" /> Areas
              </Button>
              <Button size="sm" variant={profile.status === "APPROVED" ? "ghost" : "default"} onClick={() => setReviewing(profile)}>
                {profile.status === "APPROVED" ? "Review" : "Approve / reject"}
              </Button>
            </div>
          </article>
        ))}
      </div>

      {adding && <RiderDialog zones={zones.data ?? []} onClose={() => setAdding(false)} />}
      {reviewing && <ReviewDialog profile={reviewing} onClose={() => setReviewing(null)} />}
      {managingZones && (
        <ZonesForRiderDialog profile={managingZones} zones={zones.data ?? []} onClose={() => setManagingZones(null)} />
      )}
    </div>
  );
}

function RiderDialog({ zones, onClose }: { zones: DeliveryZone[]; onClose: () => void }) {
  const create = useCreateDeliveryPersonnel();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    vehicleType: "Motorcycle",
    vehiclePlate: "",
    zoneIds: [] as string[],
  });

  function toggleZone(zoneId: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      zoneIds: checked ? [...current.zoneIds, zoneId] : current.zoneIds.filter((id) => id !== zoneId),
    }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        password: form.password,
        vehicleType: form.vehicleType.trim() || null,
        vehiclePlate: form.vehiclePlate.trim() || null,
        zoneIds: form.zoneIds,
      },
      {
        onSuccess: () => {
          toast.success("Rider added — approve the account before assigning runs");
          onClose();
        },
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a rider</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rider-name">Full name</Label>
            <Input id="rider-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rider-email">Email</Label>
              <Input id="rider-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rider-phone">Phone</Label>
              <Input id="rider-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={32} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rider-password">Temporary password</Label>
            <Input id="rider-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={8} />
            <p className="text-xs text-muted-foreground">Share this with the rider; they can change it after signing in.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rider-vehicle">Vehicle</Label>
              <Input id="rider-vehicle" value={form.vehicleType} onChange={(event) => setForm({ ...form, vehicleType: event.target.value })} maxLength={32} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rider-plate">Plate</Label>
              <Input id="rider-plate" value={form.vehiclePlate} onChange={(event) => setForm({ ...form, vehiclePlate: event.target.value })} maxLength={32} />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Delivery areas</legend>
            {zones.length === 0 && <p className="text-xs text-muted-foreground">Create an area first.</p>}
            <div className="grid grid-cols-2 gap-1.5">
              {zones.map((zone) => (
                <label key={zone.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.zoneIds.includes(zone.id)}
                    onCheckedChange={(checked) => toggleZone(zone.id, checked === true)}
                  />
                  {zone.name}
                </label>
              ))}
            </div>
          </fieldset>
          {create.error && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
          <Button type="submit" className="w-full" disabled={create.isPending || form.zoneIds.length === 0}>
            {create.isPending ? "Adding…" : "Add rider"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({ profile, onClose }: { profile: DeliveryPersonnel; onClose: () => void }) {
  const review = useReviewDeliveryPersonnel(profile.id);
  const [status, setStatus] = useState<"APPROVED" | "REJECTED" | "SUSPENDED">(
    profile.status === "APPROVED" ? "SUSPENDED" : "APPROVED",
  );
  const [note, setNote] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    review.mutate(
      { status, note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success(`Rider ${DELIVERY_PERSONNEL_STATUS_LABELS[status].toLowerCase()}`);
          onClose();
        },
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review {profile.name ?? "rider"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Decision</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVED">Approve</SelectItem>
                <SelectItem value="REJECTED">Reject</SelectItem>
                <SelectItem value="SUSPENDED">Suspend</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review-note">Note {status !== "APPROVED" && "(required)"}</Label>
            <Textarea
              id="review-note"
              rows={2}
              maxLength={255}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why this decision?"
            />
          </div>
          {review.error && <p role="alert" className="text-sm text-destructive">{review.error.message}</p>}
          <Button type="submit" className="w-full" disabled={review.isPending}>
            {review.isPending ? "Saving…" : "Save decision"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ZonesForRiderDialog({
  profile,
  zones,
  onClose,
}: {
  profile: DeliveryPersonnel;
  zones: DeliveryZone[];
  onClose: () => void;
}) {
  const save = useSetDeliveryPersonnelZones(profile.id);
  const [zoneIds, setZoneIds] = useState(profile.zones.map((zone) => zone.id));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Areas for {profile.name ?? "rider"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {zones.map((zone) => (
              <label key={zone.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={zoneIds.includes(zone.id)}
                  onCheckedChange={(checked) =>
                    setZoneIds((current) =>
                      checked === true ? [...current, zone.id] : current.filter((id) => id !== zone.id),
                    )
                  }
                />
                {zone.name}
              </label>
            ))}
          </div>
          {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
          <Button
            className="w-full"
            disabled={save.isPending || zoneIds.length === 0}
            onClick={() =>
              save.mutate(zoneIds, {
                onSuccess: () => {
                  toast.success("Areas updated");
                  onClose();
                },
              })
            }
          >
            {save.isPending ? "Saving…" : "Save areas"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-dashed p-4 text-center text-sm">
      <p className="font-medium">Could not load deliveries.</p>
      <p className="mt-1 text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>
    </div>
  );
}

// ------------------------------------------------------------------ rider

function RiderPage() {
  const profile = useRiderProfile();
  const assignments = useRiderAssignments();
  const transition = useRiderTransition();
  const [failing, setFailing] = useState<DeliveryAssignment | null>(null);
  const [note, setNote] = useState("");

  if (profile.isPending) {
    return <div className="p-6"><Skeleton className="h-40 rounded-xl" /></div>;
  }

  if (profile.isError) {
    return (
      <div className="p-6">
        <EmptyState
          icon="🛵"
          title="No delivery profile"
          body={
            profile.error instanceof ApiError && profile.error.code === "DELIVERY_PROFILE_MISSING"
              ? "Ask a manager to link this account to a delivery profile."
              : profile.error.message
          }
        />
      </div>
    );
  }

  if (profile.data.status !== "APPROVED") {
    return (
      <div className="p-6">
        <EmptyState
          icon="⏳"
          title={DELIVERY_PERSONNEL_STATUS_LABELS[profile.data.status]}
          body={
            profile.data.status === "PENDING"
              ? "A manager must approve this account before you can see delivery runs."
              : (profile.data.reviewNote ?? "Contact a manager about this account.")
          }
        />
      </div>
    );
  }

  const rows = assignments.data?.items ?? [];
  const nextAction: Partial<Record<string, { action: RiderAction; label: string }>> = {
    ASSIGNED: { action: "accept", label: "Accept run" },
    ACCEPTED: { action: "pickup", label: "Picked up" },
    PICKED_UP: { action: "dispatch", label: "Start delivery" },
    OUT_FOR_DELIVERY: { action: "deliver", label: "Mark delivered" },
  };

  return (
    <div className="pb-10">
      <PageHeader
        title="My deliveries"
        subtitle={`${profile.data.name ?? "Rider"} · ${profile.data.vehicleType ?? "No vehicle"}${
          profile.data.vehiclePlate ? ` · ${profile.data.vehiclePlate}` : ""
        }`}
        actions={<Badge variant="secondary"><Bike className="mr-1 h-3 w-3" /> Approved</Badge>}
      />

      <div className="space-y-2 p-4 md:px-6">
        {assignments.isPending && <Skeleton className="h-32 rounded-xl" />}
        {assignments.isError && <ErrorBox message={assignments.error.message} onRetry={() => void assignments.refetch()} />}
        {assignments.isSuccess && rows.length === 0 && (
          <EmptyState icon="📦" title="No runs yet" body="A manager will assign paid delivery orders to you." />
        )}
        {rows.map((assignment) => {
          const next = nextAction[assignment.status];
          const canFail = ["ACCEPTED", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(assignment.status);
          return (
            <article key={assignment.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-sm font-bold">{assignment.orderNo ?? assignment.saleId}</p>
                  <p className="text-xs text-muted-foreground">
                    {assignment.zone?.name ?? "Delivery"} · {money(assignment.fee)} fee
                  </p>
                </div>
                <Badge variant="secondary">{DELIVERY_STATUS_LABELS[assignment.status]}</Badge>
              </div>

              <p className="mt-2 flex items-start gap-1.5 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  {assignment.deliveryAddress?.recipientName ?? assignment.customerName ?? "Customer"}
                  <span className="block text-xs text-muted-foreground">
                    {assignment.deliveryAddress?.addressLine}, {assignment.deliveryAddress?.town}
                  </span>
                </span>
              </p>
              {assignment.deliveryAddress?.phone && (
                <a
                  href={`tel:${assignment.deliveryAddress.phone}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-foreground underline"
                >
                  <Phone className="h-3.5 w-3.5" /> {assignment.deliveryAddress.phone}
                </a>
              )}
              {assignment.deliveryAddress?.notes && (
                <p className="mt-1 text-xs text-muted-foreground">Note: {assignment.deliveryAddress.notes}</p>
              )}

              {assignment.items.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {assignment.items.map((item, index) => (
                    <li key={`${assignment.id}-${index}`} className="flex items-center gap-1.5">
                      <ProductImage
                        name={item.productName}
                        className="h-6 w-6 shrink-0 rounded-sm"
                      />
                      {item.qtyLabel} {item.productName}
                    </li>
                  ))}
                </ul>
              )}

              {assignment.status === "FAILED" && assignment.failureReason && (
                <p className="mt-2 text-xs text-destructive">Failed: {assignment.failureReason}</p>
              )}
              {assignment.deliveredAt && (
                <p className="mt-2 text-xs text-muted-foreground">Delivered {fmtDateTime(assignment.deliveredAt)}</p>
              )}

              {(next || canFail) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {next && (
                    <Button
                      size="sm"
                      disabled={transition.isPending}
                      onClick={() =>
                        transition.mutate(
                          { assignmentId: assignment.id, action: next.action },
                          {
                            onSuccess: () => toast.success(next.label),
                            onError: (error) => toast.error(error.message),
                          },
                        )
                      }
                    >
                      {next.label}
                    </Button>
                  )}
                  {canFail && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        setNote("");
                        setFailing(assignment);
                      }}
                    >
                      Report a problem
                    </Button>
                  )}
                </div>
              )}

              {assignment.histories.length > 0 && (
                <ol className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                  {assignment.histories.map((history) => (
                    <li key={history.id}>
                      {DELIVERY_STATUS_LABELS[history.to]} · {fmtDateTime(history.at)}
                      {history.note ? ` · ${history.note}` : ""}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          );
        })}
      </div>

      {failing && (
        <Dialog open onOpenChange={(open) => !open && setFailing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>What went wrong?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Textarea
                rows={3}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Customer unreachable, wrong address…"
              />
              {transition.error && <p role="alert" className="text-sm text-destructive">{transition.error.message}</p>}
              <Button
                className="w-full"
                variant="destructive"
                disabled={transition.isPending || note.trim() === ""}
                onClick={() =>
                  transition.mutate(
                    { assignmentId: failing.id, action: "fail", note: note.trim() },
                    {
                      onSuccess: () => {
                        toast.success("Run marked as failed");
                        setFailing(null);
                      },
                    },
                  )
                }
              >
                {transition.isPending ? "Saving…" : "Mark failed"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
