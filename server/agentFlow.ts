/**
 * "Ver fluxo" ao vivo — GET /api/agent-flow/:agentKey busca o workflow REAL na instância n8n
 * (n8n Public REST API) e transforma no mesmo formato { nodes, edges } que
 * src/pages/settings/sections/agentFlowDiagrams.ts já usa como snapshot estático. O frontend
 * (ver src/hooks/useAgentFlow.ts) tenta esta rota primeiro e cai pro snapshot estático em
 * qualquer falha (503/502/erro de rede) — este arquivo nunca deve deixar o processo cair nem
 * expor N8N_API_KEY em resposta ou log.
 *
 * Cache em memória por agentKey (60s) — evita bater na API do n8n a cada abertura do modal;
 * alguns workflows (ex: aurora) têm ~300 nós, então essa chamada não é barata.
 */
import type { Express, RequestHandler } from "express";
import { AGENT_FLOWS, DEFAULT_FLOW, type AgentFlowDiagram, type FlowEdge, type FlowNode } from "../src/pages/settings/sections/agentFlowDiagrams.js";

interface Deps {
  requireUser: RequestHandler;
}

// Tabela ESTÁTICA agentKey → workflow ID real na instância n8n de produção. IDs de workflow no
// n8n nunca mudam mesmo que o workflow seja renomeado — por isso não fazemos name-matching aqui.
const WORKFLOW_ID_BY_AGENT_KEY: Record<string, string> = {
  aurora: "YHjULZeySJTpCXHO",
  sdr: "MICRLqDmuXmfWHJG",
  closer: "xrETUGoCu3MHKroP",
  radar: "X25VZukPX62cAfli",
  agente_secreto: "5MlfthZSTpkhLii0",
  briefing_diario: "PHNFgO6z3ZaG7fBs",
  diretoria: "TEcQ46ziFk1g0ZsW",
  agente_comercial: "stSQ8MNPKFay5vcL",
  financeiro: "Q5ch3ea4kkENEUo2",
  marketing: "7GhnI2GK06gyWqdt",
  organizacao: "l4rnDAI1P7qustBj",
  pesquisa: "yMO6okb7sEdykj1v",
  atendimento: "jINtHmbJmyrWlO9o",
};

interface N8nWorkflowNode {
  id: string;
  name: string;
  type: string;
  typeVersion?: number;
  position: [number, number];
  parameters?: Record<string, unknown>;
}

interface N8nConnectionTarget {
  node: string;
  type: string;
  index: number;
}

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: N8nWorkflowNode[];
  connections: Record<string, Record<string, (N8nConnectionTarget[] | null)[]>>;
}

// ── Lookup de descrições, construído a partir do snapshot estático já existente ────────────
// agentFlowDiagrams.ts já está cheio de descrições PT-BR boas e específicas, geradas numa
// passada anterior — reaproveita isso como primeira escolha por NOME exato do nó real. Só cai
// no fallback genérico abaixo pra nó novo (criado no n8n depois do snapshot) ou renomeado.
let descriptionByNodeNameCache: Map<string, string> | null = null;
function descriptionByNodeName(): Map<string, string> {
  if (descriptionByNodeNameCache) return descriptionByNodeNameCache;
  const map = new Map<string, string>();
  const allDiagrams: AgentFlowDiagram[] = [...Object.values(AGENT_FLOWS), DEFAULT_FLOW];
  for (const diagram of allDiagrams) {
    for (const node of diagram.nodes) {
      if (!map.has(node.name)) map.set(node.name, node.description);
    }
  }
  descriptionByNodeNameCache = map;
  return map;
}

// ── Slug de id, no mesmo estilo já usado nos ids reais de agentFlowDiagrams.ts (ex: "Modelo -
// GPT (CEO)" → "modelo-gpt-ceo") — normaliza acentos, minúsculas, não-alfanumérico vira "-".
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "no";
}

