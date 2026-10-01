import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Plus, Store, Trash2, MapPin, Building2 } from "lucide-react";
import { NovaFilialModal } from "../../../../components/ui/modals/settings/NovaFilialModal";
import { toast } from "sonner";
import { useData } from "../../../../contexts/DataContext";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";

interface Filial {
  id: string;
  nome: string;
  cnpj: string;
  cidade: string;
  estado: string;
  status: "Principal" | "Filial";
}

export function ConfigEmpresaFiliais() {
  const { empresaFiliais: filiais, addEmpresaFilial, deleteEmpresaFilial } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreateFilial = (data: any) => {
    // Sem CNPJ/cidade/estado fictícios — um valor "parecendo real" (fake CNPJ
    // ou "São Paulo" fixo) num cadastro de filial é pior que deixar em branco.
    addEmpresaFilial({
      nome: data.nome,
      cnpj: data.cnpj || "",
      cidade: data.cidade || "",
      estado: data.estado || "",
      status: filiais.length === 0 ? "Principal" : "Filial",
    });
    toast.success(`Filial "${data.nome}" cadastrada com sucesso!`);
    setIsModalOpen(false);
  };

  const handleDeleteFilial = async (id: string, nome: string) => {
    if (!(await confirmDialog({
      title: "Excluir filial",
      description: `Excluir a filial "${nome}"? Essa ação não pode ser desfeita.`,
    }))) return;
    deleteEmpresaFilial(id);
    toast.success(`Filial "${nome}" removida.`);
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
            Filiais & Unidades <Store className="w-5 h-5 text-[var(--color-primary-blue)]" />
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">Cadastre e gerencie filiais, franquias e unidades da sua empresa.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
          <Plus className="w-3.5 h-3.5" /> Nova Filial
        </Button>
      </div>

      {filiais.length === 0 ? (
        <Card className="p-12 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)]">
            <Store className="w-6 h-6" />
          </div>
          <p className="text-[var(--color-text-primary)] font-bold text-sm">Nenhuma filial cadastrada ainda.</p>
          <p className="text-[var(--color-text-muted)] text-xs">Adicione a matriz ou unidades regionais da sua empresa.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filiais.map((filial) => (
            <Card key={filial.id} className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[var(--color-text-primary)]">{filial.nome}</h4>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5 flex items-center gap-3 flex-wrap">
                    <span className="font-mono">CNPJ: {filial.cnpj}</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[var(--color-text-faint)]" />
                      {filial.cidade && filial.estado ? `${filial.cidade} - ${filial.estado}` : (filial.cidade || filial.estado || "Não informado")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${filial.status === "Principal" ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/20" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>
                  {filial.status}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleDeleteFilial(filial.id, filial.nome)}
                  className="h-8 w-8 p-0 text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10"
                  title="Remover filial"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NovaFilialModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreateFilial}
      />
    </div>
  );
}
