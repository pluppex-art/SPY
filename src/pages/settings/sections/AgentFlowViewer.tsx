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
// dos nós do workflow no n8n (ver agentFlowDiagrams.ts), desenhada pra lembrar o canvas do
// próprio n8n (cartão + fio curvo entre nós), mas em fundo claro e com espaço suficiente pra
// mostrar, embaixo do nome de cada nó, o que ele faz em linguagem simples — não só o nome
// técnico. Não é o editor do n8n: 100% somente-leitura, layout fixo nas posições reais, sem
// drag nem edição; a construção/edição de verdade continua sendo feita pela nossa equipe.

interface NodeStyle {
  icon: typeof Webhook;
  accent: string;
  iconBg: string;
  iconColor: string;
  isTrigger?: boolean;
}

function styleForNodeType(nodeType: string): NodeStyle {
  const t = nodeType.toLowerCase();
  if (t.includes("webhook") || t.includes("chattrigger") || t.includes("executeworkflowtrigger"))
    return { icon: Webhook, accent: "border-rose-400 bg-rose-50 dark:bg-rose-500/10", iconBg: "bg-rose-500", iconColor: "text-white", isTrigger: true };
  if (t.includes("scheduletrigger"))
    return { icon: Clock, accent: "border-rose-400 bg-rose-50 dark:bg-rose-500/10", iconBg: "bg-rose-500", iconColor: "text-white", isTrigger: true };
  if (t.includes("errortrigger"))
    return { icon: AlertTriangle, accent: "border-rose-400 bg-rose-50 dark:bg-rose-500/10", iconBg: "bg-rose-500", iconColor: "text-white", isTrigger: true };
  if (t.includes(".if") || t.includes("switch"))
    return { icon: GitBranch, accent: "border-amber-400 bg-amber-50 dark:bg-amber-500/10", iconBg: "bg-amber-500", iconColor: "text-white" };
  if (t.includes("merge") || t.includes("splitinbatches") || t.includes("wait"))
    return { icon: GitMerge, accent: "border-amber-400 bg-amber-50 dark:bg-amber-500/10", iconBg: "bg-amber-500", iconColor: "text-white" };
  if (t.includes("code") || t.includes("set"))
    return { icon: Code2, accent: "border-slate-300 bg-slate-50 dark:bg-slate-500/10", iconBg: "bg-slate-500", iconColor: "text-white" };
  if (t.includes("langchain.agent"))
    return { icon: Bot, accent: "border-violet-400 bg-violet-50 dark:bg-violet-500/15", iconBg: "bg-violet-600", iconColor: "text-white" };
  if (t.includes("lmchat") || t.includes("googlegemini"))
    return { icon: Sparkles, accent: "border-purple-400 bg-purple-50 dark:bg-purple-500/10", iconBg: "bg-purple-600", iconColor: "text-white" };
  if (t.includes("toolworkflow") || t.includes("supabasetool"))
    return { icon: Wrench, accent: "border-sky-400 bg-sky-50 dark:bg-sky-500/10", iconBg: "bg-sky-600", iconColor: "text-white" };
  if (t.includes("informationextractor") || t.includes("memory"))
    return { icon: Sparkles, accent: "border-purple-400 bg-purple-50 dark:bg-purple-500/10", iconBg: "bg-purple-600", iconColor: "text-white" };
  if (t.includes("supabase") || t.includes("redis") || t.includes("datatable"))
    return { icon: Database, accent: "border-sky-400 bg-sky-50 dark:bg-sky-500/10", iconBg: "bg-sky-600", iconColor: "text-white" };
  if (t.includes("httprequest"))
    return { icon: Globe, accent: "border-sky-400 bg-sky-50 dark:bg-sky-500/10", iconBg: "bg-sky-600", iconColor: "text-white" };
  if (t.includes("executeworkflow"))
    return { icon: WorkflowIcon, accent: "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10", iconBg: "bg-emerald-600", iconColor: "text-white" };
  if (t.includes("respondtowebhook"))
    return { icon: SendHorizontal, accent: "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10", iconBg: "bg-emerald-600", iconColor: "text-white" };
  if (t.includes("speech") || t.includes("audio"))
    return { icon: Mic, accent: "border-purple-400 bg-purple-50 dark:bg-purple-500/10", iconBg: "bg-purple-600", iconColor: "text-white" };
  return { icon: Circle, accent: "border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]", iconBg: "bg-slate-400", iconColor: "text-white" };
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
            <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight">{step.name}</p>
            {isTrigger && (
              <span className="shrink-0 text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-rose-500 text-white">
                Gatilho
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-snug mt-1">
            {step.description}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[var(--color-border-default)] !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { flowStep: FlowStepNodeRenderer };

// Espaça mais que a posição real do n8n pra sobrar espaço pro texto de descrição (os cartões
// aqui são mais altos/largos que um nó de verdade no n8n, que só mostra o nome).
const SPREAD_X = 1.15;
const SPREAD_Y = 1.6;

function toReactFlowGraph(diagram: AgentFlowDiagram): { nodes: Node[]; edges: Edge[] } {
  const minX = Math.min(...diagram.nodes.map((n) => n.position[0]));
  const minY = Math.min(...diagram.nodes.map((n) => n.position[1]));
  const nodes: Node[] = diagram.nodes.map((step) => ({
    id: step.id,
    type: "flowStep",
    position: { x: (step.position[0] - minX) * SPREAD_X, y: (step.position[1] - minY) * SPREAD_Y },
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
      description="Estrutura real do fluxo — cada cartão é uma etapa real, com o que ela faz. Visualização apenas: a construção e edição é feita pela nossa equipe."
      maxWidth="max-w-6xl"
      noPadding
    >
      <div style={{ height: "70vh" }} className="w-full bg-slate-100 dark:bg-[var(--color-surface-sunken)]">
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
          <Background gap={24} size={1.5} color="rgba(100,116,139,0.25)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </Modal>
  );
}
