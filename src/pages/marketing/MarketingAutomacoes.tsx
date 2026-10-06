import { useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, Bar, Line, ComposedChart, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  MessageSquarePlus, Loader2, Users, Check, X, Trash2, AlertTriangle, Sparkles, Workflow, MessageCircle,
  Clock, TrendingUp, TrendingDown, Lightbulb, BookOpen, Send,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { useData } from "../../contexts/DataContext";
import { useMessageTriggers, type MessageTrigger } from "../../hooks/useMessageTriggers";
import { AutomationFunilConnections } from "./AutomationFunilConnections";
import { GATILHO_TEMPLATES, CANAIS_ENVIO, buildJuliaSuggestions, computeTriggerStats } from "./autoTriggerSuggestions";
import { cn } from "../../lib/utils";

// Central de Automações — o tenant descreve em texto livre quem quer contatar (ex: "mandar
// mensagem pra quem não tem contato há 2 meses"), a Júlia (via n8n) interpreta e monta a lista
// de leads + o texto que mandaria, e NADA é enviado de verdade até você aprovar essa lista e
// mensagem específicas aqui. Ver useMessageTriggers.ts e server/messageTriggers.ts.

const STATUS_LABEL: Record<MessageTrigger["status"], { label: string; tone: "neutral" | "warning" | "info" | "success" | "destructive" }> = {
  pendente_interpretacao: { label: "Analisando...", tone: "neutral" },
  aguardando_confirmacao: { label: "Aguardando aprovação", tone: "warning" },
  aprovado: { label: "Enviando...", tone: "info" },
  executado: { label: "Enviado", tone: "success" },
  rejeitado: { label: "Rejeitado", tone: "neutral" },
  erro: { label: "Não entendido", tone: "destructive" },
};

function TriggerCard({ trigger, onAprovar, onRejeitar, onRemover }: {
  trigger: MessageTrigger;
  onAprovar: (id: string) => Promise<void>;
  onRejeitar: (id: string) => Promise<void>;
  onRemover: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const status = STATUS_LABEL[trigger.status];
  const canReview = trigger.status === "aguardando_confirmacao";

  const handleAprovar = async () => {
    if (!(await confirmDialog({
      title: "Aprovar e enviar",
      description: `Isso vai mandar mensagem de verdade pra ${trigger.leadsEncontrados.length} contato(s) real(is). Essa ação não pode ser desfeita.`,
    }))) return;
    setBusy(true);
    await onAprovar(trigger.id);
    setBusy(false);
  };

  return (
    <Card className="p-5 space-y-3 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[var(--color-text-primary)] leading-relaxed flex-1">"{trigger.descricao}"</p>
        <Badge variant={status.tone} className="shrink-0">{status.label}</Badge>
      </div>

      {trigger.status === "pendente_interpretacao" && (
        <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> A Júlia está lendo seu pedido e montando a lista...
        </p>
      )}

      {trigger.status === "erro" && (
        <p className="text-xs text-danger flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {trigger.erro || "Não foi possível entender esse pedido."}
        </p>
      )}

      {(trigger.status === "aguardando_confirmacao" || trigger.status === "aprovado" || trigger.status === "executado") && trigger.resumoInterpretado && (
        <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]">
          <p className="text-xs text-[var(--color-text-primary)]">
            <span className="font-bold">Entendi assim:</span> {trigger.resumoInterpretado}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {trigger.leadsEncontrados.length} contato(s) encontrado(s)
          </p>
          {trigger.mensagemSugerida && (
            <div className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl p-2.5">
              <p className="text-[9px] font-bold uppercase text-[var(--color-text-faint)] mb-1">Mensagem que ela mandaria</p>
              <p className="text-xs text-[var(--color-text-muted)] italic">"{trigger.mensagemSugerida}"</p>
            </div>
          )}
        </div>
      )}

      {canReview && (
        <div className="flex items-center gap-2 pt-1">
          <Button onClick={handleAprovar} disabled={busy || trigger.leadsEncontrados.length === 0} className="h-8 px-3 text-[11px] font-bold gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aprovar e enviar
          </Button>
          <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); await onRejeitar(trigger.id); setBusy(false); }} className="h-8 px-3 text-[11px] font-bold gap-1.5">
            <X className="w-3.5 h-3.5" /> Rejeitar
          </Button>
        </div>
      )}

      {(trigger.status === "rejeitado" || trigger.status === "erro" || trigger.status === "executado") && (
        <button
          onClick={async () => { if (await confirmDialog({ title: "Remover gatilho", description: "Remover este registro da lista?" })) await onRemover(trigger.id); }}
          className="text-[10px] font-bold text-[var(--color-text-faint)] hover:text-danger flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> Remover
        </button>
      )}
    </Card>
  );
}

