import { useState, useEffect, useMemo } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  ShoppingBag, DollarSign, CheckCircle2,
  Clock, Package, ArrowRight, Plus, Trash2, X, Truck, CreditCard
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { Card } from "../../components/ui/card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

interface PedidoItem {
  id: string;
  cliente: string;
  telefone?: string;
  itens: string;
  total: number;
  formaPagto: string;
  created_at: string;
  status: "Pago / Separando" | "Em Trânsito / Entrega" | "Entregue / Concluído" | "Cancelado";
}

export default function PedidosVarejo() {
  const { activeTenantId } = useAuth();

  const [pedidos, setPedidos] = useState<PedidoItem[]>([]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPagto, setFilterPagto] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [itens, setItens] = useState("");
  const [total, setTotal] = useState("");
  const [formaPagto, setFormaPagto] = useState("Pix");
  const [status, setStatus] = useState<PedidoItem["status"]>("Pago / Separando");

  useEffect(() => {
    if (!supabase || !activeTenantId) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("varejo_pedidos")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error(error);
        toast.error("Falha ao carregar pedidos.");
        return;
      }

      const mapped: PedidoItem[] = (data || []).map((row: any) => ({
        id: row.id,
        cliente: row.cliente,
        telefone: row.telefone,
        itens: row.itens,
        total: row.total,
        formaPagto: row.forma_pagto,
        created_at: row.created_at,
        status: row.status,
      }));

      setPedidos(mapped);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTenantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente.trim() || !itens.trim()) {
      toast.error("Informe o cliente e os itens do pedido.");
      return;
    }

    if (!supabase || !activeTenantId) {
      toast.error("Não foi possível registrar o pedido.");
      return;
    }

    const numVal = parseFloat(total.replace(/[^\d.]/g, "").replace(",", ".")) || 0;

    const { data, error } = await supabase
      .from("varejo_pedidos")
      .insert({
        // M3 (auditoria 2026-09-21): o id era gerado a partir de
        // `pedidos.length + 9822`, colidindo com o esquema usado em
        // Vendas.tsx (`9820 + random(500)`) e quebrando com dois pedidos
        // simultâneos ou um pedido excluído antes. Usa UUID como o resto do
        // sistema.
        id: `PED-${crypto.randomUUID()}`,
        tenant_id: activeTenantId,
        cliente: cliente.trim(),
        telefone: telefone.trim(),
        itens: itens.trim(),
        total: numVal,
        forma_pagto: formaPagto,
        status,
      })
      .select()
      .single();

    if (error || !data) {
      console.error(error);
      toast.error("Falha ao registrar o pedido.");
      return;
    }

    const newItem: PedidoItem = {
      id: data.id,
      cliente: data.cliente,
      telefone: data.telefone,
      itens: data.itens,
      total: data.total,
      formaPagto: data.forma_pagto,
      created_at: data.created_at,
      status: data.status,
    };

    setPedidos(prev => [newItem, ...prev]);
    toast.success("Pedido registrado com sucesso!");
    setModalOpen(false);

    setCliente("");
    setTelefone("");
    setItens("");
    setTotal("");
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;

    const pedido = pedidos.find(p => p.id === id);
    if (!(await confirmDialog({
      title: "Excluir pedido",
      description: `Excluir o pedido de "${pedido?.cliente || "este cliente"}"? Essa ação não pode ser desfeita.`,
    }))) return;

    const { error } = await supabase.from("varejo_pedidos").delete().eq("id", id);

    if (error) {
      console.error(error);
      toast.error("Falha ao remover o pedido.");
      return;
    }

    setPedidos(prev => prev.filter(p => p.id !== id));
    toast.info("Pedido removido.");
  };

  const handleUpdateStatus = async (id: string, newStatus: PedidoItem["status"]) => {
    if (!supabase) return;

    const previous = pedidos;
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));

    const { error } = await supabase.from("varejo_pedidos").update({ status: newStatus }).eq("id", id);

    if (error) {
      console.error(error);
      setPedidos(previous);
      toast.error("Falha ao atualizar o status do pedido.");
      return;
    }

    toast.success(`Status do pedido atualizado: ${newStatus}`);
  };

  const filtered = pedidos.filter(p => {
    const matchSearch = (
      p.cliente.toLowerCase().includes(search.toLowerCase()) ||
      p.itens.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = !filterStatus || p.status === filterStatus;
    const matchPagto = !filterPagto || p.formaPagto === filterPagto;
    return matchSearch && matchStatus && matchPagto;
  });

  const formasPagto = useMemo(
    () => Array.from(new Set(pedidos.map(p => p.formaPagto).filter(Boolean))).sort(),
    [pedidos],
  );
  const faturamentoTotal = filtered.filter(p => p.status !== "Cancelado").reduce((s, p) => s + (Number(p.total) || 0), 0);
  const emAberto = filtered.filter(p => p.status === "Pago / Separando" || p.status === "Em Trânsito / Entrega").length;
  const concluidos = filtered.filter(p => p.status === "Entregue / Concluído").length;
  const ticketMedio = filtered.filter(p => p.status !== "Cancelado").length > 0
    ? faturamentoTotal / filtered.filter(p => p.status !== "Cancelado").length
    : 0;
  const activeFilters = (search.trim() ? 1 : 0) + (filterStatus ? 1 : 0) + (filterPagto ? 1 : 0);
  const limparFiltros = () => { setSearch(""); setFilterStatus(""); setFilterPagto(""); };

  return (
    <PageContainer
      title="Pedidos de Venda & Balcão"
      description="Histórico de vendas realizadas pelo PDV, pedidos de entrega e status de separação."
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/app/varejo/vendas"
            className="h-9 px-3.5 text-xs font-bold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)] text-[var(--color-text-primary)] transition-all"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Ir para Frente de Caixa
          </Link>
          <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
            <Plus className="w-3.5 h-3.5" /> Novo Pedido Manual
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="varejoPedidos"
        className="mb-4"
        activeCount={activeFilters}
        onClear={limparFiltros}
        kpis={[
          { label: "Pedidos", value: filtered.length, icon: ShoppingBag, tone: "primary" },
          { label: "Faturamento", value: `R$ ${faturamentoTotal.toFixed(2)}`, icon: DollarSign, tone: "success", hint: "Exclui cancelados" },
          { label: "Em separação / envio", value: emAberto, icon: Truck, tone: emAberto > 0 ? "warning" : "neutral" },
          { label: "Concluídos", value: concluidos, icon: CheckCircle2, tone: "info" },
          { label: "Ticket médio", value: `R$ ${ticketMedio.toFixed(2)}`, icon: Package, tone: "accent" },
        ]}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por cliente, produtos ou pedido..." />
          <FilterSelect icon={CreditCard} value={filterPagto} onChange={setFilterPagto} options={formasPagto} allLabel="Todas as formas de pagamento" />
          <FilterChips value={filterStatus} onChange={setFilterStatus} options={["Pago / Separando", "Em Trânsito / Entrega", "Entregue / Concluído", "Cancelado"]} />
        </FilterBar>
      </KpiFilterCard>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(p => (
          <div key={p.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-primary-blue)] border border-[var(--color-border-subtle)]">
                  {p.id}
                </span>
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{p.cliente}</h4>
                {p.telefone && <span className="text-[10px] text-[var(--color-text-muted)]">({p.telefone})</span>}
                <span className="text-[10px] text-[var(--color-text-muted)] font-medium">• {p.formaPagto}</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Itens: <strong className="text-[var(--color-text-primary)]">{p.itens}</strong> • {new Date(p.created_at).toLocaleDateString("pt-BR") + " às " + new Date(p.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-black text-emerald-500">
                R$ {p.total.toFixed(2)}
              </span>

              <select
                value={p.status}
                onChange={e => handleUpdateStatus(p.id, e.target.value as any)}
                className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none"
              >
                <option value="Pago / Separando">Separando</option>
                <option value="Em Trânsito / Entrega">Em Trânsito</option>
                <option value="Entregue / Concluído">Entregue</option>
                <option value="Cancelado">Cancelado</option>
              </select>

              <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhum pedido encontrado para este filtro.
          </div>
        )}
      </div>

      {/* Standardized Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Registrar Pedido de Balcão</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Cadastre vendas manuais e entregas sob demanda</p>
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
              form="form-pedidos"
              className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
            >
              Registrar Pedido
            </Button>
          </div>
        }
      >
        <form id="form-pedidos" onSubmit={handleCreate} className="space-y-3.5 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Nome do Cliente</label>
              <input
                type="text"
                required
                placeholder="Nome completo"
                value={cliente}
                onChange={e => setCliente(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Telefone</label>
              <input
                type="text"
                placeholder="(11) 90000-0000"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Itens Vendidos</label>
            <textarea
              rows={2}
              required
              placeholder="Ex: 1x Capa iPhone 15 Pro, 1x Película de Vidro 9D"
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
                placeholder="Ex: 159.90"
                value={total}
                onChange={e => setTotal(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Forma de Pagamento</label>
              <select
                value={formaPagto}
                onChange={e => setFormaPagto(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              >
                <option value="Pix">Pix</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Cartão de Débito">Cartão de Débito</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Boleto Bancário">Boleto Bancário</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
