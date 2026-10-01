import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  Webhook, Clock, Code2, GitBranch, Database, Globe, Workflow as WorkflowIcon,
  SendHorizontal, GitMerge, Bot, Wrench, Sparkles, Mic, AlertTriangle, Circle,
} from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import type { AgentFlowDiagram, FlowNode } from "./agentFlowDiagrams";

// Visualização somente-leitura do fluxo real de um agente — usa o NOME, TIPO e conexões reais
// dos nós do workflow no n8n (ver agentFlowDiagrams.ts), desenhada pra lembrar o canvas do
// próprio n8n (cartão + fio curvo entre nós), em fundo claro e com espaço suficiente pra mostrar,
// embaixo do nome de cada nó, o que ele faz em linguagem simples — não só o nome técnico.
//
// A posição de cada cartão NÃO usa a posição real do n8n (`step.position`) — o layout real de um
// workflow no n8n frequentemente tem nós sobrepostos (arrasto manual, copiar/colar, nós antigos
// nunca reorganizados), e isso ficaria ilegível aqui. Em vez disso, todo layout é recalculado na
// hora com dagre, a partir só das CONEXÕES reais (nunca das posições) — isso garante zero
// sobreposição sempre, não importa o tamanho do fluxo. Não é o editor do n8n: 100% somente-
// leitura, sem drag nem edição; a construção/edição de verdade continua sendo feita no n8n.

interface NodeStyle {
  icon: typeof Webhook;
  accent: string;
  iconBg: string;
  iconColor: string;
  isTrigger?: boolean;
}

// Tipos de nó do fluxo real do n8n — continuam sendo categorias visualmente distintas
// (gatilho/estrutural vs IA vs erro vs conclusão), mas só com os tokens de tema do app, não
// mais um arco-íris decorativo (era rose/amber/violet/purple/sky/emerald cru, cada um só
// legível com um par light/dark manual). Resultado: cinza neutro pros nós estruturais
// (trigger comum, condição, código, tool, dado, http), --color-primary-blue só pros nós de
// IA de verdade (agente, modelo, extractor/memória, voz — o que a tela de Aurora realmente
// quer destacar), e danger/success só onde o nó É literalmente um erro ou uma conclusão
// (errorTrigger / respondToWebhook, executeWorkflow). A distinção entre os tipos dentro de
// cada grupo continua vindo do ÍCONE, não da cor.
function styleForNodeType(nodeType: string): NodeStyle {
  const t = nodeType.toLowerCase();
  const NEUTRAL = { accent: "border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]", iconBg: "bg-[var(--color-text-muted)]", iconColor: "text-white" };
  const AI = { accent: "border-[var(--color-primary-blue)]/40 bg-[var(--color-primary-blue)]/5", iconBg: "bg-[var(--color-primary-blue)]", iconColor: "text-white" };
  const DONE = { accent: "border-success/40 bg-success/5", iconBg: "bg-success", iconColor: "text-white" };

  if (t.includes("errortrigger"))
    return { icon: AlertTriangle, accent: "border-danger/40 bg-danger/5", iconBg: "bg-danger", iconColor: "text-white", isTrigger: true };
  if (t.includes("webhook") || t.includes("chattrigger") || t.includes("executeworkflowtrigger"))
    return { icon: Webhook, ...NEUTRAL, isTrigger: true };
  if (t.includes("scheduletrigger"))
    return { icon: Clock, ...NEUTRAL, isTrigger: true };
  if (t.includes(".if") || t.includes("switch"))
    return { icon: GitBranch, ...NEUTRAL };
  if (t.includes("merge") || t.includes("splitinbatches") || t.includes("wait"))
    return { icon: GitMerge, ...NEUTRAL };
  if (t.includes("code") || t.includes("set"))
    return { icon: Code2, ...NEUTRAL };
  if (t.includes("langchain.agent"))
    return { icon: Bot, ...AI };
  if (t.includes("lmchat") || t.includes("googlegemini"))
    return { icon: Sparkles, ...AI };
  if (t.includes("toolworkflow") || t.includes("supabasetool"))
    return { icon: Wrench, ...NEUTRAL };
  if (t.includes("informationextractor") || t.includes("memory"))
    return { icon: Sparkles, ...AI };
  if (t.includes("supabase") || t.includes("redis") || t.includes("datatable"))
    return { icon: Database, ...NEUTRAL };
  if (t.includes("httprequest"))
    return { icon: Globe, ...NEUTRAL };
  if (t.includes("executeworkflow"))
    return { icon: WorkflowIcon, ...DONE };
  if (t.includes("respondtowebhook"))
    return { icon: SendHorizontal, ...DONE };
  if (t.includes("speech") || t.includes("audio"))
    return { icon: Mic, ...AI };
  return { icon: Circle, ...NEUTRAL };
}

