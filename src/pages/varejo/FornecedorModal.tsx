import { useState } from "react";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../../components/ui/modal";
import { Button } from "../../components/ui/button";
import { HelpTip } from "../../components/ui/help-tip";
import { supabase } from "../../lib/supabase";

export interface FornecedorItem {
  id: string;
  razaoSocial: string;
  cnpj: string;
  contato: string;
  telefone: string;
  email: string;
  prazoEntrega: string;
  categorias: string;
}

export function rowToFornecedor(row: any): FornecedorItem {
  return {
    id: row.id,
    razaoSocial: row.razao_social,
    cnpj: row.cnpj || "",
    contato: row.contato || "",
    telefone: row.telefone || "",
    email: row.email || "",
    prazoEntrega: row.prazo_entrega || "",
    categorias: row.categorias || "",
  };
}

const inputCls =
  "w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]";
const labelCls = "text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5";

/**
 * Cadastro de fornecedor. Usado na tela de Fornecedores e dentro da Nova Ordem de Compra (botão "+").
 * Obrigatório: nome e telefone/WhatsApp. O resto é opcional.
 */
export function FornecedorModal({
  isOpen, onClose, tenantId, onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null | undefined;
  onSaved: (f: FornecedorItem) => void;
}) {
  const [razaoSocial, setRazaoSocial] = useState("");
  const [telefone, setTelefone] = useState("");
  const [contato, setContato] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [prazoEntrega, setPrazoEntrega] = useState("");
  const [categorias, setCategorias] = useState("");
  const [salvando, setSalvando] = useState(false);

  const limpar = () => {
    setRazaoSocial(""); setTelefone(""); setContato(""); setCnpj("");
    setEmail(""); setPrazoEntrega(""); setCategorias("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!razaoSocial.trim()) { toast.error("Informe o nome do fornecedor."); return; }
    if (!telefone.trim()) { toast.error("Informe o telefone / WhatsApp do fornecedor."); return; }
    if (!supabase || !tenantId) { toast.error("Sem conexão com o banco de dados."); return; }
    setSalvando(true);
    const { data, error } = await supabase
      .from("varejo_fornecedores")
      .insert({
        tenant_id: tenantId,
        razao_social: razaoSocial.trim(),
        telefone: telefone.trim(),
        contato: contato.trim(),
        cnpj: cnpj.trim(),
        email: email.trim(),
        prazo_entrega: prazoEntrega.trim(),
        categorias: categorias.trim(),
      })
      .select()
      .single();
    setSalvando(false);
    if (error || !data) { toast.error("Erro ao cadastrar fornecedor."); return; }
    toast.success("Fornecedor cadastrado!");
    onSaved(rowToFornecedor(data));
    limpar();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-md"
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            <Truck className="w-4 h-4" />
          </div>
          <h3 className="text-base font-bold text-[var(--color-text-primary)]">
            Novo Fornecedor <HelpTip label="Sobre Novo Fornecedor">Só nome e telefone são obrigatórios. O resto você completa quando quiser.</HelpTip>
          </h3>
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button type="button" variant="outline" onClick={onClose} className="h-9 px-4 text-xs font-semibold">Cancelar</Button>
          <Button type="submit" form="form-fornecedor-modal" disabled={salvando} className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white">
            {salvando ? "Salvando..." : "Salvar Fornecedor"}
          </Button>
        </div>
      }
    >
      <form id="form-fornecedor-modal" onSubmit={handleSubmit} className="space-y-3.5 py-1">
        <div>
          <label className={labelCls}>Nome / Razão Social <span className="text-rose-500">*</span></label>
          <input type="text" required placeholder="Ex: Distribuidora Nacional de Peças" value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Telefone / WhatsApp <span className="text-rose-500">*</span></label>
            <input type="text" required placeholder="(11) 90000-0000" value={telefone} onChange={e => setTelefone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Nome do Contato</label>
            <input type="text" placeholder="Quem atende" value={contato} onChange={e => setContato(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>CNPJ</label>
            <input type="text" placeholder="00.000.000/0001-00" value={cnpj} onChange={e => setCnpj(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>E-mail Comercial</label>
            <input type="email" placeholder="pedidos@empresa.com" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Prazo de Entrega</label>
            <input type="text" placeholder="Ex: 3 dias úteis" value={prazoEntrega} onChange={e => setPrazoEntrega(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Linhas / Categorias</label>
            <input type="text" placeholder="Ex: Acessórios, Cabos" value={categorias} onChange={e => setCategorias(e.target.value)} className={inputCls} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
