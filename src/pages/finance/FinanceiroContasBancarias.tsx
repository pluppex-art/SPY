import { useMemo, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { Plus, Star, Pencil, Trash2, Archive, ArchiveRestore, Landmark, Repeat, Wallet, BarChart3, FileText, DollarSign, Info, Loader2, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { saldoDaConta, transferenciasDaConta, type FinanceEntryLike } from "./lib/financeEngine";
import { cn } from "../../lib/utils";
import { ViewModal } from "./components/ViewModal";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { contaBancariaDrillColumns } from "../../components/ui/drillColumns";

const TIPOS: { id: string; label: string }[] = [
  { id: "CONTA_CORRENTE", label: "Conta Corrente" },
  { id: "CONTA_POUPANCA", label: "Conta Poupança" },
  { id: "CARTEIRA", label: "Carteira" },
  { id: "COFRE", label: "Cofre" },
  { id: "INVESTIMENTO", label: "Investimento" },
  { id: "CARTAO_CREDITO", label: "Cartão de Crédito" },
  { id: "CARTAO_DEBITO", label: "Cartão de Débito" },
  { id: "OUTRO", label: "Outro" },
];
const TIPO_HINTS: Record<string, string> = {
  CONTA_CORRENTE: "Conta do dia a dia no banco.",
  CONTA_POUPANCA: "Reserva com rendimento no banco.",
  CARTEIRA: "Dinheiro em espécie ou caixa físico.",
  COFRE: "Valores guardados fora do banco.",
  INVESTIMENTO: "Aplicações e fundos.",
  CARTAO_CREDITO: "Use saldo inicial negativo para uma fatura em aberto.",
  CARTAO_DEBITO: "Cartão ligado a uma conta existente.",
  OUTRO: "Qualquer outro tipo de conta ou caixa.",
};
const ctl = "w-full h-9 px-3 rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40";
const lbl = "text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5";
const tipoLabel = (id: string) => TIPOS.find(t => t.id === id)?.label ?? id;

type Sinal = "POSITIVO" | "NEGATIVO" | "ZERADO";

interface ContaBancaria {
  id: string;
  nome: string;
  tipo: string;
  saldo_inicial: number;
  sinal_saldo_inicial: Sinal;
  is_principal: boolean;
  arquivada: boolean;
}

export default function FinanceiroContasBancarias() {
  const { financeBankAccounts, addFinanceBankAccount, updateFinanceBankAccount, deleteFinanceBankAccount, setContaPrincipal, financeEntries, financeTransfers } = useData();
  const { formatCurrency } = useLocalization();

  const contas = financeBankAccounts as ContaBancaria[];
  const [aba, setAba] = useState<"ativas" | "arquivadas" | "todas">("ativas");
  const [busca, setBusca] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ContaBancaria | null>(null);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("CONTA_CORRENTE");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [sinal, setSinal] = useState<Sinal>("POSITIVO");
  const [principal, setPrincipal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tentou, setTentou] = useState(false);

  const emUso = useMemo(() => new Set((financeEntries as any[]).map(e => e.conta_bancaria_id).filter(Boolean)), [financeEntries]);

  const saldoPorConta = useMemo(() => {
    const map = new Map<string, number>();
    for (const conta of contas) {
      const entriesDaConta = (financeEntries as FinanceEntryLike[]).filter((e: any) => e.conta_bancaria_id === conta.id);
      const { recebidas, enviadas } = transferenciasDaConta(financeTransfers as any[], conta.id);
      map.set(conta.id, saldoDaConta({
        saldoInicial: conta.saldo_inicial,
        sinalSaldoInicial: conta.sinal_saldo_inicial,
        entriesDaConta,
        transferenciasRecebidasPagas: recebidas,
        transferenciasEnviadasPagas: enviadas,
      }));
    }
    return map;
  }, [contas, financeEntries, financeTransfers]);

  const listaAtiva = contas.filter(c => !c.arquivada);
  const listaArquivada = contas.filter(c => c.arquivada);
  const listaAba = aba === "ativas" ? listaAtiva : aba === "arquivadas" ? listaArquivada : contas;
  const tiposUsados = useMemo(
    () => Array.from(new Set(contas.map(c => c.tipo))).map(t => ({ value: t, label: tipoLabel(t) })),
    [contas]
  );
  const listaExibida = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return listaAba.filter(c =>
      (!tipoFilter || c.tipo === tipoFilter) &&
      (!q || c.nome.toLowerCase().includes(q) || tipoLabel(c.tipo).toLowerCase().includes(q))
    );
  }, [listaAba, busca, tipoFilter]);

  const saldoTotalAtivas = useMemo(() => listaAtiva.reduce((s, c) => s + (saldoPorConta.get(c.id) ?? 0), 0), [listaAtiva, saldoPorConta]);
  const contaPrincipal = useMemo(() => listaAtiva.find(c => c.is_principal) ?? null, [listaAtiva]);
  const chartData = useMemo(
    () => listaAtiva.map(c => ({ nome: c.nome, saldo: saldoPorConta.get(c.id) ?? 0 })).sort((a, b) => b.saldo - a.saldo),
    [listaAtiva, saldoPorConta]
  );

  const [drillContasOpen, setDrillContasOpen] = useState(false);
  const contaColumns = contaBancariaDrillColumns(formatCurrency, saldoPorConta);

  const resetForm = () => {
    setNome(""); setTipo("CONTA_CORRENTE"); setSaldoInicial(""); setSinal("POSITIVO"); setEditingId(null);
    setPrincipal(false); setSaving(false); setTentou(false);
  };
  const closeModal = () => { setIsModalOpen(false); resetForm(); };

  const openNew = () => { resetForm(); setIsModalOpen(true); };
  const openEdit = (c: ContaBancaria) => {
    resetForm();
    setEditingId(c.id); setNome(c.nome); setTipo(c.tipo);
    setSaldoInicial(String(c.saldo_inicial)); setSinal(c.sinal_saldo_inicial);
    setPrincipal(!!c.is_principal);
    setIsModalOpen(true);
  };

  const editingConta = editingId ? contas.find(c => c.id === editingId) ?? null : null;
  const nomeDuplicado = !!nome.trim() && contas.some(c => c.id !== editingId && c.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  const nomeErro = !nome.trim() ? "Informe o nome da conta." : "";
  const saldoInicialNum = sinal === "ZERADO" ? 0 : Math.abs(parseFloat(saldoInicial) || 0);
  const saldoInicialAssinado = sinal === "NEGATIVO" ? -saldoInicialNum : saldoInicialNum;

  const detalhesConta = useMemo(() => {
    if (!editingId) return null;
    const lanc = (financeEntries as any[]).filter(e => e.conta_bancaria_id === editingId).length;
    const transf = (financeTransfers as any[]).filter(t => t.conta_origem_id === editingId || t.conta_destino_id === editingId).length;
    return { lanc, transf, saldo: saldoPorConta.get(editingId) ?? 0 };
  }, [editingId, financeEntries, financeTransfers, saldoPorConta]);

  const viewDetalhes = useMemo(() => {
    if (!viewing) return null;
    const lanc = (financeEntries as any[]).filter(e => e.conta_bancaria_id === viewing.id).length;
    const transf = (financeTransfers as any[]).filter(t => t.conta_origem_id === viewing.id || t.conta_destino_id === viewing.id).length;
    return { lanc, transf, saldo: saldoPorConta.get(viewing.id) ?? 0 };
  }, [viewing, financeEntries, financeTransfers, saldoPorConta]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (nomeErro) { toast.error(nomeErro); return; }

    const payload = {
      nome: nome.trim(),
      tipo,
      saldo_inicial: saldoInicialNum,
      sinal_saldo_inicial: sinal,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateFinanceBankAccount(editingId, payload);
        if (principal && editingConta && !editingConta.is_principal && !editingConta.arquivada) await setContaPrincipal(editingId);
        toast.success("Conta atualizada.");
      } else {
        const isFirst = contas.length === 0;
        const criada = await addFinanceBankAccount({ ...payload, is_principal: isFirst, arquivada: false });
        if (principal && !isFirst && criada?.id) await setContaPrincipal(criada.id);
        toast.success("Conta bancária criada.");
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: ContaBancaria): Promise<boolean> => {
    if (emUso.has(c.id)) {
      toast.error("Esta conta tem lançamentos vinculados — arquive em vez de excluir.");
      return false;
    }
    if (!(await confirmDialog({ title: "Excluir conta bancária", description: `Excluir "${c.nome}"? Essa ação não pode ser desfeita.` }))) return false;
    await deleteFinanceBankAccount(c.id);
    toast.success("Conta excluída.");
    return true;
  };

  const handleArchiveToggle = async (c: ContaBancaria): Promise<boolean> => {
    if (!c.arquivada && !(await confirmDialog({ title: "Arquivar conta", description: `Arquivar "${c.nome}"? Ela deixa de aparecer nas listas de seleção, mas o histórico e os lançamentos são mantidos. Você pode reativá-la depois.` }))) return false;
    await updateFinanceBankAccount(c.id, { arquivada: !c.arquivada, ...(c.is_principal && !c.arquivada ? { is_principal: false } : {}) });
    toast.success(c.arquivada ? "Conta reativada." : "Conta arquivada.");
    return true;
  };

  const handleSetPrincipal = async (id: string) => {
    await setContaPrincipal(id);
    toast.success("Conta definida como principal.");
  };

  return (
    <PageContainer
      title="Contas Bancárias"
      description="Saldo real de caixa — só lançamentos pagos e vinculados a uma conta afetam o saldo."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Contas Bancárias" }]}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/app/financeiro/transferencias">
            <Button variant="outline" className="h-9 px-4 text-xs font-medium gap-1.5">
              <Repeat className="w-3.5 h-3.5" /> Transferências
            </Button>
          </Link>
          <Button onClick={openNew} className="h-9 px-4 text-xs font-medium gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nova Conta
          </Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceKpiFilter
          id="finContasBancarias"
          kpis={[
            { label: "Saldo Total (Contas Ativas)", value: formatCurrency(saldoTotalAtivas), icon: Wallet, tone: saldoTotalAtivas < 0 ? "danger" : "neutral" },
            { label: "Contas Ativas", value: listaAtiva.length, icon: Landmark, tone: "primary", hint: "Use o botão \"Ver contas ativas\" para detalhar" },
            { label: "Conta Principal", value: contaPrincipal ? contaPrincipal.nome : "—", icon: Star, tone: "accent", hint: contaPrincipal ? formatCurrency(saldoPorConta.get(contaPrincipal.id) ?? 0) : undefined },
          ]}
          activeCount={(busca ? 1 : 0) + (tipoFilter ? 1 : 0) + (aba !== "ativas" ? 1 : 0)}
          onClear={() => { setBusca(""); setTipoFilter(""); setAba("ativas"); }}
        >
          <FilterBar>
            <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar conta..." />
            <FilterSelect icon={Landmark} value={tipoFilter} onChange={setTipoFilter} options={tiposUsados} allLabel="Todos os tipos" />
            <FilterChips
              value={aba}
              onChange={v => setAba(v as "ativas" | "arquivadas" | "todas")}
              allValue="ativas"
              allLabel={`Ativas (${listaAtiva.length})`}
              options={[
                { value: "arquivadas", label: `Arquivadas (${listaArquivada.length})` },
                { value: "todas", label: `Todas (${contas.length})` },
              ]}
            />
            <Button size="sm" variant="outline" onClick={() => setDrillContasOpen(true)} className="h-[38px] px-3 text-xs font-medium gap-1.5">
              <Landmark className="w-3.5 h-3.5" /> Ver contas ativas
            </Button>
          </FilterBar>
        </FinanceKpiFilter>

        {chartData.length > 1 && (
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--color-text-faint)]" /> Saldo por Conta
            </h3>
            <div className="w-full" style={{ height: Math.max(120, chartData.length * 36) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="nome" type="category" stroke="var(--color-text-muted)" fontSize={11} width={110} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="saldo" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => <Cell key={index} fill={entry.saldo < 0 ? "var(--color-danger)" : "var(--color-primary-blue)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {listaExibida.length === 0 ? (
          <Card className="p-12 text-center">
            <Landmark className="w-8 h-8 text-[var(--color-text-faint)] mx-auto mb-3" />
            <p className="text-sm text-[var(--color-text-muted)]">Nenhuma conta bancária cadastrada ainda.</p>
            <Button onClick={openNew} className="mt-4 h-9 px-4 text-xs font-medium gap-1.5 mx-auto">
              <Plus className="w-3.5 h-3.5" /> Criar primeira conta
            </Button>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="px-6 py-3">Conta</th>
                  <th className="px-6 py-3">Tipo</th>
                  <th className="px-6 py-3 text-right">Saldo Inicial</th>
                  <th className="px-6 py-3 text-right">Saldo Atual</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {listaExibida.map(c => {
                  const saldo = saldoPorConta.get(c.id) ?? 0;
                  return (
                    <tr key={c.id} className={cn("hover:bg-[var(--color-surface-sunken)]/50 transition-colors", c.arquivada && "opacity-50")}>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[var(--color-text-primary)]">{c.nome}</span>
                          {c.is_principal && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/25">
                              <Star className="w-2.5 h-2.5" /> Principal
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-[var(--color-text-muted)]">{tipoLabel(c.tipo)}</td>
                      <td className="px-6 py-3.5 text-right tabular-nums text-[var(--color-text-muted)]">{formatCurrency(c.saldo_inicial)}</td>
                      <td className={cn("px-6 py-3.5 text-right tabular-nums font-semibold", saldo < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]")}>{formatCurrency(saldo)}</td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {!c.is_principal && !c.arquivada && (
                            <button type="button" onClick={() => handleSetPrincipal(c.id)} title="Definir como principal" className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-success)] hover:bg-[var(--color-success)]/10">
                              <Star className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => setViewing(c)} title="Visualizar" className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => openEdit(c)} title="Editar" className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => handleArchiveToggle(c)} title={c.arquivada ? "Reativar" : "Arquivar"} className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]">
                            {c.arquivada ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                          </button>
                          <button type="button" onClick={() => handleDelete(c)} title="Excluir" className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {viewing && viewDetalhes && (
        <ViewModal
          isOpen
          onClose={() => setViewing(null)}
          icon={Landmark}
          title={viewing.nome}
          subtitle={tipoLabel(viewing.tipo)}
          tone={viewDetalhes.saldo < 0 ? "danger" : "primary"}
          highlight={
            <>
              <span className={cn("text-lg font-black tabular-nums", viewDetalhes.saldo < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]")}>{formatCurrency(viewDetalhes.saldo)}</span>
              <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">{viewing.arquivada ? "Arquivada" : viewing.is_principal ? "Principal" : "Ativa"}</span>
            </>
          }
          sections={[
            { icon: FileText, title: "Conta", rows: [
              { label: "Tipo", value: tipoLabel(viewing.tipo) },
              { label: "Situação", value: viewing.arquivada ? "Arquivada" : "Ativa" },
              { label: "Conta principal", value: viewing.is_principal ? "Sim" : null },
            ] },
            { icon: DollarSign, title: "Saldo", rows: [
              { label: "Saldo inicial", value: `${formatCurrency(viewing.sinal_saldo_inicial === "NEGATIVO" ? -Math.abs(viewing.saldo_inicial) : viewing.sinal_saldo_inicial === "ZERADO" ? 0 : viewing.saldo_inicial)}`, mono: true },
              { label: "Saldo atual", value: formatCurrency(viewDetalhes.saldo), mono: true },
              { label: "Lançamentos vinculados", value: String(viewDetalhes.lanc) },
              { label: "Transferências", value: String(viewDetalhes.transf) },
            ] },
          ]}
          newLabel="Nova conta"
          onEdit={() => { const c = viewing; setViewing(null); openEdit(c); }}
          onNew={() => { setViewing(null); openNew(); }}
          onDelete={async () => { const c = viewing; if (await handleDelete(c)) setViewing(null); }}
        />
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]">
              {editingId ? <Pencil className="w-5 h-5" /> : <Landmark className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-black text-[var(--color-text-primary)] leading-tight">{editingId ? "Editar Conta Bancária" : "Nova Conta Bancária"}</div>
              <div className="text-xs font-normal text-[var(--color-text-muted)]">Contas e caixas onde o dinheiro realmente circula — só lançamentos pagos afetam o saldo.</div>
            </div>
          </div>
        }
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {detalhesConta && editingConta && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: "Saldo atual", v: formatCurrency(detalhesConta.saldo), neg: detalhesConta.saldo < 0 },
                { l: "Lançamentos vinculados", v: String(detalhesConta.lanc) },
                { l: "Transferências", v: String(detalhesConta.transf) },
              ].map(k => (
                <div key={k.l} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] px-3 py-2">
                  <div className="text-[10px] text-[var(--color-text-muted)]">{k.l}</div>
                  <div className={cn("text-sm font-bold tabular-nums", k.neg ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]")}>{k.v}</div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-[var(--color-border-subtle)] p-3 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)] flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Identificação</div>
            <div>
              <label className={lbl}>Nome da conta</label>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Nubank, Caixa da Loja..." className={cn(ctl, tentou && nomeErro && "border-danger")} autoFocus />
              {tentou && nomeErro && <p className="text-[10px] text-danger mt-1">{nomeErro}</p>}
              {nomeDuplicado && <p className="text-[10px] text-[var(--color-warning)] mt-1">Já existe uma conta com esse nome — considere diferenciar para não confundir nas seleções.</p>}
            </div>
            <div>
              <label className={lbl}>Tipo de conta</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={cn(ctl, "cursor-pointer")}>
                {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <p className="text-[10px] text-[var(--color-text-faint)] mt-1">{TIPO_HINTS[tipo]}</p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border-subtle)] p-3 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)] flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Saldo inicial</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Valor (R$)</label>
                <input type="number" step="0.01" min="0" disabled={sinal === "ZERADO"} value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} placeholder="0,00" className={cn(ctl, "font-mono disabled:opacity-50")} />
              </div>
              <div>
                <label className={lbl}>Sinal</label>
                <select value={sinal} onChange={(e) => setSinal(e.target.value as Sinal)} className={cn(ctl, "cursor-pointer")}>
                  <option value="POSITIVO">Positivo (crédito)</option>
                  <option value="NEGATIVO">Negativo (dívida)</option>
                  <option value="ZERADO">Zerado</option>
                </select>
              </div>
            </div>
            <p className="flex items-start gap-1.5 text-[10px] text-[var(--color-text-muted)]">
              <Info className="w-3 h-3 shrink-0 mt-0.5" />
              Saldo de partida: <strong className={cn("ml-0.5", saldoInicialAssinado < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]")}>{formatCurrency(saldoInicialAssinado)}</strong>. Recebimentos e transferências pagos somam; despesas pagas subtraem a partir daqui.
            </p>
          </div>

          {(!editingConta || !editingConta.arquivada) && (
            <label className={cn("flex items-start gap-2 text-xs cursor-pointer", (editingConta?.is_principal || contas.length === 0) && "opacity-70 cursor-default")}>
              <input
                type="checkbox"
                checked={principal || contas.length === 0}
                disabled={!!editingConta?.is_principal || contas.length === 0}
                onChange={(e) => setPrincipal(e.target.checked)}
                className="mt-0.5 cursor-pointer"
              />
              <span>
                <span className="font-bold text-[var(--color-text-primary)] flex items-center gap-1"><Star className="w-3 h-3 text-[var(--color-success)]" /> Conta principal</span>
                <span className="block text-[10px] text-[var(--color-text-faint)]">
                  {contas.length === 0 || editingConta?.is_principal ? "Esta é a conta principal — vem pré-selecionada nos novos lançamentos." : "Passa a vir pré-selecionada nos novos lançamentos (substitui a principal atual)."}
                </span>
              </span>
            </label>
          )}

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
            <div className="flex gap-2">
              {editingConta && (
                <>
                  <Button type="button" variant="outline" disabled={saving} onClick={async () => { if (await handleArchiveToggle(editingConta)) closeModal(); }} className="h-9 px-3 text-xs font-medium gap-1.5">
                    {editingConta.arquivada ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                    {editingConta.arquivada ? "Reativar" : "Arquivar"}
                  </Button>
                  <Button type="button" variant="outline" disabled={saving} onClick={async () => { if (await handleDelete(editingConta)) closeModal(); }} className="h-9 px-3 text-xs font-medium gap-1.5 text-[var(--color-danger)]">
                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                  </Button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={closeModal} disabled={saving} className="h-9 px-4 text-xs font-medium">Cancelar</Button>
              <Button type="submit" disabled={saving} className="h-9 px-5 text-xs font-medium gap-1.5">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingId ? "Salvar Alterações" : "Criar Conta"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <DrillDownPanel
        isOpen={drillContasOpen}
        onClose={() => setDrillContasOpen(false)}
        title="Contas Ativas"
        subtitle={`${listaAtiva.length} conta${listaAtiva.length === 1 ? "" : "s"}`}
        rows={listaAtiva}
        columns={contaColumns}
      />
    </PageContainer>
  );
}
