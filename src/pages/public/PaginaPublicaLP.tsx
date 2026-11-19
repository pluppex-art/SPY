import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { type ConteudoLP } from "../../lib/paginaLP";
import { type CampoForm } from "../../lib/formularioCampos";

type Cfg = ConteudoLP & { nome: string; empresa: string };

const INPUT = "w-full h-12 px-4 rounded-xl text-base border border-[#D9DCE5] bg-[#ffffff] text-[#14162B] outline-none focus:border-[#14162B] focus:ring-2 focus:ring-[#14162B]/10";

/** Parâmetros da campanha que trouxe a pessoa (UTM e identificadores de anúncio), para o CRM saber de onde o lead veio. */
function lerUtm(): Record<string, string> {
  const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"]) { const v = q.get(k); if (v) out[k] = v.slice(0, 100); }
  return out;
}

async function api(caminho: string, init?: RequestInit) {
  const r = await fetch(caminho, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "Não foi possível concluir. Tente novamente.");
  return j;
}

/** Landing page criada no sistema (/p/:id): conta visita e clique, e cada envio vira lead no CRM da empresa. */
export default function PaginaPublicaLP() {
  const { id = "" } = useParams();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [resp, setResp] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [isca, setIsca] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let contar = "0";
    try { const k = `spy_lpv_${id}`; if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, "1"); contar = "1"; } } catch { contar = "1"; }
    api(`/api/public/lp/${encodeURIComponent(id)}?contar=${contar}`).then(setCfg).catch((e) => setFalha(e.message));
  }, [id]);
  useEffect(() => { if (cfg) document.title = cfg.titulo; }, [cfg]);

  if (falha) return <Fundo><div className="text-center py-24"><XCircle className="w-12 h-12 mx-auto text-[#B5B8C7] mb-3" /><p className="font-bold text-[#14162B]">{falha}</p></div></Fundo>;
  if (!cfg) return <Fundo><div className="flex justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-[#8A8CA0]" /></div></Fundo>;

  const cor = cfg.cor;
  const irParaForm = () => {
    // conta o clique no botão de chamada para ação (mesma contagem do script de rastreio)
    try { navigator.sendBeacon?.("/api/public/lp-track", new Blob([JSON.stringify({ id, tipo: "click", url: location.href })], { type: "text/plain" })); } catch { /* sem beacon */ }
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const falta = cfg.campos.find((c) => c.obrigatorio && !(resp[c.id] ?? "").trim());
    if (falta) { setErro(`Preencha: ${falta.label}.`); return; }
    setEnviando(true);
    try { await api(`/api/public/lp/${encodeURIComponent(id)}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...resp, website: isca, utm: lerUtm() }) }); setFeito(true); }
    catch (er: any) { setErro(er.message); }
    setEnviando(false);
  };

  const campo = (c: CampoForm) => (
    <div key={c.id}>
      <label className="block text-sm font-bold text-[#14162B] mb-1.5" htmlFor={`lp-${c.id}`}>{c.label}{c.obrigatorio && <span style={{ color: cor }}> *</span>}</label>
      {c.tipo === "longo" ? <textarea id={`lp-${c.id}`} rows={3} value={resp[c.id] ?? ""} maxLength={2000} onChange={(e) => setResp({ ...resp, [c.id]: e.target.value })} className={cn(INPUT, "h-auto py-3")} />
        : c.tipo === "opcoes" ? <div className="flex flex-wrap gap-2">{(c.opcoes ?? []).map((o) => <button key={o} type="button" aria-pressed={resp[c.id] === o} onClick={() => setResp({ ...resp, [c.id]: o })} className="px-4 h-11 rounded-xl border text-sm font-semibold" style={resp[c.id] === o ? { background: cor, borderColor: cor, color: "#ffffff" } : { background: "#ffffff", borderColor: "#D9DCE5", color: "#14162B" }}>{o}</button>)}</div>
        : <input id={`lp-${c.id}`} value={resp[c.id] ?? ""} maxLength={300} onChange={(e) => setResp({ ...resp, [c.id]: e.target.value })} className={INPUT} type={c.tipo === "email" ? "email" : "text"} inputMode={c.tipo === "telefone" ? "tel" : c.tipo === "numero" ? "decimal" : undefined}
            autoComplete={c.tipo === "email" ? "email" : c.tipo === "telefone" ? "tel" : c.id === "nome" ? "name" : "off"} placeholder={c.tipo === "telefone" ? "(00) 00000-0000" : undefined} />}
    </div>
  );

  return (
    <Fundo>
      <div className="h-1.5" style={{ background: cor }} />
      <main className="max-w-5xl mx-auto px-4 py-10 md:py-16">
        <div className="grid md:grid-cols-2 gap-10 items-start">
          <section>
            {cfg.empresa && <p className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: cor }}>{cfg.empresa}</p>}
            <h1 className="text-[34px] md:text-5xl font-black leading-[1.05] mt-2 text-[#14162B]">{cfg.titulo}</h1>
            {cfg.subtitulo && <p className="text-lg text-[#4B4E63] mt-4">{cfg.subtitulo}</p>}
            {cfg.bullets.length > 0 && <ul className="mt-6 space-y-2.5">{cfg.bullets.map((b) => <li key={b} className="flex items-start gap-2.5 text-[#14162B]"><CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" style={{ color: cor }} /><span>{b}</span></li>)}</ul>}
            {cfg.imagem && <img src={cfg.imagem} alt="" loading="lazy" className="mt-8 rounded-2xl w-full max-h-[360px] object-cover border border-[#E4E6EE]" />}
            <button type="button" onClick={irParaForm} className="md:hidden mt-8 w-full h-12 rounded-xl font-extrabold" style={{ background: cor, color: "#ffffff" }}>{cfg.cta}</button>
          </section>
          <section ref={formRef} className="rounded-2xl bg-[#ffffff] border border-[#E4E6EE] p-5 md:p-6 shadow-sm md:sticky md:top-6">
            {feito ? (
              <div className="text-center py-8"><CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-600" /><p className="text-xl font-black text-[#14162B]">Pronto!</p><p className="text-[#4B4E63] mt-2">{cfg.mensagemSucesso}</p></div>
            ) : (
              <form onSubmit={enviar} className="space-y-4">
                {cfg.campos.map(campo)}
                <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={isca} onChange={(e) => setIsca(e.target.value)} name="website" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
                {erro && <p className="text-sm text-[#D6303B]" role="alert">{erro}</p>}
                <button type="submit" disabled={enviando} className="w-full h-12 rounded-xl font-extrabold disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: cor, color: "#ffffff" }}>{enviando && <Loader2 className="w-4 h-4 animate-spin" />}{cfg.cta}</button>
                <p className="text-[11px] text-[#8A8CA0] text-center">Seus dados são usados apenas para entrarmos em contato.</p>
              </form>
            )}
          </section>
        </div>
        {cfg.rodape && <p className="text-xs text-[#8A8CA0] text-center mt-14">{cfg.rodape}</p>}
      </main>
    </Fundo>
  );
}

const Fundo = ({ children }: { children: React.ReactNode }) => <div className="min-h-dvh" style={{ background: "#F6F7FB", color: "#14162B", colorScheme: "light" }}>{children}</div>;
