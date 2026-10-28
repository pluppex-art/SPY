import { useMemo, useState } from "react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, Line, CartesianGrid, XAxis, YAxis, Legend,
} from "recharts";
import { Calendar, PieChart as PieIcon, TrendingUp, TrendingDown, Pencil, Check } from "lucide-react";
import { HexHeatmap } from "../../../components/ui/hex-heatmap";
import { Card } from "../../../components/ui/card";
import { DrillDownPanel } from "../../../components/ui/DrillDownPanel";
import { contractDrillColumns } from "../../../components/ui/drillColumns";
import { useData } from "../../../contexts/DataContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import type { DashboardData } from "../revenueInsights";
import { resolverPeriodo, serieDiaria, PERIODO_LABEL, type PeriodoOpcao } from "../vendedoresMetrics";
import { computeSegmentos, METRICA_LABEL, type MetricaSegmento, type SegmentoLinha } from "../segmentosMetrics";

const selectCls =
  "h-9 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-3 text-xs font-semibold text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)] cursor-pointer";

function Tendencia({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[var(--color-text-faint)]">—</span>;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-bold ${up ? "text-emerald-500" : "text-rose-500"}`}>
      <Icon className="w-3.5 h-3.5" /> {up ? "+" : ""}{pct}%
    </span>
  );
}

/** Meta do segmento: clique pra editar, Enter ou ✓ pra salvar. Só quem não é vendedor restrito edita. */
function MetaEditavel({ valor, editavel, onSalvar, formatCurrency }: {
  valor: number; editavel: boolean; onSalvar: (v: number) => void; formatCurrency: (n: number) => string;
}) {
  const [editando, setEditando] = useState(false);
  const [txt, setTxt] = useState("");
  const salvar = () => {
    const n = Number(txt.replace(/\./g, "").replace(",", ".")) || 0;
    onSalvar(Math.max(0, n));
    setEditando(false);
  };
  if (editando) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} inputMode="decimal" placeholder="0"
          onKeyDown={(e) => { if (e.key === "Enter") salvar(); if (e.key === "Escape") setEditando(false); }}
          className="w-24 h-7 rounded-md bg-[var(--color-surface-sunken)] border border-[var(--color-primary-blue)] px-2 text-xs font-mono outline-none"
        />
        <button type="button" onClick={salvar} className="text-emerald-500 cursor-pointer" title="Salvar meta"><Check className="w-4 h-4" /></button>
      </span>
    );
  }
  return (
    <button
      type="button" disabled={!editavel}
      onClick={() => { setTxt(valor ? String(valor) : ""); setEditando(true); }}
      className={`inline-flex items-center gap-1 font-mono whitespace-nowrap ${editavel ? "hover:text-[var(--color-primary-blue)] cursor-pointer" : "cursor-default"}`}
      title={editavel ? "Clique para definir a meta" : undefined}
    >
      {valor > 0 ? formatCurrency(valor) : <span className="whitespace-nowrap text-[var(--color-text-faint)]">definir meta</span>}
      {editavel && <Pencil className="w-3 h-3 opacity-50" />}
    </button>
  );
}

