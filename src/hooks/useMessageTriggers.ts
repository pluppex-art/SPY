import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/apiClient";
import { useAuth } from "../contexts/AuthContext";

export interface LeadSnapshot {
  id: string;
  nome: string;
  telefone: string;
}

export type MessageTriggerStatus =
  | "pendente_interpretacao"
  | "aguardando_confirmacao"
  | "aprovado"
  | "executado"
  | "rejeitado"
  | "erro";

export interface MessageTrigger {
  id: string;
  descricao: string;
  status: MessageTriggerStatus;
  resumoInterpretado: string | null;
  mensagemSugerida: string | null;
  leadsEncontrados: LeadSnapshot[];
  erro: string | null;
  createdAt: string;
}

/**
 * Le/escreve `public.tenant_message_triggers` — gatilhos de mensagem em linguagem natural
 * (ver migration 20260930_tenant_message_triggers e server/messageTriggers.ts). A interpretação
 * (IA lendo a descrição, montando lista de leads + mensagem) e a execução (Júlia mandando de
 * verdade) rodam no n8n; este hook só cria a linha, dispara essas duas chamadas via backend, e
 * lê o resultado que o n8n grava de volta. NENHUMA mensagem real sai sem o passo de aprovar.
 */
export function useMessageTriggers() {
  const { activeTenantId } = useAuth();
  const [triggers, setTriggers] = useState<MessageTrigger[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase || !activeTenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("tenant_message_triggers")
      .select("id, descricao, status, resumo_interpretado, mensagem_sugerida, leads_encontrados, erro, created_at")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Supabase] tenant_message_triggers select error:", error.message);
      setTriggers([]);
      setLoading(false);
      return;
    }

    setTriggers(
      (data ?? []).map((row: any) => ({
        id: row.id,
        descricao: row.descricao,
        status: row.status,
        resumoInterpretado: row.resumo_interpretado,
        mensagemSugerida: row.mensagem_sugerida,
        leadsEncontrados: Array.isArray(row.leads_encontrados) ? row.leads_encontrados : [],
        erro: row.erro,
        createdAt: row.created_at,
      }))
    );
    setLoading(false);
  }, [activeTenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const criar = useCallback(
    async (descricao: string) => {
      if (!supabase || !activeTenantId) return { error: "Sem empresa ativa" };
      const { data, error } = await supabase
        .from("tenant_message_triggers")
        .insert({ tenant_id: activeTenantId, descricao })
        .select("id")
        .single();
      if (error) return { error: error.message };
      // A linha já existe (status pendente_interpretacao) — mesmo se essa chamada falhar,
      // o usuário já vê o gatilho na lista como "processando" e pode tentar de novo depois.
      await apiFetch(`/api/message-triggers/${data.id}/interpretar`, { method: "POST" }).catch(() => {});
      await refresh();
      return { error: null };
    },
    [activeTenantId, refresh]
  );

  const aprovar = useCallback(
    async (id: string) => {
      if (!supabase) return { error: "Sem conexão" };
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("tenant_message_triggers")
        .update({ status: "aprovado", aprovado_por: user?.id ?? null, aprovado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) return { error: error.message };
      const res = await apiFetch(`/api/message-triggers/${id}/executar`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      await refresh();
      if (!res.ok) return { error: body?.error || "Falha ao executar o envio." };
      return { error: null };
    },
    [refresh]
  );

  const rejeitar = useCallback(
    async (id: string) => {
      if (!supabase) return { error: "Sem conexão" };
      const { error } = await supabase.from("tenant_message_triggers").update({ status: "rejeitado" }).eq("id", id);
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [refresh]
  );

  const remover = useCallback(
    async (id: string) => {
      if (!supabase) return;
      await supabase.from("tenant_message_triggers").delete().eq("id", id);
      await refresh();
    },
    [refresh]
  );

  return { triggers, loading, criar, aprovar, rejeitar, remover, refresh };
}
