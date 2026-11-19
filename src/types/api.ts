/**
 * BrathaMatu POS — API DTOs.
 * docs/API_CONTRACT.md is the source of truth; every key here is camelCase
 * exactly as the Laravel ApiResources serialise it.
 */
import type { ProductImageKey } from "@/lib/product-images";

export type Role =
  | "super_admin"
  | "manager"
  | "cashier"
  | "storekeeper"
  | "procurement"
  | "stock_take_agent"
  | "delivery";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  manager: "Owner / Manager",
  cashier: "Cashier",
  storekeeper: "Storekeeper",
  procurement: "Procurement",
  stock_take_agent: "Stock Take Agent",
  delivery: "Delivery Rider",
};

/**
 * Flat permission strings returned by `GET /api/auth/me` (the server expands
 * `"*"` for super admins, so the SPA never has to know roles).
 */
export type Permission =
  | "accounting"
  | "branches"
  | "cashier"
  | "customers"
  | "delivery"
  | "delivery_manage"
  | "expenses"
  | "inventory"
  | "pos"
  | "pos_discount"
  | "pos_void"
  | "operations_audit"
  | "purchasing"
  | "reports"
  | "seo"
  | "settings"
  | "stock_take"
  | "stock_take_approve"
  | "users";

/** Lifecycle label; the API keeps `active` in sync as the binary login gate. */
export type StaffStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export const STAFF_STATUS_LABELS: Record<StaffStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
};

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
  status: StaffStatus;
  branchId: string | null;
  createdAt: string;
}

export interface StaffStatusHistoryEntry {
  id: string;
  userId: string;
  from: StaffStatus | null;
  to: StaffStatus;
  reason: string | null;
  changedById: string | null;
  changedByName?: string | null;
  at: string;
}

export interface StaffStatusInput {
  status: StaffStatus;
  /** Required by the API when moving to INACTIVE or SUSPENDED. */
  reason?: string | null;
}

export interface Branch {
  id: string;
  name: string;
  location: string;
}

/** Login, logout-adjacent and `GET /api/auth/me` payload. */
export interface AuthPayload {
  user: UserProfile;
  permissions: Permission[];
  branches: Branch[];
  activeBranchId: string | null;
}

/** `meta` of every paginated list endpoint. */
export interface PageMeta {
  page: number;
  perPage: number;
  totalCount: number;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

// ---------------------------------------------------------------- catalog

export interface Category {
  id: string;
  name: string;
  emoji: string;
}

export type SellingMode = "weight" | "piece" | "amount";
export type HistoricalSellingMode = SellingMode;
export type BaseUnit = "KG" | "PIECE";

export interface Product {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  emoji: string;
  imageKey?: ProductImageKey | null | undefined;
  baseUnit: BaseUnit;
  sellingModes: SellingMode[];
  pricePerKg: number | null;
  pricePerPiece: number | null;
  pieceWeightKg: number | null;
  costPerKg: number | null;
  costPerPiece: number | null;
  reorderLevel: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present only when the list/detail request carried `branchId`. */
  balance?: number | undefined;
  /** Present only on `GET /api/products/{id}`. */
  balances?: InventoryBalance[] | undefined;
}

export interface InventoryBalance {
  productId: string;
  productName?: string | undefined;
  branchId: string;
  qty: number;
}

export type InventoryOverdraftStatus = "OUTSTANDING" | "PARTIALLY_SETTLED" | "FULLY_SETTLED";

export interface InventoryOverdraftAllocation {
  id: string;
  receiptMovementId: string;
  receiptReference: string | null;
  quantity: number;
  provisionalUnitCost: number | null;
  actualUnitCost: number | null;
  costAdjustment: number;
  at: string;
}

export interface InventoryOverdraft {
  id: string;
  productId: string;
  productName?: string | null | undefined;
  branchId: string;
  branchName?: string | null | undefined;
  currentBalance: number;
  quantity: number;
  outstandingQty: number;
  outstandingValue: number | null;
  earliestSaleAt: string | null;
  saleId: string | null;
  saleReference?: string | null | undefined;
  cashierId?: string | null | undefined;
  cashierName?: string | null | undefined;
  shiftId?: string | null | undefined;
  status: InventoryOverdraftStatus;
  lastReceiptAt: string | null;
  allocations: InventoryOverdraftAllocation[];
}

export type MovementType =
  | "PURCHASE_RECEIVED"
  | "SALE"
  | "SALE_RETURN"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "WASTAGE"
  | "ADJUSTMENT"
  | "STOCK_TAKE"
  | "CONVERSION_INPUT"
  | "CONVERSION_OUTPUT";

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  PURCHASE_RECEIVED: "Purchase Received",
  SALE: "Sale",
  SALE_RETURN: "Sale Return",
  TRANSFER_OUT: "Transfer Out",
  TRANSFER_IN: "Transfer In",
  WASTAGE: "Wastage",
  ADJUSTMENT: "Adjustment",
  STOCK_TAKE: "Stock Take",
  CONVERSION_INPUT: "Conversion Input",
  CONVERSION_OUTPUT: "Conversion Output",
};

export interface Movement {
  id: string;
  productId: string;
  productName?: string | undefined;
  branchId: string;
  type: MovementType;
  qtyBefore: number;
  qtyChange: number;
  qtyAfter: number;
  ref: string;
  userId: string;
  at: string;
}

// ------------------------------------------------------------------ sales

