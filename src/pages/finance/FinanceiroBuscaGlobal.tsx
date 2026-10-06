import { useMemo, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Download, CheckCircle2, Clock, ArrowUpRight, ArrowDownRight, Scale, ListOrdered } from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, type KpiItem } from "../../components/ui/kpi-filter-card";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { downloadCsv } from "../../lib/csvExport";
import { parseEntryDate } from "./lib/financeDates";
import { cn } from "../../lib/utils";

type Aba = "movimentacoes" | "contatos" | "centros";

/**
 * Busca global — ignora QUALQUER período selecionado em outras telas (varre
 * todos os lançamentos) e os totalizadores somam tudo, pago ou não —
 * validação obrigatória da especificação (§7).
 */
export default function FinanceiroBuscaGlobal() {
  const { financeEntries, financeCentrosCusto, financeBankAccounts } = useData();
  const { formatCurrency } = useLocalization();

  const [texto, setTexto] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [aba, setAba] = useState<Aba>("movimentacoes");

  const contaNome = (id: string) => (financeBankAccounts as any[]).find(c => c.id === id)?.nome;

  const resultadosMovimentacoes = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const min = parseFloat(valorMin), max = parseFloat(valorMax);
    const de = dataDe ? new Date(dataDe + "T00:00:00") : null;
    const ate = dataAte ? new Date(dataAte + "T23:59:59") : null;

    return (financeEntries as any[]).filter(e => {
      if (q) {
        const alvo = `${e.description || ""} ${e.category || ""} ${e.counterparty || ""} ${e.notes || ""}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      if (!isNaN(min) && e.value < min) return false;
      if (!isNaN(max) && e.value > max) return false;
      if (de || ate) {
        const d = parseEntryDate(e.date);
        if (!d) return false;
        if (de && d < de) return false;
        if (ate && d > ate) return false;
      }
      return true;
    });
  }, [financeEntries, texto, valorMin, valorMax, dataDe, dataAte]);

  const resultadosContatos = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const nomes = new Set<string>();
    for (const e of financeEntries as any[]) if (e.counterparty) nomes.add(e.counterparty);
    return Array.from(nomes).filter(n => !q || n.toLowerCase().includes(q)).sort();
  }, [financeEntries, texto]);

  const resultadosCentros = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (financeCentrosCusto as any[]).filter(c => !q || c.nome.toLowerCase().includes(q));
  }, [financeCentrosCusto, texto]);

  const entradas = resultadosMovimentacoes.filter(e => e.type === "Receber").reduce((s, e) => s + e.value, 0);
  const saidas = resultadosMovimentacoes.filter(e => e.type === "Pagar").reduce((s, e) => s + e.value, 0);

  const CONTROL = "flex items-center gap-1.5 bg-[var(--color-surface-elevated)] px-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] h-[38px]";
  const activeCount = (texto.trim() ? 1 : 0) + (valorMin || valorMax ? 1 : 0) + (dataDe || dataAte ? 1 : 0);
  const limparFiltros = () => { setTexto(""); setValorMin(""); setValorMax(""); setDataDe(""); setDataAte(""); };
  const kpis: KpiItem[] = [
    { label: "Entradas", value: formatCurrency(entradas), icon: ArrowUpRight, tone: "success", hint: "Soma de pagos e pendentes" },
    { label: "Saídas", value: formatCurrency(saidas), icon: ArrowDownRight, tone: "danger", hint: "Soma de pagos e pendentes" },
    { label: "Resultado", value: formatCurrency(entradas - saidas), icon: Scale, tone: entradas - saidas < 0 ? "danger" : "primary" },
    { label: "Movimentações", value: resultadosMovimentacoes.length, icon: ListOrdered, tone: "info" },
  ];

  const handleExport = () => {
    downloadCsv(`busca_financeira_${Date.now()}.csv`, ["Data", "Tipo", "Descrição", "Contato", "Categoria", "Valor", "Status"], resultadosMovimentacoes.map(e => [e.date, e.type, e.description, e.counterparty || "", e.category, e.value, e.status]));
  };

  return (
    <PageContainer
      title="Busca Financeira"
      description="Busca em todo o histórico, sem limite de período — os totalizadores somam pagos e pendentes."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Busca" }]}
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <KpiFilterCard id="finBuscaGlobal" kpis={kpis} activeCount={activeCount} onClear={limparFiltros}>
          <FilterBar>
            <FilterSearch value={texto} onChange={setTexto} placeholder="Buscar por descrição, categoria ou contato..." />
            <div className={CONTROL}>
              <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">Valor de</span>
              <input type="number" value={valorMin} onChange={(e) => setValorMin(e.target.value)} placeholder="0,00" className="w-20 bg-transparent text-xs font-mono text-[var(--color-text-primary)] focus:outline-none" />
            </div>
            <div className={CONTROL}>
              <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">até</span>
              <input type="number" value={valorMax} onChange={(e) => setValorMax(e.target.value)} placeholder="0,00" className="w-20 bg-transparent text-xs font-mono text-[var(--color-text-primary)] focus:outline-none" />
            </div>
            <DateRangeFilter dateFrom={dataDe || null} setDateFrom={(v) => setDataDe(v ?? "")} dateTo={dataAte || null} setDateTo={(v) => setDataAte(v ?? "")} className="h-[38px]" />
          </FilterBar>
        </KpiFilterCard>

        <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] w-fit">
          {([
            { id: "movimentacoes", label: `Movimentações (${resultadosMovimentacoes.length})` },
            { id: "contatos", label: `Contatos (${resultadosContatos.length})` },
            { id: "centros", label: `Centros de Custo (${resultadosCentros.length})` },
          ] as const).map(t => (
            <Button key={t.id} size="sm" variant={aba === t.id ? "default" : "ghost"} onClick={() => setAba(t.id)} className="h-7 px-3 text-xs font-medium">{t.label}</Button>
          ))}
        </div>

        {aba === "movimentacoes" && (
          <>
            <div className="flex justify-end">
              <Button onClick={handleExport} variant="outline" className="h-9 px-4 text-xs font-medium gap-1.5"><Download className="w-3.5 h-3.5" /> Exportar</Button>
            </div>
            <Card className="overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                  <tr><th className="px-4 py-3 w-8"></th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Descrição</th><th className="px-4 py-3">Contato</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3 text-right">Valor</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {resultadosMovimentacoes.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--color-text-faint)]">Nenhum resultado encontrado.</td></tr>
                  ) : resultadosMovimentacoes.slice(0, 200).map(e => (
                    <tr key={e.id} className="hover:bg-[var(--color-surface-sunken)]/50">
                      <td className="px-4 py-2.5">{e.status === "Pago" ? <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" /> : <Clock className="w-3.5 h-3.5 text-[var(--color-danger)]" />}</td>
                      <td className="px-4 py-2.5 font-mono text-[var(--color-text-muted)]">{e.date}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{e.type === "Receber" ? "Recebimento" : "Despesa"}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[var(--color-text-primary)] font-medium">{e.description}{e.installment_total > 1 && <span className="ml-1 text-[10px] text-[var(--color-text-faint)]">({e.installment_number}/{e.installment_total})</span>}</span>
                        {e.conta_bancaria_id && <span className="block text-[10px] text-[var(--color-text-faint)]">{contaNome(e.conta_bancaria_id)}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{e.counterparty || "—"}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{e.category}</td>
                      <td className={cn("px-4 py-2.5 text-right tabular-nums font-semibold", e.type === "Receber" ? "text-[var(--color-success)]" : "text-[var(--color-danger)]")}>{formatCurrency(e.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resultadosMovimentacoes.length > 200 && <p className="text-[11px] text-[var(--color-text-faint)] text-center py-3 border-t border-[var(--color-border-subtle)]">Mostrando 200 de {resultadosMovimentacoes.length} resultados — refine a busca para ver menos.</p>}
            </Card>
          </>
        )}

        {aba === "contatos" && (
          <Card className="overflow-hidden">
            {resultadosContatos.length === 0 ? <p className="text-xs text-[var(--color-text-faint)] p-6 text-center">Nenhum contato encontrado.</p> : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {resultadosContatos.map(nome => {
                  const lancamentos = (financeEntries as any[]).filter(e => e.counterparty === nome);
                  const total = lancamentos.reduce((s, e) => s + e.value, 0);
                  return (
                    <div key={nome} className="px-6 py-3 flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--color-text-primary)]">{nome}</span>
                      <span className="text-[var(--color-text-muted)]">{lancamentos.length} lançamento(s) · {formatCurrency(total)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {aba === "centros" && (
          <Card className="overflow-hidden">
            {resultadosCentros.length === 0 ? <p className="text-xs text-[var(--color-text-faint)] p-6 text-center">Nenhum centro de custo encontrado.</p> : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {resultadosCentros.map((c: any) => (
                  <div key={c.id} className="px-6 py-3 flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--color-text-primary)]">{c.nome}</span>
                    <span className="text-[var(--color-text-muted)]">{c.codigo}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
