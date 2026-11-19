import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ApiError, apiFetch, apiMessage, apiPage, csrfReady } from "@/lib/api";
import { CUSTOMER_LOGIN_MUTATION_KEY, CATALOG_STALE_TIME_MS, queryClient } from "@/lib/query";
import type {
  CustomerAccount,
  CustomerAddress,
  CustomerAddressInput,
  CustomerFinancialEvent,
  CustomerLoyalty,
  CustomerSummary,
  CustomerPasswordInput,
  LoginInput,
  OkMessage,
  PlaceOrderInput,
  PublicCatalog,
  PublicCatalogFilters,
  PublicFaqItem,
  PublicLocation,
  PublicOrder,
  Receipt,
  PublicProduct,
  RegisterCustomerInput,
  SeoMeta,
} from "@/types/api";
import { QueryKeys } from "./keys";

// ------------------------------------------------------------------ session

export const customerSessionQueryOptions = queryOptions({
  queryKey: QueryKeys.customerSession,
  queryFn: async ({ signal }) => {
    try {
      return await apiFetch<CustomerAccount>("/public/auth/me", { signal });
    } catch (error) {
      // A 401 simply means no customer is signed in; it is not a page error.
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  retry: false,
});

export function useCustomerSession() {
  return useQuery(customerSessionQueryOptions);
}

export async function loadCustomerSession(): Promise<CustomerAccount | null> {
  try {
    return await queryClient.ensureQueryData(customerSessionQueryOptions);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

// ------------------------------------------------------------------- catalog

export function publicCatalogOptions(filters: PublicCatalogFilters = {}) {
  return queryOptions({
    queryKey: QueryKeys.publicCatalog(filters),
    queryFn: ({ signal }) => apiFetch<PublicCatalog>("/public/catalog", { query: filters, signal }),
    staleTime: CATALOG_STALE_TIME_MS,
  });
}

export function usePublicCatalog(filters: PublicCatalogFilters = {}) {
  return useQuery(publicCatalogOptions(filters));
}

export function usePublicProduct(productId: string | null, branchId: string | null = null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.publicProduct(productId ?? "", branchId),
      queryFn: ({ signal }) =>
        apiFetch<PublicProduct>(`/public/products/${productId}`, {
          query: { branchId: branchId ?? undefined },
          signal,
        }),
      enabled: Boolean(productId),
    }),
  );
}

// -------------------------------------------------------------- seo & locations

export function useSeoMeta(path: string) {
  return useQuery(
    queryOptions({
      queryKey: ["public-seo", path],
      queryFn: ({ signal }) => apiFetch<SeoMeta>("/public/seo", { query: { path }, signal }),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    }),
  );
}

export function usePublicLocations() {
  return useQuery(
    queryOptions({
      queryKey: ["public-locations"],
      queryFn: ({ signal }) => apiFetch<PublicLocation[]>("/public/locations", { signal }),
      staleTime: 5 * 60 * 1000,
    }),
  );
}

export function usePublicLocation(slug: string | null) {
  return useQuery(
    queryOptions({
      queryKey: ["public-location", slug],
      queryFn: ({ signal }) => apiFetch<PublicLocation>(`/public/locations/${slug}`, { signal }),
      enabled: Boolean(slug),
    }),
  );
}

export function usePublicFaq() {
  return useQuery(
    queryOptions({
      queryKey: ["public-faq"],
      queryFn: ({ signal }) => apiFetch<{ items: PublicFaqItem[] }>("/public/faq", { signal }),
      staleTime: 5 * 60 * 1000,
    }),
  );
}

// -------------------------------------------------------------- auth mutations

function clearCustomerScopedQueries(client: QueryClient): void {
  client.removeQueries({ queryKey: QueryKeys.customerAddresses });
  client.removeQueries({ queryKey: QueryKeys.publicOrders });
  client.removeQueries({ queryKey: ["customer-session", "financial-summary"] });
  client.removeQueries({ queryKey: ["customer-session", "financial-history"] });
}

export function useCustomerLogin() {
  const client = useQueryClient();

  return useMutation({
    mutationKey: [CUSTOMER_LOGIN_MUTATION_KEY],
    mutationFn: async (input: LoginInput) => {
      await csrfReady();
      return apiFetch<CustomerAccount>("/public/auth/login", { method: "POST", body: input });
    },
    onSuccess: (account) => {
      clearCustomerScopedQueries(client);
      client.setQueryData(QueryKeys.customerSession, account);
      client.invalidateQueries({ queryKey: QueryKeys.customerAddresses });
    },
  });
}

export function useCustomerRegister() {
  const client = useQueryClient();

  return useMutation({
    mutationKey: [CUSTOMER_LOGIN_MUTATION_KEY],
    mutationFn: async (input: RegisterCustomerInput) => {
      await csrfReady();
      return apiFetch<CustomerAccount>("/public/auth/register", { method: "POST", body: input });
    },
    onSuccess: (account) => {
      clearCustomerScopedQueries(client);
      client.setQueryData(QueryKeys.customerSession, account);
    },
  });
}

export function useCustomerLogout() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => apiMessage("/public/auth/logout", { method: "POST" }),
    onSuccess: () => {
      client.setQueryData(QueryKeys.customerSession, null);
      clearCustomerScopedQueries(client);
    },
  });
}

