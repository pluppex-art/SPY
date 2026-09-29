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
import {
  Webhook, Clock, Code2, GitBranch, Database, Globe, Workflow as WorkflowIcon,
  SendHorizontal, GitMerge, Bot, Wrench, Sparkles, Mic, AlertTriangle, Circle,
} from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import type { AgentFlowDiagram, FlowNode } from "./agentFlowDiagrams";

// Visualização somente-leitura do fluxo real de um agente — usa o NOME, TIPO e POSIÇÃO reais
// dos nós do workflow no n8n (ver agentFlowDiagrams.ts), desenhada pra lembrar visualmente o
// canvas do próprio n8n (cartão retangular com ícone + nome, fio curvo entre nós, fundo
// pontilhado). Não é o editor do n8n — é 100% somente-leitura, layout fixo nas posições reais,
// sem drag nem edição; a construção/edição de verdade continua sendo feita pela nossa equipe
// direto no n8n.

interface NodeStyle {
  icon: typeof Webhook;
  accent: string;
  iconColor: string;
}

function styleForNodeType(nodeType: string): NodeStyle {
  const t = nodeType.toLowerCase();
  if (t.includes("webhook") || t.includes("chattrigger") || t.includes("executeworkflowtrigger"))
    return { icon: Webhook, accent: "border-rose-400/60 bg-rose-500/10", iconColor: "text-rose-400" };
  if (t.includes("scheduletrigger"))
    return { icon: Clock, accent: "border-rose-400/60 bg-rose-500/10", iconColor: "text-rose-400" };
  if (t.includes("errortrigger"))
    return { icon: AlertTriangle, accent: "border-rose-400/60 bg-rose-500/10", iconColor: "text-rose-400" };
  if (t.includes(".if") || t.includes("switch"))
    return { icon: GitBranch, accent: "border-amber-400/60 bg-amber-500/10", iconColor: "text-amber-400" };
  if (t.includes("merge") || t.includes("splitinbatches") || t.includes("wait"))
    return { icon: GitMerge, accent: "border-amber-400/60 bg-amber-500/10", iconColor: "text-amber-400" };
  if (t.includes("code") || t.includes("set"))
    return { icon: Code2, accent: "border-slate-400/60 bg-slate-500/10", iconColor: "text-slate-300" };
  if (t.includes("langchain.agent"))
    return { icon: Bot, accent: "border-violet-400/70 bg-violet-500/15", iconColor: "text-violet-300" };
  if (t.includes("lmchat") || t.includes("googlegemini"))
    return { icon: Sparkles, accent: "border-purple-400/60 bg-purple-500/10", iconColor: "text-purple-300" };
  if (t.includes("toolworkflow") || t.includes("supabasetool"))
    return { icon: Wrench, accent: "border-sky-400/60 bg-sky-500/10", iconColor: "text-sky-400" };
  if (t.includes("informationextractor") || t.includes("memory"))
    return { icon: Sparkles, accent: "border-purple-400/60 bg-purple-500/10", iconColor: "text-purple-300" };
  if (t.includes("supabase") || t.includes("redis") || t.includes("datatable"))
    return { icon: Database, accent: "border-sky-400/60 bg-sky-500/10", iconColor: "text-sky-400" };
  if (t.includes("httprequest"))
    return { icon: Globe, accent: "border-sky-400/60 bg-sky-500/10", iconColor: "text-sky-400" };
  if (t.includes("executeworkflow"))
    return { icon: WorkflowIcon, accent: "border-emerald-400/60 bg-emerald-500/10", iconColor: "text-emerald-400" };
  if (t.includes("respondtowebhook"))
    return { icon: SendHorizontal, accent: "border-emerald-400/60 bg-emerald-500/10", iconColor: "text-emerald-400" };
  if (t.includes("speech") || t.includes("audio"))
    return { icon: Mic, accent: "border-purple-400/60 bg-purple-500/10", iconColor: "text-purple-300" };
  return { icon: Circle, accent: "border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]", iconColor: "text-[var(--color-text-muted)]" };
}

// Rótulo curto do tipo, no estilo do subtítulo cinza que o próprio n8n mostra sob o nome do nó.
function shortTypeLabel(nodeType: string): string {
  const parts = nodeType.split(".");
  const last = parts[parts.length - 1];
  return last
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function FlowStepNodeRenderer({ data }: NodeProps) {
  const step = data as unknown as FlowNode;
  const { icon: Icon, accent, iconColor } = styleForNodeType(step.nodeType);
  return (
    <div className={`rounded-lg border-2 px-3 py-2.5 w-56 shadow-md ${accent}`}>
      <Handle type="target" position={Position.Left} className="!bg-[var(--color-border-default)] !w-2 !h-2" />
      <div className="flex items-start gap-2">
        <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-black/20 ${iconColor}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-[var(--color-text-primary)] leading-tight">{step.name}</p>
          <p className="text-[9px] text-[var(--color-text-muted)] leading-snug mt-0.5 uppercase tracking-wide">
            {shortTypeLabel(step.nodeType)}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[var(--color-border-default)] !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { flowStep: FlowStepNodeRenderer };

function toReactFlowGraph(diagram: AgentFlowDiagram): { nodes: Node[]; edges: Edge[] } {
  const minX = Math.min(...diagram.nodes.map((n) => n.position[0]));
  const minY = Math.min(...diagram.nodes.map((n) => n.position[1]));
  const nodes: Node[] = diagram.nodes.map((step) => ({
    id: step.id,
    type: "flowStep",
    position: { x: step.position[0] - minX, y: step.position[1] - minY },
    data: step as unknown as Record<string, unknown>,
    draggable: false,
    selectable: false,
  }));
  const edges: Edge[] = diagram.edges.map((e, i) => ({
    id: `${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
    label: e.label,
    type: "smoothstep",
    animated: false,
    style: { stroke: "var(--color-border-default)", strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fill: "var(--color-text-muted)" },
    labelBgStyle: { fill: "var(--color-surface-elevated)", opacity: 0.9 },
  }));
  return { nodes, edges };
}

export function AgentFlowViewerModal({
  isOpen,
  onClose,
  agentDisplayName,
  diagram,
}: {
  isOpen: boolean;
  onClose: () => void;
  agentDisplayName: string;
  diagram: AgentFlowDiagram;
}) {
  const { nodes, edges } = useMemo(() => toReactFlowGraph(diagram), [diagram]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Como o ${agentDisplayName} funciona`}
      description="Estrutura real do fluxo no n8n — nomes e conexões reais dos nós. Visualização apenas: a construção e edição é feita pela nossa equipe."
      maxWidth="max-w-5xl"
      noPadding
    >
      <div style={{ height: "65vh" }} className="w-full bg-[#0f0f11]">
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
          minZoom={0.15}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="rgba(255,255,255,0.06)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </Modal>
  );
}