export type SaleStatus =
  "DRAFT" | "PENDING_PAYMENT" | "PARTIALLY_PAID" | "PAID" | "COMPLETED" | "CANCELLED" | "REFUNDED";

export type SaleChannel = "POS" | "ONLINE";

export type Fulfillment = "COLLECTION" | "DELIVERY";

export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  COLLECTION: "Collection",
  DELIVERY: "Delivery",
};

export interface DeliveryAddressSnapshot {
  recipientName: string | null;
  phone: string | null;
  addressLine: string | null;
  town: string | null;
  notes: string | null;
}

export type DeliveryStatus =
  "ASSIGNED" | "ACCEPTED" | "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  PICKED_UP: "Picked up",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export interface SaleItem {
  id: string;
  productId: string;
  productName: string;
  emoji: string;
  mode: HistoricalSellingMode;
  qtyKg: number | null;
  pieces: number | null;
  unitPrice: number;
  unitPriceLabel: string;
  qtyLabel: string;
  total: number;
  /** Cost snapshot used by the profit reports; server-computed at write time. */
  costTotal: number | null;
  note: string | null;
}

export type PaymentMethod = "CASH" | "STK" | "PAYBILL" | "CARD" | "LOYALTY";
export type RefundPaymentMethod = Exclude<PaymentMethod, "LOYALTY">;
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";
export type LoyaltyRedemptionStatus = "PENDING" | "APPROVED" | "APPLIED" | "REJECTED" | "CANCELLED";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  STK: "M-Pesa STK",
  PAYBILL: "PayBill",
  CARD: "Card",
  LOYALTY: "Loyalty Points",
};

