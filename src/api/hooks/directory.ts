import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiMessage, apiPage, apiWithMeta } from "@/lib/api";
import type {
  AuditLog,
  AuditLogFilters,
  AuthPayload,
  Customer,
  CustomerLoyalty,
  CustomerFinancialEvent,
  LoyaltyAdjustmentInput,
  LoyaltyDashboard,
  LoyaltyRedemptionRequest,
  CustomerInput,
  CustomerListFilters,
  CustomerSummary,
  Settings,
  SettingsPatch,
  StaffStatusHistoryEntry,
  StaffStatusInput,
  UserInput,
  UserListFilters,
  UserProfile,
  UserUpdateInput,
} from "@/types/api";
import { QueryKeys } from "./keys";

// ---------------------------------------------------------------- customers

export function useCustomerList(filters: CustomerListFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.customers(filters),
      queryFn: ({ signal }) => apiFetch<Customer[]>("/customers", { query: filters, signal }),
    }),
  );
}

export function useCustomerSearch(search: string) {
  const q = search.trim();

  return useQuery(
    queryOptions({
      queryKey: QueryKeys.customers(q ? { q } : {}),
      queryFn: ({ signal }) => apiFetch<Customer[]>("/customers", { query: { q }, signal }),
      enabled: q.length >= 2,
    }),
  );
}

/** `GET /customers/{id}` also carries the lifetime spend summary the profile card shows. */
export function useCustomer(customerId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.customer(customerId ?? ""),
      queryFn: ({ signal }) =>
        apiWithMeta<Customer, CustomerSummary>(`/customers/${customerId}`, { signal }),
      enabled: Boolean(customerId),
      refetchInterval: 15_000,
      refetchOnWindowFocus: "always",
    }),
  );
}

export function useCustomerFinancialSummary(customerId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.customerFinancialSummary(customerId ?? ""),
      queryFn: ({ signal }) =>
        apiFetch<CustomerSummary>(`/customers/${customerId}/financial-summary`, { signal }),
      enabled: Boolean(customerId),
      refetchInterval: 15_000,
      refetchOnWindowFocus: "always",
    }),
  );
}

export function useCustomerFinancialHistory(customerId: string | null, page = 1) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.customerFinancialHistory(customerId ?? "", page),
      queryFn: ({ signal }) =>
        apiPage<CustomerFinancialEvent>(`/customers/${customerId}/financial-history`, {
          query: { page, perPage: 20 },
          signal,
        }),
      enabled: Boolean(customerId),
      refetchInterval: 15_000,
      refetchOnWindowFocus: "always",
    }),
  );
}

export function useCustomerLoyalty(customerId: string | null, enabled = true) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.customerLoyalty(customerId ?? ""),
      queryFn: ({ signal }) =>
        apiFetch<CustomerLoyalty>(`/customers/${customerId}/loyalty`, { signal }),
      enabled: Boolean(customerId) && enabled,
    }),
  );
}

export function useLoyaltyDashboard(enabled = true) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.loyaltyDashboard,
      queryFn: ({ signal }) => apiFetch<LoyaltyDashboard>("/loyalty/dashboard", { signal }),
      enabled,
    }),
  );
}

export function useLoyaltyRedemptionRequests(status = "PENDING", enabled = true) {
  return useQuery({
    queryKey: QueryKeys.loyaltyRedemptionRequests(status),
    queryFn: ({ signal }) =>
      apiPage<LoyaltyRedemptionRequest>("/loyalty/redemption-requests", {
        query: { status, perPage: 100 },
        signal,
      }),
    enabled,
    refetchInterval: status === "PENDING" ? 10_000 : false,
  });
}

function invalidateLoyaltyRedemptions(client: QueryClient, customerId?: string): void {
  client.invalidateQueries({ queryKey: ["loyalty", "redemption-requests"] });
  client.invalidateQueries({ queryKey: QueryKeys.salesRoot });
  client.invalidateQueries({ queryKey: QueryKeys.paymentsRoot });
  client.invalidateQueries({ queryKey: QueryKeys.loyaltyDashboard });
  if (customerId) {
    client.invalidateQueries({ queryKey: QueryKeys.customerLoyalty(customerId) });
  }
}

export function useApproveLoyaltyRedemption() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (request: LoyaltyRedemptionRequest) =>
      apiFetch<LoyaltyRedemptionRequest>(
        `/loyalty/redemption-requests/${request.id}/approve`,
        { method: "POST" },
      ),
    onSettled: (_result, _error, request) =>
      invalidateLoyaltyRedemptions(client, request.customerId),
  });
}

export function useRejectLoyaltyRedemption() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { request: LoyaltyRedemptionRequest; reason: string }) =>
      apiFetch<LoyaltyRedemptionRequest>(
        `/loyalty/redemption-requests/${input.request.id}/reject`,
        { method: "POST", body: { reason: input.reason } },
      ),
    onSettled: (_result, _error, input) =>
      invalidateLoyaltyRedemptions(client, input.request.customerId),
  });
}

