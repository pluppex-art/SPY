import { uniqueSellers, sameSeller } from "../../../../lib/sellerNames";
import { useMemo, useState } from "react";
import {
  Flame, ThermometerSun, TrendingUp, Target, Trophy, Phone, MessageCircle, ExternalLink, Users, Clock, ListTree, Download, Send,
} from "lucide-react";
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { HelpTip } from "../../../../components/ui/help-tip";
import { Sparkline } from "../../../../components/ui/sparkline";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../../../components/ui/kpi-filter-card";
import { downloadCsv } from "../../../../lib/csvExport";
import { whatsappDigits } from "../../../../lib/utils";
import {
  NIVEIS_BONS, SCORE_CHAMAS, SCORE_QUENTE, JANELA_FECHADOS_DIAS, type NivelBom, type RadarBoas as DadosBoas, type LeadBom,
} from "../../../../lib/radarBoas";

const NIVEL_META: Record<NivelBom, { label: string; color: string; dica: string }> = {
  chamas: { label: "Em chamas", color: "#f97316", dica: `Negócios em aberto com nota da IA de ${SCORE_CHAMAS} ou mais. É onde o fechamento está mais perto: priorize.` },
  quente: { label: "Quente", color: "#eab308", dica: `Negócios em aberto com temperatura quente ou nota da IA de ${SCORE_QUENTE} a ${SCORE_CHAMAS - 1}. Têm interesse real e merecem o próximo passo.` },
  esquentando: { label: "Esquentando", color: "#22c55e", dica: "Negócios em aberto mexidos hoje ou ontem que ainda não são quentes. Vale agir enquanto há movimento." },
};

interface Props {
  boas: DadosBoas;
  stageNames: Record<string, string>;
  funilNomeByTipo: Record<string, string>;
  formatCurrency: (n: number) => string;
  onAbrir: (leadId: string) => void;
  /** Retrato diário (lead_risk_snapshots) da empresa; vazio para vendedor restrito. */
  historico: any[];
  janela: number;
  janelas: readonly number[];
  setJanela: (n: any) => void;
  addTask: (t: any) => unknown;
}

type Linha = LeadBom & { funilNome: string; etapaNome: string; lastTouch?: string | null };

const fmtData = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : "—";
};
const iniciais = (nome?: string | null) => {
  const p = (nome || "").trim().split(/\s+/).filter(Boolean);
  return p.length === 0 ? "?" : (p[0][0] + (p[1]?.[0] || "")).toUpperCase();
};
const CAMPOS: Record<NivelBom, string> = { chamas: "chamas_count", quente: "quente_count", esquentando: "esquentando_count" };

