import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Radar as RadarIcon, Flame, Clock, Users, Phone, MessageCircle, ExternalLink,
  Download, Send, ListTree,
} from "lucide-react";
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { Sparkline } from "../../components/ui/sparkline";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { isLeadOpen } from "../../lib/leadStatus";
import { parseCurrencyBR } from "../../lib/utils";
import { downloadCsv } from "../../lib/csvExport";
import { buildStagesForFunil } from "../../lib/funilStages";
import { FUNIS_DEFAULT } from "../settings/sections/crm/funisTypes";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";

type Risk = "critico" | "alto" | "atencao";
const RISK_META: Record<Risk, { label: string; variant: "destructive" | "warning" | "info"; color: string }> = {
  critico: { label: "Crítico", variant: "destructive", color: "var(--color-danger)" },
  alto: { label: "Alto", variant: "warning", color: "var(--color-warning)" },
  atencao: { label: "Atenção", variant: "info", color: "var(--color-info)" },
};
// Limiares fixos de severidade (dias parado) — definem tanto os cards/donut/
// histórico (base estável, sem depender do filtro da tabela) quanto a tabela.
// "Atenção" = já esfriou (>=1 dia) mas ainda não virou Alto.
const CRITICO_DIAS = 14;
const ALTO_DIAS = 7;
const JANELAS = [7, 30, 90] as const;

function riskOf(idle: number): Risk {
  return idle >= CRITICO_DIAS ? "critico" : idle >= ALTO_DIAS ? "alto" : "atencao";
}

