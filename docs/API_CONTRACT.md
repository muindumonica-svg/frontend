# BrathaMatu POS — API Contract (production)

This document records the compatibility contract between the separately
maintained Laravel API and this React SPA. The backend implementation is not
included in this frontend repository. If the running API and this document
disagree, do not silently change the frontend contract: confirm the intended
backend behavior with the API owner, then update both the implementation and
this document together.

## Ground rules

- Base URL: `/api` (same origin in dev via Vite proxy, in prod via nginx).
- All JSON keys are **camelCase**. DB/migration columns are snake_case; every Eloquent
  response goes through an `ApiResource` that maps explicitly. No raw models in responses.
- Money: JSON numbers, 2 decimals, KES. Qty: numbers, 3 decimals, in the product base unit.
- IDs: ULID strings, server-generated. Timestamps: ISO-8601 with timezone (`Z` or `+03:00`).
- Every endpoint returns `{data}` for a single resource or `{data, meta}` for a list.
  `meta` = `{totalCount, page, perPage}` when paginated.
- Errors: `422` validation → `{message, errors: {field: ["msg"]}}`; stock/permission/
  state failures → `{message, code}` with the codes listed in Error codes.
- Timestamp columns named `at` in the DB serialize as `createdAt`-style keys already used
  by the SPA (`createdAt`, `at`, `completedAt`, `confirmedAt`, `openedAt`, `submittedAt`).

## Auth

Cookie/session based (Sanctum **stateful**, httpOnly `sid` + `XSRF-TOKEN`). No bearer
tokens, no tokens in `localStorage`. The SPA and API are always served from one origin:
Vite proxies `/api` → `http://127.0.0.1:8000` in dev, nginx proxies `/api` in prod.
`SANCTUM_STATEFUL_DOMAINS` and `SESSION_DOMAIN` must match the deployment origin.
CSRF: `GET /sanctum/csrf-cookie` is called once before the first login; axios/fetch sends
`X-XSRF-TOKEN` automatically for same-origin requests.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | `{email, password}` | `{data: {user, permissions, branches, activeBranchId}}` |
| POST | `/api/auth/logout` | — | `{data: {message}}` |
| GET | `/api/auth/me` | — | `{data: {user, permissions, branches, activeBranchId}}` |
| PUT | `/api/auth/branch` | `{branchId}` | `{data: {activeBranchId}}` — till device branch scope |
| PUT | `/api/auth/password` | `{currentPassword, password}` | `{data: {user}}` |

`user` = `{id, name, email, phone, role, status, active, branchId, createdAt}` (never `password`).
`status` is `ACTIVE|INACTIVE|SUSPENDED` and is kept in sync with the legacy `active` boolean.
`permissions` = the flat string array from `RequirePermission::permissionsFor()` with
`"*"` expanded, so the SPA can `permissions.includes("pos")` without knowing roles.
Login failures: `401 {message:"Invalid credentials"}`, disabled account `403`,
throttled `429`. Login is rate limited (5/min/email + IP).

## Domain shapes (camelCase — replace `src/demo/types.ts`)

Identical field names to the current demo types, minus `demo: true` on `Payment`, and:

- `Product`: add `updatedAt`. New sellable products use `baseUnit: "KG"` and
  `sellingModes: ("weight"|"amount")[]`. Legacy piece-only inventory may still be returned
  as `baseUnit: "PIECE"` but is not sellable; its historical sale rows remain readable.
- `Sale`: `receiptNo` (drafts: `null` until first item; suspended keep `BRM-DRAFT-…`),
  `items: SaleItem[]`, `payments: Payment[]`, `subtotal`, `discount`, `total`,
  `paidAmount`, `balance`, `change`, `status`, `inventoryCommitted`, `branchId`,
  `customerId|null`, `userId`, `userName`, `createdAt`, `completedAt|null`, `note|null`.
