/** Selos do cartão no quadro: situação, quem está com a bola, prazo, tentativa da repescagem e pausa. */
import { Pause } from "lucide-react";
import { cn } from "../../lib/utils";
import { NOME_DA_BOLA, NOME_DO_SLA, situacaoDoPrazo, type Sla } from "../../lib/metodo/regras";
import { useMetodo } from "./MetodoProvider";

export const COR_DO_SLA: Record<Sla, string> = {
  em_dia: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  atencao: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  estourado: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};
const selo = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold";
export const diaCurto = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

export function SelosDoCartao({ lead }: { lead: { id: string; stageId?: string } }) {
  const info = useMetodo().info(lead);
  if (!info?.situacao) return null; // sem situação (perdidos antigos) não há o que mostrar
  const { estado, situacao } = info;
  const sla = situacaoDoPrazo(estado);
  const pausado = !!estado?.pausa_ate;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={cn(selo, "bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)]")}>{situacao!.nome_exibido}</span>
      {situacao?.bola_com && <span className={cn(selo, "border border-[var(--color-border-default)] text-[var(--color-text-muted)]")}>{NOME_DA_BOLA[situacao.bola_com]}</span>}
      {!pausado && sla && <span className={cn(selo, COR_DO_SLA[sla])}>{NOME_DO_SLA[sla]}</span>}
      {info.tipo === "repescagem" && !!estado?.repescagem_tentativa && <span className={cn(selo, "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]")}>Tentativa {estado.repescagem_tentativa}</span>}
      {pausado && <span className={cn(selo, "bg-sky-500/10 text-sky-700 dark:text-sky-400")}><Pause className="w-2.5 h-2.5" /> até {diaCurto(estado!.pausa_ate!)}</span>}
    </div>
  );
}
