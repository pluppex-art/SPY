import React from "react";
import { X, PlusCircle } from "lucide-react";

interface AddActivityDialogProps {
  showAddActivityModal: boolean;
  setShowAddActivityModal: (show: boolean) => void;
  matchingLead: any;
  newActivityType: 'Ligação' | 'E-mail' | 'Reunião' | 'Outro';
  setNewActivityType: (type: 'Ligação' | 'E-mail' | 'Reunião' | 'Outro') => void;
  newActivityTitle: string;
  setNewActivityTitle: (val: string) => void;
  newActivityDesc: string;
  setNewActivityDesc: (val: string) => void;
  handleCreateActivity: (matchingLeadId: string) => void;
}

export function AddActivityDialog({
  showAddActivityModal,
  setShowAddActivityModal,
  matchingLead,
  newActivityType,
  setNewActivityType,
  newActivityTitle,
  setNewActivityTitle,
  newActivityDesc,
  setNewActivityDesc,
  handleCreateActivity
}: AddActivityDialogProps) {
  if (!showAddActivityModal || !matchingLead) return null;

  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl relative animate-in zoom-in-95 duration-200">
        <button 
          onClick={() => setShowAddActivityModal(false)}
          className="absolute top-4 right-4 p-1.5 bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-sunken)] rounded-full text-[var(--color-text-muted)] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h3 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-[#10B981]" />
            Registrar Atividade no CRM
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Adicione uma nova nota, ligação ou reunião diretamente na jornada linear do lead <strong className="text-[var(--color-text-primary)] font-medium">{matchingLead.name}</strong>.
          </p>
        </div>

        <div className="space-y-3.5 text-left">
          <div className="space-y-1">
            <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider block font-bold">Tipo de Interação</label>
            <div className="grid grid-cols-4 gap-2">
              {(['Reunião', 'Ligação', 'E-mail', 'Outro'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewActivityType(t)}
                  className={`py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    newActivityType === t
                      ? 'bg-[#2563EB]/15 border-[#2563EB] text-blue-400'
                      : 'bg-[var(--color-surface)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]'
                  }`}
                >
                  {t === 'Reunião' && '📅 REU'}
                  {t === 'Ligação' && '📞 CALL'}
                  {t === 'E-mail' && '📧 MAIL'}
                  {t === 'Outro' && '✏️ NOTA'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider block font-bold">Título / Resumo curto</label>
            <input
              type="text"
              value={newActivityTitle}
              onChange={(e) => setNewActivityTitle(e.target.value)}
              placeholder="Ex: Alinhamento de SLA comercial"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider block font-bold">Detalhes do Evento</label>
            <textarea
              value={newActivityDesc}
              onChange={(e) => setNewActivityDesc(e.target.value)}
              rows={4}
              placeholder="Escreva anotações detalhadas sobre as decisões tomadas ou a ligação efetuada..."
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-[var(--color-border-default)] flex justify-end gap-3.5 text-xs">
          <button
            type="button"
            onClick={() => setShowAddActivityModal(false)}
            className="px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] font-bold hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleCreateActivity(matchingLead.id)}
            className="px-5 py-2 bg-[#10B981] hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors cursor-pointer"
          >
            Salvar Histórico
          </button>
        </div>
      </div>
    </div>
  );
}
