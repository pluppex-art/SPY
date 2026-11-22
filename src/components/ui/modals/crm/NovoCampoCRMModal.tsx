import React, { useEffect, useMemo, useState } from "react";
import { Building2, ShieldCheck } from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";

type CampoCRM = {
  name: string;
  type: "Texto" | "Número" | "Data";
  required: boolean;
  validationRegex?: string;
};

type CampoTipo = CampoCRM["type"];

interface NovoCampoCRMModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CampoCRM) => void;
  initialValue?: Partial<CampoCRM> | null;
  title?: string;
  submitText?: string;
}

const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
const inputBaseClass =
  "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#2563EB] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all";

export function NovoCampoCRMModal({
  isOpen,
  onClose,
  onSave,
  initialValue,
  title = "Novo Campo",
  submitText = "Salvar",
}: NovoCampoCRMModalProps) {
  const isEditing = Boolean(initialValue?.name);

  const [name, setName] = useState(initialValue?.name || "");
  const [type, setType] = useState<CampoTipo>(
    (initialValue?.type as CampoTipo) || "Texto"
  );
  const [required, setRequired] = useState<boolean>(!!initialValue?.required);
  const [validationRegex, setValidationRegex] = useState(initialValue?.validationRegex || "");
  const [touched, setTouched] = useState(false);

  const regexOk = useMemo(() => {
    const trimmed = (validationRegex || "").trim();
    if (!trimmed) return true;
    try {
      // eslint-disable-next-line no-new
      new RegExp(trimmed);
      return true;
    } catch {
      return false;
    }
  }, [validationRegex]);

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (!regexOk) return false;
    return true;
  }, [name, regexOk]);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialValue?.name || "");
    setType((initialValue?.type as CampoTipo) || "Texto");
    setRequired(!!initialValue?.required);
    setValidationRegex(initialValue?.validationRegex || "");
    setTouched(false);
  }, [isOpen, initialValue]);

  const handleClose = () => {
    // opcional: mantém o estado “limpo” ao fechar (melhora UX)
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    onSave({
      name: name.trim(),
      type,
      required,
      validationRegex: (validationRegex || "").trim() || undefined,
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
            <Building2 className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-black text-white">{title}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              Validações e regras de dados para Vendas
            </div>
          </div>
        </div>
      }
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            className="text-slate-400 hover:text-white"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="novo-campo-crm-form"
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
                O campo pode ser obrigatório e opcionalmente ter uma regex para validar a entrada.
              </p>
            </div>
          </div>
        </div>

        <form id="novo-campo-crm-form" onSubmit={handleSubmit} className="space-y-5">
          {/* Header mini (dinâmico) */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                {isEditing ? "Editar campo" : "Criar novo campo"}
              </div>
              <div className="text-[11px] text-slate-400 leading-relaxed">
                Defina o tipo do dado e, se necessário, uma regex para validar entradas.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${required ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : "text-slate-400 bg-white/5 border-white/10"}`}>
                {required ? "Obrigatório" : "Opcional"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="crm-campo-nome" className={labelClass}>
                Nome do Campo
              </label>
              <input
                id="crm-campo-nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputBaseClass}
                placeholder="Ex.: Cargo, Segmento, Região"
                required
              />
              {touched && !name.trim() && (
                <div className="text-[11px] text-rose-400 font-semibold">Informe um nome.</div>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="crm-campo-tipo" className={labelClass}>
                Tipo de Dado
              </label>
              <select
                id="crm-campo-tipo"
                value={type}
                onChange={(e) => setType(e.target.value as CampoCRM["type"])}
                className={inputBaseClass + " pr-10"}
              >
                <option value="Texto">Texto</option>
                <option value="Número">Número</option>
                <option value="Data">Data</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-white">Obrigatório</div>
              <div className="text-[11px] text-slate-400">Bloqueia o envio se estiver vazio.</div>
            </div>
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="w-5 h-5 rounded border-white/15 bg-transparent"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="crm-campo-regex" className={labelClass}>
              Validação (Regex) - opcional
            </label>
            <input
              id="crm-campo-regex"
              value={validationRegex}
              onChange={(e) => setValidationRegex(e.target.value)}
              className={inputBaseClass}
              placeholder="Ex.: ^[A-Za-z\\s]+$"
            />
            {touched && !regexOk && (
              <div className="text-[11px] text-rose-400 font-semibold">
                Regex inválida. Verifique o padrão.
              </div>
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}