export interface Payment {
  id: string;
  saleId: string;
  shiftId?: string | null | undefined;
  saleReceiptNo?: string | undefined;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  loyaltyRedemptionRequestId?: string | null | undefined;
  loyaltyRedemptionStatus?: LoyaltyRedemptionStatus | null | undefined;
  ref: string;
  phone: string | null;
  checkoutId: string | null;
  mpesaRef: string | null;
  providerRef: string | null;
  paybillAccount: string | null;
  paybillNumber: string | null;
  providerResultCode: number | null;
  providerResultDesc: string | null;
  attempts: number;
  initiatedBy: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface PaybillInboxItem {
  id: string;
  paybillNumber: string;
  account: string;
  amount: number;
  status: "MATCHED" | "UNMATCHED" | "DUPLICATE" | "UNDER_REVIEW" | "RESOLVED";
  mpesaRef: string | null;
  providerRef: string | null;
  phone: string | null;
  matchedPaymentId: string | null;
  matchedPaymentRef: string | null;
  matchedBy: string | null;
  matchReason: string | null;
  at: string;
}

export interface PaymentReconciliation {
  date: string;
  branchId: string | null;
  rows: {
    method: PaymentMethod;
    successfulTotal: number;
    pendingTotal: number;
    failedTotal: number;
    transactions: number;
  }[];
  expectedTotal: number;
  pendingTotal: number;
  unmatchedInboxCount: number;
}

export interface Sale {
  id: string;
  /** `null` until the first item of a draft; drafts keep a `BRM-DRAFT-…` ref. */
  receiptNo: string | null;
  branchId: string;
  customerId: string | null;
  userId: string | null;
  userName?: string | undefined;
  items: SaleItem[];
  payments: Payment[];
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  balance: number;
  change: number;
  status: SaleStatus;
  channel: SaleChannel;
  onlineStatus?: OnlineOrderStatus | null | undefined;
  processingAssigneeId?: string | null | undefined;
  processingAssigneeName?: string | null | undefined;
  customerName?: string | null | undefined;
  customerPhone?: string | null | undefined;
  onlineOrderEvents?: OnlineOrderEvent[] | undefined;
  fulfillment: Fulfillment;
  deliveryFee: number;
  deliveryZoneId: string | null;
  deliveryZoneName?: string | null | undefined;
  deliveryAddress: DeliveryAddressSnapshot | null;
  deliveryStatus: DeliveryStatus | null;
  inventoryCommitted: boolean;
  createdAt: string;
  completedAt: string | null;
  note: string | null;
}

export type OnlineOrderStatus =
  "AWAITING_PROCESSING" | "ACCEPTED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";

export interface OnlineOrderEvent {
  id: string;
  action: string;
  fromStatus: OnlineOrderStatus | null;
  toStatus: OnlineOrderStatus | null;
  actorId: string | null;
  actorName: string | null;
  previousAssigneeId: string | null;
  previousAssigneeName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  note: string | null;
  at: string;
}

/** `GET /api/sales/{id}/receipt` — print-ready payload. */
export interface ReceiptLine {
  name: string;
  qtyLabel: string;
  unitPriceLabel: string;
  total: number;
}

export interface Receipt {
  businessName: string;
  receiptNo: string;
  cashier: string | null;
  branchId: string;
  items: ReceiptLine[];
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  change: number;
  /** Confirmed amount per payment method. */
  payments: Partial<Record<PaymentMethod, number>>;
  loyaltyPointsRedeemed: number;
  loyaltyValueRedeemed: number;
  loyaltyPointsEarned: number;
  loyaltyPointsBalance: number | null;
  currency: string;
  completedAt: string | null;
  footer: string;
}

export interface SaleReturnLine {
  productId: string;
  productName?: string | undefined;
  qtyKg: number | null;
  pieces: number | null;
  refund: number;
}

export interface SaleReturn {
  id: string;
  ref: string;
  saleId: string;
  receiptNo: string;
  items: SaleReturnLine[];
  total: number;
  userId: string;
  at: string;
}

// --------------------------------------------------------------- directory

export interface Customer {
  id: string;
  customerNo: string;
  name: string;
  phone: string | null;
  alternativePhone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  accountStatus: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface CustomerSummary {
  salesCount: number;
  totalSpent: number;
  totalPurchases: number;
  totalRefundsRecorded: number;
  netPurchases: number;
  totalAmountPaid: number;
  netRecordedReceipts: number;
  outstandingBalance: number;
  customerCredit: number;
  pendingPaymentAmount: number;
  pendingOrderCount: number;
  electronicRefundsAwaitingVerification: number;
  lastPurchaseAt: string | null;
}

export interface CustomerFinancialEvent {
  id: string;
  type: "SALE" | "ORDER" | "PAYMENT" | "REFUND";
  occurredAt: string;
  reference: string | null;
  saleId: string;
  saleReceiptNo: string | null;
  channel: SaleChannel;
  method: PaymentMethod | null;
  amount: number;
  status: string;
  cashierName: string | null;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    mode: SellingMode;
    qtyKg: number | null;
    pieces: number | null;
    qtyLabel: string;
    unitPrice: number;
    total: number;
  }>;
}

export interface LoyaltyTransaction {
  id: string;
  type: string;
  points: number;
  balanceAfter?: number | undefined;
  amount: number | null;
  saleReceiptNo: string | null;
  reason: string | null;
  userName: string | null;
  createdAt: string;
  customerId?: string | undefined;
  customerName?: string | undefined;
}

export interface CustomerLoyalty {
  customerId: string;
  name: string;
  phone: string | null;
  balance: number;
  availablePoints: number;
  reservedPoints: number;
  redeemableValue: number;
  pendingRedemptions: Array<{
    id: string;
    saleId: string;
    saleReceiptNo: string | null;
    paymentRef: string | null;
    points: number;
    amount: number;
    status: LoyaltyRedemptionStatus;
    requestedAt: string | null;
  }>;
  enabled: boolean;
  redemptionEnabled: boolean;
  payWithPointsEnabled: boolean;
  onlinePayWithPointsEnabled: boolean;
  pointValue: number;
  minimumRedemptionPoints: number;
  totalEarned: number;
  totalRedeemed: number;
  transactions: LoyaltyTransaction[];
}

export interface LoyaltyRedemptionRequest {
  id: string;
  customerId: string;
  customerName: string | null;
  customerNo: string | null;
  customerPhone: string | null;
  saleId: string;
  saleReceiptNo: string | null;
  saleTotal: number | null;
  paymentId: string;
  paymentRef: string | null;
  paymentStatus: PaymentStatus | null;
  branchId: string;
  branchName: string | null;
  shiftId: string | null;
  points: number;
  amount: number;
  status: LoyaltyRedemptionStatus;
  requestedByUserId: string | null;
  requestedByName: string | null;
  requestedAt: string | null;
  authorizedByUserId: string | null;
  authorizedByName: string | null;
  authorizedAt: string | null;
  rejectionReason: string | null;
  appliedAt: string | null;
}

export interface LoyaltyDashboard {
  enrolledCustomers: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  outstandingLiability: number;
  topCustomers: {
    customerId: string;
    name: string;
    phone: string | null;
    balance: number;
  }[];
  recentTransactions: LoyaltyTransaction[];
}

export interface LoyaltyAdjustmentInput {
  points: number;
  reason: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName?: string | undefined;
  action: string;
  detail: string;
  at: string;
}

export interface Settings {
  businessName: string;
  paybillNumber: string;
  receiptFooter: string;
  currency: string;
  cashPaymentRounding: number;
  stockTakeRequiresApproval: boolean;
  stockTakeApprovalThreshold: number;
  stockTakeMaxRecounts: number;
  lowStockAlertsEnabled: boolean;
  discountNeedsApprovalPercent: number;
  cashVarianceTolerance: number;
  onlineOrderingEnabled: boolean;
  onlineReservationMinutes: number;
  inventoryOverdraft: InventoryOverdraftPolicy;
  loyalty: LoyaltySettings;
}

export interface LoyaltySettings {
  enabled: boolean;
  earningPercentage: number;
  pointValue: number;
  redemptionEnabled: boolean;
  payWithPointsEnabled: boolean;
  minimumRedemptionPoints: number;
  maximumTransactionPercent: number;
  minimumOrderValue: number | null;
  maximumRedemptionValue: number | null;
  maximumRedemptionsPerCustomerPerDay: number | null;
  redemptionEligibleCategoryIds: string[];
  onlinePayWithPointsEnabled: boolean;
  expiryEnabled: boolean;
  expiryMonths: number;
  /** An empty list means all product categories are eligible. */
  eligibleCategoryIds: string[];
}

export interface InventoryOverdraftPolicy {
  enabled: boolean;
  allowedRoles: Role[];
  /** Null means explicitly unlimited. */
  maxNegativeQuantity: number | null;
  /** Null means explicitly unlimited. */
  maxOverdraftValue: number | null;
  requireAuthorizationAboveValue: number | null;
  requireNarration: boolean;
  alertsEnabled: boolean;
}

// -------------------------------------------------------------- purchasing

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  location: string;
  productsSupplied: string[];
}

export type POStatus = "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

export interface PurchaseOrderLine {
  productId: string;
  productName?: string | undefined;
  qty: number;
  unit: BaseUnit;
  unitCost: number;
  receivedQty: number;
}

