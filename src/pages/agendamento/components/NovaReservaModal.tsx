import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { HelpTip } from "../../../components/ui/help-tip";
import { Switch } from "../../../components/ui/switch";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { cn } from "../../../lib/utils";
import { agoraNoFuso, agruparBlocos, gerarSlots, maxPessoas, totalPadrao, type Agora, type ConfigAgenda } from "../../../lib/agendamento/engine";
import { chamar, linhaParaReserva, reaisBR, type ConfigLinha, type Reserva } from "../../../lib/agendamento/cliente";
import { PagamentoForm, type PedidoPagamento } from "./PagamentoForm";
import { campo, rotulo } from "./Estilos";

interface Props {
  isOpen: boolean; onClose: () => void; dataInicial: string; config: ConfigLinha; engine: ConfigAgenda; agora: Agora;
  admin: boolean; permissoes: Record<string, boolean>; onCriada: () => void;
}

/** Nova reserva feita pela equipe: horários pela grade (ou encaixe manual), pagamento já no ato. */
export function NovaReservaModal({ isOpen, onClose, dataInicial, config, engine, agora, admin, permissoes, onCriada }: Props) {
  const { activeTenantId } = useAuth();
  const [nome, setNome] = useState(""); const [telefone, setTelefone] = useState(""); const [email, setEmail] = useState("");
  const [data, setData] = useState(dataInicial); const [horas, setHoras] = useState<string[]>([]);
  const [recursos, setRecursos] = useState(1); const [pessoas, setPessoas] = useState(2);
  const [tipo, setTipo] = useState(config.tipos_evento[0] ?? ""); const [obs, setObs] = useState("");
  const [mesa, setMesa] = useState(false); const [cadeiras, setCadeiras] = useState(4); const [aniversariante, setAniversariante] = useState("");
  const [manual, setManual] = useState(false); const [mHora, setMHora] = useState("18:00"); const [mDur, setMDur] = useState("1"); const [mValor, setMValor] = useState("");
  const [pedido, setPedido] = useState<PedidoPagamento | null>({ modo: "pendente" }); const [erroPag, setErroPag] = useState<string | null>(null);
  const [doDia, setDoDia] = useState<Reserva[]>([]); const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNome(""); setTelefone(""); setEmail(""); setData(dataInicial); setHoras([]); setRecursos(1); setPessoas(2); setTipo(config.tipos_evento[0] ?? ""); setObs("");
    setMesa(false); setCadeiras(4); setAniversariante(""); setManual(false); setMValor(""); setSalvando(false);
  }, [isOpen, dataInicial, config.tipos_evento]);

  useEffect(() => {
    if (!isOpen || !supabase || !activeTenantId) return;
    let vivo = true;
    supabase.from("agendamento_reservas").select("*").eq("tenant_id", activeTenantId).eq("data", data).then(({ data: l }) => { if (vivo) setDoDia((l || []).map(linhaParaReserva)); });
    return () => { vivo = false; };
  }, [isOpen, data, activeTenantId]);

  const slots = useMemo(() => gerarSlots(data, engine, doDia, { agora: agoraNoFuso(Date.now(), config.fuso), equipe: true }), [data, engine, doDia, config.fuso]);
  const limitePessoas = maxPessoas(recursos, config.pessoas_por_recurso);
  const blocos = manual ? [] : agruparBlocos(horas);
  const totalHoras = manual ? Number(mDur) || 0 : blocos.reduce((s, b) => s + b.duracao, 0);
  const total = manual ? Number(mValor.replace(",", ".")) || 0 : totalPadrao(data, engine, recursos, totalHoras);
  const podeSalvar = nome.trim().length >= 2 && (manual ? Number(mDur) > 0 : horas.length > 0) && pessoas >= 1 && pessoas <= limitePessoas && !erroPag && !!pedido;

  const salvar = async () => {
    if (!podeSalvar || !pedido) return;
    setSalvando(true);
    try {
      await chamar("POST", "/api/agendamento/reservas", {
        nome, telefone, email, data, horas: manual ? undefined : horas, qtdRecursos: recursos, qtdPessoas: pessoas, tipoEvento: tipo, observacoes: obs, pagamento: pedido,
        manual: manual ? { hora: mHora, duracao: Number(mDur), valor: total } : undefined,
        mesa: mesa ? { ativo: true, cadeiras, aniversariante } : undefined,
      });
      toast.success("Reserva criada.");
      onCriada(); onClose();
    } catch (e: any) { toast.error(e?.message || "Não foi possível criar a reserva."); }
    setSalvando(false);
  };

  const alternar = (h: string) => setHoras((a) => (a.includes(h) ? a.filter((x) => x !== h) : [...a, h].sort()));

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl" title="Nova reserva" description={`Reserve ${config.recurso_plural.toLowerCase()} para um cliente.`} closeOnBackdrop={false}
      footer={<div className="flex items-center justify-between w-full gap-2"><span className="text-sm font-black text-[var(--color-text-primary)]">Total {reaisBR(total)}</span><div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={!podeSalvar || salvando}>{salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar reserva</Button></div></div>}>
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5"><label className={rotulo}>Nome do cliente</label><Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} /></div>
          <div className="space-y-1.5"><label className={rotulo}>WhatsApp</label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="(00) 00000-0000" /></div>
          <div className="space-y-1.5 sm:col-span-2"><label className={rotulo}>E-mail (opcional)</label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
        </div>
        {!permissoes.sem_contato && !admin && <p className="text-xs text-[var(--color-text-muted)] -mt-3">Informe o WhatsApp ou o e-mail do cliente.</p>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5 col-span-2"><label className={rotulo}>Data</label><input type="date" value={data} onChange={(e) => { setData(e.target.value); setHoras([]); }} className={campo} /></div>
          <div className="space-y-1.5"><label className={rotulo}>{config.recurso_plural}</label><input type="number" min={1} max={config.qtd_recursos} value={recursos} onChange={(e) => setRecursos(Math.max(1, Math.min(config.qtd_recursos, Number(e.target.value) || 1)))} className={campo} /></div>
          <div className="space-y-1.5"><label className={rotulo}>Pessoas (máx. {limitePessoas})</label><input type="number" min={1} max={limitePessoas} value={pessoas} onChange={(e) => setPessoas(Number(e.target.value) || 1)} className={cn(campo, pessoas > limitePessoas && "border-rose-500")} /></div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5"><span className={rotulo}>Horários</span><HelpTip label="Horários">Marque uma ou mais horas. Horas seguidas viram uma única reserva. Os números mostram quantas {config.recurso_plural.toLowerCase()} ainda estão livres.</HelpTip></div>
            {admin || permissoes.editar ? <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">Encaixe manual<Switch checked={manual} onCheckedChange={setManual} /></label> : null}
          </div>
          {manual ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><label className={rotulo}>Início</label><input type="time" value={mHora} onChange={(e) => setMHora(e.target.value)} className={campo} /></div>
              <div className="space-y-1.5"><label className={rotulo}>Duração (h)</label><input type="number" min={0.5} step={0.5} value={mDur} onChange={(e) => setMDur(e.target.value)} className={campo} /></div>
              <div className="space-y-1.5"><label className={rotulo}>Valor (R$)</label><input inputMode="decimal" value={mValor} onChange={(e) => setMValor(e.target.value)} placeholder="0,00" className={campo} /></div>
            </div>
          ) : slots.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">Fechado nesta data.</p> : (
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s) => { const sel = horas.includes(s.hora); const off = !s.disponivel || s.livres < recursos; return (
                <button key={s.hora} type="button" disabled={off && !sel} onClick={() => alternar(s.hora)} className={cn("px-3 h-10 rounded-xl text-sm font-bold border min-w-[74px]", sel ? "bg-[var(--color-primary)] text-white border-transparent" : off ? "opacity-40 line-through border-[var(--color-border-default)] cursor-not-allowed" : "border-[var(--color-border-default)] hover:bg-[var(--color-surface-hover)]")}>
                  {s.rotulo}<span className="block text-[9px] font-semibold opacity-70">{s.livres} livre{s.livres === 1 ? "" : "s"}</span></button>); })}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5"><label className={rotulo}>Tipo de evento</label><select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>{config.tipos_evento.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="space-y-1.5"><label className={rotulo}>Observações</label><Input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={800} /></div>
        </div>

        {config.mesas_ativo && (
          <div className="rounded-xl border border-[var(--color-border-default)] p-3 space-y-3">
            <label className="flex items-center justify-between text-sm font-semibold text-[var(--color-text-primary)]">Reservar mesa junto<Switch checked={mesa} onCheckedChange={setMesa} /></label>
            {mesa && <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label className={rotulo}>Lugares (até {config.cadeiras_max})</label><input type="number" min={1} max={config.cadeiras_max} value={cadeiras} onChange={(e) => setCadeiras(Number(e.target.value) || 1)} className={campo} /></div><div className="space-y-1.5"><label className={rotulo}>Aniversariante</label><Input value={aniversariante} onChange={(e) => setAniversariante(e.target.value)} maxLength={80} /></div></div>}
          </div>
        )}

        <PagamentoForm total={total} admin={admin} podeReceber={admin || !!permissoes.receber} onChange={(p, e) => { setPedido(p); setErroPag(e); }} />
        {erroPag && <p className="text-xs text-amber-600">{erroPag}</p>}
      </div>
    </Modal>
  );
}
