import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Stethoscope, MapPin, CheckCircle2, AlertCircle, Activity, Users, Clock, MoreVertical, RefreshCw, CalendarDays } from 'lucide-react';
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { motion, AnimatePresence } from "motion/react";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { getGoogleCalendarStatus } from "../../lib/google-auth";
import { listGoogleCalendarEvents } from "../../lib/google-calendar";
import { toast } from "sonner";
import { AgendaSidebar } from "./components/AgendaMedica/AgendaSidebar";
import { AgendaDetailPanel } from "./components/AgendaMedica/AgendaDetailPanel";
import { BookingModal } from "./components/BookingModal";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { confirmDialog } from "../../components/ui/confirm-dialog";

const hourlySlots = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'
];

type Appointment = {
  id: string; time: string; patient: string; drId: string; drName: string;
  status: 'Confirmado' | 'Aguardando' | 'Atrasado' | 'Em Atendimento' | 'Finalizado';
  type: string; room: string; specialty: string;
};

export default function AgendaClinica() {
  const { appointments, addAppointment, updateAppointment, deleteAppointment, squads, leads, addTask } = useData();
  const { activeTenantId } = useAuth();

  const doctors = useMemo(() => {
    if (!squads || squads.length === 0) return [];
    const allMembers = squads.flatMap(s => s.membros || []);
    const unique = Array.from(new Set(allMembers));
    const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'];
    return unique.map((name: string, i) => ({
      id: `dr-${i}`,
      name: name.includes('(') ? name.split(' (')[0] : name,
      esp: name.includes('(') ? name.split('(')[1].replace(')', '') : 'Geral',
      color: colors[i % colors.length]
    }));
  }, [squads]);

  const [selectedDrs, setSelectedDrs] = useState<string[]>([]);
  const [selectedAptId, setSelectedAptId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  useEffect(() => {
    if (doctors.length > 0 && selectedDrs.length === 0) setSelectedDrs(doctors.map(d => d.id));
  }, [doctors]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const statusOptions = useMemo(() => Array.from(new Set(appointments.map((a: any) => a.status).filter(Boolean))) as string[], [appointments]);
  const typeOptions = useMemo(() => Array.from(new Set(appointments.map((a: any) => a.type).filter(Boolean))) as string[], [appointments]);
  const activeFilters = (search ? 1 : 0) + (statusFilter ? 1 : 0) + (typeFilter ? 1 : 0);
  const clearFilters = () => { setSearch(''); setStatusFilter(''); setTypeFilter(''); };
  const filteredAppointments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appointments.filter(apt =>
      selectedDrs.includes(apt.drId) &&
      (!statusFilter || apt.status === statusFilter) &&
      (!typeFilter || apt.type === typeFilter) &&
      (!q || `${apt.patient} ${apt.drName} ${apt.room}`.toLowerCase().includes(q))
    );
  }, [selectedDrs, appointments, search, statusFilter, typeFilter]);
  const aptKpis = useMemo(() => ({
    total: filteredAppointments.length,
    confirmed: filteredAppointments.filter(a => a.status === 'Confirmado').length,
    waiting: filteredAppointments.filter(a => a.status === 'Aguardando' || a.status === 'Atrasado').length,
    done: filteredAppointments.filter(a => a.status === 'Finalizado').length,
  }), [filteredAppointments]);
  const selectedApt = appointments.find(a => a.id === selectedAptId);

  const handleSyncCalendar = async () => {
    if (!activeTenantId) return;
    const status = await getGoogleCalendarStatus(activeTenantId);
    if (!status.connected) { toast.error("Por favor, conecte sua conta Google na página de Telemedicina antes de sincronizar."); return; }
    setIsSyncing(true);
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const events = await listGoogleCalendarEvents(activeTenantId, {
        timeMin: todayStart.toISOString(),
        timeMax: todayEnd.toISOString(),
      });
      let importedCount = 0;
      events.forEach((event: any) => {
        const start = event.start.dateTime || event.start.date;
        const startTime = new Date(start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if (!appointments.some(a => a.time === startTime && a.room === 'Google Calendar')) {
          addAppointment({ time: startTime, patient: event.summary || "Bloco Google Calendar", drId: '4', drName: 'Dr. Roberto Vilela', status: 'Confirmado', type: 'Consulta', room: 'Google Calendar', specialty: 'Sincronizado', date: new Date().toISOString().split('T')[0] });
          importedCount++;
        }
      });
      if (importedCount > 0) toast.success(`${importedCount} eventos importados do Google Calendar!`);
      else toast.info("Sincronização concluída. Nenhum novo evento pendente.");
    } catch (error) {
      toast.error("Erro ao sincronizar com Google Calendar.");
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusStyle = (status: Appointment['status'] | string) => {
    switch (status) {
      case 'Finalizado': return 'bg-slate-500/10 text-[var(--color-text-muted)] border-[var(--color-border-default)]';
      case 'Em Atendimento': return 'bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30';
      case 'Atrasado': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'Aguardando': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    }
  };

  return (
    <PageContainer
      title="Agenda Médica"
      description="Sincronização de horários, gestão de salas e fluxo de pacientes por unidade."
      actions={
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={handleSyncCalendar}
            disabled={isSyncing}
            variant="outline"
            className="h-9 px-4 text-xs font-bold gap-1.5"
          >
            {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--color-primary-blue)]" /> : <CalendarDays className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />}
            Sincronizar Google
          </Button>

          <div className="flex bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] p-0.5 rounded-[var(--radius-control)] h-9 items-center">
            <Button variant="ghost" size="xs" className="h-7 w-7 p-0"><ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)]" /></Button>
            <div className="px-3 flex items-center text-xs font-bold text-[var(--color-text-primary)] min-w-[120px] justify-center">
              Hoje
            </div>
            <Button variant="ghost" size="xs" className="h-7 w-7 p-0"><ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" /></Button>
          </div>

          <Button
            onClick={() => setIsBookingOpen(true)}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" /> Novo Agendamento
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="clinicaAgenda"
        className="mb-4"
        kpis={[
          { label: "Agendamentos", value: aptKpis.total, icon: CalendarDays, tone: "primary" },
          { label: "Confirmados", value: aptKpis.confirmed, icon: CheckCircle2, tone: "success" },
          { label: "Aguardando/Atrasados", value: aptKpis.waiting, icon: Clock, tone: "warning" },
          { label: "Finalizados", value: aptKpis.done, icon: Users, tone: "info" },
        ]}
        activeCount={activeFilters}
        onClear={clearFilters}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar paciente, médico ou sala..." />
          <FilterSelect icon={Activity} value={statusFilter} onChange={setStatusFilter} options={statusOptions} allLabel="Todos os status" />
          <FilterSelect icon={Stethoscope} value={typeFilter} onChange={setTypeFilter} options={typeOptions} allLabel="Todos os tipos" />
        </FilterBar>
      </KpiFilterCard>
      <div className="grid lg:grid-cols-4 gap-6 max-w-[1700px] mx-auto pb-10">
        <AgendaSidebar
          doctors={doctors}
          selectedDrs={selectedDrs}
          onToggle={(id) => setSelectedDrs(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])}
          onSelectAll={() => setSelectedDrs(doctors.map(d => d.id))}
          getStatusStyle={getStatusStyle}
          appointments={filteredAppointments}
        />

        <div className="lg:col-span-3 space-y-6">
          <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
            <div className="flex items-center p-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]">
              <div className="w-20 shrink-0 text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Hora</div>
              <div className="flex-1 text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider pl-4">Paciente & Especialista</div>
              <div className="hidden md:block w-32 text-center text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Sala</div>
              <div className="hidden md:block w-36 text-right text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Status</div>
              <div className="w-8" />
            </div>
            <div className="grid grid-cols-1 divide-y divide-[var(--color-border-subtle)] overflow-y-auto max-h-[800px] scrollbar-thin">
              {hourlySlots.map((slot, i) => {
                const apts = filteredAppointments.filter(a => a.time === slot);
                return (
                  <div key={i} className={`flex group min-h-[80px] relative transition-colors ${apts.length > 0 ? '' : 'hover:bg-[var(--color-surface-sunken)]/40'}`}>
                    <div className={`w-20 p-4 border-r border-[var(--color-border-subtle)] flex flex-col items-center justify-center bg-[var(--color-surface-sunken)]/30 shrink-0 ${apts.length > 0 ? 'border-l-4 border-l-[var(--color-primary-blue)]' : ''}`}>
                      <span className="text-sm font-black text-[var(--color-text-primary)] font-mono">{slot}</span>
                      <span className="text-[9px] text-[var(--color-text-faint)] font-medium mt-0.5">30min</span>
                    </div>
                    <div className="flex-1 p-2.5 space-y-2">
                      <AnimatePresence>
                        {apts.length > 0 ? apts.map(apt => (
                          <motion.button
                            key={apt.id}
                            type="button"
                            onClick={() => setSelectedAptId(apt.id)}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`w-full flex items-center justify-between p-3 rounded-[var(--radius-control)] border transition-all text-left shadow-xs cursor-pointer ${getStatusStyle(apt.status)}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center font-bold text-xs text-[var(--color-text-primary)]">
                                {apt.patient[0]}
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{apt.patient}</h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-[var(--color-text-muted)] flex items-center gap-1">
                                    <Stethoscope className="w-3 h-3 text-[var(--color-primary-blue)]" /> {apt.drName}
                                  </span>
                                  <span className="text-[10px] text-[var(--color-text-faint)]">• {apt.type}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="hidden md:flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                                <MapPin className="w-3 h-3 text-[var(--color-text-faint)]" />
                                <span className="font-medium">{apt.room}</span>
                              </div>
                              <div className="hidden md:flex items-center gap-1.5 w-28 justify-end text-xs font-bold">
                                {apt.status === 'Confirmado' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                {apt.status === 'Atrasado' && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                                {apt.status === 'Em Atendimento' && <Activity className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />}
                                <span>{apt.status}</span>
                              </div>
                            </div>
                          </motion.button>
                        )) : (
                          <button
                            type="button"
                            onClick={() => setIsBookingOpen(true)}
                            className="w-full h-full min-h-[50px] border border-dashed border-[var(--color-border-subtle)] rounded-[var(--radius-control)] opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider hover:bg-[var(--color-surface-sunken)] hover:border-[var(--color-border-default)] cursor-pointer bg-transparent"
                          >
                            <Plus className="w-3.5 h-3.5" /> Agendar Horário vago
                          </button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <AgendaDetailPanel 
        selectedApt={selectedApt as Appointment | undefined} 
        onClose={() => setSelectedAptId(null)}
        onUpdateStatus={(status) => {
          if (selectedAptId) {
            updateAppointment(selectedAptId, { status });
            toast.success(`Status atualizado para ${status}!`);
          }
        }}
        onDelete={async () => {
          if (selectedAptId) {
            if (!(await confirmDialog({
              title: "Cancelar agendamento",
              description: `Cancelar o atendimento de ${selectedApt?.patient || "este paciente"}? Essa ação não pode ser desfeita.`,
            }))) return;
            deleteAppointment(selectedAptId);
            setSelectedAptId(null);
            toast.success("Agendamento cancelado com sucesso!");
          }
        }}
      />
      <BookingModal 
        isOpen={isBookingOpen} 
        onClose={() => setIsBookingOpen(false)} 
        leads={leads} 
        addTask={addTask} 
        addAppointment={addAppointment} 
      />
    </PageContainer>
  );
}
