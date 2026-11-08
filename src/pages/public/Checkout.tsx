import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { supabase } from "../../lib/supabase";
import { apiFetch } from "../../lib/apiClient";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Loader2, Lock, ShieldCheck, Tag } from "lucide-react";

type Quote = {
  plan: { code: string; name: string; tagline: string; interval: "monthly" | "yearly"; features: string[] };
  priceCents: number; setupCents: number; discountCents: number; totalCents: number;
  promo: { label: string; code: string | null; auto: boolean } | null;
  badge?: string | null; highlight?: boolean; listCents: number; listSetupCents?: number | null; listMonthlyCents?: number | null;
};
type Dados = { nome: string; telefone: string; email: string; documento: string; empresa: string };
type Pedido = { token: string; totalCents: number; pixPayload: string; status: string };
type Info = { kind: "new" | "renewal"; emailEnviado: boolean | null; email: string };

const LS_TOKEN = "spy_checkout_token";
const POLITICA_VERSAO = "2026-11";
const lsGet = () => { try { return localStorage.getItem(LS_TOKEN) || ""; } catch { return ""; } };
const lsSet = (v: string) => { try { if (v) localStorage.setItem(LS_TOKEN, v); else localStorage.removeItem(LS_TOKEN); } catch { /* sem armazenamento: segue sem */ } };

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const maskDoc = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
};
const maskFone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Algo deu errado. Tente novamente.");
  return json as T;
}

const campo = "w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface)] px-3.5 py-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)]";
const rotulo = "block text-xs font-semibold text-[var(--color-text-muted)] mb-1.5";
const botao = "inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary-blue)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50 transition-opacity";
const botaoSec = "inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)]";

