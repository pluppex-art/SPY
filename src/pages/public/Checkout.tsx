import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBRLCentavos } from "../../lib/dinheiro";
import { Link, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { supabase } from "../../lib/supabase";
import { apiFetch } from "../../lib/apiClient";
import { SocialProofPopup } from "../../components/SocialProofPopup";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Loader2, Lock, MessageCircle, QrCode, ShieldCheck, Star, Tag, Upload, UserCheck } from "lucide-react";
import { Perguntas, PERGUNTAS } from "../vendas/comum";
import "./checkout.css";

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

const brl = (c: number) => formatBRLCentavos(c);

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

const periodo = (q: Quote) => (q.plan.interval === "yearly" ? "/ano" : "/mês");
/** Cores da página de venda de onde a pessoa veio (?tema=). Valor desconhecido = tema roxo do S.P.Y. */
const TEMAS: Record<string, string> = { amarelo: "ck--amarelo sv-recupera" };

const DEPOIS: [typeof Check, string, string][] = [
  [CheckCircle2, "Pagamento conferido", "Você anexa o comprovante e a nossa equipe confirma o Pix."],
  [UserCheck, "Acesso liberado", "O link para criar a sua senha chega no e-mail informado."],
  [MessageCircle, "Implantação", "A equipe chama no WhatsApp para configurar, conectar e treinar o time."],
];

/** O que acontece depois do pagamento. Na tela de obrigado, `feitos` marca as etapas concluídas e a próxima fica em destaque. */
function Depois({ feitos }: { feitos?: number }) {
  return (
    <ol className="ck-depois">
      {DEPOIS.map(([Icone, titulo, texto], i) => (
        <li key={titulo} data-feito={feitos !== undefined && i < feitos} data-atual={i === feitos}>
          <span className="ck-depois__icone"><Icone size={22} strokeWidth={1.75} aria-hidden="true" /></span>
          <h3>{titulo}</h3>
          <p>{texto}</p>
        </li>
      ))}
    </ol>
  );
}