export interface PurchaseOrder {
  id: string;
  ref: string;
  supplierId: string;
  supplierName?: string | undefined;
  status: POStatus;
  items: PurchaseOrderLine[];
  totalCost: number;
  notes: string | null;
  createdAt: string;
}

export interface GoodsReceiptLine {
  productId: string;
  expectedQty: number | null;
  receivedQty: number | null;
  reason: string | null;
}

export interface GoodsReceipt {
  id: string;
  ref: string;
  poId: string | null;
  branchId: string;
  items: GoodsReceiptLine[];
  userId: string;
  at: string;
}

// --------------------------------------------------------------- inventory

export type WastageReason = "Spoilage" | "Damage" | "Expired" | "Other";

export interface WastageRecord {
  id: string;
  productId: string;
  productName?: string | undefined;
  branchId: string;
  qty: number;
  reason: WastageReason;
  notes: string | null;
  userId: string;
  at: string;
}

export interface StockTransferLine {
  productId: string;
  qty: number;
}

export type StockTransferStatus = "IN_TRANSIT" | "COMPLETED";

export interface StockTransfer {
  id: string;
  ref: string;
  fromBranchId: string;
  toBranchId: string;
  items: StockTransferLine[];
  status: StockTransferStatus;
  note: string | null;
  userId: string;
  at: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
}

export interface StockAdjustment {
  id: string;
  ref: string;
  productId: string;
  productName?: string | undefined;
  branchId: string;
  qty: number;
  reason: string;
  userId: string;
  at: string;
}

export interface ConversionLine {
  productId: string;
  qty: number;
}

export interface Conversion {
  id: string;
  ref: string;
  branchId: string;
  input: ConversionLine;
  outputs: ConversionLine[];
  wasteQty: number;
  status: "COMPLETED";
  userId: string;
  at: string;
}

// ------------------------------------------------------------ stock takes

export type StockTakeStatus =
  | "DRAFT"
  | "IN_PROGRESS"
  | "RECOUNT_REQUIRED"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "POSTED"
  | "REJECTED"
  | "CANCELLED";

export interface StockTakeItem {
  productId: string;
  productName?: string | undefined;
  sku?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  baseUnit?: BaseUnit | undefined;
  systemQty: number | null;
  comparisonQty: number | null;
  countedQty: number | null;
  firstCountQty: number | null;
  finalQty: number | null;
  variance: number | null;
  approvedUnitCost?: number | null;
  varianceValue?: number | null;
  signedVarianceValue?: number | null;
  postedQtyChange?: number | null;
  postedVarianceValue?: number | null;
  postedSignedVarianceValue?: number | null;
  action: "PENDING" | "OK" | "REDO";
  recounts: Array<{ qty: number; reason: string; reportedBy: string; countedAt: string }>;
  reasonCategory: string | null;
  narration: string | null;
  causeClassification: "VERIFIED" | "SUSPECTED" | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  redoReason: string | null;
}

export interface StockTake {
  id: string;
  ref: string;
  branchId: string;
  agentId: string;
  assignedTo: string | null;
  categoryId: string | null;
  mode: "FULL" | "CATEGORY" | "SELECTED" | "SCHEDULED" | "SURPRISE";
  blindCount: boolean;
  location: string | null;
  status: StockTakeStatus;
  startedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  postedAt: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalRef: string | null;
  journalRef: string | null;
  varianceTotal: number;
  summary: {
    totalProducts: number;
    countedProducts: number;
    matchedProducts: number;
    positiveVariances: number;
    negativeVariances: number;
    awaitingRecount: number;
    awaitingApproval: number;
    positiveValue: number;
    negativeValue: number;
    netInventoryValue: number;
    negativeAdjustmentExpense: number;
  };
  note: string | null;
  reviewNotes: string | null;
  items: StockTakeItem[];
  countHistory: Array<{
    productId: string;
    countNumber: number;
    type: "INITIAL" | "RECOUNT";
    qty: number;
    systemQty: number | null;
    variance: number | null;
    reasonCategory: string | null;
    narration: string | null;
    causeClassification: "VERIFIED" | "SUSPECTED";
    purchaseRef: string | null;
    saleRef: string | null;
    reportedBy: string | null;
    countedAt: string;
  }>;
}

export interface JournalEntry {
  id: string;
  ref: string;
  sourceType: string;
  sourceRef: string;
  branchId: string | null;
  description: string;
  status: string;
  reversalOf: string | null;
  occurredAt: string;
  postedAt: string;
  postedBy: string | null;
  debitTotal: number;
  creditTotal: number;
  reversal?: {
    id: string;
    ref: string;
    description: string;
    postedAt: string;
    debitTotal: number;
    creditTotal: number;
    lines: JournalEntry["lines"];
  } | null;
  lines: Array<{
    accountCode: string | null;
    accountName: string | null;
    accountType: string | null;
    description: string;
    debit: number;
    credit: number;
  }>;
}

export interface AccountingAccountBalance {
  code: string;
  name: string;
  type: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
  balanceSide: "DEBIT" | "CREDIT";
}

export interface AccountingRegister {
  salesByStatus: Array<{
    status: SaleStatus;
    count: number;
    total: number;
  }>;
  sales: Sale[];
  salesMeta: {
    page: number;
    perPage: number;
    totalCount: number;
    lastPage: number;
  };
  accounts: AccountingAccountBalance[];
  entries: JournalEntry[];
  meta: {
    page: number;
    perPage: number;
    totalCount: number;
    lastPage: number;
  };
}

