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
import { Workflow, GitBranch, Wrench, ArrowRightCircle, Radio } from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import type { AgentFlowDiagram, FlowStepNode } from "./agentFlowDiagrams";

// Visualização somente-leitura do fluxo de um agente — não é o editor do n8n, é uma
// representação simplificada pensada pra mostrar pro cliente como o agente funciona por
// dentro, sem expor nome de tabela/credencial/nó técnico real. Layout fixo em colunas
// (col/row do diagrama), sem drag nem edição — Controls do React Flow só serve pra
// zoom/pan/fit, não existe nenhum caminho de escrita de volta pro n8n aqui.

const KIND_STYLE: Record<FlowStepNode["kind"], { icon: typeof Workflow; accent: string }> = {
  trigger: { icon: Radio, accent: "border-violet-400/60 bg-violet-500/10" },
  step: { icon: ArrowRightCircle, accent: "border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]" },
  decision: { icon: GitBranch, accent: "border-amber-400/60 bg-amber-500/10" },
  tool: { icon: Wrench, accent: "border-sky-400/60 bg-sky-500/10" },
  output: { icon: Workflow, accent: "border-emerald-400/60 bg-emerald-500/10" },
};

function FlowStepNodeRenderer({ data }: NodeProps) {
  const step = data as unknown as FlowStepNode;
  const { icon: Icon, accent } = KIND_STYLE[step.kind];
  return (
    <div className={`rounded-xl border px-3 py-2.5 w-52 shadow-sm ${accent}`}>
      <Handle type="target" position={Position.Left} className="!bg-[var(--color-border-default)] !w-2 !h-2" />
      <div className="flex items-start gap-2">
        <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--color-text-primary)]" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-[var(--color-text-primary)] leading-tight">{step.label}</p>
          {step.detail && (
            <p className="text-[10px] text-[var(--color-text-muted)] leading-snug mt-0.5">{step.detail}</p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[var(--color-border-default)] !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { flowStep: FlowStepNodeRenderer };

const COL_WIDTH = 260;
const ROW_HEIGHT = 90;

function toReactFlowGraph(diagram: AgentFlowDiagram): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = diagram.nodes.map((step) => ({
    id: step.id,
    type: "flowStep",
    position: { x: step.col * COL_WIDTH, y: (step.row ?? 0) * ROW_HEIGHT },
    data: step as unknown as Record<string, unknown>,
    draggable: false,
    selectable: false,
  }));
  const edges: Edge[] = diagram.edges.map((e, i) => ({
    id: `${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
    label: e.label,
    animated: false,
    style: { stroke: "var(--color-border-default)" },
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
      description="Visualização apenas — a construção e edição desse fluxo é feita pela nossa equipe."
      maxWidth="max-w-4xl"
      noPadding
    >
      <div style={{ height: "60vh" }} className="w-full bg-[var(--color-surface-sunken)]">
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
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="var(--color-border-subtle)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </Modal>
  );
}