/** Checkout público: plano, cadastro e pagamento por Pix com QR Code; termina na tela de obrigado. */
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
  const [pedidoPlano, setPedidoPlano] = useState("");
  const [status, setStatus] = useState("pending");
  const [qr, setQr] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [semSessao, setSemSessao] = useState(false);
  const renovar = params.get("renovar") === "1";
  const tema = TEMAS[params.get("tema") || ""] || "";
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
  useEffect(() => { if (!single && !renovar && planos?.some((p) => p.plan.code === planoCode)) void cotar(planoCode, cupom); }, [planos, planoCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const PASSOS = renovar ? ["Pagamento"] : single ? ["Seus dados", "Pagamento"] : ["Plano", "Seus dados", "Pagamento"];
  const payIdx = PASSOS.length - 1;
  const passoDados = single ? 0 : 1;
  const irPara = (n: number) => { setErro(""); setPasso(n); topo.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const cotacaoPronta = !!cotacao && cotacao.plan.code === planoCode;

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
    api<{ status: string; totalCents: number; planName?: string; pixPayload: string; nome: string; email: string; kind: "new" | "renewal"; emailEnviado: boolean | null; empresa?: string }>(`/api/checkout/order/${token}`)
      .then(async (r) => {
        // So restaura pedido novo e ainda em andamento; renovacao nunca (computador compartilhado).
        if (r.kind !== "new" || r.status === "expired" || r.status === "canceled" || r.status === "paid") { lsSet(""); return; }
        setDados((d) => ({ ...d, nome: r.nome, email: r.email, empresa: r.empresa || d.empresa }));
        setInfo({ kind: r.kind, emailEnviado: r.emailEnviado, email: r.email });
        setPedidoPlano(r.planName || "");
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
        setPedidoPlano(json.planName || "");
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
      setPedidoPlano(cotacao?.plan.name || "");
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
      topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    catch (e: any) { setErro(e.message); if (/expirou/i.test(e.message)) setStatus("expired"); }
    finally { setOcupado(false); }
  };

  const set = (k: keyof Dados) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = k === "documento" ? maskDoc(e.target.value) : k === "telefone" ? maskFone(e.target.value) : e.target.value;
    setDados((d) => ({ ...d, [k]: v }));
    setErro("");
  };

  const pago = status === "paid";
  const conferindo = status === "awaiting_confirmation";
  const obrigado = !!pedido && (pago || conferindo);
  useEffect(() => { if (pago) lsSet(""); }, [pago]);
  const novoPedido = () => { lsSet(""); setPedido(null); setQr(""); setStatus("pending"); setArquivo(null); setErro(""); if (renovar) window.location.reload(); else irPara(passoDados); };

  const aberto = planos !== null && habilitado;
  const pagando = !!pedido && passo === payIdx && !obrigado;
  // No pagamento vale o que está no pedido; o detalhamento só aparece se a cotação na tela for a mesma do pedido.
  const detalhe = pedido ? (cotacao && cotacao.totalCents === pedido.totalCents && cotacao.plan.name === pedidoPlano ? cotacao : null) : cotacao;

  const alerta = erro && <p role="alert" className="ck-erro">{erro}</p>;
  const voltar = (n: number) => (<button type="button" className="sp-btn sp-btn--outline" onClick={() => irPara(n)}><ArrowLeft size={18} aria-hidden="true" /> Voltar</button>);

  return (
    <div className={`sp-root sv ck ${tema}`}>
      <header className="sp-header ck-topo">
        <div className="sp-wrap ck-topo__barra">
          <Link to="/landing" className="sp-brand" aria-label="S.P.Y. — conhecer a plataforma">
            <img className="sp-brand__img" src="/logo-topbar.webp" alt="S.P.Y. SOA" width={720} height={320} decoding="async" />
          </Link>
          <span className="ck-seguro"><Lock size={16} aria-hidden="true" /> Pagamento por Pix</span>
        </div>
      </header>

      <main ref={topo}>
        <div className="ck-abertura">
          <div className="sp-wrap">
            <h1>{obrigado ? (pago ? "Pagamento confirmado!" : "Pedido recebido!") : renovar ? "Renovar a assinatura" : "Coloque o S.P.Y. no seu time"}</h1>
            <p>{obrigado ? "Veja abaixo o que acontece agora." : "Escolha o plano, informe seus dados e pague por Pix."}</p>
            <ol className="ck-passos" aria-label="Etapas">
              {PASSOS.map((nome, i) => {
                const feito = i < passo || obrigado;
                return (
                  <li key={nome} data-feito={feito} aria-current={i === passo && !obrigado ? "step" : undefined}>
                    <span>{feito ? <Check size={16} aria-hidden="true" /> : i + 1}</span>
                    <em>{nome}</em>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <div className="sp-wrap ck-corpo">
          {planos === null && <p className="ck-aviso"><Loader2 className="ck-gira" size={20} aria-hidden="true" /> Carregando…</p>}
          {planos !== null && !habilitado && <p className="ck-aviso">O pagamento online ainda não está liberado. <Link to="/contato" className="sp-link">Fale com a gente</Link> e finalizamos juntos.</p>}

          {aberto && obrigado && (
            <section className="ck-obrigado" aria-live="polite">
              <div className="ck-obrigado__selo">{pago ? <Check size={44} aria-hidden="true" /> : <Loader2 className="ck-gira" size={40} aria-hidden="true" />}</div>
              {info?.kind === "renewal" ? (
                <>
                  <h2>{pago ? "Sua assinatura está em dia." : "Comprovante recebido."}</h2>
                  <p>{pago ? "É só entrar normalmente." : "Assim que a nossa equipe conferir o pagamento, a renovação é confirmada. Esta tela atualiza sozinha."}</p>
                </>
              ) : !pago ? (
                <>
                  <h2>Obrigado{dados.nome ? `, ${dados.nome.trim().split(" ")[0]}` : ""}! O comprovante chegou.</h2>
                  <p>Assim que a nossa equipe conferir o pagamento, liberamos o seu acesso e avisamos em <strong>{info?.email || dados.email}</strong>. Esta tela atualiza sozinha.</p>
                </>
              ) : (
                <>
                  <h2>Bem-vindo ao S.P.Y.!</h2>
                  <p>
                    {(info?.emailEnviado ?? null) === null
                      ? <>Estamos finalizando seu acesso… Esta tela atualiza sozinha e, em instantes, você recebe o link para definir sua senha em <strong>{info?.email || dados.email}</strong>.</>
                      : info?.emailEnviado !== true
                      ? <>Seu acesso foi liberado, mas o e-mail para <strong>{info?.email || dados.email}</strong> não saiu. Abra a tela de login e clique em <strong>“Esqueci a senha”</strong> para criar a sua senha.</>
                      : <>Enviamos para <strong>{info?.email || dados.email}</strong> o link para você definir sua senha e entrar (o link tem validade limitada). Se não encontrar o e-mail ou o link expirar, use <strong>“Esqueci a senha”</strong> na tela de login.</>}
                  </p>
                </>
              )}
              <div className="ck-obrigado__pedido">
                {pedidoPlano && <span>Plano <strong>{pedidoPlano}</strong></span>}
                <span>Valor do Pix <strong>{brl(pedido!.totalCents)}</strong></span>
              </div>
              {info?.kind !== "renewal" && <Depois feitos={pago ? 2 : 0} />}
              <div className="ck-botoes">
                {pago ? <Link to="/login" className="sp-btn sp-btn--primary">Ir para o login <ArrowRight size={18} aria-hidden="true" /></Link>
                  : <Link to="/landing" className="sp-btn sp-btn--outline">Conhecer mais a plataforma</Link>}
              </div>
              {alerta}
            </section>
          )}

          {aberto && !obrigado && (
            <div className="ck-grade">
              <div className="ck-cartao">
                {!renovar && !single && passo === 0 && (
                  <>
                    <h2>1. Quantas pessoas vão usar?</h2>
                    <div className="ck-planos" role="radiogroup" aria-label="Plano">
                      {planos!.map((p) => (
                        <button key={p.plan.code} type="button" role="radio" aria-checked={planoCode === p.plan.code} onClick={() => setPlanoCode(p.plan.code)} className="ck-plano">
                          <span className="ck-plano__nome">{p.plan.name}{p.badge && <em><Star size={12} aria-hidden="true" /> {p.badge}</em>}</span>
                          <span className="ck-plano__preco">
                            {p.discountCents > 0 ? <><s>{brl(p.priceCents + p.setupCents)}</s> <strong>{brl(p.totalCents)}</strong></> : <><strong>{brl(p.priceCents)}</strong>{periodo(p)}</>}
                            {p.discountCents === 0 && p.setupCents > 0 && <small>+ {brl(p.setupCents)} de implantação</small>}
                          </span>
                          {p.plan.tagline && <span className="ck-plano__texto">{p.plan.tagline}</span>}
                          {p.promo && <span className="ck-promo"><Tag size={12} aria-hidden="true" /> {p.promo.label}</span>}
                        </button>
                      ))}
                      {planos!.length === 0 && <p>Nenhum plano disponível no momento.</p>}
                    </div>
                    <p className="ck-nota">Mais de 10 pessoas? <Link to="/contato" className="sp-link">Peça uma proposta Enterprise</Link></p>
                    {alerta}
                    <button type="button" className="sp-btn sp-btn--primary ck-largo" disabled={!cotacaoPronta} onClick={() => irPara(1)}>Continuar <ArrowRight size={18} aria-hidden="true" /></button>
                  </>
                )}

                {!renovar && passo === passoDados && !pedido && (
                  <form noValidate onSubmit={(e) => { e.preventDefault(); if (!dadosOk) setErro("Confira os campos: todos são obrigatórios, o CPF/CNPJ precisa estar completo e você precisa aceitar o uso dos dados."); else if (!ocupado && (single || cotacaoPronta)) void gerarPix(); }}>
                    <h2>{single ? "1" : "2"}. Seus dados</h2>
                    <div className="ck-campos">
                      <label className="ck-inteiro">Nome completo<input id="ck-nome" autoComplete="name" value={dados.nome} onChange={set("nome")} /></label>
                      <label>Telefone (WhatsApp)<input id="ck-fone" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={dados.telefone} onChange={set("telefone")} /></label>
                      <label>E-mail<input id="ck-email" type="email" autoComplete="email" value={dados.email} onChange={set("email")} /></label>
                      <label>CPF ou CNPJ<input id="ck-doc" inputMode="numeric" value={dados.documento} onChange={set("documento")} /></label>
                      <label>Nome da empresa<input id="ck-emp" autoComplete="organization" value={dados.empresa} onChange={set("empresa")} /></label>
                    </div>
                    <label className="ck-aceite">
                      <input type="checkbox" checked={aceite} onChange={(e) => { setAceite(e.target.checked); setErro(""); }} />
                      <span>Li e concordo com os <a href="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</a> e com a <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>, e autorizo o uso dos meus dados para o cadastro, a cobrança e o contato sobre a minha assinatura (LGPD).</span>
                    </label>
                    {alerta}
                    <div className="ck-botoes">
                      {!single && voltar(0)}
                      <button type="submit" className="sp-btn sp-btn--primary" disabled={ocupado || (!single && !cotacaoPronta)}>
                        {ocupado ? <Loader2 className="ck-gira" size={18} aria-hidden="true" /> : <QrCode size={18} aria-hidden="true" />} Gerar Pix
                      </button>
                    </div>
                  </form>
                )}

                {renovar && !pedido && (
                  semSessao ? (
                    <div className="ck-centro"><p>Entre na sua conta do S.P.Y. para renovar a assinatura.</p><Link to="/login" className="sp-btn sp-btn--primary ck-largo">Entrar</Link></div>
                  ) : erro ? alerta : <p className="ck-aviso"><Loader2 className="ck-gira" size={20} aria-hidden="true" /> Gerando o Pix da renovação…</p>
                )}

                {pagando && (
                  <div className="ck-centro">
                    <h2>Pague com Pix</h2>
                    {single && single.listCents > pedido!.totalCents && (
                      <p className="ck-nota">De <s>{brl(single.listCents)}</s> por</p>
                    )}
                    <p className="ck-valor">{brl(pedido!.totalCents)}</p>
                    {status === "expired" || status === "canceled" ? (
                      <>
                        <p className="ck-erro">Este Pix {status === "canceled" ? "foi cancelado" : "expirou"}. Gere um novo para continuar.</p>
                        <button type="button" className="sp-btn sp-btn--primary ck-largo" onClick={novoPedido}>Gerar novo Pix</button>
                      </>
                    ) : (
                      <>
                        {qr && <img src={qr} alt="QR Code do Pix" width={240} height={240} className="ck-qr" />}
                        <p className="ck-nota">Abra o app do seu banco, escolha Pix e leia o QR Code, ou use o Pix copia e cola:</p>
                        <div className="ck-copia">
                          <input readOnly aria-label="Pix copia e cola" value={pedido!.pixPayload} onFocus={(e) => e.target.select()} />
                          <button type="button" className="sp-btn sp-btn--outline" onClick={() => void copiar()}>{copiado ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />} {copiado ? "Copiado" : "Copiar"}</button>
                        </div>
                        <label className="ck-envio" htmlFor="ck-comp">
                          <Upload size={22} aria-hidden="true" />
                          <strong>Depois de pagar, anexe o comprovante</strong>
                          <span>{arquivo ? arquivo.name : "Foto ou PDF, até 3 MB"}</span>
                          <input id="ck-comp" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                            onChange={(e) => { const f = e.target.files?.[0] ?? null; setErro(f && f.size > 3 * 1024 * 1024 ? "O comprovante precisa ter até 3 MB." : ""); setArquivo(f && f.size <= 3 * 1024 * 1024 ? f : null); }} />
                        </label>
                        <button type="button" className="sp-btn sp-btn--primary ck-largo" disabled={ocupado || !arquivo} onClick={() => void avisarPagamento()}>
                          {ocupado ? <Loader2 className="ck-gira" size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />} Já fiz o pagamento
                        </button>
                      </>
                    )}
                    {alerta}
                    <p className="ck-nota"><Lock size={14} aria-hidden="true" /> O Pix vai direto para a conta da empresa. Validade: 24 horas.</p>
                  </div>
                )}
              </div>

              <aside className="ck-cartao ck-resumo" aria-label="Seu pedido">
                <div className="ck-resumo__topo">
                  <span className="ck-selo"><img src="/spy-icon.png" alt="" width={56} height={56} /></span>
                  <div><span>Seu pedido</span><h2>{(pedido ? pedidoPlano : cotacao?.plan.name) || "S.P.Y."}</h2></div>
                </div>
                {detalhe?.plan.features.length ? (
                  <ul className="ck-itens">{detalhe.plan.features.map((f) => (<li key={f}><Check size={16} aria-hidden="true" /> {f}</li>))}</ul>
                ) : null}
                {!pedido && !single && !renovar && (
                  <div className="ck-cupom">
                    <input id="ck-cupom" aria-label="Cupom" value={cupom} onChange={(e) => setCupom(e.target.value)} placeholder="Tem um cupom?" />
                    <button type="button" className="sp-btn sp-btn--outline" onClick={() => void cotar(planoCode, cupom)}>Aplicar</button>
                  </div>
                )}
                <dl className="ck-contas">
                  {detalhe && (
                    <>
                      <div><dt>Mensalidade</dt><dd>{brl(detalhe.priceCents)}</dd></div>
                      {detalhe.setupCents > 0 && <div><dt>Implantação (uma vez)</dt><dd>{brl(detalhe.setupCents)}</dd></div>}
                      {detalhe.discountCents > 0 && <div className="ck-desconto"><dt>{detalhe.promo?.label || "Desconto"}</dt><dd>− {brl(detalhe.discountCents)}</dd></div>}
                    </>
                  )}
                  {(pedido || detalhe) && <div className="ck-total"><dt>Total hoje</dt><dd>{brl(pedido ? pedido.totalCents : detalhe!.totalCents)}</dd></div>}
                </dl>
                {detalhe && !single && detalhe.setupCents > 0 && <p className="ck-nota">Nos próximos meses, só a mensalidade: {brl(detalhe.priceCents)}{periodo(detalhe)}.</p>}
                <p className="ck-nota"><ShieldCheck size={14} aria-hidden="true" /> Seus dados são usados só para o cadastro e a cobrança (LGPD).</p>
              </aside>
            </div>
          )}

          {aberto && !obrigado && !renovar && (
            <>
              <h2 className="sp-h2 ck-titulo">Depois do pagamento.</h2>
              <Depois />
            </>
          )}
        </div>

        {aberto && !obrigado && !renovar && <Perguntas itens={PERGUNTAS} />}
      </main>

      <footer className="sv-rodape">
        <div className="sp-wrap">
          <nav aria-label="Rodapé">
            <Link to="/landing">Conhecer a plataforma</Link>
            <Link to="/contato">Falar com a gente</Link>
            <Link to="/termos">Termos de uso</Link>
            <Link to="/privacidade">Privacidade</Link>
            <Link to="/login">Já sou cliente</Link>
          </nav>
          <p>© {new Date().getFullYear()} S.P.Y. Todos os direitos reservados.</p>
        </div>
      </footer>
      <SocialProofPopup />
    </div>
  );
}