- `SaleItem`: `id, productId, productName, emoji, mode, qtyKg|null, pieces|null,
  unitPrice, unitPriceLabel, qtyLabel, total, costTotal, note|null`.
  `costTotal` is the cost snapshot used by profit reports (server-computed at write time).
- `Payment`: `id, saleId, saleReceiptNo, method, amount, status, ref, phone|null,
  checkoutId|null, mpesaRef|null, paybillAccount|null, providerResultCode|null,
  providerResultDesc|null, attempts, initiatedBy|null, createdAt, confirmedAt|null`.
  `status: "PENDING"|"SUCCESS"|"FAILED"|"EXPIRED"`.
- `Movement`, `InventoryBalance`, `Customer`, `Supplier`, `PurchaseOrder` (+
  `PurchaseOrderItem` with `receivedQty`), `GoodsReceipt`, `WastageRecord`,
  `StockTransfer`, `StockAdjustment`, `Conversion`, `StockTake` (+`StockTakeItem`),
  `CashierShift` (+`cashMovements[]`, `expectedCash`, `variance`), `SaleReturn`,
  `AuditLog`, `Settings` — same fields as the demo types.
- `Settings`: `{businessName, paybillNumber, receiptFooter, currency, cashPaymentRounding,
  stockTakeRequiresApproval, lowStockAlertsEnabled}`. No `stkAutoApproveSeconds` — that is
  a demo-only knob and must disappear.

## Catalog

| Method | Path | Notes | permission |
| --- | --- | --- | --- |
| GET | `/api/branches` | | any authenticated |
| POST/PUT/DELETE | `/api/branches/{id}` | DELETE blocked if it has balances/sales → `409 BRANCH_IN_USE` | `branches` |
| GET/POST/PUT/DELETE | `/api/categories(/{id})` | | read any / write `inventory` |
| GET | `/api/products?q&categoryId&activeOnly&branchId` | when `branchId` present, each product carries `balance` | read any |
| POST/PUT | `/api/products(/{id})` | | `inventory` |
| GET | `/api/products/{id}` | includes `balances[]` | read any |
| GET | `/api/inventory/balances?branchId&categoryId&lowStockOnly` | | `inventory` (cashiers may read via `/api/products?branchId`) |
| GET | `/api/inventory/movements?branchId&productId&type&from&to&limit` | newest first | `inventory` |

Deactivating a product is `PUT /api/products/{id}` with `{active:false}`. There is no hard
delete for products, customers or users (audit integrity).

## Sales (server-side drafts — this replaces the localStorage cart)

A draft **is** a `Sale` row with `status=DRAFT`. The SPA never keeps a private cart as the
source of truth; it optimistically updates the cached Sale object and reconciles with the
server response. Every sale also carries `channel`: `POS` for till sales and `ONLINE` for
customer orders (also a `Sale` row, `PENDING_PAYMENT`, created by the storefront API).

| Method | Path | Body |
| --- | --- | --- |
| POST | `/api/sales` | `{branchId, customerId?, items?: [{productId, mode, qtyKg?, amount?, unitPrice?, note?}], discount?}` → `201 {data: Sale}` |
| GET | `/api/sales?status&branchId&channel&from&to&q&userId&page&perPage` | `q` matches receipt no / customer name / phone; `channel` is `POS` or `ONLINE` |
| GET | `/api/sales/{id}` | full `Sale` with `items` + `payments` |
| PATCH | `/api/sales/{id}` | `{customerId?, discount?, note?}` — DRAFT only, else `422 SALE_NOT_DRAFT` |
| POST | `/api/sales/{id}/items` | `{productId, mode: "weight"|"amount", qtyKg?, amount?, unitPrice?, note?}`; `pieces` is prohibited |
| PUT | `/api/sales/{id}/items/{itemId}` | same shape as POST; historical piece rows are read-only |
| DELETE | `/api/sales/{id}/items/{itemId}` | |
| DELETE | `/api/sales/{id}` | cancel a draft, releases nothing (no stock committed yet) |
| POST | `/api/sales/{id}/inventory-overdraft-approval` | `{managerEmail, managerPassword, reason}` — cashier requests distinct active Manager/Super Admin verification; approval is tied to the exact sale items and audited; `409 OVERDRAFT_APPROVAL_REQUIRED`, `403 OVERDRAFT_APPROVER_INVALID` |
| POST | `/api/sales/{id}/cancel` | void a paid/completed sale; restocks if `inventoryCommitted`, requires `pos_void` |
| GET | `/api/sales/{id}/receipt` | print-ready payload: business name, cashier, per-method breakdown, change, footer |
| POST | `/api/sales/{id}/returns` | `{items:[{productId, qtyKg?, pieces?, reason}], refundMethod}` → `{data: SaleReturn}`; only `COMPLETED`, restocks, and books a negative refund payment for CASH |

