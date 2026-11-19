import type { PublicProduct } from "@/types/api";

/** Storefront price prefix: settings store an ISO code, shoppers read "KSh". */
export function formatPrice(currency: string, amount: number): string {
  const prefix = currency.toUpperCase() === "KES" ? "KSh" : currency;
  const value = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 2 }).format(amount);
  return `${prefix} ${value}`;
}

/** Public price lines for a product; cost columns never reach the storefront. */
export function priceLines(currency: string, product: PublicProduct): string[] {
  const lines: string[] = [];
  if (product.pricePerKg !== null) lines.push(`${formatPrice(currency, product.pricePerKg)} / kg`);
  return lines;
}
