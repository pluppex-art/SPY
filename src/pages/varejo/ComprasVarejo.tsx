import { useState, useEffect, useMemo } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  ClipboardList, Plus, Truck, DollarSign,
  CheckCircle2, Clock, Package, Trash2, X, Boxes, ArrowDownCircle
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

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

export default function ComprasVarejo() {
  const { activeTenantId } = useAuth();
  const { products, setProducts } = useData();

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
  const [itens, setItens] = useState("");
  const [previsaoEntrega, setPrevisaoEntrega] = useState("");
  const [status, setStatus] = useState<CompraItem["status"]>("Emitida / Aguardando Fornecedor");

  // Estado para Dar Entrada no Estoque
  const [modalRecebimentoOpen, setModalRecebimentoOpen] = useState(false);
  const [compraRecebimento, setCompraRecebimento] = useState<CompraItem | null>(null);
  const [recebimentoProductId, setRecebimentoProductId] = useState<string>("");
  const [recebimentoQtd, setRecebimentoQtd] = useState<string>("50");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fornecedor.trim() || !itens.trim()) {
      toast.error("Preencha o fornecedor e a lista de itens.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    const numVal = parseFloat(valor.replace(/[^\d.]/g, "").replace(",", ".")) || 0;

    const { data, error } = await supabase
      .from("compras")
      .insert({
        tenant_id: activeTenantId,
        fornecedor: fornecedor.trim(),
        valor: numVal,
        itens: itens.trim(),
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
    setItens("");
    setPrevisaoEntrega("");
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
      description="Emissão de pedidos a fornecedores, entrada de mercadorias e alimentação do saldo em estoque."
      actions={
        <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white">
          <Plus className="w-3.5 h-3.5" /> Nova Ordem de Compra
        </Button>
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
                  {c.id}
                </span>
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{c.fornecedor}</h4>
                <span className="text-[10px] text-[var(--color-text-muted)]">• Emitido em: {c.data}</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Itens: <strong className="text-[var(--color-text-primary)]">{c.itens}</strong> • Previsão: {c.previsaoEntrega} • Total: <strong className="text-emerald-500 font-bold font-mono">R$ {Number(c.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
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
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Nova Ordem de Compra</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Solicite reposição de itens e insumos para seu estoque</p>
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
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Fornecedor / Distribuidora</label>
            <input
              type="text"
              required
              placeholder="Nome do fornecedor"
              value={fornecedor}
              onChange={e => setFornecedor(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Itens & Quantidades</label>
            <textarea
              rows={2}
              required
              placeholder="Ex: 50x Fone Bluetooth Pro, 100x Cabo Tipo-C"
              value={itens}
              onChange={e => setItens(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Valor Total (R$)</label>
              <input
                type="text"
                required
                placeholder="Ex: 7500.00"
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
    </PageContainer>
  );
}
