import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, MapPin, MessageCircle, Minus, Plus, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { agruparBlocos, diaDaSemana, faixaDoDia, maxPessoas, somarDias, totalPadrao, type ConfigAgenda, type HorarioDia } from "../../lib/agendamento/engine";
import { DIAS_SEMANA, dataBR, reaisBR } from "../../lib/agendamento/cliente";

interface Pub {
  ativo: boolean; nome: string | null; endereco: string | null; telefone: string | null; whatsapp: string | null; logoUrl: string | null; recursoSingular: string; recursoPlural: string;
  qtdRecursos: number; pessoasPorRecurso: number; precoDiaUtil: number; precoFimSemana: number; diasFimSemana: number[]; horarios: HorarioDia[]; datasBloqueadas: string[];
  tiposEvento: string[]; mesasAtivo: boolean; cadeirasMax: number; expiracaoMin: number; pagamentoOnline: boolean; hoje: string;
}
interface SlotPub { hora: string; rotulo: string; disponivel: boolean; livres: number }


async function api(caminho: string, init?: RequestInit) {
  const r = await fetch(caminho, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "Não foi possível concluir. Tente novamente.");
  return j;
}

/** Página pública de reserva: o cliente escolhe data, horários e quantidade, informa nome e WhatsApp e (se ligado) paga online. */
export default function AgendarPublico() {
  const { slug = "" } = useParams();
  const [qs] = useSearchParams();
  const grupoRetorno = qs.get("grupo"); const tokenRetorno = qs.get("t");
  const [cfg, setCfg] = useState<Pub | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [data, setData] = useState(""); const [slots, setSlots] = useState<SlotPub[]>([]); const [mesasLivres, setMesasLivres] = useState(0); const [carregandoSlots, setCarregandoSlots] = useState(false);
  const [horas, setHoras] = useState<string[]>([]); const [recursos, setRecursos] = useState(1); const [pessoas, setPessoas] = useState(2); const [tipo, setTipo] = useState("");
  const [mesa, setMesa] = useState(false); const [cadeiras, setCadeiras] = useState(4);
  const [nome, setNome] = useState(""); const [telefone, setTelefone] = useState(""); const [email, setEmail] = useState(""); const [isca, setIsca] = useState("");
  const [enviando, setEnviando] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ total: number; tipo: "local" | "online" } | null>(null);
  const [pedido, setPedido] = useState<{ situacao: string; total: number } | null>(null);

  useEffect(() => { api(`/api/agendar/${encodeURIComponent(slug)}/config`).then((c: Pub) => { setCfg(c); setData(primeiroAberto(c)); setTipo(c.tiposEvento[0] ?? ""); }).catch((e) => setFalha(e.message)); }, [slug]);
  useEffect(() => {
    if (document.getElementById("agendar-fontes")) return;
    const l = document.createElement("link"); l.id = "agendar-fontes"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;800&family=Barlow:wght@400;500;600;700&display=swap"; document.head.appendChild(l);
  }, []);
  useEffect(() => { if (cfg) document.title = `Reservar — ${cfg.nome ?? "Agendamento"}`; }, [cfg]);

  // Volta do Mercado Pago: confere a situação do pedido até confirmar (o aviso do Mercado Pago pode demorar alguns segundos).
  useEffect(() => {
    if (!grupoRetorno || !tokenRetorno) return;
    let vivo = true; let tentativas = 0;
    const checar = async () => {
      try { const j = await api(`/api/agendar/${encodeURIComponent(slug)}/pedido/${grupoRetorno}?t=${encodeURIComponent(tokenRetorno)}`); if (!vivo) return; setPedido(j); if (j.situacao === "aguardando" && ++tentativas < 40) setTimeout(checar, 4000); }
      catch { if (vivo) setPedido({ situacao: "erro", total: 0 }); }
    };
    checar();
    return () => { vivo = false; };
  }, [grupoRetorno, tokenRetorno, slug]);

  const carregarSlots = useCallback(async (d: string) => {
    if (!d) return;
    setCarregandoSlots(true);
    try { const j = await api(`/api/agendar/${encodeURIComponent(slug)}/disponibilidade?data=${d}`); setSlots(j.slots); setMesasLivres(j.mesasDisponiveis ?? 0); } catch { setSlots([]); }
    setCarregandoSlots(false);
  }, [slug]);
  useEffect(() => { setHoras([]); if (cfg && data) carregarSlots(data); }, [data, cfg, carregarSlots]);

  const eng: ConfigAgenda | null = useMemo(() => (cfg ? { qtdRecursos: cfg.qtdRecursos, pessoasPorRecurso: cfg.pessoasPorRecurso, precoDiaUtil: cfg.precoDiaUtil, precoFimSemana: cfg.precoFimSemana, diasFimSemana: cfg.diasFimSemana, horarios: cfg.horarios, datasBloqueadas: cfg.datasBloqueadas, expiracaoPendenteMin: cfg.expiracaoMin, mesasMaxPorDia: 0, cadeirasMax: cfg.cadeirasMax } : null), [cfg]);

  if (falha) return <Tela><div className="text-center py-20"><XCircle className="w-12 h-12 mx-auto text-slate-300 mb-3" /><p className="font-bold text-slate-700">{falha}</p><p className="text-sm text-slate-500 mt-1">Confira se o endereço está correto.</p></div></Tela>;
  if (!cfg || !eng) return <Tela><div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div></Tela>;

  const rotuloUn = (n: number) => (n === 1 ? cfg.recursoSingular : cfg.recursoPlural).toLowerCase();
  const limite = maxPessoas(recursos, cfg.pessoasPorRecurso);
  const horasHora = horas.length;
  const total = totalPadrao(data, eng, recursos, agruparBlocos(horas).reduce((s, b) => s + b.duracao, 0));
  const telDigitos = telefone.replace(/\D/g, "");
  const pronto = horasHora > 0 && nome.trim().length >= 2 && telDigitos.length >= 10 && pessoas >= 1 && pessoas <= limite;
  const zapLocal = (cfg.whatsapp ?? "").replace(/\D/g, "");

  const enviar = async () => {
    if (!pronto || enviando) return;
    setEnviando(true); setErro(null);
    try {
      const j = await api(`/api/agendar/${encodeURIComponent(slug)}/reservar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, telefone, email, data, horas, qtdRecursos: recursos, qtdPessoas: pessoas, tipoEvento: tipo, mesa: mesa ? { ativo: true, cadeiras } : undefined, website: isca }) });
      if (j.pagamento?.tipo === "online" && j.pagamento.url) { window.location.href = j.pagamento.url; return; }
      setFeito({ total: j.total, tipo: "local" });
    } catch (e: any) { setErro(e.message); carregarSlots(data); }
    setEnviando(false);
  };

  const dias = Array.from({ length: 14 }, (_, i) => somarDias(cfg.hoje, i));
  const diaFechado = (d: string) => !faixaDoDia(d, eng);
  const foraDaTira = !!data && !dias.includes(data);

  const cabecalho = (
    <header className="text-center pt-2 pb-7">
      {cfg.logoUrl && <img src={cfg.logoUrl} alt="" className="h-16 mx-auto mb-3 object-contain" />}
      <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#D6303B]">Reserva online</p>
      <h1 style={{ fontFamily: DISPLAY }} className="text-[44px] leading-[0.95] font-extrabold uppercase text-[#14162B] mt-1">{cfg.nome ?? "Reserve seu horário"}</h1>
      {cfg.endereco && <p className="text-sm text-[#5B5E73] mt-3 inline-flex items-start gap-1.5 max-w-sm"><MapPin className="w-4 h-4 mt-0.5 shrink-0" />{cfg.endereco}</p>}
    </header>
  );

  if (grupoRetorno && tokenRetorno) {
    const aguardando = !pedido || pedido.situacao === "aguardando"; const pago = pedido?.situacao === "pago"; const estornado = pedido?.situacao === "estornado";
    return (<Tela>{cabecalho}<Cartao className="text-center py-9">
      {aguardando ? <><Loader2 className="w-10 h-10 mx-auto animate-spin text-[#D6303B] mb-3" /><p style={{ fontFamily: DISPLAY }} className="text-2xl font-extrabold uppercase">Confirmando seu pagamento</p><p className="text-sm text-[#5B5E73] mt-1">Leva alguns segundos. Não feche esta página.</p></>
        : pago ? <><CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-3" /><p style={{ fontFamily: DISPLAY }} className="text-3xl font-extrabold uppercase">Reserva confirmada</p><p className="text-sm text-[#5B5E73] mt-1">Recebemos {reaisBR(pedido!.total)}. Esperamos você!</p></>
        : estornado ? <><XCircle className="w-12 h-12 mx-auto text-amber-600 mb-3" /><p style={{ fontFamily: DISPLAY }} className="text-3xl font-extrabold uppercase">Horário ocupado</p><p className="text-sm text-[#5B5E73] mt-1 px-4">Outra pessoa pegou o horário antes do pagamento. Devolvemos o valor automaticamente. Escolha outro horário.</p></>
        : <><XCircle className="w-12 h-12 mx-auto text-[#D6303B] mb-3" /><p style={{ fontFamily: DISPLAY }} className="text-3xl font-extrabold uppercase">Pedido não concluído</p><p className="text-sm text-[#5B5E73] mt-1 px-4">O prazo para pagar acabou e o horário foi liberado. Você pode reservar de novo.</p></>}
      <a href={`/agendar/${slug}`} className="inline-block mt-6 text-sm font-bold text-[#D6303B] underline underline-offset-4">Fazer nova reserva</a></Cartao></Tela>);
  }

  const linkZap = (texto: string) => `https://wa.me/${zapLocal.startsWith("55") ? zapLocal : "55" + zapLocal}?text=${encodeURIComponent(texto)}`;
  if (!cfg.ativo) return <Tela>{cabecalho}<Cartao className="text-center py-9"><p style={{ fontFamily: DISPLAY }} className="text-2xl font-extrabold uppercase">Reservas online pausadas</p><p className="text-sm text-[#5B5E73] mt-1">Fale com a gente para reservar.</p>{zapLocal && <a className="inline-flex items-center gap-2 mt-4 px-5 h-12 rounded-xl bg-emerald-600 text-[#ffffff] font-bold" href={linkZap("Olá! Quero fazer uma reserva.")}><MessageCircle className="w-5 h-5" />Chamar no WhatsApp</a>}</Cartao></Tela>;

  if (feito) return (<Tela>{cabecalho}<Cartao className="text-center py-9"><CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-3" /><p style={{ fontFamily: DISPLAY }} className="text-3xl font-extrabold uppercase">Reserva recebida</p>
    <p className="text-[15px] font-semibold text-[#14162B] mt-3">{dataBR(data)} · {horas.join(" · ")}</p><p className="text-sm text-[#5B5E73]">{recursos} {rotuloUn(recursos)} · {pessoas} pessoa{pessoas === 1 ? "" : "s"}</p>
    <p className="text-sm text-[#5B5E73] mt-2">Total {reaisBR(feito.total)}, pago no local.</p>
    <p className="text-xs text-[#5B5E73] mt-4 px-6">Seguramos seu horário por {cfg.expiracaoMin} minutos. Para garantir, confirme com a gente{zapLocal ? "" : " ou chegue com antecedência"}.</p>
    {zapLocal && <a className="inline-flex items-center gap-2 mt-5 px-5 h-12 rounded-xl bg-emerald-600 text-[#ffffff] font-bold" href={linkZap(`Olá! Fiz uma reserva para ${dataBR(data)} às ${horas[0]} em nome de ${nome}.`)}><MessageCircle className="w-5 h-5" />Confirmar pelo WhatsApp</a>}</Cartao></Tela>);

  return (
    <Tela>
      {cabecalho}
      <div className="space-y-5 pb-36">
        <Passo t="Quando">
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-2 snap-x">
            {dias.map((d) => { const fech = diaFechado(d); const on = d === data; return (
              <button key={d} type="button" disabled={fech} onClick={() => setData(d)} aria-pressed={on} className={`snap-start shrink-0 w-[58px] rounded-xl border py-2 text-center transition-colors ${on ? "bg-[#14162B] border-[#14162B] text-[#ffffff]" : fech ? "border-[#E4E2DC] text-[#B5B6C2] bg-transparent" : "border-[#E4E2DC] bg-[#ffffff] text-[#14162B] hover:border-[#14162B]"}`}>
                <span className="block text-[10px] font-bold uppercase tracking-wider opacity-70">{d === cfg.hoje ? "Hoje" : DIAS_SEMANA[diaDaSemana(d)].slice(0, 3)}</span>
                <span style={{ fontFamily: DISPLAY }} className="block text-[28px] leading-none font-extrabold">{d.slice(8)}</span>
                <span className="block text-[10px] opacity-60">{fech ? "fechado" : ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(d.slice(5, 7)) - 1]}</span>
              </button>); })}
          </div>
          <label className="flex items-center gap-2 text-xs text-[#5B5E73] mt-1">Outra data
            <input type="date" min={cfg.hoje} value={data} onChange={(e) => e.target.value && setData(e.target.value)} className={cn("h-9 px-2 rounded-lg border bg-[#ffffff] text-sm text-[#14162B]", foraDaTira ? "border-[#14162B]" : "border-[#E4E2DC]")} /></label>
        </Passo>

        <Passo t="Horários" dica="Cada bolinha é uma pista: cheia = ocupada, vazia = livre.">
          {carregandoSlots ? <Loader2 className="w-5 h-5 animate-spin text-[#8A8CA0]" /> : slots.length === 0 ? <p className="text-sm text-[#5B5E73]">Fechado neste dia. Escolha outra data.</p> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {slots.map((sl) => { const on = horas.includes(sl.hora); const off = !sl.disponivel || sl.livres < recursos; const ocupadas = cfg.qtdRecursos - sl.livres; return (
                <button key={sl.hora} type="button" disabled={off && !on} aria-pressed={on} onClick={() => setHoras((a) => (a.includes(sl.hora) ? a.filter((x) => x !== sl.hora) : [...a, sl.hora].sort()))}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${on ? "bg-[#D6303B] border-[#D6303B] text-[#ffffff]" : off ? "bg-[#F3F2EE] border-[#E4E2DC] text-[#A9AABA]" : "bg-[#ffffff] border-[#E4E2DC] text-[#14162B] hover:border-[#14162B]"}`}>
                  <span style={{ fontFamily: DISPLAY }} className={`block text-[26px] leading-none font-extrabold ${off && !on ? "line-through" : ""}`}>{sl.rotulo}</span>
                  <span className="flex flex-wrap gap-[3px] mt-2" aria-hidden="true">{Array.from({ length: Math.min(cfg.qtdRecursos, 12) }, (_, i) => <i key={i} className={`w-2 h-2 rounded-full border ${i < Math.min(ocupadas, 12) ? (on ? "bg-[#ffffff]/90 border-[#ffffff]/90" : "bg-[#14162B] border-[#14162B]") : (on ? "border-[#ffffff]/70" : "border-[#14162B]/40")}`} />)}</span>
                  <span className="block text-[11px] font-semibold mt-1.5 opacity-80">{sl.disponivel ? `${sl.livres} ${sl.livres === 1 ? "pista livre" : "pistas livres"}` : "Esgotado"}</span>
                </button>); })}
            </div>)}
          {horasHora > 1 && <p className="text-xs text-[#5B5E73] mt-2">{horasHora} horas seguidas ou separadas — você escolhe.</p>}
        </Passo>

        <Passo t="Quantos vão jogar">
          <Contador rotulo={cfg.recursoPlural} valor={recursos} min={1} max={cfg.qtdRecursos} onChange={(v) => { setRecursos(v); setPessoas((p) => Math.min(p, maxPessoas(v, cfg.pessoasPorRecurso))); }} />
          <Contador rotulo="Pessoas" sub={`até ${limite} no total`} valor={pessoas} min={1} max={limite} onChange={setPessoas} />
          {cfg.tiposEvento.length > 1 && <div className="pt-1"><p className={ROTULO}>Ocasião</p><div className="flex flex-wrap gap-1.5 mt-1.5">{cfg.tiposEvento.map((t) => <button key={t} type="button" onClick={() => setTipo(t)} aria-pressed={tipo === t} className={`px-3.5 h-9 rounded-full text-sm font-semibold border ${tipo === t ? "bg-[#14162B] border-[#14162B] text-[#ffffff]" : "bg-[#ffffff] border-[#E4E2DC] text-[#14162B]"}`}>{t}</button>)}</div></div>}
          {cfg.mesasAtivo && mesasLivres > 0 && <label className="flex items-center gap-2.5 text-sm text-[#14162B] pt-1"><input type="checkbox" checked={mesa} onChange={(e) => setMesa(e.target.checked)} className="w-5 h-5 accent-[#D6303B]" />Quero também uma mesa no restaurante</label>}
          {mesa && <Contador rotulo="Lugares na mesa" valor={cadeiras} min={1} max={cfg.cadeirasMax} onChange={setCadeiras} />}
        </Passo>

        <Passo t="Seus dados" dica="Só precisamos disso para confirmar sua reserva.">
          <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={120} className={INPUT} /></Campo>
          <Campo rotulo="WhatsApp"><input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" className={INPUT} /></Campo>
          <Campo rotulo="E-mail (opcional)"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className={INPUT} /></Campo>
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={isca} onChange={(e) => setIsca(e.target.value)} name="website" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
        </Passo>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-30 bg-[#14162B] text-[#ffffff] border-t-4 border-[#D6303B]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-xl mx-auto px-4 py-3">
          {erro && <p className="text-sm text-[#FFB4BA] mb-2" role="alert">{erro}</p>}
          <div className="flex items-center gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#ffffff]/60 truncate">{horasHora ? `${dataBR(data)} · ${horasHora}h · ${recursos} ${rotuloUn(recursos)}` : "Escolha ao menos um horário"}</p>
              <p style={{ fontFamily: DISPLAY }} className="text-[34px] leading-none font-extrabold tabular-nums">{reaisBR(total)}</p>
            </div>
            <button onClick={enviar} disabled={!pronto || enviando} className="ml-auto h-12 px-6 rounded-xl bg-[#D6303B] text-[#ffffff] font-extrabold uppercase tracking-wide text-sm disabled:opacity-40 flex items-center gap-2 shrink-0">
              {enviando && <Loader2 className="w-4 h-4 animate-spin" />}{cfg.pagamentoOnline ? "Reservar e pagar" : "Reservar"}</button>
          </div>
          <p className="text-[11px] text-[#ffffff]/55 mt-1.5">{cfg.pagamentoOnline ? `Você tem ${cfg.expiracaoMin} minutos para pagar; depois o horário é liberado.` : "O pagamento é feito no local."}</p>
        </div>
      </div>
    </Tela>
  );
}

const primeiroAberto = (c: Pub) => {
  const e = { horarios: c.horarios, datasBloqueadas: c.datasBloqueadas };
  for (let i = 0; i < 60; i++) { const d = somarDias(c.hoje, i); if (faixaDoDia(d, e)) return d; }
  return c.hoje;
};
const DISPLAY = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const ROTULO = "text-[11px] font-bold uppercase tracking-[0.14em] text-[#5B5E73]";
const INPUT = "w-full h-12 px-4 rounded-xl text-base border border-[#E4E2DC] bg-[#ffffff] text-[#14162B] outline-none focus:border-[#14162B] focus:ring-2 focus:ring-[#14162B]/10";

const Tela = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-dvh text-[#14162B]" style={{ background: "#FBFAF7", fontFamily: "'Barlow', system-ui, sans-serif", colorScheme: "light" }}>
    {/* as duas listras vermelhas do pino de boliche */}
    <div aria-hidden="true" className="pt-2 space-y-[3px]"><div className="h-[5px] bg-[#D6303B]" /><div className="h-[5px] bg-[#D6303B]" /></div>
    <div className="max-w-xl mx-auto px-4 pt-7">{children}</div>
  </div>
);
const Cartao = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cn("rounded-2xl bg-[#ffffff] border border-[#E4E2DC] px-5", className)}>{children}</div>;
const Passo = ({ t, dica, children }: { t: string; dica?: string; children: React.ReactNode }) => (
  <section className="rounded-2xl bg-[#ffffff] border border-[#E4E2DC] p-4 space-y-3">
    <div><h2 style={{ fontFamily: DISPLAY }} className="text-[26px] leading-none font-extrabold uppercase text-[#14162B]">{t}</h2>{dica && <p className="text-xs text-[#5B5E73] mt-1">{dica}</p>}</div>
    {children}
  </section>
);
const Campo = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => <label className="block"><span className={ROTULO}>{rotulo}</span><span className="block mt-1.5">{children}</span></label>;
const Contador = ({ rotulo, sub, valor, min, max, onChange }: { rotulo: string; sub?: string; valor: number; min: number; max: number; onChange: (v: number) => void }) => (
  <div className="flex items-center justify-between gap-3">
    <div><p className="text-[15px] font-bold text-[#14162B]">{rotulo}</p>{sub && <p className="text-xs text-[#5B5E73]">{sub}</p>}</div>
    <div className="flex items-center gap-1">
      <button type="button" aria-label={`Diminuir ${rotulo}`} disabled={valor <= min} onClick={() => onChange(Math.max(min, valor - 1))} className="w-11 h-11 rounded-xl border border-[#E4E2DC] flex items-center justify-center disabled:opacity-30"><Minus className="w-4 h-4" /></button>
      <span style={{ fontFamily: DISPLAY }} className="w-12 text-center text-[32px] leading-none font-extrabold tabular-nums">{valor}</span>
      <button type="button" aria-label={`Aumentar ${rotulo}`} disabled={valor >= max} onClick={() => onChange(Math.min(max, valor + 1))} className="w-11 h-11 rounded-xl border border-[#E4E2DC] flex items-center justify-center disabled:opacity-30"><Plus className="w-4 h-4" /></button>
    </div>
  </div>
);
