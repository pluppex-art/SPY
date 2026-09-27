import { useEffect, useState } from "react";
import { Users, Star, Trash2, Plus, Mail, Phone, Briefcase, MessageCircle, FileText, Tag } from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import { Badge } from "../../badge";
import { supabase } from "../../../../lib/supabase";
import { toast } from "sonner";
import { confirmDialog } from "../../confirm-dialog";
import { friendlyError } from "../../../../lib/friendlyError";

interface ClienteContato {
  id: string;
  cliente_id: string;
  nome: string;
  cargo: string | null;
  departamento?: string | null;
  papel_decisao?: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp?: string | null;
  observacoes?: string | null;
  principal: boolean;
}

interface ClienteContatosModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteId: string | null;
  clienteNome?: string;
}

const inputClass =
  "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all placeholder:text-slate-600";

const PAPEIS_DECISAO = [
  "Decisor Econômico (C-Level/Diretoria)",
  "Avaliador Técnico / TI",
  "Gerente Operacional",
  "Usuário-Chave",
  "Influenciador",
  "Ponto de Contato",
];

const EMPTY_FORM = {
  nome: "",
  cargo: "",
  departamento: "",
  papel_decisao: "",
  email: "",
  telefone: "",
  whatsapp: "",
  observacoes: "",
};

export function ClienteContatosModal({ isOpen, onClose, clienteId, clienteNome }: ClienteContatosModalProps) {
  const [contatos, setContatos] = useState<ClienteContato[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!isOpen || !clienteId || !supabase) return;
    setLoading(true);
    supabase
      .from("cliente_contatos")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        setLoading(false);
        if (error) toast.error(`Erro ao carregar contatos: ${friendlyError(error)}`);
        else setContatos(data || []);
      });
    setForm(EMPTY_FORM);
  }, [isOpen, clienteId]);

  const handleAdd = async () => {
    if (!clienteId || !supabase) return;
    if (!form.nome.trim()) { toast.error("Nome do contato é obrigatório."); return; }
    
    const payload: any = {
      cliente_id: clienteId,
      nome: form.nome.trim(),
      cargo: form.cargo.trim() || null,
      departamento: form.departamento.trim() || null,
      papel_decisao: form.papel_decisao || null,
      email: form.email.trim() || null,
      telefone: form.telefone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      observacoes: form.observacoes.trim() || null,
      principal: contatos.length === 0,
    };

    const { data, error } = await supabase
      .from("cliente_contatos")
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) { 
      toast.error(`Erro ao adicionar contato: ${friendlyError(error)}`); 
      return; 
    }
    if (data) setContatos(prev => [...prev, data]);
    setForm(EMPTY_FORM);
    toast.success("Contato e decisor adicionado com sucesso!");
  };

  const handleSetPrincipal = async (id: string) => {
    if (!supabase || !clienteId) return;
    const { error: e1 } = await supabase.from("cliente_contatos").update({ principal: false }).eq("cliente_id", clienteId);
    const { error: e2 } = await supabase.from("cliente_contatos").update({ principal: true }).eq("id", id);
    if (e1 || e2) { toast.error("Erro ao definir contato principal."); return; }
    setContatos(prev => prev.map(c => ({ ...c, principal: c.id === id })));
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!supabase) return;
    if (!(await confirmDialog({
      title: "Remover contato",
      description: `Remover "${nome}" dos contatos deste cliente?`,
    }))) return;
    const { error } = await supabase.from("cliente_contatos").delete().eq("id", id);
    if (error) { toast.error(`Erro ao remover contato: ${friendlyError(error)}`); return; }
    setContatos(prev => prev.filter(c => c.id !== id));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-[480px]"
      position="right"
      overlay="light"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-base font-black text-white">Contatos, Decisores & Stakeholders</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              {clienteNome || "Cliente"}
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {loading ? (
          <p className="text-xs text-slate-500">Carregando contatos...</p>
        ) : contatos.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhum contato cadastrado ainda. Adicione decisores e pontos de contato abaixo.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {contatos.map(c => (
              <div key={c.id} className="p-3 bg-white/[0.03] border border-white/5 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{c.nome}</span>
                    {c.principal && (
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">Principal</span>
                    )}
                    {c.papel_decisao && (
                      <Badge variant="neutral" className="text-[9px] py-0 px-1.5">
                        {c.papel_decisao}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!c.principal && (
                      <button onClick={() => handleSetPrincipal(c.id)} title="Definir como contato principal" className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/25 transition-colors">
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => handleDelete(c.id, c.nome)} title="Remover contato" className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/25 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  {c.cargo && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3 text-slate-500" />{c.cargo}</span>}
                  {c.departamento && <span className="flex items-center gap-1"><Tag className="w-3 h-3 text-slate-500" />{c.departamento}</span>}
                  {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-slate-500" />{c.email}</span>}
                  {c.telefone && <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-500" />{c.telefone}</span>}
                  {c.whatsapp && <span className="flex items-center gap-1 text-emerald-400"><MessageCircle className="w-3 h-3" />{c.whatsapp}</span>}
                </div>

                {c.observacoes && (
                  <p className="text-[10px] text-slate-500 italic bg-white/[0.02] p-1.5 rounded-lg border border-white/5">
                    "{c.observacoes}"
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="pt-4 border-t border-white/10 space-y-2.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Adicionar novo contato ou decisor</p>
          <div className="grid grid-cols-2 gap-2.5">
            <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do Contato *" className={inputClass} />
            <input value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} placeholder="Cargo (ex: Diretor de Operações)" className={inputClass} />
            <input value={form.departamento} onChange={e => setForm(f => ({ ...f, departamento: e.target.value }))} placeholder="Departamento (ex: Financeiro, TI)" className={inputClass} />
            <select 
              value={form.papel_decisao} 
              onChange={e => setForm(f => ({ ...f, papel_decisao: e.target.value }))} 
              className={inputClass}
            >
              <option value="">Papel na Decisão (Selecione)</option>
              {PAPEIS_DECISAO.map((p) => (
                <option key={p} value={p} className="bg-slate-900 text-white">{p}</option>
              ))}
            </select>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="E-mail Corporativo" type="email" className={inputClass} />
            <input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="Telefone / Ramal" className={inputClass} />
            <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="WhatsApp Direto" className={inputClass} />
            <input value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Observações de perfil / negociação" className={inputClass} />
          </div>
          <Button onClick={handleAdd} className="w-full h-9 text-[10px] font-black uppercase tracking-widest gap-1.5 shadow-sm">
            <Plus className="w-3.5 h-3.5" /> Adicionar Contato / Decisor
          </Button>
        </div>
      </div>
    </Modal>
  );
}
