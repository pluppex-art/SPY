import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Plus, Briefcase, Pencil, Trash2 } from "lucide-react";
import { useData } from "../../../../contexts/DataContext";
import { toast } from "sonner";
import { CargoModal } from "./CargoModal";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";

const NIVEL_COLORS: Record<string, string> = {
  "Estratégico": "text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/20",
  "Tático": "text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]",
  "Operacional": "text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]",
};

type CargoFormData = { nome: string; nivel: string; descricao: string };

export function ConfigEmpresaCargos() {
  const { cargos, addCargo, updateCargo, deleteCargo } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCargo, setEditingCargo] = useState<any | null>(null);

  const handleSave = (data: CargoFormData) => {
    if (editingCargo) {
      updateCargo(editingCargo.id, { nome: data.nome, nivel: data.nivel, descricao: data.descricao });
      toast.success(`Cargo "${data.nome}" atualizado!`);
    } else {
      addCargo({ nome: data.nome, nivel: data.nivel, descricao: data.descricao, modulos: [] });
      toast.success(`Cargo "${data.nome}" cadastrado!`);
    }
    setEditingCargo(null);
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
            Cargos & Estrutura <Briefcase className="w-5 h-5 text-[var(--color-primary-blue)]" />
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">Cadastre e estruture os cargos hierárquicos da empresa.</p>
        </div>
        <Button 
          onClick={() => { setEditingCargo(null); setIsModalOpen(true); }} 
          className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" /> Novo Cargo
        </Button>
      </div>

      {cargos.length === 0 ? (
        <Card className="p-12 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)]">
            <Briefcase className="w-6 h-6" />
          </div>
          <p className="text-[var(--color-text-primary)] font-bold text-sm">Nenhum cargo cadastrado ainda.</p>
          <p className="text-[var(--color-text-muted)] text-xs">Clique em "Novo Cargo" para começar a estruturar sua equipe.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {cargos.map((cargo) => {
            const nivelClass = NIVEL_COLORS[cargo.nivel as string] ?? NIVEL_COLORS["Operacional"];
            return (
              <Card key={cargo.id} className="px-5 py-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[var(--color-text-primary)] text-sm">{cargo.nome}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${nivelClass}`}>
                        {cargo.nivel || "Operacional"}
                      </span>
                    </div>
                    {cargo.descricao && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{cargo.descricao}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button 
                    variant="ghost" 
                    size="xs" 
                    onClick={() => { setEditingCargo(cargo); setIsModalOpen(true); }} 
                    className="h-8 w-8 p-0"
                    title="Editar cargo"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="xs" 
                    onClick={async () => {
                      if (!(await confirmDialog({
                        title: "Excluir cargo",
                        description: `Excluir o cargo "${cargo.nome}"? Essa ação não pode ser desfeita.`,
                      }))) return;
                      deleteCargo(cargo.id);
                      toast.success(`Cargo "${cargo.nome}" removido.`);
                    }}
                    className="h-8 w-8 p-0 text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10"
                    title="Excluir cargo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CargoModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingCargo(null); }}
        editing={editingCargo}
        onSave={handleSave}
      />
    </div>
  );
}
