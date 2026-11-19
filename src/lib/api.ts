import type { OkMessage, PageMeta, Paged, QueryParams } from "@/types/api";

/**
 * Typed `fetch` wrapper for the BrathaMatu Laravel API (docs/API_CONTRACT.md).
 * Auth is cookie/session only — this module never stores tokens; it replays the
 * Sanctum `XSRF-TOKEN` cookie as a header on mutating requests.
 */

function configuredApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  const base = typeof raw === "string" && raw.length > 0 ? raw : "/api";
  return base.replace(/\/+$/, "");
}

const API_BASE = configuredApiBase();

const DEFAULT_TIMEOUT_MS = 20_000;
/** Report reads scan long windows and heavy aggregates, so they get more time. */
export const REPORT_TIMEOUT_MS = 90_000;

/** Codes the API returns in `code` (contract "Error codes" plus auth/permission codes). */
export type ApiErrorCode =
  | "INSUFFICIENT_STOCK"
  | "SALE_NOT_DRAFT"
  | "SALE_ALREADY_COMPLETED"
  | "AMOUNT_EXCEEDS_BALANCE"
  | "PAYMENT_NOT_PENDING"
  | "SHIFT_ALREADY_OPEN"
  | "SHIFT_CLOSED"
  | "BRANCH_IN_USE"
  | "BRANCH_NOT_ALLOWED"
  | "CARD_NOT_CONFIGURED"
  | "MPESA_NOT_CONFIGURED"
  | "MPESA_TIMEOUT"
  | "STOCK_TAKE_NOT_SUBMITTED"
  | "APPROVAL_REQUIRED"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "PERMISSION_DENIED"
  | "ACCOUNT_DISABLED"
  | "TOO_MANY_ATTEMPTS"
  | "STATEFUL_REQUEST_REQUIRED"
  | "DELIVERY_ZONE_IN_USE"
  | "DELIVERY_NOT_READY"
  | "DELIVERY_PERSONNEL_UNAVAILABLE"
  | "DELIVERY_ALREADY_ASSIGNED"
  | "DELIVERY_INVALID_TRANSITION"
  | "DELIVERY_NOT_CANCELLABLE"
  | "DELIVERY_PROFILE_MISSING"
  | "NOT_A_DELIVERY_ORDER";

const FALLBACK_MESSAGES: Record<number, string> = {
  401: "Your session has expired. Sign in again.",
  403: "You do not have permission to do that.",
  404: "That record could not be found.",
  409: "That action conflicts with the current state.",
  422: "Please correct the highlighted fields.",
  429: "Too many attempts. Please wait a moment.",
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | null;
  readonly errors?: Record<string, string[]>;
  readonly requestId: string | null;

  constructor(input: {
    message: string;
    status: number;
    code?: ApiErrorCode | null;
    errors?: Record<string, string[]>;
    requestId?: string | null;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code ?? null;
    this.errors = input.errors;
    this.requestId = input.requestId ?? null;
  }
}

/** Per-field message from a 422 body, for inline form errors. */
export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.errors?.[field]?.[0] : undefined;
}

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
  method?: ApiMethod;
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Drops `undefined`, `null` and blank values so absent filters stay absent. */
export function buildQuery(query?: QueryParams): string {
  if (!query) return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    const asString = typeof value === "string" ? value.trim() : String(value);
    if (asString === "") continue;
    params.set(key, asString);
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}

