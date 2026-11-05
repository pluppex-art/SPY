import { useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useAuth } from "../../../../contexts/AuthContext";
import { CARGOS_PADRAO, NIVEIS_CARGO, cargosPadraoFaltantes } from "../../../../lib/cargosPadrao";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Plus, Briefcase, Pencil, Trash2, LibraryBig } from "lucide-react";
import { useData } from "../../../../contexts/DataContext";
import { toast } from "sonner";
import { CargoModal } from "./CargoModal";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";

const NIVEL_COLORS: Record<string, string> = {
  "Estratégico": "text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/20",
  "Tático": "text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]",
  "Operacional": "text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]",
};

type CargoFormData = { nome: string; nivel: string; descricao: string; restringir_aos_proprios_dados: boolean };

export function ConfigEmpresaCargos() {
  const { cargos, addCargo, updateCargo, deleteCargo } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCargo, setEditingCargo] = useState<any | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const { activeTenantId } = useAuth() as any;

  // Adiciona o catálogo padrão (com nível, páginas sugeridas e escopo de dados), sem duplicar nem
  // criar cargo com o nome de um login em uso (isso restringiria a pessoa sem querer).
  const handleAdicionarPadrao = async () => {
    let rolesEmUso: string[] = [];
    if (supabase && activeTenantId) {
      const { data } = await supabase.from("users").select("role").eq("tenant_id", activeTenantId).is("deleted_at", null);
      rolesEmUso = (data || []).map((u: any) => String(u.role ?? ""));
    }
    const { faltantes, pulados } = cargosPadraoFaltantes((cargos as any[]).map((x) => x.nome), rolesEmUso);
    if (faltantes.length === 0) { toast.info("Todos os cargos padrão já existem."); return; }
    if (!(await confirmDialog({
      title: "Adicionar cargos padrão",
      description: `Serão criados ${faltantes.length} cargos (Estratégico, Tático e Operacional), já com as páginas sugeridas. Cargos que já existem não são alterados${pulados.length ? ` e ${pulados.length} foram pulados por coincidirem com um perfil de login em uso` : ""}. Ninguém muda de acesso até você atribuir o cargo a uma pessoa.`,
    }))) return;
    setAdicionando(true);
    for (const cargo of faltantes) {
      await addCargo({ nome: cargo.nome, nivel: cargo.nivel, descricao: cargo.descricao, restringir_aos_proprios_dados: cargo.restringir_aos_proprios_dados, modulos: cargo.modulos });
    }
    setAdicionando(false);
    toast.success(`${faltantes.length} cargos padrão adicionados.`);
  };

  const handleSave = (data: CargoFormData) => {
    if (editingCargo) {
      updateCargo(editingCargo.id, { nome: data.nome, nivel: data.nivel, descricao: data.descricao, restringir_aos_proprios_dados: data.restringir_aos_proprios_dados });
      toast.success(`Cargo "${data.nome}" atualizado!`);
    } else {
      addCargo({ nome: data.nome, nivel: data.nivel, descricao: data.descricao, restringir_aos_proprios_dados: data.restringir_aos_proprios_dados, modulos: [] });
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
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={handleAdicionarPadrao} disabled={adicionando} className="h-9 px-4 text-xs font-bold gap-1.5" title={`Adiciona até ${CARGOS_PADRAO.length} cargos prontos, com nível e páginas sugeridas`}>
            <LibraryBig className="w-3.5 h-3.5" /> {adicionando ? "Adicionando..." : "Adicionar cargos padrão"}
          </Button>
          <Button 
            onClick={() => { setEditingCargo(null); setIsModalOpen(true); }} 
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Cargo
          </Button>
        </div>
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
        <div className="space-y-6">
          {[...NIVEIS_CARGO, "__outros"].map((nivelGrupo) => {
            const doGrupo = (cargos as any[]).filter((c) => (NIVEIS_CARGO as string[]).includes(c.nivel) ? c.nivel === nivelGrupo : nivelGrupo === "__outros");
            if (doGrupo.length === 0) return null;
            return (
              <section key={nivelGrupo} className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-faint)]">
                  {nivelGrupo === "__outros" ? "Sem nível definido" : `Nível ${nivelGrupo}`} <span className="font-bold normal-case tracking-normal">({doGrupo.length})</span>
                </h2>
                <div className="grid gap-3">
          {doGrupo.map((cargo) => {
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
                    {cargo.descricao && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 break-words">{cargo.descricao}</p>}
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
              </section>
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
