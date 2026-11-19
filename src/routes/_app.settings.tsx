import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { usePermissions } from "@/api/hooks/auth";
import { useCategoryList } from "@/api/hooks/catalog";
import { useSettings, useUpdateSettings } from "@/api/hooks/directory";
import { ApiError, fieldError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import type { InventoryOverdraftPolicy, LoyaltySettings, Role } from "@/types/api";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

interface FormState {
  businessName: string;
  paybillNumber: string;
  receiptFooter: string;
  currency: string;
  cashPaymentRounding: string;
  stockTakeApprovalThreshold: string;
  stockTakeMaxRecounts: string;
  lowStockAlertsEnabled: boolean;
  onlineOrderingEnabled: boolean;
  onlineReservationMinutes: string;
  inventoryOverdraftEnabled: boolean;
  inventoryOverdraftAllowedRoles: Role[];
  inventoryOverdraftMaxQuantity: string;
  inventoryOverdraftMaxValue: string;
  inventoryOverdraftApprovalValue: string;
  inventoryOverdraftRequireNarration: boolean;
  inventoryOverdraftAlertsEnabled: boolean;
  loyaltyEarningPercentage: string;
  loyaltyPointValue: string;
  loyaltyRedemptionEnabled: boolean;
  loyaltyExpiryEnabled: boolean;
  loyaltyExpiryMonths: string;
  loyaltyEligibleCategoryIds: string[];
}

const EMPTY_FORM: FormState = {
  businessName: "",
  paybillNumber: "",
  receiptFooter: "",
  currency: "KES",
  cashPaymentRounding: "0",
  stockTakeApprovalThreshold: "10000",
  stockTakeMaxRecounts: "3",
  lowStockAlertsEnabled: true,
  onlineOrderingEnabled: true,
  onlineReservationMinutes: "60",
  inventoryOverdraftEnabled: false,
  inventoryOverdraftAllowedRoles: ["super_admin", "manager", "cashier"],
  inventoryOverdraftMaxQuantity: "10",
  inventoryOverdraftMaxValue: "50000",
  inventoryOverdraftApprovalValue: "10000",
  inventoryOverdraftRequireNarration: false,
  inventoryOverdraftAlertsEnabled: true,
  loyaltyEarningPercentage: "1",
  loyaltyPointValue: "1",
  loyaltyRedemptionEnabled: false,
  loyaltyExpiryEnabled: false,
  loyaltyExpiryMonths: "12",
  loyaltyEligibleCategoryIds: [],
};

function SettingsPage() {
  const permissions = usePermissions();
  /** `GET /settings` is readable by sessions; PUT needs the `settings` permission. */
  const canWrite = permissions.includes("settings");

  const settings = useSettings();
  const businessUpdate = useUpdateSettings();
  const paymentsUpdate = useUpdateSettings();
  const inventoryUpdate = useUpdateSettings();
  const loyaltyUpdate = useUpdateSettings();
  const onlineUpdate = useUpdateSettings();
  const categories = useCategoryList();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const initialized = useRef(false);

  // Only initialize from the server once so saving one section cannot reset
  // unsaved edits in another section.
  useEffect(() => {
    const s = settings.data;
    if (!s || initialized.current) return;
    initialized.current = true;
    setForm({
      businessName: s.businessName,
      paybillNumber: s.paybillNumber,
      receiptFooter: s.receiptFooter,
      currency: s.currency,
      cashPaymentRounding: String(s.cashPaymentRounding),
      stockTakeApprovalThreshold: String(s.stockTakeApprovalThreshold),
      stockTakeMaxRecounts: String(s.stockTakeMaxRecounts),
      lowStockAlertsEnabled: s.lowStockAlertsEnabled,
      onlineOrderingEnabled: s.onlineOrderingEnabled,
      onlineReservationMinutes: String(s.onlineReservationMinutes),
      inventoryOverdraftEnabled: s.inventoryOverdraft.enabled,
      inventoryOverdraftAllowedRoles: s.inventoryOverdraft.allowedRoles,
      inventoryOverdraftMaxQuantity: s.inventoryOverdraft.maxNegativeQuantity?.toString() ?? "",
      inventoryOverdraftMaxValue: s.inventoryOverdraft.maxOverdraftValue?.toString() ?? "",
      inventoryOverdraftApprovalValue:
        s.inventoryOverdraft.requireAuthorizationAboveValue?.toString() ?? "",
      inventoryOverdraftRequireNarration: s.inventoryOverdraft.requireNarration,
      inventoryOverdraftAlertsEnabled: s.inventoryOverdraft.alertsEnabled,
      loyaltyEarningPercentage: String(s.loyalty.earningPercentage),
      loyaltyPointValue: String(s.loyalty.pointValue),
      loyaltyRedemptionEnabled: s.loyalty.redemptionEnabled,
      loyaltyExpiryEnabled: s.loyalty.expiryEnabled,
      loyaltyExpiryMonths: String(s.loyalty.expiryMonths),
      loyaltyEligibleCategoryIds: s.loyalty.eligibleCategoryIds,
    });
  }, [settings.data]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function saveBusiness() {
    businessUpdate.mutate(
      {
        businessName: form.businessName.trim(),
        receiptFooter: form.receiptFooter,
        currency: form.currency.trim(),
      },
      { onSuccess: () => toast.success("Business settings saved") },
    );
  }

  function savePayments() {
    const rounding = Number(form.cashPaymentRounding.trim() || "0");
    paymentsUpdate.mutate(
      {
        paybillNumber: form.paybillNumber.trim(),
        cashPaymentRounding: Number.isFinite(rounding) ? rounding : 0,
      },
      { onSuccess: () => toast.success("Payment settings saved") },
    );
  }

  function saveInventory() {
    const approvalThreshold = Number(form.stockTakeApprovalThreshold.trim() || "10000");
    const maxRecounts = Number(form.stockTakeMaxRecounts.trim() || "3");
    const parseLimit = (value: string): number | null => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const inventoryOverdraft: InventoryOverdraftPolicy = {
      enabled: form.inventoryOverdraftEnabled,
      allowedRoles: form.inventoryOverdraftAllowedRoles,
      maxNegativeQuantity: parseLimit(form.inventoryOverdraftMaxQuantity),
      maxOverdraftValue: parseLimit(form.inventoryOverdraftMaxValue),
      requireAuthorizationAboveValue: parseLimit(form.inventoryOverdraftApprovalValue),
      requireNarration: form.inventoryOverdraftRequireNarration,
      alertsEnabled: form.inventoryOverdraftAlertsEnabled,
    };
    inventoryUpdate.mutate(
      {
        stockTakeApprovalThreshold: Number.isFinite(approvalThreshold) ? approvalThreshold : 10000,
        stockTakeMaxRecounts: Number.isFinite(maxRecounts) ? maxRecounts : 3,
        lowStockAlertsEnabled: form.lowStockAlertsEnabled,
        inventoryOverdraft,
      },
      { onSuccess: () => toast.success("Inventory settings saved") },
    );
  }

  function saveLoyalty() {
    const loyalty: Partial<LoyaltySettings> = {
      enabled: true,
      redemptionEnabled: form.loyaltyRedemptionEnabled,
      payWithPointsEnabled: true,
      onlinePayWithPointsEnabled: true,
      earningPercentage: Number(form.loyaltyEarningPercentage),
      pointValue: Number(form.loyaltyPointValue),
      expiryEnabled: form.loyaltyExpiryEnabled,
      eligibleCategoryIds: form.loyaltyEligibleCategoryIds,
    };
    if (form.loyaltyExpiryEnabled) loyalty.expiryMonths = Number(form.loyaltyExpiryMonths);
    loyaltyUpdate.mutate(
      {
        loyalty: {
          ...loyalty,
          payWithPointsEnabled: form.loyaltyRedemptionEnabled,
          onlinePayWithPointsEnabled: form.loyaltyRedemptionEnabled,
        },
      },
      { onSuccess: () => toast.success("Loyalty settings saved") },
    );
  }

  function saveOnline() {
    const reservationMinutes = Number(form.onlineReservationMinutes.trim() || "60");
    onlineUpdate.mutate(
      {
        onlineOrderingEnabled: form.onlineOrderingEnabled,
        onlineReservationMinutes: Number.isFinite(reservationMinutes) ? reservationMinutes : 60,
      },
      { onSuccess: () => toast.success("Online order settings saved") },
    );
  }

  const overdraftRoles: Role[] = ["cashier", "manager", "super_admin"];

  return (
    <div className="pb-10">
      <PageHeader title="Settings" subtitle="Business settings" />
      <div className="max-w-md space-y-5 px-4 py-5 md:px-6">
        {settings.isPending && <Skeleton className="h-80 rounded-xl" />}
        {settings.isError &&
          (settings.error instanceof ApiError && settings.error.status === 403 ? (
            <div className="rounded-xl border p-5 text-sm text-muted-foreground">
              Business settings are not available for your role.
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
              <span className="text-4xl">⚠️</span>
              <p className="mt-3 font-semibold">Settings did not load.</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {settings.error.message}
              </p>
              <Button
                variant="outline"
                className="mt-3"
                disabled={settings.isFetching}
                onClick={() => void settings.refetch()}
              >
                Try again
              </Button>
            </div>
          ))}

        {settings.isSuccess && (
          <div className="rounded-xl border p-5">
            <p className="mb-4 font-display text-sm font-bold">Business Settings</p>
            {businessUpdate.error && (
              <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {businessUpdate.error.message}
              </p>
            )}
            <div className="space-y-3">
              <div>
                <Label htmlFor="s-name">Business Name</Label>
                <Input
                  id="s-name"
                  value={form.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                  className="mt-1"
                  disabled={!canWrite}
                />
                <FieldMsg text={fieldError(businessUpdate.error, "businessName")} />
              </div>
              <div>
                <Label htmlFor="s-footer">Receipt Footer</Label>
                <Input
                  id="s-footer"
                  value={form.receiptFooter}
                  onChange={(e) => set("receiptFooter", e.target.value)}
                  className="mt-1"
                  disabled={!canWrite}
                />
                <FieldMsg text={fieldError(businessUpdate.error, "receiptFooter")} />
              </div>
              <div>
                <Label htmlFor="s-currency">Currency</Label>
                <Input
                  id="s-currency"
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  className="mt-1"
                  disabled={!canWrite}
                />
                <FieldMsg text={fieldError(businessUpdate.error, "currency")} />
              </div>
              <Button onClick={saveBusiness} disabled={!canWrite || businessUpdate.isPending}>
                <Save className="mr-1 h-4 w-4" />
                {businessUpdate.isPending ? "Saving…" : "Save Business Settings"}
              </Button>

              <div className="space-y-3 border-t pt-3">
                <p className="font-display text-sm font-bold">Payment settings</p>
                {paymentsUpdate.error && (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {paymentsUpdate.error.message}
                  </p>
                )}
                <div>
                  <Label htmlFor="s-paybill">PayBill Number</Label>
                  <Input
                    id="s-paybill"
                    value={form.paybillNumber}
                    onChange={(e) => set("paybillNumber", e.target.value)}
                    className="mt-1"
                    disabled={!canWrite}
                  />
                  <FieldMsg text={fieldError(paymentsUpdate.error, "paybillNumber")} />
                </div>
                <div>
                  <Label htmlFor="s-rounding">Cash rounding</Label>
                  <Input
                    id="s-rounding"
                    type="number"
                    step="0.01"
                    value={form.cashPaymentRounding}
                    onChange={(e) => set("cashPaymentRounding", e.target.value)}
                    className="mt-1"
                    disabled={!canWrite}
                  />
                  <FieldMsg text={fieldError(paymentsUpdate.error, "cashPaymentRounding")} />
                </div>
                <Button onClick={savePayments} disabled={!canWrite || paymentsUpdate.isPending}>
                  <Save className="mr-1 h-4 w-4" />
                  {paymentsUpdate.isPending ? "Saving…" : "Save Payment Settings"}
                </Button>
              </div>
              <div className="space-y-3 border-t pt-3">
                <p className="font-display text-sm font-bold">Inventory &amp; stock settings</p>
                {inventoryUpdate.error && (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {inventoryUpdate.error.message}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="s-stock-take-threshold">Super Admin threshold (KSh)</Label>
                    <Input
                      id="s-stock-take-threshold"
                      type="number"
                      min={0}
                      step="100"
                      value={form.stockTakeApprovalThreshold}
                      onChange={(event) => set("stockTakeApprovalThreshold", event.target.value)}
                      className="mt-1"
                      disabled={!canWrite}
                    />
                    <FieldMsg
                      text={fieldError(inventoryUpdate.error, "stockTakeApprovalThreshold")}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Manager approval is always required. Higher-value adjustments require a Super
                      Admin.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="s-stock-take-recounts">Maximum recounts</Label>
                    <Input
                      id="s-stock-take-recounts"
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      value={form.stockTakeMaxRecounts}
                      onChange={(event) => set("stockTakeMaxRecounts", event.target.value)}
                      className="mt-1"
                      disabled={!canWrite}
                    />
                    <FieldMsg text={fieldError(inventoryUpdate.error, "stockTakeMaxRecounts")} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.lowStockAlertsEnabled}
                    onCheckedChange={(v) => set("lowStockAlertsEnabled", v === true)}
                    disabled={!canWrite}
                  />
                  Low stock alerts
                </label>

                <div className="space-y-3 border-t pt-3">
                  <p className="font-display text-sm font-bold">Inventory overdraft</p>
                  <p className="text-xs text-muted-foreground">
                    Negative stock is blocked unless enabled here. Leave a limit empty only when
                    explicitly authorizing unlimited exposure.
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.inventoryOverdraftEnabled}
                      onCheckedChange={(value) => set("inventoryOverdraftEnabled", value === true)}
                      disabled={!canWrite}
                    />
                    Allow controlled negative inventory
                  </label>
                  <div className="space-y-2">
                    <Label>Roles allowed to sell into overdraft</Label>
                    {overdraftRoles.map((role) => (
                      <label key={role} className="flex items-center gap-2 text-sm capitalize">
                        <Checkbox
                          checked={form.inventoryOverdraftAllowedRoles.includes(role)}
                          onCheckedChange={(checked) =>
                            set(
                              "inventoryOverdraftAllowedRoles",
                              checked
                                ? [...form.inventoryOverdraftAllowedRoles, role]
                                : form.inventoryOverdraftAllowedRoles.filter(
                                    (allowed) => allowed !== role,
                                  ),
                            )
                          }
                          disabled={!canWrite || !form.inventoryOverdraftEnabled}
                        />
                        {role.replace("_", " ")}
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="s-overdraft-qty">
                        Maximum negative quantity (base units)
                      </Label>
                      <Input
                        id="s-overdraft-qty"
                        type="number"
                        min={0}
                        step="0.001"
                        value={form.inventoryOverdraftMaxQuantity}
                        onChange={(event) =>
                          set("inventoryOverdraftMaxQuantity", event.target.value)
                        }
                        className="mt-1"
                        disabled={!canWrite || !form.inventoryOverdraftEnabled}
                      />
                      <FieldMsg
                        text={fieldError(
                          inventoryUpdate.error,
                          "inventoryOverdraft.maxNegativeQuantity",
                        )}
                      />
                    </div>
                    <div>
                      <Label htmlFor="s-overdraft-value">Maximum overdraft value (KSh)</Label>
                      <Input
                        id="s-overdraft-value"
                        type="number"
                        min={0}
                        step="100"
                        value={form.inventoryOverdraftMaxValue}
                        onChange={(event) => set("inventoryOverdraftMaxValue", event.target.value)}
                        className="mt-1"
                        disabled={!canWrite || !form.inventoryOverdraftEnabled}
                      />
                      <FieldMsg
                        text={fieldError(
                          inventoryUpdate.error,
                          "inventoryOverdraft.maxOverdraftValue",
                        )}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="s-overdraft-approval">
                      Require manager authorization above (KSh)
                    </Label>
                    <Input
                      id="s-overdraft-approval"
                      type="number"
                      min={0}
                      step="100"
                      value={form.inventoryOverdraftApprovalValue}
                      onChange={(event) =>
                        set("inventoryOverdraftApprovalValue", event.target.value)
                      }
                      className="mt-1"
                      disabled={!canWrite || !form.inventoryOverdraftEnabled}
                    />
                    <FieldMsg
                      text={fieldError(
                        inventoryUpdate.error,
                        "inventoryOverdraft.requireAuthorizationAboveValue",
                      )}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.inventoryOverdraftRequireNarration}
                      onCheckedChange={(value) =>
                        set("inventoryOverdraftRequireNarration", value === true)
                      }
                      disabled={!canWrite || !form.inventoryOverdraftEnabled}
                    />
                    Require narration for overdraft sales
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.inventoryOverdraftAlertsEnabled}
                      onCheckedChange={(value) =>
                        set("inventoryOverdraftAlertsEnabled", value === true)
                      }
                      disabled={!canWrite}
                    />
                    Record overdraft alerts in the audit trail
                  </label>
                  <Button
                    onClick={saveInventory}
                    disabled={!canWrite || inventoryUpdate.isPending}
                  >
                    <Save className="mr-1 h-4 w-4" />
                    {inventoryUpdate.isPending ? "Saving…" : "Save Inventory Settings"}
                  </Button>
                </div>
              </div>

              <div className="space-y-3 border-t pt-3">
                <p className="font-display text-sm font-bold">Loyalty Program</p>
                {loyaltyUpdate.error && (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {loyaltyUpdate.error.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Points continue accumulating on eligible completed purchases, whether or not
                  loyalty payment is allowed.
                </p>
                <p className="pt-2 text-sm font-semibold">Point earning rules</p>
                <div>
                  <Label htmlFor="loyalty-earning">Points earning rate (%)</Label>
                  <Input
                    id="loyalty-earning"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.loyaltyEarningPercentage}
                    onChange={(event) => set("loyaltyEarningPercentage", event.target.value)}
                    className="mt-1"
                    disabled={!canWrite}
                  />
                  <FieldMsg text={fieldError(loyaltyUpdate.error, "loyalty.earningPercentage")} />
                </div>
                <div className="border-t pt-3">
                  <div>
                    <Label htmlFor="loyalty-value">Value per point (KSh)</Label>
                    <Input
                      id="loyalty-value"
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={form.loyaltyPointValue}
                      onChange={(event) => set("loyaltyPointValue", event.target.value)}
                      className="mt-1"
                      disabled={!canWrite || !form.loyaltyRedemptionEnabled}
                    />
                    <FieldMsg text={fieldError(loyaltyUpdate.error, "loyalty.pointValue")} />
                  </div>
                </div>
                <p className="border-t pt-3 text-sm font-semibold">Loyalty payment</p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.loyaltyRedemptionEnabled}
                    onCheckedChange={(value) => set("loyaltyRedemptionEnabled", value === true)}
                    disabled={!canWrite}
                  />
                  Allow loyalty payment (redeem accumulated points)
                </label>
                <p className="text-xs text-muted-foreground">
                  When enabled, customers can use accumulated points toward POS and online order
                  payments. When disabled, they keep earning points but cannot redeem them.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.loyaltyExpiryEnabled}
                    onCheckedChange={(value) => set("loyaltyExpiryEnabled", value === true)}
                    disabled={!canWrite}
                  />
                  Expire points after a validity period
                </label>
                <div>
                  <Label htmlFor="loyalty-expiry">Validity period (months)</Label>
                  <Input
                    id="loyalty-expiry"
                    type="number"
                    min={1}
                    step={1}
                    value={form.loyaltyExpiryMonths}
                    onChange={(event) => set("loyaltyExpiryMonths", event.target.value)}
                    className="mt-1"
                    disabled={!canWrite || !form.loyaltyExpiryEnabled}
                  />
                  <FieldMsg text={fieldError(loyaltyUpdate.error, "loyalty.expiryMonths")} />
                </div>
                <div className="space-y-2">
                  <Label>Eligible purchases</Label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.loyaltyEligibleCategoryIds.length === 0}
                      onCheckedChange={(checked) => {
                        if (checked === true) set("loyaltyEligibleCategoryIds", []);
                        else if (categories.data?.length) {
                          set(
                            "loyaltyEligibleCategoryIds",
                            categories.data.map((category) => category.id),
                          );
                        }
                      }}
                      disabled={!canWrite || !categories.data?.length}
                    />
                    All products
                  </label>
                  {form.loyaltyEligibleCategoryIds.length > 0 && (
                    <div className="space-y-1 rounded-lg border p-3">
                      {categories.data?.map((category) => (
                        <label key={category.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={form.loyaltyEligibleCategoryIds.includes(category.id)}
                            onCheckedChange={(checked) => {
                              const selected = new Set(form.loyaltyEligibleCategoryIds);
                              if (checked === true) selected.add(category.id);
                              else if (selected.size > 1) selected.delete(category.id);
                              const ids = [...selected];
                              set(
                                "loyaltyEligibleCategoryIds",
                                ids.length === categories.data?.length ? [] : ids,
                              );
                            }}
                            disabled={
                              !canWrite ||
                              (form.loyaltyEligibleCategoryIds.length === 1 &&
                                form.loyaltyEligibleCategoryIds[0] === category.id)
                            }
                          />
                          {category.name}
                        </label>
                      ))}
                    </div>
                  )}
                  {categories.isError && (
                    <p className="text-xs text-destructive">
                      Product categories could not be loaded: {categories.error.message}
                    </p>
                  )}
                </div>
                <Button onClick={saveLoyalty} disabled={!canWrite || loyaltyUpdate.isPending}>
                  <Save className="mr-1 h-4 w-4" />
                  {loyaltyUpdate.isPending ? "Saving…" : "Save Loyalty Settings"}
                </Button>
              </div>

              <div className="space-y-3 border-t pt-3">
                <p className="font-display text-sm font-bold">Online orders</p>
                {onlineUpdate.error && (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {onlineUpdate.error.message}
                  </p>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.onlineOrderingEnabled}
                    onCheckedChange={(v) => set("onlineOrderingEnabled", v === true)}
                    disabled={!canWrite}
                  />
                  Accept online orders for collection
                </label>
                <div>
                  <Label htmlFor="s-reservation">Hold stock for (minutes)</Label>
                  <Input
                    id="s-reservation"
                    type="number"
                    min={5}
                    max={1440}
                    value={form.onlineReservationMinutes}
                    onChange={(e) => set("onlineReservationMinutes", e.target.value)}
                    className="mt-1"
                    disabled={!canWrite || !form.onlineOrderingEnabled}
                  />
                  <FieldMsg text={fieldError(onlineUpdate.error, "onlineReservationMinutes")} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reserved items return to sale automatically if the order is not paid in time.
                  </p>
                </div>
                <Button onClick={saveOnline} disabled={!canWrite || onlineUpdate.isPending}>
                  <Save className="mr-1 h-4 w-4" />
                  {onlineUpdate.isPending ? "Saving…" : "Save Online Settings"}
                </Button>
              </div>
            </div>
            {!canWrite && (
              <p className="mt-2 text-xs text-muted-foreground">
                You can view settings, but only accounts with the settings permission can change
                them.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldMsg({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return <p className="mt-1 text-xs font-medium text-destructive">{text}</p>;
}