export function useCustomerChangePassword() {
  return useMutation({
    mutationFn: (input: CustomerPasswordInput) =>
      apiFetch<OkMessage>("/public/auth/password", { method: "PUT", body: input }),
  });
}

// --------------------------------------------------------------- addresses

export function useCustomerAddresses(enabled = true) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.customerAddresses,
      queryFn: ({ signal }) => apiFetch<CustomerAddress[]>("/public/addresses", { signal }),
      enabled,
    }),
  );
}

export function useCustomerFinancialSummary(customerId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.publicCustomerFinancialSummary(customerId),
      queryFn: ({ signal }) =>
        apiFetch<CustomerSummary>("/public/account/financial-summary", { signal }),
      enabled: Boolean(customerId),
      refetchInterval: 15_000,
      refetchOnWindowFocus: "always",
    }),
  );
}

export function useCustomerFinancialHistory(customerId: string | null, page = 1) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.publicCustomerFinancialHistory(customerId, page),
      queryFn: ({ signal }) =>
        apiPage<CustomerFinancialEvent>("/public/account/financial-history", {
          query: { page, perPage: 20 },
          signal,
        }),
      enabled: Boolean(customerId),
      refetchInterval: 15_000,
      refetchOnWindowFocus: "always",
    }),
  );
}

function invalidateAddresses(client: QueryClient): void {
  client.invalidateQueries({ queryKey: QueryKeys.customerAddresses });
}

export function useCreateAddress() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CustomerAddressInput) =>
      apiFetch<CustomerAddress>("/public/addresses", { method: "POST", body: input }),
    onSettled: () => invalidateAddresses(client),
  });
}

export function useUpdateAddress() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { addressId: string; patch: Partial<CustomerAddressInput> }) =>
      apiFetch<CustomerAddress>(`/public/addresses/${input.addressId}`, {
        method: "PUT",
        body: input.patch,
      }),
    onSettled: () => invalidateAddresses(client),
  });
}

export function useDeleteAddress() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (addressId: string) =>
      apiMessage(`/public/addresses/${addressId}`, { method: "DELETE" }),
    onSettled: () => invalidateAddresses(client),
  });
}

// ---------------------------------------------------------------- orders

export function usePublicOrders(enabled = true) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.publicOrders,
      queryFn: ({ signal }) =>
        apiPage<PublicOrder>("/public/orders", { query: { perPage: 50 }, signal }),
      enabled,
    }),
  );
}

export function usePublicOrder(orderId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.publicOrder(orderId ?? ""),
      queryFn: ({ signal }) => apiFetch<PublicOrder>(`/public/orders/${orderId}`, { signal }),
      enabled: Boolean(orderId),
      refetchInterval: (query) =>
        query.state.data && !["COMPLETED", "CANCELLED"].includes(query.state.data.status)
          ? 5000
          : false,
    }),
  );
}

export function usePublicOrderReceipt(orderId: string | null, enabled = true) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.publicOrderReceipt(orderId ?? ""),
      queryFn: ({ signal }) => apiFetch<Receipt>(`/public/orders/${orderId}/receipt`, { signal }),
      enabled: Boolean(orderId) && enabled,
    }),
  );
}

export function usePublicCustomerLoyalty(enabled = true) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.publicCustomerLoyalty,
      queryFn: ({ signal }) => apiFetch<CustomerLoyalty>("/public/account/loyalty", { signal }),
      enabled,
      refetchInterval: (query) =>
        query.state.data?.pendingRedemptions.some((request) =>
          ["PENDING", "APPROVED"].includes(request.status),
        )
          ? 10_000
          : false,
    }),
  );
}

export function useRequestPublicLoyaltyPayment() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: { orderId: string; points: number }) => {
      await csrfReady();
      return apiFetch<PublicOrder>(`/public/orders/${input.orderId}/payments/loyalty`, {
        method: "POST",
        body: { points: input.points },
      });
    },
    onSuccess: (order) => {
      client.setQueryData(QueryKeys.publicOrder(order.id), order);
      client.invalidateQueries({ queryKey: QueryKeys.publicOrders });
      client.invalidateQueries({ queryKey: QueryKeys.publicCustomerLoyalty });
    },
  });
}

export function usePlaceOrder() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: PlaceOrderInput) => {
      await csrfReady();
      return apiFetch<PublicOrder>("/public/orders", { method: "POST", body: input });
    },
    onSuccess: (order) => {
      client.setQueryData(QueryKeys.publicOrder(order.id), order);
      client.invalidateQueries({ queryKey: QueryKeys.publicOrders });
      // A hold changes what the storefront may show as in stock.
      client.invalidateQueries({ queryKey: QueryKeys.publicCatalogRoot });
    },
  });
}

export function useCancelOrder() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) =>
      apiFetch<PublicOrder>(`/public/orders/${orderId}/cancel`, { method: "POST" }),
    onSuccess: (order) => {
      client.setQueryData(QueryKeys.publicOrder(order.id), order);
      client.invalidateQueries({ queryKey: QueryKeys.publicOrders });
      client.invalidateQueries({ queryKey: QueryKeys.publicCatalogRoot });
    },
  });
}
