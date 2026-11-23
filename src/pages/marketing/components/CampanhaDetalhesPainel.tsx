import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Clock, DollarSign, Pencil, Trash2, X, CalendarRange, Wallet, Percent, Hourglass, Users, Copy, Trophy, TrendingUp, CheckSquare, StickyNote, Plus, User as UserIcon, Target } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";
import { isLeadWon, isLeadLost } from "../../../lib/leadStatus";
import { parseCurrencyBR } from "../../../lib/utils";
import { leadDaCampanha, slugCampanha } from "../campanhasComum";
import { Modal } from "../../../components/ui/modal";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { cn } from "../../../lib/utils";
import type { Campanha } from "../useMarketingTrafego";
import { calcularCronograma, hojeBrasilia, dataCurta } from "../trafegoCronograma";
import { corPlataforma, siglaPlataforma } from "../trafegoPlataforma";
import { CampanhaFormulario } from "./CampanhaFormulario";
import { COR_PRIORIDADE, COR_TOM, iniciais, type ColunaTrafego } from "./TrafegoColumn";
import { useAuth } from "../../../contexts/AuthContext";

interface Props {
  /** Campanha aberta (sempre a versão atual da lista, para refletir mudanças de etapa/prioridade na hora). */
  campanha: Campanha | null;
  campanhas: Campanha[];
  colunas: ColunaTrafego[];
  onClose: () => void;
  onAtualizar: (id: string, patch: Partial<Campanha>) => Promise<boolean>;
  /** Grava a campanha inteira (formulário de edição dentro do painel). */
  onSalvarCampanha: (dados: Omit<Campanha, "id" | "date">, id?: string) => Promise<boolean>;
  onExcluir: (id: string) => Promise<boolean>;
}

const ABAS = [
  { id: "resumo", label: "Resumo", icon: Wallet },
  { id: "cronograma", label: "Cronograma", icon: CalendarRange },
  { id: "checklist", label: "Checklist", icon: CheckSquare },
  { id: "notas", label: "Notas", icon: StickyNote },
  { id: "leads", label: "Leads", icon: Users },
] as const;

