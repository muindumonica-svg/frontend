import type { SeoMeta } from "@/types/api";

const MANAGED = "data-seo";

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  const selector = `meta[${attribute}="${key}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute(MANAGED, "1");
  element.setAttribute("content", content);
}

function upsertCanonical(href: string | null) {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (href === null) {
    existing?.remove();
    return;
  }

  const element = existing ?? document.createElement("link");
  element.setAttribute("rel", "canonical");
  element.setAttribute("href", href);
  element.setAttribute(MANAGED, "1");

  if (!existing) document.head.appendChild(element);
}

function replaceJsonLd(graphs: Record<string, unknown>[]) {
  document.head.querySelectorAll('script[data-seo-jsonld="1"]').forEach((node) => node.remove());

  for (const graph of graphs) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-seo-jsonld", "1");
    script.textContent = JSON.stringify(graph);
    document.head.appendChild(script);
  }
}

/** Applies server-resolved metadata to the document head (idempotent). */
export function applySeo(meta: SeoMeta) {
  document.title = meta.title;
  document.documentElement.lang = "en";

  upsertMeta("name", "description", meta.description);
  upsertMeta("name", "robots", meta.robots);
  upsertCanonical(meta.canonical);

  upsertMeta("property", "og:site_name", meta.siteName);
  upsertMeta("property", "og:type", meta.type);
  upsertMeta("property", "og:title", meta.title);
  upsertMeta("property", "og:description", meta.description);
  upsertMeta("property", "og:image", meta.image);
  upsertMeta("property", "og:locale", "en_KE");

  if (meta.canonical) {
    upsertMeta("property", "og:url", meta.canonical);
  } else {
    document.head.querySelector('meta[property="og:url"]')?.remove();
  }

  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "twitter:title", meta.title);
  upsertMeta("name", "twitter:description", meta.description);
  upsertMeta("name", "twitter:image", meta.image);

  replaceJsonLd(meta.jsonLd);
}
