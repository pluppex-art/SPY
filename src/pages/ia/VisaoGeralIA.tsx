import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bot, Workflow, Zap, Settings2, ChevronRight, Clock, Power } from "lucide-react";
import { Card } from "../../components/ui/card";
import { useData } from "../../contexts/DataContext";
import { buildStagesForFunil } from "../../lib/funilStages";

const DIAS = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function ago(iso?: string | null): string {
  if (!iso) return "nunca executou";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} d`;
}

const SHORTCUTS = [
  { to: "/app/configuracoes/sistema/aurora", icon: Bot, title: "Agentes & consumo", desc: "Ligar/desligar agentes, prompts e uso da Aurora" },
  { to: "/app/configuracoes/crm/funis", icon: Workflow, title: "Funis & etapas", desc: "Etapas do funil SDR IA e do comercial" },
  { to: "/app/configuracoes/crm/gatilhos-ia", icon: Zap, title: "Gatilhos da IA", desc: "Quando a IA entra em ação" },
];

/** Tudo da IA (Aurora) numa tela só: agentes, funil SDR IA com etapas e um atalho pra cada configuração. */
export default function VisaoGeralIA() {
  const { funis, leads, auroraAgents } = useData();

  const funisIA = useMemo(() => ((funis as any[]) || []).filter((f) => f.tipo === "sdr_ia"), [funis]);
  const agentes = (auroraAgents as any[]) || [];
  const ativos = agentes.filter((a) => a.active).length;

  const contagem = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of (leads as any[]) || []) if (l.stageId) map.set(l.stageId, (map.get(l.stageId) || 0) + 1);
    return map;
  }, [leads]);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inteligência Artificial</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Tudo da Aurora num lugar só: agentes, funil e etapas.</p>
        </div>
        <span className={`self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${ativos > 0 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>
          <Power className="w-3 h-3" /> {ativos > 0 ? `${ativos} agente${ativos > 1 ? "s" : ""} ativo${ativos > 1 ? "s" : ""}` : "Nenhum agente ativo"}
        </span>
      </div>

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
    </div>
  );
}
