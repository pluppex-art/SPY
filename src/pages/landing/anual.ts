import { precoDoCiclo } from "../../lib/catalogoSpy";
import { formatBRLCentavos } from "../../lib/dinheiro";

/** "1.970" (mensalidade da vitrine) → valor do plano anual já formatado; vazio se não der para ler. */
export function anualDoPlano(mensal: string): string {
  const n = Number(String(mensal).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? formatBRLCentavos(precoDoCiclo(Math.round(n * 100), "yearly")) : "";
}
