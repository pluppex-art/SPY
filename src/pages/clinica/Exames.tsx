import React, { useState } from 'react';
import {
  FileText, FlaskConical, Building2,
  Clock, CheckCircle2, AlertCircle, Download,
  Eye, Plus, X, Check, Pencil
} from 'lucide-react';
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { PageContainer } from "../../components/PageContainer";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { Modal } from "../../components/ui/modal";
import { useExames } from './hooks/useExames';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { exportToCSV } from '../../lib/exportCsv';

export default function Exames() {
  const { exames: examList, addExame, updateExame } = useExames();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<typeof examList[number] | null>(null);
  const [editStatus, setEditStatus] = useState('Aguardando Coleta');
  const [editResult, setEditResult] = useState('');

  // Form state
  const [patientName, setPatientName] = useState('');
  const [examName, setExamName] = useState('');
  const [labName, setLabName] = useState('Lab Vértice Central');
  const [examDate, setExamDate] = useState(new Date().toLocaleDateString('pt-BR'));

  const [statusFilter, setStatusFilter] = useState('');
  const [labFilter, setLabFilter] = useState('');
  const statusOptions = Array.from(new Set(examList.map(e => e.status).filter(Boolean)));
  const labOptions = Array.from(new Set(examList.map(e => e.lab).filter(Boolean))).sort();
  const activeFilters = (searchTerm ? 1 : 0) + (statusFilter ? 1 : 0) + (labFilter ? 1 : 0);
  const clearFilters = () => { setSearchTerm(''); setStatusFilter(''); setLabFilter(''); };

  const filteredExames = examList.filter(e =>
    (!statusFilter || e.status === statusFilter) &&
    (!labFilter || e.lab === labFilter) &&
    (e.patient.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.exam.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.lab.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreateExame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim() || !examName.trim()) {
      toast.error("Preencha o nome do paciente e o exame.");
      return;
    }

    addExame({
      patient: patientName.trim(),
      exam: examName.trim(),
      lab: labName,
      date: examDate,
    });

    setIsAddModalOpen(false);
    setPatientName('');
    setExamName('');
  };

  const openEdit = (exam: typeof examList[number]) => {
    setEditingExam(exam);
    setEditStatus(exam.status);
    setEditResult(exam.result === '-' ? '' : exam.result);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExam) return;
    await updateExame(editingExam.id, { status: editStatus, result: editResult.trim() || '-' });
    setEditingExam(null);
  };

  return (
    <PageContainer 
      title="Exames & Laboratório" 
      description="Gerencie pedidos de exames laboratoriais e acompanhe o status de cada resultado."
      actions={
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={() => {
              if (filteredExames.length === 0) { toast.error("Nenhum pedido para exportar."); return; }
              exportToCSV(filteredExames, "Exames_SPY");
              toast.success("Lote de exames exportado!");
            }}
            className="h-9 px-4 text-xs font-bold gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Exportar Lote
          </Button>
          <Button 
            onClick={() => setIsAddModalOpen(true)}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Pedido
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-w-[1700px] mx-auto pb-12">
        
        <KpiFilterCard
          id="clinicaExames"
          kpis={[
            { label: "Pedidos", value: filteredExames.length, icon: FlaskConical, tone: "primary" },
            { label: "Resultados Prontos", value: filteredExames.filter(e => e.status === 'Finalizado').length, icon: CheckCircle2, tone: "success" },
            { label: "Em Análise", value: filteredExames.filter(e => e.status === 'Em Análise').length, icon: Clock, tone: "warning" },
            { label: "Aguardando Coleta", value: filteredExames.filter(e => e.status === 'Aguardando Coleta').length, icon: AlertCircle, tone: "accent" },
          ]}
          activeCount={activeFilters}
          onClear={clearFilters}
        >
          <FilterBar>
            <FilterSearch value={searchTerm} onChange={setSearchTerm} placeholder="Buscar exame ou paciente..." />
            <FilterSelect icon={Clock} value={statusFilter} onChange={setStatusFilter} options={statusOptions} allLabel="Todos os status" />
            <FilterSelect icon={Building2} value={labFilter} onChange={setLabFilter} options={labOptions} allLabel="Todos os laboratórios" />
          </FilterBar>
        </KpiFilterCard>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Exams Table */}
          <Card className="lg:col-span-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[var(--color-border-subtle)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[var(--color-surface-sunken)]">
              <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--color-primary-blue)]" /> Histórico de Pedidos
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/50">
                    <th className="p-3.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Paciente</th>
                    <th className="p-3.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Exame</th>
                    <th className="p-3.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Data</th>
                    <th className="p-3.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Status</th>
                    <th className="p-3.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {filteredExames.map((exam) => (
                    <tr key={exam.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                      <td className="p-3.5">
                        <p className="text-xs font-bold text-[var(--color-text-primary)]">{exam.patient}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">{exam.lab}</p>
                      </td>
                      <td className="p-3.5 text-xs text-[var(--color-text-primary)] font-medium">{exam.exam}</td>
                      <td className="p-3.5 text-xs text-[var(--color-text-muted)] font-mono">{exam.date}</td>
                      <td className="p-3.5">
                        <Badge 
                          variant={exam.status === 'Finalizado' ? 'success' : exam.status === 'Em Análise' ? 'info' : 'warning'} 
                        >
                          {exam.status}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              if (exam.result && exam.result !== "-") toast.info(`Resultado de ${exam.patient}: ${exam.result}`);
                              else toast.info(`${exam.patient} ainda não possui resultado lançado.`);
                            }}
                            className="h-7 w-7 p-0 cursor-pointer"
                            title="Ver resultado"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => openEdit(exam)}
                            className="h-7 w-7 p-0 cursor-pointer"
                            title="Atualizar status / lançar resultado"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredExames.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-xs text-[var(--color-text-muted)] italic">
                        Nenhum pedido de exame encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Lab Tracking Section */}
          <div className="space-y-4">
            <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
              <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-4 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-[var(--color-primary-blue)]" /> Acompanhamento de Pedidos
              </h3>
              <div className="p-3 bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] space-y-1">
                <p className="text-xs font-bold text-[var(--color-text-primary)]">Lançamento Manual de Resultados</p>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  Cada pedido é registrado manualmente pela equipe da clínica. Use o ícone de edição na tabela para
                  atualizar o status e lançar o resultado assim que o laboratório informar.
                </p>
              </div>
              <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-[var(--radius-control)]">
                <p className="text-[10px] text-amber-500 font-bold leading-relaxed">
                  Integração eletrônica direta com laboratórios (HL7/FHIR/DICOM) não está disponível — todo o fluxo
                  hoje é manual.
                </p>
              </div>
            </Card>
          </div>
        </div>

      </div>

      {/* Modal: Novo Pedido de Exame */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Novo Pedido de Exame"
        description="Solicite novos exames laboratoriais ou de imagem para o paciente."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateExame} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nome do Paciente *</label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Nome completo do paciente"
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-medium"
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Exame Solicitado *</label>
            <input
              type="text"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              placeholder="Ex: Hemograma Completo, Ultrassom Abdominal"
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-medium"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Laboratório / Clínica</label>
              <select
                value={labName}
                onChange={(e) => setLabName(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-2.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-medium"
              >
                <option value="Lab Vértice Central">Lab Vértice Central</option>
                <option value="Imobiliz Imagem">Imobiliz Imagem</option>
                <option value="CardioClin">CardioClin</option>
                <option value="Fleury / Conveniado">Fleury / Conveniado</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Data da Solicitação</label>
              <input
                type="text"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border-subtle)] flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
              className="h-9 px-4 text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="h-9 px-5 text-xs font-bold shadow-xs gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Criar Pedido
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Atualizar Status / Resultado */}
      <Modal
        isOpen={!!editingExam}
        onClose={() => setEditingExam(null)}
        title={editingExam ? `Atualizar Pedido — ${editingExam.patient}` : "Atualizar Pedido"}
        description="Atualize o status laboratorial ou digite o laudo emitido."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Status</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-2.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-medium"
            >
              <option value="Aguardando Coleta">Aguardando Coleta</option>
              <option value="Em Análise">Em Análise</option>
              <option value="Finalizado">Finalizado</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Resultado</label>
            <input
              type="text"
              value={editResult}
              onChange={(e) => setEditResult(e.target.value)}
              placeholder="Ex: Normal, Alterado, ver laudo anexo"
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-medium"
            />
          </div>

          <div className="pt-3 border-t border-[var(--color-border-subtle)] flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingExam(null)}
              className="h-9 px-4 text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="h-9 px-5 text-xs font-bold shadow-xs gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