export interface StockTakeVarianceRow {
  productName: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  value: number;
  reasonCategory?: string | null;
  narration?: string | null;
  causeClassification?: "VERIFIED" | "SUSPECTED";
}

export interface StockTakeVarianceSummary {
  varianceCount: number;
  variances: StockTakeVarianceRow[];
}

// ------------------------------------------------------------------ shifts

export type ShiftStatus = "OPEN" | "CLOSED" | "UNDER_REVIEW";
export type CashMovementType = "IN" | "OUT";

export interface CashMovement {
  id: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  userId: string;
  at: string;
}

export interface CashierShift {
  id: string;
  ref: string;
  userId: string;
  userName?: string | undefined;
  openedById?: string | null | undefined;
  openedByName?: string | null | undefined;
  closedById?: string | null | undefined;
  closedByName?: string | null | undefined;
  branchId: string;
  shiftName?: string | null | undefined;
  openingFloat: number;
  openedAt: string;
  status: ShiftStatus;
  closedAt: string | null;
  expectedCash: number | null;
  actualCash: number | null;
  variance: number | null;
  reason: string | null;
  cashMovements: CashMovement[];
}

// ----------------------------------------------------------------- reports

export interface DayPoint {
  label: string;
  sales: number;
  profit: number;
}

export interface ProductPerfRow {
  productId: string;
  productName: string;
  emoji: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
  saleCount: number;
}

export type InventoryStockStatus = "ok" | "low" | "out";

export interface InventoryReportRow {
  productId: string;
  productName: string;
  baseUnit: BaseUnit;
  onHand: number;
  reserved: number;
  reorderLevel: number;
  status: InventoryStockStatus;
  value: number;
}

export interface MethodBreakdownRow {
  method: PaymentMethod;
  amount: number;
  count: number;
}

export interface DashboardReport {
  revenueToday: number;
  salesToday: number;
  avgBasket: number;
  itemsSoldToday: number;
  grossProfitToday: number;
  revenueYesterday: number;
  revenue7d: number;
  cashVsMpesa: { cash: number; mpesa: number };
  openShifts: number;
  lowStockCount: number;
  salesTrend: DayPoint[];
  topProducts: ProductPerfRow[];
  recentSales: Sale[];
}

export interface SalesReportTotals {
  revenue: number;
  profit: number;
  transactions: number;
  items: number;
  discounts: number;
  avgSale: number;
}

export interface SalesReport {
  days: DayPoint[];
  totals: SalesReportTotals;
  byMethod: MethodBreakdownRow[];
  byHour: { hour: number; amount: number }[];
}

export interface ProductsReport {
  rows: ProductPerfRow[];
}

export interface InventoryReport {
  rows: InventoryReportRow[];
}

export interface PaymentMethodRow {
  method: PaymentMethod;
  count: number;
  amount: number;
  pending: number;
  failed: number;
}

export interface PaymentsReport {
  rows: PaymentMethodRow[];
}

export interface WastageReportRow {
  productId: string;
  productName: string;
  qty: number;
  costValue: number;
  reason: WastageReason;
}

export interface WastageReport {
  rows: WastageReportRow[];
  total: number;
}

export interface VarianceReportRow {
  stockTakeRef: string;
  productName: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  value: number;
}

export interface VarianceReport {
  rows: VarianceReportRow[];
  total: number;
}

export interface ProfitReportRow {
  day: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
}

export interface ProfitReport {
  rows: ProfitReportRow[];
}

export type ReportType =
  "dashboard" | "sales" | "products" | "inventory" | "payments" | "wastage" | "variance" | "profit";

// ------------------------------------------------------------------ inputs

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface ProductFilters extends QueryParams {
  branchId?: string | undefined;
  categoryId?: string | undefined;
  q?: string | undefined;
  activeOnly?: boolean | undefined;
}

export interface BalanceFilters extends QueryParams {
  branchId?: string | undefined;
  categoryId?: string | undefined;
  lowStockOnly?: boolean | undefined;
}

export interface MovementFilters extends QueryParams {
  branchId?: string | undefined;
  productId?: string | undefined;
  type?: MovementType | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit?: number | undefined;
}

export interface StockTransferFilters extends QueryParams {
  branchId?: string | undefined;
  status?: StockTransferStatus | undefined;
  limit?: number | undefined;
}

export interface SaleListFilters extends QueryParams {
  status?: SaleStatus | undefined;
  channel?: SaleChannel | undefined;
  branchId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  q?: string | undefined;
  userId?: string | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
}

export type ExpenseCategory =
  | "RENT"
  | "UTILITIES"
  | "SALARIES"
  | "TRANSPORT"
  | "PACKAGING"
  | "MARKETING"
  | "REPAIRS"
  | "CLEANING"
  | "LICENSES"
  | "BANK_FEES"
  | "COMMUNICATIONS"
  | "OTHER";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: "Rent",
  UTILITIES: "Utilities",
  SALARIES: "Salaries and wages",
  TRANSPORT: "Transport and delivery",
  PACKAGING: "Packaging and supplies",
  MARKETING: "Marketing",
  REPAIRS: "Repairs and maintenance",
  CLEANING: "Cleaning and sanitation",
  LICENSES: "Licenses and permits",
  BANK_FEES: "Bank and payment fees",
  COMMUNICATIONS: "Phone and internet",
  OTHER: "Other",
};

export interface ExpenseListFilters extends QueryParams {
  branchId?: string | undefined;
  category?: ExpenseCategory | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
}

