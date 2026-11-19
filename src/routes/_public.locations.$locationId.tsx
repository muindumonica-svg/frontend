import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, MapPin, PackageCheck, Truck } from "lucide-react";
import { usePublicLocation } from "@/api/hooks/public";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/money";

export const Route = createFileRoute("/_public/locations/$locationId")({
  component: LocationPage,
});

function LocationPage() {
  const { locationId } = Route.useParams();
  const location = usePublicLocation(locationId);

  if (location.isPending) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  if (location.isError || !location.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Location not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This delivery area is not currently listed.
        </p>
        <Button asChild className="mt-5">
          <Link to="/locations">See all locations</Link>
        </Button>
      </div>
    );
  }

  const data = location.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/locations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All locations
      </Link>

      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">
        {data.name} delivery
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Served from {data.branch?.name ?? "our branch"}
        {data.branch?.location ? ` in ${data.branch.location}` : ""}.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <Truck className="h-4 w-4 text-brand-deep" />
          <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">Delivery fee</p>
          <p className="mt-1 font-display text-lg font-bold">
            {data.fee > 0 ? money(data.fee) : "Free"}
          </p>
          {data.freeDeliveryThreshold !== null && data.fee > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Free over {money(data.freeDeliveryThreshold)}
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <MapPin className="h-4 w-4 text-brand-deep" />
          <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">Typical time</p>
          <p className="mt-1 font-display text-lg font-bold">
            {data.etaMinutes ? `${data.etaMinutes} min` : "Confirmed at checkout"}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <PackageCheck className="h-4 w-4 text-brand-deep" />
          <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">Available now</p>
          <p className="mt-1 font-display text-lg font-bold">
            {data.availableProductCount ?? 0} {data.availableProductCount === 1 ? "product" : "products"}
          </p>
        </div>
      </div>

      {data.minimumOrderTotal > 0 && (
        <p className="mt-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          Orders to {data.name} start at {money(data.minimumOrderTotal)}.
        </p>
      )}

      {data.instructions && (
        <div className="mt-4 rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Delivery notes</p>
          <p className="mt-1 text-sm">{data.instructions}</p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/shop">Shop for delivery</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/locations">Other areas</Link>
        </Button>
      </div>
    </div>
  );
}
