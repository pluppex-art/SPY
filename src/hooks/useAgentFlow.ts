import { useEffect, useState } from "react";
import { apiFetch } from "../lib/apiClient";
import { getFlowForAgentKey, type AgentFlowDiagram } from "../pages/settings/sections/agentFlowDiagrams";

/**
 * Diagrama do "Ver fluxo" de um agente — tenta buscar a estrutura AO VIVO da instância n8n
 * (GET /api/agent-flow/:agentKey, ver server/agentFlow.ts) e cai automaticamente pro snapshot
 * estático (agentFlowDiagrams.ts) em qualquer falha: 503 (N8N_API_URL/N8N_API_KEY ainda não
 * configuradas neste ambiente), 502 (n8n fora do ar/erro de rede) ou qualquer outro erro. A
 * feature nunca deve ficar sem mostrar nada só porque a sincronização ao vivo ainda não está
 * configurada — por isso `diagram` só é `null` durante o carregamento inicial.
 */
export function useAgentFlow(agentKey: string) {
  const [diagram, setDiagram] = useState<AgentFlowDiagram | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDiagram(null);
    setIsLive(false);

    // Chave vazia = nenhum agente selecionado ainda (ex: modal fechado) — não há o que buscar.
    if (!agentKey) {
      setLoading(false);
      return;
    }
    setLoading(true);

    apiFetch(`/api/agent-flow/${encodeURIComponent(agentKey)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setDiagram({ nodes: data.nodes, edges: data.edges });
        setIsLive(true);
      })
      .catch(() => {
        // 503 (não configurado), 502 (n8n fora do ar) ou erro de rede — cai pro snapshot
        // estático, que sempre existe (getFlowForAgentKey tem fallback pra DEFAULT_FLOW).
        if (cancelled) return;
        setDiagram(getFlowForAgentKey(agentKey));
        setIsLive(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentKey]);

  return { diagram, loading, isLive };
}