Cashier sale-list requests are always restricted to the authenticated cashier's own sales and
authorized branch, even if a different `userId` is supplied. The cashier dashboard requests all
statuses and paginates the complete result set.

Server rules for items (must match `src/demo/engine.ts`):
- `mode=weight` → `qtyKg` > 0, `unitPrice` per kg, `total = qtyKg * unitPrice`.
- `mode=amount` (sell-by-customer-amount) → `unitPrice` is per kg and the server solves
  `qtyKg = total / unitPrice` from the requested `amount`; the receipt shows the derived kg.
- `total = max(0, sum(items) - discount)`; `discount` requires `pos_discount` when it
  exceeds `settings.discountNeedsApprovalPercent`.
- Item writes return sellable quantity (`inventory_balances.qty` minus active, unexpired
  `stock_reservations`) in `meta.availableQty` as a warning. A completed sale may overdraw
  inventory and records a negative balance; transfers, wastage, and other stock-out
  operations still reject quantities that would consume reserved or unavailable stock.
- A sale whose estimated overdraft value exceeds
  `settings.inventoryOverdraft.requireAuthorizationAboveValue` cannot accept a payment
  until a different active Manager or Super Admin approves it at checkout. Approval is
  invalidated if the sale's items change and is recorded in the audit log.
- Completion (the `evaluate` step) is single-transaction: lock the sale row
  (`lockForUpdate`), verify paid ≥ total, assign `receiptNo` from the counter, commit any
  active reservations to `COMMITTED`, write all `SALE` movements + balance decrements, set
  `COMPLETED`, write `costTotal` snapshots. `inventoryCommitted` makes it replay-safe.
  Completing an ONLINE order is the staff "collect payment" path and behaves identically.
- Staff POS (`channel=POS`) rounds its final payable total to the nearest whole KSh
  (half-up); cash, card, and STK payment portions must be whole KSh amounts. ONLINE
  order totals retain their existing two-decimal precision.

## Payments

| Method | Path | Body / result |
| --- | --- | --- |
| GET | `/api/payments?method&status&from&to&saleId&userId&page` | transaction list; `userId` matches the initiator or the sale's cashier |
| POST | `/api/sales/{id}/payments/cash` | `{amount, tendered?}` → success adds `{data: Sale}` incl. `change` |
| POST | `/api/sales/{id}/payments/paybill` | `{amount}` → cashier-recorded `SUCCESS` immediately; checkout does not wait for an M-Pesa callback |
| POST | `/api/sales/{id}/payments/card` | `{amount, last4, authCode?, approvalCode?}` — gateway-confirmed only; if `CARD_GATEWAY_ENABLED=false` return `503 CARD_NOT_CONFIGURED` |
| POST | `/api/sales/{id}/payments/stk` | `{phone, amount}` → real Daraja STK push, `{data: Payment}` `PENDING` |
| GET | `/api/payments/{id}` | SPA polls every 3s (max 60 tries) until status ≠ `PENDING` |
| POST | `/api/payments/{id}/expire` | cashier gives up → `EXPIRED` |

