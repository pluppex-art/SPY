import { useState, useEffect } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Plus, ExternalLink } from "lucide-react";
import { NovoCampoCRMModal } from "../../../../components/ui/modals/crm/NovoCampoCRMModal";
import { useData } from "../../../../contexts/DataContext";

import { HelpTip } from "../../../../components/ui/help-tip";
const SETTING_KEY = "crm_produto_campos_personalizados";

export function ConfigCRMProdutos() {
  const { appSettings, saveAppSetting } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<any | null>(null);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    const saved = appSettings?.[SETTING_KEY];
    if (saved) { setCustomFields(saved); setHydrated(true); }
  }, [appSettings, hydrated]);

  const persistFields = (fields: any[]) => {
    setCustomFields(fields);
    setHydrated(true);
    saveAppSetting(SETTING_KEY, fields);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">Catálogo de Produtos <HelpTip label="Sobre Catálogo de Produtos">Personalize os dados de produtos e serviços.</HelpTip></h1>
        </div>
      </div>

      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <h3 className="font-bold text-base text-[var(--color-text-primary)] mb-2">Acesso ao Catálogo <HelpTip label="Sobre Acesso ao Catálogo">O catálogo principal foi movido para o menu lateral. Acesse "Produtos" na barra de navegação esquerda.</HelpTip></h3>
        <Button 
          onClick={() => window.location.href = '/app/produtos'} 
          variant="outline"
          className="h-9 px-4 text-xs font-bold gap-2 text-[var(--color-text-primary)] border-[var(--color-border-default)] hover:bg-[var(--color-surface-sunken)]"
        >
          Ir para Produtos <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </Card>

      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-bold text-base text-[var(--color-text-primary)]">Campos Personalizados <HelpTip label="Sobre Campos Personalizados">Adicione mais detalhes aos produtos (SKU, dimensões, atributos específicos).</HelpTip></h3>
          </div>
          <Button
            onClick={() => { setEditingField(null); setIsModalOpen(true); }}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Campo
          </Button>
        </div>

        <div className="space-y-3">
          {customFields.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] italic">Nenhum campo personalizado cadastrado.</p>
          ) : (
            customFields.map((field) => (
              <div key={field.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)]">
                <div className="flex flex-col">
                  <span className="font-bold text-sm text-[var(--color-text-primary)]">{field.name}</span>
                  <span className="text-xs text-[var(--color-text-faint)] font-mono mt-0.5">Tipo: {field.type}</span>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => { setEditingField(field); setIsModalOpen(true); }}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  Editar
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <NovoCampoCRMModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingField(null); }}
        title={editingField ? "Editar Campo" : "Novo Campo Personalizado"}
        initialValue={editingField}
        onSave={(data) => {
          if (editingField) {
            persistFields(customFields.map((f) => (f.id === editingField.id ? { ...f, ...data } : f)));
          } else {
            persistFields([...customFields, { id: Date.now().toString(), ...data }]);
          }
          setIsModalOpen(false);
          setEditingField(null);
        }}
      />
    </div>
  );
}
