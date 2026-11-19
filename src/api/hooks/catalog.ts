import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch, apiMessage } from "@/lib/api";
import type {
  BalanceFilters,
  Branch,
  BranchInput,
  Category,
  CategoryInput,
  InventoryBalance,
  Movement,
  MovementFilters,
  Product,
  ProductFilters,
  ProductInput,
} from "@/types/api";
import { QueryKeys } from "./keys";

// ------------------------------------------------------------------ reads

export function useBranchList() {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.branchesRoot,
      queryFn: ({ signal }) => apiFetch<Branch[]>("/branches", { signal }),
    }),
  );
}

export function useCategoryList() {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.categoriesRoot,
      queryFn: ({ signal }) => apiFetch<Category[]>("/categories", { signal }),
    }),
  );
}

export function productListOptions(filters: ProductFilters = {}) {
  return queryOptions({
    queryKey: QueryKeys.products(filters),
    queryFn: ({ signal }) => apiFetch<Product[]>("/products", { query: filters, signal }),
  });
}

/** `activeOnly` + `branchId` is the till's product grid (each row then carries `balance`). */
export function useProductList(filters: ProductFilters = {}) {
  return useQuery(productListOptions(filters));
}

export function useProduct(productId: string | null) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.product(productId ?? ""),
      queryFn: ({ signal }) => apiFetch<Product>(`/products/${productId}`, { signal }),
      enabled: Boolean(productId),
    }),
  );
}

export function useInventoryBalances(filters: BalanceFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.balances(filters),
      queryFn: ({ signal }) => apiFetch<InventoryBalance[]>("/inventory/balances", { query: filters, signal }),
    }),
  );
}

/** Newest first; the server caps the response at `limit` (default 200). */
export function useInventoryMovements(filters: MovementFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.movements(filters),
      queryFn: ({ signal }) => apiFetch<Movement[]>("/inventory/movements", { query: filters, signal }),
    }),
  );
}

// -------------------------------------------------------------- invalidation

function invalidateBranches(client: QueryClient): void {
  client.invalidateQueries({ queryKey: QueryKeys.branchesRoot });
  // `GET /api/auth/me` carries the branch list the switcher renders.
  client.invalidateQueries({ queryKey: QueryKeys.session });
}

function invalidateCategories(client: QueryClient): void {
  client.invalidateQueries({ queryKey: QueryKeys.categoriesRoot });
  client.invalidateQueries({ queryKey: QueryKeys.productsRoot });
}

function invalidateProducts(client: QueryClient): void {
  client.invalidateQueries({ queryKey: QueryKeys.productsRoot });
  client.invalidateQueries({ queryKey: QueryKeys.balancesRoot });
}

// -------------------------------------------------------------- mutations

export function useCreateBranch() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: BranchInput) => apiFetch<Branch>("/branches", { method: "POST", body: input }),
    onSettled: () => invalidateBranches(client),
  });
}

export function useUpdateBranch() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { branchId: string; patch: Partial<BranchInput> }) =>
      apiFetch<Branch>(`/branches/${input.branchId}`, { method: "PUT", body: input.patch }),
    onSettled: () => invalidateBranches(client),
  });
}

/** Fails with `409 BRANCH_IN_USE` once the branch has balances or sales. */
export function useDeleteBranch() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (branchId: string) => apiMessage(`/branches/${branchId}`, { method: "DELETE" }),
    onSettled: () => invalidateBranches(client),
  });
}

export function useCreateCategory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CategoryInput) => apiFetch<Category>("/categories", { method: "POST", body: input }),
    onSettled: () => invalidateCategories(client),
  });
}

export function useUpdateCategory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { categoryId: string; patch: Partial<CategoryInput> }) =>
      apiFetch<Category>(`/categories/${input.categoryId}`, { method: "PUT", body: input.patch }),
    onSettled: () => invalidateCategories(client),
  });
}

export function useDeleteCategory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (categoryId: string) => apiMessage(`/categories/${categoryId}`, { method: "DELETE" }),
    onSettled: () => invalidateCategories(client),
  });
}

export function useCreateProduct() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ProductInput) => apiFetch<Product>("/products", { method: "POST", body: input }),
    onSettled: () => invalidateProducts(client),
  });
}

/** Deactivating is this mutation with `{ patch: { active: false } }` — products are never hard-deleted. */
export function useUpdateProduct() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { productId: string; patch: Partial<ProductInput> }) =>
      apiFetch<Product>(`/products/${input.productId}`, { method: "PUT", body: input.patch }),
    onSuccess: (product) => client.setQueryData(QueryKeys.product(product.id), product),
    onSettled: () => invalidateProducts(client),
  });
}
