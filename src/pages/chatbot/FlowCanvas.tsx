import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, MarkerType, useUpdateNodeInternals,
  applyNodeChanges, type Node, type Edge, type NodeProps, type NodeChange, type Connection, type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MessageSquare, ListChecks, HelpCircle, Paperclip, UserPlus, UserRound, Flag, Play, DatabaseZap } from "lucide-react";
import type { ChatbotFlow, FlowNode, FlowNodeType } from "../../lib/chatbot/types";
import type { FlowIssue } from "../../lib/chatbot/validate";
import { NODE_WIDTH } from "../../lib/chatbot/layout";
import { NODE_LABEL } from "../../lib/chatbot/templates";
import { SAVE_TARGETS } from "../../lib/chatbot/saveTargets";
import { cn } from "../../lib/utils";

const ICON: Record<FlowNodeType, typeof MessageSquare> = {
  message: MessageSquare,
  menu: ListChecks,
  question: HelpCircle,
  media: Paperclip,
  create_lead: UserPlus,
  save_data: DatabaseZap,
  handoff: UserRound,
  end: Flag,
};

// Cor por tipo: só para o cliente bater o olho no mapa do fluxo; não é decoração do app.
const TONE: Record<FlowNodeType, string> = {
  message: "text-sky-500 bg-sky-500/10",
  menu: "text-violet-500 bg-violet-500/10",
  question: "text-amber-500 bg-amber-500/10",
  media: "text-cyan-500 bg-cyan-500/10",
  create_lead: "text-emerald-500 bg-emerald-500/10",
  save_data: "text-indigo-500 bg-indigo-500/10",
  handoff: "text-rose-500 bg-rose-500/10",
  end: "text-slate-500 bg-slate-500/10",
};

interface StepData extends Record<string, unknown> {
  step: FlowNode;
  isStart: boolean;
  issues: FlowIssue[];
}

function preview(step: FlowNode): string {
  switch (step.type) {
    case "message":
    case "question":
    case "handoff":
    case "end":
      return step.text || (step.type === "handoff" || step.type === "end" ? "(sem texto)" : "");
    case "menu":
      return step.text;
    case "media":
      return step.filename || step.url || "(sem arquivo)";
    case "create_lead":
      return "Registra o contato no funil do CRM";
    case "save_data":
      return `Grava ${step.map.length} campo(s) em ${SAVE_TARGETS[step.target]?.label ?? step.target}`;
  }
}

function StepNode({ id, data, selected }: NodeProps<Node<StepData>>) {
  const { step, isStart, issues } = data;
  const Icon = ICON[step.type];
  const updateInternals = useUpdateNodeInternals();
  const optionCount = step.type === "menu" ? step.options.length : 0;
  useEffect(() => {
    updateInternals(id);
  }, [id, optionCount, updateInternals]);

  const hasError = issues.some((i) => i.level === "error");
  const hasWarning = !hasError && issues.length > 0;
  const hasOutput = step.type !== "handoff" && step.type !== "end" && step.type !== "menu";

  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={cn(
        "rounded-xl border bg-[var(--color-surface-elevated)] shadow-sm",
        selected ? "border-[var(--color-primary-blue)] ring-2 ring-[var(--color-primary-blue)]/30" : "border-[var(--color-border-default)]",
        hasError && "border-rose-500/60",
        hasWarning && !selected && "border-amber-500/50"
      )}
    >
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-[var(--color-text-muted)]" />
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className={cn("grid place-items-center w-6 h-6 rounded-md", TONE[step.type])}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)] truncate">{NODE_LABEL[step.type]}</span>
        {isStart && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 rounded-full px-1.5 py-0.5">
            <Play className="w-2.5 h-2.5" /> Início
          </span>
        )}
      </div>
      <p className="px-3 pt-1.5 pb-2.5 text-xs text-[var(--color-text-primary)] line-clamp-2 whitespace-pre-wrap break-words">{preview(step)}</p>

      {step.type === "menu" && (
        <div className="border-t border-[var(--color-border-subtle)]">
          {step.options.map((opt, i) => (
            <div key={opt.id} className="relative flex items-center h-[30px] px-3 text-xs text-[var(--color-text-muted)] border-b last:border-b-0 border-[var(--color-border-subtle)]">
              <span className="font-bold mr-1.5 text-[var(--color-text-faint)]">{i + 1}.</span>
              <span className="truncate pr-3">{opt.label || "(sem texto)"}</span>
              <Handle id={opt.id} type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-violet-500" />
            </div>
          ))}
        </div>
      )}
      {hasOutput && <Handle id="next" type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-[var(--color-primary-blue)]" />}
    </div>
  );
}

