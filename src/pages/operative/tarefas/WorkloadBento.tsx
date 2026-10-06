import { useMemo, useState } from "react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Zap, CheckCircle2, ArrowRight, TrendingUp, Timer, ListChecks, ArrowUpRight, ArrowDownRight, Link2, CalendarDays } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Task } from "../../../types";
import { useData } from "../../../contexts/DataContext";
import { formatDueDate, isTaskClosed, isTaskOverdue, parseTaskMeta, initialsOf } from "./taskUtils";

interface WorkloadBentoProps {
  tasks: Task[];
  onExpandTask: (task: Task) => void;
  googleConnected: boolean;
}

const DAY = 86400000;
const PERIODS = [
  { days: 7, label: "Últimos 7 dias" },
  { days: 30, label: "Últimos 30 dias" },
  { days: 90, label: "Últimos 90 dias" },
];

function Delta({ value, unit, invert = false }: { value: number | null; unit: string; invert?: boolean }) {
  if (value === null) return <span className="text-[11px] font-bold text-[var(--color-text-faint)]">sem base anterior</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span className={`text-[11px] font-bold flex items-center gap-0.5 ${value === 0 ? "text-[var(--color-text-faint)]" : good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {up ? "+" : ""}{value}{unit}
    </span>
  );
}

export function WorkloadBento({ tasks, onExpandTask, googleConnected }: WorkloadBentoProps) {
  const { leads } = useData();
  const [days, setDays] = useState(30);

  const leadLabel = (t: Task) => {
    if (!t.lead_id) return "Interno";
    const l = (leads as any[]).find((x) => x.id === t.lead_id);
    return l ? (l.company || l.name) : "Interno";
  };

  // Foco: prioridade Alta ainda não encerrada — a mais atrasada/próxima primeiro.
  const focus = useMemo(() => {
    const alta = tasks.filter((t) => t.priority === "Alta" && !isTaskClosed(t));
    return alta.sort((a, b) => (a.due_date ? new Date(a.due_date).getTime() : Infinity) - (b.due_date ? new Date(b.due_date).getTime() : Infinity))[0] ?? null;
  }, [tasks]);
  const focusMeta = parseTaskMeta(focus?.description);

  const stats = useMemo(() => {
    const ativas = tasks.filter((t) => !isTaskClosed(t));
    const emAberto = ativas.filter((t) => t.status === "Em Aberto").length;
    const atrasadoStatus = ativas.filter((t) => t.status === "Atrasado").length;
    const outros = ativas.length - emAberto - atrasadoStatus;
    const concluidas = tasks.filter((t) => t.status === "Concluída").length;
    const vencidas = ativas.filter((t) => isTaskOverdue(t)).length;

    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
    const weekEnd = weekStart + 7 * DAY;
    const daSemana = tasks.filter((t) => t.due_date && new Date(t.due_date).getTime() >= weekStart && new Date(t.due_date).getTime() < weekEnd && t.status !== "Cancelado");
    const semanaFeitas = daSemana.filter((t) => t.status === "Concluída").length;

    return {
      ativas: ativas.length, emAberto, atrasadoStatus, outros, concluidas, vencidas,
      taxa: tasks.length > 0 ? Math.round((concluidas / tasks.length) * 100) : 0,
      semanaTotal: daSemana.length, semanaFeitas,
      semanaPct: daSemana.length > 0 ? Math.round((semanaFeitas / daSemana.length) * 100) : 0,
    };
  }, [tasks]);

  // Janela atual x janela anterior de mesma duração — tudo por datas reais
  // (created_at do lead, completed_at/created_at da tarefa). Status do lead é
  // o atual (convenção da casa), não um histórico.
  const perf = useMemo(() => {
    const now = Date.now();
    const curStart = now - days * DAY;
    const prevStart = now - 2 * days * DAY;
    const inWin = (ts: number, a: number, b: number) => !isNaN(ts) && ts >= a && ts < b;

    const conv = (a: number, b: number) => {
      const set = (leads as any[]).filter((l) => l.createdAt && inWin(new Date(l.createdAt).getTime(), a, b));
      if (set.length === 0) return null;
      return Math.round((set.filter((l) => l.status === "Fechado").length / set.length) * 1000) / 10;
    };
    const done = (a: number, b: number) => tasks.filter((t) => t.status === "Concluída" && t.completed_at && inWin(new Date(t.completed_at).getTime(), a, b));
    const avgDays = (rows: Task[]) => {
      const vals = rows
        .filter((t) => t.created_at)
        .map((t) => (new Date(t.completed_at as string).getTime() - new Date(t.created_at as string).getTime()) / DAY)
        .filter((v) => isFinite(v) && v >= 0);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };

    const convCur = conv(curStart, now), convPrev = conv(prevStart, curStart);
    const doneCur = done(curStart, now), donePrev = done(prevStart, curStart);
    const avgCur = avgDays(doneCur), avgPrev = avgDays(donePrev);
    const pct = (c: number | null, p: number | null) => (c === null || p === null || p === 0 ? null : Math.round(((c - p) / p) * 100));
    return {
      conv: convCur,
      convDelta: convCur !== null && convPrev !== null ? Math.round((convCur - convPrev) * 10) / 10 : null,
      avg: avgCur === null ? null : Math.round(avgCur * 10) / 10,
      avgDelta: pct(avgCur, avgPrev),
      done: doneCur.length,
      doneDelta: pct(doneCur.length, donePrev.length),
    };
  }, [tasks, leads, days]);

  const vinculadas = useMemo(() => tasks.filter((t) => t.lead_id).length, [tasks]);

  const donut = [
    { name: "Em aberto", value: stats.emAberto, color: "#f59e0b" },
    { name: "Outros ativos", value: stats.outros, color: "#3b82f6" },
    { name: "Atrasado", value: stats.atrasadoStatus, color: "#f43f5e" },
  ];
  const donutData = stats.ativas === 0 ? [{ name: "vazio", value: 1, color: "var(--color-border-default)" }] : donut.filter((d) => d.value > 0);

  const cardCls = "p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm rounded-3xl";
  const label = "text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-[0.2em]";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr_1fr] gap-4">
      {/* Foco estratégico */}
      <Card className={`${cardCls} bg-gradient-to-br from-orange-500/[0.08] to-transparent flex flex-col gap-4`}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-500/15 flex items-center justify-center text-orange-500"><Zap className="w-5 h-5" /></div>
          <div>
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wide">Foco estratégico</h3>
            <p className="text-[11px] text-[var(--color-text-muted)]">Ação prioritária baseada nas tarefas de alta prioridade</p>
          </div>
        </div>
        {focus ? (
          <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl p-4 space-y-3 flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md ${isTaskOverdue(focus) ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                {isTaskOverdue(focus) ? "Urgente / vencida" : "Alta prioridade"}
              </span>
              <span className="text-[11px] text-[var(--color-text-muted)] font-mono">{formatDueDate(focus.due_date)}</span>
            </div>
            <h4 className="text-lg font-black text-[var(--color-text-primary)] leading-snug">{focus.title}</h4>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-[10px] font-black flex items-center justify-center shrink-0">{initialsOf(leadLabel(focus))}</span>
                <span className="text-xs font-bold text-[var(--color-text-muted)] truncate">{leadLabel(focus)}</span>
                {focusMeta.tipo && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] shrink-0">{focusMeta.tipo}</span>}
              </div>
              <Button onClick={() => onExpandTask(focus)} className="h-9 px-4 text-xs font-black gap-1.5">Ver detalhes <ArrowRight className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 border border-dashed border-[var(--color-border-default)] rounded-2xl py-8">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
            <p className="text-xs font-bold text-[var(--color-text-muted)]">Nenhuma tarefa de alta prioridade em aberto.</p>
          </div>
        )}
      </Card>

      {/* Workload da equipe */}
      <Card className={`${cardCls} flex flex-col gap-4`}>
        <h4 className={label}>Workload da equipe</h4>
        <div className="flex items-center gap-4">
          <div className="relative w-36 h-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutData} dataKey="value" innerRadius={46} outerRadius={64} paddingAngle={donutData.length > 1 ? 3 : 0} stroke="none">
                  {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-black text-[var(--color-text-primary)] leading-none">{stats.ativas}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">ativas</span>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            {donut.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="font-black text-[var(--color-text-primary)] w-6">{d.value}</span>
                <span className="text-[var(--color-text-muted)]">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className={label}>Demanda da semana</span>
            <span className="text-xs font-black text-[var(--color-text-primary)]">{stats.semanaTotal > 0 ? `${stats.semanaPct}%` : "—"}</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all" style={{ width: `${stats.semanaPct}%` }} />
          </div>
          <p className="text-[10px] text-[var(--color-text-faint)] mt-1">
            {stats.semanaTotal > 0 ? `${stats.semanaFeitas} de ${stats.semanaTotal} tarefas com prazo nesta semana concluídas` : "Nenhuma tarefa com prazo nesta semana"}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--color-border-subtle)] mt-auto">
          <div><p className="text-xl font-black text-[var(--color-text-primary)] leading-none">{stats.ativas}</p><p className="text-[10px] text-[var(--color-text-muted)] mt-1">Ativas</p></div>
          <div className="border-l border-[var(--color-border-subtle)] pl-3"><p className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-none">{stats.taxa}%</p><p className="text-[10px] text-[var(--color-text-muted)] mt-1">Taxa de conclusão</p></div>
          <div className="border-l border-[var(--color-border-subtle)] pl-3"><p className="text-xl font-black text-rose-500 leading-none">{stats.vencidas}</p><p className="text-[10px] text-[var(--color-text-muted)] mt-1">Vencidas</p></div>
        </div>
      </Card>

      {/* Performance engine */}
      <Card className={`${cardCls} flex flex-col gap-4`}>
        <div className="flex items-center justify-between gap-2">
          <h4 className={label}>Performance engine</h4>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-8 px-2 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[11px] font-bold text-[var(--color-text-primary)] focus:outline-none cursor-pointer"
          >
            {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-2xl bg-[var(--color-surface-sunken)] space-y-1.5">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-[var(--color-text-muted)]"><TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Lead conversion</div>
            <p className="text-xl font-black text-[var(--color-text-primary)] leading-none">{perf.conv === null ? "—" : `${perf.conv.toFixed(1)}%`}</p>
            <Delta value={perf.convDelta} unit=" p.p." />
          </div>
          <div className="p-3 rounded-2xl bg-[var(--color-surface-sunken)] space-y-1.5">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-[var(--color-text-muted)]"><Timer className="w-3.5 h-3.5 text-blue-500 shrink-0" /> Tempo p/ concluir</div>
            <p className="text-xl font-black text-[var(--color-text-primary)] leading-none">{perf.avg === null ? "—" : `${perf.avg} d`}</p>
            <Delta value={perf.avgDelta} unit="%" invert />
          </div>
          <div className="p-3 rounded-2xl bg-[var(--color-surface-sunken)] space-y-1.5">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-[var(--color-text-muted)]"><ListChecks className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Concluídas</div>
            <p className="text-xl font-black text-[var(--color-text-primary)] leading-none">{perf.done}</p>
            <Delta value={perf.doneDelta} unit="%" />
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-text-faint)] -mt-1">Comparado ao período anterior de mesma duração. Conversão = leads criados no período que já estão fechados.</p>

        <div className="pt-3 border-t border-[var(--color-border-subtle)] mt-auto">
          <h5 className={`${label} mb-2`}>Integrações</h5>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--color-surface-sunken)] text-xs font-bold text-[var(--color-text-primary)]">
              <CalendarDays className="w-4 h-4 text-blue-500" /> Google Tasks
              <span className={`w-1.5 h-1.5 rounded-full ${googleConnected ? "bg-emerald-500" : "bg-slate-400"}`} />
              <span className="text-[10px] font-normal text-[var(--color-text-muted)]">{googleConnected ? "Conectado" : "Não conectado"}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--color-surface-sunken)] text-xs font-bold text-[var(--color-text-primary)]">
              <Link2 className="w-4 h-4 text-violet-500" /> CRM S.P.Y.
              <span className="text-[10px] font-normal text-[var(--color-text-muted)]">{vinculadas} vinculadas a leads</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
