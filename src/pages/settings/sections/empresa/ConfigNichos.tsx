import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Plus, Tag, Trash2, Globe } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";

export function ConfigNichos() {
  const { nichos, addNicho, updateNicho, deleteNicho } = useData();
  const { activeTenantId } = useAuth();
  const [novoNicho, setNovoNicho] = useState("");
  const [saving, setSaving] = useState(false);

  // Nichos globais (tenant_id null) são administrados pela plataforma — o tenant
  // só vê e gerencia os próprios; a RLS (nichos_write) já bloqueia escrita em
  // globais para quem não é super admin, então nem oferecemos editar/excluir aqui.
  const nichosDoTenant = nichos.filter((n: any) => n.tenant_id === activeTenantId);
  const nichosGlobais = nichos.filter((n: any) => n.tenant_id === null);

  const handleCreate = async () => {
    const nome = novoNicho.trim();
    if (!nome) return;
    if (nichosDoTenant.some((n: any) => n.nome.toLowerCase() === nome.toLowerCase())) {
      toast.error("Já existe um nicho com esse nome.");
      return;
    }
    setSaving(true);
    await addNicho({ nome, ativo: true });
    setSaving(false);
    setNovoNicho("");
    toast.success(`Nicho "${nome}" cadastrado.`);
  };

  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    await updateNicho(id, { ativo: !ativo });
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!(await confirmDialog({
      title: "Excluir nicho",
      description: `Excluir o nicho "${nome}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const ok = await deleteNicho(id);
    if (ok) toast.success(`Nicho "${nome}" removido.`);
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          Nichos <Tag className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Segmentos de negócio da sua empresa, usados para classificar leads e clientes. Cada empresa tem seus próprios nichos.
        </p>
      </div>

      <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex items-center gap-3">
        <Input
          value={novoNicho}
          onChange={(e) => setNovoNicho(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          placeholder="Nome do nicho (ex.: Energia Solar, Imobiliário...)"
          className="flex-1"
        />
        <Button onClick={handleCreate} disabled={saving || !novoNicho.trim()} className="h-9 px-4 text-xs font-bold gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </Button>
      </Card>

      {nichosDoTenant.length === 0 ? (
        <Card className="p-12 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)]">
            <Tag className="w-6 h-6" />
          </div>
          <p className="text-[var(--color-text-primary)] font-bold text-sm">Nenhum nicho cadastrado ainda.</p>
          <p className="text-[var(--color-text-muted)] text-xs">Adicione os segmentos de negócio que sua empresa atende.</p>
        </Card>
      ) : (
        <div className="grid gap-2">
          {nichosDoTenant.map((nicho: any) => (
            <Card key={nicho.id} className="p-3.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
                  <Tag className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-[var(--color-text-primary)]">{nicho.nome}</h4>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggleAtivo(nicho.id, nicho.ativo)}
                  className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md border transition-colors ${nicho.ativo ? "bg-success/10 text-success border-success/20" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)] border-[var(--color-border-default)]"}`}
                  title="Alternar ativo/inativo"
                >
                  {nicho.ativo ? "Ativo" : "Inativo"}
                </button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleDelete(nicho.id, nicho.nome)}
                  className="h-8 w-8 p-0 text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10"
                  title="Remover nicho"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {nichosGlobais.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Nichos globais da plataforma
          </p>
          <div className="grid gap-2">
            {nichosGlobais.map((nicho: any) => (
              <Card key={nicho.id} className="p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center gap-3 opacity-80">
                <Globe className="w-3.5 h-3.5 text-[var(--color-text-faint)] shrink-0" />
                <span className="text-sm text-[var(--color-text-muted)]">{nicho.nome}</span>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
