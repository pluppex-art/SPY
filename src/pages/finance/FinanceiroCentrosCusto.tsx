import { useState, useMemo } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Layers, Plus, DollarSign, Users, TrendingUp,
  Building2, Trash2, Edit2, X, AlertCircle, PieChart, Download
} from "lucide-react";
import { FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { confirmDialog } from "../../components/ui/confirm-dialog";

type CentroCusto = {
  id: string;
  nome: string;
  codigo: string;
  orcamento: number;
  gasto: number;
  responsavel: string;
  created_at?: string;
};

export default function FinanceiroCentrosCusto() {
  const { user } = useAuth();
  const { financeCentrosCusto, addFinanceCentroCusto, updateFinanceCentroCusto, deleteFinanceCentroCusto } = useData();
  const centros = financeCentrosCusto as CentroCusto[];

  const [search, setSearch] = useState("");
  const [consumoFilter, setConsumoFilter] = useState("");
  const [gestorFilter, setGestorFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [gasto, setGasto] = useState("");
  const [responsavel, setResponsavel] = useState("");

  const handleOpenNew = () => {
    setEditingId(null);
    setNome("");
    setCodigo(`CC-0${centros.length + 1}`);
    setOrcamento("");
    setGasto("0");
    setResponsavel(user?.name || "");
    setShowModal(true);
  };

  const handleOpenEdit = (c: CentroCusto) => {
    setEditingId(c.id);
    setNome(c.nome);
    setCodigo(c.codigo);
    setOrcamento(c.orcamento.toString());
    setGasto(c.gasto.toString());
    setResponsavel(c.responsavel);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Informe o nome do centro de custo.");
      return;
    }

    const numOrcamento = parseFloat(orcamento) || 0;
    const numGasto = parseFloat(gasto) || 0;

    if (editingId) {
      await updateFinanceCentroCusto(editingId, {
        nome: nome.trim(),
        codigo: codigo.trim(),
        orcamento: numOrcamento,
        gasto: numGasto,
        responsavel: responsavel.trim() || "Responsável",
      });
      toast.success("Centro de custo atualizado com sucesso!");
    } else {
      await addFinanceCentroCusto({
        nome: nome.trim(),
        codigo: codigo.trim() || `CC-0${centros.length + 1}`,
        orcamento: numOrcamento,
        gasto: numGasto,
        responsavel: responsavel.trim() || user?.name || "Responsável",
      });
      toast.success("Centro de custo criado com sucesso!");
    }

    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Centro de Custo",
      message: "Tem certeza de que deseja excluir esta unidade de despesa?",
      confirmText: "Sim, Excluir",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;

    await deleteFinanceCentroCusto(id);
    toast.success("Centro de custo excluído.");
  };

  const gestores = useMemo(() => Array.from(new Set(centros.map(c => c.responsavel).filter(Boolean))).sort(), [centros]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return centros.filter(c => {
      const matchBusca =
        c.nome.toLowerCase().includes(q) ||
        c.codigo.toLowerCase().includes(q) ||
        c.responsavel.toLowerCase().includes(q);
      if (!matchBusca) return false;
      if (gestorFilter && c.responsavel !== gestorFilter) return false;
      if (consumoFilter) {
        const perc = c.orcamento > 0 ? Math.round((c.gasto / c.orcamento) * 100) : 0;
        const faixa = perc > 90 ? "critico" : perc > 75 ? "atencao" : "ok";
        if (faixa !== consumoFilter) return false;
      }
      return true;
    });
  }, [centros, search, gestorFilter, consumoFilter]);

  const totalOrcado = centros.reduce((s, c) => s + c.orcamento, 0);
  const totalGasto = centros.reduce((s, c) => s + c.gasto, 0);
  const saldoGeral = totalOrcado - totalGasto;
  const percGeral = totalOrcado > 0 ? Math.round((totalGasto / totalOrcado) * 100) : 0;

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.info("Nenhum centro de custo para exportar.");
      return;
    }
    const headers = ["Nome", "Código", "Gestor", "Orçamento Mensal (R$)", "Gasto Atual (R$)", "Saldo (R$)", "Consumo (%)"];
    const rows = filtered.map(c => [
      `"${c.nome.replace(/"/g, '""')}"`,
      `"${c.codigo}"`,
      `"${c.responsavel.replace(/"/g, '""')}"`,
      c.orcamento,
      c.gasto,
      (c.orcamento - c.gasto),
      c.orcamento > 0 ? Math.round((c.gasto / c.orcamento) * 100) : 0
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `centros_custo_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Centros de custo exportados com sucesso!");
  };

  return (
    <PageContainer
      title="Centros de Custo & Squads"
      description="Gerencie unidades de despesa, orçamentos departamentais e centros de resultado."
      actions={
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExportCSV}
            variant="outline"
            className="h-9 px-3.5 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
          >
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
          <Button onClick={handleOpenNew} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs bg-[var(--color-primary-blue)] text-white hover:opacity-95">
            <Plus className="w-3.5 h-3.5" /> Novo Centro de Custo
          </Button>
        </div>
      }
    >
      <FinanceKpiFilter className="mb-4"
        id="finCentrosCusto"
        kpis={[
          { label: "Orçamento Total", value: `R$ ${totalOrcado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, tone: "primary" },
          { label: "Total Consumido", value: `R$ ${totalGasto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: TrendingUp, tone: "warning", hint: `${percGeral}% do teto global` },
          { label: "Saldo Disponível", value: `R$ ${saldoGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, tone: "success" },
          { label: "Unidades de Custo", value: centros.length, icon: Layers, tone: "neutral" },
        ]}
        activeCount={(search ? 1 : 0) + (consumoFilter ? 1 : 0) + (gestorFilter ? 1 : 0)}
        onClear={() => { setSearch(""); setConsumoFilter(""); setGestorFilter(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por nome, código ou gestor..." />
          <FilterSelect icon={Users} value={gestorFilter} onChange={setGestorFilter} options={gestores} allLabel="Todos os gestores" />
          <FilterChips
            value={consumoFilter}
            onChange={setConsumoFilter}
            allLabel="Todos"
            options={[
              { value: "ok", label: "Até 75%" },
              { value: "atencao", label: "75–90%" },
              { value: "critico", label: "Acima de 90%" },
            ]}
          />
        </FilterBar>
      </FinanceKpiFilter>

      {/* Grid of Centros de Custo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {filtered.map(c => {
          const perc = c.orcamento > 0 ? Math.round((c.gasto / c.orcamento) * 100) : 0;
          return (
            <div key={c.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs space-y-3 relative group">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] font-bold">
                  {c.codigo}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleOpenEdit(c)}
                    className="p-1 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 hover:border-[var(--color-primary-blue)]/25 transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="p-1 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-danger hover:bg-danger/10 hover:border-danger/25 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{c.nome}</h4>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Gestor: {c.responsavel}</p>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[var(--color-text-muted)]">Consumo:</span>
                  <span className={`font-bold ${perc > 90 ? 'text-danger' : perc > 75 ? 'text-warning' : 'text-success'}`}>
                    {perc}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      perc > 90 ? 'bg-danger' : perc > 75 ? 'bg-warning' : 'bg-success'
                    }`}
                    style={{ width: `${Math.min(perc, 100)}%` }}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--color-border-subtle)] flex justify-between text-[11px]">
                <span className="text-[var(--color-text-muted)]">
                  Gasto: <strong className="text-[var(--color-text-primary)]">R$ {c.gasto.toLocaleString("pt-BR")}</strong>
                </span>
                <span className="text-[var(--color-text-muted)]">
                  Teto: <strong>R$ {c.orcamento.toLocaleString("pt-BR")}</strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="p-12 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
          Nenhum centro de custo cadastrado.
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? "Editar Centro de Custo" : "Novo Centro de Custo"}
        description="Defina as alocações de budget por setor ou centro de custo."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
              Nome do Centro / Unidade *
            </label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Marketing Digital & Performance"
              required
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Código Interno
              </label>
              <input
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                placeholder="CC-05"
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Gestor / Responsável
              </label>
              <input
                value={responsavel}
                onChange={e => setResponsavel(e.target.value)}
                placeholder="Nome do líder"
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Orçamento Mensal (R$)
              </label>
              <input
                type="number"
                value={orcamento}
                onChange={e => setOrcamento(e.target.value)}
                placeholder="50000"
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Gasto Atual (R$)
              </label>
              <input
                type="number"
                value={gasto}
                onChange={e => setGasto(e.target.value)}
                placeholder="0"
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)} className="text-xs">
              Cancelar
            </Button>
            <Button type="submit" className="text-xs font-bold bg-[var(--color-primary-blue)] text-white">
              {editingId ? "Salvar Alterações" : "Criar Centro de Custo"}
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