export default function SegmentosPanel({ dashboard }: { dashboard: DashboardData }) {
  const { contracts, proposals, proposalItems, products, appSettings, saveAppSetting, sellerRestricted } = useData() as any;
  const { formatCurrency } = useLocalization();

  const [metrica, setMetrica] = useState<MetricaSegmento>("receita");
  const [periodo, setPeriodo] = useState<PeriodoOpcao>("mes");
  const [segSel, setSegSel] = useState<string>("todos");
  const [acumulada, setAcumulada] = useState(true);
  const [detalhe, setDetalhe] = useState<SegmentoLinha | null>(null);

  const metas: Record<string, number> = useMemo(() => {
    const m = appSettings?.metas_segmento;
    return m && typeof m === "object" ? m : {};
  }, [appSettings]);

  const faixa = useMemo(
    () => resolverPeriodo(periodo, dashboard.dateFrom, dashboard.dateTo),
    [periodo, dashboard.dateFrom, dashboard.dateTo],
  );

  const { linhas, eventos, totalReceita } = useMemo(
    () => computeSegmentos({ contracts, proposals, proposalItems, products, metas }, faixa),
    [contracts, proposals, proposalItems, products, metas, faixa],
  );

  const visiveis = useMemo(() => linhas.filter((l) => segSel === "todos" || l.key === segSel), [linhas, segSel]);

  const valorDe = (l: SegmentoLinha) => (metrica === "receita" ? l.receita : metrica === "mrr" ? l.mrr : metrica === "total" ? l.total : l.negocios);
  const fmt = (n: number) => (metrica === "negocios" ? `${n}` : formatCurrency(n));
  const donut = visiveis.filter((l) => valorDe(l) > 0);
  const totalMetrica = visiveis.reduce((s, l) => s + valorDe(l), 0);

  const serie = useMemo(() => {
    const top = visiveis.filter((l) => valorDe(l) > 0).slice(0, 5);
    const ev = eventos.map((e) => ({ vendedorKey: e.vendedorKey, iso: e.iso, valor: metrica === "receita" ? e.valor : metrica === "mrr" ? e.mrr : metrica === "total" ? e.total : e.negocios }));
    return { top, pontos: serieDiaria(ev, top.map((t) => ({ key: t.key, nome: t.nome })), faixa, acumulada) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, eventos, metrica, faixa, acumulada]);

  const salvarMeta = (nome: string, v: number) => {
    const prox = { ...metas, [nome]: v };
    if (!v) delete prox[nome];
    saveAppSetting("metas_segmento", prox);
  };

  const comMeta = visiveis.filter((l) => l.meta > 0 || !sellerRestricted);

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-5 shadow-sm">
        {/* Cabeçalho + filtros */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Receita por segmento</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Os segmentos são as categorias dos seus produtos e serviços (Catálogo). Veja a receita, a evolução e o desempenho de cada um.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaSegmento)} className={selectCls}>
              {(Object.keys(METRICA_LABEL) as MetricaSegmento[]).map((m) => <option key={m} value={m}>{METRICA_LABEL[m]}</option>)}
            </select>
            <label className="relative">
              <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoOpcao)} className={`${selectCls} pl-8`}>
                {(Object.keys(PERIODO_LABEL) as PeriodoOpcao[]).map((p) => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="relative">
              <PieIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <select value={segSel} onChange={(e) => setSegSel(e.target.value)} className={`${selectCls} pl-8 max-w-[220px]`}>
                <option value="todos">Todos os segmentos</option>
                {linhas.map((l) => <option key={l.key} value={l.key}>{l.nome}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* Mapa de calor hexagonal: onde está mais quente / mais frio */}
        {visiveis.filter((l) => valorDe(l) > 0).length > 1 && (
          <Card className="min-w-0 overflow-hidden p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <h4 className="text-sm font-black text-[var(--color-text-primary)]">Mapa de calor</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-3">Passe o mouse num hexágono para ver os detalhes. Cada um mostra a participação no total.</p>
            <HexHeatmap
              items={visiveis.filter((l) => valorDe(l) > 0).map((l) => ({ key: l.key, label: l.nome, value: valorDe(l), extra: [] }))}
              formatValue={fmt}
              metricLabel={METRICA_LABEL[metrica].split(" (")[0]}
              maxCols={5}
            />
          </Card>
        )}

        {/* Donut + evolução */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Card className="lg:col-span-5 min-w-0 overflow-hidden p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            {donut.length === 0 ? (
              <p className="text-xs text-[var(--color-text-faint)] italic py-16 text-center">Sem contratos assinados no período.</p>
            ) : (
              <div className="flex flex-col 2xl:flex-row items-center gap-5 min-w-0">
                <div className="relative h-[190px] w-[190px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut.map((l) => ({ ...l, valor: valorDe(l) }))} cx="50%" cy="50%" innerRadius={62} outerRadius={90} paddingAngle={2} dataKey="valor" stroke="none">
                        {donut.map((l) => <Cell key={l.key} fill={l.cor} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }}
                        formatter={(v: number) => fmt(v)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-base font-black text-[var(--color-text-primary)] font-mono">{fmt(totalMetrica)}</span>
                    <span className="text-[9px] text-[var(--color-text-faint)] font-bold uppercase">{METRICA_LABEL[metrica].split(" (")[0]} total</span>
                  </div>
                </div>
                <div className="flex-1 w-full min-w-0 space-y-2">
                  {visiveis.map((l) => {
                    const v = valorDe(l);
                    return (
                      <div key={l.key} className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.cor }} />
                        <span className="text-xs text-[var(--color-text-primary)] font-semibold truncate min-w-0 flex-1" title={l.nome}>{l.nome}</span>
                        <span className="text-xs font-mono text-[var(--color-text-primary)] shrink-0 whitespace-nowrap">{fmt(v)}</span>
                        <span className="text-xs font-bold text-[var(--color-text-muted)] tabular-nums w-12 shrink-0 text-right">
                          {totalMetrica > 0 ? `${Math.round((v / totalMetrica) * 1000) / 10}%` : "0%"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          <Card className="lg:col-span-7 min-w-0 overflow-hidden p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h4 className="text-sm font-black text-[var(--color-text-primary)]">Evolução da receita por segmento</h4>
              <select value={acumulada ? "acumulada" : "diaria"} onChange={(e) => setAcumulada(e.target.value === "acumulada")} className={selectCls}>
                <option value="acumulada">Acumulada</option>
                <option value="diaria">Diária</option>
              </select>
            </div>
            {serie.top.length === 0 ? (
              <p className="text-xs text-[var(--color-text-faint)] italic py-16 text-center">Sem movimento no período.</p>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie.pontos} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "var(--color-text-faint)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-text-faint)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => fmt(v)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }}
                      formatter={(v: number, k: string) => [fmt(v), serie.top.find((s) => s.key === k)?.nome ?? k]}
                    />
                    <Legend formatter={(k: string) => serie.top.find((s) => s.key === k)?.nome ?? k} wrapperStyle={{ fontSize: 11 }} />
                    {serie.top.map((l) => (
                      <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.cor} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* Desempenho + Metas */}
        <div className="grid grid-cols-1 2xl:grid-cols-12 gap-4">
          <Card className="2xl:col-span-7 min-w-0 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <div className="p-4 border-b border-[var(--color-border-subtle)]">
              <h4 className="text-sm font-black text-[var(--color-text-primary)]">Desempenho por segmento</h4>
              <p className="text-[11px] text-[var(--color-text-muted)]">Principais indicadores de cada segmento.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 w-8">#</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Segmento</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Receita</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Negócios</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Ticket médio</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Conversão</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Participação</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Tendência</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {visiveis.map((l, i) => (
                    <tr key={l.key} className="hover:bg-[var(--color-surface-sunken)]/50">
                      <td className="px-3 py-2.5">
                        <span className="w-5 h-5 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ backgroundColor: l.cor }}>{i + 1}</span>
                      </td>
                      <td className="px-3 py-2.5 font-bold text-[var(--color-text-primary)] max-w-[220px] truncate" title={l.nome}>{l.nome}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-bold text-[var(--color-text-primary)]">{formatCurrency(l.receita)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{l.negocios}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">{formatCurrency(l.ticket)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{l.conversao === null ? "—" : `${l.conversao}%`}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{l.participacao}%</td>
                      <td className="px-3 py-2.5"><Tendencia pct={l.tendencia} /></td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button" onClick={() => setDetalhe(l)}
                          className="whitespace-nowrap px-3 h-7 rounded-lg border border-[var(--color-border-default)] text-[11px] font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] cursor-pointer"
                        >
                          Ver detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visiveis.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-[var(--color-text-faint)]">Nenhum segmento encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="2xl:col-span-5 min-w-0 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <div className="p-4 border-b border-[var(--color-border-subtle)]">
              <h4 className="text-sm font-black text-[var(--color-text-primary)]">Metas por segmento</h4>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Acompanhe as metas de receita.{!sellerRestricted && " Clique na meta para editar."}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5">Segmento</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Meta</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Realizado</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Progresso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {comMeta.map((l) => (
                    <tr key={l.key}>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-2 font-bold text-[var(--color-text-primary)] max-w-[130px]">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.cor }} />
                          <span className="truncate" title={l.nome}>{l.nome}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <MetaEditavel valor={l.meta} editavel={!sellerRestricted} onSalvar={(v) => salvarMeta(l.nome, v)} formatCurrency={formatCurrency} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">{formatCurrency(l.receita)}</td>
                      <td className="px-3 py-2.5 min-w-[120px]">
                        {l.metaPct === null ? (
                          <span className="text-[var(--color-text-faint)]">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-bold tabular-nums w-9" style={{ color: l.cor }}>{l.metaPct}%</span>
                            <div className="flex-1 h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, l.metaPct)}%`, backgroundColor: l.cor }} />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <p className="text-[10px] text-[var(--color-text-faint)]">
          Segmento = categoria do produto vendido (cadastre e organize em Catálogo › Produtos). Cada contrato é repartido pelos itens da proposta; recorrente conta só a mensalidade e venda pontual (à vista ou parcelada) o valor todo; receita e negócios contam os contratos assinados no período;
          conversão é o aceite das propostas com item do segmento. Contratos sem proposta com itens entram em "Sem categoria".
          {totalReceita > 0 ? "" : " Ainda não há contratos assinados no período selecionado."}
        </p>
      </Card>

      <DrillDownPanel
        isOpen={detalhe !== null}
        onClose={() => setDetalhe(null)}
        title={detalhe ? `Contratos — ${detalhe.nome}` : undefined}
        subtitle={detalhe ? `${detalhe.contratos.length} contrato${detalhe.contratos.length === 1 ? "" : "s"} assinado${detalhe.contratos.length === 1 ? "" : "s"} no período · ${formatCurrency(detalhe.receita)}` : undefined}
        rows={detalhe ? detalhe.contratos : []}
        columns={contractDrillColumns(formatCurrency, "totalValue")}
      />
    </div>
  );
}