export interface Expense {
  id: string;
  branchId: string;
  branchName: string | null;
  userId: string | null;
  userName: string | null;
  shiftId: string | null;
  category: ExpenseCategory;
  description: string;
  amount: number;
  receiptReference: string | null;
  spentAt: string;
}

export interface ExpenseSummary {
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  cashSaleProceeds: number;
  cashRefunds: number;
  cashExpenses: number;
  availableCash: number;
}

export interface ExpenseList {
  items: Expense[];
  meta: PageMeta;
  categories: Record<ExpenseCategory, string>;
  summary: ExpenseSummary;
}

export interface RecordExpenseInput {
  branchId: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  receiptReference?: string | undefined;
}

export interface PaymentListFilters extends QueryParams {
  method?: PaymentMethod | undefined;
  status?: PaymentStatus | undefined;
  from?: string | undefined;
  to?: string | undefined;
  saleId?: string | undefined;
  userId?: string | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
}

export interface StockTakeFilters extends QueryParams {
  branchId?: string | undefined;
  status?: StockTakeStatus | undefined;
  categoryId?: string | undefined;
  productId?: string | undefined;
  staffId?: string | undefined;
  varianceType?: "POSITIVE" | "NEGATIVE" | "ZERO" | undefined;
}

export interface ShiftListFilters extends QueryParams {
  status?: ShiftStatus | undefined;
  userId?: string | undefined;
  branchId?: string | undefined;
}

export interface GoodsReceiptFilters extends QueryParams {
  poId?: string | undefined;
  branchId?: string | undefined;
}

export interface AuditLogFilters extends QueryParams {
  userId?: string | undefined;
  action?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
}

export interface CustomerListFilters extends QueryParams {
  q?: string | undefined;
}

export interface UserListFilters extends QueryParams {
  role?: Role | undefined;
  status?: StaffStatus | undefined;
  active?: boolean | undefined;
}

export interface PurchaseOrderFilters extends QueryParams {
  status?: POStatus | undefined;
  supplierId?: string | undefined;
}

export interface ReportFilters extends QueryParams {
  branchId?: string | undefined;
  /** `YYYY-MM-DD`; defaults to today server-side. */
  from?: string | undefined;
  /** `YYYY-MM-DD`. */
  to?: string | undefined;
  days?: number | undefined;
}

export interface SaleItemFields {
  mode: HistoricalSellingMode;
  qtyKg?: number | undefined;
  pieces?: number | undefined;
  /** Per KG for weight/amount, per piece for piece mode; omit to use the product price. */
  unitPrice?: number | undefined;
  /** `mode=amount` only — the customer-tendered amount the server converts to kg. */
  amount?: number | undefined;
  note?: string | null | undefined;
}

export interface AddSaleItemInput extends Omit<SaleItemFields, "mode"> {
  productId: string;
  mode: SellingMode;
}

export type UpdateSaleItemInput = Partial<AddSaleItemInput>;

export interface CreateSaleDraftInput {
  branchId: string;
  customerId?: string | null | undefined;
  discount?: number | undefined;
  note?: string | null | undefined;
  items?: AddSaleItemInput[] | undefined;
}

export interface UpdateSaleDraftInput {
  customerId?: string | null | undefined;
  discount?: number | undefined;
  note?: string | null | undefined;
}

export interface CashPaymentInput {
  amount: number;
  tendered?: number | undefined;
}

export interface CardPaymentInput {
  amount: number;
  last4: string;
  authCode?: string | undefined;
  approvalCode?: string | undefined;
}

export interface StkPaymentInput {
  phone: string;
  amount: number;
}

export interface SaleReturnInput {
  items: { productId: string; qtyKg?: number; pieces?: number; reason: string }[];
  refundMethod: RefundPaymentMethod;
}

export interface ReceiveStockInput {
  productId: string;
  branchId: string;
  qty: number;
  unitCost?: number | undefined;
  supplierId?: string | undefined;
  ref?: string | undefined;
}

export interface WastageInput {
  productId: string;
  branchId: string;
  qty: number;
  reason: WastageReason;
  notes?: string | undefined;
}

export interface StockTransferInput {
  fromBranchId: string;
  toBranchId: string;
  items: StockTransferLine[];
  note?: string | undefined;
}

export interface StockAdjustmentInput {
  productId: string;
  branchId: string;
  qtyChange: number;
  reason: string;
}

export interface ConversionInput {
  branchId: string;
  input: ConversionLine;
  outputs: ConversionLine[];
  wasteQty?: number | undefined;
  note?: string | undefined;
}

export interface StockTakeCountInput {
  productId: string;
  countedQty: number;
  reason?: string | undefined;
}

export interface StockTakeVarianceInput {
  reasonCategory?: string | undefined;
  narration?: string | undefined;
  causeClassification?: "VERIFIED" | "SUSPECTED" | undefined;
  purchaseRef?: string | undefined;
  saleRef?: string | undefined;
}

export interface StockTakeRecountInput extends StockTakeVarianceInput {
  countedQty: number;
  recountReason: string;
}

export interface SupplierInput {
  name: string;
  phone: string;
  email: string;
  location: string;
  productsSupplied: string[];
}

export interface PurchaseOrderLineInput {
  productId: string;
  qty: number;
  unit: BaseUnit;
  unitCost: number;
}

export interface PurchaseOrderInput {
  supplierId: string;
  items: PurchaseOrderLineInput[];
  notes?: string | undefined;
}

export interface ReceiveGoodsInput {
  branchId: string;
  items: { productId: string; receivedQty: number; reason?: string }[];
}

