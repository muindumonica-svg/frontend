import type {
  AuditLogFilters,
  BalanceFilters,
  CustomerListFilters,
  DeliveryAssignmentFilters,
  ExpenseListFilters,
  GoodsReceiptFilters,
  MovementFilters,
  PaymentListFilters,
  ProductFilters,
  PublicCatalogFilters,
  PurchaseOrderFilters,
  ReportFilters,
  ReportType,
  SaleListFilters,
  ShiftListFilters,
  StockTakeFilters,
  StockTransferFilters,
  UserListFilters,
} from "@/types/api";

/**
 * Query key factory. Keys are `[domain, ...refinement, filters]`; invalidating a
 * domain after a write uses the `…Root` prefix, because TanStack only matches a
 * filter object against a filter object that is identical at that index.
 */
export const QueryKeys = {
  session: ["session"] as const,

  branchesRoot: ["branches"] as const,
  categoriesRoot: ["categories"] as const,

  productsRoot: ["products"] as const,
  products: (filters: ProductFilters = {}) => ["products", filters] as const,
  product: (productId: string) => ["products", "detail", productId] as const,

  inventoryRoot: ["inventory"] as const,
  balances: (filters: BalanceFilters = {}) => ["inventory", "balances", filters] as const,
  balancesRoot: ["inventory", "balances"] as const,
  movements: (filters: MovementFilters = {}) => ["inventory", "movements", filters] as const,
  movementsRoot: ["inventory", "movements"] as const,
  overdrafts: (limit = 200) => ["inventory", "overdrafts", { limit }] as const,
  transfers: (filters: StockTransferFilters = {}) => ["inventory", "transfers", filters] as const,
  transfersRoot: ["inventory", "transfers"] as const,

  salesRoot: ["sales"] as const,
  sales: (filters: SaleListFilters = {}) => ["sales", "list", filters] as const,
  sale: (saleId: string) => ["sales", "detail", saleId] as const,
  receipt: (saleId: string) => ["sales", "receipt", saleId] as const,
  onlineOrdersRoot: ["online-orders"] as const,
  onlineOrders: (filters: { branchId?: string; page?: number; perPage?: number } = {}) =>
    ["online-orders", "list", filters] as const,

  expensesRoot: ["expenses"] as const,
  expenses: (filters: ExpenseListFilters = {}) => ["expenses", "list", filters] as const,

  paymentsRoot: ["payments"] as const,
  payments: (filters: PaymentListFilters = {}) => ["payments", "list", filters] as const,
  payment: (paymentId: string) => ["payments", "detail", paymentId] as const,
  paymentReconciliation: (filters: { date?: string; branchId?: string } = {}) =>
    ["payments", "reconciliation", filters] as const,
  paybillInboxRoot: ["paybill-inbox"] as const,
  paybillInbox: (filters: { status?: string; page?: number; perPage?: number } = {}) =>
    ["paybill-inbox", "list", filters] as const,

  suppliersRoot: ["suppliers"] as const,
  supplier: (supplierId: string) => ["suppliers", "detail", supplierId] as const,

  purchaseOrdersRoot: ["purchase-orders"] as const,
  purchaseOrders: (filters: PurchaseOrderFilters = {}) => ["purchase-orders", filters] as const,
  purchaseOrder: (poId: string) => ["purchase-orders", "detail", poId] as const,

  goodsReceiptsRoot: ["goods-receipts"] as const,
  goodsReceipts: (filters: GoodsReceiptFilters = {}) => ["goods-receipts", filters] as const,

  stockTakesRoot: ["stock-takes"] as const,
  stockTakes: (filters: StockTakeFilters = {}) => ["stock-takes", filters] as const,
  stockTake: (stockTakeId: string) => ["stock-takes", "detail", stockTakeId] as const,

  shiftsRoot: ["shifts"] as const,
  shifts: (filters: ShiftListFilters = {}) => ["shifts", filters] as const,
  shift: (shiftId: string) => ["shifts", "detail", shiftId] as const,
  currentShift: (userId: string | null) => ["shifts", "current", { userId }] as const,

  customersRoot: ["customers"] as const,
  customers: (filters: CustomerListFilters = {}) => ["customers", filters] as const,
  customer: (customerId: string) => ["customers", "detail", customerId] as const,
  customerFinancialSummary: (customerId: string) =>
    ["customers", "financial-summary", customerId] as const,
  customerFinancialHistory: (customerId: string, page = 1) =>
    ["customers", "financial-history", customerId, page] as const,
  customerLoyaltyRoot: ["customers", "loyalty"] as const,
  customerLoyalty: (customerId: string) => ["customers", "loyalty", customerId] as const,
  loyaltyDashboard: ["loyalty", "dashboard"] as const,
  loyaltyRedemptionRequests: (status = "PENDING") =>
    ["loyalty", "redemption-requests", status] as const,

  usersRoot: ["users"] as const,
  users: (filters: UserListFilters = {}) => ["users", filters] as const,
  userStatusHistory: (userId: string) => ["users", "status-history", userId] as const,

  deliveryZonesRoot: ["delivery-zones"] as const,
  deliveryPersonnelRoot: ["delivery-personnel"] as const,
  deliveryPersonnel: (profileId: string) => ["delivery-personnel", "detail", profileId] as const,
  deliveryAssignmentsRoot: ["delivery-assignments"] as const,
  deliveryAssignments: (filters: DeliveryAssignmentFilters = {}) =>
    ["delivery-assignments", "list", filters] as const,
  deliveryCandidates: ["delivery-assignments", "candidates"] as const,
  riderAssignments: ["rider", "assignments"] as const,
  riderProfile: ["rider", "profile"] as const,

  settings: ["settings"] as const,

  auditLogsRoot: ["audit-logs"] as const,
  auditLogs: (filters: AuditLogFilters = {}) => ["audit-logs", filters] as const,

  accountingRoot: ["accounting"] as const,
  accounting: (page = 1, perPage = 25, salesPage = 1, salesPerPage = 25) =>
    ["accounting", { page, perPage, salesPage, salesPerPage }] as const,

  reportsRoot: ["reports"] as const,
  report: (type: ReportType, filters: ReportFilters = {}) => ["reports", type, filters] as const,

  // Storefront — deliberately separate from staff keys so a customer cache is
  // never mistaken for a staff session.
  customerSession: ["customer-session"] as const,
  customerAddresses: ["customer-addresses"] as const,
  publicCustomerFinancialSummary: (customerId: string | null) =>
    ["customer-session", "financial-summary", customerId] as const,
  publicCustomerFinancialHistory: (customerId: string | null, page = 1) =>
    ["customer-session", "financial-history", customerId, page] as const,
  publicCustomerLoyalty: ["customer-session", "loyalty"] as const,
  publicCatalog: (filters: PublicCatalogFilters = {}) => ["public", "catalog", filters] as const,
  publicCatalogRoot: ["public", "catalog"] as const,
  publicProduct: (productId: string, branchId: string | null = null) =>
    ["public", "product", productId, { branchId }] as const,
  publicOrders: ["public", "orders"] as const,
  publicOrder: (orderId: string) => ["public", "orders", "detail", orderId] as const,
  publicOrderReceipt: (orderId: string) => ["public", "orders", "receipt", orderId] as const,
} as const;
