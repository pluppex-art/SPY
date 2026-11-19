import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { type CampoForm } from "../../lib/formularioCampos";

interface Cfg { nome: string; descricao: string; empresa: string; campos: CampoForm[]; passoAPasso: boolean; mensagemSucesso: string }

const INPUT = "w-full h-12 px-4 rounded-xl text-base border border-[#D9DCE5] bg-[#ffffff] text-[#14162B] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15";

async function api(caminho: string, init?: RequestInit) {
  const r = await fetch(caminho, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "Não foi possível concluir. Tente novamente.");
  return j;
}

/** Formulário de captação hospedado no sistema: o lead entra direto no CRM da empresa dona do formulário. */
export default function FormularioPublico() {
  const { formId = "" } = useParams();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [resp, setResp] = useState<Record<string, string>>({});
  const [passo, setPasso] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [isca, setIsca] = useState("");

  useEffect(() => { api(`/api/public/forms/${encodeURIComponent(formId)}/config`).then(setCfg).catch((e) => setFalha(e.message)); }, [formId]);
  useEffect(() => { if (cfg) document.title = cfg.nome; }, [cfg]);

  const campos = cfg?.campos ?? [];
  const atual = campos[passo];
  const valorDe = (c: CampoForm) => (resp[c.id] ?? "").trim();
  const faltaCampo = (c: CampoForm) => (c.obrigatorio && !valorDe(c) ? `Preencha: ${c.label}.` : null);
  const todosOk = useMemo(() => campos.every((c) => !(c.obrigatorio && !(resp[c.id] ?? "").trim())), [campos, resp]);

  if (falha) return <Tela><div className="text-center py-20"><XCircle className="w-12 h-12 mx-auto text-[#B5B8C7] mb-3" /><p className="font-bold">{falha}</p></div></Tela>;
  if (!cfg) return <Tela><div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[#8A8CA0]" /></div></Tela>;
  if (feito) return <Tela><div className="text-center py-16 px-2"><CheckCircle2 className="w-14 h-14 mx-auto text-emerald-600 mb-4" /><h1 className="text-2xl font-black">Pronto!</h1><p className="text-[#5B5E73] mt-2">{cfg.mensagemSucesso}</p></div></Tela>;

  const enviar = async () => {
    setErro(null);
    const falta = campos.map(faltaCampo).find(Boolean);
    if (falta) { setErro(falta); return; }
    setEnviando(true);
    try {
      await api(`/api/public/forms/${encodeURIComponent(formId)}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...resp, website: isca }) });
      setFeito(true);
    } catch (e: any) { setErro(e.message); }
    setEnviando(false);
  };

  const campo = (c: CampoForm) => (
    <div key={c.id}>
      <label className="block text-sm font-bold text-[#14162B] mb-1.5" htmlFor={`f-${c.id}`}>{c.label}{c.obrigatorio && <span className="text-[#D6303B]"> *</span>}</label>
      {c.tipo === "longo" ? <textarea id={`f-${c.id}`} rows={4} value={resp[c.id] ?? ""} onChange={(e) => setResp({ ...resp, [c.id]: e.target.value })} maxLength={2000} className={cn(INPUT, "h-auto py-3")} />
        : c.tipo === "opcoes" ? <div className="flex flex-wrap gap-2">{(c.opcoes ?? []).map((o) => <button key={o} type="button" aria-pressed={resp[c.id] === o} onClick={() => setResp({ ...resp, [c.id]: o })} className={cn("px-4 h-11 rounded-xl border text-sm font-semibold", resp[c.id] === o ? "bg-[#2563EB] border-[#2563EB] text-[#ffffff]" : "bg-[#ffffff] border-[#D9DCE5] text-[#14162B]")}>{o}</button>)}</div>
        : <input id={`f-${c.id}`} value={resp[c.id] ?? ""} onChange={(e) => setResp({ ...resp, [c.id]: e.target.value })} maxLength={300} className={INPUT}
            type={c.tipo === "email" ? "email" : "text"} inputMode={c.tipo === "telefone" ? "tel" : c.tipo === "numero" ? "decimal" : undefined} autoComplete={c.tipo === "email" ? "email" : c.tipo === "telefone" ? "tel" : c.id === "nome" ? "name" : "off"}
            placeholder={c.tipo === "telefone" ? "(00) 00000-0000" : undefined} />}
    </div>
  );

  const ultimo = passo >= campos.length - 1;
  const avancar = () => { const f = atual ? faltaCampo(atual) : null; if (f) { setErro(f); return; } setErro(null); if (ultimo) void enviar(); else setPasso(passo + 1); };

  return (
    <Tela>
      <header className="mb-6">
        {cfg.empresa && <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#2563EB]">{cfg.empresa}</p>}
        <h1 className="text-3xl font-black leading-tight mt-1">{cfg.nome}</h1>
        {cfg.descricao && <p className="text-[#5B5E73] mt-2">{cfg.descricao}</p>}
      </header>
      <form onSubmit={(e) => { e.preventDefault(); if (cfg.passoAPasso) avancar(); else void enviar(); }} className="rounded-2xl bg-[#ffffff] border border-[#E4E6EE] p-5 space-y-5">
        {cfg.passoAPasso ? (<>
          <div><div className="h-1.5 rounded-full bg-[#EEF0F6] overflow-hidden"><div className="h-full bg-[#2563EB] transition-all" style={{ width: `${((passo + 1) / campos.length) * 100}%` }} /></div><p className="text-[11px] font-semibold text-[#8A8CA0] mt-1.5">Pergunta {passo + 1} de {campos.length}</p></div>
          {atual && campo(atual)}
        </>) : campos.map(campo)}
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={isca} onChange={(e) => setIsca(e.target.value)} name="website" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
        {erro && <p className="text-sm text-[#D6303B]" role="alert">{erro}</p>}
        <div className="flex gap-2">
          {cfg.passoAPasso && passo > 0 && <button type="button" onClick={() => { setErro(null); setPasso(passo - 1); }} className="h-12 px-4 rounded-xl border border-[#D9DCE5] text-[#14162B] font-bold flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />Voltar</button>}
          <button type="submit" disabled={enviando || (!cfg.passoAPasso && !todosOk)} className="flex-1 h-12 rounded-xl bg-[#2563EB] text-[#ffffff] font-extrabold disabled:opacity-40 flex items-center justify-center gap-2">
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{cfg.passoAPasso && !ultimo ? <>Continuar<ArrowRight className="w-4 h-4" /></> : "Enviar"}
          </button>
        </div>
      </form>
    </Tela>
  );
}

const Tela = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-dvh text-[#14162B]" style={{ background: "#F6F7FB", colorScheme: "light" }}><div className="max-w-xl mx-auto px-4 py-10">{children}</div></div>
);
