import { useEffect, useState } from "react";
import { Check, ChevronRight, Clock, DollarSign, Pencil, Trash2, X, CalendarRange, Wallet, Percent, Hourglass } from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { cn } from "../../../lib/utils";
import type { Campanha } from "../useMarketingTrafego";
import { calcularCronograma, hojeBrasilia, dataCurta } from "../trafegoCronograma";
import { corPlataforma, siglaPlataforma } from "../trafegoPlataforma";
import { COR_PRIORIDADE, COR_TOM, type ColunaTrafego } from "./TrafegoColumn";

interface Props {
  /** Campanha aberta (sempre a versão atual da lista, para refletir mudanças de etapa/prioridade na hora). */
  campanha: Campanha | null;
  campanhas: Campanha[];
  colunas: ColunaTrafego[];
  onClose: () => void;
  onAtualizar: (id: string, patch: Partial<Campanha>) => Promise<boolean>;
  onEditar: (c: Campanha) => void;
  onExcluir: (id: string) => Promise<boolean>;
}

const ABAS = [
  { id: "resumo", label: "Resumo", icon: Wallet },
  { id: "cronograma", label: "Cronograma", icon: CalendarRange },
] as const;

/** Detalhes da campanha em painel lateral, no mesmo desenho dos detalhes do lead (faixa, cabeçalho, etapas clicáveis e abas). */
export function CampanhaDetalhesPainel({ campanha, campanhas, colunas, onClose, onAtualizar, onEditar, onExcluir }: Props) {
  const { formatCurrency } = useLocalization();
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("resumo");
  useEffect(() => { setAba("resumo"); }, [campanha?.id]);

  if (!campanha) return null;
  const c = campanha;
  const col = colunas.find((x) => x.id === c.colId);
  const idxAtual = colunas.findIndex((x) => x.id === c.colId);
  const hex = col?.hex ?? "#64748b";
  const cor = corPlataforma(c.platform);
  const cron = calcularCronograma(c, hojeBrasilia(), c.colId === "encerrada");
  const totalGeral = campanhas.reduce((s, x) => s + (x.value || 0), 0);
  const fatia = totalGeral > 0 ? Math.round(((c.value || 0) / totalGeral) * 1000) / 10 : 0;

  const kpis = [
    { icon: DollarSign, rotulo: "Orçamento", valor: formatCurrency(c.value || 0) },
    { icon: Wallet, rotulo: "Por dia", valor: cron.orcamentoPorDia !== null ? formatCurrency(cron.orcamentoPorDia) : "—" },
    { icon: Hourglass, rotulo: "Duração", valor: cron.duracao !== null ? `${cron.duracao} ${cron.duracao === 1 ? "dia" : "dias"}` : "—" },
    { icon: Percent, rotulo: "Do orçamento total", valor: totalGeral > 0 ? `${fatia.toLocaleString("pt-BR")}%` : "—" },
  ];

  const excluir = async () => {
    if (await confirmDialog({ title: "Excluir campanha?", description: `“${c.title}” será removida do quadro.`, confirmLabel: "Excluir" })) {
      if (await onExcluir(c.id)) onClose();
    }
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-[546px]" position="right" overlay="light" noPadding
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <button type="button" onClick={excluir} className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-control)] border border-danger/30 text-danger hover:bg-danger/10 text-xs font-bold cursor-pointer bg-transparent">
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </button>
          <button type="button" onClick={() => onEditar(c)} className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-control)] bg-[var(--color-primary-blue)] !text-white text-xs font-bold cursor-pointer border-none">
            <Pencil className="w-3.5 h-3.5" /> Editar campanha
          </button>
        </div>
      }
    >
      <div className="flex flex-col h-full overflow-hidden bg-[var(--color-surface)] animate-in fade-in duration-150">
        <div className="h-[3px] shrink-0" style={{ backgroundColor: hex }} />

        <div className="shrink-0 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border-default)]">
          <div className="flex items-center justify-between px-5 pt-3.5 pb-2.5">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border" style={{ color: hex, borderColor: `${hex}55`, backgroundColor: `${hex}14` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: hex }} /> {col?.title ?? "Sem etapa"}
            </span>
            <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] rounded-[var(--radius-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3.5 px-5 pb-3.5">
            <div className="w-12 h-12 rounded-xl grid place-items-center text-base font-black shrink-0 select-none" style={{ backgroundColor: `${cor}1f`, color: cor }}>{siglaPlataforma(c.platform)}</div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-[var(--color-text-primary)] leading-tight break-words">{c.title}</h2>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{c.platform}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-sm font-black text-[var(--color-primary-blue)] font-mono tracking-tight">{formatCurrency(c.value || 0)}</span>
                <div className="w-px h-3 bg-[var(--color-border-default)] shrink-0" />
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", COR_PRIORIDADE[c.priority])}>▲ {c.priority}</span>
                <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold", COR_TOM[cron.tom])}><Clock className="w-3 h-3" />{cron.rotulo}</span>
              </div>
            </div>
          </div>

          <div className="px-5 pb-3.5 overflow-x-auto scrollbar-none border-t border-[var(--color-border-subtle)] pt-2.5">
            <div className="flex items-center min-w-max">
              {colunas.map((stg, idx) => {
                const ativa = stg.id === c.colId, passada = idxAtual > idx;
                return (
                  <div key={stg.id} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => { if (!ativa) void onAtualizar(c.id, { colId: stg.id }); }}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-control)] text-[10px] font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer border",
                        ativa ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30 font-black shadow-sm"
                          : passada ? "text-success border-transparent hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-sunken)]"
                          : "text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-sunken)]",
                      )}
                    >
                      {ativa && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary-blue)] animate-pulse shrink-0" />}
                      {passada && <span className="w-3.5 h-3.5 rounded-full bg-success/15 grid place-items-center shrink-0"><Check className="w-2 h-2 text-success" /></span>}
                      {stg.title}
                    </button>
                    {idx < colunas.length - 1 && <ChevronRight className="w-3 h-3 text-[var(--color-text-faint)] shrink-0 mx-0.5" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex border-b border-[var(--color-border-subtle)] shrink-0 bg-[var(--color-surface-elevated)] px-2 pt-1.5 gap-1">
          {ABAS.map((t) => {
            const ativa = aba === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setAba(t.id)}
                className={cn("relative flex flex-col items-center justify-center gap-1 pt-2 pb-2.5 px-4 text-[9px] font-black tracking-wider uppercase whitespace-nowrap shrink-0 cursor-pointer min-w-[72px] rounded-t-lg border-none transition-all",
                  ativa ? "text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] bg-transparent")}>
                <t.icon className={cn("w-3.5 h-3.5", ativa ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-faint)]")} />
                <span>{t.label}</span>
                {ativa && <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--color-primary-blue)]" />}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
          {aba === "resumo" ? (
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {kpis.map((k) => (
                  <div key={k.rotulo} className="flex items-center gap-2.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl px-3 py-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-blue)]/10 grid place-items-center shrink-0"><k.icon className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /></div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-[var(--color-text-primary)] tabular-nums leading-none truncate">{k.valor}</div>
                      <div className="text-[8px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider mt-1">{k.rotulo}</div>
                    </div>
                  </div>
                ))}
              </div>

              <section className="space-y-1.5">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Prioridade</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(["Alta", "Média", "Baixa"] as const).map((p) => (
                    <button key={p} type="button" onClick={() => { if (p !== c.priority) void onAtualizar(c.id, { priority: p }); }}
                      className={cn("h-9 rounded-xl border text-xs font-bold transition-colors cursor-pointer",
                        c.priority === p ? COR_PRIORIDADE[p] : "bg-[var(--color-surface)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}>
                      {p}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Objetivo e observações</h3>
                {c.desc ? (
                  <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap break-words leading-relaxed bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl p-3">{c.desc}</p>
                ) : (
                  <p className="text-xs italic text-[var(--color-text-faint)]">Nenhum objetivo registrado. Use “Editar campanha” para descrever público, criativos e meta.</p>
                )}
              </section>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-4">
              <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black text-[var(--color-text-primary)]">{dataCurta(c.publishDateISO)}</span>
                  <span className="text-[var(--color-text-faint)]">→</span>
                  <span className="font-black text-[var(--color-text-primary)]">{c.endDateISO ? dataCurta(c.endDateISO) : "sem data final"}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${cron.progresso ?? 0}%`, backgroundColor: hex }} />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className={cn("font-bold flex items-center gap-1", COR_TOM[cron.tom])}><Clock className="w-3 h-3" />{cron.rotulo}</span>
                  <span className="text-[var(--color-text-faint)] font-semibold tabular-nums">{cron.progresso !== null ? `${cron.progresso}% do período` : "—"}</span>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Início", dataCurta(c.publishDateISO)],
                  ["Fim", c.endDateISO ? dataCurta(c.endDateISO) : "—"],
                  ["Dias corridos", cron.decorridos !== null ? String(cron.decorridos) : "—"],
                  ["Duração total", cron.duracao !== null ? `${cron.duracao} dias` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl px-3 py-2.5">
                    <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">{k}</dt>
                    <dd className="font-black text-[var(--color-text-primary)] mt-0.5">{v}</dd>
                  </div>
                ))}
              </dl>
              {!c.publishDateISO && <p className="text-xs italic text-[var(--color-text-faint)]">Defina a data de início em “Editar campanha” para acompanhar o cronograma e ver a campanha no calendário.</p>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
