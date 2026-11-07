import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Loader2, Lock, ShieldCheck, Tag } from "lucide-react";

type Quote = {
  plan: { code: string; name: string; tagline: string; interval: "monthly" | "yearly"; features: string[] };
  priceCents: number; setupCents: number; discountCents: number; totalCents: number;
  promo: { label: string; code: string | null; auto: boolean } | null;
  badge?: string | null; highlight?: boolean;
};
type Dados = { nome: string; telefone: string; email: string; documento: string; empresa: string };
type Pedido = { token: string; totalCents: number; pixPayload: string; status: string };

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PASSOS = ["Seus dados", "Plano", "Pagamento"];

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
  const topo = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = "Assinar o S.P.Y."; }, []);

  useEffect(() => {
    api<{ enabled: boolean; plans: Quote[] }>("/api/checkout/plans")
      .then((r) => {
        setHabilitado(r.enabled);
        setPlanos(r.plans);
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

  const irPara = (n: number) => { setErro(""); setPasso(n); topo.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const dadosOk = useMemo(() => {
    const d = dados.documento.replace(/\D/g, "");
    return dados.nome.trim().length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email) && dados.telefone.replace(/\D/g, "").length >= 10 &&
      (d.length === 11 || d.length === 14) && dados.empresa.trim().length >= 2;
  }, [dados]);

  const gerarPix = async () => {
    setOcupado(true); setErro("");
    try {
      const p = await api<Pedido>("/api/checkout/order", { planCode: planoCode, promoCode: cupom, ...dados, documento: dados.documento.replace(/\D/g, "") });
      setPedido(p); setStatus(p.status);
      setQr(await QRCode.toDataURL(p.pixPayload, { margin: 1, width: 320, errorCorrectionLevel: "M" }));
      irPara(2);
    } catch (e: any) { setErro(e.message); }
    finally { setOcupado(false); }
  };

  // Acompanha o pedido: quando o pagamento for confirmado, a tela muda sozinha.
  useEffect(() => {
    if (!pedido || status === "paid" || status === "expired" || status === "canceled") return;
    const t = setInterval(() => {
      api<{ status: string }>(`/api/checkout/order/${pedido.token}`).then((r) => setStatus(r.status)).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [pedido, status]);

  const copiar = async () => {
    if (!pedido) return;
    try { await navigator.clipboard.writeText(pedido.pixPayload); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { setErro("Não foi possível copiar. Selecione o código e copie manualmente."); }
  };

  const avisarPagamento = async () => {
    if (!pedido) return;
    setOcupado(true); setErro("");
    try { const r = await api<{ status: string }>(`/api/checkout/order/${pedido.token}/paid`, {}); setStatus(r.status); }
    catch (e: any) { setErro(e.message); }
    finally { setOcupado(false); }
  };

  const set = (k: keyof Dados) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = k === "documento" ? maskDoc(e.target.value) : k === "telefone" ? maskFone(e.target.value) : e.target.value;
    setDados((d) => ({ ...d, [k]: v }));
  };

  const pago = status === "paid";

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

          {planos !== null && habilitado && passo === 0 && (
            <form onSubmit={(e) => { e.preventDefault(); if (dadosOk) irPara(1); else setErro("Confira os campos: todos são obrigatórios e o CPF/CNPJ precisa estar completo."); }} className="space-y-4" noValidate>
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
              {erro && <p role="alert" className="text-sm font-semibold text-rose-500">{erro}</p>}
              <button type="submit" className={`${botao} w-full`}>Continuar <ArrowRight className="h-4 w-4" /></button>
            </form>
          )}

          {planos !== null && habilitado && passo === 1 && (
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

          {passo === 2 && pedido && !pago && (
            <div className="space-y-5 text-center">
              <h2 className="text-lg font-black text-[var(--color-text-primary)]">Pague com Pix</h2>
              <p className="text-3xl font-black text-[var(--color-text-primary)]">{brl(pedido.totalCents)}</p>
              {status === "expired" || status === "canceled" ? (
                <p className="text-sm font-semibold text-rose-500">Este Pix expirou. Volte e gere um novo.</p>
              ) : (
                <>
                  {qr && <img src={qr} alt="QR Code do Pix" width={240} height={240} className="mx-auto rounded-xl bg-white p-2" />}
                  <p className="text-xs text-[var(--color-text-muted)]">Abra o app do seu banco, escolha Pix e leia o QR Code — ou use o Pix copia e cola:</p>
                  <div className="flex gap-2">
                    <input readOnly aria-label="Pix copia e cola" value={pedido.pixPayload} onFocus={(e) => e.target.select()} className={`${campo} font-mono text-xs`} />
                    <button type="button" className={botaoSec} onClick={() => void copiar()}>{copiado ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />} {copiado ? "Copiado" : "Copiar"}</button>
                  </div>
                  {status === "awaiting_confirmation" ? (
                    <p className="flex items-center justify-center gap-2 rounded-xl bg-amber-500/10 p-3 text-sm font-semibold text-amber-500"><Loader2 className="h-4 w-4 animate-spin" /> Recebemos seu aviso. Estamos conferindo o Pix — esta tela atualiza sozinha.</p>
                  ) : (
                    <button type="button" className={`${botao} w-full`} disabled={ocupado} onClick={() => void avisarPagamento()}>
                      {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Já fiz o pagamento
                    </button>
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
              <h2 className="text-xl font-black text-[var(--color-text-primary)]">Pagamento confirmado!</h2>
              <p className="text-sm text-[var(--color-text-muted)]">Enviamos para <strong>{dados.email}</strong> o link para você definir sua senha e entrar. Nosso time vai chamar no WhatsApp para a implantação.</p>
            </div>
          )}
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-[var(--color-text-muted)]"><ShieldCheck className="h-3.5 w-3.5" /> Seus dados são usados só para o cadastro e a cobrança (LGPD).</p>
      </div>
    </div>
  );
}
