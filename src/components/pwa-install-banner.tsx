import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const INSTALLED_KEY = "brathamatu.install.installed";
const DISMISSED_KEY = "brathamatu.install.dismissedAt";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 2500;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode: the banner simply reappears next visit.
  }
}

function isInstalledOrStandalone(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isSnoozed(): boolean {
  const at = Number(readFlag(DISMISSED_KEY));
  return Number.isFinite(at) && Date.now() - at < SNOOZE_MS;
}

/**
 * iOS and Firefox Android do not expose `beforeinstallprompt`; Chromium also
 * gets menu instructions when the browser does not provide the prompt event.
 */
function manualInstallMode(): "none" | "browser" | "firefox-android" | "ios" {
  const ua = window.navigator.userAgent;
  const isAppleMobile =
    /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (isAppleMobile) return "ios";
  if (/Android/i.test(ua) && /; wv\)/i.test(ua)) return "none";
  if (/Android/i.test(ua) && /Firefox\//i.test(ua)) return "firefox-android";
  if (/(Chrome|Chromium|Edg)\//i.test(ua)) return "browser";
  return "none";
}

/**
 * A dismissible install banner with native and platform-specific install guidance.
 *
 * The copy deliberately does not promise offline selling: the service worker
 * caches the shell only, while stock, prices and payments always come from the
 * server.
 */
export function InstallBanner() {
  const [manual, setManual] = useState<"none" | "browser" | "firefox-android" | "ios">("none");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [consentOffset, setConsentOffset] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);
  const showTimer = useRef<number | null>(null);

  const hide = useCallback(() => {
    if (showTimer.current !== null) window.clearTimeout(showTimer.current);
    showTimer.current = null;
    setVisible(false);
  }, []);

  useEffect(() => {
    if (isInstalledOrStandalone() || readFlag(INSTALLED_KEY) === "1" || isSnoozed()) return;

    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      showTimer.current = window.setTimeout(() => {
        if (!cancelled) setVisible(true);
      }, SHOW_DELAY_MS);
    };

    const onInstalled = () => {
      writeFlag(INSTALLED_KEY, "1");
      setInstallPrompt(null);
      hide();
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setManual("none");
      reveal();
    };

    const onDisplayMode = () => {
      if (isInstalledOrStandalone()) {
        writeFlag(INSTALLED_KEY, "1");
        hide();
      }
    };

    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    standaloneQuery.addEventListener("change", onDisplayMode);

    const manualMode = manualInstallMode();
    if (manualMode !== "none") {
      setManual(manualMode);
      reveal();
    }

    return () => {
      cancelled = true;
      if (showTimer.current !== null) window.clearTimeout(showTimer.current);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      standaloneQuery.removeEventListener("change", onDisplayMode);
    };
  }, [hide]);

  // Stack above the analytics consent banner instead of covering it. Its height
  // changes with the viewport, so measure instead of guessing a fixed offset.
  useEffect(() => {
    let observed: HTMLElement | null = null;
    const sizes =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
    const measure = () => {
      const consent = document.querySelector<HTMLElement>("[data-consent-banner]");
      if (consent !== observed) {
        if (observed) sizes?.unobserve(observed);
        if (consent) sizes?.observe(consent);
        observed = consent;
      }
      setConsentOffset(
        consent ? Math.ceil(window.innerHeight - consent.getBoundingClientRect().top + 12) : null,
      );
    };
    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(measure);
    measure();
    observer?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer?.disconnect();
      sizes?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  function dismiss() {
    writeFlag(DISMISSED_KEY, String(Date.now()));
    hide();
  }

  async function install() {
    if (!installPrompt || installing) return;
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        writeFlag(INSTALLED_KEY, "1");
        hide();
      } else {
        setManual(manualInstallMode());
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The install prompt could not be opened.",
      );
    } finally {
      setInstalling(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Install BrathaMatu"
      className="fixed inset-x-3 z-50 mx-auto max-w-md rounded-2xl border bg-background/95 p-3 shadow-elegant backdrop-blur supports-[backdrop-filter]:bg-background/85"
      style={{
        bottom:
          consentOffset === null
            ? "calc(0.75rem + env(safe-area-inset-bottom))"
            : `${consentOffset}px`,
      }}
    >
      <div className="flex items-start gap-3">
        <img
          src="/pwa/icon-96.png"
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install BrathaMatu</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {installPrompt
              ? "Install BrathaMatu on this device for quick, full-screen access."
              : manual === "ios"
                ? "Tap Share, then choose “Add to Home Screen” to install BrathaMatu."
                : manual === "firefox-android"
                  ? "This browser does not provide one-tap installation. Open BrathaMatu in Chrome to install it."
                  : manual === "browser"
                    ? "Your browser has not enabled one-tap installation yet. You can keep using BrathaMatu in this tab."
                    : "Add the till to your home screen for full-screen use and faster launches. Live stock and payments still need a connection."}
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss install banner"
          className="-mr-1 -mt-1 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2.5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-9" onClick={dismiss}>
          Not now
        </Button>
        {installPrompt && (
          <Button size="sm" className="h-9" disabled={installing} onClick={() => void install()}>
            {installing ? "Opening…" : "Install"}
          </Button>
        )}
      </div>
    </div>
  );
}
