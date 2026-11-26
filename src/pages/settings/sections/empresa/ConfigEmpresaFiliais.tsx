import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Plus, Store, Trash2, MapPin, Building2 } from "lucide-react";
import { NovaFilialModal } from "../../../../components/ui/modals/settings/NovaFilialModal";
import { toast } from "sonner";
import { useData } from "../../../../contexts/DataContext";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";

import { HelpTip } from "../../../../components/ui/help-tip";
import { AbasPagina } from "../../../../components/ui/abas-pagina";
interface Filial {
  id: string;
  nome: string;
  cnpj: string;
  cidade: string;
  estado: string;
  status: "Principal" | "Filial" | "Cliente";
}

export function ConfigEmpresaFiliais() {
  const { empresaFiliais: filiais, addEmpresaFilial, deleteEmpresaFilial } = useData();
  const [novo, setNovo] = useState<"filial" | "cliente" | null>(null);
  const [aba, setAba] = useState<"todos" | "filiais" | "clientes">("todos");
  const clientes = (filiais as Filial[]).filter((f) => f.status === "Cliente");
  const unidades = (filiais as Filial[]).filter((f) => f.status !== "Cliente");
  const visiveis: Filial[] = aba === "clientes" ? clientes : aba === "filiais" ? unidades : (filiais as Filial[]);

  const handleCreateFilial = (data: any) => {
    // Sem CNPJ/cidade/estado fictícios — um valor "parecendo real" (fake CNPJ
    // ou "São Paulo" fixo) num cadastro de filial é pior que deixar em branco.
    addEmpresaFilial({
      nome: data.nome,
      cnpj: data.cnpj || "",
      cidade: data.cidade || "",
      estado: data.estado || "",
      // Cliente atendido (agência, contabilidade, BPO) usa a mesma estrutura de unidade: dados separados e filtráveis.
      status: novo === "cliente" ? "Cliente" : (filiais as Filial[]).some((f) => f.status === "Principal") ? "Filial" : "Principal",
    });
    toast.success(`${novo === "cliente" ? "Cliente" : "Filial"} "${data.nome}" cadastrad${novo === "cliente" ? "o" : "a"} com sucesso!`);
    setNovo(null);
  };

  const handleDeleteFilial = async (id: string, nome: string) => {
    if (!(await confirmDialog({
      title: "Excluir cadastro",
      description: `Excluir "${nome}"? Essa ação não pode ser desfeita. Os registros ligados a ele deixam de aparecer no filtro dele.`,
    }))) return;
    deleteEmpresaFilial(id);
    toast.success(`"${nome}" removido.`);
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
            Filiais e clientes <Store className="w-5 h-5 text-[var(--color-primary-blue)]" />
           <HelpTip label="Sobre Filiais e clientes">Cadastre as unidades da empresa e, se você atende outras empresas (agência de marketing, contabilidade, BPO), os seus clientes. No seletor da barra lateral, a visão consolidada mostra tudo; escolher uma filial ou um cliente mostra só os dados dele, e o que for criado ali fica ligado a ele.</HelpTip></h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setNovo("filial")} className="h-9 px-4 text-xs font-bold gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova filial</Button>
          <Button onClick={() => setNovo("cliente")} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"><Plus className="w-3.5 h-3.5" /> Novo cliente</Button>
        </div>
      </div>

      {filiais.length > 0 && (
        <AbasPagina<"todos" | "filiais" | "clientes">
          value={aba}
          onChange={setAba}
          abas={[{ id: "todos", label: "Todos", badge: filiais.length }, { id: "filiais", label: "Filiais", badge: unidades.length }, { id: "clientes", label: "Clientes", badge: clientes.length }]}
        />
      )}

      {visiveis.length === 0 ? (
        <Card className="p-12 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)]">
            <Store className="w-6 h-6" />
          </div>
          <p className="text-[var(--color-text-primary)] font-bold text-sm">{aba === "clientes" ? "Nenhum cliente cadastrado ainda." : "Nenhuma filial ou cliente cadastrado ainda."}</p>
          <p className="text-[var(--color-text-muted)] text-xs">Adicione a matriz, as unidades da empresa ou os clientes que você atende.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {visiveis.map((filial) => (
            <Card key={filial.id} className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[var(--color-text-primary)]">{filial.nome}</h4>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5 flex items-center gap-3 flex-wrap">
                    {filial.cnpj && <span className="font-mono">CNPJ: {filial.cnpj}</span>}
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
                  title="Remover"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NovaFilialModal
        isOpen={novo !== null}
        tipo={novo ?? "filial"}
        onClose={() => setNovo(null)}
        onSave={handleCreateFilial}
      />
    </div>
  );
}
