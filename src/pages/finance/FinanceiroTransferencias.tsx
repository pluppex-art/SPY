import { useMemo, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { Plus, ArrowRight, Trash2, CheckCircle2, Clock, Repeat, Layers, Building2 } from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { FilterBar, FilterSearch, FilterSelect, FilterChips, type KpiItem } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { KpiDrillChips } from "./components/KpiDrillChips";
import { FinancePeriodFilter } from "./components/FinancePeriodFilter";
import { useFinanceiroFiltro } from "./FinanceiroFilterContext";
import { cn } from "../../lib/utils";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { transferDrillColumns } from "../../components/ui/drillColumns";

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function FinanceiroTransferencias() {
  const { financeTransfers, addFinanceTransfer, updateFinanceTransfer, deleteFinanceTransfer, financeBankAccounts } = useData();
  const { formatCurrency } = useLocalization();
  const { dataInicio, dataFim, label: periodoLabel, preset, setPreset } = useFinanceiroFiltro();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [contaFiltro, setContaFiltro] = useState("");

  const contasAtivas = useMemo(() => (financeBankAccounts as any[]).filter(c => !c.arquivada), [financeBankAccounts]);
  const contaNome = (id: string) => contasAtivas.find(c => c.id === id)?.nome || (financeBankAccounts as any[]).find(c => c.id === id)?.nome || "—";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [valor, setValor] = useState("");
  const [pago, setPago] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [contaOrigemId, setContaOrigemId] = useState("");
  const [contaDestinoId, setContaDestinoId] = useState("");

  const resetForm = () => {
    setValor(""); setPago(false); setDescricao("");
    setData(new Date().toISOString().slice(0, 10));
    setContaOrigemId(""); setContaDestinoId("");
  };

  const openNew = () => {
    if (contasAtivas.length < 2) {
      toast.error("Cadastre pelo menos 2 contas bancárias ativas para transferir entre elas.");
      return;
    }
    resetForm();
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent, criarOutra: boolean) => {
    e.preventDefault();
    const v = parseFloat(valor) || 0;
    if (v <= 0) { toast.error("Informe um valor maior que zero."); return; }
    if (!contaOrigemId || !contaDestinoId) { toast.error("Selecione a conta de origem e a de destino."); return; }
    if (contaOrigemId === contaDestinoId) { toast.error("A conta de origem precisa ser diferente da de destino."); return; }

    await addFinanceTransfer({
      valor: v,
      pago,
      descricao: descricao || null,
      data_pagamento: data,
      conta_origem_id: contaOrigemId,
      conta_destino_id: contaDestinoId,
    });
    toast.success("Transferência registrada.");

    if (criarOutra) {
      setValor(""); setDescricao("");
    } else {
      setIsModalOpen(false);
      resetForm();
    }
  };

  const handleToggle = async (t: any) => {
    await updateFinanceTransfer(t.id, { pago: !t.pago });
    toast.success(t.pago ? "Transferência marcada como pendente." : "Transferência confirmada — saldo das contas atualizado.");
  };

  const handleDelete = async (t: any) => {
    if (!(await confirmDialog({ title: "Excluir transferência", description: "Excluir esta transferência? Essa ação não pode ser desfeita." }))) return;
    await deleteFinanceTransfer(t.id);
    toast.success("Transferência excluída.");
  };

  const ordenadas = [...(financeTransfers as any[])].sort((a, b) => (b.data_pagamento || "").localeCompare(a.data_pagamento || ""));

  const kpis = useMemo(() => {
    const inicioStr = toLocalISODate(dataInicio);
    const fimStr = toLocalISODate(dataFim);
    const transfers = financeTransfers as any[];
    const periodoRows = transfers.filter(t => t.pago && t.data_pagamento >= inicioStr && t.data_pagamento <= fimStr);
    const totalPeriodo = periodoRows.reduce((s, t) => s + t.valor, 0);
    const pendentes = transfers.filter(t => !t.pago);
    return { totalPeriodo, periodoRows, totalPendente: pendentes.reduce((s, t) => s + t.valor, 0), pendentesRows: pendentes, countPendentes: pendentes.length, count: transfers.length };
  }, [financeTransfers, dataInicio, dataFim]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ordenadas.filter(t => {
      if (statusFiltro === "concluida" && !t.pago) return false;
      if (statusFiltro === "pendente" && t.pago) return false;
      if (contaFiltro && t.conta_origem_id !== contaFiltro && t.conta_destino_id !== contaFiltro) return false;
      if (t.data_pagamento && (t.data_pagamento < toLocalISODate(dataInicio) || t.data_pagamento > toLocalISODate(dataFim))) return false;
      if (q && !`${t.descricao || ""} ${contaNome(t.conta_origem_id)} ${contaNome(t.conta_destino_id)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financeTransfers, busca, statusFiltro, contaFiltro, financeBankAccounts, dataInicio, dataFim]);

  const kpiItems: KpiItem[] = ordenadas.length > 0 ? [
    { label: `Transferido (${periodoLabel})`, value: formatCurrency(kpis.totalPeriodo), icon: Repeat, tone: "info", hint: "Já concluídas" },
    { label: "Pendentes", value: formatCurrency(kpis.totalPendente), icon: Clock, tone: kpis.countPendentes > 0 ? "warning" : "neutral", hint: `${kpis.countPendentes} transferência(s)` },
    { label: "Total de Transferências", value: kpis.count, icon: Layers, tone: "primary" },
  ] : [];

  const activeCount = (preset !== "tudo" ? 1 : 0) + (busca.trim() ? 1 : 0) + (statusFiltro ? 1 : 0) + (contaFiltro ? 1 : 0);
  const limparFiltros = () => { setPreset("tudo"); setBusca(""); setStatusFiltro(""); setContaFiltro(""); };

  const [drillKey, setDrillKey] = useState<"periodo" | "pendentes" | "todas" | null>(null);
  const transferColumns = transferDrillColumns(formatCurrency, contaNome);

  return (
    <PageContainer
      title="Transferências entre Contas"
      description="Movimentação entre suas próprias contas — nunca conta como receita ou despesa, nunca entra no DRE."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Transferências" }]}
      actions={
        <div className="flex items-center gap-2">
          <FinancePeriodFilter />
          <Button onClick={openNew} className="h-9 px-4 text-xs font-medium gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nova Transferência
          </Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceKpiFilter id="finTransferencias" kpis={kpiItems} activeCount={activeCount} onClear={limparFiltros}>
          <FilterBar>
            <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar descrição ou conta..." />
            <FilterSelect icon={Building2} value={contaFiltro} onChange={setContaFiltro} options={contasAtivas.map(c => ({ value: c.id, label: c.nome }))} allLabel="Todas as contas" title="Conta (origem ou destino)" />
            <FilterChips value={statusFiltro} onChange={setStatusFiltro} options={[{ value: "concluida", label: "Concluídas" }, { value: "pendente", label: "Pendentes" }]} />
          </FilterBar>
          {ordenadas.length > 0 && (
            <KpiDrillChips items={[
              { label: "Transferido no período", onClick: () => setDrillKey("periodo") },
              { label: "Pendentes", onClick: () => setDrillKey("pendentes") },
              { label: "Todas", onClick: () => setDrillKey("todas") },
            ]} />
          )}
        </FinanceKpiFilter>

        {ordenadas.length === 0 ? (
          <Card className="p-12 text-center">
            <Repeat className="w-8 h-8 text-[var(--color-text-faint)] mx-auto mb-3" />
            <p className="text-sm text-[var(--color-text-muted)]">Nenhuma transferência registrada ainda.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="px-6 py-3">Data</th>
                  <th className="px-6 py-3">De → Para</th>
                  <th className="px-6 py-3">Descrição</th>
                  <th className="px-6 py-3 text-right">Valor</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {visiveis.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-[var(--color-text-faint)]">Nenhuma transferência encontrada para os filtros selecionados.</td></tr>
                )}
                {visiveis.map(t => (
                  <tr key={t.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-[var(--color-text-muted)]">{new Date(t.data_pagamento + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
                        {contaNome(t.conta_origem_id)} <ArrowRight className="w-3 h-3 text-[var(--color-text-faint)]" /> {contaNome(t.conta_destino_id)}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-[var(--color-text-muted)]">{t.descricao || "—"}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums font-semibold text-[var(--color-info)]">{formatCurrency(t.valor)}</td>
                    <td className="px-6 py-3.5">
                      <button
                        type="button"
                        onClick={() => handleToggle(t)}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold uppercase border",
                          t.pago ? "bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/25" : "bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/25"
                        )}
                      >
                        {t.pago ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {t.pago ? "Concluída" : "Pendente"}
                      </button>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button type="button" onClick={() => handleDelete(t)} title="Excluir" className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); resetForm(); }} title="Nova Transferência" description="Move dinheiro entre suas próprias contas — não é receita nem despesa." maxWidth="max-w-md">
        <form onSubmit={(e) => handleSave(e, false)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Conta de Origem *</label>
              <select required value={contaOrigemId} onChange={(e) => setContaOrigemId(e.target.value)} className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer">
                <option value="">Selecione...</option>
                {contasAtivas.map(c => <option key={c.id} value={c.id} disabled={c.id === contaDestinoId}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Conta de Destino *</label>
              <select required value={contaDestinoId} onChange={(e) => setContaDestinoId(e.target.value)} className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer">
                <option value="">Selecione...</option>
                {contasAtivas.map(c => <option key={c.id} value={c.id} disabled={c.id === contaOrigemId}>{c.nome}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Descrição</label>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Valor (R$) *</label>
              <input type="number" required step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Data</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
            <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} className="cursor-pointer" />
            Já concluí essa transferência
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }} className="h-9 px-4 text-xs font-medium">Cancelar</Button>
            <Button type="button" variant="outline" onClick={(e) => handleSave(e as any, true)} className="h-9 px-4 text-xs font-medium">Salvar &amp; Criar Outra</Button>
            <Button type="submit" className="h-9 px-5 text-xs font-medium">Salvar &amp; Fechar</Button>
          </div>
        </form>
      </Modal>

      <DrillDownPanel
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        title={drillKey === "periodo" ? `Transferido (${periodoLabel})` : drillKey === "pendentes" ? "Pendentes" : drillKey === "todas" ? "Total de Transferências" : undefined}
        rows={drillKey === "periodo" ? kpis.periodoRows : drillKey === "pendentes" ? kpis.pendentesRows : drillKey === "todas" ? (financeTransfers as any[]) : []}
        columns={transferColumns}
      />
    </PageContainer>
  );
}