function uniqueId(name: string, used: Map<string, number>): string {
  const base = slugify(name);
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}${count}`;
}

// ── Descrição de fallback (PT-BR), quando o nó real não está no snapshot estático ──────────
const VERB_BUSCAR = /^(buscar|listar|consultar|ler|obter)\b/i;
const VERB_CRIAR = /^(criar|adicionar|registrar|marcar|inserir|salvar)\b/i;
const VERB_ATUALIZAR = /^(atualizar|editar)\b/i;
const VERB_EXCLUIR = /^(excluir|remover|deletar|desativar|apagar)\b/i;

function fallbackDescription(name: string, nodeType: string): string {
  const t = nodeType.toLowerCase();

  // respondToWebhook precisa ser checado ANTES do "webhook" genérico (senão cairia em Gatilho).
  if (t.includes("respondtowebhook")) return "Devolve a resposta final para quem chamou o fluxo.";

  if (
    t.includes("webhook") ||
    t.includes("scheduletrigger") ||
    t.includes("chattrigger") ||
    t.includes("errortrigger") ||
    t.includes("executeworkflowtrigger") ||
    t.endsWith("trigger")
  ) {
    return "Gatilho: inicia o fluxo quando este evento acontece.";
  }

  if (t.includes(".if") || t.includes("switch")) {
    return "Decide o próximo passo com base numa condição.";
  }

  if (t.includes("toolworkflow") || t.includes("supabasetool")) {
    return "Ferramenta que o agente de IA pode acionar quando precisar.";
  }

  if (t.includes("langchain.agent")) {
    return "O agente de IA que decide o que fazer e como responder.";
  }

  if (t.includes("lmchat") || t.includes("googlegemini")) {
    return "Modelo de IA que gera o texto da resposta.";
  }

  if (t.includes("httprequest")) {
    return "Chama um serviço externo pela internet.";
  }

  if (t.includes("executeworkflow")) {
    return "Aciona outro sub-workflow para executar uma tarefa específica.";
  }

  if (t.includes("code")) {
    return "Executa lógica interna para transformar ou preparar dados.";
  }

  if (t.includes("set")) {
    return "Formata ou organiza os dados antes de seguir adiante.";
  }

  if (t.includes("merge")) {
    return "Junta resultados vindos de caminhos diferentes.";
  }

  if (t.includes("splitinbatches")) {
    return "Processa os itens um de cada vez, em loop.";
  }

  if (t.includes("wait")) {
    return "Aguarda um tempo antes de continuar o fluxo.";
  }

  if (t.includes("redis")) {
    return "Consulta ou grava em um cache rápido (Redis).";
  }

  if (t.includes("supabase") || t.includes("datatable") || t.includes("database")) {
    if (VERB_BUSCAR.test(name)) return "Busca dados reais no banco (Supabase).";
    if (VERB_CRIAR.test(name)) return "Grava uma mudança real no banco (Supabase).";
    if (VERB_ATUALIZAR.test(name)) return "Atualiza um registro existente no banco (Supabase).";
    if (VERB_EXCLUIR.test(name)) return "Remove ou desativa um registro no banco (Supabase).";
    return "Lê ou grava dados no banco (Supabase).";
  }

  return "Etapa interna do fluxo.";
}

function resolveDescription(name: string, nodeType: string): string {
  const fromSnapshot = descriptionByNodeName().get(name);
  if (fromSnapshot) return fromSnapshot;
  return fallbackDescription(name, nodeType);
}

// ── Rótulo de conexão (main/if, ai_tool, ai_languageModel, ai_memory) ───────────────────────
function connectionLabel(connectionType: string, sourceNodeType: string, outputIndex: number): string | undefined {
  if (connectionType === "ai_tool") return "ferramenta";
  if (connectionType === "ai_languageModel") return "modelo";
  if (connectionType === "ai_memory") return "memória";
  if (connectionType === "main" && sourceNodeType === "n8n-nodes-base.if") {
    return outputIndex === 0 ? "sim" : outputIndex === 1 ? "não" : undefined;
  }
  return undefined;
}

// ── Transformação workflow real do n8n → { nodes, edges } ──────────────────────────────────
export function transformN8nWorkflow(workflow: N8nWorkflow): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const realNodes = (workflow.nodes ?? []).filter((n) => n.type !== "n8n-nodes-base.stickyNote");

  const used = new Map<string, number>();
  const idByName = new Map<string, string>();
  const typeByName = new Map<string, string>();
  const nodes: FlowNode[] = realNodes.map((n) => {
    const id = uniqueId(n.name, used);
    idByName.set(n.name, id);
    typeByName.set(n.name, n.type);
    return {
      id,
      name: n.name,
      nodeType: n.type,
      description: resolveDescription(n.name, n.type),
      position: [n.position?.[0] ?? 0, n.position?.[1] ?? 0] as [number, number],
    };
  });

  const edges: FlowEdge[] = [];
  const connections = workflow.connections ?? {};
  for (const sourceName of Object.keys(connections)) {
    const sourceId = idByName.get(sourceName);
    if (!sourceId) continue; // referência a um nó filtrado (ex: stickyNote) ou inexistente
    const sourceType = typeByName.get(sourceName) ?? "";
    const byType = connections[sourceName] ?? {};
    for (const connectionType of Object.keys(byType)) {
      const outputs = byType[connectionType] ?? [];
      outputs.forEach((targets, outputIndex) => {
        for (const target of targets ?? []) {
          const targetId = idByName.get(target.node);
          if (!targetId) continue;
          edges.push({
            from: sourceId,
            to: targetId,
            label: connectionLabel(connectionType, sourceType, outputIndex),
          });
        }
      });
    }
  }

  return { nodes, edges };
}

// ── Cache em memória (60s) ──────────────────────────────────────────────────────────────────
interface CachedFlow {
  agentKey: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  live: true;
  fetchedAt: string;
}
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expiresAt: number; data: CachedFlow }>();

async function fetchAndTransform(agentKey: string, workflowId: string): Promise<CachedFlow> {
  const baseUrl = (process.env.N8N_API_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.N8N_API_KEY || "";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/workflows/${workflowId}`, {
      headers: { "X-N8N-API-KEY": apiKey },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`n8n respondeu HTTP ${response.status}`);

  const workflow = (await response.json()) as N8nWorkflow;
  const { nodes, edges } = transformN8nWorkflow(workflow);
  return { agentKey, nodes, edges, live: true, fetchedAt: new Date().toISOString() };
}

export function registerAgentFlowRoutes(app: Express, { requireUser }: Deps) {
  app.get("/api/agent-flow/:agentKey", requireUser, async (req: any, res) => {
    const agentKey = String(req.params.agentKey || "");
    const workflowId = WORKFLOW_ID_BY_AGENT_KEY[agentKey];
    if (!workflowId) return res.status(404).json({ error: "unknown_agent" });

    if (!process.env.N8N_API_URL || !process.env.N8N_API_KEY) {
      return res.status(503).json({ error: "not_configured" });
    }

    const cached = cache.get(agentKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    try {
      const data = await fetchAndTransform(agentKey, workflowId);
      cache.set(agentKey, { expiresAt: Date.now() + CACHE_TTL_MS, data });
      res.json(data);
    } catch (err: any) {
      // Nunca logar o valor de N8N_API_KEY — só a mensagem de erro da falha de rede/HTTP.
      console.error("[agent-flow] Falha ao buscar workflow no n8n:", err?.message);
      res.status(502).json({ error: "fetch_failed" });
    }
  });
}
