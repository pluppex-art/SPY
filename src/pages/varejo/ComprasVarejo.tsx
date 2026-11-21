import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  ClipboardList, FileDown, Plus, Truck, DollarSign,
  CheckCircle2, Clock, Package, Trash2, X, Boxes, ArrowDownCircle
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { useVarejoConfig } from "../../lib/varejoConfig";
import { useData } from "../../contexts/DataContext";
import { supabase } from "../../lib/supabase";
import { FornecedorModal, rowToFornecedor, type FornecedorItem } from "./FornecedorModal";
import { confirmDialog } from "../../components/ui/confirm-dialog";

import { HelpTip } from "../../components/ui/help-tip";
// Status exibido na UI. No banco (`compras.status`) só existem
// 'Pendente' | 'Em Transporte' | 'Recebido no Estoque' | 'Cancelado' — os
// dois primeiros valores da UI ('Emitida...', 'Faturada') mapeiam para 'Pendente'.
type CompraStatusUI = "Emitida / Aguardando Fornecedor" | "Faturada" | "Em Transporte" | "Recebido no Estoque" | "Cancelada";

interface CompraItem {
  id: string;
  fornecedor: string;
  valor: number;
  itens: string;
  data: string;
  previsaoEntrega: string;
  status: CompraStatusUI;
}

function dbStatusToUi(status: string): CompraStatusUI {
  if (status === "Em Transporte") return "Em Transporte";
  if (status === "Recebido no Estoque") return "Recebido no Estoque";
  if (status === "Cancelado") return "Cancelada";
  return "Emitida / Aguardando Fornecedor";
}

function uiStatusToDb(status: CompraStatusUI): string {
  if (status === "Em Transporte") return "Em Transporte";
  if (status === "Recebido no Estoque") return "Recebido no Estoque";
  if (status === "Cancelada") return "Cancelado";
  return "Pendente";
}

function rowToCompra(row: any): CompraItem {
  return {
    id: row.id,
    fornecedor: row.fornecedor,
    valor: Number(row.valor) || 0,
    itens: row.itens || "",
    data: new Date(row.data + "T00:00:00").toLocaleDateString("pt-BR"),
    previsaoEntrega: row.previsao_entrega ? new Date(row.previsao_entrega + "T00:00:00").toLocaleDateString("pt-BR") : "A combinar",
    status: dbStatusToUi(row.status),
  };
}

const inputBase =
  "px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]";

