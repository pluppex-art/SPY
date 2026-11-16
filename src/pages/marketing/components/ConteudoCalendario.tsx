import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";

interface Coluna { id: string; title: string; color: string }

interface Props {
  tasks: any[];
  colunas: Coluna[];
  /** Abre os detalhes da pauta. */
  onOpenTask: (task: any) => void;
  /** Cria uma pauta já com a data do dia clicado (AAAA-MM-DD). */
  onNovaPauta: (dataISO: string) => void;
  /** Como chamar cada item (padrão: pauta). Ex.: "campanha". */
  rotulo?: { singular: string; plural: string };
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MAX_POR_DIA = 3;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (ano: number, mes: number, dia: number) => `${ano}-${pad(mes + 1)}-${pad(dia)}`;

/** Calendário mensal das pautas de conteúdo: cada pauta aparece no dia da publicação. */
export function ConteudoCalendario({ tasks, colunas, onOpenTask, onNovaPauta, rotulo = { singular: "pauta", plural: "pautas" } }: Props) {
  const hoje = new Date();
  const [ref, setRef] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const ano = ref.getFullYear();
  const mes = ref.getMonth();
  const hojeISO = iso(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const corDaEtapa = useMemo(() => new Map(colunas.map((c) => [c.id, c])), [colunas]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, any[]>();
    for (const t of tasks) {
      if (!t.publishDateISO) continue;
      const lista = mapa.get(t.publishDateISO) ?? [];
      lista.push(t);
      mapa.set(t.publishDateISO, lista);
    }
    return mapa;
  }, [tasks]);
  const semData = useMemo(() => tasks.filter((t) => !t.publishDateISO), [tasks]);

  // Semanas completas (começando no domingo) que cobrem o mês.
  const celulas = useMemo(() => {
    const primeiro = new Date(ano, mes, 1);
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const vazios = primeiro.getDay();
    const total = Math.ceil((vazios + diasNoMes) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(ano, mes, 1 - vazios + i);
      return { dataISO: iso(d.getFullYear(), d.getMonth(), d.getDate()), dia: d.getDate(), doMes: d.getMonth() === mes };
    });
  }, [ano, mes]);

  const totalNoMes = celulas.filter((c) => c.doMes).reduce((n, c) => n + (porDia.get(c.dataISO)?.length ?? 0), 0);

  const chip = (t: any) => {
    const col = corDaEtapa.get(t.colId);
    return (
      <button
        key={t.id}
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpenTask(t); }}
        title={`${t.title}${t.platform ? ` · ${t.platform}` : ""}${col ? ` · ${col.title}` : ""}`}
        className="w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[10px] font-bold bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:border-[var(--color-primary-blue)] hover:text-[var(--color-primary-blue)] text-[var(--color-text-primary)] transition-colors cursor-pointer"
      >
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", col?.color ?? "bg-slate-500")} />
        <span className="truncate">{t.title}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setRef(new Date(ano, mes - 1, 1))} aria-label="Mês anterior"><ChevronLeft className="w-4 h-4" /></Button>
          <h3 className="min-w-[10rem] text-center text-sm font-black uppercase tracking-wider text-[var(--color-text-primary)]">{MESES[mes]} {ano}</h3>
          <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setRef(new Date(ano, mes + 1, 1))} aria-label="Próximo mês"><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" className="h-9 text-[11px] font-bold" onClick={() => setRef(new Date(hoje.getFullYear(), hoje.getMonth(), 1))}>Hoje</Button>
        </div>
        <span className="text-[11px] font-bold text-[var(--color-text-muted)]">{totalNoMes} {totalNoMes === 1 ? rotulo.singular : rotulo.plural} neste mês</span>
      </div>

      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface)] overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
          {DIAS.map((d) => (
            <div key={d} className="py-2 text-center text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {celulas.map((c, i) => {
            const doDia = porDia.get(c.dataISO) ?? [];
            const aberto = diaAberto === c.dataISO;
            const visiveis = aberto ? doDia : doDia.slice(0, MAX_POR_DIA);
            return (
              <div
                key={c.dataISO}
                onClick={() => c.doMes && onNovaPauta(c.dataISO)}
                className={cn(
                  "group relative min-h-[96px] md:min-h-[116px] p-1.5 space-y-1 border-b border-r border-[var(--color-border-subtle)] transition-colors",
                  (i + 1) % 7 === 0 && "border-r-0",
                  c.doMes ? "cursor-pointer hover:bg-[var(--color-surface-sunken)]/60" : "bg-[var(--color-surface-sunken)]/40 opacity-50",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-[11px] font-bold w-6 h-6 grid place-items-center rounded-full",
                    c.dataISO === hojeISO ? "bg-[var(--color-primary-blue)] text-white" : "text-[var(--color-text-muted)]",
                  )}>{c.dia}</span>
                  {c.doMes && (
                    <span className="opacity-0 group-hover:opacity-100 text-[var(--color-text-faint)] transition-opacity" title={`Nova ${rotulo.singular} neste dia`}><Plus className="w-3.5 h-3.5" /></span>
                  )}
                </div>
                {visiveis.map(chip)}
                {!aberto && doDia.length > MAX_POR_DIA && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDiaAberto(c.dataISO); }}
                    className="w-full text-left text-[10px] font-bold text-[var(--color-primary-blue)] hover:underline cursor-pointer"
                  >
                    + {doDia.length - MAX_POR_DIA} mais
                  </button>
                )}
                {aberto && doDia.length > MAX_POR_DIA && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDiaAberto(null); }}
                    className="w-full text-left text-[10px] font-bold text-[var(--color-text-muted)] hover:underline cursor-pointer"
                  >
                    mostrar menos
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {semData.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface)] p-4 space-y-2">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
            Sem data ({semData.length})
          </h4>
          <p className="text-[11px] text-[var(--color-text-faint)]">Abra a {rotulo.singular} e defina a data para ela aparecer no calendário.</p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{semData.map(chip)}</div>
        </div>
      )}

      {colunas.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {colunas.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--color-text-muted)]">
              <span className={cn("w-2 h-2 rounded-full", c.color)} /> {c.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
