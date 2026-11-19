import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Facebook, Image as ImageIcon, Layers, Loader2, Users, X } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { apiFetch } from "../../lib/apiClient";
import { parseCurrencyBR } from "../../lib/utils";
import { type Campanha, type Nivel, formatadores, leadDaCampanha, varianteStatus } from "./campanhasComum";

interface Dia { data: string; gasto: number; impressoes: number; cliques: number; resultados: number }
interface Detalhe { configurado: boolean; campanha?: Campanha; diario?: Dia[]; moeda?: string; parcial?: boolean; error?: string }
interface Itens { campanhas?: Campanha[]; error?: string }

const ABAS = [["conjuntos", "Conjuntos de anúncios", Layers], ["anuncios", "Anúncios", ImageIcon], ["leads", "Leads no SPY", Users]] as const;
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dataLonga = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const COMPRA: Record<string, string> = { AUCTION: "Leilão", RESERVED: "Alcance e frequência" };
const LANCE: Record<string, string> = { LOWEST_COST_WITHOUT_CAP: "Menor custo", LOWEST_COST_WITH_BID_CAP: "Limite de lance", COST_CAP: "Limite de custo", LOWEST_COST_WITH_MIN_ROAS: "ROAS mínimo" };

/** Painel de detalhe de uma campanha: dados do Meta (totais, gráfico diário, conjuntos e anúncios) e os leads/vendas que ela trouxe no SPY. */
export function CampanhaDetalhe({ campanha, dias, onFechar }: { campanha: Campanha; dias: number; onFechar: () => void }) {
  const { activeTenantId } = useAuth();
  const { leads } = useData();
  const navigate = useNavigate();
  const [d, setD] = useState<Detalhe | null>(null);
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>("conjuntos");
  const [itens, setItens] = useState<Record<string, Itens | null>>({});

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", esc);
    const antes = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = antes; };
  }, [onFechar]);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelado = false; setD(null);
    apiFetch(`/api/marketing/meta-campanhas/${encodeURIComponent(campanha.id)}?tenantId=${encodeURIComponent(activeTenantId)}&dias=${dias}`)
      .then((r) => r.json().catch(() => ({ configurado: true, error: "Resposta inválida do servidor." })))
      .then((j) => { if (!cancelado) setD(j); })
      .catch(() => { if (!cancelado) setD({ configurado: true, error: "Não foi possível consultar o Meta Ads agora." }); });
    return () => { cancelado = true; };
  }, [activeTenantId, campanha.id, dias]);

  // Conjuntos e anúncios só são buscados quando a aba é aberta.
  useEffect(() => {
    if (!activeTenantId || (aba !== "conjuntos" && aba !== "anuncios")) return;
    const nivel: Nivel = aba === "conjuntos" ? "adset" : "ad";
    if (itens[nivel] !== undefined) return;
    let cancelado = false;
    setItens((x) => ({ ...x, [nivel]: null }));
    apiFetch(`/api/marketing/meta-campanhas?tenantId=${encodeURIComponent(activeTenantId)}&dias=${dias}&nivel=${nivel}&campanha=${encodeURIComponent(campanha.id)}`)
      .then((r) => r.json().catch(() => ({ error: "Resposta inválida do servidor." })))
      .then((j) => { if (!cancelado) setItens((x) => ({ ...x, [nivel]: j })); })
      .catch(() => { if (!cancelado) setItens((x) => ({ ...x, [nivel]: { error: "Não foi possível consultar o Meta Ads agora." } })); });
    return () => { cancelado = true; };
  }, [aba, activeTenantId, campanha.id, dias]); // eslint-disable-line react-hooks/exhaustive-deps

  const c: Campanha = d?.campanha ?? campanha;
  const moeda = d?.moeda || "BRL";
  const { brl, num, pct } = formatadores(moeda);

  // O que esta campanha trouxe no SPY: leads cujo utm_campaign é o ID ou o nome dela.
  const doSpy = useMemo(() => {
    const ls = (leads || []).filter((l: any) => leadDaCampanha(l, c));
    const fechados = ls.filter((l: any) => l.status === "Fechado");
    const receita = fechados.reduce((s: number, l: any) => s + parseCurrencyBR(l.value), 0);
    return { ls, fechados: fechados.length, receita };
  }, [leads, c.id, c.nome]);

  const tooltip = { backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 12, color: "var(--color-text-primary)", boxShadow: "var(--shadow-panel)" } as const;
  const eixo = { stroke: "var(--color-text-faint)", fontSize: 11, tickLine: false, axisLine: false } as const;
  const carregando = d === null;

  const kpis: [string, string, string?][] = [
    ["Valor usado", brl(c.gasto), c.orcamento.tipo ? `orçamento ${brl(c.orcamento.valor)} ${c.orcamento.tipo === "diario" ? "por dia" : "vitalício"}` : "orçamento nos conjuntos"],
    ["Resultados", c.resultados > 0 ? num(c.resultados) : "—", c.resultadoRotulo],
    ["Custo por resultado", c.custoPorResultado > 0 ? brl(c.custoPorResultado) : "—"],
    ["Impressões", num(c.impressoes), c.cpm > 0 ? `CPM ${brl(c.cpm)}` : undefined],
    ["Alcance", num(c.alcance), "pessoas únicas"],
    ["Cliques", num(c.cliques), `CTR ${pct(c.ctr)}`],
    ["CPC", c.cpc > 0 ? brl(c.cpc) : "—", "custo por clique"],
    ["Frequência", c.alcance > 0 ? (c.impressoes / c.alcance).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—", "impressões por pessoa"],
  ];

  const tabela = (nivel: "adset" | "ad") => {
    const x = itens[nivel];
    if (x === undefined || x === null) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>;
    if (x.error) return <p className="py-6 text-center text-sm text-[var(--color-danger)]">{x.error}</p>;
    const lista = x.campanhas || [];
    if (!lista.length) return <EmptyState icon={nivel === "adset" ? Layers : ImageIcon} title={nivel === "adset" ? "Nenhum conjunto de anúncios" : "Nenhum anúncio"} description="Não há itens nessa campanha no período." className="py-8" />;
    return (
      <div className="overflow-x-auto rounded-lg border border-[var(--color-border-default)]">
        <table className="w-full text-xs min-w-[640px]">
          <thead className="bg-[var(--color-surface-sunken)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]"><tr>{["Nome", "Status", "Resultados", "Custo/res.", "Valor usado", "Cliques", "CTR"].map((h, i) => <th key={h} className={`py-2 px-3 font-black whitespace-nowrap ${i < 2 ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[var(--color-border-subtle,var(--color-border-default))]">
            {lista.map((i) => (
              <tr key={i.id}>
                <td className="py-2.5 px-3 max-w-[260px]"><div className="flex items-center gap-2 min-w-0">
                  {nivel === "ad" && (i.miniatura ? <img src={i.miniatura} alt="" loading="lazy" className="w-8 h-8 rounded-md object-cover shrink-0 border border-[var(--color-border-default)]" /> : <div className="w-8 h-8 rounded-md shrink-0 bg-[var(--color-surface-sunken)] flex items-center justify-center"><ImageIcon className="w-4 h-4 text-[var(--color-text-faint)]" /></div>)}
                  <div className="min-w-0"><p className="font-bold text-[var(--color-text-primary)] truncate" title={i.nome}>{i.nome}</p><p className="text-[10px] text-[var(--color-text-faint)] truncate">{nivel === "ad" ? (i.conjuntoNome ?? "") : i.orcamento.tipo ? `${brl(i.orcamento.valor)} ${i.orcamento.tipo === "diario" ? "por dia" : "vitalício"}` : ""}</p></div></div></td>
                <td className="py-2.5 px-3"><Badge variant={varianteStatus(i.status)} dot dotPulse={i.status === "ACTIVE"}>{i.statusRotulo}</Badge></td>
                <td className="py-2.5 px-3 text-right tabular-nums">{i.resultados > 0 ? <b className="text-[var(--color-text-primary)]">{num(i.resultados)}</b> : "—"}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-primary)]">{i.custoPorResultado > 0 ? brl(i.custoPorResultado) : "—"}</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[var(--color-text-primary)]">{brl(i.gasto)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{num(i.cliques)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{pct(i.ctr)}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end" role="dialog" aria-modal="true" aria-label={`Detalhes da campanha ${c.nome}`}>
      <div className="absolute inset-0 bg-black/50" onClick={onFechar} />
      <aside className="relative w-full max-w-3xl h-full overflow-y-auto bg-[var(--color-surface)] shadow-[var(--shadow-panel)] border-l border-[var(--color-border-default)]">
        <header className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border-default)] px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-faint)]"><span className="w-6 h-6 rounded-md bg-blue-600/10 text-blue-500 flex items-center justify-center"><Facebook className="w-3.5 h-3.5" /></span> Meta Ads · ID {c.id}</div>
            <h2 className="text-lg font-black text-[var(--color-text-primary)] break-words">{c.nome}</h2>
            <div className="flex flex-wrap items-center gap-2"><Badge variant={varianteStatus(c.status)} dot dotPulse={c.status === "ACTIVE"}>{c.statusRotulo}</Badge><span className="text-xs text-[var(--color-text-muted)]">{c.objetivoRotulo}</span></div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)]"><X className="w-5 h-5" /></button>
        </header>

        <div className="p-5 space-y-5">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-xs">
            {[["Início", dataLonga(c.inicio ?? c.criadaEm)], ["Término", c.fim ? dataLonga(c.fim) : "Sem data final"], ["Compra", COMPRA[c.compra ?? ""] ?? (c.compra || "—")], ["Estratégia de lance", LANCE[c.lance ?? ""] ?? (c.lance ? c.lance.toLowerCase().replace(/_/g, " ") : "—")]].map(([t, v]) => (
              <div key={t}><dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">{t}</dt><dd className="font-semibold text-[var(--color-text-primary)]">{v}</dd></div>))}
          </dl>

          {d?.error ? <Card className="p-5 text-center space-y-3"><p className="text-sm text-[var(--color-danger)]">{d.error}</p><Button variant="outline" onClick={() => navigate("/app/configuracoes/integracoes/apps")} className="h-8 px-3 text-xs">Abrir Integrações</Button></Card> : (<>
            <section aria-label={`Resumo dos últimos ${dias} dias`}>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-2">Últimos {dias} dias{carregando && " · carregando…"}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {kpis.map(([t, v, sub]) => (<Card key={t} className="p-3 min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] truncate">{t}</p><p className="text-base font-black text-[var(--color-text-primary)] truncate">{v}</p>{sub && <p className="text-[10px] text-[var(--color-text-muted)] truncate">{sub}</p>}</Card>))}
              </div>
            </section>

            <Card className="p-4">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-3">Valor usado e resultados por dia</h3>
              {carregando ? <div className="h-56 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>
                : !d?.diario?.length ? <EmptyState icon={Facebook} title="Sem veiculação no período" description="A campanha não gastou nesses dias." className="py-8" /> : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={d.diario.map((x) => ({ ...x, dia: dataCurta(x.data) }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <defs><linearGradient id="gGasto" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle, rgba(128,128,128,.2))" vertical={false} />
                        <XAxis dataKey="dia" {...eixo} minTickGap={16} />
                        <YAxis yAxisId="g" {...eixo} width={44} />
                        <YAxis yAxisId="r" orientation="right" {...eixo} width={32} allowDecimals={false} />
                        <Tooltip contentStyle={tooltip} formatter={(v: any, n: any) => (n === "Valor usado" ? brl(Number(v)) : num(Number(v)))} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                        <Area yAxisId="g" type="monotone" dataKey="gasto" name="Valor usado" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gGasto)" />
                        <Area yAxisId="r" type="monotone" dataKey="resultados" name={c.resultadoRotulo || "Resultados"} stroke="#10b981" strokeWidth={2.5} fill="none" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>)}
            </Card>

            <div>
              <div className="flex flex-wrap gap-x-4 border-b border-[var(--color-border-default)] mb-4">
                {ABAS.map(([id, rotulo, Icone]) => (
                  <button key={id} type="button" onClick={() => setAba(id)} className={`-mb-px flex items-center gap-1.5 px-1 pb-2.5 pt-1 text-xs font-bold border-b-2 ${aba === id ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>
                    <Icone className="w-3.5 h-3.5" /> {rotulo}{id === "leads" && doSpy.ls.length > 0 ? ` · ${doSpy.ls.length}` : ""}
                  </button>))}
              </div>
              {aba === "conjuntos" && tabela("adset")}
              {aba === "anuncios" && tabela("ad")}
              {aba === "leads" && (
                <div className="space-y-4">
                  {doSpy.ls.length === 0 ? (
                    <EmptyState icon={Users} title="Nenhum lead ligado a esta campanha ainda" description={`O SPY liga o lead à campanha pelo parâmetro utm_campaign do link do anúncio. No Gerenciador de Anúncios, use nos parâmetros de URL: utm_source=facebook&utm_medium=cpc&utm_campaign={{campaign.name}} (ou o ID {{campaign.id}}). Leads de formulários e páginas do SPY que abrirem por esse link aparecem aqui.`} className="py-8" />
                  ) : (<>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {([["Leads no SPY", num(doSpy.ls.length), c.gasto > 0 ? `custo real ${brl(c.gasto / doSpy.ls.length)} por lead` : undefined], ["Vendas fechadas", num(doSpy.fechados), doSpy.ls.length ? `${pct((doSpy.fechados / doSpy.ls.length) * 100)} dos leads` : undefined], ["Receita", brl(doSpy.receita)], ["Retorno (ROAS)", c.gasto > 0 && doSpy.receita > 0 ? `${(doSpy.receita / c.gasto).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x` : "—", c.gasto > 0 && doSpy.fechados > 0 ? `custo por venda ${brl(c.gasto / doSpy.fechados)}` : undefined]] as [string, string, string?][]).map(([t, v, sub]) => (
                        <Card key={t} className="p-3 min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] truncate">{t}</p><p className="text-base font-black text-[var(--color-text-primary)] truncate">{v}</p>{sub && <p className="text-[10px] text-[var(--color-text-muted)] truncate">{sub}</p>}</Card>))}
                    </div>
                    <ul className="divide-y divide-[var(--color-border-subtle,var(--color-border-default))] rounded-lg border border-[var(--color-border-default)]">
                      {doSpy.ls.slice(0, 15).map((l: any) => (
                        <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                          <div className="min-w-0"><p className="font-bold text-[var(--color-text-primary)] truncate">{l.name || "(sem nome)"}</p><p className="text-[10px] text-[var(--color-text-faint)] truncate">{l.email || l.phone || ""}</p></div>
                          <div className="text-right shrink-0"><Badge variant={l.status === "Fechado" ? "success" : l.status === "Perdido" ? "destructive" : "neutral"}>{l.status || "—"}</Badge>{l.status === "Fechado" && parseCurrencyBR(l.value) > 0 && <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{brl(parseCurrencyBR(l.value))}</p>}</div>
                        </li>))}
                    </ul>
                    {doSpy.ls.length > 15 && <p className="text-[11px] text-[var(--color-text-faint)]">Mostrando 15 de {doSpy.ls.length} leads.</p>}
                  </>)}
                </div>)}
            </div>
            {d?.parcial && <p className="text-[11px] text-[var(--color-warning,#b45309)]">⚠ O Meta respondeu só parte dos dados. Alguns números podem estar incompletos.</p>}
          </>)}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
