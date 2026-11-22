import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { SeletorCompetencia } from "./components/SeletorCompetencia";
import { toast } from "sonner";
import { exportarXlsx } from "../../lib/exportXlsx";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useLocalization } from "../../contexts/LocalizationContext";
import { LegendaStatusFinanceiro, StatusFinanceiroBadge } from "./components/StatusFinanceiroBadge";
import { hojeISO, statusDoLancamento, useFinanceEntriesResumo, type LancamentoResumo } from "./hooks/useFinanceEntriesResumo";
import { SecaoCard } from "./components/SecaoCard";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/**
 * Agenda Financeira — calendário mensal de vencimentos (contas, parcelas,
 * contratos). Tudo o que tem data nos lançamentos aparece aqui, para qualquer
 * tipo de empresa.
 */
export default function FinanceiroAgenda() {
  const { rows, loading, erro, hoje } = useFinanceEntriesResumo();
  const { formatCurrency: brl } = useLocalization();
  const [ref, setRef] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [diaSel, setDiaSel] = useState<string>(hoje);

  const ano = ref.getFullYear();
  const mes = ref.getMonth();
  const prefixo = `${ano}-${String(mes + 1).padStart(2, "0")}`;

  const porDia = useMemo(() => {
    const m = new Map<string, LancamentoResumo[]>();
    for (const l of rows) {
      if (!l.date || !l.date.startsWith(prefixo)) continue;
      const arr = m.get(l.date) ?? [];
      arr.push(l);
      m.set(l.date, arr);
    }
    return m;
  }, [rows, prefixo]);

  const celulas = useMemo(() => {
    const primeiro = new Date(ano, mes, 1).getDay();
    const total = new Date(ano, mes + 1, 0).getDate();
    const out: (string | null)[] = Array(primeiro).fill(null);
    for (let d = 1; d <= total; d++) out.push(hojeISO(new Date(ano, mes, d)));
    return out;
  }, [ano, mes]);

  const doDia = porDia.get(diaSel) ?? [];
  const exportar = async () => {
    const linhas = [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([dia, ls]) => ls.map((l) => [dia, l.type === "Pagar" ? "A pagar" : "A receber", l.description, l.counterparty, l.installment_total && l.installment_total > 1 ? `${l.installment_number}/${l.installment_total}` : "", l.value, statusDoLancamento(l, hoje)]));
    try {
      await exportarXlsx(`agenda-${prefixo}`, [{
        nome: `Agenda ${MESES[mes]} ${ano}`,
        colunas: [{ titulo: "Vencimento", tipo: "data" }, { titulo: "Tipo", largura: 12 }, { titulo: "Descrição", largura: 40 }, { titulo: "Cliente / fornecedor", largura: 28 }, { titulo: "Parcela", largura: 10 }, { titulo: "Valor", tipo: "moeda" }, { titulo: "Status", largura: 12 }],
        linhas,
      }]);
      toast.success(`${linhas.length} lançamento(s) exportado(s).`);
    } catch {
      toast.error("Não foi possível gerar a planilha.");
    }
  };

  return (
    <PageContainer
      title="Agenda Financeira"
      description="Vencimentos de contas, parcelas e contratos no calendário do mês."
      actions={<div className="flex flex-wrap items-center justify-end gap-2"><SeletorCompetencia mes={ref} setMes={setRef} /><Button variant="outline" onClick={exportar} disabled={porDia.size === 0}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar mês</Button></div>}
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
      {erro && <Card className="p-4 text-sm text-red-600">{erro}</Card>}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-center">
          <h3 className="text-base font-semibold">{MESES[mes]} {ano}{loading ? " …" : ""}</h3>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[var(--color-text-muted)]">
          {DIAS.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {celulas.map((iso, i) => {
            if (!iso) return <div key={`v${i}`} />;
            const itens = porDia.get(iso) ?? [];
            const atrasado = itens.some((l) => statusDoLancamento(l, hoje) === "Atrasado");
            const aberto = itens.some((l) => l.status !== "Pago");
            const selecionado = iso === diaSel;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setDiaSel(iso)}
                className={`flex min-h-[3.25rem] flex-col items-center rounded-lg border p-1 text-xs transition-colors ${
                  selecionado ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10" : "border-[var(--color-border-default)]"
                } ${iso === hoje ? "font-bold" : ""}`}
              >
                <span>{Number(iso.slice(8))}</span>
                {itens.length > 0 && (
                  <span className={`mt-1 rounded-full px-1.5 text-[10px] font-semibold text-white ${atrasado ? "bg-red-500" : aberto ? "bg-amber-500" : "bg-emerald-500"}`}>
                    {itens.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <SecaoCard titulo={<>{diaSel.split("-").reverse().join("/")} — {doDia.length} lançamento(s)</>}>
        {doDia.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Nada vence neste dia.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border-default)]">
            {doDia.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.description}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {l.type === "Pagar" ? "A pagar" : "A receber"}
                    {l.installment_total && l.installment_total > 1 ? ` · parcela ${l.installment_number}/${l.installment_total}` : ""}
                    {l.counterparty ? ` · ${l.counterparty}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusFinanceiroBadge status={statusDoLancamento(l, hoje)} />
                  <span className={`font-semibold tabular-nums ${l.type === "Pagar" ? "text-red-600" : "text-emerald-600"}`}>{brl(l.value)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SecaoCard>

      <LegendaStatusFinanceiro />
      </div>
    </PageContainer>
  );
}
