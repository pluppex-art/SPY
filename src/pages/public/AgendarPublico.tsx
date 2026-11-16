import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CalendarCheck, CheckCircle2, Clock, Loader2, MapPin, MessageCircle, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { agruparBlocos, maxPessoas, totalPadrao, type ConfigAgenda, type HorarioDia } from "../../lib/agendamento/engine";
import { DIAS_SEMANA, dataBR, reaisBR } from "../../lib/agendamento/cliente";

interface Pub {
  ativo: boolean; nome: string | null; endereco: string | null; telefone: string | null; whatsapp: string | null; logoUrl: string | null; recursoSingular: string; recursoPlural: string;
  qtdRecursos: number; pessoasPorRecurso: number; precoDiaUtil: number; precoFimSemana: number; diasFimSemana: number[]; horarios: HorarioDia[]; datasBloqueadas: string[];
  tiposEvento: string[]; mesasAtivo: boolean; cadeirasMax: number; expiracaoMin: number; pagamentoOnline: boolean; hoje: string;
}
interface SlotPub { hora: string; rotulo: string; disponivel: boolean; livres: number }

const campo = "w-full h-12 px-4 rounded-xl text-base border border-slate-300 bg-white text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20";
const rot = "block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5";

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

  useEffect(() => { api(`/api/agendar/${encodeURIComponent(slug)}/config`).then((c: Pub) => { setCfg(c); setData(c.hoje); setTipo(c.tiposEvento[0] ?? ""); }).catch((e) => setFalha(e.message)); }, [slug]);
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

  const cabecalho = (
    <div className="text-center mb-6">
      {cfg.logoUrl && <img src={cfg.logoUrl} alt="" className="h-16 mx-auto mb-3 object-contain" />}
      <h1 className="text-2xl font-black text-slate-900">{cfg.nome ?? "Reserve seu horário"}</h1>
      {cfg.endereco && <p className="text-sm text-slate-500 mt-1 flex items-center justify-center gap-1"><MapPin className="w-4 h-4" />{cfg.endereco}</p>}
    </div>
  );

  if (grupoRetorno && tokenRetorno) {
    return (<Tela>{cabecalho}<div className="rounded-2xl bg-white border border-slate-200 p-6 text-center">
      {!pedido || pedido.situacao === "aguardando" ? <><Loader2 className="w-10 h-10 mx-auto animate-spin text-blue-600 mb-3" /><p className="font-bold text-slate-800">Confirmando seu pagamento…</p><p className="text-sm text-slate-500 mt-1">Isso leva alguns segundos. Não feche esta página.</p></>
        : pedido.situacao === "pago" ? <><CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-3" /><p className="text-lg font-black text-slate-900">Reserva confirmada!</p><p className="text-sm text-slate-600 mt-1">Pagamento de {reaisBR(pedido.total)} recebido. Esperamos você!</p></>
        : pedido.situacao === "estornado" ? <><XCircle className="w-12 h-12 mx-auto text-amber-600 mb-3" /><p className="text-lg font-black text-slate-900">O horário foi ocupado antes do pagamento</p><p className="text-sm text-slate-600 mt-1">Devolvemos o valor automaticamente. Escolha outro horário.</p></>
        : <><XCircle className="w-12 h-12 mx-auto text-rose-600 mb-3" /><p className="text-lg font-black text-slate-900">Pedido não concluído</p><p className="text-sm text-slate-600 mt-1">O prazo para pagar acabou e o horário foi liberado. Você pode reservar de novo.</p></>}
      <a href={`/agendar/${slug}`} className="inline-block mt-5 text-sm font-bold text-blue-600 hover:underline">Fazer nova reserva</a></div></Tela>);
  }

  if (!cfg.ativo) return <Tela>{cabecalho}<div className="rounded-2xl bg-white border border-slate-200 p-6 text-center"><p className="font-bold text-slate-800">As reservas online estão pausadas.</p>{zapLocal && <a className="inline-flex items-center gap-2 mt-3 text-emerald-700 font-bold" href={`https://wa.me/${zapLocal.startsWith("55") ? zapLocal : "55" + zapLocal}`}><MessageCircle className="w-5 h-5" />Falar pelo WhatsApp</a>}</div></Tela>;

  if (feito) return (<Tela>{cabecalho}<div className="rounded-2xl bg-white border border-slate-200 p-6 text-center"><CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-3" /><p className="text-lg font-black text-slate-900">Reserva recebida!</p>
    <p className="text-sm text-slate-600 mt-2">{dataBR(data)} · {horas.join(", ")} · {recursos} {rotuloUn(recursos)}</p><p className="text-sm text-slate-600">Total {reaisBR(feito.total)} — o pagamento é feito no local.</p>
    <p className="text-xs text-slate-500 mt-3">Guardamos seu horário por {cfg.expiracaoMin} minutos. Para confirmar, fale com a gente{zapLocal ? "" : " ou chegue com antecedência"}.</p>
    {zapLocal && <a className="inline-flex items-center gap-2 mt-4 px-4 h-11 rounded-xl bg-emerald-600 text-white font-bold" href={`https://wa.me/${zapLocal.startsWith("55") ? zapLocal : "55" + zapLocal}?text=${encodeURIComponent(`Olá! Fiz uma reserva para ${dataBR(data)} às ${horas[0]} em nome de ${nome}.`)}`}><MessageCircle className="w-5 h-5" />Confirmar pelo WhatsApp</a>}</div></Tela>);

  return (
    <Tela>
      {cabecalho}
      <div className="space-y-6">
        <Bloco n={1} t="Escolha o dia">
          <input type="date" min={cfg.hoje} value={data} onChange={(e) => e.target.value && setData(e.target.value)} className={campo} />
          <p className="text-xs text-slate-500 mt-1.5">{data && `${DIAS_SEMANA[new Date(data + "T12:00:00").getDay()]}, ${dataBR(data)}`}</p>
        </Bloco>

        <Bloco n={2} t="Escolha os horários">
          {carregandoSlots ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : slots.length === 0 ? <p className="text-sm text-slate-500">Fechado neste dia. Escolha outra data.</p> : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {slots.map((s) => { const sel = horas.includes(s.hora); const off = !s.disponivel || s.livres < recursos; return (
                <button key={s.hora} type="button" disabled={off && !sel} onClick={() => setHoras((a) => (a.includes(s.hora) ? a.filter((x) => x !== s.hora) : [...a, s.hora].sort()))}
                  className={cn("h-14 rounded-xl text-base font-black border transition-colors", sel ? "bg-blue-600 text-white border-transparent" : off ? "bg-slate-100 text-slate-400 line-through border-slate-200" : "bg-white text-slate-900 border-slate-300 hover:border-blue-600")}>
                  {s.rotulo}<span className="block text-[10px] font-semibold opacity-70">{s.disponivel ? `${s.livres} livre${s.livres === 1 ? "" : "s"}` : "esgotado"}</span></button>); })}
            </div>)}
          {horasHora > 1 && <p className="text-xs text-slate-500 mt-2 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{horasHora} horas selecionadas</p>}
        </Bloco>

        <Bloco n={3} t="Quantos vão?">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={rot}>{cfg.recursoPlural}</label><input type="number" min={1} max={cfg.qtdRecursos} value={recursos} onChange={(e) => setRecursos(Math.max(1, Math.min(cfg.qtdRecursos, Number(e.target.value) || 1)))} className={campo} /></div>
            <div><label className={rot}>Pessoas (até {limite})</label><input type="number" min={1} max={limite} value={pessoas} onChange={(e) => setPessoas(Number(e.target.value) || 1)} className={cn(campo, pessoas > limite && "border-rose-500")} /></div>
          </div>
          {cfg.tiposEvento.length > 1 && <div className="mt-3"><label className={rot}>Tipo de evento</label><select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>{cfg.tiposEvento.map((t) => <option key={t}>{t}</option>)}</select></div>}
          {cfg.mesasAtivo && mesasLivres > 0 && <label className="flex items-center gap-2 mt-3 text-sm text-slate-700"><input type="checkbox" checked={mesa} onChange={(e) => setMesa(e.target.checked)} className="w-5 h-5" />Quero também reservar uma mesa no restaurante</label>}
          {mesa && <div className="mt-2"><label className={rot}>Lugares na mesa (até {cfg.cadeirasMax})</label><input type="number" min={1} max={cfg.cadeirasMax} value={cadeiras} onChange={(e) => setCadeiras(Math.min(cfg.cadeirasMax, Number(e.target.value) || 1))} className={campo} /></div>}
        </Bloco>

        <Bloco n={4} t="Seus dados">
          <div className="space-y-3">
            <div><label className={rot}>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={120} className={campo} /></div>
            <div><label className={rot}>WhatsApp</label><input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" className={campo} /></div>
            <div><label className={rot}>E-mail (opcional)</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className={campo} /></div>
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={isca} onChange={(e) => setIsca(e.target.value)} name="website" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
          </div>
        </Bloco>

        <div className="rounded-2xl bg-white border border-slate-200 p-4 sticky bottom-3 shadow-lg">
          <div className="flex items-center justify-between"><span className="text-sm text-slate-600">{horasHora ? `${horasHora}h · ${recursos} ${rotuloUn(recursos)}` : "Escolha os horários"}</span><span className="text-xl font-black text-slate-900">{reaisBR(total)}</span></div>
          {erro && <p className="text-sm text-rose-600 mt-2" role="alert">{erro}</p>}
          <button onClick={enviar} disabled={!pronto || enviando} className="w-full h-12 mt-3 rounded-xl bg-blue-600 text-white font-black text-base disabled:opacity-40 flex items-center justify-center gap-2">
            {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CalendarCheck className="w-5 h-5" />}{cfg.pagamentoOnline ? "Reservar e pagar" : "Reservar"}</button>
          <p className="text-[11px] text-slate-500 text-center mt-2">{cfg.pagamentoOnline ? `Você tem ${cfg.expiracaoMin} minutos para pagar; depois o horário é liberado.` : "O pagamento é feito no local."}</p>
        </div>
      </div>
    </Tela>
  );
}

const Tela = ({ children }: { children: React.ReactNode }) => (<div className="min-h-dvh bg-slate-50 text-slate-900"><div className="max-w-xl mx-auto px-4 py-8" style={{ colorScheme: "light" }}>{children}</div></div>);
const Bloco = ({ n, t, children }: { n: number; t: string; children: React.ReactNode }) => (<section><h2 className="flex items-center gap-2 text-base font-black text-slate-900 mb-3"><span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">{n}</span>{t}</h2>{children}</section>);
