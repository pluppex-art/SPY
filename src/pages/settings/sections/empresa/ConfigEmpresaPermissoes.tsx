import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Plus, ShieldCheck, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { useData } from "../../../../contexts/DataContext";
import { toast } from "sonner";
import { PermissaoModal } from "./PermissaoModal";
import { ALL_MODULES } from "./ModulesCombobox";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM & Pipeline", financeiro: "Financeiro", engajamento: "Engajamento",
  marketing: "Marketing", educacao: "Educação", clinica: "Clínica",
  rh: "RH & Equipe", bi: "BI & Dashboards", produtividade: "Tarefas", catalogo: "Catálogo", dev: "Dev",
};

const NIVEL_COLORS: Record<string, string> = {
  "Estratégico": "text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/20",
  "Tático": "text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]",
  "Operacional": "text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]",
};

export function ConfigEmpresaPermissoes() {
  const { cargos, updateCargo } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCargo, setEditingCargo] = useState<any | null>(null);

  const comPermissao = cargos.filter((c) => Array.isArray(c.modulos) && c.modulos.length > 0);

  const handleSave = (cargoId: string, modulos: string[]) => {
    updateCargo(cargoId, { modulos });
    const cargo = cargos.find((c) => c.id === cargoId);
    toast.success(`Permissões de "${cargo?.nome}" salvas com sucesso!`);
    setIsModalOpen(false);
  };

  const handleRemovePermissoes = async (cargo: any) => {
    if (!(await confirmDialog({
      title: "Remover permissões",
      description: `Remover todas as permissões de "${cargo.nome}"? O cargo perderá acesso a todos os módulos liberados.`,
    }))) return;
    updateCargo(cargo.id, { modulos: [] });
    toast.success(`Permissões de "${cargo.nome}" resetadas.`);
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
            Perfis & Permissões <ShieldCheck className="w-5 h-5 text-[var(--color-primary-blue)]" />
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">Configure quais módulos e recursos cada cargo tem permissão para acessar.</p>
        </div>
        <Button
          onClick={() => { setEditingCargo(null); setIsModalOpen(true); }}
          className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          disabled={cargos.length === 0}
        >
          <Plus className="w-3.5 h-3.5" /> Configurar Permissão
        </Button>
      </div>

      {cargos.length === 0 || comPermissao.length === 0 ? (
        <Card className="p-12 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-[var(--color-text-primary)] font-bold text-sm">
            {cargos.length === 0 ? "Nenhum cargo cadastrado ainda." : "Nenhuma permissão específica configurada."}
          </p>
          <p className="text-[var(--color-text-muted)] text-xs">
            {cargos.length === 0 ? "Cadastre os cargos da sua equipe para liberar acessos." : "Clique no botão acima para definir os módulos liberados por cargo."}
          </p>
          {cargos.length === 0 && (
            <Button 
              onClick={() => window.location.href = "/app/configuracoes/empresa/cargos"} 
              variant="outline" 
              className="mt-2 h-9 px-4 text-xs font-bold text-[var(--color-primary-blue)] border-[var(--color-border-default)]"
            >
              Cadastrar primeiro cargo →
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-3">
          {comPermissao.map((cargo) => {
            const nivelClass = NIVEL_COLORS[cargo.nivel as string] ?? NIVEL_COLORS["Operacional"];
            const modulos = cargo.modulos as string[];
            return (
              <Card key={cargo.id} className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-bold text-[var(--color-text-primary)] text-sm">{cargo.nome}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${nivelClass}`}>
                      {cargo.nivel || "Operacional"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {modulos.map((mod) => (
                      <span key={mod} className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/20 flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        {MODULE_LABELS[mod] || ALL_MODULES.find((m) => m.id === mod)?.label || mod}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button 
                    variant="outline" 
                    size="xs" 
                    onClick={() => { setEditingCargo(cargo); setIsModalOpen(true); }} 
                    className="h-8 px-3 text-xs font-bold border-[var(--color-border-default)]"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleRemovePermissoes(cargo)}
                    className="h-8 w-8 p-0 text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10"
                    title="Remover permissões"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <PermissaoModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingCargo(null); }}
        editing={editingCargo}
        cargos={cargos}
        onSave={handleSave}
      />
    </div>
  );
}
