import { useMemo } from "react";
import { DateRangeFilter } from "../../../components/ui/DateRangeFilter";

/** Ano escolhido no mesmo seletor de período das outras telas (cada atalho é um ano inteiro; o calendário vale pelo ano da data inicial). */
export function SeletorAno({ ano, setAno }: { ano: number; setAno: (a: number) => void }) {
  const presets = useMemo(() => {
    const atual = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => {
      const a = atual - i;
      return { label: i === 0 ? "Este ano" : i === 1 ? "Ano passado" : String(a), from: `${a}-01-01`, to: `${a}-12-31` };
    });
  }, []);
  const aplicar = (v: string | null) => {
    const a = v ? Number(v.slice(0, 4)) : new Date().getFullYear();
    if (Number.isFinite(a) && a > 1900) setAno(a);
  };
  return <DateRangeFilter dateFrom={`${ano}-01-01`} setDateFrom={aplicar} dateTo={`${ano}-12-31`} setDateTo={() => { /* o ano vem da data inicial */ }} presets={presets} className="!h-9 !rounded-lg" />;
}
