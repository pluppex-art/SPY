/**
 * Diagramas de fluxo (visualização, somente leitura) de cada agente — pensados pra mostrar
 * pro cliente COMO o agente funciona por dentro, sem expor o workflow técnico real do n8n
 * (nome de tabela, credencial, nó interno). São uma representação simplificada e curada,
 * não um espelho 1:1 do n8n — a edição de verdade continua sendo só da equipe Pluppex.
 *
 * Chave = agent_key (mesmo identificador de FIXED_N8N_PROMPT_KEY em SettingsSistemaAuroraAgentes.tsx
 * e de ai_agent_prompts.agent_key). Sem entrada aqui pra uma chave = usa DEFAULT_FLOW.
 */

export interface FlowStepNode {
  id: string;
  label: string;
  detail?: string;
  kind: "trigger" | "step" | "decision" | "tool" | "output";
  /** Posição em "colunas" (0 = mais à esquerda) — o layout horizontal usa isso pra x. */
  col: number;
  /** Linha dentro da coluna, pra ramos paralelos (0 = centro). */
  row?: number;
}

export interface FlowStepEdge {
  from: string;
  to: string;
  label?: string;
}

export interface AgentFlowDiagram {
  nodes: FlowStepNode[];
  edges: FlowStepEdge[];
}

export const DEFAULT_FLOW: AgentFlowDiagram = {
  nodes: [
    { id: "in", label: "Pergunta chega", detail: "Pela Aurora ou direto do sistema", kind: "trigger", col: 0 },
    { id: "ctx", label: "Busca contexto da sua empresa", detail: "Instruções extras que você cadastrou", kind: "step", col: 1 },
    { id: "think", label: "Agente analisa e decide", kind: "decision", col: 2 },
    { id: "tools", label: "Consulta dados / outras áreas", detail: "Quando precisa de informação real", kind: "tool", col: 3 },
    { id: "out", label: "Responde", kind: "output", col: 4 },
  ],
  edges: [
    { from: "in", to: "ctx" },
    { from: "ctx", to: "think" },
    { from: "think", to: "tools" },
    { from: "tools", to: "think", label: "volta com o dado" },
    { from: "think", to: "out" },
  ],
};