function buildStageMaps(funis: any[]) {
  const funisConfig: any[] = funis && funis.length > 0 ? funis : FUNIS_DEFAULT;
  const stageNames: Record<string, string> = {};
  const funilNomeByTipo: Record<string, string> = {};
  funisConfig.forEach((f: any) => {
    if (f.tipo) funilNomeByTipo[f.tipo] = f.nome || f.tipo;
    buildStagesForFunil(f).forEach((s) => { stageNames[s.id] = s.name; });
  });
  return { stageNames, funilNomeByTipo };
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function initials(name?: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export default function Radar() {
  const { leads, funis, addTask } = useData();
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();

  const [days, setDays] = useState(3);
  const [vendedor, setVendedor] = useState("todos");
  const [funilFiltro, setFunilFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState<(typeof JANELAS)[number]>(30);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [historico, setHistorico] = useState<any[]>([]);
  const [riskFiltro, setRiskFiltro] = useState<Risk | null>(null);
  const toggleRiskFiltro = (k: Risk) => setRiskFiltro((cur) => (cur === k ? null : k));

  const { stageNames, funilNomeByTipo } = useMemo(() => buildStageMaps(funis as any[]), [funis]);

  // Base estável (todo lead aberto que já esfriou pelo menos 1 dia) — usada
  // pelos cards/donut/"parados por etapa"/histórico. Não depende do filtro
  // "sem contato há pelo menos N dias" abaixo, que só recorta a TABELA —
  // assim o significado de "Crítico"/"Total em risco" nunca muda sozinho
  // quando alguém mexe no filtro da lista.
  const allStalled = useMemo(() => {
    return (leads as any[])
      .filter((l) => !l.deleted_at && isLeadOpen(l.status))
      .map((l) => {
        const idle = Math.max(0, Number(l.timeIdle) || 0);
        const funilTipo = l.pipelineId || "comercial";
        return {
          l,
          idle,
          risk: riskOf(idle),
          value: parseCurrencyBR(l.value),
          funilNome: funilNomeByTipo[funilTipo] || (funilTipo === "sdr" ? "SDR" : "Comercial"),
          etapaNome: stageNames[l.stageId] || "—",
          lastTouch: l.last_contact_at || l.updated_at || l.created_at,
        };
      })
      .filter((r) => r.idle >= 1)
      .sort((a, b) => b.idle - a.idle);
  }, [leads, funilNomeByTipo, stageNames]);

  const counts = useMemo(() => ({
    critico: allStalled.filter((r) => r.risk === "critico").length,
    alto: allStalled.filter((r) => r.risk === "alto").length,
    atencao: allStalled.filter((r) => r.risk === "atencao").length,
  }), [allStalled]);
  const valorEmRisco = useMemo(() => allStalled.reduce((s, r) => s + r.value, 0), [allStalled]);
  const totalEmRisco = allStalled.length;

  // "Parados por etapa" — substitui "principais causas" do mockup (que não
  // corresponde a nenhum campo real do lead) pela etapa atual do funil, que é
  // a informação real mais próxima de "onde esse negócio travou".
  const porEtapa = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    allStalled.forEach((r) => {
      const cur = map.get(r.etapaNome) || { label: r.etapaNome, count: 0 };
      cur.count += 1;
      map.set(r.etapaNome, cur);
    });
    const sorted = Array.from(map.values()).sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, 5);
    const outros = sorted.slice(5).reduce((s, g) => s + g.count, 0);
    if (outros > 0) top.push({ label: "Outras etapas", count: outros });
    return top;
  }, [allStalled]);
  const maxEtapaCount = Math.max(1, ...porEtapa.map((e) => e.count));

  // Sincroniza o retrato de hoje no histórico real (upsert — nunca duplica,
  // sempre atualiza a linha do dia corrente conforme o estado muda ao longo
  // do dia). Dias passados ficam congelados. Sem isso não existe NENHUM jeito
  // honesto de mostrar tendência: timeIdle é sempre o estado agora, não um
  // retrato do passado.
  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    const hoje = new Date().toISOString().slice(0, 10);
    supabase
      .from("lead_risk_snapshots")
      .upsert(
        { tenant_id: activeTenantId, snapshot_date: hoje, critico_count: counts.critico, alto_count: counts.alto, atencao_count: counts.atencao, total_count: totalEmRisco, valor_em_risco: valorEmRisco },
        { onConflict: "tenant_id,snapshot_date" }
      )
      .then(({ error }) => { if (error) console.error("[Radar] snapshot upsert:", error.message); });
  }, [activeTenantId, counts.critico, counts.alto, counts.atencao, totalEmRisco, valorEmRisco]);

  useEffect(() => {
    if (!supabase || !activeTenantId) { setHistorico([]); return; }
    let cancelled = false;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - janela);
    supabase
      .from("lead_risk_snapshots")
      .select("snapshot_date,critico_count,alto_count,atencao_count,total_count,valor_em_risco")
      .eq("tenant_id", activeTenantId)
      .gte("snapshot_date", cutoff.toISOString().slice(0, 10))
      .order("snapshot_date", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error("[Radar] fetch histórico:", error.message); return; }
        setHistorico((data || []).map((d: any) => ({ ...d, label: new Date(d.snapshot_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) })));
      });
    return () => { cancelled = true; };
  }, [activeTenantId, janela]);

  // Delta vs. o ponto do histórico mais próximo de "janela" dias atrás — só
  // mostra percentual quando esse ponto realmente existe (nunca inventa
  // "vs período anterior" sem base de comparação real).
  const deltas = useMemo(() => {
    if (historico.length < 2) return null;
    const base = historico[0];
    const atual = historico[historico.length - 1];
    const pct = (field: string) => {
      const b = Number(base[field]) || 0;
      const a = Number(atual[field]) || 0;
      if (b === 0) return null;
      return Math.round(((a - b) / b) * 1000) / 10;
    };
    return { critico: pct("critico_count"), alto: pct("alto_count"), atencao: pct("atencao_count"), total: pct("total_count") };
  }, [historico]);

  const vendedores = useMemo(() => Array.from(new Set(allStalled.map((r) => r.l.seller).filter(Boolean))).sort(), [allStalled]);

  const visibleRows = useMemo(() => allStalled
    .filter((r) => r.idle >= days)
    .filter((r) => !riskFiltro || r.risk === riskFiltro)
    .filter((r) => vendedor === "todos" || r.l.seller === vendedor)
    .filter((r) => funilFiltro === "todos" || r.funilNome === funilFiltro)
    .filter((r) => {
      if (!busca.trim()) return true;
      const q = busca.trim().toLowerCase();
      return [r.l.name, r.l.company, r.l.title, r.l.seller].some((v) => String(v || "").toLowerCase().includes(q));
    }), [allStalled, days, riskFiltro, vendedor, funilFiltro, busca]);

  const activeCount = (days !== 3 ? 1 : 0) + (vendedor !== "todos" ? 1 : 0) + (funilFiltro !== "todos" ? 1 : 0) + (busca ? 1 : 0) + (riskFiltro ? 1 : 0);
  const limparFiltros = () => { setDays(3); setVendedor("todos"); setFunilFiltro("todos"); setBusca(""); setRiskFiltro(null); };
  const funisDisponiveis = useMemo(() => Array.from(new Set(allStalled.map((r) => r.funilNome))).sort(), [allStalled]);
  const visible = visibleRows.slice(0, 200);
  const allSelected = visible.length > 0 && visible.every((r) => selecionados.has(r.l.id));

  const toggleSelecionado = (id: string) => setSelecionados((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelecionarTodos = () => setSelecionados((cur) => {
    if (allSelected) return new Set();
    return new Set(visible.map((r) => r.l.id));
  });

  const reengajarSelecionados = async () => {
    const alvo = visible.filter((r) => selecionados.has(r.l.id));
    if (alvo.length === 0) return;
    await Promise.all(alvo.map((r) => addTask({
      lead_id: r.l.id,
      title: `Retomar contato — ${r.l.name || r.l.company || "lead parado"}`,
      description: `Gerado pelo Radar: ${r.idle} dia(s) sem contato.`,
      status: "Em Aberto",
      priority: "Alta",
      due_date: new Date().toISOString(),
    })));
    toast.success(`${alvo.length} tarefa${alvo.length === 1 ? "" : "s"} de follow-up criada${alvo.length === 1 ? "" : "s"}.`);
    setSelecionados(new Set());
  };

  const exportar = () => {
    downloadCsv(
      `radar_${Date.now()}.csv`,
      ["Lead", "Empresa", "Negócio", "Funil", "Etapa", "Valor", "Último contato", "Dias sem contato", "Risco", "Responsável"],
      visibleRows.map((r) => [r.l.name || "", r.l.company || "", r.l.title || "", r.funilNome, r.etapaNome, r.value, fmtDate(r.lastTouch), r.idle, RISK_META[r.risk].label, r.l.seller || ""])
    );
  };

  const donutData = (["critico", "alto", "atencao"] as Risk[]).map((k) => ({ name: RISK_META[k].label, value: counts[k], color: RISK_META[k].color }));

  return (
    <PageContainer breadcrumb={[{ label: "Radar" }]} title="Radar" subtitle="Negócios em aberto que esfriaram — retome antes de perder.">
      <KpiFilterCard className="mb-4" id="crmRadar" activeCount={activeCount} onClear={limparFiltros}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(["critico", "alto", "atencao"] as Risk[]).map((k) => (
          <Card key={k} onClick={() => toggleRiskFiltro(k)} className={`p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${riskFiltro === k ? "ring-2 ring-[var(--color-primary-blue)]" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {k === "critico" ? <Flame className="w-5 h-5 text-danger" /> : k === "alto" ? <Clock className="w-5 h-5 text-warning" /> : <RadarIcon className="w-5 h-5 text-info" />}
                <span className="text-xs font-bold text-[var(--color-text-muted)]">{RISK_META[k].label}</span>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-2xl font-black">{counts[k]}</div>
                {deltas?.[k] !== null && deltas?.[k] !== undefined ? (
                  <span className={`text-[11px] font-bold ${deltas[k]! > 0 ? "text-danger" : deltas[k]! < 0 ? "text-success" : "text-[var(--color-text-muted)]"}`}>
                    {deltas[k]! > 0 ? "+" : ""}{deltas[k]}% vs {janela}d atrás
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--color-text-faint)]">Sem dado de comparação ainda</span>
                )}
              </div>
              <div style={{ color: RISK_META[k].color }}>
                <Sparkline data={historico.map((h) => Number(h[`${k}_count`]) || 0)} className="w-16 h-7 shrink-0" />
              </div>
            </div>
          </Card>
        ))}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2"><Users className="w-5 h-5 text-[var(--color-primary-blue)]" /><span className="text-xs font-bold text-[var(--color-text-muted)]">Total em risco</span></div>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-2xl font-black">{totalEmRisco}</div>
              {deltas?.total !== null && deltas?.total !== undefined ? (
                <span className={`text-[11px] font-bold ${deltas.total! > 0 ? "text-danger" : deltas.total! < 0 ? "text-success" : "text-[var(--color-text-muted)]"}`}>
                  {deltas.total! > 0 ? "+" : ""}{deltas.total}% vs {janela}d atrás
                </span>
              ) : (
                <span className="text-[10px] text-[var(--color-text-faint)]">Sem dado de comparação ainda</span>
              )}
            </div>
            <Sparkline data={historico.map((h) => Number(h.total_count) || 0)} className="w-16 h-7 shrink-0 text-[var(--color-primary-blue)]" />
          </div>
          <p className="text-[10px] text-[var(--color-text-faint)] mt-1">{formatCurrency(valorEmRisco)} em jogo</p>
        </Card>
      </div>
        <FilterBar>
          <FilterSelect icon={Clock} value={String(days)} onChange={(v) => setDays(Number(v))} options={[1, 2, 3, 5, 7, 14, 30].map((d) => ({ value: String(d), label: `Sem contato há ${d}+ dia${d > 1 ? "s" : ""}` }))} title="Sem contato há pelo menos N dias" />
          {funisDisponiveis.length > 1 && (
            <FilterSelect icon={ListTree} value={funilFiltro} onChange={setFunilFiltro} options={funisDisponiveis} allLabel="Todos os funis" allValue="todos" />
          )}
          {vendedores.length > 1 && (
            <FilterSelect icon={Users} value={vendedor} onChange={setVendedor} options={vendedores as string[]} allLabel="Todos os responsáveis" allValue="todos" />
          )}
          <FilterChips value={riskFiltro ?? ""} onChange={(v) => setRiskFiltro((v || null) as Risk | null)} allLabel="Todos os riscos" options={(["critico", "alto", "atencao"] as Risk[]).map((k) => ({ value: k, label: RISK_META[k].label }))} />
          <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar lead, empresa ou responsável..." />
        </FilterBar>
      </KpiFilterCard>

      {/* Evolução + Distribuição + Parados por etapa */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-1 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">Evolução de negócios em risco</h3>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Acompanhe a quantidade de negócios que esfriaram.</p>
            </div>
            <select className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] px-2 py-1 text-[10px] shrink-0" value={janela} onChange={(e) => setJanela(Number(e.target.value) as (typeof JANELAS)[number])}>
              {JANELAS.map((j) => <option key={j} value={j}>Últimos {j} dias</option>)}
            </select>
          </div>
          {historico.length < 2 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-[var(--color-text-faint)] text-center px-4">
              Ainda sem histórico suficiente — essa tela passou a registrar um retrato real por dia a partir de hoje, o gráfico vai se preenchendo.
            </div>
          ) : (
            <div className="h-[200px] -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                  <XAxis dataKey="label" fontSize={10} stroke="var(--color-text-faint)" tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} stroke="var(--color-text-faint)" tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }} />
                  <Area type="monotone" dataKey="critico_count" name="Crítico" stroke={RISK_META.critico.color} fill={RISK_META.critico.color} fillOpacity={0.12} strokeWidth={2} />
                  <Area type="monotone" dataKey="alto_count" name="Alto" stroke={RISK_META.alto.color} fill={RISK_META.alto.color} fillOpacity={0.1} strokeWidth={2} />
                  <Area type="monotone" dataKey="atencao_count" name="Atenção" stroke={RISK_META.atencao.color} fill={RISK_META.atencao.color} fillOpacity={0.08} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] mb-1">Distribuição por risco</h3>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-3">Percentual de negócios em risco.</p>
          {totalEmRisco === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-xs text-[var(--color-text-faint)]">Nenhum negócio esfriando. 🎯</div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative h-[130px] w-[130px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value" stroke="none">
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-sm font-black">{totalEmRisco}</span>
                  <span className="text-[8px] text-[var(--color-text-faint)] uppercase font-bold">negócios</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {donutData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-[11px] text-[var(--color-text-muted)] flex-1">{d.name}</span>
                    <span className="text-[11px] font-bold">{totalEmRisco > 0 ? Math.round((d.value / totalEmRisco) * 1000) / 10 : 0}%</span>
                    <span className="text-[10px] text-[var(--color-text-faint)] w-7 text-right">({d.value})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] mb-1 flex items-center gap-1.5"><ListTree className="w-3.5 h-3.5" /> Parados por etapa</h3>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-3">Em qual etapa do funil os negócios mais travam.</p>
          {porEtapa.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-xs text-[var(--color-text-faint)]">Nenhum negócio esfriando. 🎯</div>
          ) : (
            <div className="space-y-2.5">
              {porEtapa.map((e) => (
                <div key={e.label}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-[var(--color-text-muted)] truncate">{e.label}</span>
                    <span className="font-bold shrink-0">{e.count}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--color-primary-blue)]" style={{ width: `${Math.max(3, (e.count / maxEtapaCount) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Tabela */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 ml-auto">
            {selecionados.size > 0 && (
              <Button size="sm" onClick={reengajarSelecionados} className="h-8 px-3 text-[11px] font-bold gap-1.5"><Send className="w-3.5 h-3.5" /> Reengajar selecionados ({selecionados.size})</Button>
            )}
            <Button size="sm" variant="outline" onClick={exportar} className="h-8 px-3 text-[11px] font-bold gap-1.5"><Download className="w-3.5 h-3.5" /> Exportar</Button>
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)]">{visibleRows.length} lead(s){visibleRows.length > visible.length ? ` (mostrando ${visible.length})` : ""}</p>

        {visible.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Nenhum negócio esfriando. 🎯</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" checked={allSelected} onChange={toggleSelecionarTodos} /></th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Negócio</th>
                  <th className="px-3 py-2">Funil / Etapa</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">Última atualização</th>
                  <th className="px-3 py-2 text-right">Dias sem contato</th>
                  <th className="px-3 py-2">Risco</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {visible.map((r) => (
                  <tr key={r.l.id} className="hover:bg-[var(--color-surface-sunken)] transition-colors">
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selecionados.has(r.l.id)} onChange={() => toggleSelecionado(r.l.id)} />
                    </td>
                    <td className="px-3 py-2.5 cursor-pointer" onClick={() => navigate(`/app/crm/pipeline?lead=${r.l.id}`)}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 text-white" style={{ background: RISK_META[r.risk].color }}>
                          {initials(r.l.name || r.l.company)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[var(--color-text-primary)] truncate max-w-[140px]">{r.l.name || r.l.company || "Sem nome"}</div>
                          <div className="text-[10px] text-[var(--color-text-faint)] truncate max-w-[140px]">{r.l.company || r.l.source || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)] truncate max-w-[130px] cursor-pointer" onClick={() => navigate(`/app/crm/pipeline?lead=${r.l.id}`)}>{r.l.title || "—"}</td>
                    <td className="px-3 py-2.5 cursor-pointer" onClick={() => navigate(`/app/crm/pipeline?lead=${r.l.id}`)}>
                      <Badge variant="secondary">{r.funilNome}</Badge>
                      <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5 truncate max-w-[120px]">↳ {r.etapaNome}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-[var(--color-text-primary)]">{r.value > 0 ? formatCurrency(r.value) : "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)]">{fmtDate(r.lastTouch)}</td>
                    <td className="px-3 py-2.5 font-mono text-right font-bold">{r.idle}d</td>
                    <td className="px-3 py-2.5"><Badge variant={RISK_META[r.risk].variant}>{RISK_META[r.risk].label}</Badge></td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)] truncate max-w-[110px]">{r.l.seller || "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {r.l.phone && (
                          <>
                            <a href={`tel:${r.l.phone}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]" title="Ligar"><Phone className="w-3.5 h-3.5" /></a>
                            <a href={`https://wa.me/55${String(r.l.phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]" title="WhatsApp"><MessageCircle className="w-3.5 h-3.5" /></a>
                          </>
                        )}
                        <button type="button" onClick={() => navigate(`/app/crm/pipeline?lead=${r.l.id}`)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]" title="Abrir no pipeline"><ExternalLink className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
