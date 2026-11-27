import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch } from "../lib/apiClient";

export interface ExternalIntegration {
  id: string;
  tenantId: string;
  name: string;
  baseUrl: string;
  authType: "none" | "api_key" | "bearer" | "basic";
  authHeaderName: string | null;
  hasSecret: boolean;
  syncEvents: string[];
  active: boolean;
  lastSyncStatus: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalIntegrationInput {
  name: string;
  base_url: string;
  auth_type: "none" | "api_key" | "bearer" | "basic";
  auth_header_name?: string;
  secret_value?: string;
  sync_events: string[];
  active?: boolean;
}

/**
 * Le `public.external_integrations_safe` (view que mascara o segredo, RLS via
 * has_tenant_access dentro da própria view) direto pelo client do tenant; escreve via rotas do
 * backend (/api/integrations/external/*) porque a tabela base nega tudo pro cliente — o
 * segredo só passa pelo backend, nunca é lido de volta. FASE 5.4 do mandato
 * "Aurora + S.P.Y. + Integração com Sistemas Externos" (2026-09-19).
 */
export function useExternalIntegrations() {
  const { activeTenantId } = useAuth();
  const [integrations, setIntegrations] = useState<ExternalIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !activeTenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("external_integrations_safe")
      .select("*")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Supabase] external_integrations_safe select error:", error.message);
      setIntegrations([]);
      setLoading(false);
      return;
    }

    setIntegrations(
      (data ?? []).map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        baseUrl: row.base_url,
        authType: row.auth_type,
        authHeaderName: row.auth_header_name,
        hasSecret: row.has_secret,
        syncEvents: row.sync_events ?? [],
        active: row.active,
        lastSyncStatus: row.last_sync_status,
        lastSyncAt: row.last_sync_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    );
    setLoading(false);
  }, [activeTenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A empresa selecionada na tela: o servidor confere o acesso e age nela.
  const daEmpresa = `?tenantId=${activeTenantId ?? ""}`;

  const create = useCallback(
    async (input: ExternalIntegrationInput) => {
      setSaving(true);
      try {
        const res = await apiFetch(`/api/integrations/external${daEmpresa}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Falha ao criar conector." };
        await refresh();
        return { error: null };
      } finally {
        setSaving(false);
      }
    },
    [refresh, daEmpresa]
  );

  const update = useCallback(
    async (id: string, input: Partial<ExternalIntegrationInput>) => {
      setSaving(true);
      try {
        const res = await apiFetch(`/api/integrations/external/${id}${daEmpresa}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Falha ao atualizar conector." };
        await refresh();
        return { error: null };
      } finally {
        setSaving(false);
      }
    },
    [refresh, daEmpresa]
  );

  const remove = useCallback(
    async (id: string) => {
      setSaving(true);
      try {
        const res = await apiFetch(`/api/integrations/external/${id}${daEmpresa}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Falha ao excluir conector." };
        await refresh();
        return { error: null };
      } finally {
        setSaving(false);
      }
    },
    [refresh, daEmpresa]
  );

  const test = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/integrations/external/${id}/test${daEmpresa}`, { method: "POST" });
    return res.json();
  }, [daEmpresa]);

  return { integrations, loading, saving, refresh, create, update, remove, test };
}
