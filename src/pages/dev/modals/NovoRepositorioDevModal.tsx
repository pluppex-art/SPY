import React, { useEffect, useMemo, useState } from "react";
import { GitBranch } from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { useDevConfig, pick, DEV_VISIBILIDADES } from "../../../lib/modules/devConfig";

export type NovoRepositorioPayload = {
  name: string;
  description: string;
  language: string;
  visibility: "Público" | "Privado";
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: NovoRepositorioPayload) => void;
};


const lbl = "text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider";
const inp = "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-4 py-2.5 text-xs text-[var(--color-text-primary)] focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 transition-all placeholder-[var(--color-text-faint)]";

export function NovoRepositorioDevModal({ isOpen, onClose, onSave }: Props) {
  const { repositorios: cfg } = useDevConfig();
  const LANGUAGES = cfg.linguagens.length ? cfg.linguagens : ["TypeScript"];
  const langPadrao = LANGUAGES.includes(cfg.linguagemPadrao) ? cfg.linguagemPadrao : LANGUAGES[0];
  const visPadrao = pick(cfg.visibilidadePadrao, DEV_VISIBILIDADES, "Privado") as "Público" | "Privado";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState(langPadrao);
  const [visibility, setVisibility] = useState<"Público" | "Privado">(visPadrao);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(""); setDescription(""); setLanguage(langPadrao); setVisibility(visPadrao); setLoading(false);
  }, [isOpen, langPadrao, visPadrao]);

  const canSubmit = useMemo(() => !loading && Boolean(name.trim()), [loading, name]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      onSave({ name: name.trim(), description: description.trim(), language, visibility });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-xl"
      title={
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center mt-0.5">
            <GitBranch className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-black text-white">Novo Repositório</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Gestão de código-fonte</div>
          </div>
        </div>
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white" disabled={loading}>Cancelar</Button>
          <Button type="submit" form="novo-repo-dev-form" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6" disabled={!canSubmit}>
            {loading ? "Criando..." : "Criar Repositório"}
          </Button>
        </>
      }
    >
      <form id="novo-repo-dev-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className={lbl}>Nome do Repositório *</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inp}
            placeholder="Ex.: axis-api-gateway" required />
          <p className="text-[10px] text-slate-500">Use letras minúsculas, números e hífens.</p>
        </div>

        <div className="space-y-2">
          <label className={lbl}>Descrição</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className={`${inp} resize-none`} placeholder="Descreva brevemente o propósito do repositório..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={lbl}>Linguagem Principal</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} className={inp}>
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className={lbl}>Visibilidade</label>
            <div className="flex flex-col gap-2 mt-1">
              {(["Privado", "Público"] as const).map(v => (
                <button key={v} type="button" onClick={() => setVisibility(v)}
                  className={`px-4 py-2.5 rounded-xl text-[11px] font-black border transition-all text-left ${visibility === v
                    ? v === "Privado"
                      ? "bg-blue-600/15 text-blue-400 border-blue-500/40"
                      : "bg-emerald-600/15 text-emerald-400 border-emerald-500/40"
                    : "bg-white/[0.02] text-slate-500 border-white/5 hover:bg-white/[0.05]"
                  }`}>
                  {visibility === v && "● "}{v === "Privado" ? "🔒 Privado" : "🌐 Público"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
