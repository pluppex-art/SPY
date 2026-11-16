import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarCheck, CalendarX, ChevronLeft, ChevronRight, Clock, Copy, ExternalLink, Plus, Settings, UserCheck, UserX, Wallet, Users } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { KpiFilterCard } from "../../components/ui/kpi-filter-card";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { Spinner } from "../../components/ui/spinner";
import { cn } from "../../lib/utils";
import { agoraNoFuso, faixaDoDia, gerarSlots, horaParaExibir, minutosDaHora, somarDias, diaDaSemana } from "../../lib/agendamento/engine";
import { DIAS_SEMANA, dataBR, reaisBR, type Reserva } from "../../lib/agendamento/cliente";
import { useAgendamento } from "./useAgendamento";
import { NovaReservaModal } from "./components/NovaReservaModal";
import { ReservaModal } from "./components/ReservaModal";
import { COR_STATUS } from "./components/Estilos";

/** Agenda de reservas do dia: ocupação por hora, reservas, alertas e as ações do atendimento. */
export default function AgendamentoAgenda() {
  const hojeInicial = agoraNoFuso().data;
  const [data, setData] = useState(hojeInicial);
  const a = useAgendamento(data);
  const [nova, setNova] = useState(false);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const aberta = a.reservas.find((r) => r.id === abertaId) ?? a.pendencias.find((r) => r.id === abertaId) ?? null;

  const ativas = useMemo(() => a.reservas.filter((r) => r.status !== "Cancelada"), [a.reservas]);
  const slots = useMemo(() => (a.config && a.engine ? gerarSlots(data, a.engine, a.reservas, { agora: a.agora, equipe: true }) : []), [a.config, a.engine, data, a.reservas, a.agora]);
  const faixa = a.engine ? faixaDoDia(data, a.engine) : null;
  const canceladas = a.reservas.filter((r) => r.status === "Cancelada");

  // Linhas da grade: cada hora do funcionamento + horas "soltas" (encaixes manuais fora da grade).
  const linhas = useMemo(() => {
    const porHora = new Map<number, Reserva[]>();
    for (const r of ativas) { const h = Math.floor(minutosDaHora(r.hora) / 60); porHora.set(h, [...(porHora.get(h) ?? []), r]); }
    const horasGrade = slots.map((s) => Math.floor(minutosDaHora(s.hora) / 60));
    const todas = Array.from(new Set([...horasGrade, ...porHora.keys()])).sort((x, y) => x - y);
    return todas.map((h) => ({ h, slot: slots.find((s) => Math.floor(minutosDaHora(s.hora) / 60) === h), reservas: porHora.get(h) ?? [] }));
  }, [slots, ativas]);

  if (a.carregando) return <div className="flex justify-center py-24"><Spinner /></div>;
  if (a.erro === "modulo") return <PageContainer title="Agendamento"><EmptyState icon={CalendarX} title="Módulo não habilitado" description="O módulo de Agendamento não está ligado para esta empresa. Peça ao administrador do sistema para habilitá-lo." /></PageContainer>;
  if (a.erro === "tabela") return <PageContainer title="Agendamento"><EmptyState icon={CalendarX} title="Falta criar as tabelas do Agendamento" description="Peça para a equipe técnica aplicar a migração 20261122_agendamento e recarregue a página." /></PageContainer>;
  if (!a.config || !a.engine) return <PageContainer title="Agendamento"><EmptyState icon={CalendarX} title="Não foi possível carregar" description={a.erro || "Tente recarregar a página."} /></PageContainer>;

  const cfg = a.config;
  const ehHoje = data === a.agora.data;
  const copiar = async () => { if (!a.linkPublico) return; try { await navigator.clipboard.writeText(a.linkPublico); toast.success("Link copiado."); } catch { toast.error("Não foi possível copiar."); } };

  return (
    <PageContainer
      title="Agendamento"
      subtitle={`Reservas de ${cfg.recurso_plural.toLowerCase()} por horário. Clientes reservam pela página pública e você acompanha tudo aqui em tempo real.`}
      actions={<div className="flex flex-wrap gap-2">
        {a.linkPublico && cfg.ativo && <><Button variant="outline" size="sm" onClick={copiar}><Copy className="w-4 h-4 mr-1.5" />Copiar link</Button><a href={a.linkPublico} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1.5" />Abrir página</Button></a></>}
        {a.admin && <Link to="/app/agendamento/configuracoes"><Button variant="outline" size="sm"><Settings className="w-4 h-4 mr-1.5" />Configurações</Button></Link>}
        {a.permissoes.criar && <Button size="sm" onClick={() => setNova(true)}><Plus className="w-4 h-4 mr-1.5" />Nova reserva</Button>}
      </div>}
    >
      <KpiFilterCard id="agendamento" className="mb-4" kpis={[
        { label: "Reservas do dia", value: a.metricas.total, icon: CalendarCheck, tone: "primary", hint: `Contadas por ${cfg.recurso_singular.toLowerCase()} e hora.` },
        { label: "Aguardando pagamento", value: a.metricas.pendentes, icon: Clock, tone: "warning" },
        { label: "Pagas", value: a.metricas.confirmadas, icon: Wallet, tone: "success" },
        { label: "Chegaram", value: a.metricas.checkin, icon: UserCheck, tone: "info" },
        { label: "Faltaram", value: a.metricas.noshow, icon: UserX, tone: "danger" },
      ]} />

      {a.alertas.length > 0 && (
        <Card className="mb-4 p-3 border-amber-500/30 bg-amber-500/5">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-600 mb-2"><AlertTriangle className="w-4 h-4" />Atenção ({a.alertas.length})</p>
          <ul className="space-y-1">
            {a.alertas.slice(0, 8).map((al) => (
              <li key={al.reservaId + al.tipo}><button onClick={() => setAbertaId(al.reservaId)} className={cn("text-left text-sm hover:underline", al.urgente || al.tipo === "PENDENCIA_PASSADA" || al.tipo === "PARTIDA_ENCERRADA" ? "text-rose-600 font-semibold" : "text-[var(--color-text-secondary)]")}>{al.mensagem}</button></li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button variant="outline" size="icon" onClick={() => setData(somarDias(data, -1))} aria-label="Dia anterior"><ChevronLeft className="w-4 h-4" /></Button>
        <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} className="h-10 px-3 rounded-xl text-sm border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" />
        <Button variant="outline" size="icon" onClick={() => setData(somarDias(data, 1))} aria-label="Próximo dia"><ChevronRight className="w-4 h-4" /></Button>
        {!ehHoje && <Button variant="ghost" size="sm" onClick={() => setData(a.agora.data)}>Hoje</Button>}
        <span className="text-sm font-bold text-[var(--color-text-primary)]">{DIAS_SEMANA[diaDaSemana(data)]}, {dataBR(data)}</span>
        {!faixa && <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-500/10 text-slate-500">Fechado</span>}
      </div>

      {linhas.length === 0 ? (
        <EmptyState icon={CalendarX} title="Fechado neste dia" description="Não há horário de funcionamento para esta data. Ajuste em Configurações se precisar abrir." />
      ) : (
        <div className="space-y-2">
          {linhas.map(({ h, slot, reservas }) => {
            const ocupados = slot ? cfg.qtd_recursos - slot.livres : reservas.reduce((s, r) => s + r.qtdRecursos, 0);
            const pct = Math.min(100, Math.round((ocupados / cfg.qtd_recursos) * 100));
            const passou = ehHoje && (slot?.passou ?? false);
            return (
              <div key={h} className={cn("flex gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface)] p-3", passou && "opacity-70")}>
                <div className="w-20 shrink-0">
                  <p className="text-base font-black text-[var(--color-text-primary)]">{String(h % 24).padStart(2, "0")}:00</p>
                  <div className="mt-1 h-1.5 rounded-full bg-[var(--color-surface-hover)] overflow-hidden" title={`${ocupados} de ${cfg.qtd_recursos} ocupadas`}><div className={cn("h-full", pct >= 100 ? "bg-rose-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1 text-[10px] font-semibold text-[var(--color-text-muted)]">{ocupados}/{cfg.qtd_recursos} {cfg.recurso_plural.toLowerCase()}</p>
                </div>
                <div className="flex-1 min-w-0 flex flex-wrap gap-2 items-start">
                  {reservas.length === 0 ? <span className="text-xs text-[var(--color-text-muted)] self-center">{slot && !passou ? "Livre" : ""}</span> : reservas.map((r) => (
                    <button key={r.id} onClick={() => setAbertaId(r.id)} className={cn("text-left rounded-xl border px-3 py-2 min-w-[190px] max-w-full hover:shadow-md transition-shadow", COR_STATUS[r.status])}>
                      <p className="text-sm font-black text-[var(--color-text-primary)] truncate">{r.contatoNome}</p>
                      <p className="text-[11px] font-semibold flex items-center gap-2 flex-wrap"><span>{horaParaExibir(r.hora)} · {r.duracao}h</span><span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{r.qtdPessoas}</span><span>{r.qtdRecursos} {r.qtdRecursos === 1 ? cfg.recurso_singular.toLowerCase() : cfg.recurso_plural.toLowerCase()}</span></p>
                      <p className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap"><b>{r.status}</b><span>·</span><span>{r.statusPagamento === "Pago" ? "Pago" : r.comanda ? `Comanda ${r.comanda}` : "A receber"} {reaisBR(r.valorTotal)}</span>{r.origem === "site" && <span className="px-1.5 rounded bg-violet-500/15 text-violet-600 font-bold">site</span>}{r.mesa && <span className="px-1.5 rounded bg-orange-500/15 text-orange-600 font-bold">mesa</span>}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canceladas.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs font-bold text-[var(--color-text-muted)] cursor-pointer">Canceladas do dia ({canceladas.length})</summary>
          <ul className="mt-2 space-y-1">{canceladas.map((r) => <li key={r.id}><button onClick={() => setAbertaId(r.id)} className="text-sm text-[var(--color-text-secondary)] hover:underline">{horaParaExibir(r.hora)} · {r.contatoNome}{r.motivoCancelamento ? ` — ${r.motivoCancelamento}` : ""}</button></li>)}</ul>
        </details>
      )}

      <NovaReservaModal isOpen={nova} onClose={() => setNova(false)} dataInicial={data} config={cfg} engine={a.engine} agora={a.agora} admin={a.admin} permissoes={a.permissoes} onCriada={a.carregarReservas} />
      <ReservaModal reserva={aberta} config={cfg} admin={a.admin} permissoes={a.permissoes} onClose={() => setAbertaId(null)} executar={a.executar} />
    </PageContainer>
  );
}
