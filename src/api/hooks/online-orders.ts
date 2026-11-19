import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPage } from "@/lib/api";
import type { Sale } from "@/types/api";
import { QueryKeys } from "./keys";

export interface OnlineDeliveryOption {
  id: string;
  name: string | null;
  phone: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
}

export function useOnlineOrders(branchId?: string | null) {
  const filters = branchId ? { branchId, perPage: 50 } : { perPage: 50 };
  return useQuery({
    queryKey: QueryKeys.onlineOrders(filters),
    queryFn: ({ signal }) => apiPage<Sale>("/online-orders", { query: filters, signal }),
    refetchInterval: 10_000,
    refetchOnWindowFocus: "always",
  });
}

export function useOnlineDeliveryOptions(saleId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...QueryKeys.onlineOrdersRoot, "delivery-options", saleId],
    queryFn: ({ signal }) =>
      apiFetch<OnlineDeliveryOption[]>(`/online-orders/${saleId}/delivery-options`, { signal }),
    enabled,
  });
}

export function useOnlineOrderAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      saleId,
      action,
    }: {
      saleId: string;
      action: "accept" | "prepare" | "ready" | "complete";
    }) => apiFetch<Sale>(`/online-orders/${saleId}/${action}`, { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: QueryKeys.onlineOrdersRoot });
      void client.invalidateQueries({ queryKey: QueryKeys.salesRoot });
    },
  });
}
