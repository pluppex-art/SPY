import React, { useEffect, useMemo, useState } from "react";
import { Mail, MessageSquare, ShieldCheck } from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";

type Canal = "WhatsApp" | "E-mail" | "Ambos";

type NovoModeloPayload = {
  nome: string;
  tipo: Canal;
  conteudo: string;
};

type NovoModeloModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: NovoModeloPayload) => void;
  initialValue?: Partial<NovoModeloPayload> | null;
  title?: string;
  submitText?: string;
};

const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
const inputBaseClass =
  "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#2563EB] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all";

export function NovoModeloModal({
  isOpen,
  onClose,
  onSave,
  initialValue,
  title = "Novo Modelo",
  submitText = "Salvar",
}: NovoModeloModalProps) {
  const [nome, setNome] = useState(initialValue?.nome || "");
  const [tipo, setTipo] = useState<Canal>(
    (initialValue?.tipo as Canal) || "WhatsApp"
  );
  const [conteudo, setConteudo] = useState(initialValue?.conteudo || "");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNome(initialValue?.nome || "");
    setTipo((initialValue?.tipo as Canal) || "WhatsApp");
    setConteudo(initialValue?.conteudo || "");
    setTouched(false);
  }, [isOpen, initialValue]);

  const conteudoTrim = conteudo.trim();
  const nomeTrim = nome.trim();

  const canSubmit = useMemo(() => {
    if (!nomeTrim) return false;
    if (!conteudoTrim) return false;
    return true;
  }, [nomeTrim, conteudoTrim]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    onSave({
      nome: nomeTrim,
      tipo,
      conteudo: conteudoTrim,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#2563EB]/10 border border-[#2563EB]/20 flex items-center justify-center mt-0.5">
            <MessageSquare className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-black text-white">{title}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              Templates para WhatsApp e E-mail
            </div>
          </div>
        </div>
      }
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="novo-modelo-form"
            className="bg-[#2563EB] hover:bg-blue-600 text-white font-bold px-6"
            disabled={!canSubmit}
          >
            {submitText}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-[var(--color-surface)]/40 border border-white/10 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mt-0.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-slate-200 font-bold">Como funciona</p>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">
                Você cria um template com nome, canal e conteúdo. O conteúdo será reaproveitado nas automações e mensagens.
              </p>
            </div>
          </div>
        </div>

        <form
          id="novo-modelo-form"
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="modelo-nome" className={labelClass}>
                Nome do Template
              </label>
              <input
                id="modelo-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={inputBaseClass}
                placeholder="Ex.: Retomada 1 / Reativação"
                required
              />
              {touched && !nomeTrim && (
                <div className="text-[11px] text-rose-400 font-semibold">
                  Informe um nome.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="modelo-tipo" className={labelClass}>
                Canal
              </label>
              <select
                id="modelo-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as Canal)}
                className={inputBaseClass + " pr-10"}
              >
                <option value="WhatsApp">WhatsApp</option>
                <option value="E-mail">E-mail</option>
                <option value="Ambos">Ambos</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="modelo-conteudo" className={labelClass}>
              Conteúdo da Mensagem
            </label>
            <textarea
              id="modelo-conteudo"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              rows={6}
              className={inputBaseClass}
              placeholder="Escreva aqui o texto do template..."
              required
            />
            {touched && !conteudoTrim && (
              <div className="text-[11px] text-rose-400 font-semibold">
                Informe o conteúdo do template.
              </div>
            )}
          </div>

          <div className="bg-[var(--color-surface)] border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              {tipo === "E-mail" ? (
                <Mail className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
              )}
              Prévia
            </div>
            <div className="mt-3 space-y-2">
              <div className="text-sm font-bold text-white">
                {nomeTrim || "Seu template"}
              </div>
              <div className="text-xs text-slate-400">
                Canal: {tipo}
              </div>
              <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-[var(--color-surface-elevated)]/50 border border-white/5 rounded-lg p-3">
                {conteudoTrim || "(conteúdo vai aparecer aqui)"}
              </div>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}