Rules: an amount may never exceed the sale balance (`422 AMOUNT_EXCEEDS_BALANCE`). Multiple
payments on one sale are how split payments work — no special endpoint. The sale is
completed by the last successful payment, whatever path it takes. STK payments remain
`PENDING` until a signed Daraja callback confirms them. PayBill checkout is explicitly
recorded by the cashier as successful immediately; it does not wait for provider
confirmation.

## Expenses and profit & loss

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/expenses?branchId&from&to&category&page&perPage` | expense rows, category labels, period P&L, and all-time available cash-sale proceeds |
| POST | `/api/expenses` | `{branchId, category, description, amount, receiptReference?}`; manager/admin `expenses` permission |

Available expense funds are successful CASH payments from completed sales, less cash
refunds and all previously recorded expenses for the branch. Opening float, M-Pesa, and
card receipts are excluded. Recording is serialized by branch and rejected if it would
overspend. P&L uses completed-sale revenue minus item cost for gross profit, then subtracts
period expenses for net profit; expense spending does not alter sales revenue or gross profit.
Categories: `RENT`, `UTILITIES`, `SALARIES`, `TRANSPORT`, `PACKAGING`, `MARKETING`,
`REPAIRS`, `CLEANING`, `LICENSES`, `BANK_FEES`, `COMMUNICATIONS`, `OTHER`.

## M-Pesa (Safaricom Daraja)

Public callbacks, not session-authed, verified per Safaricom spec:

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/mpesa/stk/callback` | `ResultCode`, `CheckoutRequestID`, `MpesaReceiptNumber`, `Amount`, `MPesaPhoneNumber`. Idempotent on `CheckoutRequestID`; ignores callbacks for unknown/terminal payments; wrong `ResultCode` → `FAILED`. Always responds `{"ResultCode":0,"ResultDesc":"Accepted"}` so Safaricom stops retrying. |
| POST | `/api/mpesa/c2b/validation` | legacy callback acknowledged; no unmatched inbox queue or staff matching UI |
| POST | `/api/mpesa/c2b/confirmation` | can settle a historic pending PayBill record; new checkout does not create one |

`App\Services\Mpesa\DarajaClient` handles OAuth (cached token, refresh 60s before expiry),
`businessPassword` = base64(shortcode + passkey + timestamp) encrypted with the Safaricom
public certificate, STK push, C2B register-URL, query-timeout (`/api/mpesa/stk/query`), and
a nightly `mpesa:reconcile` command that queries payments still `PENDING` after 10 minutes.
Sandbox vs live from `MPESA_ENV`. Never log phone numbers or credentials at info level.

## Inventory operations, purchasing, stock taking, shifts

