import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Plus, Edit2, Trash2, Sliders } from "lucide-react";
import { useData } from "../../../../contexts/DataContext";
import { NovoCampoCRMModal } from "../../../../components/ui/modals/crm/NovoCampoCRMModal";
import { toast } from "sonner";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";

import { HelpTip } from "../../../../components/ui/help-tip";
export function ConfigCRMCampos() {
  const { customLeadFields, setCustomLeadFields } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<any>(null);

  const handleSave = (field: any) => {
    if (editingField) {
      setCustomLeadFields(customLeadFields.map(f => f.id === editingField.id ? { ...field, id: editingField.id } : f));
      toast.success(`Campo "${field.name}" atualizado!`);
    } else {
      const newField = { ...field, id: Math.random().toString(36).substring(2, 9) };
      setCustomLeadFields([...customLeadFields, newField]);
      toast.success(`Campo "${field.name}" criado com sucesso!`);
    }
    setIsModalOpen(false);
    setEditingField(null);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog({
      title: "Excluir campo personalizado",
      description: `Excluir o campo "${name}"? Essa ação não pode ser desfeita.`,
    }))) return;
    setCustomLeadFields(customLeadFields.filter(f => f.id !== id));
    toast.success(`Campo "${name}" removido.`);
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
            Campos Personalizados (CRM) <Sliders className="w-5 h-5 text-[var(--color-primary-blue)]" />
           <HelpTip label="Sobre Campos Personalizados (CRM)">Crie campos extras nos leads, escolha o tipo de cada um (texto, número, data…) e as regras de validação. Assim você guarda as informações específicas do seu negócio.</HelpTip></h1>
        </div>
        <Button
          onClick={() => { setEditingField(null); setIsModalOpen(true); }}
          className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" /> Novo Campo
        </Button>
      </div>

      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <div className="space-y-3">
          {customLeadFields.map((field) => (
            <div 
              key={field.id} 
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl hover:border-[var(--color-border-default)] transition-colors"
            >
              <div className="flex flex-col">
                <span className="font-bold text-xs text-[var(--color-text-primary)]">{field.name}</span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase bg-[var(--color-surface)] px-2 py-0.5 rounded border border-[var(--color-border-subtle)]">
                    Tipo: {field.type}
                  </span>
                  {field.validationRegex && (
                    <span className="text-[10px] text-[var(--color-text-faint)] font-mono italic">
                      Regex: {field.validationRegex}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center">
                <Button
                  variant="outline"
                  size="xs"
                  className="h-8 px-2.5 text-xs font-bold"
                  onClick={() => { setEditingField(field); setIsModalOpen(true); }}
                >
                  <Edit2 className="w-3 h-3 mr-1" /> Editar
                </Button>
                <Button
                  variant="danger"
                  size="xs"
                  className="h-8 px-2.5 text-xs font-bold"
                  onClick={() => handleDelete(field.id, field.name)}
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Excluir
                </Button>
              </div>
            </div>
          ))}
          {customLeadFields.length === 0 && (
            <div className="text-center py-10 text-xs text-[var(--color-text-muted)]">
              Nenhum campo personalizado cadastrado.
            </div>
          )}
        </div>
      </Card>

      <NovoCampoCRMModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialValue={editingField}
        title={editingField ? "Editar Campo" : "Novo Campo"}
        onSave={handleSave}
      />
    </div>
  );
}