export interface CustomerInput {
  name: string;
  phone?: string | null | undefined;
  alternativePhone?: string | null | undefined;
  email?: string | null | undefined;
  address?: string | null | undefined;
  active?: boolean | undefined;
}

/** `password` is required on create and optional on update (min 8 chars). */
export interface UserInput {
  name: string;
  email: string;
  phone?: string | null | undefined;
  role: Role;
  branchId?: string | null | undefined;
  active?: boolean | undefined;
  status?: StaffStatus | undefined;
  password: string;
}

export type UserUpdateInput = Partial<Omit<UserInput, "password">> & { password?: string | null };

export type SettingsPatch = Omit<Partial<Settings>, "inventoryOverdraft" | "loyalty"> & {
  inventoryOverdraft?: Partial<InventoryOverdraftPolicy>;
  loyalty?: Partial<LoyaltySettings>;
};

export interface BranchInput {
  name: string;
  location: string;
}

export interface CategoryInput {
  name: string;
  emoji?: string | undefined;
}

export interface ProductInput {
  name: string;
  sku: string;
  categoryId: string;
  emoji?: string | undefined;
  imageKey?: ProductImageKey | null | undefined;
  baseUnit: "KG";
  sellingModes: SellingMode[];
  pricePerKg?: number | null | undefined;
  pricePerPiece?: number | null | undefined;
  pieceWeightKg?: number | null | undefined;
  costPerKg?: number | null | undefined;
  reorderLevel: number;
  active: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  password: string;
}

export interface OpenShiftInput {
  branchId: string;
  openingFloat: number;
  assignedUserId?: string | undefined;
  shiftName?: string | undefined;
}

export interface ShiftMovementInput {
  type: CashMovementType;
  amount: number;
  reason: string;
}

export interface CloseShiftInput {
  actualCash: number;
  reason?: string | undefined;
}

export interface ReviewShiftInput {
  approved: boolean;
  note?: string | undefined;
}

// --------------------------------------------------------------- storefront

/** A storefront account — separate from staff `UserProfile`. */
export interface CustomerAccount {
  id: string;
  customerNo: string;
  name: string;
  email: string | null;
  phone: string | null;
  alternativePhone: string | null;
  address: string | null;
  emailVerified: boolean;
  active: boolean;
  createdAt: string;
}

export interface CustomerAddress {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  addressLine: string;
  town: string;
  notes: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface CustomerAddressInput {
  label?: string | null | undefined;
  recipientName: string;
  phone: string;
  addressLine: string;
  town: string;
  notes?: string | null | undefined;
  isDefault?: boolean | undefined;
}

export interface PublicBranch {
  id: string;
  name: string;
  location: string;
}

export interface ProductAvailability {
  branchId: string;
  branchName: string;
  inStock: boolean;
}

/** Storefront product: public prices only — no cost columns, no quantities. */
export interface PublicProduct {
  id: string;
  slug?: string | null;
  name: string;
  sku: string;
  categoryId: string;
  categoryName?: string | null | undefined;
  emoji: string;
  imageKey?: ProductImageKey | null | undefined;
  baseUnit: BaseUnit;
  sellingModes: SellingMode[];
  pricePerKg: number | null;
  pricePerPiece: number | null;
  pieceWeightKg: number | null;
  inStock: boolean;
  /** Only on `GET /public/products/{id}`. */
  availability?: ProductAvailability[] | undefined;
}

export interface PublicCatalog {
  businessName: string;
  currency: string;
  selectedBranchId: string | null;
  branches: PublicBranch[];
  categories: Category[];
  products: PublicProduct[];
  onlineOrdering: OnlineOrderingInfo;
  deliveryZones: PublicDeliveryZone[];
}

export interface PublicDeliveryZone {
  id: string;
  name: string;
  fee: number;
  minimumOrderTotal: number;
  freeDeliveryThreshold: number | null;
  etaMinutes: number | null;
  instructions: string | null;
}

export interface OnlineOrderingInfo {
  enabled: boolean;
  reservationMinutes: number;
}

// --------------------------------------------------------------------- seo

export interface SeoMeta {
  path: string;
  title: string;
  description: string;
  canonical: string | null;
  robots: string;
  image: string;
  type: string;
  siteName: string;
  jsonLd: Record<string, unknown>[];
}

export interface PublicLocation {
  id: string;
  slug: string;
  name: string;
  fee: number;
  minimumOrderTotal: number;
  freeDeliveryThreshold: number | null;
  etaMinutes: number | null;
  instructions: string | null;
  branch: { id: string; name: string; location: string | null } | null;
  availableProductCount?: number;
}

export interface PublicFaqItem {
  question: string;
  answer: string;
}

export interface SeoPageRecord {
  id: string;
  path: string;
  title: string | null;
  description: string | null;
  robots: string;
  ogImage: string | null;
  canonical: string | null;
  updatedAt: string | null;
}

export interface SeoRedirectRecord {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  active: boolean;
}

export interface SeoSurface {
  path: string;
  label: string;
}

export interface SeoSettingsPayload {
  settings: Record<string, string>;
  surfaces: SeoSurface[];
  pages: SeoPageRecord[];
  redirects: SeoRedirectRecord[];
}

// ---------------------------------------------------------------- marketing

export interface PublicMarketingConfig {
  googleAnalyticsId: string;
  googleAdsId: string;
  googleAdsConversionLabel: string;
  metaPixelId: string;
  serverSideMeta: boolean;
  consentRequired: boolean;
}

export interface MarketingIntegrationStatus {
  provider: string;
  enabled: boolean;
  configured: boolean;
  testEventCode: string | null;
  updatedAt: string | null;
}

export interface MarketingSummary {
  days: number;
  events: Record<string, number>;
  attribution: { source: string; events: number }[];
  onlineOrders: number;
  onlineRevenue: number;
  consentedOrders: number;
  integrations: MarketingIntegrationStatus[];
}

export interface MarketingAdminPayload {
  summary: MarketingSummary;
  publicConfig: PublicMarketingConfig;
}

export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export interface MarketingEventInput {
  name: "page_view" | "view_item" | "add_to_cart" | "begin_checkout" | "search";
  eventId: string;
  consent: boolean;
  path?: string | null;
  referrer?: string | null;
  utm?: UtmParams | undefined;
  value?: number;
  currency?: string;
}

export interface PublicCatalogFilters extends QueryParams {
  branchId?: string | undefined;
  categoryId?: string | undefined;
  q?: string | undefined;
}

export interface RegisterCustomerInput {
  name: string;
  email: string;
  phone?: string | null | undefined;
  password: string;
  password_confirmation: string;
}

export interface CustomerPasswordInput {
  currentPassword: string;
  password: string;
  password_confirmation: string;
}

// ------------------------------------------------------------- online orders

export interface PublicOrderItem {
  id: string;
  productId: string;
  productName: string;
  emoji: string;
  mode: HistoricalSellingMode;
  qtyKg: number | null;
  pieces: number | null;
  unitPrice: number;
  unitPriceLabel: string;
  qtyLabel: string;
  total: number;
  note: string | null;
}

export interface PublicOrderPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
}