| Method | Path | Body |
| --- | --- | --- |
| POST | `/api/inventory/receive` | `{productId, branchId, qty, unitCost?, supplierId?, ref?}` → `PURCHASE_RECEIVED` + cost update |
| POST | `/api/inventory/wastage` | `{productId, branchId, qty, reason, notes?}` |
| GET | `/api/inventory/transfers?branchId&status` | Two-step transfers where the branch is source or destination |
| POST | `/api/inventory/transfers` | `{fromBranchId, toBranchId, items:[{productId, qty}], note?}` — books `TRANSFER_OUT` only and returns `IN_TRANSIT`; `422 INSUFFICIENT_STOCK` rolls the dispatch back |
| POST | `/api/inventory/transfers/{id}/receive` | Destination branch books `TRANSFER_IN` and completes the transfer; `409 TRANSFER_NOT_IN_TRANSIT` blocks double receipt |
| POST | `/api/inventory/adjustments` | `{productId, branchId, qtyChange, reason}` |
| POST | `/api/inventory/conversions` | `{branchId, input:{productId, qty}, outputs:[{productId, qty}], wasteQty, note?}` → `CONVERSION_INPUT`/`CONVERSION_OUTPUT`, output cost derived from input cost + output quantities |
| GET | `/api/stock-takes?branchId&status` / `/api/stock-takes/{id}` | |
| POST | `/api/stock-takes` | `{branchId, note?}` — snapshots `systemQty` for every product with a balance at that branch |
| PATCH | `/api/stock-takes/{id}/counts` | `{items:[{productId, countedQty, reason?}]}` — `IN_PROGRESS` only |
| POST | `/api/stock-takes/{id}/submit` · `/review` · `/approve` · `/reject` | approve writes one `STOCK_TAKE` movement per variance and requires `pos_void`-level approval per `settings.stockTakeRequiresApproval`; `/approve` returns the variance summary |
| GET/POST | `/api/suppliers(/{id})` | CRUD, `purchasing` |
| GET/POST/PUT | `/api/purchase-orders(/{id})` | `{supplierId, items:[{productId, qty, unit, unitCost}], notes?}` |
| POST | `/api/purchase-orders/{id}/order` · `/cancel` | status transitions `DRAFT→ORDERED`, `→CANCELLED` |
| POST | `/api/purchase-orders/{id}/receive` | `{branchId, items:[{productId, receivedQty, reason?}]}` → goods receipt + `PURCHASE_RECEIVED` movements + `PARTIALLY_RECEIVED`/`RECEIVED` |
| GET | `/api/goods-receipts?poId&branchId` | |
| GET | `/api/shifts?status&userId&branchId` · `/api/shifts/{id}` | |
| POST | `/api/shifts/open` | `{branchId, openingFloat}` → `409 SHIFT_ALREADY_OPEN` |
| POST | `/api/shifts/{id}/movements` | `{type:"IN"|"OUT", amount, reason}` |
| POST | `/api/shifts/{id}/close` | `{actualCash, reason?}` → computes `expectedCash`, variance beyond `settings.cashVarianceTolerance` sets `UNDER_REVIEW` |
| POST | `/api/shifts/{id}/review` | `{approved, note?}` manager sign-off |
| GET/PUT | `/api/settings` | `settings` permission to write. Online ordering is controlled by `onlineOrderingEnabled` (bool, default `true`) and `onlineReservationMinutes` (5–1440, default `60`) |
| GET | `/api/audit-logs?userId&action&from&to&page` | `settings` or `users` permission |
| GET/POST/PUT | `/api/users(/{id})` | `{name, email, phone, role, status, active?, branchId, password?}`; `users` permission; password optional on update. `status` (`ACTIVE`/`INACTIVE`/`SUSPENDED`) and legacy `active` stay in sync |
| POST | `/api/users/{id}/status` | `{status, reason?}` — `reason` required for `INACTIVE`/`SUSPENDED`; `409 STAFF_STATUS_UNCHANGED`, `409 LAST_SUPER_ADMIN`, self-change `422` |
| GET | `/api/users/{id}/status-history` | newest-first lifecycle audit with `from`, `to`, `reason`, `changedByName`, `at` |
| GET/POST/PUT | `/api/customers(/{id})` | `customers`; `Customer` includes `email` (additive, nullable) |
| DELETE | `/api/customers/{id}` | `users`; deletion is refused when sales exist, so deactivate the customer instead |

## Storefront (customer) API

