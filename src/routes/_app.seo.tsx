import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ExternalLink, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { usePermissions } from "@/api/hooks/auth";
import {
  useDeleteMarketingIntegration,
  useMarketingAdmin,
  useUpdateMarketingIntegration,
} from "@/api/hooks/marketing";
import {
  useCreateSeoPage,
  useCreateSeoRedirect,
  useDeleteSeoPage,
  useDeleteSeoRedirect,
  useSeoAdmin,
  useUpdateSeoPage,
  useUpdateSeoRedirect,
  useUpdateSeoSettings,
} from "@/api/hooks/seo";
import { ApiError, fieldError } from "@/lib/api";
import { money } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared";
import type { SeoPageRecord, SeoRedirectRecord } from "@/types/api";

export const Route = createFileRoute("/_app/seo")({
  component: SeoPage,
});

const ROBOTS_OPTIONS = [
  { value: "index,follow", label: "Index, follow" },
  { value: "index,nofollow", label: "Index, nofollow" },
  { value: "noindex,follow", label: "No index, follow" },
  { value: "noindex,nofollow", label: "No index, nofollow" },
];

const SETTING_FIELDS: { key: string; label: string; hint?: string; placeholder?: string }[] = [
  { key: "seoBaseUrl", label: "Public base URL", hint: "Canonical/sitemap origin, e.g. https://brathamatu.co.ke", placeholder: "https://example.co.ke" },
  { key: "seoTitle", label: "Default title", hint: "Used on the home page and wherever no override exists" },
  { key: "seoDescription", label: "Default description" },
  { key: "seoDefaultImage", label: "Default share image", hint: "Absolute URL or a path served from the storefront", placeholder: "/og-default.jpg" },
];

const BUSINESS_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "businessPhone", label: "Phone", placeholder: "+254 7xx xxx xxx" },
  { key: "businessEmail", label: "Email", placeholder: "hello@example.co.ke" },
  { key: "businessStreet", label: "Street", placeholder: "Market Road" },
  { key: "businessTown", label: "Town", placeholder: "Ruiru" },
  { key: "businessRegion", label: "Region", placeholder: "Kiambu" },
  { key: "businessCountry", label: "Country code", placeholder: "KE" },
  { key: "businessHours", label: "Opening hours", placeholder: "Mo-Sa 07:00-19:00" },
];

const SOCIAL_FIELDS: { key: string; label: string }[] = [
  { key: "socialFacebook", label: "Facebook page URL" },
  { key: "socialInstagram", label: "Instagram profile URL" },
  { key: "socialTiktok", label: "TikTok profile URL" },
  { key: "socialX", label: "X / Twitter profile URL" },
];

const GOOGLE_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "googlePlaceId", label: "Google Place ID", hint: "From Google Business Profile; required before Maps reviews can be linked" },
  { key: "googleBusinessProfileUrl", label: "Google Business Profile URL" },
  { key: "googleSiteVerification", label: "Search Console verification token" },
  { key: "googleAnalyticsId", label: "Analytics measurement ID", hint: "e.g. G-XXXXXXX. Nothing is sent until the tag snippet is enabled." },
  { key: "googleAdsId", label: "Google Ads ID", hint: "e.g. AW-XXXXXXXXX" },
  { key: "googleAdsConversionLabel", label: "Ads conversion label" },
  { key: "metaPixelId", label: "Meta Pixel ID" },
];

