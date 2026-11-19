import { useState } from "react";
import { Save, Copy } from "lucide-react";
import { CamposLista } from "./CamposLista";
import { toast } from "sonner";
import { useData } from "../../../../contexts/DataContext";
import { supabase } from "../../../../lib/supabase";
import { friendlyError } from "../../../../lib/friendlyError";
import { CAMPOS_PADRAO, normalizarCampos, type CampoForm } from "../../../../lib/formularioCampos";

import { campoInput as input } from "./CamposLista";

interface Props { formId: string; link: string; camposIniciais: CampoForm[]; mensagemInicial: string; passoAPassoInicial: boolean }

/** Editor dos campos de um formulário hospedado no sistema (nome, tipo, obrigatório, opções, mensagem final). */
export function FormCamposEditor({ formId, link, camposIniciais, mensagemInicial, passoAPassoInicial }: Props) {
  const { marketingForms, setMarketingForms } = useData();
  const [campos, setCampos] = useState<CampoForm[]>(camposIniciais.length ? camposIniciais : CAMPOS_PADRAO);
  const [mensagem, setMensagem] = useState(mensagemInicial);
  const [passoAPasso, setPassoAPasso] = useState(passoAPassoInicial);
  const [salvando, setSalvando] = useState(false);


  const salvar = async () => {
    const limpos = normalizarCampos(campos.map((c) => ({ ...c, opcoes: c.tipo === "opcoes" ? c.opcoes : undefined })));
    if (limpos.length !== campos.length) { toast.error("Revise os campos: todos precisam de um título, e “Escolha uma opção” precisa de pelo menos 2 opções."); return; }
    const temContato = limpos.some((c) => c.tipo === "telefone" || c.tipo === "email");
    if (!temContato) { toast.error("Inclua pelo menos um campo de WhatsApp/telefone ou de e-mail, senão o lead chega sem contato."); return; }
    if (!limpos.some((c) => c.id === "nome" || (c.tipo === "texto" && /nome/i.test(c.label)))) { toast.error("Inclua um campo de nome (com a palavra “nome” no título)."); return; }
    setSalvando(true);
    const patch = { campos: limpos, mensagem_sucesso: mensagem.trim() || null, layout_mode: passoAPasso ? "passo_a_passo" : "scroll" };
    const { error } = supabase ? await supabase.from("marketing_forms").update(patch).eq("id", formId) : { error: { message: "sem conexão" } as any };
    setSalvando(false);
    if (error) { toast.error(/campos|mensagem_sucesso|hospedado/i.test(error.message) ? "O banco ainda não tem as colunas dos formulários próprios (migração 20261127). Peça para a equipe técnica aplicar." : `Não foi possível salvar: ${friendlyError(error)}`); return; }
    setMarketingForms((marketingForms || []).map((f: any) => (f.id === formId ? { ...f, ...patch } : f)));
    toast.success("Formulário atualizado. O link já mostra a nova versão.");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <span className="text-[11px] text-slate-400">Link para divulgar:</span>
        <code className="text-[11px] text-orange-300 break-all">{link}</code>
        <button type="button" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copiado."))} className="text-[11px] font-bold text-slate-300 hover:text-white flex items-center gap-1"><Copy className="w-3.5 h-3.5" />Copiar</button>
      </div>

      <CamposLista campos={campos} setCampos={setCampos} />

      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mensagem depois de enviar</label><input className={input + " mt-1"} value={mensagem} maxLength={300} onChange={(e) => setMensagem(e.target.value)} placeholder="Recebemos suas informações! Em breve entraremos em contato." /></div>
        <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Formato</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {[["Passo a passo", true], ["Tudo na mesma página", false]].map(([n, v]) => <button key={String(n)} type="button" onClick={() => setPassoAPasso(v as boolean)} className={`h-9 rounded-lg border text-[11px] font-bold ${passoAPasso === v ? "border-orange-500 bg-orange-500/15 text-white" : "border-white/10 text-slate-400"}`}>{n as string}</button>)}
          </div>
        </div>
      </div>

      <div className="flex justify-end"><button type="button" onClick={salvar} disabled={salvando} className="px-5 h-10 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" />{salvando ? "Salvando…" : "Salvar formulário"}</button></div>
    </div>
  );
}
