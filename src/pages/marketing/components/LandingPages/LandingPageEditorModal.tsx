import { useEffect, useRef, useState } from "react";
import { ExternalLink, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../../../../components/ui/modal";
import { Button } from "../../../../components/ui/button";
import { supabase } from "../../../../lib/supabase";
import { useAuth } from "../../../../contexts/AuthContext";
import { CONTEUDO_LP_PADRAO, normalizarConteudoLP, type ConteudoLP } from "../../../../lib/paginaLP";
import { erroDosCampos, normalizarCampos } from "../../../../lib/formularioCampos";
import { CamposLista, campoInput } from "../Formularios/CamposLista";

const rotulo = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
const CORES = ["#2563EB", "#7C3AED", "#059669", "#D6303B", "#EA580C", "#0F172A"];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Página em edição; null = criar nova. */
  pagina: { id: string; name: string; url?: string; conteudo?: any } | null;
  onSalvar: (dados: { id: string; nome: string; conteudo: ConteudoLP }) => Promise<boolean>;
}

/** Criar ou editar uma landing page hospedada no sistema (link /p/<id>): textos, imagem, cor e as perguntas do formulário. */
export function LandingPageEditorModal({ isOpen, onClose, pagina, onSalvar }: Props) {
  const { activeTenantId } = useAuth();
  const [id, setId] = useState("");
  const [nome, setNome] = useState("");
  const [c, setC] = useState<ConteudoLP>(CONTEUDO_LP_PADRAO);
  const [campos, setCampos] = useState(CONTEUDO_LP_PADRAO.campos);
  const [bullets, setBullets] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const arq = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const cont = normalizarConteudoLP(pagina?.conteudo);
    setId(pagina?.id ?? crypto.randomUUID());
    setNome(pagina?.name ?? "");
    setC(pagina ? cont : CONTEUDO_LP_PADRAO);
    setCampos(cont.campos);
    setBullets((pagina ? cont : CONTEUDO_LP_PADRAO).bullets.join("\n"));
    setSalvando(false);
  }, [isOpen, pagina]);

  const set = <K extends keyof ConteudoLP>(k: K, v: ConteudoLP[K]) => setC((x) => ({ ...x, [k]: v }));

  const enviarImagem = async (file: File) => {
    if (!supabase || !activeTenantId) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error("Use uma imagem PNG, JPG ou WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("A imagem passa de 5 MB."); return; }
    setEnviando(true);
    try {
      const seguro = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-60);
      const path = `${activeTenantId}/lp/${id}/${Date.now()}-${seguro}`;
      const { error } = await supabase.storage.from("products").upload(path, file, { contentType: file.type });
      if (error) throw error;
      set("imagem", supabase.storage.from("products").getPublicUrl(path).data.publicUrl);
    } catch (e: any) { toast.error(`Não foi possível enviar a imagem: ${e?.message || "erro"}`); }
    setEnviando(false);
    if (arq.current) arq.current.value = "";
  };

  const salvar = async () => {
    if (!c.titulo.trim()) { toast.error("Escreva o título da página."); return; }
    const erro = erroDosCampos(campos);
    if (erro) { toast.error(erro); return; }
    setSalvando(true);
    const ok = await onSalvar({ id, nome: nome.trim() || c.titulo.trim(), conteudo: normalizarConteudoLP({ ...c, campos: normalizarCampos(campos), bullets: bullets.split("\n") }) });
    setSalvando(false);
    if (ok) onClose();
  };

  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/p/${id}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl" title={pagina ? "Editar landing page" : "Nova landing page"}
      description="A página fica no ar no endereço abaixo, conta visitas e cliques sozinha e cada envio vira lead no CRM."
      footer={<div className="flex items-center justify-between w-full gap-2">
        {pagina ? <a href={link} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-400 hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />Ver página</a> : <span />}
        <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{pagina ? "Salvar" : "Criar página"}</Button></div>
      </div>}>
      <div className="space-y-4">
        <div><label className={rotulo}>Nome interno (só você vê)</label><input className={campoInput + " mt-1"} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Black Friday — captação" /></div>
        <div><label className={rotulo}>Título da página *</label><input className={campoInput + " mt-1"} value={c.titulo} onChange={(e) => set("titulo", e.target.value)} maxLength={140} /></div>
        <div><label className={rotulo}>Subtítulo</label><input className={campoInput + " mt-1"} value={c.subtitulo} onChange={(e) => set("subtitulo", e.target.value)} maxLength={300} /></div>
        <div><label className={rotulo}>Vantagens (uma por linha)</label><textarea className={campoInput + " mt-1"} rows={4} value={bullets} onChange={(e) => setBullets(e.target.value)} /></div>

        <div>
          <label className={rotulo}>Imagem (opcional)</label>
          <input ref={arq} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarImagem(f); }} />
          <div className="mt-1 flex items-center gap-3">
            {c.imagem ? <img src={c.imagem} alt="" className="h-16 w-24 object-cover rounded-lg border border-white/10" /> : <div className="h-16 w-24 rounded-lg border border-dashed border-white/15" />}
            <Button type="button" variant="outline" size="sm" disabled={enviando} onClick={() => arq.current?.click()}>{enviando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-1.5" />}{c.imagem ? "Trocar" : "Enviar imagem"}</Button>
            {c.imagem && <button type="button" onClick={() => set("imagem", "")} className="text-slate-400 hover:text-rose-400" aria-label="Remover imagem"><Trash2 className="w-4 h-4" /></button>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={rotulo}>Texto do botão</label><input className={campoInput + " mt-1"} value={c.cta} onChange={(e) => set("cta", e.target.value)} maxLength={40} /></div>
          <div><label className={rotulo}>Cor da página</label>
            <div className="mt-1 flex items-center gap-1.5">{CORES.map((k) => <button key={k} type="button" aria-label={`Cor ${k}`} onClick={() => set("cor", k)} className="w-7 h-7 rounded-full border-2" style={{ background: k, borderColor: c.cor === k ? "#fff" : "transparent" }} />)}
              <input type="color" value={c.cor} onChange={(e) => set("cor", e.target.value.toUpperCase())} className="w-8 h-8 bg-transparent" aria-label="Outra cor" /></div></div>
        </div>

        <div>
          <p className={rotulo + " mb-1.5"}>Perguntas do formulário</p>
          <CamposLista campos={campos} setCampos={setCampos} />
        </div>
        <div><label className={rotulo}>Mensagem depois de enviar</label><input className={campoInput + " mt-1"} value={c.mensagemSucesso} onChange={(e) => set("mensagemSucesso", e.target.value)} maxLength={300} /></div>
        <div><label className={rotulo}>Rodapé (opcional)</label><input className={campoInput + " mt-1"} value={c.rodape} onChange={(e) => set("rodape", e.target.value)} maxLength={300} placeholder="Ex.: Empresa Ltda — CNPJ 00.000.000/0001-00" /></div>
      </div>
    </Modal>
  );
}
