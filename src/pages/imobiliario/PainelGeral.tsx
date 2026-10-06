import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid,
} from "recharts";
import {
  Building2, Eye, DollarSign, TrendingUp, MapPin, Star, Car,
  Calendar, ArrowUpRight, Target, Columns3,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { DrillDownPanel, type DrillColumn } from "../../components/ui/DrillDownPanel";

type ImovelRow = {
  id: string; titulo: string; tipo: string; status: string;
  valor: number; bairro: string; cidade: string;
  visitas: number; created_at: string; operacao: string;
};
type VeiculoRow = { id: string; marca: string; modelo: string; status: string; valor: number; };
type CorretorRow = {
  nome: string; vendas_mes: number; vgv_mes: number; meta: number; avaliacao: number;
};
type VisitaRow = {
  data: string; hora: string; imovel: string; cliente: string; corretor: string; status: string;
};
type LeadRow = { etapa: string; orcamento: number; status: string; };

const TIPO_COLORS: Record<string, string> = {
  Apartamento: "#3b82f6", Casa: "#8b5cf6", Cobertura: "#06b6d4",
  Comercial: "#f59e0b", Kitnet: "#10b981", Terreno: "#f97316",
};
const ETAPA_COLORS: Record<string, string> = {
  Prospecção: "bg-blue-400", Qualificação: "bg-amber-400",
  Apresentação: "bg-violet-400", Negociação: "bg-cyan-400", Fechamento: "bg-emerald-400",
};
const ETAPAS = ["Prospecção", "Qualificação", "Apresentação", "Negociação", "Fechamento"];
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function KPICard({ icon: Icon, label, value, sub, color, trend, trendVal }: {
  icon: any; label: string; value: string; sub?: string; color: string;
  trend?: "up" | "down"; trendVal?: string;
}) {
  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all">
      <div className="flex items-start justify-between mb-4">
        <Icon className={`w-5 h-5 ${color}`} />
        {trendVal && (
          <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg ${trend === "up" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
            <ArrowUpRight className="w-3 h-3" />
            {trendVal}
          </div>
        )}
      </div>
      <div className="text-2xl font-display font-black text-white mb-1 italic">{value}</div>
      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</div>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--color-surface-elevated)] border border-white/10 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-[10px] text-slate-500 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-black text-white">
          {p.dataKey === "vgv" ? `R$ ${p.value}M` : p.value}
        </p>
      ))}
    </div>
  );
};