const nodeTypes = { step: StepNode };

interface CanvasProps {
  flow: ChatbotFlow;
  issues: FlowIssue[];
  selectedId: string | null;
  readOnly?: boolean;
  onSelect: (id: string | null) => void;
  onChange: (flow: ChatbotFlow) => void;
}

function Canvas({ flow, issues, selectedId, readOnly, onSelect, onChange }: CanvasProps) {
  const nodes = useMemo<Node<StepData>[]>(
    () =>
      Object.values(flow.nodes).map((step) => ({
        id: step.id,
        type: "step",
        position: step.position ?? { x: 0, y: 0 },
        selected: step.id === selectedId,
        draggable: !readOnly,
        data: { step, isStart: flow.start === step.id, issues: issues.filter((i) => i.nodeId === step.id) },
      })),
    [flow, issues, selectedId, readOnly]
  );

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    for (const step of Object.values(flow.nodes)) {
      const add = (handle: string, target: string | null | undefined, label?: string) => {
        if (!target || !flow.nodes[target]) return;
        out.push({
          id: `${step.id}:${handle}`,
          source: step.id,
          sourceHandle: handle,
          target,
          label,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeWidth: 1.5 },
          deletable: !readOnly,
        });
      };
      if (step.type === "menu") step.options.forEach((o, i) => add(o.id, o.next, `${i + 1}`));
      else if (step.type !== "handoff" && step.type !== "end") add("next", step.next);
    }
    return out;
  }, [flow, readOnly]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<StepData>>[]) => {
      if (readOnly) return;
      const moved = changes.filter((c) => c.type === "position" && c.position);
      if (!moved.length) return;
      const applied = applyNodeChanges(moved, nodes);
      const nextNodes = { ...flow.nodes };
      for (const n of applied) {
        const step = nextNodes[n.id];
        if (step) nextNodes[n.id] = { ...step, position: n.position };
      }
      onChange({ ...flow, nodes: nextNodes });
    },
    [flow, nodes, onChange, readOnly]
  );

  const setNext = useCallback(
    (sourceId: string, handle: string | null | undefined, target: string | null) => {
      const step = flow.nodes[sourceId];
      if (!step) return;
      let updated: FlowNode;
      if (step.type === "menu") updated = { ...step, options: step.options.map((o) => (o.id === handle ? { ...o, next: target } : o)) };
      else if (step.type === "handoff" || step.type === "end") return;
      else updated = { ...step, next: target };
      onChange({ ...flow, nodes: { ...flow.nodes, [sourceId]: updated } });
    },
    [flow, onChange]
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly || !c.source || !c.target || c.source === c.target) return;
      setNext(c.source, c.sourceHandle, c.target);
    },
    [readOnly, setNext]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (readOnly) return;
      for (const c of changes) {
        if (c.type !== "remove") continue;
        const [sourceId, handle] = c.id.split(":");
        setNext(sourceId, handle, null);
      }
    },
    [readOnly, setNext]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, n) => onSelect(n.id)}
      onPaneClick={() => onSelect(null)}
      nodesConnectable={!readOnly}
      deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="!hidden md:!block" />
    </ReactFlow>
  );
}

export function FlowCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
