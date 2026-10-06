import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users, Plus, ShieldCheck, FileText, Activity, Pill, Inbox,
  Stethoscope, ClipboardList, FlaskConical, X, Trash2
} from 'lucide-react';
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { EmptyState } from "../../components/ui/empty-state";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { PageContainer } from "../../components/PageContainer";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";

type Paciente = { id: string; nome: string; convenio: string; alergias: string };
type Prontuario = {
  id: string;
  paciente_id: string;
  data: string;
  profissional: string;
  queixa_principal: string;
  historico: string;
  diagnostico: string;
  prescricao: string;
  exames_solicitados: string;
  observacoes: string;
  created_at: string;
};

const FIELD = "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]";
const LABEL = "text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-widest mb-1.5 block";

import { Modal } from "../../components/ui/modal";
import { friendlyError } from "../../lib/friendlyError";

function NovaEntradaModal({ onClose, onSave }: { onClose: () => void; onSave: (d: any) => void }) {
  const [form, setForm] = useState({
    profissional: "", queixa_principal: "", historico: "",
    diagnostico: "", prescricao: "", exames_solicitados: "", observacoes: "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="max-w-xl"
      title="Nova Entrada de Prontuário"
      description="Registro clínico do atendimento, diagnóstico e prescrição médica."
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!form.queixa_principal.trim() && !form.diagnostico.trim()) {
                toast.error("Preencha ao menos a queixa principal ou o diagnóstico");
                return;
              }
              onSave(form);
              onClose();
            }}
            className="bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white font-semibold"
          >
            Salvar no Prontuário
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <div>
          <label className={LABEL}>Profissional Responsável</label>
          <input value={form.profissional} onChange={e => set("profissional", e.target.value)} placeholder="Dr(a). Nome" className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Queixa Principal</label>
          <input value={form.queixa_principal} onChange={e => set("queixa_principal", e.target.value)} placeholder="Ex: dor de cabeça há 3 dias" className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Histórico / Evolução</label>
          <textarea value={form.historico} onChange={e => set("historico", e.target.value)} rows={2} className={`${FIELD} resize-none`} />
        </div>
        <div>
          <label className={LABEL}>Diagnóstico</label>
          <textarea value={form.diagnostico} onChange={e => set("diagnostico", e.target.value)} rows={2} className={`${FIELD} resize-none`} />
        </div>
        <div>
          <label className={LABEL}>Prescrição</label>
          <textarea value={form.prescricao} onChange={e => set("prescricao", e.target.value)} rows={2} className={`${FIELD} resize-none`} />
        </div>
        <div>
          <label className={LABEL}>Exames Solicitados</label>
          <input value={form.exames_solicitados} onChange={e => set("exames_solicitados", e.target.value)} placeholder="Ex: Hemograma completo, Raio-X tórax" className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Observações</label>
          <textarea value={form.observacoes} onChange={e => set("observacoes", e.target.value)} rows={2} className={`${FIELD} resize-none`} />
        </div>
      </div>
    </Modal>
  );
}