function apiUrl(path: string, query?: QueryParams): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}${buildQuery(query)}`;
}

/** `/sanctum/...` sits on the same origin as the API base, not under `/api`. */
function sanctumUrl(path: string): string {
  const origin = /^https?:\/\/[^/]+/i.exec(API_BASE);
  return `${origin ? origin[0] : ""}${path}`;
}

/** Absolute URL for browser-driven downloads (report CSV export). */
export function apiDownloadUrl(path: string, query?: QueryParams): string {
  return apiUrl(path, query);
}

function xsrfToken(): string | null {
  const match = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(document.cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

let csrfPromise: Promise<void> | null = null;

/** Loads the Sanctum CSRF cookie once per page load; safe to await repeatedly. */
export function csrfReady(): Promise<void> {
  if (!csrfPromise) {
    csrfPromise = send<void, never>(sanctumUrl("/sanctum/csrf-cookie"))
      .then(() => undefined)
      .catch((error: unknown) => {
        csrfPromise = null;
        throw error;
      });
  }

  return csrfPromise;
}

interface TimeoutHandle {
  signal: AbortSignal;
  dispose: () => void;
}

function withTimeout(timeoutMs: number, external?: AbortSignal): TimeoutHandle {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"));
  }, timeoutMs);

  const onExternalAbort = () => controller.abort(external?.reason);
  external?.addEventListener("abort", onExternalAbort, { once: true });

  return {
    signal: controller.signal,
    dispose: () => {
      window.clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

interface ErrorBody {
  message?: string;
  code?: string;
  errors?: Record<string, string[]>;
}

async function toApiError(response: Response, requestId: string | null): Promise<ApiError> {
  let body: ErrorBody | null = null;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    body = null;
  }

  return new ApiError({
    message:
      body?.message || FALLBACK_MESSAGES[response.status] || `Request failed (${response.status}).`,
    status: response.status,
    code: (body?.code as ApiErrorCode | undefined) ?? null,
    errors: body?.errors,
    requestId,
  });
}

interface Envelope<T, TMeta> {
  data: T;
  meta?: TMeta;
}

async function send<T, TMeta extends object>(
  url: string,
  options: ApiRequestOptions = {},
): Promise<Envelope<T, TMeta>> {
  const method = options.method ?? "GET";
  const timeout = withTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.signal);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const token = xsrfToken();
    if (token) headers["X-XSRF-TOKEN"] = token;
  }

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        credentials: "same-origin",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: timeout.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new ApiError({
          message: "The server took too long to respond. Try again.",
          status: 504,
        });
      }
      throw new ApiError({ message: "Cannot reach the server. Check the connection.", status: 0 });
    }

    const requestId = response.headers.get("x-request-id");
    if (!response.ok) throw await toApiError(response, requestId);

    const text = await response.text();
    if (!text) return { data: undefined as T };

    return JSON.parse(text) as Envelope<T, TMeta>;
  } finally {
    timeout.dispose();
  }
}

/**
 * Every documented response is a `{data}` envelope, so `T` is the resource
 * shape rather than the envelope.
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return (await send<T, never>(apiUrl(path, options.query), options)).data;
}

/** `{data, meta}` where `meta` carries something the UI needs (stock warning, variance summary). */
export async function apiWithMeta<T, TMeta extends object>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<{ data: T; meta: TMeta }> {
  const envelope = await send<T, TMeta>(apiUrl(path, options.query), options);
  return { data: envelope.data, meta: envelope.meta ?? ({} as TMeta) };
}

/** Paginated list `{data, meta}` → `Paged<T>` for the SPA's tables. */
export async function apiPage<T>(path: string, options: ApiRequestOptions = {}): Promise<Paged<T>> {
  const envelope = await send<T[], Partial<PageMeta> & { total?: number }>(
    apiUrl(path, options.query),
    options,
  );
  const items = envelope.data ?? [];
  const meta = envelope.meta;
  return {
    items,
    meta: {
      page: meta?.page ?? 1,
      perPage: meta?.perPage ?? items.length,
      // The API names the count `total`; the SPA's table helpers use `totalCount`.
      totalCount: meta?.totalCount ?? meta?.total ?? items.length,
    },
  };
}

/** Endpoints that answer `{data: {message}}` (logout, deletes). */
export async function apiMessage(path: string, options: ApiRequestOptions = {}): Promise<string> {
  const envelope = await send<OkMessage, never>(apiUrl(path, options.query), options);
  return envelope.data?.message ?? "";
}
