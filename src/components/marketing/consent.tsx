import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { usePublicMarketingConfig } from "@/api/hooks/marketing";
import { Button } from "@/components/ui/button";
import {
  CONSENT_EVENT,
  captureUtm,
  readConsent,
  readUtm,
  setConsent,
  trackEvent,
  type ConsentChoice,
} from "@/lib/marketing";

type Fbq = ((...args: unknown[]) => void) & {
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: Fbq;
  }
}

const loadedGa = new Set<string>();
const loadedPixels = new Set<string>();

function loadGa4(id: string) {
  if (loadedGa.has(id)) return;
  loadedGa.add(id);

  const tag = document.createElement("script");
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(tag);

  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", id, { anonymize_ip: true });
}

function loadMetaPixel(id: string) {
  if (loadedPixels.has(id)) return;
  loadedPixels.add(id);

  if (!window.fbq) {
    const fbq = ((...args: unknown[]) => {
      fbq.queue?.push(args);
    }) as Fbq;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;

    const tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(tag);
  }

  const fbq = window.fbq;
  fbq("init", id);
  fbq("track", "PageView");
}

/**
 * Loads third-party tags and records first-party page views only after the
 * visitor explicitly consented. Nothing here sends data on its own.
 */
export function MarketingTags() {
  const config = usePublicMarketingConfig();
  const [consent, setConsentState] = useState<ConsentChoice | null>(() => readConsent());
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const lastTaggedPath = useRef(pathname);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ConsentChoice>).detail;
      setConsentState(detail === "granted" || detail === "denied" ? detail : readConsent());
    };
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  useEffect(() => {
    captureUtm();
  }, []);

  useEffect(() => {
    if (consent !== "granted" || !config.data) return;

    if (config.data.googleAnalyticsId) loadGa4(config.data.googleAnalyticsId);
    if (config.data.metaPixelId) loadMetaPixel(config.data.metaPixelId);
  }, [consent, config.data]);

  useEffect(() => {
    if (consent !== "granted") return;

    void trackEvent({
      name: "page_view",
      path: pathname,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      utm: readUtm() ?? undefined,
    });
  }, [consent, pathname]);

  // Initial tag page views are sent by the loader; later SPA navigations are not.
  useEffect(() => {
    if (consent !== "granted" || lastTaggedPath.current === pathname) return;
    lastTaggedPath.current = pathname;

    window.gtag?.("event", "page_view", { page_path: pathname });
    window.fbq?.("track", "PageView");
  }, [consent, pathname]);

  return null;
}

export function ConsentBanner() {
  const [choice, setChoice] = useState<ConsentChoice | null>(() => readConsent());

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ConsentChoice>).detail;
      setChoice(detail === "granted" || detail === "denied" ? detail : readConsent());
    };
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  if (choice !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      data-consent-banner
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-2xl rounded-xl border bg-background/95 p-4 shadow-elegant backdrop-blur sm:inset-x-auto sm:left-4 sm:right-auto"
    >
      <p className="text-sm font-semibold">A say in your data</p>
      <p className="mt-1 text-xs text-muted-foreground">
        We use first-party analytics and, if you allow it, Google Analytics and the Meta Pixel to understand which
        pages help customers. Declining means no analytics tags load — the shop works exactly the same. See the{" "}
        <Link to="/faq" className="font-medium text-foreground underline">
          FAQ
        </Link>{" "}
        for how ordering and payment work.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setConsent("granted")}>
          Allow analytics
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConsent("denied")}>
          Decline
        </Button>
      </div>
    </div>
  );
}
