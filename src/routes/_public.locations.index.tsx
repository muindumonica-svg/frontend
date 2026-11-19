import { Link, createFileRoute } from "@tanstack/react-router";
import { MapPin, Truck } from "lucide-react";
import { usePublicLocations } from "@/api/hooks/public";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader } from "@/components/shared";
import { money } from "@/lib/money";

export const Route = createFileRoute("/_public/locations/")({
  component: LocationsPage,
});

function LocationsPage() {
  const locations = usePublicLocations();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        title="Delivery & pick-up locations"
        subtitle="The areas we genuinely deliver to, priced from the branch that serves them."
      />

      {locations.isPending && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      )}

      {locations.isError && (
        <p className="mt-6 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Locations did not load. Please try again shortly.
        </p>
      )}

      {locations.isSuccess && locations.data.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon="📍"
            title="No delivery areas yet"
            body="Order for collection at your nearest branch, or check back as delivery areas are added."
          />
        </div>
      )}

      {locations.isSuccess && locations.data.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {locations.data.map((location) => (
            <Link
              key={location.id}
              to="/locations/$locationId"
              params={{ locationId: location.slug }}
              className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-elegant"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold">{location.name}</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {location.branch?.name ?? "Branch"}
                    {location.branch?.location ? ` · ${location.branch.location}` : ""}
                  </p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Truck className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-sm">
                {location.fee > 0 ? `${money(location.fee)} delivery` : "Free delivery"}
                {location.etaMinutes ? ` · about ${location.etaMinutes} min` : ""}
              </p>
              {location.minimumOrderTotal > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Minimum order {money(location.minimumOrderTotal)}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
