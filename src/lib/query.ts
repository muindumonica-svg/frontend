import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

/**
 * Single TanStack Query client for the app. `main.tsx` owns it, `__root.tsx`
 * mounts it from router context, and route guards read it directly.
 */

/** Catalog reads change rarely; the till reads must always hit the server. */
export const CATALOG_STALE_TIME_MS = 30_000;
export const TILL_STALE_TIME_MS = 0;

/** Mutation key whose failures the login form renders inline instead. */
export const LOGIN_MUTATION_KEY = "auth/login";
export const CUSTOMER_LOGIN_MUTATION_KEY = "customer-auth/login";

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  // Status 0 is a network failure and 504 a timeout; 4xx answers do not change on retry.
  return error.status === 0 || error.status === 504 || error.status >= 500;
}

function toastApiError(error: ApiError): void {
  // A 401 is the route guard's signal to send the user to /staff/login — no toast.
  if (error.status === 401) return;

  toast.error(error.message, {
    description: error.status >= 500 && error.requestId ? `Request ID: ${error.requestId}` : undefined,
  });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError) toastApiError(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!(error instanceof ApiError)) return;
      const key = mutation.options.mutationKey?.[0];
      if (key === LOGIN_MUTATION_KEY || key === CUSTOMER_LOGIN_MUTATION_KEY) return;
      toastApiError(error);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: CATALOG_STALE_TIME_MS,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => failureCount < 2 && isRetryableError(error),
    },
    mutations: {
      retry: 0,
    },
  },
});
