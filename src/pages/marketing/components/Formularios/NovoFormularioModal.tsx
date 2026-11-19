import { useState } from "react";
import { FileText } from "lucide-react";
import { Modal } from "../../../../components/ui/modal";
import { Button } from "../../../../components/ui/button";

interface NovoFormularioPayload {
  name: string;
  description: string;
  previewUrl: string;
  source: string;
  hospedar: boolean;
  layoutMode: "scroll" | "passo_a_passo";
}

interface NovoFormularioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: NovoFormularioPayload) => void | Promise<void>;
}

const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
const inputClass =
  "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 transition-all";

export function NovoFormularioModal({ isOpen, onClose, onSave }: NovoFormularioModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [source, setSource] = useState("");
  const [layoutMode, setLayoutMode] = useState<"scroll" | "passo_a_passo">("passo_a_passo");
  const [hospedar, setHospedar] = useState(true);
  const [loading, setLoading] = useState(false);

  const reset = () => { setName(""); setDescription(""); setPreviewUrl(""); setSource(""); setLayoutMode("passo_a_passo"); setHospedar(true); setLoading(false); };
  const handleClose = () => { reset(); onClose(); };

  const sourceFinal = source.trim() || `form_${name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40)}`;
  const canSubmit = Boolean(name.trim() && (hospedar || (previewUrl.trim() && source.trim())));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await onSave({ name: name.trim(), description: description.trim(), previewUrl: previewUrl.trim(), source: hospedar ? sourceFinal : source.trim(), hospedar, layoutMode });
      reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mt-0.5">
            <FileText className="w-4 h-4 text-orange-400" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-black text-white">Novo Formulário</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              Landing page ou formulário externo de captação
            </div>
          </div>
        </div>
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={loading}>Cancelar</Button>
          <Button type="submit" form="novo-formulario-form" disabled={!canSubmit || loading} className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-6">
            {loading ? "Salvando..." : "Cadastrar"}
          </Button>
        </>
      }
    >
      <form id="novo-formulario-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between pb-1">
          <span className="text-[10px] text-slate-500">Ou use um modelo padrão:</span>
          <button
            type="button"
            onClick={() => {
              setName("Inscrição — E-EMPREENDA+");
              setDescription("Formulário oficial de qualificação com 5 passos interativos, rodízio de SDRs e captação direta de leads no CRM.");
              setPreviewUrl("https://escolaempreendamais.pluppex.com.br/inscricao");
              setSource("landing_empreenda");
              setHospedar(false);
            }}
            className="text-[10px] font-black text-orange-400 hover:text-orange-300 hover:underline uppercase tracking-wider"
          >
            Preencher com E-EMPREENDA+
          </button>
        </div>
        <div>
          <label className={labelClass}>Nome *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Inscrição — Curso de Vendas" className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Descrição</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contexto do formulário" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[[true, "Criar aqui no sistema", "Montamos o formulário e geramos o link para você divulgar."], [false, "Já tenho uma página", "Cadastre o endereço de um formulário que já existe."]].map(([v, t, d]) => (
            <button key={String(v)} type="button" onClick={() => setHospedar(v as boolean)} className={`p-3 rounded-xl border text-left cursor-pointer ${hospedar === v ? "bg-orange-500/15 border-orange-500 ring-1 ring-orange-500/30" : "bg-[var(--color-surface)] border-white/10"}`}>
              <span className="text-xs block font-black text-white">{t as string}</span><span className="text-[10px] text-slate-400 block mt-0.5">{d as string}</span>
            </button>))}
        </div>
        {!hospedar && <div>
          <label className={labelClass}>URL da Landing Page / Formulário *</label>
          <input type="url" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://sua-pagina.com.br/inscricao" className={inputClass} required />
        </div>}
        <div>
          <label className={labelClass}>Formato de Exibição do Formulário</label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <button
              type="button"
              onClick={() => setLayoutMode("scroll")}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                layoutMode === "scroll"
                  ? "bg-orange-500/15 border-orange-500 text-white font-bold ring-1 ring-orange-500/30"
                  : "bg-[var(--color-surface)] border-white/10 text-slate-400 hover:text-white"
              }`}
            >
              <span className="text-xs block font-black text-white">📜 Scroll Contínuo</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Estilo Google Forms — todas as perguntas na mesma página.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode("passo_a_passo")}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                layoutMode === "passo_a_passo"
                  ? "bg-orange-500/15 border-orange-500 text-white font-bold ring-1 ring-orange-500/30"
                  : "bg-[var(--color-surface)] border-white/10 text-slate-400 hover:text-white"
              }`}
            >
              <span className="text-xs block font-black text-white">🏃 Passo a Passo (Corridinha)</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Estilo Typeform — uma pergunta por vez, sequencial.
              </span>
            </button>
          </div>
        </div>

        <div>
          <label className={labelClass}>Source (identificador dos leads){hospedar ? "" : " *"}</label>
          <input type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder={hospedar ? `Automático: ${sourceFinal || "form_nome"}` : "Ex: landing_curso_vendas"} className={inputClass} required={!hospedar} />
          <p className="text-[10px] text-slate-500 mt-1.5">Deve bater com o campo "source" gravado nos leads criados por esse formulário.</p>
        </div>
      </form>
    </Modal>
  );
}