Mounted at **`/api/public`** and **`/api/v1/public`**. Customer sessions use their own
`customer` guard and session key; a customer cookie never satisfies `auth:sanctum`, and a
staff session never satisfies `auth:customer`. Customer auth endpoints require a stateful
request (`409 STATEFUL_REQUEST_REQUIRED` otherwise), exactly like staff login.

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| POST | `/api/public/auth/register` | `{name, email, phone?, password, password_confirmation}` | `201 {data: CustomerAccount}` and logs in |
| POST | `/api/public/auth/login` | `{email, password}` | `{data: CustomerAccount}`; `401`, `403 ACCOUNT_DISABLED`, `429 TOO_MANY_ATTEMPTS` |
| GET | `/api/public/auth/me` | — | `{data: CustomerAccount}` (auth:customer) |
| POST | `/api/public/auth/logout` | — | `{data: {message}}` — ends only the customer session |
| PUT | `/api/public/auth/password` | `{currentPassword, password, password_confirmation}` | `{data: {message}}` |
| GET | `/api/public/catalog?branchId&categoryId&q` | — | `{data: {businessName, currency, selectedBranchId, branches, categories, products, onlineOrdering, deliveryZones}}` |
| GET | `/api/public/products/{id}?branchId` | — | `{data: PublicProduct}` with `availability: [{branchId, branchName, inStock}]`; inactive product → `404` |
| GET/POST/PUT/DELETE | `/api/public/addresses(/{id})` | `{label?, recipientName, phone, addressLine, town, notes?, isDefault?}` | auth:customer; another customer's address is `404` |
| GET | `/api/public/orders?page&perPage` | — | auth:customer; `{data: PublicOrder[], meta}` newest first, own `ONLINE` orders only |
| POST | `/api/public/orders` | `{branchId, items:[{productId, mode, qtyKg?, pieces?, amount?, note?}], note?, deliveryZoneId?, addressId?}` | `201 {data: PublicOrder}`; `unitPrice`, `discount`, `customerId` are **prohibited** — the server prices every line |
| GET | `/api/public/orders/{id}` | — | own order, else `404` |
| POST | `/api/public/orders/{id}/cancel` | — | releases active reservations and sets `CANCELLED`; idempotent; paid orders → `409 SALE_ALREADY_COMPLETED`; after pickup → `409 DELIVERY_NOT_CANCELLABLE` on the staff side |

- `PublicOrder` = `{id, orderNo, status, channel, branchId, branchName, items[], payments[],
  subtotal, deliveryFee, total, paidAmount, balance, fulfillment, deliveryZone, deliveryAddress,
  deliveryStatus, deliveredAt, note, reservationExpiresAt, canCancel, createdAt, completedAt}`.
  Items expose `productName, emoji, mode, qtyKg, pieces, unitPrice,
  unitPriceLabel, qtyLabel, total, note`; payments expose only `method, amount, status,
  createdAt`. `deliveryZone` = `{id, name, etaMinutes, instructions}` and `deliveryAddress`
  is only present when `fulfillment=DELIVERY`. No cost, cost totals, staff ids or stock quantities.
- `deliveryZones` in the catalog is the active zone list for the selected branch:
  `{id, name, fee, minimumOrderTotal, freeDeliveryThreshold, etaMinutes, instructions}`.
  Orders without `deliveryZoneId` are `COLLECTION`; with one they are `DELIVERY` and the
  server snapshots recipient/phone/address/town from the chosen saved `addressId` (the
  address must belong to the customer) and stores the zone fee at order time. The zone must
  be active and belong to the order branch, otherwise `422 VALIDATION_FAILED`. Below the
  zone `minimumOrderTotal` → `422`; at or above `freeDeliveryThreshold` the fee is `0`.
- Placing an order writes a `Sale` with `channel=ONLINE`, `status=PENDING_PAYMENT`,
  `receipt_no=BRM-ORDER-00001` (from the `order` counter) and creates one `ACTIVE`
  `stock_reservation` per product for `onlineReservationMinutes`. Reservation creation
  re-checks **sellable** stock under a row lock; failure rolls the whole order back with
  `422 INSUFFICIENT_STOCK`.
- Reservations only reduce what can be sold; they never move stock. They become
  `COMMITTED` when staff complete the sale (POS held list → Collect payment), `RELEASED`
  when the customer or staff cancels, and `EXPIRED` afterwards. `orders:expire-reservations`
  runs every minute, expires due holds and cancels unpaid ONLINE orders, writing
  `ONLINE_ORDER_EXPIRED` to the audit log.
- `onlineOrderingEnabled=false` makes `POST /api/public/orders` fail with `422` and tells
  the storefront the feature is off via `catalog.onlineOrdering.enabled`; browsing stays up.
- Order creation is throttled to 20 requests/minute per customer. Paying online is not a
  storefront feature yet: customers place the order and pay when they collect (cash, card,
  M-Pesa through the till), which is why `PENDING_PAYMENT` is collectible in the POS.

