import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch, apiMessage, csrfReady } from "@/lib/api";
import { LOGIN_MUTATION_KEY, queryClient } from "@/lib/query";
import type {
  AuthPayload,
  Branch,
  ChangePasswordInput,
  LoginInput,
  Permission,
  UserProfile,
} from "@/types/api";
import { QueryKeys } from "./keys";

export const sessionQueryOptions = queryOptions({
  queryKey: QueryKeys.session,
  queryFn: ({ signal }) => apiFetch<AuthPayload>("/auth/me", { signal }),
});

/** The signed-in session. A 401 here means "not logged in", not an error page. */
export function useSession() {
  return useQuery(sessionQueryOptions);
}

export function useUser(): UserProfile | null {
  return useSession().data?.user ?? null;
}

export function usePermissions(): Permission[] {
  return useSession().data?.permissions ?? [];
}

export function useHasPermission(permission: Permission): boolean {
  return usePermissions().includes(permission);
}

/** Branches this account may work in — the switcher reads this, not `GET /branches`. */
export function useSessionBranches(): Branch[] {
  return useSession().data?.branches ?? [];
}

export function useActiveBranchId(): string | null {
  return useSession().data?.activeBranchId ?? null;
}

/** Route paths the app can land on. */
export type AppPath =
  | "/staff/login"
  | "/dashboard"
  | "/pos"
  | "/cashier"
  | "/stock-taking"
  | "/delivery"
  | "/inventory"
  | "/purchasing"
  | "/customers";

/**
 * Where a session starts: managers/admins get the overview (they hold
 * `reports`), tills go straight to the POS, cashiers to their shift, stock-take
 * agents to their sheet, riders to their runs, and back-office roles to the
 * first screen they can actually use. Order matters — the most specific grant
 * wins so no role lands on a page it would immediately bounce out of.
 */
export function landingPathFor(session: AuthPayload | null | undefined): AppPath {
  if (!session) return "/staff/login";
  const { permissions } = session;
  if (permissions.includes("reports")) return "/dashboard";
  if (permissions.includes("pos")) return "/pos";
  if (permissions.includes("cashier")) return "/cashier";
  if (permissions.includes("stock_take")) return "/stock-taking";
  if (permissions.includes("delivery_manage") || permissions.includes("delivery"))
    return "/delivery";
  if (permissions.includes("purchasing")) return "/purchasing";
  if (permissions.includes("inventory")) return "/inventory";
  if (permissions.includes("customers")) return "/customers";
  // No recognised grant: the overview is the only honest fallback, and its
  // guard treats it as terminal for such a session.
  return "/dashboard";
}

export function hasPermission(
  session: AuthPayload | null | undefined,
  permission: Permission,
): boolean {
  return session?.permissions.includes(permission) ?? false;
}

/**
 * Route-guard helper — callable outside React (`beforeLoad`).
 * Resolves `null` when the API says the session is gone; other failures
 * propagate so the router shows a real error instead of a false logout.
 */
export async function loadSession(): Promise<AuthPayload | null> {
  try {
    return await queryClient.ensureQueryData(sessionQueryOptions);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function useLogin() {
  const client = useQueryClient();

  return useMutation({
    mutationKey: [LOGIN_MUTATION_KEY],
    onMutate: async () => {
      await client.cancelQueries({ queryKey: QueryKeys.session });
    },
    mutationFn: async (input: LoginInput) => {
      await csrfReady();
      return apiFetch<AuthPayload>("/auth/login", { method: "POST", body: input });
    },
    onSuccess: (session) => {
      client.setQueryData(QueryKeys.session, session);
    },
  });
}

export function useLogout() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => apiMessage("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      // Shared till: drop every cached read, session included.
      client.removeQueries();
    },
  });
}

/** Till scope: every branch-filtered read is invalidated after a switch. */
export function useSetActiveBranch() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (branchId: string) =>
      apiFetch<{ activeBranchId: string }>("/auth/branch", { method: "PUT", body: { branchId } }),
    onSuccess: (result) => {
      client.setQueryData<AuthPayload>(QueryKeys.session, (previous) =>
        previous ? { ...previous, activeBranchId: result.activeBranchId } : previous,
      );
      client.invalidateQueries();
    },
  });
}

export function useChangePassword() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiFetch<{ user: UserProfile }>("/auth/password", { method: "PUT", body: input }),
    onSuccess: (result) => {
      client.setQueryData<AuthPayload>(QueryKeys.session, (previous) =>
        previous ? { ...previous, user: result.user } : previous,
      );
    },
  });
}