export default function ProntuariosDashboard() {
  const { activeTenantId } = useAuth();
  const [searchParams] = useSearchParams();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [prontuarios, setProntuarios] = useState<Prontuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPacienteId, setSelectedPacienteId] = useState<string | null>(searchParams.get('paciente'));
  const [showNovaEntrada, setShowNovaEntrada] = useState(false);

  const refetchPacientes = () => {
    if (!supabase || !activeTenantId) { setLoading(false); return; }
    supabase.from("pacientes").select("id, nome, convenio, alergias").eq("tenant_id", activeTenantId).order("nome").then(({ data, error }) => {
      if (error) toast.error(`Erro ao carregar pacientes: ${friendlyError(error)}`);
      else if (data) setPacientes(data as Paciente[]);
      setLoading(false);
    });
  };

  const refetchProntuarios = (pacienteId: string) => {
    if (!supabase || !activeTenantId) return;
    supabase.from("prontuarios").select("*").eq("paciente_id", pacienteId).eq("tenant_id", activeTenantId).order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Erro ao carregar prontuário: ${friendlyError(error)}`);
        else if (data) setProntuarios(data as Prontuario[]);
      });
  };

  useEffect(() => { refetchPacientes(); }, [activeTenantId]);
  useEffect(() => {
    if (selectedPacienteId) refetchProntuarios(selectedPacienteId);
    else setProntuarios([]);
  }, [selectedPacienteId]);

  const [convenioFilter, setConvenioFilter] = useState('');
  const [alergiaFilter, setAlergiaFilter] = useState('');
  const convenioOptions = useMemo(() => Array.from(new Set(pacientes.map(p => p.convenio).filter(Boolean))).sort(), [pacientes]);
  const activeFilters = (searchTerm ? 1 : 0) + (convenioFilter ? 1 : 0) + (alergiaFilter ? 1 : 0);
  const clearFilters = () => { setSearchTerm(''); setConvenioFilter(''); setAlergiaFilter(''); };
  const filteredPatients = pacientes.filter(p =>
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (!convenioFilter || p.convenio === convenioFilter) &&
    (!alergiaFilter || (alergiaFilter === 'com' ? !!p.alergias?.trim() : !p.alergias?.trim()))
  );
  const selectedPaciente = pacientes.find(p => p.id === selectedPacienteId);
  const totalPatients = filteredPatients.length;

  const handleSaveEntrada = async (form: any) => {
    if (!supabase || !selectedPacienteId || !activeTenantId) return;
    const { data, error } = await supabase.from("prontuarios").insert({ ...form, paciente_id: selectedPacienteId, tenant_id: activeTenantId }).select().maybeSingle();
    if (error) { toast.error(`Erro ao salvar entrada: ${friendlyError(error)}`); return; }
    if (data) setProntuarios(prev => [data as Prontuario, ...prev]);
    toast.success("Entrada registrada no prontuário.");
  };

  const handleDeleteEntrada = async (id: string) => {
    if (!(await confirmDialog({ title: "Excluir entrada", description: "Excluir esta entrada do prontuário? Essa ação não pode ser desfeita." }))) return;
    if (!supabase) return;
    const { error } = await supabase.from("prontuarios").delete().eq("id", id);
    if (error) { toast.error(`Erro ao excluir: ${friendlyError(error)}`); return; }
    setProntuarios(prev => prev.filter(p => p.id !== id));
    toast.success("Entrada removida.");
  };

  const prescricoesEmitidas = useMemo(() => prontuarios.filter(p => p.prescricao?.trim()).length, [prontuarios]);
  const examesEmProntuario = useMemo(() => prontuarios.filter(p => p.exames_solicitados?.trim()).length, [prontuarios]);

  return (
    <PageContainer
      title="Prontuário Eletrônico (EHR)"
      description="Histórico clínico completo, evolução do paciente e acompanhamento multiprofissional."
      actions={
        selectedPacienteId && (
          <Button onClick={() => setShowNovaEntrada(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
            <Plus className="w-3.5 h-3.5" /> Nova Entrada
          </Button>
        )
      }
    >
      {showNovaEntrada && <NovaEntradaModal onClose={() => setShowNovaEntrada(false)} onSave={handleSaveEntrada} />}

      <div className="space-y-6 max-w-[1600px] mx-auto pb-12">

        <KpiFilterCard
          id="clinicaProntuarios"
          kpis={[
            { label: "Total de Pacientes", value: totalPatients, icon: Activity, tone: "primary" },
            { label: "Entradas neste Prontuário", value: prontuarios.length, icon: ClipboardList, tone: "success" },
            { label: "Prescrições Emitidas", value: prescricoesEmitidas, icon: Pill, tone: "warning" },
            { label: "Exames Solicitados", value: examesEmProntuario, icon: FlaskConical, tone: "accent" },
          ]}
          activeCount={activeFilters}
          onClear={clearFilters}
        >
          <FilterBar>
            <FilterSearch value={searchTerm} onChange={setSearchTerm} placeholder="Pesquisar paciente..." />
            <FilterSelect icon={ShieldCheck} value={convenioFilter} onChange={setConvenioFilter} options={convenioOptions} allLabel="Todos os convênios" />
            <FilterSelect icon={Pill} value={alergiaFilter} onChange={setAlergiaFilter} options={[{ value: 'com', label: 'Com alergias' }, { value: 'sem', label: 'Sem alergias' }]} allLabel="Alergias: todas" />
          </FilterBar>
        </KpiFilterCard>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Patient List */}
          <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm h-fit">
            <div className="p-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]">
              <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--color-primary-blue)]" /> Base de Pacientes
              </h3>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-[var(--color-text-muted)] font-bold">Carregando...</div>
            ) : pacientes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-50">
                <Inbox className="w-10 h-10 text-[var(--color-text-faint)]" />
                <p className="text-xs font-bold text-[var(--color-text-muted)] text-center px-4">
                  Nenhum paciente cadastrado ainda.<br/>Cadastre em "Gestão de Pacientes".
                </p>
              </div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto divide-y divide-[var(--color-border-subtle)]">
                {filteredPatients.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPacienteId(p.id)}
                    className={`w-full p-3.5 flex items-center gap-3 text-left transition-colors ${selectedPacienteId === p.id ? 'bg-[var(--color-primary-blue)]/10' : 'hover:bg-[var(--color-surface-sunken)]/50'}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center text-xs font-bold shrink-0">
                      {p.nome.substring(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{p.nome}</p>
                      <p className="text-[10px] text-[var(--color-text-faint)]">{p.convenio}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Timeline do prontuário */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedPaciente ? (
              <Card className="p-16 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col items-center justify-center gap-3 opacity-60">
                <Stethoscope className="w-10 h-10 text-[var(--color-text-faint)]" />
                <p className="text-xs font-bold text-[var(--color-text-muted)]">Selecione um paciente para ver o prontuário.</p>
              </Card>
            ) : (
              <>
                <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-[var(--color-text-primary)]">{selectedPaciente.nome}</h3>
                      <p className="text-[10px] text-[var(--color-text-faint)]">{selectedPaciente.convenio}</p>
                    </div>
                    {selectedPaciente.alergias && (
                      <Badge variant="destructive">⚠ Alergia: {selectedPaciente.alergias}</Badge>
                    )}
                  </div>
                </Card>

                {prontuarios.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="Nenhuma entrada de prontuário ainda"
                    description={`Registre o primeiro atendimento de ${selectedPaciente.nome}.`}
                    action={
                      <Button onClick={() => setShowNovaEntrada(true)} className="h-9 px-4 text-xs font-bold gap-1.5">
                        <Plus className="w-3.5 h-3.5" /> Nova Entrada
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {prontuarios.map(entry => (
                      <Card key={entry.id} className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm group">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
                            <span className="text-xs font-bold text-[var(--color-text-primary)]">{entry.data}</span>
                            {entry.profissional && <span className="text-[10px] text-[var(--color-text-faint)]">— {entry.profissional}</span>}
                          </div>
                          <button onClick={() => handleDeleteEntrada(entry.id)} className="p-1 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 hover:border-rose-500/25 text-rose-500 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="space-y-2 text-xs">
                          {entry.queixa_principal && <p><span className="font-bold text-[var(--color-text-faint)] uppercase text-[10px]">Queixa: </span>{entry.queixa_principal}</p>}
                          {entry.historico && <p><span className="font-bold text-[var(--color-text-faint)] uppercase text-[10px]">Histórico: </span>{entry.historico}</p>}
                          {entry.diagnostico && <p><span className="font-bold text-[var(--color-text-faint)] uppercase text-[10px]">Diagnóstico: </span>{entry.diagnostico}</p>}
                          {entry.prescricao && <p><span className="font-bold text-[var(--color-text-faint)] uppercase text-[10px]">Prescrição: </span>{entry.prescricao}</p>}
                          {entry.exames_solicitados && <p><span className="font-bold text-[var(--color-text-faint)] uppercase text-[10px]">Exames: </span>{entry.exames_solicitados}</p>}
                          {entry.observacoes && <p className="text-[var(--color-text-muted)]"><span className="font-bold text-[var(--color-text-faint)] uppercase text-[10px]">Obs: </span>{entry.observacoes}</p>}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </PageContainer>
  );
}
