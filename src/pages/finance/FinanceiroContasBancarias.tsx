import { useMemo, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { Plus, Star, Pencil, Trash2, Archive, ArchiveRestore, Landmark, Repeat, Wallet, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { StatCell, StatCellRow } from "./components/StatCell";
import { saldoDaConta, transferenciasDaConta, type FinanceEntryLike } from "./lib/financeEngine";
import { cn } from "../../lib/utils";
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("CONTA_CORRENTE");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [sinal, setSinal] = useState<Sinal>("POSITIVO");

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
  const listaExibida = aba === "ativas" ? listaAtiva : aba === "arquivadas" ? listaArquivada : contas;

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
  };

  const openNew = () => { resetForm(); setIsModalOpen(true); };
  const openEdit = (c: ContaBancaria) => {
    setEditingId(c.id); setNome(c.nome); setTipo(c.tipo);
    setSaldoInicial(String(c.saldo_inicial)); setSinal(c.sinal_saldo_inicial);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome da conta."); return; }

    const payload = {
      nome: nome.trim(),
      tipo,
      saldo_inicial: sinal === "ZERADO" ? 0 : Math.abs(parseFloat(saldoInicial) || 0),
      sinal_saldo_inicial: sinal,
    };

    if (editingId) {
      await updateFinanceBankAccount(editingId, payload);
      toast.success("Conta atualizada.");
    } else {
      const isFirst = contas.length === 0;
      await addFinanceBankAccount({ ...payload, is_principal: isFirst, arquivada: false });
      toast.success("Conta bancária criada.");
    }
    setIsModalOpen(false);
    resetForm();
  };

  const handleDelete = async (c: ContaBancaria) => {
    if (emUso.has(c.id)) {
      toast.error("Esta conta tem lançamentos vinculados — arquive em vez de excluir.");
      return;
    }
    if (!(await confirmDialog({ title: "Excluir conta bancária", description: `Excluir "${c.nome}"? Essa ação não pode ser desfeita.` }))) return;
    await deleteFinanceBankAccount(c.id);
    toast.success("Conta excluída.");
  };

  const handleArchiveToggle = async (c: ContaBancaria) => {
    await updateFinanceBankAccount(c.id, { arquivada: !c.arquivada, ...(c.is_principal && !c.arquivada ? { is_principal: false } : {}) });
    toast.success(c.arquivada ? "Conta reativada." : "Conta arquivada.");
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
        <StatCellRow>
          <StatCell label="Saldo Total (Contas Ativas)" value={formatCurrency(saldoTotalAtivas)} icon={Wallet} tone={saldoTotalAtivas < 0 ? "danger" : "neutral"} />
          <StatCell label="Contas Ativas" value={listaAtiva.length} icon={Landmark} onClick={() => setDrillContasOpen(true)} />
          <StatCell label="Conta Principal" value={contaPrincipal ? contaPrincipal.nome : "—"} icon={Star} hint={contaPrincipal ? formatCurrency(saldoPorConta.get(contaPrincipal.id) ?? 0) : undefined} />
        </StatCellRow>

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

        <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] w-fit">
          {([
            { id: "ativas", label: `Ativas (${listaAtiva.length})` },
            { id: "arquivadas", label: `Arquivadas (${listaArquivada.length})` },
            { id: "todas", label: `Todas (${contas.length})` },
          ] as const).map(t => (
            <Button key={t.id} size="sm" variant={aba === t.id ? "default" : "ghost"} onClick={() => setAba(t.id)} className="h-7 px-3 text-xs font-medium">
              {t.label}
            </Button>
          ))}
        </div>

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

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); resetForm(); }} title={editingId ? "Editar Conta Bancária" : "Nova Conta Bancária"} maxWidth="max-w-md">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Tipo de Conta</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer">
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nome *</label>
            <input type="text" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Nubank, Caixa da Loja..." className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Saldo Inicial</label>
              <input type="number" step="0.01" disabled={sinal === "ZERADO"} value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} placeholder="0,00" className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] disabled:opacity-50" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Sinal</label>
              <select value={sinal} onChange={(e) => setSinal(e.target.value as Sinal)} className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer">
                <option value="POSITIVO">Positivo</option>
                <option value="NEGATIVO">Negativo</option>
                <option value="ZERADO">Zerado</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }} className="h-9 px-4 text-xs font-medium">Cancelar</Button>
            <Button type="submit" className="h-9 px-5 text-xs font-medium">{editingId ? "Salvar Alterações" : "Criar Conta"}</Button>
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