- `CustomerAccount` = `{id, name, email, phone, emailVerified, active, createdAt}` — never
  `password` or `remember_token`.
- `PublicProduct` = `{id, name, sku, categoryId, categoryName, emoji, baseUnit, sellingModes,
  pricePerKg, pricePerPiece:null, pieceWeightKg:null, inStock}`. The public catalog is
  active-only, kilogram-sellable, and
  **never** carries cost columns or stock quantities — only the boolean `inStock` computed
  from sellable quantity (physical − active reservations) for the selected branch.
- Address book invariant: exactly one default when any address exists; the first address
  created is the default, and deleting the default promotes the oldest remaining address.
- Login is rate limited to 5 attempts / 60s per email + IP.


## Delivery (staff)

All routes require `delivery_manage` unless noted. Mounted at `/api` and `/api/v1`.

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/api/delivery-zones?branchId` | — | `{data: DeliveryZone[]}`; branch-scoped users see only their branch |
| POST | `/api/delivery-zones` | `{branchId?, name, fee, minimumOrderTotal?, freeDeliveryThreshold?, etaMinutes?, instructions?, active?}` | `201 {data: DeliveryZone}`; `409` when `BRANCH_IN_USE`-style conflicts |
| PUT | `/api/delivery-zones/{id}` | any of the above | `{data: DeliveryZone}` |
| DELETE | `/api/delivery-zones/{id}` | — | `409 DELIVERY_ZONE_IN_USE` when the zone has orders/assignments |
| GET | `/api/delivery-personnel?status` | — | `{data: DeliveryPersonnel[]}` |
| POST | `/api/delivery-personnel` | `{name, email, password, phone?, vehicleType?, vehiclePlate?, idNumber?, zoneIds?}` | `201 {data: DeliveryPersonnel}`; creates a `delivery` role user + profile in `PENDING` |
| GET | `/api/delivery-personnel/{id}` | — | `{data: DeliveryPersonnel}` |
| PUT | `/api/delivery-personnel/{id}` | profile + user fields | `{data: DeliveryPersonnel}` |
| POST | `/api/delivery-personnel/{id}/review` | `{status: APPROVED|REJECTED, note?}` | `{data: DeliveryPersonnel}`; logs `DELIVERY_PERSONNEL_REVIEWED` |
| PUT | `/api/delivery-personnel/{id}/zones` | `{zoneIds: string[]}` | replaces zone eligibility |
| GET | `/api/delivery-assignments/candidates` | — | paid `COMPLETED` `DELIVERY` sales with no open assignment |
| GET | `/api/delivery-assignments?status&riderId&page&perPage` | — | `{data: DeliveryAssignment[], meta}` |
| GET | `/api/delivery-assignments/{id}` | — | `{data: DeliveryAssignment}` with status history |
| POST | `/api/sales/{saleId}/delivery-assignment` | `{riderId}` | `201 {data: DeliveryAssignment}`; `409 DELIVERY_NOT_READY`, `409 DELIVERY_ALREADY_ASSIGNED`, `409 DELIVERY_PERSONNEL_UNAVAILABLE`, `409 NOT_A_DELIVERY_ORDER` |
| POST | `/api/delivery-assignments/{id}/cancel` | — | `409 DELIVERY_NOT_CANCELLABLE` once picked up |

Rider routes require `delivery` and are scoped to the caller's own profile:
`GET /api/delivery/profile`, `GET /api/delivery/assignments`, and
`POST /api/delivery/assignments/{id}/{accept|pickup|dispatch|deliver|fail}`.
`fail` needs `{note}`. Illegal jumps return `409 DELIVERY_INVALID_TRANSITION`; another
rider's assignment returns `403`. Every transition writes a `delivery_status_histories`
row and a `DELIVERY_STATUS_CHANGED` audit entry.

`DeliveryAssignment` = `{id, saleId, orderNo, status, riderId, riderName, zone{id,name,fee},
recipientName, phone, addressLine, town, fee, note, assignedAt, acceptedAt, pickedUpAt,
dispatchedAt, deliveredAt, failedAt, createdAt}`. `DeliveryPersonnel` never exposes the
password hash. Tokens and credentials are not part of any delivery payload.

## Reports

All accept `?branchId&from&to&days`; `from`/`to` are `YYYY-MM-DD` and default to today /
last 7 days. Shapes must keep the SPA's `selectors.ts` result names so the charts do not
change, and profit/wastage/variance move server-side.

- `/api/reports/dashboard` → `{revenueToday, salesToday, avgBasket, itemsSoldToday,
  grossProfitToday, revenueYesterday, revenue7d, cashVsMpesa, openShifts, lowStockCount,
  salesTrend: DayPoint[], topProducts: ProductPerfRow[], recentSales: Sale[]}`
- `/api/reports/sales` → `{days: DayPoint[], totals, byMethod, byHour}`
- `/api/reports/products` → `{rows: ProductPerfRow[]}` (`{productName, emoji, units,
  revenue, cost, profit, marginPercent, saleCount}`)
- `/api/reports/inventory` → `{rows: InventoryReportRow[]}` (`{productName, baseUnit,
  onHand, reserved, reorderLevel, status:"ok"|"low"|"out", value}`)
- `/api/reports/payments` → `{rows: {method, count, amount, pending, failed}[]}`
- `/api/reports/wastage` → `{rows: {productId, productName, qty, costValue, reason}[], total}`
- `/api/reports/variance` → `{rows: {stockTakeRef, productName, systemQty, countedQty,
  variance, value}[], total}`
- `/api/reports/profit` → `{rows: {day, revenue, cost, profit, marginPercent}[]}`
- `GET /api/reports/{type}/export?type=sales&format=csv` streams CSV with the same filters.

## Error codes

`INSUFFICIENT_STOCK`, `SALE_NOT_DRAFT`, `SALE_ALREADY_COMPLETED`, `AMOUNT_EXCEEDS_BALANCE`,
`PAYMENT_NOT_PENDING`, `SHIFT_ALREADY_OPEN`, `SHIFT_CLOSED`, `BRANCH_IN_USE`,
`CARD_NOT_CONFIGURED`, `MPESA_NOT_CONFIGURED`, `MPESA_TIMEOUT`, `STOCK_TAKE_NOT_SUBMITTED`,
`APPROVAL_REQUIRED`, `VALIDATION_FAILED`, `TRANSFER_NOT_IN_TRANSIT`, `LAST_SUPER_ADMIN`,
`STAFF_STATUS_UNCHANGED`, `DELIVERY_ZONE_IN_USE`, `DELIVERY_NOT_READY`,
`DELIVERY_PERSONNEL_UNAVAILABLE`, `DELIVERY_ALREADY_ASSIGNED`,
`DELIVERY_INVALID_TRANSITION`, `DELIVERY_NOT_CANCELLABLE`, `DELIVERY_PROFILE_MISSING`,
`NOT_A_DELIVERY_ORDER`. Every 5xx logs the ULID `x-request-id`; the body
never leaks SQL or stack traces in production.

## Conventions

- Route groups follow this file's sections; middleware names `role:` and `permission:` are
  already registered in `bootstrap/app.php`.
- Every list endpoint must scope by the user's active branch when `branchId` is omitted and
  the user is not `super_admin`/`manager` — cashiers and storekeepers never see other
  branches' numbers.
- Frontend: TanStack Query per domain in `src/api/hooks/*`, keys
  `["sales", {filters}]`, `["products", {branchId}]`, `["reports", "dashboard", {branchId}]`.
  Mutations invalidate the affected keys; POS item writes are optimistic.
- Nothing in `src/` may reference `@/demo/*` when this migration is done; `src/demo/` is
  deleted, and its `types.ts` content moves to `src/types/api.ts` with the camelCase shapes
  above.
