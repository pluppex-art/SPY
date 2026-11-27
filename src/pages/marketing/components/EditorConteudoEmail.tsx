/** Conteúdo do e-mail: texto simples ou HTML próprio (arquivo do cliente, código colado ou modelo de exemplo). */
import { useRef, useState } from "react";
import { Code2, Download, FileCode2, Trash2, Type, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { avisosDoEmail } from "../../../lib/avisosEmail";
import { type FormatoEmail, avisosDoHtml, comoHtml, htmlParaTexto, imagemEmHtml, imagemEmTexto, inserirNoHtml, modeloExemploHtml, MAX_HTML, MAX_TEXTO } from "../../../lib/emailHtml";
import { ImagensDoEmail } from "./ImagensDoEmail";
import { cn } from "../../../lib/utils";

export type { FormatoEmail };

const VARIAVEIS: [string, string][] = [["{{primeiro_nome}}", "Primeiro nome"], ["{{nome}}", "Nome completo"], ["{{empresa}}", "Empresa da pessoa"]];
const campo = "px-3 py-2 rounded-xl text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";

/** Lê o arquivo respeitando a codificação declarada nele (modelos antigos costumam vir em ISO-8859-1). */
async function lerHtml(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  const inicio = new TextDecoder("utf-8").decode(bytes.slice(0, 2048));
  const declarada = /charset\s*=\s*["']?\s*([\w-]+)/i.exec(inicio)?.[1];
  try { return new TextDecoder(declarada || "utf-8").decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}

export function EditorConteudoEmail({ formato, onFormato, texto, onTexto, html, onHtml, assunto, marca, mostrarLogo, onMostrarLogo, enviarImagem }: {
  formato: FormatoEmail; onFormato: (f: FormatoEmail) => void;
  texto: string; onTexto: (v: string) => void;
  html: string; onHtml: (v: string) => void;
  assunto: string;
  marca: { nome: string; cor?: string | null; logo?: string | null };
  mostrarLogo: boolean; onMostrarLogo: (v: boolean) => void;
  enviarImagem: (arquivo: File) => Promise<string>;
}) {
  const [arquivo, setArquivo] = useState("");
  const [verCodigo, setVerCodigo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const caixaTexto = useRef<HTMLTextAreaElement>(null);
  // Onde estava o cursor da última vez que a pessoa escreveu: é ali que a imagem entra.
  const cursor = useRef<{ texto: number | null; html: number | null }>({ texto: null, html: null });
  const marcarCursor = (campoDe: "texto" | "html") => (e: { currentTarget: HTMLTextAreaElement }) => { cursor.current[campoDe] = e.currentTarget.selectionStart; };

  const inserirImagem = ({ url, descricao, link }: { url: string; descricao: string; link?: string }) => {
    if (formato === "texto") {
      const i = cursor.current.texto ?? texto.length;
      const antes = texto.slice(0, i).replace(/\s+$/, ""), depois = texto.slice(i).replace(/^\s+/, "");
      const novo = [antes, imagemEmTexto(url, descricao, link), depois].filter(Boolean).join("\n\n");
      if (novo.length > MAX_TEXTO) { toast.error("A mensagem chegou ao limite de tamanho."); return; }
      onTexto(novo); cursor.current.texto = null;
      toast.success("Imagem colocada na mensagem.");
      return;
    }
    const posicao = verCodigo ? cursor.current.html : null;
    const novo = inserirNoHtml(html, imagemEmHtml(url, descricao, link), posicao);
    if (novo.length > MAX_HTML) { toast.error("O HTML chegou ao limite de tamanho."); return; }
    onHtml(novo); setVerCodigo(true); cursor.current.html = null;
    toast.success(posicao ? "Imagem colocada onde estava o cursor." : "Imagem colocada no fim do e-mail. Mova o trecho no código se quiser em outro lugar.");
  };

  const usar = async (f?: File | null) => {
    if (!f) return;
    if (!/\.html?$/i.test(f.name) && f.type !== "text/html") { toast.error("Envie um arquivo .html. Se o modelo veio compactado (.zip), extraia primeiro."); return; }
    if (f.size > MAX_HTML * 2) { toast.error("Arquivo grande demais. Hospede as imagens na internet em vez de colocá-las dentro do HTML."); return; }
    const conteudo = comoHtml((await lerHtml(f)).trim());
    if (!conteudo) { toast.error("O arquivo está vazio."); return; }
    if (conteudo.length > MAX_HTML) { toast.error(`O HTML passa de ${MAX_HTML / 1000} mil caracteres. Hospede as imagens na internet em vez de colocá-las dentro do arquivo.`); return; }
    onHtml(conteudo); setArquivo(f.name); setVerCodigo(false);
  };
  const usarExemplo = async () => {
    if (html.trim() && !(await confirmDialog({ title: "Substituir o HTML atual?", description: "O conteúdo atual será trocado pelo modelo de exemplo.", confirmLabel: "Substituir" }))) return;
    onHtml(modeloExemploHtml(marca)); setArquivo("Modelo de exemplo"); setVerCodigo(true);
  };
  const baixarExemplo = () => {
    const url = URL.createObjectURL(new Blob([modeloExemploHtml(marca)], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "modelo-de-email.html"; a.click(); URL.revokeObjectURL(url);
  };
  const copiar = async (v: string) => {
    try { await navigator.clipboard.writeText(v); toast.success(`${v} copiado. Cole onde quiser no e-mail.`); }
    catch { toast.error("Não foi possível copiar."); }
  };

  const avisos = formato === "html"
    ? [...avisosDoHtml(html), ...(html.trim() ? avisosDoEmail(assunto, htmlParaTexto(html)).filter((a) => !/link/i.test(a.texto)) : [])]
    : avisosDoEmail(assunto, texto);

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Formato do e-mail" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]">
        {([["texto", "Escrever texto", Type], ["html", "Usar meu HTML", Code2]] as const).map(([v, rotulo, Icone]) => (
          <button key={v} type="button" role="tab" aria-selected={formato === v} onClick={() => onFormato(v)}
            className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border-0 cursor-pointer transition-colors",
              formato === v ? "bg-[var(--color-surface-elevated)] text-[var(--color-primary-blue)] shadow-sm" : "bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}>
            <Icone className="w-3.5 h-3.5" /> {rotulo}
          </button>
        ))}
      </div>

      {formato === "texto" ? (
        <>
          <textarea ref={caixaTexto} aria-label="Mensagem" value={texto} onChange={(e) => { marcarCursor("texto")(e); onTexto(e.target.value); }} onSelect={marcarCursor("texto")} rows={10} maxLength={MAX_TEXTO}
            placeholder={"Olá {{primeiro_nome}},\n\nO Treinão acontece neste sábado, dia 14, às 9h...\n\nTe esperamos!"} className={`${campo} w-full resize-y`} />
          <p className="text-[11px] text-[var(--color-text-muted)]">Formatação: <code>{"**negrito**"}</code> · <code>{"[texto do link](https://...)"}</code> · botão: <code>{"[[Quero saber mais|https://...]]"}</code>. O link para sair da lista entra sozinho no rodapé.</p>
        </>
      ) : (
        <>
          <input ref={entrada} type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => { void usar(e.target.files?.[0]); e.target.value = ""; }} />
          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); void usar(e.dataTransfer.files?.[0]); }}
            className={cn("rounded-xl border-2 border-dashed p-4 transition-colors", arrastando ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)]")}>
            {html.trim() ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode2 className="w-8 h-8 shrink-0 text-[var(--color-primary-blue)]" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{arquivo || "HTML do e-mail"}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{(html.length / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil caracteres</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" onClick={() => entrada.current?.click()} className="h-8 px-2.5 text-[11px] gap-1"><Upload className="w-3 h-3" /> Trocar arquivo</Button>
                  <Button type="button" variant="outline" onClick={() => setVerCodigo((v) => !v)} className="h-8 px-2.5 text-[11px] gap-1"><Code2 className="w-3 h-3" /> {verCodigo ? "Ocultar código" : "Editar código"}</Button>
                  <Button type="button" variant="ghost" aria-label="Remover HTML" title="Remover" onClick={() => { onHtml(""); setArquivo(""); setVerCodigo(false); }} className="h-8 px-2 text-[var(--color-danger)]"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <Upload className="w-7 h-7 text-[var(--color-primary-blue)]" />
                <p className="text-xs font-bold text-[var(--color-text-primary)]">Arraste o arquivo .html aqui</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" onClick={() => entrada.current?.click()} className="h-8 px-3 text-[11px] font-bold">Escolher arquivo</Button>
                  <Button type="button" variant="outline" onClick={() => setVerCodigo(true)} className="h-8 px-3 text-[11px]">Colar o código</Button>
                </div>
              </div>
            )}
          </div>
          {verCodigo && (
            <textarea aria-label="Código HTML" value={html} onSelect={marcarCursor("html")} onChange={(e) => { marcarCursor("html")(e); onHtml(e.target.value); }} onBlur={() => onHtml(comoHtml(html))} rows={12} maxLength={MAX_HTML} spellCheck={false}
              placeholder={"<!doctype html>\n<html>\n  <body>\n    <h1>Olá, {{primeiro_nome}}!</h1>\n  </body>\n</html>"} className={`${campo} w-full resize-y font-mono !text-[11px] leading-relaxed`} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-[var(--color-text-muted)]">Não tem um modelo?</span>
            <Button type="button" variant="outline" onClick={() => void usarExemplo()} className="h-8 px-3 text-[11px] gap-1.5"><Wand2 className="w-3 h-3" /> Usar modelo com a minha marca</Button>
            <Button type="button" variant="ghost" onClick={baixarExemplo} className="h-8 px-3 text-[11px] gap-1.5"><Download className="w-3 h-3" /> Baixar para editar</Button>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)]">Use imagens com endereço completo (https://…). Para escolher onde fica o link de sair da lista, ponha <code>{"{{descadastro}}"}</code> no endereço de um link.</p>
        </>
      )}

      <ImagensDoEmail logo={/^https:\/\//i.test(marca.logo || "") ? marca.logo! : null} mostrarLogo={mostrarLogo} onMostrarLogo={onMostrarLogo} enviar={enviarImagem} onInserir={inserirImagem} />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold text-[var(--color-text-muted)]">Personalizar:</span>
        {VARIAVEIS.map(([v, rotulo]) => (
          <button key={v} type="button" title={`Copiar ${v}`} onClick={() => void copiar(v)}
            className="rounded-full border border-[var(--color-border-default)] bg-transparent px-2.5 py-1 text-[11px] font-bold text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-primary-blue)] hover:border-[var(--color-primary-blue)]">{rotulo}</button>
        ))}
      </div>

      {avisos.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] p-3 text-[11px]">
          {avisos.map((v) => <li key={v.texto} className={v.nivel === "atencao" ? "text-[var(--color-warning,#b45309)]" : "text-[var(--color-text-muted)]"}>{v.nivel === "atencao" ? "⚠ " : "💡 "}{v.texto}</li>)}
        </ul>
      )}
    </div>
  );
}
