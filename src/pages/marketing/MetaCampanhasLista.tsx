import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, Facebook, Loader2, RefreshCw, Search, Settings } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/apiClient";

interface Campanha {
  id: string; nome: string; status: string; statusRotulo: string; objetivo: string; objetivoRotulo: string;
  orcamento: { tipo: "diario" | "total" | null; valor: number };
  gasto: number; impressoes: number; alcance: number; cliques: number; ctr: number; cpc: number; cpm: number;
  resultados: number; resultadoRotulo: string; custoPorResultado: number; inicio: string | null; fim: string | null;
}
interface Resposta { configurado: boolean; campanhas?: Campanha[]; moeda?: string; conta?: string; dias?: number; parcial?: boolean; atualizadoEm?: string; error?: string }
type Chave = "nome" | "status" | "orcamento" | "resultados" | "custoPorResultado" | "gasto" | "impressoes" | "alcance" | "cliques" | "ctr" | "cpc";

const PERIODOS = [{ v: 7, l: "7 dias" }, { v: 14, l: "14 dias" }, { v: 30, l: "30 dias" }, { v: 90, l: "90 dias" }];
const FILTROS = [{ id: "todas", l: "Todas" }, { id: "ativas", l: "Ativas" }, { id: "pausadas", l: "Pausadas" }, { id: "outras", l: "Outras" }] as const;
const grupo = (s: string) => (s === "ACTIVE" ? "ativas" : /PAUSED/.test(s) ? "pausadas" : "outras");
const variante = (s: string) => (s === "ACTIVE" ? "success" : /PAUSED/.test(s) ? "neutral" : /ISSUES|DISAPPROVED|PENDING_BILLING/.test(s) ? "destructive" : "warning") as any;

