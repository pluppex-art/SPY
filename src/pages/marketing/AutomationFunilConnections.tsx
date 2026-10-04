import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, Panel, Handle, Position, EdgeLabelRenderer, getBezierPath,
  useNodesState, type Node, type Edge, type NodeProps, type EdgeProps, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Workflow, Tag, Building2, X, Loader2, LayoutGrid, Info, Search, Trash2, Power,
  Users, Briefcase, Gauge, Grid2x2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useData } from "../../contexts/DataContext";
import { useOS } from "../os/hooks/useOS";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import {
  PALETA, CATEGORIAS_ORDEM, ACAO_LABEL, ACAO_ICON, resumoAcao,
  CONDICAO_CAMPOS, CONDICAO_OPERADORES_NUMERO, CONDICAO_OPERADORES_TEXTO,
  type AcaoTipo, type CondicaoConfig,
} from "./automationWorkflowTypes";

interface ConnectionRow {
  id: string;
  nome: string;
  ativo: boolean;
  gatilho_tipo: "funil_etapa" | "produto_categoria";
  gatilho_funil_id: string | null;
  gatilho_etapa_idx: number | null;
  gatilho_categoria: string | null;
  os_departamento_id: string;
  condicao: CondicaoConfig | null;
}

interface AcaoRow {
  id: string;
  connection_id: string;
  ordem: number;
  tipo: AcaoTipo;
  config: Record<string, any>;
}

function funilStageNames(funil: any): string[] {
  if (Array.isArray(funil?.etapasConfig)) return funil.etapasConfig.map((e: any) => e.nome);
  return Array.isArray(funil?.etapas) ? funil.etapas : [];
}

const ROW_H = 28;
const HEADER_H = 40;

