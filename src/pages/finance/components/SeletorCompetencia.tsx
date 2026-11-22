import { useMemo } from "react";
import { DateRangeFilter } from "../../../components/ui/DateRangeFilter";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Mês de competência escolhido no mesmo seletor de período das outras telas do Financeiro.
 * Para telas que fecham mês a mês (Comissões, Folha): cada atalho é um mês inteiro, e o calendário
 * personalizado vale pelo mês da data inicial.
 */
export function SeletorCompetencia({ mes, setMes }: { mes: Date; setMes: (d: Date) => void }) {
  const presets = useMemo(() => {
    const n = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(n.getFullYear(), n.getMonth() + 1 - i, 1); // mês que vem, este mês, e os 12 anteriores
      const rotulo = i === 0 ? "Mês que vem" : i === 1 ? "Este mês" : i === 2 ? "Mês passado" : `${MESES[d.getMonth()]} ${d.getFullYear()}`;
      return { label: rotulo, from: iso(d), to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    });
  }, []);
  const de = iso(new Date(mes.getFullYear(), mes.getMonth(), 1));
  const ate = iso(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));
  const aplicar = (v: string | null) => {
    const base = v ? new Date(`${v}T12:00:00`) : new Date();
    if (!Number.isNaN(base.getTime())) setMes(new Date(base.getFullYear(), base.getMonth(), 1));
  };
  return <DateRangeFilter dateFrom={de} setDateFrom={aplicar} dateTo={ate} setDateTo={() => { /* o mês vem da data inicial */ }} presets={presets} className="!h-9 !rounded-lg" />;
}
