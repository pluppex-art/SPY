import { useState, useEffect, useMemo } from 'react';
import {
  Users, Search, UserPlus, Download, Mail, Phone, Clock,
  ShieldCheck, X, FileText, Trash2, Edit2, Cake, IdCard, Stethoscope
} from 'lucide-react';
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { EmptyState } from "../../components/ui/empty-state";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { PageContainer } from "../../components/PageContainer";
import { motion, AnimatePresence } from "motion/react";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { exportToCSV } from "../../lib/exportCsv";
import { toast } from "sonner";
import { BookingModal } from "./components/BookingModal";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

type Paciente = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  data_nascimento: string | null;
  convenio: string;
  alergias: string;
  observacoes: string;
  status: string;
  created_at?: string;
};

const FIELD = "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]";
const LABEL = "text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-widest mb-1.5 block";

import { Modal } from "../../components/ui/modal";
import { friendlyError } from "../../lib/friendlyError";

function PacienteFormModal({ onClose, onSave, initial }: {
  onClose: () => void;
  onSave: (d: any) => void;
  initial?: Partial<Paciente>;
}) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? "",
    telefone: initial?.telefone ?? "",
    email: initial?.email ?? "",
    cpf: initial?.cpf ?? "",
    data_nascimento: initial?.data_nascimento ?? "",
    convenio: initial?.convenio ?? "Particular",
    alergias: initial?.alergias ?? "",
    observacoes: initial?.observacoes ?? "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = Boolean(initial?.id);

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="max-w-lg"
      title={isEdit ? "Editar Paciente" : "Novo Paciente"}
      description="Cadastro completo para prontuário, agendamento e faturamento."
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
              onSave(form);
              onClose();
            }}
            className="bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white font-semibold"
          >
            {isEdit ? "Salvar Alterações" : "Cadastrar Paciente"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <div>
          <label className={LABEL}>Nome Completo *</label>
          <input value={form.nome} onChange={e => set("nome", e.target.value)} placeholder="Ex: Maria Fernandes" className={FIELD} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Telefone</label>
            <input value={form.telefone} onChange={e => set("telefone", e.target.value)} placeholder="(11) 99999-0000" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>E-mail</label>
            <input value={form.email} onChange={e => set("email", e.target.value)} placeholder="paciente@email.com" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>CPF</label>
            <input value={form.cpf} onChange={e => set("cpf", e.target.value)} placeholder="000.000.000-00" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Data de Nascimento</label>
            <input type="date" value={form.data_nascimento} onChange={e => set("data_nascimento", e.target.value)} className={FIELD} />
          </div>
        </div>
        <div>
          <label className={LABEL}>Convênio / Plano</label>
          <input value={form.convenio} onChange={e => set("convenio", e.target.value)} placeholder="Particular, Unimed, Bradesco Saúde..." className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Alergias</label>
          <input value={form.alergias} onChange={e => set("alergias", e.target.value)} placeholder="Ex: Dipirona, Penicilina" className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Observações Gerais</label>
          <textarea value={form.observacoes} onChange={e => set("observacoes", e.target.value)} rows={3} className={`${FIELD} resize-none`} />
        </div>
      </div>
    </Modal>
  );
}