// ── Nó: funil do CRM, uma linha (e um handle de saída) por etapa ───────────
function FunilNode({ data }: NodeProps) {
  const { nome, etapas, tipo } = data as unknown as { nome: string; etapas: string[]; tipo?: string };
  return (
    <div className="rounded-xl border-2 border-[var(--color-primary-blue)]/30 bg-[var(--color-surface-elevated)] shadow-md w-60 overflow-hidden">
      <div className="px-3 py-2 bg-[var(--color-primary-blue)]/10 border-b border-[var(--color-primary-blue)]/20 flex items-center gap-1.5">
        <Workflow className="w-3.5 h-3.5 text-[var(--color-primary-blue)] shrink-0" />
        <span className="text-[11px] font-bold text-[var(--color-text-primary)] truncate flex-1">{nome}</span>
        {tipo && (
          <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]">
            {tipo === "sdr_ia" ? "SDR" : "Comercial"}
          </span>
        )}
      </div>
      <div>
        {etapas.map((nomeEtapa, idx) => (
          <div key={idx} className="relative px-3 flex items-center text-[10px] text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)] last:border-0" style={{ height: ROW_H }}>
            <span className="truncate">{nomeEtapa}</span>
            <Handle
              type="source" id={`etapa:${idx}`} position={Position.Right}
              style={{ top: "50%", transform: "translateY(-50%)" }}
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
        {categorias.map((cat) => (
          <div key={cat} className="relative px-3 flex items-center text-[10px] text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)] last:border-0" style={{ height: ROW_H }}>
            <span className="truncate">{cat}</span>
            <Handle
              type="source" id={`cat:${cat}`} position={Position.Right}
              style={{ top: "50%", transform: "translateY(-50%)" }}
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
  const { leads, funis, products } = useData();
  const { departamentos: osDepartamentos, ordens: ordensOS } = useOS();

  const [rows, setRows] = useState<ConnectionRow[]>([]);
  const [acoes, setAcoes] = useState<AcaoRow[]>([]);
  const [execucoes, setExecucoes] = useState<{ status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [abaSidebar, setAbaSidebar] = useState<"componentes" | "propriedades">("componentes");
  const [busca, setBusca] = useState("");
  const [leadTesteId, setLeadTesteId] = useState<string | null>(null);
  const [buscaLead, setBuscaLead] = useState("");

  // Qualquer funil ativo do CRM pode ser origem — antes só entrava "comercial",
  // deixando o funil de SDR de fora sem motivo real (o gatilho no banco,
  // trg_automacao_lead_etapa, já casa por stageId genérico, não por tipo).
  const funisOrigem = useMemo(() => (funis as any[]).filter((f) => f.ativo !== false), [funis]);
  const categorias = useMemo(
    () => [...new Set((products as any[]).map((p) => p.category).filter(Boolean))].sort(),
    [products]
  );
  const departamentosAtivos = useMemo(() => (osDepartamentos as any[]).filter((d) => d.ativo), [osDepartamentos]);

  const fetchRows = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const [{ data, error }, { data: acoesData }, { data: execData }] = await Promise.all([
      supabase.from("automation_connections").select("*").order("created_at", { ascending: false }),
      supabase.from("automation_connection_acoes").select("*").order("ordem", { ascending: true }),
      supabase.from("automation_connection_execucoes").select("status").order("created_at", { ascending: false }).limit(500),
    ]);
    if (!error) setRows((data as ConnectionRow[]) || []);
    setAcoes((acoesData as AcaoRow[]) || []);
    setExecucoes((execData as { status: string }[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  // ─── KPIs (todos reais: dado já carregado no app, ou contado nas tabelas
  // novas da migration automation_connection_multistep) ───────────────────
  const leadsNoFunil = useMemo(() => (leads as any[]).filter((l) => l.status !== "Fechado" && l.status !== "Perdido").length, [leads]);
  const osCriadasPorAutomacao = useMemo(
    () => (ordensOS as any[]).filter((o) => o.origemTipo === "lead_stage" || o.origemTipo === "proposal_categoria").length,
    [ordensOS]
  );
  const conexoesAtivasCount = rows.filter((r) => r.ativo).length;
  const departamentosAtivosIds = useMemo(() => new Set((osDepartamentos as any[]).filter((d) => d.ativo).map((d) => d.id)), [osDepartamentos]);
  const departamentosCobertosPct = useMemo(() => {
    if (departamentosAtivosIds.size === 0) return null;
    const cobertos = new Set(rows.filter((r) => r.ativo).map((r) => r.os_departamento_id));
    const cobertosNosAtivos = [...cobertos].filter((id) => departamentosAtivosIds.has(id)).length;
    return Math.round((cobertosNosAtivos / departamentosAtivosIds.size) * 1000) / 10;
  }, [rows, departamentosAtivosIds]);
  const taxaSucessoExecucoes = useMemo(() => {
    if (execucoes.length === 0) return null;
    return Math.round((execucoes.filter((e) => e.status === "sucesso").length / execucoes.length) * 1000) / 10;
  }, [execucoes]);

  // Leads reais pro "Testar Fluxo" — prioriza quem já está na etapa que dispara a
  // conexão selecionada (caso mais útil de testar), senão qualquer lead por nome.
  // (Hook precisa ficar antes do `return` de "sem funil/departamento" mais abaixo —
  // nunca chamar hook depois de um return condicional.)
  const leadsParaTeste = useMemo(() => {
    const selecionada = rows.find((r) => r.id === selectedId) ?? null;
    const q = buscaLead.trim().toLowerCase();
    const todos = (leads as any[]).filter((l) => !q || (l.name || "").toLowerCase().includes(q) || (l.company || "").toLowerCase().includes(q));
    if (selecionada?.gatilho_tipo === "funil_etapa") {
      const stageIdAlvo = `${selecionada.gatilho_funil_id}-${selecionada.gatilho_etapa_idx}`;
      todos.sort((a, b) => (b.stageId === stageIdAlvo ? 1 : 0) - (a.stageId === stageIdAlvo ? 1 : 0));
    }
    return todos.slice(0, 30);
  }, [leads, buscaLead, rows, selectedId]);

  const handleDelete = useCallback(async (row: ConnectionRow) => {
    if (!(await confirmDialog({ title: "Remover conexão", description: `Remover "${row.nome}"? Essa ação não pode ser desfeita.` }))) return;
    if (!supabase) return;
    const { error } = await supabase.from("automation_connections").delete().eq("id", row.id);
    if (error) { toast.error("Não foi possível remover."); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setSelectedId((prev) => (prev === row.id ? null : prev));
    toast.success("Conexão removida.");
  }, []);

  // ─── Monta nós (posição calculada pela ALTURA real de cada um — não um
  // espaçamento fixo) ─────────────────────────────────────────────────────
  // Achado real (print do usuário): com espaçamento fixo de 260px, um funil
  // com mais de ~8 etapas (40 + 8*28 = 264px) já é mais alto que isso e o
  // próximo nó (categorias, ou o funil seguinte) nascia sobreposto em cima
  // dele. Agora cada nó empilha a partir do Y real = fim do anterior.
  const computedNodes: Node[] = useMemo(() => {
    const out: Node[] = [];
    let y = 0;
    funisOrigem.forEach((f) => {
      const stageNames = funilStageNames(f);
      out.push({
        id: `funil:${f.id}`, type: "funil",
        position: { x: 0, y },
        data: { nome: f.nome, etapas: stageNames, tipo: f.tipo },
        draggable: true,
      });
      y += HEADER_H + stageNames.length * ROW_H + 24;
    });
    if (categorias.length > 0) {
      out.push({
        id: "categorias", type: "categorias",
        position: { x: 0, y },
        data: { categorias },
        draggable: true,
      });
      y += HEADER_H + categorias.length * ROW_H + 24;
    }
    departamentosAtivos.forEach((d, i) => {
      const qtd = rows.filter((r) => r.os_departamento_id === d.id).length;
      out.push({
        id: `dep:${d.id}`, type: "departamento",
        position: { x: 560, y: i * 90 },
        data: { nome: d.nome, qtd },
        draggable: true,
      });
    });
    return out;
  }, [funisOrigem, categorias, departamentosAtivos, rows]);

  // Estado "de verdade" dos nós (React Flow precisa disso pra arrastar um nó
  // e ele FICAR onde foi solto — sem isso, qualquer recálculo de `rows`
  // (criar/pausar/remover uma conexão) descartava a posição arrastada e o
  // nó voltava pro lugar calculado, parecendo um bug de arrastar "não
  // funciona"). Um nó já existente mantém a posição atual; só ganha posição
  // nova (a calculada) na primeira vez que aparece.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(computedNodes);
  useEffect(() => {
    setNodes((prev) => {
      const porId = new Map(prev.map((n) => [n.id, n]));
      return computedNodes.map((n) => {
        const existente = porId.get(n.id);
        return existente ? { ...n, position: existente.position } : n;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedNodes]);
  const reorganizar = useCallback(() => setNodes(computedNodes), [computedNodes, setNodes]);

  // ─── Monta arestas a partir das conexões salvas ────────────────────────
  const edges: Edge[] = useMemo(() => {
    return rows.map((row) => {
      const source = row.gatilho_tipo === "funil_etapa" ? `funil:${row.gatilho_funil_id}` : "categorias";
      const sourceHandle = row.gatilho_tipo === "funil_etapa" ? `etapa:${row.gatilho_etapa_idx}` : `cat:${row.gatilho_categoria}`;
      const selecionada = row.id === selectedId;
      return {
        id: row.id, type: "conexao",
        source, sourceHandle, target: `dep:${row.os_departamento_id}`,
        style: {
          stroke: selecionada ? "#f59e0b" : row.ativo ? "var(--color-primary-blue)" : "var(--color-text-faint)",
          strokeWidth: selecionada ? 3 : 2,
          strokeDasharray: row.ativo ? undefined : "4 4",
        },
        data: { onDelete: () => handleDelete(row) },
      } as Edge;
    });
  }, [rows, selectedId, handleDelete]);

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
      const funil = funisOrigem.find((f) => f.id === funilId);
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
  }, [activeTenantId, departamentosAtivos, funisOrigem]);

  // Clicar numa linha agora SELECIONA a conexão (abre o painel de Propriedades
  // à esquerda, com condição + ações) em vez de pausar direto — pausar virou
  // um botão explícito dentro do painel, pra não confundir "clique pra ver" com
  // "clique pra desligar" quando a conexão passou a ter mais coisa configurável.
  const onEdgeClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
    setSelectedId(edge.id);
    setAbaSidebar("propriedades");
  }, []);

  const toggleAtivo = useCallback(async (row: ConnectionRow) => {
    if (!supabase) return;
    const { error } = await supabase.from("automation_connections").update({ ativo: !row.ativo }).eq("id", row.id);
    if (error) { toast.error("Não foi possível atualizar."); return; }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ativo: !r.ativo } : r)));
  }, []);

  const salvarCondicao = useCallback(async (connectionId: string, condicao: CondicaoConfig | null) => {
    if (!supabase) return;
    const { error } = await supabase.from("automation_connections").update({ condicao }).eq("id", connectionId);
    if (error) { toast.error("Não foi possível salvar a condição."); return; }
    setRows((prev) => prev.map((r) => (r.id === connectionId ? { ...r, condicao } : r)));
    toast.success("Condição salva.");
  }, []);

  const adicionarAcao = useCallback(async (connectionId: string, tipo: AcaoTipo) => {
    if (!supabase || !activeTenantId) return;
    const ordem = acoes.filter((a) => a.connection_id === connectionId).length;
    const { data, error } = await supabase.from("automation_connection_acoes")
      .insert({ tenant_id: activeTenantId, connection_id: connectionId, ordem, tipo, config: {} })
      .select().maybeSingle();
    if (error || !data) { toast.error("Não foi possível adicionar a ação."); return; }
    setAcoes((prev) => [...prev, data as AcaoRow]);
  }, [activeTenantId, acoes]);

  const removerAcao = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("automation_connection_acoes").delete().eq("id", id);
    if (error) { toast.error("Não foi possível remover."); return; }
    setAcoes((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const salvarConfigAcao = useCallback(async (id: string, config: Record<string, any>) => {
    if (!supabase) return;
    setAcoes((prev) => prev.map((a) => (a.id === id ? { ...a, config } : a)));
    const { error } = await supabase.from("automation_connection_acoes").update({ config }).eq("id", id);
    if (error) toast.error("Não foi possível salvar.");
  }, []);

  const handlePaletaClick = useCallback((item: typeof PALETA[number]) => {
    if (!item.acaoTipo && !item.isCondicao) {
      toast.message("Arraste uma etapa do funil (ou categoria) até um departamento no canvas pra criar esse gatilho.");
      return;
    }
    if (!selectedId) {
      toast.error("Selecione uma conexão no canvas primeiro (clique numa linha).");
      return;
    }
    if (item.isCondicao) { setAbaSidebar("propriedades"); return; }
    if (item.acaoTipo) adicionarAcao(selectedId, item.acaoTipo);
    setAbaSidebar("propriedades");
  }, [selectedId, adicionarAcao]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>;
  }

  if (funisOrigem.length === 0 || departamentosAtivos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-10 text-center text-xs text-[var(--color-text-faint)]">
        {funisOrigem.length === 0
          ? "Nenhum funil encontrado no CRM."
          : "Nenhum departamento ativo na Operação — crie um em Configurações › Operação › Funis."}
      </div>
    );
  }

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const selectedAcoes = acoes.filter((a) => a.connection_id === selectedId);
  const leadTeste = (leads as any[]).find((l) => l.id === leadTesteId) ?? null;
  const paletaFiltrada = PALETA.filter((p) => !busca.trim() || p.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      {/* KPIs — tudo real: leads/pipeline já carregados no app, OS/execuções contadas nas
          tabelas da automação (ver migration automation_connection_multistep). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Users className="w-3.5 h-3.5" /><span className="text-[9px] font-black uppercase tracking-wider">Leads no funil</span></div>
          <p className="text-xl font-black text-[var(--color-text-primary)] font-mono mt-1.5">{leadsNoFunil}</p>
        </Card>
        <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Briefcase className="w-3.5 h-3.5" /><span className="text-[9px] font-black uppercase tracking-wider">OS criadas por automação</span></div>
          <p className="text-xl font-black text-[var(--color-text-primary)] font-mono mt-1.5">{osCriadasPorAutomacao}</p>
        </Card>
        <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Power className="w-3.5 h-3.5" /><span className="text-[9px] font-black uppercase tracking-wider">Conexões ativas</span></div>
          <p className="text-xl font-black text-[var(--color-text-primary)] font-mono mt-1.5">{conexoesAtivasCount}</p>
        </Card>
        <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Grid2x2 className="w-3.5 h-3.5" /><span className="text-[9px] font-black uppercase tracking-wider">Departamentos cobertos</span></div>
          <p className="text-xl font-black text-[var(--color-text-primary)] font-mono mt-1.5">{departamentosCobertosPct !== null ? `${departamentosCobertosPct}%` : "—"}</p>
        </Card>
        <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Gauge className="w-3.5 h-3.5" /><span className="text-[9px] font-black uppercase tracking-wider">Taxa de sucesso</span></div>
          <p className="text-xl font-black text-[var(--color-text-primary)] font-mono mt-1.5">{taxaSucessoExecucoes !== null ? `${taxaSucessoExecucoes}%` : "—"}</p>
          {execucoes.length === 0 && <p className="text-[9px] text-[var(--color-text-faint)] mt-0.5">Ainda sem execuções registradas</p>}
        </Card>
      </div>

      <p className="text-[11px] text-[var(--color-text-muted)]">
        Arraste uma linha de uma etapa (ou categoria) até um departamento pra criar a conexão. Clique numa linha pra selecioná-la e configurar condição/ações; no "×" no meio dela pra remover.
      </p>

      <div className="flex gap-3" style={{ height: "68vh" }}>
        {/* Sidebar: Componentes / Propriedades */}
        <div className="w-[270px] shrink-0 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] overflow-hidden flex flex-col">
          <div className="flex border-b border-[var(--color-border-subtle)]">
            {(["componentes", "propriedades"] as const).map((v) => (
              <button
                key={v} type="button" onClick={() => setAbaSidebar(v)}
                className={cn(
                  "flex-1 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide border-b-2 transition-colors",
                  abaSidebar === v ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]" : "border-transparent text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]"
                )}
              >
                {v === "componentes" ? "Componentes" : "Propriedades"}
              </button>
            ))}
          </div>

          {abaSidebar === "componentes" ? (
            <div className="flex-1 overflow-y-auto">
              <div className="p-2.5 sticky top-0 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border-subtle)]">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-faint)]" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar componente..." className="w-full pl-7 pr-2 py-1.5 text-[11px] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] focus:outline-none focus:border-[var(--color-primary-blue)]/50" />
                </div>
              </div>
              <div className="p-2">
                {CATEGORIAS_ORDEM.map((cat) => {
                  const itens = paletaFiltrada.filter((p) => p.categoria === cat);
                  if (itens.length === 0) return null;
                  return (
                    <div key={cat} className="mb-3">
                      <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-faint)] px-1.5 mb-1">{cat}</p>
                      {itens.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handlePaletaClick(item)}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[var(--color-surface-sunken)] transition-colors text-left"
                        >
                          <span className="w-7 h-7 rounded-lg bg-[var(--color-primary-blue)]/10 flex items-center justify-center shrink-0"><item.icon className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /></span>
                          <span className="min-w-0">
                            <span className="block text-[11px] font-bold text-[var(--color-text-primary)] truncate">{item.nome}</span>
                            <span className="block text-[9px] text-[var(--color-text-faint)] truncate">{item.descricao}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3">
              {!selected ? (
                <p className="text-[11px] text-[var(--color-text-faint)] italic p-3 text-center">Clique numa linha do canvas pra ver/editar a conexão.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-black text-[var(--color-text-primary)] leading-snug">{selected.nome}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button" onClick={() => toggleAtivo(selected)}
                        className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold", selected.ativo ? "bg-success/10 text-success" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)]")}
                      >
                        <Power className="w-2.5 h-2.5" /> {selected.ativo ? "Ativa" : "Pausada"}
                      </button>
                      <button type="button" onClick={() => handleDelete(selected)} className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold text-danger hover:bg-danger/10">
                        <Trash2 className="w-2.5 h-2.5" /> Remover
                      </button>
                    </div>
                  </div>

                  <CondicaoEditor connection={selected} onSave={salvarCondicao} />

                  <div>
                    <p className="text-[9px] font-black uppercase text-[var(--color-text-faint)] mb-1.5">Ações {selectedAcoes.length === 0 && <span className="normal-case font-semibold">(nenhuma — cria só a OS, como sempre)</span>}</p>
                    <div className="space-y-2">
                      {selectedAcoes.map((acao) => (
                        <AcaoCard key={acao.id} acao={acao} funisOrigem={funisOrigem} onRemove={removerAcao} onSaveConfig={salvarConfigAcao} />
                      ))}
                    </div>
                    <p className="text-[9px] text-[var(--color-text-faint)] mt-2">Use a aba "Componentes" pra adicionar mais ações a essa conexão.</p>
                  </div>

                  <div>
                    <p className="text-[9px] font-black uppercase text-[var(--color-text-faint)] mb-1.5">Testar Fluxo</p>
                    <div className="relative mb-1.5">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-faint)]" />
                      <input
                        value={buscaLead} onChange={(e) => setBuscaLead(e.target.value)}
                        placeholder="Buscar lead pra simular..."
                        className="w-full pl-7 pr-2 py-1.5 text-[11px] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] focus:outline-none focus:border-[var(--color-primary-blue)]/50"
                      />
                    </div>
                    <select
                      value={leadTesteId ?? ""} onChange={(e) => setLeadTesteId(e.target.value || null)}
                      className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] mb-1.5"
                    >
                      <option value="">Escolha um lead...</option>
                      {leadsParaTeste.map((l: any) => <option key={l.id} value={l.id}>{l.company || l.name}</option>)}
                    </select>
                    <TestarFluxoPanel
                      connection={selected} itens={selectedAcoes} lead={leadTeste}
                      departamentosAtivos={departamentosAtivos} funisOrigem={funisOrigem} activeTenantId={activeTenantId}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onPaneClick={() => setSelectedId(null)}
            defaultEdgeOptions={{ type: "conexao" }}
            minZoom={0.2}
            maxZoom={1.5}
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
            <MiniMap
              pannable zoomable
              nodeColor={(n) => (n.type === "funil" ? "#2563EB" : n.type === "categorias" ? "#f59e0b" : "#10b981")}
              maskColor="rgba(0,0,0,0.06)"
              style={{ backgroundColor: "var(--color-surface-elevated)" }}
            />
            <Panel position="top-right" className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={reorganizar}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[10px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] shadow-sm"
                title="Reorganizar os nós no layout automático"
              >
                <LayoutGrid className="w-3 h-3" /> Reorganizar
              </button>
              <div className="flex flex-col gap-1 px-2.5 py-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] shadow-sm text-[9px] text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1.5 font-bold text-[var(--color-text-faint)] uppercase tracking-wide"><Info className="w-2.5 h-2.5" /> Legenda</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)]" /> Funil do CRM (etapa)</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" /> Categoria de produto</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" /> Departamento (OS)</span>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

function CondicaoEditor({ connection, onSave }: { connection: ConnectionRow; onSave: (id: string, condicao: CondicaoConfig | null) => void }) {
  const [campo, setCampo] = useState(connection.condicao?.campo ?? "");
  const [operador, setOperador] = useState(connection.condicao?.operador ?? "maior");
  const [valor, setValor] = useState(connection.condicao?.valor ?? "");

  useEffect(() => {
    setCampo(connection.condicao?.campo ?? "");
    setOperador(connection.condicao?.operador ?? "maior");
    setValor(connection.condicao?.valor ?? "");
  }, [connection.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const campoInfo = CONDICAO_CAMPOS.find((c) => c.id === campo);
  const operadores = campoInfo?.tipo === "texto" ? CONDICAO_OPERADORES_TEXTO : CONDICAO_OPERADORES_NUMERO;

  const salvar = () => {
    if (!campo) { onSave(connection.id, null); return; }
    onSave(connection.id, { campo, operador, valor });
  };

  return (
    <div>
      <p className="text-[9px] font-black uppercase text-[var(--color-text-faint)] mb-1.5">Condição (opcional)</p>
      <div className="space-y-1.5">
        <select value={campo} onChange={(e) => { setCampo(e.target.value); setOperador("maior"); }} className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
          <option value="">Sem condição — sempre roda</option>
          {CONDICAO_CAMPOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {campo && (
          <div className="flex gap-1.5">
            <select value={operador} onChange={(e) => setOperador(e.target.value)} className="flex-1 text-[11px] px-2 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
              {operadores.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="valor" className="w-20 text-[11px] px-2 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]" />
          </div>
        )}
        <Button size="sm" variant="outline" onClick={salvar} className="h-7 w-full text-[10px] font-bold">Salvar condição</Button>
      </div>
    </div>
  );
}

const ACAO_CAMPO_PRINCIPAL: Partial<Record<AcaoTipo, { chave: string; label: string; placeholder: string; textarea?: boolean }>> = {
  tarefa: { chave: "titulo", label: "Título da tarefa", placeholder: "Ex.: Ligar pro cliente" },
  notificar: { chave: "titulo", label: "Título da notificação", placeholder: "Ex.: Novo lead quente" },
  mensagem: { chave: "texto", label: "Texto da mensagem (WhatsApp)", placeholder: "Ex.: Olá! Vi que você...", textarea: true },
};

function AcaoCard({ acao, funisOrigem, onRemove, onSaveConfig }: {
  acao: AcaoRow;
  funisOrigem: any[];
  onRemove: (id: string) => void;
  onSaveConfig: (id: string, config: Record<string, any>) => void;
}) {
  const Icon = ACAO_ICON[acao.tipo];
  const campoPrincipal = ACAO_CAMPO_PRINCIPAL[acao.tipo];
  const [valor, setValor] = useState(campoPrincipal ? (acao.config?.[campoPrincipal.chave] ?? "") : "");
  const [chave, setChave] = useState(acao.config?.chave ?? "");
  const [valorCrm, setValorCrm] = useState(acao.config?.valor ?? "");
  const [funilDestinoId, setFunilDestinoId] = useState(acao.config?.funil_destino_id ?? "");
  const [etapaIdx, setEtapaIdx] = useState(acao.config?.etapa_idx ?? "");

  const funilDestino = funisOrigem.find((f) => f.id === funilDestinoId);
  const etapasDestino: string[] = funilDestino ? (funilDestino.etapasConfig?.map((e: any) => e.nome) ?? funilDestino.etapas ?? []) : [];

  const salvarMoverFunil = (novoFunilId: string, novoEtapaIdx: string) => {
    const funil = funisOrigem.find((f) => f.id === novoFunilId);
    if (!funil || novoEtapaIdx === "") {
      onSaveConfig(acao.id, { ...acao.config, funil_destino_id: novoFunilId, etapa_idx: novoEtapaIdx });
      return;
    }
    onSaveConfig(acao.id, {
      ...acao.config,
      funil_destino_id: novoFunilId,
      etapa_idx: novoEtapaIdx,
      pipeline_id: funil.tipo === "sdr_ia" ? "sdr" : "comercial",
      etapa_id: `${funil.id}-${novoEtapaIdx}`,
    });
  };

  return (
    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-2.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-primary)]"><Icon className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> {ACAO_LABEL[acao.tipo]}</span>
        <button type="button" onClick={() => onRemove(acao.id)} className="text-[var(--color-text-faint)] hover:text-danger"><X className="w-3 h-3" /></button>
      </div>

      {campoPrincipal && (
        campoPrincipal.textarea ? (
          <textarea
            value={valor} rows={2}
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => onSaveConfig(acao.id, { ...acao.config, [campoPrincipal.chave]: valor })}
            placeholder={campoPrincipal.placeholder}
            className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] resize-y"
          />
        ) : (
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => onSaveConfig(acao.id, { ...acao.config, [campoPrincipal.chave]: valor })}
            placeholder={campoPrincipal.placeholder}
            className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]"
          />
        )
      )}

      {acao.tipo === "crm_update" && (
        <div className="flex gap-1.5">
          <input value={chave} onChange={(e) => setChave(e.target.value)} onBlur={() => onSaveConfig(acao.id, { ...acao.config, chave, valor: valorCrm })} placeholder="campo" className="w-1/2 text-[11px] px-2 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]" />
          <input value={valorCrm} onChange={(e) => setValorCrm(e.target.value)} onBlur={() => onSaveConfig(acao.id, { ...acao.config, chave, valor: valorCrm })} placeholder="valor" className="w-1/2 text-[11px] px-2 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]" />
        </div>
      )}

      {acao.tipo === "mover_funil" && (
        <div className="space-y-1.5">
          <select value={funilDestinoId} onChange={(e) => { setFunilDestinoId(e.target.value); setEtapaIdx(""); salvarMoverFunil(e.target.value, ""); }} className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]">
            <option value="">Funil de destino...</option>
            {funisOrigem.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          {funilDestino && (
            <select value={etapaIdx} onChange={(e) => { setEtapaIdx(e.target.value); salvarMoverFunil(funilDestinoId, e.target.value); }} className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]">
              <option value="">Etapa de destino...</option>
              {etapasDestino.map((nome, idx) => <option key={idx} value={idx}>{nome}</option>)}
            </select>
          )}
        </div>
      )}

      {(acao.tipo === "criar_os" || acao.tipo === "api_call") && (
        <p className="text-[10px] text-[var(--color-text-muted)]">{resumoAcao(acao.tipo, acao.config)}</p>
      )}
    </div>
  );
}

// ─── Testar Fluxo: simulação no navegador, sem nenhum efeito real (nenhuma
// mensagem sai, nenhuma tarefa/OS/notificação é criada) — só lê dados reais
// (lead escolhido, instância de WhatsApp conectada, integrações externas
// ativas) pra mostrar com precisão o que ACONTECERIA se a conexão rodasse
// agora pra aquele lead. Espelha a mesma lógica de avaliar_condicao_automacao
// e executar_automacao_connection do banco, só que sem gravar nada. ──────────
interface ResultadoTesteItem { tipo: AcaoTipo; texto: string; aviso?: string }
interface ResultadoTeste { condicaoPassou: boolean; condicaoTexto: string; itens: ResultadoTesteItem[] }

function avaliarCondicaoCliente(condicao: CondicaoConfig | null, lead: any): { passou: boolean; texto: string } {
  if (!condicao || !condicao.campo) return { passou: true, texto: "Sem condição — a sequência sempre roda." };
  const campoInfo = CONDICAO_CAMPOS.find((c) => c.id === condicao.campo);
  const labelCampo = campoInfo?.label ?? condicao.campo;
  const labelOperador = [...CONDICAO_OPERADORES_NUMERO, ...CONDICAO_OPERADORES_TEXTO].find((o) => o.id === condicao.operador)?.label ?? condicao.operador;
  const descricao = `${labelCampo} ${labelOperador} ${condicao.valor}`;
  if (condicao.campo === "origem") {
    const atual = String(lead?.source ?? "").toLowerCase();
    const alvo = condicao.valor.toLowerCase();
    const passou = condicao.operador === "contem" ? atual.includes(alvo) : atual === alvo;
    return { passou, texto: `${descricao} — origem do lead é "${lead?.source ?? "—"}".` };
  }
  const atualMap: Record<string, number> = { scoreIA: Number(lead?.scoreIA ?? 0), timeIdle: Number(lead?.timeIdle ?? 0), valor: Number(lead?.value ?? 0) };
  const atual = atualMap[condicao.campo] ?? 0;
  const alvoNum = Number(condicao.valor);
  const passou = Number.isNaN(alvoNum) ? true : condicao.operador === "maior" ? atual > alvoNum : condicao.operador === "menor" ? atual < alvoNum : atual === alvoNum;
  return { passou, texto: `${descricao} — valor atual do lead é ${atual}.` };
}

function TestarFluxoPanel({ connection, itens, lead, departamentosAtivos, funisOrigem, activeTenantId }: {
  connection: ConnectionRow;
  itens: AcaoRow[];
  lead: any | null;
  departamentosAtivos: any[];
  funisOrigem: any[];
  activeTenantId: string | null;
}) {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoTeste | null>(null);

  const rodar = useCallback(async () => {
    if (!lead) { toast.error("Escolha um lead pra simular o teste."); return; }
    setRodando(true);
    const condicaoResult = avaliarCondicaoCliente(connection.condicao, lead);
    const acoesParaRodar = itens.length > 0 ? itens : [{ id: "default", connection_id: connection.id, ordem: 0, tipo: "criar_os" as AcaoTipo, config: {} }];

    // Checagens reais e read-only (não alteram nada) pra avisar quando uma ação
    // configurada não teria como funcionar agora (sem instância de WhatsApp
    // conectada, por exemplo) — sem isso o teste "passaria" mesmo quando a
    // automação real falharia silenciosamente.
    let temInstanciaWhatsapp = false;
    let qtdIntegracoesApi = 0;
    if (supabase && activeTenantId) {
      const [{ count: instCount }, { count: intCount }] = await Promise.all([
        supabase.from("whatsapp_instances").select("id", { count: "exact", head: true }).eq("tenant_id", activeTenantId).eq("status", "CONNECTED"),
        supabase.from("external_integrations").select("id", { count: "exact", head: true }).eq("tenant_id", activeTenantId).eq("active", true).contains("sync_events", [`Automação: ${connection.nome}`]),
      ]);
      temInstanciaWhatsapp = (instCount ?? 0) > 0;
      qtdIntegracoesApi = intCount ?? 0;
    }

    const itensResultado: ResultadoTesteItem[] = condicaoResult.passou
      ? acoesParaRodar.map((acao) => {
          const dep = departamentosAtivos.find((d) => d.id === (acao.config?.departamento_id || connection.os_departamento_id));
          switch (acao.tipo) {
            case "criar_os":
              return { tipo: acao.tipo, texto: `Criaria uma Ordem de Serviço em "${dep?.nome ?? "—"}" pra ${lead.company || lead.name}.` };
            case "tarefa":
              return acao.config?.titulo
                ? { tipo: acao.tipo, texto: `Criaria a tarefa "${acao.config.titulo}" vinculada a ${lead.name}.` }
                : { tipo: acao.tipo, texto: "Criaria uma tarefa.", aviso: "Sem título definido — defina antes de ativar." };
            case "notificar":
              return { tipo: acao.tipo, texto: acao.config?.titulo ? `Notificaria a equipe: "${acao.config.titulo}"` : "Notificaria toda a equipe." };
            case "crm_update":
              return acao.config?.chave
                ? { tipo: acao.tipo, texto: `Gravaria "${acao.config.chave}" = "${acao.config.valor || ""}" no cadastro de ${lead.name}.` }
                : { tipo: acao.tipo, texto: "Atualizaria um campo do lead.", aviso: "Sem campo definido — defina antes de ativar." };
            case "mover_funil": {
              const funil = funisOrigem.find((f) => f.id === acao.config?.funil_destino_id);
              const etapaNome = funil && acao.config?.etapa_idx !== undefined ? (funil.etapasConfig?.map((e: any) => e.nome) ?? funil.etapas ?? [])[Number(acao.config.etapa_idx)] : null;
              return funil && etapaNome
                ? { tipo: acao.tipo, texto: `Moveria ${lead.name} para "${funil.nome}" → "${etapaNome}".` }
                : { tipo: acao.tipo, texto: "Moveria o lead de funil.", aviso: "Sem funil/etapa de destino — defina antes de ativar." };
            }
            case "mensagem":
              return temInstanciaWhatsapp
                ? { tipo: acao.tipo, texto: `Enviaria por WhatsApp pro telefone de ${lead.name}: "${acao.config?.texto || "(sem texto)"}"`, aviso: !lead.phone ? "Esse lead não tem telefone cadastrado — não enviaria nada." : undefined }
                : { tipo: acao.tipo, texto: `Tentaria enviar: "${acao.config?.texto || "(sem texto)"}"`, aviso: "Nenhuma instância de WhatsApp conectada agora — a mensagem falharia." };
            case "api_call":
              return qtdIntegracoesApi > 0
                ? { tipo: acao.tipo, texto: `Dispararia ${qtdIntegracoesApi} integração(ões) externa(s) escutando este evento.` }
                : { tipo: acao.tipo, texto: "Dispararia o evento genérico de automação.", aviso: "Nenhuma integração externa está configurada pra escutar esse evento ainda (Configurações › Integrações)." };
            default:
              return { tipo: acao.tipo, texto: resumoAcao(acao.tipo, acao.config) };
          }
        })
      : [];

    setResultado({ condicaoPassou: condicaoResult.passou, condicaoTexto: condicaoResult.texto, itens: itensResultado });
    setRodando(false);
  }, [connection, itens, lead, departamentosAtivos, funisOrigem, activeTenantId]);

  return (
    <div className="rounded-xl border border-[var(--color-primary-blue)]/25 bg-[var(--color-primary-blue)]/5 p-2.5 space-y-2">
      <Button size="sm" variant="outline" onClick={rodar} disabled={rodando || !lead} className="h-7 w-full text-[10px] font-bold">
        {rodando ? <Loader2 className="w-3 h-3 animate-spin" /> : "Testar fluxo com esse lead"}
      </Button>
      {resultado && (
        <div className="space-y-1.5">
          <p className={cn("text-[10px] font-bold flex items-start gap-1", resultado.condicaoPassou ? "text-success" : "text-danger")}>
            {resultado.condicaoPassou ? "✓" : "✗"} <span className="font-normal">{resultado.condicaoTexto}</span>
          </p>
          {resultado.condicaoPassou && resultado.itens.map((item, i) => (
            <div key={i} className="text-[10px] pl-3 border-l-2 border-[var(--color-border-subtle)]">
              <p className="text-[var(--color-text-primary)]">{item.texto}</p>
              {item.aviso && <p className="text-warning mt-0.5">⚠ {item.aviso}</p>}
            </div>
          ))}
          <p className="text-[9px] text-[var(--color-text-faint)] italic pt-1">Simulação — nada foi enviado ou criado de verdade.</p>
        </div>
      )}
    </div>
  );
}
