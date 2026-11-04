import { useEffect, useState } from "react";
import { Modal } from "./modal";
import { Button } from "./button";
import { MOTIVO_OUTRO, montarMotivo } from "../../lib/motivos";

interface MotivoModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  opcoes: readonly string[];
  /** Recebe o motivo escolhido, ou null se a pessoa pular. */
  onConfirm: (motivo: string | null) => void;
}

/** Pergunta o motivo (perda de lead, por exemplo) com opções prontas + "Outro". Pular é permitido. */
export function MotivoModal({ isOpen, title, description, opcoes, onConfirm }: MotivoModalProps) {
  const [opcao, setOpcao] = useState("");
  const [outro, setOutro] = useState("");

  useEffect(() => { if (isOpen) { setOpcao(""); setOutro(""); } }, [isOpen]);

  const todas = [...opcoes, MOTIVO_OUTRO];

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onConfirm(null)}
      title={title}
      description={description}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={() => onConfirm(null)}>Pular</Button>
          <Button onClick={() => onConfirm(montarMotivo(opcao, outro))} disabled={!opcao}>Salvar motivo</Button>
        </>
      }
    >
      <div className="space-y-2" role="radiogroup" aria-label={title}>
        {todas.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={opcao === o}
            onClick={() => setOpcao(o)}
            className={`w-full min-h-11 px-3 py-2.5 rounded-[var(--radius-control)] border text-left text-sm font-semibold cursor-pointer break-words ${opcao === o ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]" : "border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]"}`}
          >
            {o}
          </button>
        ))}
        {opcao === MOTIVO_OUTRO && (
          <input
            type="text"
            value={outro}
            onChange={(e) => setOutro(e.target.value)}
            placeholder="Descreva o motivo"
            maxLength={140}
            autoFocus
            className="w-full h-11 px-3 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
          />
        )}
      </div>
    </Modal>
  );
}
