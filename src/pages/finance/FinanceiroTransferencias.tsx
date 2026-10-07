import { useMemo, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { Plus, ArrowRight, Trash2, CheckCircle2, Clock, Repeat, Layers, Building2, Pencil, FileText, DollarSign, Calendar, Landmark, AlertCircle, Loader2 } from "lucide-react";
import { saldoDaConta, transferenciasDaConta, type FinanceEntryLike } from "./lib/financeEngine";
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

const ctl = "w-full h-9 px-3 rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40";
const lbl = "text-xs font-bold text-[var(--color-text-primary)] mb-1.5 block";

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function FinanceiroTransferencias() {
  const { financeTransfers, addFinanceTransfer, updateFinanceTransfer, deleteFinanceTransfer, financeBankAccounts, financeEntries } = useData();
  const { formatCurrency } = useLocalization();
  const { dataInicio, dataFim, label: periodoLabel, preset, setPreset } = useFinanceiroFiltro();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [contaFiltro, setContaFiltro] = useState("");

  const contasAtivas = useMemo(() => (financeBankAccounts as any[]).filter(c => !c.arquivada), [financeBankAccounts]);
  const contaNome = (id: string) => contasAtivas.find(c => c.id === id)?.nome || (financeBankAccounts as any[]).find(c => c.id === id)?.nome || "—";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [valor, setValor] = useState("");
  const [pago, setPago] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(() => toLocalISODate(new Date()));
  const [contaOrigemId, setContaOrigemId] = useState("");
  const [contaDestinoId, setContaDestinoId] = useState("");

  const resetForm = () => {
    setValor(""); setPago(false); setDescricao("");
    setData(toLocalISODate(new Date()));
    setContaOrigemId(""); setContaDestinoId("");
    setEditingId(null); setEditingOriginal(null); setTentou(false); setSaving(false);
  };
  const closeModal = () => { setIsModalOpen(false); resetForm(); };

  // Saldo atual de cada conta (mesma regra da tela de Contas Bancárias).
  const saldoPorConta = useMemo(() => {
    const map = new Map<string, number>();
    for (const conta of financeBankAccounts as any[]) {
      const { recebidas, enviadas } = transferenciasDaConta(financeTransfers as any[], conta.id);
      map.set(conta.id, saldoDaConta({
        saldoInicial: conta.saldo_inicial,
        sinalSaldoInicial: conta.sinal_saldo_inicial,
        entriesDaConta: (financeEntries as FinanceEntryLike[]).filter((e: any) => e.conta_bancaria_id === conta.id),
        transferenciasRecebidasPagas: recebidas,
        transferenciasEnviadasPagas: enviadas,
      }));
    }
    return map;
  }, [financeBankAccounts, financeEntries, financeTransfers]);

  // Saldo da conta sem o efeito da transferência em edição (se ela já estava concluída).
  const saldoBase = (contaId: string) => {
    let s = saldoPorConta.get(contaId) ?? 0;
    if (editingOriginal?.pago) {
      if (editingOriginal.conta_origem_id === contaId) s += editingOriginal.valor;
      if (editingOriginal.conta_destino_id === contaId) s -= editingOriginal.valor;
    }
    return s;
  };

  const openNew = () => {
    if (contasAtivas.length < 2) {
      toast.error("Cadastre pelo menos 2 contas bancárias ativas para transferir entre elas.");
      return;
    }
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (t: any) => {
    resetForm();
    setEditingId(t.id); setEditingOriginal(t);
    setValor(String(t.valor)); setPago(!!t.pago); setDescricao(t.descricao || "");
    setData(t.data_pagamento || toLocalISODate(new Date()));
    setContaOrigemId(t.conta_origem_id || ""); setContaDestinoId(t.conta_destino_id || "");
    setIsModalOpen(true);
  };

  const valorNum = parseFloat(valor) || 0;
  const errors = {
    valor: valorNum <= 0 ? "Informe um valor maior que zero." : "",
    origem: !contaOrigemId ? "Selecione a conta de origem." : "",
    destino: !contaDestinoId ? "Selecione a conta de destino." : contaOrigemId === contaDestinoId ? "Origem e destino precisam ser diferentes." : "",
  };
  const hasErrors = !!(errors.valor || errors.origem || errors.destino);

  const handleSave = async (e: React.FormEvent | null, criarOutra: boolean) => {
    e?.preventDefault();
    setTentou(true);
    if (hasErrors) { toast.error(errors.valor || errors.origem || errors.destino); return; }
    setSaving(true);
    try {
      const payload = {
        valor: valorNum,
        pago,
        descricao: descricao.trim() || null,
        data_pagamento: data || toLocalISODate(new Date()),
        conta_origem_id: contaOrigemId,
        conta_destino_id: contaDestinoId,
      };
      if (editingId) {
        await updateFinanceTransfer(editingId, payload);
        toast.success("Transferência atualizada.");
        closeModal();
        return;
      }
      await addFinanceTransfer(payload);
      toast.success("Transferência registrada.");
      if (criarOutra) {
        setValor(""); setDescricao(""); setTentou(false);
      } else {
        closeModal();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFromModal = async () => {
    if (!editingId) return;
    if (!(await confirmDialog({ title: "Excluir transferência", description: "Excluir esta transferência? Se estiver concluída, o saldo das contas será recalculado. Essa ação não pode ser desfeita." }))) return;
    await deleteFinanceTransfer(editingId);
    toast.success("Transferência excluída.");
    closeModal();
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
                      <button type="button" onClick={() => openEdit(t)} title="Editar" className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-surface-sunken)]">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
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

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[var(--color-info)]/10 text-[var(--color-info)]">
              {editingId ? <Pencil className="w-5 h-5" /> : <Repeat className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-black text-[var(--color-text-primary)] leading-tight">{editingId ? "Editar Transferência" : "Nova Transferência"}</div>
              <div className="text-xs font-normal text-[var(--color-text-muted)]">Move dinheiro entre suas próprias contas — não é receita nem despesa e não entra no DRE.</div>
            </div>
          </div>
        }
        maxWidth="max-w-xl"
      >
        <form onSubmit={(e) => handleSave(e, false)} className="space-y-4">
          <div className="rounded-xl border border-[var(--color-border-subtle)] p-3 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)] flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5" /> Contas envolvidas</div>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
              <div>
                <label className={lbl}>Conta de origem</label>
                <select value={contaOrigemId} onChange={(e) => setContaOrigemId(e.target.value)} className={cn(ctl, "cursor-pointer", tentou && errors.origem && "border-danger")}>
                  <option value="">Selecione...</option>
                  {contasAtivas.map(c => <option key={c.id} value={c.id} disabled={c.id === contaDestinoId}>{c.nome}</option>)}
                </select>
                {tentou && errors.origem && <p className="text-[10px] text-danger mt-1">{errors.origem}</p>}
              </div>
              <button
                type="button"
                title="Inverter origem e destino"
                disabled={!contaOrigemId && !contaDestinoId}
                onClick={() => { setContaOrigemId(contaDestinoId); setContaDestinoId(contaOrigemId); }}
                className="mt-[22px] h-9 w-9 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] flex items-center justify-center disabled:opacity-40 cursor-pointer"
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
              <div>
                <label className={lbl}>Conta de destino</label>
                <select value={contaDestinoId} onChange={(e) => setContaDestinoId(e.target.value)} className={cn(ctl, "cursor-pointer", tentou && errors.destino && "border-danger")}>
                  <option value="">Selecione...</option>
                  {contasAtivas.map(c => <option key={c.id} value={c.id} disabled={c.id === contaOrigemId}>{c.nome}</option>)}
                </select>
                {tentou && errors.destino && <p className="text-[10px] text-danger mt-1">{errors.destino}</p>}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border-subtle)] p-3 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)] flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Valor e data</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Valor (R$)</label>
                <input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className={cn(ctl, "font-mono", tentou && errors.valor && "border-danger")} />
                {tentou && errors.valor && <p className="text-[10px] text-danger mt-1">{errors.valor}</p>}
              </div>
              <div>
                <label className={cn(lbl, "flex items-center gap-1.5")}><Calendar className="w-3 h-3 text-[var(--color-text-muted)]" /> Data</label>
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={ctl} />
              </div>
            </div>
            <label className="flex items-start gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
              <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} className="cursor-pointer mt-0.5" />
              <span>
                <span className="font-bold text-[var(--color-text-primary)]">Transferência já concluída</span>
                <span className="block text-[10px] text-[var(--color-text-faint)]">Só transferências concluídas alteram o saldo das contas. Deixe desmarcado para agendar.</span>
              </span>
            </label>
          </div>

          {contaOrigemId && contaDestinoId && contaOrigemId !== contaDestinoId && valorNum > 0 && (() => {
            const baseO = saldoBase(contaOrigemId);
            const baseD = saldoBase(contaDestinoId);
            const aposO = pago ? baseO - valorNum : baseO;
            const aposD = pago ? baseD + valorNum : baseD;
            return (
              <div className="rounded-xl border border-[var(--color-info)]/20 bg-[var(--color-info)]/[0.05] p-3 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-info)]">Prévia dos saldos {pago ? "após a transferência" : "(só muda ao concluir)"}</div>
                {[{ id: contaOrigemId, antes: baseO, depois: aposO }, { id: contaDestinoId, antes: baseD, depois: aposD }].map(r => (
                  <div key={r.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="font-medium text-[var(--color-text-primary)] truncate">{contaNome(r.id)}</span>
                    <span className="tabular-nums text-[var(--color-text-muted)] flex items-center gap-1.5 shrink-0">
                      {formatCurrency(r.antes)} <ArrowRight className="w-3 h-3" />
                      <strong className={r.depois < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"}>{formatCurrency(r.depois)}</strong>
                    </span>
                  </div>
                ))}
                {pago && aposO < 0 && (
                  <p className="flex items-start gap-1.5 text-[10px] text-[var(--color-warning)]"><AlertCircle className="w-3 h-3 shrink-0 mt-0.5" /> A conta de origem ficará com saldo negativo. Você ainda pode salvar.</p>
                )}
              </div>
            );
          })()}

          <div>
            <label className={cn(lbl, "flex items-center gap-1.5")}><FileText className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> Descrição / observações</label>
            <textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Reforço de caixa, pagamento de fatura do cartão... (opcional)" className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40 resize-none" />
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
            <div>
              {editingId && (
                <Button type="button" variant="outline" onClick={handleDeleteFromModal} disabled={saving} className="h-9 px-3 text-xs font-medium gap-1.5 text-[var(--color-danger)]">
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={closeModal} disabled={saving} className="h-9 px-4 text-xs font-medium">Cancelar</Button>
              {!editingId && (
                <Button type="button" variant="outline" disabled={saving} onClick={() => handleSave(null, true)} className="h-9 px-4 text-xs font-medium">Salvar &amp; Criar Outra</Button>
              )}
              <Button type="submit" disabled={saving} className="h-9 px-5 text-xs font-medium gap-1.5">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingId ? "Salvar Alterações" : "Salvar & Fechar"}
              </Button>
            </div>
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
