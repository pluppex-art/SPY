import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarCheck, CalendarDays, CalendarX, ChevronLeft, ChevronRight, Clock, Copy, Download, ExternalLink, List, Plus, Search, Settings, UserCheck, UserX, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { KpiFilterCard } from "../../components/ui/kpi-filter-card";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { Spinner } from "../../components/ui/spinner";
import { HelpTip } from "../../components/ui/help-tip";
import { cn } from "../../lib/utils";
import { agoraNoFuso, diaDaSemana, faixaDoDia, gerarSlots, horaParaExibir, minutosDaHora, somarDias } from "../../lib/agendamento/engine";
import { DIAS_SEMANA, dataBR, reaisBR, type Reserva } from "../../lib/agendamento/cliente";
import { useAgendamento } from "./useAgendamento";
import { NovaReservaModal } from "./components/NovaReservaModal";
import { ReservaModal } from "./components/ReservaModal";
import { COR_STATUS } from "./components/Estilos";

type Visao = "dia" | "semana" | "lista";
const inicioSemana = (d: string) => somarDias(d, -diaDaSemana(d));
const sel = "h-9 px-2.5 rounded-lg text-xs font-semibold border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";

/** Agenda de reservas: visão do dia (por hora), da semana (ocupação) e em lista (filtros e exportação). */
export default function AgendamentoAgenda() {
  const hojeInicial = agoraNoFuso().data;
  const [visao, setVisao] = useState<Visao>("dia");
  const [data, setData] = useState(hojeInicial);
  const [listaDe, setListaDe] = useState(hojeInicial);
  const [listaAte, setListaAte] = useState(somarDias(hojeInicial, 30));
  const [busca, setBusca] = useState(""); const [fStatus, setFStatus] = useState(""); const [fPag, setFPag] = useState(""); const [fOrigem, setFOrigem] = useState("");
  const [nova, setNova] = useState<{ data: string } | null>(null);
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const semanaIni = inicioSemana(data);
  const [de, ate] = visao === "dia" ? [data, data] : visao === "semana" ? [semanaIni, somarDias(semanaIni, 6)] : [listaDe, listaAte];
  const a = useAgendamento(de, ate);
  const aberta = a.reservas.find((r) => r.id === abertaId) ?? a.pendencias.find((r) => r.id === abertaId) ?? null;

  const passa = (r: Reserva) => {
    const q = busca.trim().toLowerCase();
    return (!q || [r.contatoNome, r.contatoTelefone, r.contatoEmail, r.comanda, r.tipoEvento].some((v) => (v ?? "").toLowerCase().includes(q)))
      && (!fStatus || r.status === fStatus) && (!fPag || r.statusPagamento === fPag) && (!fOrigem || r.origem === fOrigem);
  };
  const filtradas = useMemo(() => a.reservas.filter(passa), [a.reservas, busca, fStatus, fPag, fOrigem]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtrando = !!(busca || fStatus || fPag || fOrigem);
  const limpar = () => { setBusca(""); setFStatus(""); setFPag(""); setFOrigem(""); };

  const doDia = useMemo(() => a.reservas.filter((r) => r.data === data), [a.reservas, data]);
  const ativasDia = useMemo(() => filtradas.filter((r) => r.data === data && r.status !== "Cancelada"), [filtradas, data]);
  const canceladasDia = useMemo(() => filtradas.filter((r) => r.data === data && r.status === "Cancelada"), [filtradas, data]);
  const slots = useMemo(() => (a.engine ? gerarSlots(data, a.engine, doDia, { agora: a.agora, equipe: true }) : []), [a.engine, data, doDia, a.agora]);
  const faixa = a.engine ? faixaDoDia(data, a.engine) : null;

  const linhas = useMemo(() => {
    const porHora = new Map<number, Reserva[]>();
    for (const r of ativasDia) { const h = Math.floor(minutosDaHora(r.hora) / 60); porHora.set(h, [...(porHora.get(h) ?? []), r]); }
    const horasGrade = slots.map((s) => Math.floor(minutosDaHora(s.hora) / 60));
    return Array.from(new Set([...horasGrade, ...porHora.keys()])).sort((x, y) => x - y).map((h) => ({ h, slot: slots.find((s) => Math.floor(minutosDaHora(s.hora) / 60) === h), reservas: porHora.get(h) ?? [] }));
  }, [slots, ativasDia]);

  const semana = useMemo(() => {
    if (!a.engine || visao !== "semana") return [];
    return Array.from({ length: 7 }, (_, i) => {
      const d = somarDias(semanaIni, i);
      const rs = a.reservas.filter((r) => r.data === d);
      const sl = gerarSlots(d, a.engine!, rs, { agora: a.agora, equipe: true });
      const cap = sl.length * a.engine!.qtdRecursos;
      const ocup = sl.reduce((s, x) => s + (a.engine!.qtdRecursos - x.livres), 0);
      const ativas = rs.filter((r) => r.status !== "Cancelada");
      return { d, aberto: sl.length > 0, pct: cap ? Math.round((ocup / cap) * 100) : 0, reservas: ativas.filter(passa), pago: ativas.filter((r) => r.statusPagamento === "Pago").reduce((s, r) => s + r.valorTotal, 0), aReceber: ativas.filter((r) => r.statusPagamento === "Pendente").reduce((s, r) => s + r.valorTotal, 0) };
    });
  }, [a.engine, a.reservas, a.agora, semanaIni, visao, busca, fStatus, fPag, fOrigem]); // eslint-disable-line react-hooks/exhaustive-deps

  if (a.carregando) return <div className="flex justify-center py-24"><Spinner /></div>;
  if (a.erro === "modulo") return <PageContainer title="Agendamento"><EmptyState icon={CalendarX} title="Módulo não habilitado" description="O módulo de Agendamento não está ligado para esta empresa. Peça ao administrador do sistema para habilitá-lo." /></PageContainer>;
  if (a.erro === "tabela") return <PageContainer title="Agendamento"><EmptyState icon={CalendarX} title="Falta criar as tabelas do Agendamento" description="Peça para a equipe técnica aplicar a migração 20261122_agendamento e recarregue a página." /></PageContainer>;
  if (!a.config || !a.engine) return <PageContainer title="Agendamento"><EmptyState icon={CalendarX} title="Não foi possível carregar" description={a.erro || "Tente recarregar a página."} /></PageContainer>;

  const cfg = a.config;
  const ehHoje = data === a.agora.data;
  const copiar = async () => { if (!a.linkPublico) return; try { await navigator.clipboard.writeText(a.linkPublico); toast.success("Link copiado."); } catch { toast.error("Não foi possível copiar."); } };
  const irPara = (d: string, v: Visao = "dia") => { setData(d); setVisao(v); };
  const passo = visao === "semana" ? 7 : 1;

  const exportar = () => {
    const linhasCsv = [["Data", "Hora", "Duração (h)", "Cliente", "Telefone", "E-mail", cfg.recurso_plural, "Pessoas", "Tipo", "Valor", "Status", "Pagamento", "Forma", "Origem", "Observações"],
      ...filtradas.map((r) => [dataBR(r.data), horaParaExibir(r.hora), r.duracao, r.contatoNome, r.contatoTelefone ?? "", r.contatoEmail ?? "", r.qtdRecursos, r.qtdPessoas, r.tipoEvento ?? "", r.valorTotal.toFixed(2).replace(".", ","), r.status, r.statusPagamento, r.formaPagamento ?? "", r.origem, r.observacoes ?? ""])];
    const csv = linhasCsv.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const el = document.createElement("a"); el.href = url; el.download = `reservas_${de}_${ate}.csv`; el.click(); URL.revokeObjectURL(url);
  };

  const cartao = (r: Reserva, compacto = false) => (
    <button key={r.id} onClick={() => setAbertaId(r.id)} className={cn("text-left rounded-xl border px-3 py-2 hover:shadow-md transition-shadow", compacto ? "w-full" : "min-w-[190px] max-w-full", COR_STATUS[r.status])}>
      <p className="text-sm font-black text-[var(--color-text-primary)] truncate">{r.contatoNome}</p>
      <p className="text-[11px] font-semibold flex items-center gap-2 flex-wrap"><span>{horaParaExibir(r.hora)} · {r.duracao}h</span><span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{r.qtdPessoas}</span><span>{r.qtdRecursos} {r.qtdRecursos === 1 ? cfg.recurso_singular.toLowerCase() : cfg.recurso_plural.toLowerCase()}</span></p>
      {!compacto && <p className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap"><b>{r.status}</b><span>·</span><span>{r.statusPagamento === "Pago" ? "Pago" : r.comanda ? `Comanda ${r.comanda}` : "A receber"} {reaisBR(r.valorTotal)}</span>{r.origem === "site" && <span className="px-1.5 rounded bg-violet-500/15 text-violet-600 font-bold">site</span>}{r.mesa && <span className="px-1.5 rounded bg-orange-500/15 text-orange-600 font-bold">mesa</span>}</p>}
    </button>
  );

  const titulo = visao === "dia" ? `${DIAS_SEMANA[diaDaSemana(data)]}, ${dataBR(data)}` : visao === "semana" ? `${dataBR(semanaIni)} a ${dataBR(somarDias(semanaIni, 6))}` : "";

  return (
    <PageContainer
      title="Agendamento"
      subtitle={`Reservas de ${cfg.recurso_plural.toLowerCase()} por horário. Clientes reservam pela página pública e você acompanha tudo aqui em tempo real.`}
      actions={<div className="flex flex-wrap gap-2">
        {a.linkPublico && cfg.ativo && <><Button variant="outline" size="sm" onClick={copiar}><Copy className="w-4 h-4 mr-1.5" />Copiar link</Button><a href={a.linkPublico} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1.5" />Abrir página</Button></a></>}
        {a.admin && <Link to="/app/agendamento/configuracoes"><Button variant="outline" size="sm"><Settings className="w-4 h-4 mr-1.5" />Configurações</Button></Link>}
        {a.permissoes.criar && <Button size="sm" onClick={() => setNova({ data })}><Plus className="w-4 h-4 mr-1.5" />Nova reserva</Button>}
      </div>}
    >
      <KpiFilterCard id="agendamento" className="mb-4" kpis={[
        { label: visao === "dia" ? "Reservas do dia" : "Reservas no período", value: a.metricas.total, icon: CalendarCheck, tone: "primary", hint: `Contadas por ${cfg.recurso_singular.toLowerCase()} e hora.` },
        { label: "Aguardando pagamento", value: a.metricas.pendentes, icon: Clock, tone: "warning" },
        { label: "Pagas", value: a.metricas.confirmadas, icon: Wallet, tone: "success" },
        { label: "Chegaram", value: a.metricas.checkin, icon: UserCheck, tone: "info" },
        { label: "Faltaram", value: a.metricas.noshow, icon: UserX, tone: "danger" },
      ]} />

      {a.alertas.length > 0 && (
        <Card className="mb-4 p-3 border-amber-500/30 bg-amber-500/5">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-600 mb-2"><AlertTriangle className="w-4 h-4" />Atenção ({a.alertas.length})</p>
          <ul className="space-y-1">{a.alertas.slice(0, 8).map((al) => (
            <li key={al.reservaId + al.tipo}><button onClick={() => setAbertaId(al.reservaId)} className={cn("text-left text-sm hover:underline", al.urgente || al.tipo === "PENDENCIA_PASSADA" || al.tipo === "PARTIDA_ENCERRADA" ? "text-rose-600 font-semibold" : "text-[var(--color-text-secondary)]")}>{al.mensagem}</button></li>))}</ul>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-xl border border-[var(--color-border-default)] overflow-hidden">
          {([["dia", "Dia", CalendarDays], ["semana", "Semana", CalendarCheck], ["lista", "Lista", List]] as const).map(([id, nome, Icone]) => (
            <button key={id} onClick={() => setVisao(id)} className={cn("px-3.5 h-10 text-sm font-bold flex items-center gap-1.5", visao === id ? "bg-[var(--color-primary)] text-white" : "hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]")}><Icone className="w-4 h-4" />{nome}</button>))}
        </div>
        {visao !== "lista" ? (<>
          <Button variant="outline" size="icon" onClick={() => setData(somarDias(data, -passo))} aria-label="Anterior"><ChevronLeft className="w-4 h-4" /></Button>
          <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} className="h-10 px-3 rounded-xl text-sm border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" />
          <Button variant="outline" size="icon" onClick={() => setData(somarDias(data, passo))} aria-label="Próximo"><ChevronRight className="w-4 h-4" /></Button>
          {!ehHoje && <Button variant="ghost" size="sm" onClick={() => setData(a.agora.data)}>Hoje</Button>}
          <span className="text-sm font-bold text-[var(--color-text-primary)]">{titulo}</span>
          {visao === "dia" && !faixa && <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-500/10 text-slate-500">Fechado</span>}
        </>) : (<>
          <input type="date" value={listaDe} onChange={(e) => e.target.value && setListaDe(e.target.value)} className={cn(sel, "h-10")} aria-label="De" />
          <span className="text-xs text-[var(--color-text-muted)]">até</span>
          <input type="date" value={listaAte} onChange={(e) => e.target.value && setListaAte(e.target.value)} className={cn(sel, "h-10")} aria-label="Até" />
          <HelpTip label="Período">Mostra até 2.000 reservas do período escolhido. Use os filtros e exporte para planilha.</HelpTip>
        </>)}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative"><Search className="w-4 h-4 absolute left-2.5 top-2.5 text-[var(--color-text-muted)]" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, telefone, comanda…" className={cn(sel, "pl-8 w-64")} /></div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={sel}><option value="">Todos os status</option>{["Pendente", "Confirmada", "Check-in", "No-show", "Cancelada"].map((s) => <option key={s}>{s}</option>)}</select>
        <select value={fPag} onChange={(e) => setFPag(e.target.value)} className={sel}><option value="">Todos os pagamentos</option>{["Pendente", "Pago", "Reembolsado", "Pendente Estorno"].map((s) => <option key={s}>{s}</option>)}</select>
        <select value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} className={sel}><option value="">Toda origem</option><option value="site">Site</option><option value="equipe">Equipe</option><option value="importacao">Importada</option></select>
        {filtrando && <Button variant="ghost" size="sm" onClick={limpar}>Limpar filtros</Button>}
        {visao === "lista" && <Button variant="outline" size="sm" className="ml-auto" onClick={exportar} disabled={filtradas.length === 0}><Download className="w-4 h-4 mr-1.5" />Exportar planilha</Button>}
      </div>

      {visao === "dia" && (linhas.length === 0 ? (
        <EmptyState icon={CalendarX} title="Fechado neste dia" description="Não há horário de funcionamento para esta data. Ajuste em Configurações se precisar abrir." />
      ) : (
        <div className="space-y-2">
          {filtrando && ativasDia.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">Nenhuma reserva do dia combina com os filtros.</p>}
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
                  {reservas.length === 0 ? (a.permissoes.criar && slot && !passou && slot.livres > 0 ? <button onClick={() => setNova({ data })} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] self-center">+ Reservar este horário</button> : <span className="text-xs text-[var(--color-text-muted)] self-center">{slot && !passou ? "Lotado" : ""}</span>) : reservas.map((r) => cartao(r))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {visao === "dia" && canceladasDia.length > 0 && (
        <details className="mt-4"><summary className="text-xs font-bold text-[var(--color-text-muted)] cursor-pointer">Canceladas do dia ({canceladasDia.length})</summary>
          <ul className="mt-2 space-y-1">{canceladasDia.map((r) => <li key={r.id}><button onClick={() => setAbertaId(r.id)} className="text-sm text-[var(--color-text-secondary)] hover:underline">{horaParaExibir(r.hora)} · {r.contatoNome}{r.motivoCancelamento ? ` — ${r.motivoCancelamento}` : ""}</button></li>)}</ul></details>
      )}

      {visao === "semana" && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {semana.map((s) => (
            <div key={s.d} className={cn("rounded-xl border bg-[var(--color-surface)] p-2.5 flex flex-col gap-2 min-h-[160px]", s.d === a.agora.data ? "border-[var(--color-primary)]" : "border-[var(--color-border-default)]")}>
              <button onClick={() => irPara(s.d)} className="text-left"><p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">{DIAS_SEMANA[diaDaSemana(s.d)].slice(0, 3)}</p><p className="text-lg font-black text-[var(--color-text-primary)] leading-none">{s.d.slice(8)}<span className="text-xs font-semibold text-[var(--color-text-muted)]">/{s.d.slice(5, 7)}</span></p></button>
              {!s.aberto ? <span className="text-xs text-[var(--color-text-muted)]">Fechado</span> : (<>
                <div><div className="h-1.5 rounded-full bg-[var(--color-surface-hover)] overflow-hidden"><div className={cn("h-full", s.pct >= 90 ? "bg-rose-500" : s.pct >= 60 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${s.pct}%` }} /></div><p className="text-[10px] font-semibold text-[var(--color-text-muted)] mt-1">{s.pct}% ocupado · {s.reservas.length} reserva{s.reservas.length === 1 ? "" : "s"}</p></div>
                <div className="space-y-1 flex-1">{s.reservas.slice(0, 5).map((r) => cartao(r, true))}{s.reservas.length > 5 && <button onClick={() => irPara(s.d)} className="text-xs font-bold text-[var(--color-primary)]">+{s.reservas.length - 5} no dia</button>}</div>
                {(s.pago > 0 || s.aReceber > 0) && <p className="text-[10px] font-semibold text-[var(--color-text-muted)]">{reaisBR(s.pago)} pago{s.aReceber > 0 ? ` · ${reaisBR(s.aReceber)} a receber` : ""}</p>}
                {a.permissoes.criar && <button onClick={() => setNova({ data: s.d })} className="text-[11px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] text-left">+ Reservar</button>}
              </>)}
            </div>))}
        </div>
      )}

      {visao === "lista" && (filtradas.length === 0 ? <EmptyState icon={CalendarX} title="Nenhuma reserva" description={filtrando ? "Nenhuma reserva combina com os filtros neste período." : "Não há reservas neste período."} /> : (
        <div className="rounded-xl border border-[var(--color-border-default)] overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-[var(--color-surface-hover)] text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]"><tr>{["Data", "Hora", "Cliente", cfg.recurso_plural, "Pessoas", "Valor", "Status", "Pagamento", "Origem"].map((h) => <th key={h} className="text-left font-black px-3 py-2.5">{h}</th>)}</tr></thead>
            <tbody>{filtradas.map((r) => (
              <tr key={r.id} onClick={() => setAbertaId(r.id)} className="border-t border-[var(--color-border-default)] hover:bg-[var(--color-surface-hover)] cursor-pointer">
                <td className="px-3 py-2 font-semibold whitespace-nowrap">{dataBR(r.data)}</td><td className="px-3 py-2 whitespace-nowrap">{horaParaExibir(r.hora)} · {r.duracao}h</td>
                <td className="px-3 py-2"><p className="font-bold text-[var(--color-text-primary)]">{r.contatoNome}</p><p className="text-xs text-[var(--color-text-muted)]">{r.contatoTelefone}</p></td>
                <td className="px-3 py-2">{r.qtdRecursos}</td><td className="px-3 py-2">{r.qtdPessoas}</td><td className="px-3 py-2 whitespace-nowrap">{reaisBR(r.valorTotal)}</td>
                <td className="px-3 py-2"><span className={cn("px-2 py-0.5 rounded-full text-[11px] font-black border", COR_STATUS[r.status])}>{r.status}</span></td>
                <td className="px-3 py-2 text-xs font-semibold">{r.statusPagamento}{r.formaPagamento ? ` · ${r.formaPagamento}` : ""}</td><td className="px-3 py-2 text-xs capitalize">{r.origem}</td>
              </tr>))}</tbody>
          </table>
        </div>
      ))}

      <NovaReservaModal isOpen={!!nova} onClose={() => setNova(null)} dataInicial={nova?.data ?? data} config={cfg} engine={a.engine} agora={a.agora} admin={a.admin} permissoes={a.permissoes} onCriada={a.carregarReservas} />
      <ReservaModal reserva={aberta} config={cfg} admin={a.admin} permissoes={a.permissoes} onClose={() => setAbertaId(null)} executar={a.executar} />
    </PageContainer>
  );
}