/** Checkout público: cadastro rápido em passos, escolha do plano (com cupom) e pagamento por Pix com QR Code. */
export default function Checkout() {
  const [params] = useSearchParams();
  const [passo, setPasso] = useState(0);
  const [dados, setDados] = useState<Dados>({ nome: "", telefone: "", email: "", documento: "", empresa: "" });
  const [planos, setPlanos] = useState<Quote[] | null>(null);
  const [single, setSingle] = useState<Quote | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [habilitado, setHabilitado] = useState(true);
  const [planoCode, setPlanoCode] = useState(params.get("plano") || "");
  const [cupom, setCupom] = useState(params.get("cupom") || "");
  const [cotacao, setCotacao] = useState<Quote | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [status, setStatus] = useState("pending");
  const [qr, setQr] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [semSessao, setSemSessao] = useState(false);
  const renovar = params.get("renovar") === "1";
  const tentativasAcesso = useRef(0);
  const topo = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = "Assinar o S.P.Y."; }, []);

  useEffect(() => {
    api<{ enabled: boolean; single: Quote | null; plans: Quote[] }>("/api/checkout/plans")
      .then((r) => {
        setHabilitado(r.enabled);
        setPlanos(r.plans);
        if (r.single) { setSingle(r.single); setCotacao(r.single); setPlanoCode(r.single.plan.code); return; }
        setPlanoCode((atual) => (r.plans.some((p) => p.plan.code === atual) ? atual : (r.plans.find((p) => p.highlight) ?? r.plans[0])?.plan.code ?? ""));
      })
      .catch(() => setPlanos([]));
  }, []);

  const cotar = useCallback(async (code: string, promoCode: string) => {
    if (!code) return;
    try { setCotacao(await api<Quote>("/api/checkout/quote", { planCode: code, promoCode })); setErro(""); }
    catch (e: any) { setErro(e.message); }
  }, []);
  useEffect(() => { if (passo === 1) void cotar(planoCode, cupom); }, [passo, planoCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const PASSOS = renovar ? ["Pagamento"] : single ? ["Seus dados", "Pagamento"] : ["Seus dados", "Plano", "Pagamento"];
  const payIdx = PASSOS.length - 1;
  const irPara = (n: number) => { setErro(""); setPasso(n); topo.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const dadosOk = useMemo(() => {
    const d = dados.documento.replace(/\D/g, "");
    return dados.nome.trim().length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email) && dados.telefone.replace(/\D/g, "").length >= 10 &&
      (d.length === 11 || d.length === 14) && dados.empresa.trim().length >= 2 && aceite;
  }, [dados, aceite]);

  const mostrarPedido = useCallback(async (p: Pedido) => {
    setPedido(p); setStatus(p.status);
    setQr(await QRCode.toDataURL(p.pixPayload, { margin: 1, width: 320, errorCorrectionLevel: "M" }));
  }, []);

  // Recarregar a página (ou voltar depois) reaproveita o pedido aberto: nunca gera um segundo Pix para quem já pagou.
  const restaurado = useRef(false);
  useEffect(() => {
    if (planos === null || restaurado.current) return;
    restaurado.current = true;
    const token = lsGet();
    if (renovar || !token) return;
    api<{ status: string; totalCents: number; pixPayload: string; nome: string; email: string; kind: "new" | "renewal"; emailEnviado: boolean | null; empresa?: string }>(`/api/checkout/order/${token}`)
      .then(async (r) => {
        // So restaura pedido novo e ainda em andamento; renovacao nunca (computador compartilhado).
        if (r.kind !== "new" || r.status === "expired" || r.status === "canceled" || r.status === "paid") { lsSet(""); return; }
        setDados((d) => ({ ...d, nome: r.nome, email: r.email, empresa: r.empresa || d.empresa }));
        setInfo({ kind: r.kind, emailEnviado: r.emailEnviado, email: r.email });
        await mostrarPedido({ token, totalCents: r.totalCents, pixPayload: r.pixPayload, status: r.status });
        setPasso(PASSOS.length - 1);
      })
      .catch(() => lsSet(""));
  }, [planos, single, renovar]); // eslint-disable-line react-hooks/exhaustive-deps

  // Renovação: cliente logado gera o Pix do plano atual da empresa dele.
  useEffect(() => {
    if (!renovar || !supabase) return;
    let vivo = true;
    (async () => {
      const { data } = await supabase!.auth.getSession();
      if (!data.session) { if (vivo) setSemSessao(true); return; }
      setOcupado(true);
      try {
        const res = await apiFetch("/api/checkout/renewal-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Não foi possível gerar o Pix da renovação.");
        if (!vivo) return;
        setInfo({ kind: "renewal", emailEnviado: null, email: data.session.user.email || "" });
        await mostrarPedido(json as Pedido);
        setPasso(0);
      } catch (e: any) { if (vivo) setErro(e.message); }
      finally { if (vivo) setOcupado(false); }
    })();
    return () => { vivo = false; };
  }, [renovar, mostrarPedido]);

  const gerarPix = async () => {
    setOcupado(true); setErro("");
    try {
      const p = await api<Pedido>("/api/checkout/order", { planCode: planoCode, promoCode: cupom, ...dados, documento: dados.documento.replace(/\D/g, ""), consentimento: aceite, politicaVersao: POLITICA_VERSAO });
      lsSet(p.token);
      setInfo({ kind: "new", emailEnviado: null, email: dados.email });
      await mostrarPedido(p);
      irPara(payIdx);
    } catch (e: any) { setErro(e.message); }
    finally { setOcupado(false); }
  };

  // Acompanha o pedido: quando o pagamento for confirmado, a tela muda sozinha.
  useEffect(() => {
    if (!pedido || status === "expired" || status === "canceled") return;
    // Pago: continua consultando enquanto o envio do acesso nao foi concluido (emailEnviado null), por no maximo ~5 min.
    if (status === "paid" && (info?.kind === "renewal" || (info?.emailEnviado ?? null) !== null)) return;
    const t = setInterval(() => {
      if (status === "paid" && ++tentativasAcesso.current > 40) { // desiste de esperar: orienta o caminho seguro ("Esqueci a senha")
        setInfo((i) => (i ? { ...i, emailEnviado: false } : i)); return;
      }
      api<{ status: string; kind: "new" | "renewal"; emailEnviado: boolean | null; email: string }>(`/api/checkout/order/${pedido.token}`)
        .then((r) => { setStatus(r.status); setInfo({ kind: r.kind, emailEnviado: r.emailEnviado, email: r.email }); if (r.status === "expired" || r.status === "canceled") lsSet(""); })
        .catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [pedido, status, info]);

  const copiar = async () => {
    if (!pedido) return;
    try { await navigator.clipboard.writeText(pedido.pixPayload); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { setErro("Não foi possível copiar. Selecione o código e copie manualmente."); }
  };

  const avisarPagamento = async () => {
    if (!pedido || !arquivo) return;
    setOcupado(true); setErro("");
    try {
      const data = await new Promise<string>((ok, no) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result).split(",")[1] || "");
        fr.onerror = () => no(new Error("Não foi possível ler o arquivo."));
        fr.readAsDataURL(arquivo);
      });
      const r = await api<{ status: string }>(`/api/checkout/order/${pedido.token}/paid`, { comprovante: { type: arquivo.type, data } });
      setStatus(r.status);
    }
    catch (e: any) { setErro(e.message); if (/expirou/i.test(e.message)) setStatus("expired"); }
    finally { setOcupado(false); }
  };

  const set = (k: keyof Dados) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = k === "documento" ? maskDoc(e.target.value) : k === "telefone" ? maskFone(e.target.value) : e.target.value;
    setDados((d) => ({ ...d, [k]: v }));
  };

  const pago = status === "paid";
  useEffect(() => { if (pago) lsSet(""); }, [pago]);
  const novoPedido = () => { lsSet(""); setPedido(null); setQr(""); setStatus("pending"); setArquivo(null); setErro(""); if (renovar) window.location.reload(); else irPara(single ? 0 : 1); };

  return (
    <div className="min-h-dvh bg-[var(--color-surface)] bg-[radial-gradient(60%_40%_at_50%_0%,color-mix(in_srgb,var(--color-primary-blue)_10%,transparent),transparent)] px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl" ref={topo}>
        <h1 className="text-center text-2xl font-black text-[var(--color-text-primary)]">Assinar o S.P.Y.</h1>
        <p className="mt-1 text-center text-sm text-[var(--color-text-muted)]">Leva menos de 2 minutos. Pagamento por Pix.</p>

        {/* Indicador de passos */}
        <ol className="mt-6 flex items-center justify-center gap-2" aria-label="Etapas">
          {PASSOS.map((nome, i) => {
            const feito = i < passo || pago;
            const atual = i === passo && !pago;
            return (
              <li key={nome} className="flex items-center gap-2" aria-current={atual ? "step" : undefined}>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${feito ? "bg-emerald-500 text-white" : atual ? "bg-[var(--color-primary-blue)] text-white" : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] border border-[var(--color-border-default)]"}`}>
                  {feito ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={`hidden text-xs font-semibold sm:inline ${atual ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}`}>{nome}</span>
                {i < PASSOS.length - 1 && <span className="mx-1 h-px w-6 bg-[var(--color-border-default)]" />}
              </li>
            );
          })}
        </ol>

        <div className="mt-6 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-5 sm:p-7 shadow-sm">
          {planos === null && <p className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}

          {planos !== null && !habilitado && (
            <p className="text-sm text-[var(--color-text-primary)]">O pagamento online ainda não está liberado. Fale com a gente pelo WhatsApp e finalizamos juntos.</p>
          )}

          {planos !== null && habilitado && !renovar && passo === 0 && (
            <form onSubmit={(e) => { e.preventDefault(); if (dadosOk) { if (single) void gerarPix(); else irPara(1); } else setErro("Confira os campos: todos são obrigatórios, o CPF/CNPJ precisa estar completo e você precisa aceitar o uso dos dados."); }} className="space-y-4" noValidate>
              <h2 className="text-lg font-black text-[var(--color-text-primary)]">Seus dados</h2>
              <div><label className={rotulo} htmlFor="ck-nome">Nome completo</label><input id="ck-nome" className={campo} autoComplete="name" value={dados.nome} onChange={set("nome")} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={rotulo} htmlFor="ck-fone">Telefone (WhatsApp)</label><input id="ck-fone" className={campo} inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={dados.telefone} onChange={set("telefone")} /></div>
                <div><label className={rotulo} htmlFor="ck-email">E-mail</label><input id="ck-email" type="email" className={campo} autoComplete="email" value={dados.email} onChange={set("email")} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={rotulo} htmlFor="ck-doc">CPF ou CNPJ</label><input id="ck-doc" className={campo} inputMode="numeric" value={dados.documento} onChange={set("documento")} /></div>
                <div><label className={rotulo} htmlFor="ck-emp">Nome da empresa</label><input id="ck-emp" className={campo} autoComplete="organization" value={dados.empresa} onChange={set("empresa")} /></div>
              </div>
              <label className="flex items-start gap-2 text-xs text-[var(--color-text-muted)]">
                <input type="checkbox" className="mt-0.5" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
                <span>Li e concordo com os <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline">Termos de Uso</a> e com a <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">Política de Privacidade</a>, e autorizo o uso dos meus dados para o cadastro, a cobrança e o contato sobre a minha assinatura (LGPD).</span>
              </label>
              {erro && <p role="alert" className="text-sm font-semibold text-rose-500">{erro}</p>}
              <button type="submit" className={`${botao} w-full`} disabled={ocupado}>{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {single ? "Ir para o pagamento" : "Continuar"} <ArrowRight className="h-4 w-4" /></button>
            </form>
          )}

          {planos !== null && habilitado && !renovar && !single && passo === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-black text-[var(--color-text-primary)]">Escolha seu plano</h2>
              <div className="space-y-2.5" role="radiogroup" aria-label="Plano">
                {planos.map((p) => (
                  <button key={p.plan.code} type="button" role="radio" aria-checked={planoCode === p.plan.code} onClick={() => setPlanoCode(p.plan.code)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${planoCode === p.plan.code ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10" : "border-[var(--color-border-default)] bg-[var(--color-surface)]"}`}>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-black text-[var(--color-text-primary)]">{p.plan.name}{p.badge && <span className="ml-2 rounded-full bg-[var(--color-primary-blue)] px-2 py-0.5 text-[10px] font-black uppercase text-white">{p.badge}</span>}</span>
                      <span className="text-right">
                        {p.discountCents > 0 && <span className="mr-2 text-xs text-[var(--color-text-muted)] line-through">{brl(p.priceCents + p.setupCents)}</span>}
                        <span className="font-black text-[var(--color-text-primary)]">{brl(p.totalCents)}</span>
                      </span>
                    </span>
                    {p.plan.tagline && <span className="mt-1 block text-xs text-[var(--color-text-muted)]">{p.plan.tagline}</span>}
                    {p.promo && <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-emerald-500"><Tag className="h-3 w-3" /> {p.promo.label}</span>}
                  </button>
                ))}
                {planos.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">Nenhum plano disponível no momento.</p>}
              </div>

              <div>
                <label className={rotulo} htmlFor="ck-cupom">Tem um cupom?</label>
                <div className="flex gap-2">
                  <input id="ck-cupom" className={campo} value={cupom} onChange={(e) => setCupom(e.target.value)} placeholder="Digite o cupom" />
                  <button type="button" className={botaoSec} onClick={() => void cotar(planoCode, cupom)}>Aplicar</button>
                </div>
              </div>

              {cotacao && (
                <dl className="space-y-1.5 rounded-xl bg-[var(--color-surface)] p-4 text-sm">
                  <div className="flex justify-between"><dt className="text-[var(--color-text-muted)]">{cotacao.plan.name} ({cotacao.plan.interval === "yearly" ? "anual" : "mensal"})</dt><dd>{brl(cotacao.priceCents)}</dd></div>
                  {cotacao.setupCents > 0 && <div className="flex justify-between"><dt className="text-[var(--color-text-muted)]">Implantação (uma vez)</dt><dd>{brl(cotacao.setupCents)}</dd></div>}
                  {cotacao.discountCents > 0 && <div className="flex justify-between text-emerald-500"><dt>{cotacao.promo?.label || "Desconto"}</dt><dd>− {brl(cotacao.discountCents)}</dd></div>}
                  <div className="flex justify-between border-t border-[var(--color-border-default)] pt-2 text-base font-black text-[var(--color-text-primary)]"><dt>Total hoje</dt><dd>{brl(cotacao.totalCents)}</dd></div>
                </dl>
              )}
              {erro && <p role="alert" className="text-sm font-semibold text-rose-500">{erro}</p>}
              <div className="flex gap-3">
                <button type="button" className={botaoSec} onClick={() => irPara(0)}><ArrowLeft className="h-4 w-4" /> Voltar</button>
                <button type="button" className={`${botao} flex-1`} disabled={ocupado || !cotacao || !planoCode} onClick={() => void gerarPix()}>
                  {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Gerar Pix
                </button>
              </div>
            </div>
          )}

          {renovar && !pedido && semSessao && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-[var(--color-text-primary)]">Entre na sua conta do S.P.Y. para renovar a assinatura.</p>
              <Link to="/login" className={`${botao} w-full`}>Entrar</Link>
            </div>
          )}
          {renovar && !pedido && !semSessao && (
            erro ? <p role="alert" className="text-sm font-semibold text-rose-500">{erro}</p>
              : <p className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Gerando o Pix da renovação…</p>
          )}

          {passo === payIdx && pedido && !pago && (
            <div className="space-y-5 text-center">
              <h2 className="text-lg font-black text-[var(--color-text-primary)]">Pague com Pix</h2>
              {single && single.listCents > pedido.totalCents && (
                <div className="rounded-xl bg-[var(--color-surface)] p-4">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{single.plan.name} — com tudo incluído</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">de <span className="line-through">{brl(single.listCents)}</span> por</p>
                  {single.listSetupCents && single.listMonthlyCents ? (
                    <p className="text-[11px] text-[var(--color-text-muted)]">(valor de tabela: {brl(single.listSetupCents)} de implantação + {brl(single.listMonthlyCents)} de mensalidade)</p>
                  ) : null}
                  <p className="text-3xl font-black text-[var(--color-text-primary)]">{brl(pedido.totalCents)}</p>
                  <p className="mt-1 text-xs font-bold text-emerald-500">Sem taxa de implantação</p>
                </div>
              )}
              {!(single && single.listCents > pedido.totalCents) && <p className="text-3xl font-black text-[var(--color-text-primary)]">{brl(pedido.totalCents)}</p>}
              {status === "expired" || status === "canceled" ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-rose-500">Este Pix {status === "canceled" ? "foi cancelado" : "expirou"}. Gere um novo para continuar.</p>
                  <button type="button" className={`${botao} w-full`} onClick={novoPedido}>Gerar novo Pix</button>
                </div>
              ) : (
                <>
                  {qr && <img src={qr} alt="QR Code do Pix" width={240} height={240} className="mx-auto rounded-xl bg-white p-2" />}
                  <p className="text-xs text-[var(--color-text-muted)]">Abra o app do seu banco, escolha Pix e leia o QR Code — ou use o Pix copia e cola:</p>
                  <div className="flex gap-2">
                    <input readOnly aria-label="Pix copia e cola" value={pedido.pixPayload} onFocus={(e) => e.target.select()} className={`${campo} font-mono text-xs`} />
                    <button type="button" className={botaoSec} onClick={() => void copiar()}>{copiado ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />} {copiado ? "Copiado" : "Copiar"}</button>
                  </div>
                  {status === "awaiting_confirmation" ? (
                    <p className="flex items-center justify-center gap-2 rounded-xl bg-amber-500/10 p-3 text-sm font-semibold text-amber-500"><Loader2 className="h-4 w-4 animate-spin" /> Comprovante recebido! Assim que a nossa equipe conferir o pagamento, liberamos o seu acesso e avisamos por e-mail. Esta tela atualiza sozinha.</p>
                  ) : (
                    <div className="space-y-3 text-left">
                      <label className={rotulo} htmlFor="ck-comp">Depois de pagar, anexe o comprovante do Pix (foto ou PDF, até 3 MB)</label>
                      <input id="ck-comp" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={campo}
                        onChange={(e) => { const f = e.target.files?.[0] ?? null; setErro(f && f.size > 3 * 1024 * 1024 ? "O comprovante precisa ter até 3 MB." : ""); setArquivo(f && f.size <= 3 * 1024 * 1024 ? f : null); }} />
                      <button type="button" className={`${botao} w-full`} disabled={ocupado || !arquivo} onClick={() => void avisarPagamento()}>
                        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Já fiz o pagamento
                      </button>
                    </div>
                  )}
                </>
              )}
              {erro && <p role="alert" className="text-sm font-semibold text-rose-500">{erro}</p>}
              <p className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-text-muted)]"><Lock className="h-3 w-3" /> O Pix vai direto para a conta da empresa. Validade: 24 horas.</p>
            </div>
          )}

          {pago && (
            <div className="space-y-3 py-4 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
              {info?.kind === "renewal" ? (
                <>
                  <h2 className="text-xl font-black text-[var(--color-text-primary)]">Pagamento confirmado!</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Sua assinatura está em dia. É só entrar normalmente.</p>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-black text-[var(--color-text-primary)]">Pagamento confirmado!</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {(info?.emailEnviado ?? null) === null
                      ? <>Estamos finalizando seu acesso… Esta tela atualiza sozinha e, em instantes, você recebe o link para definir sua senha em <strong>{info?.email || dados.email}</strong>.</>
                      : info?.emailEnviado !== true
                      ? <>Seu acesso foi liberado, mas o e-mail para <strong>{info?.email || dados.email}</strong> não saiu. Abra a tela de login e clique em <strong>“Esqueci a senha”</strong> para criar a sua senha.</>
                      : <>Enviamos para <strong>{info?.email || dados.email}</strong> o link para você definir sua senha e entrar (o link tem validade limitada). Se não encontrar o e-mail ou o link expirar, use <strong>“Esqueci a senha”</strong> na tela de login.</>}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">Nosso time vai chamar no WhatsApp para a implantação.</p>
                </>
              )}
              <Link to="/login" className={`${botao} w-full`}>Ir para o login</Link>
            </div>
          )}
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-[var(--color-text-muted)]"><ShieldCheck className="h-3.5 w-3.5" /> Seus dados são usados só para o cadastro e a cobrança (LGPD).</p>
      </div>
    </div>
  );
}