/** Radar — lado bom, com os mesmos blocos do lado ruim: cartões com variação, filtros, gráficos, tabela com ações em massa e exportar. */
export function RadarBoasPainel({ boas, stageNames, funilNomeByTipo, formatCurrency, onAbrir, historico, janela, janelas, setJanela, addTask }: Props) {
  const [dias, setDias] = useState(0); // 0 = qualquer; N = mexido há no máximo N dias
  const [vendedor, setVendedor] = useState("todos");
  const [funilFiltro, setFunilFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [nivelFiltro, setNivelFiltro] = useState<NivelBom | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const toggleNivel = (n: NivelBom) => setNivelFiltro((cur) => (cur === n ? null : n));

  // Base estável (todos os níveis): cartões, rosca e "por etapa" não mudam quando você mexe nos filtros da tabela.
  const base: Linha[] = useMemo(
    () => boas.todos.map((r) => {
      const funilTipo = r.l.pipelineId || "comercial";
      return {
        ...r,
        funilNome: funilNomeByTipo[funilTipo] || (funilTipo === "sdr" ? "SDR" : "Comercial"),
        etapaNome: stageNames[r.l.stageId] || "—",
        lastTouch: r.l.last_contact_at || r.l.updated_at || r.l.created_at,
      };
    }),
    [boas, funilNomeByTipo, stageNames],
  );

  const contagem = useMemo(
    () => ({
      chamas: boas.chamas.length,
      quente: boas.quentes.length,
      esquentando: boas.esquentando.length,
    }) as Record<NivelBom, number>,
    [boas],
  );
  const total = base.length;

  // Retratos anteriores à criação das colunas do lado bom vêm zerados: começa o histórico no primeiro dia com dado.
  const hist = useMemo(() => {
    const i = historico.findIndex((h) => NIVEIS_BONS.some((n) => Number(h[CAMPOS[n]]) > 0));
    return i < 0 ? [] : historico.slice(i);
  }, [historico]);

  // Variação em relação ao primeiro ponto da janela — só aparece quando existe base de comparação real.
  const deltas = useMemo(() => {
    if (hist.length < 2) return null;
    const a = hist[0];
    const b = hist[hist.length - 1];
    const pct = (campo: string) => {
      const x = Number(a[campo]) || 0;
      const y = Number(b[campo]) || 0;
      return x === 0 ? null : Math.round(((y - x) / x) * 1000) / 10;
    };
    return { chamas: pct("chamas_count"), quente: pct("quente_count"), esquentando: pct("esquentando_count"), total: pct("total_boas_count") } as Record<string, number | null>;
  }, [hist]);

  const vendedores = useMemo(() => uniqueSellers(base.map((r) => r.l.seller)), [base]);
  const funis = useMemo(() => Array.from(new Set(base.map((r) => r.funilNome))).sort(), [base]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return base
      .filter((r) => !dias || r.idle <= dias)
      .filter((r) => !nivelFiltro || r.nivel === nivelFiltro)
      .filter((r) => vendedor === "todos" || sameSeller(r.l.seller, vendedor))
      .filter((r) => funilFiltro === "todos" || r.funilNome === funilFiltro)
      .filter((r) => !q || [r.l.name, r.l.company, r.l.title, r.l.seller].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [base, dias, nivelFiltro, vendedor, funilFiltro, busca]);
  const visiveis = linhas.slice(0, 200);
  const todosMarcados = visiveis.length > 0 && visiveis.every((r) => selecionados.has(r.l.id));

  const filtrosAtivos = (dias ? 1 : 0) + (vendedor !== "todos" ? 1 : 0) + (funilFiltro !== "todos" ? 1 : 0) + (busca ? 1 : 0) + (nivelFiltro ? 1 : 0);
  const limparFiltros = () => { setDias(0); setVendedor("todos"); setFunilFiltro("todos"); setBusca(""); setNivelFiltro(null); };

  // "Por etapa": onde as oportunidades estão no funil.
  const porEtapa = useMemo(() => {
    const m = new Map<string, number>();
    base.forEach((r) => m.set(r.etapaNome, (m.get(r.etapaNome) ?? 0) + 1));
    const ordenado = Array.from(m, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    const top = ordenado.slice(0, 5);
    const outros = ordenado.slice(5).reduce((s, g) => s + g.count, 0);
    if (outros > 0) top.push({ label: "Outras etapas", count: outros });
    return top;
  }, [base]);
  const maxEtapa = Math.max(1, ...porEtapa.map((e) => e.count));

  const donut = NIVEIS_BONS.map((n) => ({ name: NIVEL_META[n].label, value: contagem[n], color: NIVEL_META[n].color }));
  const dadosGrafico = hist.map((h) => ({ ...h, label: h.label }));

  const alternar = (id: string) => setSelecionados((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarTodos = () => setSelecionados(() => (todosMarcados ? new Set() : new Set(visiveis.map((r) => r.l.id))));

  const darProximoPasso = async () => {
    const alvo = visiveis.filter((r) => selecionados.has(r.l.id));
    if (alvo.length === 0) return;
    await Promise.all(alvo.map((r) => addTask({
      lead_id: r.l.id,
      title: `Dar o próximo passo — ${r.l.name || r.l.company || "negócio quente"}`,
      description: `Gerado pelo Radar: negócio ${NIVEL_META[r.nivel].label.toLowerCase()}${r.score > 0 ? ` (nota IA ${r.score})` : ""}.`,
      status: "Em Aberto",
      priority: "Alta",
      due_date: new Date().toISOString(),
    })));
    toast.success(`${alvo.length} tarefa${alvo.length === 1 ? "" : "s"} de próximo passo criada${alvo.length === 1 ? "" : "s"}.`);
    setSelecionados(new Set());
  };

  const exportar = () => {
    downloadCsv(
      `radar_oportunidades_${Date.now()}.csv`,
      ["Lead", "Empresa", "Negócio", "Funil", "Etapa", "Valor", "Última atualização", "Dias sem mexer", "Nível", "Nota IA", "Responsável"],
      linhas.map((r) => [r.l.name || "", r.l.company || "", r.l.title || "", r.funilNome, r.etapaNome, r.value, fmtData(r.lastTouch), r.idle, NIVEL_META[r.nivel].label, r.score, r.l.seller || ""]),
    );
  };

  const tooltipStyle = { backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 };
  const iconeNivel = (n: NivelBom) => (n === "chamas" ? <Flame className="w-5 h-5" style={{ color: NIVEL_META.chamas.color }} /> : n === "quente" ? <ThermometerSun className="w-5 h-5" style={{ color: NIVEL_META.quente.color }} /> : <TrendingUp className="w-5 h-5" style={{ color: NIVEL_META.esquentando.color }} />);
  // Para o lado bom, subir é bom (verde) e descer é ruim (vermelho) — o contrário do lado ruim.
  const textoDelta = (d: number | null | undefined) =>
    d === null || d === undefined ? (
      <span className="text-[10px] text-[var(--color-text-faint)]">Sem dado de comparação ainda</span>
    ) : (
      <span className={`text-[11px] font-bold ${d > 0 ? "text-success" : d < 0 ? "text-danger" : "text-[var(--color-text-muted)]"}`}>{d > 0 ? "+" : ""}{d}% vs {janela}d atrás</span>
    );

  return (
    <>
      <KpiFilterCard className="mb-4" id="crmRadarBoas" activeCount={filtrosAtivos} onClear={limparFiltros}
        indicators={<>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {NIVEIS_BONS.map((n) => (
              <Card key={n} onClick={() => toggleNivel(n)} className={`p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${nivelFiltro === n ? "ring-2 ring-[var(--color-primary-blue)]" : ""}`}>
                <div className="flex items-center gap-2 mb-2">
                  {iconeNivel(n)}
                  <span className="text-xs font-bold text-[var(--color-text-muted)]">{NIVEL_META[n].label}</span>
                  <HelpTip label={`Sobre ${NIVEL_META[n].label}`}>{NIVEL_META[n].dica}</HelpTip>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <div className="text-2xl font-black">{contagem[n]}</div>
                    {textoDelta(deltas?.[n])}
                  </div>
                  <div style={{ color: NIVEL_META[n].color }}>
                    <Sparkline data={hist.map((h) => Number(h[CAMPOS[n]]) || 0)} className="w-16 h-7 shrink-0" />
                  </div>
                </div>
              </Card>
            ))}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-[var(--color-primary-blue)]" />
                <span className="text-xs font-bold text-[var(--color-text-muted)]">Total de oportunidades</span>
                <HelpTip label="Sobre Total de oportunidades">A soma dos três níveis: tudo o que está esquentando agora. O valor é a soma do que está em jogo nesses negócios.</HelpTip>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-2xl font-black">{total}</div>
                  {textoDelta(deltas?.total)}
                </div>
                <Sparkline data={hist.map((h) => Number(h.total_boas_count) || 0)} className="w-16 h-7 shrink-0 text-[var(--color-primary-blue)]" />
              </div>
              <p className="text-[10px] text-[var(--color-text-faint)] mt-1">{formatCurrency(boas.valorOportunidades)} em jogo</p>
            </Card>
          </div>
        </>}
      >
        <FilterBar>
          <FilterSelect
            icon={Clock}
            value={String(dias)}
            onChange={(v) => setDias(Number(v))}
            options={[1, 2, 3, 7, 14, 30].map((d) => ({ value: String(d), label: `Mexido há até ${d} dia${d > 1 ? "s" : ""}` }))}
            allLabel="Qualquer movimento"
            allValue="0"
          />
          {funis.length > 1 && <FilterSelect icon={ListTree} value={funilFiltro} onChange={setFunilFiltro} options={funis} allLabel="Todos os funis" allValue="todos" />}
          {vendedores.length > 1 && <FilterSelect icon={Users} value={vendedor} onChange={setVendedor} options={vendedores} allLabel="Todos os responsáveis" allValue="todos" />}
          <FilterChips value={nivelFiltro ?? ""} onChange={(v) => setNivelFiltro((v || null) as NivelBom | null)} allLabel="Todos os níveis" options={NIVEIS_BONS.map((n) => ({ value: n, label: NIVEL_META[n].label }))} />
          <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar lead, empresa ou responsável..." />
        </FilterBar>
      </KpiFilterCard>

      {/* Evolução + Distribuição + Por etapa */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-1 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">
              Evolução das oportunidades <HelpTip label="Sobre Evolução das oportunidades">Mostra, dia a dia, quantos negócios estavam em chamas, quentes e esquentando. Se as linhas sobem, mais negócios estão esquentando.</HelpTip>
            </h3>
            <select className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] px-2 py-1 text-[10px] shrink-0" value={janela} onChange={(e) => setJanela(Number(e.target.value))}>
              {janelas.map((j) => <option key={j} value={j}>Últimos {j} dias</option>)}
            </select>
          </div>
          {dadosGrafico.length < 2 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-[var(--color-text-faint)] text-center px-4">
              Ainda sem histórico suficiente — o Radar passou a registrar um retrato por dia das oportunidades a partir de hoje, e o gráfico vai se preenchendo.
            </div>
          ) : (
            <div className="h-[200px] -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dadosGrafico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                  <XAxis dataKey="label" fontSize={10} stroke="var(--color-text-faint)" tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} stroke="var(--color-text-faint)" tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  {NIVEIS_BONS.map((n, i) => (
                    <Area key={n} type="monotone" dataKey={CAMPOS[n]} name={NIVEL_META[n].label} stroke={NIVEL_META[n].color} fill={NIVEL_META[n].color} fillOpacity={0.14 - i * 0.03} strokeWidth={2} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] mb-1">
            Distribuição por nível <HelpTip label="Sobre Distribuição por nível">Mostra a proporção das oportunidades entre em chamas, quentes e esquentando. Quanto maior a fatia em chamas, mais perto de fechar.</HelpTip>
          </h3>
          {total === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-xs text-[var(--color-text-faint)]">Nenhuma oportunidade esquentando agora. 🌱</div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative h-[130px] w-[130px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value" stroke="none">
                      {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-sm font-black">{total}</span>
                  <span className="text-[8px] text-[var(--color-text-faint)] uppercase font-bold">negócios</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {donut.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-[11px] text-[var(--color-text-muted)] flex-1">{d.name}</span>
                    <span className="text-[11px] font-bold">{total > 0 ? Math.round((d.value / total) * 1000) / 10 : 0}%</span>
                    <span className="text-[10px] text-[var(--color-text-faint)] w-7 text-right">({d.value})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] mb-1 flex items-center gap-1.5">
            <ListTree className="w-3.5 h-3.5" /> Oportunidades por etapa <HelpTip label="Sobre Oportunidades por etapa">Mostra em quais etapas do funil estão os negócios que estão esquentando. As etapas com mais negócios são onde o seu time tem mais a ganhar agora.</HelpTip>
          </h3>
          {porEtapa.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-xs text-[var(--color-text-faint)]">Nenhuma oportunidade esquentando agora. 🌱</div>
          ) : (
            <div className="space-y-2.5">
              {porEtapa.map((e) => (
                <div key={e.label}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-[var(--color-text-muted)] truncate">{e.label}</span>
                    <span className="font-bold shrink-0">{e.count}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(3, (e.count / maxEtapa) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Tabela */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 ml-auto">
            {selecionados.size > 0 && (
              <Button size="sm" onClick={darProximoPasso} className="h-8 px-3 text-[11px] font-bold gap-1.5"><Send className="w-3.5 h-3.5" /> Dar o próximo passo ({selecionados.size})</Button>
            )}
            <Button size="sm" variant="outline" onClick={exportar} className="h-8 px-3 text-[11px] font-bold gap-1.5"><Download className="w-3.5 h-3.5" /> Exportar</Button>
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)]">{linhas.length} negócio(s){linhas.length > visiveis.length ? ` (mostrando ${visiveis.length})` : ""}</p>

        {visiveis.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Nenhum negócio esquentando para esses filtros. 🌱</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" checked={todosMarcados} onChange={alternarTodos} aria-label="Selecionar todos" /></th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Negócio</th>
                  <th className="px-3 py-2">Funil / Etapa</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">Última atualização</th>
                  <th className="px-3 py-2 text-right">Nota IA</th>
                  <th className="px-3 py-2">Nível</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2 text-right"><span className="inline-flex items-center gap-1">Ações<HelpTip label="O que cada botão faz">Telefone: liga para o contato. WhatsApp: abre uma conversa. Seta para fora: abre o negócio na Central de Vendas.</HelpTip></span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {visiveis.map((r) => (
                  <tr key={r.l.id} className="hover:bg-[var(--color-surface-sunken)] transition-colors">
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selecionados.has(r.l.id)} onChange={() => alternar(r.l.id)} aria-label={`Selecionar ${r.l.name || "negócio"}`} />
                    </td>
                    <td className="px-3 py-2.5 cursor-pointer" onClick={() => onAbrir(r.l.id)}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 text-white" style={{ background: NIVEL_META[r.nivel].color }}>{iniciais(r.l.name || r.l.company)}</div>
                        <div className="min-w-0">
                          <div className="font-bold text-[var(--color-text-primary)] truncate max-w-[140px]">{r.l.name || r.l.company || "Sem nome"}</div>
                          <div className="text-[10px] text-[var(--color-text-faint)] truncate max-w-[140px]">{r.l.company || r.l.source || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)] truncate max-w-[130px] cursor-pointer" onClick={() => onAbrir(r.l.id)}>{r.l.title || "—"}</td>
                    <td className="px-3 py-2.5 cursor-pointer" onClick={() => onAbrir(r.l.id)}>
                      <span className="inline-flex rounded-md bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">{r.funilNome}</span>
                      <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5 truncate max-w-[120px]">↳ {r.etapaNome}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-[var(--color-text-primary)]">{r.value > 0 ? formatCurrency(r.value) : "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)]">{fmtData(r.lastTouch)}</td>
                    <td className="px-3 py-2.5 font-mono text-right font-bold">{r.score > 0 ? r.score : "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: NIVEL_META[r.nivel].color }}>{NIVEL_META[r.nivel].label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)] truncate max-w-[110px]">{r.l.seller || "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {r.l.phone && (
                          <>
                            <a href={`tel:${r.l.phone}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]" title="Ligar"><Phone className="w-3.5 h-3.5" /></a>
                            <a href={`https://wa.me/${whatsappDigits(r.l.phone)}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]" title="WhatsApp"><MessageCircle className="w-3.5 h-3.5" /></a>
                          </>
                        )}
                        <button type="button" onClick={() => onAbrir(r.l.id)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] cursor-pointer border-none bg-transparent" title="Abrir na Central de Vendas"><ExternalLink className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {boas.fechados.length > 0 && (
        <Card className="p-4 space-y-2 mt-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Fechados recentemente
            <HelpTip label="Sobre Fechados recentemente">{`Negócios ganhos e atualizados nos últimos ${JANELA_FECHADOS_DIAS} dias (${boas.fechados.length} no total, ${formatCurrency(boas.valorFechados)}). O sistema não guarda a data exata do fechamento, então usa a última atualização do negócio.`}</HelpTip>
          </h3>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {boas.fechados.slice(0, 10).map((f) => (
              <button key={f.l.id} type="button" onClick={() => onAbrir(f.l.id)} className="w-full flex items-center justify-between gap-3 py-2 text-left cursor-pointer border-none bg-transparent hover:bg-[var(--color-surface-sunken)] px-1 rounded-lg">
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--color-text-primary)] truncate">{f.l.name || f.l.company || "Sem nome"}</span>
                  <span className="block text-[10px] text-[var(--color-text-faint)] truncate">{f.l.title || f.l.company || "—"} · {f.l.seller || "sem responsável"}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-xs font-mono font-bold text-emerald-600">{f.value > 0 ? formatCurrency(f.value) : "—"}</span>
                  <span className="block text-[10px] text-[var(--color-text-faint)]">{fmtData(f.quando)}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
