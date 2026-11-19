import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductImage } from "@/components/product-image";
import { fmtKg, posMoney as money, round2, round3 } from "@/lib/money";
import type { AddSaleItemInput, Product, SellingMode } from "@/types/api";

const MODE_META: Record<SellingMode, { label: string; emoji?: string; hint: string }> = {
  weight: { label: "By Weight", emoji: "⚖️", hint: "KG or grams" },
  piece: { label: "By Piece", hint: "Configured piece weight" },
  amount: { label: "By Amount", emoji: "💰", hint: "Customer budget" },
};

const QUICK_GRAMS = [100, 250, 500, 750, 1000];
const QUICK_AMOUNTS = [100, 200, 300, 500];

interface Props {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: AddSaleItemInput) => void;
}

export function SellModeDialog({ product, open, onOpenChange, onAdd }: Props) {
  const [mode, setMode] = useState<SellingMode | null>(null);
  const [weightGrams, setWeightGrams] = useState<number>(500);
  const [weightUnit, setWeightUnit] = useState<"g" | "kg">("g");
  const [weightKgInput, setWeightKgInput] = useState<string>("0.5");
  const [budget, setBudget] = useState<string>("");
  const [pieces, setPieces] = useState<number>(1);
  const [actualInput, setActualInput] = useState<string>("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open && product) {
      setMode(product.sellingModes.length === 1 ? (product.sellingModes[0] ?? null) : null);
      setWeightGrams(500);
      setWeightUnit("g");
      setWeightKgInput("0.5");
      setBudget("");
      setPieces(1);
      setActualInput("");
      setNote("");
    }
  }, [open, product]);

  // `GET /products?branchId` carries this branch's live balance on every row.
  const stockQty = useMemo(() => Math.max(0, product?.balance ?? 0), [product]);

  if (!product) return null;

  const kgPrice = product.pricePerKg ?? 0;
  /** Amount selling is calculated from the product's per-KG price. */
  const amountIsWeightBased = kgPrice > 0;

  // Everything below is the cashier's live input preview. The cart line shows the
  // `qtyKg` / `qtyLabel` / `unitPriceLabel` / `total` the till wrote server-side.
  const previewQtyKg =
    weightUnit === "g" ? round3(weightGrams / 1000) : round3(parseFloat(weightKgInput) || 0);
  const previewWeightTotal = round2(previewQtyKg * kgPrice);
  const overStockWeight = product.baseUnit === "KG" && previewQtyKg > stockQty + 1e-9;

  const budgetVal = parseFloat(budget) || 0;
  const previewBudgetKg = amountIsWeightBased ? round3(budgetVal / kgPrice) : null;
  const actualFromScale = parseFloat(actualInput) || 0;
  const finalAmountQty = actualInput === "" ? (previewBudgetKg ?? 0) : actualFromScale;
  const previewAmountTotal = round2(finalAmountQty * kgPrice);
  const overStockAmount = product.baseUnit === "KG" && finalAmountQty > stockQty + 1e-9;

  function add() {
    if (!product || !mode) return;
    const trimmedNote = note.trim() || null;

    if (mode === "weight") {
      if (previewQtyKg <= 0) return;
      onAdd({ productId: product.id, mode: "weight", qtyKg: previewQtyKg, note: trimmedNote });
      onOpenChange(false);
      return;
    }

    if (mode === "piece") {
      if (pieces <= 0) return;
      onAdd({ productId: product.id, mode: "piece", pieces, note: trimmedNote });
      onOpenChange(false);
      return;
    }

    if (budgetVal <= 0) return;
    onAdd(
      actualInput === ""
        ? { productId: product.id, mode: "amount", amount: budgetVal, note: trimmedNote }
        : {
            productId: product.id,
            mode: "amount",
            qtyKg: round3(actualFromScale),
            note: trimmedNote,
          },
    );
    onOpenChange(false);
  }

  const bigBtn = "h-16 text-base font-semibold rounded-xl";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl p-0 sm:max-w-md">
        <div className="sticky top-0 z-10 border-b bg-card/95 px-5 py-4 backdrop-blur">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="flex items-center gap-2 font-display text-lg">
              <ProductImage
                name={product.name}
                productId={product.id}
                className="h-10 w-10 rounded-lg"
              />
              {product.name}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Stock: {fmtKg(stockQty)} · {money(kgPrice)}/KG
            </p>
          </DialogHeader>
        </div>

        <div className="px-5 pb-5">
          {mode === null ? (
            <div className="space-y-2 py-2">
              <p className="text-sm font-semibold text-muted-foreground">
                How is the customer buying?
              </p>
              {product.sellingModes.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex w-full items-center gap-4 rounded-xl border-2 bg-muted/40 px-4 py-4 text-left transition-colors hover:border-brand hover:bg-brand-soft"
                >
                  {m === "piece" ? (
                    <ProductImage
                      name={product.name}
                      productId={product.id}
                      className="h-12 w-12 rounded-lg"
                    />
                  ) : (
                    <span className="text-3xl">{MODE_META[m].emoji}</span>
                  )}
                  <span>
                    <span className="block font-display text-lg font-bold">
                      {MODE_META[m].label}
                    </span>
                    <span className="block text-xs text-muted-foreground">{MODE_META[m].hint}</span>
                  </span>
                  <span className="ml-auto font-semibold text-muted-foreground">
                    {m === "piece"
                      ? `${money(product.pricePerPiece ?? 0)} /PIECE`
                      : `${money(kgPrice)} /KG`}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <>
              {product.sellingModes.length > 1 && (
                <button
                  onClick={() => setMode(null)}
                  className="mb-3 text-xs font-semibold text-brand-deep underline-offset-2 hover:underline"
                >
                  ← Change selling mode
                </button>
              )}

              {mode === "weight" && (
                <div className="space-y-4 py-2">
                  <div className="flex gap-2">
                    <Button
                      variant={weightUnit === "g" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setWeightUnit("g")}
                      className="flex-1"
                    >
                      GRAMS
                    </Button>
                    <Button
                      variant={weightUnit === "kg" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setWeightUnit("kg")}
                      className="flex-1"
                    >
                      KILOGRAMS
                    </Button>
                  </div>
                  {weightUnit === "g" ? (
                    <>
                      <div>
                        <Label htmlFor="wgrams">Weight (grams)</Label>
                        <Input
                          id="wgrams"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={weightGrams || ""}
                          onChange={(e) =>
                            setWeightGrams(Math.max(0, parseInt(e.target.value) || 0))
                          }
                          className="h-14 text-center font-display text-2xl font-bold"
                        />
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {QUICK_GRAMS.map((g) => (
                          <Button
                            key={g}
                            variant="outline"
                            size="sm"
                            onClick={() => setWeightGrams(g)}
                            className="h-10 text-xs"
                          >
                            {g < 1000 ? `${g}g` : "1KG"}
                          </Button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div>
                      <Label htmlFor="wkg">Weight (KG)</Label>
                      <Input
                        id="wkg"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        value={weightKgInput}
                        onChange={(e) => setWeightKgInput(e.target.value)}
                        className="h-14 text-center font-display text-2xl font-bold"
                      />
                    </div>
                  )}
                  {overStockWeight && (
                    <p className="text-sm font-semibold text-destructive">
                      Only {fmtKg(stockQty)} available. This sale will put stock below zero.
                    </p>
                  )}
                  <TotalBar
                    label={`Est. ${fmtKg(previewQtyKg)} × ${money(kgPrice)}/KG`}
                    total={previewWeightTotal}
                    disabled={previewQtyKg <= 0}
                    onAdd={add}
                  />
                </div>
              )}

              {mode === "amount" && (
                <div className="space-y-4 py-2">
                  <div>
                    <Label htmlFor="budget">Customer budget (KSh)</Label>
                    <Input
                      id="budget"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder="e.g. 300"
                      value={budget}
                      onChange={(e) => {
                        setBudget(e.target.value);
                        setActualInput("");
                      }}
                      className="h-14 text-center font-display text-2xl font-bold"
                    />
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {QUICK_AMOUNTS.map((a) => (
                        <Button
                          key={a}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setBudget(String(a));
                            setActualInput("");
                          }}
                          className="h-10 text-xs"
                        >
                          {a}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {budgetVal > 0 && (
                    <div className="rounded-xl border bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Customer should receive (estimate)
                      </p>
                      <p className="font-display text-3xl font-bold text-brand-deep">
                        {fmtKg(previewBudgetKg ?? 0)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {money(budgetVal)} ÷ {money(kgPrice)} / KG
                      </p>
                      <div className="mt-3 border-t pt-3">
                        <Label htmlFor="actual">Confirm actual from scale (KG)</Label>
                        <Input
                          id="actual"
                          type="number"
                          inputMode="decimal"
                          step="0.001"
                          placeholder={String(previewBudgetKg ?? 0)}
                          value={actualInput}
                          onChange={(e) => setActualInput(e.target.value)}
                          className="mt-1 h-12 text-center font-display text-xl font-bold"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Leave empty to let the till derive the quantity from the budget ·{" "}
                          <span className="font-semibold text-foreground">
                            Est. total {money(previewAmountTotal)}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                  {overStockAmount && (
                    <p className="text-sm font-semibold text-destructive">
                      Only {fmtKg(stockQty)} available. This sale will put stock below zero.
                    </p>
                  )}
                  <Button className={`${bigBtn} w-full`} disabled={budgetVal <= 0} onClick={add}>
                    ADD TO CART — {money(previewAmountTotal)}
                  </Button>
                </div>
              )}

              {mode === "piece" && (
                <div className="space-y-4 py-2">
                  <div>
                    <Label htmlFor="piece-count">Number of pieces</Label>
                    <Input
                      id="piece-count"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={pieces || ""}
                      onChange={(e) => setPieces(Math.max(0, parseInt(e.target.value) || 0))}
                      className="h-14 text-center font-display text-2xl font-bold"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pieces} × {fmtKg(product.pieceWeightKg ?? 0)} ×{" "}
                      {kgPrice ? `${money(product.pricePerPiece ?? 0)} per piece` : "configured price"}
                    </p>
                  </div>
                  {pieces * (product.pieceWeightKg ?? 0) > stockQty && (
                    <p className="text-sm font-semibold text-destructive">
                      Only {fmtKg(stockQty)} recorded. This sale will put stock below zero.
                    </p>
                  )}
                  <TotalBar
                    label={`${pieces} ${pieces === 1 ? "piece" : "pieces"} × ${money(product.pricePerPiece ?? 0)}`}
                    total={round2(pieces * (product.pricePerPiece ?? 0))}
                    disabled={pieces <= 0 || !product.pricePerPiece || !product.pieceWeightKg}
                    onAdd={add}
                  />
                </div>
              )}

              {mode !== "amount" && (
                <div className="mt-3">
                  <Label htmlFor="note" className="text-xs">
                    Note (optional)
                  </Label>
                  <Textarea
                    id="note"
                    rows={2}
                    placeholder="e.g. customer wants extra fresh"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="text-sm"
                  />
                </div>
              )}

              <p className="mt-3 text-[11px] text-muted-foreground">
                The quantity and price on the cart line are the ones the till confirmed.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TotalBar({
  label,
  total,
  disabled,
  onAdd,
}: {
  label: string;
  total: number;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-xl border bg-muted/40 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-bold">{money(total)}</p>
      </div>
      <Button className="mt-3 h-14 w-full text-base font-bold" disabled={disabled} onClick={onAdd}>
        ADD TO CART
      </Button>
    </div>
  );
}