/** Detalhes da campanha em painel lateral, no mesmo desenho dos detalhes do lead (faixa, cabeçalho, etapas clicáveis e abas). */
export function CampanhaDetalhesPainel({ campanha, campanhas, colunas, onClose, onAtualizar, onSalvarCampanha, onExcluir }: Props) {
  const { formatCurrency } = useLocalization();
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("resumo");
  const [editando, setEditando] = useState(false);
  useEffect(() => { setAba("resumo"); setEditando(false); }, [campanha?.id]);
  const { leads } = useData();
  const { user } = useAuth() as any;
  const [novoItem, setNovoItem] = useState("");
  const [novaNota, setNovaNota] = useState("");
  useEffect(() => { setNovoItem(""); setNovaNota(""); }, [campanha?.id]);
  // Leads do SPY que chegaram por esta campanha: o utm_campaign do lead é o nome da campanha (sem acento) ou o código dela.
  const doLead = useMemo(() => {
    if (!campanha) return [];
    return (leads as any[]).filter((l) => leadDaCampanha(l, { id: campanha.id, nome: campanha.title }));
  }, [leads, campanha]);

  if (!campanha) return null;
  const c = campanha;
  const col = colunas.find((x) => x.id === c.colId);
  const idxAtual = colunas.findIndex((x) => x.id === c.colId);
  const hex = col?.hex ?? "#64748b";
  const cor = corPlataforma(c.platform);
  const cron = calcularCronograma(c, hojeBrasilia(), c.colId === "encerrada");
  const totalGeral = campanhas.reduce((s, x) => s + (x.value || 0), 0);
  const fatia = totalGeral > 0 ? Math.round(((c.value || 0) / totalGeral) * 1000) / 10 : 0;

  const ganhos = doLead.filter((l) => isLeadWon(l.status));
  const receita = ganhos.reduce((t, l) => t + parseCurrencyBR(l.value), 0);
  const utm = slugCampanha(c.title);
  const reais = (n: number | null) => (n === null ? "—" : formatCurrency(n));
  const resultados = [
    { icon: Users, rotulo: "Leads", valor: String(doLead.length) },
    { icon: Trophy, rotulo: "Vendas", valor: String(ganhos.length) },
    { icon: DollarSign, rotulo: "Receita", valor: formatCurrency(receita) },
    { icon: TrendingUp, rotulo: "Retorno s/ orçamento", valor: c.value > 0 && ganhos.length > 0 ? `${(receita / c.value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x` : "—" },
    { icon: Wallet, rotulo: "Custo por lead*", valor: reais(c.value > 0 && doLead.length > 0 ? c.value / doLead.length : null) },
    { icon: Percent, rotulo: "Lead → venda", valor: doLead.length > 0 ? `${Math.round((ganhos.length / doLead.length) * 1000) / 10}%` : "—" },
  ];

  const gastoPct = c.value > 0 ? Math.round((c.gastoReal / c.value) * 100) : 0;
  const feitos = c.checklist.filter((i) => i.feito).length;
  const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));
  const autor = (user?.name || user?.email || "Você") as string;
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
      footer={editando ? undefined : (
        <div className="flex items-center justify-between w-full gap-2">
          <button type="button" onClick={excluir} className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-control)] border border-danger/30 text-danger hover:bg-danger/10 text-xs font-bold cursor-pointer bg-transparent">
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </button>
          <button type="button" onClick={() => setEditando(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-control)] bg-[var(--color-primary-blue)] !text-white text-xs font-bold cursor-pointer border-none">
            <Pencil className="w-3.5 h-3.5" /> Editar campanha
          </button>
        </div>
      )}
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
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>{c.platform}</span>
                <span className="text-[var(--color-text-faint)]">·</span>
                <span className="inline-flex items-center gap-1"><UserIcon className="w-3 h-3 text-[var(--color-text-faint)]" />{c.responsavel || "Sem responsável"}</span>
              </p>
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
              <button key={t.id} type="button" onClick={() => { setAba(t.id); setEditando(false); }}
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
          {editando ? (
            <div className="px-5 py-4">
              <CampanhaFormulario campanha={c} colunas={colunas} onSalvar={onSalvarCampanha} onSalvo={() => setEditando(false)} onCancelar={() => setEditando(false)} />
            </div>
          ) : aba === "checklist" ? (
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-black text-[var(--color-text-primary)]">{feitos} de {c.checklist.length} concluídos</span>
                <span className="text-[var(--color-text-faint)] font-semibold tabular-nums">{c.checklist.length ? Math.round((feitos / c.checklist.length) * 100) : 0}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${c.checklist.length ? (feitos / c.checklist.length) * 100 : 0}%` }} /></div>
              <ul className="space-y-1.5">
                {c.checklist.map((i) => (
                  <li key={i.id} className="flex items-center gap-2.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl px-3 py-2">
                    <input type="checkbox" checked={i.feito} onChange={() => void onAtualizar(c.id, { checklist: c.checklist.map((x) => (x.id === i.id ? { ...x, feito: !x.feito } : x)) })} className="w-4 h-4 cursor-pointer accent-[var(--color-primary-blue)]" aria-label={i.texto} />
                    <span className={cn("flex-1 text-xs font-semibold", i.feito ? "line-through text-[var(--color-text-faint)]" : "text-[var(--color-text-primary)]")}>{i.texto}</span>
                    <button type="button" onClick={() => void onAtualizar(c.id, { checklist: c.checklist.filter((x) => x.id !== i.id) })} aria-label={`Remover ${i.texto}`} className="text-[var(--color-text-faint)] hover:text-danger cursor-pointer bg-transparent border-none p-0.5"><X className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
                {c.checklist.length === 0 && <li className="text-xs italic text-[var(--color-text-faint)]">Nenhum item. Adicione as etapas que precisam ser feitas antes de a campanha ir ao ar.</li>}
              </ul>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = novoItem.trim(); if (!t) return; void onAtualizar(c.id, { checklist: [...c.checklist, { id: novoId(), texto: t, feito: false }] }); setNovoItem(""); }}>
                <input value={novoItem} onChange={(e) => setNovoItem(e.target.value)} maxLength={200} placeholder="Novo item…" className="flex-1 h-9 px-3 rounded-xl text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)]" />
                <button type="submit" disabled={!novoItem.trim()} className="h-9 px-3 rounded-xl bg-[var(--color-primary-blue)] !text-white text-xs font-bold flex items-center gap-1 cursor-pointer border-none disabled:opacity-40"><Plus className="w-3.5 h-3.5" />Adicionar</button>
              </form>
            </div>
          ) : aba === "notas" ? (
            <div className="px-5 py-4 space-y-3">
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const t = novaNota.trim(); if (!t) return; void onAtualizar(c.id, { notas: [...c.notas, { id: novoId(), autor, texto: t, em: new Date().toISOString() }] }); setNovaNota(""); }}>
                <textarea rows={3} value={novaNota} onChange={(e) => setNovaNota(e.target.value)} maxLength={2000} placeholder="Registre uma decisão, ajuste de público, resultado parcial…" className="w-full px-3 py-2 rounded-xl text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)] resize-none" />
                <div className="flex justify-end"><button type="submit" disabled={!novaNota.trim()} className="h-8 px-3 rounded-xl bg-[var(--color-primary-blue)] !text-white text-xs font-bold cursor-pointer border-none disabled:opacity-40">Salvar nota</button></div>
              </form>
              <ul className="space-y-2">
                {[...c.notas].reverse().map((n) => (
                  <li key={n.id} className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--color-text-faint)] mb-1">
                      <span className="font-black text-[var(--color-text-muted)] truncate">{n.autor || "—"}</span>
                      <span className="flex items-center gap-2 shrink-0">{n.em ? new Date(n.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                        <button type="button" onClick={() => void onAtualizar(c.id, { notas: c.notas.filter((x) => x.id !== n.id) })} aria-label="Excluir nota" className="hover:text-danger cursor-pointer bg-transparent border-none p-0"><X className="w-3 h-3" /></button></span>
                    </div>
                    <p className="text-xs text-[var(--color-text-primary)] whitespace-pre-wrap break-words">{n.texto}</p>
                  </li>
                ))}
                {c.notas.length === 0 && <li className="text-xs italic text-[var(--color-text-faint)]">Nenhuma nota ainda.</li>}
              </ul>
            </div>
          ) : aba === "leads" ? (
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {resultados.map((k) => (
                  <div key={k.rotulo} className="flex items-center gap-2.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl px-3 py-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-blue)]/10 grid place-items-center shrink-0"><k.icon className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /></div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-[var(--color-text-primary)] tabular-nums leading-none truncate">{k.valor}</div>
                      <div className="text-[8px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider mt-1">{k.rotulo}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[var(--color-text-faint)] -mt-2">* Calculado sobre o orçamento planejado, não sobre o gasto real da plataforma.</p>

              <section className="space-y-1.5">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Como ligar os leads a esta campanha</h3>
                <div className="flex items-center gap-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl p-2.5">
                  <code className="flex-1 min-w-0 truncate text-xs font-mono text-[var(--color-text-primary)]">utm_campaign={utm || "…"}</code>
                  <button type="button" disabled={!utm} onClick={async () => { try { await navigator.clipboard.writeText(utm); toast.success("Copiado."); } catch { toast.error("Não foi possível copiar."); } }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--color-border-default)] text-[10px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer bg-transparent disabled:opacity-40">
                    <Copy className="w-3 h-3" /> Copiar
                  </button>
                </div>
                <p className="text-[10px] text-[var(--color-text-faint)]">Use esse valor no link do anúncio (o Gerador de link UTM faz isso). Leads que chegarem com ele aparecem aqui.</p>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Leads desta campanha ({doLead.length})</h3>
                {doLead.length === 0 ? (
                  <p className="text-xs italic text-[var(--color-text-faint)]">Nenhum lead ligado a esta campanha ainda.</p>
                ) : (
                  <ul className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden bg-[var(--color-surface-elevated)]">
                    {doLead.slice(0, 50).map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{l.company || l.name || "Sem nome"}</p>
                          <p className="text-[10px] text-[var(--color-text-faint)] truncate">{l.name && l.company ? l.name : l.source || ""}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded border", isLeadWon(l.status) ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : isLeadLost(l.status) ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)]")}>{l.status}</span>
                          {parseCurrencyBR(l.value) > 0 && <p className="text-[10px] font-mono font-bold text-[var(--color-text-muted)] mt-0.5">{formatCurrency(parseCurrencyBR(l.value))}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {doLead.length > 50 && <p className="text-[10px] text-[var(--color-text-faint)]">Mostrando 50 de {doLead.length}.</p>}
              </section>
            </div>
          ) : aba === "resumo" ? (
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
                <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Gasto x orçamento</h3>
                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-black text-[var(--color-text-primary)] font-mono">{formatCurrency(c.gastoReal)}</span>
                    <span className="text-[var(--color-text-faint)]">de {formatCurrency(c.value || 0)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                    <div className={cn("h-full rounded-full", gastoPct > 100 ? "bg-rose-500" : gastoPct > 85 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, gastoPct)}%` }} />
                  </div>
                  <p className="text-[10px] text-[var(--color-text-faint)]">
                    {c.gastoReal <= 0 ? "Gasto real não informado. Informe em “Editar campanha” para acompanhar." : c.value > 0 ? (gastoPct > 100 ? `Estourou o orçamento em ${formatCurrency(c.gastoReal - c.value)}.` : `${gastoPct}% do orçamento usado; restam ${formatCurrency(c.value - c.gastoReal)}.`) : "Sem orçamento definido."}
                  </p>
                </div>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Ficha da campanha</h3>
                <dl className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden bg-[var(--color-surface-elevated)] text-xs">
                  {[
                    ["Responsável", c.responsavel || "Sem responsável"],
                    ["Plataforma", c.platform],
                    ["Objetivo", c.objetivo || "—"],
                    ["Público-alvo", c.publico || "—"],
                    ["Etapa", col?.title ?? "—"],
                    ["Período", c.publishDateISO ? `${dataCurta(c.publishDateISO)} → ${c.endDateISO ? dataCurta(c.endDateISO) : "sem data final"}` : "Sem data de início"],
                    ["Situação", cron.rotulo],
                    ["Leads ligados", `${doLead.length}${ganhos.length ? ` (${ganhos.length} ${ganhos.length === 1 ? "venda" : "vendas"})` : ""}`],
                    ["Código UTM", utm || "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                      <dt className="text-[var(--color-text-faint)] font-semibold">{k}</dt>
                      <dd className="font-bold text-[var(--color-text-primary)] text-right truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

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
