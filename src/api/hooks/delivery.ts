import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiPage } from "@/lib/api";
import type {
  DeliveryAssignment,
  DeliveryAssignmentFilters,
  DeliveryCandidate,
  DeliveryPersonnel,
  DeliveryPersonnelInput,
  DeliveryPersonnelStatus,
  DeliveryZone,
  DeliveryZoneInput,
} from "@/types/api";
import { QueryKeys } from "./keys";

// -------------------------------------------------------------------- zones

export function useDeliveryZones(
  filters: { branchId?: string | undefined; active?: boolean | undefined } = {},
) {
  return useQuery(
    queryOptions({
      queryKey: [...QueryKeys.deliveryZonesRoot, filters] as const,
      queryFn: ({ signal }) =>
        apiFetch<DeliveryZone[]>("/delivery-zones", { query: filters, signal }),
    }),
  );
}

function invalidateZones(client: QueryClient): void {
  client.invalidateQueries({ queryKey: QueryKeys.deliveryZonesRoot });
  client.invalidateQueries({ queryKey: QueryKeys.deliveryPersonnelRoot });
  client.invalidateQueries({ queryKey: QueryKeys.publicCatalogRoot });
}

export function useCreateDeliveryZone() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: DeliveryZoneInput) =>
      apiFetch<DeliveryZone>("/delivery-zones", { method: "POST", body: input }),
    onSettled: () => invalidateZones(client),
  });
}

export function useUpdateDeliveryZone(zoneId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (patch: Partial<Omit<DeliveryZoneInput, "branchId">>) =>
      apiFetch<DeliveryZone>(`/delivery-zones/${zoneId}`, { method: "PUT", body: patch }),
    onSettled: () => invalidateZones(client),
  });
}

export function useDeleteDeliveryZone() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (zoneId: string) =>
      apiFetch<{ message: string }>(`/delivery-zones/${zoneId}`, { method: "DELETE" }),
    onSettled: () => invalidateZones(client),
  });
}

// ---------------------------------------------------------------- personnel

export function useDeliveryPersonnel(status?: DeliveryPersonnelStatus) {
  return useQuery(
    queryOptions({
      queryKey: [...QueryKeys.deliveryPersonnelRoot, { status: status ?? null }] as const,
      queryFn: ({ signal }) =>
        apiFetch<DeliveryPersonnel[]>("/delivery-personnel", { query: { status }, signal }),
    }),
  );
}

export function useDeliveryPersonnelDetail(profileId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.deliveryPersonnel(profileId ?? ""),
      queryFn: ({ signal }) =>
        apiFetch<DeliveryPersonnel>(`/delivery-personnel/${profileId}`, { signal }),
      enabled: Boolean(profileId),
    }),
  );
}

function invalidatePersonnel(client: QueryClient): void {
  client.invalidateQueries({ queryKey: QueryKeys.deliveryPersonnelRoot });
  client.invalidateQueries({ queryKey: QueryKeys.usersRoot });
}

export function useCreateDeliveryPersonnel() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: DeliveryPersonnelInput) =>
      apiFetch<DeliveryPersonnel>("/delivery-personnel", { method: "POST", body: input }),
    onSettled: () => invalidatePersonnel(client),
  });
}

export function useUpdateDeliveryPersonnel(profileId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (patch: {
      phone?: string | null;
      vehicleType?: string | null;
      vehiclePlate?: string | null;
    }) =>
      apiFetch<DeliveryPersonnel>(`/delivery-personnel/${profileId}`, {
        method: "PUT",
        body: patch,
      }),
    onSettled: () => invalidatePersonnel(client),
  });
}

export function useReviewDeliveryPersonnel(profileId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      status: Exclude<DeliveryPersonnelStatus, "PENDING">;
      note?: string | null;
    }) =>
      apiFetch<DeliveryPersonnel>(`/delivery-personnel/${profileId}/review`, {
        method: "POST",
        body: input,
      }),
    onSettled: () => invalidatePersonnel(client),
  });
}

export function useSetDeliveryPersonnelZones(profileId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (zoneIds: string[]) =>
      apiFetch<DeliveryPersonnel>(`/delivery-personnel/${profileId}/zones`, {
        method: "PUT",
        body: { zoneIds },
      }),
    onSettled: () => invalidatePersonnel(client),
  });
}

// --------------------------------------------------------------- assignments

export function useDeliveryAssignments(filters: DeliveryAssignmentFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.deliveryAssignments(filters),
      queryFn: ({ signal }) =>
        apiPage<DeliveryAssignment>("/delivery-assignments", { query: filters, signal }),
    }),
  );
}

export function useDeliveryCandidates() {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.deliveryCandidates,
      queryFn: ({ signal }) =>
        apiFetch<DeliveryCandidate[]>("/delivery-assignments/candidates", { signal }),
    }),
  );
}

function invalidateAssignments(client: QueryClient): void {
  client.invalidateQueries({ queryKey: QueryKeys.onlineOrdersRoot });
  client.invalidateQueries({ queryKey: QueryKeys.deliveryAssignmentsRoot });
  client.invalidateQueries({ queryKey: QueryKeys.deliveryCandidates });
  client.invalidateQueries({ queryKey: QueryKeys.riderAssignments });
  client.invalidateQueries({ queryKey: QueryKeys.salesRoot });
}

export function useAssignDelivery() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { saleId: string; personnelId: string; note?: string | null }) =>
      apiFetch<DeliveryAssignment>(`/sales/${input.saleId}/delivery-assignment`, {
        method: "POST",
        body: { personnelId: input.personnelId, note: input.note ?? null },
      }),
    onSettled: () => invalidateAssignments(client),
  });
}

export function useCancelDeliveryAssignment() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { assignmentId: string; note?: string | null }) =>
      apiFetch<DeliveryAssignment>(`/delivery-assignments/${input.assignmentId}/cancel`, {
        method: "POST",
        body: { note: input.note ?? null },
      }),
    onSettled: () => invalidateAssignments(client),
  });
}

// --------------------------------------------------------------------- rider

export function useRiderProfile() {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.riderProfile,
      queryFn: ({ signal }) => apiFetch<DeliveryPersonnel>("/delivery/profile", { signal }),
      retry: false,
    }),
  );
}

export function useRiderAssignments() {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.riderAssignments,
      queryFn: ({ signal }) =>
        apiPage<DeliveryAssignment>("/delivery/assignments", { query: { perPage: 50 }, signal }),
    }),
  );
}

export type RiderAction = "accept" | "pickup" | "dispatch" | "deliver" | "fail";

export function useRiderTransition() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { assignmentId: string; action: RiderAction; note?: string | null }) =>
      apiFetch<DeliveryAssignment>(`/delivery/assignments/${input.assignmentId}/${input.action}`, {
        method: "POST",
        body: input.note ? { note: input.note } : {},
      }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: QueryKeys.riderAssignments });
      client.invalidateQueries({ queryKey: QueryKeys.deliveryAssignmentsRoot });
      client.invalidateQueries({ queryKey: QueryKeys.deliveryCandidates });
    },
  });
}
