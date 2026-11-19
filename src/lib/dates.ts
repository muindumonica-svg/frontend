/**
 * The business calendar runs on the server's `APP_TIMEZONE`, not the browser's
 * clock. A till in Nairobi and a manager travelling abroad must still agree on
 * what "today" means, so presets are rendered in this zone before hitting the
 * API's inclusive `from`/`to` date filters.
 */
const BUSINESS_TIME_ZONE = import.meta.env.VITE_BUSINESS_TIMEZONE ?? "Africa/Nairobi";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` for the business day containing `date`. */
export function businessYmd(date: Date = new Date()): string {
  return dayFormat.format(date);
}

/** Shift a `YYYY-MM-DD` day by whole days without timezone drift. */
export function shiftYmd(ymd: string, days: number): string {
  const noonUtc = new Date(`${ymd}T12:00:00Z`);
  noonUtc.setUTCDate(noonUtc.getUTCDate() + days);
  return noonUtc.toISOString().slice(0, 10);
}
