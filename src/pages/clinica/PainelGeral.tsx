import type { ComponentType } from 'react';
import { Calendar, Users, TrendingUp, Star, ChevronDown } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { BookingModal } from "./components/BookingModal";
import { PainelKPIs } from "./components/PainelGeral/PainelKPIs";
import { PainelCharts } from "./components/PainelGeral/PainelCharts";
import { PainelRanking } from "./components/PainelGeral/PainelRanking";
import { PainelInsights } from "./components/PainelGeral/PainelInsights";
import { Plus } from 'lucide-react';
import { apiFetch } from "../../lib/apiClient";
import { Badge } from "../../components/ui/badge";
import type { DrillColumn } from "../../components/ui/DrillDownPanel";

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type Stat = {
  label: string; value: string; trend: string | null;
  icon: ComponentType<{ className?: string }>; color: string; bg: string;
  drill?: { subtitle?: string; rows: any[]; columns: DrillColumn[] };
};

interface PainelGeralServerSummary {
  totalAppointments: number; confirmed: number; finalized: number; late: number; occupancyPct: number;
  clinicData: { name: string; consultas: number; noShow: number }[];
  doctorRanking: { name: string; patients: number }[];
}

export default function ClinicasDashboard() {
  const { leads, addTask, appointments } = useData();
  const { activeTenantId } = useAuth();
  const [view, setView] = useState<'geral' | 'unidades' | 'operacional'>('geral');
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // KPIs + distribuição por dia da semana + ranking de médicos vêm de um
  // cache no Redis-SPY quando disponível (GET /api/clinica/painel-geral-summary),
  // mesma fórmula. activeToday (lista de agendamentos) continua client-side.
  const [serverSummary, setServerSummary] = useState<PainelGeralServerSummary | null>(null);
  useEffect(() => {
    setServerSummary(null);
    if (!activeTenantId) return;
    let cancelled = false;
    apiFetch(`/api/clinica/painel-geral-summary?tenantId=${encodeURIComponent(activeTenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setServerSummary(data); })
      .catch(() => { /* silencioso — cálculo client-side abaixo já cobre */ });
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const clientTotalAppointments = appointments.length;
  const clientConfirmed = appointments.filter(a => a.status === 'Confirmado' || a.status === 'Em Atendimento').length;
  const clientFinalized = appointments.filter(a => a.status === 'Finalizado').length;
  const clientLate = appointments.filter(a => a.status === 'Atrasado').length;
  const clientOccupancyPct = clientTotalAppointments > 0 ? Math.min(100, Math.round((clientConfirmed / clientTotalAppointments) * 100)) : 0;

  const clientClinicData = useMemo(() => WEEKDAYS.map(day => {
    const dayApts = appointments.filter(a => {
      try { const d = new Date(a.date); return !isNaN(d.getTime()) && WEEKDAYS[d.getDay()] === day; }
      catch { return false; }
    });
    return { name: day, consultas: dayApts.length, noShow: dayApts.filter(a => a.status === 'Atrasado').length };
  }), [appointments]);

  const clientDoctorRanking = useMemo(() => {
    const byDr: Record<string, { name: string; patients: number }> = {};
    appointments.forEach(a => {
      const dr = a.drName || 'Sem especialista';
      if (!byDr[dr]) byDr[dr] = { name: dr, patients: 0 };
      byDr[dr].patients++;
    });
    return Object.values(byDr).sort((a, b) => b.patients - a.patients).slice(0, 3);
  }, [appointments]);

  const totalAppointments = serverSummary?.totalAppointments ?? clientTotalAppointments;
  const confirmed = serverSummary?.confirmed ?? clientConfirmed;
  const finalized = serverSummary?.finalized ?? clientFinalized;
  const late = serverSummary?.late ?? clientLate;
  const occupancyPct = serverSummary?.occupancyPct ?? clientOccupancyPct;
  const clinicData = serverSummary?.clinicData ?? clientClinicData;
  const doctorRanking = serverSummary?.doctorRanking ?? clientDoctorRanking;

  const today = new Date().toISOString().split('T')[0];
  const activeToday = appointments.filter(a => a.date === today).slice(0, 4);

  const appointmentColumns: DrillColumn[] = [
    { header: "Paciente", render: (a: any) => <span className="font-bold text-[var(--color-text-primary)]">{a.patient || "—"}</span> },
    { header: "Especialista", render: (a: any) => a.drName || "—" },
    { header: "Data", render: (a: any) => a.date || "—" },
    { header: "Status", render: (a: any) => <Badge variant="secondary">{a.status || "—"}</Badge> },
  ];
  const confirmedRows = appointments.filter(a => a.status === 'Confirmado' || a.status === 'Em Atendimento');
  const finalizedRows = appointments.filter(a => a.status === 'Finalizado');
  const lateRows = appointments.filter(a => a.status === 'Atrasado');

  const stats: Stat[] = [
    { label: "Agendamentos (Total)", value: totalAppointments.toString(), trend: null, icon: Calendar, color: "text-slate-400", bg: "bg-white/5", drill: { subtitle: `${appointments.length} agendamento${appointments.length === 1 ? "" : "s"}`, rows: appointments, columns: appointmentColumns } },
    { label: "Confirmados / Ativos", value: confirmed.toString(), trend: null, icon: TrendingUp, color: "text-slate-400", bg: "bg-white/5", drill: { subtitle: `${confirmedRows.length} agendamento${confirmedRows.length === 1 ? "" : "s"}`, rows: confirmedRows, columns: appointmentColumns } },
    { label: "Finalizados", value: finalized.toString(), trend: null, icon: Users, color: "text-slate-400", bg: "bg-white/5", drill: { subtitle: `${finalizedRows.length} agendamento${finalizedRows.length === 1 ? "" : "s"}`, rows: finalizedRows, columns: appointmentColumns } },
    { label: "Atrasados / Em Fila", value: late.toString(), trend: null, icon: Star, color: "text-slate-400", bg: "bg-white/5", drill: { subtitle: `${lateRows.length} agendamento${lateRows.length === 1 ? "" : "s"}`, rows: lateRows, columns: appointmentColumns } },
  ];

  return (
    <PageContainer
      title="Gestão de Clínicas S.P.Y."
      description="Monitoramento clínico, eficiência operacional e jornada do paciente em tempo real."
      actions={
        <div className="flex items-center gap-4">
          <Button onClick={() => setIsBookingOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Agendamento
          </Button>
          <div className="flex bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl p-1 gap-1">
            {(['geral', 'unidades', 'operacional'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setView(t)}
                className={`px-4 py-2 text-xs rounded-xl capitalize transition-all font-bold cursor-pointer border-none ${
                  view === t
                    ? 'bg-[var(--color-primary-blue)] !text-white font-bold shadow-xs'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] bg-transparent'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
        <PainelKPIs stats={stats} />
        <PainelCharts clinicData={clinicData} totalAppointments={totalAppointments} confirmed={confirmed} finalized={finalized} late={late} occupancyPct={occupancyPct} />

        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-2xl transition-colors text-left"
        >
          <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-2">
            {showDetails ? "Ver menos" : "Ver mais detalhes"}
            {!showDetails && <span className="text-[var(--color-text-faint)]">— ranking de médicos e jornada do paciente</span>}
          </span>
          <ChevronDown className={`w-4 h-4 text-[var(--color-text-muted)] shrink-0 transition-transform ${showDetails ? "rotate-180" : ""}`} />
        </button>

        {showDetails && (
          <>
            <PainelRanking doctorRanking={doctorRanking} totalAppointments={totalAppointments} finalized={finalized} />
            <PainelInsights totalAppointments={totalAppointments} confirmed={confirmed} late={late} activeToday={activeToday} onNewBooking={() => setIsBookingOpen(true)} />
          </>
        )}
      </div>

      <BookingModal isOpen={isBookingOpen} onClose={() => setIsBookingOpen(false)} leads={leads} addTask={addTask} />
    </PageContainer>
  );
}