export interface PublicOrder {
  id: string;
  orderNo: string | null;
  status: SaleStatus;
  channel: SaleChannel;
  branchId: string;
  branchName?: string | null | undefined;
  items: PublicOrderItem[];
  payments: PublicOrderPayment[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paidAmount: number;
  balance: number;
  note: string | null;
  fulfillment: Fulfillment;
  deliveryZone: {
    id: string;
    name: string;
    etaMinutes: number | null;
    instructions: string | null;
  } | null;
  deliveryAddress: DeliveryAddressSnapshot | null;
  deliveryStatus: DeliveryStatus | null;
  deliveredAt: string | null;
  reservationExpiresAt: string | null;
  canCancel: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface PlaceOrderLine {
  productId: string;
  mode: SellingMode;
  qtyKg?: number | undefined;
  pieces?: number | undefined;
  amount?: number | undefined;
  note?: string | undefined;
}

export interface PlaceOrderInput {
  branchId: string;
  items: PlaceOrderLine[];
  note?: string | undefined;
  deliveryZoneId?: string | undefined;
  addressId?: string | undefined;
  utm?: UtmParams | undefined;
  marketingConsent?: boolean | undefined;
}

export interface OkMessage {
  message: string;
}

// ---------------------------------------------------------- delivery operations

export type DeliveryPersonnelStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

export const DELIVERY_PERSONNEL_STATUS_LABELS: Record<DeliveryPersonnelStatus, string> = {
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
};

export interface DeliveryZone {
  id: string;
  branchId: string;
  branchName?: string | null | undefined;
  name: string;
  fee: number;
  minimumOrderTotal: number;
  freeDeliveryThreshold: number | null;
  etaMinutes: number | null;
  instructions: string | null;
  active: boolean;
  createdAt: string;
}

export interface DeliveryZoneInput {
  branchId: string;
  name: string;
  fee: number;
  minimumOrderTotal?: number | null | undefined;
  freeDeliveryThreshold?: number | null | undefined;
  etaMinutes?: number | null | undefined;
  instructions?: string | null | undefined;
  active?: boolean | undefined;
}

export interface DeliveryPersonnel {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  active: boolean | null;
  phone: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
  status: DeliveryPersonnelStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  zones: DeliveryZone[];
  createdAt: string;
}

export interface DeliveryPersonnelInput {
  name: string;
  email: string;
  phone?: string | null | undefined;
  password: string;
  vehicleType?: string | null | undefined;
  vehiclePlate?: string | null | undefined;
  zoneIds: string[];
}

export interface DeliveryAssignment {
  id: string;
  saleId: string;
  orderNo?: string | null | undefined;
  branchId?: string | null | undefined;
  status: DeliveryStatus;
  fee: number;
  note: string | null;
  zone: { id: string; name: string; etaMinutes: number | null } | null;
  personnel: {
    id: string;
    userId: string;
    name: string | null;
    phone: string | null;
    vehicleType: string | null;
    vehiclePlate: string | null;
  } | null;
  customerName: string | null;
  deliveryAddress: DeliveryAddressSnapshot | null;
  items: { productName: string; qtyLabel: string; note: string | null }[];
  assignedAt: string | null;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  histories: {
    id: string;
    from: DeliveryStatus | null;
    to: DeliveryStatus;
    actorName: string | null;
    note: string | null;
    at: string;
  }[];
}

export interface DeliveryCandidate {
  id: string;
  orderNo: string | null;
  branchId: string;
  total: number;
  deliveryFee: number;
  completedAt: string | null;
  customerName: string | null;
  zoneId: string | null;
  zoneName: string | null;
  addressLine: string | null;
  town: string | null;
  itemCount: number;
}

export interface DeliveryAssignmentFilters extends QueryParams {
  status?: DeliveryStatus | undefined;
  personnelId?: string | undefined;
  branchId?: string | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
}
