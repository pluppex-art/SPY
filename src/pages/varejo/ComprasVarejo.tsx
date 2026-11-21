import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  ClipboardList, FileDown, Pencil, Plus, Truck, DollarSign,
  CheckCircle2, Clock, Package, Trash2, X, Boxes, ArrowDownCircle
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { useVarejoConfig } from "../../lib/varejoConfig";
import { useData } from "../../contexts/DataContext";
import { supabase } from "../../lib/supabase";
import { AjusteEstoqueModal } from "./AjusteEstoqueModal";
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
  productId: string | null;
  itemNome: string;
  quantidade: number | null;
  custoUnitario: number | null;
  data: string;
  previsaoEntrega: string;
  previsaoISO: string;
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
    productId: row.product_id || null,
    itemNome: row.item_nome || "",
    quantidade: row.quantidade != null ? Number(row.quantidade) : null,
    custoUnitario: row.custo_unitario != null ? Number(row.custo_unitario) : null,
    data: new Date(row.data + "T00:00:00").toLocaleDateString("pt-BR"),
    previsaoEntrega: row.previsao_entrega ? new Date(row.previsao_entrega + "T00:00:00").toLocaleDateString("pt-BR") : "A combinar",
    previsaoISO: row.previsao_entrega || "",
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
  const { products } = useData();
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
  const [filterStatus, setFilterStatus] = useState("Emitida / Aguardando Fornecedor");
  const [filterFornecedor, setFilterFornecedor] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state para Nova Ordem
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  type Linha = { nome: string; qtd: string; custo: string; productId?: string };
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

  // Dar Entrada: abre o mesmo modal de "Ajustar Estoque" para o produto da ordem.
  const [entradaCompra, setEntradaCompra] = useState<CompraItem | null>(null);
  const [entradaProduto, setEntradaProduto] = useState<any | null>(null);
  const [semProdutoOpen, setSemProdutoOpen] = useState(false);

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
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    // Uma ordem por item: cada linha vira uma ordem própria na lista.
    const valorManual = valor.trim() ? (parseFloat(valor.replace(/[^\d.,]/g, "").replace(",", ".")) || 0) : null;
    const registros = validas.map(l => {
      const qtd = parseInt(l.qtd, 10);
      const custo = (qtd * (parseFloat(l.custo.replace(",", ".")) || 0));
      return {
        tenant_id: activeTenantId,
        fornecedor: fornecedor.trim() || "A definir",
        valor: validas.length === 1 && valorManual !== null ? valorManual : custo,
        itens: `${qtd}x ${l.nome.trim()}`,
        product_id: l.productId || (products || []).find((p: any) => String(p.name || "").trim().toLowerCase() === l.nome.trim().toLowerCase())?.id || null,
        item_nome: l.nome.trim(),
        quantidade: qtd,
        custo_unitario: parseFloat(l.custo.replace(",", ".")) || null,
        previsao_entrega: previsaoEntrega || null,
        status: uiStatusToDb(status),
      };
    });

    const { data, error } = await supabase.from("compras").insert(registros).select();

    if (error || !data || data.length === 0) {
      toast.error("Erro ao emitir ordem de compra.");
      return;
    }

    setCompras(prev => [...data.map(rowToCompra), ...prev]);
    toast.success(data.length > 1 ? `${data.length} ordens de compra emitidas!` : "Ordem de compra emitida!");
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
      title: "Excluir ordem de compra",
      description: `Excluir definitivamente a ordem de compra "${compra?.itens || ""}" de "${compra?.fornecedor || "este fornecedor"}"? Essa ação não pode ser desfeita. Para apenas cancelar, mude o status da ordem.`,
    }))) return;
    const { data, error } = await supabase.from("compras").delete().eq("id", id).select("id");
    if (error || !data || data.length === 0) { toast.error("Erro ao excluir ordem."); return; }
    setCompras(prev => prev.filter(c => c.id !== id));
    toast.info("Ordem de compra excluída.");
  };

  const handleUpdateStatus = async (id: string, newStatus: CompraItem["status"]) => {
    if (!supabase) return;
    const { error } = await supabase.from("compras").update({ status: uiStatusToDb(newStatus) }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status."); return; }
    setCompras(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
    toast.success(`Status da ordem: ${newStatus}`);
  };

  // Edição de uma ordem existente
  const [editando, setEditando] = useState<CompraItem | null>(null);
  const [eForn, setEForn] = useState("");
  const [eNome, setENome] = useState("");
  const [eProdId, setEProdId] = useState<string | null>(null);
  const [eQtd, setEQtd] = useState("");
  const [eCusto, setECusto] = useState("");
  const [eValor, setEValor] = useState("");
  const [ePrev, setEPrev] = useState("");
  const [eSalvando, setESalvando] = useState(false);
  const abrirEdicao = (c: CompraItem) => {
    setEditando(c);
    setEForn(c.fornecedor === "A definir" ? "" : c.fornecedor);
    setENome(c.itemNome || c.itens);
    setEProdId(c.productId);
    setEQtd(c.quantidade != null ? String(c.quantidade) : "");
    setECusto(c.custoUnitario != null ? String(c.custoUnitario) : "");
    const auto = (c.quantidade || 0) * (c.custoUnitario || 0);
    setEValor(c.valor && Math.abs(c.valor - auto) > 0.005 ? String(c.valor) : "");
    setEPrev(c.previsaoISO);
  };
  const eTotalAuto = (parseInt(eQtd, 10) || 0) * (parseFloat(eCusto.replace(",", ".")) || 0);
  const salvarEdicao = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editando || !supabase) return;
    const qtd = parseInt(eQtd, 10) || 0;
    if (!eNome.trim() || qtd <= 0) { toast.error("Informe o nome e a quantidade do item."); return; }
    const custo = parseFloat(eCusto.replace(",", ".")) || 0;
    const valorManual = eValor.trim() ? (parseFloat(eValor.replace(/[^\d.,]/g, "").replace(",", ".")) || 0) : null;
    const produto = eProdId
      ? (products || []).find((p: any) => p.id === eProdId)
      : (products || []).find((p: any) => String(p.name || "").trim().toLowerCase() === eNome.trim().toLowerCase());
    setESalvando(true);
    const { data, error } = await supabase.from("compras").update({
      fornecedor: eForn.trim() || "A definir",
      itens: `${qtd}x ${eNome.trim()}`,
      item_nome: eNome.trim(),
      quantidade: qtd,
      custo_unitario: custo || null,
      product_id: produto?.id || null,
      valor: valorManual !== null && valorManual !== eTotalAuto ? valorManual : (custo > 0 ? eTotalAuto : (valorManual ?? 0)),
      previsao_entrega: ePrev || null,
    }).eq("id", editando.id).select().maybeSingle();
    setESalvando(false);
    if (error || !data) { toast.error("Erro ao salvar a ordem."); return; }
    setCompras(prev => prev.map(c => c.id === editando.id ? rowToCompra(data) : c));
    toast.success("Ordem atualizada.");
    setEditando(null);
  };

  const codigoOC = (c: CompraItem) => `OC-${c.id.slice(0, 6).toUpperCase()}`;

  // Acha o produto pelo ID gravado na ordem; se não houver, pelo nome (e grava o vínculo para as próximas vezes).
  const handleAbrirRecebimento = async (c: CompraItem) => {
    const lista = (products || []) as any[];
    let produto = c.productId ? lista.find(p => p.id === c.productId) : undefined;
    if (!produto && c.itemNome) {
      produto = lista.find(p => String(p.name || "").trim().toLowerCase() === c.itemNome.trim().toLowerCase());
      if (produto && supabase) {
        await supabase.from("compras").update({ product_id: produto.id }).eq("id", c.id);
        setCompras(prev => prev.map(x => x.id === c.id ? { ...x, productId: produto.id } : x));
      }
    }
    setEntradaCompra(c);
    if (produto) setEntradaProduto(produto);
    else setSemProdutoOpen(true);
  };

  const cadastrarProdutoDaOrdem = () => {
    if (!entradaCompra) return;
    const qs = new URLSearchParams({ novo: "1", type: "Físico", nome: entradaCompra.itemNome });
    if (entradaCompra.custoUnitario) qs.set("custo", String(entradaCompra.custoUnitario));
    if (entradaCompra.fornecedor && entradaCompra.fornecedor !== "A definir") qs.set("fornecedor", entradaCompra.fornecedor);
    navigate(`/app/produtos?${qs.toString()}`);
  };

  const marcarRecebida = async () => {
    if (!entradaCompra || !supabase) return;
    const id = entradaCompra.id;
    const { error } = await supabase.from("compras").update({ status: "Recebido no Estoque" }).eq("id", id);
    if (error) { toast.error("Entrada registrada, mas falhou ao atualizar o status da ordem."); return; }
    setCompras(prev => prev.map(c => c.id === id ? { ...c, status: "Recebido no Estoque" } : c));
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

      {/* Lista em colunas */}
      <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
              <th className="py-3 px-4">Código</th>
              <th className="py-3 px-3">Emissão</th>
              <th className="py-3 px-3">Fornecedor</th>
              <th className="py-3 px-3">Item</th>
              <th className="py-3 px-3 text-right">Qtd</th>
              <th className="py-3 px-3 text-right">Custo un.</th>
              <th className="py-3 px-3 text-right">Total</th>
              <th className="py-3 px-3">Previsão</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-b border-[var(--color-border-subtle)] last:border-0 align-middle">
                <td className="py-3 px-4">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-primary-blue)] border border-[var(--color-border-subtle)]">{codigoOC(c)}</span>
                </td>
                <td className="py-3 px-3 text-[var(--color-text-muted)]">{c.data}</td>
                <td className="py-3 px-3 font-bold text-[var(--color-text-primary)]">{c.fornecedor}</td>
                <td className="py-3 px-3 text-[var(--color-text-primary)] max-w-[260px]">
                  <span className="block truncate" title={c.itemNome || c.itens}>{c.itemNome || c.itens}</span>
                  {c.itemNome && !c.productId && <span className="text-[9px] text-amber-500 font-semibold">Produto não vinculado</span>}
                </td>
                <td className="py-3 px-3 text-right font-mono">{c.quantidade ?? "—"}</td>
                <td className="py-3 px-3 text-right font-mono">{c.custoUnitario ? c.custoUnitario.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}</td>
                <td className="py-3 px-3 text-right font-mono font-bold text-emerald-500">R$ {Number(c.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                <td className="py-3 px-3 text-[var(--color-text-muted)]">{c.previsaoEntrega}</td>
                <td className="py-3 px-3">
                  <select
                    value={c.status}
                    onChange={e => handleUpdateStatus(c.id, e.target.value as any)}
                    className="text-[10px] font-bold uppercase px-2 py-1.5 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none"
                  >
                    <option value="Emitida / Aguardando Fornecedor">Emitida</option>
                    <option value="Faturada">Faturada</option>
                    <option value="Em Transporte">Em Transporte</option>
                    <option value="Recebido no Estoque" disabled>Recebido no Estoque</option>
                    <option value="Cancelada">Cancelada</option>
                  </select>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-end gap-2">
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
                    <Button size="sm" variant="ghost" onClick={() => abrirEdicao(c)} title="Editar ordem" className="h-8 w-8 p-0 text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 rounded-xl">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)]">
            Nenhuma ordem de compra encontrada para este filtro.
          </div>
        )}
      </div>

      {/* Dar Entrada = mesmo modal de Ajustar Estoque */}
      <AjusteEstoqueModal
        product={entradaProduto}
        isOpen={!!entradaProduto}
        onClose={() => { setEntradaProduto(null); setEntradaCompra(null); }}
        initialTipo="entrada"
        initialQtd={entradaCompra?.quantidade ? String(entradaCompra.quantidade) : ""}
        initialMotivo="Compra de Fornecedor"
        referencia={entradaCompra ? `${codigoOC(entradaCompra)} • ${entradaCompra.fornecedor}` : undefined}
        confirmLabel="Confirmar Entrada"
        onApplied={marcarRecebida}
      />

      {/* Produto ainda não cadastrado */}
      <Modal
        isOpen={semProdutoOpen}
        onClose={() => { setSemProdutoOpen(false); setEntradaCompra(null); }}
        maxWidth="max-w-md"
        title={<h3 className="text-base font-bold text-[var(--color-text-primary)]">Produto ainda não cadastrado</h3>}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" size="sm" onClick={() => { setSemProdutoOpen(false); setEntradaCompra(null); }}>Fechar</Button>
            {entradaCompra?.itemNome && (
              <Button size="sm" onClick={cadastrarProdutoDaOrdem} className="font-bold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white">
                Cadastrar produto
              </Button>
            )}
          </div>
        }
      >
        <p className="text-xs text-[var(--color-text-muted)] py-1">
          {entradaCompra?.itemNome
            ? <>Não achei “<strong className="text-[var(--color-text-primary)]">{entradaCompra.itemNome}</strong>” no catálogo. Cadastre o produto (nome, custo e fornecedor já vão preenchidos) e depois volte aqui e clique em Dar Entrada.</>
            : "Esta ordem não tem um item identificado, então não dá para ligar a um produto. Exclua e lance de novo informando o item."}
        </p>
      </Modal>

      {/* Editar ordem */}
      <Modal
        isOpen={!!editando}
        onClose={() => setEditando(null)}
        maxWidth="max-w-lg"
        title={<h3 className="text-base font-bold text-[var(--color-text-primary)]">Editar ordem {editando ? codigoOC(editando) : ""}</h3>}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button type="button" variant="outline" onClick={() => setEditando(null)} className="h-9 px-4 text-xs font-semibold">Cancelar</Button>
            <Button type="submit" form="form-editar-compra" disabled={eSalvando} className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white">
              {eSalvando ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        }
      >
        <form id="form-editar-compra" onSubmit={salvarEdicao} className="space-y-3.5 py-1">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Fornecedor</label>
            <div className="flex items-center gap-2">
              <select value={eForn} onChange={e => setEForn(e.target.value)} className="flex-1 w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]">
                <option value="">A definir</option>
                {eForn && !fornecedoresCad.some(f => f.razaoSocial === eForn) && <option value={eForn}>{eForn}</option>}
                {fornecedoresCad.map(f => <option key={f.id} value={f.razaoSocial}>{f.razaoSocial}</option>)}
              </select>
              <button type="button" onClick={() => setNovoFornecedorOpen(true)} title="Cadastrar novo fornecedor" className="h-[34px] w-[34px] shrink-0 rounded-xl bg-[var(--color-primary-blue)] text-white flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Item <span className="text-rose-500">*</span></label>
            <ItemCombobox
              value={eNome}
              onChange={v => { setENome(v); setEProdId(null); }}
              onPick={p => { setENome(p.name); setEProdId(p.id); if (!eCusto && Number(p.cost) > 0) setECusto(String(Number(p.cost))); }}
              produtos={(products || []).filter((p: any) => !p.type || p.type === "Físico")}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Quantidade <span className="text-rose-500">*</span></label>
              <input type="number" min={1} value={eQtd} onChange={e => setEQtd(e.target.value)} className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] text-right" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Custo un. (R$)</label>
              <input type="text" inputMode="decimal" value={eCusto} onChange={e => setECusto(e.target.value)} placeholder="0,00" className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] text-right" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Total (R$)</label>
              <input type="text" value={eValor} onChange={e => setEValor(e.target.value)} placeholder={eTotalAuto > 0 ? eTotalAuto.toFixed(2) : "0,00"} className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] text-right" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Previsão de Entrega</label>
            <input type="date" value={ePrev} onChange={e => setEPrev(e.target.value)} className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]" />
          </div>
        </form>
      </Modal>

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
                      onChange={v => setLinha(i, { nome: v, productId: undefined })}
                      onPick={p => setLinha(i, { productId: p.id, nome: p.name, custo: l.custo || (Number(p.cost) > 0 ? String(Number(p.cost)) : ""), qtd: l.qtd || "1" })}
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
                disabled={linhas.length > 1}
                title={linhas.length > 1 ? "Com vários itens, cada ordem usa o custo da própria linha" : undefined}
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
        onSaved={f => { setFornecedoresCad(prev => [...prev, f].sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial))); if (editando) setEForn(f.razaoSocial); else setFornecedor(f.razaoSocial); }}
      />
    </PageContainer>
  );
}
