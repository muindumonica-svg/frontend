import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  SeoPageRecord,
  SeoRedirectRecord,
  SeoSettingsPayload,
} from "@/types/api";

const ROOT = ["seo-admin"] as const;

export interface SeoPageInput {
  path: string;
  title?: string | null;
  description?: string | null;
  robots?: string;
  ogImage?: string | null;
  canonical?: string | null;
}

export interface SeoRedirectInput {
  fromPath: string;
  toPath: string;
  statusCode?: number;
  active?: boolean;
}

export function useSeoAdmin() {
  return useQuery(
    queryOptions({
      queryKey: ROOT,
      queryFn: ({ signal }) => apiFetch<SeoSettingsPayload>("/seo/settings", { signal }),
    }),
  );
}

export function useUpdateSeoSettings() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: Record<string, string>) =>
      apiFetch<Record<string, string>>("/seo/settings", { method: "PUT", body: input }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: ROOT });
      client.invalidateQueries({ queryKey: ["public-seo"] });
    },
  });
}

export function useCreateSeoPage() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: SeoPageInput) =>
      apiFetch<SeoPageRecord>("/seo/pages", {
        method: "POST",
        body: {
          path: input.path,
          title: input.title ?? null,
          description: input.description ?? null,
          robots: input.robots ?? "index,follow",
          og_image: input.ogImage ?? null,
          canonical: input.canonical ?? null,
        },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: ROOT }),
  });
}

export function useUpdateSeoPage() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SeoPageInput> }) => {
      const body: Record<string, unknown> = {};
      if (input.path !== undefined) body.path = input.path;
      if (input.title !== undefined) body.title = input.title;
      if (input.description !== undefined) body.description = input.description;
      if (input.robots !== undefined) body.robots = input.robots;
      if (input.ogImage !== undefined) body.og_image = input.ogImage;
      if (input.canonical !== undefined) body.canonical = input.canonical;

      return apiFetch<SeoPageRecord>(`/seo/pages/${id}`, { method: "PUT", body });
    },
    onSettled: () => client.invalidateQueries({ queryKey: ROOT }),
  });
}

export function useDeleteSeoPage() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiFetch<{ message: string }>(`/seo/pages/${id}`, { method: "DELETE" }),
    onSettled: () => client.invalidateQueries({ queryKey: ROOT }),
  });
}

export function useCreateSeoRedirect() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: SeoRedirectInput) =>
      apiFetch<SeoRedirectRecord>("/seo/redirects", {
        method: "POST",
        body: {
          from_path: input.fromPath,
          to_path: input.toPath,
          status_code: input.statusCode ?? 301,
          active: input.active ?? true,
        },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: ROOT }),
  });
}

export function useUpdateSeoRedirect() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SeoRedirectInput> }) => {
      const body: Record<string, unknown> = {};
      if (input.fromPath !== undefined) body.from_path = input.fromPath;
      if (input.toPath !== undefined) body.to_path = input.toPath;
      if (input.statusCode !== undefined) body.status_code = input.statusCode;
      if (input.active !== undefined) body.active = input.active;

      return apiFetch<SeoRedirectRecord>(`/seo/redirects/${id}`, { method: "PUT", body });
    },
    onSettled: () => client.invalidateQueries({ queryKey: ROOT }),
  });
}

export function useDeleteSeoRedirect() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiFetch<{ message: string }>(`/seo/redirects/${id}`, { method: "DELETE" }),
    onSettled: () => client.invalidateQueries({ queryKey: ROOT }),
  });
}
