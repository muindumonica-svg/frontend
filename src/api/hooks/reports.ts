import { queryOptions, useQuery } from "@tanstack/react-query";
import { REPORT_TIMEOUT_MS, apiDownloadUrl, apiFetch } from "@/lib/api";
import type {
  DashboardReport,
  InventoryReport,
  PaymentsReport,
  ProfitReport,
  ReportFilters,
  ReportType,
  SalesReport,
  ProductsReport,
  VarianceReport,
  WastageReport,
} from "@/types/api";
import { QueryKeys } from "./keys";

/**
 * Report reads scan whole date ranges, so they share one options factory with an
 * extended timeout and key `[reports, type, filters]`.
 */
function reportOptions<T>(type: ReportType, filters: ReportFilters) {
  return queryOptions({
    queryKey: QueryKeys.report(type, filters),
    queryFn: ({ signal }) =>
      apiFetch<T>(`/reports/${type}`, { query: filters, signal, timeoutMs: REPORT_TIMEOUT_MS }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
  });
}

export function useDashboardReport(filters: ReportFilters = {}) {
  return useQuery(reportOptions<DashboardReport>("dashboard", filters));
}

export function useSalesReport(filters: ReportFilters = {}) {
  return useQuery(reportOptions<SalesReport>("sales", filters));
}

export function useProductsReport(filters: ReportFilters = {}) {
  return useQuery(reportOptions<ProductsReport>("products", filters));
}

export function useInventoryReport(filters: ReportFilters = {}) {
  return useQuery(reportOptions<InventoryReport>("inventory", filters));
}

export function usePaymentsReport(filters: ReportFilters = {}) {
  return useQuery(reportOptions<PaymentsReport>("payments", filters));
}

export function useWastageReport(filters: ReportFilters = {}) {
  return useQuery(reportOptions<WastageReport>("wastage", filters));
}

export function useVarianceReport(filters: ReportFilters = {}) {
  return useQuery(reportOptions<VarianceReport>("variance", filters));
}

export function useProfitReport(filters: ReportFilters = {}) {
  return useQuery(reportOptions<ProfitReport>("profit", filters));
}

/**
 * CSV download for `<a href>` / `window.open`. Same-origin navigation carries the
 * session cookie, so the export needs no fetch wrapper; `dashboard` has no tabular
 * export and falls back to the sales series server-side.
 */
export function useReportExportUrl(type: ReportType, filters: ReportFilters = {}): string {
  return apiDownloadUrl(`/reports/${type}/export`, { ...filters, format: "csv" });
}