export const AGENT_FLOWS: Record<string, AgentFlowDiagram> = {
  aurora: {
    nodes: [
      { id: "in", label: "Mensagem chega", detail: "Chat do sistema ou WhatsApp da equipe", kind: "trigger", col: 0 },
      { id: "perm", label: "Verifica permissão e limite de uso", kind: "step", col: 1 },
      { id: "think", label: "Aurora analisa o pedido", kind: "decision", col: 2 },
      { id: "tools", label: "Aciona a área certa", detail: "Diretoria, Financeiro, CRM, Agenda, Júlia...", kind: "tool", col: 3 },
      { id: "out", label: "Responde", detail: "Texto e, quando faz sentido, voz", kind: "output", col: 4 },
    ],
    edges: [
      { from: "in", to: "perm" },
      { from: "perm", to: "think" },
      { from: "think", to: "tools" },
      { from: "tools", to: "think", label: "volta com o resultado" },
      { from: "think", to: "out" },
    ],
  },

  sdr: {
    nodes: [
      { id: "in", label: "Lead manda mensagem", detail: "WhatsApp", kind: "trigger", col: 0 },
      { id: "lookup", label: "Busca o histórico desse contato", detail: "Já conversou antes? É lead novo?", kind: "step", col: 1 },
      { id: "extract", label: "Entende o que o lead precisa", detail: "Nome, interesse, urgência...", kind: "decision", col: 2 },
      { id: "crm", label: "Atualiza o CRM automaticamente", kind: "tool", col: 3 },
      { id: "route", label: "Está pronto pra fechar?", kind: "decision", col: 4 },
      { id: "human", label: "Passa pra um vendedor humano", kind: "output", col: 5, row: -1 },
      { id: "out", label: "Continua a conversa", kind: "output", col: 5, row: 1 },
    ],
    edges: [
      { from: "in", to: "lookup" },
      { from: "lookup", to: "extract" },
      { from: "extract", to: "crm" },
      { from: "crm", to: "route" },
      { from: "route", to: "human", label: "sim" },
      { from: "route", to: "out", label: "ainda não" },
    ],
  },

  closer: {
    nodes: [
      { id: "in", label: "Pedido de apoio no fechamento", kind: "trigger", col: 0 },
      { id: "gate", label: "Módulo está ativado?", kind: "decision", col: 1 },
      { id: "ctx", label: "Busca contexto do negócio/lead", kind: "step", col: 2 },
      { id: "think", label: "Monta a melhor abordagem", detail: "Técnica de negociação e fechamento", kind: "decision", col: 3 },
      { id: "out", label: "Responde com a orientação", kind: "output", col: 4 },
      { id: "blocked", label: "Recusa educadamente", kind: "output", col: 2, row: -1 },
    ],
    edges: [
      { from: "in", to: "gate" },
      { from: "gate", to: "ctx", label: "sim" },
      { from: "gate", to: "blocked", label: "não" },
      { from: "ctx", to: "think" },
      { from: "think", to: "out" },
    ],
  },

  radar: {
    nodes: [
      { id: "in1", label: "Busca direta", detail: "Você pede uma lista de empresas", kind: "trigger", col: 0, row: -1 },
      { id: "in2", label: "Grupo de WhatsApp monitorado", detail: "Alguém fala de uma oportunidade", kind: "trigger", col: 0, row: 1 },
      { id: "classify", label: "IA avalia se é oportunidade real", kind: "decision", col: 1 },
      { id: "lead", label: "Cria o lead automaticamente", kind: "tool", col: 2 },
      { id: "notify", label: "Avisa o vendedor responsável", kind: "output", col: 3 },
    ],
    edges: [
      { from: "in1", to: "classify" },
      { from: "in2", to: "classify" },
      { from: "classify", to: "lead" },
      { from: "lead", to: "notify" },
    ],
  },

  agente_secreto: {
    nodes: [
      { id: "in", label: "Conversa acontece no WhatsApp", detail: "Entre seu time e o cliente final", kind: "trigger", col: 0 },
      { id: "identify", label: "Identifica de qual número é", kind: "step", col: 1 },
      { id: "extract", label: "IA lê a conversa", detail: "Nome, necessidade, agendamento...", kind: "decision", col: 2 },
      { id: "crm", label: "Cadastra/atualiza no CRM", kind: "tool", col: 3 },
      { id: "sched", label: "Detectou agendamento?", kind: "decision", col: 4 },
      { id: "appt", label: "Registra o agendamento", kind: "tool", col: 5, row: -1 },
      { id: "notify", label: "Avisa só o responsável, em privado", detail: "Nunca responde no chat do cliente", kind: "output", col: 5, row: 1 },
    ],
    edges: [
      { from: "in", to: "identify" },
      { from: "identify", to: "extract" },
      { from: "extract", to: "crm" },
      { from: "crm", to: "sched" },
      { from: "sched", to: "appt", label: "sim" },
      { from: "appt", to: "notify" },
      { from: "sched", to: "notify", label: "não" },
    ],
  },

  briefing_diario: {
    nodes: [
      { id: "in", label: "Todo dia às 8h", kind: "trigger", col: 0 },
      { id: "gather", label: "Reúne o que importa hoje", detail: "Reuniões, tarefas, leads, financeiro...", kind: "step", col: 1 },
      { id: "think", label: "Monta o resumo do dia", kind: "decision", col: 2 },
      { id: "out", label: "Envia por WhatsApp pra cada pessoa", kind: "output", col: 3 },
    ],
    edges: [
      { from: "in", to: "gather" },
      { from: "gather", to: "think" },
      { from: "think", to: "out" },
    ],
  },
};

export function getFlowForAgentKey(agentKey: string): AgentFlowDiagram {
  return AGENT_FLOWS[agentKey] ?? DEFAULT_FLOW;
}