function calcIdade(dataNasc: string | null) {
  if (!dataNasc) return null;
  const nasc = new Date(dataNasc);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function rowToPaciente(r: any): Paciente {
  return {
    id: r.id, nome: r.nome, telefone: r.telefone ?? "", email: r.email ?? "",
    cpf: r.cpf ?? "", data_nascimento: r.data_nascimento, convenio: r.convenio ?? "Particular",
    alergias: r.alergias ?? "", observacoes: r.observacoes ?? "", status: r.status ?? "Ativo",
    created_at: r.created_at,
  };
}

export default function Pacientes() {
  const { appointments, leads, addTask, addAppointment } = useData();
  const { activeTenantId } = useAuth();
  const navigate = useNavigate();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editPaciente, setEditPaciente] = useState<Paciente | null>(null);
  const [bookingFor, setBookingFor] = useState<Paciente | null>(null);

  const refetch = () => {
    if (!supabase || !activeTenantId) { setLoading(false); return; }
    supabase.from("pacientes").select("*").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) toast.error(`Erro ao carregar pacientes: ${friendlyError(error)}`);
      else if (data) setPacientes(data.map(rowToPaciente));
      setLoading(false);
    });
  };

  useEffect(() => { refetch(); }, [activeTenantId]);

  const visitsByName = useMemo(() => {
    const map = new Map<string, { lastVisit: string; visits: number }>();
    [...appointments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(a => {
      if (!a.patient) return;
      const existing = map.get(a.patient);
      if (existing) { existing.lastVisit = a.date; existing.visits++; }
      else map.set(a.patient, { lastVisit: a.date, visits: 1 });
    });
    return map;
  }, [appointments]);

  const [convenioFilter, setConvenioFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const convenioOptions = useMemo(() => Array.from(new Set(pacientes.map(p => p.convenio).filter(Boolean))).sort(), [pacientes]);
  const statusOptions = useMemo(() => Array.from(new Set(pacientes.map(p => p.status).filter(Boolean))).sort(), [pacientes]);
  const activeFilters = (searchTerm ? 1 : 0) + (convenioFilter ? 1 : 0) + (statusFilter ? 1 : 0);
  const clearFilters = () => { setSearchTerm(''); setConvenioFilter(''); setStatusFilter(''); };

  const filteredPatients = pacientes.filter(p =>
    (!convenioFilter || p.convenio === convenioFilter) &&
    (!statusFilter || p.status === statusFilter) &&
    (p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.telefone.includes(searchTerm) ||
    p.cpf.includes(searchTerm))
  );

  const totalPatients = filteredPatients.length;
  const currentMonth = new Date().toISOString().substring(0, 7);
  const newThisMonth = filteredPatients.filter(p => p.created_at && p.created_at.startsWith(currentMonth)).length;
  const today = new Date().toISOString().split('T')[0];
  const consultsToday = appointments.filter(a => a.date === today).length;
  const comConvenio = totalPatients > 0
    ? Math.round((filteredPatients.filter(p => p.convenio && p.convenio !== 'Particular').length / totalPatients) * 100)
    : 0;

  const handleSave = async (form: any) => {
    if (!supabase || !activeTenantId) { toast.error("Não foi possível conectar ao servidor."); return; }
    const { data, error } = await supabase.from("pacientes").insert({ ...form, tenant_id: activeTenantId }).select().maybeSingle();
    if (error) { toast.error(`Erro ao cadastrar paciente: ${friendlyError(error)}`); return; }
    if (data) setPacientes(prev => [rowToPaciente(data), ...prev]);
    toast.success("Paciente cadastrado com sucesso!");
  };

  const handleEdit = async (form: any) => {
    if (!editPaciente || !supabase) return;
    const { error } = await supabase.from("pacientes").update(form).eq("id", editPaciente.id);
    if (error) { toast.error(`Erro ao atualizar paciente: ${friendlyError(error)}`); return; }
    setPacientes(prev => prev.map(p => p.id === editPaciente.id ? { ...p, ...form } : p));
    toast.success("Paciente atualizado.");
    setEditPaciente(null);
  };

  const handleDelete = async (p: Paciente) => {
    if (!(await confirmDialog({
      title: "Excluir paciente",
      description: `Excluir ${p.nome}? Isso também remove o histórico de prontuário vinculado. Essa ação não pode ser desfeita.`,
    }))) return;
    if (!supabase) return;
    const { error } = await supabase.from("pacientes").delete().eq("id", p.id);
    if (error) { toast.error(`Erro ao remover paciente: ${friendlyError(error)}`); return; }
    setPacientes(prev => prev.filter(x => x.id !== p.id));
    toast.success("Paciente removido.");
  };

  return (
    <PageContainer
      title="Gestão de Pacientes"
      description="Cadastro completo de pacientes, convênios, alergias e histórico de atendimento."
      actions={
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={() => {
              if (filteredPatients.length === 0) return toast.error("Nenhum dado para exportar");
              exportToCSV(filteredPatients, "Pacientes_SPY");
              toast.success("Download iniciado!");
            }}
            variant="outline"
            className="h-9 px-4 text-xs font-bold gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Exportar Base
          </Button>

          <Button
            onClick={() => setShowForm(true)}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" /> Novo Paciente
          </Button>
        </div>
      }
    >
      <div className="max-w-[1500px] mx-auto space-y-6 pb-12">

        {showForm && <PacienteFormModal onClose={() => setShowForm(false)} onSave={handleSave} />}
        {editPaciente && <PacienteFormModal onClose={() => setEditPaciente(null)} onSave={handleEdit} initial={editPaciente} />}

        <KpiFilterCard
          id="clinicaPacientes"
          kpis={[
            { label: 'Total de Pacientes', value: totalPatients, icon: Users, tone: 'primary' },
            { label: 'Novos neste Mês', value: `+${newThisMonth}`, icon: UserPlus, tone: 'success' },
            { label: 'Com Convênio', value: `${comConvenio}%`, icon: ShieldCheck, tone: 'accent' },
            { label: 'Consultas Hoje', value: consultsToday, icon: Clock, tone: 'warning' },
          ]}
          activeCount={activeFilters}
          onClear={clearFilters}
        >
          <FilterBar>
            <FilterSearch value={searchTerm} onChange={setSearchTerm} placeholder="Buscar por nome, telefone ou CPF do paciente..." />
            <FilterSelect icon={ShieldCheck} value={convenioFilter} onChange={setConvenioFilter} options={convenioOptions} allLabel="Todos os convênios" />
            <FilterSelect icon={Users} value={statusFilter} onChange={setStatusFilter} options={statusOptions} allLabel="Todos os status" />
          </FilterBar>
        </KpiFilterCard>

        {/* Patients Grid */}
        {loading ? (
          <div className="text-center py-16 text-[var(--color-text-muted)] text-xs font-bold">Carregando pacientes...</div>
        ) : pacientes.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="Nenhum paciente cadastrado"
            description="Cadastre o primeiro paciente para começar a usar a Clínica."
            action={
              <Button onClick={() => setShowForm(true)} className="h-9 px-4 text-xs font-bold gap-1.5">
                <UserPlus className="w-3.5 h-3.5" /> Novo Paciente
              </Button>
            }
          />
        ) : filteredPatients.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nenhum paciente encontrado"
            description="Tente buscar por outro nome, telefone ou e-mail."
          />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredPatients.map((patient, i) => {
                const visitInfo = visitsByName.get(patient.nome);
                const idade = calcIdade(patient.data_nascimento);
                return (
                <motion.div
                  key={patient.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/40 transition-all group shadow-sm">
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-sm font-black text-[var(--color-primary-blue)] shrink-0">
                        {patient.nome.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-[var(--color-text-primary)] truncate">{patient.nome}</h4>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="success">● {patient.status}</Badge>
                          <span className="text-[10px] text-[var(--color-text-faint)]">{patient.convenio}</span>
                          {idade !== null && <span className="text-[10px] text-[var(--color-text-faint)] flex items-center gap-0.5"><Cake className="w-2.5 h-2.5" />{idade}a</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditPaciente(patient)} className="p-1.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface)] hover:border-[var(--color-border-default)] text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(patient)} className="p-1.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-rose-500/10 hover:border-rose-500/25 text-rose-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-[var(--color-border-subtle)]">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-[var(--color-text-faint)] uppercase">Última Consulta</p>
                        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-primary)] font-mono">
                          <Clock className="w-3 h-3 text-[var(--color-primary-blue)]" />
                          {visitInfo?.lastVisit || '—'}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-[var(--color-text-faint)] uppercase">Telefone</p>
                        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-primary)]">
                          <Phone className="w-3 h-3 text-emerald-500" /> {patient.telefone || '(Sem telefone)'}
                        </div>
                      </div>
                    </div>

                    {patient.alergias && (
                      <div className="mt-3 px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-500 font-bold flex items-center gap-1.5">
                        <ShieldCheck className="w-3 h-3" /> Alergias: {patient.alergias}
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-[var(--color-border-subtle)] flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/app/clinica/prontuarios?paciente=${patient.id}`)}
                        className="flex-1 text-xs font-bold gap-1.5 h-8"
                      >
                        <FileText className="w-3.5 h-3.5" /> Prontuário
                      </Button>
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => { setBookingFor(patient); setIsBookingOpen(true); }}
                        className="h-8 w-8 p-0"
                        title="Agendar consulta"
                      >
                        <Stethoscope className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              );})}
            </AnimatePresence>
          </div>
        )}
      </div>

      <BookingModal
        isOpen={isBookingOpen}
        onClose={() => { setIsBookingOpen(false); setBookingFor(null); }}
        leads={bookingFor ? [{ id: bookingFor.id, name: bookingFor.nome, phone: bookingFor.telefone }, ...leads] : leads}
        addTask={addTask}
        addAppointment={addAppointment}
      />
    </PageContainer>
  );
}