/** Lista de campanhas do Meta Ads no formato do Gerenciador de Anúncios (status, orçamento, resultado, gasto, alcance, cliques…). */
export function MetaCampanhasLista() {
  const { activeTenantId } = useAuth();
  const navigate = useNavigate();
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todas");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ k: Chave; asc: boolean }>({ k: "gasto", asc: false });

  const carregar = useCallback(async (forcar = false) => {
    if (!activeTenantId) return;
    setCarregando(true);
    try {
      const r = await apiFetch(`/api/marketing/meta-campanhas?tenantId=${encodeURIComponent(activeTenantId)}&dias=${dias}${forcar ? "&atualizar=1" : ""}`);
      setDados(await r.json().catch(() => ({ configurado: true, error: "Resposta inválida do servidor." })));
    } catch { setDados({ configurado: true, error: "Não foi possível consultar o Meta Ads agora." }); }
    finally { setCarregando(false); }
  }, [activeTenantId, dias]);
  useEffect(() => { setDados(null); void carregar(); }, [carregar]);

  const moeda = dados?.moeda || "BRL";
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: moeda });
  const num = (v: number) => v.toLocaleString("pt-BR");

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const f = (dados?.campanhas || []).filter((c) => (filtro === "todas" || grupo(c.status) === filtro) && (!t || c.nome.toLowerCase().includes(t) || c.id.includes(t)));
    const v = (c: Campanha): string | number => (ordem.k === "nome" ? c.nome.toLowerCase() : ordem.k === "status" ? c.statusRotulo : ordem.k === "orcamento" ? c.orcamento.valor : c[ordem.k]);
    return [...f].sort((a, b) => { const x = v(a), y = v(b); const d = x > y ? 1 : x < y ? -1 : 0; return ordem.asc ? d : -d; });
  }, [dados, filtro, busca, ordem]);

  const total = useMemo(() => {
    const t = lista.reduce((a, c) => ({ gasto: a.gasto + c.gasto, impressoes: a.impressoes + c.impressoes, cliques: a.cliques + c.cliques, resultados: a.resultados + c.resultados }), { gasto: 0, impressoes: 0, cliques: 0, resultados: 0 });
    const rotulos = new Set(lista.filter((c) => c.resultados > 0).map((c) => c.resultadoRotulo));
    const misto = rotulos.size > 1; // somar "cadastros" com "cliques" não faz sentido
    return { ...t, ctr: t.impressoes > 0 ? (t.cliques / t.impressoes) * 100 : 0, cpc: t.cliques > 0 ? t.gasto / t.cliques : 0, misto, rotulo: [...rotulos][0] || "", custoRes: !misto && t.resultados > 0 ? t.gasto / t.resultados : 0 };
  }, [lista]);

  const ordenar = (k: Chave) => setOrdem((o) => (o.k === k ? { k, asc: !o.asc } : { k, asc: k === "nome" || k === "status" }));
  const Th = ({ k, children, dir = "right" }: { k: Chave; children: React.ReactNode; dir?: "left" | "right" }) => (
    <th className={`py-2.5 px-3 font-black whitespace-nowrap ${dir === "left" ? "text-left" : "text-right"}`} aria-sort={ordem.k === k ? (ordem.asc ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => ordenar(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider text-[10px] ${ordem.k === k ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-faint)]"} hover:text-[var(--color-text-primary)]`}>
        {children}{ordem.k === k && (ordem.asc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const cabecalho = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Facebook className="w-4 h-4 text-blue-500" /> Campanhas do Meta Ads{dados?.conta ? <span className="font-normal text-[var(--color-text-muted)] truncate">· {dados.conta}</span> : null}</h3>
        <p className="text-[11px] text-[var(--color-text-muted)]">Dados do Gerenciador de Anúncios, só leitura.{dados?.atualizadoEm ? ` Atualizado às ${new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` : ""}</p>
      </div>
      <div className="flex items-center gap-2">
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período" className="h-9 px-2 rounded-lg text-xs font-bold border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]">
          {PERIODOS.map((p) => <option key={p.v} value={p.v}>Últimos {p.l}</option>)}
        </select>
        <Button variant="outline" onClick={() => void carregar(true)} disabled={carregando} className="h-9 px-3 text-xs gap-1.5" aria-label="Atualizar">{carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}</Button>
      </div>
    </div>
  );

  if (dados && !dados.configurado) {
    return (
      <Card className="p-6 border-dashed">
        <EmptyState icon={Facebook} title="Conecte o Meta Ads para ver suas campanhas aqui" description="Cadastre o ID da conta de anúncios e um token com permissão de leitura (ads_read) em Integrações. O SPY só lê os dados: não cria, altera nem pausa nada." className="py-6" />
        <div className="flex justify-center"><Button onClick={() => navigate("/app/configuracoes/integracoes/apps")} className="h-9 px-4 text-xs font-bold gap-1.5"><Settings className="w-3.5 h-3.5" /> Abrir Integrações</Button></div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6 space-y-4">
      {cabecalho}
      {!dados ? <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>
        : dados.error ? <div className="py-6 text-center space-y-3"><p className="text-sm text-[var(--color-danger)]">{dados.error}</p><div className="flex justify-center gap-2"><Button variant="outline" onClick={() => void carregar(true)} className="h-8 px-3 text-xs">Tentar de novo</Button><Button variant="outline" onClick={() => navigate("/app/configuracoes/integracoes/apps")} className="h-8 px-3 text-xs">Abrir Integrações</Button></div></div>
        : (<>
          {dados.parcial && <p className="text-[11px] text-[var(--color-warning,#b45309)]">⚠ O Meta respondeu só parte dos dados. Alguns números podem estar incompletos; tente atualizar.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar campanha por nome ou ID…" className="w-full h-9 pl-8 pr-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" />
            </div>
            <div className="flex gap-1.5">{FILTROS.map((f) => {
              const n = (dados.campanhas || []).filter((c) => f.id === "todas" || grupo(c.status) === f.id).length;
              return <button key={f.id} type="button" onClick={() => setFiltro(f.id)} className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold border ${filtro === f.id ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>{f.l} · {n}</button>;
            })}</div>
          </div>
          {lista.length === 0 ? <EmptyState icon={Facebook} title={(dados.campanhas || []).length ? "Nenhuma campanha com esse filtro" : "Nenhuma campanha nessa conta"} description={(dados.campanhas || []).length ? "Mude o filtro ou a busca." : "Quando houver campanhas no Gerenciador de Anúncios, elas aparecem aqui."} className="py-8" /> : (
            <div className="overflow-x-auto -mx-4 sm:mx-0 rounded-lg border border-[var(--color-border-default)]">
              <table className="w-full text-xs min-w-[1000px]">
                <thead className="bg-[var(--color-surface-sunken)]">
                  <tr>
                    <Th k="nome" dir="left">Campanha</Th><Th k="status" dir="left">Status</Th><Th k="orcamento">Orçamento</Th><Th k="resultados">Resultados</Th><Th k="custoPorResultado">Custo/resultado</Th>
                    <Th k="gasto">Valor usado</Th><Th k="impressoes">Impressões</Th><Th k="alcance">Alcance</Th><Th k="cliques">Cliques</Th><Th k="ctr">CTR</Th><Th k="cpc">CPC</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle,var(--color-border-default))]">
                  {lista.map((c) => (
                    <tr key={c.id} className="hover:bg-[var(--color-surface-sunken)]/60">
                      <td className="py-2.5 px-3 max-w-[280px]"><p className="font-bold text-[var(--color-text-primary)] truncate" title={c.nome}>{c.nome}</p><p className="text-[10px] text-[var(--color-text-faint)] truncate">{c.objetivoRotulo} · ID {c.id}</p></td>
                      <td className="py-2.5 px-3"><Badge variant={variante(c.status)} dot dotPulse={c.status === "ACTIVE"}>{c.statusRotulo}</Badge></td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-primary)]">{c.orcamento.tipo ? <>{brl(c.orcamento.valor)}<span className="block text-[10px] text-[var(--color-text-faint)]">{c.orcamento.tipo === "diario" ? "por dia" : "vitalício"}</span></> : <span className="text-[var(--color-text-faint)]" title="Orçamento definido nos conjuntos de anúncios">Nos conjuntos</span>}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{c.resultados > 0 ? <><b className="text-[var(--color-text-primary)]">{num(c.resultados)}</b><span className="block text-[10px] text-[var(--color-text-faint)]">{c.resultadoRotulo}</span></> : <span className="text-[var(--color-text-faint)]">—</span>}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-primary)]">{c.custoPorResultado > 0 ? brl(c.custoPorResultado) : "—"}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[var(--color-text-primary)]">{brl(c.gasto)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{num(c.impressoes)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{num(c.alcance)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{num(c.cliques)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{c.ctr.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{c.cpc > 0 ? brl(c.cpc) : "—"}</td>
                    </tr>))}
                </tbody>
                <tfoot className="bg-[var(--color-surface-sunken)] font-bold text-[var(--color-text-primary)]">
                  <tr>
                    <td className="py-2.5 px-3" colSpan={2}>Total de {lista.length} campanha(s)</td>
                    <td className="py-2.5 px-3 text-right text-[var(--color-text-faint)]">—</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{total.misto ? <span className="text-[var(--color-text-faint)] font-normal" title="Resultados de tipos diferentes não se somam">—</span> : <>{num(total.resultados)}{total.rotulo && <span className="block text-[10px] text-[var(--color-text-faint)] font-normal">{total.rotulo}</span>}</>}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{total.custoRes > 0 ? brl(total.custoRes) : "—"}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{brl(total.gasto)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{num(total.impressoes)}</td>
                    <td className="py-2.5 px-3 text-right text-[var(--color-text-faint)] font-normal" title="Pessoas alcançadas não se somam entre campanhas">—</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{num(total.cliques)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{total.ctr.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{total.cpc > 0 ? brl(total.cpc) : "—"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>)}
    </Card>
  );
}
