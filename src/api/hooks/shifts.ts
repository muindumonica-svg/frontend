import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { TILL_STALE_TIME_MS } from "@/lib/query";
import type {
  CashierShift,
  CloseShiftInput,
  OpenShiftInput,
  ReviewShiftInput,
  ShiftListFilters,
  ShiftMovementInput,
} from "@/types/api";
import { QueryKeys } from "./keys";

/**
 * There is no `/shifts/current` endpoint: an open shift is simply the first
 * `OPEN` row of the cashier's own list, which the API already scopes per user.
 */
export function useCurrentShift(userId: string | null, filters: Omit<ShiftListFilters, "userId" | "status"> = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.currentShift(userId),
      queryFn: async ({ signal }) => {
        const shifts = await apiFetch<CashierShift[]>("/shifts", {
          query: { ...filters, userId: userId ?? undefined, status: "OPEN" },
          signal,
        });
        return shifts.find((shift) => shift.status === "OPEN") ?? null;
      },
      enabled: Boolean(userId),
      staleTime: TILL_STALE_TIME_MS,
    }),
  );
}

export function useShiftList(filters: ShiftListFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.shifts(filters),
      queryFn: ({ signal }) => apiFetch<CashierShift[]>("/shifts", { query: filters, signal }),
    }),
  );
}

export function useShift(shiftId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.shift(shiftId ?? ""),
      queryFn: ({ signal }) => apiFetch<CashierShift>(`/shifts/${shiftId}`, { signal }),
      enabled: Boolean(shiftId),
      staleTime: TILL_STALE_TIME_MS,
    }),
  );
}

function invalidateShifts(client: QueryClient, shiftId?: string): void {
  client.invalidateQueries({ queryKey: QueryKeys.shiftsRoot });
  if (shiftId) client.invalidateQueries({ queryKey: QueryKeys.shift(shiftId) });
}

/** `409 SHIFT_ALREADY_OPEN` when this cashier already has a live shift. */
export function useOpenShift() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: OpenShiftInput) => apiFetch<CashierShift>("/shifts/open", { method: "POST", body: input }),
    onSuccess: (shift) => client.setQueryData(QueryKeys.shift(shift.id), shift),
    onSettled: () => invalidateShifts(client),
  });
}

/** Cash in (float top-up) / cash out (petty cash) inside an open shift. */
export function useAddShiftMovement(shiftId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ShiftMovementInput) =>
      apiFetch<CashierShift>(`/shifts/${shiftId}/movements`, { method: "POST", body: input }),
    onSuccess: (shift) => client.setQueryData(QueryKeys.shift(shift.id), shift),
    onSettled: () => invalidateShifts(client, shiftId),
  });
}

/**
 * Counting the drawer: the server computes `expectedCash` and pushes the shift
 * to `UNDER_REVIEW` when the variance breaks `settings.cashVarianceTolerance`.
 */
export function useCloseShift(shiftId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CloseShiftInput) =>
      apiFetch<CashierShift>(`/shifts/${shiftId}/close`, { method: "POST", body: input }),
    onSuccess: (shift) => client.setQueryData(QueryKeys.shift(shift.id), shift),
    onSettled: () => {
      invalidateShifts(client, shiftId);
      client.invalidateQueries({ queryKey: QueryKeys.paymentsRoot });
    },
  });
}

/** Manager sign-off of a shift held `UNDER_REVIEW`; needs the `pos_void` permission. */
export function useReviewShift(shiftId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ReviewShiftInput) =>
      apiFetch<CashierShift>(`/shifts/${shiftId}/review`, { method: "POST", body: input }),
    onSuccess: (shift) => client.setQueryData(QueryKeys.shift(shift.id), shift),
    onSettled: () => invalidateShifts(client, shiftId),
  });
}