export function useAdjustLoyalty() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: LoyaltyAdjustmentInput & { customerId: string }) =>
      apiFetch<CustomerLoyalty>(`/customers/${input.customerId}/loyalty-adjustments`, {
        method: "POST",
        body: { points: input.points, reason: input.reason },
      }),
    onSettled: (_account, _error, input) => {
      client.invalidateQueries({ queryKey: QueryKeys.customerLoyalty(input.customerId) });
      client.invalidateQueries({ queryKey: QueryKeys.loyaltyDashboard });
    },
  });
}

function invalidateCustomers(client: QueryClient, customerId?: string): void {
  client.invalidateQueries({ queryKey: QueryKeys.customersRoot });
  if (customerId) {
    client.invalidateQueries({ queryKey: QueryKeys.customer(customerId) });
    client.invalidateQueries({ queryKey: QueryKeys.customerFinancialSummary(customerId) });
    client.invalidateQueries({ queryKey: ["customers", "financial-history", customerId] });
  }
}

export function useCreateCustomer() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CustomerInput) =>
      apiFetch<Customer>("/customers", { method: "POST", body: input }),
    onSuccess: (customer) => client.setQueryData(QueryKeys.customer(customer.id), customer),
    onSettled: () => invalidateCustomers(client),
  });
}

export function useUpdateCustomer(customerId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (patch: CustomerInput) =>
      apiFetch<Customer>(`/customers/${customerId}`, { method: "PUT", body: patch }),
    onSuccess: (customer) => client.setQueryData(QueryKeys.customer(customer.id), customer),
    onSettled: () => invalidateCustomers(client, customerId),
  });
}

/** `409` while the customer still has sales — there is no deactivation column. */
export function useDeleteCustomer() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (customerId: string) =>
      apiMessage(`/customers/${customerId}`, { method: "DELETE" }),
    onSettled: (_message, _error, customerId) => invalidateCustomers(client, customerId),
  });
}

// -------------------------------------------------------------------- users

export function useUserList(filters: UserListFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.users(filters),
      queryFn: ({ signal }) => apiFetch<UserProfile[]>("/users", { query: filters, signal }),
    }),
  );
}

function invalidateUsers(client: QueryClient): void {
  client.invalidateQueries({ queryKey: QueryKeys.usersRoot });
}

export function useCreateUser() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: UserInput) =>
      apiFetch<UserProfile>("/users", { method: "POST", body: input }),
    onSettled: () => invalidateUsers(client),
  });
}

/** The API has no user delete route — `active: false` is the off switch. */
export function useUpdateUser(userId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (patch: UserUpdateInput) =>
      apiFetch<UserProfile>(`/users/${userId}`, { method: "PUT", body: patch }),
    onSuccess: (user) => {
      invalidateUsers(client);
      client.invalidateQueries({ queryKey: QueryKeys.userStatusHistory(userId) });
      // The session copy drives nav permissions, so a role edit applies immediately.
      if (user.id === client.getQueryData<AuthPayload>(QueryKeys.session)?.user?.id) {
        client.invalidateQueries({ queryKey: QueryKeys.session });
      }
    },
  });
}

export function useUpdateUserStatus(userId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: StaffStatusInput) =>
      apiFetch<UserProfile>(`/users/${userId}/status`, { method: "POST", body: input }),
    onSuccess: (user) => {
      invalidateUsers(client);
      client.invalidateQueries({ queryKey: QueryKeys.userStatusHistory(userId) });
      if (user.id === client.getQueryData<AuthPayload>(QueryKeys.session)?.user?.id) {
        client.invalidateQueries({ queryKey: QueryKeys.session });
      }
    },
  });
}

/** Newest first; the API already ordered it. */
export function useUserStatusHistory(userId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.userStatusHistory(userId ?? ""),
      queryFn: ({ signal }) =>
        apiFetch<StaffStatusHistoryEntry[]>(`/users/${userId}/status-history`, { signal }),
      enabled: Boolean(userId),
    }),
  );
}

// ----------------------------------------------------------------- settings

export function useSettings() {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.settings,
      queryFn: ({ signal }) => apiFetch<Settings>("/settings", { signal }),
    }),
  );
}

export function useUpdateSettings() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (patch: SettingsPatch) =>
      apiFetch<Settings>("/settings", { method: "PUT", body: patch }),
    onSuccess: (settings) => client.setQueryData(QueryKeys.settings, settings),
  });
}

// --------------------------------------------------------------- audit log

export function useAuditLogs(filters: AuditLogFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.auditLogs(filters),
      queryFn: ({ signal }) => apiPage<AuditLog>("/audit-logs", { query: filters, signal }),
    }),
  );
}
