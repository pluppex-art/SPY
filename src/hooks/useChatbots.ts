import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { DEFAULT_SETTINGS, type ChatbotFlow, type ChatbotSettings, type SessionStatus } from "../lib/chatbot/types";

export interface Chatbot {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  active: boolean;
  whatsappSession: string | null;
  flow: ChatbotFlow;
  settings: ChatbotSettings;
  funilId: string | null;
  etapaId: string | null;
  updatedAt: string;
}

export interface ChatbotConversation {
  id: string;
  chatbotId: string;
  phone: string;
  status: SessionStatus;
  currentNode: string | null;
  vars: Record<string, string>;
  lastInputAt: string;
}

const EMPTY_FLOW: ChatbotFlow = { start: null, nodes: {} };

function mapBot(row: any): Chatbot {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? "",
    active: !!row.active,
    whatsappSession: row.whatsapp_session ?? null,
    flow: row.flow && typeof row.flow === "object" ? { start: row.flow.start ?? null, nodes: row.flow.nodes ?? {} } : EMPTY_FLOW,
    settings: { ...DEFAULT_SETTINGS, ...(row.settings ?? {}) },
    funilId: row.funil_id ?? null,
    etapaId: row.etapa_id ?? null,
    updatedAt: row.updated_at,
  };
}

export interface ChatbotPatch {
  name?: string;
  description?: string;
  active?: boolean;
  flow?: ChatbotFlow;
  settings?: ChatbotSettings;
  funilId?: string | null;
  etapaId?: string | null;
}

/**
 * Lê/escreve `chatbots` e `chatbot_sessions` direto (RLS por tenant: qualquer usuário lê, só admin
 * do tenant edita — ver supabase/migrations/20261119_chatbot_regras.sql). A execução do bot é do
 * workflow n8n compartilhado "[SPY] Chatbot - Motor"; este hook só gerencia a configuração.
 */
export function useChatbots() {
  const { activeTenantId } = useAuth();
  const [bots, setBots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !activeTenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from("chatbots")
      .select("*")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: true });
    if (err) {
      console.error("[Supabase] chatbots select error:", err.message);
      setError(err.message);
      setBots([]);
    } else {
      setError(null);
      setBots((data ?? []).map(mapBot));
    }
    setLoading(false);
  }, [activeTenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: { name: string; flow: ChatbotFlow }): Promise<{ bot?: Chatbot; error?: string }> => {
      if (!supabase || !activeTenantId) return { error: "Sem empresa ativa." };
      const { data, error: err } = await supabase
        .from("chatbots")
        .insert({ tenant_id: activeTenantId, name: input.name.trim(), flow: input.flow, settings: {} })
        .select("*")
        .single();
      if (err || !data) return { error: err?.message ?? "Não foi possível criar o chatbot." };
      const bot = mapBot(data);
      setBots((prev) => [...prev, bot]);
      return { bot };
    },
    [activeTenantId]
  );

  const update = useCallback(async (id: string, patch: ChatbotPatch): Promise<{ bot?: Chatbot; error?: string }> => {
    if (!supabase) return { error: "Sem conexão." };
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.active !== undefined) row.active = patch.active;
    if (patch.flow !== undefined) row.flow = patch.flow;
    if (patch.settings !== undefined) row.settings = patch.settings;
    if (patch.funilId !== undefined) row.funil_id = patch.funilId;
    if (patch.etapaId !== undefined) row.etapa_id = patch.etapaId;
    const { data, error: err } = await supabase.from("chatbots").update(row).eq("id", id).select("*").single();
    if (err || !data) {
      // 23505 = índice único: outra conexão ativa já usa a mesma sessão de WhatsApp.
      return { error: err?.code === "23505" ? "Já existe um chatbot ativo usando esta mesma conexão de WhatsApp." : err?.message ?? "Não foi possível salvar." };
    }
    const bot = mapBot(data);
    setBots((prev) => prev.map((b) => (b.id === id ? bot : b)));
    return { bot };
  }, []);

  const remove = useCallback(async (id: string): Promise<{ error?: string }> => {
    if (!supabase) return { error: "Sem conexão." };
    const { error: err } = await supabase.from("chatbots").delete().eq("id", id);
    if (err) return { error: err.message };
    setBots((prev) => prev.filter((b) => b.id !== id));
    return {};
  }, []);

  return { bots, loading, error, refresh, create, update, remove };
}

/** Conversas (estado por contato) de um chatbot, mais recentes primeiro. */
export function useChatbotConversations(chatbotId: string | null) {
  const [items, setItems] = useState<ChatbotConversation[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !chatbotId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("chatbot_sessions")
      .select("id, chatbot_id, phone_digits, status, current_node, vars, last_input_at")
      .eq("chatbot_id", chatbotId)
      .order("last_input_at", { ascending: false })
      .limit(100);
    if (error) console.error("[Supabase] chatbot_sessions select error:", error.message);
    setItems(
      (data ?? []).map((r: any) => ({
        id: r.id,
        chatbotId: r.chatbot_id,
        phone: String(r.phone_digits ?? "").startsWith("lid") ? "" : String(r.phone_digits ?? ""),
        status: r.status,
        currentNode: r.current_node ?? null,
        vars: r.vars ?? {},
        lastInputAt: r.last_input_at,
      }))
    );
    setLoading(false);
  }, [chatbotId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** "Devolver ao bot": a próxima mensagem do contato recomeça o fluxo do início. */
  const releaseToBot = useCallback(
    async (id: string): Promise<{ error?: string }> => {
      if (!supabase) return { error: "Sem conexão." };
      const { error } = await supabase.from("chatbot_sessions").update({ status: "finished", current_node: null }).eq("id", id);
      if (error) return { error: error.message };
      await refresh();
      return {};
    },
    [refresh]
  );

  return { items, loading, refresh, releaseToBot };
}
