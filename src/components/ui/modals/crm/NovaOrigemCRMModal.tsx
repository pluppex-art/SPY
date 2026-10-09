import React, { useEffect, useMemo, useState } from "react";
import { Target, Info, Tag, Plus, MousePointer2, Megaphone, Users, CalendarDays, Handshake, MoreHorizontal, Loader2 } from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";

type NovaOrigemPayload = {
  nome: string;
};

type NovaOrigemCRMModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: NovaOrigemPayload) => void;
  title?: string;
  submitText?: string;
  initialValue?: Partial<NovaOrigemPayload> | null;
};

// Atalhos que só preenchem o campo — a pessoa pode editar o texto antes de salvar.
const EXEMPLOS = [
  { nome: "Tráfego Pago", icon: MousePointer2, cls: "text-blue-500 bg-blue-500/10" },
  { nome: "Orgânico", icon: Megaphone, cls: "text-emerald-500 bg-emerald-500/10" },
  { nome: "Indicação", icon: Users, cls: "text-violet-500 bg-violet-500/10" },
  { nome: "Evento", icon: CalendarDays, cls: "text-orange-500 bg-orange-500/10" },
  { nome: "Parceria", icon: Handshake, cls: "text-rose-500 bg-rose-500/10" },
  { nome: "Outros", icon: MoreHorizontal, cls: "text-slate-500 bg-slate-500/10" },
];

export function NovaOrigemCRMModal({
  isOpen,
  onClose,
  onSave,
  title = "Nova Origem",
  submitText = "Cadastrar Origem",
  initialValue,
}: NovaOrigemCRMModalProps) {
  const [nome, setNome] = useState(initialValue?.nome || "");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNome(initialValue?.nome || "");
    setTouched(false);
    setLoading(false);
  }, [isOpen, initialValue]);

  const canSubmit = useMemo(() => !loading, [loading]);
  const erro = !nome.trim() ? "Informe o nome da origem." : "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit || erro) return;

    setLoading(true);
    try {
      onSave({ nome: nome.trim() });
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-lg"
      title={
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            <Target className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-black text-[var(--color-text-primary)] leading-tight">{title}</div>
            <div className="text-xs font-normal text-[var(--color-text-muted)]">Crie uma origem de lead para classificar de onde vêm os seus leads no CRM.</div>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[var(--color-primary-blue)]/8 border border-[var(--color-primary-blue)]/20">
          <Info className="w-5 h-5 text-[var(--color-primary-blue)] shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-[var(--color-text-primary)]">Como funciona?</p>
            <p className="text-[var(--color-text-muted)] mt-0.5">A origem é usada no funil para identificar de onde vêm seus leads.</p>
            <p className="text-[var(--color-text-muted)]">Exemplos: Tráfego Pago, Indicação, Orgânico, Evento, Parceria, entre outros.</p>
          </div>
        </div>

        <div>
          <label htmlFor="origem-nome" className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)] mb-1.5">
            <Tag className="w-4 h-4 text-[var(--color-primary-blue)]" /> Nome da Origem <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            id="origem-nome"
            name="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
            maxLength={60}
            placeholder="Ex.: Indicação, Tráfego Pago, Orgânico..."
            className={`w-full bg-[var(--color-surface-sunken)] border rounded-lg px-3 h-10 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all ${touched && erro ? "border-[var(--color-danger)]" : "border-[var(--color-border-default)]"}`}
          />
          {touched && erro
            ? <p className="text-[11px] text-[var(--color-danger)] mt-1">{erro}</p>
            : <p className="text-[11px] text-[var(--color-text-faint)] mt-1">Use um nome claro e objetivo para facilitar a organização.</p>}
        </div>

        <div className="pt-4 border-t border-[var(--color-border-subtle)]">
          <p className="text-xs font-bold text-[var(--color-text-muted)] mb-2.5">Exemplos de origens</p>
          <div className="flex flex-wrap gap-2">
            {EXEMPLOS.map((ex) => (
              <button
                key={ex.nome}
                type="button"
                onClick={() => setNome(ex.nome)}
                className={`flex items-center gap-2 px-3 h-9 rounded-full border text-xs font-medium cursor-pointer transition-colors hover:border-[var(--color-primary-blue)] ${nome.trim().toLowerCase() === ex.nome.toLowerCase() ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5 text-[var(--color-text-primary)]" : "border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]"}`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center ${ex.cls}`}><ex.icon className="w-3 h-3" /></span>
                {ex.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--color-border-subtle)]">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="h-10 px-5 text-xs font-bold border-[var(--color-border-default)]">
            Cancelar
          </Button>
          <Button type="submit" disabled={!canSubmit} className="h-10 px-5 text-xs font-bold gap-2 shadow-xs">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {loading ? "Salvando..." : submitText}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