export default function ImobiliarioPainel() {
  const { activeTenantId } = useAuth();
  const [imoveis, setImoveis] = useState<ImovelRow[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoRow[]>([]);
  const [corretores, setCorretores] = useState<CorretorRow[]>([]);
  const [visitas, setVisitas] = useState<VisitaRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [activePie, setActivePie] = useState<number | null>(null);
  const [drillTitle, setDrillTitle] = useState<string | null>(null);
  const [drillRows, setDrillRows] = useState<any[]>([]);
  const [drillColumns, setDrillColumns] = useState<DrillColumn[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    const today = new Date().toISOString().split("T")[0];
    // Sem o filtro de tenant, essas 5 queries agregavam dados imobiliários de
    // TODOS os tenants juntos — vazamento cross-tenant. E o `.limit(5)` em
    // visitas, usado só pra não poluir a lista "Próximas Visitas", também
    // capava o KPI de contagem e o gráfico semanal, que precisam do total real.
    Promise.all([
      supabase.from("imobiliario_imoveis").select("id,titulo,tipo,status,valor,bairro,cidade,visitas,created_at,operacao").eq("tenant_id", activeTenantId),
      supabase.from("imobiliario_veiculos").select("id,marca,modelo,status,valor").eq("tenant_id", activeTenantId),
      supabase.from("imobiliario_corretores").select("nome,vendas_mes,vgv_mes,meta,avaliacao").eq("tenant_id", activeTenantId).order("vendas_mes", { ascending: false }),
      supabase.from("imobiliario_visitas").select("data,hora,imovel,cliente,corretor,status").eq("tenant_id", activeTenantId).gte("data", today).order("data"),
      supabase.from("imobiliario_leads").select("etapa,orcamento,status").eq("tenant_id", activeTenantId),
    ]).then(([im, vei, cor, vis, lea]) => {
      setImoveis(im.data ?? []);
      setVeiculos(vei.data ?? []);
      setCorretores(cor.data ?? []);
      setVisitas(vis.data ?? []);
      setLeads(lea.data ?? []);
    }).catch(err => {
      console.error("[Supabase] Imobiliario painel:", err);
    });
  }, [activeTenantId]);

  // KPIs
  const disponiveisRows = imoveis.filter(i => i.status === "Disponível");
  const disponiveis = disponiveisRows.length;
  const vendidosMesRows = (() => {
    const now = new Date();
    return imoveis.filter(i => {
      if (i.status !== "Vendido") return false;
      const d = new Date(i.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  })();
  const vendidosMes = vendidosMesRows.length;
  const vgvMes = (() => {
    const now = new Date();
    return imoveis.filter(i => {
      if (i.status !== "Vendido" || i.operacao !== "Venda") return false;
      const d = new Date(i.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s, i) => s + i.valor, 0);
  })();
  const leadsAtivosRows = leads.filter(l => l.status === "Ativo");
  const leadsAtivos = leadsAtivosRows.length;
  const leadsGanhos = leads.filter(l => l.status === "Ganho").length;
  const conversao = leads.length > 0 ? ((leadsGanhos / leads.length) * 100).toFixed(1) : "0.0";

  // Segmento: imóveis vs veículos — visão combinada exigida pelo módulo unificado
  const imoveisDisponiveisVgv = imoveis.filter(i => i.status === "Disponível").reduce((s, i) => s + i.valor, 0);
  const veiculosDisponiveis = veiculos.filter(v => v.status === "Disponível").length;
  const veiculosDisponiveisValor = veiculos.filter(v => v.status === "Disponível").reduce((s, v) => s + v.valor, 0);
  const veiculosVendidos = veiculos.filter(v => v.status === "Vendido").length;

  // VGV por mês (últimos 6 meses)
  const vgvMensal = Array.from({ length: 6 }, (_, i) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();
    const vendidos = imoveis.filter(im => {
      if (im.status !== "Vendido") return false;
      const dt = new Date(im.created_at);
      return dt.getMonth() === m && dt.getFullYear() === y;
    });
    return {
      mes: MESES[m],
      vgv: Number((vendidos.reduce((s, im) => s + im.valor, 0) / 1e6).toFixed(1)),
      vendas: vendidos.length,
    };
  });

  // Portfolio por tipo
  const portfolioTipo = Object.entries(
    imoveis.reduce((acc, im) => { acc[im.tipo] = (acc[im.tipo] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value, color: TIPO_COLORS[name] ?? "#64748b" }));

  // Funil
  const leadsAtivosAll = leadsAtivosRows;
  const maxFunil = leadsAtivosAll.length || 1;
  const funil = ETAPAS.map(etapa => {
    const count = leadsAtivosAll.filter(l => l.etapa === etapa).length;
    return { etapa, count, pct: Math.round((count / maxFunil) * 100), cor: ETAPA_COLORS[etapa] };
  });

  // Visitas por dia da semana
  const DIAS = ["Seg","Ter","Qua","Qui","Sex","Sáb"];
  const visitasSemana = DIAS.map((dia, i) => ({
    dia,
    visitas: visitas.filter(v => new Date(v.data + "T12:00:00").getDay() === i + 1).length,
  }));

  // Imóveis por bairro
  const imoveisBairro = Object.entries(
    imoveis.reduce((acc, im) => {
      if (!im.bairro) return acc;
      acc[im.bairro] = acc[im.bairro] ?? { count: 0, vgv: 0 };
      acc[im.bairro].count++;
      acc[im.bairro].vgv += im.valor;
      return acc;
    }, {} as Record<string, { count: number; vgv: number }>)
  )
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([bairro, d], _, arr) => ({
      bairro,
      count: d.count,
      vgv: d.vgv >= 1e6 ? `R$ ${(d.vgv / 1e6).toFixed(1)}M` : `R$ ${(d.vgv / 1e3).toFixed(0)}k`,
      pct: Math.round((d.count / (arr[0]?.[1]?.count ?? 1)) * 100),
    }));

  // Destaques
  const destaques = imoveis.filter(i => i.status === "Disponível").slice(0, 4);

  const fmtVgv = (v: number) =>
    v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)}M` : v > 0 ? `R$ ${(v / 1e3).toFixed(0)}k` : "—";

  const imovelColumns: DrillColumn[] = [
    { header: "Título", render: (i: ImovelRow) => <span className="font-bold text-[var(--color-text-primary)]">{i.titulo || "—"}</span> },
    { header: "Bairro", render: (i: ImovelRow) => i.bairro || "—" },
    { header: "Tipo", render: (i: ImovelRow) => i.tipo || "—" },
    { header: "Status", render: (i: ImovelRow) => i.status || "—" },
    { header: "Valor", render: (i: ImovelRow) => fmtVgv(i.valor || 0), className: "text-right" },
  ];
  const leadColumns: DrillColumn[] = [
    { header: "Etapa", render: (l: LeadRow) => <span className="font-bold text-[var(--color-text-primary)]">{l.etapa || "—"}</span> },
    { header: "Orçamento", render: (l: LeadRow) => fmtVgv(l.orcamento || 0) },
    { header: "Status", render: (l: LeadRow) => l.status || "—" },
  ];
  const visitaColumns: DrillColumn[] = [
    { header: "Imóvel", render: (v: VisitaRow) => <span className="font-bold text-[var(--color-text-primary)]">{v.imovel || "—"}</span> },
    { header: "Cliente", render: (v: VisitaRow) => v.cliente || "—" },
    { header: "Corretor", render: (v: VisitaRow) => v.corretor || "—" },
    { header: "Data", render: (v: VisitaRow) => `${v.data} ${v.hora}` },
    { header: "Status", render: (v: VisitaRow) => v.status || "—" },
  ];
  const openDrill = (title: string, rows: any[], columns: DrillColumn[]) => {
    setDrillTitle(title);
    setDrillRows(rows);
    setDrillColumns(columns);
  };

  return (
    <PageContainer
      title="Painel Geral"
      description="Visão 360° do portfólio de imóveis e veículos, performance da equipe e funil de vendas."
    >
      <div className="space-y-6 max-w-[1700px] mx-auto pb-10">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div onClick={() => openDrill("Disponíveis", disponiveisRows, imovelColumns)} className="cursor-pointer">
            <KPICard icon={Building2} label="Disponíveis" value={String(disponiveis)} sub="no portfólio ativo" color="text-indigo-500" />
          </div>
          <div onClick={() => openDrill("Vendidos Mês", vendidosMesRows, imovelColumns)} className="cursor-pointer">
            <KPICard icon={TrendingUp} label="Vendidos Mês" value={String(vendidosMes)} sub="negócios fechados" color="text-emerald-500" />
          </div>
          <KPICard icon={DollarSign} label="VGV Mês" value={fmtVgv(vgvMes)} sub="volume geral de vendas" color="text-blue-500" />
          <div onClick={() => openDrill("Leads Ativos", leadsAtivosRows, leadColumns)} className="cursor-pointer">
            <KPICard icon={Columns3} label="Leads Ativos" value={String(leadsAtivos)} sub="no funil de vendas" color="text-cyan-500" />
          </div>
          <div onClick={() => openDrill("Próximas Visitas", visitas, visitaColumns)} className="cursor-pointer">
            <KPICard icon={Eye} label="Próximas Visitas" value={String(visitas.length)} sub="agendadas" color="text-amber-500" />
          </div>
          <KPICard icon={Target} label="Conversão" value={`${conversao}%`} sub="leads → fechamento" color="text-purple-500" />
        </div>

        {/* Por Segmento: Imóveis vs Veículos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-black text-white uppercase tracking-widest">Imóveis</p>
              <p className="text-[10px] text-slate-500">{disponiveis} disponíveis · {fmtVgv(imoveisDisponiveisVgv)} em estoque</p>
            </div>
          </div>
          <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <Car className="w-6 h-6 text-violet-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-black text-white uppercase tracking-widest">Veículos</p>
              <p className="text-[10px] text-slate-500">{veiculosDisponiveis} disponíveis · {fmtVgv(veiculosDisponiveisValor)} em estoque · {veiculosVendidos} vendidos</p>
            </div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* VGV por Mês */}
          <div className="lg:col-span-2 bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-widest">VGV por Mês</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Volume geral de vendas em R$ milhões</p>
              </div>
            </div>
            {vgvMensal.every(m => m.vgv === 0) ? (
              <div className="flex items-center justify-center h-[210px] text-slate-600 text-sm">Nenhuma venda registrada</div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={vgvMensal} barSize={36} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}M`} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.025)", radius: 6 }} />
                  <Bar dataKey="vgv" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Portfólio por Tipo */}
          <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-5">
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-0.5">Portfólio por Tipo</h3>
            <p className="text-[10px] text-slate-500 mb-2">{imoveis.length} imóveis cadastrados</p>
            {portfolioTipo.length === 0 ? (
              <div className="flex items-center justify-center h-[180px] text-slate-600 text-sm">Sem imóveis cadastrados</div>
            ) : (
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={portfolioTipo}
                      cx="50%" cy="50%"
                      innerRadius={52} outerRadius={78}
                      dataKey="value" strokeWidth={0}
                      onMouseEnter={(_, idx) => setActivePie(idx)}
                      onMouseLeave={() => setActivePie(null)}
                    >
                      {portfolioTipo.map((entry, i) => (
                        <Cell key={i} fill={entry.color} opacity={activePie === null || activePie === i ? 1 : 0.35} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} itemStyle={{ fontWeight: 700, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="space-y-2">
              {portfolioTipo.map((t, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => openDrill(t.name, imoveis.filter((im) => im.tipo === t.name), imovelColumns)}
                  className="w-full flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity text-left"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                    <span className="text-[11px] text-slate-400">{t.name}</span>
                  </div>
                  <span className="text-[11px] font-black text-white">{t.value}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Funil de Vendas */}
          <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-5">
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-1">Funil de Vendas</h3>
            <p className="text-[10px] text-slate-500 mb-5">Taxa de conversão por etapa</p>
            {leadsAtivosAll.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-slate-600 text-sm">Nenhum lead ativo</div>
            ) : (
              <div className="space-y-3.5">
                {funil.map((f, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => f.count > 0 && openDrill(f.etapa, leadsAtivosAll.filter((l) => l.etapa === f.etapa), leadColumns)}
                    disabled={f.count === 0}
                    className={`w-full text-left ${f.count > 0 ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-slate-400">{f.etapa}</span>
                      <span className="text-[11px] font-black text-white">{f.count}</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${f.cor} transition-all duration-700`} style={{ width: `${f.pct}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
              <p className="text-[10px] text-slate-500">Taxa de fechamento</p>
              <p className="text-xl font-black text-emerald-400">{conversao}%</p>
            </div>
          </div>

          {/* Ranking Corretores */}
          <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-5">
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-1">Ranking Corretores</h3>
            <p className="text-[10px] text-slate-500 mb-5">Performance acumulada no mês</p>
            {corretores.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-slate-600 text-sm">Nenhum corretor cadastrado</div>
            ) : (
              <div className="space-y-5">
                {corretores.slice(0, 3).map((c, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0 ${i === 0 ? "bg-amber-500" : i === 1 ? "bg-slate-500" : "bg-orange-800"}`}>
                        #{i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-black text-white truncate">{c.nome}</span>
                          <div className="flex items-center gap-1 text-amber-400 shrink-0 ml-2">
                            <Star className="w-3 h-3 fill-current" />
                            <span className="text-[11px] font-black">{Number(c.avaliacao ?? 0).toFixed(1)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500">
                          <span>{c.vendas_mes ?? 0} vendas</span>
                          <span>·</span>
                          <span>VGV R$ {Number(c.vgv_mes ?? 0).toFixed(1)}M</span>
                          <span>·</span>
                          <span>Meta: {c.meta ?? 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="ml-10">
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-1">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${i === 0 ? "bg-amber-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min(((c.vendas_mes ?? 0) / (c.meta || 1)) * 100, 100)}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-slate-600">{Math.round(((c.vendas_mes ?? 0) / (c.meta || 1)) * 100)}% da meta mensal</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Próximas Visitas */}
          <div className="space-y-4">
            <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-5">
              <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">Próximas Visitas</h3>
              {visitas.length === 0 ? (
                <div className="flex items-center justify-center h-20 text-slate-600 text-sm">Nenhuma visita agendada</div>
              ) : (
                <div className="space-y-2.5">
                  {visitas.slice(0, 5).map((v, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-bold text-white truncate">{v.imovel}</p>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${v.status === "Confirmada" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                            {v.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">{v.data} {v.hora} · {v.cliente}</p>
                        <p className="text-[10px] text-slate-600">{v.corretor}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Visitas por semana */}
        <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-widest">Visitas por Dia da Semana</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Distribuição das próximas visitas agendadas</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>Visitas</span>
            </div>
          </div>
          {visitasSemana.every(v => v.visitas === 0) ? (
            <div className="flex items-center justify-center h-[160px] text-slate-600 text-sm">Nenhuma visita agendada</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={visitasSemana}>
                <defs>
                  <linearGradient id="visitasGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)" }} />
                <Area type="monotone" dataKey="visitas" stroke="#3b82f6" strokeWidth={2.5} fill="url(#visitasGrad)" dot={{ fill: "#3b82f6", r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: "#3b82f6", strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Imóveis em Destaque + por Bairro */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-5">
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4">Imóveis em Destaque</h3>
            {destaques.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-slate-600 text-sm">Nenhum imóvel disponível</div>
            ) : (
              <div className="space-y-3">
                {destaques.map((im, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-900/40 to-violet-900/40 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{im.titulo}</p>
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />{im.bairro} · {im.tipo}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-white">{fmtVgv(im.valor)}</p>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                        {im.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-5">
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4">Imóveis por Bairro</h3>
            {imoveisBairro.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-slate-600 text-sm">Nenhum imóvel cadastrado</div>
            ) : (
              <div className="space-y-3">
                {imoveisBairro.map((b, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => openDrill(b.bairro, imoveis.filter((im) => im.bairro === b.bairro), imovelColumns)}
                    className="w-full text-left cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span className="text-[11px] text-slate-300 font-bold">{b.bairro}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span>{b.count} imóveis</span>
                        <span className="font-black text-white">{b.vgv}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-700" style={{ width: `${b.pct}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <DrillDownPanel
        isOpen={drillTitle !== null}
        onClose={() => setDrillTitle(null)}
        title={drillTitle || undefined}
        subtitle={`${drillRows.length} registro${drillRows.length === 1 ? "" : "s"}`}
        rows={drillRows}
        columns={drillColumns}
      />
    </PageContainer>
  );
}