function SeoPage() {
  const permissions = usePermissions();
  const canWrite = permissions.includes("seo");

  const admin = useSeoAdmin();
  const updateSettings = useUpdateSeoSettings();

  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (admin.data) setForm(admin.data.settings);
  }, [admin.data]);

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    updateSettings.mutate(form, {
      onSuccess: () => toast.success("SEO settings saved"),
    });
  }

  if (admin.isPending) {
    return (
      <div className="pb-10">
        <PageHeader title="SEO & Discoverability" subtitle="Search, social and local discovery controls" />
        <div className="space-y-3 px-4 py-5 md:px-6">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (admin.isError) {
    return (
      <div className="pb-10">
        <PageHeader title="SEO & Discoverability" subtitle="Search, social and local discovery controls" />
        <div className="px-4 py-5 md:px-6">
          <div className="rounded-xl border p-5 text-sm text-muted-foreground">
            {admin.error instanceof ApiError && admin.error.status === 403
              ? "SEO settings are restricted to the Super Admin role."
              : `SEO settings did not load. ${admin.error.message}`}
          </div>
        </div>
      </div>
    );
  }

  const data = admin.data;
  const error = updateSettings.error;

  return (
    <div className="pb-10">
      <PageHeader
        title="SEO & Discoverability"
        subtitle="Search, social and local discovery controls"
        actions={
          <Button disabled={!canWrite || updateSettings.isPending} onClick={save}>
            <Save className="mr-1.5 h-4 w-4" /> Save defaults
          </Button>
        }
      />

      <div className="space-y-5 px-4 py-5 md:px-6">
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error.message}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HealthCard
            label="Base URL"
            value={data.settings.seoBaseUrl || "Not set"}
            ok={Boolean(data.settings.seoBaseUrl)}
            note={data.settings.seoBaseUrl ? "Canonicals and sitemap use this origin." : "Falls back to the request host. Set it before launch."}
          />
          <HealthCard label="Page overrides" value={String(data.pages.length)} ok note="Explicit titles/descriptions per public path." />
          <HealthCard label="Redirects" value={String(data.redirects.filter((r) => r.active).length)} ok={data.redirects.length === 0} note="Active rules served before the storefront shell." />
          <div className="rounded-xl border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Crawler files</p>
            <div className="mt-2 flex flex-col gap-1 text-sm">
              <a className="inline-flex items-center gap-1 text-primary hover:underline" href="/robots.txt" target="_blank" rel="noreferrer">
                robots.txt <ExternalLink className="h-3 w-3" />
              </a>
              <a className="inline-flex items-center gap-1 text-primary hover:underline" href="/sitemap.xml" target="_blank" rel="noreferrer">
                sitemap.xml <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        <Tabs defaultValue="defaults">
          <TabsList>
            <TabsTrigger value="defaults">Defaults & business</TabsTrigger>
            <TabsTrigger value="pages">Page overrides</TabsTrigger>
            <TabsTrigger value="redirects">Redirects</TabsTrigger>
            <TabsTrigger value="marketing">Marketing &amp; analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="defaults" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="Search defaults" body="Used when a page has no explicit override. Keep titles under 60 characters and descriptions under 160.">
                {SETTING_FIELDS.map((field) => (
                  <Field
                    key={field.key}
                    id={`seo-${field.key}`}
                    label={field.label}
                    hint={field.hint}
                    placeholder={field.placeholder}
                    value={form[field.key] ?? ""}
                    disabled={!canWrite}
                    error={fieldError(error, field.key)}
                    onChange={(value) => set(field.key, value)}
                    multiline={field.key === "seoDescription"}
                  />
                ))}
              </Section>

              <Section title="Business identity" body="Feeds the Organization, LocalBusiness and location structured data. Leave a field blank only if it is genuinely unknown.">
                <div className="grid grid-cols-2 gap-3">
                  {BUSINESS_FIELDS.map((field) => (
                    <Field
                      key={field.key}
                      id={`seo-${field.key}`}
                      label={field.label}
                      placeholder={field.placeholder}
                      value={form[field.key] ?? ""}
                      disabled={!canWrite}
                      error={fieldError(error, field.key)}
                      onChange={(value) => set(field.key, value)}
                    />
                  ))}
                </div>
              </Section>

              <Section title="Social profiles" body="Added to the Organization sameAs list and social previews.">
                <div className="grid gap-3">
                  {SOCIAL_FIELDS.map((field) => (
                    <Field
                      key={field.key}
                      id={`seo-${field.key}`}
                      label={field.label}
                      placeholder="https://"
                      value={form[field.key] ?? ""}
                      disabled={!canWrite}
                      error={fieldError(error, field.key)}
                      onChange={(value) => set(field.key, value)}
                    />
                  ))}
                </div>
              </Section>

              <Section title="Google & Meta identifiers" body="These are public identifiers, not secrets. Analytics and pixels do not load until their tags are enabled and verified — saving an ID alone sends nothing.">
                <div className="grid gap-3">
                  {GOOGLE_FIELDS.map((field) => (
                    <Field
                      key={field.key}
                      id={`seo-${field.key}`}
                      label={field.label}
                      hint={field.hint}
                      value={form[field.key] ?? ""}
                      disabled={!canWrite}
                      error={fieldError(error, field.key)}
                      onChange={(value) => set(field.key, value)}
                    />
                  ))}
                </div>
              </Section>
            </div>

            <SearchPreview
              title={form.seoTitle || "BrathaMatu — Fresh poultry, honestly priced"}
              description={
                form.seoDescription ||
                "Browse fresh poultry by weight or piece, check what is in stock at your branch, and order online for collection or delivery where available."
              }
              baseUrl={form.seoBaseUrl}
              path="/"
            />
          </TabsContent>

          <TabsContent value="pages">
            <PageOverrides surfaces={data.surfaces} pages={data.pages} canWrite={canWrite} />
          </TabsContent>

          <TabsContent value="redirects">
            <Redirects redirects={data.redirects} canWrite={canWrite} />
          </TabsContent>

          <TabsContent value="marketing">
            <Marketing canWrite={canWrite} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function HealthCard({ label, value, ok, note }: { label: string; value: string; ok: boolean; note: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate font-display text-lg font-bold ${ok ? "" : "text-destructive"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Section({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border p-5">
      <h2 className="font-display text-sm font-bold">{title}</h2>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">{body}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  placeholder,
  value,
  disabled,
  error,
  onChange,
  multiline,
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  disabled: boolean;
  error?: string | undefined;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea id={id} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1" rows={3} />
      ) : (
        <Input id={id} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1" />
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SearchPreview({ title, description, baseUrl, path }: { title: string; description: string; baseUrl: string; path: string }) {
  const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
  return (
    <section className="rounded-xl border p-5">
      <h2 className="mb-3 font-display text-sm font-bold">Search result preview</h2>
      <div className="max-w-2xl rounded-lg border bg-background p-4">
        <p className="truncate text-xs text-muted-foreground">{origin}{path}</p>
        <p className="mt-0.5 line-clamp-2 text-lg text-[#1a0dab]">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Title {title.length}/60 characters · description {description.length}/160. This is a preview, not a Google ranking promise.
      </p>
    </section>
  );
}

function PageOverrides({
  surfaces,
  pages,
  canWrite,
}: {
  surfaces: { path: string; label: string }[];
  pages: SeoPageRecord[];
  canWrite: boolean;
}) {
  const create = useCreateSeoPage();
  const update = useUpdateSeoPage();
  const remove = useDeleteSeoPage();

  const [path, setPath] = useState(surfaces[0]?.path ?? "/");
  const existing = useMemo(() => pages.find((page) => page.path === path), [pages, path]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [robots, setRobots] = useState("index,follow");
  const [ogImage, setOgImage] = useState("");
  const [canonical, setCanonical] = useState("");

  useEffect(() => {
    setTitle(existing?.title ?? "");
    setDescription(existing?.description ?? "");
    setRobots(existing?.robots ?? "index,follow");
    setOgImage(existing?.ogImage ?? "");
    setCanonical(existing?.canonical ?? "");
  }, [existing, path]);

  const mutation = existing ? update : create;
  const error = mutation.error;

  function save() {
    const input = {
      path,
      title: title.trim() || null,
      description: description.trim() || null,
      robots,
      ogImage: ogImage.trim() || null,
      canonical: canonical.trim() || null,
    };

    if (existing) {
      update.mutate(
        { id: existing.id, input },
        { onSuccess: () => toast.success("Page override saved") },
      );
    } else {
      create.mutate(input, { onSuccess: () => toast.success("Page override created") });
    }
  }

  function reset() {
    if (!existing) return;
    remove.mutate(existing.id, {
      onSuccess: () => toast.success("Override removed, defaults apply again"),
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <section className="rounded-xl border p-5">
          <h2 className="font-display text-sm font-bold">Choose a page</h2>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            These paths are real, indexable surfaces resolved from your catalog, locations and storefront routes.
          </p>
          <Label htmlFor="seo-page-path">Path</Label>
          <Input
            id="seo-page-path"
            value={path}
            onChange={(e) => setPath(e.target.value.trim() || "/")}
            className="mt-1"
            disabled={!canWrite}
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {surfaces.map((surface) => {
              const overridden = pages.some((page) => page.path === surface.path);
              return (
                <button
                  key={surface.path}
                  type="button"
                  onClick={() => setPath(surface.path)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    surface.path === path ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                >
                  {surface.label}
                  {overridden && <span className="ml-1 opacity-70">•</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">{existing ? "Edit override" : "New override"}</h2>
            {existing && (
              <Button variant="outline" size="sm" disabled={!canWrite || remove.isPending} onClick={reset}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset to defaults
              </Button>
            )}
          </div>

          {error && (
            <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error.message}
            </p>
          )}

          <div className="space-y-3">
            <Field
              id="seo-page-title"
              label="Title"
              value={title}
              disabled={!canWrite}
              error={fieldError(error, "title")}
              onChange={setTitle}
            />
            <Field
              id="seo-page-description"
              label="Meta description"
              hint="Leave blank to inherit the default description."
              value={description}
              disabled={!canWrite}
              error={fieldError(error, "description")}
              onChange={setDescription}
              multiline
            />
            <div>
              <Label htmlFor="seo-page-robots">Robots</Label>
              <select
                id="seo-page-robots"
                value={robots}
                disabled={!canWrite}
                onChange={(e) => setRobots(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {ROBOTS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Private paths (cart, checkout, account, staff) always stay noindex regardless of this setting.
              </p>
            </div>
            <Field
              id="seo-page-image"
              label="Social image URL"
              placeholder="/og-default.jpg"
              value={ogImage}
              disabled={!canWrite}
              error={fieldError(error, "og_image")}
              onChange={setOgImage}
            />
            <Field
              id="seo-page-canonical"
              label="Canonical URL"
              hint="Only set this when the same content is reachable at another URL."
              placeholder="https://"
              value={canonical}
              disabled={!canWrite}
              error={fieldError(error, "canonical")}
              onChange={setCanonical}
            />
            <Button disabled={!canWrite || create.isPending || update.isPending} onClick={save}>
              <Save className="mr-1.5 h-4 w-4" /> {existing ? "Save override" : "Create override"}
            </Button>
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <SearchPreview
          title={title || "Default title applies"}
          description={description || "Default description applies"}
          baseUrl=""
          path={path}
        />
        <section className="rounded-xl border p-5">
          <h2 className="font-display text-sm font-bold">Overrides</h2>
          {pages.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No page overrides yet. Every indexable page uses its generated title and description.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {pages.map((page) => (
                <li key={page.id} className="flex items-center justify-between gap-2">
                  <button type="button" className="truncate text-left hover:underline" onClick={() => setPath(page.path)}>
                    {page.path}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={`Remove override for ${page.path}`}
                    disabled={!canWrite || remove.isPending}
                    onClick={() => remove.mutate(page.id, { onSuccess: () => toast.success("Override removed") })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Redirects({ redirects, canWrite }: { redirects: SeoRedirectRecord[]; canWrite: boolean }) {
  const create = useCreateSeoRedirect();
  const update = useUpdateSeoRedirect();
  const remove = useDeleteSeoRedirect();

  const [fromPath, setFromPath] = useState("");
  const [toPath, setToPath] = useState("");
  const [statusCode, setStatusCode] = useState("301");

  function add() {
    create.mutate(
      { fromPath, toPath, statusCode: Number(statusCode) },
      {
        onSuccess: () => {
          toast.success("Redirect added");
          setFromPath("");
          setToPath("");
          setStatusCode("301");
        },
      },
    );
  }

  const error = create.error;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border p-5">
        <h2 className="font-display text-sm font-bold">Add a redirect</h2>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          Old URLs answer with a server-side redirect before the storefront loads. Use 301 for permanent moves, 302 for temporary ones.
        </p>
        {error && (
          <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error.message}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px_auto] sm:items-end">
          <div>
            <Label htmlFor="seo-from">From path</Label>
            <Input id="seo-from" value={fromPath} onChange={(e) => setFromPath(e.target.value)} placeholder="/old-page" className="mt-1" disabled={!canWrite} />
            {fieldError(error, "from_path") && <p className="mt-1 text-xs text-destructive">{fieldError(error, "from_path")}</p>}
          </div>
          <div>
            <Label htmlFor="seo-to">To path or URL</Label>
            <Input id="seo-to" value={toPath} onChange={(e) => setToPath(e.target.value)} placeholder="/shop" className="mt-1" disabled={!canWrite} />
            {fieldError(error, "to_path") && <p className="mt-1 text-xs text-destructive">{fieldError(error, "to_path")}</p>}
          </div>
          <div>
            <Label htmlFor="seo-code">Status</Label>
            <select
              id="seo-code"
              value={statusCode}
              disabled={!canWrite}
              onChange={(e) => setStatusCode(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="301">301</option>
              <option value="302">302</option>
              <option value="307">307</option>
              <option value="308">308</option>
            </select>
          </div>
          <Button disabled={!canWrite || create.isPending || !fromPath.trim() || !toPath.trim()} onClick={add}>
            <Plus className="mr-1.5 h-4 w-4" /> Add
          </Button>
        </div>
      </section>

      <section className="rounded-xl border">
        <div className="border-b px-5 py-3">
          <h2 className="font-display text-sm font-bold">All redirects</h2>
        </div>
        {redirects.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No redirects configured.</p>
        ) : (
          <ul className="divide-y">
            {redirects.map((redirect) => (
              <li key={redirect.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="font-mono text-xs">{redirect.fromPath}</span>
                <span className="text-muted-foreground">→</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{redirect.toPath}</span>
                <span className="rounded border px-1.5 py-0.5 text-[11px] font-semibold">{redirect.statusCode}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Active</span>
                  <Switch
                    checked={redirect.active}
                    disabled={!canWrite || update.isPending}
                    onCheckedChange={(checked) =>
                      update.mutate({ id: redirect.id, input: { active: checked } })
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Delete redirect ${redirect.fromPath}`}
                  disabled={!canWrite || remove.isPending}
                  onClick={() => remove.mutate(redirect.id, { onSuccess: () => toast.success("Redirect removed") })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Marketing({ canWrite }: { canWrite: boolean }) {
  const admin = useMarketingAdmin();
  const update = useUpdateMarketingIntegration();
  const remove = useDeleteMarketingIntegration();

  const integration = admin.data?.summary.integrations.find((row) => row.provider === "meta_capi");
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState("");
  const [testCode, setTestCode] = useState("");

  useEffect(() => {
    setEnabled(Boolean(integration?.enabled));
    setTestCode(integration?.testEventCode ?? "");
  }, [integration?.enabled, integration?.testEventCode, integration?.updatedAt]);

  if (admin.isPending) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  if (admin.isError) {
    return (
      <div className="rounded-xl border p-5 text-sm text-muted-foreground">
        Marketing data did not load. {admin.error.message}
      </div>
    );
  }

  const summary = admin.data.summary;
  const config = admin.data.publicConfig;
  const events = Object.entries(summary.events).sort((a, b) => b[1] - a[1]);
  const totalEvents = events.reduce((sum, [, count]) => sum + count, 0);
  const error = update.error;

  function save() {
    update.mutate(
      {
        provider: "meta_capi",
        enabled,
        accessToken: token.trim() || undefined,
        testEventCode: testCode.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Meta Conversions API settings saved");
          setToken("");
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border p-5">
        <h2 className="font-display text-sm font-bold">Last {summary.days} days</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Counted from recorded first-party events and completed online orders. Nothing here is estimated.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="Recorded events" value={String(totalEvents)} />
          <MiniStat label="Page views" value={String(summary.events.page_view ?? 0)} />
          <MiniStat label="Online orders" value={String(summary.onlineOrders)} />
          <MiniStat label="Online revenue" value={money(summary.onlineRevenue)} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {summary.consentedOrders} of those orders were placed with marketing consent.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border p-5">
          <h2 className="font-display text-sm font-bold">Events by name</h2>
          {events.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No events recorded yet. Events only arrive from visitors who accepted analytics.
            </p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {events.map(([name, count]) => (
                <li key={name} className="flex items-center justify-between py-2">
                  <span className="capitalize">{name.replace(/_/g, " ")}</span>
                  <span className="font-semibold">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border p-5">
          <h2 className="font-display text-sm font-bold">Campaign attribution</h2>
          {summary.attribution.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No campaign-tagged events yet. UTM parameters are captured on landing and attached to orders at checkout.
            </p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {summary.attribution.map((row) => (
                <li key={row.source} className="flex items-center justify-between py-2">
                  <span className="font-mono text-xs">{row.source}</span>
                  <span className="font-semibold">{row.events}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border p-5">
        <h2 className="font-display text-sm font-bold">Active tags</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Identifiers are configured under Defaults &amp; business. Tags load only after a visitor consents.
        </p>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <TagRow label="Google Analytics 4" value={config.googleAnalyticsId || "Not configured"} />
          <TagRow label="Meta Pixel" value={config.metaPixelId || "Not configured"} />
          <TagRow
            label="Meta Conversions API"
            value={config.serverSideMeta ? (integration?.enabled ? "Enabled" : "Configured, disabled") : "Not configured"}
          />
        </ul>
      </section>

      <section className="rounded-xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-bold">Meta Conversions API</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Sends a deduplicated Purchase for completed online orders that had consent. The access token is stored
              encrypted and is never returned to this page or any API response.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Enabled</span>
            <Switch checked={enabled} disabled={!canWrite || update.isPending} onCheckedChange={setEnabled} />
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error.message}
          </p>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div>
            <Label htmlFor="meta-token">
              {integration?.configured ? "Replace access token" : "Access token"}
            </Label>
            <Input
              id="meta-token"
              type="password"
              autoComplete="new-password"
              value={token}
              disabled={!canWrite}
              placeholder={integration?.configured ? "Leave blank to keep the stored token" : "Paste the CAPI token"}
              onChange={(event) => setToken(event.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {integration?.configured
                ? "A token is already stored. It is never displayed."
                : "Generate this in Meta Events Manager. Use a system user token, not a personal one."}
            </p>
          </div>
          <div>
            <Label htmlFor="meta-test-code">Test event code (optional)</Label>
            <Input
              id="meta-test-code"
              value={testCode}
              disabled={!canWrite}
              placeholder="TEST12345"
              onChange={(event) => setTestCode(event.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Only used while validating in Events Manager. Leave blank to clear a stored code before launch.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={!canWrite || update.isPending} onClick={save}>
            <Save className="mr-1.5 h-4 w-4" /> Save integration
          </Button>
          <Button
            variant="outline"
            disabled={!canWrite || remove.isPending || !integration}
            onClick={() => remove.mutate("meta_capi", { onSuccess: () => toast.success("Integration removed") })}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Remove
          </Button>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-bold">{value}</p>
    </div>
  );
}

function TagRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-medium">{value}</p>
    </li>
  );
}
