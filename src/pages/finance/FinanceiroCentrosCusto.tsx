import { useState, useMemo } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Layers, Plus, DollarSign, Users, TrendingUp,
  Building2, Trash2, Edit2, X, AlertCircle, PieChart, Download, FileText, Loader2, Info, Eye
} from "lucide-react";
import { FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useLocalization } from "../../contexts/LocalizationContext";
import { cn } from "../../lib/utils";
import { ViewModal } from "./components/ViewModal";

const ctl = "w-full h-9 px-3 rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40";
const lbl = "text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5";

type CentroCusto = {
  id: string;
  nome: string;
  codigo: string;
  orcamento: number;
  gasto: number;
  responsavel: string;
  created_at?: string;
};
import { useRowOpen } from "./components/useRowOpen";

export default function FinanceiroCentrosCusto() {
  const { user } = useAuth();
  const { financeCentrosCusto, addFinanceCentroCusto, updateFinanceCentroCusto, deleteFinanceCentroCusto, financeEntries } = useData();
  const { formatCurrency } = useLocalization();
  const centros = financeCentrosCusto as CentroCusto[];

  const [search, setSearch] = useState("");
  const [consumoFilter, setConsumoFilter] = useState("");
  const [gestorFilter, setGestorFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<CentroCusto | null>(null);
  const rowOpen = useRowOpen<CentroCusto>(setViewing, (x) => handleOpenEdit(x));

  // Form State
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [gasto, setGasto] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [saving, setSaving] = useState(false);
  const [tentou, setTentou] = useState(false);

  const handleOpenNew = () => {
    setEditingId(null);
    setNome("");
    setCodigo(`CC-0${centros.length + 1}`);
    setOrcamento("");
    setGasto("0");
    setResponsavel(user?.name || "");
    setTentou(false); setSaving(false);
    setShowModal(true);
  };

  const handleOpenEdit = (c: CentroCusto) => {
    setEditingId(c.id);
    setNome(c.nome);
    setCodigo(c.codigo || "");
    setOrcamento(String(c.orcamento ?? 0));
    setGasto(String(c.gasto ?? 0));
    setResponsavel(c.responsavel || "");
    setTentou(false); setSaving(false);
    setShowModal(true);
  };

  const numOrcamento = Math.max(0, parseFloat(orcamento) || 0);
  const numGasto = Math.max(0, parseFloat(gasto) || 0);
  const percForm = numOrcamento > 0 ? Math.round((numGasto / numOrcamento) * 100) : 0;
  const nomeErro = !nome.trim() ? "Informe o nome do centro de custo." : "";
  const codigoDuplicado = !!codigo.trim() && centros.some(c => c.id !== editingId && (c.codigo || "").trim().toLowerCase() === codigo.trim().toLowerCase());
  const nomeDuplicado = !!nome.trim() && centros.some(c => c.id !== editingId && c.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  const vinculados = useMemo(() => {
    if (!editingId) return null;
    const rows = (financeEntries as any[]).filter(e => e.centro_custo_id === editingId);
    const pagos = rows.filter(e => e.status === "Pago" && e.type === "Pagar").reduce((s, e) => s + (Number(e.value) || 0), 0);
    return { count: rows.length, pagos };
  }, [editingId, financeEntries]);

  const viewVinculados = useMemo(() => {
    if (!viewing) return null;
    const rows = (financeEntries as any[]).filter(e => e.centro_custo_id === viewing.id);
    const pagos = rows.filter(e => e.status === "Pago" && e.type === "Pagar").reduce((s, e) => s + (Number(e.value) || 0), 0);
    return { count: rows.length, pagos };
  }, [viewing, financeEntries]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (nomeErro) {
      toast.error(nomeErro);
      return;
    }

    setSaving(true);
    try {
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
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string): Promise<boolean> => {
    const ok = await confirmDialog({
      title: "Excluir Centro de Custo",
      message: "Tem certeza de que deseja excluir esta unidade de despesa?",
      confirmText: "Sim, Excluir",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return false;

    await deleteFinanceCentroCusto(id);
    toast.success("Centro de custo excluído.");
    return true;
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
            <div key={c.id} {...rowOpen(c)} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs space-y-3 relative group cursor-pointer hover:border-[var(--color-primary-blue)]/40 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] font-bold">
                  {c.codigo}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setViewing(c)}
                    className="p-1 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 hover:border-[var(--color-primary-blue)]/25 transition-colors"
                    title="Visualizar"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
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

      {viewing && (() => {
        const perc = viewing.orcamento > 0 ? Math.round((viewing.gasto / viewing.orcamento) * 100) : 0;
        return (
          <ViewModal
            isOpen
            onClose={() => setViewing(null)}
            icon={Layers}
            title={viewing.nome}
            subtitle={viewing.codigo || undefined}
            tone={perc > 90 ? "danger" : perc > 75 ? "warning" : "primary"}
            highlight={viewing.orcamento > 0 ? <span className={`text-lg font-black ${perc > 90 ? "text-danger" : perc > 75 ? "text-warning" : "text-success"}`}>{perc}% consumido</span> : undefined}
            sections={[
              { icon: FileText, title: "Identificação", rows: [
                { label: "Código", value: viewing.codigo || null, mono: true },
                { label: "Gestor", value: viewing.responsavel || null },
              ] },
              { icon: DollarSign, title: "Orçamento e consumo", rows: [
                { label: "Orçamento mensal", value: formatCurrency(viewing.orcamento), mono: true },
                { label: "Gasto atual", value: formatCurrency(viewing.gasto), mono: true },
                { label: "Saldo disponível", value: formatCurrency(viewing.orcamento - viewing.gasto), mono: true },
              ] },
              ...(viewVinculados ? [{ icon: Info, title: "Lançamentos vinculados", rows: [
                { label: "Lançamentos", value: String(viewVinculados.count) },
                { label: "Despesas já pagas", value: formatCurrency(viewVinculados.pagos), mono: true },
              ] }] : []),
            ]}
            newLabel="Novo centro de custo"
            onEdit={() => { const c = viewing; setViewing(null); handleOpenEdit(c); }}
            onNew={() => { setViewing(null); handleOpenNew(); }}
            onDelete={async () => { const c = viewing; if (await handleDelete(c.id)) setViewing(null); }}
          />
        );
      })()}

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]">
              {editingId ? <Edit2 className="w-5 h-5" /> : <Layers className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-black text-[var(--color-text-primary)] leading-tight">{editingId ? "Editar Centro de Custo" : "Novo Centro de Custo"}</div>
              <div className="text-xs font-normal text-[var(--color-text-muted)]">Defina as alocações de budget por setor, squad ou unidade de despesa.</div>
            </div>
          </div>
        }
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="rounded-xl border border-[var(--color-border-subtle)] p-3 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)] flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Identificação</div>
            <div>
              <label className={lbl}>Nome do centro / unidade</label>
              <input
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: Marketing Digital & Performance"
                autoFocus
                className={cn(ctl, tentou && nomeErro && "border-danger")}
              />
              {tentou && nomeErro && <p className="text-[10px] text-danger mt-1">{nomeErro}</p>}
              {nomeDuplicado && <p className="text-[10px] text-[var(--color-warning)] mt-1">Já existe um centro com esse nome.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Código interno</label>
                <input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="CC-05" className={cn(ctl, "font-mono")} />
                {codigoDuplicado
                  ? <p className="text-[10px] text-[var(--color-warning)] mt-1">Este código já é usado por outro centro.</p>
                  : <p className="text-[10px] text-[var(--color-text-faint)] mt-1">Opcional — se vazio, geramos um automaticamente.</p>}
              </div>
              <div>
                <label className={lbl}>Gestor / responsável</label>
                <input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome do líder" className={ctl} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border-subtle)] p-3 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)] flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Orçamento e consumo</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Orçamento mensal (R$)</label>
                <input type="number" step="0.01" min="0" value={orcamento} onChange={e => setOrcamento(e.target.value)} placeholder="0,00" className={cn(ctl, "font-mono")} />
              </div>
              <div>
                <label className={lbl}>Gasto atual (R$)</label>
                <input type="number" step="0.01" min="0" value={gasto} onChange={e => setGasto(e.target.value)} placeholder="0,00" className={cn(ctl, "font-mono")} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[var(--color-text-muted)]">
                  {numOrcamento > 0 ? `Saldo disponível: ${formatCurrency(numOrcamento - numGasto)}` : "Defina um orçamento para acompanhar o consumo."}
                </span>
                {numOrcamento > 0 && (
                  <span className={`font-bold ${percForm > 90 ? "text-danger" : percForm > 75 ? "text-warning" : "text-success"}`}>{percForm}%</span>
                )}
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                <div className={`h-full rounded-full transition-all ${percForm > 90 ? "bg-danger" : percForm > 75 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min(percForm, 100)}%` }} />
              </div>
              {numOrcamento > 0 && numGasto > numOrcamento && (
                <p className="flex items-start gap-1.5 text-[10px] text-danger mt-1.5"><AlertCircle className="w-3 h-3 shrink-0 mt-0.5" /> O gasto ultrapassa o orçamento em {formatCurrency(numGasto - numOrcamento)}.</p>
              )}
            </div>
          </div>

          {vinculados && (
            <p className="flex items-start gap-1.5 text-[10px] text-[var(--color-text-muted)] p-2 rounded-lg bg-[var(--color-primary-blue)]/[0.06] border border-[var(--color-primary-blue)]/15">
              <Info className="w-3 h-3 shrink-0 mt-0.5" />
              {vinculados.count === 0
                ? "Nenhum lançamento está vinculado a este centro ainda. Vincule pelo campo \"Centro de Custo\" ao criar ou editar um lançamento."
                : `${vinculados.count} lançamento(s) vinculado(s) a este centro, somando ${formatCurrency(vinculados.pagos)} em despesas já pagas. O "Gasto atual" acima é informado manualmente.`}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
            <div>
              {editingId && (
                <Button type="button" variant="outline" disabled={saving} onClick={async () => { if (await handleDelete(editingId)) setShowModal(false); }} className="h-9 px-3 text-xs font-medium gap-1.5 text-[var(--color-danger)]">
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={saving} className="h-9 px-4 text-xs font-medium">
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="h-9 px-5 text-xs font-medium gap-1.5">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingId ? "Salvar Alterações" : "Criar Centro de Custo"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
