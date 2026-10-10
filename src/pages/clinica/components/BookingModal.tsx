import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { X, Search, ChevronDown, Check, Calendar, UserPlus } from 'lucide-react';
import { Button } from "../../../components/ui/button";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";
import { useAuth } from "../../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";
import { useClinicaConfig, dentroDoHorario } from "../../../lib/modules/clinicaConfig";

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: any[];
  addTask: (task: any) => void;
  addAppointment?: (apt: any) => void;
}

export function BookingModal({ isOpen, onClose, leads, addTask, addAppointment }: BookingModalProps) {
  const { colaboradores, appointments } = useData();
  const cfg = useClinicaConfig();
  const { activeTenantId } = useAuth();
  const doctors = useMemo(() => {
    return (colaboradores || [])
      .filter((c: any) => c.status !== 'Inativo')
      .map((c: any) => ({ id: c.id, name: c.nome, specialty: c.cargo || 'Clínica Geral' }));
  }, [colaboradores]);
  const specialties = useMemo(() => {
    return Array.from(new Set(doctors.map(d => d.specialty).filter(Boolean)));
  }, [doctors]);

  // Booking Form State
  const [searchPatient, setSearchPatient] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedIsPaciente, setSelectedIsPaciente] = useState(false);
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');

  const [pacientes, setPacientes] = useState<Array<{ id: string; name: string; email: string | null; phone: string | null }>>([]);

  useEffect(() => {
    if (!isOpen || !supabase || !activeTenantId) return;
    supabase.from('pacientes').select('id,nome,email,telefone').eq('tenant_id', activeTenantId).order('nome', { ascending: true }).then(({ data, error }) => {
      if (!error && data) {
        setPacientes(data.map((p: any) => ({ id: p.id, name: p.nome, email: p.email, phone: p.telefone })));
      }
    });
  }, [isOpen, activeTenantId]);

  const filteredPatients = useMemo(() => {
    if (!searchPatient) return [];
    const q = searchPatient.toLowerCase();
    const fromPacientes = pacientes
      .filter(p => p.name.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q))
      .map(p => ({ ...p, isPaciente: true as const }));
    const fromLeads = leads
      .filter(l => l.name.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q))
      .map((l: any) => ({ id: l.id, name: l.name, email: l.email, phone: l.phone, isPaciente: false as const }));
    return [...fromPacientes, ...fromLeads].slice(0, 6);
  }, [leads, pacientes, searchPatient]);

  const selectedPatient = selectedIsPaciente
    ? pacientes.find(p => p.id === selectedPatientId)
    : leads.find(l => l.id === selectedPatientId);
  const patientName = selectedPatient?.name || (searchPatient.trim().length > 0 ? searchPatient.trim() : '');

  const handleBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName) {
      toast.error('Informe ou selecione o nome do paciente.');
      return;
    }
    if (!selectedDoctorId || !bookingDate || !bookingTime) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    if (cfg.agenda.restringirAoHorario && !dentroDoHorario(cfg.agenda, bookingTime)) {
      toast.error(`Horário fora do atendimento (${cfg.agenda.horaInicio} às ${cfg.agenda.horaFim}, exceto ${cfg.agenda.almocoInicio}–${cfg.agenda.almocoFim}).`);
      return;
    }
    if (cfg.agenda.bloquearConflito && (appointments || []).some((a: any) => String(a.drId) === String(selectedDoctorId) && a.time === bookingTime && a.date === bookingDate)) {
      toast.error('Este profissional já tem um agendamento neste horário.');
      return;
    }

    const doctor = doctors.find(d => d.id === selectedDoctorId);
    const specialty = selectedSpecialty || doctor?.specialty || 'Clínica Geral';

    const dueDate = new Date(`${bookingDate}T${bookingTime}:00`);
    addTask({
      title: `Consulta: ${specialty} - ${doctor?.name || 'Médico'}`,
      description: `Paciente: ${patientName} · Tipo: Consulta (${specialty})`,
      lead_id: !selectedIsPaciente ? selectedPatientId : undefined,
      due_date: isNaN(dueDate.getTime()) ? undefined : dueDate.toISOString(),
      status: 'Em Aberto',
      priority: 'Alta',
    });

    if (addAppointment) {
      addAppointment({
        time: bookingTime,
        patient: patientName,
        patientId: selectedIsPaciente ? selectedPatientId : null,
        phone: (selectedPatient as any)?.phone || '',
        drId: doctor?.id || '1',
        drName: doctor?.name || 'Médico',
        status: 'Confirmado',
        type: cfg.agenda.tipoPadrao || 'Consulta',
        room: cfg.agenda.salaPadrao || 'Consultório 01',
        specialty: specialty,
        date: bookingDate
      });
    }

    toast.success(`Consulta agendada para ${patientName}!`);
    onClose();
    resetForm();
  };

  const resetForm = () => {
    setSelectedPatientId(null);
    setSelectedIsPaciente(false);
    setSearchPatient('');
    setSelectedSpecialty('');
    setSelectedDoctorId('');
    setBookingDate('');
    setBookingTime('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            className="relative w-full max-w-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-panel)] overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[var(--color-text-primary)] uppercase tracking-tight">
                      Novo Agendamento Clínico
                    </h2>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Cadastre uma nova consulta ou atendimento.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 hover:bg-[var(--color-surface-elevated)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer border-none bg-transparent"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleBooking} className="p-6 space-y-4">
              {/* Patient Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text-primary)]">
                  Paciente <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  {!selectedPatientId ? (
                    <>
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
                      <input
                        type="text"
                        value={searchPatient}
                        onChange={(e) => setSearchPatient(e.target.value)}
                        placeholder="Digite o nome ou busque um paciente cadastrado..."
                        className="w-full h-10 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] pl-10 pr-4 text-xs font-medium text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all"
                      />
                      {filteredPatients.length > 0 && (
                        <div className="absolute top-full left-0 w-full mt-1.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] overflow-hidden shadow-xl z-50 divide-y divide-[var(--color-border-subtle)]">
                          {filteredPatients.map(p => (
                            <button
                              key={`${p.isPaciente ? 'pac' : 'lead'}-${p.id}`}
                              type="button"
                              onClick={() => {
                                setSelectedPatientId(p.id);
                                setSelectedIsPaciente(p.isPaciente);
                                setSearchPatient('');
                              }}
                              className="w-full p-3 hover:bg-[var(--color-surface-sunken)] flex items-center justify-between transition-colors cursor-pointer border-none bg-transparent text-left"
                            >
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-bold text-[var(--color-text-primary)]">{p.name}</p>
                                  {p.isPaciente && (
                                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">Paciente</span>
                                  )}
                                </div>
                                <p className="text-[10px] text-[var(--color-text-muted)]">{p.email || p.phone}</p>
                              </div>
                              <ChevronDown className="w-4 h-4 text-[var(--color-text-faint)] -rotate-90" />
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 rounded-[var(--radius-control)]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--color-primary-blue)] flex items-center justify-center text-white font-bold text-xs">
                          {selectedPatient?.name[0]}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[var(--color-text-primary)]">{selectedPatient?.name}</p>
                          <p className="text-[10px] text-[var(--color-primary-blue)] font-bold">
                            {selectedIsPaciente ? 'Paciente Cadastrado' : 'Selecionado (não cadastrado como paciente)'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSelectedPatientId(null); setSelectedIsPaciente(false); }}
                        className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Specialty & Doctor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-text-primary)]">
                    Especialidade <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedSpecialty}
                    onChange={(e) => {
                      setSelectedSpecialty(e.target.value);
                      const matched = doctors.find(d => d.specialty === e.target.value);
                      if (matched) setSelectedDoctorId(matched.id);
                    }}
                    className="w-full h-10 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                  >
                    <option value="">Selecione a Especialidade</option>
                    {specialties.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-text-primary)]">
                    Médico / Especialista <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    className="w-full h-10 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                    required
                  >
                    <option value="">Selecione o Médico</option>
                    {doctors.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-text-primary)]">
                    Data da Consulta <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full h-10 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-text-primary)]">
                    Horário <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="w-full h-10 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono"
                    required
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="h-10 px-4 text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="h-10 px-5 text-xs font-bold shadow-xs gap-1.5"
                >
                  <Check className="w-4 h-4" /> Confirmar Agendamento
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
