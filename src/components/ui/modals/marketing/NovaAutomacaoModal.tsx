import React, { useEffect, useMemo, useState } from "react";
import { Zap, ArrowRight } from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";

type NovaAutomacaoPayload = {
  nome: string;
  gatilho: string;
  acao: string;
};

type NovaAutomacaoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: NovaAutomacaoPayload) => void;
  initialValue?: Partial<NovaAutomacaoPayload> | null;
  title?: string;
  submitText?: string;
};

const triggerOptions = [
  "Novo Lead Criado",
  "Negócio Ganho",
  "Negócio Perdido",
  "Sem interação > 30d",
  "Formulário Site Preenchido"
];

const actionOptions = [
  "Enviar E-mail",
  "Enviar WhatsApp",
  "Mudar Etapa Pipeline",
  "Criar Tarefa",
  "Notificar Equipe"
];

const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
const fieldClass = "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all";

export function NovaAutomacaoModal({
  isOpen,
  onClose,
  onSave,
  initialValue,
  title = "Novo Fluxo de Automação",
  submitText = "Criar Fluxo",
}: NovaAutomacaoModalProps) {
  const [nome, setNome] = useState(initialValue?.nome || "");
  const [gatilho, setGatilho] = useState(initialValue?.gatilho || triggerOptions[0]);
  const [acao, setAcao] = useState(initialValue?.acao || actionOptions[0]);

  useEffect(() => {
    if (!isOpen) return;
    setNome(initialValue?.nome || "");
    setGatilho(initialValue?.gatilho || triggerOptions[0]);
    setAcao(initialValue?.acao || actionOptions[0]);
  }, [isOpen, initialValue]);

  const canSubmit = useMemo(() => Boolean(nome.trim()), [nome]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    onSave({
      nome: nome.trim(),
      gatilho,
      acao,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-xl"
      title={
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#2563EB]/10 border border-[#2563EB]/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-[#60A5FA]" />
          </div>
          <div>
            <div className="text-base font-black text-white">{title}</div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mt-1">Defina o gatilho e a ação do seu fluxo</div>
          </div>
        </div>
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">
            Cancelar
          </Button>
          <Button type="submit" form="nova-automacao-form" className="bg-[#2563EB] hover:bg-blue-600 text-white font-bold px-6" disabled={!canSubmit}>
            {submitText}
          </Button>
        </>
      }
    >
      <form id="nova-automacao-form" onSubmit={handleSubmit} className="space-y-5 text-left">
        <div className="space-y-2">
          <label className={labelClass}>Nome do Fluxo</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={fieldClass}
            placeholder="Ex: Aumentar taxa de conversão"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={labelClass}>Gatilho</label>
            <select value={gatilho} onChange={(e) => setGatilho(e.target.value)} className={fieldClass}>
              {triggerOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Ação</label>
            <select value={acao} onChange={(e) => setAcao(e.target.value)} className={fieldClass}>
              {actionOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-400 text-xs">
          <ArrowRight className="w-4 h-4" />
          <span>O fluxo será criado automaticamente com base no gatilho e na ação selecionados.</span>
        </div>
      </form>
    </Modal>
  );
}