function FlowStepNodeRenderer({ data }: NodeProps) {
  const step = data as unknown as FlowNode;
  const { icon: Icon, accent, iconBg, iconColor, isTrigger } = styleForNodeType(step.nodeType);
  return (
    <div className={`rounded-xl border-2 px-3.5 py-3 w-64 shadow-md ${accent}`}>
      <Handle type="target" position={Position.Left} className="!bg-[var(--color-border-default)] !w-2 !h-2" />
      <div className="flex items-start gap-2.5">
        <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${iconBg} ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[11px] font-bold text-[var(--color-text-primary)] leading-tight">{step.name}</p>
            {isTrigger && (
              <span className="shrink-0 text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[var(--color-text-muted)] text-white">
                Gatilho
              </span>
            )}
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] leading-snug mt-1">
            {step.description}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[var(--color-border-default)] !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { flowStep: FlowStepNodeRenderer };

// Tamanho estimado do cartão (w-64 = 256px + folga pra descrição de 2-3 linhas) — usado só pelo
// dagre pra calcular o layout sem sobrepor; não precisa bater pixel-a-pixel com o CSS real.
const NODE_WIDTH = 256;
const NODE_HEIGHT = 96;

function layoutWithDagre(diagram: AgentFlowDiagram): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  // Esquerda→direita (mesmo sentido de leitura do canvas do n8n), com espaçamento generoso —
  // nodesep separa cartões na mesma coluna, ranksep separa uma etapa da próxima.
  g.setGraph({ rankdir: "LR", nodesep: 48, ranksep: 110, marginx: 24, marginy: 24 });

  diagram.nodes.forEach((step) => g.setNode(step.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  diagram.edges.forEach((e) => g.setEdge(e.from, e.to));

  dagre.layout(g);

  const nodes: Node[] = diagram.nodes.map((step) => {
    const { x, y } = g.node(step.id);
    return {
      id: step.id,
      type: "flowStep",
      // dagre centraliza no meio do nó; React Flow posiciona pelo canto superior esquerdo.
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
      data: step as unknown as Record<string, unknown>,
      draggable: false,
      selectable: false,
    };
  });

  const edges: Edge[] = diagram.edges.map((e, i) => ({
    id: `${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
    label: e.label,
    type: "smoothstep",
    animated: false,
    style: { stroke: "var(--color-text-faint)", strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fontWeight: 700, fill: "var(--color-text-muted)" },
    labelBgStyle: { fill: "var(--color-surface-elevated)", opacity: 0.95 },
    labelBgPadding: [4, 2] as [number, number],
  }));
  return { nodes, edges };
}

export function AgentFlowViewerModal({
  isOpen,
  onClose,
  agentDisplayName,
  diagram,
  isLive,
}: {
  isOpen: boolean;
  onClose: () => void;
  agentDisplayName: string;
  diagram: AgentFlowDiagram;
  /** true = veio ao vivo da API do n8n agora mesmo (ver useAgentFlow.ts); false/undefined =
   * caiu pro snapshot estático (agentFlowDiagrams.ts) — sempre mostrado com honestidade, nunca
   * escondido, pra quem está vendo saber se o que aparece é o fluxo atual ou uma foto antiga. */
  isLive?: boolean;
}) {
  const { nodes, edges } = useMemo(() => layoutWithDagre(diagram), [diagram]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Como o ${agentDisplayName} funciona`}
      description={
        <>
          Estrutura real do fluxo — cada cartão é uma etapa real, com o que ela faz. Visualização apenas: a construção e edição é feita pela nossa equipe.{" "}
          <span className={isLive ? "text-success" : "text-[var(--color-text-faint)]"}>
            {isLive ? "• Ao vivo, direto do n8n" : "• Última versão salva (sincronização automática ainda não configurada)"}
          </span>
        </>
      }
      maxWidth="max-w-6xl"
      noPadding
    >
      <div style={{ height: "70vh" }} className="w-full bg-[var(--color-surface-sunken)]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1.5} color="var(--color-border-default)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </Modal>
  );
}