/** Campo de item: abre a lista do catálogo ao focar, filtra enquanto digita e aceita texto livre (item que ainda não existe no estoque). */
function ItemCombobox({
  value, onChange, onPick, produtos,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: any) => void;
  produtos: any[];
}) {
  const [aberto, setAberto] = useState(false);
  const q = value.trim().toLowerCase();
  const opcoes = produtos.filter(p => !q || String(p.name || "").toLowerCase().includes(q)).slice(0, 30);
  const exato = produtos.some(p => String(p.name || "").trim().toLowerCase() === q);
  return (
    <div className="flex-1 min-w-0">
      <input
        value={value}
        placeholder="Digite ou escolha da lista"
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onChange={e => { onChange(e.target.value); setAberto(true); }}
        className={`w-full ${inputBase}`}
      />
      {aberto && (opcoes.length > 0 || q) && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] shadow-sm">
          {q && !exato && (
            <div className="px-3 py-1.5 text-[11px] text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
              Usar <strong className="text-[var(--color-text-primary)]">“{value.trim()}”</strong> como item novo (fora do estoque)
            </div>
          )}
          {opcoes.map(p => (
            <button
              type="button"
              key={p.id}
              onMouseDown={e => { e.preventDefault(); onPick(p); setAberto(false); }}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-sunken)] flex items-center justify-between gap-2"
            >
              <span className="truncate text-[var(--color-text-primary)]">{p.name}</span>
              <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
                Saldo {Number(p.currentStock) || 0}{Number(p.cost) > 0 ? ` • R$ ${Number(p.cost).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ComprasVarejo() {
  const { activeTenantId, activeTenantName } = useAuth();
  const { products, setProducts } = useData();
  const cfgVarejo = useVarejoConfig();
  const location = useLocation();
  const navigate = useNavigate();

  const [compras, setCompras] = useState<CompraItem[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("compras")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("data", { ascending: false });
      if (!cancelled && !error && data) {
        setCompras(data.map(rowToCompra));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFornecedor, setFilterFornecedor] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state para Nova Ordem
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  type Linha = { nome: string; qtd: string; custo: string };
  const linhaVazia = (): Linha => ({ nome: "", qtd: "", custo: "" });
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [fornecedoresCad, setFornecedoresCad] = useState<FornecedorItem[]>([]);
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false);
  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    supabase.from("varejo_fornecedores").select("*").eq("tenant_id", activeTenantId).order("razao_social")
      .then(({ data }) => { if (data) setFornecedoresCad(data.map(rowToFornecedor)); });
  }, [activeTenantId]);
  const setLinha = (i: number, patch: Partial<Linha>) => setLinhas(prev => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const totalLinhas = linhas.reduce((t, l) => t + (parseInt(l.qtd, 10) || 0) * (parseFloat(l.custo.replace(",", ".")) || 0), 0);
  const [previsaoEntrega, setPrevisaoEntrega] = useState("");
  const [status, setStatus] = useState<CompraItem["status"]>("Emitida / Aguardando Fornecedor");

  // Estado para Dar Entrada no Estoque
  const [modalRecebimentoOpen, setModalRecebimentoOpen] = useState(false);
  const [compraRecebimento, setCompraRecebimento] = useState<CompraItem | null>(null);
  const [recebimentoProductId, setRecebimentoProductId] = useState<string>("");
  const [recebimentoQtd, setRecebimentoQtd] = useState<string>("50");

  // Rascunho vindo do Painel de Vendas (Estoque Crítico → Nova Compra): abre a Nova Ordem já preenchida.
  useEffect(() => {
    const r = (location.state as any)?.rascunho;
    if (!r) return;
    setFornecedor(r.fornecedor || "");
    setLinhas(Array.isArray(r.linhas) && r.linhas.length > 0
      ? r.linhas.map((l: any) => ({ nome: l.nome, qtd: String(l.qtd), custo: "" }))
      : [linhaVazia()]);
    if (cfgVarejo.compras.prazoEntregaPadraoDias > 0) {
      const d = new Date(); d.setDate(d.getDate() + cfgVarejo.compras.prazoEntregaPadraoDias);
      setPrevisaoEntrega(d.toISOString().slice(0, 10));
    }
    setModalOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validas = linhas.filter(l => l.nome.trim() || l.qtd.trim());
    if (validas.length === 0 || validas.some(l => !l.nome.trim() || (parseInt(l.qtd, 10) || 0) <= 0)) {
      toast.error("Informe o nome e a quantidade de cada item.");
      return;
    }
    const itens = validas.map(l => `${parseInt(l.qtd, 10)}x ${l.nome.trim()}`).join(", ");
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    const numVal = valor.trim() ? (parseFloat(valor.replace(/[^\d.,]/g, "").replace(",", ".")) || 0) : totalLinhas;

    const { data, error } = await supabase
      .from("compras")
      .insert({
        tenant_id: activeTenantId,
        fornecedor: fornecedor.trim() || "A definir",
        valor: numVal,
        itens,
        previsao_entrega: previsaoEntrega || null,
        status: uiStatusToDb(status),
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      toast.error("Erro ao emitir ordem de compra.");
      return;
    }

    setCompras(prev => [rowToCompra(data), ...prev]);
    toast.success("Ordem de compra emitida!");
    setModalOpen(false);

    setFornecedor("");
    setValor("");
    setLinhas([linhaVazia()]);
    setPrevisaoEntrega("");
  };

  const exportarPdf = async () => {
    if (filtered.length === 0) { toast.error("Nenhuma ordem para exportar."); return; }
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Ordens de Compra & Reposição", 14, 16);
    doc.setFontSize(9);
    doc.text(`${activeTenantName || ""}  •  Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
    const ativasPdf = filtered.filter(c => c.status !== "Cancelada");
    autoTable(doc, {
      startY: 27,
      head: [["Código", "Emissão", "Fornecedor", "Itens", "Previsão", "Status", "Total (R$)"]],
      body: filtered.map(c => [
        `OC-${c.id.slice(0, 6).toUpperCase()}`, c.data, c.fornecedor,
        c.itens.split(/,\s*(?=\d+x )/).join("\n"), c.previsaoEntrega, c.status,
        Number(c.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      ]),
      foot: [["", "", "", "", "", "Total (sem canceladas)", ativasPdf.reduce((t, c) => t + Number(c.valor), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })]],
      styles: { fontSize: 8, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [91, 33, 182] },
      footStyles: { fillColor: [243, 244, 246], textColor: 20 },
      columnStyles: { 3: { cellWidth: 80 }, 6: { halign: "right" } },
    });
    doc.save(`ordens-de-compra-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const compra = compras.find(c => c.id === id);
    if (!(await confirmDialog({
      title: "Cancelar ordem de compra",
      description: `Cancelar a ordem de compra de "${compra?.fornecedor || "este fornecedor"}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("compras").update({ status: "Cancelado" }).eq("id", id);
    if (error) { toast.error("Erro ao cancelar ordem."); return; }
    setCompras(prev => prev.map(c => c.id === id ? { ...c, status: "Cancelada" } : c));
    toast.info("Ordem de compra cancelada.");
  };

  const handleUpdateStatus = async (id: string, newStatus: CompraItem["status"]) => {
    if (!supabase) return;
    const { error } = await supabase.from("compras").update({ status: uiStatusToDb(newStatus) }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status."); return; }
    setCompras(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
    toast.success(`Status da ordem: ${newStatus}`);
  };

  const handleAbrirRecebimento = (c: CompraItem) => {
    setCompraRecebimento(c);
    setRecebimentoProductId(products[0]?.id || "");
    setRecebimentoQtd("50");
    setModalRecebimentoOpen(true);
  };

  const handleConfirmarRecebimento = async () => {
    if (!compraRecebimento) return;
    const qtdNum = parseInt(recebimentoQtd, 10) || 0;
    if (qtdNum <= 0) {
      toast.error("Informe uma quantidade válida para entrada.");
      return;
    }
    if (!supabase) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    // 1. Dar entrada real no estoque (RPC atômica: atualiza products + grava estoque_movimentacoes)
    if (recebimentoProductId) {
      const { error: movError } = await supabase.rpc("registrar_movimentacao_estoque", {
        p_product_id: recebimentoProductId,
        p_tipo: "entrada",
        p_quantidade: qtdNum,
        p_motivo: `Recebimento Ordem ${compraRecebimento.id} - ${compraRecebimento.fornecedor}`,
      });
      if (movError) {
        toast.error("Erro ao registrar entrada no estoque.");
        return;
      }
      setProducts(
        products.map((p: any) => (p.id === recebimentoProductId ? { ...p, currentStock: (p.currentStock ?? 0) + qtdNum } : p))
      );
    }

    // 2. Atualizar status da ordem para "Recebido no Estoque"
    const { error: statusError } = await supabase
      .from("compras")
      .update({ status: "Recebido no Estoque" })
      .eq("id", compraRecebimento.id);
    if (statusError) {
      toast.error("Entrada registrada, mas falhou ao atualizar status da ordem.");
    }
    setCompras(prev => prev.map(c => c.id === compraRecebimento.id ? { ...c, status: "Recebido no Estoque" } : c));

    toast.success(`Entrada de +${qtdNum} un. confirmada no estoque com sucesso!`);
    setModalRecebimentoOpen(false);
  };

  const filtered = compras.filter(c => {
    const matchSearch = (
      c.fornecedor.toLowerCase().includes(search.toLowerCase()) ||
      c.itens.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = !filterStatus || c.status === filterStatus;
    const matchForn = !filterFornecedor || c.fornecedor === filterFornecedor;
    return matchSearch && matchStatus && matchForn;
  });

  const fornecedoresOpts = useMemo(
    () => Array.from(new Set(compras.map(c => c.fornecedor).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [compras],
  );
  const ativas = filtered.filter(c => c.status !== "Cancelada");
  const totalReposicao = ativas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const emTransito = filtered.filter(c => c.status === "Em Transporte").length;
  const aguardando = filtered.filter(c => c.status === "Emitida / Aguardando Fornecedor" || c.status === "Faturada").length;
  const recebidas = filtered.filter(c => c.status === "Recebido no Estoque").length;
  const activeFilters = (search.trim() ? 1 : 0) + (filterStatus ? 1 : 0) + (filterFornecedor ? 1 : 0);
  const limparFiltros = () => { setSearch(""); setFilterStatus(""); setFilterFornecedor(""); };

  return (
    <PageContainer
      title="Ordens de Compra & Reposição"
      description="Emita pedidos aos fornecedores, registre a entrada das mercadorias e alimente o saldo do estoque."
      actions={
        <div className="flex items-center gap-2">
        <Button variant="outline" onClick={exportarPdf} className="h-9 px-4 text-xs font-bold gap-1.5">
          <FileDown className="w-3.5 h-3.5" /> Exportar PDF
        </Button>
        <Button onClick={() => {
          if (!previsaoEntrega && cfgVarejo.compras.prazoEntregaPadraoDias > 0) {
            const d = new Date(); d.setDate(d.getDate() + cfgVarejo.compras.prazoEntregaPadraoDias);
            setPrevisaoEntrega(d.toISOString().slice(0, 10));
          }
          setModalOpen(true);
        }} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white">
          <Plus className="w-3.5 h-3.5" /> Nova Ordem de Compra
        </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="varejoCompras"
        className="mb-4"
        activeCount={activeFilters}
        onClear={limparFiltros}
        kpis={[
          { label: "Ordens de compra", value: filtered.length, icon: ClipboardList, tone: "primary" },
          { label: "Total em reposição", value: `R$ ${totalReposicao.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, tone: "success", hint: "Exclui canceladas" },
          { label: "Aguardando fornecedor", value: aguardando, icon: Clock, tone: aguardando > 0 ? "warning" : "neutral" },
          { label: "Cargas em trânsito", value: emTransito, icon: Truck, tone: "info" },
          { label: "Recebidas", value: recebidas, icon: CheckCircle2, tone: "accent" },
        ]}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por fornecedor, itens ou código..." />
          <FilterSelect icon={Truck} value={filterFornecedor} onChange={setFilterFornecedor} options={fornecedoresOpts} allLabel="Todos os fornecedores" />
          <FilterChips value={filterStatus} onChange={setFilterStatus} options={["Emitida / Aguardando Fornecedor", "Faturada", "Em Transporte", "Recebido no Estoque", "Cancelada"]} />
        </FilterBar>
      </KpiFilterCard>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(c => (
          <div key={c.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-primary-blue)] border border-[var(--color-border-subtle)]">
                  OC-{c.id.slice(0, 6).toUpperCase()}
                </span>
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{c.fornecedor}</h4>
                <span className="text-[10px] text-[var(--color-text-muted)]">• Emitido em: {c.data}</span>
              </div>
              <ul className="text-[11px] text-[var(--color-text-primary)] mt-1.5 space-y-0.5">
                {c.itens.split(/,\s*(?=\d+x )/).filter(Boolean).map((it, k) => (
                  <li key={k} className="flex items-center gap-1.5"><span className="text-[var(--color-primary-blue)]">•</span> {it}</li>
                ))}
              </ul>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5">
                Previsão: {c.previsaoEntrega} • Total: <strong className="text-emerald-500 font-bold font-mono">R$ {Number(c.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {c.status !== "Recebido no Estoque" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAbrirRecebimento(c)}
                  className="h-8 px-2.5 text-[11px] font-semibold gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl"
                >
                  <Boxes className="w-3.5 h-3.5" /> Dar Entrada
                </Button>
              )}

              <select
                value={c.status}
                onChange={e => handleUpdateStatus(c.id, e.target.value as any)}
                className="text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none"
              >
                <option value="Emitida / Aguardando Fornecedor">Emitida</option>
                <option value="Faturada">Faturada</option>
                <option value="Em Transporte">Em Transporte</option>
                {/* M8 (auditoria 2026-09-21): "Recebido no Estoque" só pode ser
                    alcançado pelo fluxo real de "Dar Entrada" (RPC
                    registrar_movimentacao_estoque) — escolher direto aqui
                    marcava a compra como recebida sem incrementar o estoque
                    de verdade. Mantido como `disabled` só pra exibir
                    corretamente o status já atingido pelo fluxo correto. */}
                <option value="Recebido no Estoque" disabled>Recebido no Estoque</option>
                <option value="Cancelada">Cancelada</option>
              </select>

              <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhuma ordem de compra encontrada para este filtro.
          </div>
        )}
      </div>

      {/* Modal de Entrada no Estoque */}
      {compraRecebimento && (
        <Modal
          isOpen={modalRecebimentoOpen}
          onClose={() => setModalRecebimentoOpen(false)}
          maxWidth="max-w-md"
          title={
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Boxes className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--color-text-primary)]">Dar Entrada no Estoque</h3>
                <p className="text-xs text-[var(--color-text-muted)]">Ordem: {compraRecebimento.id} • {compraRecebimento.fornecedor}</p>
              </div>
            </div>
          }
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalRecebimentoOpen(false)}
                className="h-9 px-4 text-xs font-semibold"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmarRecebimento}
                className="h-9 px-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Confirmar Recebimento
              </Button>
            </div>
          }
        >
          <div className="space-y-3.5 py-1">
            <div className="p-3 rounded-xl bg-[var(--color-surface-sunken)]/70 border border-[var(--color-border-subtle)] text-xs">
              <span className="font-semibold text-[var(--color-text-primary)] block mb-1">Itens Descritos na Ordem:</span>
              <p className="text-[var(--color-text-muted)] font-mono">{compraRecebimento.itens}</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">
                Vincular Entrada ao Produto (Opcional):
              </label>
              <select
                value={recebimentoProductId}
                onChange={e => setRecebimentoProductId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              >
                <option value="">Entrada Geral / Não Vincular a SKU Específico</option>
                {products.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Saldo atual: {p.currentStock ?? 0} un.)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">
                Quantidade Total Recebida (Unidades):
              </label>
              <input
                type="number"
                min={1}
                value={recebimentoQtd}
                onChange={e => setRecebimentoQtd(e.target.value)}
                placeholder="50"
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Standardized Modal: Nova Ordem */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-2xl"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Nova Ordem de Compra <HelpTip label="Sobre Nova Ordem de Compra">Solicite a reposição de itens e insumos para o seu estoque.</HelpTip></h3>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-compras"
              className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
            >
              Emitir Ordem
            </Button>
          </div>
        }
      >
        <form id="form-compras" onSubmit={handleCreate} className="space-y-3.5 py-1">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Fornecedor <span className="text-[var(--color-text-muted)] font-normal">(opcional)</span></label>
            <div className="flex items-center gap-2">
              <select value={fornecedor} onChange={e => setFornecedor(e.target.value)} className="flex-1 w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]">
                <option value="">A definir</option>
                {fornecedor && !fornecedoresCad.some(f => f.razaoSocial === fornecedor) && <option value={fornecedor}>{fornecedor}</option>}
                {fornecedoresCad.map(f => <option key={f.id} value={f.razaoSocial}>{f.razaoSocial}</option>)}
              </select>
              <button type="button" onClick={() => setNovoFornecedorOpen(true)} title="Cadastrar novo fornecedor" className="h-[34px] w-[34px] shrink-0 rounded-xl bg-[var(--color-primary-blue)] text-white flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Itens a comprar <span className="text-rose-500">*</span></label>
            <div className="flex items-center gap-2 px-0.5 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              <span className="flex-1">Item</span>
              <span className="w-20 text-right">Qtd</span>
              <span className="w-28 text-right">Custo un. (R$)</span>
              <span className="w-24 text-right">Subtotal</span>
              <span className="w-4" />
            </div>
            <div className="space-y-2">
              {linhas.map((l, i) => {
                const sub = (parseInt(l.qtd, 10) || 0) * (parseFloat(l.custo.replace(",", ".")) || 0);
                return (
                  <div key={i} className="flex items-start gap-2">
                    <ItemCombobox
                      value={l.nome}
                      onChange={v => setLinha(i, { nome: v })}
                      onPick={p => setLinha(i, { nome: p.name, custo: l.custo || (Number(p.cost) > 0 ? String(Number(p.cost)) : ""), qtd: l.qtd || "1" })}
                      produtos={(products || []).filter((p: any) => !p.type || p.type === "Físico")}
                    />
                    <input type="number" min={1} placeholder="0" value={l.qtd} onChange={e => setLinha(i, { qtd: e.target.value })} className={`w-20 text-right ${inputBase}`} />
                    <input type="text" inputMode="decimal" placeholder="0,00" value={l.custo} onChange={e => setLinha(i, { custo: e.target.value })} className={`w-28 text-right ${inputBase}`} />
                    <span className="w-24 text-right text-xs font-mono text-[var(--color-text-primary)] pt-2">{sub > 0 ? sub.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}</span>
                    <button type="button" disabled={linhas.length === 1} onClick={() => setLinhas(prev => prev.filter((_, k) => k !== i))} className="w-4 pt-1.5 text-rose-500 disabled:opacity-30 text-sm" title="Remover item">×</button>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button type="button" onClick={() => setLinhas(prev => [...prev, linhaVazia()])} className="text-[11px] font-bold text-[var(--color-primary-blue)] hover:underline">+ Adicionar item</button>
              <span className="text-[11px] text-[var(--color-text-muted)]">Total estimado: <strong className="font-mono text-[var(--color-text-primary)]">R$ {totalLinhas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Valor Total (R$) <span className="text-[var(--color-text-muted)] font-normal">(opcional)</span></label>
              <input
                type="text"
                placeholder={totalLinhas > 0 ? totalLinhas.toFixed(2) : "Soma dos custos"}
                value={valor}
                onChange={e => setValor(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Previsão de Entrega</label>
              <input
                type="date"
                value={previsaoEntrega}
                onChange={e => setPrevisaoEntrega(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>
        </form>
      </Modal>
      <FornecedorModal
        isOpen={novoFornecedorOpen}
        onClose={() => setNovoFornecedorOpen(false)}
        tenantId={activeTenantId}
        onSaved={f => { setFornecedoresCad(prev => [...prev, f].sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial))); setFornecedor(f.razaoSocial); }}
      />
    </PageContainer>
  );
}
