import React, { useState } from "react";
import { Briefcase, Info, Tag, Layers, FileText, Save } from "lucide-react";
import { Modal } from "../../../../components/ui/modal";
import { Button } from "../../../../components/ui/button";

interface CargoFormData { nome: string; nivel: string; descricao: string }

interface CargoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (d: CargoFormData) => void;
  editing: any | null;
}

const NIVEIS = [
  { value: "Operacional", hint: "Execução do dia a dia." },
  { value: "Tático", hint: "Coordena equipes e processos." },
  { value: "Estratégico", hint: "Define direção e metas da empresa." },
];

const inputClass = "w-full bg-[var(--color-surface-sunken)] border rounded-lg px-3 h-10 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all";
const DESC_MAX = 500;

function FieldLabel({ icon: Icon, children, required }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)] mb-1.5">
      <Icon className="w-4 h-4 text-[var(--color-primary-blue)]" />
      {children}
      {required && <span className="text-[var(--color-danger)]">*</span>}
    </label>
  );
}

export function CargoModal({ isOpen, onClose, onSave, editing }: CargoModalProps) {
  const [nome, setNome] = useState("");
  const [nivel, setNivel] = useState("Operacional");
  const [descricao, setDescricao] = useState("");
  const [tentou, setTentou] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setNome(editing?.nome ?? "");
    setNivel(editing?.nivel ?? "Operacional");
    setDescricao(editing?.descricao ?? "");
    setTentou(false);
  }, [isOpen, editing]);

  const erroNome = !nome.trim() ? "Informe o nome do cargo." : "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (erroNome) return;
    onSave({ nome: nome.trim(), nivel, descricao: descricao.trim() });
    onClose();
  };

  const nivelHint = NIVEIS.find((n) => n.value === nivel)?.hint;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-lg"
      title={
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-black text-[var(--color-text-primary)] leading-tight">{editing ? "Editar Cargo" : "Novo Cargo"}</div>
            <div className="text-xs font-normal text-[var(--color-text-muted)]">Cadastre um cargo para organizar a estrutura da sua empresa.</div>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[var(--color-primary-blue)]/8 border border-[var(--color-primary-blue)]/20">
          <Info className="w-5 h-5 text-[var(--color-primary-blue)] shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-[var(--color-text-primary)]">Os cargos ajudam a definir a estrutura hierárquica e os níveis de acesso dos colaboradores.</p>
            <p className="text-[var(--color-text-muted)] mt-0.5">Você pode criar cargos como SDR, Closer, Gerente Comercial, entre outros.</p>
          </div>
        </div>

        <div>
          <FieldLabel icon={Tag} required>Nome do Cargo</FieldLabel>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
            maxLength={80}
            className={`${inputClass} ${tentou && erroNome ? "border-[var(--color-danger)]" : "border-[var(--color-border-default)]"}`}
            placeholder="Ex: SDR, Closer, Gerente Comercial..."
          />
          {tentou && erroNome
            ? <p className="text-[11px] text-[var(--color-danger)] mt-1">{erroNome}</p>
            : <p className="text-[11px] text-[var(--color-text-faint)] mt-1">Use um nome claro e objetivo.</p>}
        </div>

        <div>
          <FieldLabel icon={Layers}>Nível Hierárquico</FieldLabel>
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} className={`${inputClass} border-[var(--color-border-default)] cursor-pointer`}>
            {NIVEIS.map((n) => <option key={n.value} value={n.value}>{n.value}</option>)}
          </select>
          <p className="text-[11px] text-[var(--color-text-faint)] mt-1">Define o nível do cargo na estrutura da empresa. {nivelHint}</p>
        </div>

        <div>
          <FieldLabel icon={FileText}>Descrição / Responsabilidades</FieldLabel>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value.slice(0, DESC_MAX))}
            rows={4}
            className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] resize-none"
            placeholder="Descreva as principais responsabilidades deste cargo..."
          />
          <div className="flex items-center justify-between mt-1 text-[11px] text-[var(--color-text-faint)]">
            <span>Inclua as principais atividades e responsabilidades.</span>
            <span>{descricao.length}/{DESC_MAX}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--color-border-subtle)]">
          <Button type="button" variant="outline" onClick={onClose} className="h-10 px-5 text-xs font-bold border-[var(--color-border-default)]">
            Cancelar
          </Button>
          <Button type="submit" className="h-10 px-5 text-xs font-bold gap-2 shadow-xs">
            <Save className="w-4 h-4" /> {editing ? "Salvar Alterações" : "Cadastrar Cargo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
