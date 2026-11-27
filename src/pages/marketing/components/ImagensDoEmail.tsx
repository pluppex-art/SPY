/** Logo da empresa (mostrar ou não) e imagens (produto, banner) para colocar no e-mail. */
import { useRef, useState } from "react";
import { Copy, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Button } from "../../../components/ui/button";

const campo = "h-9 w-full px-3 rounded-xl text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";

export function ImagensDoEmail({ logo, mostrarLogo, onMostrarLogo, enviar, onInserir }: {
  /** Logo cadastrada em Dados da Empresa (endereço https), se houver. */
  logo: string | null;
  mostrarLogo: boolean;
  onMostrarLogo: (v: boolean) => void;
  enviar: (arquivo: File) => Promise<string>;
  onInserir: (imagem: { url: string; descricao: string; link?: string }) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [imagem, setImagem] = useState<{ url: string; descricao: string; link: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const escolher = async (arquivo?: File | null) => {
    if (!arquivo) return;
    setEnviando(true);
    try { setImagem({ url: await enviar(arquivo), descricao: arquivo.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 80), link: "" }); }
    catch (e: any) { toast.error(e.message); }
    finally { setEnviando(false); }
  };
  const inserir = () => {
    if (!imagem) return;
    const link = imagem.link.trim();
    if (link && !/^https?:\/\/\S+$/i.test(link)) { toast.error("O link precisa começar com https:// e não ter espaços."); return; }
    onInserir({ url: imagem.url, descricao: imagem.descricao.trim(), link: link || undefined });
    setImagem(null);
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-[var(--color-border-default)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className={`flex items-center gap-2.5 text-xs font-bold text-[var(--color-text-primary)] ${logo ? "cursor-pointer" : "opacity-60"}`}>
          <input type="checkbox" checked={!!logo && mostrarLogo} disabled={!logo} onChange={(e) => onMostrarLogo(e.target.checked)} />
          {logo && <img src={logo} alt="" className="h-7 max-w-[90px] object-contain rounded bg-white p-0.5" />}
          Mostrar a logo da empresa no topo
        </label>
        <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Arquivo de imagem" onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ""; }} />
        <Button type="button" variant="outline" disabled={enviando} onClick={() => entrada.current?.click()} className="h-8 px-3 text-[11px] gap-1.5">
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} {enviando ? "Enviando…" : "Adicionar imagem"}
        </Button>
      </div>
      {!logo && <p className="text-[11px] text-[var(--color-text-muted)]">Sem logo cadastrada. Cadastre em <Link to="/app/configuracoes/empresa/dados" className="font-bold text-[var(--color-primary-blue)]">Dados da Empresa</Link> ou use “Adicionar imagem”.</p>}

      {imagem && (
        <div className="flex flex-col sm:flex-row gap-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] p-3">
          <img src={imagem.url} alt="" className="w-full sm:w-28 h-28 object-contain rounded-lg bg-white border border-[var(--color-border-subtle)]" />
          <div className="flex-1 min-w-0 space-y-2">
            <input value={imagem.descricao} onChange={(e) => setImagem({ ...imagem, descricao: e.target.value })} maxLength={80} aria-label="Descrição da imagem" placeholder="Descrição (aparece se a imagem não carregar)" className={campo} />
            <input value={imagem.link} onChange={(e) => setImagem({ ...imagem, link: e.target.value })} aria-label="Link ao clicar na imagem" placeholder="Link ao clicar (opcional): https://…" className={campo} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={inserir} className="h-8 px-3 text-[11px] font-bold">Inserir no e-mail</Button>
              <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(imagem.url).then(() => toast.success("Endereço da imagem copiado."), () => toast.error("Não foi possível copiar."))} className="h-8 px-3 text-[11px] gap-1.5"><Copy className="w-3 h-3" /> Copiar endereço</Button>
              <Button type="button" variant="ghost" onClick={() => setImagem(null)} className="h-8 px-2 text-[11px]" aria-label="Descartar imagem"><X className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
