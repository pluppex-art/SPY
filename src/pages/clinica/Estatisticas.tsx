import { useMemo, useState, useEffect } from 'react';
import {
  TrendingUp, Users, Activity,
  Calendar, PieChart as PieIcon,
  Star, Clock, Download, Inbox
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import { apiFetch } from "../../lib/apiClient";

const COLORS = ['#2563EB', '#10B981', '#8B5CF6', '#F59E0B', '#64748B'];

interface EstatisticasServerSummary {
  totalPacientes: number; total: number; occupancyPct: number;
  specialtyData: { name: string; value: number }[];
}

export default function EstatisticasClinicas() {
  const { appointments } = useData();
  const { activeTenantId } = useAuth();

  // totalPacientes/occupancy/distribuição por especialidade vêm de um cache
  // no Redis-SPY quando disponível (GET /api/clinica/estatisticas-summary),
  // mesma fórmula. patientGrowth (evolução novo x recorrente) continua
  // 100% client-side — ver comentário no endpoint.
  const [serverSummary, setServerSummary] = useState<EstatisticasServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/clinica/estatisticas-summary?tenantId=${encodeURIComponent(activeTenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side abaixo já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const patientGrowth = useMemo(() => {
    const months: Record<string, { novos: number, recorrentes: number }> = {};
    const patientVisits: Record<string, number> = {};

    const sorted = [...appointments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sorted.forEach(a => {
      try {
        const d = new Date(a.date);
        if (isNaN(d.getTime())) return;
        const month = d.toLocaleDateString('pt-BR', { month: 'short' });
        
        if (!months[month]) months[month] = { novos: 0, recorrentes: 0 };
        
        if (!patientVisits[a.patient]) {
          patientVisits[a.patient] = 1;
          months[month].novos++;
        } else {
          patientVisits[a.patient]++;
          months[month].recorrentes++;
        }
      } catch {}
    });

    return Object.entries(months).map(([month, data]) => ({
      month,
      ...data
    }));
  }, [appointments]);

  const clientSpecialtyData = useMemo(() => {
    const specs: Record<string, number> = {};
    appointments.forEach(a => {
      const s = a.specialty || 'Clínico Geral';
      specs[s] = (specs[s] || 0) + 1;
    });

    const total = appointments.length;
    return Object.entries(specs)
      .map(([name, count]) => ({ name, value: total > 0 ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [appointments]);

  // Cor atribuída pela posição final (pós-ordenação), não pela ordem de
  // encontro no array original — puramente cosmético, sem impacto nos
  // números exibidos.
  const specialtyData = (serverSummary?.specialtyData ?? clientSpecialtyData).map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }));

  const clientTotalPacientes = new Set(appointments.map(a => a.patient)).size;
  const totalPacientes = serverSummary?.totalPacientes ?? clientTotalPacientes;
  // Tempo médio de espera e NPS exigiriam dados que o app ainda não coleta
  // (timestamps reais de check-in/atendimento e respostas de pesquisa de
  // satisfação) — sem tabela para isso, mostramos vazio em vez de inventar.
  const avgWaitTime = "—";
  const occupancy = serverSummary
    ? `${serverSummary.occupancyPct}%`
    : appointments.length > 0
      ? `${Math.round((appointments.filter(a => a.status === 'Confirmado' || a.status === 'Em Atendimento' || a.status === 'Finalizado').length / appointments.length) * 100)}%`
      : "0%";

  return (
    <PageContainer 
      title="BI & Performance Clínica" 
      description="Indicadores da clínica: fluxo de pacientes, produtividade dos médicos e números de saúde."
      actions={
        <Button 
          variant="outline" 
          onClick={() => toast.success("Relatório de BI exportado!")}
          className="h-9 px-4 text-xs font-bold gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> Exportar BI
        </Button>
      }
    >
      <div className="space-y-6 max-w-[1700px] mx-auto pb-12">
        
        {/* Metric Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Taxa de Ocupação", value: occupancy, icon: Activity, color: "text-[var(--color-primary-blue)]" },
            { label: "NPS dos Pacientes", value: "—", icon: Star, color: "text-amber-500" },
            { label: "Total de Pacientes", value: totalPacientes.toString(), icon: Users, color: "text-emerald-500" },
            { label: "Tempo Médio de Espera", value: avgWaitTime, icon: Clock, color: "text-purple-500" },
          ].map((stat, i) => (
            <Card key={i} className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">{stat.label}</span>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <h3 className="text-2xl font-black font-mono text-[var(--color-text-primary)]">{stat.value}</h3>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Growth Area Chart */}
          <Card className="lg:col-span-2 p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" /> Evolução da Base de Pacientes
              </h3>
            </div>
            {patientGrowth.length === 0 ? (
              <div className="h-[300px] flex flex-col items-center justify-center gap-3 opacity-50">
                <Inbox className="w-10 h-10 text-[var(--color-text-faint)]" />
                <p className="text-xs font-bold text-[var(--color-text-muted)] text-center">
                  Nenhum paciente registrado ainda.
                </p>
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={patientGrowth}>
                    <defs>
                      <linearGradient id="colorNovos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" stroke="var(--color-text-faint)" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis stroke="var(--color-text-faint)" fontSize={10} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-default)', borderRadius: '8px', color: 'var(--color-text-primary)' }}
                    />
                    <Area type="monotone" dataKey="recorrentes" stroke="var(--color-primary-blue)" fillOpacity={0} strokeWidth={2} />
                    <Area type="monotone" dataKey="novos" stroke="#10b981" fillOpacity={1} fill="url(#colorNovos)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Mix of Specialties */}
          <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-6 flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-[var(--color-primary-blue)]" /> Distribuição por Especialidade
            </h3>
            {specialtyData.length === 0 ? (
              <div className="h-[250px] flex flex-col items-center justify-center gap-3 opacity-50">
                <PieIcon className="w-8 h-8 text-[var(--color-text-faint)]" />
                <p className="text-xs font-bold text-[var(--color-text-muted)] text-center">
                  Sem especialidades cadastradas.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {specialtyData.map((item, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-[var(--color-text-muted)]">{item.name}</span>
                      <span className="text-xs font-bold font-mono text-[var(--color-text-primary)]">{item.value}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${item.value}%`, backgroundColor: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

      </div>
    </PageContainer>
  );
}
