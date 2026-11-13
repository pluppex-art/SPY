import dagre from "@dagrejs/dagre";
import type { ChatbotFlow, FlowNode } from "./types";

export const NODE_WIDTH = 250;
const NODE_BASE_HEIGHT = 92;
const OPTION_HEIGHT = 30;

export function nodeHeight(node: FlowNode): number {
  return node.type === "menu" ? NODE_BASE_HEIGHT + node.options.length * OPTION_HEIGHT : NODE_BASE_HEIGHT;
}

export function nodeTargets(node: FlowNode): string[] {
  const list = node.type === "menu" ? node.options.map((o) => o.next) : node.type === "handoff" || node.type === "end" ? [] : [node.next];
  return list.filter((t): t is string => !!t);
}

/** Dá posição (esquerda → direita) aos passos que ainda não têm; quem já foi arrastado não mexe. */
export function withAutoLayout(flow: ChatbotFlow, force = false): ChatbotFlow {
  const nodes = Object.values(flow.nodes);
  if (!nodes.length) return flow;
  if (!force && nodes.every((n) => n.position)) return flow;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: nodeHeight(n) });
  for (const n of nodes) for (const t of nodeTargets(n)) if (flow.nodes[t]) g.setEdge(n.id, t);
  dagre.layout(g);

  const next: ChatbotFlow["nodes"] = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    next[n.id] = force || !n.position ? { ...n, position: { x: Math.round(p.x - NODE_WIDTH / 2), y: Math.round(p.y - nodeHeight(n) / 2) } } : n;
  }
  return { ...flow, nodes: next };
}
