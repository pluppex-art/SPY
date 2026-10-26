import React, { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import { TeamMember } from "../../../../pages/operative/hooks/useEquipe";
import { useData } from "../../../../contexts/DataContext";

type EditarMembroModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<TeamMember>) => Promise<void>;
  member: TeamMember | null;
  squads: { name: string }[];
};

const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
const inputBaseClass =
  "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all";

export function EditarMembroModal({ isOpen, onClose, onSave, member, squads }: EditarMembroModalProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cargo, setCargo] = useState("");
  const [status, setStatus] = useState("Ativo");
  const [squad, setSquad] = useState("");
  const [metaMensal, setMetaMensal] = useState("");
  const [loading, setLoading] = useState(false);
  const { cargos } = useData();

  useEffect(() => {
    if (!isOpen || !member) return;
    setNome(member.name || "");
    setEmail(member.email || "");
    setPhone(member.phone || "");
    setCargo(member.role || "");
    setStatus(member.status || "Ativo");
    setSquad(member.squad || "");
    setMetaMensal(member.metaMensal ? String(member.metaMensal) : "");
    setLoading(false);
  }, [isOpen, member]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member?.id || loading) return;
    setLoading(true);
    try {
      await onSave(member.id, {
        name: nome.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role: cargo.trim(),
        status,
        squad,
        metaMensal: Number(String(metaMensal).replace(/\./g, "").replace(",", ".")) || 0,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mt-0.5">
            <Pencil className="w-4 h-4 text-blue-400" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-black text-white">Editar Perfil</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              {member?.name || "Colaborador"}
            </div>
          </div>
        </div>
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white" disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" form="editar-membro-form" className="bg-[#2563EB] hover:bg-blue-600 text-white font-bold px-6" disabled={loading || !nome.trim()}>
            {loading ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </>
      }
    >
      <form id="editar-membro-form" onSubmit={handleSubmit} className="space-y-5 text-left">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={labelClass}>Nome Completo</label>
            <input value={nome} onChange={e => setNome(e.target.value)} className={inputBaseClass} placeholder="Ex.: Carlos Mendes" required />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputBaseClass} placeholder="email@empresa.com" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={labelClass}>Telefone / WhatsApp</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputBaseClass} placeholder="(11) 99999-9999" />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Cargo / Função</label>
            <select value={cargo} onChange={e => setCargo(e.target.value)} className={inputBaseClass}>
                <option value="">Selecione um cargo...</option>
                {cargos.map(c => (
                  <option key={c.id} value={c.nome}>{c.nome}</option>
                ))}
              </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={labelClass}>Squad</label>
            <select value={squad} onChange={e => setSquad(e.target.value)} className={inputBaseClass}>
              <option value="">Sem squad</option>
              {squads.map(s => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputBaseClass}>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
              <option value="Férias">Férias</option>
              <option value="Afastado">Afastado</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className={labelClass}>Meta mensal de receita (R$)</label>
          <input
            type="text"
            inputMode="decimal"
            value={metaMensal}
            onChange={e => setMetaMensal(e.target.value)}
            className={inputBaseClass}
            placeholder="Ex: 25000"
          />
          <p className="text-[11px] text-[var(--color-text-faint)]">Usada na barra "meta x realizado" da Central de Receita › Vendedores.</p>
        </div>
      </form>
    </Modal>
  );
}
