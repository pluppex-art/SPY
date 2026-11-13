import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bot, Workflow, Zap, Settings2, ChevronRight, Clock, Power, Activity, BookOpen, Lightbulb, AlertTriangle, Gauge } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { useData } from "../../contexts/DataContext";
import { buildStagesForFunil } from "../../lib/funilStages";
import { useIAOverview } from "../../hooks/useIAOverview";
import { useAuroraTokenUsage } from "../../hooks/useAuroraTokenUsage";

const DIAS = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function ago(iso?: string | null): string {
  if (!iso) return "nunca executou";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} d`;
}

type Aba = "resumo" | "atividade" | "funil" | "agentes" | "conhecimento" | "gatilhos";
const ABAS: { id: Aba; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "atividade", label: "Atividade" },
  { id: "funil", label: "Funil & etapas" },
  { id: "agentes", label: "Agentes" },
  { id: "conhecimento", label: "Conhecimento" },
  { id: "gatilhos", label: "Gatilhos" },
];

const fmtData = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
function Kpi({ icon: Icon, label, value, hint, tone }: { icon: any; label: string; value: string | number; hint?: string; tone?: "warn" | "bad" }) {
  const color = tone === "bad" ? "text-rose-500" : tone === "warn" ? "text-amber-500" : "text-[var(--color-text-primary)]";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-faint)]"><Icon className="w-3.5 h-3.5" />{label}</div>
      <div className={`text-2xl font-black mt-1 ${color}`}>{value}</div>
      {hint && <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{hint}</div>}
    </Card>
  );
}

const SHORTCUTS = [
  { to: "/app/configuracoes/sistema/aurora", icon: Bot, title: "Agentes & consumo", desc: "Ligar/desligar agentes, prompts e uso da Aurora" },
  { to: "/app/configuracoes/crm/funis", icon: Workflow, title: "Funis & etapas", desc: "Etapas do funil SDR IA e do comercial" },
  { to: "/app/configuracoes/crm/gatilhos-ia", icon: Zap, title: "Gatilhos da IA", desc: "Quando a IA entra em ação" },
];

/** Tudo da IA (Aurora) numa tela só: agentes, funil SDR IA com etapas e um atalho pra cada configuração. */
export default function VisaoGeralIA() {
  const { funis, leads, auroraAgents, leadScoreTriggers } = useData();
  const { data: ia, loading } = useIAOverview();
  const { usage } = useAuroraTokenUsage(120000);
  const [aba, setAba] = useState<Aba>("resumo");

  const funisIA = useMemo(() => ((funis as any[]) || []).filter((f) => f.tipo === "sdr_ia"), [funis]);
  const agentes = (auroraAgents as any[]) || [];
  const ativos = agentes.filter((a) => a.active).length;

  const contagem = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of (leads as any[]) || []) if (l.stageId) map.set(l.stageId, (map.get(l.stageId) || 0) + 1);
    return map;
  }, [leads]);

  const baixa = (ia?.erros7d ?? 0) > 0 || (ia?.falhasModelo7d ?? 0) > 0;
  const aviso = (txt: string) => <Card className="p-5 text-sm text-[var(--color-text-muted)]">{txt}</Card>;
  const Titulo = ({ children }: { children: ReactNode }) => <h2 className="text-sm font-black uppercase tracking-wider text-[var(--color-text-faint)]">{children}</h2>;

  return (
    <PageContainer
      title="Inteligência Artificial"
      description="Tudo da Aurora num lugar só: consumo, atividade, funil, agentes e conhecimento."
      actions={
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${ativos > 0 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>
          <Power className="w-3 h-3" /> {ativos > 0 ? `${ativos} agente${ativos > 1 ? "s" : ""} ativo${ativos > 1 ? "s" : ""}` : "Nenhum agente ativo"}
        </span>
      }
    >
     <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border-default)] -mx-1 px-1" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
            className={`shrink-0 px-3 py-2 text-xs font-bold border-b-2 -mb-px cursor-pointer bg-transparent transition-colors ${aba === a.id ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === "resumo" && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Gauge} label="Consumo do ciclo" value={usage?.percentUsed != null ? `${usage.percentUsed.toFixed(1)}%` : "Sem limite"} hint={usage?.planName ? `Plano ${usage.planName}` : undefined} tone={usage?.limitReached ? "bad" : (usage?.percentUsed ?? 0) >= 90 ? "warn" : undefined} />
            <Kpi icon={Activity} label="Interações (7 dias)" value={loading ? "…" : ia?.interacoes7d ?? 0} hint={`${ia?.handoffs7d ?? 0} passaram para humano`} />
            <Kpi icon={AlertTriangle} label="Erros (7 dias)" value={loading ? "…" : (ia?.erros7d ?? 0) + (ia?.falhasModelo7d ?? 0)} hint={`${ia?.falhasModelo7d ?? 0} falhas de modelo`} tone={baixa ? "warn" : undefined} />
            <Kpi icon={BookOpen} label="Conhecimento" value={loading ? "…" : ia?.conhecimentoTotal ?? 0} hint={`${ia?.aprendizados ?? 0} aprendizados ativos`} />
          </section>
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SHORTCUTS.map((s) => (
              <Link key={s.to} to={s.to} className="group">
                <Card className="p-4 h-full flex items-start gap-3 hover:border-[var(--color-primary-blue)]/40 transition-colors">
                  <s.icon className="w-5 h-5 text-[var(--color-primary-blue)] shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold flex items-center justify-between">{s.title}<ChevronRight className="w-4 h-4 text-[var(--color-text-faint)] group-hover:translate-x-0.5 transition-transform" /></div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{s.desc}</div>
                  </div>
                </Card>
              </Link>
            ))}
          </section>
          <section className="space-y-3">
            <Titulo>Insights recentes</Titulo>
            {!ia || ia.insights.length === 0 ? aviso("Nenhum insight gerado ainda.") : (
              <Card className="divide-y divide-[var(--color-border-subtle)]">
                {ia.insights.map((i) => (
                  <div key={i.id} className="flex items-start gap-3 px-5 py-3">
                    <Lightbulb className={`w-4 h-4 mt-0.5 shrink-0 ${i.severity === "high" || i.severity === "critical" ? "text-rose-500" : "text-amber-500"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{i.title}</div>
                      {i.description && <div className="text-xs text-[var(--color-text-muted)] line-clamp-2">{i.description}</div>}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-faint)] shrink-0">{fmtData(i.detected_at)}</div>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </>
      )}

      {aba === "atividade" && (
        <section className="space-y-3">
          <Titulo>Últimas interações da IA com leads</Titulo>
          {!ia || ia.recentes.length === 0 ? aviso("Nenhuma interação registrada ainda.") : (
            <Card className="divide-y divide-[var(--color-border-subtle)]">
              {ia.recentes.map((r) => (
                <div key={r.id} className="px-5 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold">{r.acao || "Interação"}{r.score != null ? ` · score ${r.score}` : ""}</span>
                    <span className="text-[var(--color-text-faint)] shrink-0">{fmtData(r.created_at)}</span>
                  </div>
                  {(r.stage_before || r.stage_after) && r.stage_before !== r.stage_after && <div className="text-[11px] text-[var(--color-text-muted)]">Etapa: {r.stage_before || "—"} → {r.stage_after || "—"}</div>}
                  {r.resposta_enviada && <div className="text-xs text-[var(--color-text-muted)] line-clamp-2">“{r.resposta_enviada}”</div>}
                  {r.handoff_motivo && <div className="text-[11px] font-bold text-amber-500">Passou para humano: {r.handoff_motivo}</div>}
                  {r.erro && <div className="text-[11px] font-bold text-rose-500 line-clamp-2">Erro: {r.erro}</div>}
                </div>
              ))}
            </Card>
          )}
        </section>
      )}

      {aba === "funil" && (
      <section className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-[var(--color-text-faint)]">Funil SDR IA</h2>
        {funisIA.length === 0 ? (
          <Card className="p-5 text-sm text-[var(--color-text-muted)]">
            Nenhum funil SDR IA configurado ainda. <Link to="/app/configuracoes/crm/funis" className="text-[var(--color-primary-blue)] font-bold">Configurar em Funis & etapas</Link>
          </Card>
        ) : funisIA.map((f) => {
          const etapas = buildStagesForFunil(f);
          const dias = (f.diasSemana || []).map((d: number) => DIAS[d]).filter(Boolean).join(", ");
          return (
            <Card key={f.id} className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold truncate">{f.nome}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{f.ativo === false ? "Desativado" : "Ativo"} · {etapas.length} etapas</div>
                </div>
                <Link to="/app/configuracoes/crm/funis" className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-[var(--color-primary-blue)]"><Settings2 className="w-3.5 h-3.5" /> Editar</Link>
              </div>

              <div className="flex flex-wrap gap-2">
                {etapas.map((e) => (
                  <span key={e.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]">
                    <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                    {e.name}
                    <span className="text-[var(--color-text-faint)]">{contagem.get(e.id) || 0}</span>
                  </span>
                ))}
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-xs">
                <div><dt className="text-[var(--color-text-faint)]">Etapa de entrada</dt><dd className="font-bold">{f.sdrEtapaEntrada || "—"}</dd></div>
                <div><dt className="text-[var(--color-text-faint)]">Passa para humano em</dt><dd className="font-bold">{f.sdrEtapaHandoff || "—"}</dd></div>
                <div><dt className="text-[var(--color-text-faint)]">Score mínimo</dt><dd className="font-bold">{f.sdrScoreMinimo ?? "—"}</dd></div>
                <div><dt className="text-[var(--color-text-faint)]">Atraso da resposta</dt><dd className="font-bold">{f.sdrDelayResposta != null ? `${f.sdrDelayResposta} s` : "—"}</dd></div>
                <div className="col-span-2"><dt className="text-[var(--color-text-faint)] flex items-center gap-1"><Clock className="w-3 h-3" /> Horário</dt><dd className="font-bold">{f.horarioInicio && f.horarioFim ? `${f.horarioInicio}–${f.horarioFim}` : "24 h"}{dias ? ` · ${dias}` : ""}</dd></div>
                <div className="col-span-2"><dt className="text-[var(--color-text-faint)]">Mensagem de boas-vindas</dt><dd className="font-medium line-clamp-2">{f.sdrMsgBoasVindas || "—"}</dd></div>
              </dl>
            </Card>
          );
        })}
      </section>

      )}

      {aba === "agentes" && (
        <>
      <section className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-[var(--color-text-faint)]">Agentes</h2>
        {agentes.length === 0 ? (
          <Card className="p-5 text-sm text-[var(--color-text-muted)]">Nenhum agente cadastrado para esta empresa.</Card>
        ) : (
          <Card className="divide-y divide-[var(--color-border-subtle)]">
            {agentes.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.active ? "bg-emerald-500" : "bg-[var(--color-border-default)]"}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">{a.name}</div>
                  {(a.role || a.description) && <div className="text-xs text-[var(--color-text-muted)] truncate">{a.role || a.description}</div>}
                </div>
                <div className="text-xs text-[var(--color-text-faint)] shrink-0">{a.active ? "Ativo" : "Desligado"} · {ago(a.last_execution_at)}</div>
              </div>
            ))}
          </Card>
        )}
      </section>
          <section className="space-y-3">
            <Titulo>Configuração da empresa</Titulo>
            <Card className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-xs">
              <div><div className="text-[var(--color-text-faint)]">Aurora</div><div className="font-bold">{ia?.config?.aurora_enabled === false ? "Desligada" : "Ligada"}</div></div>
              <div><div className="text-[var(--color-text-faint)]">Prompts personalizados</div><div className="font-bold">{ia?.promptsPersonalizados ?? 0}</div></div>
              <div><div className="text-[var(--color-text-faint)]">Instruções da empresa</div><div className="font-bold">{ia?.config?.custom_prompt ? "Definidas" : "Padrão"}</div></div>
            </Card>
          </section>
        </>
      )}

      {aba === "conhecimento" && (
        <section className="space-y-3">
          <Titulo>Base de conhecimento ({ia?.conhecimentoTotal ?? 0})</Titulo>
          {!ia || ia.conhecimento.length === 0 ? aviso("Nenhum documento na base de conhecimento.") : (
            <Card className="divide-y divide-[var(--color-border-subtle)]">
              {ia.conhecimento.map((k) => (
                <div key={k.id} className="flex items-center gap-3 px-5 py-3">
                  <BookOpen className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" />
                  <div className="text-sm font-bold truncate flex-1">{k.title}</div>
                  <div className="text-[11px] text-[var(--color-text-faint)] shrink-0">{fmtData(k.updated_at)}</div>
                </div>
              ))}
            </Card>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">{ia?.aprendizados ?? 0} aprendizado(s) ativo(s) que a Aurora já usa nas respostas.</p>
        </section>
      )}

      {aba === "gatilhos" && (
        <section className="space-y-3">
          <Titulo>Gatilhos de mensagem</Titulo>
          {!ia || ia.gatilhos.length === 0 ? aviso("Nenhum gatilho de mensagem criado ainda.") : (
            <Card className="divide-y divide-[var(--color-border-subtle)]">
              {ia.gatilhos.map((g) => (
                <div key={g.id} className="flex items-center gap-3 px-5 py-3">
                  <Zap className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{g.descricao}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">{g.leads_encontrados != null ? `${g.leads_encontrados} leads encontrados · ` : ""}{fmtData(g.created_at)}</div>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] shrink-0">{g.status}</span>
                </div>
              ))}
            </Card>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">{((leadScoreTriggers as any[]) || []).length} regra(s) de pontuação de lead configurada(s). <Link to="/app/configuracoes/crm/gatilhos-ia" className="text-[var(--color-primary-blue)] font-bold">Editar gatilhos</Link></p>
        </section>
      )}
     </div>
    </PageContainer>
  );
}