type Aba = "julia" | "funis";

export default function MarketingAutomacoes() {
  const { leads, proposals, contracts } = useData();
  const { triggers, loading, criar, aprovar, rejeitar, remover } = useMessageTriggers();
  const [descricao, setDescricao] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [aba, setAba] = useState<Aba>("julia");
  const [tipoSelecionado, setTipoSelecionado] = useState<string | null>(null);
  const [canalSelecionado, setCanalSelecionado] = useState("whatsapp");
  const [mostrarExemplos, setMostrarExemplos] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    if (!descricao.trim()) { toast.error("Descreva o que você quer que aconteça."); return; }
    setSubmitting(true);
    const { error } = await criar(descricao.trim());
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    setDescricao("");
    setTipoSelecionado(null);
    toast.success("Pedido enviado — a Júlia já está analisando.");
  };

  const usarTexto = (texto: string) => {
    setDescricao(texto);
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const stats = useMemo(() => computeTriggerStats(triggers, dateFrom, dateTo), [triggers, dateFrom, dateTo]);
  const sugestoes = useMemo(() => buildJuliaSuggestions({ leads, proposals, contracts }), [leads, proposals, contracts]);

  // Filtros da lista de gatilhos (busca, status e o período global do topo).
  const triggersFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return triggers.filter((t) => {
      if (statusFiltro && t.status !== statusFiltro) return false;
      const dia = (t.createdAt || "").slice(0, 10);
      if (dateFrom && dia < dateFrom) return false;
      if (dateTo && dia > dateTo) return false;
      return !q || (t.descricao || "").toLowerCase().includes(q);
    });
  }, [triggers, busca, statusFiltro, dateFrom, dateTo]);
  const emAberto = useMemo(
    () => triggersFiltrados.filter((t) => t.status === "aguardando_confirmacao" || t.status === "pendente_interpretacao" || t.status === "erro"),
    [triggersFiltrados]
  );
  const recentes = useMemo(() => triggersFiltrados.slice(0, 8), [triggersFiltrados]);
  const activeCount = (busca.trim() ? 1 : 0) + (statusFiltro ? 1 : 0) + (dateFrom || dateTo ? 1 : 0);


  return (
    <PageContainer
      title="Central de Automações S.P.Y."
      description={aba === "julia"
        ? "Descreva quem você quer contatar em texto livre — a Júlia entende, monta a lista e a mensagem, e só envia depois que você aprovar."
        : "Conecte etapas do funil comercial (ou categorias de produto vendidas) a departamentos da Operação — monte como você quiser, sem precisar de ninguém mexer em configuração."}
      actions={
        aba === "julia" ? (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setMostrarExemplos((v) => !v)} className="h-9 px-3 text-xs font-bold gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Modelos de gatilho
            </Button>
            <Button onClick={() => usarTexto(descricao)} className="h-9 px-4 text-xs font-bold gap-1.5">
              <MessageSquarePlus className="w-3.5 h-3.5" /> Novo gatilho
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6 pb-20">
        <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] w-fit">
          {([["julia", "Gatilho → Mensagem (Júlia)", MessageCircle], ["funis", "Gatilho → Funis / OS", Workflow]] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setAba(v)}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-[calc(var(--radius-control)-2px)] cursor-pointer transition-all flex items-center gap-1.5",
                aba === v ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {aba === "julia" ? (
          <div className="space-y-6">
            <KpiFilterCard
              id="marketingAutomacoes"
              kpis={[
                { label: "Aguardando aprovação", value: stats.aguardando, icon: Sparkles, tone: "warning",
                  hint: stats.aguardandoDeltaSemana !== 0 ? `${stats.aguardandoDeltaSemana > 0 ? "+" : ""}${stats.aguardandoDeltaSemana} vs semana passada` : undefined },
                { label: "Gatilhos enviados", value: stats.enviados, icon: Check, tone: "success",
                  hint: stats.enviadosDeltaPct !== null ? `${stats.enviadosDeltaPct >= 0 ? "+" : ""}${stats.enviadosDeltaPct}% vs mês anterior` : undefined },
                { label: "Contatos alcançados", value: stats.contatos, icon: Users, tone: "primary",
                  hint: stats.contatosDeltaPct !== null ? `${stats.contatosDeltaPct >= 0 ? "+" : ""}${stats.contatosDeltaPct}% vs mês anterior` : undefined },
                { label: "Taxa de aprovação", value: stats.taxaAprovacao !== null ? `${stats.taxaAprovacao}%` : "—", icon: Check, tone: "info" },
              ]}
              activeCount={activeCount}
              onClear={() => { setBusca(""); setStatusFiltro(""); setDateFrom(null); setDateTo(null); }}
            >
              <FilterBar>
                <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar gatilho..." />
                <FilterSelect
                  value={statusFiltro}
                  onChange={setStatusFiltro}
                  options={(Object.keys(STATUS_LABEL) as MessageTrigger["status"][]).map((k) => ({ value: k, label: STATUS_LABEL[k].label }))}
                  allLabel="Todos os status"
                />
                <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} className="h-[38px]" />
              </FilterBar>
            </KpiFilterCard>

            {/* Novo gatilho + Sugestões */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Card className="lg:col-span-7 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-3">
                <label className="text-[11px] font-black uppercase text-[var(--color-text-primary)] tracking-wider flex items-center gap-1.5">
                  <MessageSquarePlus className="w-4 h-4 text-[var(--color-primary-blue)]" /> Novo gatilho
                </label>
                <textarea
                  ref={textareaRef}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value.slice(0, 500))}
                  placeholder='Ex: "Quero mandar mensagem pra todo mundo que ficou parado há mais de 30 dias"'
                  rows={3}
                  maxLength={500}
                  className="w-full text-sm bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl p-3 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-primary-blue)]/50 resize-y"
                />
                <p className="text-[10px] text-[var(--color-text-faint)] text-right -mt-2">{descricao.length}/500</p>

                <div>
                  <p className="text-[9px] font-black uppercase text-[var(--color-text-faint)] mb-1.5">Tipo de gatilho</p>
                  <div className="flex flex-wrap gap-1.5">
                    {GATILHO_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setTipoSelecionado(t.id); if (t.texto) setDescricao(t.texto); else textareaRef.current?.focus(); }}
                        className={cn(
                          "px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-all",
                          tipoSelecionado === t.id
                            ? "bg-[var(--color-primary-blue)] text-[#fff] border-transparent"
                            : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase text-[var(--color-text-faint)] mb-1.5">Canal de envio</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CANAIS_ENVIO.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={!c.disponivel}
                        onClick={() => c.disponivel && setCanalSelecionado(c.id)}
                        title={c.disponivel ? undefined : "Em breve"}
                        className={cn(
                          "px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-all",
                          !c.disponivel ? "opacity-40 cursor-not-allowed border-[var(--color-border-subtle)] text-[var(--color-text-faint)]"
                            : canalSelecionado === c.id ? "bg-[var(--color-primary-blue)] text-[#fff] border-transparent"
                            : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                        )}
                      >
                        {c.label}{!c.disponivel && " · em breve"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button onClick={handleSubmit} disabled={submitting} className="h-9 px-4 text-xs font-bold gap-1.5">
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Pedir pra Júlia entender
                  </Button>
                  <Button variant="outline" onClick={() => setMostrarExemplos((v) => !v)} className="h-9 px-3 text-xs font-bold gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> Ver exemplos de gatilhos
                  </Button>
                </div>

                {mostrarExemplos && (
                  <div className="rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] p-3 space-y-1.5">
                    {GATILHO_TEMPLATES.filter((t) => t.texto).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => usarTexto(t.texto)}
                        className="w-full text-left text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] px-2 py-1.5 rounded-lg hover:bg-[var(--color-surface-elevated)] transition-colors"
                      >
                        "{t.texto}"
                      </button>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="lg:col-span-5 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
                <div className="flex items-center gap-2 mb-1">
                  <Lightbulb className="w-4 h-4 text-[var(--color-primary-blue)]" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">Sugestões da Júlia</h3>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mb-3">Com base nos seus dados reais, aqui estão algumas oportunidades:</p>
                {sugestoes.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-faint)] italic py-4 text-center">Nenhum sinal prioritário agora — pipeline em dia.</p>
                ) : (
                  <div className="space-y-2.5">
                    {sugestoes.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 bg-[var(--color-surface-sunken)] rounded-xl px-3.5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{s.titulo}</p>
                          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{s.subtitulo}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => usarTexto(s.texto)} className="shrink-0 h-7 px-2.5 text-[10px] font-bold">
                          Usar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Gatilhos aguardando ação (ficam como cards completos — é onde a aprovação acontece) */}
            {emAberto.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Precisam da sua atenção
                </h3>
                {emAberto.map((t) => (
                  <TriggerCard
                    key={t.id}
                    trigger={t}
                    onAprovar={async (id) => { const r = await aprovar(id); if (r.error) toast.error(r.error); else toast.success("Enviando as mensagens agora."); }}
                    onRejeitar={async (id) => { await rejeitar(id); }}
                    onRemover={remover}
                  />
                ))}
              </div>
            )}

            {/* Gatilhos recentes + Desempenho + Resultados gerais */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Card className="lg:col-span-5 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
                <div className="p-4 border-b border-[var(--color-border-subtle)]">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">Gatilhos recentes</h3>
                </div>
                {loading ? (
                  <p className="text-xs text-[var(--color-text-faint)] p-4 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando...</p>
                ) : recentes.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-faint)] italic p-6 text-center">Nenhum gatilho ainda — descreva um acima pra começar.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                        <tr><th className="px-4 py-2">Gatilho</th><th className="px-4 py-2">Contatos</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Data</th></tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border-subtle)]">
                        {recentes.map((t) => (
                          <tr key={t.id}>
                            <td className="px-4 py-2.5 font-semibold text-[var(--color-text-primary)] truncate max-w-[160px]" title={t.descricao}>{t.descricao}</td>
                            <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{t.leadsEncontrados.length}</td>
                            <td className="px-4 py-2.5"><Badge variant={STATUS_LABEL[t.status].tone}>{STATUS_LABEL[t.status].label}</Badge></td>
                            <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{new Date(t.createdAt).toLocaleDateString("pt-BR")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card className="lg:col-span-4 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] mb-4 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Desempenho das automações</h3>
                <div className="h-[200px] w-full -mx-2">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
                    <ComposedChart data={stats.chart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--color-text-faint)" fontSize={9} tickLine={false} axisLine={false} interval={2} />
                      <YAxis stroke="var(--color-text-faint)" fontSize={9} tickLine={false} axisLine={false} width={24} allowDecimals={false} />
                      <Tooltip contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }} />
                      <Bar dataKey="contatos" name="Contatos alcançados" fill="var(--color-primary-blue)" radius={[3, 3, 0, 0]} />
                      <Line type="monotone" dataKey="enviados" name="Gatilhos enviados" stroke="#10b981" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="lg:col-span-3 p-5 bg-gradient-to-br from-[var(--color-primary-blue)] to-[var(--color-primary-blue)]/70 border-none text-[#fff]">
                <h3 className="text-xs font-black uppercase tracking-wider mb-4">Resultados gerais</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-lg font-black font-mono">{stats.contatos}</p>
                    <p className="text-[9px] uppercase font-bold text-[#fff]/70">Contatos alcançados</p>
                  </div>
                  <div>
                    <p className="text-lg font-black font-mono">{stats.enviados}</p>
                    <p className="text-[9px] uppercase font-bold text-[#fff]/70">Gatilhos enviados</p>
                  </div>
                  <div>
                    <p className="text-lg font-black font-mono">{stats.aguardando}</p>
                    <p className="text-[9px] uppercase font-bold text-[#fff]/70">Aguardando aprovação</p>
                  </div>
                  <div>
                    <p className="text-lg font-black font-mono">{stats.taxaAprovacao !== null ? `${stats.taxaAprovacao}%` : "—"}</p>
                    <p className="text-[9px] uppercase font-bold text-[#fff]/70">Taxa de aprovação</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <AutomationFunilConnections />
        )}
      </div>
    </PageContainer>
  );
}
