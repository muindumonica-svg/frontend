import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fmtKg, money, round2, round3 } from "@/lib/money";
import type { ProductImageKey } from "@/lib/product-images";
import type { PublicProduct, SellingMode } from "@/types/api";

/**
 * The cart is local until checkout. Checkout posts the requested quantities and
 * the server prices them, so these numbers are display-only.
 */
export interface CartLine {
  id: string;
  productId: string;
  name: string;
  slug?: string | null | undefined;
  sku?: string | null | undefined;
  categoryName?: string | null | undefined;
  imageKey?: ProductImageKey | null | undefined;
  emoji: string;
  mode: SellingMode;
  qtyKg: number | null;
  pieces: number | null;
  amount: number | null;
  unitPrice: number;
  total: number;
  qtyLabel: string;
  unitPriceLabel: string;
  branchId: string;
  branchName: string;
}

interface CartState {
  lines: CartLine[];
  branchId: string | null;
  branchName: string | null;
  count: number;
  subtotal: number;
  addLine: (line: CartLine) => void;
  updateLine: (id: string, value: number) => void;
  removeLine: (id: string) => void;
  clear: () => void;
}

const STORAGE_KEY = "brathamatu.cart.v1";

const CartContext = createContext<CartState | null>(null);

function lineId(productId: string, mode: SellingMode): string {
  return `${productId}:${mode}`;
}

/** Build a display line for a product selection; the server validates it later. */
export function makeCartLine(
  product: PublicProduct,
  mode: SellingMode,
  value: number,
  branch: { id: string; name: string },
): CartLine {
  const unitPrice = round2(product.pricePerKg ?? 0);

  if (mode === "amount") {
    const amount = Math.max(0, round2(value));
    const qtyKg = unitPrice > 0 ? round3(amount / unitPrice) : 0;
    return {
      id: lineId(product.id, mode),
      productId: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      categoryName: product.categoryName,
      imageKey: product.imageKey,
      emoji: product.emoji,
      mode,
      qtyKg,
      pieces: null,
      amount,
      unitPrice,
      total: round2(qtyKg * unitPrice),
      qtyLabel: fmtKg(qtyKg),
      unitPriceLabel: `${money(unitPrice)} / KG`,
      branchId: branch.id,
      branchName: branch.name,
    };
  }

  const qtyKg = Math.max(0, round3(value));
  return {
    id: lineId(product.id, mode),
    productId: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    categoryName: product.categoryName,
    imageKey: product.imageKey,
    emoji: product.emoji,
    mode,
    qtyKg,
    pieces: null,
    amount: null,
    unitPrice,
    total: round2(qtyKg * unitPrice),
    qtyLabel: fmtKg(qtyKg),
    unitPriceLabel: `${money(unitPrice)} / KG`,
    branchId: branch.id,
    branchName: branch.name,
  };
}

function rawValue(line: CartLine): number {
  if (line.mode === "amount") return line.amount ?? 0;
  return line.qtyKg ?? 0;
}

function recompute(line: CartLine, value: number): CartLine {
  if (line.mode === "amount") {
    const amount = Math.max(0, round2(value));
    const qtyKg = line.unitPrice > 0 ? round3(amount / line.unitPrice) : 0;
    return { ...line, amount, qtyKg, total: round2(qtyKg * line.unitPrice), qtyLabel: fmtKg(qtyKg) };
  }

  const qtyKg = Math.max(0, round3(value));
  return { ...line, qtyKg, total: round2(qtyKg * line.unitPrice), qtyLabel: fmtKg(qtyKg) };
}

function mergeLines(current: CartLine, incoming: CartLine): CartLine {
  // A different selection of the same product replaces the old quantities.
  const summed = recompute(current, rawValue(current) + rawValue(incoming));
  return { ...summed, amount: incoming.mode === "amount" ? (summed.amount ?? 0) : null };
}

function loadLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line): line is CartLine => {
      if (typeof line !== "object" || line === null) return false;
      const candidate = line as Partial<CartLine>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.productId === "string" &&
        typeof candidate.branchId === "string" &&
        typeof candidate.unitPrice === "number" &&
        (candidate.mode === "weight" || candidate.mode === "amount")
      );
    });
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadLines);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Private-mode storage failures must not break checkout.
    }
  }, [lines]);

  const addLine = useCallback((line: CartLine) => {
    setLines((prev) => {
      // A cart belongs to one branch; switching branch starts a new one.
      const base = prev.filter((existing) => existing.branchId === line.branchId);
      const index = base.findIndex((existing) => existing.id === line.id);
      if (index === -1) return [...base, line];
      return base.map((existing, i) => (i === index ? mergeLines(existing, line) : existing));
    });
  }, []);

  const updateLine = useCallback((id: string, value: number) => {
    setLines((prev) => prev.map((line) => (line.id === id ? recompute(line, value) : line)));
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => prev.filter((line) => line.id !== id));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartState>(() => {
    const first = lines[0];
    return {
      lines,
      branchId: first?.branchId ?? null,
      branchName: first?.branchName ?? null,
      count: lines.length,
      subtotal: round2(lines.reduce((sum, line) => sum + line.total, 0)),
      addLine,
      updateLine,
      removeLine,
      clear,
    };
  }, [lines, addLine, updateLine, removeLine, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
