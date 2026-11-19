const ksh = new Intl.NumberFormat("en-KE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const wholeKsh = new Intl.NumberFormat("en-KE", {
  maximumFractionDigits: 0,
});

export function money(n: number): string {
  return `KSh ${ksh.format(round2(n))}`;
}

export function moneyPlain(n: number): string {
  return ksh.format(round2(n));
}

export function posMoney(n: number): string {
  const rounded = Math.sign(n) * Math.floor(Math.abs(n) + 0.5);
  return `KSh ${wholeKsh.format(rounded)}`;
}

export function posUnitPriceLabel(label: string): string {
  return label.replace(/KSh\s*-?[\d,]+(?:\.\d+)?/i, (amount) => {
    const value = Number(amount.replace(/^KSh\s*/i, "").replace(/,/g, ""));
    return posMoney(value);
  });
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** Format kg nicely: 0.5 -> "500 g", 1.25 -> "1.25 kg", 2 -> "2 kg" */
export function fmtKg(kg: number): string {
  if (kg < 1) return `${Math.round(kg * 1000)} g`;
  const v = round3(kg);
  return `${v} kg`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isToday(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function isYesterday(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return (
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate()
  );
}
