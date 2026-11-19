import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  MarketingAdminPayload,
  MarketingIntegrationStatus,
  PublicMarketingConfig,
} from "@/types/api";

const ROOT = ["marketing-admin"] as const;
const PUBLIC = ["public-marketing"] as const;

export function useMarketingAdmin() {
  return useQuery(
    queryOptions({
      queryKey: ROOT,
      queryFn: ({ signal }) => apiFetch<MarketingAdminPayload>("/marketing", { signal }),
    }),
  );
}

export function usePublicMarketingConfig() {
  return useQuery(
    queryOptions({
      queryKey: PUBLIC,
      queryFn: ({ signal }) => apiFetch<PublicMarketingConfig>("/public/marketing", { signal }),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    }),
  );
}

export interface IntegrationInput {
  provider: string;
  enabled: boolean;
  accessToken?: string | undefined;
  testEventCode?: string | undefined;
}

export function useUpdateMarketingIntegration() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, enabled, accessToken, testEventCode }: IntegrationInput) =>
      apiFetch<{ integrations: MarketingIntegrationStatus[] }>(`/marketing/integrations/${provider}`, {
        method: "PUT",
        body: {
          enabled,
          ...(accessToken ? { access_token: accessToken } : {}),
          ...(testEventCode !== undefined ? { test_event_code: testEventCode } : {}),
        },
      }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: ROOT });
      client.invalidateQueries({ queryKey: PUBLIC });
    },
  });
}

export function useDeleteMarketingIntegration() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (provider: string) =>
      apiFetch<{ integrations: MarketingIntegrationStatus[] }>(`/marketing/integrations/${provider}`, {
        method: "DELETE",
      }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: ROOT });
      client.invalidateQueries({ queryKey: PUBLIC });
    },
  });
}
