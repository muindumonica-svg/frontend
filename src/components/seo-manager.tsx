import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSeoMeta } from "@/api/hooks/public";
import { applySeo } from "@/lib/seo";

/**
 * Applies server-resolved metadata on every route change. The server does the
 * same for the initial HTML so crawlers see titles, canonicals and JSON-LD
 * without executing JavaScript.
 */
export function SeoManager() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const meta = useSeoMeta(pathname);

  useEffect(() => {
    if (meta.data) applySeo(meta.data);
  }, [meta.data]);

  return null;
}
