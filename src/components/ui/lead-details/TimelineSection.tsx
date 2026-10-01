import React from "react";
import { Card } from "../card";
import { Button } from "../button";
import { Input } from "../input";
import { FormField } from "../form-field";
import { EmptyState } from "../empty-state";
import { Paperclip, FileText, Phone, Mail, Calendar, MessageSquare } from "lucide-react";
import { toast } from "sonner";

interface TimelineSectionProps {
  lead: any;
  leadActivities: any[];
  activityType: 'Ligação' | 'E-mail' | 'Reunião' | 'Outro';
  setActivityType: (val: any) => void;
  activityTitle: string;
  setActivityTitle: (val: string) => void;
  activityDate: string;
  setActivityDate: (val: string) => void;
  activityTime: string;
  setActivityTime: (val: string) => void;
  activityDesc: string;
  setActivityDesc: (val: string) => void;
  activityError: string;
  setActivityError: (val: string) => void;
  selectedFiles: { name: string; size: string; }[];
  setSelectedFiles: React.Dispatch<React.SetStateAction<{ name: string; size: string; }[]>>;
  handleRegisterActivity: () => void;
  seller: string;
}

export function TimelineSection({
  lead,
  leadActivities,
  activityType,
  setActivityType,
  activityTitle,
  setActivityTitle,
  activityDate,
  setActivityDate,
  activityTime,
  setActivityTime,
  activityDesc,
  setActivityDesc,
  activityError,
  setActivityError,
  selectedFiles,
  setSelectedFiles,
  handleRegisterActivity,
}: TimelineSectionProps) {
  return (
    <div className="px-5 py-4 space-y-5">
      {/* Form for Adding Interaction */}
      <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)]">
            Registrar Nova Interação
          </h4>
        </div>

        {/* Channel selectors */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { type: 'Ligação', label: 'Ligação', icon: Phone },
            { type: 'E-mail', label: 'E-mail', icon: Mail },
            { type: 'Reunião', label: 'Reunião', icon: Calendar },
            { type: 'Outro', label: 'Nota Interna', icon: MessageSquare }
          ].map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => setActivityType(item.type as any)}
              className={`py-2 px-1 text-[10px] font-bold rounded-[var(--radius-control)] border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                activityType === item.type 
                  ? 'bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)] font-black' 
                  : 'bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <item.icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Custom fields (Title & datetime) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Título da Atividade" required>
            <Input
              type="text" 
              placeholder="Ex: Follow-up sobre proposta..."
              value={activityTitle}
              onChange={(e) => setActivityTitle(e.target.value)}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Data">
              <Input
                type="date"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
                className="font-mono text-xs"
              />
            </FormField>
            <FormField label="Hora">
              <Input
                type="time"
                value={activityTime}
                onChange={(e) => setActivityTime(e.target.value)}
                className="font-mono text-xs"
              />
            </FormField>
          </div>
        </div>

        {/* Descriptive textarea */}
        <FormField label="Detalhamento do Contato" error={activityError || undefined}>
          <textarea 
            placeholder="Relate o que foi alinhado com o cliente..."
            value={activityDesc}
            rows={2}
            onChange={(e) => {
              setActivityDesc(e.target.value);
              if (e.target.value) setActivityError('');
            }}
            className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] p-3 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all resize-none"
          />
        </FormField>

        {/* File Simulator Uploader */}
        <div
          className="border border-dashed border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/50 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] p-3 text-center cursor-pointer transition-colors"
          onClick={() => {
            const demoDocs = [
              { name: "Proposta_Plano_SPYEnterprise.pdf", size: "380 KB" },
              { name: "Orcamento_GTech.xlsx", size: "120 KB" },
              { name: "Cronograma_Execucao.docx", size: "450 KB" }
            ];
            const randomPick = demoDocs[Math.floor(Math.random() * demoDocs.length)];
            if (!selectedFiles.some(f => f.name === randomPick.name)) {
              setSelectedFiles(prev => [...prev, randomPick]);
              toast.success(`Anexo vinculado: ${randomPick.name}`);
            }
          }}
        >
          <Paperclip className="w-4 h-4 mx-auto text-[var(--color-text-faint)] mb-1" />
          <p className="text-xs font-bold text-[var(--color-text-primary)]">Anexar Documento</p>
          <p className="text-[10px] text-[var(--color-text-faint)]">Clique para simular anexo de proposta ou contrato (PDF / Excel)</p>
        </div>

        {/* Attachment pills if exists */}
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {selectedFiles.map((file, idx) => (
              <span key={idx} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-2.5 py-1 text-[11px] font-mono text-[var(--color-primary-blue)] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                {file.name} ({file.size})
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
                  }}
                  className="hover:text-danger font-bold ml-1 text-xs cursor-pointer"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button onClick={handleRegisterActivity} className="text-xs font-bold">
            Registrar Interação
          </Button>
        </div>
      </Card>

      {/* Main Activity Timeline */}
      <div className="space-y-3">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
          Histórico Completo de Interações
        </h4>
        <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
          {leadActivities.filter(act => act.leadId === lead.id).length > 0 ? (
            leadActivities.filter(act => act.leadId === lead.id).map((act) => {
              const getIcon = () => {
                const iconClass = "w-4 h-4 text-[var(--color-primary-blue)]";
                switch (act.type) {
                  case 'Ligação': return <Phone className={iconClass} />;
                  case 'E-mail': return <Mail className={iconClass} />;
                  case 'Reunião': return <Calendar className={iconClass} />;
                  default: return <MessageSquare className={iconClass} />;
                }
              };

              return (
                <Card key={act.id} className="p-3.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex gap-3.5">
                  <div className="w-9 h-9 bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 rounded-xl flex items-center justify-center shrink-0">
                    {getIcon()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-[var(--color-text-primary)]">{act.title}</p>
                      <span className="text-[10px] text-[var(--color-text-faint)] font-mono">{act.date}</span>
                    </div>
                    <p className="text-[10px] font-bold text-[var(--color-primary-blue)] uppercase mt-0.5">{act.seller || 'Consultor'}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1.5 bg-[var(--color-surface-sunken)] p-2.5 rounded-[var(--radius-control)] leading-relaxed border border-[var(--color-border-subtle)]">
                      {act.description}
                    </p>
                    
                    {act.files && act.files.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--color-border-subtle)] pt-1.5">
                        {act.files.map((file: any, fIdx: number) => (
                          <span key={fIdx} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-2 py-0.5 rounded text-[10px] font-mono text-[var(--color-text-muted)] flex items-center gap-1">
                            <FileText className="w-3 h-3 text-[var(--color-primary-blue)]" />
                            {file.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="Nenhuma atividade registrada"
              description="Registre ligações, reuniões ou notas no formulário acima."
              className="py-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
