import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, Handle, Position, EdgeLabelRenderer, getBezierPath,
  type Node, type Edge, type NodeProps, type EdgeProps, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Workflow, Tag, Building2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useData } from "../../contexts/DataContext";
import { useOS } from "../os/hooks/useOS";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

interface ConnectionRow {
  id: string;
  nome: string;
  ativo: boolean;
  gatilho_tipo: "funil_etapa" | "produto_categoria";
  gatilho_funil_id: string | null;
  gatilho_etapa_idx: number | null;
  gatilho_categoria: string | null;
  os_departamento_id: string;
}

function funilStageNames(funil: any): string[] {
  if (Array.isArray(funil?.etapasConfig)) return funil.etapasConfig.map((e: any) => e.nome);
  return Array.isArray(funil?.etapas) ? funil.etapas : [];
}

const ROW_H = 28;
const HEADER_H = 40;

// ── Nó: funil do CRM, uma linha (e um handle de saída) por etapa ───────────
function FunilNode({ data }: NodeProps) {
  const { nome, etapas } = data as unknown as { nome: string; etapas: string[] };
  return (
    <div className="rounded-xl border-2 border-[var(--color-primary-blue)]/30 bg-[var(--color-surface-elevated)] shadow-md w-60 overflow-hidden">
      <div className="px-3 py-2 bg-[var(--color-primary-blue)]/10 border-b border-[var(--color-primary-blue)]/20 flex items-center gap-1.5">
        <Workflow className="w-3.5 h-3.5 text-[var(--color-primary-blue)] shrink-0" />
        <span className="text-[11px] font-bold text-[var(--color-text-primary)] truncate">{nome}</span>
      </div>
      <div>
        {etapas.map((nomeEtapa, idx) => (
          <div key={idx} className="relative px-3 flex items-center text-[10px] text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)] last:border-0" style={{ height: ROW_H }}>
            <span className="truncate">{nomeEtapa}</span>
            <Handle
              type="source" id={`etapa:${idx}`} position={Position.Right}
              style={{ top: HEADER_H + idx * ROW_H + ROW_H / 2 - 12 }}
              className="!bg-[var(--color-primary-blue)] !w-2.5 !h-2.5 !border-2 !border-[var(--color-surface-elevated)]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Nó: hub de categorias de produto, uma linha (e handle) por categoria ───
function CategoriasNode({ data }: NodeProps) {
  const { categorias } = data as unknown as { categorias: string[] };
  return (
    <div className="rounded-xl border-2 border-warning/30 bg-[var(--color-surface-elevated)] shadow-md w-60 overflow-hidden">
      <div className="px-3 py-2 bg-warning/10 border-b border-warning/20 flex items-center gap-1.5">
        <Tag className="w-3.5 h-3.5 text-warning shrink-0" />
        <span className="text-[11px] font-bold text-[var(--color-text-primary)]">Proposta aceita com…</span>
      </div>
      <div>
        {categorias.map((cat, idx) => (
          <div key={cat} className="relative px-3 flex items-center text-[10px] text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)] last:border-0" style={{ height: ROW_H }}>
            <span className="truncate">{cat}</span>
            <Handle
              type="source" id={`cat:${cat}`} position={Position.Right}
              style={{ top: HEADER_H + idx * ROW_H + ROW_H / 2 - 12 }}
              className="!bg-warning !w-2.5 !h-2.5 !border-2 !border-[var(--color-surface-elevated)]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Nó: departamento da Operação (OS) — um alvo só ──────────────────────────
function DepartamentoNode({ data }: NodeProps) {
  const { nome, qtd } = data as unknown as { nome: string; qtd: number };
  return (
    <div className="rounded-xl border-2 border-success/30 bg-[var(--color-surface-elevated)] shadow-md w-52 px-3 py-2.5 relative">
      <Handle type="target" position={Position.Left} className="!bg-success !w-2.5 !h-2.5 !border-2 !border-[var(--color-surface-elevated)]" />
      <div className="flex items-center gap-1.5">
        <Building2 className="w-3.5 h-3.5 text-success shrink-0" />
        <span className="text-[11px] font-bold text-[var(--color-text-primary)] truncate">{nome}</span>
      </div>
      {qtd > 0 && <span className="text-[9px] text-[var(--color-text-faint)] mt-0.5 block">{qtd} conexão{qtd > 1 ? "ões" : ""}</span>}
    </div>
  );
}

// ── Aresta: clicável, com um "×" no meio pra apagar; tracejada quando pausada ──
function ConnectionEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const onDelete = (data as any)?.onDelete as (() => void) | undefined;
  return (
    <>
      <path id={id} className="react-flow__edge-path" d={path} style={style} markerEnd="url(#automacao-arrow)" />
      <EdgeLabelRenderer>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
          style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}
          className="w-4 h-4 rounded-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-faint)] hover:text-danger hover:border-danger/40 flex items-center justify-center cursor-pointer shadow-sm"
          title="Remover conexão"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { funil: FunilNode, categorias: CategoriasNode, departamento: DepartamentoNode };
const edgeTypes = { conexao: ConnectionEdge };

/** Canvas interativo (React Flow) pra montar "quando X acontece no CRM, cria
 * uma OS em tal departamento" arrastando uma linha de verdade, igual ao
 * editor do n8n — cada etapa de funil (ou categoria de produto) é um ponto
 * de saída, cada departamento da Operação é um ponto de chegada. Os
 * gatilhos reais rodam no banco (trg_automacao_lead_etapa /
 * trg_automacao_proposta_categoria), então uma linha desenhada aqui já vale
 * pra qualquer caminho que mude o lead/proposta, não só esta tela aberta. */
export function AutomationFunilConnections() {
  const { activeTenantId } = useAuth();
  const { funis, products } = useData();
  const { departamentos: osDepartamentos } = useOS();

  const [rows, setRows] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const comercialFunis = useMemo(() => (funis as any[]).filter((f) => f.tipo === "comercial" && f.ativo !== false), [funis]);
  const categorias = useMemo(
    () => [...new Set((products as any[]).map((p) => p.category).filter(Boolean))].sort(),
    [products]
  );
  const departamentosAtivos = useMemo(() => (osDepartamentos as any[]).filter((d) => d.ativo), [osDepartamentos]);

  const fetchRows = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data, error } = await supabase.from("automation_connections").select("*").order("created_at", { ascending: false });
    if (!error) setRows((data as ConnectionRow[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleDelete = useCallback(async (row: ConnectionRow) => {
    if (!(await confirmDialog({ title: "Remover conexão", description: `Remover "${row.nome}"? Essa ação não pode ser desfeita.` }))) return;
    if (!supabase) return;
    const { error } = await supabase.from("automation_connections").delete().eq("id", row.id);
    if (error) { toast.error("Não foi possível remover."); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast.success("Conexão removida.");
  }, []);

  // ─── Monta nós ──────────────────────────────────────────────────────────
  const nodes: Node[] = useMemo(() => {
    const out: Node[] = [];
    comercialFunis.forEach((f, i) => {
      const stageNames = funilStageNames(f);
      out.push({
        id: `funil:${f.id}`, type: "funil",
        position: { x: 0, y: i * 260 },
        data: { nome: f.nome, etapas: stageNames },
        draggable: true,
      });
    });
    if (categorias.length > 0) {
      out.push({
        id: "categorias", type: "categorias",
        position: { x: 0, y: comercialFunis.length * 260 + 40 },
        data: { categorias },
        draggable: true,
      });
    }
    departamentosAtivos.forEach((d, i) => {
      const qtd = rows.filter((r) => r.os_departamento_id === d.id).length;
      out.push({
        id: `dep:${d.id}`, type: "departamento",
        position: { x: 520, y: i * 90 },
        data: { nome: d.nome, qtd },
        draggable: true,
      });
    });
    return out;
  }, [comercialFunis, categorias, departamentosAtivos, rows]);

  // ─── Monta arestas a partir das conexões salvas ────────────────────────
  const edges: Edge[] = useMemo(() => {
    return rows.map((row) => {
      const source = row.gatilho_tipo === "funil_etapa" ? `funil:${row.gatilho_funil_id}` : "categorias";
      const sourceHandle = row.gatilho_tipo === "funil_etapa" ? `etapa:${row.gatilho_etapa_idx}` : `cat:${row.gatilho_categoria}`;
      return {
        id: row.id, type: "conexao",
        source, sourceHandle, target: `dep:${row.os_departamento_id}`,
        style: { stroke: row.ativo ? "var(--color-primary-blue)" : "var(--color-text-faint)", strokeWidth: 2, strokeDasharray: row.ativo ? undefined : "4 4" },
        data: { onDelete: () => handleDelete(row) },
      } as Edge;
    });
  }, [rows, handleDelete]);

  // ─── Nova conexão arrastada na tela ─────────────────────────────────────
  const onConnect = useCallback(async (conn: Connection) => {
    if (!supabase || !activeTenantId || !conn.source || !conn.target || !conn.sourceHandle) return;

    const dep = departamentosAtivos.find((d) => `dep:${d.id}` === conn.target);
    if (!dep) return;

    let payload: Partial<ConnectionRow> & { nome: string };
    if (conn.source === "categorias") {
      const cat = conn.sourceHandle.replace(/^cat:/, "");
      payload = { nome: `${cat} → ${dep.nome}`, gatilho_tipo: "produto_categoria", gatilho_categoria: cat, os_departamento_id: dep.id };
    } else {
      const funilId = conn.source.replace(/^funil:/, "");
      const funil = comercialFunis.find((f) => f.id === funilId);
      const idx = Number(conn.sourceHandle.replace(/^etapa:/, ""));
      const etapaNome = funil ? funilStageNames(funil)[idx] : String(idx);
      payload = { nome: `${etapaNome} → ${dep.nome}`, gatilho_tipo: "funil_etapa", gatilho_funil_id: funilId, gatilho_etapa_idx: idx, os_departamento_id: dep.id };
    }

    const { data, error } = await supabase.from("automation_connections").insert({
      tenant_id: activeTenantId, ativo: true, ...payload,
    }).select().maybeSingle();
    if (error || !data) { toast.error("Não foi possível criar a conexão."); return; }
    setRows((prev) => [data as ConnectionRow, ...prev]);
    toast.success(`Conectado: ${payload.nome}`);
  }, [activeTenantId, departamentosAtivos, comercialFunis]);

  const onEdgeClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
    const row = rows.find((r) => r.id === edge.id);
    if (!row || !supabase) return;
    supabase.from("automation_connections").update({ ativo: !row.ativo }).eq("id", row.id).then(({ error }) => {
      if (error) { toast.error("Não foi possível atualizar."); return; }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ativo: !r.ativo } : r)));
    });
  }, [rows]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>;
  }

  if (comercialFunis.length === 0 || departamentosAtivos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-10 text-center text-xs text-[var(--color-text-faint)]">
        {comercialFunis.length === 0
          ? "Nenhum funil comercial encontrado no CRM."
          : "Nenhum departamento ativo na Operação — crie um em Configurações › Operação › Funis."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Arraste uma linha de uma etapa (ou categoria) até um departamento pra criar a conexão. Clique numa linha pra pausar/reativar; no "×" no meio dela pra remover.
      </p>
      <div style={{ height: "65vh" }} className="w-full rounded-2xl overflow-hidden border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          defaultEdgeOptions={{ type: "conexao" }}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <svg style={{ position: "absolute", top: 0, left: 0 }}>
            <defs>
              <marker id="automacao-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary-blue)" />
              </marker>
            </defs>
          </svg>
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
