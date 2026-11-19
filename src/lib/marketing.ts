import { apiFetch, csrfReady } from "@/lib/api";
import type { MarketingEventInput, UtmParams } from "@/types/api";

const CONSENT_KEY = "brathamatu.consent.v1";
const UTM_KEY = "brathamatu.utm.v1";
const UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const CONSENT_EVENT = "brathamatu:consent";

export type ConsentChoice = "granted" | "denied";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readConsent(): ConsentChoice | null {
  const value = storage()?.getItem(CONSENT_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

export function hasMarketingConsent(): boolean {
  return readConsent() === "granted";
}

export function setConsent(choice: ConsentChoice): void {
  storage()?.setItem(CONSENT_KEY, choice);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
}

/** Clears the stored choice so the banner asks again. Callers reload the page. */
export function resetConsent(): void {
  storage()?.removeItem(CONSENT_KEY);
}

const UTM_MAP: Record<string, keyof UtmParams> = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  utm_term: "term",
  utm_content: "content",
};

/** Stores first-touch campaign parameters for 30 days. */
export function captureUtm(): UtmParams | null {
  const params = new URLSearchParams(window.location.search);
  const utm: UtmParams = {};
  let found = false;

  for (const [param, key] of Object.entries(UTM_MAP)) {
    const value = params.get(param)?.trim();
    if (value) {
      utm[key] = value.slice(0, 191);
      found = true;
    }
  }

  if (!found) return readUtm();

  storage()?.setItem(UTM_KEY, JSON.stringify({ at: Date.now(), utm }));
  return utm;
}

export function readUtm(): UtmParams | null {
  const raw = storage()?.getItem(UTM_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { at?: number; utm?: UtmParams };
    if (!parsed.at || Date.now() - parsed.at > UTM_TTL_MS || !parsed.utm) {
      storage()?.removeItem(UTM_KEY);
      return null;
    }
    return parsed.utm;
  } catch {
    storage()?.removeItem(UTM_KEY);
    return null;
  }
}

export function clearUtm(): void {
  storage()?.removeItem(UTM_KEY);
}

export function newEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Records a first-party event only after the visitor consented. Failures are
 * swallowed because analytics must never interrupt shopping.
 */
export async function trackEvent(
  input: Omit<MarketingEventInput, "eventId" | "consent">,
): Promise<void> {
  if (!hasMarketingConsent()) return;

  try {
    await csrfReady();
    await apiFetch("/public/marketing/events", {
      method: "POST",
      body: { ...input, eventId: newEventId(), consent: true },
    });
  } catch {
    // Analytics is best-effort.
  }
}
