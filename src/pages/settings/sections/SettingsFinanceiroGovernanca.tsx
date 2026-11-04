import { useEffect, useMemo, useState } from "react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Lock, Trash2, ShieldCheck, PlusCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { confirmDialog } from "../../../components/ui/confirm-dialog";

const fmtDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");

export function ConfigFinanceiroBloqueioPeriodo() {
  const { financePeriodLocks, addFinancePeriodLock, deleteFinancePeriodLock, ensureNicheModulesLoaded } = useData();
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");

  const locks = [...(financePeriodLocks as any[])].sort((a, b) => (b.data_inicial || "").localeCompare(a.data_inicial || ""));

  const handleConfirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataInicial || !dataFinal) { toast.error("Informe a data inicial e a data final."); return; }
    if (dataFinal < dataInicial) { toast.error("A data final precisa ser depois da data inicial."); return; }
    await addFinancePeriodLock({ data_inicial: dataInicial, data_final: dataFinal });
    toast.success("Período bloqueado. Transações pagas nesse intervalo não podem mais ser editadas ou excluídas.");
    setDataInicial(""); setDataFinal("");
  };

  const handleRemover = async (id: string) => {
    if (!(await confirmDialog({ title: "Remover bloqueio", description: "Remover este bloqueio de período? As transações pagas voltam a poder ser editadas." }))) return;
    await deleteFinancePeriodLock(id);
    toast.success("Bloqueio removido.");
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Lock className="w-5 h-5 text-[var(--color-primary-blue)]" /> Bloqueio de Período</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">Transações pagas dentro de um período bloqueado não podem ser criadas, editadas ou excluídas. Lançamentos pendentes continuam livres.</p>
      </div>

      <Card className="p-5">
        <form onSubmit={handleConfirmar} className="flex flex-col sm:flex-row items-end gap-3">
          <div className="flex-1 w-full">
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Data Inicial</label>
            <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none" />
          </div>
          <div className="flex-1 w-full">
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Data Final</label>
            <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none" />
          </div>
          <Button type="submit" className="h-9 px-4 text-xs font-medium gap-1.5 shrink-0">
            <PlusCircle className="w-3.5 h-3.5" /> Confirmar Bloqueio
          </Button>
        </form>
      </Card>

      {locks.length === 0 ? (
        <p className="text-sm text-[var(--color-text-faint)] italic text-center py-8">Nenhum período bloqueado.</p>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto"><table className="min-w-[640px] w-full text-xs text-left">
            <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
              <tr><th className="px-5 py-3">Período Bloqueado</th><th className="px-5 py-3 text-right">Ações</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {locks.map(l => (
                <tr key={l.id}>
                  <td className="px-5 py-3 font-medium text-[var(--color-text-primary)]">{fmtDate(l.data_inicial)} — {fmtDate(l.data_final)}</td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" onClick={() => handleRemover(l.id)} className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10" title="Remover bloqueio">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}
    </div>
  );
}

const ACAO_LABEL: Record<string, string> = { CRIACAO: "Criação", ATUALIZACAO: "Atualização", EXCLUSAO: "Exclusão" };
const ACAO_TONE: Record<string, string> = {
  CRIACAO: "bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/25",
  ATUALIZACAO: "bg-[var(--color-info)]/10 text-[var(--color-info)] border-[var(--color-info)]/25",
  EXCLUSAO: "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/25",
};

export function ConfigFinanceiroAuditoria() {
  const { financeAuditLog, ensureNicheModulesLoaded } = useData();
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);
  const { formatCurrency } = useLocalization();
  const [filtroAcao, setFiltroAcao] = useState<string>("TODAS");
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    return (financeAuditLog as any[])
      .filter(l => filtroAcao === "TODAS" || l.tipo_acao === filtroAcao)
      .filter(l => !busca.trim() || (l.descricao_alvo || "").toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
  }, [financeAuditLog, filtroAcao, busca]);

  const grupos = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const l of filtrados) {
      const dia = new Date(l.data_hora).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      if (!map.has(dia)) map.set(dia, []);
      map.get(dia)!.push(l);
    }
    return Array.from(map.entries());
  }, [filtrados]);

  const formatDiffValue = (field: string, v: any) => {
    if (v === null || v === undefined) return "—";
    if (field === "value" && typeof v === "number") return formatCurrency(v);
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    return String(v);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[var(--color-primary-blue)]" /> Auditoria Financeira</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">Todo lançamento criado, editado ou excluído fica registrado aqui — com autor, horário e o que mudou.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
          <input type="text" placeholder="Buscar por descrição..." value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] pl-9 pr-3 py-2 text-xs focus:outline-none" />
        </div>
        <select value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value)} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none cursor-pointer">
          <option value="TODAS">Todas as ações</option>
          <option value="CRIACAO">Criação</option>
          <option value="ATUALIZACAO">Atualização</option>
          <option value="EXCLUSAO">Exclusão</option>
        </select>
      </div>

      {grupos.length === 0 ? (
        <p className="text-sm text-[var(--color-text-faint)] italic text-center py-8">Nenhum registro de auditoria ainda.</p>
      ) : (
        <div className="space-y-6">
          {grupos.map(([dia, logs]) => (
            <div key={dia}>
              <p className="text-[11px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wide mb-2">{dia}</p>
              <Card className="divide-y divide-[var(--color-border-subtle)]">
                {logs.map(l => (
                  <div key={l.id} className="p-4">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-[11px] font-mono text-[var(--color-text-faint)]">{new Date(l.data_hora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">{l.usuario_nome || "Usuário"}</span>
                      <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded border ${ACAO_TONE[l.tipo_acao] || ""}`}>{ACAO_LABEL[l.tipo_acao] || l.tipo_acao}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">— {l.descricao_alvo}</span>
                    </div>
                    {l.diff && Object.keys(l.diff).length > 0 && (
                      <div className="pl-2 border-l-2 border-[var(--color-border-subtle)] space-y-0.5 mt-2">
                        {Object.entries(l.diff as Record<string, { old: any; new: any }>).map(([campo, { old: o, new: n }]) => (
                          <p key={campo} className="text-[11px] text-[var(--color-text-muted)]">
                            <span className="font-medium">{campo}:</span> {formatDiffValue(campo, o)} <span className="text-[var(--color-text-faint)]">→</span> {formatDiffValue(campo, n)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
